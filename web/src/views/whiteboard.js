import { MD, STORAGE_KEY_PREFS } from '../core/constants.js';
import {
  renderCurrentView,
  setView,
  syncBrowserUrl,
  updateHeaderChrome,
} from '../core/router.js';
import {
  getActiveChannelData,
  normalizePayload,
  registerLifecycleHooks,
  registerViewRenderer,
  state,
} from '../core/state.js';
import { renderTabstrip, syncActiveTabFromState } from '../core/tabs.js';
import {
  formatDateTimePt,
  formatNumber,
  loadJsonStorage,
  saveJsonStorage,
  showToast,
} from '../core/utils.js';

let wbAutoSaveTimer = null;
let wbSaveInFlight = false;
let wbPendingBoardLoad = null;
let wbBoardModalMode = 'create'; // 'create' | 'rename'
let wbBoardModalTargetId = null;
const wbSnapshotWaiters = new Map();

export function getWbModalState() {
  return { mode: wbBoardModalMode, targetId: wbBoardModalTargetId };
}

export function clearWbModalTarget() {
  wbBoardModalTargetId = null;
}

export function updateWhiteboardSaveBadge() {
  const badge = document.getElementById('wbSaveBadge');
  if (!badge) return;
  badge.classList.remove('is-saved', 'is-saving', 'is-unsaved', 'is-error');
  if (state.boardSaveStatus === 'saving') {
    badge.classList.add('is-saving');
    badge.textContent = '● Salvando...';
  } else if (state.boardSaveStatus === 'unsaved') {
    badge.classList.add('is-unsaved');
    badge.textContent = '● Não salvo';
  } else if (state.boardSaveStatus === 'error') {
    badge.classList.add('is-error');
    badge.textContent = '✕ Erro ao salvar';
  } else {
    badge.classList.add('is-saved');
    badge.textContent = '✓ Salvo';
  }
}

export function syncWhiteboardTopbarUI() {
  const sel = document.getElementById('wbBoardSelect');
  if (sel) {
    sel.innerHTML = state.boardsList.length
      ? state.boardsList
          .map(
            (b) =>
              `<option value="${MD.escapeHtml(b.id)}"${b.id === state.activeBoardId ? ' selected' : ''}>${MD.escapeHtml(b.title)} (${b.elementCount ?? 0})</option>`
          )
          .join('')
      : '<option value="">Sem quadros ainda</option>';
  }

  const fullBtn = document.getElementById('wbModeFullBtn');
  const nodesBtn = document.getElementById('wbModeNodesBtn');
  if (fullBtn) fullBtn.classList.toggle('active', !state.boardNodeFocus);
  if (nodesBtn) nodesBtn.classList.toggle('active', Boolean(state.boardNodeFocus));

  const fsBtn = document.getElementById('wbFullscreenBtn');
  if (fsBtn) fsBtn.textContent = state.boardFullscreen ? '✕ Sair Tela Cheia' : '⛶ Tela Cheia';

  const shell = document.getElementById('wbShell');
  if (shell) shell.classList.toggle('is-wb-fullscreen', Boolean(state.boardFullscreen));
  document.body.classList.toggle('is-wb-fullscreen', Boolean(state.boardFullscreen && state.view === 'whiteboard'));

  updateWhiteboardSaveBadge();
}

export function buildScriptsSummaryList() {
  const docs = getActiveChannelData().docs || [];
  return docs.map((d) => ({
    id: d.meta.id,
    path: d.path,
    titulo: d.meta.titulo,
    status: d.meta.status,
    serie: d.meta.serie,
    resumo: d.meta.resumo,
    words: d.stats?.words || 0,
    duracao_estimada: d.meta.duracao_estimada || '',
  }));
}

export function postToExcalidrawFrame(payload) {
  const frame = document.getElementById('excalidrawFrame');
  if (!frame || !frame.contentWindow) return false;
  frame.contentWindow.postMessage(payload, globalThis.location.origin);
  return true;
}

export function postLoadSceneToFrame(boardData) {
  if (!boardData) return;
  if (!state.boardReady) {
    wbPendingBoardLoad = boardData;
    return;
  }
  wbPendingBoardLoad = null;
  postToExcalidrawFrame({
    type: 'wb:load-scene',
    boardId: boardData.board?.id || state.activeBoardId,
    title: boardData.board?.title || 'Quadro',
    scene: boardData.scene || { elements: [], appState: {}, files: {} },
    nodeFocus: Boolean(state.boardNodeFocus),
    scriptsList: buildScriptsSummaryList(),
  });
  if (state.pendingInsertDoc) {
    const docToInsert = state.pendingInsertDoc;
    state.pendingInsertDoc = null;
    setTimeout(() => {
      postToExcalidrawFrame({ type: 'wb:insert-script-node', doc: docToInsert });
      showToast(`Roteiro "${docToInsert.titulo}" inserido no quadro!`);
    }, 140);
  }
}

export function requestWhiteboardSnapshot(timeoutMs = 450) {
  const frame = document.getElementById('excalidrawFrame');
  if (!frame?.contentWindow || !state.boardReady) {
    return Promise.resolve(state.boardDirtyScene || state.boardActiveScene || null);
  }
  const requestId = `snap-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      wbSnapshotWaiters.delete(requestId);
      resolve(state.boardDirtyScene || state.boardActiveScene || null);
    }, timeoutMs);
    wbSnapshotWaiters.set(requestId, (scene) => {
      clearTimeout(timer);
      resolve(scene || state.boardDirtyScene || state.boardActiveScene || null);
    });
    postToExcalidrawFrame({ type: 'wb:request-snapshot', requestId });
  });
}

export async function saveActiveBoard({ reason = 'manual', forceSnapshot = false } = {}) {
  if (!state.serverMode || !state.activeBoardId) return false;
  if (wbAutoSaveTimer) {
    clearTimeout(wbAutoSaveTimer);
    wbAutoSaveTimer = null;
  }
  if (wbSaveInFlight) return false;
  wbSaveInFlight = true;

  const channel = state.activeChannel;
  const id = state.activeBoardId;
  state.boardSaveStatus = 'saving';
  updateWhiteboardSaveBadge();

  try {
    let scene = state.boardDirtyScene;
    if (forceSnapshot || !scene) {
      scene = await requestWhiteboardSnapshot();
    }
    if (!scene) scene = state.boardActiveScene || { elements: [], appState: {}, files: {} };

    const res = await fetch('/api/boards', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channel,
        id,
        elements: Array.isArray(scene.elements) ? scene.elements : [],
        appState: scene.appState || {},
        files: scene.files || {},
        preferredMode: state.boardNodeFocus ? 'nodes' : 'excalidraw',
      }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Erro ao salvar quadro');

    state.boardActiveScene = scene;
    state.boardDirtyScene = null;
    state.boardSaveStatus = 'saved';
    state.boardLastSavedAt = json.updatedAt || '';
    if (Array.isArray(json.boards)) state.boardsList = json.boards;
    if (json.state) state.data = normalizePayload(json.state);
    syncWhiteboardTopbarUI();
    postToExcalidrawFrame({ type: 'wb:saved-ack', updatedAt: json.updatedAt || '' });
    if (reason === 'manual') showToast('Quadro salvo!');
    return true;
  } catch (err) {
    state.boardSaveStatus = 'error';
    updateWhiteboardSaveBadge();
    if (reason === 'manual') showToast(err.message);
    return false;
  } finally {
    wbSaveInFlight = false;
  }
}

export function flushWhiteboardSaveOnLeave() {
  if (!state.serverMode || !state.activeBoardId || !state.boardDirtyScene) return;
  if (wbAutoSaveTimer) {
    clearTimeout(wbAutoSaveTimer);
    wbAutoSaveTimer = null;
  }
  const payload = {
    channel: state.activeChannel,
    id: state.activeBoardId,
    elements: Array.isArray(state.boardDirtyScene.elements) ? state.boardDirtyScene.elements : [],
    appState: state.boardDirtyScene.appState || {},
    files: state.boardDirtyScene.files || {},
    preferredMode: state.boardNodeFocus ? 'nodes' : 'excalidraw',
  };
  state.boardDirtyScene = null;
  try {
    fetch('/api/boards', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // ignora em unload
  }
}

export async function loadBoardIntoSession(boardId) {
  if (!state.serverMode || !boardId) return;
  const ch = state.activeChannel;
  try {
    const res = await fetch(
      `/api/boards/item?channel=${encodeURIComponent(ch)}&id=${encodeURIComponent(boardId)}`,
      { cache: 'no-store' }
    );
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Erro ao carregar quadro');
    if (state.activeChannel !== ch) return;

    state.activeBoardId = json.board.id;
    state.boardActiveScene = json.scene || { elements: [], appState: {}, files: {} };
    state.boardDirtyScene = null;
    state.boardNodeFocus = json.board.preferredMode === 'nodes';
    state.boardLastSavedAt = json.board.updatedAt || '';
    state.boardSaveStatus = 'saved';

    syncActiveTabFromState();
    syncBrowserUrl({ replace: true });
    syncWhiteboardTopbarUI();
    const frameEl = document.getElementById('excalidrawFrame');
    if (frameEl) {
      frameEl.dataset.loadedBoardId = json.board.id;
      frameEl.dataset.loadedChannel = ch;
    }
    postLoadSceneToFrame(json);
  } catch (err) {
    showToast(err.message);
    const frameEl = document.getElementById('excalidrawFrame');
    if (state.view === 'whiteboard' && (!frameEl || !frameEl.dataset.loadedBoardId)) {
      await backToWhiteboardList({ skipSave: true });
    }
  }
}

export async function fetchBoardsListForChannel(ch = state.activeChannel, { force = false } = {}) {
  if (!state.serverMode || state.wbListLoading) return state.boardsList;
  if (!force && state.wbListFetchedChannel === ch) return state.boardsList;
  state.wbListLoading = true;
  try {
    const res = await fetch(`/api/boards?channel=${encodeURIComponent(ch)}`, { cache: 'no-store' });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Erro ao listar quadros');
    if (state.activeChannel !== ch) return state.boardsList;
    state.boardsList = Array.isArray(json.boards) ? json.boards : [];
    state.wbListFetchedChannel = ch;
    if (state.data?.channels?.[ch]) {
      state.data.channels[ch].boards = state.boardsList;
    }
    if (state.view === 'whiteboard' && !state.activeBoardId) {
      updateWhiteboardListBodyOnly();
    } else if (state.view === 'whiteboard') {
      syncWhiteboardTopbarUI();
    }
    return state.boardsList;
  } catch (err) {
    showToast(err.message);
    return state.boardsList;
  } finally {
    state.wbListLoading = false;
  }
}

export function openBoardEditor(boardId) {
  if (!boardId) return;
  state.activeBoardId = boardId;
  state.boardDirtyScene = null;
  state.boardActiveScene = null;
  state.boardSaveStatus = 'saved';
  state.boardReady = false;
  syncActiveTabFromState();
  syncBrowserUrl({ replace: false });
  updateHeaderChrome();
  renderCurrentView();
}

export async function backToWhiteboardList({ skipSave = false } = {}) {
  if (!skipSave && state.serverMode && state.activeBoardId && state.boardDirtyScene) {
    await saveActiveBoard({ reason: 'leave-editor', forceSnapshot: false });
  }
  if (wbAutoSaveTimer) {
    clearTimeout(wbAutoSaveTimer);
    wbAutoSaveTimer = null;
  }
  if (state.boardFullscreen) {
    state.boardFullscreen = false;
    if (document.fullscreenElement && document.exitFullscreen) {
      document.exitFullscreen().catch(() => {});
    }
  }
  state.activeBoardId = null;
  state.boardDirtyScene = null;
  state.boardActiveScene = null;
  state.boardReady = false;
  state.boardSaveStatus = 'saved';
  state.wbListFetchedChannel = '';
  syncActiveTabFromState();
  syncBrowserUrl({ replace: false });
  updateHeaderChrome();
  renderCurrentView();
}

export async function initWhiteboardSession() {
  if (!state.serverMode) {
    syncWhiteboardTopbarUI();
    return;
  }
  const ch = state.activeChannel;
  try {
    const res = await fetch(`/api/boards?channel=${encodeURIComponent(ch)}`, { cache: 'no-store' });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Erro ao listar quadros');
    if (state.activeChannel !== ch) return;

    const boards = Array.isArray(json.boards) ? json.boards : [];
    state.boardsList = boards;
    state.wbListFetchedChannel = ch;
    if (state.data?.channels?.[ch]) {
      state.data.channels[ch].boards = boards;
    }

    if (state.activeBoardId) {
      await loadBoardIntoSession(state.activeBoardId);
    } else {
      syncWhiteboardTopbarUI();
    }
  } catch (err) {
    showToast(err.message);
  }
}

export function toggleWhiteboardFullscreen(forceVal) {
  const next = typeof forceVal === 'boolean' ? forceVal : !state.boardFullscreen;
  state.boardFullscreen = next;
  const shell = document.getElementById('wbShell');
  if (shell) {
    shell.classList.toggle('is-wb-fullscreen', next);
    if (next && !document.fullscreenElement && shell.requestFullscreen) {
      shell.requestFullscreen().catch(() => {});
    } else if (!next && document.fullscreenElement && document.exitFullscreen) {
      document.exitFullscreen().catch(() => {});
    }
  }
  document.body.classList.toggle('is-wb-fullscreen', Boolean(next && state.view === 'whiteboard'));
  syncWhiteboardTopbarUI();
  renderTabstrip();
}

export function openWbBoardModal(mode = 'create', targetBoardId = null) {
  if (!state.serverMode) {
    showToast('Gerenciar quadros requer o servidor local rodando.');
    return;
  }
  wbBoardModalMode = mode;
  wbBoardModalTargetId = mode === 'rename' ? targetBoardId || state.activeBoardId : null;
  const modal = document.getElementById('wbBoardModal');
  const titleEl = document.getElementById('wbBoardModalTitle');
  const nameInp = document.getElementById('wbBoardTitleInput');
  const slugField = document.getElementById('wbBoardSlugField');
  const slugInp = document.getElementById('wbBoardSlugInput');
  const modeField = document.getElementById('wbBoardModeField');
  const modeSel = document.getElementById('wbBoardModeSelect');
  const submitBtn = document.getElementById('wbBoardSubmitBtn');

  if (mode === 'rename') {
    const list = state.boardsList.length ? state.boardsList : getActiveChannelData().boards || [];
    const cur = list.find((b) => b.id === wbBoardModalTargetId);
    if (!cur) return;
    titleEl.textContent = 'Renomear Quadro';
    nameInp.value = cur.title || cur.id;
    slugInp.value = cur.id;
    slugInp.dataset.touched = '1';
    slugField.classList.remove('hidden');
    modeField.classList.add('hidden');
    submitBtn.textContent = 'Salvar Nome';
  } else {
    titleEl.textContent = 'Novo Quadro (Excalidraw)';
    nameInp.value = '';
    slugInp.value = '';
    delete slugInp.dataset.touched;
    slugField.classList.remove('hidden');
    modeField.classList.remove('hidden');
    modeSel.value = state.boardNodeFocus ? 'nodes' : 'excalidraw';
    submitBtn.textContent = 'Criar Quadro';
  }
  modal?.classList.remove('hidden');
  setTimeout(() => nameInp?.focus(), 30);
}

export function openWbDeleteConfirmModal(targetBoardId = null) {
  const targetId = targetBoardId || state.activeBoardId;
  if (!state.serverMode || !targetId) return;
  state.wbDeleteTargetId = targetId;
  const list = state.boardsList.length ? state.boardsList : getActiveChannelData().boards || [];
  const cur = list.find((b) => b.id === targetId);
  const nameSpan = document.getElementById('wbDeleteConfirmName');
  if (nameSpan) nameSpan.textContent = cur ? `${cur.title} (${cur.id})` : targetId;
  document.getElementById('wbDeleteConfirmModal')?.classList.remove('hidden');
}

export function openWbScriptPickerModal() {
  const modal = document.getElementById('wbScriptPickerModal');
  const searchInp = document.getElementById('wbScriptSearchInput');
  if (!modal) return;
  if (searchInp) searchInp.value = '';
  renderWbScriptPickerList('');
  modal.classList.remove('hidden');
  setTimeout(() => searchInp?.focus(), 30);
}

export function renderWbScriptPickerList(query = '') {
  const listEl = document.getElementById('wbScriptPickerList');
  if (!listEl) return;
  const docs = getActiveChannelData().docs || [];
  const q = query.trim().toLowerCase();
  const filtered = docs.filter(
    (d) => !q || `${d.meta.titulo} ${d.meta.serie} ${d.path} ${d.meta.resumo}`.toLowerCase().includes(q)
  );
  listEl.innerHTML = filtered.length
    ? filtered
        .map(
          (d) => `
            <button type="button" class="wb-script-picker-item" data-pick-script="${MD.escapeHtml(d.path)}">
              <div style="min-width:0; flex:1;">
                <div style="font-size:13px; font-weight:600; color:var(--text-1); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${MD.escapeHtml(d.meta.titulo)}</div>
                <div style="font-family:var(--font-mono); font-size:10.5px; color:var(--text-3); margin-top:2px;">${MD.escapeHtml(d.meta.serie || 'Geral')} • ${MD.escapeHtml(d.path)}</div>
              </div>
              <span class="status-pill st-${MD.escapeHtml(d.meta.status)}">${MD.escapeHtml(d.meta.status)}</span>
            </button>
          `
        )
        .join('')
    : '<p style="padding:18px; text-align:center; color:var(--text-3); margin:0;">Nenhum roteiro encontrado.</p>';

  listEl.querySelectorAll('[data-pick-script]').forEach((btn) => {
    btn.onclick = () => {
      const doc = docs.find((d) => d.path === btn.dataset.pickScript);
      document.getElementById('wbScriptPickerModal')?.classList.add('hidden');
      if (!doc) return;
      const payloadDoc = {
        id: doc.meta.id,
        path: doc.path,
        titulo: doc.meta.titulo,
        status: doc.meta.status,
        serie: doc.meta.serie,
        resumo: doc.meta.resumo,
        words: doc.stats?.words || 0,
        duracao_estimada: doc.meta.duracao_estimada || '',
      };
      postToExcalidrawFrame({ type: 'wb:insert-script-node', doc: payloadDoc });
      showToast(`Roteiro "${doc.meta.titulo}" inserido no quadro!`);
    };
  });
}

export async function sendDocToWhiteboard(doc) {
  if (!doc) return;
  const payloadDoc = {
    id: doc.meta.id,
    path: doc.path,
    titulo: doc.meta.titulo,
    status: doc.meta.status,
    serie: doc.meta.serie,
    resumo: doc.meta.resumo,
    words: doc.stats?.words || 0,
    duracao_estimada: doc.meta.duracao_estimada || '',
  };
  if (state.view === 'whiteboard' && state.activeBoardId && state.boardReady) {
    postToExcalidrawFrame({ type: 'wb:insert-script-node', doc: payloadDoc });
    showToast(`Roteiro "${doc.meta.titulo}" inserido no quadro!`);
    return;
  }
  state.pendingInsertDoc = payloadDoc;
  const list = state.boardsList.length ? state.boardsList : getActiveChannelData().boards || [];
  let targetBoardId = state.activeBoardId || list[0]?.id || null;
  if (!targetBoardId && state.serverMode) {
    try {
      const res = await fetch('/api/boards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel: state.activeChannel,
          id: 'quadro-principal',
          title: 'Quadro Principal',
          preferredMode: 'nodes',
          elements: [],
          appState: { viewBackgroundColor: '#ffffff', theme: 'dark', gridSize: 20 },
          files: {},
        }),
      });
      const created = await res.json();
      if (res.ok && created.board?.id) {
        state.boardsList = created.boards || [created.board];
        state.wbListFetchedChannel = state.activeChannel;
        targetBoardId = created.board.id;
      }
    } catch {
      // segue para lista caso falhe
    }
  }
  setView('whiteboard', null, { boardId: targetBoardId });
}

export async function importExcalidrawFile(file) {
  if (!file || !state.serverMode) return;
  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    const baseTitle = (
      parsed?.cromMeta?.title ||
      file.name.replace(/\.excalidraw(\.json)?$/i, '') ||
      'Quadro Importado'
    ).trim();
    const res = await fetch('/api/boards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channel: state.activeChannel,
        title: baseTitle,
        elements: Array.isArray(parsed.elements) ? parsed.elements : [],
        appState: parsed.appState || { viewBackgroundColor: '#0e0f17', theme: 'dark', gridSize: 20 },
        files: parsed.files || {},
        preferredMode: parsed?.cromMeta?.preferredMode === 'nodes' ? 'nodes' : 'excalidraw',
      }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Erro ao importar arquivo .excalidraw');
    state.boardsList = json.boards || [];
    state.wbListFetchedChannel = state.activeChannel;
    if (json.state) state.data = normalizePayload(json.state);
    showToast(`Quadro "${json.board.title}" importado!`);
    if (state.view === 'whiteboard' && state.activeBoardId && document.getElementById('excalidrawFrame')) {
      await loadBoardIntoSession(json.board.id);
    } else {
      openBoardEditor(json.board.id);
    }
  } catch (err) {
    showToast(`Falha na importação: ${err.message}`);
  }
}

export function handleWhiteboardMessage(e) {
  if (e.origin !== globalThis.location.origin) return;
  const msg = e.data;
  if (!msg || typeof msg.type !== 'string' || !msg.type.startsWith('wb:')) return;

  switch (msg.type) {
    case 'wb:ready':
      state.boardReady = true;
      if (wbPendingBoardLoad) {
        postLoadSceneToFrame(wbPendingBoardLoad);
      } else if (state.activeBoardId && state.boardActiveScene) {
        postLoadSceneToFrame({
          board: {
            id: state.activeBoardId,
            title: state.boardsList.find((b) => b.id === state.activeBoardId)?.title || 'Quadro',
          },
          scene: state.boardActiveScene,
        });
      }
      break;
    case 'wb:dirty':
      if (state.view !== 'whiteboard' || !state.activeBoardId) return;
      state.boardDirtyScene = msg.scene || null;
      state.boardSaveStatus = 'unsaved';
      updateWhiteboardSaveBadge();
      if (wbAutoSaveTimer) clearTimeout(wbAutoSaveTimer);
      wbAutoSaveTimer = setTimeout(() => {
        wbAutoSaveTimer = null;
        saveActiveBoard({ reason: 'auto' });
      }, 900);
      break;
    case 'wb:save-request':
      if (msg.scene) state.boardDirtyScene = msg.scene;
      saveActiveBoard({ reason: 'manual', forceSnapshot: !msg.scene });
      break;
    case 'wb:mode-changed':
      state.boardNodeFocus = Boolean(msg.nodeFocus);
      syncWhiteboardTopbarUI();
      saveActiveBoard({ reason: 'mode', forceSnapshot: true });
      break;
    case 'wb:request-script-picker':
      openWbScriptPickerModal();
      break;
    case 'wb:toggle-fullscreen':
      toggleWhiteboardFullscreen();
      break;
    case 'wb:snapshot': {
      const waiter = msg.requestId ? wbSnapshotWaiters.get(msg.requestId) : null;
      if (waiter) {
        wbSnapshotWaiters.delete(msg.requestId);
        waiter(msg.scene || null);
      }
      break;
    }
  }
}

export function getVisibleBoardsForList() {
  const ch = state.activeChannel;
  const allBoards =
    state.wbListFetchedChannel === ch
      ? state.boardsList
      : getActiveChannelData().boards || state.boardsList || [];
  const q = (state.wbListSearch || '').trim().toLowerCase();
  const modeFilter = state.wbListModeFilter || 'all';
  const filtered = allBoards.filter((b) => {
    const mode = b.preferredMode === 'nodes' ? 'nodes' : 'excalidraw';
    if (modeFilter !== 'all' && mode !== modeFilter) return false;
    if (!q) return true;
    const modeLabel = mode === 'nodes' ? 'foco em nodes' : 'excalidraw';
    return `${b.title || ''} ${b.id || ''} ${modeLabel}`.toLowerCase().includes(q);
  });
  return { allBoards, filtered, ch };
}

export function renderWhiteboardListCardsHtml(allBoards, filtered, ch) {
  const layout = state.prefs?.wbLayout === 'list' ? 'list' : 'grid';
  if (allBoards.length === 0) {
    return `
      <div class="glass-card wb-empty-state">
        <div class="wb-empty-icon">◈</div>
        <h3 style="margin:0; font-size:17px;">Nenhum quadro criado neste workspace</h3>
        <p style="margin:0; max-width:520px; color:var(--text-2); font-size:13px;">
          Crie um quadro visual Excalidraw (salvo automaticamente em <code>quadros/*.excalidraw</code>), importe um arquivo existente ou exporte o fluxograma dos roteiros.
        </p>
        <div class="wb-empty-actions">
          <button type="button" class="btn-sm btn-accent" id="wbEmptyCreateBtn">+ Criar Primeiro Quadro</button>
          <button type="button" class="btn-sm" id="wbEmptyImportBtn">⤒ Importar .excalidraw</button>
          <button type="button" class="btn-sm" id="wbEmptyMapBtn">Ver Fluxograma do Mapa</button>
        </div>
      </div>
    `;
  }
  if (filtered.length === 0) {
    return `
      <div class="glass-card wb-empty-state" style="padding:28px 20px;">
        <h3 style="margin:0; font-size:15px;">Nenhum quadro encontrado para esse filtro</h3>
        <p style="margin:0; color:var(--text-3); font-size:12.5px;">Tente outro termo de busca ou altere o filtro de modo.</p>
        <div class="wb-empty-actions">
          <button type="button" class="btn-sm" id="wbClearFiltersBtn">Limpar Filtros</button>
        </div>
      </div>
    `;
  }

  const wrapClass = layout === 'list' ? 'wb-boards-list' : 'wb-boards-grid';
  const cardExtraClass = layout === 'list' ? ' is-list-row' : '';
  const cardsHtml = filtered
    .map((b) => {
      const isNodes = b.preferredMode === 'nodes';
      const modeBadge = isNodes
        ? '<span class="wb-mode-badge is-nodes">◈ Foco em Nodes</span>'
        : '<span class="wb-mode-badge is-excalidraw">✎ Excalidraw</span>';
      const elCount = Number(b.elementCount || 0);
      const updatedLabel = formatDateTimePt(b.updatedAt);
      const ctxUrl = `/${ch}/quadro/${b.id}`;
      return `
        <article class="wb-board-card${cardExtraClass}" data-open-board="${MD.escapeHtml(b.id)}" data-context-url="${MD.escapeHtml(ctxUrl)}" tabindex="0" role="button" aria-label="Abrir quadro ${MD.escapeHtml(b.title || b.id)}">
          <div class="wb-board-card-main">
            <div class="wb-board-card-top">
              <h3 class="wb-board-title">${MD.escapeHtml(b.title || b.id)}</h3>
              ${modeBadge}
            </div>
            <div class="wb-board-slug-row">
              <span class="wb-board-file">${MD.escapeHtml(b.id)}.excalidraw</span>
            </div>
            <div class="wb-board-meta">
              <span>◆ ${formatNumber(elCount)} elemento${elCount === 1 ? '' : 's'}</span>
              <span>•</span>
              <span>Atualizado ${MD.escapeHtml(updatedLabel)}</span>
            </div>
          </div>
          <div class="wb-board-actions">
            <button type="button" class="btn-sm btn-accent" data-wb-open="${MD.escapeHtml(b.id)}">Abrir Editor</button>
            <button type="button" class="btn-sm" data-wb-rename="${MD.escapeHtml(b.id)}">Renomear</button>
            <button type="button" class="btn-sm btn-danger" data-wb-delete="${MD.escapeHtml(b.id)}">Excluir</button>
          </div>
        </article>
      `;
    })
    .join('');
  return `<div class="${wrapClass}">${cardsHtml}</div>`;
}

export function bindWhiteboardListCardEvents(rootEl) {
  if (!rootEl) return;
  rootEl.querySelectorAll('.wb-board-card[data-open-board]').forEach((card) => {
    card.onclick = (e) => {
      if (e.ctrlKey || e.metaKey || e.target.closest('button, a, input')) return;
      openBoardEditor(card.dataset.openBoard);
    };
    card.onkeydown = (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        if (e.target !== card) return;
        e.preventDefault();
        openBoardEditor(card.dataset.openBoard);
      }
    };
  });
  rootEl.querySelectorAll('[data-wb-open]').forEach((btn) => {
    btn.onclick = (e) => {
      e.stopPropagation();
      openBoardEditor(btn.dataset.wbOpen);
    };
  });
  rootEl.querySelectorAll('[data-wb-rename]').forEach((btn) => {
    btn.onclick = (e) => {
      e.stopPropagation();
      openWbBoardModal('rename', btn.dataset.wbRename);
    };
  });
  rootEl.querySelectorAll('[data-wb-delete]').forEach((btn) => {
    btn.onclick = (e) => {
      e.stopPropagation();
      openWbDeleteConfirmModal(btn.dataset.wbDelete);
    };
  });
  document.getElementById('wbEmptyCreateBtn')?.addEventListener('click', () => openWbBoardModal('create'));
  document.getElementById('wbEmptyImportBtn')?.addEventListener('click', () => {
    document.getElementById('wbListImportInput')?.click();
  });
  document.getElementById('wbEmptyMapBtn')?.addEventListener('click', () => {
    state.mapStyle = 'flowchart';
    setView('map');
  });
  document.getElementById('wbClearFiltersBtn')?.addEventListener('click', () => {
    state.wbListSearch = '';
    state.wbListModeFilter = 'all';
    renderWhiteboardListView(document.getElementById('viewContainer'));
  });
}

export function updateWhiteboardListBodyOnly() {
  const bodyEl = document.getElementById('wbBoardsContainer');
  const kpiEl = document.getElementById('wbListKpis');
  if (!bodyEl) return;
  const { allBoards, filtered, ch } = getVisibleBoardsForList();
  const totalElements = allBoards.reduce((acc, b) => acc + Number(b.elementCount || 0), 0);
  if (kpiEl) {
    kpiEl.innerHTML = `
      <span class="wb-kpi-pill"><strong>${formatNumber(allBoards.length)}</strong> quadro${allBoards.length === 1 ? '' : 's'}</span>
      <span class="wb-kpi-pill"><strong>${formatNumber(totalElements)}</strong> elemento${totalElements === 1 ? '' : 's'}</span>
      <span class="wb-kpi-pill">Pasta <code>quadros/</code></span>
    `;
  }
  bodyEl.innerHTML = renderWhiteboardListCardsHtml(allBoards, filtered, ch);
  bindWhiteboardListCardEvents(bodyEl);
}

export function renderWhiteboardListView(container) {
  if (!container) return;
  const { allBoards, filtered, ch } = getVisibleBoardsForList();
  const chData = getActiveChannelData();
  const chName = chData.channel?.name || ch;
  const totalElements = allBoards.reduce((acc, b) => acc + Number(b.elementCount || 0), 0);
  const layout = state.prefs?.wbLayout === 'list' ? 'list' : 'grid';

  container.innerHTML = `
    <section class="wb-list-page">
      <div class="glass-card wb-list-header">
        <div class="wb-list-head-top">
          <div>
            <h2 style="margin:0; font-size:20px;">Lista de Quadros • ${MD.escapeHtml(chName)}</h2>
            <p style="margin:4px 0 0; font-size:12.5px; color:var(--text-2);">
              Escolha um quadro salvo para abrir o editor Excalidraw ou Foco em Nodes, ou crie um novo canvas visual para roteiros e fluxos.
            </p>
          </div>
          <div class="wb-list-kpis" id="wbListKpis">
            <span class="wb-kpi-pill"><strong>${formatNumber(allBoards.length)}</strong> quadro${allBoards.length === 1 ? '' : 's'}</span>
            <span class="wb-kpi-pill"><strong>${formatNumber(totalElements)}</strong> elemento${totalElements === 1 ? '' : 's'}</span>
            <span class="wb-kpi-pill">Pasta <code>quadros/</code></span>
          </div>
        </div>

        <div class="wb-list-toolbar">
          <div class="wb-list-filters">
            <input type="search" class="search-box-sm wb-list-search" id="wbListSearch" placeholder="Buscar quadro por título ou id..." value="${MD.escapeHtml(state.wbListSearch || '')}">
            <div class="mode-switch" id="wbListModeFilter" aria-label="Filtrar modo do quadro">
              <button type="button" data-wb-mode="all" class="${state.wbListModeFilter === 'all' ? 'active' : ''}">Todos</button>
              <button type="button" data-wb-mode="excalidraw" class="${state.wbListModeFilter === 'excalidraw' ? 'active' : ''}">Excalidraw</button>
              <button type="button" data-wb-mode="nodes" class="${state.wbListModeFilter === 'nodes' ? 'active' : ''}">Foco em Nodes</button>
            </div>
            <div class="mode-switch" id="wbLayoutSwitch" aria-label="Alternar visualização Lista ou Grade">
              <button type="button" data-wb-layout="list" class="${layout === 'list' ? 'active' : ''}">☰ Lista</button>
              <button type="button" data-wb-layout="grid" class="${layout === 'grid' ? 'active' : ''}">▦ Grade</button>
            </div>
          </div>

          <div class="wb-list-actions">
            <button type="button" class="btn-sm btn-accent" id="wbListNewBtn">+ Novo Quadro</button>
            <button type="button" class="btn-sm" id="wbListImportBtn">⤒ Importar .excalidraw</button>
            <input type="file" id="wbListImportInput" accept=".excalidraw,.json" class="hidden">
          </div>
        </div>
      </div>

      <div id="wbBoardsContainer">
        ${renderWhiteboardListCardsHtml(allBoards, filtered, ch)}
      </div>
    </section>
  `;

  const searchInp = document.getElementById('wbListSearch');
  if (searchInp) {
    searchInp.oninput = () => {
      state.wbListSearch = searchInp.value;
      updateWhiteboardListBodyOnly();
    };
  }

  container.querySelectorAll('#wbListModeFilter [data-wb-mode]').forEach((btn) => {
    btn.onclick = () => {
      state.wbListModeFilter = btn.dataset.wbMode || 'all';
      container.querySelectorAll('#wbListModeFilter [data-wb-mode]').forEach((b) => b.classList.toggle('active', b === btn));
      updateWhiteboardListBodyOnly();
    };
  });

  container.querySelectorAll('#wbLayoutSwitch [data-wb-layout]').forEach((btn) => {
    btn.onclick = () => {
      const next = btn.dataset.wbLayout === 'list' ? 'list' : 'grid';
      state.prefs = { ...(state.prefs || {}), wbLayout: next };
      const saved = loadJsonStorage(STORAGE_KEY_PREFS, {});
      saved.wbLayout = next;
      saveJsonStorage(STORAGE_KEY_PREFS, saved);
      container.querySelectorAll('#wbLayoutSwitch [data-wb-layout]').forEach((b) => b.classList.toggle('active', b === btn));
      updateWhiteboardListBodyOnly();
    };
  });

  document.getElementById('wbListNewBtn')?.addEventListener('click', () => openWbBoardModal('create'));
  const listImportBtn = document.getElementById('wbListImportBtn');
  const listImportInp = document.getElementById('wbListImportInput');
  if (listImportBtn && listImportInp) {
    listImportBtn.onclick = () => listImportInp.click();
    listImportInp.onchange = () => {
      const file = listImportInp.files?.[0];
      if (file) importExcalidrawFile(file);
      listImportInp.value = '';
    };
  }

  bindWhiteboardListCardEvents(document.getElementById('wbBoardsContainer'));

  if (state.serverMode && state.wbListFetchedChannel !== ch) {
    fetchBoardsListForChannel(ch);
  }
}

export function renderWhiteboardView(container) {
  if (!state.serverMode) {
    container.innerHTML = `
      <div class="wb-shell" id="wbShell" style="align-items:center; justify-content:center; padding:32px; text-align:center;">
        <div class="glass-card" style="max-width:520px;">
          <h2 style="margin:0;">Quadro & Fluxos (Excalidraw Local)</h2>
          <p style="margin:8px 0 14px; color:var(--text-2);">
            O editor Excalidraw completo e o salvamento em <code>quadros/*.excalidraw</code> funcionam no servidor local do Studio (<code>./bin/crom-studio --tray</code> ou <code>npm start</code>).
          </p>
          <button type="button" class="btn-sm btn-accent" id="wbStandaloneBackBtn">Voltar ao Mapa de Roteiros</button>
        </div>
      </div>
    `;
    document.getElementById('wbStandaloneBackBtn')?.addEventListener('click', () => setView('map'));
    return;
  }

  if (!state.activeBoardId) {
    renderWhiteboardListView(container);
    return;
  }

  const existingFrame = document.getElementById('excalidrawFrame');
  if (existingFrame && container.contains(existingFrame)) {
    syncWhiteboardTopbarUI();
    if (
      existingFrame.dataset.loadedBoardId !== state.activeBoardId ||
      existingFrame.dataset.loadedChannel !== state.activeChannel
    ) {
      loadBoardIntoSession(state.activeBoardId);
    }
    return;
  }

  state.boardReady = false;
  wbPendingBoardLoad = null;

  container.innerHTML = `
    <div class="wb-shell${state.boardFullscreen ? ' is-wb-fullscreen' : ''}" id="wbShell">
      <div class="wb-topbar">
        <div class="wb-group">
          <button type="button" class="btn-sm wb-back-btn" id="wbBackToListBtn" title="Voltar para a Lista de Quadros">← Quadros</button>
          <select class="select-dark wb-select" id="wbBoardSelect" title="Selecionar quadro"></select>
          <button type="button" class="btn-sm" id="wbNewBtn">+ Novo</button>
          <button type="button" class="btn-sm" id="wbRenameBtn">Renomear</button>
          <button type="button" class="btn-sm btn-danger" id="wbDeleteBtn">Excluir</button>
          <button type="button" class="btn-sm" id="wbImportBtn">Importar .excalidraw</button>
          <input type="file" id="wbImportInput" accept=".excalidraw,.json" class="hidden">
        </div>

        <div class="wb-group">
          <div class="mode-switch" id="wbModeSwitch">
            <button type="button" id="wbModeFullBtn" class="${!state.boardNodeFocus ? 'active' : ''}">✎ Excalidraw Completo</button>
            <button type="button" id="wbModeNodesBtn" class="${state.boardNodeFocus ? 'active' : ''}">◈ Foco em Nodes</button>
          </div>
          <button type="button" class="btn-sm" id="wbInsertScriptBtn">📄 + Roteiro</button>
        </div>

        <div class="wb-group">
          <span class="wb-save-badge" id="wbSaveBadge">✓ Salvo</span>
          <button type="button" class="btn-sm btn-accent" id="wbSaveBtn">Salvar (Ctrl+S)</button>
          <button type="button" class="btn-sm" id="wbFullscreenBtn">⛶ Tela Cheia</button>
        </div>
      </div>

      <iframe id="excalidrawFrame" class="wb-iframe" src="/excalidraw-frame.html" title="Quadro Excalidraw"></iframe>
    </div>
  `;

  document.getElementById('wbBackToListBtn')?.addEventListener('click', () => backToWhiteboardList());

  const sel = document.getElementById('wbBoardSelect');
  if (sel) {
    sel.onchange = async () => {
      const nextId = sel.value;
      if (!nextId || nextId === state.activeBoardId) return;
      if (state.boardDirtyScene) {
        await saveActiveBoard({ reason: 'switch-board' });
      }
      await loadBoardIntoSession(nextId);
    };
  }

  document.getElementById('wbNewBtn')?.addEventListener('click', () => openWbBoardModal('create'));
  document.getElementById('wbRenameBtn')?.addEventListener('click', () => openWbBoardModal('rename', state.activeBoardId));
  document.getElementById('wbDeleteBtn')?.addEventListener('click', () => openWbDeleteConfirmModal(state.activeBoardId));

  const importBtn = document.getElementById('wbImportBtn');
  const importInput = document.getElementById('wbImportInput');
  if (importBtn && importInput) {
    importBtn.onclick = () => importInput.click();
    importInput.onchange = () => {
      const file = importInput.files?.[0];
      if (file) importExcalidrawFile(file);
      importInput.value = '';
    };
  }

  document.getElementById('wbModeFullBtn')?.addEventListener('click', () => {
    if (!state.boardNodeFocus) return;
    state.boardNodeFocus = false;
    syncWhiteboardTopbarUI();
    postToExcalidrawFrame({ type: 'wb:set-node-focus', nodeFocus: false });
    saveActiveBoard({ reason: 'mode', forceSnapshot: true });
  });

  document.getElementById('wbModeNodesBtn')?.addEventListener('click', () => {
    if (state.boardNodeFocus) return;
    state.boardNodeFocus = true;
    syncWhiteboardTopbarUI();
    postToExcalidrawFrame({ type: 'wb:set-node-focus', nodeFocus: true });
    saveActiveBoard({ reason: 'mode', forceSnapshot: true });
  });

  document.getElementById('wbInsertScriptBtn')?.addEventListener('click', () => openWbScriptPickerModal());
  document.getElementById('wbSaveBtn')?.addEventListener('click', () => saveActiveBoard({ reason: 'manual', forceSnapshot: true }));
  document.getElementById('wbFullscreenBtn')?.addEventListener('click', () => toggleWhiteboardFullscreen());

  syncWhiteboardTopbarUI();
  initWhiteboardSession();
}

registerLifecycleHooks({
  flushWhiteboardSaveOnLeave,
  loadBoardIntoSession,
  fetchBoardsListForChannel,
  syncWhiteboardTopbarUI,
  openBoardEditor,
  sendDocToWhiteboard,
  openWbBoardModal,
  openWbDeleteConfirmModal,
});
registerViewRenderer('whiteboard', renderWhiteboardView);
