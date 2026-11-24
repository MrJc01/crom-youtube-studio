import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { DATA_DIR, WEB_DIR, loadConfig, getCliArg } from './config.mjs';
import { readJsonSafe, writeFileAtomic, writeJsonAtomic, slugify } from './lib/storage.mjs';
import { listTrash } from './lib/trash.mjs';
import { getVersioningSummary } from './versioning.mjs';
import { listBoards } from './boards.mjs';
import { fetchChannelAllVideos } from './youtube-scraper.mjs';
import { loadCuradoria } from './catalog-curadoria.mjs';
import { listRecordings } from './recordings.mjs';
import { listUnifiedAudios } from './tts.mjs';

export { slugify };

const IGNORED_DIRS = new Set(['studio', '.git', 'node_modules', 'gravacoes', 'quadros', 'narracoes']);

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

// slugify is imported & re-exported from ./lib/storage.mjs

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

function getLegacyYoutubeCachePath(channelKey) {
  return path.join(DATA_DIR, `${channelKey}-youtube-cache.json`);
}

export function getWorkspaceYoutubeCachePath(workspacePath) {
  return path.join(workspacePath, '.studio-data', 'youtube-cache.json');
}

function getWorkspaceQuarantineDir(workspacePath) {
  return path.join(workspacePath, '.studio-data', 'quarantine');
}

export function loadYouTubeCache(channelKey, channelCfg) {
  const emptyFallback = { channel: {}, videos: [], githubRepos: [] };
  const wsPath = channelCfg?.workspacePath;

  if (wsPath && fs.existsSync(wsPath)) {
    const wsCachePath = getWorkspaceYoutubeCachePath(wsPath);
    const quarantineDir = getWorkspaceQuarantineDir(wsPath);

    if (fs.existsSync(wsCachePath)) {
      const parsed = readJsonSafe(wsCachePath, {
        defaultData: emptyFallback,
        schemaVersion: 1,
        quarantineDir,
      });
      return parsed && typeof parsed === 'object' ? parsed : emptyFallback;
    }

    // Fallback de migração única: data/<key>-youtube-cache.json -> <wsPath>/.studio-data/youtube-cache.json
    const migrationCandidates = [
      getLegacyYoutubeCachePath(channelKey),
      path.join(wsPath, 'studio', 'youtube-cache.json'),
    ];
    for (const candidate of migrationCandidates) {
      if (!candidate || !fs.existsSync(candidate)) continue;
      try {
        if (fs.lstatSync(candidate).isSymbolicLink()) continue;
        const raw = JSON.parse(fs.readFileSync(candidate, 'utf8'));
        if (raw && typeof raw === 'object') {
          writeJsonAtomic(wsCachePath, raw, { schemaVersion: 1, backup: true });
          return raw;
        }
      } catch {
        // segue para próximo candidato
      }
    }

    return emptyFallback;
  }

  const legacyPath = getLegacyYoutubeCachePath(channelKey);
  if (fs.existsSync(legacyPath)) {
    return (
      readJsonSafe(legacyPath, {
        defaultData: emptyFallback,
        schemaVersion: 1,
        quarantineDir: path.join(DATA_DIR, 'quarantine'),
      }) || emptyFallback
    );
  }

  return emptyFallback;
}

function readKdenliveJson(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  try {
    if (fs.lstatSync(filePath).isSymbolicLink()) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function loadWorkspaceNotesList(workspacePath) {
  if (!workspacePath || !fs.existsSync(workspacePath)) return [];
  const notesPath = path.join(workspacePath, '.studio-data', 'notas.json');
  if (!fs.existsSync(notesPath)) return [];
  const data = readJsonSafe(notesPath, {
    defaultData: { notes: [] },
    schemaVersion: 1,
    quarantineDir: getWorkspaceQuarantineDir(workspacePath),
  });
  return Array.isArray(data?.notes) ? data.notes : [];
}

function countQuarantineFiles(workspacePath) {
  if (!workspacePath || !fs.existsSync(workspacePath)) return 0;
  const qDir = getWorkspaceQuarantineDir(workspacePath);
  if (!fs.existsSync(qDir)) return 0;
  try {
    const st = fs.lstatSync(qDir);
    if (st.isSymbolicLink() || !st.isDirectory()) return 0;
    return fs
      .readdirSync(qDir, { withFileTypes: true })
      .filter((e) => e.isFile() && !e.isSymbolicLink() && !e.name.startsWith('.')).length;
  } catch {
    return 0;
  }
}

function computeProjectLinks({
  channelKey,
  channelCfg,
  docs,
  videos,
  boards,
  recordingsRes,
  narrationsList,
  notesList,
  curadoria,
  kdenliveSummary,
}) {
  const links = {};
  const ensure = (docPath) => {
    const clean = String(docPath || '').trim();
    if (!clean) return null;
    if (!links[clean]) {
      links[clean] = {
        boards: [],
        recordings: [],
        narrations: [],
        notes: [],
        curadoria: [],
        kdenlive: [],
      };
    }
    return links[clean];
  };

  for (const board of boards || []) {
    for (const dp of board.linkedDocPaths || []) {
      const entry = ensure(dp);
      if (entry) {
        entry.boards.push({
          id: board.id,
          title: board.title || board.id,
          preferredMode: board.preferredMode || 'excalidraw',
        });
      }
    }
  }

  for (const session of recordingsRes?.sessions || []) {
    for (const take of session.takes || []) {
      if (!take.scriptPath) continue;
      const entry = ensure(take.scriptPath);
      if (entry) {
        entry.recordings.push({
          sessionId: session.id,
          takeId: take.id,
          title: take.title || session.title || session.id,
          date: session.date || '',
          tracksCount: Array.isArray(take.tracks) ? take.tracks.length : 0,
        });
      }
    }
  }

  for (const note of notesList || []) {
    if (!note || !note.linkedDocPath) continue;
    const entry = ensure(note.linkedDocPath);
    if (entry) {
      entry.notes.push({
        id: note.id,
        title: note.title || '',
        color: note.color || 'default',
      });
    }
  }

  for (const nar of narrationsList || []) {
    if (!nar || !nar.docPath) continue;
    const entry = ensure(nar.docPath);
    if (entry) {
      entry.narrations.push({
        id: nar.id,
        title: nar.title || nar.fileName || '',
        relPath: nar.relPath || '',
        origin: nar.origin || 'pagina-narracao',
        category: nar.category || 'geral',
        voiceId: nar.voiceId || '',
        voiceName: nar.voiceName || '',
        docVersion: nar.docVersion || 'principal',
        durationSec: Number(nar.durationSec || 0),
        createdAt: nar.createdAt || '',
      });
    }
  }

  const videosById = new Map();
  for (const v of videos || []) {
    const vid = String(v.videoId || v.id || '').trim();
    if (vid) videosById.set(vid, v);
  }
  const playlistItemsById = new Map();
  const seenCuradoriaByDoc = new Map();

  const pushCuradoriaLink = (docPath, itemObj) => {
    const entry = ensure(docPath);
    if (!entry) return;
    let seen = seenCuradoriaByDoc.get(docPath);
    if (!seen) {
      seen = new Set();
      seenCuradoriaByDoc.set(docPath, seen);
    }
    const dedupeKey = `${itemObj.videoId}:${itemObj.source}:${itemObj.playlistTitle || ''}`;
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);
    entry.curadoria.push(itemObj);
  };

  for (const pl of curadoria?.playlists || []) {
    for (const it of pl.items || []) {
      const vid = String(it.videoId || it.id || '').trim();
      if (vid && !playlistItemsById.has(vid)) {
        playlistItemsById.set(vid, it);
      }
      if (it.linkedDocPath) {
        pushCuradoriaLink(it.linkedDocPath, {
          videoId: vid,
          title: it.title || '',
          url: it.url || (vid ? `https://www.youtube.com/watch?v=${vid}` : ''),
          source: 'playlist',
          playlistTitle: pl.title || '',
        });
      }
    }
  }

  for (const [vid, vm] of Object.entries(curadoria?.videoMeta || {})) {
    if (!vm || !vm.linkedDocPath) continue;
    const info = videosById.get(vid) || playlistItemsById.get(vid);
    pushCuradoriaLink(vm.linkedDocPath, {
      videoId: vid,
      title: info?.title || '',
      url: info?.url || `https://www.youtube.com/watch?v=${vid}`,
      source: 'videoMeta',
      playlistTitle: '',
    });
  }

  const kdVideos =
    channelKey === 'mrj' || channelCfg?.kdenliveFolder === 'videos/mrj'
      ? kdenliveSummary?.videosMrj || []
      : kdenliveSummary?.videosCrom || [];

  for (const doc of docs || []) {
    const ytId = String(doc.meta?.youtube_id || '').trim();
    if (ytId) {
      const v = videosById.get(ytId) || playlistItemsById.get(ytId);
      const existingList = links[doc.path]?.curadoria || [];
      if (v && !existingList.some((x) => x.videoId === ytId)) {
        pushCuradoriaLink(doc.path, {
          videoId: ytId,
          title: v.title || '',
          url: v.url || `https://www.youtube.com/watch?v=${ytId}`,
          source: 'youtube',
          playlistTitle: '',
        });
      }
    }

    if (kdVideos.length > 0) {
      const stem = path.basename(doc.path, '.md').toLowerCase();
      const stemNoDate = stem.replace(/^\d{4}-\d{2}-/, '');
      const docIdSlug = slugify(doc.meta?.id || '');
      for (const kv of kdVideos) {
        const kvSlug = String(kv.slug || '').toLowerCase();
        if (!kvSlug) continue;
        const matched =
          kvSlug === stem ||
          kvSlug === stemNoDate ||
          kvSlug === docIdSlug ||
          (ytId && String(kv.youtubeUrl || '').includes(ytId)) ||
          String(doc.raw || '').includes(`/${kvSlug}`);
        if (matched) {
          const entry = ensure(doc.path);
          if (entry && !entry.kdenlive.some((k) => k.slug === kv.slug)) {
            entry.kdenlive.push({
              slug: kv.slug,
              title: kv.title || kv.slug,
              serie: kv.serie || '',
              youtubeUrl: kv.youtubeUrl || '',
              hasProgress: Boolean(kv.hasProgress),
              hasRender: Boolean(kv.hasRender),
              path: kv.path || '',
            });
          }
        }
      }
    }
  }

  return links;
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
    const canalMeta = readKdenliveJson(path.join(folderPath, 'canal_meta.json'));
    const pubJson = readKdenliveJson(path.join(folderPath, 'publicacao.json'));
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

  const canais = readKdenliveJson(path.join(kdenliveRoot, 'canais.json'));
  const canalJson = readKdenliveJson(path.join(kdenliveRoot, 'canal.json')) || {};
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

export function buildChannelState(ch, config = null, kdenliveSummary = null) {
  const channelCfg = typeof ch === 'string' ? config?.channels?.[ch] : ch;
  const channelKey = channelCfg?.key || (typeof ch === 'string' ? ch : '');
  if (!channelCfg) {
    throw Object.assign(new Error(`Canal inválido para buildChannelState: ${String(ch || '')}`), {
      statusCode: 400,
    });
  }
  const effectiveKdenlive =
    kdenliveSummary || (config?.kdenliveRoot ? loadKdenliveSummary(config.kdenliveRoot) : null);

  const wsPath = channelCfg.workspacePath;
  const workspaceExists = Boolean(wsPath && fs.existsSync(wsPath));
  const files = walkMarkdownFiles(wsPath);
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
      versioning: getVersioningSummary(channelCfg.workspacePath, relPath),
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
  const rawVideos = Array.isArray(ytCache.videos) ? ytCache.videos : [];
  const videos = rawVideos.map((v) => {
    const isShort = v.isShort !== undefined ? Boolean(v.isShort) : v.type === 'short';
    const vid = String(v.videoId || v.id || '');
    return {
      ...v,
      id: String(v.id || vid),
      videoId: vid,
      isShort,
      type: v.type || (isShort ? 'short' : 'long'),
      duration: String(v.duration || ''),
      views: Number(v.views || 0),
      viewsText: String(v.viewsText || ''),
      published: String(v.published || ''),
      publishedText: String(v.publishedText || ''),
    };
  });
  const totalShorts = videos.filter((v) => v.isShort).length;
  const totalLongs = videos.length - totalShorts;
  const totalViews = Number(
    ytCache.totalViews ?? videos.reduce((acc, v) => acc + Number(v.views || 0), 0)
  );
  const lastSyncedAt = String(
    ytCache.lastSyncedAt || ytCache.channel?.lastSyncedAt || ytCache.channel?.lastSync || ''
  );
  const computedTotalVideos = Math.max(
    Number(channelCfg.totalVideos || 0),
    Number(ytCache.totalVideos ?? ytCache.channel?.totalVideos ?? 0),
    videos.length
  );

  const folderSet = new Set(docs.map((d) => d.folder));
  const seriesSet = new Set([
    ...(channelCfg.seriesList || []),
    ...docs.map((d) => d.meta.serie).filter(Boolean),
    ...videos.map((v) => v.serie).filter(Boolean),
  ]);

  const rawMergedLinks = {
    ...(ytCache.channel?.links || {}),
    ...(channelCfg.links || {}),
  };
  const mergedLinks = {};
  for (const [lk, lv] of Object.entries(rawMergedLinks)) {
    const val = String(lv || '').trim();
    if (val) mergedLinks[lk] = val;
  }

  const channelStatus = channelCfg.status || ytCache.channel?.status || 'ativo';
  const computedStatusLabel =
    channelCfg.statusLabel !== undefined && channelCfg.statusLabel !== ''
      ? channelCfg.statusLabel
      : channelStatus === 'pausado'
      ? 'Pausado'
      : channelStatus === 'oculto'
      ? ''
      : ytCache.channel?.statusLabel || 'Ativo';

  const mergedChannel = {
    ...(ytCache.channel || {}),
    key: channelKey,
    name: channelCfg.name || ytCache.channel?.name || channelKey,
    handle: channelCfg.handle || ytCache.channel?.handle || '',
    id: channelCfg.channelId || ytCache.channel?.id || '',
    url: channelCfg.url || ytCache.channel?.url || '',
    status: channelStatus,
    statusLabel: computedStatusLabel,
    subscribers:
      channelCfg.subscribers !== undefined
        ? channelCfg.subscribers
        : Number(ytCache.channel?.subscribers || 0),
    totalVideos: computedTotalVideos,
    totalLongs,
    totalShorts,
    totalViews,
    lastSyncedAt,
    avatar: channelCfg.avatar !== undefined ? channelCfg.avatar : (ytCache.channel?.avatar || ''),
    bio: channelCfg.bio !== undefined ? channelCfg.bio : (ytCache.channel?.bio || ''),
    bannerEnabled: Boolean(channelCfg.bannerEnabled),
    bannerBadge: String(channelCfg.bannerBadge || ''),
    bannerTitle: String(channelCfg.bannerTitle || ''),
    bannerSubtitle: String(channelCfg.bannerSubtitle || ''),
    bannerDocPath: String(channelCfg.bannerDocPath || ''),
    spotlightSeries: Array.isArray(channelCfg.spotlightSeries) ? channelCfg.spotlightSeries : [],
    links: mergedLinks,
    kdenliveFolder: channelCfg.kdenliveFolder || 'videos',
  };

  const boards = listBoards(wsPath);
  const curadoria = loadCuradoria(wsPath);
  const notesList = loadWorkspaceNotesList(wsPath);
  const notesCount = notesList.length;

  let recordingsRes = { sessions: [] };
  if (workspaceExists) {
    try {
      recordingsRes = listRecordings(wsPath);
    } catch {
      recordingsRes = { sessions: [] };
    }
  }
  const recordingsCount = (recordingsRes.sessions || []).reduce(
    (sum, s) => sum + (Array.isArray(s.takes) ? s.takes.length : 0),
    0
  );

  let narrationsList = [];
  if (workspaceExists) {
    try {
      narrationsList = listUnifiedAudios(wsPath, { includeWorkspaceAudio: false });
    } catch {
      narrationsList = [];
    }
  }
  const narrationsCount = narrationsList.length;

  const quarantineCount = workspaceExists ? countQuarantineFiles(wsPath) : 0;
  let trashCount = 0;
  if (workspaceExists) {
    try {
      trashCount = listTrash(wsPath).items.length;
    } catch {
      trashCount = 0;
    }
  }

  const projectLinks = computeProjectLinks({
    channelKey,
    channelCfg,
    docs,
    videos,
    boards,
    recordingsRes,
    narrationsList,
    notesList,
    curadoria,
    kdenliveSummary: effectiveKdenlive,
  });

  const health = {
    quarantineCount,
    trashCount,
  };

  return {
    key: channelKey,
    workspaceName: `${mergedChannel.name} Studio`,
    workspacePath: wsPath,
    workspaceExists,
    channel: mergedChannel,
    videos,
    githubRepos: Array.isArray(ytCache.githubRepos) ? ytCache.githubRepos : [],
    folders: Array.from(folderSet).sort(),
    series: Array.from(seriesSet),
    docs,
    boards,
    curadoria,
    notesCount,
    recordingsCount,
    narrationsCount,
    projectLinks,
    health,
    stats: {
      docsCount: docs.length,
      videosCount: videos.length,
      totalVideos: computedTotalVideos,
      totalLongs,
      totalShorts,
      totalViews,
      boardsCount: boards.length,
      notesCount,
      recordingsCount,
      narrationsCount,
      quarantineCount,
      trashCount,
    },
  };
}

export function writeDiskBundles(payload, { dataDir = DATA_DIR, webDir = WEB_DIR } = {}) {
  const resolvedDataDir = dataDir || DATA_DIR;
  const resolvedWebDir = webDir || WEB_DIR;
  fs.mkdirSync(resolvedDataDir, { recursive: true });
  fs.mkdirSync(resolvedWebDir, { recursive: true });

  const dataJsonPath = path.join(resolvedDataDir, 'data.json');
  const dataJsPath = path.join(resolvedDataDir, 'data.js');
  const webDataJsPath = path.join(resolvedWebDir, 'data.js');

  const jsBundle = `/* Gerado automaticamente por src/sync.mjs — não editar manualmente */\nwindow.CROM_STUDIO_DATA = ${JSON.stringify(payload)};\nwindow.MRJ_STUDIO_DATA = window.CROM_STUDIO_DATA;\n`;

  writeFileAtomic(dataJsonPath, JSON.stringify(payload, null, 2) + '\n', {
    encoding: 'utf8',
    backup: false,
  });
  writeFileAtomic(dataJsPath, jsBundle, { encoding: 'utf8', backup: false });
  writeFileAtomic(webDataJsPath, jsBundle, { encoding: 'utf8', backup: false });
}

export function syncWorkspace({
  serverMode = false,
  config: passedConfig = null,
  writeDisk = true,
  dataDir = DATA_DIR,
  webDir = WEB_DIR,
} = {}) {
  const config = passedConfig || loadConfig();
  const kdenlive = loadKdenliveSummary(config.kdenliveRoot);
  const channelsPayload = {};

  for (const key of config.channelOrder) {
    channelsPayload[key] = buildChannelState(config.channels[key], config, kdenlive);
  }

  const payload = {
    version: 2,
    generatedAt: new Date().toISOString(),
    serverMode,
    defaultChannel: config.defaultChannel,
    channelOrder: config.channelOrder,
    configMeta: {
      port: config.port,
      host: config.host,
      kdenliveRoot: config.kdenliveRoot,
      kdenliveRootRaw: config.kdenliveRootRaw || config.kdenliveRoot || '',
      configFile: path.basename(config.configPath || ''),
    },
    channels: channelsPayload,
    kdenlive,
  };

  if (writeDisk !== false && !config?.disableDiskBundles) {
    writeDiskBundles(payload, {
      dataDir: config?.dataDir || dataDir,
      webDir: config?.webDir || webDir,
    });
  }

  return payload;
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

function buildInitialCatalogMarkdown(channelKey, channelCfg, totalViews, totalVideos) {
  const handle = channelCfg.handle || channelCfg.name || channelKey;
  const channelId = channelCfg.channelId || '';
  const today = new Date().toISOString().slice(0, 10);
  const frontmatter = [
    '---',
    `id: ${JSON.stringify(`${channelKey}-00-catalogo-youtube`)}`,
    `titulo: ${JSON.stringify(`Catálogo Oficial de Vídeos (${handle})`)}`,
    'tipo: "referencia"',
    'status: "referencia"',
    'serie: "Canal & Ops"',
    'formato: "doc"',
    'prioridade: "alta"',
    'duracao_estimada: "4 min"',
    `data_criacao: ${JSON.stringify(today)}`,
    'data_alvo: ""',
    'repo_github: "MrJc01"',
    `youtube_id: ${JSON.stringify(channelId)}`,
    `views: ${Number(totalViews || 0)}`,
    'tags: ["youtube", "catalogo", "historico", "analytics"]',
    `resumo: ${JSON.stringify(`Registro completo dos ${totalVideos} vídeos sincronizados do canal ${handle} com formatos, datas e visualizações.`)}`,
    '---',
    '',
    `# Catálogo Oficial — YouTube \`${handle}\``,
    '',
    '<!-- YOUTUBE_CATALOG_START -->',
    '<!-- YOUTUBE_CATALOG_END -->',
    '',
  ];
  return frontmatter.join('\n');
}

function updateFrontmatterViews(content, totalViews) {
  const norm = String(content || '').replace(/\r\n/g, '\n');
  if (!norm.startsWith('---\n')) return content;
  const endIdx = norm.indexOf('\n---\n', 4);
  if (endIdx === -1) return content;
  const fm = norm.slice(0, endIdx);
  const rest = norm.slice(endIdx);
  if (/^views:\s*\d+/m.test(fm)) {
    return fm.replace(/^views:\s*\d+/m, `views: ${Number(totalViews || 0)}`) + rest;
  }
  return content;
}

function updateCatalogMarkdown(cache, channelCfg, channelKey) {
  if (!channelCfg?.workspacePath || !fs.existsSync(channelCfg.workspacePath)) return;
  const canalDir = path.join(channelCfg.workspacePath, '00-canal');
  const catalogPath = path.join(canalDir, 'catalogo-youtube.md');

  if (fs.existsSync(catalogPath) && fs.lstatSync(catalogPath).isSymbolicLink()) return;

  const videos = [...(cache.videos || [])].sort((a, b) => {
    if (a.published && b.published) {
      return String(b.published).localeCompare(String(a.published));
    }
    if (a.published && !b.published) return -1;
    if (!a.published && b.published) return 1;
    return 0;
  });

  const shorts = videos.filter((v) => v.isShort || v.type === 'short').length;
  const longs = videos.length - shorts;
  const totalViews = Number(
    cache.totalViews ?? videos.reduce((acc, v) => acc + Number(v.views || 0), 0)
  );
  const subs = Number(channelCfg.subscribers ?? cache.channel?.subscribers ?? 0);
  const totalPublic = Math.max(
    videos.length,
    Number(channelCfg.totalVideos ?? cache.totalVideos ?? cache.channel?.totalVideos ?? videos.length)
  );

  let content;
  if (!fs.existsSync(catalogPath)) {
    fs.mkdirSync(canalDir, { recursive: true });
    content = buildInitialCatalogMarkdown(channelKey, channelCfg, totalViews, videos.length);
  } else {
    content = updateFrontmatterViews(fs.readFileSync(catalogPath, 'utf8'), totalViews);
  }

  const startTag = '<!-- YOUTUBE_CATALOG_START -->';
  const endTag = '<!-- YOUTUBE_CATALOG_END -->';
  const startIdx = content.indexOf(startTag);
  const endIdx = content.indexOf(endTag);
  if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) return;

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
    const formatLabel = v.isShort || v.type === 'short' ? 'Short' : 'Long';
    const dateLabel = v.published || v.publishedText || '—';
    lines.push(
      `| \`${dateLabel}\` | ${formatLabel} | ${v.views} | ${safeTitle} | ${v.serie || '—'} | [${v.id}](${v.url}) |`
    );
  }

  const updated =
    content.slice(0, startIdx + startTag.length) +
    '\n' +
    lines.join('\n') +
    '\n' +
    content.slice(endIdx);

  writeFileAtomic(catalogPath, updated, { encoding: 'utf8', backup: false });
}

async function syncChannelRss(channelKey, channelCfg) {
  const cache = loadYouTubeCache(channelKey, channelCfg);
  const channelId = channelCfg.channelId || cache.channel?.id || '';
  const handle = channelCfg.handle || cache.channel?.handle || '';
  const hasValidChannelId = Boolean(channelId && !/^UCX+$|^UCY+$/i.test(channelId));

  if (!hasValidChannelId && !handle) {
    return {
      channel: channelKey,
      ok: false,
      updatedCount: 0,
      warning: `Canal "${channelKey}" sem channelId ou handle configurado.`,
    };
  }

  let warning = null;
  let updatedCount = 0;
  let source = cache.source || 'cache';

  try {
    const scraped = await fetchChannelAllVideos({
      handle,
      channelId: hasValidChannelId ? channelId : '',
      maxPages: 20,
    });
    source = scraped.source || 'youtube-html';

    const existingById = new Map(
      (cache.videos || []).map((v) => [String(v.videoId || v.id), v])
    );

    const enrichItem = (v) => {
      const prev = existingById.get(v.videoId);
      const isShort = Boolean(v.isShort || v.type === 'short');
      const views = Number.isFinite(Number(v.views))
        ? Number(v.views)
        : Number(prev?.views || 0);
      return {
        id: v.videoId,
        videoId: v.videoId,
        title: v.title || prev?.title || '',
        published: v.published || prev?.published || '',
        publishedText: v.publishedText || prev?.publishedText || '',
        views,
        viewsText:
          v.viewsText ||
          (views > 0
            ? `${views.toLocaleString('pt-BR')} visualizações`
            : ''),
        duration: v.duration || prev?.duration || '',
        isShort,
        type: isShort ? 'short' : 'long',
        serie: prev?.serie || inferVideoSerie(v.title || prev?.title || '', isShort, channelKey),
        url: v.url || prev?.url || `https://www.youtube.com/watch?v=${v.videoId}`,
        thumbnail:
          v.thumbnail ||
          prev?.thumbnail ||
          `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`,
      };
    };

    let finalVideos;
    if (source === 'rss-fallback' && existingById.size > 0) {
      for (const v of scraped.videos) {
        existingById.set(v.videoId, enrichItem(v));
      }
      finalVideos = Array.from(existingById.values());
    } else {
      finalVideos = scraped.videos.map(enrichItem);
    }

    finalVideos.sort((a, b) => {
      if (a.published && b.published) {
        return String(b.published).localeCompare(String(a.published));
      }
      if (a.published && !b.published) return -1;
      if (!a.published && b.published) return 1;
      return 0;
    });

    updatedCount = scraped.videos.length;
    const totalVideos = finalVideos.length;
    const totalShorts = finalVideos.filter((v) => v.isShort || v.type === 'short').length;
    const totalLongs = totalVideos - totalShorts;
    const totalViews = finalVideos.reduce((acc, v) => acc + Number(v.views || 0), 0);
    const lastSyncedAt = new Date().toISOString();

    cache.videos = finalVideos;
    cache.totalVideos = totalVideos;
    cache.totalLongs = totalLongs;
    cache.totalShorts = totalShorts;
    cache.totalViews = totalViews;
    cache.lastSyncedAt = lastSyncedAt;
    cache.source = source;
    cache.channel = {
      ...(cache.channel || {}),
      name: channelCfg.name || cache.channel?.name,
      handle: channelCfg.handle || cache.channel?.handle,
      id: channelId || cache.channel?.id || '',
      url: channelCfg.url || cache.channel?.url,
      subscribers: channelCfg.subscribers ?? cache.channel?.subscribers ?? 0,
      totalVideos: Math.max(Number(channelCfg.totalVideos || 0), totalVideos),
      totalLongs,
      totalShorts,
      totalViews,
      avatar: channelCfg.avatar || cache.channel?.avatar || '',
      lastSync: lastSyncedAt,
      lastSyncedAt,
    };

    const wsPath = channelCfg?.workspacePath;
    if (wsPath && fs.existsSync(wsPath)) {
      writeJsonAtomic(getWorkspaceYoutubeCachePath(wsPath), cache, { schemaVersion: 1, backup: true });
    } else {
      writeJsonAtomic(getLegacyYoutubeCachePath(channelKey), cache, { schemaVersion: 1, backup: true });
    }
    updateCatalogMarkdown(cache, channelCfg, channelKey);
  } catch (err) {
    warning = `Não foi possível acessar o catálogo YouTube de ${channelKey} agora (${err.message}); mantendo cache local.`;
  }

  return {
    channel: channelKey,
    ok: !warning,
    updatedCount,
    totalVideos: Number(cache.totalVideos ?? cache.videos?.length ?? 0),
    totalLongs: Number(cache.totalLongs ?? 0),
    totalShorts: Number(cache.totalShorts ?? 0),
    totalViews: Number(cache.totalViews ?? 0),
    source,
    warning,
  };
}

export async function syncYouTubeRss({
  serverMode = false,
  channel = 'all',
  config: passedConfig = null,
  writeDisk = true,
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

  const state = syncWorkspace({ serverMode, config, writeDisk });
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
      .map(
        (c) =>
          `${c.key}:${c.docs.length}md/${c.videos.length}vid(${c.channel.totalLongs}L/${c.channel.totalShorts}S)`
      )
      .join(', ');
    console.log(
      `[Crom Studio Sync] ${summary} | YouTube: ${res.ok ? `OK (${res.updatedCount})` : res.warning}`
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
