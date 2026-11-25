import crypto from 'node:crypto';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { BOARDS_DIR_NAME } from './boards.mjs';
import { loadConfig } from './config.mjs';
import { verifySameOriginMutation } from './middleware/security.mjs';
import { STUDIO_DATA_DIR_NAME } from './notes.mjs';
import { RECORDINGS_DIR_NAME } from './recordings.mjs';
import { createRemoteAccessManager, discoverLanIpv4Addresses } from './remote-access.mjs';
import { handleBoardsRoutes } from './routes/boards.mjs';
import { handleCatalogRoutes } from './routes/catalog.mjs';
import { handleConfigRoutes } from './routes/config.mjs';
import { handleDocsRoutes } from './routes/docs.mjs';
import { sendJson, serveStatic } from './routes/http-utils.mjs';
import { handleNotesRoutes } from './routes/notes.mjs';
import { handleRecordingsRoutes } from './routes/recordings.mjs';
import { handleRemoteRoutes } from './routes/remote.mjs';
import { handleTtsRoutes } from './routes/tts.mjs';
import { createStateCache } from './state-cache.mjs';
import { NARRATIONS_DIR_NAME } from './tts.mjs';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const ROUTE_HANDLERS = [
  handleConfigRoutes,
  handleDocsRoutes,
  handleBoardsRoutes,
  handleCatalogRoutes,
  handleRecordingsRoutes,
  handleTtsRoutes,
  handleNotesRoutes,
  handleRemoteRoutes,
];

function isIgnoredWatchPath(rel, base) {
  return (
    rel.startsWith('.git/') ||
    rel.includes('/.git/') ||
    rel.includes('node_modules/') ||
    rel === STUDIO_DATA_DIR_NAME ||
    rel.startsWith(`${STUDIO_DATA_DIR_NAME}/`) ||
    rel === RECORDINGS_DIR_NAME ||
    rel.startsWith(`${RECORDINGS_DIR_NAME}/`) ||
    rel === NARRATIONS_DIR_NAME ||
    rel.startsWith(`${NARRATIONS_DIR_NAME}/`) ||
    base.endsWith('.swp') ||
    base.endsWith('.swo') ||
    base.endsWith('.tmp') ||
    base.includes('.tmp.') ||
    base.endsWith('.bak') ||
    base.endsWith('~') ||
    base.startsWith('.#')
  );
}

function createLiveWatchHub(config, stateCache) {
  const clients = new Set();
  const watchers = [];
  let debounceTimer = null;
  let suppressFsUntil = 0;
  let pendingConfig = false;
  const pendingChannels = new Set();
  const pendingPaths = new Set();
  const boardApiSnapshots = new Map();
  let boardApiDirTouchedAt = 0;

  const markApiWrite = (ms = 450) => { suppressFsUntil = Math.max(suppressFsUntil, Date.now() + ms); };
  const markBoardDirTouch = () => { boardApiDirTouchedAt = Date.now(); };
  const markBoardWrite = (channel, relPath, exists, fileHash = null) => {
    boardApiSnapshots.set(`${channel}:${relPath}`, {
      exists: Boolean(exists),
      hash: fileHash,
      expiresAt: Date.now() + 1500,
    });
  };

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
    if (!snap.exists) return !existsNow;
    if (!existsNow) {
      boardApiSnapshots.delete(key);
      return false;
    }
    try {
      const diskHash = crypto.createHash('sha256').update(fs.readFileSync(abs, 'utf8'), 'utf8').digest('hex');
      if (diskHash === snap.hash) return true;
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
        const { port, host, dataDir, webDir, disableDiskBundles } = config;
        Object.assign(config, reloaded, {
          port,
          host,
          ...(dataDir ? { dataDir } : {}),
          ...(webDir ? { webDir } : {}),
          ...(disableDiskBundles !== undefined ? { disableDiskBundles } : {}),
        });
        rebuildWatchers();
        stateCache.refreshAll({ flushDisk: true });
      } else if (changedChannels.length > 0 && changedChannels.every((k) => config.channels?.[k])) {
        for (const chKey of changedChannels) stateCache.refreshChannel(chKey, { flushDisk: true });
      } else {
        stateCache.refreshAll({ flushDisk: true });
      }

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
    if (typeof debounceTimer.unref === 'function') debounceTimer.unref();
  }

  function closeWatchers() {
    while (watchers.length) {
      try {
        watchers.pop().close();
      } catch {
        // ignora
      }
    }
  }

  function attachWorkspaceWatcher(chKey, wsPath) {
    if (!wsPath || !fs.existsSync(wsPath)) return;
    const onFsEvent = (_eventType, filename) => {
      const rel = String(filename || '').replace(/\\/g, '/');
      if (!rel) return scheduleFsFlush({ channel: chKey, filePath: '*' });
      const base = path.basename(rel);
      if (isIgnoredWatchPath(rel, base)) return;
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
      req.on('close', () => clients.delete(res));
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
  const stateCache = createStateCache(config, { serverMode: true });
  stateCache.init({ flushDisk: false });

  const watchHub = createLiveWatchHub(config, stateCache);
  let requestHandler = null;
  const remoteManager = createRemoteAccessManager({
    config,
    getRequestHandler: () => requestHandler,
    onStatusChange: () => {
      watchHub.broadcast({ type: 'change', source: 'api', reason: 'remote-status', ts: Date.now() });
    },
  });

  requestHandler = async (req, res) => {
    const urlObj = new URL(req.url || '/', `http://${config.host}:${config.port}`);
    const pathname = urlObj.pathname;

    try {
      if (!remoteManager.enforceRemotePin(req, res, pathname)) {
        return;
      }

      if (req.method === 'GET' && pathname === '/api/events') {
        return watchHub.handleSse(req, res);
      }

      if (MUTATING_METHODS.has(req.method)) {
        const lanHosts = discoverLanIpv4Addresses().flatMap((iface) => [
          iface.address,
          `${iface.address}:${config.port}`,
        ]);
        verifySameOriginMutation(req, { allowedHosts: lanHosts });
      }

      const ctx = { req, res, urlObj, pathname, method: req.method, config, stateCache, watchHub, remoteManager };
      for (const routeHandler of ROUTE_HANDLERS) {
        if ((await routeHandler(ctx)) !== false) return;
      }

      if (req.method === 'GET' || req.method === 'HEAD') {
        return serveStatic(req.url || '/', res, req.method);
      }

      sendJson(res, 405, { error: 'Método não permitido' });
    } catch (err) {
      const status = err.statusCode || 500;
      if (!res.headersSent) {
        sendJson(res, status, {
          ok: false,
          error: err.message || 'Erro interno no servidor',
          ...(err.hint ? { hint: err.hint } : {}),
        });
      }
    }
  };

  const server = http.createServer(requestHandler);
  server.requestTimeout = 0; // Permite geração longa de TTS/RVC (10+ min) sem corte HTTP
  server.stateCache = stateCache;
  server.remoteManager = remoteManager;
  server.watchHub = watchHub;

  server.on('listening', () => {
    const addr = server.address();
    const actualPort = addr && typeof addr === 'object' ? addr.port : config.port;
    remoteManager.initOnListen(actualPort).catch(() => {});
  });

  server.on('close', () => {
    stateCache.close();
    watchHub.close();
    remoteManager.cleanupSync();
  });

  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const config = loadConfig(process.argv.slice(2));
  const server = createStudioServer(config);

  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    await server.stateCache.flushNow().catch(() => {});
    await server.remoteManager.shutdown().catch(() => {});
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 2000).unref();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  process.on('exit', () => {
    server.stateCache.close();
    server.remoteManager.cleanupSync();
  });

  server.listen(config.port, config.host, () => {
    console.log(`[Crom YouTube Studio] Servidor ativo em http://${config.host}:${config.port}`);
    console.log(`[Crom YouTube Studio] Canais configurados: ${config.channelOrder.join(', ')}`);
  });
}
