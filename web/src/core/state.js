import { MD, SERIE_META, STORAGE_KEY_DEFAULT_VERSIONS, STORAGE_KEY_DRAFTS } from './constants.js';
import { loadJsonStorage, saveJsonStorage, showToast } from './utils.js';

export const state = {
  data: null,
  activeChannel: 'mrj',
  serverMode: false,
  dirHandle: null,
  view: 'dashboard',
  selectedDocPath: null,
  docMode: 'read', // 'read' | 'edit' | 'prompter' | 'history'
  dirtyBody: null,
  dirtyMeta: null,
  hasUnsavedEdits: false,
  liveConnected: false,
  activeVersion: 'principal',
  versionExplicit: false,
  versionContentLoading: false,
  loadedVersionKey: '',
  versionHistory: null,
  versionLoading: false,
  versionError: null,
  versionFetchedKey: '',
  diffDocPath: '',
  diffFromRef: null,
  diffToRef: null,
  diffResult: null,
  selectedRevPreview: null,
  revPreviewContent: null,
  commitMessageDraft: '',
  settingsChannelKey: null,
  settingsConfig: null,
  settingsLoading: false,
  settingsError: null,
  doctorReport: null,
  doctorLoading: false,
  doctorError: null,
  trashItems: [],
  trashLoading: false,
  trashChannel: '',
  trashError: null,
  backupIncludeRecordings: false,
  focusMode: false,
  scriptsListCollapsed: false,
  inspectorCollapsed: false,
  editorSplit: false,
  readerFontSize: 16,
  mapGroupBy: 'serie',
  mapStatusFilter: 'all',
  mapSearch: '',
  mapHideMeta: true,
  mapStyle: 'cards',
  mapFlowLayout: 'clusters',
  mapFlowFullscreen: false,
  mapFlowZoom: 1,
  mapFlowPanX: 0,
  mapFlowPanY: 0,
  mapFlowAutoFitKey: '',
  tabs: [],
  activeTabId: null,
  tabBarPinned: null,
  activeLinkTab: null,
  activeBoardId: null,
  boardsList: [],
  boardSaveStatus: 'saved',
  boardNodeFocus: false,
  boardFullscreen: false,
  boardDirtyScene: null,
  boardActiveScene: null,
  boardReady: false,
  boardLastSavedAt: '',
  pendingInsertDoc: null,
  chartMode: 'views',
  chartHoverIdx: null,
  selectorTab: 'multi',
  selectedSeries: new Set(),
  pulseTab: 'channel',
  historyStatusFilter: 'all',
  historyFolderFilter: 'all',
  scriptsSearch: '',
  scriptsStatusFilter: 'all',
  scriptsFolderFilter: 'all',
  catalogFilter: 'all',
  catalogSort: 'date',
  catalogSubTab: 'videos',
  catalogGroupBy: 'none',
  catalogSearch: '',
  catalogCategoryFilter: 'all',
  catalogStatusFilter: 'all',
  catalogCuradoria: null,
  catalogCuradoriaChannel: '',
  catalogExpandedPlaylistId: null,
  catalogLoading: false,
  wbListSearch: '',
  wbListModeFilter: 'all',
  wbListLoading: false,
  wbListFetchedChannel: '',
  wbDeleteTargetId: null,
  cmdSelectedIndex: 0,
  cmdFetchInFlight: false,
  prefs: {
    tabBarAlwaysOpen: false,
    catalogLayout: 'stacked',
    wbLayout: 'grid',
  },
  recorder: {
    mode: 'all-and-separate',
    pipPos: 'bottom-right',
    pipSize: 'md',
    status: 'idle',
    startedAt: 0,
    elapsedSec: 0,
    timerId: null,
    micLevel: 0,
    devices: { cameras: [], mics: [] },
    selectedCamId: '',
    selectedMicId: '',
    linkedDocPath: '',
    titleDraft: '',
    autoSuggestedTitle: '',
    prompterPlaying: false,
    prompterSpeed: 1.5,
    prompterFontSize: 22,
    prompterRafId: null,
    prompterLastTs: 0,
    prompterScrollPos: 0,
    sessions: [],
    sessionsChannel: '',
    loading: false,
    uploading: false,
    uploadProgress: '',
    lastSavedInfo: null,
    activePlayer: null,
    convertingKey: '',
  },
  narrationState: {
    loadedChannel: '',
    loading: false,
    generating: false,
    downloadingModel: false,
    env: null,
    presets: [],
    categories: [],
    items: [],
    sourceTab: 'text', // 'text' | 'script' | 'multivoice'
    mode: 'single', // 'single' | 'multivoice'
    selectedPresetId: 'mrj-pocket',
    secondaryPresetId: 'crom-j',
    text: '',
    title: '',
    category: 'teste-voz',
    selectedDocPath: '',
    selectedDocVersion: 'principal',
    cleanMarkdown: true,
    usePronunciationDict: true,
    loudnorm: false,
    // Pocket TTS controls
    voiceFile: 'mrj_pt24l_ref01.safetensors',
    temperature: 0.3,
    samplerDecodeSteps: 4,
    noiseClamp: 2.5,
    pauseMs: 220,
    // Piper controls
    lengthScale: 1.5,
    noiseScale: 0.67,
    noiseW: 0.8,
    sentenceSilence: 0.2,
    // FFmpeg effects
    pitchShift: 1.0,
    reverb: 0,
    bassDb: 0,
    trebleDb: 0,
    // RVC v2 (Nível 2) controls
    rvcEnabled: false,
    rvcModelName: '',
    rvcF0UpKey: 0,
    rvcIndexRate: 0.75,
    rvcProtect: 0.33,
    // Library filters
    filterOrigin: 'all',
    filterCategory: 'all',
    filterVoice: 'all',
    filterSearch: '',
    activePlayerId: '',
  },
  notesState: {
    notes: [],
    gistSync: null,
    channel: '',
    loading: false,
    search: '',
    colorFilter: 'all',
    labelFilter: 'all',
    showArchived: false,
    composerExpanded: false,
    composerKind: 'note',
    composerColor: 'default',
    composerPinned: false,
    composerChecklist: [{ id: 'c1', text: '', done: false }],
    highlightNoteId: '',
  },
  remoteStatus: null,
  remoteLoading: false,
  prompter: {
    playing: false,
    speed: 1.5,
    fontSize: 34,
    mirrored: false,
    rafId: null,
    lastTs: 0,
    scrollPos: 0,
  },
  agentSelectedDoc: '',
  color: {
    dynamic: true,
    speed: 'medium',
    fixedId: 'crom-magenta',
  },
};

export const recRuntime = {
  screenStream: null,
  camStream: null,
  micStream: null,
  audioCtx: null,
  analyser: null,
  vuRafId: null,
  canvasRafId: null,
  canvasEl: null,
  screenVideoEl: null,
  camVideoEl: null,
  recorders: [],
  recordedBlobs: {},
};

const viewRenderers = new Map();
const lifecycleHooks = {
  stopPrompter: () => {},
  cleanupMapFlowObservers: () => {},
  flushWhiteboardSaveOnLeave: () => {},
  stopRecorderMediaStreams: () => {},
  updateHeaderChrome: () => {},
  syncBrowserUrl: () => {},
  syncActiveTabFromState: () => {},
  loadVersionHistory: async () => null,
  switchDocVersion: async () => {},
  loadBoardIntoSession: async () => {},
  fetchBoardsListForChannel: async () => [],
  syncWhiteboardTopbarUI: () => {},
  loadSettingsConfig: async () => null,
  ensureCatalogCuradoria: async () => null,
  loadRecordingsLibrary: async () => {},
  loadNotesForChannel: async () => {},
  updateRemoteChip: () => {},
};

export function registerViewRenderer(name, fn) {
  viewRenderers.set(name, fn);
}

export function getViewRenderer(name) {
  return viewRenderers.get(name) || viewRenderers.get('dashboard');
}

export function registerLifecycleHooks(hooks = {}) {
  Object.assign(lifecycleHooks, hooks);
}

export function getLifecycleHooks() {
  return lifecycleHooks;
}

export function getChannelKeys() {
  const channels = state.data?.channels || {};
  const order = state.data?.channelOrder || Object.keys(channels);
  return order.filter((k) => Boolean(channels[k]));
}

export function getActiveChannelData() {
  const channels = state.data?.channels || {};
  return (
    channels[state.activeChannel] ||
    channels[state.data?.defaultChannel] ||
    Object.values(channels)[0] || {
      key: 'mrj',
      workspaceName: 'Studio',
      workspacePath: '',
      channel: { name: 'Studio', handle: '', status: 'ativo', subscribers: 0 },
      videos: [],
      githubRepos: [],
      folders: [],
      series: [],
      docs: [],
      projectLinks: {},
    }
  );
}

export function getChannelInitials(ch) {
  const name = String(ch?.name || ch?.key || 'ST').trim();
  return name.slice(0, 2).toUpperCase();
}

export function normalizePayload(rawPayload) {
  if (rawPayload && rawPayload.channels) return rawPayload;
  const legacy = rawPayload || { channel: {}, videos: [], githubRepos: [], docs: [], folders: [], series: [] };
  return {
    version: 2,
    generatedAt: legacy.generatedAt || new Date().toISOString(),
    serverMode: Boolean(legacy.serverMode),
    defaultChannel: 'mrj',
    channelOrder: ['mrj'],
    channels: {
      mrj: {
        key: 'mrj',
        workspaceName: legacy.workspaceName || 'MrJ Studio',
        workspacePath: legacy.workspacePath || '',
        channel: { status: 'ativo', statusLabel: 'Ativo', ...(legacy.channel || {}) },
        videos: legacy.videos || [],
        githubRepos: legacy.githubRepos || [],
        folders: legacy.folders || [],
        series: legacy.series || [],
        docs: legacy.docs || [],
        projectLinks: legacy.projectLinks || {},
      },
    },
    kdenlive: legacy.kdenlive || { available: false, modelos: [], estilos: [], videosCrom: [], videosMrj: [] },
  };
}

export function rebuildDocFromRaw(relPath, raw, channelKey) {
  const parsed = MD.parseFrontmatter(raw);
  const stats = MD.analyzeStats(parsed.body);
  const parts = relPath.split('/');
  const topFolder = parts.length > 1 ? parts[0] : 'raiz';
  const folder = parts.length > 1 ? parts.slice(0, -1).join('/') : 'raiz';
  const fallbackSerie = channelKey === 'crom' ? 'Ensaios & Avulsos' : 'Construção Real';
  return {
    path: relPath,
    filename: parts[parts.length - 1],
    folder,
    topFolder,
    meta: {
      id: String(parsed.meta.id || MD.slugify(relPath)),
      titulo: String(parsed.meta.titulo || parts[parts.length - 1]),
      tipo: String(parsed.meta.tipo || 'roteiro'),
      status: String(parsed.meta.status || 'roteiro'),
      serie: String(parsed.meta.serie || fallbackSerie),
      formato: String(parsed.meta.formato || 'long'),
      prioridade: String(parsed.meta.prioridade || 'media'),
      duracao_estimada: String(parsed.meta.duracao_estimada || `${stats.speakMinutes || 1} min`),
      data_criacao: String(parsed.meta.data_criacao || new Date().toISOString().slice(0, 10)),
      data_alvo: String(parsed.meta.data_alvo || ''),
      repo_github: String(parsed.meta.repo_github || ''),
      youtube_id: String(parsed.meta.youtube_id || ''),
      views: Number(parsed.meta.views || 0),
      tags: Array.isArray(parsed.meta.tags) ? parsed.meta.tags : [],
      resumo: String(parsed.meta.resumo || ''),
    },
    body: parsed.body,
    raw,
    stats,
    headings: [],
    mtime: new Date().toISOString(),
  };
}

export function applyLocalDraftOverrides(payload) {
  const draftsRoot = loadJsonStorage(STORAGE_KEY_DRAFTS, { byChannel: {} });
  const byChannel = draftsRoot.byChannel || {};

  for (const key of Object.keys(payload.channels || {})) {
    const ch = payload.channels[key];
    const drafts = byChannel[key] || { updated: {}, created: {}, deleted: [] };
    const deletedSet = new Set(drafts.deleted || []);
    let docs = (ch.docs || []).filter((d) => !deletedSet.has(d.path));

    docs = docs.map((d) => {
      if (drafts.updated && drafts.updated[d.path]) {
        return rebuildDocFromRaw(d.path, drafts.updated[d.path], key);
      }
      return d;
    });

    if (drafts.created) {
      for (const [relPath, raw] of Object.entries(drafts.created)) {
        if (!docs.some((d) => d.path === relPath)) {
          docs.push(rebuildDocFromRaw(relPath, raw, key));
        }
      }
    }

    ch.docs = docs;
  }

  return payload;
}

export function getActiveDoc() {
  if (!state.selectedDocPath) return null;
  const docs = getActiveChannelData().docs || [];
  if (!docs.length) return null;
  return docs.find((d) => d.path === state.selectedDocPath) || null;
}

export function getStoredDefaultVersion(channelKey, docPath) {
  if (!channelKey || !docPath) return null;
  const map = loadJsonStorage(STORAGE_KEY_DEFAULT_VERSIONS, {});
  const val = map?.[`${channelKey}::${docPath}`];
  return typeof val === 'string' && val.trim() ? val.trim() : null;
}

export function setStoredDefaultVersion(channelKey, docPath, versionName) {
  if (!channelKey || !docPath) return;
  const map = loadJsonStorage(STORAGE_KEY_DEFAULT_VERSIONS, {});
  const clean = String(versionName || 'principal').trim() || 'principal';
  if (clean === 'principal') {
    delete map[`${channelKey}::${docPath}`];
  } else {
    map[`${channelKey}::${docPath}`] = clean;
  }
  saveJsonStorage(STORAGE_KEY_DEFAULT_VERSIONS, map);
}

export function getDocDefaultVersion(channelKey, docPath) {
  if (!channelKey || !docPath) return 'principal';
  const fetchKey = `${channelKey}::${docPath}`;
  if (state.versionFetchedKey === fetchKey && state.versionHistory?.defaultVersion) {
    const candidate = state.versionHistory.defaultVersion;
    const versions = state.versionHistory.versions || [];
    if (versions.some((v) => v.name === candidate)) return candidate;
  }
  const chData = state.data?.channels?.[channelKey];
  const doc = (chData?.docs || []).find((d) => d.path === docPath);
  if (state.serverMode && doc?.versioning && typeof doc.versioning.defaultVersion === 'string') {
    const serverDef = doc.versioning.defaultVersion.trim() || 'principal';
    const known = Array.isArray(doc.versioning.versions) ? doc.versioning.versions : ['principal'];
    return known.includes(serverDef) ? serverDef : 'principal';
  }
  const stored = getStoredDefaultVersion(channelKey, docPath);
  if (stored) {
    const known = Array.isArray(doc?.versioning?.versions) ? doc.versioning.versions : null;
    if (!known || known.includes(stored)) return stored;
  }
  return 'principal';
}

export function activeFilename(doc) {
  return doc.filename || doc.path.split('/').pop();
}

export function resolveRelativeMdPath(baseFolder, href) {
  const clean = String(href || '').split('#')[0].trim();
  if (!clean) return null;
  if (clean.startsWith('/')) return clean.slice(1);
  const baseParts = !baseFolder || baseFolder === 'raiz' ? [] : baseFolder.split('/');
  for (const seg of clean.split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') {
      if (baseParts.length) baseParts.pop();
    } else {
      baseParts.push(seg);
    }
  }
  return baseParts.join('/');
}

export function getChannelSeriesList(chData) {
  const set = new Set([
    ...(chData.series || []),
    ...(chData.docs || []).map((d) => d.meta.serie).filter(Boolean),
    ...(chData.videos || []).map((v) => v.serie).filter(Boolean),
  ]);
  return Array.from(set);
}

export function getSeriesStats(chData) {
  const videos = chData.videos || [];
  const docs = chData.docs || [];
  const names = getChannelSeriesList(chData);

  return names.map((name) => {
    const vList = videos.filter((v) => v.serie === name);
    const dList = docs.filter((d) => d.meta.serie === name && d.meta.status !== 'template');
    const views = vList.reduce((acc, v) => acc + Number(v.views || 0), 0);
    return {
      name,
      meta: SERIE_META[name] || { short: name, icon: '•', color: '#a855f7' },
      videosCount: vList.length,
      docsCount: dList.length,
      views,
    };
  });
}

export function initSelectedSeriesForChannel(chData) {
  const allSeries = getChannelSeriesList(chData);
  const editorial = allSeries.filter((s) => s !== 'Canal & Ops');
  state.selectedSeries = new Set(editorial.length ? editorial : allSeries);
}

export async function writeViaDirectoryHandle(relPath, content) {
  if (!state.dirHandle) return;
  const parts = relPath.split('/');
  let dir = state.dirHandle;
  for (let i = 0; i < parts.length - 1; i++) {
    dir = await dir.getDirectoryHandle(parts[i], { create: true });
  }
  const fileHandle = await dir.getFileHandle(parts[parts.length - 1], { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(content);
  await writable.close();
}

export async function connectLocalFolder() {
  if (state.serverMode) {
    showToast('Modo Disco (Local) já está salvando diretamente nos seus arquivos .md!');
    return;
  }
  if (!globalThis.showDirectoryPicker) {
    showToast('Para salvar direto no disco, rode: ./bin/crom-studio --tray (ou npm start).');
    return;
  }
  try {
    state.dirHandle = await globalThis.showDirectoryPicker({ mode: 'readwrite' });
    lifecycleHooks.updateHeaderChrome();
    showToast('Pasta conectada! Alterações serão gravadas nela.');
  } catch {
    // Cancelado pelo usuário
  }
}

export async function persistSaveDoc(docPath, fullRaw, newPath = null, { version = 'principal', commitMessage = '' } = {}) {
  const channelKey = state.activeChannel;
  if (state.serverMode) {
    const res = await fetch('/api/doc', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channel: channelKey,
        path: docPath,
        content: fullRaw,
        newPath,
        version,
        commitMessage,
        author: 'MrJ',
      }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Erro ao salvar arquivo');
    state.data = normalizePayload(json.state);
    state.selectedDocPath = json.path;
    if (json.history) state.versionHistory = json.history;
    return json.path;
  }

  const draftsRoot = loadJsonStorage(STORAGE_KEY_DRAFTS, { byChannel: {} });
  draftsRoot.byChannel = draftsRoot.byChannel || {};
  const drafts = draftsRoot.byChannel[channelKey] || { updated: {}, created: {}, deleted: [] };
  const targetPath = newPath || docPath;

  if (newPath && newPath !== docPath) {
    delete drafts.updated[docPath];
    if (drafts.created && drafts.created[docPath]) {
      delete drafts.created[docPath];
    } else {
      drafts.deleted = Array.from(new Set([...(drafts.deleted || []), docPath]));
    }
    drafts.created[targetPath] = fullRaw;
  } else if (drafts.created && drafts.created[docPath]) {
    drafts.created[docPath] = fullRaw;
  } else {
    drafts.updated[docPath] = fullRaw;
  }

  draftsRoot.byChannel[channelKey] = drafts;
  saveJsonStorage(STORAGE_KEY_DRAFTS, draftsRoot);

  if (state.dirHandle) {
    await writeViaDirectoryHandle(targetPath, fullRaw).catch(() => {});
  }

  const chData = getActiveChannelData();
  const idx = chData.docs.findIndex((d) => d.path === docPath);
  const updatedDoc = rebuildDocFromRaw(targetPath, fullRaw, channelKey);
  if (idx !== -1) chData.docs[idx] = updatedDoc;
  else chData.docs.push(updatedDoc);
  state.selectedDocPath = targetPath;
  return targetPath;
}

export async function persistCreateDoc(folder, filename, fullRaw) {
  const channelKey = state.activeChannel;
  if (state.serverMode) {
    const res = await fetch('/api/doc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel: channelKey, folder, filename, content: fullRaw }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Erro ao criar arquivo');
    state.data = normalizePayload(json.state);
    state.selectedDocPath = json.path;
    return json.path;
  }

  const cleanName = `${MD.slugify(filename.replace(/\.md$/i, ''))}.md`;
  const relPath = folder && folder !== 'raiz' ? `${folder}/${cleanName}` : cleanName;
  const chData = getActiveChannelData();
  if (chData.docs.some((d) => d.path === relPath)) {
    throw new Error(`Já existe um arquivo em ${relPath}`);
  }

  const draftsRoot = loadJsonStorage(STORAGE_KEY_DRAFTS, { byChannel: {} });
  draftsRoot.byChannel = draftsRoot.byChannel || {};
  const drafts = draftsRoot.byChannel[channelKey] || { updated: {}, created: {}, deleted: [] };
  drafts.created[relPath] = fullRaw;
  draftsRoot.byChannel[channelKey] = drafts;
  saveJsonStorage(STORAGE_KEY_DRAFTS, draftsRoot);

  if (state.dirHandle) {
    await writeViaDirectoryHandle(relPath, fullRaw).catch(() => {});
  }

  chData.docs.unshift(rebuildDocFromRaw(relPath, fullRaw, channelKey));
  state.selectedDocPath = relPath;
  return relPath;
}

export async function persistDeleteDoc(docPath) {
  const channelKey = state.activeChannel;
  if (state.serverMode) {
    const res = await fetch(
      `/api/doc?channel=${encodeURIComponent(channelKey)}&path=${encodeURIComponent(docPath)}`,
      { method: 'DELETE' }
    );
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Erro ao remover arquivo');
    state.data = normalizePayload(json.state);
    return;
  }

  if (docPath === 'AGENTS.md' || docPath === 'README.md') {
    throw new Error('AGENTS.md e README.md são arquivos protegidos.');
  }
  const draftsRoot = loadJsonStorage(STORAGE_KEY_DRAFTS, { byChannel: {} });
  draftsRoot.byChannel = draftsRoot.byChannel || {};
  const drafts = draftsRoot.byChannel[channelKey] || { updated: {}, created: {}, deleted: [] };
  delete drafts.updated[docPath];
  if (drafts.created && drafts.created[docPath]) {
    delete drafts.created[docPath];
  } else {
    drafts.deleted = Array.from(new Set([...(drafts.deleted || []), docPath]));
  }
  draftsRoot.byChannel[channelKey] = drafts;
  saveJsonStorage(STORAGE_KEY_DRAFTS, draftsRoot);

  const chData = getActiveChannelData();
  chData.docs = chData.docs.filter((d) => d.path !== docPath);
}
