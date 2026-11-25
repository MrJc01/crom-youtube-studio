#!/usr/bin/env python3
"""Conversor local de timbre via RVC v2 (CPU) para etapa Nivel 2 do Crom YouTube Studio."""

import json
import os
import sys

# Fairseq (hubert_base.pt) e checkpoints RVC exigem weights_only=False no PyTorch 2.6+
os.environ.setdefault("TORCH_FORCE_NO_WEIGHTS_ONLY_LOAD", "1")


def main() -> int:
    if len(sys.argv) < 2:
        sys.stderr.write("Uso: tts-rvc-convert.py <job.json>\n")
        return 2

    job_path = sys.argv[1]
    with open(job_path, "r", encoding="utf-8") as f:
        job = json.load(f)

    in_wav = str(job.get("inputWav") or "")
    out_wav = str(job.get("outputWav") or "")
    model_path = str(job.get("modelPath") or "")
    index_path = str(job.get("indexPath") or "")
    device = str(job.get("device") or "cpu")
    f0_up_key = int(job.get("f0UpKey", 0))
    f0_method = str(job.get("f0Method") or "rmvpe")
    index_rate = float(job.get("indexRate", 0.75))
    protect = float(job.get("protect", 0.33))
    rms_mix_rate = float(job.get("rmsMixRate", 0.25))
    filter_radius = int(job.get("filterRadius", 3))
    resample_sr = int(job.get("resampleSr", 0))

    if not in_wav or not os.path.exists(in_wav):
        sys.stderr.write(f"Áudio de entrada não encontrado: {in_wav}\n")
        return 3
    if not model_path or not os.path.exists(model_path):
        sys.stderr.write(f"Modelo RVC .pth não encontrado: {model_path}\n")
        return 4
    if not out_wav:
        sys.stderr.write("outputWav não especificado\n")
        return 5

    os.makedirs(os.path.dirname(os.path.abspath(out_wav)), exist_ok=True)

    from rvc_python.infer import RVCInference

    rvc = RVCInference(device=device)
    load_kwargs = {"model_path": model_path}
    if index_path and os.path.exists(index_path):
        load_kwargs["index_path"] = index_path
    rvc.load_model(**load_kwargs)
    rvc.set_params(
        f0method=f0_method,
        f0up_key=f0_up_key,
        index_rate=index_rate,
        filter_radius=filter_radius,
        resample_sr=resample_sr,
        rms_mix_rate=rms_mix_rate,
        protect=protect,
    )
    rvc.infer_file(in_wav, out_wav)

    if not os.path.exists(out_wav):
        sys.stderr.write("RVC não gerou arquivo de saída\n")
        return 6

    sys.stdout.write(json.dumps({
        "ok": True,
        "outputWav": out_wav,
        "modelPath": model_path,
        "indexPath": index_path if os.path.exists(index_path) else "",
        "f0Method": f0_method,
        "f0UpKey": f0_up_key,
        "indexRate": index_rate,
        "protect": protect,
    }))
    sys.stdout.flush()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
