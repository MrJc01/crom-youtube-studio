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
    map: 'Mapa de Roteiros',
    whiteboard: 'Quadro & Fluxos',
    link: 'Link Fixado',
    pipeline: 'Pipeline Kanban',
    ideas: 'Ideias, Séries & GitHub',
    catalog: 'Catálogo YouTube',
    production: 'Produção & Kdenlive',
    recorder: 'Estúdio de Gravação',
    notes: 'Notas Rápidas',
    agent: 'Central do Agente',
    settings: 'Configurações do Workspace',
  };

  const VIEW_TO_SLUG = {
    dashboard: 'visao-geral',
    scripts: 'roteiros',
    map: 'mapa',
    whiteboard: 'quadro',
    link: 'link',
    pipeline: 'pipeline',
    ideas: 'ideias',
    catalog: 'catalogo',
    production: 'producao',
    recorder: 'gravar',
    notes: 'notas',
    agent: 'agente',
    settings: 'configuracoes',
  };

  const SLUG_TO_VIEW = {
    'visao-geral': 'dashboard',
    dashboard: 'dashboard',
    roteiros: 'scripts',
    scripts: 'scripts',
    leitor: 'scripts',
    mapa: 'map',
    map: 'map',
    quadro: 'whiteboard',
    quadros: 'whiteboard',
    whiteboard: 'whiteboard',
    excalidraw: 'whiteboard',
    fluxograma: 'whiteboard',
    canvas: 'whiteboard',
    link: 'link',
    pipeline: 'pipeline',
    kanban: 'pipeline',
    ideias: 'ideas',
    ideas: 'ideas',
    series: 'ideas',
    catalogo: 'catalog',
    catalog: 'catalog',
    youtube: 'catalog',
    producao: 'production',
    production: 'production',
    kdenlive: 'production',
    gravar: 'recorder',
    gravador: 'recorder',
    recorder: 'recorder',
    estudio: 'recorder',
    notas: 'notes',
    notes: 'notes',
    keep: 'notes',
    agente: 'agent',
    agent: 'agent',
    configuracoes: 'settings',
    settings: 'settings',
    config: 'settings',
  };

  const STATUS_VISUAL = {
    publicado: { label: 'Publicado', color: '#22c55e', bg: 'rgba(34, 197, 94, 0.11)', border: 'rgba(34, 197, 94, 0.34)' },
    gravando: { label: 'Gravando', color: '#f43f5e', bg: 'rgba(244, 63, 94, 0.12)', border: 'rgba(244, 63, 94, 0.38)' },
    edicao: { label: 'Edição', color: '#f59e0b', bg: 'rgba(245, 185, 66, 0.12)', border: 'rgba(245, 185, 66, 0.36)' },
    roteiro: { label: 'Roteiro', color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.12)', border: 'rgba(139, 92, 246, 0.36)' },
    pesquisa: { label: 'Pesquisa', color: '#38bdf8', bg: 'rgba(56, 189, 248, 0.11)', border: 'rgba(56, 189, 248, 0.32)' },
    ideia: { label: 'Ideia', color: '#94a3b8', bg: 'rgba(148, 163, 184, 0.08)', border: 'rgba(148, 163, 184, 0.24)' },
    referencia: { label: 'Referência', color: '#64748b', bg: 'rgba(100, 116, 139, 0.08)', border: 'rgba(100, 116, 139, 0.22)' },
    template: { label: 'Template', color: '#c084fc', bg: 'rgba(192, 132, 252, 0.08)', border: 'rgba(192, 132, 252, 0.24)' },
    arquivado: { label: 'Arquivado', color: '#475569', bg: 'rgba(71, 85, 105, 0.08)', border: 'rgba(71, 85, 105, 0.22)' },
  };

  const STORAGE_KEY_PREFS = 'crom_studio_prefs_v1';
  const STORAGE_KEY_DRAFTS = 'crom_studio_drafts_v2';
  const STORAGE_KEY_TABS = 'crom_studio_tabs_v1';

  const state = {
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
      prompterPlaying: false,
      prompterSpeed: 2.0,
      prompterFontSize: 22,
      prompterRafId: null,
      prompterLastTs: 0,
      sessions: [],
      sessionsChannel: '',
      loading: false,
      uploading: false,
      uploadProgress: '',
      lastSavedInfo: null,
      activePlayer: null,
      convertingKey: '',
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
    },
    remoteStatus: null,
    remoteLoading: false,
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
      if (saved.readerFontSize) {
        state.readerFontSize = Math.min(24, Math.max(13, Number(saved.readerFontSize)));
      }
      state.prefs = {
        tabBarAlwaysOpen: Boolean(saved.tabBarAlwaysOpen),
        catalogLayout: saved.catalogLayout === 'grid' ? 'grid' : 'stacked',
        wbLayout: saved.wbLayout === 'list' ? 'list' : 'grid',
      };
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

  function formatDateTimePt(isoStr) {
    if (!isoStr) return '—';
    const d = new Date(isoStr);
    if (Number.isNaN(d.getTime())) return formatDatePt(isoStr);
    return d.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
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

  function findDocMatchInChannel(chData, rawDocSlug) {
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

  function parseRouteFromLocation(data) {
    const channels = data.channels || {};
    const params = new URLSearchParams(global.location.search);
    const paramCanal = (params.get('canal') || params.get('channel') || '').trim().toLowerCase();

    let rawSegs = [];
    if (global.location.protocol.startsWith('http')) {
      rawSegs = global.location.pathname.split('/').filter(Boolean).map((s) => decodeURIComponent(s));
    } else if (global.location.hash && global.location.hash.startsWith('#/')) {
      rawSegs = global.location.hash.slice(2).split('/').filter(Boolean).map((s) => decodeURIComponent(s));
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
    const modoMap = { ler: 'read', read: 'read', editar: 'edit', edit: 'edit', teleprompter: 'prompter', prompter: 'prompter', historico: 'history', history: 'history' };
    const docMode = modoMap[modoParam] || null;
    const verParam = params.get('versao') || null;
    const focusParam = params.get('foco') === '1';
    const linkUrl = params.get('url') || '';
    const linkTitle = params.get('titulo') || '';

    return { channelKey, view, docPath, docMode, verParam, focusMode: focusParam, boardId, linkUrl, linkTitle };
  }

  function buildFriendlyUrl(
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
    } else if (view === 'link' && state.activeLinkTab?.externalUrl) {
      qs.set('url', state.activeLinkTab.externalUrl);
      if (state.activeLinkTab.title) qs.set('titulo', state.activeLinkTab.title);
    }
    const queryStr = qs.toString() ? `?${qs.toString()}` : '';

    if (global.location.protocol.startsWith('http')) {
      return `${routePath}${queryStr}`;
    }
    return `#${routePath}${queryStr}`;
  }

  function syncBrowserUrl({ replace = false } = {}) {
    try {
      const target = buildFriendlyUrl();
      if (global.location.protocol.startsWith('http')) {
        if (global.location.pathname + global.location.search === target) return;
        if (replace) global.history.replaceState(null, '', target);
        else global.history.pushState(null, '', target);
      } else {
        if (global.location.hash !== target) {
          global.history.replaceState(null, '', target);
        }
      }
    } catch {
      // ignora em contextos restritos
    }
  }

  function resolveInitialChannel(data) {
    return parseRouteFromLocation(data).channelKey;
  }

  function initSelectedSeriesForChannel(chData) {
    const allSeries = getChannelSeriesList(chData);
    const editorial = allSeries.filter((s) => s !== 'Canal & Ops');
    state.selectedSeries = new Set(editorial.length ? editorial : allSeries);
  }

  function applyRouteSnapshot(route) {
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

  async function loadInitialData() {
    if (global.location.protocol.startsWith('http')) {
      try {
        const res = await fetch('/api/state', { cache: 'no-store' });
        if (res.ok) {
          const json = await res.json();
          state.serverMode = true;
          state.data = normalizePayload(json);
          const route = parseRouteFromLocation(state.data);
          applyRouteSnapshot(route);
          initTabsFromStorage(route);
          syncBrowserUrl({ replace: true });
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
    const route = parseRouteFromLocation(state.data);
    applyRouteSnapshot(route);
    initTabsFromStorage(route);
    syncBrowserUrl({ replace: true });
  }

  function switchChannel(channelKey, { preserveView = true } = {}) {
    if (!state.data?.channels?.[channelKey]) return;
    stopPrompter();
    if (state.view === 'whiteboard' && state.boardDirtyScene) {
      flushWhiteboardSaveOnLeave();
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
    state.notesState.composerExpanded = false;
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

  /* =========================================================
     PERSISTÊNCIA HÍBRIDA MULTI-CANAL
  ========================================================= */
  async function persistSaveDoc(docPath, fullRaw, newPath = null, { version = 'principal', commitMessage = '' } = {}) {
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
  function updateConnectionBadge() {
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
    document.getElementById('notifCount').textContent = pendingAlerts;

    const appEl = document.getElementById('app');
    const wbEditorOpen = state.view === 'whiteboard' && Boolean(state.activeBoardId);
    if (appEl) {
      appEl.className = `studio-shell view-${state.view}${state.focusMode ? ' is-focus-mode' : ''}${wbEditorOpen ? ' is-wb-editor-open' : ''}`;
    }
    document.body.classList.toggle('is-focus-mode', Boolean(state.focusMode));
    document.body.classList.toggle('is-whiteboard-view', state.view === 'whiteboard');
    document.body.classList.toggle('is-whiteboard-editor', wbEditorOpen);
    document.body.classList.toggle('is-wb-fullscreen', Boolean(state.boardFullscreen && wbEditorOpen));
    document.body.classList.toggle('is-flow-fullscreen', Boolean(state.mapFlowFullscreen && state.view === 'map' && state.mapStyle === 'flowchart'));
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

  function setView(viewName, docPath = null, { replaceUrl = false, boardId = undefined } = {}) {
    const prevView = state.view;
    stopPrompter();
    cleanupMapFlowObservers();
    if (prevView === 'whiteboard' && state.boardDirtyScene && (viewName !== 'whiteboard' || (boardId !== undefined && boardId !== state.activeBoardId))) {
      flushWhiteboardSaveOnLeave();
    }
    if (prevView === 'recorder' && viewName !== 'recorder' && state.recorder.status === 'idle') {
      stopRecorderMediaStreams();
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
      case 'map':
        renderMapView(container);
        break;
      case 'whiteboard':
        renderWhiteboardView(container);
        break;
      case 'link':
        renderExternalLinkTabView(container);
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
      case 'recorder':
        renderRecorderView(container);
        break;
      case 'notes':
        renderNotesView(container);
        break;
      case 'agent':
        renderAgentView(container);
        break;
      case 'settings':
        renderSettingsView(container);
        break;
      default:
        renderDashboard(container);
    }
  }

  /* =========================================================
     BARRA DE ABAS RETRÁTIL NO TOPO & ABAS DE LINK EXTERNO
  ========================================================= */
  function isYouTubeUrl(url) {
    return Boolean(extractYouTubeVideoId(url));
  }

  function extractYouTubeVideoId(url) {
    const raw = String(url || '').trim();
    if (!raw) return '';
    try {
      const u = new URL(raw);
      const host = u.hostname.replace(/^www\./, '').toLowerCase();
      if (host === 'youtu.be') {
        return u.pathname.split('/').filter(Boolean)[0] || '';
      }
      if (host === 'youtube.com' || host === 'm.youtube.com') {
        if (u.pathname === '/watch') return u.searchParams.get('v') || '';
        const parts = u.pathname.split('/').filter(Boolean);
        if (parts[0] === 'shorts' || parts[0] === 'embed' || parts[0] === 'live') {
          return parts[1] || '';
        }
      }
    } catch {
      // ignora URL inválida
    }
    return '';
  }

  function getHostnameLabel(url) {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return String(url || 'Link Externo').slice(0, 32);
    }
  }

  function getViewTabIcon(viewName) {
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

  function getTabPresentation(tab) {
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
      const list = tab.channel === state.activeChannel && state.boardsList.length
        ? state.boardsList
        : (chData?.boards || []);
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

  function makeTabObject(spec = {}) {
    const kind = spec.kind === 'link' ? 'link' : 'studio';
    const channel = spec.channel && state.data?.channels?.[spec.channel]
      ? spec.channel
      : state.activeChannel;
    const base = {
      id: spec.id || `tab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      kind,
      channel,
      view: kind === 'link' ? 'link' : (spec.view || 'dashboard'),
      docPath: kind === 'studio' ? (spec.docPath || null) : null,
      boardId: kind === 'studio' ? (spec.boardId || null) : null,
      mapStyle: kind === 'studio' ? (spec.mapStyle || 'cards') : 'cards',
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

  function saveTabsToStorage() {
    saveJsonStorage(STORAGE_KEY_TABS, {
      tabs: state.tabs,
      activeTabId: state.activeTabId,
    });
  }

  function isTabstripOpen() {
    if (state.focusMode || state.boardFullscreen || state.mapFlowFullscreen) return false;
    if (state.prefs?.tabBarAlwaysOpen) return true;
    if (state.view === 'dashboard') return state.tabBarPinned !== false;
    return state.tabBarPinned === true;
  }

  function initTabsFromStorage(route) {
    const saved = loadJsonStorage(STORAGE_KEY_TABS, null);
    const channels = state.data?.channels || {};
    let loadedTabs = Array.isArray(saved?.tabs)
      ? saved.tabs
          .filter((t) => t && (t.kind === 'link' ? Boolean(t.externalUrl) : Boolean(t.view)))
          .map((t) => makeTabObject({
            ...t,
            channel: channels[t.channel] ? t.channel : (state.activeChannel || Object.keys(channels)[0] || 'mrj'),
          }))
      : [];

    const routeTabSpec = route.view === 'link' && route.linkUrl
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
      const urlSegs = global.location.protocol.startsWith('http')
        ? global.location.pathname.split('/').filter(Boolean)
        : [];
      const matchesRoute =
        savedActive.kind === routeTabSpec.kind &&
        savedActive.channel === routeTabSpec.channel &&
        savedActive.view === routeTabSpec.view &&
        (routeTabSpec.view !== 'scripts' || savedActive.docPath === routeTabSpec.docPath) &&
        (routeTabSpec.view !== 'whiteboard' || (savedActive.boardId || null) === (routeTabSpec.boardId || null)) &&
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

  function applyTabToStateSilent(tab) {
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
    state.selectedDocPath = state.view === 'scripts' ? (tab.docPath || null) : state.selectedDocPath;
    if (state.view === 'whiteboard') {
      state.activeBoardId = tab.boardId || null;
    }
    if (state.view === 'map' && tab.mapStyle) {
      state.mapStyle = tab.mapStyle;
    }
  }

  function syncActiveTabFromState() {
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

  function renderTabstrip() {
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

  function openNewTab(spec = {}, { activate = true } = {}) {
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

  function activateTab(tabId) {
    const tab = state.tabs.find((t) => t.id === tabId);
    if (!tab) return;
    const prevView = state.view;
    stopPrompter();

    if (prevView === 'whiteboard' && state.boardDirtyScene) {
      flushWhiteboardSaveOnLeave();
    }

    state.activeTabId = tab.id;
    const nextView = tab.kind === 'link' ? 'link' : (tab.view || 'dashboard');
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
      const prefs = loadJsonStorage(STORAGE_KEY_PREFS, {});
      prefs.activeChannel = tab.channel;
      saveJsonStorage(STORAGE_KEY_PREFS, prefs);
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
    syncBrowserUrl({ replace: false });
    updateHeaderChrome();
    renderCurrentView();
  }

  function closeTab(tabId) {
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

  function closeOtherTabs(keepTabId) {
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

  function duplicateTab(tabId) {
    const src = state.tabs.find((t) => t.id === tabId);
    if (!src) return;
    const copy = makeTabObject({ ...src, id: undefined });
    const idx = state.tabs.findIndex((t) => t.id === tabId);
    state.tabs.splice(idx + 1, 0, copy);
    saveTabsToStorage();
    activateTab(copy.id);
  }

  function buildLinkContextMarkdown(title, url) {
    const chData = getActiveChannelData();
    const ch = chData.channel || {};
    return [
      `- **Link:** [${title || url}](${url})`,
      `- **Canal:** ${ch.name || chData.key} (${ch.handle || chData.key})`,
      `- **Página no Studio:** ${VIEW_TITLES[state.view] || state.view} (${global.location.href})`,
    ].join('\n');
  }

  function buildDocContextMarkdown(doc) {
    const chData = getActiveChannelData();
    const ch = chData.channel || {};
    const urlPath = buildFriendlyUrl(chData.key, 'scripts', doc.path);
    const fullUrl = global.location.protocol.startsWith('http')
      ? `${global.location.origin}${urlPath}`
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

  function renderExternalLinkTabView(container) {
    const tab = state.activeLinkTab || state.tabs.find((t) => t.id === state.activeTabId && t.kind === 'link');
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
      document.getElementById('linkTabGoHomeBtn')?.addEventListener('click', () => setView('dashboard'));
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
      else setView('dashboard');
    });
  }

  function closeContextMenu() {
    const menu = document.getElementById('studioContextMenu');
    if (menu) menu.classList.add('hidden');
  }

  function showStudioContextMenu(clientX, clientY, headerLabel, items) {
    const menu = document.getElementById('studioContextMenu');
    if (!menu || !items.length) return;

    const itemsHtml = items
      .map((item, idx) => {
        if (item.sep) return '<div class="ctx-menu-sep" role="separator"></div>';
        return `
          <button type="button" class="ctx-menu-item${item.danger ? ' is-danger' : ''}" data-ctx-idx="${idx}" role="menuitem">
            <span class="ctx-menu-icon">${MD.escapeHtml(item.icon || '•')}</span>
            <span class="ctx-menu-label">${MD.escapeHtml(item.label)}</span>
          </button>
        `;
      })
      .join('');

    menu.innerHTML = `${headerLabel ? `<div class="ctx-menu-head">${MD.escapeHtml(headerLabel)}</div>` : ''}${itemsHtml}`;
    menu.style.visibility = 'hidden';
    menu.classList.remove('hidden');

    const rect = menu.getBoundingClientRect();
    const vw = global.innerWidth || document.documentElement.clientWidth;
    const vh = global.innerHeight || document.documentElement.clientHeight;
    const left = Math.max(8, Math.min(clientX, vw - rect.width - 8));
    const top = Math.max(8, Math.min(clientY, vh - rect.height - 8));
    menu.style.left = `${Math.round(left)}px`;
    menu.style.top = `${Math.round(top)}px`;
    menu.style.visibility = '';

    menu.querySelectorAll('[data-ctx-idx]').forEach((btn) => {
      btn.onclick = (ev) => {
        ev.stopPropagation();
        const item = items[Number(btn.dataset.ctxIdx)];
        closeContextMenu();
        if (item && typeof item.action === 'function') item.action();
      };
    });
  }

  function resolveContextTarget(targetEl) {
    if (!targetEl || !(targetEl instanceof Element)) return null;
    if (targetEl.closest('input, textarea, select, [contenteditable], #excalidrawFrame')) return null;

    const tabEl = targetEl.closest('.studio-tab[data-tab-id]');
    if (tabEl) {
      return { kind: 'tab', tabId: tabEl.dataset.tabId };
    }

    const navEl = targetEl.closest('#sideNav .nav-item[data-view]');
    if (navEl) {
      return { kind: 'nav', view: navEl.dataset.view };
    }

    const docEl = targetEl.closest(
      '[data-select-doc], [data-open-doc], [data-open-map-doc], [data-flow-doc], [data-spot-open], [data-drawer-doc], [data-cmd-doc], a[data-rel-md], .kanban-card[data-doc-path], .kanban-card[data-drag-path]'
    );
    if (docEl) {
      let docPath =
        docEl.dataset.selectDoc ||
        docEl.dataset.openDoc ||
        docEl.dataset.openMapDoc ||
        docEl.dataset.flowDoc ||
        docEl.dataset.spotOpen ||
        docEl.dataset.drawerDoc ||
        docEl.dataset.cmdDoc ||
        docEl.dataset.docPath ||
        docEl.dataset.dragPath ||
        '';
      if (!docPath && docEl.dataset.relMd) {
        const activeDoc = getActiveDoc();
        docPath = resolveRelativeMdPath(activeDoc?.folder, docEl.dataset.relMd) || '';
      }
      if (docPath) {
        return { kind: 'doc', docPath };
      }
    }

    const ctxBoardCard = targetEl.closest('[data-context-url]');
    if (ctxBoardCard && ctxBoardCard.dataset.contextUrl) {
      const ctxUrl = ctxBoardCard.dataset.contextUrl.trim();
      const mBoard = /^\/([^/]+)\/quadro\/([^/?#]+)$/i.exec(ctxUrl);
      if (mBoard) {
        return {
          kind: 'board',
          channel: decodeURIComponent(mBoard[1]).toLowerCase(),
          boardId: decodeURIComponent(mBoard[2]).toLowerCase(),
          contextUrl: ctxUrl,
        };
      }
    }

    const extLink = targetEl.closest('a[href^="http://"], a[href^="https://"]');
    if (extLink) {
      return {
        kind: 'external',
        url: extLink.href,
        title: (extLink.getAttribute('title') || extLink.textContent || extLink.href).trim(),
      };
    }

    const extCard = targetEl.closest('[data-ext-url]');
    if (extCard && extCard.dataset.extUrl) {
      return {
        kind: 'external',
        url: extCard.dataset.extUrl,
        title: extCard.dataset.extTitle || extCard.dataset.extUrl,
      };
    }

    return null;
  }

  function handleStudioContextMenu(e) {
    const resolved = resolveContextTarget(e.target);
    if (!resolved) {
      closeContextMenu();
      return;
    }

    e.preventDefault();
    const chData = getActiveChannelData();
    const docs = chData.docs || [];

    if (resolved.kind === 'tab') {
      const tab = state.tabs.find((t) => t.id === resolved.tabId);
      if (!tab) return;
      const pres = getTabPresentation(tab);
      const tabUrl = tab.kind === 'link'
        ? tab.externalUrl
        : (global.location.protocol.startsWith('http')
            ? `${global.location.origin}${buildFriendlyUrl(tab.channel, tab.view, tab.docPath, tab.boardId)}`
            : buildFriendlyUrl(tab.channel, tab.view, tab.docPath, tab.boardId));
      const items = [
        { icon: '⧉', label: 'Duplicar aba', action: () => duplicateTab(tab.id) },
        {
          icon: '📋',
          label: 'Copiar como contexto',
          action: () => {
            if (tab.kind === 'link') {
              copyText(buildLinkContextMarkdown(pres.title, tab.externalUrl), 'Contexto copiado!');
            } else if (tab.view === 'scripts' && tab.docPath) {
              const d = state.data?.channels?.[tab.channel]?.docs?.find((x) => x.path === tab.docPath);
              copyText(d ? buildDocContextMarkdown(d) : `${pres.title} — ${tabUrl}`, 'Contexto copiado!');
            } else {
              copyText(`- **Aba:** ${pres.title} (${tab.channel})\n- **URL:** ${tabUrl}`, 'Contexto copiado!');
            }
          },
        },
        { icon: '🔗', label: 'Copiar link', action: () => copyText(tabUrl, 'Link copiado!') },
        { sep: true },
        { icon: '✕', label: 'Fechar aba', danger: true, action: () => closeTab(tab.id) },
      ];
      if (state.tabs.length > 1) {
        items.push({ icon: '✕', label: 'Fechar outras abas', action: () => closeOtherTabs(tab.id) });
      }
      showStudioContextMenu(e.clientX, e.clientY, pres.title, items);
      return;
    }

    if (resolved.kind === 'doc') {
      const doc = docs.find((d) => d.path === resolved.docPath);
      const title = doc?.meta?.titulo || resolved.docPath;
      const urlPath = buildFriendlyUrl(state.activeChannel, 'scripts', resolved.docPath);
      const fullUrl = global.location.protocol.startsWith('http')
        ? `${global.location.origin}${urlPath}`
        : urlPath;

      const items = [
        {
          icon: '↗',
          label: 'Abrir em nova aba',
          action: () => {
            document.querySelectorAll('.modal-backdrop, .drawer-backdrop').forEach((m) => m.classList.add('hidden'));
            openNewTab({ kind: 'studio', channel: state.activeChannel, view: 'scripts', docPath: resolved.docPath }, { activate: true });
          },
        },
        {
          icon: '＋',
          label: 'Abrir em aba (segundo plano)',
          action: () => {
            openNewTab({ kind: 'studio', channel: state.activeChannel, view: 'scripts', docPath: resolved.docPath }, { activate: false });
          },
        },
        { sep: true },
        {
          icon: '📋',
          label: 'Copiar como contexto',
          action: () => {
            const mdText = doc
              ? buildDocContextMarkdown(doc)
              : `- **Arquivo:** \`${resolved.docPath}\`\n- **URL:** ${fullUrl}`;
            copyText(mdText, 'Contexto Markdown copiado!');
          },
        },
        { icon: '🔗', label: 'Copiar link (URL)', action: () => copyText(fullUrl, 'URL copiada!') },
        { icon: '📄', label: 'Copiar caminho do arquivo', action: () => copyText(resolved.docPath, 'Caminho copiado!') },
        { sep: true },
        {
          icon: '◈',
          label: 'Enviar para o Quadro (Excalidraw)',
          action: () => {
            document.querySelectorAll('.modal-backdrop, .drawer-backdrop').forEach((m) => m.classList.add('hidden'));
            if (doc) sendDocToWhiteboard(doc);
            else showToast('Documento não encontrado neste workspace.');
          },
        },
      ];
      showStudioContextMenu(e.clientX, e.clientY, title, items);
      return;
    }

    if (resolved.kind === 'board') {
      const targetCh = state.data?.channels?.[resolved.channel] ? resolved.channel : state.activeChannel;
      const list = targetCh === state.activeChannel && state.boardsList.length
        ? state.boardsList
        : (state.data?.channels?.[targetCh]?.boards || []);
      const boardObj = list.find((b) => b.id === resolved.boardId);
      const bTitle = boardObj?.title || resolved.boardId;
      const urlPath = buildFriendlyUrl(targetCh, 'whiteboard', null, resolved.boardId);
      const fullUrl = global.location.protocol.startsWith('http')
        ? `${global.location.origin}${urlPath}`
        : urlPath;
      const items = [
        {
          icon: '✎',
          label: 'Abrir no Editor Excalidraw',
          action: () => {
            if (targetCh !== state.activeChannel) switchChannel(targetCh, { preserveView: false });
            openBoardEditor(resolved.boardId);
          },
        },
        {
          icon: '↗',
          label: 'Abrir em nova aba',
          action: () => openNewTab({ kind: 'studio', channel: targetCh, view: 'whiteboard', boardId: resolved.boardId }, { activate: true }),
        },
        {
          icon: '＋',
          label: 'Abrir em aba (segundo plano)',
          action: () => openNewTab({ kind: 'studio', channel: targetCh, view: 'whiteboard', boardId: resolved.boardId }, { activate: false }),
        },
        { sep: true },
        { icon: '🔗', label: 'Copiar link (URL)', action: () => copyText(fullUrl, 'URL do quadro copiada!') },
        { icon: '✎', label: 'Renomear quadro', action: () => openWbBoardModal('rename', resolved.boardId) },
        { icon: '🗑', label: 'Excluir quadro', danger: true, action: () => openWbDeleteConfirmModal(resolved.boardId) },
      ];
      showStudioContextMenu(e.clientX, e.clientY, bTitle, items);
      return;
    }

    if (resolved.kind === 'external') {
      const cleanTitle = resolved.title.replace(/\s*↗\s*$/, '').trim() || getHostnameLabel(resolved.url);
      const items = [
        {
          icon: '＋',
          label: 'Abrir na barra de abas (topo)',
          action: () => {
            openNewTab(
              { kind: 'link', channel: state.activeChannel, view: 'link', externalUrl: resolved.url, title: cleanTitle },
              { activate: true }
            );
          },
        },
        {
          icon: '↗',
          label: 'Abrir no navegador (nova guia)',
          action: () => global.open(resolved.url, '_blank', 'noopener,noreferrer'),
        },
        { sep: true },
        {
          icon: '📋',
          label: 'Copiar como contexto',
          action: () => copyText(buildLinkContextMarkdown(cleanTitle, resolved.url), 'Contexto do link copiado!'),
        },
        { icon: '🔗', label: 'Copiar URL', action: () => copyText(resolved.url, 'URL copiada!') },
      ];
      showStudioContextMenu(e.clientX, e.clientY, cleanTitle, items);
      return;
    }

    if (resolved.kind === 'nav') {
      const view = resolved.view;
      const viewTitle = VIEW_TITLES[view] || view;
      const urlPath = buildFriendlyUrl(state.activeChannel, view, null, null);
      const fullUrl = global.location.protocol.startsWith('http')
        ? `${global.location.origin}${urlPath}`
        : urlPath;
      const items = [
        {
          icon: '↗',
          label: 'Abrir página em nova aba',
          action: () => openNewTab({ kind: 'studio', channel: state.activeChannel, view }, { activate: true }),
        },
        {
          icon: '＋',
          label: 'Abrir em aba (segundo plano)',
          action: () => openNewTab({ kind: 'studio', channel: state.activeChannel, view }, { activate: false }),
        },
        { sep: true },
        {
          icon: '📋',
          label: 'Copiar como contexto',
          action: () => copyText(`- **Página:** ${viewTitle} (${chData.channel.name})\n- **URL:** ${fullUrl}`, 'Contexto da página copiado!'),
        },
        { icon: '🔗', label: 'Copiar URL amigável', action: () => copyText(fullUrl, 'URL amigável copiada!') },
      ];
      showStudioContextMenu(e.clientX, e.clientY, `${viewTitle} • ${chData.channel.name}`, items);
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

    let channelBannerHtml = '';
    if (channel.bannerEnabled && (channel.bannerTitle || channel.bannerSubtitle || channel.bannerBadge)) {
      channelBannerHtml = `
        <div class="channel-status-banner${isPaused ? '' : ' is-active'}">
          <div class="csb-left">
            ${channel.bannerBadge ? `<span class="channel-status-badge ${isPaused ? 'is-pausado' : 'is-ativo'}">${MD.escapeHtml(channel.bannerBadge)}</span>` : ''}
            <div>
              ${channel.bannerTitle ? `<div class="csb-title">${MD.escapeHtml(channel.bannerTitle)}</div>` : ''}
              ${channel.bannerSubtitle ? `<div class="csb-sub">${MD.escapeHtml(channel.bannerSubtitle)}</div>` : ''}
            </div>
          </div>
          <div style="display:flex; gap:8px; flex-wrap:wrap;">
            ${channel.bannerDocPath ? `<button type="button" class="btn-sm" data-open-doc="${MD.escapeHtml(channel.bannerDocPath)}">Abrir Doc</button>` : ''}
            <button type="button" class="btn-sm" id="bannerConfigBtn">⚙ Configurar</button>
          </div>
        </div>
      `;
    }

    // Destaque dinâmico das séries configuradas em spotlightSeries
    let seriesSpotlightHtml = '';
    const spotlightList = Array.isArray(channel.spotlightSeries) ? channel.spotlightSeries : [];
    if (spotlightList.length > 0) {
      const spotItems = spotlightList.map((name) => {
        const stat = seriesList.find((s) => s.name === name) || {
          name,
          meta: SERIE_META[name] || { icon: '✦', color: '#e12d78' },
          docsCount: 0,
          videosCount: 0,
        };
        const isOnlyThis = state.selectedSeries.size === 1 && state.selectedSeries.has(name);
        const manifestDoc = docs.find((d) => d.meta.serie === name && d.filename.toLowerCase() === '_serie.md');
        const folderPath = SERIE_META[name]?.folder || (manifestDoc ? manifestDoc.folder : '');
        const openPath = manifestDoc?.path || (folderPath ? `${folderPath}/_serie.md` : '');
        return `
          <div class="serie-chip-card${isOnlyThis ? ' is-selected' : ''}" data-spot-filter="${MD.escapeHtml(name)}" style="cursor:pointer;">
            <span class="sel-icon" style="background: ${stat.meta.color}22; border: 1px solid ${stat.meta.color}66; color:${stat.meta.color}">${stat.meta.icon}</span>
            <div style="min-width:0; flex:1;">
              <div class="sel-name">${MD.escapeHtml(name)}</div>
              <div class="sel-sub">${stat.docsCount} .md${folderPath ? ` • ${MD.escapeHtml(folderPath)}` : ` • ${stat.videosCount} vídeos`}</div>
            </div>
            ${openPath ? `<button type="button" class="kc-move-btn" data-spot-open="${MD.escapeHtml(openPath)}" title="Abrir manifesto da série">Abrir</button>` : ''}
          </div>
        `;
      }).join('');

      const hasSeriesReadme = docs.some((d) => d.path === '06-series/README.md');
      seriesSpotlightHtml = `
        <section class="series-spotlight">
          <div class="section-subhead" style="margin-bottom:10px;">
            <h2 class="panel-title">Séries em Destaque (${MD.escapeHtml(channel.name || chData.key)})</h2>
            <div style="display:flex; gap:8px;">
              ${hasSeriesReadme ? '<button type="button" class="btn-sm" data-open-doc="06-series/README.md">Mapa das Séries</button>' : ''}
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
    const bannerCfgBtn = document.getElementById('bannerConfigBtn');
    if (bannerCfgBtn) {
      bannerCfgBtn.onclick = () => {
        state.settingsChannelKey = chData.key;
        setView('settings');
      };
    }

    const newSerieEpBtn = document.getElementById('newSerieEpBtn');
    if (newSerieEpBtn) {
      newSerieEpBtn.onclick = () => {
        const firstSpot = (Array.isArray(channel.spotlightSeries) && channel.spotlightSeries[0]) || getChannelSeriesList(chData)[0] || '';
        const spotFolder = SERIE_META[firstSpot]?.folder || '02-roteiros/rascunhos';
        openNewDocModal({
          type: spotFolder.startsWith('06-series/') ? 'episodio-serie' : 'roteiro-longo',
          serie: firstSpot,
          folder: spotFolder,
        });
      };
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
     HELPERS DE VERSIONAMENTO (GIT DE ROTEIROS & VERSÕES)
  ========================================================= */
  async function loadVersionHistory(docPath, { force = false, skipRender = false } = {}) {
    if (!state.serverMode || !docPath) return null;
    const chKey = state.activeChannel;
    const fetchKey = `${chKey}::${docPath}`;
    if (!force && state.versionLoading && state.versionFetchedKey === fetchKey) {
      return state.versionHistory;
    }
    state.versionLoading = true;
    state.versionFetchedKey = fetchKey;
    state.versionError = null;
    try {
      const res = await fetch(
        `/api/versions?channel=${encodeURIComponent(chKey)}&path=${encodeURIComponent(docPath)}`,
        { cache: 'no-store' }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Erro ao carregar histórico do roteiro');
      if (state.activeChannel !== chKey || getActiveDoc()?.path !== docPath) return json;
      state.versionHistory = json;
      const revs = json.revisions || [];
      if (!state.diffFromRef || !state.diffToRef || state.diffDocPath !== docPath) {
        state.diffDocPath = docPath;
        if (revs.length >= 2) {
          state.diffFromRef = `rev:${revs[1].id}`;
          state.diffToRef = `rev:${revs[0].id}`;
        } else if (revs.length === 1) {
          state.diffFromRef = `rev:${revs[0].id}`;
          state.diffToRef = 'ver:principal';
        } else {
          state.diffFromRef = 'ver:principal';
          state.diffToRef = 'ver:principal';
        }
      }
      if (state.docMode === 'history' && !state.diffResult && state.diffFromRef && state.diffToRef) {
        await loadDiffForDoc(docPath, state.diffFromRef, state.diffToRef, { silentRender: true });
      }
      return json;
    } catch (err) {
      if (state.activeChannel === chKey && getActiveDoc()?.path === docPath) {
        state.versionError = err.message;
      }
      return null;
    } finally {
      state.versionLoading = false;
      if (!skipRender && state.view === 'scripts' && state.activeChannel === chKey && getActiveDoc()?.path === docPath) {
        renderScriptsView(document.getElementById('viewContainer'));
      }
    }
  }

  async function switchDocVersion(docPath, versionName = 'principal') {
    const cleanVer = (versionName || 'principal').trim() || 'principal';
    stopPrompter();
    state.selectedRevPreview = null;
    state.revPreviewContent = null;
    state.hasUnsavedEdits = false;
    if (cleanVer === 'principal') {
      state.activeVersion = 'principal';
      state.dirtyBody = null;
      state.dirtyMeta = null;
      syncBrowserUrl({ replace: false });
      updateHeaderChrome();
      if (state.view === 'scripts') renderScriptsView(document.getElementById('viewContainer'));
      return;
    }
    if (!state.serverMode) {
      showToast('Versões alternativas requerem o servidor local (./bin/crom-studio --tray).');
      return;
    }
    try {
      const res = await fetch(
        `/api/versions/content?channel=${encodeURIComponent(state.activeChannel)}&path=${encodeURIComponent(docPath)}&ref=${encodeURIComponent(`ver:${cleanVer}`)}`,
        { cache: 'no-store' }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `Versão "${cleanVer}" não encontrada`);
      const parsed = MD.parseFrontmatter(json.content || '');
      state.activeVersion = cleanVer;
      state.dirtyMeta = Object.keys(parsed.meta).length ? parsed.meta : null;
      state.dirtyBody = parsed.body;
      state.hasUnsavedEdits = false;
      syncBrowserUrl({ replace: false });
      updateHeaderChrome();
      if (state.view === 'scripts') renderScriptsView(document.getElementById('viewContainer'));
      showToast(`Editando versão "${cleanVer}"`);
    } catch (err) {
      showToast(err.message);
    }
  }

  async function loadDiffForDoc(docPath, fromRef, toRef, { silentRender = false } = {}) {
    if (!state.serverMode || !docPath) return null;
    try {
      const res = await fetch(
        `/api/versions/diff?channel=${encodeURIComponent(state.activeChannel)}&path=${encodeURIComponent(docPath)}&from=${encodeURIComponent(fromRef)}&to=${encodeURIComponent(toRef)}`,
        { cache: 'no-store' }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Erro ao calcular diff');
      state.diffDocPath = docPath;
      state.diffFromRef = fromRef;
      state.diffToRef = toRef;
      state.diffResult = json;
      state.selectedRevPreview = null;
      state.revPreviewContent = null;
      if (!silentRender && state.view === 'scripts') {
        renderScriptsView(document.getElementById('viewContainer'));
      }
      return json;
    } catch (err) {
      showToast(err.message);
      return null;
    }
  }

  async function loadRevisionPreview(docPath, revId) {
    if (!state.serverMode || !docPath || !revId) return;
    try {
      const ref = revId === 'disk' ? 'disk' : `rev:${revId}`;
      const res = await fetch(
        `/api/versions/content?channel=${encodeURIComponent(state.activeChannel)}&path=${encodeURIComponent(docPath)}&ref=${encodeURIComponent(ref)}`,
        { cache: 'no-store' }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Erro ao ler snapshot');
      state.selectedRevPreview = revId;
      state.revPreviewContent = json.content || '';
      if (state.view === 'scripts') renderScriptsView(document.getElementById('viewContainer'));
    } catch (err) {
      showToast(err.message);
    }
  }

  async function restoreDocRevision(docPath, revId, targetVersion = 'principal') {
    if (!state.serverMode || !docPath || !revId || revId === 'disk') return;
    const labelTarget = targetVersion === 'principal' ? 'arquivo principal' : `versão "${targetVersion}"`;
    if (!confirm(`Restaurar o snapshot ${revId} para ${labelTarget}? (O histórico atual não será perdido; uma nova revisão de restauração será gravada.)`)) {
      return;
    }
    try {
      const res = await fetch('/api/versions/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel: state.activeChannel,
          path: docPath,
          revId,
          targetVersion,
          author: 'MrJ',
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Erro ao restaurar revisão');
      state.data = normalizePayload(json.state);
      state.versionHistory = json.history;
      state.activeVersion = json.version || targetVersion;
      state.hasUnsavedEdits = false;
      if (state.activeVersion === 'principal') {
        state.dirtyBody = null;
        state.dirtyMeta = null;
      } else {
        const parsed = MD.parseFrontmatter(json.content || '');
        state.dirtyMeta = Object.keys(parsed.meta).length ? parsed.meta : null;
        state.dirtyBody = parsed.body;
      }
      state.diffResult = null;
      state.selectedRevPreview = null;
      state.revPreviewContent = null;
      syncBrowserUrl({ replace: true });
      updateHeaderChrome();
      renderCurrentView();
      showToast(`Snapshot ${revId} restaurado como ${json.revision?.id || 'nova revisão'}!`);
    } catch (err) {
      showToast(err.message);
    }
  }

  async function promoteDocVersion(docPath, versionName) {
    if (!state.serverMode || !docPath || !versionName || versionName === 'principal') return;
    if (!confirm(`Promover a versão "${versionName}" para substituir o .md principal em disco? (Será gravado um commit de promoção no histórico.)`)) {
      return;
    }
    try {
      const res = await fetch('/api/versions/promote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel: state.activeChannel,
          path: docPath,
          versionName,
          author: 'MrJ',
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Erro ao promover versão');
      state.data = normalizePayload(json.state);
      state.versionHistory = json.history;
      state.activeVersion = 'principal';
      state.dirtyBody = null;
      state.dirtyMeta = null;
      state.hasUnsavedEdits = false;
      state.diffResult = null;
      syncBrowserUrl({ replace: false });
      updateHeaderChrome();
      renderCurrentView();
      showToast(`Versão "${versionName}" promovida para principal!`);
    } catch (err) {
      showToast(err.message);
    }
  }

  async function deleteDocVersion(docPath, versionName) {
    if (!state.serverMode || !docPath || !versionName || versionName === 'principal') return;
    if (!confirm(`Excluir a versão alternativa "${versionName}"? (Os commits já salvos continuam na linha do tempo.)`)) {
      return;
    }
    try {
      const res = await fetch(
        `/api/versions?channel=${encodeURIComponent(state.activeChannel)}&path=${encodeURIComponent(docPath)}&versionName=${encodeURIComponent(versionName)}`,
        { method: 'DELETE' }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Erro ao excluir versão');
      state.data = normalizePayload(json.state);
      state.versionHistory = json.history;
      if (state.activeVersion === versionName) {
        state.activeVersion = 'principal';
        state.dirtyBody = null;
        state.dirtyMeta = null;
        state.hasUnsavedEdits = false;
      }
      syncBrowserUrl({ replace: true });
      updateHeaderChrome();
      renderCurrentView();
      showToast(`Versão "${versionName}" removida.`);
    } catch (err) {
      showToast(err.message);
    }
  }

  function openNewVersionModal(doc) {
    if (!doc) return;
    if (!state.serverMode) {
      showToast('Criar versão alternativa requer o servidor local rodando.');
      return;
    }
    const nameEl = document.getElementById('newVerName');
    const descEl = document.getElementById('newVerDesc');
    const fromEl = document.getElementById('newVerFrom');
    const versions = state.versionHistory?.versions || [{ name: 'principal', description: 'Principal' }];
    const revs = (state.versionHistory?.revisions || []).filter((r) => r.id && r.id !== 'disk').slice(0, 12);

    const existingVariants = versions.filter((v) => !v.isPrimary).length;
    nameEl.value = `v${existingVariants + 2}-alternativa`;
    descEl.value = '';
    fromEl.innerHTML = [
      ...versions.map(
        (v) =>
          `<option value="ver:${MD.escapeHtml(v.name)}"${v.name === state.activeVersion ? ' selected' : ''}>Versão: ${MD.escapeHtml(v.name)}${v.headRev ? ` (${v.headRev})` : ''}</option>`
      ),
      ...revs.map(
        (r) => `<option value="rev:${MD.escapeHtml(r.id)}">Commit ${MD.escapeHtml(r.id)} — ${MD.escapeHtml(r.message)}</option>`
      ),
    ].join('');

    document.getElementById('newVersionModal').classList.remove('hidden');
    nameEl.focus();
    nameEl.select();
  }

  /* =========================================================
     VIEW MAPA DE ROTEIROS (CARTÕES + FLUXOGRAMA INTERATIVO)
  ========================================================= */
  const SERIE_FLOW_PALETTE = ['#ec4899', '#38bdf8', '#a855f7', '#f59e0b', '#22d3ee', '#34d399', '#fb7185', '#818cf8'];

  function getSeriesFlowColor(serieName, idx = 0) {
    return SERIE_META[serieName]?.color || SERIE_FLOW_PALETTE[idx % SERIE_FLOW_PALETTE.length];
  }

  function detectSequenceChains(docs) {
    const groups = new Map();
    for (const d of docs) {
      const slug = String(d.filename || d.path || '').replace(/\.md$/i, '').toLowerCase();
      let m = /^(.*?)[-_ ]?(?:parte|part|pt|ep|cap)[-_ ]?(\d+)(?:[-_ ].*)?$/.exec(slug);
      if (!m) {
        m = /^(.{3,}?\D)-(\d{1,2})$/.exec(slug);
      }
      if (!m) continue;
      const prefix = m[1].replace(/[-_ ]+$/, '');
      const num = Number(m[2]);
      if (!prefix || Number.isNaN(num)) continue;
      const key = `${d.meta.serie || 'geral'}::${prefix}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push({ doc: d, num });
    }
    const edges = [];
    for (const items of groups.values()) {
      if (items.length < 2) continue;
      items.sort((a, b) => a.num - b.num);
      for (let i = 0; i < items.length - 1; i++) {
        edges.push({ fromPath: items[i].doc.path, toPath: items[i + 1].doc.path });
      }
    }
    return edges;
  }

  function renderClusterShapeSvg(cx, cy, r, shapeIdx, color) {
    const s = shapeIdx % 6;
    const fill = `${color}26`;
    const glow = `${color}45`;
    if (s === 0) {
      // Octágono
      const pts = [];
      for (let i = 0; i < 8; i++) {
        const a = (Math.PI / 8) + (i * Math.PI) / 4;
        pts.push(`${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`);
      }
      return `<polygon points="${pts.join(' ')}" fill="${fill}" stroke="${color}" stroke-width="2.2" /><polygon points="${pts.join(' ')}" fill="none" stroke="${glow}" stroke-width="6" opacity="0.25" />`;
    }
    if (s === 1) {
      // Losango
      const d = r * 1.15;
      const pts = `${cx},${cy - d} ${cx + d},${cy} ${cx},${cy + d} ${cx - d},${cy}`;
      return `<polygon points="${pts}" fill="${fill}" stroke="${color}" stroke-width="2.2" />`;
    }
    if (s === 2) {
      // Círculo
      return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" stroke="${color}" stroke-width="2.2" /><circle cx="${cx}" cy="${cy}" r="${r + 6}" fill="none" stroke="${glow}" stroke-width="1.2" stroke-dasharray="4 4" />`;
    }
    if (s === 3) {
      // Pílula arredondada
      const w = r * 2.25;
      const h = r * 1.45;
      return `<rect x="${cx - w / 2}" y="${cy - h / 2}" width="${w}" height="${h}" rx="${h / 2}" fill="${fill}" stroke="${color}" stroke-width="2.2" />`;
    }
    if (s === 4) {
      // Squircle
      const w = r * 1.9;
      return `<rect x="${cx - w / 2}" y="${cy - w / 2}" width="${w}" height="${w}" rx="18" fill="${fill}" stroke="${color}" stroke-width="2.2" />`;
    }
    // Hexágono
    const pts = [];
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3 - Math.PI / 6;
      pts.push(`${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`);
    }
    return `<polygon points="${pts.join(' ')}" fill="${fill}" stroke="${color}" stroke-width="2.2" />`;
  }

  function computeFlowLayout(docs, chData, layoutKind) {
    const seqEdges = detectSequenceChains(docs);
    const seqSet = new Set(seqEdges.map((e) => `${e.fromPath}=>${e.toPath}`));
    const groupsMap = new Map();
    for (const d of docs) {
      const key = d.meta.serie || 'Sem Série';
      if (!groupsMap.has(key)) groupsMap.set(key, []);
      groupsMap.get(key).push(d);
    }
    const groups = Array.from(groupsMap.entries()).sort((a, b) => b[1].length - a[1].length);

    if (layoutKind === 'blocks') {
      const vpW = document.getElementById('mapFlowViewport')?.clientWidth || global.innerWidth || 1200;
      const cols = vpW < 920 ? 1 : (groups.length <= 1 ? 1 : 2);
      const maxPerRow = vpW < 760 ? 2 : 3;
      const secPadX = 24;
      const secPadTop = 48;
      const secPadBot = 24;
      const cardW = 232;
      const cardH = 100;
      const gapX = 36;
      const gapY = 28;
      const secGapX = 46;
      const secGapY = 44;

      const sections = [];
      const nodes = [];
      const edges = [];
      const nodeByPath = new Map();

      const builtSections = groups.map(([serieName, items], gIdx) => {
        const color = getSeriesFlowColor(serieName, gIdx);
        const colsInSec = Math.min(maxPerRow, Math.max(1, items.length));
        const rowsInSec = Math.max(1, Math.ceil(items.length / maxPerRow));
        const secW = secPadX * 2 + colsInSec * cardW + Math.max(0, colsInSec - 1) * gapX;
        const secH = secPadTop + secPadBot + rowsInSec * cardH + Math.max(0, rowsInSec - 1) * gapY;
        return { serieName, items, gIdx, color, secW, secH, colsInSec };
      });

      const rowHeights = [];
      const colWidths = new Array(cols).fill(0);
      builtSections.forEach((sec, idx) => {
        const c = idx % cols;
        const r = Math.floor(idx / cols);
        colWidths[c] = Math.max(colWidths[c], sec.secW);
        rowHeights[r] = Math.max(rowHeights[r] || 0, sec.secH);
      });

      const margin = 48;
      const colXs = [];
      let curX = margin;
      for (let c = 0; c < cols; c++) {
        colXs.push(curX);
        curX += colWidths[c] + secGapX;
      }
      const rowYs = [];
      let curY = margin;
      for (let r = 0; r < rowHeights.length; r++) {
        rowYs.push(curY);
        curY += rowHeights[r] + secGapY;
      }

      builtSections.forEach((sec, idx) => {
        const c = idx % cols;
        const r = Math.floor(idx / cols);
        const sx = colXs[c];
        const sy = rowYs[r];
        const secNum = idx + 1;

        sections.push({
          id: `sec-${secNum}`,
          x: sx,
          y: sy,
          w: sec.secW,
          h: sec.secH,
          color: sec.color,
          label: `${secNum}.0 ${sec.serieName}`,
          count: sec.items.length,
        });

        sec.items.forEach((doc, itemIdx) => {
          const ic = itemIdx % maxPerRow;
          const ir = Math.floor(itemIdx / maxPerRow);
          const nx = sx + secPadX + ic * (cardW + gapX);
          const ny = sy + secPadTop + ir * (cardH + gapY);
          const node = {
            doc,
            x: nx,
            y: ny,
            w: cardW,
            h: cardH,
            badge: `${secNum}.${itemIdx + 1}`,
            badgeColor: sec.color,
          };
          nodes.push(node);
          nodeByPath.set(doc.path, node);

          if (ic > 0) {
            const prevNode = nodes[nodes.length - 2];
            if (prevNode && !seqSet.has(`${prevNode.doc.path}=>${doc.path}`)) {
              edges.push({
                kind: 'elbow',
                fromX: prevNode.x + prevNode.w,
                fromY: prevNode.y + prevNode.h / 2,
                toX: node.x,
                toY: node.y + node.h / 2,
                color: `${sec.color}99`,
                dashed: true,
              });
            }
          }
        });
      });

      for (const se of seqEdges) {
        const a = nodeByPath.get(se.fromPath);
        const b = nodeByPath.get(se.toPath);
        if (a && b) {
          edges.push({
            kind: 'sequence',
            fromX: a.x + a.w,
            fromY: a.y + a.h / 2,
            toX: b.x,
            toY: b.y + b.h / 2,
            color: '#f59e0b',
            dashed: true,
          });
        }
      }

      const canvasW = Math.max(760, curX - secGapX + margin);
      const canvasH = Math.max(520, curY - secGapY + margin);
      return { layout: 'blocks', width: canvasW, height: canvasH, center: null, rings: [], hubs: [], sections, stageHeaders: [], nodes, edges };
    }

    if (layoutKind === 'pipeline') {
      const stages = [
        { key: 'ideia', label: 'Ideia' },
        { key: 'pesquisa', label: 'Pesquisa' },
        { key: 'roteiro', label: 'Roteiro' },
        { key: 'gravando', label: 'Gravando' },
        { key: 'edicao', label: 'Edição' },
        { key: 'publicado', label: 'Publicado' },
      ];
      const knownKeys = new Set(stages.map((s) => s.key));
      const extraDocs = docs.filter((d) => !knownKeys.has(d.meta.status));
      if (extraDocs.length) stages.push({ key: 'outros', label: 'Docs & Outros' });

      const colW = 248;
      const colGap = 46;
      const cardW = 228;
      const cardH = 98;
      const cardGapY = 20;
      const marginX = 48;
      const headY = 48;
      const headH = 44;
      const startCardsY = headY + headH + 34;

      const stageHeaders = [];
      const nodes = [];
      const edges = [];
      const nodeByPath = new Map();
      let maxCards = 1;

      stages.forEach((st, colIdx) => {
        const colDocs = st.key === 'outros'
          ? extraDocs
          : docs.filter((d) => (d.meta.status || 'ideia') === st.key);
        maxCards = Math.max(maxCards, colDocs.length);
        const vis = STATUS_VISUAL[st.key] || STATUS_VISUAL.referencia;
        const cx = marginX + colIdx * (colW + colGap);

        stageHeaders.push({
          key: st.key,
          label: st.label,
          count: colDocs.length,
          x: cx,
          y: headY,
          w: colW,
          h: headH,
          color: vis.color,
          bg: vis.bg,
          border: vis.border,
        });

        if (colIdx > 0) {
          const prevHead = stageHeaders[colIdx - 1];
          edges.push({
            kind: 'stage',
            fromX: prevHead.x + prevHead.w,
            fromY: prevHead.y + prevHead.h / 2,
            toX: cx,
            toY: headY + headH / 2,
            color: 'rgba(255,255,255,0.42)',
            dashed: false,
          });
        }

        const spineX = cx + 10;
        colDocs.forEach((doc, rowIdx) => {
          const nx = cx + 20;
          const ny = startCardsY + rowIdx * (cardH + cardGapY);
          const sIdx = groups.findIndex(([name]) => name === doc.meta.serie);
          const badgeColor = getSeriesFlowColor(doc.meta.serie, Math.max(0, sIdx));
          const node = {
            doc,
            x: nx,
            y: ny,
            w: cardW,
            h: cardH,
            badge: doc.meta.serie || 'Geral',
            badgeColor,
          };
          nodes.push(node);
          nodeByPath.set(doc.path, node);

          edges.push({
            kind: 'branch',
            fromX: spineX,
            fromY: headY + headH,
            toX: nx,
            toY: ny + cardH / 2,
            color: `${vis.color}88`,
            dashed: false,
          });
        });
      });

      for (const se of seqEdges) {
        const a = nodeByPath.get(se.fromPath);
        const b = nodeByPath.get(se.toPath);
        if (a && b) {
          edges.push({
            kind: 'sequence',
            fromX: a.x + a.w,
            fromY: a.y + a.h / 2,
            toX: b.x,
            toY: b.y + b.h / 2,
            color: '#f59e0b',
            dashed: true,
          });
        }
      }

      const canvasW = marginX * 2 + stages.length * colW + Math.max(0, stages.length - 1) * colGap;
      const canvasH = Math.max(540, startCardsY + maxCards * (cardH + cardGapY) + 60);
      return { layout: 'pipeline', width: canvasW, height: canvasH, center: null, rings: [], hubs: [], sections: [], stageHeaders, nodes, edges };
    }

    // Default: 'clusters' — Constelação (Clusters)
    const cardW = 228;
    const cardH = 98;
    const clusters = groups.map(([serieName, items], idx) => {
      const n = items.length;
      const childRx = Math.max(210, (n * 245) / (2 * Math.PI));
      const childRy = Math.max(170, (n * 175) / (2 * Math.PI));
      const outerR = Math.max(childRx, childRy) + 140;
      return {
        serieName,
        items,
        idx,
        color: getSeriesFlowColor(serieName, idx),
        shapeIdx: idx,
        childRx,
        childRy,
        outerR,
      };
    });

    const totalArc = clusters.reduce((acc, c) => acc + c.outerR * 2 + 88, 0);
    const maxClusterR = clusters.reduce((m, c) => Math.max(m, c.outerR), 280);
    const hubOrbitR = clusters.length <= 1
      ? 300
      : Math.max(460, maxClusterR + 210, totalArc / (2 * Math.PI));

    const worldHalf = Math.ceil(hubOrbitR + maxClusterR + 220);
    const cx = worldHalf;
    const cy = worldHalf;
    const canvasSize = worldHalf * 2;

    const hubs = [];
    const nodes = [];
    const edges = [];
    const nodeByPath = new Map();
    const hubLinks = [];
    const hubR = 56;
    const minHubDist = hubR + 128;
    const pad = 22;

    let angleCursor = -Math.PI / 2;
    clusters.forEach((cl) => {
      const wedge = clusters.length === 1
        ? 0
        : ((cl.outerR * 2 + 88) / (totalArc || 1)) * Math.PI * 2;
      const theta = clusters.length === 1 ? -Math.PI / 4 : angleCursor + wedge / 2;
      angleCursor += wedge;

      const hx = cx + hubOrbitR * Math.cos(theta);
      const hy = cy + hubOrbitR * Math.sin(theta);
      hubs.push({
        serieName: cl.serieName,
        count: cl.items.length,
        x: hx,
        y: hy,
        r: hubR,
        shapeIdx: cl.shapeIdx,
        color: cl.color,
      });

      edges.push({
        kind: 'curve',
        fromX: cx,
        fromY: cy,
        toX: hx,
        toY: hy,
        color: cl.color,
        width: 2.2,
      });

      const localNodes = cl.items.map((doc, i) => {
        const a = (i / Math.max(1, cl.items.length)) * Math.PI * 2 - Math.PI / 2;
        const nx = hx + cl.childRx * Math.cos(a) - cardW / 2;
        const ny = hy + cl.childRy * Math.sin(a) - cardH / 2;
        return {
          doc,
          x: nx,
          y: ny,
          w: cardW,
          h: cardH,
          badge: STATUS_VISUAL[doc.meta.status]?.label || doc.meta.status || 'Ideia',
          badgeColor: STATUS_VISUAL[doc.meta.status]?.color || cl.color,
        };
      });

      // Passe 1: separação determinística intra-cluster (cards e hub da série)
      for (let iter = 0; iter < 36; iter++) {
        for (let i = 0; i < localNodes.length; i++) {
          const a = localNodes[i];
          const acx = a.x + a.w / 2;
          const acy = a.y + a.h / 2;
          const dxH = acx - hx;
          const dyH = acy - hy;
          const distH = Math.hypot(dxH, dyH) || 1;
          if (distH < minHubDist) {
            const push = minHubDist - distH;
            a.x += (dxH / distH) * push;
            a.y += (dyH / distH) * push;
          }
          for (let j = i + 1; j < localNodes.length; j++) {
            const b = localNodes[j];
            const ox = Math.min(a.x + a.w + pad, b.x + b.w + pad) - Math.max(a.x, b.x);
            const oy = Math.min(a.y + a.h + pad, b.y + b.h + pad) - Math.max(a.y, b.y);
            if (ox > 0 && oy > 0) {
              if (ox < oy) {
                const dir = a.x <= b.x ? -1 : 1;
                a.x += dir * (ox / 2);
                b.x -= dir * (ox / 2);
              } else {
                const dir = a.y <= b.y ? -1 : 1;
                a.y += dir * (oy / 2);
                b.y -= dir * (oy / 2);
              }
            }
          }
        }
      }

      for (const node of localNodes) {
        nodes.push(node);
        nodeByPath.set(node.doc.path, node);
        hubLinks.push({ node, hx, hy, color: `${cl.color}88` });
      }
    });

    // Passe 2: separação global AABB entre todos os clusters, hubs e núcleo central
    const minCenterDist = 96 + Math.hypot(cardW, cardH) / 2;
    for (let iter = 0; iter < 28; iter++) {
      let movedAny = false;
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i];
        const acx = a.x + a.w / 2;
        const acy = a.y + a.h / 2;

        const dxC = acx - cx;
        const dyC = acy - cy;
        const distC = Math.hypot(dxC, dyC) || 1;
        if (distC < minCenterDist) {
          const pushC = minCenterDist - distC;
          a.x += (dxC / distC) * pushC;
          a.y += (dyC / distC) * pushC;
          movedAny = true;
        }

        for (const h of hubs) {
          const dxH = (a.x + a.w / 2) - h.x;
          const dyH = (a.y + a.h / 2) - h.y;
          const distH = Math.hypot(dxH, dyH) || 1;
          if (distH < minHubDist) {
            const pushH = minHubDist - distH;
            a.x += (dxH / distH) * pushH;
            a.y += (dyH / distH) * pushH;
            movedAny = true;
          }
        }

        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j];
          const ox = Math.min(a.x + a.w + pad, b.x + b.w + pad) - Math.max(a.x, b.x);
          const oy = Math.min(a.y + a.h + pad, b.y + b.h + pad) - Math.max(a.y, b.y);
          if (ox > 0 && oy > 0) {
            movedAny = true;
            if (ox < oy) {
              const dir = a.x <= b.x ? -1 : 1;
              a.x += dir * (ox / 2);
              b.x -= dir * (ox / 2);
            } else {
              const dir = a.y <= b.y ? -1 : 1;
              a.y += dir * (oy / 2);
              b.y -= dir * (oy / 2);
            }
          }
        }
      }
      if (!movedAny) break;
    }

    for (const hl of hubLinks) {
      edges.push({
        kind: 'curve',
        fromX: hl.hx,
        fromY: hl.hy,
        toX: hl.node.x + hl.node.w / 2,
        toY: hl.node.y + hl.node.h / 2,
        color: hl.color,
        width: 1.4,
      });
    }

    for (const se of seqEdges) {
      const a = nodeByPath.get(se.fromPath);
      const b = nodeByPath.get(se.toPath);
      if (a && b) {
        edges.push({
          kind: 'sequence',
          fromX: a.x + a.w / 2,
          fromY: a.y + a.h / 2,
          toX: b.x + b.w / 2,
          toY: b.y + b.h / 2,
          color: '#f59e0b',
          dashed: true,
        });
      }
    }

    const ch = chData.channel || {};
    return {
      layout: 'clusters',
      width: canvasSize,
      height: canvasSize,
      center: { x: cx, y: cy, name: ch.name || chData.key, sub: `${docs.length} roteiros` },
      rings: [Math.round(hubOrbitR * 0.52), Math.round(hubOrbitR), Math.round(hubOrbitR + maxClusterR * 0.68)],
      hubs,
      sections: [],
      stageHeaders: [],
      nodes,
      edges,
    };
  }

  function renderFlowchartSvgAndNodes(model) {
    const svgParts = [];
    svgParts.push(`
      <defs>
        <marker id="flowArrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
          <path d="M0,1 L7,4 L0,7 Z" fill="rgba(255,255,255,0.5)" />
        </marker>
        <marker id="flowArrowSeq" markerWidth="9" markerHeight="9" refX="7" refY="4" orient="auto">
          <path d="M0,1 L7,4 L0,7 Z" fill="#f59e0b" />
        </marker>
      </defs>
    `);

    if (model.center && model.rings.length) {
      for (const r of model.rings) {
        svgParts.push(
          `<circle cx="${model.center.x}" cy="${model.center.y}" r="${r}" fill="none" stroke="rgba(255,255,255,0.05)" stroke-width="1" stroke-dasharray="6 8" />`
        );
      }
    }

    for (const sec of model.sections) {
      svgParts.push(
        `<rect x="${sec.x}" y="${sec.y}" width="${sec.w}" height="${sec.h}" rx="16" fill="rgba(16,18,29,0.55)" stroke="${sec.color}66" stroke-width="1.5" stroke-dasharray="7 5" />`
      );
    }

    for (const edge of model.edges) {
      if (edge.kind === 'curve') {
        const dx = (edge.toX - edge.fromX) * 0.45;
        const d = `M ${edge.fromX.toFixed(1)} ${edge.fromY.toFixed(1)} C ${(edge.fromX + dx).toFixed(1)} ${edge.fromY.toFixed(1)}, ${(edge.toX - dx).toFixed(1)} ${edge.toY.toFixed(1)}, ${edge.toX.toFixed(1)} ${edge.toY.toFixed(1)}`;
        svgParts.push(`<path d="${d}" fill="none" stroke="${edge.color}" stroke-width="${edge.width || 1.5}" />`);
      } else if (edge.kind === 'branch') {
        const d = `M ${edge.fromX.toFixed(1)} ${edge.fromY.toFixed(1)} L ${edge.fromX.toFixed(1)} ${edge.toY.toFixed(1)} L ${edge.toX.toFixed(1)} ${edge.toY.toFixed(1)}`;
        svgParts.push(`<path d="${d}" fill="none" stroke="${edge.color}" stroke-width="1.5" />`);
      } else if (edge.kind === 'stage') {
        svgParts.push(
          `<line x1="${edge.fromX.toFixed(1)}" y1="${edge.fromY.toFixed(1)}" x2="${(edge.toX - 4).toFixed(1)}" y2="${edge.toY.toFixed(1)}" stroke="${edge.color}" stroke-width="1.8" marker-end="url(#flowArrow)" />`
        );
      } else {
        const midX = (edge.fromX + edge.toX) / 2;
        const d = `M ${edge.fromX.toFixed(1)} ${edge.fromY.toFixed(1)} L ${midX.toFixed(1)} ${edge.fromY.toFixed(1)} L ${midX.toFixed(1)} ${edge.toY.toFixed(1)} L ${edge.toX.toFixed(1)} ${edge.toY.toFixed(1)}`;
        svgParts.push(
          `<path d="${d}" fill="none" stroke="${edge.color}" stroke-width="2" stroke-dasharray="6 4" marker-end="url(#flowArrowSeq)" />`
        );
      }
    }

    for (const hub of model.hubs) {
      svgParts.push(renderClusterShapeSvg(hub.x, hub.y, hub.r, hub.shapeIdx, hub.color));
    }

    const centerHtml = model.center
      ? `
        <div class="map-flow-center" style="left:${model.center.x}px; top:${model.center.y}px;">
          <div class="map-flow-center-name">${MD.escapeHtml(model.center.name)}</div>
          <div class="map-flow-center-sub">${MD.escapeHtml(model.center.sub)}</div>
        </div>
      `
      : '';

    const hubsHtml = model.hubs
      .map(
        (h) => `
          <div class="map-flow-hub" style="left:${h.x}px; top:${h.y}px; width:${h.r * 2}px; height:${h.r * 2}px;">
            <span class="map-flow-hub-title">${MD.escapeHtml(h.serieName)}</span>
            <span class="map-flow-hub-count">${h.count} .md</span>
          </div>
        `
      )
      .join('');

    const sectionsHtml = model.sections
      .map(
        (s) => `
          <div class="map-flow-section-label" style="left:${s.x + 14}px; top:${s.y + 10}px; background:${s.color}28; border-color:${s.color}66;">
            <span>${MD.escapeHtml(s.label)}</span>
            <span style="opacity:0.75; font-family:var(--font-mono); font-size:10px;">(${s.count})</span>
          </div>
        `
      )
      .join('');

    const stagesHtml = model.stageHeaders
      .map(
        (sh) => `
          <div class="map-flow-stage-head" style="left:${sh.x}px; top:${sh.y}px; width:${sh.w}px; height:${sh.h}px; --st-color:${sh.color}; --st-border:${sh.border};">
            <span>${MD.escapeHtml(sh.label)}</span>
            <span class="kanban-count">${sh.count}</span>
          </div>
        `
      )
      .join('');

    const nodesHtml = model.nodes
      .map((n) => {
        const d = n.doc;
        const st = d.meta.status || 'ideia';
        const vis = STATUS_VISUAL[st] || STATUS_VISUAL.ideia;
        const fullTitle = d.meta.titulo || d.name || d.path;
        return `
          <button
            type="button"
            class="map-flow-node"
            data-flow-doc="${MD.escapeHtml(d.path)}"
            title="${MD.escapeHtml(fullTitle)}"
            style="left:${Math.round(n.x)}px; top:${Math.round(n.y)}px; width:${n.w}px; height:${n.h}px; --st-color:${vis.color};"
          >
            <div class="mfn-top">
              <span class="mfn-badge" style="background:${n.badgeColor};">${MD.escapeHtml(n.badge)}</span>
              <span class="mfn-status-wrap" style="color:${vis.color};">
                <span class="mfn-status-dot" style="background:${vis.color};" title="${MD.escapeHtml(vis.label)}"></span>
                ${n.badge !== vis.label ? `<span>${MD.escapeHtml(vis.label)}</span>` : ''}
              </span>
            </div>
            <div class="mfn-title">${MD.escapeHtml(fullTitle)}</div>
            <div class="mfn-meta">
              <span>${MD.escapeHtml(d.meta.serie || d.topFolder || vis.label)}</span>
              <span>${formatNumber(d.stats?.words || 0)} pal.</span>
            </div>
          </button>
        `;
      })
      .join('');

    return `
      <div class="map-flow-canvas" id="mapFlowCanvas" style="width:${model.width}px; height:${model.height}px; transform:translate(${state.mapFlowPanX}px, ${state.mapFlowPanY}px) scale(${state.mapFlowZoom});">
        <svg class="map-flow-svg" width="${model.width}" height="${model.height}" viewBox="0 0 ${model.width} ${model.height}">
          ${svgParts.join('')}
        </svg>
        ${sectionsHtml}
        ${stagesHtml}
        ${centerHtml}
        ${hubsHtml}
        ${nodesHtml}
      </div>
    `;
  }

  function convertFlowModelToExcalidrawElements(model) {
    const elements = [];
    const now = Date.now();
    let seedBase = 1000;
    const nextSeed = () => (seedBase += 79);
    const uid = (prefix) => `${prefix}-${Math.random().toString(36).slice(2, 9)}`;

    const addRectWithText = ({ id, x, y, w, h, strokeColor, bgColor, strokeStyle = 'solid', roundness = { type: 3 }, text, fontSize = 14, textColor = '#1e1e1e' }) => {
      const rectId = id || uid('rect');
      const textId = uid('txt');
      elements.push({
        id: rectId,
        type: 'rectangle',
        x: Math.round(x),
        y: Math.round(y),
        width: Math.round(w),
        height: Math.round(h),
        angle: 0,
        strokeColor,
        backgroundColor: bgColor,
        fillStyle: 'solid',
        strokeWidth: 2,
        strokeStyle,
        roughness: 0,
        opacity: 100,
        groupIds: [],
        frameId: null,
        roundness,
        seed: nextSeed(),
        version: 1,
        versionNonce: nextSeed(),
        isDeleted: false,
        boundElements: text ? [{ id: textId, type: 'text' }] : [],
        updated: now,
        link: null,
        locked: false,
      });
      if (text) {
        elements.push({
          id: textId,
          type: 'text',
          x: Math.round(x + 10),
          y: Math.round(y + h / 2 - fontSize * 0.7),
          width: Math.max(40, Math.round(w - 20)),
          height: Math.round(fontSize * 1.5),
          angle: 0,
          strokeColor: textColor,
          backgroundColor: 'transparent',
          fillStyle: 'solid',
          strokeWidth: 1,
          strokeStyle: 'solid',
          roughness: 0,
          opacity: 100,
          groupIds: [],
          frameId: null,
          roundness: null,
          seed: nextSeed(),
          version: 1,
          versionNonce: nextSeed(),
          isDeleted: false,
          boundElements: [],
          updated: now,
          link: null,
          locked: false,
          text,
          fontSize,
          fontFamily: 1,
          textAlign: 'center',
          verticalAlign: 'middle',
          containerId: rectId,
          originalText: text,
          autoResize: true,
          lineHeight: 1.25,
        });
      }
      return rectId;
    };

    for (const sec of model.sections) {
      addRectWithText({
        x: sec.x,
        y: sec.y,
        w: sec.w,
        h: sec.h,
        strokeColor: sec.color,
        bgColor: 'transparent',
        strokeStyle: 'dashed',
      });
      elements.push({
        id: uid('seclbl'),
        type: 'text',
        x: Math.round(sec.x + 14),
        y: Math.round(sec.y + 12),
        width: 240,
        height: 22,
        angle: 0,
        strokeColor: sec.color,
        backgroundColor: 'transparent',
        fillStyle: 'solid',
        strokeWidth: 1,
        strokeStyle: 'solid',
        roughness: 0,
        opacity: 100,
        groupIds: [],
        frameId: null,
        roundness: null,
        seed: nextSeed(),
        version: 1,
        versionNonce: nextSeed(),
        isDeleted: false,
        boundElements: [],
        updated: now,
        link: null,
        locked: false,
        text: sec.label,
        fontSize: 16,
        fontFamily: 1,
        textAlign: 'left',
        verticalAlign: 'top',
        containerId: null,
        originalText: sec.label,
        autoResize: true,
        lineHeight: 1.25,
      });
    }

    for (const sh of model.stageHeaders) {
      addRectWithText({
        x: sh.x,
        y: sh.y,
        w: sh.w,
        h: sh.h,
        strokeColor: sh.color,
        bgColor: '#eef2fa',
        text: `${sh.label} (${sh.count})`,
        fontSize: 15,
      });
    }

    if (model.center) {
      addRectWithText({
        x: model.center.x - 95,
        y: model.center.y - 34,
        w: 190,
        h: 68,
        strokeColor: '#e12d78',
        bgColor: '#f8edf5',
        text: `${model.center.name}\n${model.center.sub}`,
        fontSize: 14,
      });
    }

    for (const hub of model.hubs) {
      addRectWithText({
        x: hub.x - 64,
        y: hub.y - 32,
        w: 128,
        h: 64,
        strokeColor: hub.color,
        bgColor: '#eef2fa',
        text: `${hub.serieName}\n(${hub.count})`,
        fontSize: 13,
      });
    }

    for (const n of model.nodes) {
      const st = n.doc.meta.status || 'ideia';
      const vis = STATUS_VISUAL[st] || STATUS_VISUAL.ideia;
      const shortTitle = n.doc.meta.titulo.length > 42
        ? `${n.doc.meta.titulo.slice(0, 39)}...`
        : n.doc.meta.titulo;
      addRectWithText({
        x: n.x,
        y: n.y,
        w: n.w,
        h: n.h,
        strokeColor: vis.color,
        bgColor: '#f0f4fc',
        text: `${shortTitle}\n[${vis.label}]`,
        fontSize: 13,
      });
    }

    for (const edge of model.edges) {
      const dx = edge.toX - edge.fromX;
      const dy = edge.toY - edge.fromY;
      elements.push({
        id: uid('arr'),
        type: 'arrow',
        x: Math.round(edge.fromX),
        y: Math.round(edge.fromY),
        width: Math.max(1, Math.abs(Math.round(dx))),
        height: Math.max(1, Math.abs(Math.round(dy))),
        angle: 0,
        strokeColor: edge.kind === 'sequence' ? '#f59e0b' : '#64748b',
        backgroundColor: 'transparent',
        fillStyle: 'solid',
        strokeWidth: edge.kind === 'sequence' ? 2 : 1.5,
        strokeStyle: edge.dashed ? 'dashed' : 'solid',
        roughness: 0,
        opacity: 100,
        groupIds: [],
        frameId: null,
        roundness: { type: 2 },
        seed: nextSeed(),
        version: 1,
        versionNonce: nextSeed(),
        isDeleted: false,
        boundElements: [],
        updated: now,
        link: null,
        locked: false,
        points: [[0, 0], [Math.round(dx), Math.round(dy)]],
        lastCommittedPoint: null,
        startBinding: null,
        endBinding: null,
        startArrowhead: null,
        endArrowhead: 'arrow',
      });
    }

    return elements;
  }

  async function exportFlowchartToBoard(model, chData) {
    if (!state.serverMode) {
      showToast('Exportar fluxograma para o Quadro requer o servidor local rodando.');
      return;
    }
    const layoutLabels = { clusters: 'Constelação', blocks: 'User Flow', pipeline: 'Pipeline' };
    const chName = chData.channel?.name || chData.key;
    const title = `Mapa ${chName} — ${layoutLabels[state.mapFlowLayout] || 'Fluxograma'}`;
    const elements = convertFlowModelToExcalidrawElements(model);
    try {
      const res = await fetch('/api/boards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel: chData.key,
          title,
          elements,
          appState: { viewBackgroundColor: '#ffffff', theme: 'dark', gridSize: 20 },
          files: {},
          preferredMode: 'nodes',
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Erro ao exportar fluxograma');
      state.boardsList = json.boards || [];
      if (json.state) state.data = normalizePayload(json.state);
      state.mapFlowFullscreen = false;
      setView('whiteboard', null, { boardId: json.board.id });
      showToast(`Fluxograma aberto em "${json.board.title}"!`);
    } catch (err) {
      showToast(err.message);
    }
  }

  let mapFlowResizeObserver = null;
  let mapFlowPointerCleanups = [];

  function cleanupMapFlowObservers() {
    if (mapFlowResizeObserver) {
      try {
        mapFlowResizeObserver.disconnect();
      } catch {
        // ignora
      }
      mapFlowResizeObserver = null;
    }
    while (mapFlowPointerCleanups.length) {
      const fn = mapFlowPointerCleanups.pop();
      try {
        fn();
      } catch {
        // ignora
      }
    }
  }

  function applyFlowViewportTransform(viewport, model) {
    const canvas = document.getElementById('mapFlowCanvas');
    if (canvas) {
      canvas.style.transform = `translate(${state.mapFlowPanX}px, ${state.mapFlowPanY}px) scale(${state.mapFlowZoom})`;
    }
    const resetBtn = document.getElementById('mapFlowZoomResetBtn');
    if (resetBtn) resetBtn.textContent = `${Math.round(state.mapFlowZoom * 100)}%`;
    if (viewport && model && !canvas) {
      viewport.dataset.modelReady = '1';
    }
  }

  function fitFlowchartToViewport(model) {
    const vp = document.getElementById('mapFlowViewport');
    if (!vp || !model) return;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    const expandBox = (x1, y1, x2, y2) => {
      if (Number.isFinite(x1)) minX = Math.min(minX, x1);
      if (Number.isFinite(y1)) minY = Math.min(minY, y1);
      if (Number.isFinite(x2)) maxX = Math.max(maxX, x2);
      if (Number.isFinite(y2)) maxY = Math.max(maxY, y2);
    };

    for (const n of model.nodes || []) expandBox(n.x, n.y, n.x + n.w, n.y + n.h);
    for (const h of model.hubs || []) expandBox(h.x - h.r, h.y - h.r, h.x + h.r, h.y + h.r);
    if (model.center) expandBox(model.center.x - 95, model.center.y - 45, model.center.x + 95, model.center.y + 45);
    for (const s of model.sections || []) expandBox(s.x, s.y, s.x + s.w, s.y + s.h);
    for (const sh of model.stageHeaders || []) expandBox(sh.x, sh.y, sh.x + sh.w, sh.y + sh.h);

    if (!Number.isFinite(minX) || !Number.isFinite(maxX)) {
      minX = 0;
      minY = 0;
      maxX = model.width || 900;
      maxY = model.height || 540;
    }

    const margin = 52;
    const boxW = Math.max(120, (maxX - minX) + margin * 2);
    const boxH = Math.max(120, (maxY - minY) + margin * 2);
    const vw = vp.clientWidth || 900;
    const vh = vp.clientHeight || 540;
    const fitZoom = Math.min(1.05, Math.max(0.14, Math.min(vw / boxW, vh / boxH)));
    state.mapFlowZoom = Number(fitZoom.toFixed(2));
    const boxCx = (minX + maxX) / 2;
    const boxCy = (minY + maxY) / 2;
    state.mapFlowPanX = Math.round(vw / 2 - boxCx * state.mapFlowZoom);
    state.mapFlowPanY = Math.round(vh / 2 - boxCy * state.mapFlowZoom);
    applyFlowViewportTransform(vp, model);
  }

  function renderMapView(container) {
    cleanupMapFlowObservers();
    const chData = getActiveChannelData();
    const docsAll = chData.docs || [];
    const docsPool = state.mapHideMeta
      ? docsAll.filter(
          (d) =>
            d.meta.status !== 'template' &&
            d.meta.status !== 'referencia' &&
            d.path !== 'AGENTS.md' &&
            d.path !== 'README.md'
        )
      : docsAll;

    const statusOrder = ['publicado', 'gravando', 'edicao', 'roteiro', 'pesquisa', 'ideia', 'referencia', 'template', 'arquivado'];
    const statusCounts = {};
    for (const st of statusOrder) statusCounts[st] = 0;
    for (const d of docsPool) {
      const st = d.meta.status || 'ideia';
      statusCounts[st] = (statusCounts[st] || 0) + 1;
    }

    const totalPool = docsPool.length || 1;
    const distSegmentsHtml = statusOrder
      .filter((st) => statusCounts[st] > 0)
      .map((st) => {
        const vis = STATUS_VISUAL[st] || STATUS_VISUAL.ideia;
        const pct = ((statusCounts[st] / totalPool) * 100).toFixed(2);
        return `<div class="map-dist-seg" style="width:${pct}%; background:${vis.color};" title="${vis.label}: ${statusCounts[st]} arquivo(s) (${Math.round((statusCounts[st] / totalPool) * 100)}%)"></div>`;
      })
      .join('');

    const legendHtml = `
      <button type="button" class="map-legend-pill${state.mapStatusFilter === 'all' ? ' is-active' : ''}" data-map-status="all" style="--st-color: var(--accent);">
        <span class="map-legend-dot"></span>
        <span>Todos (${docsPool.length})</span>
      </button>
      ${statusOrder
        .filter((st) => statusCounts[st] > 0)
        .map((st) => {
          const vis = STATUS_VISUAL[st] || STATUS_VISUAL.ideia;
          const active = state.mapStatusFilter === st;
          return `
            <button type="button" class="map-legend-pill${active ? ' is-active' : ''}" data-map-status="${st}" style="--st-color: ${vis.color};">
              <span class="map-legend-dot"></span>
              <span>${vis.label} (${statusCounts[st]})</span>
            </button>
          `;
        })
        .join('')}
    `;

    const filteredDocs = docsPool.filter((d) => {
      if (state.mapStatusFilter !== 'all' && d.meta.status !== state.mapStatusFilter) return false;
      if (state.mapSearch) {
        const q = state.mapSearch.toLowerCase();
        const hay = `${d.meta.titulo} ${d.meta.serie} ${d.path} ${d.meta.resumo} ${(d.meta.tags || []).join(' ')}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    const renderMapCard = (d) => {
      const st = d.meta.status || 'ideia';
      const vis = STATUS_VISUAL[st] || STATUS_VISUAL.ideia;
      const ver = d.versioning || {};
      const verLabel =
        ver.versionsCount > 1
          ? `${ver.versionsCount} vers. • ${ver.headRev || ''}`
          : ver.headRev
          ? `${ver.headRev}`
          : '';
      return `
        <button type="button" class="map-card" data-open-map-doc="${MD.escapeHtml(d.path)}" style="--st-color:${vis.color}; --st-bg:${vis.bg}; --st-border:${vis.border};">
          <div style="display:flex; align-items:center; justify-content:space-between; gap:6px; width:100%;">
            <span class="status-pill st-${MD.escapeHtml(st)}">${MD.escapeHtml(vis.label)}</span>
            ${verLabel ? `<span style="font-family:var(--font-mono); font-size:10px; color:var(--text-3);">${MD.escapeHtml(verLabel)}</span>` : ''}
          </div>
          <span class="map-card-title">${MD.escapeHtml(d.meta.titulo)}</span>
          <div class="map-card-foot">
            <span>${MD.escapeHtml(d.meta.serie || d.topFolder)}</span>
            <span>${formatNumber(d.stats.words)} pal.${d.meta.duracao_estimada ? ` • ${MD.escapeHtml(d.meta.duracao_estimada)}` : ''}</span>
          </div>
        </button>
      `;
    };

    let bodyHtml = '';
    let flowModel = null;

    if (!filteredDocs.length) {
      bodyHtml = `<div class="panel" style="padding:36px; text-align:center; color:var(--text-3);">Nenhum roteiro encontrado com esses filtros.</div>`;
    } else if (state.mapStyle === 'flowchart') {
      flowModel = computeFlowLayout(filteredDocs, chData, state.mapFlowLayout);
      bodyHtml = `
        <div class="map-flow-shell${state.mapFlowFullscreen ? ' is-flow-fullscreen' : ''}" id="mapFlowShell">
          <div class="map-flow-toolbar">
            <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
              <div class="mode-switch" id="mapFlowLayoutSwitch">
                <button type="button" class="${state.mapFlowLayout === 'clusters' ? 'active' : ''}" data-flow-layout="clusters">Constelação (Clusters)</button>
                <button type="button" class="${state.mapFlowLayout === 'blocks' ? 'active' : ''}" data-flow-layout="blocks">User Flow (Blocos)</button>
                <button type="button" class="${state.mapFlowLayout === 'pipeline' ? 'active' : ''}" data-flow-layout="pipeline">Pipeline (Etapas)</button>
              </div>
              <div class="zoom-group" title="Zoom do fluxograma">
                <button type="button" id="mapFlowZoomOutBtn">-</button>
                <button type="button" id="mapFlowZoomResetBtn">${Math.round(state.mapFlowZoom * 100)}%</button>
                <button type="button" id="mapFlowZoomInBtn">+</button>
                <button type="button" id="mapFlowFitBtn">Ajustar</button>
              </div>
            </div>
            <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
              <button type="button" class="btn-sm" id="mapFlowFullscreenBtn">${state.mapFlowFullscreen ? '✕ Sair Tela Cheia' : '⛶ Tela Cheia'}</button>
              <button type="button" class="btn-sm btn-accent" id="mapExportToBoardBtn">✎ Abrir no Quadro (Excalidraw)</button>
            </div>
          </div>
          <div class="map-flow-viewport" id="mapFlowViewport">
            ${renderFlowchartSvgAndNodes(flowModel)}
          </div>
          <div class="map-flow-tooltip hidden" id="mapFlowTooltip"></div>
        </div>
      `;
    } else if (state.mapGroupBy === 'mosaic') {
      const sorted = [...filteredDocs].sort((a, b) => {
        const ia = statusOrder.indexOf(a.meta.status);
        const ib = statusOrder.indexOf(b.meta.status);
        if (ia !== ib) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
        return String(b.mtime || '').localeCompare(String(a.mtime || ''));
      });
      bodyHtml = `<div class="map-mosaic-grid">${sorted.map(renderMapCard).join('')}</div>`;
    } else {
      const groups = new Map();
      for (const d of filteredDocs) {
        const key =
          state.mapGroupBy === 'folder'
            ? d.topFolder || 'raiz'
            : d.meta.serie || 'Sem Série';
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(d);
      }

      bodyHtml = Array.from(groups.entries())
        .sort((a, b) => b[1].length - a[1].length)
        .map(([groupName, items]) => {
          const sMeta = SERIE_META[groupName] || {};
          const icon = sMeta.icon || (state.mapGroupBy === 'folder' ? '📁' : '•');
          const pubCount = items.filter((i) => i.meta.status === 'publicado').length;
          const activeCount = items.filter((i) => ['roteiro', 'gravando', 'edicao'].includes(i.meta.status)).length;
          const sortedItems = [...items].sort((a, b) => {
            const ia = statusOrder.indexOf(a.meta.status);
            const ib = statusOrder.indexOf(b.meta.status);
            return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
          });
          return `
            <section class="map-serie-section">
              <div class="map-serie-head">
                <div style="display:flex; align-items:center; gap:9px;">
                  <span style="color:${sMeta.color || 'var(--accent)'}; font-size:15px;">${icon}</span>
                  <h3 style="margin:0; font-size:14.5px; font-weight:600;">${MD.escapeHtml(groupName)}</h3>
                  <span class="kanban-count">${items.length}</span>
                </div>
                <div style="display:flex; align-items:center; gap:10px; font-family:var(--font-mono); font-size:11px; color:var(--text-3);">
                  <span style="color:#22c55e;">${pubCount} pub.</span>
                  <span style="color:var(--accent);">${activeCount} em prod.</span>
                </div>
              </div>
              <div class="map-cards-grid">
                ${sortedItems.map(renderMapCard).join('')}
              </div>
            </section>
          `;
        })
        .join('');
    }

    container.innerHTML = `
      <div class="map-header-bar">
        <div class="section-subhead" style="margin:0;">
          <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
            <div class="mode-switch" id="mapGroupSwitch">
              <button type="button" class="${state.mapStyle === 'cards' && state.mapGroupBy === 'serie' ? 'active' : ''}" data-map-group="serie">Por Série</button>
              <button type="button" class="${state.mapStyle === 'cards' && state.mapGroupBy === 'mosaic' ? 'active' : ''}" data-map-group="mosaic">Mosaico por Status</button>
              <button type="button" class="${state.mapStyle === 'cards' && state.mapGroupBy === 'folder' ? 'active' : ''}" data-map-group="folder">Por Pasta</button>
            </div>
            <input type="search" class="search-box-sm" id="mapSearchInput" placeholder="Buscar no mapa..." value="${MD.escapeHtml(state.mapSearch)}">
          </div>
          <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
            <button type="button" class="btn-sm${state.mapStyle === 'flowchart' ? ' btn-accent' : ''}" id="mapStyleToggleBtn">${state.mapStyle === 'flowchart' ? '▦ Estilo: Cartões' : '◈ Estilo: Fluxograma'}</button>
            <button type="button" class="btn-sm" id="mapHideMetaBtn">${state.mapHideMeta ? 'Mostrar Docs/Templates' : 'Ocultar Docs/Templates'}</button>
            <button type="button" class="btn-sm btn-accent" id="mapNewDocBtn">+ Novo Roteiro</button>
          </div>
        </div>
        <div class="map-dist-bar" title="Distribuição proporcional dos status">${distSegmentsHtml}</div>
        <div class="map-legend">${legendHtml}</div>
      </div>

      ${bodyHtml}
    `;

    container.querySelectorAll('#mapGroupSwitch button').forEach((btn) => {
      btn.onclick = () => {
        state.mapStyle = 'cards';
        state.mapGroupBy = btn.dataset.mapGroup;
        state.mapFlowFullscreen = false;
        syncActiveTabFromState();
        updateHeaderChrome();
        renderMapView(container);
      };
    });

    const styleToggleBtn = document.getElementById('mapStyleToggleBtn');
    if (styleToggleBtn) {
      styleToggleBtn.onclick = () => {
        state.mapStyle = state.mapStyle === 'flowchart' ? 'cards' : 'flowchart';
        state.mapFlowFullscreen = false;
        state.mapFlowAutoFitKey = '';
        syncActiveTabFromState();
        updateHeaderChrome();
        renderMapView(container);
      };
    }

    const mapSearchEl = document.getElementById('mapSearchInput');
    if (mapSearchEl) {
      mapSearchEl.oninput = () => {
        state.mapSearch = mapSearchEl.value;
        const pos = mapSearchEl.selectionStart;
        renderMapView(container);
        const again = document.getElementById('mapSearchInput');
        if (again) {
          again.focus();
          again.setSelectionRange(pos, pos);
        }
      };
    }

    container.querySelectorAll('[data-map-status]').forEach((btn) => {
      btn.onclick = () => {
        state.mapStatusFilter = btn.dataset.mapStatus;
        renderMapView(container);
      };
    });

    const hideMetaBtn = document.getElementById('mapHideMetaBtn');
    if (hideMetaBtn) {
      hideMetaBtn.onclick = () => {
        state.mapHideMeta = !state.mapHideMeta;
        renderMapView(container);
      };
    }

    const mapNewBtn = document.getElementById('mapNewDocBtn');
    if (mapNewBtn) mapNewBtn.onclick = () => openNewDocModal();

    container.querySelectorAll('[data-open-map-doc]').forEach((card) => {
      card.onclick = () => setView('scripts', card.dataset.openMapDoc);
    });

    if (flowModel) {
      const fitKey = `${chData.key}::${state.mapFlowLayout}::${filteredDocs.length}`;
      if (state.mapFlowAutoFitKey !== fitKey) {
        state.mapFlowAutoFitKey = fitKey;
        requestAnimationFrame(() => fitFlowchartToViewport(flowModel));
      }

      container.querySelectorAll('#mapFlowLayoutSwitch button').forEach((btn) => {
        btn.onclick = () => {
          state.mapFlowLayout = btn.dataset.flowLayout;
          state.mapFlowAutoFitKey = '';
          renderMapView(container);
        };
      });

      const zoomStep = (delta) => {
        state.mapFlowZoom = Math.min(2.2, Math.max(0.32, Number((state.mapFlowZoom + delta).toFixed(2))));
        applyFlowViewportTransform(document.getElementById('mapFlowViewport'), flowModel);
      };
      document.getElementById('mapFlowZoomOutBtn')?.addEventListener('click', () => zoomStep(-0.15));
      document.getElementById('mapFlowZoomInBtn')?.addEventListener('click', () => zoomStep(0.15));
      document.getElementById('mapFlowZoomResetBtn')?.addEventListener('click', () => {
        state.mapFlowZoom = 1;
        applyFlowViewportTransform(document.getElementById('mapFlowViewport'), flowModel);
      });
      document.getElementById('mapFlowFitBtn')?.addEventListener('click', () => fitFlowchartToViewport(flowModel));

      document.getElementById('mapFlowFullscreenBtn')?.addEventListener('click', () => {
        state.mapFlowFullscreen = !state.mapFlowFullscreen;
        state.mapFlowAutoFitKey = '';
        updateHeaderChrome();
        renderMapView(container);
      });

      document.getElementById('mapExportToBoardBtn')?.addEventListener('click', () => {
        exportFlowchartToBoard(flowModel, chData);
      });

      const vp = document.getElementById('mapFlowViewport');
      const tooltip = document.getElementById('mapFlowTooltip');
      if (vp) {
        let dragState = null;
        vp.addEventListener('pointerdown', (e) => {
          if (e.pointerType === 'mouse' && e.button !== 0) return;
          dragState = {
            pointerId: e.pointerId,
            startX: e.clientX,
            startY: e.clientY,
            origPanX: state.mapFlowPanX,
            origPanY: state.mapFlowPanY,
            moved: false,
            targetNode: e.target.closest('[data-flow-doc]'),
          };
        });
        const onPointerMove = (e) => {
          if (!dragState || e.pointerId !== dragState.pointerId) return;
          const dx = e.clientX - dragState.startX;
          const dy = e.clientY - dragState.startY;
          if (!dragState.moved && Math.hypot(dx, dy) > 5) {
            dragState.moved = true;
            vp.classList.add('is-panning');
          }
          if (dragState.moved) {
            state.mapFlowPanX = dragState.origPanX + dx;
            state.mapFlowPanY = dragState.origPanY + dy;
            applyFlowViewportTransform(vp, flowModel);
          }
        };
        const onPointerEnd = (e) => {
          if (!dragState || e.pointerId !== dragState.pointerId) return;
          const wasMoved = dragState.moved;
          const nodeBtn = dragState.targetNode;
          dragState = null;
          vp.classList.remove('is-panning');
          if (!wasMoved && nodeBtn && !(e.ctrlKey || e.metaKey) && e.type === 'pointerup') {
            state.mapFlowFullscreen = false;
            setView('scripts', nodeBtn.dataset.flowDoc);
          }
        };
        global.addEventListener('pointermove', onPointerMove);
        global.addEventListener('pointerup', onPointerEnd);
        global.addEventListener('pointercancel', onPointerEnd);
        mapFlowPointerCleanups.push(() => {
          global.removeEventListener('pointermove', onPointerMove);
          global.removeEventListener('pointerup', onPointerEnd);
          global.removeEventListener('pointercancel', onPointerEnd);
        });

        if (global.ResizeObserver) {
          let lastVpW = vp.clientWidth;
          let lastVpH = vp.clientHeight;
          mapFlowResizeObserver = new ResizeObserver((entries) => {
            if (state.view !== 'map' || state.mapStyle !== 'flowchart') return;
            const entry = entries[0];
            const nw = Math.round(entry?.contentRect?.width || vp.clientWidth || 0);
            const nh = Math.round(entry?.contentRect?.height || vp.clientHeight || 0);
            if (!nw || !nh) return;
            const crossedBreak =
              state.mapFlowLayout === 'blocks' &&
              ((lastVpW < 920) !== (nw < 920) || (lastVpW < 760) !== (nw < 760));
            if (crossedBreak) {
              lastVpW = nw;
              lastVpH = nh;
              state.mapFlowAutoFitKey = '';
              renderMapView(container);
              return;
            }
            if (Math.abs(nw - lastVpW) > 10 || Math.abs(nh - lastVpH) > 10) {
              lastVpW = nw;
              lastVpH = nh;
              fitFlowchartToViewport(flowModel);
            }
          });
          mapFlowResizeObserver.observe(vp);
        }

        vp.addEventListener(
          'wheel',
          (e) => {
            e.preventDefault();
            const rect = vp.getBoundingClientRect();
            const mx = e.clientX - rect.left;
            const my = e.clientY - rect.top;
            const prevZoom = state.mapFlowZoom;
            const factor = e.deltaY < 0 ? 1.1 : 0.9;
            const nextZoom = Math.min(2.2, Math.max(0.32, Number((prevZoom * factor).toFixed(2))));
            const ratio = nextZoom / prevZoom;
            state.mapFlowPanX = Math.round(mx - (mx - state.mapFlowPanX) * ratio);
            state.mapFlowPanY = Math.round(my - (my - state.mapFlowPanY) * ratio);
            state.mapFlowZoom = nextZoom;
            applyFlowViewportTransform(vp, flowModel);
          },
          { passive: false }
        );

        vp.querySelectorAll('[data-flow-doc]').forEach((nodeEl) => {
          nodeEl.addEventListener('mouseenter', (e) => {
            if (!tooltip) return;
            const doc = filteredDocs.find((d) => d.path === nodeEl.dataset.flowDoc);
            if (!doc) return;
            const vis = STATUS_VISUAL[doc.meta.status] || STATUS_VISUAL.ideia;
            tooltip.innerHTML = `
              <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:4px;">
                <span class="status-pill st-${MD.escapeHtml(doc.meta.status)}">${MD.escapeHtml(vis.label)}</span>
                <span style="font-family:var(--font-mono); font-size:10px; color:var(--text-3);">${MD.escapeHtml(doc.meta.serie || '')}</span>
              </div>
              <div style="font-weight:700; color:#fff; margin-bottom:4px;">${MD.escapeHtml(doc.meta.titulo)}</div>
              <div style="font-family:var(--font-mono); font-size:10px; color:var(--text-3); margin-bottom:5px;">${formatNumber(doc.stats?.words || 0)} pal. • ${MD.escapeHtml(doc.meta.duracao_estimada || '—')}</div>
              ${doc.meta.resumo ? `<div style="font-size:11px; color:var(--text-2); line-height:1.4;">${MD.escapeHtml(doc.meta.resumo)}</div>` : ''}
            `;
            const shellRect = document.getElementById('mapFlowShell')?.getBoundingClientRect();
            const nRect = nodeEl.getBoundingClientRect();
            if (shellRect) {
              const left = Math.min(shellRect.width - 295, Math.max(12, nRect.right - shellRect.left + 10));
              const top = Math.min(shellRect.height - 150, Math.max(54, nRect.top - shellRect.top));
              tooltip.style.left = `${Math.round(left)}px`;
              tooltip.style.top = `${Math.round(top)}px`;
            }
            tooltip.classList.remove('hidden');
          });
          nodeEl.addEventListener('mouseleave', () => {
            tooltip?.classList.add('hidden');
          });
        });
      }
    }
  }

  /* =========================================================
     VIEW QUADRO & FLUXOS (EXCALIDRAW + MODO FOCO EM NODES)
  ========================================================= */
  let wbAutoSaveTimer = null;
  let wbSaveInFlight = false;
  let wbPendingBoardLoad = null;
  let wbBoardModalMode = 'create'; // 'create' | 'rename'
  let wbBoardModalTargetId = null;
  const wbSnapshotWaiters = new Map();

  function updateWhiteboardSaveBadge() {
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

  function syncWhiteboardTopbarUI() {
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

  function buildScriptsSummaryList() {
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

  function postToExcalidrawFrame(payload) {
    const frame = document.getElementById('excalidrawFrame');
    if (!frame || !frame.contentWindow) return false;
    frame.contentWindow.postMessage(payload, global.location.origin);
    return true;
  }

  function postLoadSceneToFrame(boardData) {
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

  function requestWhiteboardSnapshot(timeoutMs = 450) {
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

  async function saveActiveBoard({ reason = 'manual', forceSnapshot = false } = {}) {
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

  function flushWhiteboardSaveOnLeave() {
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

  async function loadBoardIntoSession(boardId) {
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

  async function fetchBoardsListForChannel(ch = state.activeChannel, { force = false } = {}) {
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

  function openBoardEditor(boardId) {
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

  async function backToWhiteboardList({ skipSave = false } = {}) {
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

  async function initWhiteboardSession() {
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

  function toggleWhiteboardFullscreen(forceVal) {
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

  function openWbBoardModal(mode = 'create', targetBoardId = null) {
    if (!state.serverMode) {
      showToast('Gerenciar quadros requer o servidor local rodando.');
      return;
    }
    wbBoardModalMode = mode;
    wbBoardModalTargetId = mode === 'rename' ? (targetBoardId || state.activeBoardId) : null;
    const modal = document.getElementById('wbBoardModal');
    const titleEl = document.getElementById('wbBoardModalTitle');
    const nameInp = document.getElementById('wbBoardTitleInput');
    const slugField = document.getElementById('wbBoardSlugField');
    const slugInp = document.getElementById('wbBoardSlugInput');
    const modeField = document.getElementById('wbBoardModeField');
    const modeSel = document.getElementById('wbBoardModeSelect');
    const submitBtn = document.getElementById('wbBoardSubmitBtn');

    if (mode === 'rename') {
      const list = state.boardsList.length ? state.boardsList : (getActiveChannelData().boards || []);
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

  function openWbDeleteConfirmModal(targetBoardId = null) {
    const targetId = targetBoardId || state.activeBoardId;
    if (!state.serverMode || !targetId) return;
    state.wbDeleteTargetId = targetId;
    const list = state.boardsList.length ? state.boardsList : (getActiveChannelData().boards || []);
    const cur = list.find((b) => b.id === targetId);
    const nameSpan = document.getElementById('wbDeleteConfirmName');
    if (nameSpan) nameSpan.textContent = cur ? `${cur.title} (${cur.id})` : targetId;
    document.getElementById('wbDeleteConfirmModal')?.classList.remove('hidden');
  }

  function openWbScriptPickerModal() {
    const modal = document.getElementById('wbScriptPickerModal');
    const searchInp = document.getElementById('wbScriptSearchInput');
    if (!modal) return;
    if (searchInp) searchInp.value = '';
    renderWbScriptPickerList('');
    modal.classList.remove('hidden');
    setTimeout(() => searchInp?.focus(), 30);
  }

  function renderWbScriptPickerList(query = '') {
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

  async function sendDocToWhiteboard(doc) {
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
    const list = state.boardsList.length ? state.boardsList : (getActiveChannelData().boards || []);
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

  async function importExcalidrawFile(file) {
    if (!file || !state.serverMode) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const baseTitle = (parsed?.cromMeta?.title || file.name.replace(/\.excalidraw(\.json)?$/i, '') || 'Quadro Importado').trim();
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

  function handleWhiteboardMessage(e) {
    if (e.origin !== global.location.origin) return;
    const msg = e.data;
    if (!msg || typeof msg.type !== 'string' || !msg.type.startsWith('wb:')) return;

    switch (msg.type) {
      case 'wb:ready':
        state.boardReady = true;
        if (wbPendingBoardLoad) {
          postLoadSceneToFrame(wbPendingBoardLoad);
        } else if (state.activeBoardId && state.boardActiveScene) {
          postLoadSceneToFrame({
            board: { id: state.activeBoardId, title: state.boardsList.find((b) => b.id === state.activeBoardId)?.title || 'Quadro' },
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

  function getVisibleBoardsForList() {
    const ch = state.activeChannel;
    const allBoards = state.wbListFetchedChannel === ch
      ? state.boardsList
      : (getActiveChannelData().boards || state.boardsList || []);
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

  function renderWhiteboardListCardsHtml(allBoards, filtered, ch) {
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

  function bindWhiteboardListCardEvents(rootEl) {
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

  function updateWhiteboardListBodyOnly() {
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

  function renderWhiteboardListView(container) {
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

  function renderWhiteboardView(container) {
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

  function renderHistoryDiffTab(activeDoc) {
    if (!state.serverMode) {
      return `
        <div class="doc-body-scroll">
          <div class="glass-card" style="max-width:600px; margin:24px auto;">
            <h3 class="gc-title">Histórico Git & Diff de Roteiros</h3>
            <p class="gc-desc">
              O histórico de revisões, comparação linha a linha e versões alternativas estão disponíveis quando o painel roda com o servidor local:
              <code>./bin/crom-studio --tray</code> (ou <code>npm start</code>).
            </p>
          </div>
        </div>
      `;
    }

    if (state.versionLoading && !state.versionHistory) {
      return `<div class="doc-body-scroll"><p style="color:var(--text-3); padding:24px;">Carregando histórico de revisões...</p></div>`;
    }

    if (state.versionError) {
      return `
        <div class="doc-body-scroll">
          <div class="glass-card" style="max-width:560px; margin:24px auto;">
            <h3 class="gc-title">Erro ao carregar histórico</h3>
            <p class="gc-desc">${MD.escapeHtml(state.versionError)}</p>
            <div class="gc-actions">
              <button type="button" class="btn-sm btn-accent" id="retryHistoryBtn">Tentar novamente</button>
            </div>
          </div>
        </div>
      `;
    }

    const history = state.versionHistory || { versions: [], revisions: [] };
    const versions = history.versions || [];
    const revisions = history.revisions || [];

    const buildRefOptions = (selectedVal) => {
      const verOpts = versions.map((v) => {
        const val = `ver:${v.name}`;
        return `<option value="${MD.escapeHtml(val)}"${selectedVal === val ? ' selected' : ''}>Versão: ${MD.escapeHtml(v.name)}${v.headRev ? ` (${MD.escapeHtml(v.headRev)})` : ''}</option>`;
      });
      const revOpts = revisions.map((r) => {
        const val = r.id === 'disk' ? 'disk' : `rev:${r.id}`;
        const isSelected = selectedVal === val || (r.id === 'disk' && selectedVal === 'rev:disk');
        return `<option value="${MD.escapeHtml(val)}"${isSelected ? ' selected' : ''}>${MD.escapeHtml(r.id)} (${MD.escapeHtml(r.version || 'principal')}) — ${MD.escapeHtml(String(r.message || '').slice(0, 42))}</option>`;
      });
      return [...verOpts, ...revOpts].join('');
    };

    const timelineHtml = revisions.length
      ? revisions
          .map((rev) => {
            const isSelected = state.selectedRevPreview === rev.id;
            const dateStr = formatDatePt(String(rev.createdAt || '').slice(0, 10));
            return `
              <div class="git-rev-card${isSelected ? ' is-selected' : ''}">
                <div class="git-rev-top">
                  <span style="font-weight:700; color:var(--text-1);">${MD.escapeHtml(rev.id)}</span>
                  <span class="git-kind-badge kind-${MD.escapeHtml(rev.kind || 'commit')}">${MD.escapeHtml(rev.kind || 'commit')}</span>
                  <span style="color:var(--accent);">${MD.escapeHtml(rev.version || 'principal')}</span>
                </div>
                <div style="font-size:12px; font-weight:600; color:var(--text-1); line-height:1.35;">${MD.escapeHtml(rev.message || '')}</div>
                <div style="font-size:11px; color:var(--text-3); display:flex; justify-content:space-between; gap:6px; flex-wrap:wrap;">
                  <span>${MD.escapeHtml(rev.author || 'MrJ')} • ${MD.escapeHtml(dateStr)}</span>
                  <span style="font-family:var(--font-mono);">
                    <span style="color:#86efac;">+${Number(rev.added || 0)}</span>
                    <span style="color:#fda4af;">-${Number(rev.removed || 0)}</span>
                    • ${Number(rev.words || 0)} pal.
                  </span>
                </div>
                <div style="display:flex; gap:6px; flex-wrap:wrap; margin-top:2px;">
                  <button type="button" class="kc-move-btn" data-rev-preview="${MD.escapeHtml(rev.id)}">Snapshot</button>
                  <button type="button" class="kc-move-btn" data-rev-diff="${MD.escapeHtml(rev.id)}">Diff c/ atual</button>
                  ${rev.id !== 'disk' ? `<button type="button" class="kc-move-btn" data-rev-restore="${MD.escapeHtml(rev.id)}">Restaurar</button>` : ''}
                </div>
              </div>
            `;
          })
          .join('')
      : '<p style="color:var(--text-3); font-size:12px; padding:10px;">Nenhuma revisão registrada ainda. Salve uma edição para criar o primeiro snapshot.</p>';

    let rightPaneHtml = '';
    if (state.selectedRevPreview && state.revPreviewContent !== null) {
      rightPaneHtml = `
        <div class="git-diff-toolbar">
          <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
            <strong style="font-size:12.5px;">Snapshot: <code>${MD.escapeHtml(state.selectedRevPreview)}</code></strong>
            <span style="font-size:11px; color:var(--text-3);">(${MD.escapeHtml(activeDoc.path)})</span>
          </div>
          <div style="display:flex; gap:8px; flex-wrap:wrap;">
            ${state.selectedRevPreview !== 'disk' ? `<button type="button" class="btn-sm btn-accent" id="restorePreviewBtn">↺ Restaurar este snapshot</button>` : ''}
            <button type="button" class="btn-sm" id="closeRevPreviewBtn">Voltar ao Diff</button>
          </div>
        </div>
        <div class="diff-viewer">
          <pre style="margin:0; white-space:pre-wrap; word-break:break-word; font-family:var(--font-mono); font-size:12px; line-height:1.6; color:var(--text-1);">${MD.escapeHtml(state.revPreviewContent)}</pre>
        </div>
      `;
    } else {
      const diff = state.diffResult;
      const diffBodyHtml = diff
        ? (diff.lines || [])
            .map((line) => {
              const marker = line.type === 'add' ? '+' : line.type === 'del' ? '-' : ' ';
              return `
                <div class="diff-line is-${MD.escapeHtml(line.type)}">
                  <span class="diff-ln">${line.oldLine ?? ''}</span>
                  <span class="diff-ln">${line.newLine ?? ''}</span>
                  <span class="diff-ln">${marker}</span>
                  <span>${MD.escapeHtml(line.text)}</span>
                </div>
              `;
            })
            .join('') || '<p style="color:var(--text-3); padding:12px;">Sem diferenças entre as referências selecionadas.</p>'
        : '<p style="color:var(--text-3); padding:12px;">Selecione duas referências acima para visualizar as alterações linha a linha.</p>';

      rightPaneHtml = `
        <div class="git-diff-toolbar">
          <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
            <span style="font-size:11px; color:var(--text-3);">De:</span>
            <select class="select-dark" id="diffFromSelect" style="height:28px; font-size:11.5px; max-width:210px;">
              ${buildRefOptions(state.diffFromRef)}
            </select>
            <button type="button" class="icon-btn-sm" id="diffSwapBtn" title="Inverter comparação">⇄</button>
            <span style="font-size:11px; color:var(--text-3);">Para:</span>
            <select class="select-dark" id="diffToSelect" style="height:28px; font-size:11.5px; max-width:210px;">
              ${buildRefOptions(state.diffToRef)}
            </select>
          </div>
          ${diff
            ? `<div style="font-family:var(--font-mono); font-size:11px; display:flex; gap:10px;">
                <span style="color:#86efac;">+${Number(diff.added || 0)}</span>
                <span style="color:#fda4af;">-${Number(diff.removed || 0)}</span>
                <span style="color:var(--text-3);">${Number(diff.unchanged || 0)} iguais</span>
              </div>`
            : ''}
        </div>
        <div class="diff-viewer">${diffBodyHtml}</div>
      `;
    }

    return `
      <div class="git-view-grid">
        <div class="git-timeline">
          <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:4px;">
            <span class="insp-title">Linha do Tempo (${revisions.length})</span>
            <button type="button" class="kc-move-btn" id="refreshHistoryBtn">↻ Atualizar</button>
          </div>
          ${timelineHtml}
        </div>
        <div class="git-diff-pane">${rightPaneHtml}</div>
      </div>
    `;
  }

  function bindHistoryDiffEvents(activeDoc, container) {
    const retryBtn = document.getElementById('retryHistoryBtn');
    if (retryBtn) retryBtn.onclick = () => loadVersionHistory(activeDoc.path, { force: true });

    const refreshBtn = document.getElementById('refreshHistoryBtn');
    if (refreshBtn) refreshBtn.onclick = () => loadVersionHistory(activeDoc.path, { force: true });

    const fromSel = document.getElementById('diffFromSelect');
    const toSel = document.getElementById('diffToSelect');
    if (fromSel && toSel) {
      const triggerDiff = () => loadDiffForDoc(activeDoc.path, fromSel.value, toSel.value);
      fromSel.onchange = triggerDiff;
      toSel.onchange = triggerDiff;
    }

    const swapBtn = document.getElementById('diffSwapBtn');
    if (swapBtn && fromSel && toSel) {
      swapBtn.onclick = () => {
        loadDiffForDoc(activeDoc.path, toSel.value, fromSel.value);
      };
    }

    container.querySelectorAll('[data-rev-preview]').forEach((btn) => {
      btn.onclick = () => loadRevisionPreview(activeDoc.path, btn.dataset.revPreview);
    });

    container.querySelectorAll('[data-rev-diff]').forEach((btn) => {
      btn.onclick = () => {
        const revId = btn.dataset.revDiff;
        const fromRef = revId === 'disk' ? 'disk' : `rev:${revId}`;
        const toRef = `ver:${state.activeVersion || 'principal'}`;
        loadDiffForDoc(activeDoc.path, fromRef, toRef);
      };
    });

    container.querySelectorAll('[data-rev-restore]').forEach((btn) => {
      btn.onclick = () => restoreDocRevision(activeDoc.path, btn.dataset.revRestore, state.activeVersion || 'principal');
    });

    const closePrevBtn = document.getElementById('closeRevPreviewBtn');
    if (closePrevBtn) {
      closePrevBtn.onclick = () => {
        state.selectedRevPreview = null;
        state.revPreviewContent = null;
        if (!state.diffResult && state.diffFromRef && state.diffToRef) {
          loadDiffForDoc(activeDoc.path, state.diffFromRef, state.diffToRef);
        } else {
          renderScriptsView(container);
        }
      };
    }

    const restorePrevBtn = document.getElementById('restorePreviewBtn');
    if (restorePrevBtn && state.selectedRevPreview) {
      restorePrevBtn.onclick = () =>
        restoreDocRevision(activeDoc.path, state.selectedRevPreview, state.activeVersion || 'principal');
    }
  }

  function renderScriptsView(container) {
    const chData = getActiveChannelData();
    const docs = chData.docs || [];
    const activeDoc = getActiveDoc();
    if (activeDoc && !state.selectedDocPath) {
      state.selectedDocPath = activeDoc.path;
    }

    if (state.serverMode && activeDoc) {
      const expectedFetchKey = `${state.activeChannel}::${activeDoc.path}`;
      if (state.versionFetchedKey !== expectedFetchKey && !state.versionLoading) {
        loadVersionHistory(activeDoc.path);
      }
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
    const liveStats = MD.analyzeStats(currentBody);

    let workspaceHtml = '<p style="padding:30px; color:var(--text-3);">Nenhum arquivo selecionado.</p>';
    let inspectorHtml = '<p style="color:var(--text-3); font-size:12px;">Nenhum documento selecionado.</p>';

    if (activeDoc) {
      let bodySectionHtml = '';
      if (state.docMode === 'read') {
        bodySectionHtml = `
          <div class="doc-body-scroll" id="readerScroll">
            <article class="md-article" id="mdArticle" style="font-size:${state.readerFontSize}px;">
              ${MD.renderMarkdown(currentBody)}
            </article>
          </div>
        `;
      } else if (state.docMode === 'edit') {
        const shortcutsHtml = `
          <div class="editor-shortcuts">
            <button type="button" data-insert="\`[GANCHO]\` ">+ [GANCHO]</button>
            <button type="button" data-insert="\`[TELA]\` ">+ [TELA]</button>
            <button type="button" data-insert="\`[B-ROLL]\` ">+ [B-ROLL]</button>
            <button type="button" data-insert="\`[CORTE]\` ">+ [CORTE]</button>
            <button type="button" data-insert="\n00:00 — ">+ Timestamp</button>
            <button type="button" data-insert="\n- [ ] ">+ Checklist</button>
          </div>
        `;
        const textareaHtml = `<textarea class="md-textarea" id="mdEditorInput" spellcheck="true" style="font-size:${state.readerFontSize}px;">${MD.escapeHtml(currentBody)}</textarea>`;
        if (state.editorSplit) {
          bodySectionHtml = `
            <div class="editor-split">
              <div class="editor-pane">
                ${shortcutsHtml}
                ${textareaHtml}
              </div>
              <div class="preview-pane">
                <article class="md-article" id="mdLivePreview" style="font-size:${state.readerFontSize}px;">
                  ${MD.renderMarkdown(currentBody)}
                </article>
              </div>
            </div>
          `;
        } else {
          bodySectionHtml = `
            <div class="editor-single-pane">
              ${shortcutsHtml}
              ${textareaHtml}
            </div>
          `;
        }
      } else if (state.docMode === 'history') {
        bodySectionHtml = renderHistoryDiffTab(activeDoc);
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

      const versions = state.versionHistory?.versions || [
        { name: 'principal', description: 'Arquivo .md principal no workspace', isPrimary: true, headRev: activeDoc.versioning?.headRev || null },
      ];
      const activeVerObj = versions.find((v) => v.name === state.activeVersion);
      const variantBannerHtml =
        state.activeVersion !== 'principal'
          ? `
            <div class="variant-banner">
              <div>
                <span>⎇ Versão alternativa ativa: <strong>${MD.escapeHtml(state.activeVersion)}</strong></span>
                ${activeVerObj?.description ? `<span style="color:var(--text-2); margin-left:6px;">— ${MD.escapeHtml(activeVerObj.description)}</span>` : ''}
              </div>
              <div style="display:flex; gap:6px; flex-wrap:wrap;">
                <button type="button" class="btn-sm" id="varSwitchPrincipalBtn">← Principal</button>
                <button type="button" class="btn-sm" id="varCompareBtn">Comparar com principal</button>
                <button type="button" class="btn-sm btn-accent" id="varPromoteBtn">Promover para principal</button>
                <button type="button" class="btn-sm btn-danger" id="varDeleteBtn">Excluir versão</button>
              </div>
            </div>
          `
          : '';

      workspaceHtml = `
        <div class="doc-toolbar-clean">
          <div style="display:flex; align-items:center; gap:8px; min-width:0; flex-wrap:wrap;">
            <button type="button" class="icon-btn-sm${!state.scriptsListCollapsed ? ' is-active' : ''}" id="toggleListBtn" title="Mostrar/ocultar lista de roteiros">◧</button>
            <span class="doc-path-chip" title="${MD.escapeHtml(activeDoc.path)}">${MD.escapeHtml(activeDoc.path)}${state.hasUnsavedEdits ? ' •' : ''}</span>
            <div class="mode-switch" id="docModeSwitch">
              <button type="button" class="${state.docMode === 'read' ? 'active' : ''}" data-doc-mode="read">Ler</button>
              <button type="button" class="${state.docMode === 'edit' ? 'active' : ''}" data-doc-mode="edit">Editar</button>
              <button type="button" class="${state.docMode === 'prompter' ? 'active' : ''}" data-doc-mode="prompter">Teleprompter</button>
              <button type="button" class="${state.docMode === 'history' ? 'active' : ''}" data-doc-mode="history">Histórico & Diff</button>
            </div>
          </div>
          <div class="doc-actions">
            <div class="zoom-group" title="Tamanho da fonte no leitor e editor">
              <button type="button" id="fontMinusBtn">A-</button>
              <span id="fontZoomVal">${state.readerFontSize}px</span>
              <button type="button" id="fontPlusBtn">A+</button>
            </div>
            ${state.docMode === 'edit' ? `<button type="button" class="icon-btn-sm${state.editorSplit ? ' is-active' : ''}" id="toggleSplitBtn" title="Alternar entre Editor Split e Painel Único">${state.editorSplit ? '⫿ Split' : '▭ Único'}</button>` : ''}
            <button type="button" class="icon-btn-sm${state.focusMode ? ' is-active' : ''}" id="toggleFocusBtn" title="Modo Foco (Esc para sair)">⛶</button>
            <button type="button" class="btn-sm btn-accent" id="saveDocBtn">Salvar${state.hasUnsavedEdits ? ' •' : ''} (Ctrl+S)</button>
            <button type="button" class="icon-btn-sm${!state.inspectorCollapsed ? ' is-active' : ''}" id="toggleInspectorBtn" title="Mostrar/ocultar inspetor direito">◨</button>
          </div>
        </div>
        ${variantBannerHtml}
        ${bodySectionHtml}
      `;

      const isProtected = activeDoc.path === 'AGENTS.md' || activeDoc.path === 'README.md';
      const recentRevs = (state.versionHistory?.revisions || []).slice(0, 3);
      const versionChipsHtml = versions
        .map(
          (v) => `
            <button type="button" class="ver-chip${v.name === state.activeVersion ? ' is-active' : ''}" data-switch-version="${MD.escapeHtml(v.name)}" title="${MD.escapeHtml(v.description || v.name)}">
              <span class="ver-chip-dot"></span>
              <span>${MD.escapeHtml(v.name)}</span>
              ${v.headRev ? `<small style="opacity:0.7; font-family:var(--font-mono);">${MD.escapeHtml(v.headRev)}</small>` : ''}
            </button>
          `
        )
        .join('');

      const recentCommitsHtml = state.serverMode
        ? recentRevs.length
          ? recentRevs
              .map(
                (r) => `
                  <button type="button" class="insp-rev-row" data-insp-rev="${MD.escapeHtml(r.id)}">
                    <div style="display:flex; justify-content:space-between; gap:6px; font-family:var(--font-mono); font-size:10.5px;">
                      <strong>${MD.escapeHtml(r.id)}</strong>
                      <span style="color:var(--accent);">${MD.escapeHtml(r.version || 'principal')}</span>
                      <span style="color:var(--text-3);">${formatDatePt(String(r.createdAt || '').slice(0, 10))}</span>
                    </div>
                    <div style="color:var(--text-2); margin-top:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${MD.escapeHtml(r.message || '')}</div>
                  </button>
                `
              )
              .join('')
          : '<span style="font-size:11px; color:var(--text-3);">Sem commits gravados ainda.</span>'
        : '<span style="font-size:11px; color:var(--text-3);">Conecte via servidor local para versionamento Git.</span>';

      inspectorHtml = `
        <div class="insp-section">
          <div class="insp-title-row">
            <span class="insp-title">Metadados</span>
            <span class="status-pill st-${MD.escapeHtml(currentMeta.status || 'ideia')}">${MD.escapeHtml(currentMeta.status || 'ideia')}</span>
          </div>
          <div class="insp-meta-grid">
            <div class="fm-field fm-field-full">
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
          <div class="insp-stats-row" id="inspStatsRow">
            <span>${formatNumber(liveStats.words)} pal.</span>
            <span>~${liveStats.speakMinutes} min fala</span>
            <span>${liveStats.checksDone}/${liveStats.checksTotal} checks</span>
          </div>
        </div>

        <div class="insp-section">
          <div class="insp-title-row">
            <span class="insp-title">Versões Alternativas</span>
            <button type="button" class="kc-move-btn" id="inspNewVersionBtn">+ Nova Versão</button>
          </div>
          <div class="version-chip-list">${versionChipsHtml}</div>
          ${state.activeVersion !== 'principal'
            ? `
              <div class="insp-actions-stack" style="margin-top:8px;">
                <button type="button" class="btn-sm" id="inspCompareVarBtn">Comparar</button>
                <button type="button" class="btn-sm btn-accent" id="inspPromoteVarBtn">Promover</button>
              </div>
            `
            : ''}
        </div>

        <div class="insp-section">
          <div class="insp-title-row">
            <span class="insp-title">Git do Roteiro</span>
            <button type="button" class="kc-move-btn" id="inspOpenHistoryBtn">Histórico ↗</button>
          </div>
          <input type="text" class="search-box-sm" id="inspCommitMsgInput" placeholder="Mensagem do commit..." value="${MD.escapeHtml(state.commitMessageDraft || '')}" style="height:31px; font-size:11.5px; margin-bottom:6px;">
          <button type="button" class="btn-sm btn-accent" id="inspCommitSaveBtn" style="width:100%; justify-content:center;">Salvar Commit</button>
          <div class="insp-rev-mini">${recentCommitsHtml}</div>
        </div>

        <div class="insp-section">
          <div class="insp-title-row">
            <span class="insp-title">Ações & Produção</span>
          </div>
          <div class="insp-actions-stack">
            <button type="button" class="btn-sm btn-kdenlive" id="produceKdenliveBtn" style="grid-column: 1 / -1;">▶ Produzir no Kdenlive</button>
            <button type="button" class="btn-sm" id="copyPromptDocBtn">Prompt Agente</button>
            <button type="button" class="btn-sm" id="downloadDocBtn">Baixar .md</button>
            ${isProtected ? '' : '<button type="button" class="btn-sm btn-danger" id="deleteDocBtn" style="grid-column: 1 / -1;">Excluir Arquivo</button>'}
          </div>
        </div>
      `;
    }

    container.innerHTML = `
      <section class="scripts-layout${state.scriptsListCollapsed ? ' is-list-collapsed' : ''}${state.inspectorCollapsed ? ' is-inspector-collapsed' : ''}">
        <aside class="scripts-sidebar">
          <input type="search" class="search-box-sm" id="scriptsSearchInput" placeholder="Filtrar arquivos .md..." value="${MD.escapeHtml(state.scriptsSearch)}">
          <div class="scripts-filter-row">
            <select class="select-dark" id="scriptsStatusSel" style="height:30px; font-size:11px;">
              <option value="all"${state.scriptsStatusFilter === 'all' ? ' selected' : ''}>Status: Todos</option>
              <option value="gravando"${state.scriptsStatusFilter === 'gravando' ? ' selected' : ''}>Gravando</option>
              <option value="edicao"${state.scriptsStatusFilter === 'edicao' ? ' selected' : ''}>Edição</option>
              <option value="roteiro"${state.scriptsStatusFilter === 'roteiro' ? ' selected' : ''}>Roteiro</option>
              <option value="ideia"${state.scriptsStatusFilter === 'ideia' ? ' selected' : ''}>Ideia</option>
              <option value="pesquisa"${state.scriptsStatusFilter === 'pesquisa' ? ' selected' : ''}>Pesquisa</option>
              <option value="publicado"${state.scriptsStatusFilter === 'publicado' ? ' selected' : ''}>Publicado</option>
              <option value="referencia"${state.scriptsStatusFilter === 'referencia' ? ' selected' : ''}>Referência</option>
              <option value="template"${state.scriptsStatusFilter === 'template' ? ' selected' : ''}>Template</option>
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

        <aside class="doc-inspector">
          ${inspectorHtml}
        </aside>
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
        if (
          state.hasUnsavedEdits &&
          btn.dataset.selectDoc !== state.selectedDocPath &&
          !confirm('Você tem alterações não salvas neste documento. Descartar e abrir o outro arquivo?')
        ) {
          return;
        }
        stopPrompter();
        state.selectedDocPath = btn.dataset.selectDoc;
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
        syncActiveTabFromState();
        syncBrowserUrl({ replace: false });
        updateHeaderChrome();
        renderScriptsView(container);
      };
    });

    if (!activeDoc) return;

    const toggleListBtn = document.getElementById('toggleListBtn');
    if (toggleListBtn) {
      toggleListBtn.onclick = () => {
        state.scriptsListCollapsed = !state.scriptsListCollapsed;
        renderScriptsView(container);
      };
    }

    const toggleInspBtn = document.getElementById('toggleInspectorBtn');
    if (toggleInspBtn) {
      toggleInspBtn.onclick = () => {
        state.inspectorCollapsed = !state.inspectorCollapsed;
        renderScriptsView(container);
      };
    }

    const toggleSplitBtn = document.getElementById('toggleSplitBtn');
    if (toggleSplitBtn) {
      toggleSplitBtn.onclick = () => {
        state.editorSplit = !state.editorSplit;
        renderScriptsView(container);
      };
    }

    const toggleFocusBtn = document.getElementById('toggleFocusBtn');
    if (toggleFocusBtn) {
      toggleFocusBtn.onclick = () => {
        state.focusMode = !state.focusMode;
        syncBrowserUrl({ replace: true });
        updateHeaderChrome();
        renderScriptsView(container);
      };
    }

    const applyFontSize = (nextSize) => {
      state.readerFontSize = Math.min(24, Math.max(13, nextSize));
      const prefs = loadJsonStorage(STORAGE_KEY_PREFS, {});
      prefs.readerFontSize = state.readerFontSize;
      saveJsonStorage(STORAGE_KEY_PREFS, prefs);
      const valSpan = document.getElementById('fontZoomVal');
      if (valSpan) valSpan.textContent = `${state.readerFontSize}px`;
      const artEl = document.getElementById('mdArticle');
      if (artEl) artEl.style.fontSize = `${state.readerFontSize}px`;
      const edEl = document.getElementById('mdEditorInput');
      if (edEl) edEl.style.fontSize = `${state.readerFontSize}px`;
      const prevEl = document.getElementById('mdLivePreview');
      if (prevEl) prevEl.style.fontSize = `${state.readerFontSize}px`;
    };
    const fontMinusBtn = document.getElementById('fontMinusBtn');
    if (fontMinusBtn) fontMinusBtn.onclick = () => applyFontSize(state.readerFontSize - 1);
    const fontPlusBtn = document.getElementById('fontPlusBtn');
    if (fontPlusBtn) fontPlusBtn.onclick = () => applyFontSize(state.readerFontSize + 1);

    container.querySelectorAll('#docModeSwitch button').forEach((btn) => {
      btn.onclick = () => {
        stopPrompter();
        state.docMode = btn.dataset.docMode;
        syncBrowserUrl({ replace: true });
        renderScriptsView(container);
        if (
          state.docMode === 'history' &&
          state.serverMode &&
          !state.diffResult &&
          !state.selectedRevPreview &&
          state.diffFromRef &&
          state.diffToRef
        ) {
          loadDiffForDoc(activeDoc.path, state.diffFromRef, state.diffToRef);
        }
      };
    });

    container.querySelectorAll('[data-fm]').forEach((el) => {
      const updateMetaField = () => {
        state.dirtyMeta = { ...(state.dirtyMeta || activeDoc.meta), [el.dataset.fm]: el.value };
        state.hasUnsavedEdits = true;
      };
      el.onchange = updateMetaField;
      if (el.tagName === 'INPUT' && el.type === 'text') {
        el.oninput = updateMetaField;
      }
    });

    const article = document.getElementById('mdArticle');
    if (article) {
      article.querySelectorAll('.md-task-box').forEach((chk) => {
        chk.onchange = async () => {
          const idx = Number(chk.dataset.checkIndex);
          const baseBody = state.dirtyBody !== null ? state.dirtyBody : activeDoc.body;
          const updatedBody = MD.toggleCheckboxInMarkdown(baseBody, idx);
          state.dirtyBody = updatedBody;
          const activeVer = state.activeVersion || 'principal';
          const metaToSave = { ...(state.dirtyMeta || activeDoc.meta) };
          const fullRaw = MD.serializeFrontmatter(metaToSave, updatedBody);
          try {
            await persistSaveDoc(activeDoc.path, fullRaw, null, {
              version: activeVer,
              commitMessage: 'Checklist atualizado no leitor',
            });
            state.hasUnsavedEdits = false;
            if (activeVer === 'principal') {
              state.dirtyBody = null;
              state.dirtyMeta = null;
            } else {
              state.dirtyMeta = metaToSave;
              state.dirtyBody = updatedBody;
            }
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
            state.activeVersion = 'principal';
            state.versionHistory = null;
            state.versionFetchedKey = '';
            state.diffDocPath = '';
            state.diffResult = null;
            state.selectedRevPreview = null;
            state.revPreviewContent = null;
            state.dirtyBody = null;
            state.dirtyMeta = null;
            state.hasUnsavedEdits = false;
            state.commitMessageDraft = '';
            syncActiveTabFromState();
            syncBrowserUrl({ replace: false });
            updateHeaderChrome();
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
        state.hasUnsavedEdits = true;
        if (livePreview) livePreview.innerHTML = MD.renderMarkdown(editorInput.value);
        const statsEl = document.getElementById('inspStatsRow');
        if (statsEl) {
          const st = MD.analyzeStats(editorInput.value);
          statsEl.innerHTML = `<span>${formatNumber(st.words)} pal.</span><span>~${st.speakMinutes} min fala</span><span>${st.checksDone}/${st.checksTotal} checks</span>`;
        }
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

    const inspCommitInp = document.getElementById('inspCommitMsgInput');
    if (inspCommitInp) {
      inspCommitInp.oninput = () => {
        state.commitMessageDraft = inspCommitInp.value;
      };
      inspCommitInp.onkeydown = (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          saveCurrentDoc();
        }
      };
    }

    const inspCommitBtn = document.getElementById('inspCommitSaveBtn');
    if (inspCommitBtn) inspCommitBtn.onclick = () => saveCurrentDoc();

    const inspOpenHistBtn = document.getElementById('inspOpenHistoryBtn');
    if (inspOpenHistBtn) {
      inspOpenHistBtn.onclick = () => {
        stopPrompter();
        state.docMode = 'history';
        syncBrowserUrl({ replace: true });
        renderScriptsView(container);
        if (state.serverMode && !state.diffResult && !state.selectedRevPreview && state.diffFromRef && state.diffToRef) {
          loadDiffForDoc(activeDoc.path, state.diffFromRef, state.diffToRef);
        }
      };
    }

    container.querySelectorAll('[data-insp-rev]').forEach((btn) => {
      btn.onclick = () => {
        if (!state.serverMode) {
          showToast('Histórico Git requer o servidor local.');
          return;
        }
        stopPrompter();
        state.docMode = 'history';
        syncBrowserUrl({ replace: true });
        loadRevisionPreview(activeDoc.path, btn.dataset.inspRev);
      };
    });

    const inspNewVerBtn = document.getElementById('inspNewVersionBtn');
    if (inspNewVerBtn) inspNewVerBtn.onclick = () => openNewVersionModal(activeDoc);

    container.querySelectorAll('[data-switch-version]').forEach((btn) => {
      btn.onclick = () => {
        const verName = btn.dataset.switchVersion;
        if (verName === state.activeVersion) return;
        if (state.hasUnsavedEdits && !confirm('Você tem alterações não salvas. Descartar e trocar de versão?')) {
          return;
        }
        switchDocVersion(activeDoc.path, verName);
      };
    });

    const goCompareVariant = () => {
      if (!state.serverMode) {
        showToast('Comparação de versões requer o servidor local.');
        return;
      }
      stopPrompter();
      state.docMode = 'history';
      syncBrowserUrl({ replace: true });
      loadDiffForDoc(activeDoc.path, 'ver:principal', `ver:${state.activeVersion}`);
    };

    const varSwitchBtn = document.getElementById('varSwitchPrincipalBtn');
    if (varSwitchBtn) {
      varSwitchBtn.onclick = () => {
        if (state.hasUnsavedEdits && !confirm('Descartar alterações não salvas e voltar para a versão principal?')) return;
        switchDocVersion(activeDoc.path, 'principal');
      };
    }
    const varCmpBtn = document.getElementById('varCompareBtn');
    if (varCmpBtn) varCmpBtn.onclick = goCompareVariant;
    const inspCmpBtn = document.getElementById('inspCompareVarBtn');
    if (inspCmpBtn) inspCmpBtn.onclick = goCompareVariant;

    const varPromBtn = document.getElementById('varPromoteBtn');
    if (varPromBtn) varPromBtn.onclick = () => promoteDocVersion(activeDoc.path, state.activeVersion);
    const inspPromBtn = document.getElementById('inspPromoteVarBtn');
    if (inspPromBtn) inspPromBtn.onclick = () => promoteDocVersion(activeDoc.path, state.activeVersion);

    const varDelBtn = document.getElementById('varDeleteBtn');
    if (varDelBtn) varDelBtn.onclick = () => deleteDocVersion(activeDoc.path, state.activeVersion);

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
        const wsPath = chData.workspacePath || ch.name;
        const activeVer = state.activeVersion || 'principal';
        const prompt = `Leia AGENTS.md e "${activeDoc.path}" no workspace ${wsPath} (canal ${chData.key}). Nunca sobrescreva fora do versionamento Git: após editar, grave com \`./bin/crom-studio roteiro commit --canal ${chData.key} --arquivo "${activeDoc.path}" --versao ${activeVer} --autor "Agente" --msg "Resumo da revisão" --stdin\` (ou crie variante com \`./bin/crom-studio roteiro nova-versao --canal ${chData.key} --arquivo "${activeDoc.path}" --nome "v2-alternativa" --autor "Agente" --stdin\`).`;
        copyText(prompt, 'Prompt Git-safe pronto para colar no agente!');
      };
    }

    const delBtn = document.getElementById('deleteDocBtn');
    if (delBtn) {
      delBtn.onclick = async () => {
        if (!confirm(`Deseja realmente excluir "${activeDoc.path}"?`)) return;
        try {
          await persistDeleteDoc(activeDoc.path);
          state.selectedDocPath = getActiveChannelData().docs[0]?.path || null;
          state.activeVersion = 'principal';
          state.versionHistory = null;
          state.versionFetchedKey = '';
          state.diffResult = null;
          state.dirtyBody = null;
          state.dirtyMeta = null;
          state.hasUnsavedEdits = false;
          state.commitMessageDraft = '';
          updateHeaderChrome();
          renderScriptsView(container);
          showToast('Arquivo excluído.');
        } catch (err) {
          showToast(err.message);
        }
      };
    }

    if (state.docMode === 'history') {
      bindHistoryDiffEvents(activeDoc, container);
    }
    bindPrompterEvents();
  }

  async function saveCurrentDoc() {
    const activeDoc = getActiveDoc();
    if (!activeDoc) return;
    const activeVersion = state.activeVersion || 'principal';
    const commitMessage = (state.commitMessageDraft || '').trim();
    const meta = { ...(state.dirtyMeta || activeDoc.meta) };
    const body = state.dirtyBody !== null ? state.dirtyBody : activeDoc.body;

    let newPath = null;
    if (activeVersion === 'principal' && activeDoc.topFolder === '02-roteiros') {
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
      const finalPath = await persistSaveDoc(activeDoc.path, fullRaw, newPath, {
        version: activeVersion,
        commitMessage,
      });
      state.hasUnsavedEdits = false;
      state.commitMessageDraft = '';
      if (activeVersion === 'principal') {
        state.dirtyBody = null;
        state.dirtyMeta = null;
      } else {
        state.dirtyMeta = meta;
        state.dirtyBody = body;
      }
      state.versionFetchedKey = `${state.activeChannel}::${finalPath}`;
      state.diffResult = null;
      updateHeaderChrome();
      renderCurrentView();
      showToast(
        state.serverMode
          ? activeVersion === 'principal'
            ? `Salvo em ${finalPath}!`
            : `Versão "${activeVersion}" salva no histórico de ${finalPath}!`
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
                    <div class="kanban-card" draggable="true" data-drag-path="${MD.escapeHtml(d.path)}" data-doc-path="${MD.escapeHtml(d.path)}">
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
     VIEW 5: CATÁLOGO YOUTUBE + CURADORIA & PLAYLISTS (v4)
  ========================================================= */
  const CURADORIA_STATUSES = [
    { id: 'pendente', label: 'Pendente' },
    { id: 'assistido', label: 'Assistido' },
    { id: 'reagir', label: 'Para Reagir' },
    { id: 'roteirizado', label: 'Roteirizado' },
    { id: 'arquivado', label: 'Arquivado' },
  ];

  const DEFAULT_CURADORIA_FALLBACK = {
    categories: [
      { id: 'reagir', name: 'Reagir', color: '#f43f5e', icon: '🎬', builtIn: true },
      { id: 'inspiracao', name: 'Inspiração', color: '#8b5cf6', icon: '✨', builtIn: true },
      { id: 'referencia', name: 'Referência Técnica', color: '#06b6d4', icon: '⚙️', builtIn: true },
      { id: 'estudo', name: 'Estudo', color: '#f59e0b', icon: '📚', builtIn: true },
      { id: 'thumb-hook', name: 'Thumb & Hook', color: '#22c55e', icon: '🎯', builtIn: true },
    ],
    playlists: [],
    videoMeta: {},
  };

  function getActiveCuradoria(chData) {
    if (state.catalogCuradoria && state.catalogCuradoriaChannel === chData.key) {
      return state.catalogCuradoria;
    }
    return chData.curadoria || DEFAULT_CURADORIA_FALLBACK;
  }

  async function ensureCatalogCuradoria(channelKey, { force = false } = {}) {
    if (!state.serverMode) return null;
    if (!force && state.catalogCuradoria && state.catalogCuradoriaChannel === channelKey) {
      return state.catalogCuradoria;
    }
    try {
      const res = await fetch(`/api/curadoria?channel=${encodeURIComponent(channelKey)}`, { cache: 'no-store' });
      const json = await res.json();
      if (res.ok && json.curadoria) {
        state.catalogCuradoria = json.curadoria;
        state.catalogCuradoriaChannel = channelKey;
        if (state.view === 'catalog' && state.activeChannel === channelKey) {
          renderCatalogView(document.getElementById('viewContainer'));
        }
      }
      return state.catalogCuradoria;
    } catch {
      return null;
    }
  }

  function applyCuradoriaMutationResponse(json, channelKey) {
    if (json?.curadoria) {
      state.catalogCuradoria = json.curadoria;
      state.catalogCuradoriaChannel = channelKey;
    }
    if (json?.state) {
      state.data = normalizePayload(json.state);
    }
  }

  function openPickPlaylistModal(videoObj) {
    if (!state.serverMode) {
      showToast('Adicionar à playlist requer o servidor local ativo.');
      return;
    }
    const chData = getActiveChannelData();
    const curadoria = getActiveCuradoria(chData);
    const playlists = curadoria.playlists || [];
    const modal = document.getElementById('catalogPlaylistPickModal');
    const body = document.getElementById('catalogPlaylistPickBody');
    if (!modal || !body) return;

    const vidId = videoObj.videoId || videoObj.id;
    body.innerHTML = `
      <div style="font-size:12.5px; color:var(--text-2);">
        Vídeo: <strong style="color:var(--text-1);">${MD.escapeHtml(videoObj.title || vidId)}</strong>
      </div>
      ${playlists.length
        ? `<div class="wb-script-picker-list">
            ${playlists
              .map(
                (pl) => `
                  <button type="button" class="wb-script-picker-item" data-pick-pl="${MD.escapeHtml(pl.id)}">
                    <span>
                      <strong style="color:var(--text-1);">${MD.escapeHtml(pl.title)}</strong>
                      <small style="display:block; color:var(--text-3);">${MD.escapeHtml(pl.kind || 'custom')} • ${(pl.items || []).length} vídeos</small>
                    </span>
                    <span class="btn-sm btn-accent">+ Adicionar</span>
                  </button>
                `
              )
              .join('')}
          </div>`
        : `<p style="margin:0; font-size:12.5px; color:var(--text-3);">Nenhuma playlist criada ainda. Crie uma rapidamente abaixo:</p>`}
      <form id="quickCreatePlInModalForm" style="display:flex; gap:8px; flex-wrap:wrap; padding-top:6px; border-top:1px solid var(--border-soft);">
        <input type="text" id="quickPlTitleInp" placeholder="Nova playlist (ex.: Reagir Agora)" required style="flex:1; min-width:160px;">
        <button type="submit" class="btn-sm btn-accent">Criar & Adicionar</button>
      </form>
    `;

    modal.classList.remove('hidden');

    body.querySelectorAll('[data-pick-pl]').forEach((btn) => {
      btn.onclick = async () => {
        try {
          const res = await fetch('/api/curadoria/playlists/item', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              channel: chData.key,
              playlistId: btn.dataset.pickPl,
              item: {
                videoId: vidId,
                id: vidId,
                title: videoObj.title,
                url: videoObj.url,
                thumbnail: videoObj.thumbnail,
                duration: videoObj.duration || '',
                views: videoObj.views || 0,
                viewsText: videoObj.viewsText || '',
                isShort: videoObj.isShort !== undefined ? Boolean(videoObj.isShort) : videoObj.type === 'short',
              },
            }),
          });
          const json = await res.json();
          if (!res.ok) throw new Error(json.error || 'Erro ao adicionar na playlist');
          applyCuradoriaMutationResponse(json, chData.key);
          modal.classList.add('hidden');
          showToast(`Adicionado à playlist "${json.playlist?.title || ''}"!`);
          if (state.view === 'catalog') renderCatalogView(document.getElementById('viewContainer'));
        } catch (err) {
          showToast(err.message);
        }
      };
    });

    const quickForm = document.getElementById('quickCreatePlInModalForm');
    if (quickForm) {
      quickForm.onsubmit = async (e) => {
        e.preventDefault();
        const title = document.getElementById('quickPlTitleInp')?.value.trim();
        if (!title) return;
        try {
          const res = await fetch('/api/curadoria/playlists', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              channel: chData.key,
              mode: 'manual',
              title,
              kind: 'reagir',
              items: [
                {
                  videoId: vidId,
                  id: vidId,
                  title: videoObj.title,
                  url: videoObj.url,
                  thumbnail: videoObj.thumbnail,
                  duration: videoObj.duration || '',
                  views: videoObj.views || 0,
                  isShort: videoObj.isShort !== undefined ? Boolean(videoObj.isShort) : videoObj.type === 'short',
                },
              ],
            }),
          });
          const json = await res.json();
          if (!res.ok) throw new Error(json.error || 'Erro ao criar playlist');
          applyCuradoriaMutationResponse(json, chData.key);
          modal.classList.add('hidden');
          showToast(`Playlist "${title}" criada com o vídeo!`);
          if (state.view === 'catalog') renderCatalogView(document.getElementById('viewContainer'));
        } catch (err) {
          showToast(err.message);
        }
      };
    }
  }

  function renderCatalogView(container) {
    if (!container) return;
    const chData = getActiveChannelData();
    const channel = chData.channel || {};
    const rawVideos = chData.videos || [];
    const curadoria = getActiveCuradoria(chData);
    const categories = curadoria.categories || DEFAULT_CURADORIA_FALLBACK.categories;
    const playlists = curadoria.playlists || [];
    const videoMetaMap = curadoria.videoMeta || {};

    if (state.serverMode && state.catalogCuradoriaChannel !== chData.key && !state.catalogLoading) {
      state.catalogLoading = true;
      ensureCatalogCuradoria(chData.key, { force: true }).finally(() => {
        state.catalogLoading = false;
      });
    }

    const isVideoShort = (v) => (v.isShort !== undefined ? Boolean(v.isShort) : v.type === 'short');
    const longsCount = rawVideos.filter((v) => !isVideoShort(v)).length;
    const shortsCount = rawVideos.filter((v) => isVideoShort(v)).length;
    const totalVideosCount = Math.max(rawVideos.length, Number(channel.totalVideos || 0));
    const totalViewsCount = rawVideos.reduce((acc, v) => acc + Number(v.views || 0), 0) || Number(channel.totalViews || 0);
    const layoutMode = state.prefs?.catalogLayout === 'grid' ? 'grid' : 'stacked';

    const catMap = new Map(categories.map((c) => [c.id, c]));
    const statusMap = new Map(CURADORIA_STATUSES.map((s) => [s.id, s.label]));

    const upsertMetaRemote = async (videoId, patch, { rerender = false } = {}) => {
      if (!state.serverMode) {
        showToast('Anotações e curadoria exigem o servidor local ativo.');
        return;
      }
      try {
        const res = await fetch('/api/curadoria/video', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ channel: chData.key, videoId, ...patch }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Erro ao salvar curadoria');
        applyCuradoriaMutationResponse(json, chData.key);
        if (rerender && state.view === 'catalog') {
          renderCatalogView(container);
        } else {
          showToast('Curadoria salva!');
        }
      } catch (err) {
        showToast(err.message);
      }
    };

    const triggerCreateCuradoriaScript = async (videoItem, metaNotes = '', playlistId = null) => {
      if (!state.serverMode) {
        showToast('Criar roteiro pela curadoria requer o servidor local ativo.');
        return;
      }
      const vidId = videoItem.videoId || videoItem.id;
      try {
        const res = await fetch('/api/curadoria/create-script', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            channel: chData.key,
            videoId: vidId,
            title: videoItem.title || '',
            url: videoItem.url || '',
            channelName: videoItem.channelName || channel.name || '',
            notes: metaNotes || '',
            serie: 'Reavaliar',
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Erro ao criar roteiro');
        if (playlistId && vidId) {
          await fetch('/api/curadoria/playlists/item', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              channel: chData.key,
              playlistId,
              videoId: vidId,
              linkedDocPath: json.docPath,
              status: 'roteirizado',
            }),
          }).catch(() => {});
        }
        if (json.state) state.data = normalizePayload(json.state);
        state.catalogCuradoriaChannel = '';
        showToast(`Roteiro criado: ${json.docPath}`);
        setView('scripts', json.docPath);
      } catch (err) {
        showToast(err.message);
      }
    };

    let videos = [...rawVideos];
    if (state.catalogFilter === 'long') videos = videos.filter((v) => !isVideoShort(v));
    if (state.catalogFilter === 'short') videos = videos.filter((v) => isVideoShort(v));
    if (state.catalogSearch) {
      const q = state.catalogSearch.toLowerCase();
      videos = videos.filter((v) => {
        const vid = v.videoId || v.id;
        const vm = videoMetaMap[vid] || {};
        return `${v.title} ${v.serie || ''} ${vm.notes || ''}`.toLowerCase().includes(q);
      });
    }
    if (state.catalogCategoryFilter !== 'all') {
      videos = videos.filter((v) => {
        const vid = v.videoId || v.id;
        const vm = videoMetaMap[vid] || {};
        if (state.catalogCategoryFilter === '__none__') return !vm.category;
        return vm.category === state.catalogCategoryFilter;
      });
    }
    if (state.catalogStatusFilter !== 'all') {
      videos = videos.filter((v) => {
        const vid = v.videoId || v.id;
        const vm = videoMetaMap[vid] || {};
        return (vm.status || 'pendente') === state.catalogStatusFilter;
      });
    }

    if (state.catalogSort === 'views') {
      videos.sort((a, b) => Number(b.views || 0) - Number(a.views || 0));
    } else if (state.catalogSort === 'starred') {
      videos.sort((a, b) => {
        const sa = videoMetaMap[a.videoId || a.id]?.starred ? 1 : 0;
        const sb = videoMetaMap[b.videoId || b.id]?.starred ? 1 : 0;
        if (sb !== sa) return sb - sa;
        return String(b.published || '').localeCompare(String(a.published || ''));
      });
    } else {
      videos.sort((a, b) => String(b.published || '').localeCompare(String(a.published || '')));
    }

    const renderVideoItemHtml = (v) => {
      const vidId = v.videoId || v.id;
      const isShort = isVideoShort(v);
      const vm = videoMetaMap[vidId] || {};
      const dateStr = v.published ? formatDatePt(v.published) : (v.publishedText || '—');
      const viewsStr = v.views ? `${formatNumber(v.views)} views` : (v.viewsText || '0 views');
      const curCat = vm.category || '';
      const curStatus = vm.status || 'pendente';
      const linkedDoc = vm.linkedDocPath || (chData.docs || []).find((d) => d.meta.youtube_id === vidId)?.path || '';

      const catOptions = [
        '<option value="">Sem categoria</option>',
        ...categories.map((c) => `<option value="${MD.escapeHtml(c.id)}"${curCat === c.id ? ' selected' : ''}>${MD.escapeHtml(c.icon)} ${MD.escapeHtml(c.name)}</option>`),
      ].join('');
      const stOptions = CURADORIA_STATUSES.map(
        (s) => `<option value="${s.id}"${curStatus === s.id ? ' selected' : ''}>${MD.escapeHtml(s.label)}</option>`
      ).join('');

      if (layoutMode === 'grid') {
        return `
          <article class="glass-card" data-ext-url="${MD.escapeHtml(v.url)}" data-ext-title="${MD.escapeHtml(v.title)}">
            <div class="yt-thumb-wrap">
              <img src="${MD.escapeHtml(v.thumbnail)}" alt="${MD.escapeHtml(v.title)}" loading="lazy" onerror="this.style.opacity='0.15'">
              <span class="yt-type-chip">${isShort ? 'SHORT' : 'LONGO'}</span>
              ${v.duration ? `<span class="cat-dur-chip">${MD.escapeHtml(v.duration)}</span>` : ''}
              <span class="yt-views-chip">${MD.escapeHtml(viewsStr)}</span>
            </div>
            <div style="display:flex; justify-content:space-between; font-size:11px; color:var(--text-3); gap:6px;">
              <span>${MD.escapeHtml(dateStr)}</span>
              <span>${MD.escapeHtml(v.serie || '')}</span>
            </div>
            <h3 class="gc-title" style="font-size:13.5px; line-height:1.4;">${MD.escapeHtml(v.title)}</h3>
            <div class="cat-stack-controls">
              <select class="select-dark" data-vid-cat="${MD.escapeHtml(vidId)}" style="flex:1; min-width:110px;">${catOptions}</select>
              <select class="select-dark" data-vid-status="${MD.escapeHtml(vidId)}" style="flex:1; min-width:100px;">${stOptions}</select>
              <button type="button" class="cat-star-btn${vm.starred ? ' is-starred' : ''}" data-vid-star="${MD.escapeHtml(vidId)}" title="Favoritar">★</button>
            </div>
            <input type="text" class="cat-notes-input" data-vid-notes="${MD.escapeHtml(vidId)}" placeholder="Anotação rápida (Enter/sair salva)..." value="${MD.escapeHtml(vm.notes || '')}">
            <div class="gc-actions">
              <a class="btn-sm btn-accent" href="${MD.escapeHtml(v.url)}" target="_blank" rel="noopener noreferrer">Assistir ↗</a>
              <button type="button" class="btn-sm" data-vid-add-pl="${MD.escapeHtml(vidId)}">+ Playlist</button>
              ${linkedDoc
                ? `<button type="button" class="btn-sm" data-open-doc="${MD.escapeHtml(linkedDoc)}">📄 Abrir Roteiro</button>`
                : `<button type="button" class="btn-sm" data-vid-create-script="${MD.escapeHtml(vidId)}">✎ Criar Roteiro / Reavaliar</button>`}
            </div>
          </article>
        `;
      }

      return `
        <article class="cat-stack-row" data-ext-url="${MD.escapeHtml(v.url)}" data-ext-title="${MD.escapeHtml(v.title)}">
          <div class="cat-stack-thumb">
            <img src="${MD.escapeHtml(v.thumbnail)}" alt="${MD.escapeHtml(v.title)}" loading="lazy" onerror="this.style.opacity='0.15'">
            <span class="yt-type-chip">${isShort ? 'SHORT' : 'LONGO'}</span>
            ${v.duration ? `<span class="cat-dur-chip">${MD.escapeHtml(v.duration)}</span>` : ''}
          </div>
          <div class="cat-stack-body">
            <div class="cat-stack-head">
              <div style="min-width:0; flex:1;">
                <h3 class="cat-stack-title">${MD.escapeHtml(v.title)}</h3>
                <div class="cat-stack-meta">
                  <span>${MD.escapeHtml(dateStr)}</span>
                  <span>•</span>
                  <strong style="color:var(--text-2);">${MD.escapeHtml(viewsStr)}</strong>
                  ${v.serie ? `<span>•</span><span>${MD.escapeHtml(v.serie)}</span>` : ''}
                  ${curCat && catMap.get(curCat) ? `<span class="cat-tag-chip" style="padding:1px 8px; font-size:10.5px; border-color:${MD.escapeHtml(catMap.get(curCat).color)}66;">${MD.escapeHtml(catMap.get(curCat).icon)} ${MD.escapeHtml(catMap.get(curCat).name)}</span>` : ''}
                </div>
              </div>
              <button type="button" class="cat-star-btn${vm.starred ? ' is-starred' : ''}" data-vid-star="${MD.escapeHtml(vidId)}" title="Favoritar vídeo">★</button>
            </div>
            <div class="cat-stack-controls">
              <select class="select-dark" data-vid-cat="${MD.escapeHtml(vidId)}">${catOptions}</select>
              <select class="select-dark" data-vid-status="${MD.escapeHtml(vidId)}">${stOptions}</select>
              <input type="text" class="cat-notes-input" data-vid-notes="${MD.escapeHtml(vidId)}" placeholder="Anotação rápida sobre gancho, corte ou reação..." value="${MD.escapeHtml(vm.notes || '')}">
            </div>
            <div style="display:flex; align-items:center; gap:7px; flex-wrap:wrap;">
              <a class="btn-sm btn-accent" href="${MD.escapeHtml(v.url)}" target="_blank" rel="noopener noreferrer">Assistir ↗</a>
              <button type="button" class="btn-sm" data-vid-add-pl="${MD.escapeHtml(vidId)}">+ Playlist</button>
              <button type="button" class="btn-sm" data-vid-create-script="${MD.escapeHtml(vidId)}">✎ Criar Roteiro / Reavaliar</button>
              ${linkedDoc ? `<button type="button" class="btn-sm" data-open-doc="${MD.escapeHtml(linkedDoc)}">📄 Abrir Roteiro</button>` : ''}
              <button type="button" class="btn-sm" data-postmortem-for="${MD.escapeHtml(vidId)}">Post-Mortem</button>
            </div>
          </div>
        </article>
      `;
    };

    let mainBodyHtml = '';
    if (state.catalogSubTab === 'playlists') {
      mainBodyHtml = `
        <div class="cat-playlists-layout">
          <div class="cat-panels-row">
            <div class="glass-card">
              <h3 class="gc-title">Criar Playlist de Curadoria</h3>
              <form id="catCreatePlaylistForm" style="display:flex; flex-direction:column; gap:8px;">
                <div class="form-row-2">
                  <input type="text" class="search-box-sm" id="catPlTitleInp" placeholder="Nome (ex.: Reagir Tech BR)" required style="margin:0;">
                  <select class="select-dark" id="catPlKindSel">
                    <option value="reagir">🎬 Reagir</option>
                    <option value="inspiracao">✨ Inspiração</option>
                    <option value="referencia">⚙️ Referência Técnica</option>
                    <option value="estudo">📚 Estudo</option>
                    <option value="custom">📁 Customizada</option>
                  </select>
                </div>
                <input type="text" class="search-box-sm" id="catPlDescInp" placeholder="Descrição / critério de curadoria (opcional)" style="margin:0;">
                <div><button type="submit" class="btn-sm btn-accent">+ Criar Playlist</button></div>
              </form>
            </div>

            <div class="glass-card">
              <h3 class="gc-title">Importar Playlist do YouTube</h3>
              <form id="catImportPlaylistForm" style="display:flex; flex-direction:column; gap:8px;">
                <input type="text" class="search-box-sm" id="catImportPlUrlInp" placeholder="Cole URL ou ID (ex.: https://youtube.com/playlist?list=PL...)" required style="margin:0;">
                <div class="form-row-2">
                  <input type="text" class="search-box-sm" id="catImportPlTitleInp" placeholder="Nome personalizado (opcional)" style="margin:0;">
                  <select class="select-dark" id="catImportPlKindSel">
                    <option value="reagir">🎬 Reagir</option>
                    <option value="inspiracao">✨ Inspiração</option>
                    <option value="referencia">⚙️ Referência Técnica</option>
                    <option value="estudo">📚 Estudo</option>
                  </select>
                </div>
                <div><button type="submit" class="btn-sm btn-accent">⤓ Importar Playlist Pública</button></div>
              </form>
            </div>
          </div>

          <div class="glass-card">
            <div class="gc-top">
              <h3 class="gc-title">Categorias Customizadas (${categories.length})</h3>
            </div>
            <div class="cat-chip-row">
              ${categories
                .map(
                  (c) => `
                    <span class="cat-tag-chip" style="border-color:${MD.escapeHtml(c.color)}66;">
                      <span>${MD.escapeHtml(c.icon)}</span>
                      <span>${MD.escapeHtml(c.name)}</span>
                      ${!c.builtIn ? `<button type="button" class="cat-tag-del" data-del-cat="${MD.escapeHtml(c.id)}" title="Remover categoria">✕</button>` : ''}
                    </span>
                  `
                )
                .join('')}
            </div>
            <form id="catAddCategoryForm" style="display:flex; gap:8px; flex-wrap:wrap; align-items:center; margin-top:4px;">
              <input type="text" class="search-box-sm" id="catNewCatIcon" value="🏷️" style="width:52px; margin:0; text-align:center;" title="Ícone">
              <input type="text" class="search-box-sm" id="catNewCatName" placeholder="Nova categoria..." required style="flex:1; min-width:150px; margin:0;">
              <input type="color" id="catNewCatColor" value="#38bdf8" style="width:36px; height:32px; border:none; background:none; padding:0;" title="Cor">
              <button type="submit" class="btn-sm">+ Adicionar Categoria</button>
            </form>
          </div>

          ${playlists.length
            ? playlists
                .map((pl) => {
                  const items = pl.items || [];
                  const expanded = state.catalogExpandedPlaylistId === pl.id || playlists.length === 1;
                  return `
                    <section class="cat-playlist-card">
                      <div class="cat-playlist-head">
                        <div style="min-width:0; flex:1;">
                          <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                            <strong style="font-size:15px;">${MD.escapeHtml(pl.title)}</strong>
                            <span class="status-pill st-roteiro">${MD.escapeHtml(pl.kind || 'custom')}</span>
                            <span class="kanban-count">${items.length} vídeos</span>
                          </div>
                          ${pl.description ? `<div style="font-size:12px; color:var(--text-3); margin-top:3px;">${MD.escapeHtml(pl.description)}</div>` : ''}
                        </div>
                        <div style="display:flex; align-items:center; gap:7px; flex-wrap:wrap;">
                          ${pl.sourceUrl ? `<a class="btn-sm" href="${MD.escapeHtml(pl.sourceUrl)}" target="_blank" rel="noopener noreferrer">YouTube ↗</a>` : ''}
                          <button type="button" class="btn-sm" data-toggle-pl="${MD.escapeHtml(pl.id)}">${expanded ? '▾ Recolher' : '▸ Expandir'}</button>
                          <button type="button" class="btn-sm btn-danger" data-del-pl="${MD.escapeHtml(pl.id)}">Excluir</button>
                        </div>
                      </div>

                      ${expanded
                        ? `
                          <form class="cat-add-pl-item-form" data-pl-add-form="${MD.escapeHtml(pl.id)}" style="display:flex; gap:8px; flex-wrap:wrap; padding-top:6px; border-top:1px solid var(--border-soft);">
                            <input type="text" class="search-box-sm" data-pl-url-input="${MD.escapeHtml(pl.id)}" placeholder="Adicionar vídeo avulso por URL ou ID (youtube.com/watch?v=..., /shorts/...)..." required style="flex:1; min-width:220px; margin:0;">
                            <button type="submit" class="btn-sm btn-accent">+ Adicionar Vídeo</button>
                          </form>
                          <div class="cat-stacked-list">
                            ${items.length
                              ? items
                                  .map((it) => {
                                    const vid = it.videoId || it.id;
                                    const stOpts = CURADORIA_STATUSES.map(
                                      (s) => `<option value="${s.id}"${(it.status || 'pendente') === s.id ? ' selected' : ''}>${MD.escapeHtml(s.label)}</option>`
                                    ).join('');
                                    const catOpts = [
                                      '<option value="">Sem categoria</option>',
                                      ...categories.map((c) => `<option value="${MD.escapeHtml(c.id)}"${it.category === c.id ? ' selected' : ''}>${MD.escapeHtml(c.icon)} ${MD.escapeHtml(c.name)}</option>`),
                                    ].join('');
                                    return `
                                      <article class="cat-stack-row" data-ext-url="${MD.escapeHtml(it.url)}" data-ext-title="${MD.escapeHtml(it.title)}">
                                        <div class="cat-stack-thumb">
                                          <img src="${MD.escapeHtml(it.thumbnail)}" alt="${MD.escapeHtml(it.title)}" loading="lazy" onerror="this.style.opacity='0.15'">
                                          <span class="yt-type-chip">${it.isShort ? 'SHORT' : 'VÍDEO'}</span>
                                          ${it.duration ? `<span class="cat-dur-chip">${MD.escapeHtml(it.duration)}</span>` : ''}
                                        </div>
                                        <div class="cat-stack-body">
                                          <div class="cat-stack-head">
                                            <div style="min-width:0; flex:1;">
                                              <h4 class="cat-stack-title">${MD.escapeHtml(it.title)}</h4>
                                              <div class="cat-stack-meta">
                                                ${it.channelName ? `<span>${MD.escapeHtml(it.channelName)}</span><span>•</span>` : ''}
                                                <span>${it.views ? `${formatNumber(it.views)} views` : (it.viewsText || 'Link salvo')}</span>
                                              </div>
                                            </div>
                                          </div>
                                          <div class="cat-stack-controls">
                                            <select class="select-dark" data-pl-item-cat="${MD.escapeHtml(pl.id)}::${MD.escapeHtml(vid)}">${catOpts}</select>
                                            <select class="select-dark" data-pl-item-status="${MD.escapeHtml(pl.id)}::${MD.escapeHtml(vid)}">${stOpts}</select>
                                            <input type="text" class="cat-notes-input" data-pl-item-notes="${MD.escapeHtml(pl.id)}::${MD.escapeHtml(vid)}" placeholder="Notas para reação / roteiro..." value="${MD.escapeHtml(it.notes || '')}">
                                          </div>
                                          <div style="display:flex; gap:7px; flex-wrap:wrap;">
                                            <a class="btn-sm btn-accent" href="${MD.escapeHtml(it.url)}" target="_blank" rel="noopener noreferrer">Assistir ↗</a>
                                            <button type="button" class="btn-sm" data-pl-create-script="${MD.escapeHtml(pl.id)}::${MD.escapeHtml(vid)}">✎ Criar Roteiro / Reavaliar</button>
                                            ${it.linkedDocPath ? `<button type="button" class="btn-sm" data-open-doc="${MD.escapeHtml(it.linkedDocPath)}">📄 Abrir Roteiro</button>` : ''}
                                            <button type="button" class="btn-sm btn-danger" data-pl-rem-item="${MD.escapeHtml(pl.id)}::${MD.escapeHtml(vid)}">Remover</button>
                                          </div>
                                        </div>
                                      </article>
                                    `;
                                  })
                                  .join('')
                              : '<p style="margin:6px 0; font-size:12.5px; color:var(--text-3);">Playlist vazia. Cole uma URL de vídeo acima para adicionar.</p>'}
                          </div>
                        `
                        : ''}
                    </section>
                  `;
                })
                .join('')
            : '<div class="glass-card"><p style="margin:0; color:var(--text-3);">Nenhuma playlist de curadoria criada ou importada ainda.</p></div>'}
        </div>
      `;
    } else {
      const renderCollection = (list) => {
        if (!list.length) {
          return '<div class="glass-card"><p style="margin:0; color:var(--text-3);">Nenhum vídeo encontrado com os filtros atuais.</p></div>';
        }
        if (layoutMode === 'grid') {
          return `<div class="cards-grid-3">${list.map(renderVideoItemHtml).join('')}</div>`;
        }
        return `<div class="cat-stacked-list">${list.map(renderVideoItemHtml).join('')}</div>`;
      };

      if (state.catalogGroupBy && state.catalogGroupBy !== 'none') {
        const groups = new Map();
        for (const v of videos) {
          const vid = v.videoId || v.id;
          const vm = videoMetaMap[vid] || {};
          let keyLabel = 'Outros';
          if (state.catalogGroupBy === 'category') {
            keyLabel = vm.category ? `${catMap.get(vm.category)?.icon || '🏷️'} ${catMap.get(vm.category)?.name || vm.category}` : 'Sem Categoria';
          } else if (state.catalogGroupBy === 'type') {
            keyLabel = isVideoShort(v) ? 'Shorts' : 'Vídeos Longos';
          } else if (state.catalogGroupBy === 'status') {
            keyLabel = statusMap.get(vm.status || 'pendente') || 'Pendente';
          } else if (state.catalogGroupBy === 'year') {
            const yr = String(v.published || '').slice(0, 4);
            keyLabel = /^\d{4}$/.test(yr) ? yr : 'Sem Data Exata';
          }
          if (!groups.has(keyLabel)) groups.set(keyLabel, []);
          groups.get(keyLabel).push(v);
        }
        mainBodyHtml = Array.from(groups.entries())
          .map(
            ([label, list]) => `
              <div class="cat-group-header">
                <span>${MD.escapeHtml(label)}</span>
                <span class="kanban-count">${list.length}</span>
              </div>
              ${renderCollection(list)}
            `
          )
          .join('');
      } else {
        mainBodyHtml = renderCollection(videos);
      }
    }

    container.innerHTML = `
      <div class="cat-kpi-bar">
        <div class="cat-kpi-pill">
          <span>Total de Vídeos</span>
          <strong>${formatNumber(totalVideosCount)}</strong>
        </div>
        <div class="cat-kpi-pill">
          <span>Vídeos Longos</span>
          <strong>${formatNumber(longsCount)}</strong>
        </div>
        <div class="cat-kpi-pill">
          <span>Shorts</span>
          <strong>${formatNumber(shortsCount)}</strong>
        </div>
        <div class="cat-kpi-pill">
          <span>Views Somadas</span>
          <strong>${formatNumber(totalViewsCount)}</strong>
        </div>
        <div class="cat-kpi-pill">
          <span>Playlists Curadoria</span>
          <strong>${formatNumber(playlists.length)}</strong>
        </div>
      </div>

      <div class="section-subhead">
        <div class="mode-switch" id="catalogSubTabSwitch">
          <button type="button" class="${state.catalogSubTab === 'videos' ? 'active' : ''}" data-cat-tab="videos">Vídeos do Canal (${rawVideos.length})</button>
          <button type="button" class="${state.catalogSubTab === 'playlists' ? 'active' : ''}" data-cat-tab="playlists">Playlists & Curadoria (${playlists.length})</button>
        </div>

        <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
          <button type="button" class="btn-sm" id="openCatalogDocBtn">Abrir catalogo-youtube.md</button>
          <button type="button" class="btn-sm btn-accent" id="syncYoutubeBtn">⟳ Sincronizar Canal Agora (${MD.escapeHtml(channel.handle || chData.key)})</button>
        </div>
      </div>

      ${state.catalogSubTab === 'videos'
        ? `
          <div class="cat-toolbar">
            <div class="cat-toolbar-group">
              <div class="mode-switch" id="catalogTypeSwitch">
                <button type="button" class="${state.catalogFilter === 'all' ? 'active' : ''}" data-cf="all">Todos (${rawVideos.length})</button>
                <button type="button" class="${state.catalogFilter === 'long' ? 'active' : ''}" data-cf="long">Longos (${longsCount})</button>
                <button type="button" class="${state.catalogFilter === 'short' ? 'active' : ''}" data-cf="short">Shorts (${shortsCount})</button>
              </div>
              <input type="search" class="search-box-sm" id="catalogSearchInput" placeholder="Buscar por título, série ou nota..." value="${MD.escapeHtml(state.catalogSearch)}" style="width:210px; margin:0; height:32px;">
              <select class="select-dark" id="catalogCatFilterSel" title="Filtrar por Categoria">
                <option value="all"${state.catalogCategoryFilter === 'all' ? ' selected' : ''}>Todas Categorias</option>
                <option value="__none__"${state.catalogCategoryFilter === '__none__' ? ' selected' : ''}>Sem Categoria</option>
                ${categories.map((c) => `<option value="${MD.escapeHtml(c.id)}"${state.catalogCategoryFilter === c.id ? ' selected' : ''}>${MD.escapeHtml(c.icon)} ${MD.escapeHtml(c.name)}</option>`).join('')}
              </select>
              <select class="select-dark" id="catalogStatusFilterSel" title="Filtrar por Status">
                <option value="all"${state.catalogStatusFilter === 'all' ? ' selected' : ''}>Todos Status</option>
                ${CURADORIA_STATUSES.map((s) => `<option value="${s.id}"${state.catalogStatusFilter === s.id ? ' selected' : ''}>${MD.escapeHtml(s.label)}</option>`).join('')}
              </select>
            </div>

            <div class="cat-toolbar-group">
              <select class="select-dark" id="catalogSortSel" title="Ordenação">
                <option value="date"${state.catalogSort === 'date' ? ' selected' : ''}>Mais recentes</option>
                <option value="views"${state.catalogSort === 'views' ? ' selected' : ''}>Mais visualizações</option>
                <option value="starred"${state.catalogSort === 'starred' ? ' selected' : ''}>Favoritos primeiro</option>
              </select>
              <select class="select-dark" id="catalogGroupBySel" title="Agrupar por">
                <option value="none"${state.catalogGroupBy === 'none' ? ' selected' : ''}>Agrupar: Nenhum</option>
                <option value="category"${state.catalogGroupBy === 'category' ? ' selected' : ''}>Agrupar: Categoria</option>
                <option value="type"${state.catalogGroupBy === 'type' ? ' selected' : ''}>Agrupar: Tipo (Long/Short)</option>
                <option value="status"${state.catalogGroupBy === 'status' ? ' selected' : ''}>Agrupar: Status</option>
                <option value="year"${state.catalogGroupBy === 'year' ? ' selected' : ''}>Agrupar: Ano</option>
              </select>
              <div class="mode-switch" id="catalogLayoutSwitch">
                <button type="button" class="${layoutMode === 'stacked' ? 'active' : ''}" data-cat-layout="stacked">☰ Lista Empilhada</button>
                <button type="button" class="${layoutMode === 'grid' ? 'active' : ''}" data-cat-layout="grid">▦ Grade</button>
              </div>
            </div>
          </div>
        `
        : ''}

      ${mainBodyHtml}
    `;

    container.querySelectorAll('#catalogSubTabSwitch button').forEach((btn) => {
      btn.onclick = () => {
        state.catalogSubTab = btn.dataset.catTab;
        renderCatalogView(container);
      };
    });

    document.getElementById('openCatalogDocBtn').onclick = () => setView('scripts', '00-canal/catalogo-youtube.md');

    document.getElementById('syncYoutubeBtn').onclick = async () => {
      if (!state.serverMode) {
        showToast('Para sincronizar o canal completo ao vivo, inicie o servidor local.');
        return;
      }
      showToast(`Sincronizando catálogo completo de ${channel.handle || chData.key}...`);
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
        showToast(json.warning || `Sincronizado! ${json.updatedCount} vídeos no catálogo.`);
      } catch (err) {
        showToast(`Falha na sincronização: ${err.message}`);
      }
    };

    if (state.catalogSubTab === 'videos') {
      container.querySelectorAll('#catalogTypeSwitch button').forEach((btn) => {
        btn.onclick = () => {
          state.catalogFilter = btn.dataset.cf;
          renderCatalogView(container);
        };
      });
      const searchEl = document.getElementById('catalogSearchInput');
      if (searchEl) {
        searchEl.oninput = () => {
          state.catalogSearch = searchEl.value;
          const pos = searchEl.selectionStart;
          renderCatalogView(container);
          const again = document.getElementById('catalogSearchInput');
          if (again) {
            again.focus();
            again.setSelectionRange(pos, pos);
          }
        };
      }
      document.getElementById('catalogCatFilterSel').onchange = (e) => {
        state.catalogCategoryFilter = e.target.value;
        renderCatalogView(container);
      };
      document.getElementById('catalogStatusFilterSel').onchange = (e) => {
        state.catalogStatusFilter = e.target.value;
        renderCatalogView(container);
      };
      document.getElementById('catalogSortSel').onchange = (e) => {
        state.catalogSort = e.target.value;
        renderCatalogView(container);
      };
      document.getElementById('catalogGroupBySel').onchange = (e) => {
        state.catalogGroupBy = e.target.value;
        renderCatalogView(container);
      };
      container.querySelectorAll('#catalogLayoutSwitch button').forEach((btn) => {
        btn.onclick = () => {
          const next = btn.dataset.catLayout === 'grid' ? 'grid' : 'stacked';
          state.prefs = { ...(state.prefs || {}), catalogLayout: next };
          const saved = loadJsonStorage(STORAGE_KEY_PREFS, {});
          saved.catalogLayout = next;
          saveJsonStorage(STORAGE_KEY_PREFS, saved);
          renderCatalogView(container);
        };
      });

      container.querySelectorAll('[data-vid-cat]').forEach((sel) => {
        sel.onchange = () => upsertMetaRemote(sel.dataset.vidCat, { category: sel.value }, { rerender: state.catalogGroupBy === 'category' });
      });
      container.querySelectorAll('[data-vid-status]').forEach((sel) => {
        sel.onchange = () => upsertMetaRemote(sel.dataset.vidStatus, { status: sel.value }, { rerender: state.catalogGroupBy === 'status' });
      });
      container.querySelectorAll('[data-vid-star]').forEach((btn) => {
        btn.onclick = () => {
          const vidId = btn.dataset.vidStar;
          const nextStar = !videoMetaMap[vidId]?.starred;
          upsertMetaRemote(vidId, { starred: nextStar }, { rerender: true });
        };
      });
      container.querySelectorAll('[data-vid-notes]').forEach((inp) => {
        const commitNotes = () => {
          const vidId = inp.dataset.vidNotes;
          const prev = videoMetaMap[vidId]?.notes || '';
          if (inp.value !== prev) {
            upsertMetaRemote(vidId, { notes: inp.value });
          }
        };
        inp.onchange = commitNotes;
        inp.onkeydown = (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            inp.blur();
          }
        };
      });
      container.querySelectorAll('[data-vid-add-pl]').forEach((btn) => {
        btn.onclick = () => {
          const vidId = btn.dataset.vidAddPl;
          const vid = rawVideos.find((x) => (x.videoId || x.id) === vidId);
          if (vid) openPickPlaylistModal(vid);
        };
      });
      container.querySelectorAll('[data-vid-create-script]').forEach((btn) => {
        btn.onclick = () => {
          const vidId = btn.dataset.vidCreateScript;
          const vid = rawVideos.find((x) => (x.videoId || x.id) === vidId);
          if (vid) triggerCreateCuradoriaScript(vid, videoMetaMap[vidId]?.notes || '');
        };
      });
      container.querySelectorAll('[data-open-doc]').forEach((btn) => {
        btn.onclick = () => setView('scripts', btn.dataset.openDoc);
      });
      container.querySelectorAll('[data-postmortem-for]').forEach((btn) => {
        btn.onclick = () => {
          const vidId = btn.dataset.postmortemFor;
          const vid = rawVideos.find((x) => (x.videoId || x.id) === vidId);
          const existing = (chData.docs || []).find((d) => d.meta.youtube_id === vidId);
          if (existing) {
            setView('scripts', existing.path);
          } else if (vid) {
            openNewDocModal({
              type: 'post-mortem',
              folder: '02-roteiros/publicados',
              title: `Post-Mortem: ${vid.title}`,
              serie: vid.serie,
              summary: `Análise do vídeo ${vidId} (${vid.views} views, publicado em ${vid.published}).`,
            });
          }
        };
      });
    } else {
      const createPlForm = document.getElementById('catCreatePlaylistForm');
      if (createPlForm) {
        createPlForm.onsubmit = async (e) => {
          e.preventDefault();
          if (!state.serverMode) return showToast('Requer servidor local ativo.');
          const title = document.getElementById('catPlTitleInp')?.value.trim();
          const kind = document.getElementById('catPlKindSel')?.value || 'custom';
          const description = document.getElementById('catPlDescInp')?.value.trim() || '';
          try {
            const res = await fetch('/api/curadoria/playlists', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ channel: chData.key, mode: 'manual', title, kind, description }),
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || 'Erro ao criar playlist');
            applyCuradoriaMutationResponse(json, chData.key);
            state.catalogExpandedPlaylistId = json.playlist?.id || null;
            renderCatalogView(container);
            showToast(`Playlist "${title}" criada!`);
          } catch (err) {
            showToast(err.message);
          }
        };
      }

      const importPlForm = document.getElementById('catImportPlaylistForm');
      if (importPlForm) {
        importPlForm.onsubmit = async (e) => {
          e.preventDefault();
          if (!state.serverMode) return showToast('Requer servidor local ativo.');
          const urlOrId = document.getElementById('catImportPlUrlInp')?.value.trim();
          const title = document.getElementById('catImportPlTitleInp')?.value.trim() || undefined;
          const kind = document.getElementById('catImportPlKindSel')?.value || 'reagir';
          showToast('Importando playlist do YouTube...');
          try {
            const res = await fetch('/api/curadoria/playlists', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ channel: chData.key, mode: 'import', urlOrId, title, kind }),
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || 'Erro ao importar playlist');
            applyCuradoriaMutationResponse(json, chData.key);
            state.catalogExpandedPlaylistId = json.playlist?.id || null;
            renderCatalogView(container);
            showToast(`Playlist "${json.playlist?.title || ''}" importada (${(json.playlist?.items || []).length} vídeos)!`);
          } catch (err) {
            showToast(err.message);
          }
        };
      }

      const addCatForm = document.getElementById('catAddCategoryForm');
      if (addCatForm) {
        addCatForm.onsubmit = async (e) => {
          e.preventDefault();
          if (!state.serverMode) return showToast('Requer servidor local ativo.');
          const name = document.getElementById('catNewCatName')?.value.trim();
          const icon = document.getElementById('catNewCatIcon')?.value.trim() || '🏷️';
          const color = document.getElementById('catNewCatColor')?.value || '#38bdf8';
          try {
            const res = await fetch('/api/curadoria/categories', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ channel: chData.key, name, icon, color }),
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || 'Erro ao criar categoria');
            applyCuradoriaMutationResponse(json, chData.key);
            renderCatalogView(container);
            showToast(`Categoria "${name}" salva!`);
          } catch (err) {
            showToast(err.message);
          }
        };
      }

      container.querySelectorAll('[data-del-cat]').forEach((btn) => {
        btn.onclick = async () => {
          if (!state.serverMode) return;
          try {
            const res = await fetch(`/api/curadoria/categories?channel=${encodeURIComponent(chData.key)}&id=${encodeURIComponent(btn.dataset.delCat)}`, {
              method: 'DELETE',
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || 'Erro ao remover categoria');
            applyCuradoriaMutationResponse(json, chData.key);
            renderCatalogView(container);
          } catch (err) {
            showToast(err.message);
          }
        };
      });

      container.querySelectorAll('[data-toggle-pl]').forEach((btn) => {
        btn.onclick = () => {
          const plId = btn.dataset.togglePl;
          state.catalogExpandedPlaylistId = state.catalogExpandedPlaylistId === plId ? null : plId;
          renderCatalogView(container);
        };
      });

      container.querySelectorAll('[data-del-pl]').forEach((btn) => {
        btn.onclick = async () => {
          if (!state.serverMode) return;
          if (!confirm('Remover esta playlist de curadoria?')) return;
          try {
            const res = await fetch(`/api/curadoria/playlists?channel=${encodeURIComponent(chData.key)}&id=${encodeURIComponent(btn.dataset.delPl)}`, {
              method: 'DELETE',
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || 'Erro ao excluir playlist');
            applyCuradoriaMutationResponse(json, chData.key);
            renderCatalogView(container);
            showToast('Playlist removida.');
          } catch (err) {
            showToast(err.message);
          }
        };
      });

      container.querySelectorAll('[data-pl-add-form]').forEach((form) => {
        form.onsubmit = async (e) => {
          e.preventDefault();
          if (!state.serverMode) return showToast('Requer servidor local ativo.');
          const playlistId = form.dataset.plAddForm;
          const urlOrId = form.querySelector(`[data-pl-url-input="${playlistId}"]`)?.value.trim();
          if (!urlOrId) return;
          showToast('Buscando metadados do vídeo...');
          try {
            const res = await fetch('/api/curadoria/playlists/item', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ channel: chData.key, playlistId, urlOrId }),
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || 'Erro ao adicionar vídeo');
            applyCuradoriaMutationResponse(json, chData.key);
            renderCatalogView(container);
            showToast(`Adicionado: ${json.addedItem?.title || urlOrId}`);
          } catch (err) {
            showToast(err.message);
          }
        };
      });

      const updatePlItem = async (pairStr, patch) => {
        if (!state.serverMode) return;
        const [playlistId, videoId] = pairStr.split('::');
        try {
          const res = await fetch('/api/curadoria/playlists/item', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ channel: chData.key, playlistId, videoId, ...patch }),
          });
          const json = await res.json();
          if (!res.ok) throw new Error(json.error || 'Erro ao atualizar item');
          applyCuradoriaMutationResponse(json, chData.key);
          showToast('Item atualizado!');
        } catch (err) {
          showToast(err.message);
        }
      };

      container.querySelectorAll('[data-pl-item-cat]').forEach((sel) => {
        sel.onchange = () => updatePlItem(sel.dataset.plItemCat, { category: sel.value });
      });
      container.querySelectorAll('[data-pl-item-status]').forEach((sel) => {
        sel.onchange = () => updatePlItem(sel.dataset.plItemStatus, { status: sel.value });
      });
      container.querySelectorAll('[data-pl-item-notes]').forEach((inp) => {
        inp.onchange = () => updatePlItem(inp.dataset.plItemNotes, { notes: inp.value });
      });
      container.querySelectorAll('[data-pl-create-script]').forEach((btn) => {
        btn.onclick = () => {
          const [playlistId, videoId] = btn.dataset.plCreateScript.split('::');
          const pl = playlists.find((p) => p.id === playlistId);
          const item = (pl?.items || []).find((it) => (it.videoId || it.id) === videoId);
          if (item) triggerCreateCuradoriaScript(item, item.notes || '', playlistId);
        };
      });
      container.querySelectorAll('[data-open-doc]').forEach((btn) => {
        btn.onclick = () => setView('scripts', btn.dataset.openDoc);
      });
      container.querySelectorAll('[data-pl-rem-item]').forEach((btn) => {
        btn.onclick = async () => {
          if (!state.serverMode) return;
          const [playlistId, videoId] = btn.dataset.plRemItem.split('::');
          try {
            const res = await fetch(
              `/api/curadoria/playlists/item?channel=${encodeURIComponent(chData.key)}&playlistId=${encodeURIComponent(playlistId)}&videoId=${encodeURIComponent(videoId)}`,
              { method: 'DELETE' }
            );
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || 'Erro ao remover item');
            applyCuradoriaMutationResponse(json, chData.key);
            renderCatalogView(container);
          } catch (err) {
            showToast(err.message);
          }
        };
      });
    }
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
     VIEW 6B: ESTÚDIO DE GRAVAÇÃO MULTI-TRACK (v4)
  ========================================================= */
  const recRuntime = {
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

  function stopStreamTracks(stream) {
    if (!stream) return;
    try {
      stream.getTracks().forEach((t) => t.stop());
    } catch {
      // ignora
    }
  }

  function stopRecorderMediaStreams() {
    if (recRuntime.vuRafId) {
      cancelAnimationFrame(recRuntime.vuRafId);
      recRuntime.vuRafId = null;
    }
    if (recRuntime.canvasRafId) {
      cancelAnimationFrame(recRuntime.canvasRafId);
      recRuntime.canvasRafId = null;
    }
    if (state.recorder.timerId) {
      clearInterval(state.recorder.timerId);
      state.recorder.timerId = null;
    }
    if (state.recorder.prompterRafId) {
      cancelAnimationFrame(state.recorder.prompterRafId);
      state.recorder.prompterRafId = null;
    }
    state.recorder.prompterPlaying = false;
    stopStreamTracks(recRuntime.screenStream);
    stopStreamTracks(recRuntime.camStream);
    stopStreamTracks(recRuntime.micStream);
    recRuntime.screenStream = null;
    recRuntime.camStream = null;
    recRuntime.micStream = null;
    if (recRuntime.audioCtx) {
      try {
        recRuntime.audioCtx.close();
      } catch {
        // ignora
      }
      recRuntime.audioCtx = null;
      recRuntime.analyser = null;
    }
    state.recorder.micLevel = 0;
  }

  async function refreshRecorderDevices() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      state.recorder.devices = {
        cameras: devices.filter((d) => d.kind === 'videoinput'),
        mics: devices.filter((d) => d.kind === 'audioinput'),
      };
      if (!state.recorder.selectedCamId && state.recorder.devices.cameras[0]) {
        state.recorder.selectedCamId = state.recorder.devices.cameras[0].deviceId;
      }
      if (!state.recorder.selectedMicId && state.recorder.devices.mics[0]) {
        state.recorder.selectedMicId = state.recorder.devices.mics[0].deviceId;
      }
    } catch {
      // Navegador bloqueou enumeração sem permissão prévia
    }
  }

  async function loadRecordingsLibrary(channelKey, { rerender = true } = {}) {
    if (!state.serverMode) return;
    state.recorder.loading = true;
    try {
      const res = await fetch(`/api/recordings?channel=${encodeURIComponent(channelKey)}`, { cache: 'no-store' });
      const json = await res.json();
      if (res.ok) {
        state.recorder.sessions = Array.isArray(json.sessions) ? json.sessions : [];
        state.recorder.ffmpegAvailable = Boolean(json.ffmpegAvailable);
        state.recorder.recordingsDir = json.recordingsDir || '';
        state.recorder.sessionsChannel = channelKey;
      }
    } catch {
      // mantém estado atual
    } finally {
      state.recorder.loading = false;
      if (rerender && state.view === 'recorder' && state.activeChannel === channelKey) {
        renderRecorderLibrarySection();
      }
    }
  }

  function formatRecTimer(totalSec) {
    const mins = Math.floor(totalSec / 60);
    const secs = Math.floor(totalSec % 60);
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  function formatBytesCompact(bytes) {
    const b = Number(bytes || 0);
    if (b < 1024) return `${b} B`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
    return `${(b / (1024 * 1024)).toFixed(1)} MB`;
  }

  function pickRecorderMime(kind) {
    if (!global.MediaRecorder || typeof MediaRecorder.isTypeSupported !== 'function') return '';
    const candidates =
      kind === 'audio'
        ? ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus']
        : ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
    return candidates.find((m) => MediaRecorder.isTypeSupported(m)) || '';
  }

  function startMicVuLoop(micStream) {
    if (!micStream || !micStream.getAudioTracks().length) return;
    const AudioCtx = global.AudioContext || global.webkitAudioContext;
    if (!AudioCtx) return;
    try {
      if (recRuntime.audioCtx) recRuntime.audioCtx.close().catch(() => {});
      const ctx = new AudioCtx();
      const src = ctx.createMediaStreamSource(micStream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      src.connect(analyser);
      recRuntime.audioCtx = ctx;
      recRuntime.analyser = analyser;

      const dataArr = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        if (!recRuntime.analyser || state.view !== 'recorder') return;
        analyser.getByteTimeDomainData(dataArr);
        let sum = 0;
        for (let i = 0; i < dataArr.length; i++) {
          const v = (dataArr[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / dataArr.length);
        const pct = Math.min(100, Math.round(rms * 260));
        state.recorder.micLevel = pct;
        const bar = document.getElementById('recVuFill');
        const lbl = document.getElementById('recVuPct');
        if (bar) bar.style.width = `${pct}%`;
        if (lbl) lbl.textContent = `${pct}%`;
        recRuntime.vuRafId = requestAnimationFrame(tick);
      };
      recRuntime.vuRafId = requestAnimationFrame(tick);
    } catch {
      // Ignora erro de AudioContext sem interação
    }
  }

  function startPipCanvasLoop() {
    const canvas = document.getElementById('recPreviewCanvas');
    if (!canvas) return;
    canvas.width = 1280;
    canvas.height = 720;
    const ctx = canvas.getContext('2d');
    recRuntime.canvasEl = canvas;

    if (!recRuntime.screenVideoEl) {
      recRuntime.screenVideoEl = document.createElement('video');
      recRuntime.screenVideoEl.muted = true;
      recRuntime.screenVideoEl.playsInline = true;
    }
    if (!recRuntime.camVideoEl) {
      recRuntime.camVideoEl = document.createElement('video');
      recRuntime.camVideoEl.muted = true;
      recRuntime.camVideoEl.playsInline = true;
    }

    if (recRuntime.screenStream) {
      recRuntime.screenVideoEl.srcObject = recRuntime.screenStream;
      recRuntime.screenVideoEl.play().catch(() => {});
    }
    if (recRuntime.camStream) {
      recRuntime.camVideoEl.srcObject = recRuntime.camStream;
      recRuntime.camVideoEl.play().catch(() => {});
    }

    const draw = () => {
      if (state.view !== 'recorder' || !recRuntime.canvasEl) return;
      ctx.fillStyle = '#07080f';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const sv = recRuntime.screenVideoEl;
      if (sv && sv.readyState >= 2 && sv.videoWidth > 0) {
        const scale = Math.min(canvas.width / sv.videoWidth, canvas.height / sv.videoHeight);
        const dw = sv.videoWidth * scale;
        const dh = sv.videoHeight * scale;
        ctx.drawImage(sv, (canvas.width - dw) / 2, (canvas.height - dh) / 2, dw, dh);
      } else {
        ctx.fillStyle = '#646b82';
        ctx.font = '600 22px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Aguardando captura de tela...', canvas.width / 2, canvas.height / 2);
      }

      const cv = recRuntime.camVideoEl;
      if (cv && cv.readyState >= 2 && cv.videoWidth > 0) {
        const sizeRatio = state.recorder.pipSize === 'lg' ? 0.34 : state.recorder.pipSize === 'sm' ? 0.2 : 0.27;
        const pw = Math.round(canvas.width * sizeRatio);
        const ph = Math.round((pw * cv.videoHeight) / Math.max(1, cv.videoWidth));
        const margin = 24;
        const pos = state.recorder.pipPos || 'bottom-right';
        const px = pos.includes('left') ? margin : canvas.width - pw - margin;
        const py = pos.includes('top') ? margin : canvas.height - ph - margin;

        ctx.save();
        ctx.beginPath();
        const rad = 16;
        ctx.roundRect ? ctx.roundRect(px, py, pw, ph, rad) : ctx.rect(px, py, pw, ph);
        ctx.clip();
        ctx.drawImage(cv, px, py, pw, ph);
        ctx.restore();

        ctx.strokeStyle = 'rgba(225, 45, 120, 0.85)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.roundRect ? ctx.roundRect(px, py, pw, ph, rad) : ctx.rect(px, py, pw, ph);
        ctx.stroke();
      }

      recRuntime.canvasRafId = requestAnimationFrame(draw);
    };
    if (recRuntime.canvasRafId) cancelAnimationFrame(recRuntime.canvasRafId);
    recRuntime.canvasRafId = requestAnimationFrame(draw);
  }

  async function acquireRecorderStreams({ includeScreen, includeCam, includeMic }) {
    if (!navigator.mediaDevices) {
      throw new Error('MediaDevices API indisponível neste contexto (use localhost ou HTTPS).');
    }

    if (includeMic && !recRuntime.micStream) {
      const audioConstraints = state.recorder.selectedMicId
        ? { deviceId: { exact: state.recorder.selectedMicId } }
        : true;
      recRuntime.micStream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints, video: false });
      startMicVuLoop(recRuntime.micStream);
    }

    if (includeCam && !recRuntime.camStream) {
      const videoConstraints = state.recorder.selectedCamId
        ? { deviceId: { exact: state.recorder.selectedCamId }, width: { ideal: 1280 }, height: { ideal: 720 } }
        : { width: { ideal: 1280 }, height: { ideal: 720 } };
      recRuntime.camStream = await navigator.mediaDevices.getUserMedia({ video: videoConstraints, audio: false });
    }

    if (includeScreen && !recRuntime.screenStream) {
      recRuntime.screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30 },
        audio: true,
      });
    }

    await refreshRecorderDevices();
  }

  function renderRecorderPreviewElement() {
    const mode = state.recorder.mode;
    const vidEl = document.getElementById('recPreviewVideo');
    const canvasEl = document.getElementById('recPreviewCanvas');
    const idleEl = document.getElementById('recPreviewIdle');
    if (!vidEl || !canvasEl || !idleEl) return;

    if (mode === 'all-and-separate' && (recRuntime.screenStream || recRuntime.camStream)) {
      canvasEl.classList.remove('hidden');
      vidEl.classList.add('hidden');
      idleEl.classList.add('hidden');
      startPipCanvasLoop();
      return;
    }

    canvasEl.classList.add('hidden');
    if (mode === 'webcam-voice' && recRuntime.camStream) {
      vidEl.srcObject = recRuntime.camStream;
      vidEl.classList.remove('hidden');
      idleEl.classList.add('hidden');
      vidEl.play().catch(() => {});
      return;
    }

    if ((mode === 'screen-voice' || mode === 'screen-only') && recRuntime.screenStream) {
      vidEl.srcObject = recRuntime.screenStream;
      vidEl.classList.remove('hidden');
      idleEl.classList.add('hidden');
      vidEl.play().catch(() => {});
      return;
    }

    vidEl.classList.add('hidden');
    idleEl.classList.remove('hidden');
  }

  function renderRecorderLibrarySection() {
    const box = document.getElementById('recLibraryContainer');
    if (!box) return;
    const chData = getActiveChannelData();
    const sessions = state.recorder.sessions || [];
    const trackLabels = {
      combinado: '🎬 Combinado',
      tela: '🖥 Tela',
      webcam: '📷 Webcam',
      voz: '🎙 Voz',
      outro: '📎 Faixa',
    };

    if (!state.serverMode) {
      box.innerHTML = '<div class="glass-card"><p style="margin:0; color:var(--text-3);">A biblioteca e gravação em disco exigem o servidor local ativo.</p></div>';
      return;
    }

    if (!sessions.length) {
      box.innerHTML = `
        <div class="glass-card">
          <p style="margin:0; color:var(--text-3);">Nenhuma gravação salva ainda em <code>${MD.escapeHtml(chData.key)}/gravacoes/</code>. Clique em <strong>● Gravar</strong> acima para capturar seu primeiro take!</p>
        </div>
      `;
      return;
    }

    box.innerHTML = `
      <div class="rec-library-list">
        ${sessions
          .map(
            (sess) => `
              <article class="glass-card">
                <div class="gc-top" style="flex-wrap:wrap;">
                  <div>
                    <strong style="font-size:15px;">${MD.escapeHtml(sess.title)}</strong>
                    <div style="font-family:var(--font-mono); font-size:11px; color:var(--text-3); margin-top:2px;">
                      ${MD.escapeHtml(sess.relDir)} • ${(sess.takes || []).length} take(s)
                    </div>
                  </div>
                  <div style="display:flex; gap:7px; flex-wrap:wrap;">
                    <button type="button" class="btn-sm" data-rec-copy-dir="${MD.escapeHtml(sess.dirPath || sess.relDir)}">📋 Copiar Pasta</button>
                    <button type="button" class="btn-sm btn-danger" data-rec-del-session="${MD.escapeHtml(sess.id)}">Excluir Sessão</button>
                  </div>
                </div>

                ${(sess.takes || [])
                  .map((tk) => {
                    const activePl = state.recorder.activePlayer;
                    const isPlayingThis = activePl && activePl.sessionId === sess.id && activePl.takeId === tk.id;
                    const convertibleTrack = (tk.tracks || []).find(
                      (t) => t.ext === 'webm' && ['combinado', 'tela', 'webcam'].includes(t.kind) && !tk.tracks.some((m) => m.fileName === `${t.fileName.replace(/\.webm$/i, '')}.mp4`)
                    );
                    const mp4Targets = (tk.tracks || []).filter(
                      (t) => t.ext === 'webm' && ['combinado', 'tela', 'webcam'].includes(t.kind)
                    );
                    return `
                      <div class="rec-take-card">
                        <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; flex-wrap:wrap;">
                          <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                            <span class="status-pill st-gravando">${MD.escapeHtml(tk.id)}</span>
                            <span style="font-family:var(--font-mono); font-size:11px; color:var(--text-2);">${MD.escapeHtml(tk.mode || '')}</span>
                            ${tk.scriptPath ? `<button type="button" class="kc-move-btn" data-open-doc="${MD.escapeHtml(tk.scriptPath)}">📄 ${MD.escapeHtml(tk.scriptPath)}</button>` : ''}
                          </div>
                          <div style="display:flex; gap:6px; flex-wrap:wrap;">
                            ${mp4Targets
                              .map((mt) => {
                                const convKey = `${sess.id}::${tk.id}::${mt.fileName}`;
                                const hasMp4 = tk.tracks.some((x) => x.fileName === `${mt.fileName.replace(/\.webm$/i, '')}.mp4`);
                                if (hasMp4) return '';
                                return `<button type="button" class="btn-sm" data-rec-mp4="${MD.escapeHtml(convKey)}"${state.recorder.convertingKey === convKey ? ' disabled' : ''}>${state.recorder.convertingKey === convKey ? 'Convertendo...' : `🎬 Converter MP4 (${MD.escapeHtml(mt.kind)})`}</button>`;
                              })
                              .join('')}
                            ${!mp4Targets.length && convertibleTrack ? '' : ''}
                            <button type="button" class="btn-sm btn-danger" data-rec-del-take="${MD.escapeHtml(sess.id)}::${MD.escapeHtml(tk.id)}">Excluir Take</button>
                          </div>
                        </div>

                        <div class="rec-track-badges">
                          ${(tk.tracks || [])
                            .map((tr) => {
                              const label = `${trackLabels[tr.kind] || tr.kind} (${tr.ext.toUpperCase()})`;
                              const mediaUrl = `/api/recordings/media?channel=${encodeURIComponent(chData.key)}&path=${encodeURIComponent(tr.relPath)}`;
                              return `
                                <button type="button" class="rec-track-pill" data-rec-play="${MD.escapeHtml(sess.id)}::${MD.escapeHtml(tk.id)}::${MD.escapeHtml(tr.relPath)}::${MD.escapeHtml(tr.mediaKind || 'video')}" title="Reproduzir ${MD.escapeHtml(tr.fileName)} (${formatBytesCompact(tr.size)})">
                                  <span>▶ ${MD.escapeHtml(label)}</span>
                                  <small style="color:var(--text-3);">${formatBytesCompact(tr.size)}</small>
                                </button>
                                <a class="kc-move-btn" href="${mediaUrl}" download="${MD.escapeHtml(tr.fileName)}" title="Baixar ${MD.escapeHtml(tr.fileName)}">⬇</a>
                              `;
                            })
                            .join('') || '<span style="font-size:11.5px; color:var(--text-3);">Sem faixas gravadas neste take.</span>'}
                        </div>

                        ${isPlayingThis
                          ? `
                            <div class="rec-player-box">
                              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                                <span style="font-family:var(--font-mono); font-size:11px; color:var(--text-2);">${MD.escapeHtml(activePl.relPath)}</span>
                                <button type="button" class="btn-sm" id="recClosePlayerBtn">✕ Fechar Player</button>
                              </div>
                              ${activePl.mediaKind === 'audio'
                                ? `<audio controls autoplay src="/api/recordings/media?channel=${encodeURIComponent(chData.key)}&path=${encodeURIComponent(activePl.relPath)}"></audio>`
                                : `<video controls autoplay playsinline src="/api/recordings/media?channel=${encodeURIComponent(chData.key)}&path=${encodeURIComponent(activePl.relPath)}"></video>`}
                            </div>
                          `
                          : ''}
                      </div>
                    `;
                  })
                  .join('')}
              </article>
            `
          )
          .join('')}
      </div>
    `;

    box.querySelectorAll('[data-rec-copy-dir]').forEach((btn) => {
      btn.onclick = () => copyText(btn.dataset.recCopyDir, 'Caminho da pasta copiado!');
    });
    box.querySelectorAll('[data-open-doc]').forEach((btn) => {
      btn.onclick = () => setView('scripts', btn.dataset.openDoc);
    });
    box.querySelectorAll('[data-rec-play]').forEach((btn) => {
      btn.onclick = () => {
        const [sessionId, takeId, relPath, mediaKind] = btn.dataset.recPlay.split('::');
        state.recorder.activePlayer = { sessionId, takeId, relPath, mediaKind };
        renderRecorderLibrarySection();
      };
    });
    document.getElementById('recClosePlayerBtn')?.addEventListener('click', () => {
      state.recorder.activePlayer = null;
      renderRecorderLibrarySection();
    });
    box.querySelectorAll('[data-rec-mp4]').forEach((btn) => {
      btn.onclick = async () => {
        const [sessionId, takeId, fileName] = btn.dataset.recMp4.split('::');
        state.recorder.convertingKey = btn.dataset.recMp4;
        renderRecorderLibrarySection();
        try {
          const res = await fetch('/api/recordings/convert-mp4', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ channel: chData.key, sessionId, takeId, fileName }),
          });
          const json = await res.json();
          if (!res.ok) throw new Error(json.error || 'Erro ao converter para MP4');
          if (json.state) state.data = normalizePayload(json.state);
          showToast(`MP4 gerado: ${json.track?.fileName || 'ok'}`);
          await loadRecordingsLibrary(chData.key);
        } catch (err) {
          showToast(err.message);
        } finally {
          state.recorder.convertingKey = '';
          renderRecorderLibrarySection();
        }
      };
    });
    box.querySelectorAll('[data-rec-del-take]').forEach((btn) => {
      btn.onclick = async () => {
        const [sessionId, takeId] = btn.dataset.recDelTake.split('::');
        if (!confirm(`Excluir o ${takeId} da sessão ${sessionId}?`)) return;
        try {
          const res = await fetch(
            `/api/recordings?channel=${encodeURIComponent(chData.key)}&sessionId=${encodeURIComponent(sessionId)}&takeId=${encodeURIComponent(takeId)}`,
            { method: 'DELETE' }
          );
          const json = await res.json();
          if (!res.ok) throw new Error(json.error || 'Erro ao excluir take');
          if (json.state) state.data = normalizePayload(json.state);
          await loadRecordingsLibrary(chData.key);
          showToast('Take excluído.');
        } catch (err) {
          showToast(err.message);
        }
      };
    });
    box.querySelectorAll('[data-rec-del-session]').forEach((btn) => {
      btn.onclick = async () => {
        const sessionId = btn.dataset.recDelSession;
        if (!confirm(`Excluir toda a sessão "${sessionId}" e suas faixas?`)) return;
        try {
          const res = await fetch(
            `/api/recordings?channel=${encodeURIComponent(chData.key)}&sessionId=${encodeURIComponent(sessionId)}`,
            { method: 'DELETE' }
          );
          const json = await res.json();
          if (!res.ok) throw new Error(json.error || 'Erro ao excluir sessão');
          if (json.state) state.data = normalizePayload(json.state);
          await loadRecordingsLibrary(chData.key);
          showToast('Sessão removida.');
        } catch (err) {
          showToast(err.message);
        }
      };
    });
  }

  function renderRecorderView(container) {
    if (!container) return;
    const chData = getActiveChannelData();
    const docs = chData.docs || [];
    const rec = state.recorder;

    if (!rec.devices.cameras.length && !rec.devices.mics.length) {
      refreshRecorderDevices();
    }
    if (state.serverMode && rec.sessionsChannel !== chData.key && !rec.loading) {
      loadRecordingsLibrary(chData.key, { rerender: true });
    }

    const linkedDoc = docs.find((d) => d.path === rec.linkedDocPath) || null;
    const modes = [
      { id: 'all-and-separate', label: '🎬 Tudo Junto + Separado (PiP + 3 faixas)' },
      { id: 'screen-voice', label: '🖥 Tela + Voz' },
      { id: 'webcam-voice', label: '📷 Webcam + Voz' },
      { id: 'voice-only', label: '🎙 Só Narração (Voz)' },
      { id: 'screen-only', label: '🖥 Só Tela' },
    ];

    container.innerHTML = `
      <div class="rec-grid">
        <section class="rec-card">
          <div class="section-subhead" style="margin:0;">
            <div>
              <h2 class="panel-title" style="font-size:16px;">Estúdio Multi-Track (${MD.escapeHtml(chData.channel?.name || chData.key)})</h2>
              <span style="font-size:12px; color:var(--text-3);">Captura combinada em PiP + faixas separadas (.webm) e extração automática de <code>04-voz.wav</code>.</span>
            </div>
            <span class="settings-path-badge ${rec.ffmpegAvailable ? 'is-ok' : 'is-miss'}" id="recFfmpegBadge">
              ${rec.ffmpegAvailable ? '✓ ffmpeg ativo (.wav / MP4)' : '⚠ ffmpeg não detectado'}
            </span>
          </div>

          <div class="rec-mode-pills" id="recModePills">
            ${modes
              .map(
                (m) => `<button type="button" class="rec-mode-btn${rec.mode === m.id ? ' active' : ''}" data-rec-mode="${m.id}">${MD.escapeHtml(m.label)}</button>`
              )
              .join('')}
          </div>

          <div class="form-row-2">
            <label style="display:flex; flex-direction:column; gap:4px; font-size:12px; color:var(--text-2);">
              <span>Título / Slug da Sessão</span>
              <input type="text" class="search-box-sm" id="recTitleInput" placeholder="Ex.: Episódio GTA 6 Parte 1" value="${MD.escapeHtml(rec.titleDraft || '')}" style="margin:0;">
            </label>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
              <label style="display:flex; flex-direction:column; gap:4px; font-size:12px; color:var(--text-2);">
                <span>Posição PiP</span>
                <select class="select-dark" id="recPipPosSel">
                  <option value="bottom-right"${rec.pipPos === 'bottom-right' ? ' selected' : ''}>Inferior Direita</option>
                  <option value="bottom-left"${rec.pipPos === 'bottom-left' ? ' selected' : ''}>Inferior Esquerda</option>
                  <option value="top-right"${rec.pipPos === 'top-right' ? ' selected' : ''}>Superior Direita</option>
                  <option value="top-left"${rec.pipPos === 'top-left' ? ' selected' : ''}>Superior Esquerda</option>
                </select>
              </label>
              <label style="display:flex; flex-direction:column; gap:4px; font-size:12px; color:var(--text-2);">
                <span>Tamanho PiP</span>
                <select class="select-dark" id="recPipSizeSel">
                  <option value="sm"${rec.pipSize === 'sm' ? ' selected' : ''}>Pequena</option>
                  <option value="md"${rec.pipSize === 'md' ? ' selected' : ''}>Média</option>
                  <option value="lg"${rec.pipSize === 'lg' ? ' selected' : ''}>Grande</option>
                </select>
              </label>
            </div>
          </div>

          <div class="form-row-2">
            <label style="display:flex; flex-direction:column; gap:4px; font-size:12px; color:var(--text-2);">
              <span>Câmera</span>
              <select class="select-dark" id="recCamSel">
                <option value="">Câmera padrão do sistema</option>
                ${(rec.devices.cameras || [])
                  .map(
                    (d, idx) => `<option value="${MD.escapeHtml(d.deviceId)}"${rec.selectedCamId === d.deviceId ? ' selected' : ''}>${MD.escapeHtml(d.label || `Câmera ${idx + 1}`)}</option>`
                  )
                  .join('')}
              </select>
            </label>
            <label style="display:flex; flex-direction:column; gap:4px; font-size:12px; color:var(--text-2);">
              <span>Microfone</span>
              <select class="select-dark" id="recMicSel">
                <option value="">Microfone padrão do sistema</option>
                ${(rec.devices.mics || [])
                  .map(
                    (d, idx) => `<option value="${MD.escapeHtml(d.deviceId)}"${rec.selectedMicId === d.deviceId ? ' selected' : ''}>${MD.escapeHtml(d.label || `Microfone ${idx + 1}`)}</option>`
                  )
                  .join('')}
              </select>
            </label>
          </div>

          <div class="rec-preview-stage">
            <canvas id="recPreviewCanvas" class="hidden"></canvas>
            <video id="recPreviewVideo" class="hidden" muted playsinline></video>
            <div id="recPreviewIdle" style="padding:20px; text-align:center; color:var(--text-3); font-size:13px;">
              Clique em <strong>👁 Pré-visualizar</strong> ou <strong>● Gravar</strong> para ativar os dispositivos deste modo.
            </div>
            <div class="rec-live-badge${rec.status === 'recording' ? ' is-recording' : ''}" id="recStatusBadge">
              <span class="rec-live-dot"></span>
              <span id="recStatusText">${rec.status === 'recording' ? 'REC' : rec.status === 'paused' ? 'PAUSADO' : 'PRONTO'}</span>
              <span id="recTimerDisplay">${formatRecTimer(rec.elapsedSec || 0)}</span>
            </div>
          </div>

          <div class="rec-vu-wrap">
            <span style="font-family:var(--font-mono); font-size:11px; color:var(--text-2);">🎙 VU Voz</span>
            <div class="rec-vu-bar"><div class="rec-vu-fill" id="recVuFill" style="width:${rec.micLevel || 0}%;"></div></div>
            <span style="font-family:var(--font-mono); font-size:11px; color:var(--text-3); min-width:34px; text-align:right;" id="recVuPct">${rec.micLevel || 0}%</span>
          </div>

          <div class="rec-controls-bar">
            <button type="button" class="btn-sm" id="recPreviewBtn">👁 Pré-visualizar</button>
            <button type="button" class="rec-btn-record" id="recStartBtn"${rec.status !== 'idle' || rec.uploading ? ' disabled' : ''}>● Gravar</button>
            <button type="button" class="btn-sm" id="recPauseBtn"${rec.status === 'idle' ? ' disabled' : ''}>${rec.status === 'paused' ? '▶ Retomar' : '⏸ Pausar'}</button>
            <button type="button" class="btn-sm btn-accent" id="recStopSaveBtn"${rec.status === 'idle' || rec.uploading ? ' disabled' : ''}>⏹ Finalizar & Salvar</button>
            <button type="button" class="btn-sm" id="recRefreshDevicesBtn">↻ Dispositivos</button>
          </div>

          ${rec.uploadProgress ? `<div class="settings-toggle-row" style="font-size:12px; color:var(--info);">${MD.escapeHtml(rec.uploadProgress)}</div>` : ''}
          ${rec.lastSavedInfo
            ? `<div class="settings-toggle-row" style="border-color:rgba(54,211,153,0.4); background:rgba(54,211,153,0.08); font-size:12px; color:#86efac;">
                <div>
                  <strong>✓ Take salvo em <code>${MD.escapeHtml(rec.lastSavedInfo.relDir)}</code></strong>
                  <div style="font-size:11px; color:var(--text-2); margin-top:2px;">${MD.escapeHtml(rec.lastSavedInfo.note)}</div>
                </div>
                <button type="button" class="btn-sm" id="recCopyLastDirBtn">Copiar Pasta</button>
              </div>`
            : ''}
        </section>

        <section class="rec-card">
          <div class="section-subhead" style="margin:0;">
            <h2 class="panel-title" style="font-size:15px;">Roteiro Vinculado & Mini Teleprompter</h2>
            <div class="zoom-group">
              <button type="button" id="recPrompterFontMinus">A-</button>
              <span id="recPrompterFontVal">${rec.prompterFontSize}px</span>
              <button type="button" id="recPrompterFontPlus">A+</button>
            </div>
          </div>

          <select class="select-dark" id="recScriptSel" style="width:100%;">
            <option value="">Nenhum roteiro vinculado (gravação livre)</option>
            ${docs.map((d) => `<option value="${MD.escapeHtml(d.path)}"${rec.linkedDocPath === d.path ? ' selected' : ''}>${MD.escapeHtml(d.meta.titulo)} (${MD.escapeHtml(d.path)})</option>`).join('')}
          </select>

          <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
            <button type="button" class="btn-sm btn-accent" id="recPrompterPlayBtn">${rec.prompterPlaying ? '⏸ Pausar Teleprompter' : '▶ Play Teleprompter'}</button>
            <button type="button" class="btn-sm" id="recPrompterTopBtn">↺ Topo</button>
            <label style="display:inline-flex; align-items:center; gap:6px; font-size:11.5px; color:var(--text-2); margin-left:auto;">
              <span>Velocidade</span>
              <input type="range" id="recPrompterSpeedRange" min="0.5" max="5.5" step="0.5" value="${rec.prompterSpeed}" style="width:90px;">
            </label>
          </div>

          <div class="rec-teleprompter-box" id="recPrompterBox" style="font-size:${rec.prompterFontSize}px;">
            ${linkedDoc
              ? MD.escapeHtml(linkedDoc.body || '')
              : '<span style="color:var(--text-3);">Selecione um roteiro acima para narrar acompanhando o mini teleprompter em tempo real.</span>'}
          </div>
        </section>
      </div>

      <div class="section-subhead">
        <h2 class="panel-title" style="font-size:16px;">Biblioteca de Gravações (${(rec.sessions || []).length} sessões)</h2>
        <button type="button" class="btn-sm" id="recReloadLibBtn">↻ Atualizar Biblioteca</button>
      </div>
      <div id="recLibraryContainer"></div>
    `;

    renderRecorderPreviewElement();
    renderRecorderLibrarySection();

    container.querySelectorAll('[data-rec-mode]').forEach((btn) => {
      btn.onclick = () => {
        if (state.recorder.status !== 'idle') {
          showToast('Pare a gravação antes de mudar o modo.');
          return;
        }
        state.recorder.mode = btn.dataset.recMode;
        renderRecorderView(container);
      };
    });

    document.getElementById('recTitleInput')?.addEventListener('input', (e) => {
      state.recorder.titleDraft = e.target.value;
    });
    document.getElementById('recPipPosSel')?.addEventListener('change', (e) => {
      state.recorder.pipPos = e.target.value;
    });
    document.getElementById('recPipSizeSel')?.addEventListener('change', (e) => {
      state.recorder.pipSize = e.target.value;
    });
    document.getElementById('recCamSel')?.addEventListener('change', (e) => {
      state.recorder.selectedCamId = e.target.value;
    });
    document.getElementById('recMicSel')?.addEventListener('change', (e) => {
      state.recorder.selectedMicId = e.target.value;
    });

    document.getElementById('recRefreshDevicesBtn')?.addEventListener('click', async () => {
      await refreshRecorderDevices();
      renderRecorderView(container);
      showToast('Lista de dispositivos atualizada.');
    });

    document.getElementById('recPreviewBtn')?.addEventListener('click', async () => {
      try {
        stopRecorderMediaStreams();
        const m = state.recorder.mode;
        await acquireRecorderStreams({
          includeScreen: m === 'all-and-separate' || m === 'screen-voice' || m === 'screen-only',
          includeCam: m === 'all-and-separate' || m === 'webcam-voice',
          includeMic: m !== 'screen-only',
        });
        renderRecorderView(container);
        showToast('Pré-visualização pronta!');
      } catch (err) {
        showToast(`Permissão ou dispositivo indisponível: ${err.message}`);
      }
    });

    document.getElementById('recStartBtn')?.addEventListener('click', async () => {
      if (!state.serverMode) {
        showToast('Salvar gravações no disco exige o servidor local ativo.');
        return;
      }
      if (!global.MediaRecorder) {
        showToast('MediaRecorder API não suportada neste navegador.');
        return;
      }
      const m = state.recorder.mode;
      try {
        await acquireRecorderStreams({
          includeScreen: m === 'all-and-separate' || m === 'screen-voice' || m === 'screen-only',
          includeCam: m === 'all-and-separate' || m === 'webcam-voice',
          includeMic: m !== 'screen-only',
        });
      } catch (err) {
        showToast(`Não foi possível capturar mídia: ${err.message}`);
        return;
      }

      renderRecorderPreviewElement();

      const tracksToRecord = [];
      if (m === 'all-and-separate') {
        const canvas = document.getElementById('recPreviewCanvas');
        if (canvas && canvas.captureStream) {
          const canvasStream = canvas.captureStream(30);
          const combinedTracks = [...canvasStream.getVideoTracks()];
          if (recRuntime.micStream) combinedTracks.push(...recRuntime.micStream.getAudioTracks().map((t) => t.clone()));
          tracksToRecord.push({ kind: 'combinado', stream: new MediaStream(combinedTracks), mediaKind: 'video' });
        }
        if (recRuntime.screenStream) {
          tracksToRecord.push({ kind: 'tela', stream: recRuntime.screenStream, mediaKind: 'video' });
        }
        if (recRuntime.camStream) {
          tracksToRecord.push({ kind: 'webcam', stream: recRuntime.camStream, mediaKind: 'video' });
        }
        if (recRuntime.micStream) {
          tracksToRecord.push({ kind: 'voz', stream: recRuntime.micStream, mediaKind: 'audio' });
        }
      } else if (m === 'screen-voice') {
        if (recRuntime.screenStream) {
          const mixed = [...recRuntime.screenStream.getVideoTracks()];
          if (recRuntime.micStream) mixed.push(...recRuntime.micStream.getAudioTracks().map((t) => t.clone()));
          tracksToRecord.push({ kind: 'tela', stream: new MediaStream(mixed), mediaKind: 'video' });
        }
        if (recRuntime.micStream) {
          tracksToRecord.push({ kind: 'voz', stream: recRuntime.micStream, mediaKind: 'audio' });
        }
      } else if (m === 'webcam-voice') {
        if (recRuntime.camStream) {
          const mixed = [...recRuntime.camStream.getVideoTracks()];
          if (recRuntime.micStream) mixed.push(...recRuntime.micStream.getAudioTracks().map((t) => t.clone()));
          tracksToRecord.push({ kind: 'webcam', stream: new MediaStream(mixed), mediaKind: 'video' });
        }
        if (recRuntime.micStream) {
          tracksToRecord.push({ kind: 'voz', stream: recRuntime.micStream, mediaKind: 'audio' });
        }
      } else if (m === 'voice-only') {
        if (recRuntime.micStream) {
          tracksToRecord.push({ kind: 'voz', stream: recRuntime.micStream, mediaKind: 'audio' });
        }
      } else if (m === 'screen-only') {
        if (recRuntime.screenStream) {
          tracksToRecord.push({ kind: 'tela', stream: recRuntime.screenStream, mediaKind: 'video' });
        }
      }

      if (!tracksToRecord.length) {
        showToast('Nenhuma faixa disponível para gravar neste modo.');
        return;
      }

      recRuntime.recorders = [];
      recRuntime.recordedBlobs = {};
      for (const item of tracksToRecord) {
        const mimeType = pickRecorderMime(item.mediaKind);
        const mr = mimeType ? new MediaRecorder(item.stream, { mimeType }) : new MediaRecorder(item.stream);
        const chunks = [];
        mr.ondataavailable = (ev) => {
          if (ev.data && ev.data.size > 0) chunks.push(ev.data);
        };
        const stopPromise = new Promise((resolve) => {
          mr.onstop = () => {
            const blob = new Blob(chunks, { type: mimeType || (item.mediaKind === 'audio' ? 'audio/webm' : 'video/webm') });
            recRuntime.recordedBlobs[item.kind] = blob;
            resolve({ kind: item.kind, blob });
          };
        });
        mr.start(1000);
        recRuntime.recorders.push({ kind: item.kind, mr, stopPromise });
      }

      state.recorder.status = 'recording';
      state.recorder.startedAt = Date.now();
      state.recorder.elapsedSec = 0;
      state.recorder.lastSavedInfo = null;
      if (state.recorder.timerId) clearInterval(state.recorder.timerId);
      state.recorder.timerId = setInterval(() => {
        if (state.recorder.status === 'recording') {
          state.recorder.elapsedSec += 1;
          const timerEl = document.getElementById('recTimerDisplay');
          if (timerEl) timerEl.textContent = formatRecTimer(state.recorder.elapsedSec);
        }
      }, 1000);

      renderRecorderView(container);
      showToast(`Gravação iniciada (${tracksToRecord.length} faixa(s))!`);
    });

    document.getElementById('recPauseBtn')?.addEventListener('click', () => {
      if (state.recorder.status === 'recording') {
        recRuntime.recorders.forEach((r) => {
          if (r.mr.state === 'recording') r.mr.pause();
        });
        state.recorder.status = 'paused';
        renderRecorderView(container);
      } else if (state.recorder.status === 'paused') {
        recRuntime.recorders.forEach((r) => {
          if (r.mr.state === 'paused') r.mr.resume();
        });
        state.recorder.status = 'recording';
        renderRecorderView(container);
      }
    });

    document.getElementById('recStopSaveBtn')?.addEventListener('click', async () => {
      if (state.recorder.status === 'idle') return;
      state.recorder.uploading = true;
      state.recorder.uploadProgress = 'Finalizando gravadores...';
      if (state.recorder.timerId) {
        clearInterval(state.recorder.timerId);
        state.recorder.timerId = null;
      }

      const stopPromises = recRuntime.recorders.map((r) => {
        if (r.mr.state !== 'inactive') r.mr.stop();
        return r.stopPromise;
      });
      const finishedTracks = await Promise.all(stopPromises);
      recRuntime.recorders = [];
      state.recorder.status = 'idle';

      try {
        const title = (document.getElementById('recTitleInput')?.value || state.recorder.titleDraft || '').trim() || 'Gravação do Estúdio';
        const sessRes = await fetch('/api/recordings/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            channel: chData.key,
            title,
            mode: state.recorder.mode,
            scriptPath: state.recorder.linkedDocPath || '',
          }),
        });
        const sessJson = await sessRes.json();
        if (!sessRes.ok) throw new Error(sessJson.error || 'Erro ao criar take de gravação');

        let wavInfo = '';
        for (let i = 0; i < finishedTracks.length; i++) {
          const item = finishedTracks[i];
          if (!item.blob || item.blob.size === 0) continue;
          state.recorder.uploadProgress = `Enviando faixa ${i + 1}/${finishedTracks.length} (${item.kind})...`;
          renderRecorderView(container);

          const upRes = await fetch(
            `/api/recordings/track?channel=${encodeURIComponent(chData.key)}&sessionId=${encodeURIComponent(sessJson.sessionId)}&takeId=${encodeURIComponent(sessJson.takeId)}&kind=${encodeURIComponent(item.kind)}&ext=webm`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/octet-stream' },
              body: item.blob,
            }
          );
          const upJson = await upRes.json();
          if (!upRes.ok) throw new Error(upJson.error || `Erro ao enviar faixa ${item.kind}`);
          if (upJson.wavExtracted) wavInfo = ' + 04-voz.wav extraído automaticamente!';
          if (upJson.state) state.data = normalizePayload(upJson.state);
        }

        state.recorder.lastSavedInfo = {
          dirPath: sessJson.take?.dirPath || sessJson.session?.dirPath || '',
          relDir: sessJson.take?.relDir || `${sessJson.session?.relDir}/${sessJson.takeId}`,
          note: `${finishedTracks.length} faixa(s) salvas${wavInfo}`,
        };
        showToast(`Gravação salva em ${state.recorder.lastSavedInfo.relDir}!`);
      } catch (err) {
        showToast(err.message);
      } finally {
        state.recorder.uploading = false;
        state.recorder.uploadProgress = '';
        stopRecorderMediaStreams();
        await loadRecordingsLibrary(chData.key, { rerender: false });
        renderRecorderView(container);
      }
    });

    document.getElementById('recCopyLastDirBtn')?.addEventListener('click', () => {
      if (state.recorder.lastSavedInfo) {
        copyText(state.recorder.lastSavedInfo.dirPath || state.recorder.lastSavedInfo.relDir, 'Pasta copiada!');
      }
    });

    document.getElementById('recReloadLibBtn')?.addEventListener('click', () => loadRecordingsLibrary(chData.key));

    document.getElementById('recScriptSel')?.addEventListener('change', (e) => {
      state.recorder.linkedDocPath = e.target.value;
      renderRecorderView(container);
    });
    document.getElementById('recPrompterFontMinus')?.addEventListener('click', () => {
      state.recorder.prompterFontSize = Math.max(14, state.recorder.prompterFontSize - 2);
      const box = document.getElementById('recPrompterBox');
      const val = document.getElementById('recPrompterFontVal');
      if (box) box.style.fontSize = `${state.recorder.prompterFontSize}px`;
      if (val) val.textContent = `${state.recorder.prompterFontSize}px`;
    });
    document.getElementById('recPrompterFontPlus')?.addEventListener('click', () => {
      state.recorder.prompterFontSize = Math.min(38, state.recorder.prompterFontSize + 2);
      const box = document.getElementById('recPrompterBox');
      const val = document.getElementById('recPrompterFontVal');
      if (box) box.style.fontSize = `${state.recorder.prompterFontSize}px`;
      if (val) val.textContent = `${state.recorder.prompterFontSize}px`;
    });
    document.getElementById('recPrompterSpeedRange')?.addEventListener('input', (e) => {
      state.recorder.prompterSpeed = Number(e.target.value);
    });
    document.getElementById('recPrompterTopBtn')?.addEventListener('click', () => {
      const box = document.getElementById('recPrompterBox');
      if (box) box.scrollTop = 0;
    });
    document.getElementById('recPrompterPlayBtn')?.addEventListener('click', () => {
      state.recorder.prompterPlaying = !state.recorder.prompterPlaying;
      const btn = document.getElementById('recPrompterPlayBtn');
      if (btn) btn.textContent = state.recorder.prompterPlaying ? '⏸ Pausar Teleprompter' : '▶ Play Teleprompter';
      if (state.recorder.prompterPlaying) {
        state.recorder.prompterLastTs = performance.now();
        const step = (now) => {
          const box = document.getElementById('recPrompterBox');
          if (!state.recorder.prompterPlaying || !box || state.view !== 'recorder') return;
          const dt = (now - state.recorder.prompterLastTs) / 1000;
          state.recorder.prompterLastTs = now;
          box.scrollTop += state.recorder.prompterSpeed * 26 * dt;
          if (box.scrollTop + box.clientHeight >= box.scrollHeight - 2) {
            state.recorder.prompterPlaying = false;
            if (btn) btn.textContent = '▶ Play Teleprompter';
            return;
          }
          state.recorder.prompterRafId = requestAnimationFrame(step);
        };
        state.recorder.prompterRafId = requestAnimationFrame(step);
      } else if (state.recorder.prompterRafId) {
        cancelAnimationFrame(state.recorder.prompterRafId);
        state.recorder.prompterRafId = null;
      }
    });
  }

  /* =========================================================
     VIEW 6C: NOTAS RÁPIDAS ESTILO GOOGLE KEEP (v4)
  ========================================================= */
  const KEEP_COLORS = [
    { id: 'default', label: 'Padrão', dot: '#2e3148' },
    { id: 'coral', label: 'Coral', dot: '#e11d48' },
    { id: 'amber', label: 'Âmbar', dot: '#d97706' },
    { id: 'yellow', label: 'Ouro', dot: '#ca8a04' },
    { id: 'emerald', label: 'Esmeralda', dot: '#10b981' },
    { id: 'teal', label: 'Ciano', dot: '#06b6d4' },
    { id: 'indigo', label: 'Índigo', dot: '#6366f1' },
    { id: 'purple', label: 'Roxo', dot: '#a855f7' },
  ];

  async function loadNotesForChannel(channelKey, { rerender = true } = {}) {
    if (!state.serverMode) return;
    state.notesState.loading = true;
    try {
      const res = await fetch(`/api/notes?channel=${encodeURIComponent(channelKey)}`, { cache: 'no-store' });
      const json = await res.json();
      if (res.ok) {
        state.notesState.notes = Array.isArray(json.notes) ? json.notes : [];
        state.notesState.gistSync = json.gistSync || null;
        state.notesState.channel = channelKey;
      }
    } catch {
      // ignora
    } finally {
      state.notesState.loading = false;
      if (rerender && state.view === 'notes' && state.activeChannel === channelKey) {
        renderNotesView(document.getElementById('viewContainer'));
      }
    }
  }

  function openNoteEditModal(note) {
    const chData = getActiveChannelData();
    const modal = document.getElementById('noteEditModal');
    const body = document.getElementById('noteEditModalBody');
    if (!modal || !body || !note) return;

    let editColor = note.color || 'default';
    let editKind = note.kind || 'note';
    let editPinned = Boolean(note.pinned);
    let editChecklist = Array.isArray(note.checklist)
      ? note.checklist.map((it) => ({ ...it }))
      : [];

    const renderModalContent = () => {
      body.innerHTML = `
        <form id="noteEditForm" style="display:flex; flex-direction:column; gap:10px;">
          <label>
            <span>Título</span>
            <input type="text" id="noteEditTitleInp" value="${MD.escapeHtml(note.title || '')}" placeholder="Título da nota...">
          </label>
          <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; flex-wrap:wrap;">
            <div class="mode-switch" id="noteEditKindSwitch">
              <button type="button" class="${editKind === 'note' ? 'active' : ''}" data-nek="note">Texto</button>
              <button type="button" class="${editKind === 'checklist' ? 'active' : ''}" data-nek="checklist">☑ Checklist</button>
            </div>
            <button type="button" class="btn-sm${editPinned ? ' btn-accent' : ''}" id="noteEditPinBtn">${editPinned ? '📌 Fixada' : '📌 Fixar'}</button>
          </div>
          ${editKind === 'checklist'
            ? `<div style="display:flex; flex-direction:column; gap:6px;">
                ${editChecklist
                  .map(
                    (it, idx) => `
                      <div style="display:flex; align-items:center; gap:6px;">
                        <input type="checkbox" data-ne-chk-done="${idx}"${it.done ? ' checked' : ''} style="width:auto;">
                        <input type="text" data-ne-chk-text="${idx}" value="${MD.escapeHtml(it.text || '')}" placeholder="Item da lista..." style="flex:1;">
                        <button type="button" class="btn-sm btn-danger" data-ne-chk-del="${idx}">✕</button>
                      </div>
                    `
                  )
                  .join('')}
                <div><button type="button" class="btn-sm" id="noteEditAddChkBtn">+ Adicionar item</button></div>
              </div>`
            : `<label>
                <span>Conteúdo</span>
                <textarea id="noteEditContentInp" rows="5" placeholder="Escreva sua ideia, gancho ou anotação...">${MD.escapeHtml(note.content || '')}</textarea>
              </label>`}
          <div class="form-row-2">
            <label>
              <span>Tags / Labels (vírgula)</span>
              <input type="text" id="noteEditLabelsInp" value="${MD.escapeHtml((note.labels || []).join(', '))}" placeholder="gancho, urgente, ideia">
            </label>
            <label>
              <span>Link opcional</span>
              <input type="url" id="noteEditUrlInp" value="${MD.escapeHtml(note.linkedUrl || '')}" placeholder="https://...">
            </label>
          </div>
          <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap;">
            <div class="keep-color-dots">
              ${KEEP_COLORS.map(
                (c) => `<button type="button" class="keep-color-dot${editColor === c.id ? ' is-active' : ''}" data-ne-color="${c.id}" style="background:${c.dot};" title="${MD.escapeHtml(c.label)}"></button>`
              ).join('')}
            </div>
            <div style="display:flex; gap:8px;">
              <button type="button" class="btn-ghost" data-close-modal="noteEditModal">Cancelar</button>
              <button type="submit" class="btn-primary">Salvar Nota</button>
            </div>
          </div>
        </form>
      `;

      body.querySelectorAll('[data-close-modal]').forEach((b) => {
        b.onclick = () => modal.classList.add('hidden');
      });
      body.querySelectorAll('#noteEditKindSwitch button').forEach((b) => {
        b.onclick = () => {
          editKind = b.dataset.nek;
          if (editKind === 'checklist' && !editChecklist.length) {
            editChecklist = [{ id: `c-${Date.now()}`, text: '', done: false }];
          }
          renderModalContent();
        };
      });
      document.getElementById('noteEditPinBtn').onclick = () => {
        editPinned = !editPinned;
        renderModalContent();
      };
      body.querySelectorAll('[data-ne-color]').forEach((b) => {
        b.onclick = () => {
          editColor = b.dataset.neColor;
          renderModalContent();
        };
      });
      body.querySelectorAll('[data-ne-chk-done]').forEach((chk) => {
        chk.onchange = () => {
          editChecklist[Number(chk.dataset.neChkDone)].done = chk.checked;
        };
      });
      body.querySelectorAll('[data-ne-chk-text]').forEach((inp) => {
        inp.oninput = () => {
          editChecklist[Number(inp.dataset.neChkText)].text = inp.value;
        };
      });
      body.querySelectorAll('[data-ne-chk-del]').forEach((b) => {
        b.onclick = () => {
          editChecklist.splice(Number(b.dataset.neChkDel), 1);
          renderModalContent();
        };
      });
      document.getElementById('noteEditAddChkBtn')?.addEventListener('click', () => {
        editChecklist.push({ id: `c-${Date.now()}`, text: '', done: false });
        renderModalContent();
      });

      document.getElementById('noteEditForm').onsubmit = async (e) => {
        e.preventDefault();
        const title = document.getElementById('noteEditTitleInp')?.value || '';
        const content = document.getElementById('noteEditContentInp')?.value ?? note.content ?? '';
        const labels = document.getElementById('noteEditLabelsInp')?.value || '';
        const linkedUrl = document.getElementById('noteEditUrlInp')?.value.trim() || '';
        const cleanChecklist = editChecklist.filter((it) => it.text.trim());

        try {
          const res = await fetch('/api/notes', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              channel: chData.key,
              id: note.id,
              title,
              content: editKind === 'note' ? content : '',
              kind: editKind,
              checklist: editKind === 'checklist' ? cleanChecklist : [],
              color: editColor,
              pinned: editPinned,
              labels,
              linkedUrl,
            }),
          });
          const json = await res.json();
          if (!res.ok) throw new Error(json.error || 'Erro ao atualizar nota');
          state.notesState.notes = json.notes || [];
          state.notesState.gistSync = json.gistSync || state.notesState.gistSync;
          if (json.state) state.data = normalizePayload(json.state);
          modal.classList.add('hidden');
          renderNotesView(document.getElementById('viewContainer'));
          showToast('Nota atualizada!');
        } catch (err) {
          showToast(err.message);
        }
      };
    };

    renderModalContent();
    modal.classList.remove('hidden');
  }

  function renderNotesView(container) {
    if (!container) return;
    const chData = getActiveChannelData();
    const ns = state.notesState;

    if (state.serverMode && ns.channel !== chData.key && !ns.loading) {
      loadNotesForChannel(chData.key, { rerender: true });
    }

    const allNotes = ns.notes || [];
    const labelsSet = new Set();
    for (const n of allNotes) {
      for (const l of n.labels || []) labelsSet.add(l);
    }

    const filterNote = (n) => {
      if (!ns.showArchived && n.archived) return false;
      if (ns.showArchived && !n.archived) return false;
      if (ns.colorFilter !== 'all' && (n.color || 'default') !== ns.colorFilter) return false;
      if (ns.labelFilter !== 'all' && !(n.labels || []).includes(ns.labelFilter)) return false;
      if (ns.search) {
        const q = ns.search.toLowerCase();
        const chkTxt = (n.checklist || []).map((c) => c.text).join(' ');
        const hay = `${n.title} ${n.content} ${chkTxt} ${(n.labels || []).join(' ')} ${n.linkedUrl || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    };

    const visibleNotes = allNotes.filter(filterNote);
    const pinnedNotes = visibleNotes.filter((n) => n.pinned);
    const otherNotes = visibleNotes.filter((n) => !n.pinned);

    const renderKeepCard = (n) => {
      const colorClass = `kc-${KEEP_COLORS.some((c) => c.id === n.color) ? n.color : 'default'}`;
      const checklistHtml = (n.checklist || []).length
        ? `<div class="keep-checklist">
            ${(n.checklist || [])
              .map(
                (it) => `
                  <label class="keep-check-item${it.done ? ' is-done' : ''}">
                    <input type="checkbox" data-note-chk="${MD.escapeHtml(n.id)}::${MD.escapeHtml(it.id)}"${it.done ? ' checked' : ''}>
                    <span>${MD.escapeHtml(it.text)}</span>
                  </label>
                `
              )
              .join('')}
          </div>`
        : '';

      return `
        <article class="keep-card ${colorClass}">
          <div class="keep-card-head">
            <h3 class="keep-card-title">${MD.escapeHtml(n.title || (n.kind === 'checklist' ? 'Checklist' : 'Nota'))}</h3>
            <button type="button" class="btn-sm${n.pinned ? ' btn-accent' : ''}" data-note-pin="${MD.escapeHtml(n.id)}" title="${n.pinned ? 'Desafixar' : 'Fixar no topo'}">📌</button>
          </div>
          ${n.content ? `<p class="keep-card-body">${MD.escapeHtml(n.content)}</p>` : ''}
          ${checklistHtml}
          ${(n.labels || []).length
            ? `<div class="cat-chip-row">${n.labels.map((l) => `<span class="cat-tag-chip" style="padding:1px 7px; font-size:10.5px;">#${MD.escapeHtml(l)}</span>`).join('')}</div>`
            : ''}
          ${n.linkedUrl
            ? `<a href="${MD.escapeHtml(n.linkedUrl)}" target="_blank" rel="noopener noreferrer" data-ext-url="${MD.escapeHtml(n.linkedUrl)}" data-ext-title="${MD.escapeHtml(n.title || n.linkedUrl)}" style="font-family:var(--font-mono); font-size:11px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">🔗 ${MD.escapeHtml(n.linkedUrl)}</a>`
            : ''}
          ${n.linkedDocPath
            ? `<div><button type="button" class="kc-move-btn" data-open-doc="${MD.escapeHtml(n.linkedDocPath)}">📄 ${MD.escapeHtml(n.linkedDocPath)}</button></div>`
            : ''}

          <div class="keep-card-actions">
            <div class="keep-color-dots">
              ${KEEP_COLORS.map(
                (c) => `<button type="button" class="keep-color-dot${(n.color || 'default') === c.id ? ' is-active' : ''}" data-note-color="${MD.escapeHtml(n.id)}::${c.id}" style="width:14px; height:14px; background:${c.dot};" title="${MD.escapeHtml(c.label)}"></button>`
              ).join('')}
            </div>
            <div style="display:flex; gap:5px; flex-wrap:wrap;">
              <button type="button" class="btn-sm" data-note-edit="${MD.escapeHtml(n.id)}">✎ Editar</button>
              <button type="button" class="btn-sm btn-accent" data-note-todoc="${MD.escapeHtml(n.id)}::roteiro" title="Transformar em Roteiro (.md)">→ Roteiro</button>
              <button type="button" class="btn-sm" data-note-todoc="${MD.escapeHtml(n.id)}::ideia" title="Transformar em Ideia (.md)">→ Ideia</button>
              <button type="button" class="btn-sm" data-note-archive="${MD.escapeHtml(n.id)}" title="${n.archived ? 'Restaurar' : 'Arquivar'}">${n.archived ? '↩' : '📦'}</button>
              <button type="button" class="btn-sm btn-danger" data-note-del="${MD.escapeHtml(n.id)}" title="Excluir nota">✕</button>
            </div>
          </div>
        </article>
      `;
    };

    const gs = ns.gistSync || {};
    const gistHintBox = gs.lastError
      ? `<div class="settings-toggle-row" style="margin-bottom:14px; border-color:rgba(245,185,66,0.35); background:rgba(245,185,66,0.08); font-size:12px;">
          <div>
            <strong style="color:#ffd479;">Sync Gist Privado:</strong> ${MD.escapeHtml(gs.lastError)}
            ${gs.lastHint ? `<div style="font-size:11px; color:var(--text-2); margin-top:2px;">💡 ${MD.escapeHtml(gs.lastHint)}</div>` : ''}
          </div>
        </div>`
      : gs.gistUrl
      ? `<div class="settings-toggle-row" style="margin-bottom:14px; border-color:rgba(54,211,153,0.32); background:rgba(54,211,153,0.07); font-size:12px;">
          <div>
            <strong style="color:#86efac;">☁️ Gist Privado sincronizado</strong>
            ${gs.lastSyncedAt ? `<span style="color:var(--text-3); margin-left:6px;">(${formatDatePt(gs.lastSyncedAt)})</span>` : ''}
          </div>
          <a class="btn-sm" href="${MD.escapeHtml(gs.gistUrl)}" target="_blank" rel="noopener noreferrer">Abrir Gist Privado ↗</a>
        </div>`
      : '';

    container.innerHTML = `
      <div class="keep-toolbar">
        <div class="cat-toolbar-group">
          <input type="search" class="search-box-sm" id="keepSearchInput" placeholder="Buscar notas, checklists ou tags..." value="${MD.escapeHtml(ns.search)}" style="width:220px; margin:0; height:32px;">
          <select class="select-dark" id="keepColorFilterSel">
            <option value="all"${ns.colorFilter === 'all' ? ' selected' : ''}>Todas as cores</option>
            ${KEEP_COLORS.map((c) => `<option value="${c.id}"${ns.colorFilter === c.id ? ' selected' : ''}>${MD.escapeHtml(c.label)}</option>`).join('')}
          </select>
          <select class="select-dark" id="keepLabelFilterSel">
            <option value="all"${ns.labelFilter === 'all' ? ' selected' : ''}>Todas as tags</option>
            ${Array.from(labelsSet).sort().map((l) => `<option value="${MD.escapeHtml(l)}"${ns.labelFilter === l ? ' selected' : ''}>#${MD.escapeHtml(l)}</option>`).join('')}
          </select>
          <button type="button" class="btn-sm${ns.showArchived ? ' btn-accent' : ''}" id="keepToggleArchivedBtn">${ns.showArchived ? '📦 Vendo Arquivadas' : '📦 Mostrar Arquivadas'}</button>
        </div>

        <div class="cat-toolbar-group">
          <button type="button" class="btn-sm btn-accent" id="keepSyncGistBtn">☁️ Sync Gist Privado</button>
          <button type="button" class="btn-sm" data-keep-export="json">⤓ Exportar JSON</button>
          <button type="button" class="btn-sm" data-keep-export="md">⤓ MD</button>
          <button type="button" class="btn-sm" data-keep-export="txt">⤓ TXT</button>
          <button type="button" class="btn-sm" id="keepImportBtn">⤒ Importar JSON</button>
          <input type="file" id="keepImportFileInput" accept=".json,application/json" hidden>
        </div>
      </div>

      ${gistHintBox}

      <section class="keep-composer${ns.composerColor !== 'default' ? ` kc-${ns.composerColor}` : ''}" id="keepComposerBox">
        ${ns.composerExpanded
          ? `
            <div style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
              <input type="text" class="keep-composer-title" id="keepCompTitle" placeholder="Título da nota..." value="${MD.escapeHtml(ns.compTitleDraft || '')}">
              <button type="button" class="btn-sm${ns.composerPinned ? ' btn-accent' : ''}" id="keepCompPinBtn" title="Fixar nota">📌</button>
            </div>
            ${ns.composerKind === 'checklist'
              ? `<div style="display:flex; flex-direction:column; gap:6px;">
                  ${(ns.composerChecklist || [])
                    .map(
                      (it, idx) => `
                        <div style="display:flex; align-items:center; gap:6px;">
                          <input type="checkbox" data-comp-chk-done="${idx}"${it.done ? ' checked' : ''} style="width:auto;">
                          <input type="text" data-comp-chk-text="${idx}" placeholder="Item da checklist..." value="${MD.escapeHtml(it.text || '')}" style="flex:1; border-bottom:1px solid var(--border-soft); padding:4px 0;">
                          <button type="button" class="btn-sm" data-comp-chk-del="${idx}">✕</button>
                        </div>
                      `
                    )
                    .join('')}
                  <div><button type="button" class="btn-sm" id="keepCompAddChkBtn">+ Adicionar item</button></div>
                </div>`
              : `<textarea id="keepCompBody" rows="3" placeholder="Escreva sua ideia, gancho ou anotação rápida...">${MD.escapeHtml(ns.compBodyDraft || '')}</textarea>`}
            <div class="form-row-2">
              <input type="text" id="keepCompLabels" placeholder="Tags separadas por vírgula (ex.: shorts, pauta)" value="${MD.escapeHtml(ns.compLabelsDraft || '')}" style="border-bottom:1px solid var(--border-soft); padding:5px 0; font-size:12px;">
              <input type="url" id="keepCompUrl" placeholder="Link opcional (https://...)" value="${MD.escapeHtml(ns.compUrlDraft || '')}" style="border-bottom:1px solid var(--border-soft); padding:5px 0; font-size:12px;">
            </div>
            <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap; padding-top:4px; border-top:1px solid var(--border-soft);">
              <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
                <button type="button" class="btn-sm" id="keepCompToggleKindBtn">${ns.composerKind === 'checklist' ? '✎ Modo Texto' : '☑ Modo Checklist'}</button>
                <div class="keep-color-dots">
                  ${KEEP_COLORS.map(
                    (c) => `<button type="button" class="keep-color-dot${ns.composerColor === c.id ? ' is-active' : ''}" data-comp-color="${c.id}" style="background:${c.dot};" title="${MD.escapeHtml(c.label)}"></button>`
                  ).join('')}
                </div>
              </div>
              <div style="display:flex; gap:8px;">
                <button type="button" class="btn-sm" id="keepCompCloseBtn">Fechar</button>
                <button type="button" class="btn-sm btn-accent" id="keepCompSaveBtn">Salvar Nota</button>
              </div>
            </div>
          `
          : `
            <div style="display:flex; align-items:center; justify-content:space-between; gap:10px;">
              <button type="button" id="keepCompExpandBtn" style="flex:1; text-align:left; font-size:13.5px; color:var(--text-2); padding:4px 2px;">Criar uma nota...</button>
              <button type="button" class="btn-sm" id="keepCompQuickChecklistBtn">☑ Nova Checklist</button>
            </div>
          `}
      </section>

      ${!state.serverMode
        ? '<div class="glass-card"><p style="margin:0; color:var(--text-3);">As Notas estilo Keep e Sync Gist Privado funcionam com o servidor local ativo.</p></div>'
        : visibleNotes.length === 0
        ? `<div class="glass-card"><p style="margin:0; color:var(--text-3);">${ns.showArchived ? 'Nenhuma nota arquivada.' : 'Nenhuma nota encontrada. Crie uma nota acima!'}</p></div>`
        : ns.showArchived
        ? `<div class="keep-section-label">ARQUIVADAS (${visibleNotes.length})</div><div class="keep-grid">${visibleNotes.map(renderKeepCard).join('')}</div>`
        : `
          ${pinnedNotes.length ? `<div class="keep-section-label">FIXADAS (${pinnedNotes.length})</div><div class="keep-grid">${pinnedNotes.map(renderKeepCard).join('')}</div>` : ''}
          ${otherNotes.length ? `<div class="keep-section-label">${pinnedNotes.length ? 'OUTRAS' : 'NOTAS'} (${otherNotes.length})</div><div class="keep-grid">${otherNotes.map(renderKeepCard).join('')}</div>` : ''}
        `}
    `;

    const searchInp = document.getElementById('keepSearchInput');
    if (searchInp) {
      searchInp.oninput = () => {
        ns.search = searchInp.value;
        const pos = searchInp.selectionStart;
        renderNotesView(container);
        const again = document.getElementById('keepSearchInput');
        if (again) {
          again.focus();
          again.setSelectionRange(pos, pos);
        }
      };
    }
    document.getElementById('keepColorFilterSel')?.addEventListener('change', (e) => {
      ns.colorFilter = e.target.value;
      renderNotesView(container);
    });
    document.getElementById('keepLabelFilterSel')?.addEventListener('change', (e) => {
      ns.labelFilter = e.target.value;
      renderNotesView(container);
    });
    document.getElementById('keepToggleArchivedBtn')?.addEventListener('click', () => {
      ns.showArchived = !ns.showArchived;
      renderNotesView(container);
    });

    document.getElementById('keepSyncGistBtn')?.addEventListener('click', async () => {
      if (!state.serverMode) return showToast('Requer servidor local ativo.');
      showToast('Sincronizando com Gist privado...');
      try {
        const res = await fetch('/api/notes/sync-gist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ channel: chData.key, mode: 'sync' }),
        });
        const json = await res.json();
        ns.notes = json.notes || ns.notes;
        ns.gistSync = { ...(json.gistSync || {}), lastHint: json.hint || '' };
        if (json.state) state.data = normalizePayload(json.state);
        renderNotesView(container);
        if (json.ok) {
          showToast('Notas sincronizadas no GitHub Gist privado!');
        } else {
          showToast(json.error || 'Falha no sync Gist.');
        }
      } catch (err) {
        showToast(err.message);
      }
    });

    container.querySelectorAll('[data-keep-export]').forEach((btn) => {
      btn.onclick = () => {
        if (!state.serverMode) return showToast('Requer servidor local ativo.');
        const fmt = btn.dataset.keepExport;
        global.open(`/api/notes/export?channel=${encodeURIComponent(chData.key)}&format=${encodeURIComponent(fmt)}`, '_blank', 'noopener');
      };
    });

    const importFileInp = document.getElementById('keepImportFileInput');
    document.getElementById('keepImportBtn')?.addEventListener('click', () => importFileInp?.click());
    importFileInp?.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const parsed = JSON.parse(text);
        const notesPayload = Array.isArray(parsed) ? parsed : parsed.notes;
        const res = await fetch('/api/notes/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ channel: chData.key, notes: notesPayload, mode: 'merge' }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Erro ao importar JSON');
        ns.notes = json.notes || [];
        if (json.state) state.data = normalizePayload(json.state);
        renderNotesView(container);
        showToast(`${json.importedCount || 0} nota(s) importada(s)!`);
      } catch (err) {
        showToast(`Erro na importação: ${err.message}`);
      } finally {
        e.target.value = '';
      }
    });

    document.getElementById('keepCompExpandBtn')?.addEventListener('click', () => {
      ns.composerExpanded = true;
      ns.composerKind = 'note';
      renderNotesView(container);
      document.getElementById('keepCompTitle')?.focus();
    });
    document.getElementById('keepCompQuickChecklistBtn')?.addEventListener('click', () => {
      ns.composerExpanded = true;
      ns.composerKind = 'checklist';
      if (!ns.composerChecklist?.length) ns.composerChecklist = [{ id: 'c1', text: '', done: false }];
      renderNotesView(container);
    });
    document.getElementById('keepCompPinBtn')?.addEventListener('click', () => {
      ns.composerPinned = !ns.composerPinned;
      renderNotesView(container);
    });
    document.getElementById('keepCompToggleKindBtn')?.addEventListener('click', () => {
      ns.composerKind = ns.composerKind === 'checklist' ? 'note' : 'checklist';
      if (ns.composerKind === 'checklist' && !ns.composerChecklist?.length) {
        ns.composerChecklist = [{ id: 'c1', text: '', done: false }];
      }
      renderNotesView(container);
    });
    document.getElementById('keepCompCloseBtn')?.addEventListener('click', () => {
      ns.composerExpanded = false;
      renderNotesView(container);
    });
    document.getElementById('keepCompTitle')?.addEventListener('input', (e) => { ns.compTitleDraft = e.target.value; });
    document.getElementById('keepCompBody')?.addEventListener('input', (e) => { ns.compBodyDraft = e.target.value; });
    document.getElementById('keepCompLabels')?.addEventListener('input', (e) => { ns.compLabelsDraft = e.target.value; });
    document.getElementById('keepCompUrl')?.addEventListener('input', (e) => { ns.compUrlDraft = e.target.value; });

    container.querySelectorAll('[data-comp-color]').forEach((btn) => {
      btn.onclick = () => {
        ns.composerColor = btn.dataset.compColor;
        renderNotesView(container);
      };
    });
    container.querySelectorAll('[data-comp-chk-done]').forEach((chk) => {
      chk.onchange = () => {
        ns.composerChecklist[Number(chk.dataset.compChkDone)].done = chk.checked;
      };
    });
    container.querySelectorAll('[data-comp-chk-text]').forEach((inp) => {
      inp.oninput = () => {
        ns.composerChecklist[Number(inp.dataset.compChkText)].text = inp.value;
      };
      inp.onkeydown = (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          ns.composerChecklist.push({ id: `c-${Date.now()}`, text: '', done: false });
          renderNotesView(container);
        }
      };
    });
    container.querySelectorAll('[data-comp-chk-del]').forEach((btn) => {
      btn.onclick = () => {
        ns.composerChecklist.splice(Number(btn.dataset.compChkDel), 1);
        renderNotesView(container);
      };
    });
    document.getElementById('keepCompAddChkBtn')?.addEventListener('click', () => {
      ns.composerChecklist.push({ id: `c-${Date.now()}`, text: '', done: false });
      renderNotesView(container);
    });

    document.getElementById('keepCompSaveBtn')?.addEventListener('click', async () => {
      if (!state.serverMode) return showToast('Requer servidor local ativo.');
      const title = (ns.compTitleDraft || '').trim();
      const content = (ns.compBodyDraft || '').trim();
      const cleanChecklist = (ns.composerChecklist || []).filter((it) => it.text.trim());
      if (!title && !content && !cleanChecklist.length) {
        showToast('Digite um título, texto ou item de checklist.');
        return;
      }
      try {
        const res = await fetch('/api/notes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            channel: chData.key,
            title,
            content: ns.composerKind === 'note' ? content : '',
            kind: ns.composerKind,
            checklist: ns.composerKind === 'checklist' ? cleanChecklist : [],
            color: ns.composerColor,
            pinned: ns.composerPinned,
            labels: ns.compLabelsDraft || '',
            linkedUrl: ns.compUrlDraft || '',
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Erro ao salvar nota');
        ns.notes = json.notes || [];
        ns.gistSync = json.gistSync || ns.gistSync;
        if (json.state) state.data = normalizePayload(json.state);
        ns.composerExpanded = false;
        ns.compTitleDraft = '';
        ns.compBodyDraft = '';
        ns.compLabelsDraft = '';
        ns.compUrlDraft = '';
        ns.composerPinned = false;
        ns.composerColor = 'default';
        ns.composerChecklist = [{ id: 'c1', text: '', done: false }];
        renderNotesView(container);
        showToast('Nota criada!');
      } catch (err) {
        showToast(err.message);
      }
    });

    const patchNote = async (noteId, patch, toastMsg = '') => {
      if (!state.serverMode) return;
      try {
        const res = await fetch('/api/notes', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ channel: chData.key, id: noteId, ...patch }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Erro ao atualizar nota');
        ns.notes = json.notes || [];
        if (json.state) state.data = normalizePayload(json.state);
        renderNotesView(container);
        if (toastMsg) showToast(toastMsg);
      } catch (err) {
        showToast(err.message);
      }
    };

    container.querySelectorAll('[data-note-pin]').forEach((btn) => {
      btn.onclick = () => {
        const note = allNotes.find((x) => x.id === btn.dataset.notePin);
        if (note) patchNote(note.id, { pinned: !note.pinned });
      };
    });
    container.querySelectorAll('[data-note-color]').forEach((btn) => {
      btn.onclick = () => {
        const [noteId, color] = btn.dataset.noteColor.split('::');
        patchNote(noteId, { color });
      };
    });
    container.querySelectorAll('[data-note-chk]').forEach((chk) => {
      chk.onchange = () => {
        const [noteId, itemId] = chk.dataset.noteChk.split('::');
        const note = allNotes.find((x) => x.id === noteId);
        if (!note) return;
        const nextList = (note.checklist || []).map((it) => (it.id === itemId ? { ...it, done: chk.checked } : it));
        patchNote(noteId, { checklist: nextList });
      };
    });
    container.querySelectorAll('[data-note-edit]').forEach((btn) => {
      btn.onclick = () => {
        const note = allNotes.find((x) => x.id === btn.dataset.noteEdit);
        if (note) openNoteEditModal(note);
      };
    });
    container.querySelectorAll('[data-note-archive]').forEach((btn) => {
      btn.onclick = () => {
        const note = allNotes.find((x) => x.id === btn.dataset.noteArchive);
        if (note) patchNote(note.id, { archived: !note.archived }, note.archived ? 'Nota restaurada!' : 'Nota arquivada.');
      };
    });
    container.querySelectorAll('[data-note-del]').forEach((btn) => {
      btn.onclick = async () => {
        if (!confirm('Excluir esta nota permanentemente?')) return;
        try {
          const res = await fetch(`/api/notes?channel=${encodeURIComponent(chData.key)}&id=${encodeURIComponent(btn.dataset.noteDel)}`, {
            method: 'DELETE',
          });
          const json = await res.json();
          if (!res.ok) throw new Error(json.error || 'Erro ao excluir nota');
          ns.notes = json.notes || [];
          if (json.state) state.data = normalizePayload(json.state);
          renderNotesView(container);
          showToast('Nota excluída.');
        } catch (err) {
          showToast(err.message);
        }
      };
    });
    container.querySelectorAll('[data-note-todoc]').forEach((btn) => {
      btn.onclick = async () => {
        const [noteId, targetType] = btn.dataset.noteTodoc.split('::');
        try {
          const res = await fetch('/api/notes/to-doc', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ channel: chData.key, noteId, targetType }),
          });
          const json = await res.json();
          if (!res.ok) throw new Error(json.error || 'Erro ao converter nota em .md');
          if (json.state) state.data = normalizePayload(json.state);
          showToast(`Criado ${json.docPath}!`);
          setView('scripts', json.docPath);
        } catch (err) {
          showToast(err.message);
        }
      };
    });
    container.querySelectorAll('[data-open-doc]').forEach((btn) => {
      btn.onclick = () => setView('scripts', btn.dataset.openDoc);
    });
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
        title: 'Editar Roteiro via Git (Dinâmica 1 — Nunca sobrescrever direto)',
        text: `Leia ${wsPath}/AGENTS.md e ${wsPath}/../00-VERSIONAMENTO-ROTEIROS.md. Revise "${targetPath}" (canal ${chData.key}) preservando o histórico e salve como revisão Git: crom-studio roteiro commit --canal ${chData.key} --arquivo "${targetPath}" --versao principal --autor "Agente" --msg "Resumo do ajuste" --stdin`,
      },
      {
        title: 'Criar Versão Alternativa / Variante (Dinâmica 2)',
        text: `Leia ${wsPath}/AGENTS.md e "${targetPath}". Crie uma versão alternativa sem alterar a principal via: crom-studio roteiro nova-versao --canal ${chData.key} --arquivo "${targetPath}" --nome "v2-enxuta" --desc "Abordagem alternativa mais curta" --autor "Agente" --stdin`,
      },
      {
        title: 'Escrever Roteiro Longo a partir de uma Ficha/Série',
        text: `Leia AGENTS.md e "${targetPath}" em ${wsPath}. Crie um roteiro longo completo em 02-roteiros/rascunhos/ ou na pasta da série mantendo o esquema YAML e o tom de ${channel.handle || channel.name}. Depois rode: crom-studio --sync.`,
      },
      {
        title: 'Levar Roteiro para a Esteira Kdenlive + MCP',
        text: `Leia "${targetPath}" em ${wsPath} e siga PROCESSO-NOVO-VIDEO.md no diretório Kdenlive. Inicialize o projeto com ./criar_video.sh --canal ${chData.key} <slug> e monte a timeline usando o MCP kdenlive-mcp-plus.`,
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
     VIEW 8: CONFIGURAÇÕES DO WORKSPACE + ACESSO REMOTO (v4)
  ========================================================= */
  function updateRemoteChip() {
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
    chip.title = [rs.lanUrl ? `LAN: ${rs.lanUrl}` : '', rs.ngrokUrl ? `ngrok: ${rs.ngrokUrl}` : ''].filter(Boolean).join(' | ');

    if (offChip) {
      offChip.classList.toggle('hidden', !rs.ngrokActive);
    }
  }

  async function loadRemoteStatus({ quiet = false, rerender = false } = {}) {
    if (!state.serverMode) return null;
    if (!quiet) state.remoteLoading = true;
    try {
      const res = await fetch('/api/remote/status', { cache: 'no-store' });
      const json = await res.json();
      if (res.ok) {
        state.remoteStatus = json;
        updateRemoteChip();
      }
      return state.remoteStatus;
    } catch {
      return null;
    } finally {
      state.remoteLoading = false;
      if (rerender && state.view === 'settings') {
        renderSettingsView(document.getElementById('viewContainer'));
      }
    }
  }

  async function loadSettingsConfig({ force = false } = {}) {
    if (!state.serverMode) return null;
    if (!force && state.settingsLoading) return state.settingsConfig;
    state.settingsLoading = true;
    state.settingsError = null;
    try {
      const [cfgRes] = await Promise.all([
        fetch('/api/config', { cache: 'no-store' }),
        loadRemoteStatus({ quiet: true, rerender: false }),
      ]);
      const json = await cfgRes.json();
      if (!cfgRes.ok) throw new Error(json.error || 'Erro ao carregar configurações');
      state.settingsConfig = json.config;
      if (!state.settingsChannelKey || !state.settingsConfig?.channels?.[state.settingsChannelKey]) {
        state.settingsChannelKey = state.settingsConfig?.channels?.[state.activeChannel]
          ? state.activeChannel
          : (state.settingsConfig?.defaultChannel || state.settingsConfig?.channelOrder?.[0] || null);
      }
      return state.settingsConfig;
    } catch (err) {
      state.settingsError = err.message;
      return null;
    } finally {
      state.settingsLoading = false;
      if (state.view === 'settings') {
        renderSettingsView(document.getElementById('viewContainer'));
      }
    }
  }

  function renderSettingsView(container) {
    if (!container) return;

    if (!state.serverMode) {
      container.innerHTML = `
        <section class="settings-layout">
          <div class="settings-card">
            <div class="settings-card-head">
              <h3>Configurações do Workspace</h3>
              <span class="settings-path-badge is-miss">Modo Standalone</span>
            </div>
            <p style="margin:0; font-size:13px; color:var(--text-2); line-height:1.6;">
              A edição de workspaces, pastas locais, banners, links e configurações em <code>config.local.json</code> está disponível apenas com o servidor local ativo:
              <code>./bin/crom-studio --tray</code> (ou <code>npm start</code>).
            </p>
            <div class="settings-form-grid" style="margin-top:6px;">
              <div class="settings-toggle-row settings-field-full">
                <span>Fluxo de Cores Dinâmico</span>
                <label class="switch-inline">
                  <input type="checkbox" id="setColorDynamic"${state.color.dynamic ? ' checked' : ''}>
                  <span>Ativo</span>
                </label>
              </div>
              <div class="settings-toggle-row settings-field-full">
                <span>Fonte do Leitor / Editor</span>
                <div class="zoom-group">
                  <button type="button" id="setFontMinusBtn">A-</button>
                  <span id="setFontVal">${state.readerFontSize}px</span>
                  <button type="button" id="setFontPlusBtn">A+</button>
                </div>
              </div>
            </div>
          </div>
        </section>
      `;
      const dynChk = document.getElementById('setColorDynamic');
      if (dynChk) {
        dynChk.onchange = (e) => {
          state.color.dynamic = e.target.checked;
          ColorFlowEngine.savePrefs();
          ColorFlowEngine.applyCurrent(performance.now());
          ColorFlowEngine.renderMenu();
        };
      }
      const minusBtn = document.getElementById('setFontMinusBtn');
      const plusBtn = document.getElementById('setFontPlusBtn');
      const setFont = (next) => {
        state.readerFontSize = Math.min(24, Math.max(13, next));
        const prefs = loadJsonStorage(STORAGE_KEY_PREFS, {});
        prefs.readerFontSize = state.readerFontSize;
        saveJsonStorage(STORAGE_KEY_PREFS, prefs);
        const val = document.getElementById('setFontVal');
        if (val) val.textContent = `${state.readerFontSize}px`;
      };
      if (minusBtn) minusBtn.onclick = () => setFont(state.readerFontSize - 1);
      if (plusBtn) plusBtn.onclick = () => setFont(state.readerFontSize + 1);
      return;
    }

    if (!state.settingsConfig && !state.settingsError) {
      if (!state.settingsLoading) loadSettingsConfig();
      container.innerHTML = `<div class="settings-card"><p style="margin:0; color:var(--text-3);">Carregando configurações do Studio...</p></div>`;
      return;
    }

    if (state.settingsError && !state.settingsConfig) {
      container.innerHTML = `
        <div class="settings-card">
          <div class="settings-card-head"><h3>Erro ao carregar configurações</h3></div>
          <p style="margin:0; color:var(--danger);">${MD.escapeHtml(state.settingsError)}</p>
          <div><button type="button" class="btn-sm btn-accent" id="retrySettingsBtn">Tentar novamente</button></div>
        </div>
      `;
      const retryBtn = document.getElementById('retrySettingsBtn');
      if (retryBtn) retryBtn.onclick = () => loadSettingsConfig({ force: true });
      return;
    }

    const cfg = state.settingsConfig;
    const order = cfg.channelOrder || Object.keys(cfg.channels || {});
    if (!state.settingsChannelKey || !cfg.channels[state.settingsChannelKey]) {
      state.settingsChannelKey = cfg.channels[state.activeChannel]
        ? state.activeChannel
        : (cfg.defaultChannel || order[0]);
    }
    const selectedKey = state.settingsChannelKey;
    const ch = cfg.channels[selectedKey] || {};
    const seriesItems = Array.isArray(ch.seriesList) ? ch.seriesList : [];
    const spotSet = new Set(Array.isArray(ch.spotlightSeries) ? ch.spotlightSeries : []);
    const allCheckboxSeries = Array.from(new Set([...seriesItems, ...spotSet]));
    const links = ch.links || {};
    const initials = getChannelInitials(ch);

    const tabsHtml = order
      .map((k) => {
        const item = cfg.channels[k] || {};
        const isAct = k === selectedKey;
        const isPaused = item.status === 'pausado';
        const isHidden = item.status === 'oculto';
        return `
          <button type="button" class="settings-ws-tab${isAct ? ' is-active' : ''}" data-settings-tab="${MD.escapeHtml(k)}">
            <span>${MD.escapeHtml(item.name || k)}</span>
            <span style="font-family:var(--font-mono); font-size:10.5px; color:var(--text-3);">${MD.escapeHtml(k)}</span>
            ${isHidden ? '' : `<span class="channel-status-badge ${isPaused ? 'is-pausado' : 'is-ativo'}">${MD.escapeHtml(item.statusLabel || (isPaused ? 'PAUSADO' : 'ATIVO'))}</span>`}
          </button>
        `;
      })
      .join('');

    if (!state.remoteStatus && !state.remoteLoading) {
      loadRemoteStatus({ quiet: false, rerender: true });
    }
    const rs = state.remoteStatus || {};
    const lanInfo = rs.lan || {};
    const ngrokInfo = rs.ngrok || {};
    const pinInfo = rs.pin || {};
    const lanEnabled = Boolean(rs.lanEnabled ?? lanInfo.enabled);
    const lanUrl = rs.lanUrl || lanInfo.url || '';
    const lanQrSvg = rs.lanQrSvg || lanInfo.qrSvg || '';
    const ngrokActive = Boolean(rs.ngrokActive ?? ngrokInfo.active);
    const ngrokUrl = rs.ngrokUrl || ngrokInfo.url || '';
    const ngrokQrSvg = rs.ngrokQrSvg || ngrokInfo.qrSvg || '';
    const hasNgrokToken = Boolean(rs.hasNgrokAuthtoken ?? ngrokInfo.hasAuthtoken);
    const pinEnabled = Boolean(rs.pinEnabled ?? pinInfo.enabled);
    const pinConfigured = Boolean(rs.pinConfigured ?? pinInfo.configured);

    container.innerHTML = `
      <section class="settings-layout">
        <div class="section-subhead" style="margin:0;">
          <div class="settings-ws-tabs">${tabsHtml}</div>
          <div style="display:flex; gap:8px; flex-wrap:wrap;">
            <button type="button" class="btn-sm" id="settingsNewWsBtn">+ Novo Workspace</button>
            <button type="button" class="btn-primary" id="settingsSaveBtn">💾 Salvar Configurações</button>
          </div>
        </div>

        <div class="settings-grid">
          <!-- Card 1: Identidade, Status & Métricas -->
          <div class="settings-card">
            <div class="settings-card-head">
              <h3>1. Identidade, Status & Métricas</h3>
              <span style="font-family:var(--font-mono); font-size:11px; color:var(--text-3);">chave: ${MD.escapeHtml(selectedKey)}</span>
            </div>

            <div class="settings-avatar-preview">
              <img id="setAvatarPreview" src="${MD.escapeHtml(ch.avatar || '')}" alt="${MD.escapeHtml(ch.name || selectedKey)}" referrerpolicy="no-referrer" style="${ch.avatar ? '' : 'display:none;'}" onerror="this.style.display='none'; document.getElementById('setAvatarFallback').style.display='grid';">
              <div id="setAvatarFallback" style="width:44px; height:44px; border-radius:999px; background:rgba(var(--accent-rgb),0.2); border:1px solid var(--border-strong); display:${ch.avatar ? 'none' : 'grid'}; place-items:center; font-weight:700; flex-shrink:0;">${MD.escapeHtml(initials)}</div>
              <div style="min-width:0; flex:1;">
                <div style="font-weight:600; font-size:13.5px;" id="setPreviewName">${MD.escapeHtml(ch.name || selectedKey)}</div>
                <div style="font-family:var(--font-mono); font-size:11px; color:var(--text-3);" id="setPreviewHandle">${MD.escapeHtml(ch.handle || '')}</div>
              </div>
            </div>

            <div class="settings-form-grid">
              <label>
                <span>Nome de exibição</span>
                <input type="text" id="setWsName" value="${MD.escapeHtml(ch.name || '')}">
              </label>
              <label>
                <span>Handle (@canal)</span>
                <input type="text" id="setWsHandle" value="${MD.escapeHtml(ch.handle || '')}">
              </label>
              <label>
                <span>YouTube Channel ID</span>
                <input type="text" id="setWsChannelId" value="${MD.escapeHtml(ch.channelId || '')}" placeholder="UC...">
              </label>
              <label>
                <span>URL do Canal</span>
                <input type="text" id="setWsUrl" value="${MD.escapeHtml(ch.url || '')}">
              </label>
              <label class="settings-field-full">
                <span>URL do Avatar</span>
                <input type="text" id="setWsAvatar" value="${MD.escapeHtml(ch.avatar || '')}" placeholder="https://...">
              </label>
              <label class="settings-field-full">
                <span>Bio / Descrição</span>
                <textarea id="setWsBio" rows="2">${MD.escapeHtml(ch.bio || '')}</textarea>
              </label>
              <label>
                <span>Status</span>
                <select id="setWsStatus">
                  <option value="ativo"${ch.status === 'ativo' ? ' selected' : ''}>Ativo</option>
                  <option value="pausado"${ch.status === 'pausado' ? ' selected' : ''}>Pausado / Offline</option>
                  <option value="oculto"${ch.status === 'oculto' ? ' selected' : ''}>Oculto (sem badge/ponto)</option>
                </select>
              </label>
              <label>
                <span>Rótulo do Status (statusLabel)</span>
                <input type="text" id="setWsStatusLabel" value="${MD.escapeHtml(ch.statusLabel || '')}" placeholder="Ex.: Ativo, Pausado...">
              </label>
              <label>
                <span>Inscritos</span>
                <input type="number" id="setWsSubscribers" min="0" value="${Number(ch.subscribers || 0)}">
              </label>
              <label>
                <span>Total de Vídeos Públicos</span>
                <input type="number" id="setWsTotalVideos" min="0" value="${ch.totalVideos !== null && ch.totalVideos !== undefined ? Number(ch.totalVideos) : ''}" placeholder="auto">
              </label>
            </div>
          </div>

          <!-- Card 2: Banner da Visão Geral -->
          <div class="settings-card">
            <div class="settings-card-head">
              <h3>2. Banner da Visão Geral</h3>
            </div>
            <div class="settings-toggle-row">
              <div>
                <div style="font-size:12.5px; font-weight:600; color:var(--text-1);">Exibir banner na Visão Geral</div>
                <div style="font-size:11px; color:var(--text-3);">Mostra aviso ou destaque configurável no topo do Dashboard deste workspace.</div>
              </div>
              <label class="switch-inline">
                <input type="checkbox" id="setBannerEnabled"${ch.bannerEnabled ? ' checked' : ''}>
                <span>Ativado</span>
              </label>
            </div>
            <div class="settings-form-grid">
              <label>
                <span>Badge do Banner</span>
                <input type="text" id="setBannerBadge" value="${MD.escapeHtml(ch.bannerBadge || '')}" placeholder="Ex.: PAUSADO, NOVO...">
              </label>
              <label>
                <span>Doc vinculado (opcional)</span>
                <input type="text" id="setBannerDocPath" value="${MD.escapeHtml(ch.bannerDocPath || '')}" placeholder="Ex.: 00-canal/identidade-e-status.md">
              </label>
              <label class="settings-field-full">
                <span>Título do Banner</span>
                <input type="text" id="setBannerTitle" value="${MD.escapeHtml(ch.bannerTitle || '')}" placeholder="Título principal exibido no banner">
              </label>
              <label class="settings-field-full">
                <span>Subtítulo / Descrição do Banner</span>
                <textarea id="setBannerSubtitle" rows="3" placeholder="Detalhes contextuais do banner...">${MD.escapeHtml(ch.bannerSubtitle || '')}</textarea>
              </label>
            </div>
          </div>

          <!-- Card 3: Pastas, Séries & Links -->
          <div class="settings-card">
            <div class="settings-card-head">
              <h3>3. Pastas, Séries & Links</h3>
              <span class="settings-path-badge ${ch.workspaceExists ? 'is-ok' : 'is-miss'}">${ch.workspaceExists ? '✓ Pasta no disco OK' : '✕ Pasta não encontrada'}</span>
            </div>
            <div class="settings-form-grid">
              <label class="settings-field-full">
                <span>Caminho da Pasta do Workspace</span>
                <input type="text" id="setWsPath" value="${MD.escapeHtml(ch.workspacePathRaw || ch.workspacePath || '')}" required>
              </label>
              <label class="settings-field-full">
                <span>Subpasta Kdenlive</span>
                <input type="text" id="setWsKdenliveFolder" value="${MD.escapeHtml(ch.kdenliveFolder || 'videos')}">
              </label>
              <label class="settings-field-full">
                <span>Séries do Workspace (uma por linha)</span>
                <textarea id="setWsSeriesList" rows="4">${MD.escapeHtml(seriesItems.join('\n'))}</textarea>
              </label>
              <div class="settings-field-full">
                <span>Séries em Destaque na Visão Geral (Spotlight)</span>
                <div class="settings-series-checks" id="setSpotlightChecks">
                  ${allCheckboxSeries.length
                    ? allCheckboxSeries
                        .map(
                          (s) => `
                            <label class="settings-series-chk">
                              <input type="checkbox" name="setSpotlightSerie" value="${MD.escapeHtml(s)}"${spotSet.has(s) ? ' checked' : ''}>
                              <span>${MD.escapeHtml(s)}</span>
                            </label>
                          `
                        )
                        .join('')
                    : '<span style="font-size:11.5px; color:var(--text-3);">Adicione séries acima para selecionar destaques.</span>'}
                </div>
              </div>
              <label>
                <span>GitHub</span>
                <input type="text" id="setLinkGithub" value="${MD.escapeHtml(links.github || '')}" placeholder="https://github.com/...">
              </label>
              <label>
                <span>Hub / Site</span>
                <input type="text" id="setLinkHub" value="${MD.escapeHtml(links.hub || '')}" placeholder="https://...">
              </label>
              <label>
                <span>TabNews</span>
                <input type="text" id="setLinkTabnews" value="${MD.escapeHtml(links.tabnews || '')}">
              </label>
              <label>
                <span>Medium</span>
                <input type="text" id="setLinkMedium" value="${MD.escapeHtml(links.medium || '')}">
              </label>
              <label>
                <span>TikTok</span>
                <input type="text" id="setLinkTiktok" value="${MD.escapeHtml(links.tiktok || '')}">
              </label>
              <label>
                <span>X / Twitter</span>
                <input type="text" id="setLinkX" value="${MD.escapeHtml(links.x || '')}">
              </label>
            </div>
          </div>

          <!-- Card 4: Global & Aparência -->
          <div class="settings-card">
            <div class="settings-card-head">
              <h3>4. Global & Aparência</h3>
              <span style="font-family:var(--font-mono); font-size:11px; color:var(--text-3);">${MD.escapeHtml(cfg.writableFile || 'config.local.json')}</span>
            </div>
            <div class="settings-form-grid">
              <label>
                <span>Workspace Padrão</span>
                <select id="setDefaultChannel">
                  ${order
                    .map((k) => `<option value="${MD.escapeHtml(k)}"${cfg.defaultChannel === k ? ' selected' : ''}>${MD.escapeHtml(cfg.channels[k]?.name || k)} (${MD.escapeHtml(k)})</option>`)
                    .join('')}
                </select>
              </label>
              <div>
                <span>Status da Fábrica Kdenlive</span>
                <div style="padding-top:4px;">
                  <span class="settings-path-badge ${cfg.kdenliveExists ? 'is-ok' : 'is-miss'}">${cfg.kdenliveExists ? '✓ Kdenlive encontrado' : '✕ Pasta Kdenlive ausente'}</span>
                </div>
              </div>
              <label class="settings-field-full">
                <span>Kdenlive Root (kdenliveRoot)</span>
                <input type="text" id="setKdenliveRoot" value="${MD.escapeHtml(cfg.kdenliveRootRaw || cfg.kdenliveRoot || '')}">
              </label>
              <label>
                <span>Host</span>
                <input type="text" id="setHost" value="${MD.escapeHtml(cfg.host || '127.0.0.1')}">
              </label>
              <label>
                <span>Porta</span>
                <input type="number" id="setPort" min="1024" max="65535" value="${Number(cfg.port || 4173)}">
              </label>
            </div>

            <div class="settings-toggle-row" id="settingsRestartAlert" style="background:rgba(245,185,66,0.08); border-color:rgba(245,185,66,0.28); font-size:11.5px; color:#ffd479;">
              <span>Alterações em <strong>Host</strong> ou <strong>Porta</strong> exigem reiniciar o servidor para entrar em vigor.</span>
            </div>

            <div class="settings-toggle-row">
              <div>
                <div style="font-size:12.5px; font-weight:600; color:var(--text-1);">ColorFlow Dinâmico</div>
                <div style="font-size:11px; color:var(--text-3);">Transição suave das cores de destaque e aurora.</div>
              </div>
              <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
                <label class="switch-inline">
                  <input type="checkbox" id="setColorDynamic"${state.color.dynamic ? ' checked' : ''}>
                  <span>Ativo</span>
                </label>
                <div class="seg-mini" id="setColorSpeedGroup">
                  <button type="button" data-speed="slow" class="${state.color.speed === 'slow' ? 'active' : ''}">Ultra Suave</button>
                  <button type="button" data-speed="medium" class="${state.color.speed === 'medium' ? 'active' : ''}">Suave</button>
                  <button type="button" data-speed="fast" class="${state.color.speed === 'fast' ? 'active' : ''}">Vivo</button>
                </div>
              </div>
            </div>

            <div class="settings-toggle-row">
              <span>Tamanho da fonte no Leitor / Editor</span>
              <div class="zoom-group">
                <button type="button" id="setFontMinusBtn">A-</button>
                <span id="setFontVal">${state.readerFontSize}px</span>
                <button type="button" id="setFontPlusBtn">A+</button>
              </div>
            </div>

            <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:4px;">
              <button type="button" class="btn-sm" id="settingsSyncWorkspaceBtn">↻ Sync Workspace</button>
              <button type="button" class="btn-sm" id="settingsSyncRssBtn">↻ Sync RSS (${MD.escapeHtml(selectedKey)})</button>
            </div>
          </div>

          <!-- Card 5: Acesso Remoto (Wi-Fi Local, ngrok & QR Code) -->
          <div class="settings-card remote-card" id="settingsRemoteCard">
            <div class="settings-card-head">
              <h3>5. Acesso Remoto (Wi-Fi Local, ngrok & QR Code)</h3>
              <button type="button" class="btn-sm" id="remoteRefreshBtn">↻ Atualizar Status</button>
            </div>

            <div class="remote-blocks-grid">
              <!-- Bloco Wi-Fi Local -->
              <div class="remote-block">
                <div class="remote-block-head">
                  <strong style="font-size:13.5px;">📶 Wi-Fi Local (Rede Interna)</strong>
                  <span class="settings-path-badge ${lanEnabled ? 'is-ok' : 'is-miss'}">${lanEnabled ? 'Ativo' : 'Desligado'}</span>
                </div>
                <p style="margin:0; font-size:12px; color:var(--text-2); line-height:1.45;">
                  O celular precisa estar conectado na <strong>mesma rede Wi-Fi</strong> deste computador.
                </p>
                <div style="display:flex; gap:8px; flex-wrap:wrap;">
                  <button type="button" class="btn-sm ${lanEnabled ? 'btn-danger' : 'btn-accent'}" id="remoteLanToggleBtn">
                    ${lanEnabled ? '⏹ Desligar Wi-Fi LAN' : '▶ Ligar Wi-Fi LAN'}
                  </button>
                </div>
                ${lanInfo.error ? `<div style="font-size:11.5px; color:var(--danger);">${MD.escapeHtml(lanInfo.error)}</div>` : ''}
                ${lanEnabled && lanUrl
                  ? `
                    <div class="remote-url-box">
                      <a href="${MD.escapeHtml(lanUrl)}" target="_blank" rel="noopener noreferrer">${MD.escapeHtml(lanUrl)}</a>
                      <button type="button" class="kc-move-btn" id="remoteCopyLanBtn">Copiar</button>
                    </div>
                    ${lanQrSvg ? `<div class="remote-qr-box" id="remoteLanQrBox" aria-label="QR Code Wi-Fi LAN">${lanQrSvg}</div>` : ''}
                  `
                  : '<div style="font-size:11.5px; color:var(--text-3);">Ative para gerar o link local e o QR Code escaneável no celular.</div>'}
              </div>

              <!-- Bloco Túnel Público (ngrok) -->
              <div class="remote-block">
                <div class="remote-block-head">
                  <strong style="font-size:13.5px;">🌐 Túnel Público (ngrok)</strong>
                  <span class="settings-path-badge ${ngrokActive ? 'is-ok' : 'is-miss'}">${ngrokActive ? 'Túnel ON' : 'Desligado'}</span>
                </div>
                <label style="display:flex; flex-direction:column; gap:4px; font-size:12px; color:var(--text-2);">
                  <span>Authtoken ngrok (opcional)</span>
                  <input type="password" id="remoteNgrokTokenInput" autocomplete="off" placeholder="${hasNgrokToken ? 'Authtoken configurado (preencha só para alterar)' : 'Cole seu Authtoken do ngrok.com'}" style="width:100%; box-sizing:border-box; padding:8px 10px; border-radius:8px; background:var(--bg-input); border:1px solid var(--border); font-size:12px;">
                </label>
                <div style="display:flex; gap:8px; flex-wrap:wrap;">
                  ${ngrokActive
                    ? `<button type="button" class="btn-ngrok-stop" id="remoteNgrokStopBtn">⏹ Desligar ngrok</button>`
                    : `<button type="button" class="btn-ngrok-start" id="remoteNgrokStartBtn">▶ Ativar ngrok</button>`}
                </div>
                ${ngrokInfo.error ? `<div style="font-size:11.5px; color:var(--danger);">${MD.escapeHtml(ngrokInfo.error)}</div>` : ''}
                ${ngrokActive && ngrokUrl
                  ? `
                    <div class="remote-url-box">
                      <a href="${MD.escapeHtml(ngrokUrl)}" target="_blank" rel="noopener noreferrer">${MD.escapeHtml(ngrokUrl)}</a>
                      <button type="button" class="kc-move-btn" id="remoteCopyNgrokBtn">Copiar</button>
                    </div>
                    ${ngrokQrSvg ? `<div class="remote-qr-box" id="remoteNgrokQrBox" aria-label="QR Code Túnel ngrok">${ngrokQrSvg}</div>` : ''}
                  `
                  : `<div style="font-size:11.5px; color:var(--text-3);">${ngrokInfo.available === false ? 'Binário ngrok não encontrado no sistema.' : 'Gera um endereço HTTPS público temporário para acessar de qualquer lugar.'}</div>`}
              </div>

              <!-- Bloco PIN de Acesso Remoto -->
              <div class="remote-block">
                <div class="remote-block-head">
                  <strong style="font-size:13.5px;">🔐 PIN de Acesso Remoto</strong>
                  <span class="settings-path-badge ${pinEnabled && pinConfigured ? 'is-ok' : 'is-miss'}">${pinEnabled && pinConfigured ? 'Protegido' : 'Livre'}</span>
                </div>
                <p style="margin:0; font-size:12px; color:var(--text-2); line-height:1.45;">
                  O acesso local em <code>127.0.0.1</code> nunca pede PIN. Apenas conexões via Wi-Fi LAN ou ngrok solicitam desbloqueio.
                </p>
                <label class="switch-inline" style="font-size:12.5px; color:var(--text-1);">
                  <input type="checkbox" id="remotePinEnabledChk"${pinEnabled ? ' checked' : ''}>
                  <span>Ativar proteção por PIN</span>
                </label>
                <label style="display:flex; flex-direction:column; gap:4px; font-size:12px; color:var(--text-2);">
                  <span>PIN (4–8 dígitos)</span>
                  <input type="password" inputmode="numeric" maxlength="8" id="remotePinInput" autocomplete="new-password" placeholder="${pinConfigured ? 'PIN já configurado (digite novo para alterar)' : 'Ex.: 2026'}" style="width:100%; box-sizing:border-box; padding:8px 10px; border-radius:8px; background:var(--bg-input); border:1px solid var(--border); font-size:12.5px;">
                </label>
                <div style="display:flex; gap:8px; flex-wrap:wrap;">
                  <button type="button" class="btn-sm btn-accent" id="remotePinSaveBtn">Salvar PIN</button>
                  ${pinConfigured ? '<button type="button" class="btn-sm btn-danger" id="remotePinClearBtn">Limpar PIN</button>' : ''}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="settings-danger-zone">
          <div>
            <strong style="font-size:13px; color:#fda4af;">Zona de Perigo — Remover Workspace da Configuração</strong>
            <div style="font-size:11.5px; color:var(--text-2); margin-top:2px;">
              Remove apenas a entrada <code>${MD.escapeHtml(selectedKey)}</code> do <code>${MD.escapeHtml(cfg.writableFile || 'config.local.json')}</code>. Os arquivos <code>.md</code> no disco <strong>não</strong> são apagados.
            </div>
          </div>
          <button type="button" class="btn-sm btn-danger" id="settingsDeleteWsBtn"${order.length <= 1 ? ' disabled title="Não é possível remover o único workspace"' : ''}>Remover Workspace</button>
        </div>
      </section>
    `;

    container.querySelectorAll('[data-settings-tab]').forEach((btn) => {
      btn.onclick = () => {
        state.settingsChannelKey = btn.dataset.settingsTab;
        renderSettingsView(container);
      };
    });

    const newWsBtn = document.getElementById('settingsNewWsBtn');
    if (newWsBtn) newWsBtn.onclick = () => openNewWorkspaceModal();

    const avatarInp = document.getElementById('setWsAvatar');
    const avatarPrev = document.getElementById('setAvatarPreview');
    const avatarFb = document.getElementById('setAvatarFallback');
    if (avatarInp && avatarPrev && avatarFb) {
      avatarInp.oninput = () => {
        const url = avatarInp.value.trim();
        if (url) {
          avatarPrev.style.display = 'block';
          avatarFb.style.display = 'none';
          avatarPrev.src = url;
        } else {
          avatarPrev.style.display = 'none';
          avatarFb.style.display = 'grid';
        }
      };
    }

    const wsNameInp = document.getElementById('setWsName');
    if (wsNameInp) {
      wsNameInp.oninput = () => {
        const nm = document.getElementById('setPreviewName');
        if (nm) nm.textContent = wsNameInp.value.trim() || selectedKey;
        if (avatarFb) avatarFb.textContent = (wsNameInp.value.trim() || selectedKey).slice(0, 2).toUpperCase();
      };
    }
    const wsHandleInp = document.getElementById('setWsHandle');
    if (wsHandleInp) {
      wsHandleInp.oninput = () => {
        const hd = document.getElementById('setPreviewHandle');
        if (hd) hd.textContent = wsHandleInp.value.trim();
      };
    }

    const seriesTextarea = document.getElementById('setWsSeriesList');
    const spotContainer = document.getElementById('setSpotlightChecks');
    if (seriesTextarea && spotContainer) {
      seriesTextarea.oninput = () => {
        const checkedNow = new Set(
          Array.from(spotContainer.querySelectorAll('input[name="setSpotlightSerie"]:checked')).map((el) => el.value)
        );
        const list = seriesTextarea.value
          .split(/\r?\n/)
          .map((s) => s.trim())
          .filter(Boolean);
        spotContainer.innerHTML = list.length
          ? list
              .map(
                (s) => `
                  <label class="settings-series-chk">
                    <input type="checkbox" name="setSpotlightSerie" value="${MD.escapeHtml(s)}"${checkedNow.has(s) ? ' checked' : ''}>
                    <span>${MD.escapeHtml(s)}</span>
                  </label>
                `
              )
              .join('')
          : '<span style="font-size:11.5px; color:var(--text-3);">Adicione séries acima para selecionar destaques.</span>';
      };
    }

    const colorDynChk = document.getElementById('setColorDynamic');
    if (colorDynChk) {
      colorDynChk.onchange = (e) => {
        state.color.dynamic = e.target.checked;
        ColorFlowEngine.savePrefs();
        ColorFlowEngine.applyCurrent(performance.now());
        ColorFlowEngine.renderMenu();
      };
    }
    container.querySelectorAll('#setColorSpeedGroup button').forEach((btn) => {
      btn.onclick = () => {
        state.color.speed = btn.dataset.speed;
        state.color.dynamic = true;
        ColorFlowEngine.savePrefs();
        ColorFlowEngine.applyCurrent(performance.now());
        ColorFlowEngine.renderMenu();
        renderSettingsView(container);
      };
    });

    const setFont = (next) => {
      state.readerFontSize = Math.min(24, Math.max(13, next));
      const prefs = loadJsonStorage(STORAGE_KEY_PREFS, {});
      prefs.readerFontSize = state.readerFontSize;
      saveJsonStorage(STORAGE_KEY_PREFS, prefs);
      const valEl = document.getElementById('setFontVal');
      if (valEl) valEl.textContent = `${state.readerFontSize}px`;
    };
    const fMinus = document.getElementById('setFontMinusBtn');
    const fPlus = document.getElementById('setFontPlusBtn');
    if (fMinus) fMinus.onclick = () => setFont(state.readerFontSize - 1);
    if (fPlus) fPlus.onclick = () => setFont(state.readerFontSize + 1);

    const syncWsBtn = document.getElementById('settingsSyncWorkspaceBtn');
    if (syncWsBtn) {
      syncWsBtn.onclick = async () => {
        try {
          const res = await fetch('/api/state', { cache: 'no-store' });
          const fresh = await res.json();
          if (!res.ok) throw new Error(fresh.error || 'Erro ao reindexar');
          state.data = normalizePayload(fresh);
          await loadSettingsConfig({ force: true });
          updateHeaderChrome();
          showToast('Workspace reindexado com sucesso!');
        } catch (err) {
          showToast(err.message);
        }
      };
    }

    const syncRssBtn = document.getElementById('settingsSyncRssBtn');
    if (syncRssBtn) {
      syncRssBtn.onclick = async () => {
        showToast(`Consultando RSS de ${selectedKey}...`);
        try {
          const res = await fetch('/api/sync-youtube', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ channel: selectedKey }),
          });
          const json = await res.json();
          if (!res.ok) throw new Error(json.error || 'Erro no sync RSS');
          if (json.state) state.data = normalizePayload(json.state);
          updateHeaderChrome();
          showToast(json.warning || `RSS sincronizado (${json.updatedCount || 0} vídeos).`);
        } catch (err) {
          showToast(err.message);
        }
      };
    }

    const saveBtn = document.getElementById('settingsSaveBtn');
    if (saveBtn) {
      saveBtn.onclick = async () => {
        const seriesList = (document.getElementById('setWsSeriesList')?.value || '')
          .split(/\r?\n/)
          .map((s) => s.trim())
          .filter(Boolean);
        const seriesSet = new Set(seriesList);
        const spotlightSeries = Array.from(
          container.querySelectorAll('input[name="setSpotlightSerie"]:checked')
        )
          .map((el) => el.value)
          .filter((s) => seriesSet.size === 0 || seriesSet.has(s));

        const totalVidRaw = (document.getElementById('setWsTotalVideos')?.value || '').trim();
        const linksPayload = {
          github: document.getElementById('setLinkGithub')?.value.trim() || '',
          hub: document.getElementById('setLinkHub')?.value.trim() || '',
          tabnews: document.getElementById('setLinkTabnews')?.value.trim() || '',
          medium: document.getElementById('setLinkMedium')?.value.trim() || '',
          tiktok: document.getElementById('setLinkTiktok')?.value.trim() || '',
          x: document.getElementById('setLinkX')?.value.trim() || '',
        };

        const payload = {
          defaultChannel: document.getElementById('setDefaultChannel')?.value,
          kdenliveRootRaw: document.getElementById('setKdenliveRoot')?.value.trim(),
          host: document.getElementById('setHost')?.value.trim(),
          port: Number(document.getElementById('setPort')?.value),
          channelKey: selectedKey,
          channelData: {
            name: document.getElementById('setWsName')?.value.trim(),
            handle: document.getElementById('setWsHandle')?.value.trim(),
            channelId: document.getElementById('setWsChannelId')?.value.trim(),
            url: document.getElementById('setWsUrl')?.value.trim(),
            avatar: document.getElementById('setWsAvatar')?.value.trim(),
            bio: document.getElementById('setWsBio')?.value.trim(),
            status: document.getElementById('setWsStatus')?.value,
            statusLabel: document.getElementById('setWsStatusLabel')?.value.trim(),
            subscribers: Number(document.getElementById('setWsSubscribers')?.value || 0),
            totalVideos: totalVidRaw === '' ? null : Number(totalVidRaw),
            bannerEnabled: Boolean(document.getElementById('setBannerEnabled')?.checked),
            bannerBadge: document.getElementById('setBannerBadge')?.value.trim(),
            bannerTitle: document.getElementById('setBannerTitle')?.value.trim(),
            bannerSubtitle: document.getElementById('setBannerSubtitle')?.value.trim(),
            bannerDocPath: document.getElementById('setBannerDocPath')?.value.trim(),
            workspacePathRaw: document.getElementById('setWsPath')?.value.trim(),
            kdenliveFolder: document.getElementById('setWsKdenliveFolder')?.value.trim(),
            seriesList,
            spotlightSeries,
            links: linksPayload,
          },
        };

        try {
          const res = await fetch('/api/config', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          const json = await res.json();
          if (!res.ok) throw new Error(json.error || 'Erro ao salvar configurações');
          state.settingsConfig = json.config;
          state.data = normalizePayload(json.state);
          initSelectedSeriesForChannel(getActiveChannelData());
          updateHeaderChrome();
          renderSettingsView(container);
          showToast(
            json.restartRequired
              ? 'Configurações salvas! Reinicie o servidor para aplicar o novo Host/Porta.'
              : `Configurações salvas em ${json.config?.writableFile || 'config.local.json'}!`
          );
        } catch (err) {
          showToast(err.message);
        }
      };
    }

    const delWsBtn = document.getElementById('settingsDeleteWsBtn');
    if (delWsBtn) {
      delWsBtn.onclick = async () => {
        if (order.length <= 1) return;
        if (
          !confirm(
            `Remover o workspace "${ch.name || selectedKey}" (${selectedKey}) das configurações do Studio?\n\nNenhum arquivo .md no disco será apagado.`
          )
        ) {
          return;
        }
        try {
          const res = await fetch(`/api/config/channels?key=${encodeURIComponent(selectedKey)}`, {
            method: 'DELETE',
          });
          const json = await res.json();
          if (!res.ok) throw new Error(json.error || 'Erro ao remover workspace');
          state.settingsConfig = json.config;
          state.data = normalizePayload(json.state);
          if (state.activeChannel === selectedKey) {
            state.activeChannel = state.data?.defaultChannel || getChannelKeys()[0] || 'mrj';
            state.selectedDocPath = null;
            state.activeVersion = 'principal';
            state.versionHistory = null;
            state.versionFetchedKey = '';
            state.dirtyBody = null;
            state.dirtyMeta = null;
            state.hasUnsavedEdits = false;
            initSelectedSeriesForChannel(getActiveChannelData());
            syncBrowserUrl({ replace: true });
          }
          state.settingsChannelKey = state.activeChannel;
          updateHeaderChrome();
          renderSettingsView(container);
          showToast(`Workspace "${selectedKey}" removido da configuração (arquivos preservados no disco).`);
        } catch (err) {
          showToast(err.message);
        }
      };
    }

    // Bindings Card 5: Acesso Remoto
    document.getElementById('remoteRefreshBtn')?.addEventListener('click', () => loadRemoteStatus({ quiet: false, rerender: true }));
    document.getElementById('remoteCopyLanBtn')?.addEventListener('click', () => {
      if (lanUrl) copyText(lanUrl, 'URL Wi-Fi LAN copiada!');
    });
    document.getElementById('remoteCopyNgrokBtn')?.addEventListener('click', () => {
      if (ngrokUrl) copyText(ngrokUrl, 'URL pública ngrok copiada!');
    });

    document.getElementById('remoteLanToggleBtn')?.addEventListener('click', async () => {
      try {
        const res = await fetch('/api/remote/lan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled: !lanEnabled }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Erro ao alternar Wi-Fi LAN');
        state.remoteStatus = json;
        if (json.config) state.settingsConfig = json.config;
        updateRemoteChip();
        renderSettingsView(container);
        showToast(json.lanEnabled ? `Wi-Fi LAN ligado em ${json.lanUrl}` : 'Wi-Fi LAN desligado.');
      } catch (err) {
        showToast(err.message);
      }
    });

    document.getElementById('remoteNgrokStartBtn')?.addEventListener('click', async () => {
      const tokenVal = document.getElementById('remoteNgrokTokenInput')?.value.trim() || '';
      showToast('Iniciando túnel ngrok...');
      try {
        const res = await fetch('/api/remote/ngrok/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(tokenVal ? { authtoken: tokenVal } : {}),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.hint ? `${json.error} (${json.hint})` : (json.error || 'Erro ao ativar ngrok'));
        state.remoteStatus = json;
        if (json.config) state.settingsConfig = json.config;
        updateRemoteChip();
        renderSettingsView(container);
        showToast(`Túnel ngrok ativo: ${json.ngrokUrl}`);
      } catch (err) {
        showToast(err.message);
      }
    });

    document.getElementById('remoteNgrokStopBtn')?.addEventListener('click', async () => {
      try {
        const res = await fetch('/api/remote/ngrok/stop', { method: 'POST' });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Erro ao desligar ngrok');
        state.remoteStatus = json;
        updateRemoteChip();
        renderSettingsView(container);
        showToast('Túnel ngrok desligado!');
      } catch (err) {
        showToast(err.message);
      }
    });

    document.getElementById('remotePinSaveBtn')?.addEventListener('click', async () => {
      const enabled = Boolean(document.getElementById('remotePinEnabledChk')?.checked);
      const pinRaw = document.getElementById('remotePinInput')?.value.trim() || '';
      if (pinRaw && (pinRaw.length < 4 || pinRaw.length > 8)) {
        showToast('O PIN deve ter entre 4 e 8 dígitos/caracteres.');
        return;
      }
      if (enabled && !pinConfigured && !pinRaw) {
        showToast('Defina um PIN de 4 a 8 dígitos para ativar a proteção.');
        return;
      }
      try {
        const res = await fetch('/api/remote/pin', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pinEnabled: enabled,
            ...(pinRaw ? { pinCode: pinRaw } : {}),
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Erro ao salvar PIN');
        state.remoteStatus = json;
        if (json.config) state.settingsConfig = json.config;
        updateRemoteChip();
        renderSettingsView(container);
        showToast(enabled ? 'Proteção por PIN ativada!' : 'PIN atualizado (proteção desativada).');
      } catch (err) {
        showToast(err.message);
      }
    });

    document.getElementById('remotePinClearBtn')?.addEventListener('click', async () => {
      try {
        const res = await fetch('/api/remote/pin', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pinEnabled: false, clearPin: true }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Erro ao limpar PIN');
        state.remoteStatus = json;
        if (json.config) state.settingsConfig = json.config;
        updateRemoteChip();
        renderSettingsView(container);
        showToast('PIN removido.');
      } catch (err) {
        showToast(err.message);
      }
    });
  }

  /* =========================================================
     MODAIS: CRIAR DOCUMENTO, WORKSPACE, BUSCA (Ctrl+K) & NOTIFICAÇÕES
  ========================================================= */
  function openNewWorkspaceModal() {
    if (!state.serverMode) {
      showToast('Adicionar novo workspace requer o servidor local (./bin/crom-studio --tray).');
      return;
    }
    const modal = document.getElementById('newWorkspaceModal');
    const keyEl = document.getElementById('newWsKey');
    const nameEl = document.getElementById('newWsName');
    const handleEl = document.getElementById('newWsHandle');
    const kdEl = document.getElementById('newWsKdenliveFolder');
    const pathEl = document.getElementById('newWsPath');
    const seriesEl = document.getElementById('newWsSeries');
    const createEl = document.getElementById('newWsCreateFolder');

    if (keyEl) {
      keyEl.value = '';
      delete keyEl.dataset.touched;
    }
    if (nameEl) nameEl.value = '';
    if (handleEl) handleEl.value = '';
    if (kdEl) {
      kdEl.value = '';
      delete kdEl.dataset.touched;
    }
    if (pathEl) pathEl.value = '';
    if (seriesEl) seriesEl.value = 'Geral, Shorts & Cortes, Canal & Ops';
    if (createEl) createEl.checked = true;

    modal?.classList.remove('hidden');
    setTimeout(() => nameEl?.focus(), 40);
  }

  function populateNewDocSelects(chData) {
    const serieEl = document.getElementById('newDocSerie');
    const folderEl = document.getElementById('newDocFolder');
    const seriesList = getChannelSeriesList(chData);

    serieEl.innerHTML = seriesList
      .map((s) => `<option value="${MD.escapeHtml(s)}">${MD.escapeHtml(s)}</option>`)
      .join('');

    const seen = new Set();
    const folders = [];
    const pushFolder = (value, label = value) => {
      if (!value || value === 'raiz' || seen.has(value)) return;
      seen.add(value);
      folders.push({ value, label });
    };

    for (const s of seriesList) {
      const sFolder = SERIE_META[s]?.folder;
      if (sFolder) pushFolder(sFolder, `${sFolder} (Série ${s})`);
    }

    const standardFolders = [
      '02-roteiros/rascunhos',
      '02-roteiros/em-producao',
      '03-shorts',
      '01-ideias',
      '02-roteiros/publicados',
      '04-producao',
    ];
    for (const sf of standardFolders) pushFolder(sf, sf);
    for (const cf of chData.folders || []) pushFolder(cf, cf);

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

    const seriesList = getChannelSeriesList(chData);
    const defaultSerie = prefill.serie || seriesList[0] || 'Geral';
    const serieFolder = SERIE_META[defaultSerie]?.folder;
    const hasSerieFolder = Boolean(serieFolder && Array.from(folderEl.options).some((o) => o.value === serieFolder));
    const defaultType = prefill.type || (hasSerieFolder ? 'episodio-serie' : 'roteiro-longo');
    const defaultFolder = prefill.folder || (hasSerieFolder ? serieFolder : '02-roteiros/rascunhos');
    const githubLink = chData.channel?.links?.github || '';
    const defaultRepo = githubLink ? githubLink.replace(/\/+$/, '').split('/').pop() : 'MrJc01';

    typeEl.value = defaultType;
    if (Array.from(serieEl.options).some((o) => o.value === defaultSerie)) {
      serieEl.value = defaultSerie;
    }
    if (Array.from(folderEl.options).some((o) => o.value === defaultFolder)) {
      folderEl.value = defaultFolder;
    }
    titleEl.value = prefill.title || '';
    repoEl.value = prefill.repo ?? defaultRepo;
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
     ATUALIZAÇÕES AO VIVO DO DISCO (SSE /api/events)
  ========================================================= */
  let liveEventSource = null;
  let liveDebounceTimer = null;
  let liveLifecycleBound = false;

  function closeLiveEvents() {
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

  async function handleLiveWorkspaceUpdate(source) {
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
          await loadVersionHistory(activeDoc.path, { force: true, skipRender: state.docMode === 'edit' });
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
          await fetchBoardsListForChannel(state.activeChannel, { force: true });
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
          syncWhiteboardTopbarUI();
          if (state.boardDirtyScene) {
            showToast('Alteração externa no quadro detectada (edição atual preservada)');
          } else if (state.activeBoardId) {
            await loadBoardIntoSession(state.activeBoardId);
            showToast('Quadro atualizado automaticamente do disco');
          }
        } else {
          syncWhiteboardTopbarUI();
        }
        return;
      }

      if (state.view === 'settings') {
        await loadSettingsConfig({ force: true });
      } else if (state.view === 'catalog') {
        await ensureCatalogCuradoria(state.activeChannel, { force: true });
        renderCurrentView();
      } else if (state.view === 'recorder') {
        await loadRecordingsLibrary(state.activeChannel, { rerender: false });
        renderCurrentView();
      } else if (state.view === 'notes') {
        await loadNotesForChannel(state.activeChannel, { rerender: false });
        renderCurrentView();
      } else {
        renderCurrentView();
      }

      if (state.view === 'scripts') {
        const activeDoc = getActiveDoc();
        if (activeDoc) {
          await loadVersionHistory(activeDoc.path, { force: true });
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
                renderScriptsView(document.getElementById('viewContainer'));
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

  function connectLiveEvents() {
    if (!state.serverMode || !global.EventSource) return;
    closeLiveEvents();

    if (!liveLifecycleBound) {
      liveLifecycleBound = true;
      global.addEventListener('pagehide', closeLiveEvents);
      global.addEventListener('beforeunload', closeLiveEvents);
      global.addEventListener('pageshow', (event) => {
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

  /* =========================================================
     BOOT & BINDINGS GLOBAIS
  ========================================================= */
  function bindGlobalEvents() {
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

    document.getElementById('cmdInput').oninput = (e) => renderCmdResults(e.target.value);

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

        try {
          if (wbBoardModalMode === 'rename') {
            const curId = wbBoardModalTargetId || state.activeBoardId;
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
            wbBoardModalTargetId = null;
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
            wbBoardModalTargetId = null;
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

  async function init() {
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
})(window);
