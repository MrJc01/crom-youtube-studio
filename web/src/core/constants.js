export const MD = globalThis.CromMarkdown || globalThis.MrjMarkdown;

export const PALETTES = [
  { id: 'crom-magenta', name: 'Crom Magenta', a1: [225, 45, 120], a2: [91, 76, 245], a3: [143, 34, 92] },
  { id: 'indigo-aurora', name: 'Indigo Aurora', a1: [124, 92, 255], a2: [56, 189, 248], a3: [88, 28, 135] },
  { id: 'cyan-nebula', name: 'Cyan Nebula', a1: [34, 211, 238], a2: [99, 102, 241], a3: [14, 116, 144] },
  { id: 'lab-emerald', name: 'Lab Emerald', a1: [52, 211, 153], a2: [56, 189, 248], a3: [6, 95, 70] },
  { id: 'amber-rose', name: 'Amber Rose', a1: [251, 146, 60], a2: [236, 72, 153], a3: [154, 52, 18] },
  { id: 'crimson-velvet', name: 'Crimson Velvet', a1: [244, 63, 94], a2: [168, 85, 247], a3: [136, 19, 55] },
];

export const SERIE_META = {
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

export const KANBAN_COLS = [
  { key: 'ideia', label: 'Ideias' },
  { key: 'pesquisa', label: 'Pesquisa' },
  { key: 'roteiro', label: 'Roteiro' },
  { key: 'gravando', label: 'Gravando' },
  { key: 'edicao', label: 'Edição' },
  { key: 'publicado', label: 'Publicado' },
];

export const VIEW_TITLES = {
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
  narration: 'Estúdio de Narração & Vozes',
  notes: 'Notas Rápidas',
  agent: 'Central do Agente',
  settings: 'Configurações do Workspace',
};

export const VIEW_TO_SLUG = {
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
  narration: 'narracao',
  notes: 'notas',
  agent: 'agente',
  settings: 'configuracoes',
};

export const SLUG_TO_VIEW = {
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
  narracao: 'narration',
  narration: 'narration',
  narrar: 'narration',
  voz: 'narration',
  vozes: 'narration',
  tts: 'narration',
  notas: 'notes',
  notes: 'notes',
  keep: 'notes',
  agente: 'agent',
  agent: 'agent',
  configuracoes: 'settings',
  settings: 'settings',
  config: 'settings',
};

export const STATUS_VISUAL = {
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

export const STORAGE_KEY_PREFS = 'crom_studio_prefs_v1';
export const STORAGE_KEY_DRAFTS = 'crom_studio_drafts_v2';
export const STORAGE_KEY_TABS = 'crom_studio_tabs_v1';
export const STORAGE_KEY_DEFAULT_VERSIONS = 'crom_studio_default_versions_v1';

export const SERIE_FLOW_PALETTE = ['#ec4899', '#38bdf8', '#a855f7', '#f59e0b', '#22d3ee', '#34d399', '#fb7185', '#818cf8'];

export const CURADORIA_STATUSES = [
  { id: 'pendente', label: 'Pendente' },
  { id: 'assistido', label: 'Assistido' },
  { id: 'reagir', label: 'Para Reagir' },
  { id: 'roteirizado', label: 'Roteirizado' },
  { id: 'arquivado', label: 'Arquivado' },
];

export const DEFAULT_CURADORIA_FALLBACK = {
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

export const KEEP_COLORS = [
  { id: 'default', label: 'Padrão', dot: '#2e3148' },
  { id: 'coral', label: 'Coral', dot: '#e11d48' },
  { id: 'amber', label: 'Âmbar', dot: '#d97706' },
  { id: 'yellow', label: 'Ouro', dot: '#ca8a04' },
  { id: 'emerald', label: 'Esmeralda', dot: '#10b981' },
  { id: 'teal', label: 'Ciano', dot: '#06b6d4' },
  { id: 'indigo', label: 'Índigo', dot: '#6366f1' },
  { id: 'purple', label: 'Roxo', dot: '#a855f7' },
];
