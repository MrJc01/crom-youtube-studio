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
import { readJsonBody, sendJson } from './http-utils.mjs';

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
