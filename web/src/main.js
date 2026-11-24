import { ColorFlowEngine } from './core/colorflow.js';
import { handleCmdInputKeydown, openCmdModal, renderCmdResults } from './core/command-palette.js';
import { MD, SERIE_META, STORAGE_KEY_PREFS } from './core/constants.js';
import { closeContextMenu, handleStudioContextMenu, resolveContextTarget } from './core/context-menu.js';
import {
  buildTemplateBody,
  openNewDocModal,
  openNewVersionModal,
  openNewWorkspaceModal,
  openNotifDrawer,
} from './core/modals.js';
import {
  applyRouteSnapshot,
  loadInitialData,
  parseRouteFromLocation,
  renderChannelSwitchers,
  renderCurrentView,
  setView,
  switchChannel,
  syncBrowserUrl,
  updateHeaderChrome,
  updateRemoteChip,
} from './core/router.js';
import { connectLiveEvents } from './core/sse.js';
import {
  connectLocalFolder,
  getActiveDoc,
  normalizePayload,
  persistCreateDoc,
  registerViewRenderer,
  state,
} from './core/state.js';
import {
  closeTab,
  isTabstripOpen,
  openNewTab,
  renderExternalLinkTabView,
  renderTabstrip,
  syncActiveTabFromState,
} from './core/tabs.js';
import { getHostnameLabel, loadJsonStorage, saveJsonStorage, showToast } from './core/utils.js';

import './views/agent.js';
import './views/catalog.js';
import './views/dashboard.js';
import './views/ideas.js';
import { renderMapView } from './views/map.js';
import './views/narration.js';
import './views/notes.js';
import './views/pipeline.js';
import './views/production.js';
import './views/recorder.js';
import { saveCurrentDoc, switchDocVersion } from './views/scripts.js';
import { loadRemoteStatus, renderSettingsView } from './views/settings.js';
import {
  backToWhiteboardList,
  clearWbModalTarget,
  flushWhiteboardSaveOnLeave,
  getWbModalState,
  handleWhiteboardMessage,
  loadBoardIntoSession,
  openBoardEditor,
  openWbBoardModal,
  renderWbScriptPickerList,
  saveActiveBoard,
  syncWhiteboardTopbarUI,
  toggleWhiteboardFullscreen,
} from './views/whiteboard.js';

registerViewRenderer('link', renderExternalLinkTabView);

const global = globalThis;

export function bindGlobalEvents() {
  const workspaceMenu = document.getElementById('workspaceMenu');
  const avatarBtn = document.getElementById('channelAvatarBtn');
  const fabMenu = document.getElementById('fabMenu');
  const fabNewBtn = document.getElementById('fabNewBtn');
  const colorMenu = document.getElementById('colorMenu');

  const closeAllMenus = () => {
    workspaceMenu?.classList.add('hidden');
    avatarBtn?.setAttribute('aria-expanded', 'false');
    fabMenu?.classList.add('hidden');
    fabNewBtn?.classList.remove('is-open');
    fabNewBtn?.setAttribute('aria-expanded', 'false');
    colorMenu?.classList.add('hidden');
    closeContextMenu();
  };

  const newTabBtn = document.getElementById('newTabBtn');
  if (newTabBtn) {
    newTabBtn.onclick = () => {
      closeAllMenus();
      openNewTab({ kind: 'studio', channel: state.activeChannel, view: 'dashboard' }, { activate: true });
    };
  }

  const pinTabBtn = document.getElementById('pinTabstripBtn');
  if (pinTabBtn) {
    pinTabBtn.onclick = () => {
      const nextVal = !state.prefs?.tabBarAlwaysOpen;
      state.prefs = { ...(state.prefs || {}), tabBarAlwaysOpen: nextVal };
      const saved = loadJsonStorage(STORAGE_KEY_PREFS, {});
      saved.tabBarAlwaysOpen = nextVal;
      saveJsonStorage(STORAGE_KEY_PREFS, saved);
      if (!nextVal) {
        state.tabBarPinned = null;
      }
      renderTabstrip();
    };
  }

  const collapseTabBtn = document.getElementById('collapseTabstripBtn');
  if (collapseTabBtn) {
    collapseTabBtn.onclick = () => {
      if (state.prefs?.tabBarAlwaysOpen) {
        state.prefs.tabBarAlwaysOpen = false;
        const saved = loadJsonStorage(STORAGE_KEY_PREFS, {});
        saved.tabBarAlwaysOpen = false;
        saveJsonStorage(STORAGE_KEY_PREFS, saved);
      }
      state.tabBarPinned = false;
      renderTabstrip();
    };
  }

  const pullHandleBtn = document.getElementById('tabstripPullHandle');
  if (pullHandleBtn) {
    pullHandleBtn.onclick = () => {
      state.tabBarPinned = !isTabstripOpen();
      renderTabstrip();
    };
  }

  document.addEventListener('contextmenu', handleStudioContextMenu);
  document.addEventListener('scroll', () => closeContextMenu(), { capture: true, passive: true });
  global.addEventListener('blur', () => closeContextMenu());

  const handleOpenInNewTabGesture = (e) => {
    const resolved = resolveContextTarget(e.target);
    if (!resolved || resolved.kind === 'tab') return;
    e.preventDefault();
    e.stopPropagation();
    closeAllMenus();
    if (resolved.kind === 'nav') {
      openNewTab({ kind: 'studio', channel: state.activeChannel, view: resolved.view }, { activate: true });
    } else if (resolved.kind === 'doc') {
      document.querySelectorAll('.modal-backdrop, .drawer-backdrop').forEach((m) => m.classList.add('hidden'));
      openNewTab({ kind: 'studio', channel: state.activeChannel, view: 'scripts', docPath: resolved.docPath }, { activate: true });
    } else if (resolved.kind === 'board') {
      openNewTab(
        { kind: 'studio', channel: resolved.channel || state.activeChannel, view: 'whiteboard', boardId: resolved.boardId },
        { activate: true }
      );
    } else if (resolved.kind === 'external') {
      const cleanTitle = resolved.title.replace(/\s*↗\s*$/, '').trim() || getHostnameLabel(resolved.url);
      openNewTab(
        { kind: 'link', channel: state.activeChannel, view: 'link', externalUrl: resolved.url, title: cleanTitle },
        { activate: true }
      );
    }
  };

  document.addEventListener(
    'click',
    (e) => {
      if ((e.ctrlKey || e.metaKey) && e.button === 0) {
        handleOpenInNewTabGesture(e);
      }
    },
    true
  );

  document.addEventListener(
    'auxclick',
    (e) => {
      if (e.button !== 1) return;
      const tabEl = e.target instanceof Element ? e.target.closest('.studio-tab[data-tab-id]') : null;
      if (tabEl) {
        e.preventDefault();
        e.stopPropagation();
        closeTab(tabEl.dataset.tabId);
        return;
      }
      handleOpenInNewTabGesture(e);
    },
    true
  );

  document.querySelectorAll('#sideNav .nav-item').forEach((btn) => {
    btn.onclick = () => {
      closeAllMenus();
      if (btn.dataset.view === 'whiteboard') {
        setView('whiteboard', null, { boardId: null });
      } else {
        setView(btn.dataset.view);
      }
    };
  });

  document.getElementById('brandBtn').onclick = () => {
    closeAllMenus();
    setView('dashboard');
  };
  document.getElementById('connectionModeBtn').onclick = () => connectLocalFolder();
  document.getElementById('remoteLiveChip')?.addEventListener('click', () => {
    closeAllMenus();
    state.settingsChannelKey = state.activeChannel;
    setView('settings');
    setTimeout(() => {
      document.getElementById('settingsRemoteCard')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 120);
  });
  document.getElementById('remoteNgrokOffChip')?.addEventListener('click', async () => {
    try {
      const res = await fetch('/api/remote/ngrok/stop', { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Erro ao desligar ngrok');
      state.remoteStatus = json;
      updateRemoteChip();
      if (state.view === 'settings') renderSettingsView(document.getElementById('viewContainer'));
      showToast('Túnel ngrok desligado!');
    } catch (err) {
      showToast(err.message);
    }
  });
  document.getElementById('cmdSearchBtn').onclick = () => {
    closeAllMenus();
    openCmdModal();
  };
  document.getElementById('notifBtn').onclick = () => {
    closeAllMenus();
    openNotifDrawer();
  };
  document.getElementById('closeNotifBtn').onclick = () => document.getElementById('notifDrawer').classList.add('hidden');

  if (avatarBtn && workspaceMenu) {
    avatarBtn.onclick = (e) => {
      e.stopPropagation();
      const willOpen = workspaceMenu.classList.contains('hidden');
      closeAllMenus();
      if (willOpen) {
        renderChannelSwitchers();
        workspaceMenu.classList.remove('hidden');
        avatarBtn.setAttribute('aria-expanded', 'true');
      }
    };
    workspaceMenu.onclick = (e) => e.stopPropagation();
  }

  const wsCreateBtn = document.getElementById('wsMenuCreateBtn');
  if (wsCreateBtn) {
    wsCreateBtn.onclick = () => {
      closeAllMenus();
      openNewWorkspaceModal();
    };
  }

  const wsSettingsBtn = document.getElementById('wsMenuSettingsBtn');
  if (wsSettingsBtn) {
    wsSettingsBtn.onclick = () => {
      closeAllMenus();
      state.settingsChannelKey = state.activeChannel;
      setView('settings');
    };
  }

  if (fabNewBtn && fabMenu) {
    fabNewBtn.onclick = (e) => {
      e.stopPropagation();
      const willOpen = fabMenu.classList.contains('hidden');
      closeAllMenus();
      if (willOpen) {
        const fabVerBtn = document.getElementById('fabVersionActionBtn');
        if (fabVerBtn) {
          fabVerBtn.classList.toggle('hidden', !(state.view === 'scripts' && !!getActiveDoc()));
        }
        fabMenu.classList.remove('hidden');
        fabNewBtn.classList.add('is-open');
        fabNewBtn.setAttribute('aria-expanded', 'true');
      }
    };
    fabMenu.onclick = (e) => e.stopPropagation();

    fabMenu.querySelectorAll('[data-fab-action]').forEach((item) => {
      item.onclick = () => {
        const action = item.dataset.fabAction;
        closeAllMenus();
        switch (action) {
          case 'roteiro':
            openNewDocModal();
            break;
          case 'short':
            openNewDocModal({ type: 'short', serie: 'Shorts & Cortes', folder: '03-shorts' });
            break;
          case 'ideia':
            openNewDocModal({ type: 'ideia', folder: '01-ideias' });
            break;
          case 'whiteboard':
            if (state.view === 'whiteboard') {
              openWbBoardModal('create');
            } else {
              setView('whiteboard', null, { boardId: null });
              setTimeout(() => {
                if (state.serverMode) openWbBoardModal('create');
              }, 120);
            }
            break;
          case 'version': {
            const doc = getActiveDoc();
            if (doc) openNewVersionModal(doc);
            break;
          }
          case 'workspace':
            openNewWorkspaceModal();
            break;
          case 'settings':
            state.settingsChannelKey = state.activeChannel;
            setView('settings');
            break;
        }
      };
    });
  }

  const toggleColorMenu = (e) => {
    e.stopPropagation();
    if (!colorMenu) return;
    const trigger = e.currentTarget;
    const wasOpen = !colorMenu.classList.contains('hidden') && colorMenu.dataset.anchorId === trigger.id;
    closeAllMenus();
    if (wasOpen) return;

    ColorFlowEngine.renderMenu();
    colorMenu.dataset.anchorId = trigger.id || '';
    colorMenu.style.visibility = 'hidden';
    colorMenu.classList.remove('hidden');

    const rect = trigger.getBoundingClientRect();
    const menuRect = colorMenu.getBoundingClientRect();
    const margin = 12;
    const vw = global.innerWidth || document.documentElement.clientWidth;
    const vh = global.innerHeight || document.documentElement.clientHeight;

    let top = rect.bottom + 8;
    if (top + menuRect.height > vh - margin) {
      top = rect.top - menuRect.height - 8;
    }
    top = Math.max(margin, Math.min(top, vh - menuRect.height - margin));

    let left = rect.right - menuRect.width;
    if (left < margin) {
      left = rect.left;
    }
    left = Math.max(margin, Math.min(left, vw - menuRect.width - margin));

    colorMenu.style.top = `${Math.round(top)}px`;
    colorMenu.style.left = `${Math.round(left)}px`;
    colorMenu.style.right = 'auto';
    colorMenu.style.bottom = 'auto';
    colorMenu.style.visibility = '';
  };
  document.getElementById('colorPillBtn').onclick = toggleColorMenu;
  document.getElementById('colorToggleBtn').onclick = toggleColorMenu;

  colorMenu.onclick = (e) => e.stopPropagation();
  document.addEventListener('click', () => closeAllMenus());

  document.getElementById('dynamicFlowToggle').onchange = (e) => {
    state.color.dynamic = e.target.checked;
    ColorFlowEngine.savePrefs();
    ColorFlowEngine.applyCurrent(performance.now());
    ColorFlowEngine.renderMenu();
  };

  document.querySelectorAll('#flowSpeedGroup button').forEach((btn) => {
    btn.onclick = () => {
      state.color.speed = btn.dataset.speed;
      state.color.dynamic = true;
      ColorFlowEngine.savePrefs();
      ColorFlowEngine.renderMenu();
    };
  });

  document.getElementById('paletteList').onclick = (e) => {
    const btn = e.target.closest('[data-palette-id]');
    if (!btn) return;
    state.color.fixedId = btn.dataset.paletteId;
    state.color.dynamic = false;
    ColorFlowEngine.savePrefs();
    ColorFlowEngine.applyCurrent(performance.now());
    ColorFlowEngine.renderMenu();
  };

  document.querySelectorAll('[data-close-modal]').forEach((btn) => {
    btn.onclick = () => document.getElementById(btn.dataset.closeModal).classList.add('hidden');
  });
  document.querySelectorAll('.modal-backdrop, .drawer-backdrop').forEach((bd) => {
    bd.onclick = (e) => {
      if (e.target === bd) bd.classList.add('hidden');
    };
  });

  document.getElementById('newDocType').onchange = (e) => {
    const t = e.target.value;
    const folderEl = document.getElementById('newDocFolder');
    const serieEl = document.getElementById('newDocSerie');
    if (t === 'episodio-serie') {
      const sFolder = SERIE_META[serieEl.value]?.folder;
      if (sFolder && Array.from(folderEl.options).some((o) => o.value === sFolder)) {
        folderEl.value = sFolder;
        return;
      }
    }
    const folderMap = {
      'roteiro-longo': '02-roteiros/rascunhos',
      short: '03-shorts',
      ideia: '01-ideias',
      'post-mortem': '02-roteiros/publicados',
    };
    const target = folderMap[t] || '02-roteiros/rascunhos';
    if (Array.from(folderEl.options).some((o) => o.value === target)) {
      folderEl.value = target;
    }
  };

  document.getElementById('newDocSerie').onchange = (e) => {
    const sFolder = SERIE_META[e.target.value]?.folder;
    const folderEl = document.getElementById('newDocFolder');
    const typeEl = document.getElementById('newDocType');
    if (sFolder && Array.from(folderEl.options).some((o) => o.value === sFolder)) {
      if (typeEl.value === 'episodio-serie' || folderEl.value.startsWith('06-series/')) {
        folderEl.value = sFolder;
      }
    }
  };

  document.getElementById('newDocFolder').onchange = (e) => {
    const f = e.target.value;
    if (f.startsWith('06-series/')) {
      const matched = Object.entries(SERIE_META).find(([, m]) => m.folder === f);
      if (matched) {
        document.getElementById('newDocSerie').value = matched[0];
      }
    }
  };

  document.getElementById('newDocForm').onsubmit = async (e) => {
    e.preventDefault();
    const type = document.getElementById('newDocType').value;
    const serie = document.getElementById('newDocSerie').value;
    const title = document.getElementById('newDocTitle').value.trim();
    const folder = document.getElementById('newDocFolder').value;
    const repo = document.getElementById('newDocRepo').value.trim();
    const targetDate = document.getElementById('newDocTargetDate').value;
    const summary = document.getElementById('newDocSummary').value.trim();

    const nowIso = new Date().toISOString().slice(0, 10);
    const ym = nowIso.slice(0, 7);
    const slug = MD.slugify(title);
    const filename = (type === 'ideia' || type === 'episodio-serie' ? slug : `${ym}-${slug}`) + '.md';

    const statusMap = {
      'episodio-serie': 'ideia',
      'roteiro-longo': 'roteiro',
      short: 'roteiro',
      ideia: 'ideia',
      'post-mortem': 'publicado',
    };
    const tipoMap = {
      'episodio-serie': 'ideia',
      'roteiro-longo': 'roteiro',
      short: 'short',
      ideia: 'ideia',
      'post-mortem': 'post-mortem',
    };
    const meta = {
      id: `${ym}-${slug}`,
      titulo: title,
      tipo: tipoMap[type] || 'roteiro',
      status: statusMap[type] || 'roteiro',
      serie,
      formato: type === 'short' ? 'short' : 'long',
      prioridade: 'alta',
      duracao_estimada: type === 'short' ? '45 seg' : '12 min',
      data_criacao: nowIso,
      data_alvo: targetDate,
      repo_github: repo || 'MrJc01',
      youtube_id: '',
      views: 0,
      tags: [MD.slugify(serie), type === 'short' ? 'short' : 'roteiro'],
      resumo: summary,
    };

    const body = buildTemplateBody(type, title, summary, repo, serie);
    const fullRaw = MD.serializeFrontmatter(meta, body);

    try {
      const createdPath = await persistCreateDoc(folder, filename, fullRaw);
      document.getElementById('newDocModal').classList.add('hidden');
      setView('scripts', createdPath);
      showToast(`Criado: ${createdPath}`);
    } catch (err) {
      showToast(err.message);
    }
  };

  document.getElementById('newVersionForm').onsubmit = async (e) => {
    e.preventDefault();
    const activeDoc = getActiveDoc();
    if (!activeDoc) return;
    const name = document.getElementById('newVerName').value.trim();
    const fromVal = document.getElementById('newVerFrom').value;
    const desc = document.getElementById('newVerDesc').value.trim();
    const isRev = fromVal.startsWith('rev:');
    try {
      const res = await fetch('/api/versions/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel: state.activeChannel,
          path: activeDoc.path,
          name,
          description: desc,
          fromVersion: isRev ? 'principal' : fromVal.replace(/^ver:/, ''),
          fromRev: isRev ? fromVal.replace(/^rev:/, '') : null,
          author: 'MrJ',
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Erro ao criar versão');
      state.data = normalizePayload(json.state);
      state.versionHistory = json.history;
      state.versionFetchedKey = `${state.activeChannel}::${activeDoc.path}`;
      const parsed = MD.parseFrontmatter(json.content || '');
      state.activeVersion = json.version.name;
      state.dirtyMeta = Object.keys(parsed.meta).length ? parsed.meta : null;
      state.dirtyBody = parsed.body;
      state.hasUnsavedEdits = false;
      document.getElementById('newVersionModal').classList.add('hidden');
      syncBrowserUrl({ replace: false });
      updateHeaderChrome();
      renderCurrentView();
      showToast(`Nova versão "${json.version.name}" criada!`);
    } catch (err) {
      showToast(err.message);
    }
  };

  const newWsKeyEl = document.getElementById('newWsKey');
  const newWsNameEl = document.getElementById('newWsName');
  const newWsKdEl = document.getElementById('newWsKdenliveFolder');
  if (newWsKeyEl) {
    newWsKeyEl.oninput = () => {
      newWsKeyEl.dataset.touched = '1';
    };
  }
  if (newWsKdEl) {
    newWsKdEl.oninput = () => {
      newWsKdEl.dataset.touched = '1';
    };
  }
  if (newWsNameEl) {
    newWsNameEl.oninput = () => {
      const slug = MD.slugify(newWsNameEl.value).replace(/-/g, '').slice(0, 24) || MD.slugify(newWsNameEl.value);
      const dashedSlug = MD.slugify(newWsNameEl.value).slice(0, 32);
      if (newWsKeyEl && !newWsKeyEl.dataset.touched) {
        newWsKeyEl.value = dashedSlug === 'secao' && !newWsNameEl.value.trim() ? '' : dashedSlug;
      }
      if (newWsKdEl && !newWsKdEl.dataset.touched) {
        newWsKdEl.value = newWsKeyEl?.value ? `videos/${newWsKeyEl.value}` : (slug ? `videos/${slug}` : '');
      }
    };
  }

  const newWsForm = document.getElementById('newWorkspaceForm');
  if (newWsForm) {
    newWsForm.onsubmit = async (e) => {
      e.preventDefault();
      const key = document.getElementById('newWsKey').value.trim().toLowerCase();
      const name = document.getElementById('newWsName').value.trim();
      const handle = document.getElementById('newWsHandle').value.trim();
      const kdenliveFolder = document.getElementById('newWsKdenliveFolder').value.trim() || `videos/${key}`;
      const workspacePathRaw = document.getElementById('newWsPath').value.trim();
      const seriesRaw = document.getElementById('newWsSeries').value;
      const seriesList = seriesRaw
        .split(/\r?\n|,/)
        .map((s) => s.trim())
        .filter(Boolean);
      const createFolder = Boolean(document.getElementById('newWsCreateFolder').checked);

      try {
        const res = await fetch('/api/config/channels', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            key,
            name,
            handle,
            kdenliveFolder,
            workspacePathRaw,
            seriesList,
            createFolder,
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Erro ao criar workspace');
        state.settingsConfig = json.config || null;
        state.data = normalizePayload(json.state);
        document.getElementById('newWorkspaceModal').classList.add('hidden');
        switchChannel(json.channelKey, { preserveView: true });
      } catch (err) {
        showToast(err.message);
      }
    };
  }

  const cmdInputEl = document.getElementById('cmdInput');
  if (cmdInputEl) {
    cmdInputEl.oninput = (e) => renderCmdResults(e.target.value);
    cmdInputEl.onkeydown = handleCmdInputKeydown;
  }

  const wbTitleInp = document.getElementById('wbBoardTitleInput');
  const wbSlugInp = document.getElementById('wbBoardSlugInput');
  if (wbSlugInp) {
    wbSlugInp.oninput = () => {
      wbSlugInp.dataset.touched = '1';
    };
  }
  if (wbTitleInp) {
    wbTitleInp.oninput = () => {
      if (wbSlugInp && !wbSlugInp.dataset.touched) {
        const s = MD.slugify(wbTitleInp.value);
        wbSlugInp.value = s === 'secao' && !wbTitleInp.value.trim() ? '' : s;
      }
    };
  }

  const wbBoardForm = document.getElementById('wbBoardForm');
  if (wbBoardForm) {
    wbBoardForm.onsubmit = async (e) => {
      e.preventDefault();
      if (!state.serverMode) return;
      const title = (document.getElementById('wbBoardTitleInput')?.value || '').trim();
      const slugRaw = (document.getElementById('wbBoardSlugInput')?.value || '').trim().toLowerCase();
      const mode = document.getElementById('wbBoardModeSelect')?.value || 'excalidraw';
      if (!title) return;

      const modalState = getWbModalState();
      try {
        if (modalState.mode === 'rename') {
          const curId = modalState.targetId || state.activeBoardId;
          if (!curId) return;
          const res = await fetch('/api/boards', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              channel: state.activeChannel,
              id: curId,
              title,
              renameTo: slugRaw && slugRaw !== curId ? slugRaw : undefined,
            }),
          });
          const json = await res.json();
          if (!res.ok) throw new Error(json.error || 'Erro ao renomear quadro');
          clearWbModalTarget();
          state.boardsList = json.boards || state.boardsList;
          state.wbListFetchedChannel = state.activeChannel;
          if (state.data?.channels?.[state.activeChannel]) {
            state.data.channels[state.activeChannel].boards = state.boardsList;
          }
          document.getElementById('wbBoardModal')?.classList.add('hidden');
          if (state.activeBoardId === curId) {
            state.activeBoardId = json.board.id;
            syncActiveTabFromState();
            syncBrowserUrl({ replace: true });
            syncWhiteboardTopbarUI();
          } else if (state.view === 'whiteboard') {
            renderCurrentView();
          }
          showToast(`Quadro renomeado para "${json.board.title}"!`);
        } else {
          if (state.boardDirtyScene) {
            await saveActiveBoard({ reason: 'switch-board' });
          }
          const res = await fetch('/api/boards', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              channel: state.activeChannel,
              title,
              id: slugRaw || undefined,
              preferredMode: mode === 'nodes' ? 'nodes' : 'excalidraw',
              elements: [],
              appState: { viewBackgroundColor: '#ffffff', theme: 'dark', gridSize: 20 },
              files: {},
            }),
          });
          const json = await res.json();
          if (!res.ok) throw new Error(json.error || 'Erro ao criar quadro');
          clearWbModalTarget();
          state.boardsList = json.boards || [];
          state.wbListFetchedChannel = state.activeChannel;
          if (json.state) state.data = normalizePayload(json.state);
          document.getElementById('wbBoardModal')?.classList.add('hidden');
          showToast(`Quadro "${json.board.title}" criado!`);
          if (state.view === 'whiteboard' && state.activeBoardId && document.getElementById('excalidrawFrame')) {
            await loadBoardIntoSession(json.board.id);
          } else {
            openBoardEditor(json.board.id);
          }
        }
      } catch (err) {
        showToast(err.message);
      }
    };
  }

  const wbDeleteConfirmBtn = document.getElementById('wbDeleteConfirmBtn');
  if (wbDeleteConfirmBtn) {
    wbDeleteConfirmBtn.onclick = async () => {
      const targetId = state.wbDeleteTargetId || state.activeBoardId;
      if (!state.serverMode || !targetId) return;
      try {
        const res = await fetch(
          `/api/boards?channel=${encodeURIComponent(state.activeChannel)}&id=${encodeURIComponent(targetId)}`,
          { method: 'DELETE' }
        );
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Erro ao excluir quadro');
        document.getElementById('wbDeleteConfirmModal')?.classList.add('hidden');
        const deletedOpenBoard = state.activeBoardId === targetId;
        state.wbDeleteTargetId = null;
        state.boardsList = json.boards || [];
        state.wbListFetchedChannel = state.activeChannel;
        if (json.state) state.data = normalizePayload(json.state);
        showToast(`Quadro "${targetId}" excluído!`);
        if (deletedOpenBoard) {
          await backToWhiteboardList({ skipSave: true });
        } else if (state.view === 'whiteboard') {
          renderCurrentView();
        }
      } catch (err) {
        showToast(err.message);
      }
    };
  }

  const wbScriptSearchInp = document.getElementById('wbScriptSearchInput');
  if (wbScriptSearchInp) {
    wbScriptSearchInp.oninput = () => renderWbScriptPickerList(wbScriptSearchInp.value);
  }

  global.addEventListener('message', handleWhiteboardMessage);

  document.addEventListener('fullscreenchange', () => {
    const isWbFs = Boolean(document.fullscreenElement && document.fullscreenElement.id === 'wbShell');
    if (state.boardFullscreen !== isWbFs && !document.fullscreenElement) {
      state.boardFullscreen = false;
      syncWhiteboardTopbarUI();
      renderTabstrip();
    }
  });

  global.addEventListener('pagehide', flushWhiteboardSaveOnLeave);
  global.addEventListener('beforeunload', flushWhiteboardSaveOnLeave);

  global.addEventListener('popstate', () => {
    if (!state.data) return;
    applyRouteSnapshot(parseRouteFromLocation(state.data));
    syncActiveTabFromState();
    updateHeaderChrome();
    renderCurrentView();
    if (state.view === 'scripts' && state.activeVersion !== 'principal' && state.selectedDocPath) {
      switchDocVersion(state.selectedDocPath, state.activeVersion);
    }
  });

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      openCmdModal();
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && state.view === 'scripts') {
      e.preventDefault();
      saveCurrentDoc();
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && state.view === 'whiteboard') {
      e.preventDefault();
      saveActiveBoard({ reason: 'manual', forceSnapshot: true });
    } else if (e.key === 'Escape') {
      const openOverlays = Array.from(
        document.querySelectorAll('.modal-backdrop, .drawer-backdrop, #colorMenu, #workspaceMenu, #fabMenu, #studioContextMenu')
      ).filter((el) => !el.classList.contains('hidden'));
      if (openOverlays.length) {
        openOverlays.forEach((el) => el.classList.add('hidden'));
        fabNewBtn?.classList.remove('is-open');
        fabNewBtn?.setAttribute('aria-expanded', 'false');
        avatarBtn?.setAttribute('aria-expanded', 'false');
      } else if (state.boardFullscreen) {
        toggleWhiteboardFullscreen(false);
      } else if (state.mapFlowFullscreen) {
        state.mapFlowFullscreen = false;
        updateHeaderChrome();
        renderMapView(document.getElementById('viewContainer'));
      } else if (state.focusMode) {
        state.focusMode = false;
        syncBrowserUrl({ replace: true });
        updateHeaderChrome();
        renderCurrentView();
      }
    } else if (
      e.code === 'Space' &&
      state.view === 'scripts' &&
      state.docMode === 'prompter' &&
      !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)
    ) {
      e.preventDefault();
      document.getElementById('prompterPlayBtn')?.click();
    }
  });
}

export async function init() {
  ColorFlowEngine.init();
  bindGlobalEvents();
  await loadInitialData();
  if (state.serverMode) {
    connectLiveEvents();
    loadRemoteStatus({ quiet: true, rerender: state.view === 'settings' });
  }
  updateHeaderChrome();
  renderCurrentView();
  if (state.view === 'scripts' && state.activeVersion !== 'principal' && state.selectedDocPath) {
    await switchDocVersion(state.selectedDocPath, state.activeVersion);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
