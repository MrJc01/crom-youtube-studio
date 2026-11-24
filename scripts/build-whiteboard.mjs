import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const ENTRY_FILE = path.join(ROOT_DIR, 'src', 'whiteboard-entry.jsx');
const OUT_DIR = path.join(ROOT_DIR, 'web', 'vendor', 'excalidraw');
const EXCALIDRAW_PKG_DIR = path.join(ROOT_DIR, 'node_modules', '@excalidraw', 'excalidraw');
const EXCALIDRAW_PROD_DIR = path.join(EXCALIDRAW_PKG_DIR, 'dist', 'prod');
const EXCALIDRAW_CSS_SRC = path.join(EXCALIDRAW_PROD_DIR, 'index.css');
const EXCALIDRAW_FONTS_SRC = path.join(EXCALIDRAW_PROD_DIR, 'fonts');

function countFilesRecursive(dir) {
  if (!fs.existsSync(dir)) return 0;
  let count = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) count += countFilesRecursive(full);
    else if (entry.isFile()) count += 1;
  }
  return count;
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

async function main() {
  if (!fs.existsSync(EXCALIDRAW_PKG_DIR) || !fs.existsSync(EXCALIDRAW_PROD_DIR)) {
    console.warn(
      '[build:whiteboard] Aviso: @excalidraw/excalidraw não encontrado em node_modules. Execute "npm install" para gerar o quadro local.'
    );
    process.exit(0);
  }

  if (!fs.existsSync(ENTRY_FILE)) {
    console.warn(`[build:whiteboard] Aviso: arquivo de entrada ausente (${ENTRY_FILE}).`);
    process.exit(0);
  }

  let esbuild;
  try {
    esbuild = await import('esbuild');
  } catch (err) {
    console.warn(
      `[build:whiteboard] Aviso: esbuild não disponível (${err?.message || err}). Pulando empacotamento.`
    );
    process.exit(0);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });

  const bundleOut = path.join(OUT_DIR, 'bundle.js');
  const cssOut = path.join(OUT_DIR, 'excalidraw.css');
  const bundleCssOut = path.join(OUT_DIR, 'bundle.css');
  const fontsOut = path.join(OUT_DIR, 'fonts');

  await esbuild.build({
    entryPoints: [ENTRY_FILE],
    bundle: true,
    minify: true,
    format: 'iife',
    platform: 'browser',
    target: ['chrome100', 'firefox102', 'safari15'],
    jsx: 'automatic',
    define: {
      'process.env.NODE_ENV': '"production"',
    },
    loader: {
      '.woff2': 'file',
      '.woff': 'file',
      '.ttf': 'file',
      '.png': 'dataurl',
      '.svg': 'dataurl',
    },
    outfile: bundleOut,
    logLevel: 'warning',
  });

  if (!fs.existsSync(EXCALIDRAW_CSS_SRC)) {
    throw new Error(`CSS de produção do Excalidraw não encontrado: ${EXCALIDRAW_CSS_SRC}`);
  }
  fs.copyFileSync(EXCALIDRAW_CSS_SRC, cssOut);

  if (!fs.existsSync(EXCALIDRAW_FONTS_SRC)) {
    throw new Error(`Diretório de fontes do Excalidraw não encontrado: ${EXCALIDRAW_FONTS_SRC}`);
  }
  fs.rmSync(fontsOut, { recursive: true, force: true });
  fs.cpSync(EXCALIDRAW_FONTS_SRC, fontsOut, { recursive: true, force: true });

  if (!fs.existsSync(bundleCssOut)) {
    fs.writeFileSync(bundleCssOut, '/* Crom Studio Excalidraw bundle stylesheet */\n', 'utf8');
  }

  const bundleSize = fs.statSync(bundleOut).size;
  const cssSize = fs.statSync(cssOut).size;
  const fontFiles = countFilesRecursive(fontsOut);

  console.log(
    `[build:whiteboard] OK -> bundle.js (${formatBytes(bundleSize)}), excalidraw.css (${formatBytes(cssSize)}), fonts (${fontFiles} arquivos).`
  );
}

main().catch((err) => {
  console.error('[build:whiteboard] Erro ao empacotar quadro Excalidraw:', err);
  process.exit(1);
});
