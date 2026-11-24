import crypto from 'node:crypto';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  ASSETS_DIR,
  DATA_DIR,
  WEB_DIR,
  loadConfig,
  getEditableConfig,
  saveConfigUpdates,
  addChannelToConfig,
  removeChannelFromConfig,
} from './config.mjs';
import { syncWorkspace, syncYouTubeRss, slugify } from './sync.mjs';
import {
  BOARDS_DIR_NAME,
  listBoards,
  readBoard,
  createBoard,
  saveBoard,
  deleteBoard,
} from './boards.mjs';
import {
  getHistory,
  readRefContent,
  commitRevision,
  createVersion,
  restoreRevision,
  promoteVersion,
  deleteVersion,
  diffTargets,
  migrateDocHistory,
  deleteDocHistory,
} from './versioning.mjs';

const MAX_BODY_BYTES = 35 * 1024 * 1024;
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
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.wasm': 'application/wasm',
  '.excalidraw': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
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

function serveSpaHtml(res) {
  const indexPath = path.join(WEB_DIR, 'index.html');
  if (!fs.existsSync(indexPath)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('index.html não encontrado');
    return;
  }
  let html = fs.readFileSync(indexPath, 'utf8');
  if (!html.includes('<base ')) {
    html = html.replace('<head>', '<head>\n  <base href="/">');
  }
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-cache',
  });
  res.end(html);
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

  if (cleanPath === '/' || cleanPath === '/index.html') {
    return serveSpaHtml(res);
  }

  // Verifica se corresponde a um arquivo estático real em WEB_DIR (ex.: /styles.css, /app.js, /markdown.js)
  const webRootReal = fs.realpathSync(WEB_DIR);
  const relStatic = cleanPath.replace(/^\/+/, '');
  const segments = relStatic ? relStatic.split('/') : [];
  if (!segments.some((s) => !s || s === '.' || s === '..' || s.startsWith('.'))) {
    const candidate = path.resolve(webRootReal, relStatic);
    if (candidate.startsWith(webRootReal + path.sep) && fs.existsSync(candidate)) {
      const st = fs.lstatSync(candidate);
      if (!st.isSymbolicLink() && !st.isDirectory()) {
        return serveFileSafe(res, WEB_DIR, relStatic);
      }
    }
  }

  // Fallback SPA para URLs amigáveis (ex.: /mrj, /mrj/mapa, /mrj/roteiros/06-series/...)
  if (!cleanPath.startsWith('/api/')) {
    return serveSpaHtml(res);
  }

  res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ error: 'Endpoint não encontrado' }));
}

function createLiveWatchHub(config) {
  const clients = new Set();
  const watchers = [];
  let debounceTimer = null;
  let suppressFsUntil = 0;
  let pendingConfig = false;
  const pendingChannels = new Set();
  const pendingPaths = new Set();
  const boardApiSnapshots = new Map();
  let boardApiDirTouchedAt = 0;

  function markApiWrite(ms = 450) {
    suppressFsUntil = Math.max(suppressFsUntil, Date.now() + ms);
  }

  function markBoardDirTouch() {
    boardApiDirTouchedAt = Date.now();
  }

  function markBoardWrite(channel, relPath, exists, fileHash = null) {
    boardApiSnapshots.set(`${channel}:${relPath}`, {
      exists: Boolean(exists),
      hash: fileHash,
      expiresAt: Date.now() + 1500,
    });
  }

  function isSelfBoardFsEvent(channel, wsPath, relPath) {
    const key = `${channel}:${relPath}`;
    const snap = boardApiSnapshots.get(key);
    if (!snap) return false;
    if (Date.now() > snap.expiresAt) {
      boardApiSnapshots.delete(key);
      return false;
    }

    const abs = path.join(wsPath, relPath);
    const existsNow = fs.existsSync(abs);
    if (!snap.exists) {
      return !existsNow;
    }
    if (!existsNow) {
      boardApiSnapshots.delete(key);
      return false;
    }
    try {
      const diskRaw = fs.readFileSync(abs, 'utf8');
      const diskHash = crypto.createHash('sha256').update(diskRaw, 'utf8').digest('hex');
      if (diskHash === snap.hash) {
        return true;
      }
      boardApiSnapshots.delete(key);
      return false;
    } catch {
      return false;
    }
  }

  function broadcast(payload) {
    if (!clients.size) return;
    const frame = `event: update\ndata: ${JSON.stringify(payload)}\n\n`;
    for (const res of clients) {
      try {
        res.write(frame);
      } catch {
        clients.delete(res);
      }
    }
  }

  function flushFsChanges() {
    debounceTimer = null;
    const configChanged = pendingConfig;
    const changedChannels = Array.from(pendingChannels);
    const changedPaths = Array.from(pendingPaths).slice(0, 20);
    pendingConfig = false;
    pendingChannels.clear();
    pendingPaths.clear();

    try {
      if (configChanged && config.configPath && fs.existsSync(config.configPath)) {
        const reloaded = loadConfig(['--config', config.configPath], { ignoreEnv: true });
        const keepPort = config.port;
        const keepHost = config.host;
        Object.assign(config, reloaded, { port: keepPort, host: keepHost });
        rebuildWatchers();
      }
      syncWorkspace({ serverMode: true, config });
      broadcast({
        type: 'change',
        source: 'fs',
        reason: configChanged ? 'config' : 'workspace',
        channels: changedChannels,
        paths: changedPaths,
        ts: Date.now(),
      });
    } catch {
      // ignora erro transitório durante gravação parcial em disco
    }
  }

  function scheduleFsFlush({ channel = '', filePath = '', isConfig = false } = {}) {
    if (Date.now() < suppressFsUntil) return;
    if (isConfig) pendingConfig = true;
    if (channel) pendingChannels.add(channel);
    if (filePath) pendingPaths.add(filePath);
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(flushFsChanges, 220);
  }

  function closeWatchers() {
    while (watchers.length) {
      const w = watchers.pop();
      try {
        w.close();
      } catch {
        // ignora
      }
    }
  }

  function attachWorkspaceWatcher(chKey, wsPath) {
    if (!wsPath || !fs.existsSync(wsPath)) return;
    const onFsEvent = (_eventType, filename) => {
      const rel = String(filename || '').replace(/\\/g, '/');
      if (!rel) {
        scheduleFsFlush({ channel: chKey, filePath: '*' });
        return;
      }
      const base = path.basename(rel);
      if (
        rel.startsWith('.git/') ||
        rel.includes('/.git/') ||
        rel.includes('node_modules/') ||
        base.endsWith('.swp') ||
        base.endsWith('.swo') ||
        base.endsWith('.tmp') ||
        base.includes('.tmp.') ||
        base.endsWith('.bak') ||
        base.endsWith('~') ||
        base.startsWith('.#')
      ) {
        return;
      }
      if (rel === BOARDS_DIR_NAME && Date.now() - boardApiDirTouchedAt < 1000) {
        if (fs.existsSync(path.join(wsPath, rel))) return;
      }
      const isMd = rel.toLowerCase().endsWith('.md');
      const isBoard = rel.toLowerCase().endsWith('.excalidraw');
      const isGit = rel === '.roteiro-git' || rel.startsWith('.roteiro-git/');
      if (!isMd && !isBoard && !isGit && base.includes('.')) return;
      if (isBoard && isSelfBoardFsEvent(chKey, wsPath, rel)) return;
      scheduleFsFlush({ channel: chKey, filePath: rel });
    };

    try {
      watchers.push(fs.watch(wsPath, { recursive: true }, onFsEvent));
    } catch {
      try {
        watchers.push(fs.watch(wsPath, {}, onFsEvent));
      } catch {
        // fallback silencioso se SO não suportar watch neste diretório
      }
    }
  }

  function rebuildWatchers() {
    closeWatchers();
    for (const chKey of config.channelOrder || []) {
      const ch = config.channels[chKey];
      if (ch?.workspacePath) attachWorkspaceWatcher(chKey, ch.workspacePath);
    }

    if (config.configPath) {
      const cfgDir = path.dirname(config.configPath);
      const cfgBase = path.basename(config.configPath);
      if (fs.existsSync(cfgDir)) {
        try {
          watchers.push(
            fs.watch(cfgDir, {}, (_eventType, filename) => {
              const name = String(filename || '');
              if (name === cfgBase || name === 'config.local.json') {
                scheduleFsFlush({ isConfig: true, filePath: name });
              }
            })
          );
        } catch {
          // ignora
        }
      }
    }
  }

  rebuildWatchers();

  const heartbeat = setInterval(() => {
    for (const res of clients) {
      try {
        res.write(': keepalive\n\n');
      } catch {
        clients.delete(res);
      }
    }
  }, 25000);
  if (typeof heartbeat.unref === 'function') heartbeat.unref();

  return {
    markApiWrite,
    markBoardDirTouch,
    markBoardWrite,
    broadcast,
    rebuildWatchers,
    handleSse(req, res) {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      res.write(`event: ready\ndata: ${JSON.stringify({ ok: true, ts: Date.now() })}\n\n`);
      clients.add(res);
      req.on('close', () => {
        clients.delete(res);
      });
    },
    close() {
      clearInterval(heartbeat);
      if (debounceTimer) clearTimeout(debounceTimer);
      closeWatchers();
      for (const res of clients) {
        try {
          res.end();
        } catch {
          // ignora
        }
      }
      clients.clear();
    },
  };
}

export function createStudioServer(config) {
  const watchHub = createLiveWatchHub(config);
  const server = http.createServer(async (req, res) => {
    const urlObj = new URL(req.url || '/', `http://${config.host}:${config.port}`);
    const pathname = urlObj.pathname;

    try {
      if (req.method === 'GET' && pathname === '/api/events') {
        return watchHub.handleSse(req, res);
      }

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

      if (req.method === 'GET' && pathname === '/api/config') {
        return sendJson(res, 200, { ok: true, config: getEditableConfig(config) });
      }

      if (req.method === 'PUT' && pathname === '/api/config') {
        const body = await readJsonBody(req);
        watchHub.markApiWrite();
        const { restartRequired } = saveConfigUpdates(config, body);
        watchHub.rebuildWatchers();
        const state = syncWorkspace({ serverMode: true, config });
        watchHub.broadcast({ type: 'change', source: 'api', reason: 'config', ts: Date.now() });
        return sendJson(res, 200, {
          ok: true,
          restartRequired,
          config: getEditableConfig(config),
          state,
        });
      }

      if (req.method === 'POST' && pathname === '/api/config/channels') {
        const body = await readJsonBody(req);
        watchHub.markApiWrite();
        const { channelKey } = addChannelToConfig(config, body);
        watchHub.rebuildWatchers();
        const state = syncWorkspace({ serverMode: true, config });
        watchHub.broadcast({ type: 'change', source: 'api', reason: 'channel-add', channel: channelKey, ts: Date.now() });
        return sendJson(res, 201, {
          ok: true,
          channelKey,
          config: getEditableConfig(config),
          state,
        });
      }

      if (req.method === 'DELETE' && pathname === '/api/config/channels') {
        let keyParam = urlObj.searchParams.get('key');
        if (!keyParam) {
          const body = await readJsonBody(req).catch(() => ({}));
          keyParam = body.key || body.channelKey;
        }
        watchHub.markApiWrite();
        const { removedKey } = removeChannelFromConfig(config, keyParam);
        watchHub.rebuildWatchers();
        const state = syncWorkspace({ serverMode: true, config });
        watchHub.broadcast({ type: 'change', source: 'api', reason: 'channel-remove', channel: removedKey, ts: Date.now() });
        return sendJson(res, 200, {
          ok: true,
          removedKey,
          config: getEditableConfig(config),
          state,
        });
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
        watchHub.markApiWrite();
        const initialContent = String(body.content ?? '');
        const verRes = commitRevision(target.workspaceReal, target.rel, {
          content: initialContent,
          version: 'principal',
          message: body.commitMessage || 'Criação do roteiro',
          author: body.author || 'MrJ',
          kind: 'init',
        });
        const state = syncWorkspace({ serverMode: true, config });
        watchHub.broadcast({ type: 'change', source: 'api', reason: 'doc-create', channel: target.channel, path: target.rel, ts: Date.now() });
        return sendJson(res, 201, {
          ok: true,
          channel: target.channel,
          path: target.rel,
          revision: verRes.revision,
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

        watchHub.markApiWrite();
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
          fs.mkdirSync(path.dirname(target.abs), { recursive: true });
          fs.copyFileSync(current.abs, target.abs);
          fs.unlinkSync(current.abs);
          migrateDocHistory(current.workspaceReal, current.rel, target.rel);
        }

        const verRes = commitRevision(target.workspaceReal, target.rel, {
          content: String(body.content ?? ''),
          version: body.version || 'principal',
          message: body.commitMessage || (target.rel !== current.rel ? `Movido para ${target.rel}` : 'Edição no Studio'),
          author: body.author || 'MrJ',
          kind: 'commit',
        });

        const state = syncWorkspace({ serverMode: true, config });
        watchHub.broadcast({ type: 'change', source: 'api', reason: 'doc-save', channel: target.channel, path: target.rel, ts: Date.now() });
        return sendJson(res, 200, {
          ok: true,
          channel: target.channel,
          path: target.rel,
          version: verRes.version,
          revision: verRes.revision,
          history: verRes.history,
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

        watchHub.markApiWrite();
        fs.unlinkSync(target.abs);
        deleteDocHistory(target.workspaceReal, target.rel);
        const state = syncWorkspace({ serverMode: true, config });
        watchHub.broadcast({ type: 'change', source: 'api', reason: 'doc-delete', channel: target.channel, path: target.rel, ts: Date.now() });
        return sendJson(res, 200, {
          ok: true,
          channel: target.channel,
          deleted: target.rel,
          state,
        });
      }

      if (req.method === 'GET' && pathname === '/api/versions') {
        const rawChannel = urlObj.searchParams.get('channel') || config.defaultChannel;
        const relPath = urlObj.searchParams.get('path');
        const target = resolveSafeMdPath(config, rawChannel, relPath);
        const history = getHistory(target.workspaceReal, target.rel);
        return sendJson(res, 200, { ok: true, channel: target.channel, ...history });
      }

      if (req.method === 'GET' && pathname === '/api/versions/content') {
        const rawChannel = urlObj.searchParams.get('channel') || config.defaultChannel;
        const relPath = urlObj.searchParams.get('path');
        const ref = urlObj.searchParams.get('ref') || 'ver:principal';
        const target = resolveSafeMdPath(config, rawChannel, relPath);
        const data = readRefContent(target.workspaceReal, target.rel, ref);
        return sendJson(res, 200, { ok: true, channel: target.channel, path: target.rel, ...data });
      }

      if (req.method === 'GET' && pathname === '/api/versions/diff') {
        const rawChannel = urlObj.searchParams.get('channel') || config.defaultChannel;
        const relPath = urlObj.searchParams.get('path');
        const from = urlObj.searchParams.get('from') || 'ver:principal';
        const to = urlObj.searchParams.get('to') || 'disk';
        const target = resolveSafeMdPath(config, rawChannel, relPath);
        const diff = diffTargets(target.workspaceReal, target.rel, { from, to });
        return sendJson(res, 200, { ok: true, channel: target.channel, path: target.rel, ...diff });
      }

      if (req.method === 'POST' && pathname === '/api/versions/commit') {
        const body = await readJsonBody(req);
        const target = resolveSafeMdPath(config, body.channel || config.defaultChannel, body.path);
        watchHub.markApiWrite();
        const result = commitRevision(target.workspaceReal, target.rel, {
          content: String(body.content ?? ''),
          version: body.version || 'principal',
          message: body.message || 'Nova revisão',
          author: body.author || 'MrJ',
          kind: 'commit',
        });
        const state = syncWorkspace({ serverMode: true, config });
        watchHub.broadcast({ type: 'change', source: 'api', reason: 'version-commit', channel: target.channel, path: target.rel, ts: Date.now() });
        return sendJson(res, 200, { ...result, channel: target.channel, path: target.rel, state });
      }

      if (req.method === 'POST' && pathname === '/api/versions/create') {
        const body = await readJsonBody(req);
        const target = resolveSafeMdPath(config, body.channel || config.defaultChannel, body.path);
        watchHub.markApiWrite();
        const result = createVersion(target.workspaceReal, target.rel, {
          name: body.name,
          description: body.description || '',
          fromVersion: body.fromVersion || 'principal',
          fromRev: body.fromRev || null,
          content: body.content !== undefined ? body.content : null,
          author: body.author || 'MrJ',
          message: body.message || '',
        });
        const state = syncWorkspace({ serverMode: true, config });
        watchHub.broadcast({ type: 'change', source: 'api', reason: 'version-create', channel: target.channel, path: target.rel, ts: Date.now() });
        return sendJson(res, 201, { ...result, channel: target.channel, path: target.rel, state });
      }

      if (req.method === 'POST' && pathname === '/api/versions/restore') {
        const body = await readJsonBody(req);
        const target = resolveSafeMdPath(config, body.channel || config.defaultChannel, body.path);
        watchHub.markApiWrite();
        const result = restoreRevision(target.workspaceReal, target.rel, {
          revId: body.revId,
          targetVersion: body.targetVersion || 'principal',
          author: body.author || 'MrJ',
          message: body.message || '',
        });
        const state = syncWorkspace({ serverMode: true, config });
        watchHub.broadcast({ type: 'change', source: 'api', reason: 'version-restore', channel: target.channel, path: target.rel, ts: Date.now() });
        return sendJson(res, 200, { ...result, channel: target.channel, path: target.rel, state });
      }

      if (req.method === 'POST' && pathname === '/api/versions/promote') {
        const body = await readJsonBody(req);
        const target = resolveSafeMdPath(config, body.channel || config.defaultChannel, body.path);
        watchHub.markApiWrite();
        const result = promoteVersion(target.workspaceReal, target.rel, {
          versionName: body.versionName,
          author: body.author || 'MrJ',
          message: body.message || '',
        });
        const state = syncWorkspace({ serverMode: true, config });
        watchHub.broadcast({ type: 'change', source: 'api', reason: 'version-promote', channel: target.channel, path: target.rel, ts: Date.now() });
        return sendJson(res, 200, { ...result, channel: target.channel, path: target.rel, state });
      }

      if (req.method === 'DELETE' && pathname === '/api/versions') {
        let targetParam = urlObj.searchParams.get('path');
        let rawChannel = urlObj.searchParams.get('channel');
        let versionName = urlObj.searchParams.get('versionName');
        if (!targetParam || !rawChannel || !versionName) {
          const body = await readJsonBody(req).catch(() => ({}));
          if (!targetParam) targetParam = body.path;
          if (!rawChannel) rawChannel = body.channel;
          if (!versionName) versionName = body.versionName;
        }
        const target = resolveSafeMdPath(config, rawChannel || config.defaultChannel, targetParam);
        watchHub.markApiWrite();
        const result = deleteVersion(target.workspaceReal, target.rel, { versionName });
        const state = syncWorkspace({ serverMode: true, config });
        watchHub.broadcast({ type: 'change', source: 'api', reason: 'version-delete', channel: target.channel, path: target.rel, ts: Date.now() });
        return sendJson(res, 200, { ...result, channel: target.channel, path: target.rel, state });
      }

      if (req.method === 'GET' && pathname === '/api/boards') {
        const rawChannel = urlObj.searchParams.get('channel') || config.defaultChannel;
        const { key, workspaceReal } = resolveChannel(config, rawChannel);
        const boards = listBoards(workspaceReal);
        return sendJson(res, 200, { ok: true, channel: key, boards });
      }

      if (req.method === 'GET' && pathname === '/api/boards/item') {
        const rawChannel = urlObj.searchParams.get('channel') || config.defaultChannel;
        const boardId = urlObj.searchParams.get('id') ?? urlObj.searchParams.get('slug');
        const { key, workspaceReal } = resolveChannel(config, rawChannel);
        const { board, scene } = readBoard(workspaceReal, boardId);
        return sendJson(res, 200, { ok: true, channel: key, board, scene });
      }

      if (req.method === 'POST' && pathname === '/api/boards') {
        const body = await readJsonBody(req);
        const rawChannel = body.channel || urlObj.searchParams.get('channel') || config.defaultChannel;
        const { key, workspaceReal } = resolveChannel(config, rawChannel);
        watchHub.markBoardDirTouch();
        const result = createBoard(workspaceReal, body);
        watchHub.markBoardWrite(key, result.board.path, true, result.fileHash);
        const state = syncWorkspace({ serverMode: true, config });
        watchHub.broadcast({
          type: 'change',
          source: 'api',
          reason: 'board-create',
          channel: key,
          boardId: result.board.id,
          ts: Date.now(),
        });
        return sendJson(res, 201, {
          ok: true,
          channel: key,
          board: result.board,
          scene: result.scene,
          boards: result.boards,
          state,
        });
      }

      if (req.method === 'PUT' && pathname === '/api/boards') {
        const body = await readJsonBody(req);
        const rawChannel = body.channel || urlObj.searchParams.get('channel') || config.defaultChannel;
        const { key, workspaceReal } = resolveChannel(config, rawChannel);
        const boardId =
          body.id ?? body.slug ?? urlObj.searchParams.get('id') ?? urlObj.searchParams.get('slug');
        const result = saveBoard(workspaceReal, boardId, body);
        if (result.renamed) {
          watchHub.markBoardWrite(
            key,
            `${BOARDS_DIR_NAME}/${result.previousId}.excalidraw`,
            false,
            null
          );
        }
        watchHub.markBoardWrite(key, result.board.path, true, result.fileHash);
        const state = result.renamed ? syncWorkspace({ serverMode: true, config }) : undefined;
        watchHub.broadcast({
          type: 'change',
          source: 'api',
          reason: 'board-save',
          channel: key,
          boardId: result.board.id,
          ts: Date.now(),
        });
        return sendJson(res, 200, {
          ok: true,
          channel: key,
          board: result.board,
          updatedAt: result.board.updatedAt,
          boards: result.boards,
          ...(state ? { state } : {}),
        });
      }

      if (req.method === 'DELETE' && pathname === '/api/boards') {
        let boardId = urlObj.searchParams.get('id') ?? urlObj.searchParams.get('slug');
        let rawChannel = urlObj.searchParams.get('channel');
        if (!boardId || !rawChannel) {
          const body = await readJsonBody(req).catch(() => ({}));
          if (!boardId) boardId = body.id ?? body.slug;
          if (!rawChannel) rawChannel = body.channel;
        }
        const { key, workspaceReal } = resolveChannel(config, rawChannel || config.defaultChannel);
        const result = deleteBoard(workspaceReal, boardId);
        watchHub.markBoardWrite(key, `${BOARDS_DIR_NAME}/${result.deleted}.excalidraw`, false, null);
        const state = syncWorkspace({ serverMode: true, config });
        watchHub.broadcast({
          type: 'change',
          source: 'api',
          reason: 'board-delete',
          channel: key,
          boardId: result.deleted,
          ts: Date.now(),
        });
        return sendJson(res, 200, {
          ok: true,
          channel: key,
          deleted: result.deleted,
          boards: result.boards,
          state,
        });
      }

      if (req.method === 'POST' && pathname === '/api/sync-youtube') {
        const body = await readJsonBody(req).catch(() => ({}));
        const targetChannel = body.channel || urlObj.searchParams.get('channel') || 'all';
        watchHub.markApiWrite(900);
        const result = await syncYouTubeRss({
          serverMode: true,
          channel: targetChannel,
          config,
        });
        watchHub.broadcast({ type: 'change', source: 'api', reason: 'sync-youtube', channel: targetChannel, ts: Date.now() });
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

  server.on('close', () => {
    watchHub.close();
  });

  return server;
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
