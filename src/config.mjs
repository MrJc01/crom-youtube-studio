import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const REPO_ROOT = path.resolve(__dirname, '..');
export const DATA_DIR = path.join(REPO_ROOT, 'data');
export const WEB_DIR = path.join(REPO_ROOT, 'web');
export const ASSETS_DIR = path.join(REPO_ROOT, 'assets');

export function resolveUserPath(rawPath, baseDir = REPO_ROOT) {
  if (!rawPath || typeof rawPath !== 'string') return '';
  const trimmed = rawPath.trim();
  if (!trimmed) return '';
  if (trimmed === '~') return os.homedir();
  if (trimmed.startsWith('~/')) {
    return path.join(os.homedir(), trimmed.slice(2));
  }
  return path.resolve(baseDir, trimmed);
}

export function getCliArg(argv, flag) {
  const args = Array.isArray(argv) ? argv : process.argv.slice(2);
  const eqPrefix = `${flag}=`;
  for (let i = 0; i < args.length; i++) {
    const token = args[i];
    if (token === flag && i + 1 < args.length) {
      return args[i + 1];
    }
    if (token.startsWith(eqPrefix)) {
      return token.slice(eqPrefix.length);
    }
  }
  return null;
}

export function findConfigPath(argv = process.argv.slice(2)) {
  const cliConfig = getCliArg(argv, '--config');
  if (cliConfig) {
    const resolved = resolveUserPath(cliConfig, process.cwd());
    if (!fs.existsSync(resolved)) {
      throw new Error(`Arquivo de configuração não encontrado em --config: ${resolved}`);
    }
    return resolved;
  }

  if (process.env.CROM_STUDIO_CONFIG) {
    const resolved = resolveUserPath(process.env.CROM_STUDIO_CONFIG, process.cwd());
    if (!fs.existsSync(resolved)) {
      throw new Error(`Arquivo de configuração não encontrado em CROM_STUDIO_CONFIG: ${resolved}`);
    }
    return resolved;
  }

  const localPath = path.join(REPO_ROOT, 'config.local.json');
  if (fs.existsSync(localPath)) return localPath;

  const examplePath = path.join(REPO_ROOT, 'config.example.json');
  if (fs.existsSync(examplePath)) return examplePath;

  throw new Error('Nenhum arquivo config.local.json ou config.example.json encontrado.');
}

export const VALID_CHANNEL_KEY_RE = /^[a-z0-9][a-z0-9_-]{0,31}$/;
export const VALID_CHANNEL_STATUSES = new Set(['ativo', 'pausado', 'oculto']);

function normalizeRemoteConfig(rawRemote) {
  const r = rawRemote && typeof rawRemote === 'object' && !Array.isArray(rawRemote) ? rawRemote : {};
  return {
    lanEnabled: Boolean(r.lanEnabled),
    pinEnabled: Boolean(r.pinEnabled),
    pinCode: r.pinCode !== undefined && r.pinCode !== null ? String(r.pinCode).trim() : '',
    ngrokAuthtoken: typeof r.ngrokAuthtoken === 'string' ? r.ngrokAuthtoken.trim() : '',
  };
}

function normalizeChannelLinks(rawLinks) {
  if (!rawLinks || typeof rawLinks !== 'object' || Array.isArray(rawLinks)) return {};
  const out = {};
  for (const [k, v] of Object.entries(rawLinks)) {
    const cleanKey = String(k || '').trim().toLowerCase();
    const cleanVal = String(v || '').trim();
    if (cleanKey && cleanVal) {
      out[cleanKey] = cleanVal;
    }
  }
  return out;
}

function normalizeChannelEntry(safeKey, ch, configDir) {
  const rawStatus = String(ch.status || 'ativo').trim().toLowerCase();
  const status = VALID_CHANNEL_STATUSES.has(rawStatus) ? rawStatus : 'ativo';
  const rawLabel = ch.statusLabel !== undefined && ch.statusLabel !== null ? String(ch.statusLabel).trim() : '';
  const defaultLabel = status === 'pausado' ? 'Pausado' : status === 'oculto' ? '' : 'Ativo';
  const statusLabel = status === 'oculto' ? rawLabel : (rawLabel || defaultLabel);

  const workspacePathRaw = String(ch.workspacePathRaw ?? ch.workspacePath ?? '').trim();
  const totalVideosRaw = ch.totalVideos;
  const hasTotalVideos =
    totalVideosRaw !== undefined && totalVideosRaw !== null && totalVideosRaw !== '' && Number.isFinite(Number(totalVideosRaw));

  return {
    key: safeKey,
    name: String(ch.name || safeKey).trim() || safeKey,
    handle: String(ch.handle || '').trim(),
    channelId: String(ch.channelId || '').trim(),
    url: String(ch.url || (ch.handle ? `https://www.youtube.com/${String(ch.handle).trim()}` : '')).trim(),
    status,
    statusLabel,
    subscribers: Number.isFinite(Number(ch.subscribers)) ? Math.max(0, Number(ch.subscribers)) : 0,
    totalVideos: hasTotalVideos ? Math.max(0, Number(totalVideosRaw)) : null,
    avatar: String(ch.avatar || '').trim(),
    bio: String(ch.bio || '').trim(),
    bannerEnabled: Boolean(ch.bannerEnabled),
    bannerBadge: String(ch.bannerBadge || '').trim(),
    bannerTitle: String(ch.bannerTitle || '').trim(),
    bannerSubtitle: String(ch.bannerSubtitle || '').trim(),
    bannerDocPath: String(ch.bannerDocPath || '').trim(),
    workspacePath: resolveUserPath(workspacePathRaw, configDir),
    workspacePathRaw,
    kdenliveFolder: String(ch.kdenliveFolder || 'videos').trim() || 'videos',
    seriesList: Array.isArray(ch.seriesList)
      ? ch.seriesList.map((s) => String(s || '').trim()).filter(Boolean)
      : [],
    spotlightSeries: Array.isArray(ch.spotlightSeries)
      ? ch.spotlightSeries.map((s) => String(s || '').trim()).filter(Boolean)
      : [],
    links: normalizeChannelLinks(ch.links),
  };
}

export function loadConfig(argv = process.argv.slice(2), { ignoreEnv = false } = {}) {
  const configPath = findConfigPath(argv);
  const configDir = path.dirname(configPath);
  const raw = JSON.parse(fs.readFileSync(configPath, 'utf8'));

  const cliPort = ignoreEnv ? null : getCliArg(argv, '--port');
  const cliHost = ignoreEnv ? null : getCliArg(argv, '--host');

  const envPort = ignoreEnv ? null : process.env.PORT;
  const envHost = ignoreEnv ? null : process.env.HOST;

  const port = Number(cliPort || envPort || raw.port || 4173);
  const host = String(cliHost || envHost || raw.host || '127.0.0.1');
  const kdenliveRootRaw = String(raw.kdenliveRootRaw ?? raw.kdenliveRoot ?? '').trim();
  const kdenliveRoot = resolveUserPath(kdenliveRootRaw, configDir);

  const rawChannels = raw.channels && typeof raw.channels === 'object' ? raw.channels : {};
  const channels = {};
  const channelOrder = [];

  for (const [key, ch] of Object.entries(rawChannels)) {
    const safeKey = String(key).trim().toLowerCase();
    if (!safeKey || !ch || typeof ch !== 'object') continue;
    channelOrder.push(safeKey);
    channels[safeKey] = normalizeChannelEntry(safeKey, ch, configDir);
  }

  const requestedDefault = String(raw.defaultChannel || '').trim().toLowerCase();
  const defaultChannel = channels[requestedDefault]
    ? requestedDefault
    : (channelOrder[0] || '');

  return {
    configPath,
    port,
    host,
    defaultChannel,
    kdenliveRoot,
    kdenliveRootRaw,
    channelOrder,
    channels,
    remote: normalizeRemoteConfig(raw.remote),
  };
}

export function getWritableConfigPath(config) {
  if (config?.configPath && path.basename(config.configPath) !== 'config.example.json') {
    return config.configPath;
  }
  return path.join(REPO_ROOT, 'config.local.json');
}

export function getEditableConfig(config) {
  const channelsOut = {};
  for (const key of config.channelOrder || []) {
    const ch = config.channels[key];
    if (!ch) continue;
    channelsOut[key] = {
      key: ch.key,
      name: ch.name,
      handle: ch.handle,
      channelId: ch.channelId,
      url: ch.url,
      status: ch.status,
      statusLabel: ch.statusLabel,
      subscribers: ch.subscribers,
      totalVideos: ch.totalVideos,
      avatar: ch.avatar,
      bio: ch.bio,
      bannerEnabled: Boolean(ch.bannerEnabled),
      bannerBadge: ch.bannerBadge || '',
      bannerTitle: ch.bannerTitle || '',
      bannerSubtitle: ch.bannerSubtitle || '',
      bannerDocPath: ch.bannerDocPath || '',
      workspacePath: ch.workspacePath,
      workspacePathRaw: ch.workspacePathRaw || ch.workspacePath || '',
      workspaceExists: Boolean(ch.workspacePath && fs.existsSync(ch.workspacePath)),
      kdenliveFolder: ch.kdenliveFolder || 'videos',
      seriesList: [...(ch.seriesList || [])],
      spotlightSeries: [...(ch.spotlightSeries || [])],
      links: { ...(ch.links || {}) },
    };
  }
  const writablePath = getWritableConfigPath(config);
  return {
    configPath: config.configPath,
    configFile: path.basename(config.configPath || ''),
    writablePath,
    writableFile: path.basename(writablePath),
    isLocal: path.basename(config.configPath || '') !== 'config.example.json',
    port: config.port,
    host: config.host,
    defaultChannel: config.defaultChannel,
    kdenliveRoot: config.kdenliveRoot,
    kdenliveRootRaw: config.kdenliveRootRaw || config.kdenliveRoot || '',
    kdenliveExists: Boolean(config.kdenliveRoot && fs.existsSync(config.kdenliveRoot)),
    channelOrder: [...(config.channelOrder || [])],
    channels: channelsOut,
    remote: {
      lanEnabled: Boolean(config.remote?.lanEnabled),
      pinEnabled: Boolean(config.remote?.pinEnabled),
      pinConfigured: Boolean(config.remote?.pinCode),
      hasNgrokAuthtoken: Boolean(config.remote?.ngrokAuthtoken),
    },
  };
}

export function serializeRawConfig(config) {
  const channels = {};
  for (const key of config.channelOrder || []) {
    const ch = config.channels[key];
    if (!ch) continue;
    const entry = {
      name: String(ch.name || key),
      handle: String(ch.handle || ''),
      channelId: String(ch.channelId || ''),
      url: String(ch.url || ''),
      status: VALID_CHANNEL_STATUSES.has(ch.status) ? ch.status : 'ativo',
      statusLabel: String(ch.statusLabel ?? ''),
      subscribers: Number(ch.subscribers || 0),
    };
    if (ch.totalVideos !== undefined && ch.totalVideos !== null && Number.isFinite(Number(ch.totalVideos))) {
      entry.totalVideos = Number(ch.totalVideos);
    }
    entry.avatar = String(ch.avatar || '');
    entry.bio = String(ch.bio || '');
    entry.bannerEnabled = Boolean(ch.bannerEnabled);
    entry.bannerBadge = String(ch.bannerBadge || '');
    entry.bannerTitle = String(ch.bannerTitle || '');
    entry.bannerSubtitle = String(ch.bannerSubtitle || '');
    entry.bannerDocPath = String(ch.bannerDocPath || '');
    entry.workspacePath = String(ch.workspacePathRaw ?? ch.workspacePath ?? '');
    entry.kdenliveFolder = String(ch.kdenliveFolder || 'videos');
    entry.seriesList = Array.isArray(ch.seriesList) ? ch.seriesList.map(String) : [];
    entry.spotlightSeries = Array.isArray(ch.spotlightSeries) ? ch.spotlightSeries.map(String) : [];
    if (ch.links && Object.keys(ch.links).length > 0) {
      entry.links = normalizeChannelLinks(ch.links);
    } else {
      entry.links = {};
    }
    channels[key] = entry;
  }

  return {
    port: Number(config.port || 4173),
    host: String(config.host || '127.0.0.1'),
    defaultChannel: String(config.defaultChannel || config.channelOrder?.[0] || ''),
    kdenliveRoot: String(config.kdenliveRootRaw ?? config.kdenliveRoot ?? ''),
    channels,
    remote: normalizeRemoteConfig(config.remote),
  };
}

function applyRemotePatch(existingRemote, patch = {}) {
  const out = normalizeRemoteConfig(existingRemote);
  if (!patch || typeof patch !== 'object') return out;

  if (patch.lanEnabled !== undefined) {
    out.lanEnabled = Boolean(patch.lanEnabled);
  }

  if (patch.clearPin === true || patch.pinCode === null) {
    out.pinCode = '';
  } else if (patch.pinCode !== undefined) {
    const cleanedPin = String(patch.pinCode).trim();
    if (cleanedPin) {
      if (cleanedPin.length < 4 || cleanedPin.length > 32) {
        throw Object.assign(new Error('O PIN deve ter entre 4 e 32 caracteres.'), { statusCode: 400 });
      }
      out.pinCode = cleanedPin;
    }
  }

  if (patch.pinEnabled !== undefined) {
    const nextPinEnabled = Boolean(patch.pinEnabled);
    if (nextPinEnabled && !out.pinCode) {
      throw Object.assign(new Error('Defina um PIN (mínimo 4 dígitos/caracteres) antes de ativar a proteção por PIN.'), {
        statusCode: 400,
      });
    }
    out.pinEnabled = nextPinEnabled;
  }

  if (patch.clearNgrokAuthtoken === true || patch.ngrokAuthtoken === null) {
    out.ngrokAuthtoken = '';
  } else if (patch.ngrokAuthtoken !== undefined) {
    const cleanedToken = String(patch.ngrokAuthtoken).trim();
    if (cleanedToken) {
      out.ngrokAuthtoken = cleanedToken;
    }
  }

  return out;
}

function writeAndReloadConfig(config, draftRaw) {
  const targetPath = getWritableConfigPath(config);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, `${JSON.stringify(draftRaw, null, 2)}\n`, 'utf8');
  const reloaded = loadConfig(['--config', targetPath], { ignoreEnv: true });
  Object.assign(config, reloaded);
  return config;
}

function applyChannelPatch(existing, patch) {
  const out = { ...existing };
  const stringFields = [
    'name',
    'handle',
    'channelId',
    'url',
    'avatar',
    'bio',
    'bannerBadge',
    'bannerTitle',
    'bannerSubtitle',
    'bannerDocPath',
    'kdenliveFolder',
  ];
  for (const field of stringFields) {
    if (patch[field] !== undefined) {
      out[field] = String(patch[field] ?? '').trim();
    }
  }

  if (patch.status !== undefined) {
    const rawSt = String(patch.status || '').trim().toLowerCase();
    if (!VALID_CHANNEL_STATUSES.has(rawSt)) {
      throw Object.assign(new Error(`Status inválido: "${patch.status}". Use ativo, pausado ou oculto.`), {
        statusCode: 400,
      });
    }
    out.status = rawSt;
    if (patch.statusLabel === undefined) {
      if (rawSt === 'ativo' && (!out.statusLabel || /pausado|offline/i.test(out.statusLabel))) {
        out.statusLabel = 'Ativo';
      } else if (rawSt === 'pausado' && (!out.statusLabel || /^ativo$/i.test(out.statusLabel))) {
        out.statusLabel = 'Pausado';
      } else if (rawSt === 'oculto') {
        out.statusLabel = '';
      }
    }
  }

  if (patch.statusLabel !== undefined) {
    out.statusLabel = String(patch.statusLabel ?? '').trim();
  }

  if (patch.bannerEnabled !== undefined) {
    out.bannerEnabled = Boolean(patch.bannerEnabled);
  }

  if (patch.subscribers !== undefined) {
    const subs = Number(patch.subscribers);
    if (!Number.isFinite(subs) || subs < 0) {
      throw Object.assign(new Error('Número de inscritos inválido.'), { statusCode: 400 });
    }
    out.subscribers = Math.floor(subs);
  }

  if (patch.totalVideos !== undefined) {
    if (patch.totalVideos === null || patch.totalVideos === '') {
      out.totalVideos = null;
    } else {
      const tv = Number(patch.totalVideos);
      if (!Number.isFinite(tv) || tv < 0) {
        throw Object.assign(new Error('Total de vídeos inválido.'), { statusCode: 400 });
      }
      out.totalVideos = Math.floor(tv);
    }
  }

  const wsPatch = patch.workspacePathRaw !== undefined ? patch.workspacePathRaw : patch.workspacePath;
  if (wsPatch !== undefined) {
    const cleanedWs = String(wsPatch || '').trim();
    if (!cleanedWs) {
      throw Object.assign(new Error('O caminho do workspace (workspacePath) não pode ficar vazio.'), {
        statusCode: 400,
      });
    }
    out.workspacePathRaw = cleanedWs;
    out.workspacePath = cleanedWs;
  }

  if (patch.seriesList !== undefined) {
    if (Array.isArray(patch.seriesList)) {
      out.seriesList = patch.seriesList.map((s) => String(s || '').trim()).filter(Boolean);
    } else if (typeof patch.seriesList === 'string') {
      out.seriesList = patch.seriesList
        .split(/\r?\n|,/)
        .map((s) => s.trim())
        .filter(Boolean);
    }
  }

  if (patch.spotlightSeries !== undefined && Array.isArray(patch.spotlightSeries)) {
    out.spotlightSeries = patch.spotlightSeries.map((s) => String(s || '').trim()).filter(Boolean);
  }

  if (patch.links !== undefined && patch.links && typeof patch.links === 'object') {
    out.links = normalizeChannelLinks(patch.links);
  }

  return out;
}

export function saveConfigUpdates(config, payload = {}) {
  const working = serializeRawConfig(config);
  const currentDiskRaw =
    fs.existsSync(getWritableConfigPath(config))
      ? JSON.parse(fs.readFileSync(getWritableConfigPath(config), 'utf8'))
      : working;

  const prevPort = Number(currentDiskRaw.port || config.port || 4173);
  const prevHost = String(currentDiskRaw.host || config.host || '127.0.0.1');

  if (payload.port !== undefined) {
    const nextPort = Number(payload.port);
    if (!Number.isInteger(nextPort) || nextPort < 1024 || nextPort > 65535) {
      throw Object.assign(new Error('Porta inválida. Use um inteiro entre 1024 e 65535.'), {
        statusCode: 400,
      });
    }
    working.port = nextPort;
  }

  if (payload.host !== undefined) {
    const nextHost = String(payload.host || '').trim();
    if (!nextHost || /\s/.test(nextHost)) {
      throw Object.assign(new Error('Host inválido.'), { statusCode: 400 });
    }
    working.host = nextHost;
  }

  const kdenlivePatch = payload.kdenliveRootRaw !== undefined ? payload.kdenliveRootRaw : payload.kdenliveRoot;
  if (kdenlivePatch !== undefined) {
    working.kdenliveRoot = String(kdenlivePatch ?? '').trim();
  }

  let nextOrder = Object.keys(working.channels);
  if (Array.isArray(payload.channelOrder) && payload.channelOrder.length) {
    const normalizedOrder = payload.channelOrder.map((k) => String(k || '').trim().toLowerCase());
    if (
      normalizedOrder.length !== nextOrder.length ||
      normalizedOrder.some((k) => !VALID_CHANNEL_KEY_RE.test(k) || !working.channels[k])
    ) {
      throw Object.assign(new Error('Ordem de canais (channelOrder) inválida.'), { statusCode: 400 });
    }
    const reordered = {};
    for (const k of normalizedOrder) {
      reordered[k] = working.channels[k];
    }
    working.channels = reordered;
    nextOrder = normalizedOrder;
  }

  if (payload.channelKey !== undefined) {
    const targetKey = String(payload.channelKey || '').trim().toLowerCase();
    if (!VALID_CHANNEL_KEY_RE.test(targetKey) || !working.channels[targetKey]) {
      throw Object.assign(new Error(`Workspace "${payload.channelKey}" não encontrado.`), { statusCode: 404 });
    }
    working.channels[targetKey] = applyChannelPatch(working.channels[targetKey], payload.channelData || {});
  }

  if (payload.channels && typeof payload.channels === 'object') {
    for (const [rawKey, patch] of Object.entries(payload.channels)) {
      const targetKey = String(rawKey || '').trim().toLowerCase();
      if (!VALID_CHANNEL_KEY_RE.test(targetKey) || !working.channels[targetKey]) {
        throw Object.assign(new Error(`Workspace "${rawKey}" não encontrado.`), { statusCode: 404 });
      }
      working.channels[targetKey] = applyChannelPatch(working.channels[targetKey], patch || {});
    }
  }

  if (payload.defaultChannel !== undefined) {
    const defKey = String(payload.defaultChannel || '').trim().toLowerCase();
    if (!working.channels[defKey]) {
      throw Object.assign(new Error(`Canal padrão "${payload.defaultChannel}" não existe.`), { statusCode: 400 });
    }
    working.defaultChannel = defKey;
  } else if (!working.channels[working.defaultChannel]) {
    working.defaultChannel = nextOrder[0] || '';
  }

  if (payload.remote && typeof payload.remote === 'object') {
    working.remote = applyRemotePatch(working.remote, payload.remote);
  }

  const restartRequired = working.port !== prevPort || working.host !== prevHost;
  writeAndReloadConfig(config, working);
  return { config, restartRequired };
}

export function saveRemoteConfigUpdates(config, patch = {}) {
  const targetPath = getWritableConfigPath(config);
  const diskRaw = fs.existsSync(targetPath)
    ? JSON.parse(fs.readFileSync(targetPath, 'utf8'))
    : serializeRawConfig(config);

  const nextRemote = applyRemotePatch(diskRaw.remote ?? config.remote, patch);
  diskRaw.remote = nextRemote;

  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  const tmpPath = `${targetPath}.tmp.${process.pid}.${Date.now()}`;
  fs.writeFileSync(tmpPath, `${JSON.stringify(diskRaw, null, 2)}\n`, 'utf8');
  fs.renameSync(tmpPath, targetPath);

  const runtimePort = config.port;
  const runtimeHost = config.host;
  const reloaded = loadConfig(['--config', targetPath], { ignoreEnv: true });
  Object.assign(config, reloaded, { port: runtimePort, host: runtimeHost });
  return config.remote;
}

export function addChannelToConfig(config, channelPayload = {}) {
  const safeKey = String(channelPayload.key || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
  if (!VALID_CHANNEL_KEY_RE.test(safeKey)) {
    throw Object.assign(
      new Error('Chave do workspace inválida. Use apenas letras minúsculas, números, hífen ou sublinhado (máx. 32).'),
      { statusCode: 400 }
    );
  }
  const working = serializeRawConfig(config);
  if (working.channels[safeKey]) {
    throw Object.assign(new Error(`Já existe um workspace configurado com a chave "${safeKey}".`), {
      statusCode: 409,
    });
  }

  const name = String(channelPayload.name || '').trim();
  const wsRaw = String(channelPayload.workspacePathRaw ?? channelPayload.workspacePath ?? '').trim();
  if (!name || !wsRaw) {
    throw Object.assign(new Error('Informe pelo menos o Nome e o Caminho do Workspace.'), { statusCode: 400 });
  }

  const targetConfigPath = getWritableConfigPath(config);
  const absWs = resolveUserPath(wsRaw, path.dirname(targetConfigPath));

  if (channelPayload.createFolder) {
    const subdirs = [
      '00-canal',
      '01-ideias',
      '02-roteiros/rascunhos',
      '02-roteiros/em-producao',
      '02-roteiros/publicados',
      '03-shorts',
    ];
    fs.mkdirSync(absWs, { recursive: true });
    for (const sub of subdirs) {
      fs.mkdirSync(path.join(absWs, sub), { recursive: true });
    }
    const readmePath = path.join(absWs, 'README.md');
    if (!fs.existsSync(readmePath)) {
      const safeNameDoc = name.replace(/"/g, '\\"');
      const todayIso = new Date().toISOString().slice(0, 10);
      fs.writeFileSync(
        readmePath,
        `---\nid: "${safeKey}-readme"\ntitulo: "Workspace ${safeNameDoc}"\ntipo: "referencia"\nstatus: "referencia"\nserie: "Canal & Ops"\nformato: "doc"\nprioridade: "alta"\nduracao_estimada: "3 min"\ndata_criacao: "${todayIso}"\ndata_alvo: ""\nrepo_github: ""\nyoutube_id: ""\nviews: 0\ntags: ["workspace", "${safeKey}"]\nresumo: "Guia inicial do workspace editorial ${safeNameDoc}."\n---\n\n# ${name}\n\nWorkspace criado pelo Crom YouTube Studio.\n`,
        'utf8'
      );
    }
  }

  const baseEntry = {
    name,
    handle: '',
    channelId: '',
    url: '',
    status: 'ativo',
    statusLabel: 'Ativo',
    subscribers: 0,
    avatar: '',
    bio: '',
    bannerEnabled: false,
    bannerBadge: '',
    bannerTitle: '',
    bannerSubtitle: '',
    bannerDocPath: '',
    workspacePath: wsRaw,
    workspacePathRaw: wsRaw,
    kdenliveFolder: `videos/${safeKey}`,
    seriesList: ['Geral', 'Shorts & Cortes', 'Canal & Ops'],
    spotlightSeries: [],
    links: {},
  };

  working.channels[safeKey] = applyChannelPatch(baseEntry, {
    ...channelPayload,
    workspacePathRaw: wsRaw,
  });

  writeAndReloadConfig(config, working);
  return { config, channelKey: safeKey };
}

export function removeChannelFromConfig(config, channelKey) {
  const safeKey = String(channelKey || '').trim().toLowerCase();
  const working = serializeRawConfig(config);
  const keys = Object.keys(working.channels);
  if (!working.channels[safeKey]) {
    throw Object.assign(new Error(`Workspace "${channelKey}" não encontrado.`), { statusCode: 404 });
  }
  if (keys.length <= 1) {
    throw Object.assign(new Error('Não é possível remover o único workspace configurado.'), { statusCode: 400 });
  }

  delete working.channels[safeKey];
  const remaining = Object.keys(working.channels);
  if (working.defaultChannel === safeKey) {
    working.defaultChannel = remaining[0];
  }

  writeAndReloadConfig(config, working);
  return { config, removedKey: safeKey };
}
