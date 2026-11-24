import fs from 'node:fs';
import path from 'node:path';
import {
  addPlaylistItem,
  createPlaylist,
  deleteCategory,
  deletePlaylist,
  importPlaylist,
  loadCuradoria,
  removePlaylistItem,
  updatePlaylist,
  updatePlaylistItem,
  upsertCategory,
  upsertVideoMeta,
} from '../catalog-curadoria.mjs';
import { DATA_DIR } from '../config.mjs';
import { slugify, syncYouTubeRss } from '../sync.mjs';
import { commitRevision } from '../versioning.mjs';
import {
  buildYamlFrontmatter,
  findUniqueDocRelPath,
  readJsonBody,
  resolveChannel,
  sendJson,
} from './http-utils.mjs';

function lookupCatalogVideoInfo(channelKey, workspaceReal, videoId) {
  const out = {};
  if (!videoId) return out;
  try {
    const curadoria = loadCuradoria(workspaceReal);
    const meta = curadoria.videoMeta?.[videoId];
    if (meta) Object.assign(out, meta);
    for (const pl of curadoria.playlists || []) {
      const found = (pl.items || []).find((it) => it && (it.videoId === videoId || it.id === videoId));
      if (found) {
        out.title = out.title || found.title;
        out.url = out.url || found.url;
        out.channelName = out.channelName || found.channelName;
        out.duration = out.duration || found.duration;
        break;
      }
    }
  } catch {
    // ignora
  }

  const cacheCandidates = [
    path.join(workspaceReal, '.studio-data', 'youtube-cache.json'),
    path.join(DATA_DIR, `${channelKey}-youtube-cache.json`),
  ];
  for (const cachePath of cacheCandidates) {
    try {
      if (!fs.existsSync(cachePath)) continue;
      const cache = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
      const found = (cache?.videos || []).find((v) => v && (v.videoId === videoId || v.id === videoId));
      if (found) {
        out.title = out.title || found.title;
        out.url = out.url || found.url;
        out.duration = out.duration || found.duration;
        break;
      }
    } catch {
      // ignora
    }
  }
  return out;
}

export async function handleCatalogRoutes({
  req,
  res,
  urlObj,
  pathname,
  method,
  config,
  stateCache,
  watchHub,
}) {
  if (method === 'POST' && pathname === '/api/sync-youtube') {
    const body = await readJsonBody(req).catch(() => ({}));
    const targetChannel = body.channel || urlObj.searchParams.get('channel') || 'all';
    watchHub.markApiWrite(900);
    const result = await syncYouTubeRss({
      serverMode: true,
      channel: targetChannel,
      config,
      writeDisk: false,
    });
    const normalizedTarget = String(targetChannel || 'all').trim().toLowerCase();
    const state =
      !normalizedTarget || normalizedTarget === 'all'
        ? stateCache.refreshAll({ flushDisk: true })
        : stateCache.refreshChannel(normalizedTarget, { flushDisk: true });
    watchHub.broadcast({
      type: 'change',
      source: 'api',
      reason: 'sync-youtube',
      channel: targetChannel,
      ts: Date.now(),
    });
    return sendJson(res, 200, { ...result, state });
  }

  if (method === 'GET' && pathname === '/api/curadoria') {
    const rawChannel = urlObj.searchParams.get('channel') || config.defaultChannel;
    const { key, workspaceReal } = resolveChannel(config, rawChannel);
    const curadoria = await loadCuradoria(workspaceReal);
    return sendJson(res, 200, { ok: true, channel: key, curadoria });
  }

  if (method === 'PUT' && pathname === '/api/curadoria/video') {
    const body = await readJsonBody(req);
    const rawChannel = body.channel || urlObj.searchParams.get('channel') || config.defaultChannel;
    const { key, workspaceReal } = resolveChannel(config, rawChannel);
    const videoId = body.videoId || body.id;
    const patch = body.patch && typeof body.patch === 'object' ? body.patch : body;
    watchHub.markApiWrite();
    const result = await upsertVideoMeta(workspaceReal, videoId, patch);
    const state = stateCache.refreshChannel(key, { flushDisk: true });
    watchHub.broadcast({
      type: 'change',
      source: 'api',
      reason: 'curadoria-video',
      channel: key,
      videoId,
      ts: Date.now(),
    });
    return sendJson(res, 200, { ok: true, channel: key, ...result, state });
  }

  if (method === 'POST' && pathname === '/api/curadoria/playlists') {
    const body = await readJsonBody(req);
    const rawChannel = body.channel || urlObj.searchParams.get('channel') || config.defaultChannel;
    const { key, workspaceReal } = resolveChannel(config, rawChannel);
    watchHub.markApiWrite();
    const shouldImport =
      body.mode === 'import' ||
      (body.mode !== 'manual' && Boolean(body.urlOrId || body.url));
    const result = shouldImport
      ? await importPlaylist(workspaceReal, {
          urlOrId: body.urlOrId || body.url || body.sourceUrl,
          title: body.title,
          kind: body.kind,
          description: body.description,
          color: body.color,
        })
      : await createPlaylist(workspaceReal, body);
    const state = stateCache.refreshChannel(key, { flushDisk: true });
    watchHub.broadcast({
      type: 'change',
      source: 'api',
      reason: 'curadoria-playlist-create',
      channel: key,
      playlistId: result.playlist?.id,
      ts: Date.now(),
    });
    return sendJson(res, 201, { ok: true, channel: key, ...result, state });
  }

  if (method === 'PUT' && pathname === '/api/curadoria/playlists') {
    const body = await readJsonBody(req);
    const rawChannel = body.channel || urlObj.searchParams.get('channel') || config.defaultChannel;
    const { key, workspaceReal } = resolveChannel(config, rawChannel);
    const playlistId =
      body.id || body.playlistId || urlObj.searchParams.get('id') || urlObj.searchParams.get('playlistId');
    const patch = body.patch && typeof body.patch === 'object' ? body.patch : body;
    watchHub.markApiWrite();
    const result = await updatePlaylist(workspaceReal, playlistId, patch);
    const state = stateCache.refreshChannel(key, { flushDisk: true });
    watchHub.broadcast({
      type: 'change',
      source: 'api',
      reason: 'curadoria-playlist-update',
      channel: key,
      playlistId,
      ts: Date.now(),
    });
    return sendJson(res, 200, { ok: true, channel: key, ...result, state });
  }

  if (method === 'DELETE' && pathname === '/api/curadoria/playlists') {
    let playlistId = urlObj.searchParams.get('id') || urlObj.searchParams.get('playlistId');
    let rawChannel = urlObj.searchParams.get('channel');
    if (!playlistId || !rawChannel) {
      const body = await readJsonBody(req).catch(() => ({}));
      if (!playlistId) playlistId = body.id || body.playlistId;
      if (!rawChannel) rawChannel = body.channel;
    }
    const { key, workspaceReal } = resolveChannel(config, rawChannel || config.defaultChannel);
    watchHub.markApiWrite();
    const result = await deletePlaylist(workspaceReal, playlistId);
    const state = stateCache.refreshChannel(key, { flushDisk: true });
    watchHub.broadcast({
      type: 'change',
      source: 'api',
      reason: 'curadoria-playlist-delete',
      channel: key,
      playlistId,
      ts: Date.now(),
    });
    return sendJson(res, 200, { ok: true, channel: key, ...result, state });
  }

  if (method === 'POST' && pathname === '/api/curadoria/playlists/item') {
    const body = await readJsonBody(req);
    const rawChannel = body.channel || urlObj.searchParams.get('channel') || config.defaultChannel;
    const { key, workspaceReal } = resolveChannel(config, rawChannel);
    const playlistId = body.playlistId || body.id;
    const rawSourceInput = body.itemOrUrl ?? body.item ?? body.video;
    const itemOrUrl =
      rawSourceInput !== undefined
        ? rawSourceInput
        : body.urlOrId && typeof body.urlOrId === 'string' && !body.url && !body.title && !body.notes
        ? body.urlOrId
        : {
            ...body,
            url: body.url || body.urlOrId || '',
          };
    watchHub.markApiWrite();
    const result = await addPlaylistItem(workspaceReal, playlistId, itemOrUrl);
    const state = stateCache.refreshChannel(key, { flushDisk: true });
    watchHub.broadcast({
      type: 'change',
      source: 'api',
      reason: 'curadoria-playlist-item-add',
      channel: key,
      playlistId,
      ts: Date.now(),
    });
    return sendJson(res, 201, { ok: true, channel: key, ...result, state });
  }

  if (method === 'PUT' && pathname === '/api/curadoria/playlists/item') {
    const body = await readJsonBody(req);
    const rawChannel = body.channel || urlObj.searchParams.get('channel') || config.defaultChannel;
    const { key, workspaceReal } = resolveChannel(config, rawChannel);
    const playlistId = body.playlistId || body.id;
    const videoId = body.videoId;
    const patch = body.patch && typeof body.patch === 'object' ? body.patch : body;
    watchHub.markApiWrite();
    const result = await updatePlaylistItem(workspaceReal, playlistId, videoId, patch);
    const state = stateCache.refreshChannel(key, { flushDisk: true });
    watchHub.broadcast({
      type: 'change',
      source: 'api',
      reason: 'curadoria-playlist-item-update',
      channel: key,
      playlistId,
      videoId,
      ts: Date.now(),
    });
    return sendJson(res, 200, { ok: true, channel: key, ...result, state });
  }

  if (method === 'DELETE' && pathname === '/api/curadoria/playlists/item') {
    let playlistId = urlObj.searchParams.get('playlistId') || urlObj.searchParams.get('id');
    let videoId = urlObj.searchParams.get('videoId');
    let rawChannel = urlObj.searchParams.get('channel');
    if (!playlistId || !videoId || !rawChannel) {
      const body = await readJsonBody(req).catch(() => ({}));
      if (!playlistId) playlistId = body.playlistId || body.id;
      if (!videoId) videoId = body.videoId;
      if (!rawChannel) rawChannel = body.channel;
    }
    const { key, workspaceReal } = resolveChannel(config, rawChannel || config.defaultChannel);
    watchHub.markApiWrite();
    const result = await removePlaylistItem(workspaceReal, playlistId, videoId);
    const state = stateCache.refreshChannel(key, { flushDisk: true });
    watchHub.broadcast({
      type: 'change',
      source: 'api',
      reason: 'curadoria-playlist-item-remove',
      channel: key,
      playlistId,
      videoId,
      ts: Date.now(),
    });
    return sendJson(res, 200, { ok: true, channel: key, ...result, state });
  }

  if (method === 'POST' && pathname === '/api/curadoria/categories') {
    const body = await readJsonBody(req);
    const rawChannel = body.channel || urlObj.searchParams.get('channel') || config.defaultChannel;
    const { key, workspaceReal } = resolveChannel(config, rawChannel);
    watchHub.markApiWrite();
    const result = await upsertCategory(workspaceReal, body);
    const state = stateCache.refreshChannel(key, { flushDisk: true });
    watchHub.broadcast({
      type: 'change',
      source: 'api',
      reason: 'curadoria-category',
      channel: key,
      ts: Date.now(),
    });
    return sendJson(res, 200, { ok: true, channel: key, ...result, state });
  }

  if (method === 'DELETE' && pathname === '/api/curadoria/categories') {
    let categoryId = urlObj.searchParams.get('id') || urlObj.searchParams.get('categoryId');
    let rawChannel = urlObj.searchParams.get('channel');
    if (!categoryId || !rawChannel) {
      const body = await readJsonBody(req).catch(() => ({}));
      if (!categoryId) categoryId = body.id || body.categoryId;
      if (!rawChannel) rawChannel = body.channel;
    }
    const { key, workspaceReal } = resolveChannel(config, rawChannel || config.defaultChannel);
    watchHub.markApiWrite();
    const result = await deleteCategory(workspaceReal, categoryId);
    const state = stateCache.refreshChannel(key, { flushDisk: true });
    watchHub.broadcast({
      type: 'change',
      source: 'api',
      reason: 'curadoria-category-delete',
      channel: key,
      ts: Date.now(),
    });
    return sendJson(res, 200, { ok: true, channel: key, ...result, state });
  }

  if (method === 'POST' && pathname === '/api/curadoria/create-script') {
    const body = await readJsonBody(req);
    const rawChannel = body.channel || urlObj.searchParams.get('channel') || config.defaultChannel;
    const { key, cfg, workspaceReal } = resolveChannel(config, rawChannel);
    const videoId = String(body.videoId || '').trim();
    const cached = lookupCatalogVideoInfo(key, workspaceReal, videoId);

    const title = String(
      body.title || cached.title || (videoId ? `Reavaliar ${videoId}` : 'Roteiro de Curadoria')
    ).trim();
    const videoUrl = String(
      body.url || body.videoUrl || cached.url || (videoId ? `https://www.youtube.com/watch?v=${videoId}` : '')
    ).trim();
    const channelName = String(body.channelName || cached.channelName || '').trim();
    const notesText = String(body.notes ?? cached.notes ?? '').trim();
    const serie = String(body.serie || 'Reavaliar').trim() || 'Reavaliar';
    const folderRel = String(body.folder || '02-roteiros/rascunhos').trim() || '02-roteiros/rascunhos';
    const todayIso = new Date().toISOString().slice(0, 10);
    const ymPrefix = todayIso.slice(0, 7);

    const target = findUniqueDocRelPath(config, key, folderRel, `${ymPrefix}-${title}`);
    const docId = `${ymPrefix}-${slugify(title)}`.slice(0, 80);
    const tags =
      Array.isArray(body.tags) && body.tags.length
        ? body.tags.map((t) => String(t).trim()).filter(Boolean)
        : [slugify(serie), 'curadoria', ...(Array.isArray(cached.tags) ? cached.tags : [])];

    const frontmatter = buildYamlFrontmatter({
      id: docId,
      titulo: title,
      tipo: body.tipo || 'roteiro',
      status: body.status || 'roteiro',
      serie,
      formato: body.formato || 'long',
      prioridade: body.prioridade || 'media',
      duracao_estimada: body.duracao_estimada || '10 min',
      data_criacao: todayIso,
      data_alvo: '',
      repo_github: cfg.links?.github ? 'MrJc01' : '',
      youtube_id: '',
      views: 0,
      tags: Array.from(new Set(tags)),
      resumo: body.resumo || `Roteiro criado a partir da curadoria de ${title}.`,
    });

    const bodyLines = [
      frontmatter,
      '',
      `# ${title}`,
      '',
      '## Referência Original',
      '',
      videoUrl ? `- **Vídeo fonte:** ${videoUrl}` : '- **Vídeo fonte:** (não informado)',
      ...(channelName ? [`- **Canal:** ${channelName}`] : []),
      ...(videoId ? [`- **ID YouTube:** \`${videoId}\``] : []),
      '',
      '## Notas de Curadoria',
      '',
      notesText || '_Adicione suas observações e pontos principais aqui._',
      '',
      '## Estrutura do Roteiro',
      '',
      '[GANCHO]',
      '- Qual é o ponto central ou pergunta que abre o vídeo?',
      '',
      '[TELA]',
      '- Mostrar trecho/ponto de referência com análise crítica (sem react vazio).',
      '',
      '[B-ROLL]',
      '- Evidências, documentação ou comparação prática.',
      '',
      '## Checklist de Produção',
      '',
      '- [ ] Definir tese principal da análise',
      '- [ ] Revisar ganchos e título',
      '- [ ] Gravar narração/tela',
      '',
    ];

    watchHub.markApiWrite();
    const verRes = commitRevision(target.workspaceReal, target.rel, {
      content: bodyLines.join('\n'),
      version: 'principal',
      message: 'Roteiro gerado a partir da Curadoria',
      author: body.author || 'MrJ',
      kind: 'init',
    });

    if (videoId) {
      const nextStatus = body.videoStatus || 'roteirizado';
      const metaRes = await upsertVideoMeta(workspaceReal, videoId, {
        linkedDocPath: target.rel,
        status: nextStatus,
      });
      const cleanVid = metaRes.videoId || videoId;
      const curadoriaAfter = await loadCuradoria(workspaceReal);
      for (const pl of curadoriaAfter.playlists || []) {
        if (body.playlistId && pl.id !== body.playlistId) continue;
        if ((pl.items || []).some((it) => it.videoId === cleanVid || it.id === cleanVid)) {
          try {
            await updatePlaylistItem(workspaceReal, pl.id, cleanVid, {
              linkedDocPath: target.rel,
              status: nextStatus,
            });
          } catch {
            // ignora se item não existir nesta playlist
          }
        }
      }
    }

    const state = stateCache.refreshChannel(key, { flushDisk: true });
    watchHub.broadcast({
      type: 'change',
      source: 'api',
      reason: 'curadoria-create-script',
      channel: key,
      path: target.rel,
      ts: Date.now(),
    });

    return sendJson(res, 201, {
      ok: true,
      channel: key,
      docPath: target.rel,
      path: target.rel,
      revision: verRes.revision,
      state,
    });
  }

  return false;
}
