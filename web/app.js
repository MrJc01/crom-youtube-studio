(function (global) {
  'use strict';

  const MD = global.CromMarkdown || global.MrjMarkdown;

  const PALETTES = [
    { id: 'crom-magenta', name: 'Crom Magenta', a1: [225, 45, 120], a2: [91, 76, 245], a3: [143, 34, 92] },
    { id: 'indigo-aurora', name: 'Indigo Aurora', a1: [124, 92, 255], a2: [56, 189, 248], a3: [88, 28, 135] },
    { id: 'cyan-nebula', name: 'Cyan Nebula', a1: [34, 211, 238], a2: [99, 102, 241], a3: [14, 116, 144] },
    { id: 'lab-emerald', name: 'Lab Emerald', a1: [52, 211, 153], a2: [56, 189, 248], a3: [6, 95, 70] },
    { id: 'amber-rose', name: 'Amber Rose', a1: [251, 146, 60], a2: [236, 72, 153], a3: [154, 52, 18] },
    { id: 'crimson-velvet', name: 'Crimson Velvet', a1: [244, 63, 94], a2: [168, 85, 247], a3: [136, 19, 55] },
  ];

  const SERIE_META = {
    Imagine: { short: 'Imagine', icon: '✦', color: '#ec4899', folder: '06-series/imagine' },
    Pensamentos: { short: 'Pensa', icon: '◈', color: '#a855f7', folder: '06-series/pensamentos' },
    'Histórias': { short: 'Hist', icon: '❖', color: '#38bdf8', folder: '06-series/historias' },
    Reavaliar: { short: 'Reav', icon: '↻', color: '#f59e0b', folder: '06-series/reavaliar' },
    Crom: { short: 'Crom', icon: '⬡', color: '#22d3ee', folder: '06-series/crom' },
    'Construção Real': { short: 'Build', icon: '⚡', color: '#e12d78' },
    'Engenharia & Core': { short: 'Core', icon: '⚙', color: '#5b4cf5' },
    'Ensaios & TabNews': { short: 'Ensaio', icon: '✦', color: '#38bdf8' },
    'Shorts & Cortes': { short: 'Short', icon: '▶', color: '#f59e0b' },
    'Canal & Ops': { short: 'Ops', icon: '⌘', color: '#34d399' },
    'Ciência em Artigos': { short: 'Ciência', icon: '⚛', color: '#22d3ee' },
    'Projetos do GitHub': { short: 'GitHub', icon: '⌥', color: '#818cf8' },
    'Ensaios & Avulsos': { short: 'Ensaio', icon: '◆', color: '#f472b6' },
  };

  const MRJ_SPOTLIGHT_SERIES = ['Imagine', 'Pensamentos', 'Histórias', 'Reavaliar', 'Crom'];

  const KANBAN_COLS = [
    { key: 'ideia', label: 'Ideias' },
    { key: 'pesquisa', label: 'Pesquisa' },
    { key: 'roteiro', label: 'Roteiro' },
    { key: 'gravando', label: 'Gravando' },
    { key: 'edicao', label: 'Edição' },
    { key: 'publicado', label: 'Publicado' },
  ];

  const VIEW_TITLES = {
    dashboard: 'Visão Geral',
    scripts: 'Roteiros & Leitor',
    pipeline: 'Pipeline Kanban',
    ideas: 'Ideias, Séries & GitHub',
    catalog: 'Catálogo YouTube',
    production: 'Produção & Kdenlive',
    agent: 'Central do Agente',
  };

  const STORAGE_KEY_PREFS = 'crom_studio_prefs_v1';
  const STORAGE_KEY_DRAFTS = 'crom_studio_drafts_v2';

  const state = {
    data: null,
    activeChannel: 'mrj',
    serverMode: false,
    dirHandle: null,
    view: 'dashboard',
    selectedDocPath: null,
    docMode: 'read',
    dirtyBody: null,
    dirtyMeta: null,
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
    prompter: {
      playing: false,
      speed: 2.2,
      fontSize: 34,
      mirrored: false,
      rafId: null,
      lastTs: 0,
    },
    agentSelectedDoc: '',
    color: {
      dynamic: true,
      speed: 'medium',
      fixedId: 'crom-magenta',
    },
  };

  /* =========================================================
     MOTOR DE CORES DINÂMICO E SUAVE (ColorFlowEngine)
  ========================================================= */
  const ColorFlowEngine = {
    rafId: null,
    lastPaint: 0,
    phaseOffset: 0,
    lastActivePaletteId: 'crom-magenta',

    init() {
      const saved = loadJsonStorage(STORAGE_KEY_PREFS, {});
      if (saved.color) {
        state.color = { ...state.color, ...saved.color };
      }
      const reduced = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduced && saved.color === undefined) {
        state.color.dynamic = false;
      }

      this.renderMenu();
      this.applyCurrent(performance.now());
      this.loop(performance.now());

      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) this.lastPaint = 0;
      });
    },

    getCycleDurationMs() {
      if (state.color.speed === 'slow') return 84000;
      if (state.color.speed === 'fast') return 26000;
      return 48000;
    },

    lerp(a, b, t) {
      return Math.round(a + (b - a) * t);
    },

    lerpRgb(c1, c2, t) {
      return [
        this.lerp(c1[0], c2[0], t),
        this.lerp(c1[1], c2[1], t),
        this.lerp(c1[2], c2[2], t),
      ];
    },

    rgbHex(rgb) {
      return '#' + rgb.map((v) => v.toString(16).padStart(2, '0')).join('');
    },

    applyPaletteTriplet(a1, a2, a3, labelName) {
      const root = document.documentElement.style;
      root.setProperty('--accent', this.rgbHex(a1));
      root.setProperty('--accent-rgb', a1.join(', '));
      root.setProperty('--accent-2', this.rgbHex(a2));
      root.setProperty('--accent-2-rgb', a2.join(', '));
      root.setProperty('--accent-3', this.rgbHex(a3));
      root.setProperty('--accent-3-rgb', a3.join(', '));

      const lbl = document.getElementById('colorPillLabel');
      if (lbl && labelName) lbl.textContent = labelName;
    },

    applyCurrent(now) {
      if (!state.color.dynamic) {
        const pal = PALETTES.find((p) => p.id === state.color.fixedId) || PALETTES[0];
        this.lastActivePaletteId = pal.id;
        this.applyPaletteTriplet(pal.a1, pal.a2, pal.a3, pal.name);
        return;
      }

      const cycle = this.getCycleDurationMs();
      const progress = ((now + this.phaseOffset) % cycle) / cycle;
      const scaled = progress * PALETTES.length;
      const idx = Math.floor(scaled) % PALETTES.length;
      const nextIdx = (idx + 1) % PALETTES.length;
      const localT = scaled - Math.floor(scaled);
      const smoothT = 0.5 - 0.5 * Math.cos(Math.PI * localT);

      const p1 = PALETTES[idx];
      const p2 = PALETTES[nextIdx];
      const a1 = this.lerpRgb(p1.a1, p2.a1, smoothT);
      const a2 = this.lerpRgb(p1.a2, p2.a2, smoothT);
      const a3 = this.lerpRgb(p1.a3, p2.a3, smoothT);

      const closest = smoothT < 0.5 ? p1 : p2;
      this.lastActivePaletteId = closest.id;
      this.applyPaletteTriplet(a1, a2, a3, `Dinâmico • ${closest.name}`);
    },

    loop(now) {
      if (!document.hidden && state.color.dynamic) {
        if (now - this.lastPaint >= 48) {
          this.lastPaint = now;
          this.applyCurrent(now);
        }
      }
      this.rafId = requestAnimationFrame((ts) => this.loop(ts));
    },

    savePrefs() {
      const prefs = loadJsonStorage(STORAGE_KEY_PREFS, {});
      prefs.color = state.color;
      saveJsonStorage(STORAGE_KEY_PREFS, prefs);
    },

    renderMenu() {
      const toggle = document.getElementById('dynamicFlowToggle');
      if (toggle) toggle.checked = state.color.dynamic;

      document.querySelectorAll('#flowSpeedGroup button').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.speed === state.color.speed);
      });

      const list = document.getElementById('paletteList');
      if (!list) return;
      list.innerHTML = PALETTES.map((p) => {
        const selected = !state.color.dynamic && state.color.fixedId === p.id;
        return `
          <button type="button" class="palette-item${selected ? ' is-selected' : ''}" data-palette-id="${p.id}">
            <span class="palette-dots" style="background: linear-gradient(135deg, rgb(${p.a2.join(',')}), rgb(${p.a1.join(',')}))"></span>
            <span>${p.name}</span>
          </button>
        `;
      }).join('');
    },
  };

  /* =========================================================
     UTILITÁRIOS & HELPER MULTI-CANAL
  ========================================================= */
  function loadJsonStorage(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function saveJsonStorage(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Ignora erro de cota
    }
  }

  function showToast(message) {
    const stack = document.getElementById('toastStack');
    if (!stack) return;
    const item = document.createElement('div');
    item.className = 'toast-item';
    item.textContent = message;
    stack.appendChild(item);
    setTimeout(() => item.remove(), 3200);
  }

  function formatNumber(n) {
    return Number(n || 0).toLocaleString('pt-BR');
  }

  function formatDatePt(isoDate) {
    if (!isoDate) return '—';
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate);
    if (!m) return isoDate;
    const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    const mon = months[Math.max(0, Number(m[2]) - 1)] || m[2];
    return `${m[3]} ${mon} ${m[1]}`;
  }

  function copyText(text, successMsg = 'Copiado para a área de transferência!') {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard
        .writeText(text)
        .then(() => showToast(successMsg))
        .catch(() => fallbackCopy(text, successMsg));
    } else {
      fallbackCopy(text, successMsg);
    }
  }

  function fallbackCopy(text, successMsg) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      showToast(successMsg);
    } catch {
      showToast('Não foi possível copiar automaticamente.');
    }
    ta.remove();
  }

  function downloadTextFile(filename, content) {
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function getChannelKeys() {
    const channels = state.data?.channels || {};
    const order = state.data?.channelOrder || Object.keys(channels);
    return order.filter((k) => Boolean(channels[k]));
  }

  function getActiveChannelData() {
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
      }
    );
  }

  function getChannelInitials(ch) {
    const name = String(ch?.name || ch?.key || 'ST').trim();
    return name.slice(0, 2).toUpperCase();
  }

  function normalizePayload(rawPayload) {
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
        },
      },
      kdenlive: legacy.kdenlive || { available: false, modelos: [], estilos: [], videosCrom: [], videosMrj: [] },
    };
  }

  function rebuildDocFromRaw(relPath, raw, channelKey) {
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

  function applyLocalDraftOverrides(payload) {
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

  function resolveInitialChannel(data) {
    const channels = data.channels || {};
    const params = new URLSearchParams(global.location.search);
    const paramCanal = (params.get('canal') || params.get('channel') || '').trim().toLowerCase();
    if (paramCanal && channels[paramCanal]) return paramCanal;

    const saved = loadJsonStorage(STORAGE_KEY_PREFS, {});
    if (saved.activeChannel && channels[saved.activeChannel]) {
      return saved.activeChannel;
    }

    if (data.defaultChannel && channels[data.defaultChannel]) return data.defaultChannel;
    return Object.keys(channels)[0] || 'mrj';
  }

  function initSelectedSeriesForChannel(chData) {
    const allSeries = getChannelSeriesList(chData);
    const editorial = allSeries.filter((s) => s !== 'Canal & Ops');
    state.selectedSeries = new Set(editorial.length ? editorial : allSeries);
  }

  async function loadInitialData() {
    if (global.location.protocol.startsWith('http')) {
      try {
        const res = await fetch('/api/state', { cache: 'no-store' });
        if (res.ok) {
          const json = await res.json();
          state.serverMode = true;
          state.data = normalizePayload(json);
          state.activeChannel = resolveInitialChannel(state.data);
          initSelectedSeriesForChannel(getActiveChannelData());
          return;
        }
      } catch {
        // Fallback para window.CROM_STUDIO_DATA
      }
    }

    state.serverMode = false;
    const rawGlobal = global.CROM_STUDIO_DATA || global.MRJ_STUDIO_DATA || {};
    const normalized = normalizePayload(structuredClone(rawGlobal));
    state.data = applyLocalDraftOverrides(normalized);
    state.activeChannel = resolveInitialChannel(state.data);
    initSelectedSeriesForChannel(getActiveChannelData());
  }

  function switchChannel(channelKey, { preserveView = true } = {}) {
    if (!state.data?.channels?.[channelKey]) return;
    stopPrompter();

    state.activeChannel = channelKey;
    state.selectedDocPath = null;
    state.dirtyBody = null;
    state.dirtyMeta = null;
    state.historyStatusFilter = 'all';
    state.historyFolderFilter = 'all';
    state.scriptsSearch = '';
    state.scriptsStatusFilter = 'all';
    state.scriptsFolderFilter = 'all';
    state.catalogFilter = 'all';
    state.chartHoverIdx = null;
    state.agentSelectedDoc = '';
    if (!preserveView) state.view = 'dashboard';

    initSelectedSeriesForChannel(getActiveChannelData());

    const prefs = loadJsonStorage(STORAGE_KEY_PREFS, {});
    prefs.activeChannel = channelKey;
    saveJsonStorage(STORAGE_KEY_PREFS, prefs);

    try {
      const url = new URL(global.location.href);
      url.searchParams.set('canal', channelKey);
      global.history.replaceState(null, '', url.toString());
    } catch {
      // Ignora caso file:// bloqueie replaceState em algum ambiente
    }

    updateHeaderChrome();
    renderCurrentView();
    const ch = getActiveChannelData().channel;
    showToast(`Workspace alternado para ${ch.name} (${ch.handle})`);
  }

  /* =========================================================
     PERSISTÊNCIA HÍBRIDA MULTI-CANAL
  ========================================================= */
  async function persistSaveDoc(docPath, fullRaw, newPath = null) {
    const channelKey = state.activeChannel;
    if (state.serverMode) {
      const res = await fetch('/api/doc', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: channelKey, path: docPath, content: fullRaw, newPath }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Erro ao salvar arquivo');
      state.data = normalizePayload(json.state);
      state.selectedDocPath = json.path;
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

  async function persistCreateDoc(folder, filename, fullRaw) {
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

  async function persistDeleteDoc(docPath) {
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

  async function writeViaDirectoryHandle(relPath, content) {
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

  async function connectLocalFolder() {
    if (state.serverMode) {
      showToast('Modo Disco (Local) já está salvando diretamente nos seus arquivos .md!');
      return;
    }
    if (!global.showDirectoryPicker) {
      showToast('Para salvar direto no disco, rode: ./bin/crom-studio --tray (ou npm start).');
      return;
    }
    try {
      state.dirHandle = await global.showDirectoryPicker({ mode: 'readwrite' });
      updateHeaderChrome();
      showToast('Pasta conectada! Alterações serão gravadas nela.');
    } catch {
      // Cancelado pelo usuário
    }
  }

  /* =========================================================
     CHROME (Header, Sidebar, Workspace Switcher 1-clique)
  ========================================================= */
  function renderChannelSwitchers() {
    const keys = getChannelKeys();
    const channels = state.data?.channels || {};

    const sideEl = document.getElementById('sidebarChannelSwitcher');
    if (sideEl) {
      sideEl.innerHTML = keys
        .map((k) => {
          const ch = channels[k].channel || {};
          const active = k === state.activeChannel;
          const isPaused = ch.status === 'pausado';
          const initials = getChannelInitials(ch);
          return `
            <button type="button" class="channel-rail-btn${active ? ' is-active' : ''}" data-switch-channel="${MD.escapeHtml(k)}" title="${MD.escapeHtml(ch.name)} (${MD.escapeHtml(ch.handle)}) — ${isPaused ? 'Pausado' : 'Ativo'}">
              ${ch.avatar
                ? `<img src="${MD.escapeHtml(ch.avatar)}" alt="${MD.escapeHtml(ch.name)}" referrerpolicy="no-referrer" onerror="this.classList.add('is-broken')"><span class="channel-rail-fallback">${MD.escapeHtml(initials)}</span>`
                : `<span class="channel-rail-fallback only">${MD.escapeHtml(initials)}</span>`
              }
              <span class="channel-rail-dot${isPaused ? ' is-paused' : ''}"></span>
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
          const badgeText = isPaused ? 'PAUSADO' : 'ATIVO';
          const initials = getChannelInitials(ch);
          return `
            <button type="button" class="channel-pill${active ? ' is-active' : ''}" data-switch-channel="${MD.escapeHtml(k)}" title="Alternar para ${MD.escapeHtml(ch.name)}">
              <span class="channel-pill-avatar">
                ${ch.avatar
                  ? `<img src="${MD.escapeHtml(ch.avatar)}" alt="${MD.escapeHtml(ch.name)}" referrerpolicy="no-referrer" onerror="this.classList.add('is-broken')"><span class="avatar-fallback">${MD.escapeHtml(initials)}</span>`
                  : `<span>${MD.escapeHtml(initials)}</span>`
                }
              </span>
              <span>${MD.escapeHtml(ch.name)}</span>
              <span class="channel-pill-handle">${MD.escapeHtml(ch.handle)}</span>
              <span class="channel-status-badge ${isPaused ? 'is-pausado' : 'is-ativo'}">${badgeText}</span>
            </button>
          `;
        })
        .join('');
    }

    document.querySelectorAll('[data-switch-channel]').forEach((btn) => {
      btn.onclick = () => {
        const target = btn.dataset.switchChannel;
        if (target && target !== state.activeChannel) {
          switchChannel(target);
        }
      };
    });
  }

  function updateHeaderChrome() {
    const chData = getActiveChannelData();
    const docs = chData.docs || [];
    const videos = chData.videos || [];
    const channel = chData.channel || {};

    document.title = `Crom YouTube Studio — ${channel.name || chData.key} (${channel.handle || ''})`;
    document.getElementById('pageTitle').textContent = VIEW_TITLES[state.view] || 'Crom YouTube Studio';
    document.getElementById('navDocsCount').textContent = docs.length;

    renderChannelSwitchers();

    const inProd = docs.filter((d) => ['roteiro', 'gravando', 'edicao'].includes(d.meta.status)).length;
    const totalViews = videos.reduce((acc, v) => acc + Number(v.views || 0), 0);
    const totalVideos = Number(channel.totalVideos || videos.length || 0);

    document.getElementById('hkProdValue').textContent = formatNumber(inProd);
    document.getElementById('hkProdSub').textContent = inProd === 1 ? 'ativo' : 'ativos';

    const viewsLbl = document.getElementById('hkViewsLabel');
    const viewsVal = document.getElementById('hkViewsValue');
    const viewsSub = document.getElementById('hkViewsSub');
    if (totalVideos > videos.length) {
      viewsLbl.textContent = 'canal público';
      viewsVal.textContent = `${formatNumber(totalVideos)} vídeos`;
      viewsSub.textContent = `${formatNumber(channel.subscribers || 0)} inscritos`;
    } else {
      viewsLbl.textContent = 'alcance total';
      viewsVal.textContent = formatNumber(totalViews);
      viewsSub.textContent = `${formatNumber(channel.subscribers || 0)} inscritos`;
    }

    const connBtn = document.getElementById('connectionModeBtn');
    const connLbl = document.getElementById('connectionModeLabel');
    if (state.serverMode) {
      connBtn.classList.add('is-live');
      connLbl.textContent = 'Disco (Local)';
    } else if (state.dirHandle) {
      connBtn.classList.add('is-live');
      connLbl.textContent = 'Pasta Conectada';
    } else {
      connBtn.classList.remove('is-live');
      connLbl.textContent = 'Standalone';
    }

    const avatarImg = document.getElementById('channelAvatarImg');
    const avatarFallback = document.getElementById('channelAvatarFallback');
    if (avatarFallback) avatarFallback.textContent = getChannelInitials(channel);
    if (avatarImg) {
      if (channel.avatar) {
        if (avatarImg.dataset.currentSrc !== channel.avatar) {
          avatarImg.classList.remove('is-broken');
          avatarImg.dataset.currentSrc = channel.avatar;
          avatarImg.src = channel.avatar;
          avatarImg.onerror = () => avatarImg.classList.add('is-broken');
        }
      } else {
        avatarImg.classList.add('is-broken');
      }
    }

    const pendingAlerts = docs.filter((d) => ['gravando', 'edicao', 'roteiro'].includes(d.meta.status)).length;
    document.getElementById('notifCount').textContent = pendingAlerts;

    document.querySelectorAll('#sideNav .nav-item').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.view === state.view);
    });
  }

  function setView(viewName, docPath = null) {
    stopPrompter();
    state.view = viewName;
    if (docPath) {
      state.selectedDocPath = docPath;
      state.dirtyBody = null;
      state.dirtyMeta = null;
    }
    updateHeaderChrome();
    renderCurrentView();
  }

  function renderCurrentView() {
    const container = document.getElementById('viewContainer');
    if (!container) return;

    switch (state.view) {
      case 'dashboard':
        renderDashboard(container);
        break;
      case 'scripts':
        renderScriptsView(container);
        break;
      case 'pipeline':
        renderPipelineView(container);
        break;
      case 'ideas':
        renderIdeasView(container);
        break;
      case 'catalog':
        renderCatalogView(container);
        break;
      case 'production':
        renderProductionView(container);
        break;
      case 'agent':
        renderAgentView(container);
        break;
      default:
        renderDashboard(container);
    }
  }

  /* =========================================================
     VIEW 1: DASHBOARD MULTI-CANAL
  ========================================================= */
  function getChannelSeriesList(chData) {
    const set = new Set([
      ...(chData.series || []),
      ...(chData.docs || []).map((d) => d.meta.serie).filter(Boolean),
      ...(chData.videos || []).map((v) => v.serie).filter(Boolean),
    ]);
    return Array.from(set);
  }

  function getSeriesStats(chData) {
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

  function buildChartPoints(chData) {
    const videos = [...(chData.videos || [])].filter((v) => state.selectedSeries.has(v.serie));
    const docs = (chData.docs || []).filter(
      (d) =>
        (state.selectedSeries.size === 0 || state.selectedSeries.has(d.meta.serie)) &&
        d.meta.status !== 'template' &&
        d.meta.status !== 'referencia'
    );

    if (state.chartMode === 'pipeline') {
      return KANBAN_COLS.map((col) => {
        const count = docs.filter((d) => d.meta.status === col.key).length;
        return {
          xLabel: col.label,
          pillDate: `${count} arquivos`,
          badgeText: `${count} itens`,
          value: count,
          title: `Estágio ${col.label}: ${count} documento(s) nas séries selecionadas`,
          action: () => setView('pipeline'),
        };
      });
    }

    const sorted = videos.sort((a, b) => String(a.published || '').localeCompare(String(b.published || '')));
    if (sorted.length === 0) {
      return [
        {
          xLabel: 'Sem vídeos',
          pillDate: `${docs.length} .md`,
          badgeText: '0 vídeos',
          value: 0,
          title:
            docs.length > 0
              ? `As séries selecionadas têm ${docs.length} arquivo(s) .md — clique para abrir Pipeline .md`
              : 'Selecione 1+ série com vídeos ou alterne para Pipeline .md',
          action: () => {
            state.chartMode = 'pipeline';
            state.chartHoverIdx = null;
            renderCurrentView();
          },
        },
      ];
    }

    let running = 0;
    return sorted.map((v) => {
      running += Number(v.views || 0);
      const val = state.chartMode === 'cumulative' ? running : Number(v.views || 0);
      return {
        xLabel: String(v.published || '').slice(5),
        pillDate: formatDatePt(v.published),
        badgeText: `${formatNumber(val)} views`,
        value: val,
        title: `${v.title} (${v.type === 'short' ? 'Short' : 'Longo'} • ${v.serie})`,
        url: v.url,
        action: () => global.open(v.url, '_blank', 'noopener,noreferrer'),
      };
    });
  }

  function renderMainChartSvg(points) {
    const W = 680;
    const H = 238;
    const padL = 48;
    const padR = 26;
    const padT = 36;
    const padB = 34;
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;

    const maxRaw = Math.max(1, ...points.map((p) => p.value));
    const stepNice = maxRaw <= 10 ? 2 : maxRaw <= 50 ? 10 : maxRaw <= 500 ? 100 : 250;
    const maxY = Math.ceil((maxRaw * 1.16) / stepNice) * stepNice;

    const coords = points.map((p, idx) => {
      const x = points.length === 1 ? padL + plotW / 2 : padL + (idx / (points.length - 1)) * plotW;
      const y = padT + plotH - (p.value / maxY) * plotH;
      return { ...p, x, y, idx };
    });

    let activeIdx = state.chartHoverIdx;
    if (activeIdx === null || activeIdx < 0 || activeIdx >= coords.length) {
      let bestIdx = coords.length - 1;
      let bestVal = -1;
      coords.forEach((c, i) => {
        if (c.value > bestVal) {
          bestVal = c.value;
          bestIdx = i;
        }
      });
      activeIdx = bestIdx;
    }
    const active = coords[activeIdx] || coords[0];

    const dots = [];
    const cols = Math.max(8, Math.min(14, coords.length));
    for (let r = 0; r <= 4; r++) {
      const gy = padT + (r / 4) * plotH;
      for (let c = 0; c <= cols; c++) {
        const gx = padL + (c / cols) * plotW;
        dots.push(`<circle cx="${gx.toFixed(1)}" cy="${gy.toFixed(1)}" r="1.05" fill="rgba(255,255,255,0.16)" />`);
      }
    }

    const yLabels = [];
    for (let r = 0; r <= 4; r++) {
      const val = Math.round(maxY * (1 - r / 4));
      const gy = padT + (r / 4) * plotH + 3;
      yLabels.push(`<text x="${padL - 10}" y="${gy.toFixed(1)}" text-anchor="end" class="chart-y-label">${formatNumber(val)}</text>`);
    }

    const xStep = Math.max(1, Math.ceil(coords.length / 8));
    const xLabels = coords
      .filter((_, i) => i % xStep === 0 || i === coords.length - 1)
      .filter((c) => Math.abs(c.x - active.x) > 42)
      .map((c) => `<text x="${c.x.toFixed(1)}" y="${H - 9}" text-anchor="middle" class="chart-x-label">${MD.escapeHtml(c.xLabel)}</text>`)
      .join('');

    const pathD = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
    const areaD =
      coords.length > 1
        ? `${pathD} L${coords[coords.length - 1].x.toFixed(1)},${(padT + plotH).toFixed(1)} L${coords[0].x.toFixed(1)},${(padT + plotH).toFixed(1)} Z`
        : '';

    const badgeW = Math.max(66, active.badgeText.length * 7.2 + 16);
    const badgeX = Math.min(Math.max(active.x - badgeW / 2, padL), W - padR - badgeW);
    const badgeY = 4;

    const pillW = Math.max(82, active.pillDate.length * 6.8 + 18);
    const pillX = Math.min(Math.max(active.x - pillW / 2, padL - 6), W - padR - pillW + 6);

    const hitCols = coords
      .map((c, i) => {
        const half = coords.length > 1 ? plotW / (coords.length - 1) / 2 : plotW / 2;
        return `<rect x="${(c.x - half).toFixed(1)}" y="${padT}" width="${(half * 2).toFixed(1)}" height="${plotH}" class="chart-hit-col" data-chart-idx="${i}" />`;
      })
      .join('');

    return {
      active,
      svg: `
        <svg viewBox="0 0 ${W} ${H}" class="chart-svg" preserveAspectRatio="none">
          <defs>
            <linearGradient id="cromAreaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="var(--accent)" stop-opacity="0.22" />
              <stop offset="100%" stop-color="var(--accent)" stop-opacity="0" />
            </linearGradient>
          </defs>
          ${dots.join('')}
          ${yLabels.join('')}
          ${xLabels}
          ${areaD ? `<path d="${areaD}" fill="url(#cromAreaGrad)" />` : ''}
          ${coords.length > 1 ? `<path d="${pathD}" fill="none" stroke="#ffffff" stroke-width="2.1" stroke-linejoin="round" stroke-linecap="round" />` : ''}
          <line x1="${active.x.toFixed(1)}" y1="26" x2="${active.x.toFixed(1)}" y2="${H - 28}" stroke="var(--accent)" stroke-width="1.3" stroke-opacity="0.85" />
          <rect x="${(active.x - 4).toFixed(1)}" y="${(active.y - 4).toFixed(1)}" width="8" height="8" rx="1.5" fill="#141522" stroke="#ffffff" stroke-width="2" />
          <rect x="${badgeX.toFixed(1)}" y="${badgeY}" width="${badgeW.toFixed(1)}" height="22" rx="5" class="chart-badge-rect" />
          <text x="${(badgeX + badgeW / 2).toFixed(1)}" y="${badgeY + 14.5}" text-anchor="middle" class="chart-badge-text">${MD.escapeHtml(active.badgeText)}</text>
          <rect x="${pillX.toFixed(1)}" y="${H - 24}" width="${pillW.toFixed(1)}" height="20" rx="5" class="chart-date-pill" />
          <text x="${(pillX + pillW / 2).toFixed(1)}" y="${H - 10.5}" text-anchor="middle" class="chart-date-text">${MD.escapeHtml(active.pillDate)}</text>
          ${hitCols}
        </svg>
      `,
    };
  }

  function renderSparklineSvg(values, strokeColor = 'var(--accent)') {
    if (!values || values.length < 2) values = [2, 5, 4, 8, 6, 11];
    const max = Math.max(...values, 1);
    const min = Math.min(...values, 0);
    const span = Math.max(1, max - min);
    const w = 78;
    const h = 22;
    const pts = values.map((v, i) => {
      const x = (i / (values.length - 1)) * w;
      const y = h - 2 - ((v - min) / span) * (h - 4);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    return `<svg viewBox="0 0 ${w} ${h}" class="spark-svg"><polyline fill="none" stroke="${strokeColor}" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" points="${pts.join(' ')}" /></svg>`;
  }

  function renderDashboard(container) {
    const chData = getActiveChannelData();
    const channel = chData.channel || {};
    const isPaused = channel.status === 'pausado';
    const seriesList = getSeriesStats(chData);
    const chartPoints = buildChartPoints(chData);
    const chartRendered = renderMainChartSvg(chartPoints);

    const docs = chData.docs || [];
    const videos = chData.videos || [];
    const totalViews = videos.reduce((acc, v) => acc + Number(v.views || 0), 0);
    const totalVideosPublic = Number(channel.totalVideos || videos.length || 0);

    const topSeriesForPulse = seriesList
      .filter((s) => s.videosCount > 0)
      .sort((a, b) => b.views - a.views)
      .slice(0, 3);

    const totalWords = docs.reduce((a, d) => a + (d.stats?.words || 0), 0);
    const checksDone = docs.reduce((a, d) => a + (d.stats?.checksDone || 0), 0);
    const checksTotal = docs.reduce((a, d) => a + (d.stats?.checksTotal || 0), 0);

    const filteredDocs = docs.filter((d) => {
      if (state.historyStatusFilter !== 'all' && d.meta.status !== state.historyStatusFilter) return false;
      if (state.historyFolderFilter !== 'all' && d.topFolder !== state.historyFolderFilter) return false;
      if (state.selectorTab !== 'balance' && state.selectedSeries.size > 0 && !state.selectedSeries.has(d.meta.serie)) {
        return false;
      }
      return true;
    });

    const foldersList = Array.from(new Set(docs.map((d) => d.topFolder))).sort();

    // Banner específico de status do canal (especialmente importante para Crom Pausado vs MrJ Ativo)
    let channelBannerHtml = '';
    if (isPaused) {
      channelBannerHtml = `
        <div class="channel-status-banner">
          <div class="csb-left">
            <span class="channel-status-badge is-pausado">OFFLINE / PAUSADO</span>
            <div>
              <div class="csb-title">${MD.escapeHtml(channel.name)} (${MD.escapeHtml(channel.handle)}) — Offline / Pausado por falta de investimento</div>
              <div class="csb-sub">${formatNumber(channel.subscribers || 502)} inscritos • ${formatNumber(totalVideosPublic)} vídeos no canal (${videos.length} recentes no RSS) • Acervo e ponte Kdenlive preservados para retomada via GitHub.</div>
            </div>
          </div>
          <div style="display:flex; gap:8px; flex-wrap:wrap;">
            <button type="button" class="btn-sm" data-open-doc="00-canal/identidade-e-status.md">Ver Status</button>
            <button type="button" class="btn-sm btn-kdenlive" id="bannerOpenProdBtn">Ponte Kdenlive ↗</button>
          </div>
        </div>
      `;
    }

    // Destaque das 5 séries principais no MrJ
    let seriesSpotlightHtml = '';
    if (chData.key === 'mrj') {
      const spotItems = MRJ_SPOTLIGHT_SERIES.map((name) => {
        const stat = seriesList.find((s) => s.name === name) || {
          name,
          meta: SERIE_META[name] || { icon: '✦', color: '#e12d78' },
          docsCount: 0,
          videosCount: 0,
        };
        const isOnlyThis = state.selectedSeries.size === 1 && state.selectedSeries.has(name);
        const folderPath = SERIE_META[name]?.folder || '06-series';
        return `
          <div class="serie-chip-card${isOnlyThis ? ' is-selected' : ''}" data-spot-filter="${MD.escapeHtml(name)}" style="cursor:pointer;">
            <span class="sel-icon" style="background: ${stat.meta.color}22; border: 1px solid ${stat.meta.color}66; color:${stat.meta.color}">${stat.meta.icon}</span>
            <div style="min-width:0; flex:1;">
              <div class="sel-name">${MD.escapeHtml(name)}</div>
              <div class="sel-sub">${stat.docsCount} .md • ${folderPath}</div>
            </div>
            <button type="button" class="kc-move-btn" data-spot-open="${MD.escapeHtml(folderPath)}/_serie.md" title="Abrir manifesto da série">Abrir</button>
          </div>
        `;
      }).join('');

      seriesSpotlightHtml = `
        <section class="series-spotlight">
          <div class="section-subhead" style="margin-bottom:10px;">
            <h2 class="panel-title">Séries Principais do MrJ (06-series/)</h2>
            <div style="display:flex; gap:8px;">
              <button type="button" class="btn-sm" data-open-doc="06-series/README.md">Mapa das Séries</button>
              <button type="button" class="btn-sm btn-accent" id="newSerieEpBtn">+ Novo Episódio de Série</button>
            </div>
          </div>
          <div class="series-spotlight-grid">${spotItems}</div>
        </section>
      `;
    }

    // Seletor Direito
    let selectorBodyHtml = '';
    if (state.selectorTab === 'balance') {
      const maxWeight = Math.max(1, ...seriesList.map((s) => Math.max(s.views, s.docsCount * 10)));
      selectorBodyHtml = `
        <div class="selector-list">
          ${seriesList
            .map((s) => {
              const weight = Math.max(s.views, s.docsCount * 10);
              const pct = Math.round((weight / maxWeight) * 100);
              return `
                <div class="selector-row is-active" style="flex-direction:column; align-items:stretch; gap:6px;">
                  <div style="display:flex; justify-content:space-between; font-size:12px;">
                    <strong>${MD.escapeHtml(s.name)}</strong>
                    <span style="font-family:var(--font-mono); color:var(--text-2);">${formatNumber(s.views)} views • ${s.docsCount} .md</span>
                  </div>
                  <div style="height:5px; border-radius:99px; background:rgba(255,255,255,0.06); overflow:hidden;">
                    <div style="height:100%; width:${Math.max(6, pct)}%; background:linear-gradient(90deg, var(--accent-2), var(--accent)); border-radius:99px;"></div>
                  </div>
                </div>
              `;
            })
            .join('')}
        </div>
      `;
    } else {
      selectorBodyHtml = `
        <div class="selector-list">
          ${seriesList
            .map((s) => {
              const isActive = state.selectedSeries.has(s.name);
              return `
                <button type="button" class="selector-row${isActive ? ' is-active' : ''}" data-serie-toggle="${MD.escapeHtml(s.name)}">
                  <span class="sel-radio">${isActive ? '✓' : ''}</span>
                  <span class="sel-icon" style="background: ${s.meta.color}22; border: 1px solid ${s.meta.color}66; color:${s.meta.color}">${s.meta.icon}</span>
                  <span class="sel-info">
                    <span class="sel-name">${MD.escapeHtml(s.name)}</span>
                    <span class="sel-sub">${s.videosCount} vídeos • ${formatNumber(s.views)} views • ${s.docsCount} .md</span>
                  </span>
                  <span class="sel-dot"></span>
                </button>
              `;
            })
            .join('')}
        </div>
        <div class="selector-actions">
          <button type="button" class="btn-outline-sm" id="selectAllSeriesBtn">Selecionar Todos</button>
          <button type="button" class="btn-outline-sm is-strong" id="clearAllSeriesBtn">Limpar Filtro</button>
        </div>
      `;
    }

    // Pulso do Estúdio (dinâmico por canal!)
    const pulseHtml =
      state.pulseTab === 'channel'
        ? `
          <div class="pulse-hero">
            <span class="pulse-label">${totalVideosPublic > videos.length ? `Últimos ${videos.length} no feed RSS (${totalVideosPublic} vídeos públicos)` : 'Total acumulado no catálogo'}</span>
            <div class="pulse-big-row">
              <span class="pulse-big-num">${formatNumber(totalViews)} <small style="font-size:13px; color:var(--text-3); font-weight:500;">views</small></span>
              ${renderSparklineSvg(videos.slice().reverse().map((v) => v.views), 'var(--accent)')}
              <span class="pulse-delta is-up">${formatNumber(totalVideosPublic)} vídeos</span>
            </div>
          </div>
          <div class="pulse-list">
            ${topSeriesForPulse
              .map((s, idx) => {
                const vSeries = videos
                  .filter((v) => v.serie === s.name)
                  .slice()
                  .reverse()
                  .map((v) => Number(v.views || 0));
                const avg = s.videosCount ? Math.round(s.views / s.videosCount) : 0;
                const colors = ['var(--accent)', 'var(--accent-2)', 'var(--info)'];
                return `
                  <div class="pulse-item">
                    <div>
                      <span class="pulse-item-label">${MD.escapeHtml(s.name)} (${s.videosCount} vídeos)</span>
                      <span class="pulse-item-val">${formatNumber(s.views)} <small style="font-size:11px; color:var(--text-3); font-weight:500;">views</small></span>
                    </div>
                    ${renderSparklineSvg(vSeries, colors[idx % colors.length])}
                    <span class="pulse-delta">${avg} méd</span>
                  </div>
                `;
              })
              .join('') || '<div class="pulse-item"><span class="pulse-item-label">Nenhum vídeo indexado no RSS ainda.</span></div>'}
          </div>
        `
        : `
          <div class="pulse-hero">
            <span class="pulse-label">Volume escrito no workspace (${MD.escapeHtml(channel.name || chData.key)})</span>
            <div class="pulse-big-row">
              <span class="pulse-big-num">${formatNumber(totalWords)} <small style="font-size:13px; color:var(--text-3); font-weight:500;">palavras</small></span>
              ${renderSparklineSvg([Math.max(100, Math.round(totalWords * 0.2)), Math.max(200, Math.round(totalWords * 0.55)), totalWords], 'var(--accent)')}
              <span class="pulse-delta is-up">${docs.length} .md</span>
            </div>
          </div>
          <div class="pulse-list">
            <div class="pulse-item">
              <div>
                <span class="pulse-item-label">Em Produção / Roteiro</span>
                <span class="pulse-item-val">${docs.filter((d) => ['roteiro', 'gravando', 'edicao'].includes(d.meta.status)).length}</span>
              </div>
              ${renderSparklineSvg([1, 2, 2, Math.max(1, docs.filter((d) => d.meta.status === 'roteiro').length)], 'var(--accent)')}
              <span class="pulse-delta is-up">ativos</span>
            </div>
            <div class="pulse-item">
              <div>
                <span class="pulse-item-label">Ideias & Pesquisa</span>
                <span class="pulse-item-val">${docs.filter((d) => ['ideia', 'pesquisa'].includes(d.meta.status)).length}</span>
              </div>
              ${renderSparklineSvg([1, 2, 3, Math.max(1, docs.filter((d) => d.meta.status === 'ideia').length)], 'var(--accent-2)')}
              <span class="pulse-delta">backlog</span>
            </div>
            <div class="pulse-item">
              <div>
                <span class="pulse-item-label">Checklists Concluídos</span>
                <span class="pulse-item-val">${checksDone}/${checksTotal}</span>
              </div>
              ${renderSparklineSvg([1, 2, 3, Math.max(1, checksDone)], 'var(--ok)')}
              <span class="pulse-delta is-up">${checksTotal ? Math.round((checksDone / checksTotal) * 100) : 0}%</span>
            </div>
          </div>
        `;

    container.innerHTML = `
      ${channelBannerHtml}
      ${seriesSpotlightHtml}

      <section class="dash-grid">
        <div class="dash-card">
          <div class="panel-head">
            <h2 class="panel-title">Desempenho & Fluxo (${MD.escapeHtml(channel.handle || channel.name)})</h2>
            <div class="tab-strip" id="chartModeTabs">
              <button type="button" class="${state.chartMode === 'views' ? 'active' : ''}" data-chart-mode="views">Views / Vídeo</button>
              <button type="button" class="${state.chartMode === 'cumulative' ? 'active' : ''}" data-chart-mode="cumulative">Acumulado</button>
              <button type="button" class="${state.chartMode === 'pipeline' ? 'active' : ''}" data-chart-mode="pipeline">Pipeline .md</button>
            </div>
          </div>
          <div class="chart-box" id="mainChartBox">
            ${chartRendered.svg}
          </div>
          <div class="chart-caption-bar">
            <span class="chart-caption-title" id="chartActiveTitle">${MD.escapeHtml(chartRendered.active.title)}</span>
            <button type="button" class="btn-sm" id="chartOpenTargetBtn">${state.chartMode === 'pipeline' ? 'Abrir Kanban ↗' : (chartRendered.active.url ? 'Abrir no YouTube ↗' : 'Ver Pipeline .md ↗')}</button>
          </div>
        </div>

        <div class="dash-card selector-panel">
          <div class="panel-head">
            <div class="tab-strip" id="selectorTabs" style="width:100%; justify-content:space-between;">
              <button type="button" class="${state.selectorTab === 'multi' ? 'active' : ''}" data-sel-tab="multi">Múltipla</button>
              <button type="button" class="${state.selectorTab === 'single' ? 'active' : ''}" data-sel-tab="single">Única</button>
              <button type="button" class="${state.selectorTab === 'balance' ? 'active' : ''}" data-sel-tab="balance">Balanço</button>
            </div>
          </div>
          ${selectorBodyHtml}
        </div>
      </section>

      <section class="dash-bottom">
        <div class="dash-card">
          <div class="panel-head">
            <h2 class="panel-title">Pulso do Estúdio</h2>
            <div class="tab-strip" id="pulseTabs">
              <button type="button" class="${state.pulseTab === 'channel' ? 'active' : ''}" data-pulse-tab="channel">Canal</button>
              <button type="button" class="${state.pulseTab === 'production' ? 'active' : ''}" data-pulse-tab="production">Roteiros</button>
            </div>
          </div>
          ${pulseHtml}
        </div>

        <div class="dash-card">
          <div class="history-head">
            <h2 class="panel-title">Roteiros & Arquivos Markdown</h2>
            <div class="filter-selects">
              <select class="select-dark" id="histStatusSelect">
                <option value="all"${state.historyStatusFilter === 'all' ? ' selected' : ''}>Todos os status</option>
                <option value="gravando"${state.historyStatusFilter === 'gravando' ? ' selected' : ''}>Gravando</option>
                <option value="roteiro"${state.historyStatusFilter === 'roteiro' ? ' selected' : ''}>Roteiro</option>
                <option value="ideia"${state.historyStatusFilter === 'ideia' ? ' selected' : ''}>Ideia</option>
                <option value="pesquisa"${state.historyStatusFilter === 'pesquisa' ? ' selected' : ''}>Pesquisa</option>
                <option value="publicado"${state.historyStatusFilter === 'publicado' ? ' selected' : ''}>Publicado</option>
                <option value="referencia"${state.historyStatusFilter === 'referencia' ? ' selected' : ''}>Referência</option>
                <option value="template"${state.historyStatusFilter === 'template' ? ' selected' : ''}>Template</option>
              </select>
              <select class="select-dark" id="histFolderSelect">
                <option value="all"${state.historyFolderFilter === 'all' ? ' selected' : ''}>Todas as pastas</option>
                ${foldersList.map((f) => `<option value="${MD.escapeHtml(f)}"${state.historyFolderFilter === f ? ' selected' : ''}>${MD.escapeHtml(f)}</option>`).join('')}
              </select>
            </div>
          </div>

          <div class="history-list">
            ${filteredDocs
              .slice(0, 10)
              .map((doc) => {
                const speakLabel = doc.stats.speakMinutes ? `${doc.stats.speakMinutes} min fala` : `${doc.stats.words} pal.`;
                return `
                  <button type="button" class="history-row" data-open-doc="${MD.escapeHtml(doc.path)}">
                    <div style="min-width:0;">
                      <span class="hr-title">${MD.escapeHtml(doc.meta.titulo)}</span>
                      <span class="hr-sub">${MD.escapeHtml(doc.path)} • ${MD.escapeHtml(doc.meta.serie)}</span>
                    </div>
                    <span class="hr-date">${formatDatePt(doc.meta.data_alvo || doc.meta.data_criacao)}</span>
                    <div class="hr-right">
                      <span class="status-pill st-${MD.escapeHtml(doc.meta.status)}">${MD.escapeHtml(doc.meta.status)}</span>
                      <span class="hr-metric-sub" style="margin-top:3px;">${speakLabel} • ${formatNumber(doc.stats.words)} pal.</span>
                    </div>
                  </button>
                `;
              })
              .join('') || '<p style="color:var(--text-3); padding:18px;">Nenhum arquivo combina com esse filtro.</p>'}
          </div>
        </div>
      </section>
    `;

    // Bindings
    const bannerProdBtn = document.getElementById('bannerOpenProdBtn');
    if (bannerProdBtn) bannerProdBtn.onclick = () => setView('production');

    const newSerieEpBtn = document.getElementById('newSerieEpBtn');
    if (newSerieEpBtn) {
      newSerieEpBtn.onclick = () => openNewDocModal({ type: 'episodio-serie', serie: 'Imagine', folder: '06-series/imagine' });
    }

    container.querySelectorAll('[data-spot-filter]').forEach((card) => {
      card.onclick = (e) => {
        if (e.target.closest('[data-spot-open]')) return;
        const name = card.dataset.spotFilter;
        const isAlreadyOnly = state.selectedSeries.size === 1 && state.selectedSeries.has(name);
        if (isAlreadyOnly) {
          initSelectedSeriesForChannel(chData);
        } else {
          state.selectedSeries = new Set([name]);
        }
        state.chartHoverIdx = null;
        renderDashboard(container);
      };
    });

    container.querySelectorAll('[data-spot-open]').forEach((btn) => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const target = btn.dataset.spotOpen;
        const found = docs.find((d) => d.path === target);
        if (found) setView('scripts', found.path);
        else setView('scripts');
      };
    });

    container.querySelectorAll('#chartModeTabs button').forEach((btn) => {
      btn.onclick = () => {
        state.chartMode = btn.dataset.chartMode;
        state.chartHoverIdx = null;
        renderDashboard(container);
      };
    });

    container.querySelectorAll('#selectorTabs button').forEach((btn) => {
      btn.onclick = () => {
        state.selectorTab = btn.dataset.selTab;
        if (state.selectorTab === 'single' && state.selectedSeries.size > 1) {
          const first = Array.from(state.selectedSeries)[0] || seriesList[0]?.name || '';
          state.selectedSeries = first ? new Set([first]) : new Set();
        }
        renderDashboard(container);
      };
    });

    container.querySelectorAll('[data-serie-toggle]').forEach((btn) => {
      btn.onclick = () => {
        const name = btn.dataset.serieToggle;
        if (state.selectorTab === 'single') {
          state.selectedSeries = new Set([name]);
        } else {
          if (state.selectedSeries.has(name)) state.selectedSeries.delete(name);
          else state.selectedSeries.add(name);
        }
        state.chartHoverIdx = null;
        renderDashboard(container);
      };
    });

    const selAllBtn = document.getElementById('selectAllSeriesBtn');
    if (selAllBtn) {
      selAllBtn.onclick = () => {
        state.selectedSeries = new Set(seriesList.map((s) => s.name));
        state.chartHoverIdx = null;
        renderDashboard(container);
      };
    }

    const clrAllBtn = document.getElementById('clearAllSeriesBtn');
    if (clrAllBtn) {
      clrAllBtn.onclick = () => {
        state.selectedSeries.clear();
        state.chartHoverIdx = null;
        renderDashboard(container);
      };
    }

    container.querySelectorAll('#pulseTabs button').forEach((btn) => {
      btn.onclick = () => {
        state.pulseTab = btn.dataset.pulseTab;
        renderDashboard(container);
      };
    });

    const stSel = document.getElementById('histStatusSelect');
    if (stSel) stSel.onchange = () => { state.historyStatusFilter = stSel.value; renderDashboard(container); };
    const flSel = document.getElementById('histFolderSelect');
    if (flSel) flSel.onchange = () => { state.historyFolderFilter = flSel.value; renderDashboard(container); };

    container.querySelectorAll('[data-open-doc]').forEach((row) => {
      row.onclick = () => setView('scripts', row.dataset.openDoc);
    });

    const chartBox = document.getElementById('mainChartBox');
    if (chartBox) bindChartHoverEvents(chartBox, chartPoints);

    const openTargetBtn = document.getElementById('chartOpenTargetBtn');
    if (openTargetBtn) {
      openTargetBtn.onclick = () => {
        if (chartRendered.active.action) chartRendered.active.action();
      };
    }
  }

  function bindChartHoverEvents(box, pts) {
    box.querySelectorAll('[data-chart-idx]').forEach((rect) => {
      rect.onmouseenter = () => {
        const idx = Number(rect.dataset.chartIdx);
        if (state.chartHoverIdx !== idx) {
          state.chartHoverIdx = idx;
          const updated = renderMainChartSvg(pts);
          box.innerHTML = updated.svg;
          const cap = document.getElementById('chartActiveTitle');
          if (cap) cap.textContent = updated.active.title;
          bindChartHoverEvents(box, pts);
        }
      };
      rect.onclick = () => {
        const pt = pts[Number(rect.dataset.chartIdx)];
        if (pt && pt.action) pt.action();
      };
    });
  }

  /* =========================================================
     VIEW 2: ROTEIROS & LEITOR / EDITOR / TELEPROMPTER
  ========================================================= */
  function getActiveDoc() {
    const docs = getActiveChannelData().docs || [];
    if (!docs.length) return null;
    return docs.find((d) => d.path === state.selectedDocPath) || docs[0];
  }

  function resolveRelativeMdPath(baseFolder, href) {
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

  function renderScriptsView(container) {
    const chData = getActiveChannelData();
    const docs = chData.docs || [];
    const activeDoc = getActiveDoc();
    if (activeDoc && !state.selectedDocPath) {
      state.selectedDocPath = activeDoc.path;
    }

    const filtered = docs.filter((d) => {
      if (state.scriptsStatusFilter !== 'all' && d.meta.status !== state.scriptsStatusFilter) return false;
      if (state.scriptsFolderFilter !== 'all' && d.topFolder !== state.scriptsFolderFilter) return false;
      if (state.scriptsSearch) {
        const q = state.scriptsSearch.toLowerCase();
        const hay = `${d.meta.titulo} ${d.path} ${d.meta.serie} ${d.meta.resumo} ${(d.meta.tags || []).join(' ')}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    const foldersList = Array.from(new Set(docs.map((d) => d.topFolder))).sort();
    const seriesOptions = Array.from(
      new Set([...getChannelSeriesList(chData), activeDoc?.meta?.serie].filter(Boolean))
    );
    const currentMeta = state.dirtyMeta || activeDoc?.meta || {};
    const currentBody = state.dirtyBody !== null ? state.dirtyBody : activeDoc?.body || '';

    let workspaceHtml = '<p style="padding:30px; color:var(--text-3);">Nenhum arquivo selecionado.</p>';
    if (activeDoc) {
      let bodySectionHtml = '';
      if (state.docMode === 'read') {
        bodySectionHtml = `
          <div class="doc-body-scroll" id="readerScroll">
            <article class="md-article" id="mdArticle">
              ${MD.renderMarkdown(currentBody)}
            </article>
          </div>
        `;
      } else if (state.docMode === 'edit') {
        bodySectionHtml = `
          <div class="editor-split">
            <div class="editor-pane">
              <div class="editor-shortcuts">
                <button type="button" data-insert="\`[GANCHO]\` ">+ [GANCHO]</button>
                <button type="button" data-insert="\`[TELA]\` ">+ [TELA]</button>
                <button type="button" data-insert="\`[B-ROLL]\` ">+ [B-ROLL]</button>
                <button type="button" data-insert="\`[CORTE]\` ">+ [CORTE]</button>
                <button type="button" data-insert="\n00:00 — ">+ Timestamp</button>
                <button type="button" data-insert="\n- [ ] ">+ Checklist</button>
              </div>
              <textarea class="md-textarea" id="mdEditorInput" spellcheck="true">${MD.escapeHtml(currentBody)}</textarea>
            </div>
            <div class="preview-pane">
              <article class="md-article" id="mdLivePreview">
                ${MD.renderMarkdown(currentBody)}
              </article>
            </div>
          </div>
        `;
      } else {
        bodySectionHtml = `
          <div class="prompter-wrap">
            <div class="prompter-controls">
              <div class="prompter-ctrl-group">
                <button type="button" class="btn-sm btn-accent" id="prompterPlayBtn">${state.prompter.playing ? '⏸ Pausar (Espaço)' : '▶ Iniciar Rolagem'}</button>
                <button type="button" class="btn-sm" id="prompterResetBtn">↺ Topo</button>
              </div>
              <div class="prompter-ctrl-group">
                <label>Velocidade <input type="range" id="prompterSpeed" min="0.6" max="8" step="0.4" value="${state.prompter.speed}"></label>
                <label>Fonte <input type="range" id="prompterSize" min="22" max="54" step="2" value="${state.prompter.fontSize}"></label>
                <button type="button" class="btn-sm" id="prompterMirrorBtn">${state.prompter.mirrored ? '⇄ Normal' : '⇄ Espelhar'}</button>
              </div>
            </div>
            <div class="prompter-stage${state.prompter.mirrored ? ' is-mirrored' : ''}" id="prompterStage">
              <div class="prompter-guide"></div>
              <div class="prompter-text md-article" id="prompterText" style="font-size:${state.prompter.fontSize}px;">
                ${MD.renderMarkdown(currentBody)}
              </div>
            </div>
          </div>
        `;
      }

      const isProtected = activeDoc.path === 'AGENTS.md' || activeDoc.path === 'README.md';
      workspaceHtml = `
        <div class="doc-toolbar">
          <div style="display:flex; align-items:center; gap:10px; min-width:0; flex-wrap:wrap;">
            <span class="doc-path-chip">${MD.escapeHtml(activeDoc.path)}</span>
            <div class="mode-switch" id="docModeSwitch">
              <button type="button" class="${state.docMode === 'read' ? 'active' : ''}" data-doc-mode="read">Ler</button>
              <button type="button" class="${state.docMode === 'edit' ? 'active' : ''}" data-doc-mode="edit">Editar</button>
              <button type="button" class="${state.docMode === 'prompter' ? 'active' : ''}" data-doc-mode="prompter">Teleprompter</button>
            </div>
          </div>
          <div class="doc-actions">
            <button type="button" class="btn-sm btn-accent" id="saveDocBtn">Salvar (Ctrl+S)</button>
            <button type="button" class="btn-sm btn-kdenlive" id="produceKdenliveBtn">▶ Produzir no Kdenlive</button>
            <button type="button" class="btn-sm" id="copyPromptDocBtn">Prompt Agente</button>
            <button type="button" class="btn-sm" id="downloadDocBtn">Baixar .md</button>
            ${isProtected ? '' : '<button type="button" class="btn-sm btn-danger" id="deleteDocBtn">Excluir</button>'}
          </div>
        </div>

        <div class="frontmatter-bar" id="frontmatterBar">
          <div class="fm-field" style="grid-column: span 2;">
            <label>Título</label>
            <input type="text" data-fm="titulo" value="${MD.escapeHtml(currentMeta.titulo || '')}">
          </div>
          <div class="fm-field">
            <label>Status</label>
            <select data-fm="status">
              ${['ideia', 'pesquisa', 'roteiro', 'gravando', 'edicao', 'publicado', 'referencia', 'template', 'arquivado']
                .map((st) => `<option value="${st}"${currentMeta.status === st ? ' selected' : ''}>${st}</option>`)
                .join('')}
            </select>
          </div>
          <div class="fm-field">
            <label>Série</label>
            <select data-fm="serie">
              ${seriesOptions
                .map((sr) => `<option value="${MD.escapeHtml(sr)}"${currentMeta.serie === sr ? ' selected' : ''}>${MD.escapeHtml(sr)}</option>`)
                .join('')}
            </select>
          </div>
          <div class="fm-field">
            <label>Duração Est.</label>
            <input type="text" data-fm="duracao_estimada" value="${MD.escapeHtml(currentMeta.duracao_estimada || '')}">
          </div>
          <div class="fm-field">
            <label>Data Alvo</label>
            <input type="date" data-fm="data_alvo" value="${MD.escapeHtml(currentMeta.data_alvo || '')}">
          </div>
        </div>

        ${bodySectionHtml}
      `;
    }

    container.innerHTML = `
      <section class="scripts-layout">
        <aside class="scripts-sidebar">
          <input type="search" class="search-box-sm" id="scriptsSearchInput" placeholder="Filtrar arquivos .md..." value="${MD.escapeHtml(state.scriptsSearch)}">
          <div class="scripts-filter-row">
            <select class="select-dark" id="scriptsStatusSel" style="height:30px; font-size:11px;">
              <option value="all"${state.scriptsStatusFilter === 'all' ? ' selected' : ''}>Status: Todos</option>
              <option value="gravando"${state.scriptsStatusFilter === 'gravando' ? ' selected' : ''}>Gravando</option>
              <option value="roteiro"${state.scriptsStatusFilter === 'roteiro' ? ' selected' : ''}>Roteiro</option>
              <option value="ideia"${state.scriptsStatusFilter === 'ideia' ? ' selected' : ''}>Ideia</option>
              <option value="pesquisa"${state.scriptsStatusFilter === 'pesquisa' ? ' selected' : ''}>Pesquisa</option>
              <option value="publicado"${state.scriptsStatusFilter === 'publicado' ? ' selected' : ''}>Publicado</option>
              <option value="referencia"${state.scriptsStatusFilter === 'referencia' ? ' selected' : ''}>Referência</option>
            </select>
            <select class="select-dark" id="scriptsFolderSel" style="height:30px; font-size:11px;">
              <option value="all"${state.scriptsFolderFilter === 'all' ? ' selected' : ''}>Pasta: Todas</option>
              ${foldersList.map((f) => `<option value="${MD.escapeHtml(f)}"${state.scriptsFolderFilter === f ? ' selected' : ''}>${MD.escapeHtml(f)}</option>`).join('')}
            </select>
          </div>

          <div class="doc-list">
            ${filtered
              .map(
                (d) => `
                  <button type="button" class="doc-list-item${activeDoc && d.path === activeDoc.path ? ' active' : ''}" data-select-doc="${MD.escapeHtml(d.path)}">
                    <div class="dli-top">
                      <span class="status-pill st-${MD.escapeHtml(d.meta.status)}">${MD.escapeHtml(d.meta.status)}</span>
                      <span style="font-family:var(--font-mono); font-size:10px; color:var(--text-3);">${d.stats.words} pal.</span>
                    </div>
                    <span class="dli-title">${MD.escapeHtml(d.meta.titulo)}</span>
                    <div class="dli-meta">
                      <span>${MD.escapeHtml(d.folder)}</span>
                      <span>${MD.escapeHtml(d.meta.serie)}</span>
                    </div>
                  </button>
                `
              )
              .join('') || '<p style="color:var(--text-3); padding:14px;">Nada encontrado.</p>'}
          </div>
        </aside>

        <div class="doc-workspace">
          ${workspaceHtml}
        </div>
      </section>
    `;

    const searchEl = document.getElementById('scriptsSearchInput');
    if (searchEl) {
      searchEl.oninput = () => {
        state.scriptsSearch = searchEl.value;
        const pos = searchEl.selectionStart;
        renderScriptsView(container);
        const again = document.getElementById('scriptsSearchInput');
        if (again) {
          again.focus();
          again.setSelectionRange(pos, pos);
        }
      };
    }
    const stSel = document.getElementById('scriptsStatusSel');
    if (stSel) stSel.onchange = () => { state.scriptsStatusFilter = stSel.value; renderScriptsView(container); };
    const flSel = document.getElementById('scriptsFolderSel');
    if (flSel) flSel.onchange = () => { state.scriptsFolderFilter = flSel.value; renderScriptsView(container); };

    container.querySelectorAll('[data-select-doc]').forEach((btn) => {
      btn.onclick = () => {
        stopPrompter();
        state.selectedDocPath = btn.dataset.selectDoc;
        state.dirtyBody = null;
        state.dirtyMeta = null;
        renderScriptsView(container);
      };
    });

    if (!activeDoc) return;

    container.querySelectorAll('#docModeSwitch button').forEach((btn) => {
      btn.onclick = () => {
        stopPrompter();
        state.docMode = btn.dataset.docMode;
        renderScriptsView(container);
      };
    });

    container.querySelectorAll('[data-fm]').forEach((el) => {
      el.onchange = () => {
        state.dirtyMeta = { ...(state.dirtyMeta || activeDoc.meta), [el.dataset.fm]: el.value };
      };
    });

    const article = document.getElementById('mdArticle');
    if (article) {
      article.querySelectorAll('.md-task-box').forEach((chk) => {
        chk.onchange = async () => {
          const idx = Number(chk.dataset.checkIndex);
          const baseBody = state.dirtyBody !== null ? state.dirtyBody : activeDoc.body;
          const updatedBody = MD.toggleCheckboxInMarkdown(baseBody, idx);
          state.dirtyBody = updatedBody;
          const metaToSave = { ...(state.dirtyMeta || activeDoc.meta) };
          const fullRaw = MD.serializeFrontmatter(metaToSave, updatedBody);
          try {
            await persistSaveDoc(activeDoc.path, fullRaw);
            state.dirtyBody = null;
            state.dirtyMeta = null;
            updateHeaderChrome();
            renderScriptsView(container);
            showToast(state.serverMode ? 'Checkbox salvo direto no arquivo .md!' : 'Checkbox atualizado no rascunho local.');
          } catch (err) {
            showToast(err.message);
          }
        };
      });

      article.querySelectorAll('[data-rel-md]').forEach((link) => {
        link.onclick = (e) => {
          e.preventDefault();
          const resolved = resolveRelativeMdPath(activeDoc.folder, link.dataset.relMd);
          const found = docs.find((d) => d.path === resolved);
          if (found) {
            state.selectedDocPath = found.path;
            state.dirtyBody = null;
            state.dirtyMeta = null;
            renderScriptsView(container);
          } else {
            showToast(`Arquivo não encontrado neste canal: ${resolved}`);
          }
        };
      });
    }

    container.querySelectorAll('[data-copy-code]').forEach((btn) => {
      btn.onclick = () => copyText(btn.dataset.copyCode, 'Bloco copiado!');
    });

    const editorInput = document.getElementById('mdEditorInput');
    const livePreview = document.getElementById('mdLivePreview');
    if (editorInput) {
      editorInput.oninput = () => {
        state.dirtyBody = editorInput.value;
        if (livePreview) livePreview.innerHTML = MD.renderMarkdown(editorInput.value);
      };

      container.querySelectorAll('[data-insert]').forEach((btn) => {
        btn.onclick = () => {
          const snippet = btn.dataset.insert;
          const start = editorInput.selectionStart;
          const end = editorInput.selectionEnd;
          const v = editorInput.value;
          editorInput.value = v.slice(0, start) + snippet + v.slice(end);
          editorInput.selectionStart = editorInput.selectionEnd = start + snippet.length;
          editorInput.focus();
          editorInput.dispatchEvent(new Event('input'));
        };
      });
    }

    const saveBtn = document.getElementById('saveDocBtn');
    if (saveBtn) saveBtn.onclick = () => saveCurrentDoc();

    const kdenliveBtn = document.getElementById('produceKdenliveBtn');
    if (kdenliveBtn) kdenliveBtn.onclick = () => openKdenliveModal(activeDoc);

    const downloadBtn = document.getElementById('downloadDocBtn');
    if (downloadBtn) {
      downloadBtn.onclick = () => {
        const meta = state.dirtyMeta || activeDoc.meta;
        const body = state.dirtyBody !== null ? state.dirtyBody : activeDoc.body;
        downloadTextFile(activeDoc.filename, MD.serializeFrontmatter(meta, body));
      };
    }

    const promptBtn = document.getElementById('copyPromptDocBtn');
    if (promptBtn) {
      promptBtn.onclick = () => {
        const ch = chData.channel || {};
        const prompt = `Leia o arquivo "${activeDoc.path}" no workspace ${chData.workspacePath || ch.name} seguindo o AGENTS.md. Refine o gancho inicial (00:00–00:40), sugira 3 títulos A/B no estilo de ${ch.handle || ch.name}, extraia 2 cortes para 03-shorts/ e rode npm run sync no Crom YouTube Studio ao final.`;
        copyText(prompt, 'Prompt pronto para colar no agente!');
      };
    }

    const delBtn = document.getElementById('deleteDocBtn');
    if (delBtn) {
      delBtn.onclick = async () => {
        if (!confirm(`Deseja realmente excluir "${activeDoc.path}"?`)) return;
        try {
          await persistDeleteDoc(activeDoc.path);
          state.selectedDocPath = getActiveChannelData().docs[0]?.path || null;
          state.dirtyBody = null;
          state.dirtyMeta = null;
          updateHeaderChrome();
          renderScriptsView(container);
          showToast('Arquivo excluído.');
        } catch (err) {
          showToast(err.message);
        }
      };
    }

    bindPrompterEvents();
  }

  async function saveCurrentDoc() {
    const activeDoc = getActiveDoc();
    if (!activeDoc) return;
    const meta = { ...(state.dirtyMeta || activeDoc.meta) };
    const body = state.dirtyBody !== null ? state.dirtyBody : activeDoc.body;

    let newPath = null;
    if (activeDoc.topFolder === '02-roteiros') {
      let targetSub = null;
      if (['roteiro', 'pesquisa', 'ideia'].includes(meta.status)) targetSub = '02-roteiros/rascunhos';
      else if (['gravando', 'edicao'].includes(meta.status)) targetSub = '02-roteiros/em-producao';
      else if (meta.status === 'publicado') targetSub = '02-roteiros/publicados';
      if (targetSub && activeDoc.folder !== targetSub) {
        newPath = `${targetSub}/${activeDoc.filename}`;
      }
    }

    const fullRaw = MD.serializeFrontmatter(meta, body);
    try {
      const finalPath = await persistSaveDoc(activeDoc.path, fullRaw, newPath);
      state.dirtyBody = null;
      state.dirtyMeta = null;
      updateHeaderChrome();
      renderCurrentView();
      showToast(
        state.serverMode
          ? `Salvo em ${finalPath}!`
          : `Salvo no rascunho local (${finalPath}). Use "Baixar .md" ou inicie o servidor.`
      );
    } catch (err) {
      showToast(err.message);
    }
  }

  function stopPrompter() {
    state.prompter.playing = false;
    if (state.prompter.rafId) {
      cancelAnimationFrame(state.prompter.rafId);
      state.prompter.rafId = null;
    }
  }

  function bindPrompterEvents() {
    const playBtn = document.getElementById('prompterPlayBtn');
    const resetBtn = document.getElementById('prompterResetBtn');
    const speedInp = document.getElementById('prompterSpeed');
    const sizeInp = document.getElementById('prompterSize');
    const mirrorBtn = document.getElementById('prompterMirrorBtn');
    const stage = document.getElementById('prompterStage');
    const textEl = document.getElementById('prompterText');

    if (!stage || !playBtn) return;

    const tick = (ts) => {
      if (!state.prompter.playing) return;
      if (!state.prompter.lastTs) state.prompter.lastTs = ts;
      const dt = Math.min(80, ts - state.prompter.lastTs) / 1000;
      state.prompter.lastTs = ts;
      stage.scrollTop += state.prompter.speed * 26 * dt;
      state.prompter.rafId = requestAnimationFrame(tick);
    };

    playBtn.onclick = () => {
      state.prompter.playing = !state.prompter.playing;
      playBtn.textContent = state.prompter.playing ? '⏸ Pausar (Espaço)' : '▶ Iniciar Rolagem';
      if (state.prompter.playing) {
        state.prompter.lastTs = 0;
        state.prompter.rafId = requestAnimationFrame(tick);
      } else {
        stopPrompter();
      }
    };

    resetBtn.onclick = () => stage.scrollTo({ top: 0, behavior: 'smooth' });
    speedInp.oninput = () => { state.prompter.speed = Number(speedInp.value); };
    sizeInp.oninput = () => {
      state.prompter.fontSize = Number(sizeInp.value);
      if (textEl) textEl.style.fontSize = `${state.prompter.fontSize}px`;
    };
    mirrorBtn.onclick = () => {
      state.prompter.mirrored = !state.prompter.mirrored;
      stage.classList.toggle('is-mirrored', state.prompter.mirrored);
      mirrorBtn.textContent = state.prompter.mirrored ? '⇄ Normal' : '⇄ Espelhar';
    };
  }

  /* =========================================================
     MODAL: PRODUZIR NO KDENLIVE + MCP (kdenlive-mcp-plus)
  ========================================================= */
  function openKdenliveModal(doc) {
    const chData = getActiveChannelData();
    const chKey = chData.key;
    const kdenlive = state.data?.kdenlive || {};
    const estilos = kdenlive.estilos || [];
    const kdenliveRoot = kdenlive.root || '~/Videos/youtube-kdenlive';

    const rawSlug = doc.filename.replace(/\.md$/i, '').replace(/^\d{4}-\d{2}-/, '');
    const defaultSlug = MD.slugify(rawSlug);
    const defaultSerieSlug = doc.path.startsWith('06-series/')
      ? doc.path.split('/')[1]
      : (doc.meta.serie && doc.meta.serie !== 'Canal & Ops' ? MD.slugify(doc.meta.serie) : '');

    const modal = document.getElementById('kdenliveModal');
    const body = document.getElementById('kdenliveModalBody');

    body.innerHTML = `
      <div class="form-row-3">
        <label>
          <span>Canal</span>
          <input type="text" id="kdCanalInput" value="${MD.escapeHtml(chKey)}" readonly>
        </label>
        <label>
          <span>Slug do Vídeo</span>
          <input type="text" id="kdSlugInput" value="${MD.escapeHtml(defaultSlug)}">
        </label>
        <label>
          <span>Série (--serie, opcional)</span>
          <input type="text" id="kdSerieInput" value="${MD.escapeHtml(defaultSerieSlug)}" placeholder="ex.: imagine">
        </label>
      </div>

      <label>
        <span>Estilo Visual (estilos/*.md)</span>
        <select id="kdEstiloSelect">
          <option value="">Escolher/propor estilo sob medida</option>
          ${estilos
            .map((e) => `<option value="${MD.escapeHtml(e.slug)}">${MD.escapeHtml(e.slug)} — ${MD.escapeHtml(e.summary.slice(0, 70))}</option>`)
            .join('')}
        </select>
      </label>

      <label>
        <span>1. Comando na Fábrica Kdenlive (${MD.escapeHtml(kdenliveRoot)})</span>
        <pre class="kdenlive-cmd-box" id="kdCliPreview"></pre>
      </label>

      <label>
        <span>2. Prompt para o Agente com MCP <code>kdenlive-mcp-plus</code></span>
        <textarea id="kdPromptPreview" rows="6" readonly style="font-family:var(--font-mono); font-size:11.5px;"></textarea>
      </label>

      <div class="modal-actions">
        <button type="button" class="btn-ghost" data-close-modal="kdenliveModal">Fechar</button>
        <button type="button" class="btn-sm" id="kdCopyCliBtn">Copiar Comando CLI</button>
        <button type="button" class="btn-sm btn-kdenlive" id="kdCopyPromptBtn">Copiar Prompt MCP</button>
        <button type="button" class="btn-primary" id="kdCopyAllBtn">Copiar Comando + Prompt</button>
      </div>
    `;

    const updateOutputs = () => {
      const slug = MD.slugify(document.getElementById('kdSlugInput').value || defaultSlug);
      const serie = document.getElementById('kdSerieInput').value.trim();
      const estilo = document.getElementById('kdEstiloSelect').value;

      const serieArg = serie ? ` --serie ${serie}` : '';
      const cliCmd = `cd ${kdenliveRoot}\n./criar_video.sh --canal ${chKey} ${slug}${serieArg}`;
      const targetVideoDir = chKey === 'mrj' ? `videos/mrj/${slug}` : `videos/${slug}`;
      const estiloNote = estilo ? `Use o estilo visual \`estilos/${estilo}.md\`.` : 'Proponha um estilo visual adequado a partir de `estilos/*.md` seguindo o PROCESSO-NOVO-VIDEO.md.';

      const mcpPrompt = [
        `Produza o vídeo "${doc.meta.titulo}" para o canal ${chData.channel.name} (${chData.channel.handle}).`,
        `1) Leia o roteiro completo em "${chData.workspacePath ? `${chData.workspacePath}/${doc.path}` : doc.path}".`,
        `2) Em ${kdenliveRoot}, leia LEIA-PRIMEIRO.md e PROCESSO-NOVO-VIDEO.md (e CANAIS.md).`,
        `3) Inicialize a pasta do projeto com: ./criar_video.sh --canal ${chKey} ${slug}${serieArg} (pasta destino: ${targetVideoDir}).`,
        `4) ${estiloNote}`,
        `5) Gere narração CromyVoice, cenas Remotion/Three.js e monte a timeline final no Kdenlive usando o MCP \`kdenlive-mcp-plus\`, validando com \`python3 ferramentas/verificar_video.py ${targetVideoDir}\`.`,
      ].join('\n');

      document.getElementById('kdCliPreview').textContent = cliCmd;
      document.getElementById('kdPromptPreview').value = mcpPrompt;
    };

    updateOutputs();

    document.getElementById('kdSlugInput').oninput = updateOutputs;
    document.getElementById('kdSerieInput').oninput = updateOutputs;
    document.getElementById('kdEstiloSelect').onchange = updateOutputs;

    document.getElementById('kdCopyCliBtn').onclick = () => {
      copyText(document.getElementById('kdCliPreview').textContent, 'Comando ./criar_video.sh copiado!');
    };
    document.getElementById('kdCopyPromptBtn').onclick = () => {
      copyText(document.getElementById('kdPromptPreview').value, 'Prompt kdenlive-mcp-plus copiado!');
    };
    document.getElementById('kdCopyAllBtn').onclick = () => {
      const cli = document.getElementById('kdCliPreview').textContent;
      const prm = document.getElementById('kdPromptPreview').value;
      copyText(`${cli}\n\n---\n\n${prm}`, 'Comando e prompt Kdenlive copiados!');
    };
    body.querySelectorAll('[data-close-modal]').forEach((btn) => {
      btn.onclick = () => modal.classList.add('hidden');
    });

    modal.classList.remove('hidden');
  }

  /* =========================================================
     VIEW 3: PIPELINE KANBAN
  ========================================================= */
  function renderPipelineView(container) {
    const chData = getActiveChannelData();
    const docs = (chData.docs || []).filter(
      (d) => d.meta.status !== 'referencia' && d.meta.status !== 'template' && d.meta.status !== 'arquivado'
    );

    container.innerHTML = `
      <div class="section-subhead">
        <div>
          <span style="color:var(--text-2); font-size:13px;">Canal <strong>${MD.escapeHtml(chData.channel.name)}</strong> — arraste os cards entre colunas ou avance o estágio diretamente no arquivo .md.</span>
        </div>
        <button type="button" class="btn-sm btn-accent" id="kanbanNewBtn">+ Novo Item no Pipeline</button>
      </div>

      <div class="kanban-board">
        ${KANBAN_COLS.map((col, colIdx) => {
          const items = docs.filter((d) => d.meta.status === col.key);
          const nextCol = KANBAN_COLS[colIdx + 1];
          return `
            <div class="kanban-col" data-kanban-col="${col.key}">
              <div class="kanban-col-head">
                <span>${col.label}</span>
                <span class="kanban-count">${items.length}</span>
              </div>
              ${items
                .map(
                  (d) => `
                    <div class="kanban-card" draggable="true" data-drag-path="${MD.escapeHtml(d.path)}">
                      <div style="display:flex; justify-content:space-between; align-items:center; gap:6px;">
                        <span class="status-pill st-${MD.escapeHtml(d.meta.status)}" style="font-size:9.5px;">${MD.escapeHtml(d.meta.formato === 'short' ? 'Short' : 'Longo')}</span>
                        <span style="font-family:var(--font-mono); font-size:10px; color:var(--text-3);">${d.stats.words} pal.</span>
                      </div>
                      <div class="kc-title" data-open-doc="${MD.escapeHtml(d.path)}" style="cursor:pointer;">${MD.escapeHtml(d.meta.titulo)}</div>
                      <div style="font-size:11px; color:var(--text-3);">${MD.escapeHtml(d.meta.serie)}</div>
                      <div class="kc-foot">
                        <span>${d.meta.data_alvo ? formatDatePt(d.meta.data_alvo) : 'Sem data'}</span>
                        ${nextCol ? `<button type="button" class="kc-move-btn" data-move-path="${MD.escapeHtml(d.path)}" data-next-status="${nextCol.key}">→ ${nextCol.label}</button>` : '<span>✓ No ar</span>'}
                      </div>
                    </div>
                  `
                )
                .join('')}
            </div>
          `;
        }).join('')}
      </div>
    `;

    document.getElementById('kanbanNewBtn').onclick = () => openNewDocModal();

    container.querySelectorAll('[data-open-doc]').forEach((el) => {
      el.onclick = () => setView('scripts', el.dataset.openDoc);
    });

    container.querySelectorAll('[data-move-path]').forEach((btn) => {
      btn.onclick = (e) => {
        e.stopPropagation();
        moveDocStatus(btn.dataset.movePath, btn.dataset.nextStatus);
      };
    });

    let draggedPath = null;
    container.querySelectorAll('.kanban-card').forEach((card) => {
      card.ondragstart = () => { draggedPath = card.dataset.dragPath; };
    });
    container.querySelectorAll('.kanban-col').forEach((col) => {
      col.ondragover = (e) => {
        e.preventDefault();
        col.classList.add('is-drop-target');
      };
      col.ondragleave = () => col.classList.remove('is-drop-target');
      col.ondrop = (e) => {
        e.preventDefault();
        col.classList.remove('is-drop-target');
        if (draggedPath) {
          moveDocStatus(draggedPath, col.dataset.kanbanCol);
          draggedPath = null;
        }
      };
    });
  }

  async function moveDocStatus(docPath, nextStatus) {
    const chData = getActiveChannelData();
    const doc = (chData.docs || []).find((d) => d.path === docPath);
    if (!doc || doc.meta.status === nextStatus) return;

    const updatedMeta = { ...doc.meta, status: nextStatus };
    let newPath = null;
    if (doc.topFolder === '02-roteiros') {
      let targetSub = null;
      if (['ideia', 'pesquisa', 'roteiro'].includes(nextStatus)) targetSub = '02-roteiros/rascunhos';
      else if (['gravando', 'edicao'].includes(nextStatus)) targetSub = '02-roteiros/em-producao';
      else if (nextStatus === 'publicado') targetSub = '02-roteiros/publicados';
      if (targetSub && doc.folder !== targetSub) {
        newPath = `${targetSub}/${activeFilename(doc)}`;
      }
    }

    try {
      await persistSaveDoc(doc.path, MD.serializeFrontmatter(updatedMeta, doc.body), newPath);
      updateHeaderChrome();
      renderCurrentView();
      showToast(`Status alterado para "${nextStatus}"!`);
    } catch (err) {
      showToast(err.message);
    }
  }

  function activeFilename(doc) {
    return doc.filename || doc.path.split('/').pop();
  }

  /* =========================================================
     VIEW 4: IDEIAS, SÉRIES & PROJETOS GITHUB
  ========================================================= */
  function renderIdeasView(container) {
    const chData = getActiveChannelData();
    const docs = chData.docs || [];
    const seriesDocs = docs.filter((d) => d.topFolder === '06-series' && d.filename !== 'README.md');
    const ideaDocs = docs.filter((d) => d.topFolder === '01-ideias' || (d.meta.status === 'ideia' && d.topFolder !== '06-series'));
    const repos = chData.githubRepos || [];

    const seriesSectionHtml = seriesDocs.length
      ? `
        <div class="section-subhead">
          <div>
            <h2 class="panel-title" style="font-size:16px;">Séries em Destaque (06-series/)</h2>
            <span style="font-size:12px; color:var(--text-3);">Imagine, Pensamentos, Histórias, Reavaliar e Crom — manifestos e pautas abertas.</span>
          </div>
          <button type="button" class="btn-sm btn-accent" id="newSerieDocBtn">+ Novo Episódio em Série</button>
        </div>
        <div class="cards-grid-3" style="margin-bottom: 28px;">
          ${seriesDocs
            .map(
              (d) => `
                <div class="glass-card">
                  <div class="gc-top">
                    <span class="status-pill st-${MD.escapeHtml(d.meta.status)}">${MD.escapeHtml(d.meta.status)}</span>
                    <span style="font-family:var(--font-mono); font-size:11px; color:var(--text-3);">${MD.escapeHtml(d.meta.serie)}</span>
                  </div>
                  <h3 class="gc-title">${MD.escapeHtml(d.meta.titulo)}</h3>
                  <p class="gc-desc">${MD.escapeHtml(d.meta.resumo || 'Sem resumo definido ainda.')}</p>
                  <div class="gc-actions">
                    <button type="button" class="btn-sm btn-accent" data-open-doc="${MD.escapeHtml(d.path)}">Abrir Arquivo</button>
                    <button type="button" class="btn-sm btn-kdenlive" data-kdenlive-doc="${MD.escapeHtml(d.path)}">Kdenlive</button>
                  </div>
                </div>
              `
            )
            .join('')}
        </div>
      `
      : '';

    container.innerHTML = `
      ${seriesSectionHtml}

      <div class="section-subhead">
        <div>
          <h2 class="panel-title" style="font-size:16px;">Fichas de Ideia (.md em 01-ideias/)</h2>
        </div>
        <button type="button" class="btn-sm btn-accent" id="newIdeaBtn">+ Nova Ideia</button>
      </div>

      <div class="cards-grid-3" style="margin-bottom: 28px;">
        ${ideaDocs
          .map(
            (d) => `
              <div class="glass-card">
                <div class="gc-top">
                  <span class="status-pill st-${MD.escapeHtml(d.meta.status)}">${MD.escapeHtml(d.meta.status)}</span>
                  <span style="font-family:var(--font-mono); font-size:11px; color:var(--text-3);">${MD.escapeHtml(d.meta.serie)}</span>
                </div>
                <h3 class="gc-title">${MD.escapeHtml(d.meta.titulo)}</h3>
                <p class="gc-desc">${MD.escapeHtml(d.meta.resumo || 'Sem resumo definido ainda.')}</p>
                <div class="gc-actions">
                  <button type="button" class="btn-sm btn-accent" data-open-doc="${MD.escapeHtml(d.path)}">Abrir Ficha</button>
                  <button type="button" class="btn-sm" data-script-from-idea="${MD.escapeHtml(d.path)}">Virar Roteiro</button>
                </div>
              </div>
            `
          )
          .join('') || '<p style="color:var(--text-3);">Nenhuma ficha em 01-ideias/ ainda.</p>'}
      </div>

      <div class="section-subhead">
        <div>
          <h2 class="panel-title" style="font-size:16px;">Repositórios Reais (github.com/MrJc01)</h2>
          <span style="font-size:12px; color:var(--text-3);">Projetos reais prontos para virar episódios de vídeo ou retomada de canal.</span>
        </div>
      </div>

      <div class="cards-grid-3">
        ${repos
          .map(
            (r) => `
              <div class="glass-card">
                <div class="gc-top">
                  <span class="status-pill st-roteiro">${MD.escapeHtml(r.language)}</span>
                  <span style="font-family:var(--font-mono); font-size:12px; color:var(--warn);">★ ${r.stars}</span>
                </div>
                <h3 class="gc-title">${MD.escapeHtml(r.name)}</h3>
                <p class="gc-desc">${MD.escapeHtml(r.description)}</p>
                <div class="gc-actions">
                  <button type="button" class="btn-sm btn-accent" data-repo-to-script="${MD.escapeHtml(r.name)}">+ Criar Roteiro</button>
                  ${r.linkedDoc ? `<button type="button" class="btn-sm" data-open-doc="${MD.escapeHtml(r.linkedDoc)}">Ver .md</button>` : ''}
                  <a class="btn-sm" href="${MD.escapeHtml(r.url)}" target="_blank" rel="noopener noreferrer">GitHub ↗</a>
                </div>
              </div>
            `
          )
          .join('')}
      </div>
    `;

    const newSerieBtn = document.getElementById('newSerieDocBtn');
    if (newSerieBtn) {
      newSerieBtn.onclick = () => openNewDocModal({ type: 'episodio-serie', serie: 'Imagine', folder: '06-series/imagine' });
    }
    document.getElementById('newIdeaBtn').onclick = () => openNewDocModal({ type: 'ideia', folder: '01-ideias' });

    container.querySelectorAll('[data-open-doc]').forEach((btn) => {
      btn.onclick = () => setView('scripts', btn.dataset.openDoc);
    });
    container.querySelectorAll('[data-kdenlive-doc]').forEach((btn) => {
      btn.onclick = () => {
        const doc = docs.find((d) => d.path === btn.dataset.kdenliveDoc);
        if (doc) openKdenliveModal(doc);
      };
    });

    container.querySelectorAll('[data-script-from-idea]').forEach((btn) => {
      btn.onclick = () => {
        const doc = docs.find((d) => d.path === btn.dataset.scriptFromIdea);
        if (doc) {
          openNewDocModal({
            type: 'roteiro-longo',
            folder: '02-roteiros/rascunhos',
            title: doc.meta.titulo.replace(/^Ideia:\s*/i, ''),
            serie: doc.meta.serie,
            repo: doc.meta.repo_github,
            summary: doc.meta.resumo,
          });
        }
      };
    });

    container.querySelectorAll('[data-repo-to-script]').forEach((btn) => {
      btn.onclick = () => {
        const repo = repos.find((x) => x.name === btn.dataset.repoToScript);
        if (repo) {
          openNewDocModal({
            type: 'roteiro-longo',
            folder: '02-roteiros/rascunhos',
            title: `${repo.name}: Bastidores e Arquitetura Real em ${repo.language}`,
            serie: repo.serie || (chData.key === 'crom' ? 'Projetos do GitHub' : 'Construção Real'),
            repo: `MrJc01/${repo.name}`,
            summary: repo.description,
          });
        }
      };
    });
  }

  /* =========================================================
     VIEW 5: CATÁLOGO YOUTUBE
  ========================================================= */
  function renderCatalogView(container) {
    const chData = getActiveChannelData();
    const channel = chData.channel || {};
    const rawVideos = chData.videos || [];
    let videos = [...rawVideos];
    if (state.catalogFilter === 'long') videos = videos.filter((v) => v.type === 'long');
    if (state.catalogFilter === 'short') videos = videos.filter((v) => v.type === 'short');

    if (state.catalogSort === 'views') {
      videos.sort((a, b) => Number(b.views || 0) - Number(a.views || 0));
    } else {
      videos.sort((a, b) => String(b.published || '').localeCompare(String(a.published || '')));
    }

    const totalPublic = Number(channel.totalVideos || rawVideos.length || 0);
    const totalSubtitle =
      totalPublic > rawVideos.length
        ? `${rawVideos.length} vídeos recentes no feed RSS (${formatNumber(totalPublic)} vídeos públicos no canal • ${formatNumber(channel.subscribers || 0)} inscritos)`
        : `${rawVideos.length} vídeos publicados • ${formatNumber(channel.subscribers || 0)} inscritos`;

    container.innerHTML = `
      <div class="section-subhead">
        <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
          <div class="mode-switch" id="catalogTypeSwitch">
            <button type="button" class="${state.catalogFilter === 'all' ? 'active' : ''}" data-cf="all">Todos (${rawVideos.length})</button>
            <button type="button" class="${state.catalogFilter === 'long' ? 'active' : ''}" data-cf="long">Longos</button>
            <button type="button" class="${state.catalogFilter === 'short' ? 'active' : ''}" data-cf="short">Shorts</button>
          </div>
          <select class="select-dark" id="catalogSortSel">
            <option value="date"${state.catalogSort === 'date' ? ' selected' : ''}>Mais recentes</option>
            <option value="views"${state.catalogSort === 'views' ? ' selected' : ''}>Mais visualizações</option>
          </select>
          <span style="font-size:12px; color:var(--text-3);">${MD.escapeHtml(totalSubtitle)}</span>
        </div>

        <div style="display:flex; align-items:center; gap:8px;">
          <button type="button" class="btn-sm" id="openCatalogDocBtn">Abrir catalogo-youtube.md</button>
          <button type="button" class="btn-sm btn-accent" id="syncYoutubeBtn">↻ Sincronizar RSS (${MD.escapeHtml(channel.handle || chData.key)})</button>
        </div>
      </div>

      <div class="cards-grid-3">
        ${videos
          .map(
            (v) => `
              <article class="glass-card">
                <div class="yt-thumb-wrap">
                  <img src="${MD.escapeHtml(v.thumbnail)}" alt="${MD.escapeHtml(v.title)}" loading="lazy" onerror="this.style.opacity='0.15'">
                  <span class="yt-type-chip">${v.type === 'short' ? 'SHORT' : 'LONGO'}</span>
                  <span class="yt-views-chip">${formatNumber(v.views)} views</span>
                </div>
                <div style="display:flex; justify-content:space-between; font-size:11px; color:var(--text-3);">
                  <span>${formatDatePt(v.published)}</span>
                  <span>${MD.escapeHtml(v.serie)}</span>
                </div>
                <h3 class="gc-title" style="font-size:13.5px; line-height:1.4;">${MD.escapeHtml(v.title)}</h3>
                <div class="gc-actions">
                  <a class="btn-sm btn-accent" href="${MD.escapeHtml(v.url)}" target="_blank" rel="noopener noreferrer">Assistir ↗</a>
                  <button type="button" class="btn-sm" data-postmortem-for="${MD.escapeHtml(v.id)}">Post-Mortem</button>
                </div>
              </article>
            `
          )
          .join('')}
      </div>
    `;

    container.querySelectorAll('#catalogTypeSwitch button').forEach((btn) => {
      btn.onclick = () => {
        state.catalogFilter = btn.dataset.cf;
        renderCatalogView(container);
      };
    });
    document.getElementById('catalogSortSel').onchange = (e) => {
      state.catalogSort = e.target.value;
      renderCatalogView(container);
    };
    document.getElementById('openCatalogDocBtn').onclick = () => setView('scripts', '00-canal/catalogo-youtube.md');

    document.getElementById('syncYoutubeBtn').onclick = async () => {
      if (!state.serverMode) {
        showToast('Para sincronizar o RSS ao vivo, rode: npm run sync:youtube (ou inicie o servidor local).');
        return;
      }
      showToast(`Consultando RSS do YouTube (${channel.handle || chData.key})...`);
      try {
        const res = await fetch('/api/sync-youtube', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ channel: state.activeChannel }),
        });
        const json = await res.json();
        if (json.state) state.data = normalizePayload(json.state);
        updateHeaderChrome();
        renderCatalogView(container);
        showToast(json.warning || `Sincronizado! ${json.updatedCount} vídeos verificados.`);
      } catch (err) {
        showToast(`Falha na sincronização: ${err.message}`);
      }
    };

    container.querySelectorAll('[data-postmortem-for]').forEach((btn) => {
      btn.onclick = () => {
        const vid = rawVideos.find((x) => x.id === btn.dataset.postmortemFor);
        const existing = (chData.docs || []).find((d) => d.meta.youtube_id === vid?.id);
        if (existing) {
          setView('scripts', existing.path);
        } else if (vid) {
          openNewDocModal({
            type: 'post-mortem',
            folder: '02-roteiros/publicados',
            title: `Post-Mortem: ${vid.title}`,
            serie: vid.serie,
            summary: `Análise do vídeo ${vid.id} (${vid.views} views, publicado em ${vid.published}).`,
          });
        }
      };
    });
  }

  /* =========================================================
     VIEW 6: PRODUÇÃO & PONTE KDENLIVE
  ========================================================= */
  function renderProductionView(container) {
    const chData = getActiveChannelData();
    const docs = chData.docs || [];
    const scheduled = docs
      .filter((d) => d.meta.data_alvo && d.meta.status !== 'publicado')
      .sort((a, b) => a.meta.data_alvo.localeCompare(b.meta.data_alvo));

    const prodDocs = docs.filter(
      (d) =>
        d.topFolder === '04-producao' ||
        d.path === '00-canal/ponte-kdenlive.md' ||
        d.path === '00-canal/identidade-e-status.md'
    );
    const kitDoc = docs.find((d) => d.path === '04-producao/kit-descricao-e-links.md');
    const rightDoc = kitDoc || docs.find((d) => d.path === '00-canal/ponte-kdenlive.md') || docs.find((d) => d.path === '00-canal/identidade-e-posicionamento.md');

    const kdenlive = state.data?.kdenlive || {};
    const modelos = kdenlive.modelos || [];
    const estilos = kdenlive.estilos || [];
    const kdenliveVideos = chData.key === 'mrj' ? (kdenlive.videosMrj || []) : (kdenlive.videosCrom || []);

    const kdenliveBridgeHtml = kdenlive.available
      ? `
        <section class="kdenlive-section">
          <div class="section-subhead">
            <div>
              <h2 class="panel-title" style="font-size:16px;">Ponte Kdenlive — ${MD.escapeHtml(kdenlive.root)}</h2>
              <span style="font-size:12px; color:var(--text-3);">Modelos de produção, estilos visuais (<code>estilos/*.md</code>) e projetos de vídeo para <strong>${MD.escapeHtml(chData.channel.name)}</strong>.</span>
            </div>
            <button type="button" class="btn-sm btn-kdenlive" id="copyKdenliveBaseCmdBtn">Copiar ./criar_video.sh --canal ${MD.escapeHtml(chData.key)}</button>
          </div>

          <h3 style="font-size:13px; color:var(--text-2); margin: 8px 0 10px;">Modelos de Vídeo (canal.json)</h3>
          <div class="cards-grid-3" style="margin-bottom: 20px;">
            ${modelos
              .map((m) => {
                const baseCmd = (m.comando || []).join('\n');
                const adaptedCmd =
                  m.nome === 'ensaio'
                    ? `./criar_video.sh --canal ${chData.key} <slug>`
                    : baseCmd;
                return `
                  <div class="glass-card">
                    <div class="gc-top">
                      <span class="status-pill st-roteiro">${MD.escapeHtml(m.nome)}</span>
                      <span style="font-family:var(--font-mono); font-size:11px; color:var(--text-3);">${MD.escapeHtml(m.velocidade || '')}</span>
                    </div>
                    <p class="gc-desc">${MD.escapeHtml(m.quando_usar || '')}</p>
                    <div class="kdenlive-cmd-box">${MD.escapeHtml(adaptedCmd)}</div>
                    <div class="gc-actions">
                      <button type="button" class="btn-sm" data-copy-text="${MD.escapeHtml(adaptedCmd)}">Copiar Comando</button>
                    </div>
                  </div>
                `;
              })
              .join('')}
          </div>

          <h3 style="font-size:13px; color:var(--text-2); margin: 8px 0 10px;">Estilos Visuais Disponíveis (${estilos.length} estilos em estilos/*.md)</h3>
          <div class="cards-grid-3" style="margin-bottom: 20px;">
            ${estilos
              .map(
                (st) => `
                  <div class="glass-card">
                    <div class="gc-top">
                      <strong style="font-size:13.5px;">${MD.escapeHtml(st.slug)}</strong>
                      <div class="style-swatches">
                        ${(st.colors || []).map((hex) => `<span class="style-swatch-dot" style="background:${MD.escapeHtml(hex)}" title="${MD.escapeHtml(hex)}"></span>`).join('')}
                      </div>
                    </div>
                    <p class="gc-desc">${MD.escapeHtml(st.summary || st.name)}</p>
                    <div class="gc-actions">
                      <button type="button" class="btn-sm" data-copy-text="estilos/${MD.escapeHtml(st.filename)}">Copiar Caminho</button>
                    </div>
                  </div>
                `
              )
              .join('')}
          </div>

          <h3 style="font-size:13px; color:var(--text-2); margin: 8px 0 10px;">Pastas em ${chData.key === 'mrj' ? 'videos/mrj/' : 'videos/'} (${kdenliveVideos.length})</h3>
          <div class="glass-card">
            ${kdenliveVideos.length
              ? kdenliveVideos
                  .map(
                    (kv) => `
                      <div class="tree-row" style="cursor:default;">
                        <div>
                          <div style="font-family:var(--font-mono); font-size:12px; color:var(--text-1);">${MD.escapeHtml(kv.slug)}</div>
                          <div style="font-size:11px; color:var(--text-3);">${MD.escapeHtml(kv.title)}${kv.serie ? ` • ${MD.escapeHtml(kv.serie)}` : ''}</div>
                        </div>
                        <div style="display:flex; gap:6px; align-items:center;">
                          ${kv.hasRender ? '<span class="status-pill st-publicado">Render OK</span>' : '<span class="status-pill st-edicao">Em projeto</span>'}
                          ${kv.youtubeUrl ? `<a class="btn-sm" href="${MD.escapeHtml(kv.youtubeUrl)}" target="_blank" rel="noopener noreferrer">YouTube ↗</a>` : ''}
                        </div>
                      </div>
                    `
                  )
                  .join('')
              : `<p style="color:var(--text-3); margin:0;">Nenhum projeto em <code>${chData.key === 'mrj' ? 'videos/mrj/' : 'videos/'}</code> ainda. Use <code>./criar_video.sh --canal ${MD.escapeHtml(chData.key)} &lt;slug&gt;</code> para criar o primeiro!</p>`}
          </div>
        </section>
      `
      : `
        <section class="kdenlive-section">
          <div class="glass-card">
            <h3 class="gc-title">Ponte Kdenlive</h3>
            <p class="gc-desc">Pasta Kdenlive não configurada ou não encontrada (${MD.escapeHtml(kdenlive.root || 'kdenliveRoot vazio')}). Configure <code>kdenliveRoot</code> no <code>config.local.json</code> e rode <code>npm run sync</code>.</p>
          </div>
        </section>
      `;

    container.innerHTML = `
      <div class="agent-grid">
        <div>
          <div class="section-subhead">
            <h2 class="panel-title" style="font-size:16px;">Fila Agendada (por Data Alvo)</h2>
            <button type="button" class="btn-sm" data-open-doc="00-canal/calendario-editorial.md">Calendário Editorial</button>
          </div>

          <div class="glass-card" style="margin-bottom:16px;">
            ${scheduled
              .map(
                (d) => `
                  <button type="button" class="history-row" data-open-doc="${MD.escapeHtml(d.path)}">
                    <div>
                      <span class="hr-title">${MD.escapeHtml(d.meta.titulo)}</span>
                      <span class="hr-sub">${MD.escapeHtml(d.meta.serie)} • ${MD.escapeHtml(d.meta.duracao_estimada)}</span>
                    </div>
                    <span class="hr-date">${formatDatePt(d.meta.data_alvo)}</span>
                    <span class="status-pill st-${MD.escapeHtml(d.meta.status)}">${MD.escapeHtml(d.meta.status)}</span>
                  </button>
                `
              )
              .join('') || '<p style="color:var(--text-3);">Nenhum roteiro com data alvo futura definida.</p>'}
          </div>

          <div class="section-subhead">
            <h2 class="panel-title" style="font-size:16px;">Documentos de Produção (${MD.escapeHtml(chData.channel.name)})</h2>
          </div>
          <div class="cards-grid-3" style="grid-template-columns:1fr 1fr;">
            ${prodDocs
              .map(
                (d) => `
                  <div class="glass-card">
                    <h3 class="gc-title">${MD.escapeHtml(d.meta.titulo)}</h3>
                    <p class="gc-desc">${MD.escapeHtml(d.meta.resumo || d.path)}</p>
                    <button type="button" class="btn-sm btn-accent" data-open-doc="${MD.escapeHtml(d.path)}">Abrir Documento</button>
                  </div>
                `
              )
              .join('') || '<p style="color:var(--text-3);">Sem documentos de produção.</p>'}
          </div>
        </div>

        <div>
          <div class="section-subhead">
            <h2 class="panel-title" style="font-size:16px;">${rightDoc ? MD.escapeHtml(rightDoc.meta.titulo) : 'Guia de Publicação'}</h2>
            ${rightDoc ? '<button type="button" class="btn-sm btn-accent" id="copyKitDescBtn">Copiar Bloco Principal</button>' : ''}
          </div>
          <div class="glass-card">
            <div class="md-article" style="font-size:13px;">
              ${rightDoc ? MD.renderMarkdown(rightDoc.body) : '<p>Nenhum documento de referência encontrado.</p>'}
            </div>
          </div>
        </div>
      </div>

      ${kdenliveBridgeHtml}
    `;

    container.querySelectorAll('[data-open-doc]').forEach((el) => {
      el.onclick = () => {
        const target = el.dataset.openDoc;
        if (docs.some((d) => d.path === target)) setView('scripts', target);
        else showToast(`Arquivo ${target} não existe neste canal.`);
      };
    });

    container.querySelectorAll('[data-copy-text]').forEach((btn) => {
      btn.onclick = () => copyText(btn.dataset.copyText, 'Copiado!');
    });

    const baseKdBtn = document.getElementById('copyKdenliveBaseCmdBtn');
    if (baseKdBtn) {
      baseKdBtn.onclick = () => {
        const root = kdenlive.root || '~/Videos/youtube-kdenlive';
        copyText(`cd ${root} && ./criar_video.sh --canal ${chData.key} novo-video`, 'Comando base Kdenlive copiado!');
      };
    }

    const copyKitBtn = document.getElementById('copyKitDescBtn');
    if (copyKitBtn && rightDoc) {
      copyKitBtn.onclick = () => {
        const match = /```(?:text|bash)?\n([\s\S]*?)```/.exec(rightDoc.body);
        copyText(match ? match[1] : rightDoc.body, 'Conteúdo copiado!');
      };
    }
  }

  /* =========================================================
     VIEW 7: CENTRAL DO AGENTE & ÁRVORE DE ARQUIVOS
  ========================================================= */
  function renderAgentView(container) {
    const chData = getActiveChannelData();
    const channel = chData.channel || {};
    const docs = chData.docs || [];
    const targetDoc =
      docs.find((d) => d.path === state.agentSelectedDoc) ||
      docs.find((d) => d.topFolder === '06-series' || d.topFolder === '02-roteiros') ||
      docs[0];
    const targetPath = targetDoc ? targetDoc.path : 'AGENTS.md';
    const wsPath = chData.workspacePath || channel.name;

    const prompts = [
      {
        title: 'Escrever Roteiro Longo a partir de uma Ficha/Série',
        text: `Leia AGENTS.md e "${targetPath}" em ${wsPath}. Crie um roteiro longo completo em 02-roteiros/rascunhos/ mantendo o esquema YAML e o tom do canal ${channel.handle || channel.name}, com gancho de 0–45s, 3 opções de título A/B e marcações [TELA]/[B-ROLL]. Depois rode: npm run sync (no Crom YouTube Studio).`,
      },
      {
        title: 'Levar Roteiro para a Esteira Kdenlive + MCP',
        text: `Leia "${targetPath}" em ${wsPath} e siga PROCESSO-NOVO-VIDEO.md no diretório Kdenlive. Inicialize o projeto com ./criar_video.sh --canal ${chData.key} <slug> e monte a timeline usando o MCP kdenlive-mcp-plus.`,
      },
      {
        title: 'Gerar 2–3 Shorts de um Roteiro Existente',
        text: `Leia "${targetPath}" em ${wsPath}. Extraia 2 roteiros curtos de 40–50 segundos com gancho seco e salve em 03-shorts/. Ao finalizar, sincronize o painel com: npm run sync.`,
      },
      {
        title: 'Revisar Gancho & Otimizar Retenção (00:00–00:45)',
        text: `Revise os primeiros 45 segundos de "${targetPath}" em ${wsPath}. Quero corte imediato na prova visual, zero enrolação e 5 variações de título com alto CTR. Atualize o arquivo e rode npm run sync.`,
      },
    ];

    container.innerHTML = `
      <div class="agent-grid">
        <div>
          <div class="section-subhead">
            <h2 class="panel-title" style="font-size:16px;">Prompts Prontos para o Agente (${MD.escapeHtml(channel.name)})</h2>
            <select class="select-dark" id="agentTargetDocSel" style="max-width:250px;">
              ${docs.map((d) => `<option value="${MD.escapeHtml(d.path)}"${d.path === targetPath ? ' selected' : ''}>${MD.escapeHtml(d.path)}</option>`).join('')}
            </select>
          </div>

          ${prompts
            .map(
              (p, idx) => `
                <div class="prompt-card">
                  <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
                    <strong style="font-size:13px;">${MD.escapeHtml(p.title)}</strong>
                    <button type="button" class="btn-sm btn-accent" data-copy-prompt="${idx}">Copiar Prompt</button>
                  </div>
                  <pre>${MD.escapeHtml(p.text)}</pre>
                </div>
              `
            )
            .join('')}

          <div class="prompt-card">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <strong style="font-size:13px;">Abrir com Bandeja do Sistema + Servidor Local</strong>
              <button type="button" class="btn-sm" id="copyRunCmdBtn">Copiar</button>
            </div>
            <pre>./bin/crom-studio --tray --open --canal ${MD.escapeHtml(chData.key)}</pre>
          </div>
        </div>

        <div>
          <div class="section-subhead">
            <h2 class="panel-title" style="font-size:16px;">Mapa Completo de Arquivos (${docs.length} .md)</h2>
            <button type="button" class="btn-sm btn-accent" data-open-doc="AGENTS.md">Ler AGENTS.md</button>
          </div>
          <div class="glass-card" style="max-height:620px; overflow-y:auto;">
            ${docs
              .map(
                (d) => `
                  <div class="tree-row" data-open-doc="${MD.escapeHtml(d.path)}">
                    <div style="min-width:0;">
                      <div style="font-family:var(--font-mono); font-size:11.5px; color:var(--text-1); overflow:hidden; text-overflow:ellipsis;">${MD.escapeHtml(d.path)}</div>
                      <div style="font-size:11px; color:var(--text-3);">${MD.escapeHtml(d.meta.titulo)}</div>
                    </div>
                    <span class="status-pill st-${MD.escapeHtml(d.meta.status)}">${MD.escapeHtml(d.meta.status)}</span>
                  </div>
                `
              )
              .join('')}
          </div>
        </div>
      </div>
    `;

    document.getElementById('agentTargetDocSel').onchange = (e) => {
      state.agentSelectedDoc = e.target.value;
      renderAgentView(container);
    };

    container.querySelectorAll('[data-copy-prompt]').forEach((btn) => {
      btn.onclick = () => copyText(prompts[Number(btn.dataset.copyPrompt)].text, 'Prompt copiado!');
    });

    document.getElementById('copyRunCmdBtn').onclick = () =>
      copyText(`./bin/crom-studio --tray --open --canal ${chData.key}`, 'Comando copiado!');

    container.querySelectorAll('[data-open-doc]').forEach((el) => {
      el.onclick = () => setView('scripts', el.dataset.openDoc);
    });
  }

  /* =========================================================
     MODAIS: CRIAR DOCUMENTO, BUSCA (Ctrl+K) & NOTIFICAÇÕES
  ========================================================= */
  function populateNewDocSelects(chData) {
    const serieEl = document.getElementById('newDocSerie');
    const folderEl = document.getElementById('newDocFolder');
    const seriesList = getChannelSeriesList(chData);

    serieEl.innerHTML = seriesList
      .map((s) => `<option value="${MD.escapeHtml(s)}">${MD.escapeHtml(s)}</option>`)
      .join('');

    const folders =
      chData.key === 'mrj'
        ? [
            { value: '06-series/imagine', label: '06-series/imagine (Série Imagine)' },
            { value: '06-series/pensamentos', label: '06-series/pensamentos (Série Pensamentos)' },
            { value: '06-series/historias', label: '06-series/historias (Série Histórias)' },
            { value: '06-series/reavaliar', label: '06-series/reavaliar (Série Reavaliar)' },
            { value: '06-series/crom', label: '06-series/crom (Série Crom)' },
            { value: '02-roteiros/rascunhos', label: '02-roteiros/rascunhos' },
            { value: '02-roteiros/em-producao', label: '02-roteiros/em-producao' },
            { value: '03-shorts', label: '03-shorts' },
            { value: '01-ideias', label: '01-ideias' },
            { value: '02-roteiros/publicados', label: '02-roteiros/publicados' },
            { value: '04-producao', label: '04-producao' },
          ]
        : [
            { value: '02-roteiros/rascunhos', label: '02-roteiros/rascunhos' },
            { value: '02-roteiros/em-producao', label: '02-roteiros/em-producao' },
            { value: '03-shorts', label: '03-shorts' },
            { value: '01-ideias', label: '01-ideias' },
            { value: '02-roteiros/publicados', label: '02-roteiros/publicados' },
            { value: '04-producao', label: '04-producao' },
          ];

    folderEl.innerHTML = folders
      .map((f) => `<option value="${MD.escapeHtml(f.value)}">${MD.escapeHtml(f.label)}</option>`)
      .join('');
  }

  function openNewDocModal(prefill = {}) {
    const chData = getActiveChannelData();
    populateNewDocSelects(chData);

    const modal = document.getElementById('newDocModal');
    const typeEl = document.getElementById('newDocType');
    const folderEl = document.getElementById('newDocFolder');
    const serieEl = document.getElementById('newDocSerie');
    const titleEl = document.getElementById('newDocTitle');
    const repoEl = document.getElementById('newDocRepo');
    const summaryEl = document.getElementById('newDocSummary');
    const dateEl = document.getElementById('newDocTargetDate');

    const defaultType = prefill.type || (chData.key === 'mrj' ? 'episodio-serie' : 'roteiro-longo');
    const defaultSerie = prefill.serie || (chData.key === 'mrj' ? 'Imagine' : 'Ensaios & Avulsos');
    const defaultFolder =
      prefill.folder ||
      (chData.key === 'mrj' && SERIE_META[defaultSerie]?.folder
        ? SERIE_META[defaultSerie].folder
        : '02-roteiros/rascunhos');

    typeEl.value = defaultType;
    if (Array.from(serieEl.options).some((o) => o.value === defaultSerie)) {
      serieEl.value = defaultSerie;
    }
    if (Array.from(folderEl.options).some((o) => o.value === defaultFolder)) {
      folderEl.value = defaultFolder;
    }
    titleEl.value = prefill.title || '';
    repoEl.value = prefill.repo || 'MrJc01';
    summaryEl.value = prefill.summary || '';
    dateEl.value = prefill.date || '';

    modal.classList.remove('hidden');
    setTimeout(() => titleEl.focus(), 40);
  }

  function buildTemplateBody(type, title, summary, repo, serie) {
    if (type === 'episodio-serie') {
      return `# ${serie} — ${title}

- **Série:** ${serie}
- **Repositório / Referência:** \`${repo || 'MrJc01'}\`

## Premissa & Conceito Central

${summary || '[Qual a ideia principal deste episódio, pergunta central ou construção proposta?]'}

## Estrutura Sugerida

### \`[GANCHO]\` 00:00 – 00:40 | Abertura Direta
- Apresentar o conceito ou curiosidade logo no segundo 0.

### 00:40 – 05:00 | Desenvolvimento / Bastidores / Análise
- Detalhar arquitetura, histórias, referências ou opinião fundamentada.

### 05:00 – Fim | Fechamento & Pergunta para a Comunidade
- Conexão com os comentários e próximos passos.

## Checklist de Produção

- [ ] Definir 3 opções de título A/B e thumbnail
- [ ] Separar referências visuais / prints / links
- [ ] Levar para Kdenlive com \`./criar_video.sh\`
`;
    }

    if (type === 'short') {
      return `# Short — ${title}

- **Duração alvo:** 45 segundos (~115 palavras)
- **Repositório:** \`${repo || 'MrJc01'}\`

---

## 00:00 – 00:06 | Gancho Seco
\`[TELA]\` [Mostrar resultado/terminal logo no segundo 0]
> **Fala:** "${summary || 'Frase de impacto direta sobre o projeto.'}"

## 00:06 – 00:32 | Como Funciona
\`[B-ROLL]\` [Zoom no código ou diagrama]
> **Fala:** "[Explicar a arquitetura ou ideia central em linguagem direta.]"

## 00:32 – 00:45 | CTA
> **Fala:** "Código e referências abertas — vídeo completo ligado aqui embaixo."
`;
    }

    if (type === 'ideia') {
      return `# Ideia — ${title}

- **Repositório:** \`${repo || 'MrJc01'}\`

## Tese Central

${summary || '[Por que esse vídeo merece ser gravado e qual problema real resolve?]'}

## Próximos Passos

- [ ] Validar referências / demo rodando limpo
- [ ] Definir 3 opções de título e thumbnail
- [ ] Transformar em roteiro ou episódio de série
`;
    }

    if (type === 'post-mortem') {
      return `# Post-Mortem — ${title}

${summary || ''}

## O que Funcionou Bem

- [Gancho / tema / ritmo]

## O que Melhorar no Próximo

- [Retenção / clareza / B-roll]
`;
    }

    return `# Roteiro — ${title}

## Opções de Título (Teste A/B)

1. **A:** \`${title}\`
2. **B:** \`[Variação focada em resultado]\`
3. **C:** \`[Variação curiosidade técnica]\`

## Checklist Pré-Gravação

- [ ] Demo testada e material separado
- [ ] Gancho dos primeiros 40s validado

---

## 00:00 — Gancho (00:00 – 00:45)

\`[TELA]\` [Mostrar aplicação, referência ou conceito funcionando]

**Fala:**
00:00 — ${summary || '[Abrir direto mostrando o problema ou ideia real na tela.]'}

---

## 00:45 — Desenvolvimento (00:45 – 07:00)

\`[B-ROLL]\` [Diagramas, código ou referências]

---

## 07:00 — Encerramento & CTA (07:00 – 09:00)

**Fala:**
07:00 — Links e código na descrição — até o próximo vídeo!
`;
  }

  function openCmdModal() {
    const modal = document.getElementById('cmdModal');
    const inp = document.getElementById('cmdInput');
    inp.value = '';
    modal.classList.remove('hidden');
    renderCmdResults('');
    setTimeout(() => inp.focus(), 30);
  }

  function renderCmdResults(query) {
    const chData = getActiveChannelData();
    const box = document.getElementById('cmdResults');
    const q = query.trim().toLowerCase();
    const docs = (chData.docs || []).filter(
      (d) => !q || `${d.meta.titulo} ${d.path} ${d.meta.serie}`.toLowerCase().includes(q)
    );
    const videos = (chData.videos || []).filter(
      (v) => !q || `${v.title} ${v.serie}`.toLowerCase().includes(q)
    );

    const html = [
      ...docs.slice(0, 7).map(
        (d) => `
          <button type="button" class="cmd-item" data-cmd-doc="${MD.escapeHtml(d.path)}">
            <span><strong>${MD.escapeHtml(d.meta.titulo)}</strong> <small style="color:var(--text-3);">${MD.escapeHtml(d.path)}</small></span>
            <span class="status-pill st-${MD.escapeHtml(d.meta.status)}">${MD.escapeHtml(d.meta.status)}</span>
          </button>
        `
      ),
      ...videos.slice(0, 4).map(
        (v) => `
          <button type="button" class="cmd-item" data-cmd-url="${MD.escapeHtml(v.url)}">
            <span>▶ ${MD.escapeHtml(v.title)}</span>
            <span style="font-family:var(--font-mono); font-size:11px; color:var(--text-3);">${formatNumber(v.views)} views</span>
          </button>
        `
      ),
    ].join('');

    box.innerHTML = html || '<p style="padding:16px; color:var(--text-3);">Nenhum resultado.</p>';

    box.querySelectorAll('[data-cmd-doc]').forEach((btn) => {
      btn.onclick = () => {
        document.getElementById('cmdModal').classList.add('hidden');
        setView('scripts', btn.dataset.cmdDoc);
      };
    });
    box.querySelectorAll('[data-cmd-url]').forEach((btn) => {
      btn.onclick = () => {
        document.getElementById('cmdModal').classList.add('hidden');
        global.open(btn.dataset.cmdUrl, '_blank', 'noopener,noreferrer');
      };
    });
  }

  function openNotifDrawer() {
    const chData = getActiveChannelData();
    const drawer = document.getElementById('notifDrawer');
    const body = document.getElementById('notifBody');
    const docs = chData.docs || [];

    const activeItems = docs.filter((d) => ['gravando', 'edicao', 'roteiro'].includes(d.meta.status));
    const incompleteChecks = docs.filter((d) => (d.stats?.checksTotal || 0) > (d.stats?.checksDone || 0));

    body.innerHTML = `
      <p style="font-size:12px; color:var(--text-3); margin-top:0;">Resumo vivo da fila em <strong>${MD.escapeHtml(chData.channel.name)} (${MD.escapeHtml(chData.channel.handle)})</strong>:</p>
      ${activeItems
        .map(
          (d) => `
            <div class="drawer-item">
              <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                <span class="status-pill st-${MD.escapeHtml(d.meta.status)}">${MD.escapeHtml(d.meta.status)}</span>
                <span style="font-size:11px; color:var(--text-3);">${d.meta.data_alvo ? formatDatePt(d.meta.data_alvo) : 'Sem data'}</span>
              </div>
              <div style="font-weight:600; font-size:13px; margin-bottom:6px;">${MD.escapeHtml(d.meta.titulo)}</div>
              <button type="button" class="btn-sm btn-accent" data-drawer-doc="${MD.escapeHtml(d.path)}">Abrir Roteiro</button>
            </div>
          `
        )
        .join('') || '<p style="font-size:12px; color:var(--text-3);">Nenhum roteiro em andamento no momento.</p>'}

      <h3 style="font-size:13px; margin:18px 0 8px;">Checklists em Aberto</h3>
      ${incompleteChecks
        .slice(0, 5)
        .map(
          (d) => `
            <div class="drawer-item">
              <div style="font-size:12.5px; font-weight:600;">${MD.escapeHtml(d.meta.titulo)}</div>
              <div style="font-size:11.5px; color:var(--text-3); margin:4px 0 8px;">${d.stats.checksDone}/${d.stats.checksTotal} concluídos</div>
              <button type="button" class="btn-sm" data-drawer-doc="${MD.escapeHtml(d.path)}">Ir para Checklist</button>
            </div>
          `
        )
        .join('') || '<p style="font-size:12px; color:var(--text-3);">Todos os checklists concluídos.</p>'}
    `;

    body.querySelectorAll('[data-drawer-doc]').forEach((btn) => {
      btn.onclick = () => {
        drawer.classList.add('hidden');
        setView('scripts', btn.dataset.drawerDoc);
      };
    });

    drawer.classList.remove('hidden');
  }

  /* =========================================================
     BOOT & BINDINGS GLOBAIS
  ========================================================= */
  function bindGlobalEvents() {
    document.querySelectorAll('#sideNav .nav-item').forEach((btn) => {
      btn.onclick = () => setView(btn.dataset.view);
    });

    document.getElementById('brandBtn').onclick = () => setView('dashboard');
    document.getElementById('channelAvatarBtn').onclick = () => setView('catalog');
    document.getElementById('connectionModeBtn').onclick = () => connectLocalFolder();
    document.getElementById('fabNewBtn').onclick = () => openNewDocModal();
    document.getElementById('cmdSearchBtn').onclick = () => openCmdModal();
    document.getElementById('notifBtn').onclick = () => openNotifDrawer();
    document.getElementById('closeNotifBtn').onclick = () => document.getElementById('notifDrawer').classList.add('hidden');

    const colorMenu = document.getElementById('colorMenu');
    const toggleColorMenu = (e) => {
      e.stopPropagation();
      ColorFlowEngine.renderMenu();
      colorMenu.classList.toggle('hidden');
    };
    document.getElementById('colorPillBtn').onclick = toggleColorMenu;
    document.getElementById('colorToggleBtn').onclick = toggleColorMenu;

    colorMenu.onclick = (e) => e.stopPropagation();
    document.addEventListener('click', () => colorMenu.classList.add('hidden'));

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

    document.getElementById('cmdInput').oninput = (e) => renderCmdResults(e.target.value);

    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        openCmdModal();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && state.view === 'scripts') {
        e.preventDefault();
        saveCurrentDoc();
      } else if (e.key === 'Escape') {
        document.querySelectorAll('.modal-backdrop, .drawer-backdrop, #colorMenu').forEach((el) => el.classList.add('hidden'));
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

  async function init() {
    ColorFlowEngine.init();
    bindGlobalEvents();
    await loadInitialData();
    updateHeaderChrome();
    renderCurrentView();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window);
