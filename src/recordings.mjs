import { execFile, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { slugify } from './sync.mjs';

const execFileAsync = promisify(execFile);

export const RECORDINGS_DIR_NAME = 'gravacoes';
export const MAX_RECORDING_BYTES = 512 * 1024 * 1024; // 512 MB

const SESSION_ID_RE = /^\d{4}-\d{2}-\d{2}_[a-z0-9][a-z0-9_-]{0,80}$/;
const TAKE_ID_RE = /^take-\d{2,4}$/;
const FILE_NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,120}$/;
const EXT_RE = /^[a-z0-9]{1,10}$/;

const TRACK_KIND_PREFIX = {
  combinado: '01-combinado',
  tela: '02-tela',
  webcam: '03-webcam',
  voz: '04-voz',
};

const MEDIA_MIME_TYPES = {
  '.webm': 'video/webm',
  '.mp4': 'video/mp4',
  '.mkv': 'video/x-matroska',
  '.mov': 'video/quicktime',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.opus': 'audio/opus',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
};

function httpError(message, statusCode) {
  return Object.assign(new Error(message), { statusCode });
}

function isExecutableFile(candidatePath) {
  if (!candidatePath || typeof candidatePath !== 'string') return false;
  try {
    const st = fs.statSync(candidatePath);
    if (!st.isFile()) return false;
    fs.accessSync(candidatePath, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export function resolveFfmpegPath() {
  const candidates = [];
  if (process.env.FFMPEG_PATH) {
    candidates.push(process.env.FFMPEG_PATH.trim());
  }
  candidates.push(path.join(os.homedir(), '.local', 'bin', 'ffmpeg'));
  candidates.push('/usr/bin/ffmpeg');
  candidates.push('/usr/local/bin/ffmpeg');

  for (const cand of candidates) {
    if (isExecutableFile(cand)) return cand;
  }

  try {
    const found = execFileSync('which', ['ffmpeg'], {
      encoding: 'utf8',
      timeout: 2000,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .split(/\r?\n/)[0]
      .trim();
    if (isExecutableFile(found)) return found;
  } catch {
    // ffmpeg não encontrado no PATH
  }
  return null;
}

export function resolveFfprobePath(ffmpegPath = null) {
  const candidates = [];
  if (process.env.FFPROBE_PATH) {
    candidates.push(process.env.FFPROBE_PATH.trim());
  }
  if (ffmpegPath) {
    candidates.push(path.join(path.dirname(ffmpegPath), 'ffprobe'));
  }
  candidates.push(path.join(os.homedir(), '.local', 'bin', 'ffprobe'));
  candidates.push('/usr/bin/ffprobe');
  candidates.push('/usr/local/bin/ffprobe');

  for (const cand of candidates) {
    if (isExecutableFile(cand)) return cand;
  }

  try {
    const found = execFileSync('which', ['ffprobe'], {
      encoding: 'utf8',
      timeout: 2000,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .split(/\r?\n/)[0]
      .trim();
    if (isExecutableFile(found)) return found;
  } catch {
    // ffprobe opcional
  }
  return null;
}

function assertInsideRoot(rootReal, targetPath) {
  if (targetPath !== rootReal && !targetPath.startsWith(rootReal + path.sep)) {
    throw httpError('Acesso fora da pasta de gravações bloqueado', 403);
  }
}

function assertNoSymlinkChain(rootReal, targetAbs) {
  const rel = path.relative(rootReal, targetAbs);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) {
    throw httpError('Acesso fora da pasta de gravações bloqueado', 403);
  }
  let cur = rootReal;
  for (const part of rel.split(path.sep)) {
    cur = path.join(cur, part);
    if (!fs.existsSync(cur)) break;
    const st = fs.lstatSync(cur);
    if (st.isSymbolicLink()) {
      throw httpError('Symlinks não são permitidos na pasta de gravações', 403);
    }
  }
  let probe = targetAbs;
  while (!fs.existsSync(probe)) {
    const parent = path.dirname(probe);
    if (parent === probe) break;
    probe = parent;
  }
  const realProbe = fs.realpathSync(probe);
  assertInsideRoot(rootReal, realProbe);
}

function resolveRecordingsDir(wsPath, { ensureDir = false } = {}) {
  if (!wsPath || typeof wsPath !== 'string' || !fs.existsSync(wsPath)) {
    throw httpError('Workspace não encontrado', 404);
  }
  const wsReal = fs.realpathSync(wsPath);
  const recDir = path.join(wsReal, RECORDINGS_DIR_NAME);

  if (fs.existsSync(recDir)) {
    const st = fs.lstatSync(recDir);
    if (st.isSymbolicLink() || !st.isDirectory()) {
      throw httpError('Pasta gravacoes inválida ou symlink não permitido', 403);
    }
    const recDirReal = fs.realpathSync(recDir);
    if (recDirReal !== recDir || !recDirReal.startsWith(wsReal + path.sep)) {
      throw httpError('Pasta gravacoes fora do workspace', 403);
    }
    return { wsReal, recDirReal, exists: true };
  }

  if (!ensureDir) {
    return { wsReal, recDirReal: recDir, exists: false };
  }

  fs.mkdirSync(recDir, { recursive: true });
  const st = fs.lstatSync(recDir);
  if (st.isSymbolicLink() || !st.isDirectory()) {
    throw httpError('Pasta gravacoes inválida', 403);
  }
  const recDirReal = fs.realpathSync(recDir);
  return { wsReal, recDirReal, exists: true };
}

function validateSessionId(sessionId) {
  const clean = String(sessionId || '').trim();
  if (!clean) throw httpError('sessionId ausente', 400);
  if (clean.includes('..') || clean.includes('/') || clean.includes('\\') || clean.includes('\0')) {
    throw httpError('sessionId proibido', 403);
  }
  if (!SESSION_ID_RE.test(clean)) {
    throw httpError('Formato de sessionId inválido (esperado AAAA-MM-DD_slug)', 400);
  }
  return clean;
}

function validateTakeId(takeId) {
  const clean = String(takeId || '').trim();
  if (!clean) throw httpError('takeId ausente', 400);
  if (clean.includes('..') || clean.includes('/') || clean.includes('\\') || clean.includes('\0')) {
    throw httpError('takeId proibido', 403);
  }
  if (!TAKE_ID_RE.test(clean)) {
    throw httpError('Formato de takeId inválido (esperado take-NN)', 400);
  }
  return clean;
}

function validateFileName(fileName) {
  const clean = String(fileName || '').trim();
  if (!clean) throw httpError('fileName ausente', 400);
  if (clean.includes('..') || clean.includes('/') || clean.includes('\\') || clean.includes('\0') || clean.startsWith('.')) {
    throw httpError('Nome de arquivo proibido', 403);
  }
  if (!FILE_NAME_RE.test(clean)) {
    throw httpError('Nome de arquivo inválido', 400);
  }
  return clean;
}

function resolveSessionPath(wsPath, sessionId, { ensureDir = false, mustExist = false } = {}) {
  const cleanSession = validateSessionId(sessionId);
  const { wsReal, recDirReal, exists } = resolveRecordingsDir(wsPath, { ensureDir });
  const sessionAbs = path.resolve(recDirReal, cleanSession);
  assertInsideRoot(recDirReal, sessionAbs);
  if (exists) {
    assertNoSymlinkChain(recDirReal, sessionAbs);
  }
  if (mustExist && (!exists || !fs.existsSync(sessionAbs))) {
    throw httpError(`Sessão de gravação "${cleanSession}" não encontrada`, 404);
  }
  return { wsReal, recDirReal, sessionId: cleanSession, sessionAbs };
}

function resolveTakePath(wsPath, sessionId, takeId, { ensureDir = false, mustExist = false } = {}) {
  const cleanTake = validateTakeId(takeId);
  const sessionCtx = resolveSessionPath(wsPath, sessionId, { ensureDir, mustExist });
  const takeAbs = path.resolve(sessionCtx.sessionAbs, cleanTake);
  assertInsideRoot(sessionCtx.recDirReal, takeAbs);
  if (fs.existsSync(sessionCtx.sessionAbs)) {
    assertNoSymlinkChain(sessionCtx.recDirReal, takeAbs);
  }
  if (mustExist && !fs.existsSync(takeAbs)) {
    throw httpError(`Take "${cleanTake}" não encontrado na sessão "${sessionCtx.sessionId}"`, 404);
  }
  return { ...sessionCtx, takeId: cleanTake, takeAbs };
}

function writeJsonAtomic(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.tmp.${process.pid}.${Date.now()}`;
  fs.writeFileSync(tmpPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  fs.renameSync(tmpPath, filePath);
}

function readTakeMeta(takeAbs) {
  const metaPath = path.join(takeAbs, 'meta.json');
  if (!fs.existsSync(metaPath)) return {};
  try {
    const st = fs.lstatSync(metaPath);
    if (st.isSymbolicLink() || !st.isFile()) return {};
    return JSON.parse(fs.readFileSync(metaPath, 'utf8')) || {};
  } catch {
    return {};
  }
}

function inferTrackKind(fileName) {
  const lower = fileName.toLowerCase();
  if (lower.startsWith('01-combinado.')) return 'combinado';
  if (lower.startsWith('02-tela.')) return 'tela';
  if (lower.startsWith('03-webcam.')) return 'webcam';
  if (lower.startsWith('04-voz.')) return 'voz';
  return 'outro';
}

function getMediaMimeType(fileName) {
  const ext = path.extname(fileName).toLowerCase();
  if (ext === '.webm' && fileName.toLowerCase().startsWith('04-voz.')) {
    return 'audio/webm';
  }
  return MEDIA_MIME_TYPES[ext] || 'application/octet-stream';
}

function readTakeInfo(wsReal, sessionId, takeId, takeAbs) {
  const meta = readTakeMeta(takeAbs);
  const takeStat = fs.statSync(takeAbs);
  const relDir = `${RECORDINGS_DIR_NAME}/${sessionId}/${takeId}`;
  const numMatch = /^take-(\d+)$/.exec(takeId);
  const number = Number(meta.number || (numMatch ? Number(numMatch[1]) : 1));

  const entries = fs.readdirSync(takeAbs, { withFileTypes: true });
  const tracks = [];
  for (const entry of entries) {
    if (entry.isSymbolicLink() || !entry.isFile()) continue;
    if (entry.name === 'meta.json' || entry.name.startsWith('.') || entry.name.includes('.tmp.')) continue;
    const full = path.join(takeAbs, entry.name);
    const st = fs.statSync(full);
    const ext = path.extname(entry.name).replace(/^\./, '').toLowerCase();
    const kind = inferTrackKind(entry.name);
    const mimeType = getMediaMimeType(entry.name);
    tracks.push({
      kind,
      fileName: entry.name,
      ext,
      size: st.size,
      relPath: `${relDir}/${entry.name}`,
      mimeType,
      mediaKind: mimeType.startsWith('audio/') ? 'audio' : 'video',
      createdAt: st.mtime.toISOString(),
    });
  }

  tracks.sort((a, b) => a.fileName.localeCompare(b.fileName, 'en'));

  return {
    id: takeId,
    number,
    createdAt: meta.createdAt || takeStat.birthtime?.toISOString?.() || takeStat.mtime.toISOString(),
    updatedAt: meta.updatedAt || takeStat.mtime.toISOString(),
    mode: meta.mode || 'all',
    scriptPath: meta.scriptPath || '',
    notes: meta.notes || '',
    title: meta.title || '',
    dirPath: takeAbs,
    relDir,
    tracks,
  };
}

function formatSlugAsTitle(slug) {
  return String(slug || '')
    .split('-')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export function listRecordings(wsPath) {
  const ffmpegPath = resolveFfmpegPath();
  const { wsReal, recDirReal, exists } = resolveRecordingsDir(wsPath, { ensureDir: false });

  if (!exists) {
    return {
      ffmpegAvailable: Boolean(ffmpegPath),
      recordingsDir: recDirReal,
      sessions: [],
    };
  }

  const sessionEntries = fs.readdirSync(recDirReal, { withFileTypes: true });
  const sessions = [];

  for (const entry of sessionEntries) {
    if (entry.isSymbolicLink() || !entry.isDirectory()) continue;
    if (!SESSION_ID_RE.test(entry.name)) continue;

    const sessionAbs = path.join(recDirReal, entry.name);
    const takeEntries = fs.readdirSync(sessionAbs, { withFileTypes: true });
    const takes = [];

    for (const tEntry of takeEntries) {
      if (tEntry.isSymbolicLink() || !tEntry.isDirectory()) continue;
      if (!TAKE_ID_RE.test(tEntry.name)) continue;
      const takeAbs = path.join(sessionAbs, tEntry.name);
      takes.push(readTakeInfo(wsReal, entry.name, tEntry.name, takeAbs));
    }

    takes.sort((a, b) => b.number - a.number);

    const sepIdx = entry.name.indexOf('_');
    const date = sepIdx > 0 ? entry.name.slice(0, sepIdx) : '';
    const slug = sepIdx > 0 ? entry.name.slice(sepIdx + 1) : entry.name;
    const latestTake = takes[0] || null;
    const title = (latestTake && latestTake.title) || formatSlugAsTitle(slug) || entry.name;
    const sessionStat = fs.statSync(sessionAbs);

    sessions.push({
      id: entry.name,
      date,
      slug,
      title,
      dirPath: sessionAbs,
      relDir: `${RECORDINGS_DIR_NAME}/${entry.name}`,
      createdAt: (takes[takes.length - 1]?.createdAt) || sessionStat.mtime.toISOString(),
      updatedAt: (latestTake?.updatedAt) || sessionStat.mtime.toISOString(),
      takes,
    });
  }

  sessions.sort((a, b) => {
    const dateCmp = String(b.date || '').localeCompare(String(a.date || ''));
    if (dateCmp !== 0) return dateCmp;
    return String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''));
  });

  return {
    ffmpegAvailable: Boolean(ffmpegPath),
    recordingsDir: recDirReal,
    sessions,
  };
}

export function createRecordingTake(wsPath, options = {}) {
  const rawTitle = String(options.title || '').trim();
  const rawSlug = String(options.slug || rawTitle || 'gravacao').trim();
  const safeSlug = slugify(rawSlug).slice(0, 64).replace(/-+$/, '') || 'gravacao';
  const dateStr = new Date().toISOString().slice(0, 10);

  let sessionId;
  if (options.sessionId && String(options.sessionId).trim()) {
    sessionId = validateSessionId(options.sessionId);
  } else {
    sessionId = `${dateStr}_${safeSlug}`;
  }

  const { wsReal, sessionAbs } = resolveSessionPath(wsPath, sessionId, { ensureDir: true });
  fs.mkdirSync(sessionAbs, { recursive: true });

  const existingEntries = fs.readdirSync(sessionAbs, { withFileTypes: true });
  let maxNum = 0;
  for (const entry of existingEntries) {
    if (!entry.isDirectory()) continue;
    const m = /^take-(\d+)$/.exec(entry.name);
    if (m) {
      const n = Number(m[1]);
      if (n > maxNum) maxNum = n;
    }
  }

  const nextNum = maxNum + 1;
  const takeId = `take-${String(nextNum).padStart(2, '0')}`;
  const takeAbs = path.join(sessionAbs, takeId);
  assertInsideRoot(sessionAbs, takeAbs);
  fs.mkdirSync(takeAbs, { recursive: true });

  const nowIso = new Date().toISOString();
  const sepIdx = sessionId.indexOf('_');
  const sessionDate = sepIdx > 0 ? sessionId.slice(0, sepIdx) : dateStr;
  const sessionSlug = sepIdx > 0 ? sessionId.slice(sepIdx + 1) : safeSlug;

  const meta = {
    sessionId,
    takeId,
    number: nextNum,
    date: sessionDate,
    slug: sessionSlug,
    title: rawTitle || formatSlugAsTitle(sessionSlug),
    mode: String(options.mode || 'all').trim() || 'all',
    scriptPath: String(options.scriptPath || '').trim(),
    notes: String(options.notes || '').trim(),
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  writeJsonAtomic(path.join(takeAbs, 'meta.json'), meta);
  const take = readTakeInfo(wsReal, sessionId, takeId, takeAbs);

  return {
    sessionId,
    takeId,
    session: {
      id: sessionId,
      date: sessionDate,
      slug: sessionSlug,
      title: meta.title,
      dirPath: sessionAbs,
      relDir: `${RECORDINGS_DIR_NAME}/${sessionId}`,
    },
    take,
  };
}

export async function saveRecordingTrack(wsPath, { sessionId, takeId, kind, ext, req }) {
  const cleanKind = String(kind || '').trim().toLowerCase();
  const filePrefix = TRACK_KIND_PREFIX[cleanKind];
  if (!filePrefix) {
    throw httpError('Tipo de faixa inválido. Use: combinado, tela, webcam ou voz.', 400);
  }

  const cleanExt = String(ext || 'webm').replace(/^\.+/, '').trim().toLowerCase();
  if (!EXT_RE.test(cleanExt)) {
    throw httpError('Extensão de arquivo inválida.', 400);
  }

  if (!req || typeof req.on !== 'function') {
    throw httpError('Stream de requisição ausente para upload de faixa.', 400);
  }

  const contentLenHeader = Number(req.headers?.['content-length']);
  if (Number.isFinite(contentLenHeader) && contentLenHeader > MAX_RECORDING_BYTES) {
    throw httpError('Arquivo excede o limite de 512 MB.', 413);
  }

  const { wsReal, takeAbs } = resolveTakePath(wsPath, sessionId, takeId, {
    ensureDir: false,
    mustExist: true,
  });

  const fileName = `${filePrefix}.${cleanExt}`;
  const destAbs = path.join(takeAbs, fileName);
  const tmpAbs = path.join(takeAbs, `.upload-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.tmp`);

  await new Promise((resolve, reject) => {
    const outStream = fs.createWriteStream(tmpAbs, { flags: 'w' });
    let totalBytes = 0;
    let settled = false;

    const cleanupAndReject = (err) => {
      if (settled) return;
      settled = true;
      req.unpipe?.(outStream);
      outStream.destroy();
      try {
        if (fs.existsSync(tmpAbs)) fs.unlinkSync(tmpAbs);
      } catch {
        // ignora erro de limpeza
      }
      reject(err);
    };

    req.on('data', (chunk) => {
      totalBytes += chunk.length;
      if (totalBytes > MAX_RECORDING_BYTES) {
        req.destroy();
        cleanupAndReject(httpError('Upload excedeu o limite máximo de 512 MB.', 413));
      }
    });

    req.on('aborted', () => {
      cleanupAndReject(httpError('Upload interrompido pelo cliente.', 499));
    });

    req.on('error', (err) => {
      cleanupAndReject(err);
    });

    outStream.on('error', (err) => {
      cleanupAndReject(err);
    });

    outStream.on('finish', () => {
      if (settled) return;
      if (totalBytes === 0) {
        cleanupAndReject(httpError('Corpo do upload está vazio (0 bytes).', 400));
        return;
      }
      settled = true;
      resolve(totalBytes);
    });

    req.pipe(outStream);
  });

  fs.renameSync(tmpAbs, destAbs);

  const extraTracks = [];
  let ffmpegWarning = null;
  const ffmpegPath = resolveFfmpegPath();

  if (cleanKind === 'voz' && cleanExt !== 'wav' && ffmpegPath) {
    const wavName = '04-voz.wav';
    const wavAbs = path.join(takeAbs, wavName);
    const wavTmp = path.join(takeAbs, `.wav-${process.pid}-${Date.now()}.tmp.wav`);
    try {
      await execFileAsync(
        ffmpegPath,
        ['-y', '-i', destAbs, '-vn', '-acodec', 'pcm_s16le', '-ar', '48000', '-ac', '1', wavTmp],
        { timeout: 180000 }
      );
      fs.renameSync(wavTmp, wavAbs);
      const wavStat = fs.statSync(wavAbs);
      extraTracks.push({
        kind: 'voz',
        fileName: wavName,
        ext: 'wav',
        size: wavStat.size,
        relPath: `${RECORDINGS_DIR_NAME}/${sessionId}/${takeId}/${wavName}`,
        mimeType: 'audio/wav',
        mediaKind: 'audio',
        createdAt: wavStat.mtime.toISOString(),
      });
    } catch (err) {
      try {
        if (fs.existsSync(wavTmp)) fs.unlinkSync(wavTmp);
      } catch {
        // ignora
      }
      ffmpegWarning = `Não foi possível extrair 04-voz.wav automaticamente: ${err.message}`;
    }
  }

  const metaPath = path.join(takeAbs, 'meta.json');
  const existingMeta = readTakeMeta(takeAbs);
  writeJsonAtomic(metaPath, {
    ...existingMeta,
    sessionId,
    takeId,
    updatedAt: new Date().toISOString(),
  });

  const take = readTakeInfo(wsReal, sessionId, takeId, takeAbs);
  const track = take.tracks.find((t) => t.fileName === fileName) || null;

  return {
    track,
    extraTracks,
    wavExtracted: extraTracks.length > 0,
    ...(ffmpegWarning ? { warning: ffmpegWarning } : {}),
    take,
  };
}

async function probeHasAudioStream(ffmpegPath, srcAbs) {
  const ffprobePath = resolveFfprobePath(ffmpegPath);
  if (ffprobePath) {
    try {
      const { stdout } = await execFileAsync(
        ffprobePath,
        ['-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=index', '-of', 'csv=p=0', srcAbs],
        { timeout: 15000 }
      );
      return stdout.trim().length > 0;
    } catch {
      // fallback abaixo
    }
  }
  try {
    await execFileAsync(ffmpegPath, ['-v', 'info', '-i', srcAbs], { timeout: 15000 });
    return false;
  } catch (err) {
    const info = String(err.stderr || err.message || '');
    return /Stream #\d+:\d+.*Audio:/i.test(info);
  }
}

export async function convertTrackToMp4(wsPath, { sessionId, takeId, fileName }) {
  const ffmpegPath = resolveFfmpegPath();
  if (!ffmpegPath) {
    throw httpError('ffmpeg não encontrado no sistema para converter para MP4.', 503);
  }

  const cleanFile = validateFileName(fileName);
  const { wsReal, takeAbs } = resolveTakePath(wsPath, sessionId, takeId, {
    ensureDir: false,
    mustExist: true,
  });

  const srcAbs = path.join(takeAbs, cleanFile);
  assertInsideRoot(takeAbs, srcAbs);
  if (!fs.existsSync(srcAbs)) {
    throw httpError(`Arquivo "${cleanFile}" não encontrado no take.`, 404);
  }
  const st = fs.lstatSync(srcAbs);
  if (st.isSymbolicLink() || !st.isFile()) {
    throw httpError('Arquivo inválido para conversão.', 403);
  }

  const baseName = path.basename(cleanFile, path.extname(cleanFile));
  const outName = `${baseName}.mp4`;
  const outAbs = path.join(takeAbs, outName);
  const tmpOutAbs = path.join(takeAbs, `.mp4-${process.pid}-${Date.now()}.tmp.mp4`);

  const hasAudio = await probeHasAudioStream(ffmpegPath, srcAbs);
  const args = [
    '-y',
    '-i',
    srcAbs,
    '-vf',
    'pad=ceil(iw/2)*2:ceil(ih/2)*2',
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    '20',
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
  ];

  if (hasAudio) {
    args.push('-c:a', 'aac', '-b:a', '192k');
  } else {
    args.push('-an');
  }
  args.push(tmpOutAbs);

  try {
    await execFileAsync(ffmpegPath, args, { timeout: 600000 });
    fs.renameSync(tmpOutAbs, outAbs);
  } catch (err) {
    try {
      if (fs.existsSync(tmpOutAbs)) fs.unlinkSync(tmpOutAbs);
    } catch {
      // ignora
    }
    throw httpError(`Falha na conversão para MP4: ${err.stderr || err.message}`, 500);
  }

  const metaPath = path.join(takeAbs, 'meta.json');
  const existingMeta = readTakeMeta(takeAbs);
  writeJsonAtomic(metaPath, {
    ...existingMeta,
    sessionId,
    takeId,
    updatedAt: new Date().toISOString(),
  });

  const take = readTakeInfo(wsReal, sessionId, takeId, takeAbs);
  const track = take.tracks.find((t) => t.fileName === outName) || null;
  return { track, take };
}

export function deleteRecording(wsPath, { sessionId, takeId = null }) {
  if (takeId) {
    const { sessionAbs, takeAbs, sessionId: cleanSession, takeId: cleanTake } = resolveTakePath(
      wsPath,
      sessionId,
      takeId,
      { ensureDir: false, mustExist: true }
    );
    fs.rmSync(takeAbs, { recursive: true, force: true });

    const remainingTakes = fs
      .readdirSync(sessionAbs, { withFileTypes: true })
      .filter((e) => e.isDirectory() && TAKE_ID_RE.test(e.name));
    let sessionRemoved = false;
    if (remainingTakes.length === 0) {
      fs.rmSync(sessionAbs, { recursive: true, force: true });
      sessionRemoved = true;
    }

    return {
      deletedSessionId: cleanSession,
      deletedTakeId: cleanTake,
      sessionRemoved,
    };
  }

  const { sessionAbs, sessionId: cleanSession } = resolveSessionPath(wsPath, sessionId, {
    ensureDir: false,
    mustExist: true,
  });
  fs.rmSync(sessionAbs, { recursive: true, force: true });

  return {
    deletedSessionId: cleanSession,
    deletedTakeId: null,
    sessionRemoved: true,
  };
}

export function streamRecordingMedia(wsPath, relPath, req, res) {
  if (!relPath || typeof relPath !== 'string') {
    throw httpError('Caminho da mídia ausente', 400);
  }
  const { wsReal, recDirReal, exists } = resolveRecordingsDir(wsPath, { ensureDir: false });
  if (!exists) {
    throw httpError('Nenhuma gravação encontrada neste workspace', 404);
  }

  const normalized = String(relPath).replace(/\\/g, '/').replace(/^\/+/, '').trim();
  if (!normalized || normalized.includes('\0')) {
    throw httpError('Caminho de mídia inválido', 400);
  }
  const segments = normalized.split('/');
  if (segments.some((s) => !s || s === '.' || s === '..' || s.startsWith('.'))) {
    throw httpError('Segmento de caminho proibido', 403);
  }

  const abs = normalized.startsWith(`${RECORDINGS_DIR_NAME}/`)
    ? path.resolve(wsReal, normalized)
    : path.resolve(recDirReal, normalized);

  assertInsideRoot(recDirReal, abs);
  assertNoSymlinkChain(recDirReal, abs);

  if (!fs.existsSync(abs)) {
    throw httpError('Arquivo de gravação não encontrado', 404);
  }

  const st = fs.lstatSync(abs);
  if (st.isSymbolicLink() || !st.isFile()) {
    throw httpError('Acesso negado ao arquivo de mídia', 403);
  }

  const realAbs = fs.realpathSync(abs);
  assertInsideRoot(recDirReal, realAbs);

  const totalSize = st.size;
  const contentType = getMediaMimeType(path.basename(realAbs));
  const rangeHeader = req.headers?.range;

  if (rangeHeader) {
    const match = /^bytes=(\d*)-(\d*)$/i.exec(String(rangeHeader).trim());
    if (!match) {
      res.writeHead(416, {
        'Content-Range': `bytes */${totalSize}`,
        'Accept-Ranges': 'bytes',
      });
      res.end();
      return;
    }

    let start;
    let end;
    if (match[1] === '' && match[2] === '') {
      res.writeHead(416, {
        'Content-Range': `bytes */${totalSize}`,
        'Accept-Ranges': 'bytes',
      });
      res.end();
      return;
    } else if (match[1] === '') {
      const suffixLen = Number(match[2]);
      if (!Number.isFinite(suffixLen) || suffixLen <= 0) {
        res.writeHead(416, {
          'Content-Range': `bytes */${totalSize}`,
          'Accept-Ranges': 'bytes',
        });
        res.end();
        return;
      }
      start = Math.max(0, totalSize - suffixLen);
      end = totalSize - 1;
    } else {
      start = Number(match[1]);
      end = match[2] !== '' ? Number(match[2]) : totalSize - 1;
    }

    if (
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      start < 0 ||
      end < start ||
      start >= totalSize
    ) {
      res.writeHead(416, {
        'Content-Range': `bytes */${totalSize}`,
        'Accept-Ranges': 'bytes',
      });
      res.end();
      return;
    }

    end = Math.min(end, totalSize - 1);
    const chunkSize = end - start + 1;

    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${totalSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunkSize,
      'Content-Type': contentType,
      'Cache-Control': 'no-store',
    });
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    fs.createReadStream(realAbs, { start, end }).pipe(res);
    return;
  }

  res.writeHead(200, {
    'Accept-Ranges': 'bytes',
    'Content-Length': totalSize,
    'Content-Type': contentType,
    'Cache-Control': 'no-store',
  });
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  fs.createReadStream(realAbs).pipe(res);
}
