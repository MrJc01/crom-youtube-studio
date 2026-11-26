#!/usr/bin/env python3
"""Ferramenta de limpeza, corte incremental e auditoria de repetições para voz real (Crom YouTube Studio).

Subcomandos:
  auditar  --transcricao <arquivo.json|srt|txt> [--janela 15] [--min-palavras 2] [--json] [--strict]
  cortar   --entrada <in.wav> --saida <out.wav> --cortes <a-b,c-d,...> [--xfade-ms 20] [--json]
  limpar   --entrada <in.wav> --transcricao <transcricao.json> --saida <out.wav>
           [--cortes <a-b,...> | --cortes-json <edl.json>] [--silencio-db -44]
           [--margem-palavra 0.18] [--voicefixer] [--json]
"""

import argparse
import array
import json
import math
import re
import subprocess
import sys
import tempfile
import wave
from pathlib import Path


def load_wav_mono(path: Path):
    with wave.open(str(path), "rb") as w:
        sr = w.getframerate()
        nch = w.getnchannels()
        sw = w.getsampwidth()
        raw = w.readframes(w.getnframes())
    if sw != 2:
        raise RuntimeError(f"WAV precisa ser PCM 16-bit (recebido {sw * 8}-bit): {path}")
    pcm = array.array("h")
    pcm.frombytes(raw)
    if nch == 1:
        samples = [s / 32768.0 for s in pcm]
    else:
        samples = [sum(pcm[i : i + nch]) / (nch * 32768.0) for i in range(0, len(pcm), nch)]
    return samples, sr


def save_wav_mono(path: Path, samples, sr: int):
    path.parent.mkdir(parents=True, exist_ok=True)
    pcm = array.array("h", (int(max(-0.9999, min(0.9999, s)) * 32767.0) for s in samples))
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes(pcm.tobytes())


def parse_cuts_spec(spec: str):
    cuts = []
    if not spec:
        return cuts
    for part in spec.split(","):
        part = part.strip()
        if not part:
            continue
        m = re.match(r"^(\d+(?:\.\d+)?)\s*[-:]\s*(\d+(?:\.\d+)?)$", part)
        if not m:
            raise ValueError(f"Intervalo de corte inválido: '{part}' (use inicio-fim em segundos, ex.: 251.0-253.05)")
        a, b = float(m.group(1)), float(m.group(2))
        if b <= a:
            raise ValueError(f"Corte inválido (fim <= início): {a}-{b}")
        cuts.append((a, b))
    return sorted(cuts, key=lambda c: c[0])


def stitch_intervals(x, sr: int, intervals, xfade_ms: float = 20.0):
    xfade_n = max(1, int(round((xfade_ms / 1000.0) * sr)))
    out_chunks = []
    edl = []
    dst_cursor = 0.0
    fade_out = [0.5 * (1.0 + math.cos(math.pi * i / max(1, xfade_n - 1))) for i in range(xfade_n)]
    fade_in = [1.0 - f for f in fade_out]
    for s_t, e_t in intervals:
        a = max(0, int(round(s_t * sr)))
        b = min(len(x), int(round(e_t * sr)))
        seg = list(x[a:b])
        if len(seg) <= xfade_n * 2:
            continue
        if not out_chunks:
            out_chunks.append(seg)
            dur = len(seg) / sr
            edl.append({
                "idx": len(edl) + 1,
                "src_start": round(s_t, 4),
                "src_end": round(e_t, 4),
                "dst_start": 0.0,
                "dst_end": round(dur, 4),
            })
            dst_cursor = dur
        else:
            prev = out_chunks[-1]
            tail_start = len(prev) - xfade_n
            for i in range(xfade_n):
                prev[tail_start + i] = prev[tail_start + i] * fade_out[i] + seg[i] * fade_in[i]
            rest = seg[xfade_n:]
            out_chunks.append(rest)
            eff_start = dst_cursor - (xfade_n / sr)
            dst_cursor += len(rest) / sr
            edl.append({
                "idx": len(edl) + 1,
                "src_start": round(s_t, 4),
                "src_end": round(e_t, 4),
                "dst_start": round(eff_start, 4),
                "dst_end": round(dst_cursor, 4),
            })
    full = []
    for ch in out_chunks:
        full.extend(ch)
    return full, edl


def norm_word(w: str) -> str:
    return re.sub(r"[^a-zà-ú0-9]+", "", w.lower())


def load_words_for_audit(path: Path):
    suffix = path.suffix.lower()
    words = []
    if suffix == ".json":
        data = json.loads(path.read_text(encoding="utf-8"))
        segs = data.get("segments", data if isinstance(data, list) else [])
        for seg in segs:
            wlist = seg.get("words") or []
            if wlist:
                for w in wlist:
                    raw = str(w.get("word", "")).strip()
                    n = norm_word(raw)
                    if n:
                        words.append((float(w.get("start", seg.get("start", 0.0))), raw, n))
            else:
                st = float(seg.get("start", 0.0))
                en = float(seg.get("end", st + 1.0))
                toks = str(seg.get("text", "")).split()
                for idx, tok in enumerate(toks):
                    n = norm_word(tok)
                    if n:
                        t = st + (en - st) * (idx / max(1, len(toks)))
                        words.append((t, tok, n))
    elif suffix == ".srt":
        txt = path.read_text(encoding="utf-8").strip()
        for blk in re.split(r"\n\s*\n", txt):
            lines = [ln.strip() for ln in blk.splitlines() if ln.strip()]
            if len(lines) < 3:
                continue
            m = re.match(r"(\d+):(\d+):(\d+),(\d+)\s*-->\s*(\d+):(\d+):(\d+),(\d+)", lines[1])
            if not m:
                continue
            h1, m1, s1, ms1, h2, m2, s2, ms2 = map(int, m.groups())
            t1 = h1 * 3600 + m1 * 60 + s1 + ms1 / 1000.0
            t2 = h2 * 3600 + m2 * 60 + s2 + ms2 / 1000.0
            toks = " ".join(lines[2:]).split()
            for idx, tok in enumerate(toks):
                n = norm_word(tok)
                if n:
                    t = t1 + (t2 - t1) * (idx / max(1, len(toks)))
                    words.append((t, tok, n))
    else:
        txt = path.read_text(encoding="utf-8")
        cur_t = 0.0
        for line in txt.splitlines():
            m = re.match(r"^\[(\d+):(\d+)\]\s*(.*)$", line.strip())
            if m:
                cur_t = int(m.group(1)) * 60 + int(m.group(2))
                body = m.group(3)
            else:
                body = line.strip()
            for tok in body.split():
                n = norm_word(tok)
                if n:
                    words.append((cur_t, tok, n))
                    cur_t += 0.35
    return words


def detect_repetitions(words, window_s: float = 15.0, min_words: int = 2):
    hits = []
    n_tot = len(words)
    for i in range(n_tot):
        for j in range(i + 1, min(n_tot, i + 28)):
            dt = words[j][0] - words[i][0]
            if dt > window_s:
                break
            k = 0
            while i + k < j and j + k < n_tot and words[i + k][2] == words[j + k][2]:
                k += 1
            if k >= min_words:
                phrase = " ".join(words[i + m][1] for m in range(k))
                gap_between = words[j][0] - words[i + k - 1][0]
                # Filtra falsos positivos muito curtos distantes
                if k >= 3 or (k == 2 and gap_between <= 2.5 and len(phrase) >= 8):
                    hits.append({
                        "t1": round(words[i][0], 2),
                        "t2": round(words[j][0], 2),
                        "mmss": f"{int(words[i][0] // 60):02d}:{words[i][0] % 60:05.2f}",
                        "palavras": k,
                        "trecho": phrase,
                    })
                    break
    # Deduplica hits sobrepostos na mesma janela de 2.5s
    dedup = []
    for h in hits:
        if dedup and abs(h["t1"] - dedup[-1]["t1"]) < 2.5:
            if h["palavras"] > dedup[-1]["palavras"]:
                dedup[-1] = h
            continue
        dedup.append(h)
    return dedup


def cmd_auditar(args):
    src = Path(args.transcricao).resolve()
    if not src.exists():
        print(f"Erro: arquivo não encontrado: {src}", file=sys.stderr)
        return 1
    words = load_words_for_audit(src)
    hits = detect_repetitions(words, window_s=args.janela, min_words=args.min_palavras)
    res = {
        "arquivo": str(src),
        "total_palavras": len(words),
        "janela_seg": args.janela,
        "repeticoes_detectadas": len(hits),
        "ocorrencias": hits,
    }
    if args.json:
        print(json.dumps(res, ensure_ascii=False, indent=2))
    else:
        print(f"[Audio Auditar] {src.name} | palavras={len(words)} | repeticoes={len(hits)}")
        for h in hits:
            print(f"  - {h['mmss']} (t1={h['t1']}s -> t2={h['t2']}s, {h['palavras']} palavras): \"{h['trecho']}\"")
        if not hits:
            print("  OK: nenhuma repetição suspeita encontrada.")
    if args.strict and hits:
        return 1
    return 0


def cmd_cortar(args):
    in_wav = Path(args.entrada).resolve()
    out_wav = Path(args.saida).resolve()
    if not in_wav.exists():
        print(f"Erro: WAV de entrada não encontrado: {in_wav}", file=sys.stderr)
        return 1
    cuts = parse_cuts_spec(args.cortes)
    x, sr = load_wav_mono(in_wav)
    total_s = len(x) / sr

    intervals = []
    cur = 0.0
    for cs, ce in cuts:
        if cs > cur + 0.04:
            intervals.append((cur, cs))
        cur = max(cur, ce)
    if cur < total_s - 0.04:
        intervals.append((cur, total_s))

    full, edl = stitch_intervals(x, sr, intervals, xfade_ms=args.xfade_ms)
    save_wav_mono(out_wav, full, sr)
    res = {
        "entrada": str(in_wav),
        "saida": str(out_wav),
        "duracao_original_s": round(total_s, 3),
        "duracao_final_s": round(len(full) / sr, 3),
        "removido_s": round(total_s - (len(full) / sr), 3),
        "cortes": [{"start": a, "end": b} for a, b in cuts],
        "trechos_mantidos": len(edl),
    }
    if args.json:
        print(json.dumps(res, ensure_ascii=False, indent=2))
    else:
        print(
            f"[Audio Cortar] OK -> {out_wav} | {res['duracao_original_s']:.2f}s -> "
            f"{res['duracao_final_s']:.2f}s (-{res['removido_s']:.2f}s em {len(cuts)} corte(s))"
        )
    return 0


def build_word_protected_intervals(x, sr, kept_base, word_spans, silence_db=-44.0, word_margin=0.18):
    win_s = 0.05
    hop_n = int(win_s * sr)
    final_intervals = []

    def intersects_word(t_a, t_b):
        for ws, we in word_spans:
            if we + word_margin >= t_a and ws - word_margin <= t_b:
                return True
        return False

    for ks, ke in kept_base:
        s_idx = int(ks * sr)
        e_idx = int(ke * sr)
        sub = x[s_idx:e_idx]
        n_frames = len(sub) // hop_n
        if n_frames < 30:
            final_intervals.append((ks, ke))
            continue
        silent = []
        for fi in range(n_frames):
            chunk = sub[fi * hop_n : (fi + 1) * hop_n]
            mean_sq = sum(s * s for s in chunk) / max(1, len(chunk))
            rms_db = 20.0 * math.log10(math.sqrt(mean_sq) + 1e-12)
            silent.append(rms_db < silence_db)

        runs = []
        in_run = False
        r_start = 0
        for i, flag in enumerate(silent):
            if flag and not in_run:
                in_run = True
                r_start = i
            elif not flag and in_run:
                in_run = False
                if (i - r_start) * win_s >= 1.40:
                    runs.append((ks + r_start * win_s, ks + i * win_s))
        if in_run and (n_frames - r_start) * win_s >= 1.40:
            runs.append((ks + r_start * win_s, ks + n_frames * win_s))

        if not runs:
            final_intervals.append((ks, ke))
            continue

        c = ks
        for rs, re_t in runs:
            cut_a = rs + 0.30
            cut_b = re_t - 0.30
            if cut_b - cut_a >= 0.60 and cut_a > c + 0.05 and not intersects_word(cut_a, cut_b):
                final_intervals.append((c, cut_a))
                c = cut_b
        if ke > c + 0.05:
            final_intervals.append((c, ke))
    return final_intervals


def run_voicefixer_and_master(in_wav: Path, out_wav: Path):
    import numpy as np
    import soundfile as sf
    from scipy import signal
    from voicefixer import VoiceFixer

    x, sr = sf.read(str(in_wav), dtype="float32")
    if x.ndim > 1:
        x = x.mean(axis=1)
    vf = VoiceFixer()
    with tempfile.TemporaryDirectory() as td:
        tmp_in = Path(td) / "in.wav"
        tmp_vf = Path(td) / "vf.wav"
        tmp_48 = Path(td) / "vf48.wav"
        sf.write(str(tmp_in), x, sr, subtype="PCM_16")
        vf.restore(input=str(tmp_in), output=str(tmp_vf), cuda=False, mode=0)
        y, out_sr = sf.read(str(tmp_vf), dtype="float32")
        if y.ndim > 1:
            y = y.mean(axis=1)
        if out_sr != sr:
            g = np.gcd(sr, out_sr)
            y = signal.resample_poly(y, sr // g, out_sr // g).astype(np.float32)
        sf.write(str(tmp_48), y, sr, subtype="PCM_16")
        subprocess.run(
            [
                "ffmpeg", "-loglevel", "error", "-y", "-i", str(tmp_48),
                "-af", "highpass=f=85,deesser=i=0.25,loudnorm=I=-14:TP=-1.5:LRA=11",
                "-ac", "1", "-ar", str(sr), "-c:a", "pcm_s16le", str(out_wav),
            ],
            check=True,
        )


def cmd_limpar(args):
    in_wav = Path(args.entrada).resolve()
    trans_path = Path(args.transcricao).resolve()
    out_wav = Path(args.saida).resolve()
    if not in_wav.exists():
        print(f"Erro: WAV não encontrado: {in_wav}", file=sys.stderr)
        return 1
    if not trans_path.exists():
        print(f"Erro: transcrição não encontrada: {trans_path}", file=sys.stderr)
        return 1

    cuts = parse_cuts_spec(args.cortes) if args.cortes else []
    if args.cortes_json:
        raw_c = json.loads(Path(args.cortes_json).read_text(encoding="utf-8"))
        for item in raw_c.get("cuts", raw_c if isinstance(raw_c, list) else []):
            cuts.append((float(item["start"]), float(item["end"])))
        cuts = sorted(cuts, key=lambda c: c[0])

    trans = json.loads(trans_path.read_text(encoding="utf-8"))
    word_spans = []
    for seg in trans.get("segments", []):
        for w in seg.get("words") or []:
            word_spans.append((float(w["start"]), float(w["end"])))

    x, sr = load_wav_mono(in_wav)
    total_s = len(x) / sr
    kept_base = []
    cur = 0.0
    for cs, ce in cuts:
        if cs > cur + 0.05:
            kept_base.append((cur, cs))
        cur = max(cur, ce)
    if cur < total_s - 0.05:
        kept_base.append((cur, total_s))

    intervals = build_word_protected_intervals(
        x, sr, kept_base, word_spans,
        silence_db=args.silencio_db,
        word_margin=args.margem_palavra,
    )
    full, edl = stitch_intervals(x, sr, intervals, xfade_ms=args.xfade_ms)

    raw_out = out_wav.with_name(out_wav.stem + ".bruto.wav") if args.voicefixer else out_wav
    save_wav_mono(raw_out, full, sr)
    edl_path = out_wav.with_name("edl-cortes.json")
    edl_path.write_text(
        json.dumps(
            {
                "source": str(in_wav),
                "sample_rate": sr,
                "source_duration": round(total_s, 3),
                "edited_duration": round(len(full) / sr, 3),
                "silence_db": args.silencio_db,
                "word_margin_s": args.margem_palavra,
                "cuts": [{"start": a, "end": b} for a, b in cuts],
                "edl": edl,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )

    if args.voicefixer:
        run_voicefixer_and_master(raw_out, out_wav)

    # Auditar repetições restantes no material mantido
    kept_words = []
    for seg in trans.get("segments", []):
        for w in seg.get("words") or []:
            mid = 0.5 * (float(w["start"]) + float(w["end"]))
            for it in edl:
                if it["src_start"] <= mid <= it["src_end"]:
                    dt = it["dst_start"] + (mid - it["src_start"])
                    n = norm_word(w["word"])
                    if n:
                        kept_words.append((dt, w["word"].strip(), n))
                    break
    reps = detect_repetitions(kept_words)

    res = {
        "saida": str(out_wav),
        "edl": str(edl_path),
        "duracao_original_s": round(total_s, 3),
        "duracao_final_s": round(len(full) / sr, 3),
        "voicefixer": bool(args.voicefixer),
        "repeticoes_restantes": len(reps),
        "ocorrencias": reps,
    }
    if args.json:
        print(json.dumps(res, ensure_ascii=False, indent=2))
    else:
        print(
            f"[Audio Limpar] OK -> {out_wav} | {res['duracao_original_s']:.2f}s -> "
            f"{res['duracao_final_s']:.2f}s | voicefixer={res['voicefixer']} | repeticoes_restantes={len(reps)}"
        )
        for h in reps:
            print(f"  ! ALERTA {h['mmss']}: \"{h['trecho']}\"")
    return 0


def build_parser():
    p = argparse.ArgumentParser(prog="crom-studio audio", description="Limpeza, corte incremental e auditoria de voz real.")
    sub = p.add_subparsers(dest="cmd", required=True)

    pa = sub.add_parser("auditar", help="Detecta repetições (n-gramas) em transcrição .json, .srt ou .txt")
    pa.add_argument("--transcricao", required=True, help="Caminho do arquivo .json (faster-whisper), .srt ou .txt")
    pa.add_argument("--janela", type=float, default=15.0, help="Janela máxima em segundos (padrão: 15)")
    pa.add_argument("--min-palavras", type=int, default=2, help="Mínimo de palavras repetidas (padrão: 2)")
    pa.add_argument("--strict", action="store_true", help="Retorna código 1 se encontrar repetições")
    pa.add_argument("--json", action="store_true", help="Saída em JSON")
    pa.set_defaults(func=cmd_auditar)

    pc = sub.add_parser("cortar", help="Corte cirúrgico direto no WAV já restaurado (sem re-rodar VoiceFixer)")
    pc.add_argument("--entrada", required=True, help="WAV já restaurado de entrada")
    pc.add_argument("--saida", required=True, help="WAV de saída")
    pc.add_argument("--cortes", required=True, help="Lista de intervalos em segundos: a-b,c-d")
    pc.add_argument("--xfade-ms", type=float, default=20.0, help="Crossfade Hann em ms (padrão: 20)")
    pc.add_argument("--json", action="store_true", help="Saída em JSON")
    pc.set_defaults(func=cmd_cortar)

    pl = sub.add_parser("limpar", help="Corte completo protegido por palavras + VoiceFixer opcional")
    pl.add_argument("--entrada", required=True, help="WAV bruto da gravação")
    pl.add_argument("--transcricao", required=True, help="JSON palavra-a-palavra do faster-whisper")
    pl.add_argument("--saida", required=True, help="WAV final de saída")
    pl.add_argument("--cortes", default="", help="Cortes inline a-b,c-d")
    pl.add_argument("--cortes-json", default="", help="Arquivo JSON com lista 'cuts'")
    pl.add_argument("--silencio-db", type=float, default=-44.0, help="Limiar de silêncio em dB (padrão: -44)")
    pl.add_argument("--margem-palavra", type=float, default=0.18, help="Margem de proteção em s por palavra (padrão: 0.18)")
    pl.add_argument("--xfade-ms", type=float, default=20.0, help="Crossfade Hann em ms (padrão: 20)")
    pl.add_argument("--voicefixer", action="store_true", help="Aplica VoiceFixer mode=0 + masterização -14 LUFS")
    pl.add_argument("--json", action="store_true", help="Saída em JSON")
    pl.set_defaults(func=cmd_limpar)
    return p


def main():
    parser = build_parser()
    args = parser.parse_args()
    sys.exit(args.func(args))


if __name__ == "__main__":
    main()
