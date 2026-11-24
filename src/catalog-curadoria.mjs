import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  extractVideoId,
  fetchYouTubePlaylist,
  fetchYouTubeVideoMeta,
} from './youtube-scraper.mjs';
import { readJsonSafe, writeJsonAtomic, withFileLock } from './lib/storage.mjs';
import { moveToTrash } from './lib/trash.mjs';

export const STUDIO_DATA_DIR = '.studio-data';
export const CURADORIA_FILE_NAME = 'curadoria.json';

export const DEFAULT_CATEGORIES = [
  { id: 'reagir', name: 'Reagir', color: '#f43f5e', icon: '🎬', builtIn: true },
  { id: 'inspiracao', name: 'Inspiração', color: '#8b5cf6', icon: '✨', builtIn: true },
  { id: 'referencia', name: 'Referência Técnica', color: '#06b6d4', icon: '⚙️', builtIn: true },
  { id: 'estudo', name: 'Estudo', color: '#f59e0b', icon: '📚', builtIn: true },
  { id: 'thumb-hook', name: 'Thumb & Hook', color: '#22c55e', icon: '🎯', builtIn: true },
];

export const VALID_VIDEO_STATUSES = new Set([
  'pendente',
  'assistido',
  'reagir',
  'roteirizado',
  'arquivado',
]);

function httpError(message, statusCode) {
  return Object.assign(new Error(message), { statusCode });
}

function slugify(text) {
  return (
    String(text || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '') || ''
  );
}

function defaultCategoriesCopy() {
  return DEFAULT_CATEGORIES.map((c) => ({ ...c }));
}

function resolveCuradoriaFile(wsPath, { ensureDir = false } = {}) {
  if (!wsPath || typeof wsPath !== 'string' || !fs.existsSync(wsPath)) {
    throw httpError('Workspace do canal não encontrado', 404);
  }
  const rootReal = fs.realpathSync(wsPath);
  const dataDir = path.join(rootReal, STUDIO_DATA_DIR);

  if (fs.existsSync(dataDir)) {
    const st = fs.lstatSync(dataDir);
    if (st.isSymbolicLink() || !st.isDirectory()) {
      throw httpError('Diretório .studio-data inválido ou symlink proibido', 403);
    }
    const dirReal = fs.realpathSync(dataDir);
    if (!dirReal.startsWith(rootReal + path.sep)) {
      throw httpError('Diretório .studio-data fora do workspace', 403);
    }
  } else if (ensureDir) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const filePath = path.join(dataDir, CURADORIA_FILE_NAME);
  if (fs.existsSync(filePath)) {
    const fst = fs.lstatSync(filePath);
    if (fst.isSymbolicLink() || !fst.isFile()) {
      throw httpError('Arquivo curadoria.json inválido ou symlink proibido', 403);
    }
  }
  return { rootReal, dataDir, filePath };
}

function normalizeTags(rawTags) {
  let list = [];
  if (Array.isArray(rawTags)) {
    list = rawTags;
  } else if (typeof rawTags === 'string') {
    list = rawTags.split(',');
  }
  const seen = new Set();
  const out = [];
  for (const item of list) {
    const clean = String(item || '').trim();
    if (clean && !seen.has(clean)) {
      seen.add(clean);
      out.push(clean);
    }
  }
  return out;
}

function normalizeStatus(rawStatus, fallback = 'pendente') {
  if (rawStatus === undefined || rawStatus === null || rawStatus === '') {
    return fallback;
  }
  const clean = String(rawStatus).trim().toLowerCase();
  if (!VALID_VIDEO_STATUSES.has(clean)) {
    throw httpError(
      `Status inválido: "${rawStatus}". Valores aceitos: ${Array.from(VALID_VIDEO_STATUSES).join(', ')}`,
      400
    );
  }
  return clean;
}

function normalizeVideoId(rawId) {
  if (rawId === undefined || rawId === null) {
    throw httpError('videoId ausente', 400);
  }
  const str = String(rawId).trim();
  if (!str) {
    throw httpError('videoId ausente', 400);
  }
  const extracted = extractVideoId(str);
  if (extracted.videoId) return extracted.videoId;
  if (
    str.includes('\0') ||
    str.includes('/') ||
    str.includes('\\') ||
    str.includes('..')
  ) {
    throw httpError('videoId inválido', 400);
  }
  return str;
}

function normalizeCategory(cat) {
  if (!cat || typeof cat !== 'object') return null;
  const id = slugify(cat.id || cat.name || '');
  const name = String(cat.name || '').trim();
  if (!id || !name) return null;
  return {
    id,
    name,
    color: String(cat.color || '#06b6d4').trim() || '#06b6d4',
    icon: String(cat.icon || '🏷️').trim() || '🏷️',
    builtIn: Boolean(cat.builtIn),
  };
}

function normalizeVideoMetaEntry(raw = {}) {
  const status = VALID_VIDEO_STATUSES.has(String(raw.status || '').trim().toLowerCase())
    ? String(raw.status).trim().toLowerCase()
    : 'pendente';
  return {
    category: String(raw.category || '').trim(),
    status,
    notes: String(raw.notes || ''),
    tags: normalizeTags(raw.tags),
    starred: Boolean(raw.starred),
    linkedDocPath: String(raw.linkedDocPath || '').trim(),
    updatedAt: String(raw.updatedAt || new Date().toISOString()),
  };
}

function normalizePlaylistItem(raw = {}) {
  const now = new Date().toISOString();
  const videoId = normalizeVideoId(raw.videoId || raw.id || raw.url || '');
  const isShort = Boolean(raw.isShort || String(raw.url || '').includes('/shorts/'));
  const canonicalUrl = isShort
    ? `https://www.youtube.com/shorts/${videoId}`
    : `https://www.youtube.com/watch?v=${videoId}`;

  return {
    id: videoId,
    videoId,
    title: String(raw.title || `Vídeo ${videoId}`).trim(),
    channelName: String(raw.channelName || '').trim(),
    url: String(raw.url || canonicalUrl).trim() || canonicalUrl,
    thumbnail:
      String(raw.thumbnail || '').trim() ||
      `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    duration: String(raw.duration || '').trim(),
    views: Number.isFinite(Number(raw.views)) ? Math.max(0, Number(raw.views)) : 0,
    viewsText: String(raw.viewsText || '').trim(),
    isShort,
    category: String(raw.category || '').trim(),
    status: VALID_VIDEO_STATUSES.has(String(raw.status || '').trim().toLowerCase())
      ? String(raw.status).trim().toLowerCase()
      : 'pendente',
    notes: String(raw.notes || ''),
    tags: normalizeTags(raw.tags),
    starred: Boolean(raw.starred),
    linkedDocPath: String(raw.linkedDocPath || '').trim(),
    addedAt: String(raw.addedAt || now),
    updatedAt: String(raw.updatedAt || now),
  };
}

function normalizePlaylist(raw = {}) {
  const now = new Date().toISOString();
  const title = String(raw.title || 'Playlist sem título').trim() || 'Playlist sem título';
  const id =
    String(raw.id || '').trim() ||
    `pl-${slugify(title).slice(0, 32) || 'lista'}-${crypto.randomBytes(3).toString('hex')}`;

  const seenItems = new Set();
  const items = [];
  if (Array.isArray(raw.items)) {
    for (const item of raw.items) {
      try {
        const norm = normalizePlaylistItem(item);
        if (!seenItems.has(norm.videoId)) {
          seenItems.add(norm.videoId);
          items.push(norm);
        }
      } catch {
        // ignore malformed item
      }
    }
  }

  return {
    id,
    title,
    kind: String(raw.kind || 'custom').trim() || 'custom',
    description: String(raw.description || ''),
    color: String(raw.color || '#8b5cf6').trim() || '#8b5cf6',
    sourceUrl: String(raw.sourceUrl || '').trim(),
    youtubeListId: String(raw.youtubeListId || '').trim(),
    channelTitle: String(raw.channelTitle || '').trim(),
    items,
    createdAt: String(raw.createdAt || now),
    updatedAt: String(raw.updatedAt || now),
  };
}

function normalizeCuradoriaData(raw) {
  const obj = raw && typeof raw === 'object' ? raw : {};

  let categories;
  if (Array.isArray(obj.categories)) {
    const seenCat = new Set();
    categories = [];
    for (const c of obj.categories) {
      const norm = normalizeCategory(c);
      if (norm && !seenCat.has(norm.id)) {
        seenCat.add(norm.id);
        categories.push(norm);
      }
    }
  } else {
    categories = defaultCategoriesCopy();
  }

  const playlists = Array.isArray(obj.playlists)
    ? obj.playlists.map((pl) => normalizePlaylist(pl))
    : [];

  const videoMeta = {};
  if (obj.videoMeta && typeof obj.videoMeta === 'object' && !Array.isArray(obj.videoMeta)) {
    for (const [vid, meta] of Object.entries(obj.videoMeta)) {
      if (!vid || typeof meta !== 'object' || !meta) continue;
      videoMeta[String(vid)] = normalizeVideoMetaEntry(meta);
    }
  }

  return { categories, playlists, videoMeta };
}

function defaultCuradoriaData() {
  return {
    categories: defaultCategoriesCopy(),
    playlists: [],
    videoMeta: {},
  };
}

export function loadCuradoria(wsPath) {
  if (!wsPath || typeof wsPath !== 'string' || !fs.existsSync(wsPath)) {
    return defaultCuradoriaData();
  }
  const { dataDir, filePath } = resolveCuradoriaFile(wsPath, { ensureDir: false });
  if (!fs.existsSync(filePath)) {
    return defaultCuradoriaData();
  }
  const raw = readJsonSafe(filePath, {
    defaultData: defaultCuradoriaData(),
    schemaVersion: 1,
    quarantineDir: path.join(dataDir, 'quarantine'),
  });
  return normalizeCuradoriaData(raw);
}

export function saveCuradoria(wsPath, data) {
  const { filePath } = resolveCuradoriaFile(wsPath, { ensureDir: true });
  const normalized = normalizeCuradoriaData(data);
  writeJsonAtomic(filePath, normalized, { schemaVersion: 1, backup: true });
  return normalized;
}

export async function upsertVideoMeta(wsPath, videoId, patch = {}) {
  const cleanId = normalizeVideoId(videoId);
  const { filePath } = resolveCuradoriaFile(wsPath, { ensureDir: true });
  return withFileLock(filePath, async () => {
    const curadoria = loadCuradoria(wsPath);
    const prev = curadoria.videoMeta[cleanId] || normalizeVideoMetaEntry({});

    const next = {
      category:
        patch.category !== undefined ? String(patch.category || '').trim() : prev.category,
      status:
        patch.status !== undefined
          ? normalizeStatus(patch.status, prev.status)
          : prev.status,
      notes: patch.notes !== undefined ? String(patch.notes ?? '') : prev.notes,
      tags: patch.tags !== undefined ? normalizeTags(patch.tags) : prev.tags,
      starred:
        patch.starred !== undefined ? Boolean(patch.starred) : prev.starred,
      linkedDocPath:
        patch.linkedDocPath !== undefined
          ? String(patch.linkedDocPath || '').trim()
          : prev.linkedDocPath,
      updatedAt: new Date().toISOString(),
    };

    curadoria.videoMeta[cleanId] = next;
    const saved = saveCuradoria(wsPath, curadoria);
    return {
      curadoria: saved,
      videoId: cleanId,
      meta: saved.videoMeta[cleanId],
    };
  });
}

export async function createPlaylist(
  wsPath,
  { title, kind = 'custom', description = '', color = '#8b5cf6', sourceUrl = '', youtubeListId = '', items = [] } = {}
) {
  const cleanTitle = String(title || '').trim();
  if (!cleanTitle) {
    throw httpError('Título da playlist é obrigatório', 400);
  }
  const { filePath } = resolveCuradoriaFile(wsPath, { ensureDir: true });
  return withFileLock(filePath, async () => {
    const curadoria = loadCuradoria(wsPath);
    const playlist = normalizePlaylist({
      title: cleanTitle,
      kind,
      description,
      color,
      sourceUrl,
      youtubeListId,
      items,
    });

    curadoria.playlists.unshift(playlist);
    const saved = saveCuradoria(wsPath, curadoria);
    const stored = saved.playlists.find((p) => p.id === playlist.id) || playlist;
    return { curadoria: saved, playlist: stored };
  });
}

export async function importPlaylist(
  wsPath,
  { urlOrId, title, kind, description, color } = {}
) {
  if (!urlOrId || !String(urlOrId).trim()) {
    throw httpError('URL ou ID da playlist do YouTube é obrigatório', 400);
  }
  const fetched = await fetchYouTubePlaylist(urlOrId);
  const { filePath } = resolveCuradoriaFile(wsPath, { ensureDir: true });

  return withFileLock(filePath, async () => {
    const curadoria = loadCuradoria(wsPath);
    const now = new Date().toISOString();

    const existingIdx = curadoria.playlists.findIndex(
      (p) => p.youtubeListId && p.youtubeListId === fetched.playlistId
    );

    let targetId;
    if (existingIdx !== -1) {
      const existing = curadoria.playlists[existingIdx];
      const existingById = new Map(existing.items.map((it) => [it.videoId, it]));
      const mergedItems = [];
      const seen = new Set();

      for (const fv of fetched.videos) {
        const prevItem = existingById.get(fv.videoId);
        if (prevItem) {
          mergedItems.push({
            ...prevItem,
            title: fv.title || prevItem.title,
            channelName: fv.channelName || prevItem.channelName,
            thumbnail: fv.thumbnail || prevItem.thumbnail,
            duration: fv.duration || prevItem.duration,
            views: fv.views || prevItem.views,
            viewsText: fv.viewsText || prevItem.viewsText,
            url: fv.url || prevItem.url,
            isShort: Boolean(fv.isShort || prevItem.isShort),
            updatedAt: now,
          });
        } else {
          mergedItems.push(normalizePlaylistItem(fv));
        }
        seen.add(fv.videoId);
      }

      // Preserve manually added items that might not be in the remote list anymore
      for (const prevItem of existing.items) {
        if (!seen.has(prevItem.videoId)) {
          mergedItems.push(prevItem);
        }
      }

      const updated = normalizePlaylist({
        ...existing,
        title: title ? String(title).trim() : existing.title || fetched.title,
        kind: kind !== undefined ? String(kind || 'reagir').trim() : existing.kind,
        description:
          description !== undefined ? String(description) : existing.description,
        color: color !== undefined ? String(color || existing.color).trim() : existing.color,
        sourceUrl: fetched.sourceUrl,
        youtubeListId: fetched.playlistId,
        channelTitle: fetched.channelTitle || existing.channelTitle,
        items: mergedItems,
        updatedAt: now,
      });
      curadoria.playlists[existingIdx] = updated;
      targetId = updated.id;
    } else {
      const created = normalizePlaylist({
        title: String(title || fetched.title || `Playlist ${fetched.playlistId}`).trim(),
        kind: String(kind || 'reagir').trim() || 'reagir',
        description: String(description || ''),
        color: String(color || '#f43f5e').trim() || '#f43f5e',
        sourceUrl: fetched.sourceUrl,
        youtubeListId: fetched.playlistId,
        channelTitle: fetched.channelTitle || '',
        items: fetched.videos.map((v) => normalizePlaylistItem(v)),
        createdAt: now,
        updatedAt: now,
      });
      curadoria.playlists.unshift(created);
      targetId = created.id;
    }

    const saved = saveCuradoria(wsPath, curadoria);
    const playlist = saved.playlists.find((p) => p.id === targetId);
    return { curadoria: saved, playlist };
  });
}

export async function updatePlaylist(wsPath, playlistId, patch = {}) {
  const cleanId = String(playlistId || '').trim();
  if (!cleanId) {
    throw httpError('playlistId ausente', 400);
  }
  const { filePath } = resolveCuradoriaFile(wsPath, { ensureDir: true });
  return withFileLock(filePath, async () => {
    const curadoria = loadCuradoria(wsPath);
    const idx = curadoria.playlists.findIndex((p) => p.id === cleanId);
    if (idx === -1) {
      throw httpError(`Playlist não encontrada: ${cleanId}`, 404);
    }

    const prev = curadoria.playlists[idx];
    const nextTitle =
      patch.title !== undefined ? String(patch.title || '').trim() : prev.title;
    if (!nextTitle) {
      throw httpError('Título da playlist não pode ficar vazio', 400);
    }

    curadoria.playlists[idx] = normalizePlaylist({
      ...prev,
      title: nextTitle,
      kind: patch.kind !== undefined ? String(patch.kind || 'custom').trim() : prev.kind,
      description:
        patch.description !== undefined ? String(patch.description ?? '') : prev.description,
      color: patch.color !== undefined ? String(patch.color || '#8b5cf6').trim() : prev.color,
      sourceUrl:
        patch.sourceUrl !== undefined ? String(patch.sourceUrl || '').trim() : prev.sourceUrl,
      youtubeListId:
        patch.youtubeListId !== undefined
          ? String(patch.youtubeListId || '').trim()
          : prev.youtubeListId,
      items: Array.isArray(patch.items) ? patch.items : prev.items,
      updatedAt: new Date().toISOString(),
    });

    const saved = saveCuradoria(wsPath, curadoria);
    const playlist = saved.playlists.find((p) => p.id === cleanId);
    return { curadoria: saved, playlist };
  });
}

export async function deletePlaylist(wsPath, playlistId) {
  const cleanId = String(playlistId || '').trim();
  if (!cleanId) {
    throw httpError('playlistId ausente', 400);
  }
  const { rootReal, filePath } = resolveCuradoriaFile(wsPath, { ensureDir: false });
  return withFileLock(filePath, async () => {
    const curadoria = loadCuradoria(wsPath);
    const idx = curadoria.playlists.findIndex((p) => p.id === cleanId);
    if (idx === -1) {
      throw httpError(`Playlist não encontrada: ${cleanId}`, 404);
    }

    const playlistObj = curadoria.playlists[idx];
    const trashed = await moveToTrash(rootReal, {
      kind: 'playlist',
      originalPath: `.studio-data/curadoria.json#${cleanId}`,
      title: playlistObj.title || cleanId,
      itemPayload: playlistObj,
      metadata: {
        playlistId: cleanId,
        kind: playlistObj.kind || 'custom',
        itemsCount: Array.isArray(playlistObj.items) ? playlistObj.items.length : 0,
      },
    });

    curadoria.playlists.splice(idx, 1);
    const saved = saveCuradoria(wsPath, curadoria);
    return { curadoria: saved, deletedId: cleanId, trashed };
  });
}

export async function upsertRestoredPlaylist(wsPath, playlistObj) {
  if (!playlistObj || typeof playlistObj !== 'object' || Array.isArray(playlistObj)) {
    throw httpError('Payload de playlist inválido para restauração', 400);
  }
  const { filePath } = resolveCuradoriaFile(wsPath, { ensureDir: true });
  return withFileLock(filePath, async () => {
    const curadoria = loadCuradoria(wsPath);
    const restored = normalizePlaylist(playlistObj);
    const idx = curadoria.playlists.findIndex((p) => p.id === restored.id);
    if (idx !== -1) {
      curadoria.playlists[idx] = restored;
    } else {
      curadoria.playlists.unshift(restored);
    }
    const saved = saveCuradoria(wsPath, curadoria);
    const stored = saved.playlists.find((p) => p.id === restored.id) || restored;
    return { curadoria: saved, playlist: stored };
  });
}

export async function addPlaylistItem(wsPath, playlistId, itemOrUrl) {
  const cleanPlaylistId = String(playlistId || '').trim();
  if (!cleanPlaylistId) {
    throw httpError('playlistId ausente', 400);
  }

  let baseInput = {};
  let rawSource = '';

  if (typeof itemOrUrl === 'string') {
    rawSource = itemOrUrl.trim();
  } else if (itemOrUrl && typeof itemOrUrl === 'object') {
    baseInput = { ...itemOrUrl };
    rawSource = String(
      itemOrUrl.url || itemOrUrl.videoId || itemOrUrl.id || ''
    ).trim();
  }

  if (!rawSource) {
    throw httpError('URL ou videoId do item é obrigatório', 400);
  }

  const preCheck = loadCuradoria(wsPath);
  if (!preCheck.playlists.some((p) => p.id === cleanPlaylistId)) {
    throw httpError(`Playlist não encontrada: ${cleanPlaylistId}`, 404);
  }

  let hydrated = {};
  const needsHydration =
    typeof itemOrUrl === 'string' ||
    !baseInput.title ||
    !baseInput.thumbnail;

  if (needsHydration) {
    hydrated = await fetchYouTubeVideoMeta(rawSource);
  }

  const { filePath } = resolveCuradoriaFile(wsPath, { ensureDir: true });
  return withFileLock(filePath, async () => {
    const curadoria = loadCuradoria(wsPath);
    const idx = curadoria.playlists.findIndex((p) => p.id === cleanPlaylistId);
    if (idx === -1) {
      throw httpError(`Playlist não encontrada: ${cleanPlaylistId}`, 404);
    }

    const combined = normalizePlaylistItem({
      ...hydrated,
      ...baseInput,
      title: baseInput.title || hydrated.title,
      channelName: baseInput.channelName || hydrated.channelName,
      thumbnail: baseInput.thumbnail || hydrated.thumbnail,
      url: hydrated.url || baseInput.url,
      videoId: hydrated.videoId || baseInput.videoId || baseInput.id || rawSource,
      duration: baseInput.duration || hydrated.duration || '',
      views:
        baseInput.views !== undefined ? baseInput.views : hydrated.views || 0,
      viewsText: baseInput.viewsText || hydrated.viewsText || '',
      isShort:
        baseInput.isShort !== undefined
          ? Boolean(baseInput.isShort)
          : Boolean(hydrated.isShort),
    });

    const playlist = curadoria.playlists[idx];
    const existingItemIdx = playlist.items.findIndex(
      (it) => it.videoId === combined.videoId
    );

    if (existingItemIdx !== -1) {
      const prev = playlist.items[existingItemIdx];
      playlist.items[existingItemIdx] = {
        ...prev,
        ...combined,
        notes: baseInput.notes !== undefined ? combined.notes : prev.notes,
        status: baseInput.status !== undefined ? combined.status : prev.status,
        category:
          baseInput.category !== undefined ? combined.category : prev.category,
        starred: baseInput.starred !== undefined ? combined.starred : prev.starred,
        linkedDocPath:
          baseInput.linkedDocPath !== undefined
            ? combined.linkedDocPath
            : prev.linkedDocPath,
        addedAt: prev.addedAt,
        updatedAt: new Date().toISOString(),
      };
    } else {
      playlist.items.push(combined);
    }

    playlist.updatedAt = new Date().toISOString();
    const saved = saveCuradoria(wsPath, curadoria);
    const updatedPl = saved.playlists.find((p) => p.id === cleanPlaylistId);
    const addedItem = updatedPl.items.find((it) => it.videoId === combined.videoId);
    return { curadoria: saved, playlist: updatedPl, addedItem };
  });
}

export async function updatePlaylistItem(wsPath, playlistId, videoId, patch = {}) {
  const cleanPlaylistId = String(playlistId || '').trim();
  const cleanVideoId = normalizeVideoId(videoId);
  const { filePath } = resolveCuradoriaFile(wsPath, { ensureDir: true });

  return withFileLock(filePath, async () => {
    const curadoria = loadCuradoria(wsPath);
    const pl = curadoria.playlists.find((p) => p.id === cleanPlaylistId);
    if (!pl) {
      throw httpError(`Playlist não encontrada: ${cleanPlaylistId}`, 404);
    }

    const itemIdx = pl.items.findIndex(
      (it) => it.videoId === cleanVideoId || it.id === cleanVideoId
    );
    if (itemIdx === -1) {
      throw httpError(`Item ${cleanVideoId} não encontrado na playlist`, 404);
    }

    const prev = pl.items[itemIdx];
    const now = new Date().toISOString();
    pl.items[itemIdx] = {
      ...prev,
      title: patch.title !== undefined ? String(patch.title || prev.title).trim() : prev.title,
      channelName:
        patch.channelName !== undefined
          ? String(patch.channelName || '').trim()
          : prev.channelName,
      category:
        patch.category !== undefined ? String(patch.category || '').trim() : prev.category,
      status:
        patch.status !== undefined
          ? normalizeStatus(patch.status, prev.status)
          : prev.status,
      notes: patch.notes !== undefined ? String(patch.notes ?? '') : prev.notes,
      tags: patch.tags !== undefined ? normalizeTags(patch.tags) : prev.tags,
      starred: patch.starred !== undefined ? Boolean(patch.starred) : prev.starred,
      linkedDocPath:
        patch.linkedDocPath !== undefined
          ? String(patch.linkedDocPath || '').trim()
          : prev.linkedDocPath,
      updatedAt: now,
    };
    pl.updatedAt = now;

    const saved = saveCuradoria(wsPath, curadoria);
    const playlist = saved.playlists.find((p) => p.id === cleanPlaylistId);
    return { curadoria: saved, playlist };
  });
}

export async function removePlaylistItem(wsPath, playlistId, videoId) {
  const cleanPlaylistId = String(playlistId || '').trim();
  const cleanVideoId = normalizeVideoId(videoId);
  const { filePath } = resolveCuradoriaFile(wsPath, { ensureDir: true });

  return withFileLock(filePath, async () => {
    const curadoria = loadCuradoria(wsPath);
    const pl = curadoria.playlists.find((p) => p.id === cleanPlaylistId);
    if (!pl) {
      throw httpError(`Playlist não encontrada: ${cleanPlaylistId}`, 404);
    }

    const prevLen = pl.items.length;
    pl.items = pl.items.filter(
      (it) => it.videoId !== cleanVideoId && it.id !== cleanVideoId
    );
    if (pl.items.length === prevLen) {
      throw httpError(`Item ${cleanVideoId} não encontrado na playlist`, 404);
    }
    pl.updatedAt = new Date().toISOString();

    const saved = saveCuradoria(wsPath, curadoria);
    const playlist = saved.playlists.find((p) => p.id === cleanPlaylistId);
    return { curadoria: saved, playlist };
  });
}

export async function upsertCategory(wsPath, { id, name, color, icon } = {}) {
  const cleanName = String(name || '').trim();
  const rawSlug = slugify(id || cleanName);
  if (!rawSlug) {
    throw httpError('ID ou nome da categoria inválido', 400);
  }
  const { filePath } = resolveCuradoriaFile(wsPath, { ensureDir: true });

  return withFileLock(filePath, async () => {
    const curadoria = loadCuradoria(wsPath);
    const idx = curadoria.categories.findIndex((c) => c.id === rawSlug);

    if (idx !== -1) {
      const prev = curadoria.categories[idx];
      curadoria.categories[idx] = {
        ...prev,
        name: cleanName || prev.name,
        color: color !== undefined ? String(color || prev.color).trim() : prev.color,
        icon: icon !== undefined ? String(icon || prev.icon).trim() : prev.icon,
      };
    } else {
      if (!cleanName) {
        throw httpError('Nome da categoria é obrigatório', 400);
      }
      curadoria.categories.push({
        id: rawSlug,
        name: cleanName,
        color: String(color || '#06b6d4').trim() || '#06b6d4',
        icon: String(icon || '🏷️').trim() || '🏷️',
        builtIn: false,
      });
    }

    const saved = saveCuradoria(wsPath, curadoria);
    const category = saved.categories.find((c) => c.id === rawSlug);
    return { curadoria: saved, category };
  });
}

export async function deleteCategory(wsPath, categoryId) {
  const cleanId = slugify(categoryId);
  if (!cleanId) {
    throw httpError('categoryId ausente', 400);
  }
  const { filePath } = resolveCuradoriaFile(wsPath, { ensureDir: true });

  return withFileLock(filePath, async () => {
    const curadoria = loadCuradoria(wsPath);
    const idx = curadoria.categories.findIndex((c) => c.id === cleanId);
    if (idx === -1) {
      throw httpError(`Categoria não encontrada: ${cleanId}`, 404);
    }
    curadoria.categories.splice(idx, 1);
    const saved = saveCuradoria(wsPath, curadoria);
    return { curadoria: saved, deletedId: cleanId };
  });
}
