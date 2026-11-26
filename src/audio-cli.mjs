#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const SCRIPT = path.join(REPO_ROOT, 'scripts', 'audio_cleaner.py');
const PYTHON_BIN = process.env.CROM_STUDIO_PYTHON || 'python3';

const args = process.argv.slice(2);
if (args.length === 0 || args[0] === '-h' || args[0] === '--help') {
  console.log(`Uso: crom-studio audio <subcomando> [opções]

Subcomandos:
  auditar  --transcricao <arquivo.json|srt|txt> [--janela 15] [--min-palavras 2] [--strict] [--json]
           Detecta repetições de 2–5 palavras em janela de tempo antes de renderizar o vídeo.

  cortar   --entrada <in.wav> --saida <out.wav> --cortes <a-b,c-d,...> [--xfade-ms 20] [--json]
           Corte cirúrgico direto sobre WAV já restaurado (crossfade Hann, sem re-rodar VoiceFixer).

  limpar   --entrada <in.wav> --transcricao <transcricao.json> --saida <out.wav> [opções]
           Corte completo com compressor de silêncio protegido por palavras (-44 dB, ±0.18s),
           auditoria de repetições e restauração opcional (--voicefixer).

Exemplos:
  crom-studio audio auditar --transcricao material/narracao-final.srt
  crom-studio audio cortar --entrada audio.wav --saida audio-v2.wav --cortes 251.0-253.05,449.65-452.68
`);
  process.exit(0);
}

const child = spawnSync(PYTHON_BIN, [SCRIPT, ...args], {
  stdio: 'inherit',
  cwd: process.cwd(),
});

if (child.error) {
  console.error(`[Crom Studio Audio] Erro ao executar ${PYTHON_BIN}: ${child.error.message}`);
  process.exit(1);
}
process.exit(child.status ?? 0);
