import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  addChannelToConfig,
  getEditableConfig,
  removeChannelFromConfig,
  saveConfigUpdates,
} from '../config.mjs';
import { createBackupArchive } from '../lib/backup.mjs';
import { runDoctor } from '../lib/doctor.mjs';
import { MIME_TYPES, readJsonBody, resolveChannel, sendJson } from './http-utils.mjs';

function cleanupTempArchive(archivePath) {
  if (!archivePath || typeof archivePath !== 'string') return;
  try {
    fs.rmSync(archivePath, { force: true });
    const parent = path.dirname(archivePath);
    const tmpRoot = path.resolve(os.tmpdir());
    if (
      parent !== tmpRoot &&
      parent.startsWith(tmpRoot + path.sep) &&
      path.basename(parent).startsWith('crom-studio-backup')
    ) {
      fs.rmSync(parent, { recursive: true, force: true });
    }
  } catch {
    // Ignora falha de limpeza temporária
  }
}

export async function handleConfigRoutes({
  req,
  res,
  urlObj,
  pathname,
  method,
  config,
  stateCache,
  watchHub,
}) {
  if (method === 'GET' && pathname === '/api/health') {
    return sendJson(
      res,
      200,
      {
        ok: true,
        port: config.port,
        host: config.host,
        defaultChannel: config.defaultChannel,
        channels: config.channelOrder,
      },
      { 'Access-Control-Allow-Origin': '*' }
    );
  }

  if (method === 'GET' && pathname === '/api/state') {
    const forceRefresh = urlObj.searchParams.get('refresh') === '1';
    const state = forceRefresh
      ? stateCache.refreshAll({ flushDisk: true })
      : stateCache.getState();
    return sendJson(res, 200, state);
  }

  if (method === 'POST' && pathname === '/api/sync') {
    watchHub.markApiWrite();
    const state = stateCache.refreshAll({ flushDisk: false });
    await stateCache.flushNow();
    watchHub.broadcast({ type: 'change', source: 'api', reason: 'sync', ts: Date.now() });
    return sendJson(res, 200, { ok: true, state });
  }

  if (method === 'GET' && pathname === '/api/config') {
    return sendJson(res, 200, { ok: true, config: getEditableConfig(config) });
  }

  if (method === 'PUT' && pathname === '/api/config') {
    const body = await readJsonBody(req);
    watchHub.markApiWrite();
    const { restartRequired } = saveConfigUpdates(config, body);
    watchHub.rebuildWatchers();
    const state = stateCache.refreshAll({ flushDisk: true });
    watchHub.broadcast({ type: 'change', source: 'api', reason: 'config', ts: Date.now() });
    return sendJson(res, 200, {
      ok: true,
      restartRequired,
      config: getEditableConfig(config),
      state,
    });
  }

  if (method === 'POST' && pathname === '/api/config/channels') {
    const body = await readJsonBody(req);
    watchHub.markApiWrite();
    const { channelKey } = addChannelToConfig(config, body);
    watchHub.rebuildWatchers();
    const state = stateCache.refreshAll({ flushDisk: true });
    watchHub.broadcast({
      type: 'change',
      source: 'api',
      reason: 'channel-add',
      channel: channelKey,
      ts: Date.now(),
    });
    return sendJson(res, 201, {
      ok: true,
      channelKey,
      config: getEditableConfig(config),
      state,
    });
  }

  if (method === 'DELETE' && pathname === '/api/config/channels') {
    let keyParam = urlObj.searchParams.get('key');
    if (!keyParam) {
      const body = await readJsonBody(req).catch(() => ({}));
      keyParam = body.key || body.channelKey;
    }
    watchHub.markApiWrite();
    const { removedKey } = removeChannelFromConfig(config, keyParam);
    watchHub.rebuildWatchers();
    const state = stateCache.refreshAll({ flushDisk: true });
    watchHub.broadcast({
      type: 'change',
      source: 'api',
      reason: 'channel-remove',
      channel: removedKey,
      ts: Date.now(),
    });
    return sendJson(res, 200, {
      ok: true,
      removedKey,
      config: getEditableConfig(config),
      state,
    });
  }

  if (method === 'GET' && pathname === '/api/doctor') {
    const report = await runDoctor(config);
    return sendJson(res, 200, report);
  }

  if ((method === 'GET' || method === 'HEAD') && pathname === '/api/kdenlive/media') {
    if (!config.kdenliveRoot || !fs.existsSync(config.kdenliveRoot)) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(method === 'HEAD' ? undefined : 'Pasta Kdenlive não encontrada');
      return true;
    }
    const rawChannel = urlObj.searchParams.get('channel') || urlObj.searchParams.get('canal') || config.defaultChannel;
    const { cfg } = resolveChannel(config, rawChannel);
    const videoSlug = String(urlObj.searchParams.get('video') || '').trim();
    const relPath = String(urlObj.searchParams.get('path') || '').replace(/\\/g, '/').replace(/^\/+/, '').trim();
    const validSeg = (s) => s && s !== '.' && s !== '..' && !s.startsWith('.') && !s.includes('\0');
    if (!validSeg(videoSlug) || videoSlug.includes('/') || !relPath || !relPath.split('/').every(validSeg)) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(method === 'HEAD' ? undefined : 'Caminho inválido');
      return true;
    }
    const kdenliveReal = fs.realpathSync(config.kdenliveRoot);
    const folderParts = String(cfg?.kdenliveFolder || 'videos').split('/').filter(Boolean);
    const videoRoot = path.resolve(kdenliveReal, ...folderParts, videoSlug);
    if (!videoRoot.startsWith(kdenliveReal + path.sep) || !fs.existsSync(videoRoot)) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(method === 'HEAD' ? undefined : 'Projeto de vídeo não encontrado');
      return true;
    }
    const videoRootReal = fs.realpathSync(videoRoot);
    const abs = path.resolve(videoRootReal, relPath);
    if (!abs.startsWith(videoRootReal + path.sep) || !fs.existsSync(abs)) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(method === 'HEAD' ? undefined : 'Mídia não encontrada');
      return true;
    }
    const st = fs.lstatSync(abs);
    if (st.isSymbolicLink() || !st.isFile()) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(method === 'HEAD' ? undefined : 'Acesso negado');
      return true;
    }
    const ext = path.extname(abs).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    const rangeHeader = String(req.headers.range || '');
    if (rangeHeader && /^bytes=\d*-\d*$/.test(rangeHeader)) {
      const [sRaw, eRaw] = rangeHeader.replace(/^bytes=/, '').split('-');
      const start = sRaw ? Number(sRaw) : 0;
      const end = eRaw ? Math.min(st.size - 1, Number(eRaw)) : st.size - 1;
      if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= st.size) {
        res.writeHead(416, { 'Content-Range': `bytes */${st.size}` });
        res.end();
        return true;
      }
      res.writeHead(206, {
        'Content-Type': contentType,
        'Content-Range': `bytes ${start}-${end}/${st.size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': end - start + 1,
        'Cache-Control': 'no-cache',
      });
      if (method === 'HEAD') { res.end(); return true; }
      fs.createReadStream(abs, { start, end }).pipe(res);
      return true;
    }
    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': st.size,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-cache',
    });
    if (method === 'HEAD') { res.end(); return true; }
    fs.createReadStream(abs).pipe(res);
    return true;
  }

  if (method === 'GET' && pathname === '/api/backup/download') {
    const channel = urlObj.searchParams.get('channel') || 'all';
    const rawInclude = String(urlObj.searchParams.get('includeRecordings') || '').toLowerCase();
    const includeRecordings = rawInclude === '1' || rawInclude === 'true' || rawInclude === 'yes';

    const backup = await createBackupArchive(config, {
      channel,
      includeRecordings,
    });

    const archivePath = backup?.archivePath;
    if (!archivePath || !fs.existsSync(archivePath)) {
      cleanupTempArchive(archivePath);
      throw Object.assign(new Error('Falha ao gerar arquivo de backup'), { statusCode: 500 });
    }

    const stat = fs.statSync(archivePath);
    const safeFileName = path.basename(backup.fileName || archivePath).replace(/[^a-zA-Z0-9._-]/g, '_');

    let cleaned = false;
    const cleanupOnce = () => {
      if (cleaned) return;
      cleaned = true;
      cleanupTempArchive(archivePath);
    };

    try {
      await new Promise((resolve, reject) => {
        res.writeHead(200, {
          'Content-Type': 'application/gzip',
          'Content-Disposition': `attachment; filename="${safeFileName}"`,
          'Content-Length': stat.size,
          'Cache-Control': 'no-store',
        });

        const stream = fs.createReadStream(archivePath);
        stream.on('error', (err) => {
          cleanupOnce();
          if (!res.headersSent) {
            reject(err);
          } else {
            res.destroy(err);
            resolve();
          }
        });
        res.on('close', () => {
          stream.destroy();
          cleanupOnce();
          resolve();
        });
        res.on('finish', () => {
          cleanupOnce();
          resolve();
        });
        stream.pipe(res);
      });
    } finally {
      cleanupOnce();
    }
    return true;
  }

  return false;
}
