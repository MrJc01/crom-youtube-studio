import { MD, STORAGE_KEY_TABS, VIEW_TITLES } from './constants.js';
import {
  getActiveChannelData,
  getDocDefaultVersion,
  getLifecycleHooks,
  initSelectedSeriesForChannel,
  state,
} from './state.js';
import {
  extractYouTubeVideoId,
  getHostnameLabel,
  loadJsonStorage,
  saveJsonStorage,
  showToast,
  copyText,
} from './utils.js';

export function getViewTabIcon(viewName) {
  const map = {
    dashboard: '⌂',
    scripts: '📄',
    map: '🗺',
    whiteboard: '◈',
    link: '↗',
    pipeline: '▥',
    ideas: '💡',
    catalog: '▶',
    production: '🎬',
    recorder: '🎙',
    notes: '📝',
    agent: '✦',
    settings: '⚙',
  };
  return map[viewName] || '•';
}

export function getTabPresentation(tab) {
  if (!tab) return { icon: '⌂', title: 'Visão Geral', chBadge: state.activeChannel };
  if (tab.kind === 'link') {
    const ytId = extractYouTubeVideoId(tab.externalUrl);
    return {
      icon: ytId ? '▶' : '↗',
      title: tab.title || getHostnameLabel(tab.externalUrl),
      chBadge: 'link',
    };
  }
  const chData = state.data?.channels?.[tab.channel];
  const view = tab.view || 'dashboard';
  if (view === 'scripts' && tab.docPath && chData?.docs?.length) {
    const doc = chData.docs.find((d) => d.path === tab.docPath);
    return {
      icon: '📄',
      title: doc?.meta?.titulo || tab.docPath.split('/').pop(),
      chBadge: tab.channel || state.activeChannel,
    };
  }
  if (view === 'whiteboard') {
    if (!tab.boardId) {
      return {
        icon: '◈',
        title: 'Lista de Quadros',
        chBadge: tab.channel || state.activeChannel,
      };
    }
    const list =
      tab.channel === state.activeChannel && state.boardsList.length
        ? state.boardsList
        : chData?.boards || [];
    const b = list.find((item) => item.id === tab.boardId);
    return {
      icon: '◈',
      title: b?.title || tab.boardId || tab.title || 'Quadro',
      chBadge: tab.channel || state.activeChannel,
    };
  }
  if (view === 'map' && tab.mapStyle === 'flowchart') {
    return {
      icon: '◈',
      title: 'Mapa (Fluxograma)',
      chBadge: tab.channel || state.activeChannel,
    };
  }
  return {
    icon: getViewTabIcon(view),
    title: VIEW_TITLES[view] || 'Visão Geral',
    chBadge: tab.channel || state.activeChannel,
  };
}

export function makeTabObject(spec = {}) {
  const kind = spec.kind === 'link' ? 'link' : 'studio';
  const channel =
    spec.channel && state.data?.channels?.[spec.channel] ? spec.channel : state.activeChannel;
  const base = {
    id: spec.id || `tab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    kind,
    channel,
    view: kind === 'link' ? 'link' : spec.view || 'dashboard',
    docPath: kind === 'studio' ? spec.docPath || null : null,
    boardId: kind === 'studio' ? spec.boardId || null : null,
    mapStyle: kind === 'studio' ? spec.mapStyle || 'cards' : 'cards',
    externalUrl: kind === 'link' ? String(spec.externalUrl || '') : '',
    title: spec.title || '',
    icon: spec.icon || '',
    embedEnabled: Boolean(spec.embedEnabled),
  };
  const pres = getTabPresentation(base);
  base.title = spec.title || pres.title;
  base.icon = pres.icon;
  return base;
}

export function saveTabsToStorage() {
  saveJsonStorage(STORAGE_KEY_TABS, {
    tabs: state.tabs,
    activeTabId: state.activeTabId,
  });
}

export function isTabstripOpen() {
  if (state.focusMode || state.boardFullscreen || state.mapFlowFullscreen) return false;
  if (state.prefs?.tabBarAlwaysOpen) return true;
  if (state.view === 'dashboard') return state.tabBarPinned !== false;
  return state.tabBarPinned === true;
}

export function applyTabToStateSilent(tab) {
  if (!tab) return;
  if (tab.channel && state.data?.channels?.[tab.channel] && tab.channel !== state.activeChannel) {
    state.activeChannel = tab.channel;
    state.settingsChannelKey = tab.channel;
    initSelectedSeriesForChannel(getActiveChannelData());
  }
  if (tab.kind === 'link') {
    state.view = 'link';
    state.activeLinkTab = { ...tab };
    state.focusMode = false;
    state.boardFullscreen = false;
    state.mapFlowFullscreen = false;
    return;
  }
  state.activeLinkTab = null;
  state.view = tab.view || 'dashboard';
  state.selectedDocPath = state.view === 'scripts' ? tab.docPath || null : state.selectedDocPath;
  if (state.view === 'scripts' && tab.docPath) {
    const initialVer = getDocDefaultVersion(state.activeChannel, tab.docPath);
    state.activeVersion = initialVer;
    state.versionExplicit = false;
    state.versionContentLoading = Boolean(state.serverMode && initialVer !== 'principal');
    state.loadedVersionKey = '';
  }
  if (state.view === 'whiteboard') {
    state.activeBoardId = tab.boardId || null;
  }
  if (state.view === 'map' && tab.mapStyle) {
    state.mapStyle = tab.mapStyle;
  }
}

export function initTabsFromStorage(route) {
  const saved = loadJsonStorage(STORAGE_KEY_TABS, null);
  const channels = state.data?.channels || {};
  let loadedTabs = Array.isArray(saved?.tabs)
    ? saved.tabs
        .filter((t) => t && (t.kind === 'link' ? Boolean(t.externalUrl) : Boolean(t.view)))
        .map((t) =>
          makeTabObject({
            ...t,
            channel: channels[t.channel]
              ? t.channel
              : state.activeChannel || Object.keys(channels)[0] || 'mrj',
          })
        )
    : [];

  const routeTabSpec =
    route.view === 'link' && route.linkUrl
      ? makeTabObject({
          kind: 'link',
          channel: route.channelKey,
          view: 'link',
          externalUrl: route.linkUrl,
          title: route.linkTitle || getHostnameLabel(route.linkUrl),
        })
      : makeTabObject({
          kind: 'studio',
          channel: route.channelKey,
          view: route.view || 'dashboard',
          docPath: route.docPath || null,
          boardId: route.boardId || null,
          mapStyle: state.mapStyle || 'cards',
        });

  if (!loadedTabs.length) {
    loadedTabs = [routeTabSpec];
    state.tabs = loadedTabs;
    state.activeTabId = routeTabSpec.id;
  } else {
    state.tabs = loadedTabs;
    const savedActive = loadedTabs.find((t) => t.id === saved?.activeTabId) || loadedTabs[0];
    const urlSegs = globalThis.location.protocol.startsWith('http')
      ? globalThis.location.pathname.split('/').filter(Boolean)
      : [];
    const matchesRoute =
      savedActive.kind === routeTabSpec.kind &&
      savedActive.channel === routeTabSpec.channel &&
      savedActive.view === routeTabSpec.view &&
      (routeTabSpec.view !== 'scripts' || (savedActive.docPath || null) === (routeTabSpec.docPath || null)) &&
      (routeTabSpec.view !== 'whiteboard' ||
        (savedActive.boardId || null) === (routeTabSpec.boardId || null)) &&
      (routeTabSpec.kind !== 'link' || savedActive.externalUrl === routeTabSpec.externalUrl);

    if (matchesRoute) {
      state.activeTabId = savedActive.id;
      if (savedActive.view === 'map' && savedActive.mapStyle) {
        state.mapStyle = savedActive.mapStyle;
      }
      if (savedActive.kind === 'link') {
        state.view = 'link';
        state.activeLinkTab = savedActive;
      }
    } else if (urlSegs.length > 0) {
      const idx = loadedTabs.findIndex((t) => t.id === savedActive.id);
      routeTabSpec.id = savedActive.id;
      if (idx !== -1) loadedTabs[idx] = routeTabSpec;
      state.activeTabId = routeTabSpec.id;
      if (routeTabSpec.kind === 'link') state.activeLinkTab = routeTabSpec;
    } else {
      state.activeTabId = savedActive.id;
      applyTabToStateSilent(savedActive);
    }
  }

  saveTabsToStorage();
}

export function renderTabstrip() {
  const wrap = document.getElementById('studioTabstripWrap');
  const list = document.getElementById('studioTabsList');
  const pullBtn = document.getElementById('tabstripPullHandle');
  const badge = document.getElementById('tabstripCountBadge');
  const pinBtn = document.getElementById('pinTabstripBtn');
  if (!wrap || !list) return;

  const open = isTabstripOpen();
  wrap.classList.toggle('is-tabstrip-open', open);
  if (pullBtn) pullBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
  if (badge) badge.textContent = state.tabs.length > 0 ? String(state.tabs.length) : '';
  if (pinBtn) {
    const alwaysOpen = Boolean(state.prefs?.tabBarAlwaysOpen);
    pinBtn.classList.toggle('is-pinned', alwaysOpen);
    pinBtn.setAttribute('aria-pressed', alwaysOpen ? 'true' : 'false');
    pinBtn.title = alwaysOpen
      ? 'Desafixar barra de abas (recolher automaticamente nas páginas internas)'
      : 'Fixar barra de abas aberta em todas as páginas';
  }

  list.innerHTML = state.tabs
    .map((tab) => {
      const pres = getTabPresentation(tab);
      const isActive = tab.id === state.activeTabId;
      const fullTitle = `${pres.title} (${pres.chBadge})`;
      return `
        <div class="studio-tab${isActive ? ' is-active' : ''}" data-tab-id="${MD.escapeHtml(tab.id)}" role="tab" tabindex="0" aria-selected="${isActive ? 'true' : 'false'}" title="${MD.escapeHtml(fullTitle)}">
          <span class="studio-tab-icon">${MD.escapeHtml(pres.icon)}</span>
          <span class="studio-tab-ch">${MD.escapeHtml(pres.chBadge)}</span>
          <span class="studio-tab-title">${MD.escapeHtml(pres.title)}</span>
          <button type="button" class="studio-tab-close" data-close-tab="${MD.escapeHtml(tab.id)}" title="Fechar aba">×</button>
        </div>
      `;
    })
    .join('');

  list.querySelectorAll('.studio-tab[data-tab-id]').forEach((el) => {
    el.onclick = (e) => {
      if (e.target.closest('[data-close-tab]')) return;
      activateTab(el.dataset.tabId);
    };
    el.onkeydown = (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        activateTab(el.dataset.tabId);
      }
    };
  });

  list.querySelectorAll('[data-close-tab]').forEach((btn) => {
    btn.onclick = (e) => {
      e.stopPropagation();
      closeTab(btn.dataset.closeTab);
    };
  });
}

export function syncActiveTabFromState() {
  if (!state.data?.channels) return;
  let tab = state.tabs.find((t) => t.id === state.activeTabId);
  if (!tab) {
    tab = makeTabObject({
      kind: state.view === 'link' && state.activeLinkTab ? 'link' : 'studio',
      channel: state.activeChannel,
      view: state.view,
      docPath: state.selectedDocPath,
      boardId: state.activeBoardId,
      mapStyle: state.mapStyle,
      externalUrl: state.activeLinkTab?.externalUrl || '',
      title: state.activeLinkTab?.title || '',
      embedEnabled: Boolean(state.activeLinkTab?.embedEnabled),
    });
    state.tabs.push(tab);
    state.activeTabId = tab.id;
  } else if (state.view === 'link' && state.activeLinkTab) {
    tab.kind = 'link';
    tab.channel = state.activeChannel;
    tab.view = 'link';
    tab.externalUrl = state.activeLinkTab.externalUrl;
    tab.title = state.activeLinkTab.title;
    tab.embedEnabled = Boolean(state.activeLinkTab.embedEnabled);
    tab.docPath = null;
    tab.boardId = null;
    const pres = getTabPresentation(tab);
    tab.icon = pres.icon;
    if (!tab.title) tab.title = pres.title;
  } else {
    tab.kind = 'studio';
    tab.channel = state.activeChannel;
    tab.view = state.view;
    tab.docPath = state.view === 'scripts' ? state.selectedDocPath : null;
    tab.boardId = state.view === 'whiteboard' ? state.activeBoardId : null;
    tab.mapStyle = state.view === 'map' ? state.mapStyle : 'cards';
    tab.externalUrl = '';
    const pres = getTabPresentation(tab);
    tab.title = pres.title;
    tab.icon = pres.icon;
  }
  saveTabsToStorage();
  renderTabstrip();
}

export function openNewTab(spec = {}, { activate = true } = {}) {
  const tab = makeTabObject({
    channel: spec.channel || state.activeChannel,
    view: spec.view || 'dashboard',
    ...spec,
  });
  state.tabs.push(tab);
  saveTabsToStorage();
  if (activate) {
    activateTab(tab.id);
  } else {
    renderTabstrip();
    const pres = getTabPresentation(tab);
    showToast(`Aba aberta em segundo plano: ${pres.title}`);
  }
  return tab;
}

export function activateTab(tabId) {
  const hooks = getLifecycleHooks();
  const tab = state.tabs.find((t) => t.id === tabId);
  if (!tab) return;
  const prevView = state.view;
  hooks.stopPrompter();

  if (prevView === 'whiteboard' && state.boardDirtyScene) {
    hooks.flushWhiteboardSaveOnLeave();
  }

  state.activeTabId = tab.id;
  const nextView = tab.kind === 'link' ? 'link' : tab.view || 'dashboard';
  if (nextView !== prevView) {
    state.tabBarPinned = null;
  }

  if (tab.channel && state.data?.channels?.[tab.channel] && tab.channel !== state.activeChannel) {
    state.activeChannel = tab.channel;
    state.settingsChannelKey = tab.channel;
    state.boardsList = [];
    state.wbListFetchedChannel = '';
    state.wbListLoading = false;
    state.boardReady = false;
    initSelectedSeriesForChannel(getActiveChannelData());
    hooks.saveChannelPref?.(tab.channel);
  }

  state.focusMode = false;
  state.boardFullscreen = false;
  state.mapFlowFullscreen = false;

  if (tab.kind === 'link') {
    state.view = 'link';
    state.activeLinkTab = { ...tab };
  } else {
    state.activeLinkTab = null;
    state.view = nextView;
    if (state.view !== 'whiteboard') state.boardReady = false;

    if (state.view === 'scripts') {
      state.selectedDocPath = tab.docPath || null;
      const initialVer = tab.docPath ? getDocDefaultVersion(state.activeChannel, tab.docPath) : 'principal';
      state.activeVersion = initialVer;
      state.versionExplicit = false;
      state.versionContentLoading = Boolean(state.serverMode && tab.docPath && initialVer !== 'principal');
      state.loadedVersionKey = '';
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
    } else if (state.view === 'whiteboard') {
      state.activeBoardId = tab.boardId || null;
      state.boardDirtyScene = null;
      state.boardActiveScene = null;
      state.boardSaveStatus = 'saved';
    } else if (state.view === 'map') {
      state.mapStyle = tab.mapStyle || 'cards';
    } else if (state.view === 'settings' && !state.settingsChannelKey) {
      state.settingsChannelKey = state.activeChannel;
    }
  }

  saveTabsToStorage();
  hooks.syncBrowserUrl({ replace: false });
  hooks.updateHeaderChrome();
  hooks.renderCurrentView();
}

export function closeTab(tabId) {
  const idx = state.tabs.findIndex((t) => t.id === tabId);
  if (idx === -1) return;
  const wasActive = state.tabs[idx].id === state.activeTabId;
  state.tabs.splice(idx, 1);

  if (state.tabs.length === 0) {
    const fresh = makeTabObject({
      kind: 'studio',
      channel: state.activeChannel,
      view: 'dashboard',
    });
    state.tabs = [fresh];
    state.activeTabId = fresh.id;
    saveTabsToStorage();
    activateTab(fresh.id);
    return;
  }

  if (wasActive) {
    const nextTab = state.tabs[Math.min(idx, state.tabs.length - 1)];
    saveTabsToStorage();
    activateTab(nextTab.id);
  } else {
    saveTabsToStorage();
    renderTabstrip();
  }
}

export function closeOtherTabs(keepTabId) {
  const keep = state.tabs.find((t) => t.id === keepTabId);
  if (!keep) return;
  state.tabs = [keep];
  saveTabsToStorage();
  if (state.activeTabId !== keep.id) {
    activateTab(keep.id);
  } else {
    renderTabstrip();
  }
}

export function duplicateTab(tabId) {
  const src = state.tabs.find((t) => t.id === tabId);
  if (!src) return;
  const copy = makeTabObject({ ...src, id: undefined });
  const idx = state.tabs.findIndex((t) => t.id === tabId);
  state.tabs.splice(idx + 1, 0, copy);
  saveTabsToStorage();
  activateTab(copy.id);
}

export function buildLinkContextMarkdown(title, url) {
  const chData = getActiveChannelData();
  const ch = chData.channel || {};
  return [
    `- **Link:** [${title || url}](${url})`,
    `- **Canal:** ${ch.name || chData.key} (${ch.handle || chData.key})`,
    `- **Página no Studio:** ${VIEW_TITLES[state.view] || state.view} (${globalThis.location.href})`,
  ].join('\n');
}

export function buildDocContextMarkdown(doc) {
  const chData = getActiveChannelData();
  const ch = chData.channel || {};
  const hooks = getLifecycleHooks();
  const urlPath = hooks.buildFriendlyUrl
    ? hooks.buildFriendlyUrl(chData.key, 'scripts', doc.path)
    : `/${chData.key}/roteiros/${doc.path}`;
  const fullUrl = globalThis.location.protocol.startsWith('http')
    ? `${globalThis.location.origin}${urlPath}`
    : urlPath;
  return [
    `### ${doc.meta.titulo}`,
    `- **Canal:** ${ch.name || chData.key} (${ch.handle || chData.key})`,
    `- **Arquivo:** \`${doc.path}\``,
    `- **Série:** ${doc.meta.serie || '—'} | **Status:** ${doc.meta.status || '—'} | **Palavras:** ${doc.stats?.words || 0} (~${doc.stats?.speakMinutes || 1} min)`,
    `- **URL:** ${fullUrl}`,
    doc.meta.resumo ? `- **Resumo:** ${doc.meta.resumo}` : null,
    `- **Versionamento obrigatório:** \`./bin/crom-studio roteiro commit|nova-versao --canal ${chData.key} --arquivo "${doc.path}"\``,
  ]
    .filter(Boolean)
    .join('\n');
}

export function renderExternalLinkTabView(container) {
  const hooks = getLifecycleHooks();
  const tab =
    state.activeLinkTab || state.tabs.find((t) => t.id === state.activeTabId && t.kind === 'link');
  if (!tab || !tab.externalUrl) {
    container.innerHTML = `
      <div class="link-tab-shell">
        <div class="link-tab-empty-card glass-card">
          <h2 style="margin:0;">Nenhum link fixado nesta aba</h2>
          <p style="margin:0; color:var(--text-3);">Clique com o botão direito em qualquer link externo e escolha <strong>Abrir na barra de abas (topo)</strong>.</p>
          <button type="button" class="btn-sm btn-accent" id="linkTabGoHomeBtn">Voltar para Visão Geral</button>
        </div>
      </div>
    `;
    document.getElementById('linkTabGoHomeBtn')?.addEventListener('click', () => hooks.setView('dashboard'));
    return;
  }

  const safeUrl = MD.escapeHtml(tab.externalUrl);
  const safeTitle = MD.escapeHtml(tab.title || getHostnameLabel(tab.externalUrl));
  const ytId = extractYouTubeVideoId(tab.externalUrl);

  let stageHtml = '';
  if (ytId) {
    stageHtml = `<iframe class="link-tab-embed" src="https://www.youtube.com/embed/${MD.escapeHtml(ytId)}" title="${safeTitle}" allowfullscreen allow="autoplay; encrypted-media; picture-in-picture"></iframe>`;
  } else if (tab.embedEnabled) {
    stageHtml = `<iframe class="link-tab-embed" src="${safeUrl}" title="${safeTitle}" sandbox="allow-scripts allow-same-origin allow-forms allow-popups"></iframe>`;
  } else {
    stageHtml = `
      <div class="link-tab-empty-card">
        <div style="font-size:32px; opacity:0.8;">↗</div>
        <h3 style="margin:0; font-size:16px; color:var(--text-1);">${safeTitle}</h3>
        <div class="link-tab-url">${safeUrl}</div>
        <p style="max-width:520px; margin:4px 0 8px; font-size:12.5px; color:var(--text-3);">
          Link fixado na barra superior do Crom YouTube Studio para acesso rápido e cópia de contexto. Alguns sites externos bloqueiam incorporação em iframe.
        </p>
        <div style="display:flex; gap:10px; flex-wrap:wrap; justify-content:center;">
          <a class="btn-sm btn-accent" href="${safeUrl}" target="_blank" rel="noopener noreferrer">Abrir Externamente ↗</a>
          <button type="button" class="btn-sm" id="linkTabToggleEmbedBtn">◫ Carregar Prévia Embutida (iframe)</button>
        </div>
      </div>
    `;
  }

  container.innerHTML = `
    <div class="link-tab-shell">
      <div class="link-tab-card">
        <div class="link-tab-info">
          <h2 class="link-tab-title">${safeTitle}</h2>
          <div class="link-tab-url">${safeUrl}</div>
        </div>
        <div class="link-tab-actions">
          <a class="btn-sm btn-accent" href="${safeUrl}" target="_blank" rel="noopener noreferrer">Abrir Externamente ↗</a>
          <button type="button" class="btn-sm" id="linkTabCopyCtxBtn">📋 Copiar como Contexto</button>
          <button type="button" class="btn-sm" id="linkTabCopyUrlBtn">🔗 Copiar URL</button>
          ${!ytId ? `<button type="button" class="btn-sm" id="linkTabEmbedBtn">${tab.embedEnabled ? 'Ocultar Prévia' : '◫ Prévia Embutida'}</button>` : ''}
          <button type="button" class="btn-sm btn-danger" id="linkTabCloseBtn">✕ Fechar Aba</button>
        </div>
      </div>
      <div class="link-tab-preview-stage">
        ${stageHtml}
      </div>
    </div>
  `;

  document.getElementById('linkTabCopyCtxBtn')?.addEventListener('click', () => {
    copyText(buildLinkContextMarkdown(tab.title, tab.externalUrl), 'Contexto do link copiado!');
  });
  document.getElementById('linkTabCopyUrlBtn')?.addEventListener('click', () => {
    copyText(tab.externalUrl, 'URL copiada!');
  });
  const toggleEmbed = () => {
    tab.embedEnabled = !tab.embedEnabled;
    state.activeLinkTab = { ...tab };
    const stored = state.tabs.find((t) => t.id === tab.id);
    if (stored) stored.embedEnabled = tab.embedEnabled;
    saveTabsToStorage();
    renderExternalLinkTabView(container);
  };
  document.getElementById('linkTabEmbedBtn')?.addEventListener('click', toggleEmbed);
  document.getElementById('linkTabToggleEmbedBtn')?.addEventListener('click', toggleEmbed);
  document.getElementById('linkTabCloseBtn')?.addEventListener('click', () => {
    if (state.activeTabId) closeTab(state.activeTabId);
    else hooks.setView('dashboard');
  });
}
