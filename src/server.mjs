import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ASSETS_DIR, DATA_DIR, WEB_DIR, loadConfig } from './config.mjs';
import { syncWorkspace, syncYouTubeRss, slugify } from './sync.mjs';

const MAX_BODY_BYTES = 5 * 1024 * 1024;
const PROTECTED_FILES = new Set(['AGENTS.md', 'README.md']);

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
};

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > MAX_BODY_BYTES) {
        reject(Object.assign(new Error('Payload muito grande'), { statusCode: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(Object.assign(new Error('JSON inválido'), { statusCode: 400 }));
      }
    });
    req.on('error', reject);
  });
}

function assertInsideRoot(rootReal, targetPath) {
  if (targetPath !== rootReal && !targetPath.startsWith(rootReal + path.sep)) {
    throw Object.assign(new Error('Acesso fora do workspace bloqueado'), { statusCode: 403 });
  }
}

function assertNoSymlinkChain(rootReal, targetAbs) {
  const rel = path.relative(rootReal, targetAbs);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) {
    throw Object.assign(new Error('Acesso fora do workspace bloqueado'), { statusCode: 403 });
  }

  let cur = rootReal;
  for (const part of rel.split(path.sep)) {
    cur = path.join(cur, part);
    if (!fs.existsSync(cur)) {
      break;
    }
    const st = fs.lstatSync(cur);
    if (st.isSymbolicLink()) {
      throw Object.assign(new Error('Symlinks não são permitidos nesta operação'), { statusCode: 403 });
    }
  }

  // Valida também o ancestral existente mais próximo via realpathSync
  let probe = targetAbs;
  while (!fs.existsSync(probe)) {
    const parent = path.dirname(probe);
    if (parent === probe) break;
    probe = parent;
  }
  const realProbe = fs.realpathSync(probe);
  assertInsideRoot(rootReal, realProbe);
}

function resolveChannel(config, rawChannel) {
  const key = String(rawChannel || config.defaultChannel || '')
    .trim()
    .toLowerCase();
  const cfg = config.channels[key];
  if (!cfg) {
    throw Object.assign(new Error(`Canal inválido: ${rawChannel || '(vazio)'}`), { statusCode: 400 });
  }
  if (!cfg.workspacePath || !fs.existsSync(cfg.workspacePath)) {
    throw Object.assign(new Error(`Workspace do canal "${key}" não encontrado no disco`), {
      statusCode: 404,
    });
  }
  const workspaceReal = fs.realpathSync(cfg.workspacePath);
  return { key, cfg, workspaceReal };
}

function validateRelativeSegments(normalized, { allowEmpty = false } = {}) {
  if (!normalized) {
    if (allowEmpty) return [];
    throw Object.assign(new Error('Caminho ausente'), { statusCode: 400 });
  }
  if (normalized.includes('\0')) {
    throw Object.assign(new Error('Caminho inválido'), { statusCode: 400 });
  }
  const segments = normalized.split('/');
  for (const seg of segments) {
    if (!seg || seg === '.' || seg === '..' || seg.startsWith('.')) {
      throw Object.assign(new Error('Segmento de caminho proibido'), { statusCode: 403 });
    }
  }
  if (segments[0] === 'studio' || segments[0] === 'node_modules') {
    throw Object.assign(new Error('Pasta protegida do sistema'), { statusCode: 403 });
  }
  return segments;
}

function resolveSafeMdPath(config, rawChannel, relPath) {
  if (!relPath || typeof relPath !== 'string') {
    throw Object.assign(new Error('Caminho ausente'), { statusCode: 400 });
  }
  const { key, workspaceReal } = resolveChannel(config, rawChannel);
  const normalized = relPath.replace(/\\/g, '/').replace(/^\/+/, '').trim();
  validateRelativeSegments(normalized);

  if (!normalized.toLowerCase().endsWith('.md')) {
    throw Object.assign(new Error('Apenas arquivos .md são permitidos na API'), { statusCode: 400 });
  }

  const abs = path.resolve(workspaceReal, normalized);
  assertInsideRoot(workspaceReal, abs);
  assertNoSymlinkChain(workspaceReal, abs);

  return { channel: key, workspaceReal, abs, rel: normalized };
}

function resolveSafeFolder(config, rawChannel, folder) {
  const { key, workspaceReal } = resolveChannel(config, rawChannel);
  if (!folder || folder === 'raiz' || folder === '.') {
    return { channel: key, workspaceReal, abs: workspaceReal, rel: '' };
  }
  const normalized = String(folder).replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').trim();
  validateRelativeSegments(normalized, { allowEmpty: true });

  const abs = path.resolve(workspaceReal, normalized);
  assertInsideRoot(workspaceReal, abs);
  assertNoSymlinkChain(workspaceReal, abs);

  return { channel: key, workspaceReal, abs, rel: normalized };
}

function serveFileSafe(res, rootDir, relPath, cacheControl = 'no-cache') {
  if (!fs.existsSync(rootDir)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Diretório não encontrado');
    return;
  }
  const rootReal = fs.realpathSync(rootDir);
  const normalized = relPath.replace(/^\/+/, '');
  const segments = normalized ? normalized.split('/') : [];
  if (segments.some((s) => !s || s === '.' || s === '..' || s.startsWith('.'))) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Acesso negado');
    return;
  }

  const abs = path.resolve(rootReal, normalized);
  if (abs !== rootReal && !abs.startsWith(rootReal + path.sep)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Acesso negado');
    return;
  }

  if (!fs.existsSync(abs)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Arquivo não encontrado');
    return;
  }

  const lstat = fs.lstatSync(abs);
  if (lstat.isSymbolicLink() || lstat.isDirectory()) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Acesso negado');
    return;
  }

  const realAbs = fs.realpathSync(abs);
  if (!realAbs.startsWith(rootReal + path.sep)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Acesso negado');
    return;
  }

  const ext = path.extname(realAbs).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';
  res.writeHead(200, {
    'Content-Type': contentType,
    'Cache-Control': cacheControl,
  });
  fs.createReadStream(realAbs).pipe(res);
}

function serveStatic(reqPath, res) {
  let cleanPath;
  try {
    cleanPath = decodeURIComponent(reqPath.split('?')[0]);
  } catch {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('URL inválida');
    return;
  }

  if (cleanPath === '/data.js') {
    return serveFileSafe(res, DATA_DIR, 'data.js', 'no-store');
  }

  if (cleanPath.startsWith('/assets/')) {
    return serveFileSafe(res, ASSETS_DIR, cleanPath.slice('/assets/'.length));
  }

  if (cleanPath === '/') cleanPath = '/index.html';
  return serveFileSafe(res, WEB_DIR, cleanPath.slice(1));
}

export function createStudioServer(config) {
  return http.createServer(async (req, res) => {
    const urlObj = new URL(req.url || '/', `http://${config.host}:${config.port}`);
    const pathname = urlObj.pathname;

    try {
      if (req.method === 'GET' && pathname === '/api/health') {
        const body = JSON.stringify({
          ok: true,
          port: config.port,
          host: config.host,
          defaultChannel: config.defaultChannel,
          channels: config.channelOrder,
        });
        res.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store',
          'Access-Control-Allow-Origin': '*',
        });
        res.end(body);
        return;
      }

      if (req.method === 'GET' && pathname === '/api/state') {
        const state = syncWorkspace({ serverMode: true, config });
        return sendJson(res, 200, state);
      }

      if (req.method === 'POST' && pathname === '/api/doc') {
        const body = await readJsonBody(req);
        const rawChannel = body.channel || urlObj.searchParams.get('channel') || config.defaultChannel;
        const safeFolder = resolveSafeFolder(config, rawChannel, body.folder || '01-ideias');
        const rawName = String(body.filename || 'novo-roteiro').replace(/\.md$/i, '');
        const cleanName = `${slugify(rawName)}.md`;
        const relPath = safeFolder.rel ? `${safeFolder.rel}/${cleanName}` : cleanName;
        const target = resolveSafeMdPath(config, rawChannel, relPath);

        if (fs.existsSync(target.abs)) {
          return sendJson(res, 409, { error: `Já existe um arquivo em ${target.rel}` });
        }
        fs.mkdirSync(path.dirname(target.abs), { recursive: true });
        fs.writeFileSync(target.abs, String(body.content ?? ''), 'utf8');
        const state = syncWorkspace({ serverMode: true, config });
        return sendJson(res, 201, {
          ok: true,
          channel: target.channel,
          path: target.rel,
          state,
        });
      }

      if (req.method === 'PUT' && pathname === '/api/doc') {
        const body = await readJsonBody(req);
        const rawChannel = body.channel || urlObj.searchParams.get('channel') || config.defaultChannel;
        const current = resolveSafeMdPath(config, rawChannel, body.path);
        if (!fs.existsSync(current.abs)) {
          return sendJson(res, 404, { error: `Arquivo não encontrado: ${current.rel}` });
        }

        let target = current;
        if (body.newPath && body.newPath !== current.rel) {
          if (PROTECTED_FILES.has(current.rel)) {
            return sendJson(res, 403, {
              error: `${current.rel} é um arquivo essencial e não pode ser movido.`,
            });
          }
          target = resolveSafeMdPath(config, rawChannel, body.newPath);
          if (fs.existsSync(target.abs)) {
            return sendJson(res, 409, {
              error: `Já existe um arquivo no destino: ${target.rel}`,
            });
          }
        }

        fs.mkdirSync(path.dirname(target.abs), { recursive: true });
        fs.writeFileSync(target.abs, String(body.content ?? ''), 'utf8');
        if (target.abs !== current.abs && fs.existsSync(current.abs)) {
          fs.unlinkSync(current.abs);
        }

        const state = syncWorkspace({ serverMode: true, config });
        return sendJson(res, 200, {
          ok: true,
          channel: target.channel,
          path: target.rel,
          state,
        });
      }

      if (req.method === 'DELETE' && pathname === '/api/doc') {
        let targetParam = urlObj.searchParams.get('path');
        let rawChannel = urlObj.searchParams.get('channel');
        if (!targetParam || !rawChannel) {
          const body = await readJsonBody(req).catch(() => ({}));
          if (!targetParam) targetParam = body.path;
          if (!rawChannel) rawChannel = body.channel;
        }
        const target = resolveSafeMdPath(config, rawChannel || config.defaultChannel, targetParam);
        if (PROTECTED_FILES.has(target.rel)) {
          return sendJson(res, 403, {
            error: `${target.rel} é protegido e não pode ser removido.`,
          });
        }
        if (!fs.existsSync(target.abs)) {
          return sendJson(res, 404, { error: `Arquivo não encontrado: ${target.rel}` });
        }

        fs.unlinkSync(target.abs);
        const state = syncWorkspace({ serverMode: true, config });
        return sendJson(res, 200, {
          ok: true,
          channel: target.channel,
          deleted: target.rel,
          state,
        });
      }

      if (req.method === 'POST' && pathname === '/api/sync-youtube') {
        const body = await readJsonBody(req).catch(() => ({}));
        const targetChannel = body.channel || urlObj.searchParams.get('channel') || 'all';
        const result = await syncYouTubeRss({
          serverMode: true,
          channel: targetChannel,
          config,
        });
        return sendJson(res, 200, result);
      }

      if (req.method === 'GET' || req.method === 'HEAD') {
        return serveStatic(req.url || '/', res);
      }

      sendJson(res, 405, { error: 'Método não permitido' });
    } catch (err) {
      const status = err.statusCode || 500;
      sendJson(res, status, { error: err.message || 'Erro interno no servidor' });
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const config = loadConfig(process.argv.slice(2));
  syncWorkspace({ serverMode: true, config });
  const server = createStudioServer(config);

  const shutdown = () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 2000).unref();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  server.listen(config.port, config.host, () => {
    console.log(`[Crom YouTube Studio] Servidor ativo em http://${config.host}:${config.port}`);
    console.log(`[Crom YouTube Studio] Canais configurados: ${config.channelOrder.join(', ')}`);
  });
}
