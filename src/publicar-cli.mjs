#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { loadConfig, getCliArg } from './config.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

function usage() {
  console.log(`Uso: crom-studio publicar --canal mrj|crom --arquivo <caminho.md> --url <youtube-url> [opções]

Atualiza youtube_id e status="publicado" no frontmatter YAML do roteiro, move opcionalmente para
02-roteiros/publicados/, gera moldes de divulgação (WhatsApp, X e TabNews) e roda sync.mjs.

Opções:
  --canal mrj|crom     Canal alvo (obrigatório)
  --arquivo <rel.md>   Caminho relativo ao workspace do canal (ou absoluto)
  --url <url-ou-id>    URL do YouTube (youtu.be/... ou watch?v=...) ou ID de 11 caracteres
  --mover              Move o roteiro de rascunhos/ ou em-producao/ para 02-roteiros/publicados/
  --kit                Imprime textos prontos para WhatsApp, Thread X (4 posts) e TabNews
  --dry-run            Mostra o que seria feito sem gravar arquivos nem rodar sync.mjs
  --json               Saída estruturada em JSON
  -h, --help           Exibe esta ajuda
`);
}

function extractYoutubeId(raw) {
  if (!raw) return '';
  const trimmed = String(raw).trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(trimmed)) return trimmed;
  const m1 = trimmed.match(/youtu\.be\/([A-Za-z0-9_-]{11})/);
  if (m1) return m1[1];
  const m2 = trimmed.match(/[?&]v=([A-Za-z0-9_-]{11})/);
  if (m2) return m2[1];
  const m3 = trimmed.match(/youtube\.com\/shorts\/([A-Za-z0-9_-]{11})/);
  if (m3) return m3[1];
  return '';
}

function updateFrontmatter(content, updates) {
  const m = content.match(/^---\r?\n([\s\S]*?)\r?\n---(\r?\n[\s\S]*)$/);
  if (!m) {
    throw new Error('Arquivo sem frontmatter YAML válido entre ---.');
  }
  let fm = m[1];
  const body = m[2];
  const meta = {};
  for (const line of fm.split(/\r?\n/)) {
    const kv = line.match(/^([a-zA-Z0-9_]+):\s*"?([^"]*)"?\s*$/);
    if (kv) meta[kv[1]] = kv[2];
  }
  for (const [k, v] of Object.entries(updates)) {
    const lineRe = new RegExp(`^${k}:.*$`, 'm');
    const replacement = `${k}: "${String(v).replace(/"/g, '\\"')}"`;
    if (lineRe.test(fm)) {
      fm = fm.replace(lineRe, replacement);
    } else {
      fm = `${fm}\n${replacement}`;
    }
    meta[k] = v;
  }
  return { content: `---\n${fm}\n---${body}`, meta };
}

function buildDistributionKit(meta, url) {
  const titulo = meta.titulo || 'Novo vídeo';
  const resumo = meta.resumo || '';
  return {
    whatsapp_curto: `${titulo}\n\n${resumo}\n\nAssista aqui: ${url}`,
    thread_x: [
      `1/3 ${titulo}\n\n${resumo}\n\nAssista aqui 👇\n${url}`,
      `2/3 Todo o código e bastidores seguem abertos no GitHub: https://github.com/MrJc01`,
      `3/3 Se curtir, comenta o que achou e compartilha com quem constrói software de verdade.`,
    ],
    tabnews_titulo: titulo,
    tabnews_fonte: url,
  };
}

const args = process.argv.slice(2);
if (args.length === 0 || args.includes('-h') || args.includes('--help')) {
  usage();
  process.exit(0);
}

const canal = (getCliArg(args, '--canal') || getCliArg(args, '--channel') || '').toLowerCase();
const arquivoArg = getCliArg(args, '--arquivo') || getCliArg(args, '--file') || '';
const urlArg = getCliArg(args, '--url') || getCliArg(args, '--youtube-id') || '';
const doMove = args.includes('--mover') || args.includes('--move');
const showKit = args.includes('--kit');
const dryRun = args.includes('--dry-run');
const asJson = args.includes('--json');

if (!canal || !arquivoArg || !urlArg) {
  console.error('Erro: informe --canal, --arquivo e --url. Use --help para detalhes.');
  process.exit(1);
}

const ytId = extractYoutubeId(urlArg);
if (!ytId) {
  console.error(`Erro: não foi possível extrair um YouTube ID válido de '${urlArg}'.`);
  process.exit(1);
}

const config = loadConfig(args);
const channels = config.channels || {};
const ch = Array.isArray(channels)
  ? channels.find((c) => c.id === canal || c.slug === canal)
  : channels[canal] || Object.values(channels).find((c) => c && (c.id === canal || c.slug === canal));
const workspaceDir = ch && (ch.workspacePath || ch.workspaceDir || ch.workspace || ch.dir || ch.rootDir);
if (!ch || !workspaceDir) {
  console.error(`Erro: canal '${canal}' não encontrado na configuração do Crom YouTube Studio.`);
  process.exit(1);
}

const srcPath = path.isAbsolute(arquivoArg)
  ? arquivoArg
  : path.resolve(workspaceDir, arquivoArg);

if (!fs.existsSync(srcPath)) {
  console.error(`Erro: arquivo não encontrado: ${srcPath}`);
  process.exit(1);
}

const raw = fs.readFileSync(srcPath, 'utf8');
const { content: updated, meta } = updateFrontmatter(raw, {
  status: 'publicado',
  youtube_id: ytId,
});

let destPath = srcPath;
if (doMove) {
  const rel = path.relative(workspaceDir, srcPath);
  if (rel.startsWith('02-roteiros/rascunhos/') || rel.startsWith('02-roteiros/em-producao/')) {
    destPath = path.join(workspaceDir, '02-roteiros', 'publicados', path.basename(srcPath));
  }
}

if (!dryRun) {
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  fs.writeFileSync(destPath, updated, 'utf8');
  if (destPath !== srcPath && fs.existsSync(srcPath)) {
    fs.unlinkSync(srcPath);
  }
  const syncRes = spawnSync(process.execPath, [path.join(REPO_ROOT, 'src', 'sync.mjs')], {
    cwd: REPO_ROOT,
    stdio: asJson ? 'pipe' : 'inherit',
  });
  if (syncRes.status !== 0) {
    console.error('[Crom Studio Publicar] Aviso: sync.mjs retornou código diferente de 0.');
  }
}

const ytUrl = `https://youtu.be/${ytId}`;
const result = {
  dryRun,
  canal,
  youtube_id: ytId,
  url: ytUrl,
  status: 'publicado',
  origem: srcPath,
  destino: destPath,
  movido: destPath !== srcPath,
  titulo: meta.titulo || '',
  ...(showKit ? { kit: buildDistributionKit(meta, ytUrl) } : {}),
};

if (asJson) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(
    `[Crom Studio Publicar] ${dryRun ? '(DRY-RUN) ' : ''}OK -> ${destPath} | youtube_id=${ytId} | status=publicado${result.movido ? ' (movido)' : ''}`
  );
  if (showKit && result.kit) {
    console.log('\n--- WhatsApp Curto ---\n' + result.kit.whatsapp_curto);
    console.log('\n--- Thread X ---\n' + result.kit.thread_x.join('\n\n'));
  }
}
