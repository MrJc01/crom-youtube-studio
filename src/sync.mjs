import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { DATA_DIR, WEB_DIR, loadConfig, getCliArg } from './config.mjs';

const IGNORED_DIRS = new Set(['studio', '.git', 'node_modules']);

const STATUS_ORDER = [
  'ideia',
  'pesquisa',
  'roteiro',
  'gravando',
  'edicao',
  'publicado',
  'referencia',
  'template',
  'arquivado',
];

const SERIES_FOLDER_MAP = {
  imagine: 'Imagine',
  pensamentos: 'Pensamentos',
  historias: 'Histórias',
  reavaliar: 'Reavaliar',
  crom: 'Crom',
};

export function slugify(text) {
  return (
    String(text || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'sem-titulo'
  );
}

function unquote(str) {
  if (str.length >= 2) {
    if ((str.startsWith('"') && str.endsWith('"')) || (str.startsWith("'") && str.endsWith("'"))) {
      return str.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    }
  }
  return str;
}

function parseYamlValue(rawVal) {
  if (!rawVal) return '';
  if (rawVal.startsWith('[') && rawVal.endsWith(']')) {
    const inner = rawVal.slice(1, -1).trim();
    if (!inner) return [];
    const items = [];
    let cur = '';
    let inQuotes = false;
    let quoteChar = '"';
    for (let i = 0; i < inner.length; i++) {
      const ch = inner[i];
      if ((ch === '"' || ch === "'") && inner[i - 1] !== '\\') {
        if (!inQuotes) {
          inQuotes = true;
          quoteChar = ch;
        } else if (quoteChar === ch) {
          inQuotes = false;
        } else {
          cur += ch;
        }
      } else if (ch === ',' && !inQuotes) {
        const cleaned = unquote(cur.trim());
        if (cleaned) items.push(cleaned);
        cur = '';
      } else {
        cur += ch;
      }
    }
    const tail = unquote(cur.trim());
    if (tail) items.push(tail);
    return items;
  }

  if (/^-?\d+(\.\d+)?$/.test(rawVal)) {
    return Number(rawVal);
  }
  if (rawVal === 'true') return true;
  if (rawVal === 'false') return false;
  return unquote(rawVal);
}

export function parseFrontmatter(raw) {
  const normalized = String(raw || '').replace(/\r\n/g, '\n');
  if (!normalized.startsWith('---\n')) {
    return { meta: {}, body: normalized };
  }
  const endIdx = normalized.indexOf('\n---\n', 4);
  const altEndIdx =
    endIdx === -1 && normalized.endsWith('\n---') ? normalized.length - 4 : endIdx;

  if (altEndIdx === -1) {
    return { meta: {}, body: normalized };
  }

  const yamlBlock = normalized.slice(4, altEndIdx);
  const body = normalized
    .slice(altEndIdx + (normalized[altEndIdx + 4] === '\n' ? 5 : 4))
    .replace(/^\n+/, '');
  const meta = {};

  for (const line of yamlBlock.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const colonIdx = trimmed.indexOf(':');
    if (colonIdx === -1) continue;

    const key = trimmed.slice(0, colonIdx).trim();
    const rawVal = trimmed.slice(colonIdx + 1).trim();
    meta[key] = parseYamlValue(rawVal);
  }

  return { meta, body };
}

function analyzeBody(body, relPath) {
  const headings = [];
  let checksTotal = 0;
  let checksDone = 0;
  let inCodeFence = false;
  const plainLines = [];

  for (const line of body.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('```')) {
      inCodeFence = !inCodeFence;
      continue;
    }
    if (inCodeFence) continue;

    const hMatch = /^(#{1,4})\s+(.+)$/.exec(trimmed);
    if (hMatch) {
      const text = hMatch[2].replace(/[*_`]/g, '').trim();
      headings.push({
        level: hMatch[1].length,
        text,
        id: slugify(text),
      });
    }

    const cMatch = /^[-*+]\s+\[([ xX])\]\s+/.exec(trimmed);
    if (cMatch) {
      checksTotal += 1;
      if (cMatch[1].toLowerCase() === 'x') checksDone += 1;
    }

    plainLines.push(
      trimmed
        .replace(/`[^`]+`/g, ' ')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/[#>*_~|[\]-]/g, ' ')
    );
  }

  const words = plainLines.join(' ').split(/\s+/).filter(Boolean).length;
  const speakMinutes = words > 0 ? Math.max(1, Math.round(words / 140)) : 0;
  const readMinutes = words > 0 ? Math.max(1, Math.round(words / 220)) : 0;

  const firstH1 = headings.find((h) => h.level === 1)?.text;
  const fallbackTitle = firstH1 || path.basename(relPath, '.md');

  return {
    headings,
    checksTotal,
    checksDone,
    words,
    speakMinutes,
    readMinutes,
    fallbackTitle,
  };
}

function inferDefaultsFromPath(relPath, channelKey) {
  const parts = relPath.split('/');
  const top = parts.length > 1 ? parts[0] : 'raiz';
  const defaultEditorialSerie = channelKey === 'crom' ? 'Ensaios & Avulsos' : 'Construção Real';

  let status = 'referencia';
  let tipo = 'referencia';
  let serie = 'Canal & Ops';
  let formato = 'doc';

  if (top === '00-canal') {
    status = 'referencia';
    tipo = 'referencia';
    serie = 'Canal & Ops';
    formato = 'doc';
  } else if (top === '01-ideias') {
    status = 'ideia';
    tipo = 'ideia';
    serie = defaultEditorialSerie;
    formato = 'long';
  } else if (top === '02-roteiros') {
    tipo = 'roteiro';
    serie = defaultEditorialSerie;
    formato = 'long';
    if (parts[1] === 'rascunhos') status = 'roteiro';
    else if (parts[1] === 'em-producao') status = 'gravando';
    else if (parts[1] === 'publicados') {
      status = 'publicado';
      tipo = 'post-mortem';
    } else status = 'roteiro';
  } else if (top === '03-shorts') {
    status = 'roteiro';
    tipo = 'short';
    serie = 'Shorts & Cortes';
    formato = 'short';
  } else if (top === '04-producao') {
    status = 'referencia';
    tipo = 'producao';
    serie = 'Canal & Ops';
    formato = 'doc';
  } else if (top === '05-templates') {
    status = 'template';
    tipo = 'template';
    serie = 'Canal & Ops';
    formato = 'doc';
  } else if (top === '06-series') {
    if (parts.length === 2) {
      status = 'referencia';
      tipo = 'referencia';
      serie = 'Canal & Ops';
      formato = 'doc';
    } else {
      const subSlug = parts[1].toLowerCase();
      const mappedSerie =
        SERIES_FOLDER_MAP[subSlug] || subSlug.charAt(0).toUpperCase() + subSlug.slice(1);
      const baseName = parts[parts.length - 1].toLowerCase();
      serie = mappedSerie;
      if (baseName === '_serie.md' || baseName === 'readme.md') {
        status = 'referencia';
        tipo = 'referencia';
        formato = 'doc';
      } else {
        status = 'ideia';
        tipo = 'ideia';
        formato = 'long';
      }
    }
  }

  return { status, tipo, serie, formato };
}

function walkMarkdownFiles(dir, relBase = '') {
  if (!dir || !fs.existsSync(dir)) return [];
  let dirStat;
  try {
    dirStat = fs.lstatSync(dir);
  } catch {
    return [];
  }
  if (dirStat.isSymbolicLink() || !dirStat.isDirectory()) return [];

  const results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;
    if (entry.name.startsWith('.')) continue;

    const fullPath = path.join(dir, entry.name);
    const relPath = relBase ? `${relBase}/${entry.name}` : entry.name;

    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      results.push(...walkMarkdownFiles(fullPath, relPath));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
      results.push({ fullPath, relPath });
    }
  }
  return results;
}

function getYoutubeCachePath(channelKey) {
  return path.join(DATA_DIR, `${channelKey}-youtube-cache.json`);
}

function loadYouTubeCache(channelKey, channelCfg) {
  const cachePath = getYoutubeCachePath(channelKey);
  if (fs.existsSync(cachePath)) {
    try {
      return JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    } catch {
      return { channel: {}, videos: [], githubRepos: [] };
    }
  }

  // Fallback de leitura único caso ainda exista cache legado no workspace
  if (channelCfg?.workspacePath) {
    const legacyPath = path.join(channelCfg.workspacePath, 'studio', 'youtube-cache.json');
    if (fs.existsSync(legacyPath) && !fs.lstatSync(legacyPath).isSymbolicLink()) {
      try {
        return JSON.parse(fs.readFileSync(legacyPath, 'utf8'));
      } catch {
        // segue para fallback vazio
      }
    }
  }

  return { channel: {}, videos: [], githubRepos: [] };
}

function readJsonSafe(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  try {
    if (fs.lstatSync(filePath).isSymbolicLink()) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function listKdenliveVideoFolders(dirPath, defaultCanal) {
  if (!dirPath || !fs.existsSync(dirPath)) return [];
  try {
    if (fs.lstatSync(dirPath).isSymbolicLink()) return [];
  } catch {
    return [];
  }

  const items = [];
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

  for (const entry of entries) {
    if (entry.isSymbolicLink() || !entry.isDirectory()) continue;
    if (entry.name.startsWith('.')) continue;
    if (defaultCanal === 'crom' && entry.name === 'mrj') continue;

    const folderPath = path.join(dirPath, entry.name);
    const canalMeta = readJsonSafe(path.join(folderPath, 'canal_meta.json'));
    const pubJson = readJsonSafe(path.join(folderPath, 'publicacao.json'));
    const hasProgress = fs.existsSync(path.join(folderPath, 'PROGRESSO.md'));
    const renderDir = path.join(folderPath, 'render');
    let hasRender = false;
    if (fs.existsSync(renderDir) && !fs.lstatSync(renderDir).isSymbolicLink()) {
      try {
        hasRender = fs
          .readdirSync(renderDir)
          .some((f) => f.toLowerCase().endsWith('.mp4'));
      } catch {
        hasRender = false;
      }
    }

    items.push({
      slug: entry.name,
      canal: canalMeta?.canal || defaultCanal,
      serie: canalMeta?.serie || '',
      title: pubJson?.titulo || entry.name,
      youtubeUrl: pubJson?.url || pubJson?.link || '',
      hasProgress,
      hasRender,
      path: folderPath,
    });
  }
  return items;
}

function readKdenliveEstilos(estilosDir) {
  if (!estilosDir || !fs.existsSync(estilosDir)) return [];
  try {
    if (fs.lstatSync(estilosDir).isSymbolicLink()) return [];
  } catch {
    return [];
  }

  const styles = [];
  const entries = fs.readdirSync(estilosDir, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

  for (const entry of entries) {
    if (entry.isSymbolicLink() || !entry.isFile()) continue;
    if (!entry.name.toLowerCase().endsWith('.md')) continue;
    if (entry.name === 'README.md' || entry.name.startsWith('_')) continue;

    const fullPath = path.join(estilosDir, entry.name);
    const raw = fs.readFileSync(fullPath, 'utf8');
    const lines = raw.replace(/\r\n/g, '\n').split('\n');
    const h1 = lines.find((l) => l.startsWith('# '));
    const title = h1 ? h1.replace(/^#\s+/, '').trim() : path.basename(entry.name, '.md');
    const summaryLine =
      lines.find((l) => l.trim() && !l.trim().startsWith('#') && !l.trim().startsWith('-') && !l.trim().startsWith('|')) ||
      '';
    const hexMatches = raw.match(/#[0-9a-fA-F]{6}\b/g) || [];
    const uniqueHex = Array.from(new Set(hexMatches.map((h) => h.toLowerCase()))).slice(0, 6);

    styles.push({
      slug: path.basename(entry.name, '.md'),
      filename: entry.name,
      name: title,
      summary: summaryLine.trim(),
      colors: uniqueHex,
    });
  }
  return styles;
}

export function loadKdenliveSummary(kdenliveRoot) {
  if (!kdenliveRoot || !fs.existsSync(kdenliveRoot)) {
    return {
      available: false,
      root: kdenliveRoot || '',
      canais: null,
      modelos: [],
      regraIa: [],
      series: [],
      avulsos: [],
      estilos: [],
      videosCrom: [],
      videosMrj: [],
    };
  }

  const canais = readJsonSafe(path.join(kdenliveRoot, 'canais.json'));
  const canalJson = readJsonSafe(path.join(kdenliveRoot, 'canal.json')) || {};
  const estilos = readKdenliveEstilos(path.join(kdenliveRoot, 'estilos'));
  const videosCrom = listKdenliveVideoFolders(path.join(kdenliveRoot, 'videos'), 'crom');
  const videosMrj = listKdenliveVideoFolders(path.join(kdenliveRoot, 'videos', 'mrj'), 'mrj');

  return {
    available: true,
    root: kdenliveRoot,
    canais,
    modelos: Array.isArray(canalJson.modelos) ? canalJson.modelos : [],
    regraIa: Array.isArray(canalJson.regra_ia) ? canalJson.regra_ia : [],
    series: Array.isArray(canalJson.series) ? canalJson.series : [],
    avulsos: Array.isArray(canalJson.avulsos) ? canalJson.avulsos : [],
    estilos,
    videosCrom,
    videosMrj,
  };
}

function indexChannel(channelKey, channelCfg) {
  const files = walkMarkdownFiles(channelCfg.workspacePath);
  const docs = files.map(({ fullPath, relPath }) => {
    const raw = fs.readFileSync(fullPath, 'utf8');
    const stat = fs.statSync(fullPath);
    const { meta, body } = parseFrontmatter(raw);
    const analysis = analyzeBody(body, relPath);
    const defaults = inferDefaultsFromPath(relPath, channelKey);

    const parts = relPath.split('/');
    const topFolder = parts.length > 1 ? parts[0] : 'raiz';
    const folder = parts.length > 1 ? parts.slice(0, -1).join('/') : 'raiz';

    const mergedMeta = {
      id: String(meta.id || slugify(relPath.replace(/\.md$/i, ''))),
      titulo: String(meta.titulo || analysis.fallbackTitle),
      tipo: String(meta.tipo || defaults.tipo),
      status: String(meta.status || defaults.status),
      serie: String(meta.serie || defaults.serie),
      formato: String(meta.formato || defaults.formato),
      prioridade: String(meta.prioridade || 'media'),
      duracao_estimada: String(
        meta.duracao_estimada || (analysis.speakMinutes ? `${analysis.speakMinutes} min` : '')
      ),
      data_criacao: String(meta.data_criacao || stat.mtime.toISOString().slice(0, 10)),
      data_alvo: String(meta.data_alvo || ''),
      repo_github: String(meta.repo_github || ''),
      youtube_id: String(meta.youtube_id || ''),
      views: Number(meta.views || 0),
      tags: Array.isArray(meta.tags) ? meta.tags : [],
      resumo: String(meta.resumo || ''),
    };

    return {
      path: relPath,
      filename: path.basename(relPath),
      folder,
      topFolder,
      meta: mergedMeta,
      body,
      raw,
      stats: {
        words: analysis.words,
        speakMinutes: analysis.speakMinutes,
        readMinutes: analysis.readMinutes,
        checksDone: analysis.checksDone,
        checksTotal: analysis.checksTotal,
        size: stat.size,
      },
      headings: analysis.headings,
      mtime: stat.mtime.toISOString(),
    };
  });

  docs.sort((a, b) => {
    const aIdx = STATUS_ORDER.indexOf(a.meta.status);
    const bIdx = STATUS_ORDER.indexOf(b.meta.status);
    if (aIdx !== bIdx) return (aIdx === -1 ? 99 : aIdx) - (bIdx === -1 ? 99 : bIdx);
    return a.path.localeCompare(b.path, 'pt-BR');
  });

  const ytCache = loadYouTubeCache(channelKey, channelCfg);
  const videos = Array.isArray(ytCache.videos) ? ytCache.videos : [];
  const folderSet = new Set(docs.map((d) => d.folder));
  const seriesSet = new Set([
    ...(channelCfg.seriesList || []),
    ...docs.map((d) => d.meta.serie).filter(Boolean),
    ...videos.map((v) => v.serie).filter(Boolean),
  ]);

  const mergedChannel = {
    ...(ytCache.channel || {}),
    key: channelKey,
    name: channelCfg.name || ytCache.channel?.name || channelKey,
    handle: channelCfg.handle || ytCache.channel?.handle || '',
    id: channelCfg.channelId || ytCache.channel?.id || '',
    url: channelCfg.url || ytCache.channel?.url || '',
    status: channelCfg.status || ytCache.channel?.status || 'ativo',
    statusLabel:
      channelCfg.statusLabel ||
      ytCache.channel?.statusLabel ||
      (channelCfg.status === 'pausado' ? 'Offline / Pausado' : 'Ativo'),
    subscribers:
      channelCfg.subscribers !== undefined
        ? channelCfg.subscribers
        : Number(ytCache.channel?.subscribers || 0),
    totalVideos:
      channelCfg.totalVideos !== null && channelCfg.totalVideos !== undefined
        ? channelCfg.totalVideos
        : Number(ytCache.channel?.totalVideos || videos.length),
    avatar: channelCfg.avatar || ytCache.channel?.avatar || '',
    bio: channelCfg.bio || ytCache.channel?.bio || '',
    kdenliveFolder: channelCfg.kdenliveFolder || 'videos',
  };

  return {
    key: channelKey,
    workspaceName: `${mergedChannel.name} Studio`,
    workspacePath: channelCfg.workspacePath,
    workspaceExists: Boolean(channelCfg.workspacePath && fs.existsSync(channelCfg.workspacePath)),
    channel: mergedChannel,
    videos,
    githubRepos: Array.isArray(ytCache.githubRepos) ? ytCache.githubRepos : [],
    folders: Array.from(folderSet).sort(),
    series: Array.from(seriesSet),
    docs,
  };
}

export function syncWorkspace({ serverMode = false, config: passedConfig = null } = {}) {
  const config = passedConfig || loadConfig();
  const channelsPayload = {};

  for (const key of config.channelOrder) {
    channelsPayload[key] = indexChannel(key, config.channels[key]);
  }

  const kdenlive = loadKdenliveSummary(config.kdenliveRoot);
  const payload = {
    version: 2,
    generatedAt: new Date().toISOString(),
    serverMode,
    defaultChannel: config.defaultChannel,
    channelOrder: config.channelOrder,
    channels: channelsPayload,
    kdenlive,
  };

  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(WEB_DIR, { recursive: true });

  const dataJsonPath = path.join(DATA_DIR, 'data.json');
  const dataJsPath = path.join(DATA_DIR, 'data.js');
  const webDataJsPath = path.join(WEB_DIR, 'data.js');

  const jsBundle = `/* Gerado automaticamente por src/sync.mjs — não editar manualmente */\nwindow.CROM_STUDIO_DATA = ${JSON.stringify(payload)};\nwindow.MRJ_STUDIO_DATA = window.CROM_STUDIO_DATA;\n`;

  fs.writeFileSync(dataJsonPath, JSON.stringify(payload, null, 2), 'utf8');
  fs.writeFileSync(dataJsPath, jsBundle, 'utf8');
  fs.writeFileSync(webDataJsPath, jsBundle, 'utf8');

  return payload;
}

function decodeXmlEntities(str) {
  return String(str || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function inferVideoSerie(title, isShort, channelKey) {
  if (/ci[eê]ncia em artigos/i.test(title)) return 'Ciência em Artigos';
  if (
    /feitos em|para construir|ia com os seus|aprendizado de m[aá]quina|para criar jogos|infraestrutura na nuvem|guardar e buscar|vive no terminal|github/i.test(
      title
    )
  ) {
    return 'Projetos do GitHub';
  }
  if (isShort) return 'Shorts & Cortes';
  if (/imagine/i.test(title)) return 'Imagine';
  if (/pensamentos/i.test(title)) return 'Pensamentos';
  if (/hist[oó]rias/i.test(title)) return 'Histórias';
  if (/reavaliar/i.test(title)) return 'Reavaliar';
  if (/tabnews|aicast|conto|vida p[oó]s|colonialismo/i.test(title)) return 'Ensaios & TabNews';
  if (/crompressor|colibri|\bgo\b|\bc\b|o\(1\)|moe/i.test(title)) return 'Engenharia & Core';
  return channelKey === 'crom' ? 'Ensaios & Avulsos' : 'Construção Real';
}

function updateCatalogMarkdown(cache, channelCfg) {
  if (!channelCfg?.workspacePath) return;
  const catalogPath = path.join(channelCfg.workspacePath, '00-canal', 'catalogo-youtube.md');
  if (!fs.existsSync(catalogPath) || fs.lstatSync(catalogPath).isSymbolicLink()) return;

  const content = fs.readFileSync(catalogPath, 'utf8');
  const startTag = '<!-- YOUTUBE_CATALOG_START -->';
  const endTag = '<!-- YOUTUBE_CATALOG_END -->';
  const startIdx = content.indexOf(startTag);
  const endIdx = content.indexOf(endTag);
  if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) return;

  const videos = [...(cache.videos || [])].sort((a, b) =>
    String(b.published || '').localeCompare(String(a.published || ''))
  );
  const longs = videos.filter((v) => v.type === 'long').length;
  const shorts = videos.filter((v) => v.type === 'short').length;
  const totalViews = videos.reduce((acc, v) => acc + Number(v.views || 0), 0);
  const subs = Number(channelCfg.subscribers ?? cache.channel?.subscribers ?? 0);
  const totalPublic = Number(channelCfg.totalVideos ?? cache.channel?.totalVideos ?? videos.length);

  const summaryLine =
    totalPublic > videos.length
      ? `**Resumo Sincronizado:** ${videos.length} vídeos recentes no feed RSS (${totalPublic} vídeos públicos no canal) • **${totalViews.toLocaleString('pt-BR')} visualizações** nos últimos ${videos.length} • **${subs} inscritos**`
      : `**Resumo Sincronizado:** ${videos.length} vídeos publicados (${longs} longos, ${shorts} Shorts) • **${totalViews.toLocaleString('pt-BR')} visualizações** acumuladas • **${subs} inscritos**`;

  const lines = [
    summaryLine,
    '',
    '| Data | Formato | Views | Título | Série | Link |',
    '| --- | --- | ---: | --- | --- | --- |',
  ];

  for (const v of videos) {
    const safeTitle = String(v.title || '').replace(/\|/g, '-');
    const formatLabel = v.type === 'short' ? 'Short' : 'Long';
    lines.push(
      `| \`${v.published}\` | ${formatLabel} | ${v.views} | ${safeTitle} | ${v.serie} | [${v.id}](${v.url}) |`
    );
  }

  const updated =
    content.slice(0, startIdx + startTag.length) +
    '\n' +
    lines.join('\n') +
    '\n' +
    content.slice(endIdx);

  fs.writeFileSync(catalogPath, updated, 'utf8');
}

async function syncChannelRss(channelKey, channelCfg) {
  const cache = loadYouTubeCache(channelKey, channelCfg);
  const channelId = channelCfg.channelId || cache.channel?.id || '';
  if (!channelId || /^UCX+$|^UCY+$/i.test(channelId)) {
    return {
      channel: channelKey,
      ok: false,
      updatedCount: 0,
      warning: `Canal "${channelKey}" sem channelId configurado.`,
    };
  }

  const feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`;
  let warning = null;
  let updatedCount = 0;

  try {
    const res = await fetch(feedUrl, {
      headers: { 'User-Agent': 'Crom-YouTube-Studio-Sync/2.0' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const xml = await res.text();
    const entryMatches = xml.match(/<entry>[\s\S]*?<\/entry>/g) || [];
    const existingById = new Map((cache.videos || []).map((v) => [v.id, v]));

    for (const entryXml of entryMatches) {
      const id = (/<yt:videoId>([^<]+)<\/yt:videoId>/.exec(entryXml) || [])[1];
      if (!id) continue;
      const rawTitle = (/<title>([^<]+)<\/title>/.exec(entryXml) || [])[1] || '';
      const title = decodeXmlEntities(rawTitle);
      const published = ((/<published>([^<]+)<\/published>/.exec(entryXml) || [])[1] || '').slice(
        0,
        10
      );
      const viewsRaw = (/<media:statistics\s+views="(\d+)"/.exec(entryXml) || [])[1];
      const views =
        viewsRaw !== undefined ? Number(viewsRaw) : existingById.get(id)?.views || 0;
      const href =
        (/<link\s+rel="alternate"\s+href="([^"]+)"/.exec(entryXml) || [])[1] ||
        `https://www.youtube.com/watch?v=${id}`;

      const prev = existingById.get(id);
      if (prev) {
        prev.title = title || prev.title;
        prev.views = views;
        if (published) prev.published = published;
      } else {
        const isShort = href.includes('/shorts/');
        existingById.set(id, {
          id,
          title,
          published: published || new Date().toISOString().slice(0, 10),
          views,
          type: isShort ? 'short' : 'long',
          serie: inferVideoSerie(title, isShort, channelKey),
          url: href,
          thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
        });
      }
      updatedCount += 1;
    }

    cache.videos = Array.from(existingById.values()).sort((a, b) =>
      String(b.published || '').localeCompare(String(a.published || ''))
    );
    cache.channel = {
      ...(cache.channel || {}),
      name: channelCfg.name || cache.channel?.name,
      handle: channelCfg.handle || cache.channel?.handle,
      id: channelId,
      url: channelCfg.url || cache.channel?.url,
      subscribers: channelCfg.subscribers ?? cache.channel?.subscribers ?? 0,
      totalVideos: channelCfg.totalVideos ?? cache.channel?.totalVideos,
      avatar: channelCfg.avatar || cache.channel?.avatar || '',
      lastSync: new Date().toISOString(),
    };

    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(getYoutubeCachePath(channelKey), JSON.stringify(cache, null, 2), 'utf8');
    updateCatalogMarkdown(cache, channelCfg);
  } catch (err) {
    warning = `Não foi possível acessar o RSS de ${channelKey} agora (${err.message}); mantendo cache local.`;
  }

  return {
    channel: channelKey,
    ok: !warning,
    updatedCount,
    warning,
  };
}

export async function syncYouTubeRss({
  serverMode = false,
  channel = 'all',
  config: passedConfig = null,
} = {}) {
  const config = passedConfig || loadConfig();
  const targetKeys =
    !channel || channel === 'all'
      ? config.channelOrder
      : [String(channel).trim().toLowerCase()];

  for (const key of targetKeys) {
    if (!config.channels[key]) {
      throw Object.assign(new Error(`Canal desconhecido: ${key}`), { statusCode: 400 });
    }
  }

  const results = [];
  for (const key of targetKeys) {
    results.push(await syncChannelRss(key, config.channels[key]));
  }

  const state = syncWorkspace({ serverMode, config });
  const warnings = results.map((r) => r.warning).filter(Boolean);
  const updatedCount = results.reduce((sum, r) => sum + r.updatedCount, 0);

  return {
    ok: warnings.length === 0,
    updatedCount,
    warning: warnings.length ? warnings.join(' | ') : null,
    results,
    state,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const argv = process.argv.slice(2);
  const config = loadConfig(argv);
  const withYoutube = argv.includes('--youtube');
  const channelArg = getCliArg(argv, '--channel') || getCliArg(argv, '--canal') || 'all';

  if (withYoutube) {
    const res = await syncYouTubeRss({ serverMode: false, channel: channelArg, config });
    const summary = Object.values(res.state.channels)
      .map((c) => `${c.key}:${c.docs.length}md/${c.videos.length}vid`)
      .join(', ');
    console.log(
      `[Crom Studio Sync] ${summary} | RSS: ${res.ok ? `OK (${res.updatedCount})` : res.warning}`
    );
  } else {
    const state = syncWorkspace({ serverMode: false, config });
    const summary = Object.values(state.channels)
      .map((c) => `${c.key}: ${c.docs.length} .md / ${c.videos.length} vídeos`)
      .join(' | ');
    console.log(
      `[Crom Studio Sync] ${summary} | Kdenlive: ${state.kdenlive.available ? 'conectado' : 'indisponível'} -> data/data.json, data/data.js, web/data.js`
    );
  }
}
