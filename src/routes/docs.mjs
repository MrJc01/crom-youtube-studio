import fs from 'node:fs';
import path from 'node:path';
import { upsertRestoredPlaylist } from '../catalog-curadoria.mjs';
import {
  listTrash,
  moveToTrash,
  purgeAllTrash,
  purgeTrashItem,
  restoreFromTrash,
} from '../lib/trash.mjs';
import { upsertRestoredNote } from '../notes.mjs';
import { slugify } from '../sync.mjs';
import {
  commitRevision,
  createVersion,
  deleteDocHistory,
  deleteVersion,
  diffTargets,
  getHistory,
  migrateDocHistory,
  promoteVersion,
  readRefContent,
  restoreRevision,
} from '../versioning.mjs';
import {
  PROTECTED_FILES,
  extractDocTitle,
  readJsonBody,
  resolveChannel,
  resolveSafeFolder,
  resolveSafeMdPath,
  sendJson,
} from './http-utils.mjs';

export async function handleDocsRoutes({
  req,
  res,
  urlObj,
  pathname,
  method,
  config,
  stateCache,
  watchHub,
}) {
  if (method === 'POST' && pathname === '/api/doc') {
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
    const state = stateCache.refreshChannel(target.channel, { flushDisk: true });
    watchHub.broadcast({
      type: 'change',
      source: 'api',
      reason: 'doc-create',
      channel: target.channel,
      path: target.rel,
      ts: Date.now(),
    });
    return sendJson(res, 201, {
      ok: true,
      channel: target.channel,
      path: target.rel,
      revision: verRes.revision,
      state,
    });
  }

  if (method === 'PUT' && pathname === '/api/doc') {
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

    const state = stateCache.refreshChannel(target.channel, { flushDisk: true });
    watchHub.broadcast({
      type: 'change',
      source: 'api',
      reason: 'doc-save',
      channel: target.channel,
      path: target.rel,
      ts: Date.now(),
    });
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

  if (method === 'DELETE' && pathname === '/api/doc') {
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
    const content = fs.readFileSync(target.abs, 'utf8');
    const title = extractDocTitle(content, target.rel);
    const trashed = await moveToTrash(target.workspaceReal, {
      kind: 'doc',
      originalPath: target.rel,
      title,
      sourceAbsPath: target.abs,
      content,
      metadata: {
        channel: target.channel,
        relPath: target.rel,
      },
    });
    if (fs.existsSync(target.abs)) {
      fs.unlinkSync(target.abs);
    }
    deleteDocHistory(target.workspaceReal, target.rel);

    const state = stateCache.refreshChannel(target.channel, { flushDisk: true });
    watchHub.broadcast({
      type: 'change',
      source: 'api',
      reason: 'doc-delete',
      channel: target.channel,
      path: target.rel,
      ts: Date.now(),
    });
    return sendJson(res, 200, {
      ok: true,
      channel: target.channel,
      deleted: target.rel,
      trashed,
      state,
    });
  }

  if (method === 'GET' && pathname === '/api/versions') {
    const rawChannel = urlObj.searchParams.get('channel') || config.defaultChannel;
    const relPath = urlObj.searchParams.get('path');
    const target = resolveSafeMdPath(config, rawChannel, relPath);
    const history = getHistory(target.workspaceReal, target.rel);
    return sendJson(res, 200, { ok: true, channel: target.channel, ...history });
  }

  if (method === 'GET' && pathname === '/api/versions/content') {
    const rawChannel = urlObj.searchParams.get('channel') || config.defaultChannel;
    const relPath = urlObj.searchParams.get('path');
    const ref = urlObj.searchParams.get('ref') || 'ver:principal';
    const target = resolveSafeMdPath(config, rawChannel, relPath);
    const data = readRefContent(target.workspaceReal, target.rel, ref);
    return sendJson(res, 200, { ok: true, channel: target.channel, path: target.rel, ...data });
  }

  if (method === 'GET' && pathname === '/api/versions/diff') {
    const rawChannel = urlObj.searchParams.get('channel') || config.defaultChannel;
    const relPath = urlObj.searchParams.get('path');
    const from = urlObj.searchParams.get('from') || 'ver:principal';
    const to = urlObj.searchParams.get('to') || 'disk';
    const target = resolveSafeMdPath(config, rawChannel, relPath);
    const diff = diffTargets(target.workspaceReal, target.rel, { from, to });
    return sendJson(res, 200, { ok: true, channel: target.channel, path: target.rel, ...diff });
  }

  if (method === 'POST' && pathname === '/api/versions/commit') {
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
    const state = stateCache.refreshChannel(target.channel, { flushDisk: true });
    watchHub.broadcast({
      type: 'change',
      source: 'api',
      reason: 'version-commit',
      channel: target.channel,
      path: target.rel,
      ts: Date.now(),
    });
    return sendJson(res, 200, { ...result, channel: target.channel, path: target.rel, state });
  }

  if (method === 'POST' && pathname === '/api/versions/create') {
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
    const state = stateCache.refreshChannel(target.channel, { flushDisk: true });
    watchHub.broadcast({
      type: 'change',
      source: 'api',
      reason: 'version-create',
      channel: target.channel,
      path: target.rel,
      ts: Date.now(),
    });
    return sendJson(res, 201, { ...result, channel: target.channel, path: target.rel, state });
  }

  if (method === 'POST' && pathname === '/api/versions/restore') {
    const body = await readJsonBody(req);
    const target = resolveSafeMdPath(config, body.channel || config.defaultChannel, body.path);
    watchHub.markApiWrite();
    const result = restoreRevision(target.workspaceReal, target.rel, {
      revId: body.revId,
      targetVersion: body.targetVersion || 'principal',
      author: body.author || 'MrJ',
      message: body.message || '',
    });
    const state = stateCache.refreshChannel(target.channel, { flushDisk: true });
    watchHub.broadcast({
      type: 'change',
      source: 'api',
      reason: 'version-restore',
      channel: target.channel,
      path: target.rel,
      ts: Date.now(),
    });
    return sendJson(res, 200, { ...result, channel: target.channel, path: target.rel, state });
  }

  if (method === 'POST' && pathname === '/api/versions/promote') {
    const body = await readJsonBody(req);
    const target = resolveSafeMdPath(config, body.channel || config.defaultChannel, body.path);
    watchHub.markApiWrite();
    const result = promoteVersion(target.workspaceReal, target.rel, {
      versionName: body.versionName,
      author: body.author || 'MrJ',
      message: body.message || '',
    });
    const state = stateCache.refreshChannel(target.channel, { flushDisk: true });
    watchHub.broadcast({
      type: 'change',
      source: 'api',
      reason: 'version-promote',
      channel: target.channel,
      path: target.rel,
      ts: Date.now(),
    });
    return sendJson(res, 200, { ...result, channel: target.channel, path: target.rel, state });
  }

  if (method === 'DELETE' && pathname === '/api/versions') {
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
    const state = stateCache.refreshChannel(target.channel, { flushDisk: true });
    watchHub.broadcast({
      type: 'change',
      source: 'api',
      reason: 'version-delete',
      channel: target.channel,
      path: target.rel,
      ts: Date.now(),
    });
    return sendJson(res, 200, { ...result, channel: target.channel, path: target.rel, state });
  }

  // ======================== LIXEIRA RECUPERÁVEL (30 DIAS) ========================

  if (method === 'GET' && pathname === '/api/trash') {
    const rawChannel = urlObj.searchParams.get('channel') || config.defaultChannel;
    const { key, workspaceReal } = resolveChannel(config, rawChannel);
    const trashData = await listTrash(workspaceReal);
    return sendJson(res, 200, { ok: true, channel: key, ...trashData });
  }

  if (method === 'POST' && pathname === '/api/trash/restore') {
    const body = await readJsonBody(req);
    const rawChannel = body.channel || urlObj.searchParams.get('channel') || config.defaultChannel;
    const trashId = body.id || body.trashId || urlObj.searchParams.get('id');
    const { key, workspaceReal } = resolveChannel(config, rawChannel);

    watchHub.markApiWrite();
    const restored = await restoreFromTrash(workspaceReal, trashId, {
      onRestoreNote: (payload) => upsertRestoredNote(workspaceReal, payload),
      onRestorePlaylist: (payload) => upsertRestoredPlaylist(workspaceReal, payload),
    });

    const state = stateCache.refreshChannel(key, { flushDisk: true });
    watchHub.broadcast({
      type: 'change',
      source: 'api',
      reason: 'trash-restore',
      channel: key,
      id: trashId,
      ts: Date.now(),
    });
    return sendJson(res, 200, { ok: true, channel: key, restored, state });
  }

  if (method === 'DELETE' && pathname === '/api/trash') {
    let rawChannel = urlObj.searchParams.get('channel');
    let trashId = urlObj.searchParams.get('id') || urlObj.searchParams.get('trashId');
    let allParam = urlObj.searchParams.get('all');

    if (!rawChannel || (!trashId && !allParam)) {
      const body = await readJsonBody(req).catch(() => ({}));
      if (!rawChannel) rawChannel = body.channel;
      if (!trashId) trashId = body.id || body.trashId;
      if (allParam === null || allParam === undefined) allParam = body.all;
    }

    const { key, workspaceReal } = resolveChannel(config, rawChannel || config.defaultChannel);
    const purgeAll =
      allParam === true ||
      String(allParam || '').toLowerCase() === '1' ||
      String(allParam || '').toLowerCase() === 'true';

    watchHub.markApiWrite();
    const result = purgeAll
      ? await purgeAllTrash(workspaceReal)
      : await purgeTrashItem(workspaceReal, trashId);

    const state = stateCache.refreshChannel(key, { flushDisk: true });
    watchHub.broadcast({
      type: 'change',
      source: 'api',
      reason: 'trash-purge',
      channel: key,
      ts: Date.now(),
    });
    return sendJson(res, 200, { ok: true, channel: key, ...result, state });
  }

  return false;
}
