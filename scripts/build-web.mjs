import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import esbuild from 'esbuild';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const JS_ENTRY = path.join(ROOT_DIR, 'web', 'src', 'main.js');
const CSS_ENTRY = path.join(ROOT_DIR, 'web', 'styles', 'main.css');
const DIST_DIR = path.join(ROOT_DIR, 'web', 'dist');
const JS_OUT = path.join(DIST_DIR, 'app.bundle.js');
const CSS_OUT = path.join(DIST_DIR, 'styles.bundle.css');

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

async function main() {
  fs.mkdirSync(DIST_DIR, { recursive: true });

  await Promise.all([
    esbuild.build({
      entryPoints: [JS_ENTRY],
      bundle: true,
      format: 'iife',
      platform: 'browser',
      target: ['es2022'],
      sourcemap: true,
      outfile: JS_OUT,
      logLevel: 'warning',
    }),
    esbuild.build({
      entryPoints: [CSS_ENTRY],
      bundle: true,
      sourcemap: true,
      outfile: CSS_OUT,
      logLevel: 'warning',
    }),
  ]);

  const jsSize = fs.statSync(JS_OUT).size;
  const cssSize = fs.statSync(CSS_OUT).size;
  console.log(
    `[build:web] OK -> web/dist/app.bundle.js (${formatBytes(jsSize)}), web/dist/styles.bundle.css (${formatBytes(cssSize)}).`
  );
}

main().catch((err) => {
  console.error('[build:web] Erro ao compilar bundle web:', err);
  process.exit(1);
});
