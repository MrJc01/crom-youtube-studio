import { MD } from './constants.js';
import {
  renderCurrentView,
  syncBrowserUrl,
  updateConnectionBadge,
  updateHeaderChrome,
} from './router.js';
import {
  getActiveChannelData,
  getActiveDoc,
  getChannelKeys,
  getLifecycleHooks,
  initSelectedSeriesForChannel,
  normalizePayload,
  state,
} from './state.js';
import { showToast } from './utils.js';

let liveEventSource = null;
let liveDebounceTimer = null;
let liveLifecycleBound = false;

export function closeLiveEvents() {
  if (liveDebounceTimer) {
    clearTimeout(liveDebounceTimer);
    liveDebounceTimer = null;
  }
  if (liveEventSource) {
    try {
      liveEventSource.close();
    } catch {
      // ignora
    }
    liveEventSource = null;
  }
  state.liveConnected = false;
}

export async function handleLiveWorkspaceUpdate(source) {
  const hooks = getLifecycleHooks();
  try {
    const res = await fetch('/api/state', { cache: 'no-store' });
    if (!res.ok) return;
    const fresh = await res.json();
    state.data = normalizePayload(fresh);

    if (!state.data?.channels?.[state.activeChannel]) {
      state.activeChannel = state.data?.defaultChannel || getChannelKeys()[0] || 'mrj';
      state.selectedDocPath = null;
      state.activeVersion = 'principal';
      state.versionHistory = null;
      state.versionFetchedKey = '';
      state.diffResult = null;
      state.dirtyBody = null;
      state.dirtyMeta = null;
      state.hasUnsavedEdits = false;
      state.settingsChannelKey = state.activeChannel;
      initSelectedSeriesForChannel(getActiveChannelData());
      syncBrowserUrl({ replace: true });
    }

    if (state.view === 'scripts' && state.hasUnsavedEdits) {
      updateHeaderChrome();
      const activeDoc = getActiveDoc();
      if (activeDoc) {
        await hooks.loadVersionHistory(activeDoc.path, { force: true, skipRender: state.docMode === 'edit' });
      }
      showToast('Alteração externa detectada no disco (rascunho atual preservado)');
      return;
    }

    const activeCh = getActiveChannelData();
    if (state.selectedDocPath && !(activeCh.docs || []).some((d) => d.path === state.selectedDocPath)) {
      state.selectedDocPath = null;
      state.activeVersion = 'principal';
      state.versionHistory = null;
      state.versionFetchedKey = '';
      state.diffResult = null;
      state.dirtyBody = null;
      state.dirtyMeta = null;
    }

    updateHeaderChrome();

    if (state.view === 'whiteboard') {
      state.wbListFetchedChannel = '';
      if (!state.activeBoardId) {
        await hooks.fetchBoardsListForChannel(state.activeChannel, { force: true });
        return;
      }
      if (source === 'fs') {
        try {
          const bRes = await fetch(`/api/boards?channel=${encodeURIComponent(state.activeChannel)}`, { cache: 'no-store' });
          if (bRes.ok) {
            const bJson = await bRes.json();
            if (Array.isArray(bJson.boards)) {
              state.boardsList = bJson.boards;
              state.wbListFetchedChannel = state.activeChannel;
            }
          }
        } catch {
          // mantém lista atual
        }
        updateHeaderChrome();
        hooks.syncWhiteboardTopbarUI();
        if (state.boardDirtyScene) {
          showToast('Alteração externa no quadro detectada (edição atual preservada)');
        } else if (state.activeBoardId) {
          await hooks.loadBoardIntoSession(state.activeBoardId);
          showToast('Quadro atualizado automaticamente do disco');
        }
      } else {
        hooks.syncWhiteboardTopbarUI();
      }
      return;
    }

    if (state.view === 'settings') {
      await hooks.loadSettingsConfig({ force: true });
    } else if (state.view === 'catalog') {
      await hooks.ensureCatalogCuradoria(state.activeChannel, { force: true });
      renderCurrentView();
    } else if (state.view === 'recorder') {
      await hooks.loadRecordingsLibrary(state.activeChannel, { rerender: false });
      renderCurrentView();
    } else if (state.view === 'notes') {
      await hooks.loadNotesForChannel(state.activeChannel, { rerender: false });
      renderCurrentView();
    } else {
      renderCurrentView();
    }

    if (state.view === 'scripts') {
      const activeDoc = getActiveDoc();
      if (activeDoc) {
        await hooks.loadVersionHistory(activeDoc.path, { force: true });
        if (state.activeVersion !== 'principal') {
          try {
            const verRes = await fetch(
              `/api/versions/content?channel=${encodeURIComponent(state.activeChannel)}&path=${encodeURIComponent(activeDoc.path)}&ref=${encodeURIComponent(`ver:${state.activeVersion}`)}`,
              { cache: 'no-store' }
            );
            if (verRes.ok) {
              const verJson = await verRes.json();
              const parsed = MD.parseFrontmatter(verJson.content || '');
              state.dirtyMeta = Object.keys(parsed.meta).length ? parsed.meta : null;
              state.dirtyBody = parsed.body;
            } else {
              state.activeVersion = 'principal';
              state.dirtyMeta = null;
              state.dirtyBody = null;
              syncBrowserUrl({ replace: true });
              updateHeaderChrome();
            }
            if (state.view === 'scripts') {
              renderCurrentView();
            }
          } catch {
            // Ignora erro transitório ao recarregar variante
          }
        }
      }
    }

    if (source === 'fs') {
      showToast('Atualizado automaticamente do disco');
    }
  } catch {
    // Ignora erro transitório durante reload
  }
}

export function connectLiveEvents() {
  if (!state.serverMode || !globalThis.EventSource) return;
  closeLiveEvents();

  if (!liveLifecycleBound) {
    liveLifecycleBound = true;
    globalThis.addEventListener('pagehide', closeLiveEvents);
    globalThis.addEventListener('beforeunload', closeLiveEvents);
    globalThis.addEventListener('pageshow', (event) => {
      if (event.persisted && state.serverMode) {
        connectLiveEvents();
      }
    });
  }

  const es = new EventSource('/api/events');
  liveEventSource = es;

  const markConnected = () => {
    state.liveConnected = true;
    updateConnectionBadge();
  };

  es.onopen = markConnected;
  es.addEventListener('ready', markConnected);
  es.onerror = () => {
    state.liveConnected = false;
    updateConnectionBadge();
  };

  let pendingSource = '';
  es.addEventListener('update', (ev) => {
    let payload = {};
    try {
      payload = JSON.parse(ev.data || '{}');
    } catch {
      payload = {};
    }
    if (payload.source === 'fs') pendingSource = 'fs';
    else if (!pendingSource) pendingSource = payload.source || '';

    if (liveDebounceTimer) clearTimeout(liveDebounceTimer);
    liveDebounceTimer = setTimeout(() => {
      liveDebounceTimer = null;
      const src = pendingSource;
      pendingSource = '';
      handleLiveWorkspaceUpdate(src);
    }, 150);
  });
}
