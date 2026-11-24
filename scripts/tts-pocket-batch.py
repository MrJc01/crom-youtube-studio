#!/usr/bin/env python3
"""Sintetizador local em lote para Kyutai Pocket TTS (carrega modelo 1x por trabalho)."""

import json
import os
import sys
import wave

import numpy as np
import torch
from pocket_tts import TTSModel


def main() -> int:
    if len(sys.argv) < 2:
        sys.stderr.write("Uso: tts-pocket-batch.py <job.json>\n")
        return 2

    job_path = sys.argv[1]
    with open(job_path, "r", encoding="utf-8") as f:
        job = json.load(f)

    lang = str(job.get("language") or "portuguese_24l")
    voice_path = str(job.get("voicePath") or "")
    out_wav = str(job.get("outputPath") or "")
    temperature = float(job.get("temperature", 0.3))
    sampler_decode_steps = max(1, min(16, int(job.get("samplerDecodeSteps", 1))))
    raw_noise_clamp = job.get("noiseClamp", None)
    noise_clamp = float(raw_noise_clamp) if raw_noise_clamp not in (None, "", 0, 0.0) else None
    raw_eos = job.get("eosThreshold", None)
    eos_threshold = float(raw_eos) if raw_eos not in (None, "") else None
    pause_ms = max(0, int(job.get("pauseMs", 220)))
    chunks = [str(c).strip() for c in (job.get("chunks") or []) if str(c).strip()]

    if not voice_path or not os.path.exists(voice_path):
        sys.stderr.write(f"Arquivo de voz Pocket TTS não encontrado: {voice_path}\n")
        return 3
    if not out_wav:
        sys.stderr.write("outputPath não especificado\n")
        return 4
    if not chunks:
        sys.stderr.write("Nenhum trecho de texto para sintetizar\n")
        return 5

    torch.set_num_threads(max(1, min(10, os.cpu_count() or 4)))
    load_kwargs = {
        "language": lang,
        "temp": temperature,
        "sampler_decode_steps": sampler_decode_steps,
        "noise_clamp": noise_clamp,
    }
    if eos_threshold is not None:
        load_kwargs["eos_threshold"] = eos_threshold

    model = TTSModel.load_model(**load_kwargs)
    voice_state = model.get_state_for_audio_prompt(voice_path)
    sr = int(getattr(model, "sample_rate", 24000))

    segments = []
    silence = np.zeros(int(sr * (pause_ms / 1000.0)), dtype=np.float32) if pause_ms > 0 else None

    for idx, chunk in enumerate(chunks):
        audio_tensor = model.generate_audio(voice_state, chunk)
        arr = audio_tensor.detach().cpu().numpy().astype(np.float32).reshape(-1)
        if arr.size == 0:
            continue
        arr = np.nan_to_num(arr, nan=0.0, posinf=1.0, neginf=-1.0)
        segments.append(arr)
        if silence is not None and idx < len(chunks) - 1:
            segments.append(silence)

    if not segments:
        sys.stderr.write("Pocket TTS não retornou amostras de áudio\n")
        return 6

    full = np.concatenate(segments) if len(segments) > 1 else segments[0]
    peak = float(np.max(np.abs(full))) if full.size else 0.0
    if peak > 0.99:
        full = full * (0.98 / peak)

    pcm16 = np.clip(full * 32767.0, -32768.0, 32767.0).astype("<i2")
    os.makedirs(os.path.dirname(os.path.abspath(out_wav)), exist_ok=True)
    with wave.open(out_wav, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sr)
        wf.writeframes(pcm16.tobytes())

    duration_sec = round(float(full.size) / float(sr), 3) if sr > 0 else 0.0
    sys.stdout.write(json.dumps({
        "ok": True,
        "outputPath": out_wav,
        "sampleRate": sr,
        "chunks": len(chunks),
        "samplerDecodeSteps": sampler_decode_steps,
        "noiseClamp": noise_clamp,
        "durationSec": duration_sec,
    }))
    sys.stdout.flush()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
