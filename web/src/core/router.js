import {
  MD,
  SLUG_TO_VIEW,
  STORAGE_KEY_PREFS,
  VIEW_TITLES,
  VIEW_TO_SLUG,
} from './constants.js';
import {
  applyLocalDraftOverrides,
  getActiveChannelData,
  getActiveDoc,
  getChannelInitials,
  getChannelKeys,
  getLifecycleHooks,
  getViewRenderer,
  initSelectedSeriesForChannel,
  normalizePayload,
  registerLifecycleHooks,
  state,
} from './state.js';
import {
  initTabsFromStorage,
  renderTabstrip,
  syncActiveTabFromState,
} from './tabs.js';
import {
  formatNumber,
  isYouTubeUrl,
  loadJsonStorage,
  saveJsonStorage,
  showToast,
} from './utils.js';

export function findDocMatchInChannel(chData, rawDocSlug) {
  if (!rawDocSlug || !chData?.docs?.length) return null;
  const cleaned = decodeURIComponent(String(rawDocSlug)).replace(/^\/+|\/+$/g, '');
  const withMd = cleaned.toLowerCase().endsWith('.md') ? cleaned : `${cleaned}.md`;
  return (
    chData.docs.find((d) => d.path === cleaned || d.path === withMd) ||
    chData.docs.find((d) => d.path.toLowerCase() === withMd.toLowerCase()) ||
    chData.docs.find((d) => d.meta.id === cleaned || d.filename.replace(/\.md$/i, '') === cleaned) ||
    null
  );
}

export function applyRecorderScriptPreselect(chData, roteiroPath) {
  if (!roteiroPath) return;
  const matched = findDocMatchInChannel(chData, roteiroPath);
  const targetPath = matched ? matched.path : String(roteiroPath);
  state.recorder.linkedDocPath = targetPath;
  const suggestedTitle = matched?.meta?.titulo || '';
  if (
    suggestedTitle &&
    (!state.recorder.titleDraft || state.recorder.titleDraft === state.recorder.autoSuggestedTitle)
  ) {
    state.recorder.titleDraft = suggestedTitle;
    state.recorder.autoSuggestedTitle = suggestedTitle;
  }
}

export function parseRouteFromLocation(data) {
  const channels = data.channels || {};
  const params = new URLSearchParams(globalThis.location.search);
  const paramCanal = (params.get('canal') || params.get('channel') || '').trim().toLowerCase();

  let rawSegs = [];
  if (globalThis.location.protocol.startsWith('http')) {
    rawSegs = globalThis.location.pathname
      .split('/')
      .filter(Boolean)
      .map((s) => decodeURIComponent(s));
  } else if (globalThis.location.hash && globalThis.location.hash.startsWith('#/')) {
    rawSegs = globalThis.location.hash
      .slice(2)
      .split('/')
      .filter(Boolean)
      .map((s) => decodeURIComponent(s));
  }

  let channelKey = null;
  if (rawSegs.length > 0 && channels[rawSegs[0].toLowerCase()]) {
    channelKey = rawSegs[0].toLowerCase();
    rawSegs = rawSegs.slice(1);
  } else if (paramCanal && channels[paramCanal]) {
    channelKey = paramCanal;
  } else {
    const saved = loadJsonStorage(STORAGE_KEY_PREFS, {});
    if (saved.activeChannel && channels[saved.activeChannel]) channelKey = saved.activeChannel;
    else if (data.defaultChannel && channels[data.defaultChannel]) channelKey = data.defaultChannel;
    else channelKey = Object.keys(channels)[0] || 'mrj';
  }

  let view = 'dashboard';
  let docPath = null;
  let boardId = null;
  if (rawSegs.length > 0) {
    const viewSlug = rawSegs[0].toLowerCase();
    if (SLUG_TO_VIEW[viewSlug]) {
      view = SLUG_TO_VIEW[viewSlug];
      if (view === 'scripts' && rawSegs.length > 1) {
        const matched = findDocMatchInChannel(channels[channelKey], rawSegs.slice(1).join('/'));
        if (matched) docPath = matched.path;
      } else if (view === 'whiteboard' && rawSegs.length > 1) {
        const maybeBoard = rawSegs[1].trim().toLowerCase();
        if (maybeBoard) boardId = maybeBoard;
      }
    }
  }

  const modoParam = (params.get('modo') || '').toLowerCase();
  const modoMap = {
    ler: 'read',
    read: 'read',
    editar: 'edit',
    edit: 'edit',
    teleprompter: 'prompter',
    prompter: 'prompter',
    historico: 'history',
    history: 'history',
  };
  const docMode = modoMap[modoParam] || null;
  const verParam = params.get('versao') || null;
  const focusParam = params.get('foco') === '1';
  const linkUrl = params.get('url') || '';
  const linkTitle = params.get('titulo') || '';
  const roteiroPath = params.get('roteiro') || null;

  return {
    channelKey,
    view,
    docPath,
    docMode,
    verParam,
    focusMode: focusParam,
    boardId,
    linkUrl,
    linkTitle,
    roteiroPath,
  };
}

export function buildFriendlyUrl(
  channelKey = state.activeChannel,
  view = state.view,
  docPath = state.selectedDocPath,
  boardId = state.activeBoardId
) {
  const ch = channelKey || 'mrj';
  const viewSlug = VIEW_TO_SLUG[view] || 'visao-geral';
  let routePath = view === 'dashboard' ? `/${ch}` : `/${ch}/${viewSlug}`;
  if (view === 'scripts' && docPath) {
    routePath += `/${docPath.split('/').map(encodeURIComponent).join('/')}`;
  } else if (view === 'whiteboard' && boardId) {
    routePath += `/${encodeURIComponent(boardId)}`;
  }

  const qs = new URLSearchParams();
  if (view === 'scripts') {
    const modeNames = { read: 'ler', edit: 'editar', prompter: 'teleprompter', history: 'historico' };
    if (state.docMode && state.docMode !== 'read') qs.set('modo', modeNames[state.docMode] || state.docMode);
    if (state.activeVersion && state.activeVersion !== 'principal') qs.set('versao', state.activeVersion);
    if (state.focusMode) qs.set('foco', '1');
  } else if (view === 'recorder' && state.recorder?.linkedDocPath) {
    qs.set('roteiro', state.recorder.linkedDocPath);
  } else if (view === 'link' && state.activeLinkTab?.externalUrl) {
    qs.set('url', state.activeLinkTab.externalUrl);
    if (state.activeLinkTab.title) qs.set('titulo', state.activeLinkTab.title);
  }
  const queryStr = qs.toString() ? `?${qs.toString()}` : '';

  if (globalThis.location.protocol.startsWith('http')) {
    return `${routePath}${queryStr}`;
  }
  return `#${routePath}${queryStr}`;
}

export function syncBrowserUrl({ replace = false } = {}) {
  try {
    const target = buildFriendlyUrl();
    if (globalThis.location.protocol.startsWith('http')) {
      if (globalThis.location.pathname + globalThis.location.search === target) return;
      if (replace) globalThis.history.replaceState(null, '', target);
      else globalThis.history.pushState(null, '', target);
    } else if (globalThis.location.hash !== target) {
      globalThis.history.replaceState(null, '', target);
    }
  } catch {
    // ignora em contextos restritos
  }
}

export function resolveInitialChannel(data) {
  return parseRouteFromLocation(data).channelKey;
}

export function applyRouteSnapshot(route) {
  state.activeChannel = route.channelKey;
  state.view = route.view || 'dashboard';
  state.selectedDocPath = route.docPath || null;
  state.docMode = route.docMode || 'read';
  state.activeVersion = route.verParam || 'principal';
  state.focusMode = Boolean(route.focusMode && state.view === 'scripts');
  state.activeBoardId = route.boardId || null;
  state.boardDirtyScene = null;
  state.boardActiveScene = null;
  state.boardSaveStatus = 'saved';
  state.boardFullscreen = false;
  state.mapFlowFullscreen = false;
  if (state.view === 'link' && route.linkUrl) {
    state.activeLinkTab = {
      id: state.activeTabId || 'link',
      kind: 'link',
      channel: route.channelKey,
      view: 'link',
      externalUrl: route.linkUrl,
      title: route.linkTitle || route.linkUrl,
      icon: isYouTubeUrl(route.linkUrl) ? '▶' : '↗',
    };
  } else if (state.view !== 'link') {
    state.activeLinkTab = null;
  }
  if (state.view === 'recorder' && route.roteiroPath) {
    applyRecorderScriptPreselect(state.data?.channels?.[route.channelKey], route.roteiroPath);
  }
  state.dirtyBody = null;
  state.dirtyMeta = null;
  state.hasUnsavedEdits = false;
  state.versionHistory = null;
  state.versionFetchedKey = '';
  state.diffDocPath = '';
  state.diffFromRef = null;
  state.diffToRef = null;
  state.diffResult = null;
  state.selectedRevPreview = null;
  state.revPreviewContent = null;
  state.commitMessageDraft = '';
  if (!state.settingsChannelKey) state.settingsChannelKey = route.channelKey;
  initSelectedSeriesForChannel(getActiveChannelData());
}

export async function loadInitialData() {
  if (globalThis.location.protocol.startsWith('http')) {
    try {
      const res = await fetch('/api/state', { cache: 'no-store' });
      if (res.ok) {
        const json = await res.json();
        state.serverMode = true;
        state.data = normalizePayload(json);
        const route = parseRouteFromLocation(state.data);
        applyRouteSnapshot(route);
        initTabsFromStorage(route);
        if (route.view === 'recorder' && route.roteiroPath) {
          applyRecorderScriptPreselect(state.data?.channels?.[route.channelKey], route.roteiroPath);
        }
        syncBrowserUrl({ replace: true });
        return;
      }
    } catch {
      // Fallback para window.CROM_STUDIO_DATA
    }
  }

  state.serverMode = false;
  const rawGlobal = globalThis.CROM_STUDIO_DATA || globalThis.MRJ_STUDIO_DATA || {};
  const normalized = normalizePayload(structuredClone(rawGlobal));
  state.data = applyLocalDraftOverrides(normalized);
  const route = parseRouteFromLocation(state.data);
  applyRouteSnapshot(route);
  initTabsFromStorage(route);
  if (route.view === 'recorder' && route.roteiroPath) {
    applyRecorderScriptPreselect(state.data?.channels?.[route.channelKey], route.roteiroPath);
  }
  syncBrowserUrl({ replace: true });
}

export function updateConnectionBadge() {
  const connBtn = document.getElementById('connectionModeBtn');
  const connLbl = document.getElementById('connectionModeLabel');
  if (!connBtn || !connLbl) return;
  if (state.serverMode) {
    connBtn.classList.add('is-live');
    connLbl.textContent = state.liveConnected ? 'Disco • Ao Vivo' : 'Disco (Local)';
  } else if (state.dirHandle) {
    connBtn.classList.add('is-live');
    connLbl.textContent = 'Pasta Conectada';
  } else {
    connBtn.classList.remove('is-live');
    connLbl.textContent = 'Standalone';
  }
}

export function updateRemoteChip() {
  const chip = document.getElementById('remoteLiveChip');
  const offChip = document.getElementById('remoteNgrokOffChip');
  if (!chip) return;
  const rs = state.remoteStatus;
  if (!state.serverMode || !rs || (!rs.lanEnabled && !rs.ngrokActive)) {
    chip.classList.add('hidden');
    chip.innerHTML = '';
    if (offChip) offChip.classList.add('hidden');
    return;
  }

  const parts = [];
  if (rs.lanEnabled) parts.push('Wi-Fi LAN');
  if (rs.ngrokActive) parts.push('ngrok ON');
  chip.classList.remove('hidden');
  chip.classList.toggle('is-remote-on', Boolean(rs.lanEnabled && !rs.ngrokActive));
  chip.classList.toggle('is-remote-ngrok', Boolean(rs.ngrokActive));
  chip.innerHTML = `<span class="remote-live-dot"></span><span>${MD.escapeHtml(parts.join(' • '))}${rs.pinEnabled && rs.pinConfigured ? ' 🔒' : ''}</span>`;
  chip.title = [rs.lanUrl ? `LAN: ${rs.lanUrl}` : '', rs.ngrokUrl ? `ngrok: ${rs.ngrokUrl}` : '']
    .filter(Boolean)
    .join(' | ');

  if (offChip) {
    offChip.classList.toggle('hidden', !rs.ngrokActive);
  }
}

export function renderChannelSwitchers() {
  const keys = getChannelKeys();
  const channels = state.data?.channels || {};

  const sideEl = document.getElementById('sidebarChannelSwitcher');
  if (sideEl) {
    sideEl.innerHTML = keys
      .map((k) => {
        const ch = channels[k].channel || {};
        const active = k === state.activeChannel;
        const isPaused = ch.status === 'pausado';
        const isHidden = ch.status === 'oculto';
        const statusLabel = ch.statusLabel || (isPaused ? 'Pausado' : 'Ativo');
        const initials = getChannelInitials(ch);
        return `
          <button type="button" class="channel-rail-btn${active ? ' is-active' : ''}" data-switch-channel="${MD.escapeHtml(k)}" title="${MD.escapeHtml(ch.name)} (${MD.escapeHtml(ch.handle)})${isHidden ? '' : ` — ${MD.escapeHtml(statusLabel)}`}">
            ${ch.avatar
              ? `<img src="${MD.escapeHtml(ch.avatar)}" alt="${MD.escapeHtml(ch.name)}" referrerpolicy="no-referrer" onerror="this.classList.add('is-broken')"><span class="channel-rail-fallback">${MD.escapeHtml(initials)}</span>`
              : `<span class="channel-rail-fallback only">${MD.escapeHtml(initials)}</span>`
            }
            ${isHidden ? '' : `<span class="channel-rail-dot${isPaused ? ' is-paused' : ''}"></span>`}
          </button>
        `;
      })
      .join('');
  }

  const headEl = document.getElementById('headerChannelSwitcher');
  if (headEl) {
    headEl.innerHTML = keys
      .map((k) => {
        const ch = channels[k].channel || {};
        const active = k === state.activeChannel;
        const isPaused = ch.status === 'pausado';
        const isHidden = ch.status === 'oculto';
        const badgeText = ch.statusLabel || (isPaused ? 'PAUSADO' : 'ATIVO');
        const initials = getChannelInitials(ch);
        const badgeHtml = isHidden
          ? ''
          : `<span class="channel-status-badge ${isPaused ? 'is-pausado' : 'is-ativo'}">${MD.escapeHtml(badgeText)}</span>`;
        return `
          <button type="button" class="channel-pill${active ? ' is-active' : ''}" data-switch-channel="${MD.escapeHtml(k)}" title="Alternar para ${MD.escapeHtml(ch.name)}">
            <span class="channel-pill-avatar">
              ${ch.avatar
                ? `<img src="${MD.escapeHtml(ch.avatar)}" alt="${MD.escapeHtml(ch.name)}" referrerpolicy="no-referrer" onerror="this.classList.add('is-broken'); if(this.nextElementSibling) this.nextElementSibling.style.display='block';"><span class="avatar-fallback">${MD.escapeHtml(initials)}</span>`
                : `<span>${MD.escapeHtml(initials)}</span>`
              }
            </span>
            <span>${MD.escapeHtml(ch.name)}</span>
            <span class="channel-pill-handle">${MD.escapeHtml(ch.handle)}</span>
            ${badgeHtml}
          </button>
        `;
      })
      .join('');
  }

  const wsMenuListEl = document.getElementById('workspaceMenuList');
  if (wsMenuListEl) {
    wsMenuListEl.innerHTML = keys
      .map((k) => {
        const entry = channels[k] || {};
        const ch = entry.channel || {};
        const active = k === state.activeChannel;
        const isPaused = ch.status === 'pausado';
        const isHidden = ch.status === 'oculto';
        const badgeText = ch.statusLabel || (isPaused ? 'PAUSADO' : 'ATIVO');
        const docCount = (entry.docs || []).length;
        const initials = getChannelInitials(ch);
        const badgeHtml = isHidden
          ? ''
          : `<span class="channel-status-badge ${isPaused ? 'is-pausado' : 'is-ativo'}">${MD.escapeHtml(badgeText)}</span>`;
        return `
          <button type="button" class="ws-pop-item${active ? ' is-active' : ''}" data-switch-channel="${MD.escapeHtml(k)}" role="menuitem">
            <span class="ws-pop-avatar">
              ${ch.avatar
                ? `<img src="${MD.escapeHtml(ch.avatar)}" alt="${MD.escapeHtml(ch.name || k)}" referrerpolicy="no-referrer" onerror="this.classList.add('is-broken')"><span class="avatar-fallback">${MD.escapeHtml(initials)}</span>`
                : `<img class="is-broken" alt=""><span class="avatar-fallback">${MD.escapeHtml(initials)}</span>`
              }
            </span>
            <span class="ws-pop-meta">
              <span class="ws-pop-name" style="display:flex; align-items:center; gap:6px;">
                <span style="overflow:hidden; text-overflow:ellipsis;">${MD.escapeHtml(ch.name || k)}</span>
                ${badgeHtml}
              </span>
              <span class="ws-pop-sub">${MD.escapeHtml(ch.handle || k)} • ${docCount} .md</span>
            </span>
            ${active ? '<span style="color:var(--accent); font-size:13px; font-weight:700; flex-shrink:0;" aria-label="Ativo">✓</span>' : ''}
          </button>
        `;
      })
      .join('');
  }

  document.querySelectorAll('[data-switch-channel]').forEach((btn) => {
    btn.onclick = () => {
      document.getElementById('workspaceMenu')?.classList.add('hidden');
      document.getElementById('channelAvatarBtn')?.setAttribute('aria-expanded', 'false');
      const target = btn.dataset.switchChannel;
      if (target && target !== state.activeChannel) {
        switchChannel(target);
      }
    };
  });
}

export function updateHeaderChrome() {
  const chData = getActiveChannelData();
  const docs = chData.docs || [];
  const videos = chData.videos || [];
  const channel = chData.channel || {};

  document.title = `Crom YouTube Studio — ${channel.name || chData.key} (${channel.handle || ''})`;
  const titleEl = document.getElementById('pageTitle');
  if (titleEl) titleEl.textContent = VIEW_TITLES[state.view] || 'Crom YouTube Studio';
  const navCountEl = document.getElementById('navDocsCount');
  if (navCountEl) navCountEl.textContent = docs.length;

  renderChannelSwitchers();

  const inProd = docs.filter((d) => ['roteiro', 'gravando', 'edicao'].includes(d.meta.status)).length;
  const totalViews = videos.reduce((acc, v) => acc + Number(v.views || 0), 0);
  const totalVideos = Number(channel.totalVideos || videos.length || 0);

  const hkProdValue = document.getElementById('hkProdValue');
  const hkProdSub = document.getElementById('hkProdSub');
  if (hkProdValue) hkProdValue.textContent = formatNumber(inProd);
  if (hkProdSub) hkProdSub.textContent = inProd === 1 ? 'ativo' : 'ativos';

  const viewsLbl = document.getElementById('hkViewsLabel');
  const viewsVal = document.getElementById('hkViewsValue');
  const viewsSub = document.getElementById('hkViewsSub');
  if (viewsLbl && viewsVal && viewsSub) {
    if (totalVideos > videos.length) {
      viewsLbl.textContent = 'canal público';
      viewsVal.textContent = `${formatNumber(totalVideos)} vídeos`;
      viewsSub.textContent = `${formatNumber(channel.subscribers || 0)} inscritos`;
    } else {
      viewsLbl.textContent = 'alcance total';
      viewsVal.textContent = formatNumber(totalViews);
      viewsSub.textContent = `${formatNumber(channel.subscribers || 0)} inscritos`;
    }
  }

  updateConnectionBadge();

  const avatarImg = document.getElementById('channelAvatarImg');
  const avatarFallback = document.getElementById('channelAvatarFallback');
  if (avatarFallback) avatarFallback.textContent = getChannelInitials(channel);
  if (avatarImg) {
    if (channel.avatar) {
      avatarImg.classList.remove('is-broken');
      if (avatarImg.dataset.currentSrc !== channel.avatar) {
        avatarImg.dataset.currentSrc = channel.avatar;
        avatarImg.src = channel.avatar;
        avatarImg.onerror = () => avatarImg.classList.add('is-broken');
      }
    } else {
      avatarImg.dataset.currentSrc = '';
      avatarImg.removeAttribute('src');
      avatarImg.classList.add('is-broken');
    }
  }

  const avatarDot = document.getElementById('channelAvatarDot');
  if (avatarDot) {
    avatarDot.classList.toggle('is-hidden', channel.status === 'oculto');
    avatarDot.classList.toggle('is-paused', channel.status === 'pausado');
  }

  const pendingAlerts = docs.filter((d) => ['gravando', 'edicao', 'roteiro'].includes(d.meta.status)).length;
  const notifCountEl = document.getElementById('notifCount');
  if (notifCountEl) notifCountEl.textContent = pendingAlerts;

  const appEl = document.getElementById('app');
  const wbEditorOpen = state.view === 'whiteboard' && Boolean(state.activeBoardId);
  if (appEl) {
    appEl.className = `studio-shell view-${state.view}${state.focusMode ? ' is-focus-mode' : ''}${wbEditorOpen ? ' is-wb-editor-open' : ''}`;
  }
  document.body.classList.toggle('is-focus-mode', Boolean(state.focusMode));
  document.body.classList.toggle('is-whiteboard-view', state.view === 'whiteboard');
  document.body.classList.toggle('is-whiteboard-editor', wbEditorOpen);
  document.body.classList.toggle('is-wb-fullscreen', Boolean(state.boardFullscreen && wbEditorOpen));
  document.body.classList.toggle(
    'is-flow-fullscreen',
    Boolean(state.mapFlowFullscreen && state.view === 'map' && state.mapStyle === 'flowchart')
  );
  updateRemoteChip();

  const topChip = document.getElementById('topbarChannelChip');
  if (topChip) {
    const isPaused = channel.status === 'pausado';
    const isHidden = channel.status === 'oculto';
    const statusText = channel.statusLabel || (isPaused ? 'PAUSADO' : 'ATIVO');
    const badgeHtml = isHidden
      ? ''
      : `<span class="channel-status-badge ${isPaused ? 'is-pausado' : 'is-ativo'}">${MD.escapeHtml(statusText)}</span>`;
    topChip.innerHTML = `<strong>${MD.escapeHtml(channel.name || chData.key)}</strong> <span>${MD.escapeHtml(channel.handle || '')}</span> ${badgeHtml}`;
  }

  const fabVerBtn = document.getElementById('fabVersionActionBtn');
  if (fabVerBtn) {
    fabVerBtn.classList.toggle('hidden', !(state.view === 'scripts' && !!getActiveDoc()));
  }

  document.querySelectorAll('#sideNav .nav-item').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.view === state.view);
  });

  renderTabstrip();
}

export function renderCurrentView() {
  const container = document.getElementById('viewContainer');
  if (!container) return;
  const renderer = getViewRenderer(state.view);
  if (renderer) renderer(container);
}

export function switchChannel(channelKey, { preserveView = true } = {}) {
  if (!state.data?.channels?.[channelKey]) return;
  const hooks = getLifecycleHooks();
  hooks.stopPrompter();
  if (state.view === 'whiteboard' && state.boardDirtyScene) {
    hooks.flushWhiteboardSaveOnLeave();
  }

  state.activeChannel = channelKey;
  state.selectedDocPath = null;
  state.activeBoardId = null;
  state.boardsList = [];
  state.wbListLoading = false;
  state.wbListFetchedChannel = '';
  state.wbDeleteTargetId = null;
  state.boardDirtyScene = null;
  state.boardActiveScene = null;
  state.boardSaveStatus = 'saved';
  state.boardReady = false;
  state.boardFullscreen = false;
  state.mapFlowFullscreen = false;
  state.mapFlowAutoFitKey = '';
  state.activeVersion = 'principal';
  state.versionHistory = null;
  state.versionFetchedKey = '';
  state.diffDocPath = '';
  state.diffFromRef = null;
  state.diffToRef = null;
  state.diffResult = null;
  state.selectedRevPreview = null;
  state.revPreviewContent = null;
  state.commitMessageDraft = '';
  state.dirtyBody = null;
  state.dirtyMeta = null;
  state.hasUnsavedEdits = false;
  state.settingsChannelKey = channelKey;
  state.trashItems = [];
  state.trashChannel = '';
  state.focusMode = false;
  state.historyStatusFilter = 'all';
  state.historyFolderFilter = 'all';
  state.scriptsSearch = '';
  state.scriptsStatusFilter = 'all';
  state.scriptsFolderFilter = 'all';
  state.catalogFilter = 'all';
  state.catalogSearch = '';
  state.catalogCategoryFilter = 'all';
  state.catalogStatusFilter = 'all';
  state.catalogExpandedPlaylistId = null;
  state.recorder.activePlayer = null;
  state.recorder.linkedDocPath = '';
  state.recorder.titleDraft = '';
  state.recorder.autoSuggestedTitle = '';
  state.recorder.sessions = [];
  state.recorder.sessionsChannel = '';
  state.notesState.composerExpanded = false;
  state.notesState.notes = [];
  state.notesState.channel = '';
  state.chartHoverIdx = null;
  state.agentSelectedDoc = '';
  if (!preserveView || state.view === 'link') {
    state.view = 'dashboard';
    state.activeLinkTab = null;
    state.tabBarPinned = null;
  }

  initSelectedSeriesForChannel(getActiveChannelData());

  const prefs = loadJsonStorage(STORAGE_KEY_PREFS, {});
  prefs.activeChannel = channelKey;
  saveJsonStorage(STORAGE_KEY_PREFS, prefs);

  syncActiveTabFromState();
  syncBrowserUrl({ replace: false });
  updateHeaderChrome();
  renderCurrentView();
  const ch = getActiveChannelData().channel;
  showToast(`Workspace alternado para ${ch.name} (${ch.handle})`);
}

export function setView(
  viewName,
  docPath = null,
  { replaceUrl = false, boardId = undefined, roteiroPath = undefined } = {}
) {
  const hooks = getLifecycleHooks();
  const prevView = state.view;
  hooks.stopPrompter();
  hooks.cleanupMapFlowObservers();
  if (
    prevView === 'whiteboard' &&
    state.boardDirtyScene &&
    (viewName !== 'whiteboard' || (boardId !== undefined && boardId !== state.activeBoardId))
  ) {
    hooks.flushWhiteboardSaveOnLeave();
  }
  if (prevView === 'recorder' && viewName !== 'recorder' && state.recorder.status === 'idle') {
    hooks.stopRecorderMediaStreams();
  }
  if (viewName !== prevView) {
    state.tabBarPinned = null;
  }
  state.view = viewName;
  if (viewName !== 'scripts') state.focusMode = false;
  if (viewName !== 'whiteboard') {
    state.boardFullscreen = false;
    state.boardReady = false;
  }
  if (viewName !== 'map') {
    state.mapFlowFullscreen = false;
  }
  if (viewName !== 'link') {
    state.activeLinkTab = null;
  }
  if (viewName === 'whiteboard' && boardId !== undefined) {
    state.activeBoardId = boardId || null;
    state.boardDirtyScene = null;
    state.boardActiveScene = null;
    state.boardReady = false;
    state.boardFullscreen = false;
    state.boardSaveStatus = 'saved';
    if (!state.activeBoardId) {
      state.wbListFetchedChannel = '';
    }
  }
  if (viewName === 'recorder' && roteiroPath !== undefined) {
    applyRecorderScriptPreselect(getActiveChannelData(), roteiroPath);
  }
  if (viewName === 'settings' && !state.settingsChannelKey) {
    state.settingsChannelKey = state.activeChannel;
  }
  if (docPath) {
    state.selectedDocPath = docPath;
    state.activeVersion = 'principal';
    state.versionHistory = null;
    state.versionFetchedKey = '';
    state.diffDocPath = '';
    state.diffFromRef = null;
    state.diffToRef = null;
    state.diffResult = null;
    state.selectedRevPreview = null;
    state.revPreviewContent = null;
    state.dirtyBody = null;
    state.dirtyMeta = null;
    state.hasUnsavedEdits = false;
    state.commitMessageDraft = '';
  }
  syncActiveTabFromState();
  syncBrowserUrl({ replace: replaceUrl });
  updateHeaderChrome();
  renderCurrentView();
}

registerLifecycleHooks({
  setView,
  buildFriendlyUrl,
  syncBrowserUrl,
  updateHeaderChrome,
  renderCurrentView,
  syncActiveTabFromState,
  updateRemoteChip,
  saveChannelPref: (ch) => {
    const prefs = loadJsonStorage(STORAGE_KEY_PREFS, {});
    prefs.activeChannel = ch;
    saveJsonStorage(STORAGE_KEY_PREFS, prefs);
  },
});
