import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import https from 'node:https';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { REPO_ROOT } from './config.mjs';
import {
  assertInsideRoot,
  isPlainObject,
  readJsonSafe,
  slugify,
  withFileLock,
  writeFileAtomic,
  writeJsonAtomic,
} from './lib/storage.mjs';
import { moveToTrash } from './lib/trash.mjs';
import { RECORDINGS_DIR_NAME, resolveFfmpegPath } from './recordings.mjs';
import { readRefContent } from './versioning.mjs';

const execFileAsync = promisify(execFile);
const LONG_TTS_TIMEOUT_MS = 90 * 60 * 1000; // 90 min para roteiros longos (10–15+ min de áudio)

export const NARRATIONS_DIR_NAME = 'narracoes';
const STUDIO_DATA_DIR_NAME = '.studio-data';
const REGISTRY_FILE = 'narracoes.json';
const PRESETS_FILE = 'tts-presets.json';
const CATEGORIES_FILE = 'audio-categories.json';
const OVERRIDES_FILE = 'audio-overrides.json';

const AUDIO_EXT_RE = /\.(wav|mp3|ogg|m4a|flac|opus|webm)$/i;
const SAFE_ID_RE = /^[a-z0-9][a-z0-9_-]{1,79}$/;

const PIPER_FABER_BASE_URL =
  'https://huggingface.co/rhasspy/piper-voices/resolve/main/pt/pt_BR/faber/medium';

export const DEFAULT_AUDIO_CATEGORIES = [
  { id: 'narracao-roteiro', label: 'Narração de Roteiro', color: '#8b5cf6', builtin: true },
  { id: 'teste-voz', label: 'Teste de Voz', color: '#3b82f6', builtin: true },
  { id: 'vinheta-cta', label: 'Vinheta / CTA', color: '#ec4899', builtin: true },
  { id: 'multivozes', label: 'Diálogo / Multivozes', color: '#14b8a6', builtin: true },
  { id: 'clonagem-voz', label: 'Referência / Clonagem', color: '#f59e0b', builtin: true },
  { id: 'gravacao-bruta', label: 'Gravação Multi-Track', color: '#22c55e', builtin: true },
  { id: 'geral', label: 'Geral / Outros', color: '#64748b', builtin: true },
];

export const BUILTIN_VOICE_PRESETS = [
  {
    id: 'mrj-nivel2-rvc',
    name: 'Voz do MrJ — Nível 2 (Pocket + RVC)',
    description: 'Combo aprovado (ab_06): Pocket TTS ref trimada 4 passos + conversão de timbre RVC v2 (mrj_rvc.pth).',
    builtin: true,
    engine: 'pocket-tts',
    language: 'portuguese_24l',
    voiceFile: 'mrj_pt24l_ref01_trim.safetensors',
    temperature: 0.26,
    samplerDecodeSteps: 4,
    noiseClamp: 2.5,
    pauseMs: 220,
    loudnorm: false,
    effects: {
      pitchShift: 1.0,
      reverb: 0,
      bassDb: 0,
      trebleDb: 0,
    },
    rvc: {
      enabled: true,
      modelName: 'mrj_rvc.pth',
      f0UpKey: 0,
      f0Method: 'rmvpe',
      indexRate: 0.75,
      protect: 0.33,
      rmsMixRate: 0.25,
    },
  },
  {
    id: 'mrj-pocket',
    name: 'Voz do MrJ (Pocket TTS PT-BR)',
    description: 'Clonagem local da voz do Mr. J (ref01 trimada, 4 passos, noise clamp 2.5 — perfil ab_05 validado).',
    builtin: true,
    engine: 'pocket-tts',
    language: 'portuguese_24l',
    voiceFile: 'mrj_pt24l_ref01_trim.safetensors',
    temperature: 0.26,
    samplerDecodeSteps: 4,
    noiseClamp: 2.5,
    pauseMs: 220,
    loudnorm: false,
    effects: {
      pitchShift: 1.0,
      reverb: 0,
      bassDb: 0,
      trebleDb: 0,
    },
    rvc: {
      enabled: false,
      modelName: '',
      f0UpKey: 0,
      f0Method: 'rmvpe',
      indexRate: 0.75,
      protect: 0.33,
      rmsMixRate: 0.25,
    },
  },
  {
    id: 'mrj-pocket-hq',
    name: 'Voz do MrJ (Ref Trimada • 6 Passos Máx)',
    description: 'Pocket TTS portuguese_24l com 6 passos de decodificação, noise clamp 2.5 e ref01 sem silêncio inicial.',
    builtin: true,
    engine: 'pocket-tts',
    language: 'portuguese_24l',
    voiceFile: 'mrj_pt24l_ref01_trim.safetensors',
    temperature: 0.22,
    samplerDecodeSteps: 6,
    noiseClamp: 2.5,
    pauseMs: 220,
    loudnorm: false,
    effects: {
      pitchShift: 1.0,
      reverb: 0,
      bassDb: 0,
      trebleDb: 0,
    },
    rvc: {
      enabled: false,
      modelName: '',
      f0UpKey: 0,
      f0Method: 'rmvpe',
      indexRate: 0.75,
      protect: 0.33,
      rmsMixRate: 0.25,
    },
  },
  {
    id: 'crom-j',
    name: 'j — Voz da Crom (Piper Faber)',
    description: 'Perfil personalizado "j" da Crom: Piper pt_BR-faber-medium 1.50x + pitch 0.90x.',
    builtin: true,
    engine: 'piper',
    modelName: 'pt_BR-faber-medium.onnx',
    lengthScale: 1.5,
    noiseScale: 0.67,
    noiseW: 0.8,
    sentenceSilence: 0.2,
    loudnorm: false,
    effects: {
      pitchShift: 0.9,
      reverb: 0,
      bassDb: 0,
      trebleDb: 0,
    },
  },
  {
    id: 'crom-faber-normal',
    name: 'Crom Faber Padrão (1.00x)',
    description: 'Piper pt_BR-faber-medium em velocidade natural 1.00x sem pitch shift.',
    builtin: true,
    engine: 'piper',
    modelName: 'pt_BR-faber-medium.onnx',
    lengthScale: 1.0,
    noiseScale: 0.667,
    noiseW: 0.8,
    sentenceSilence: 0.2,
    loudnorm: false,
    effects: {
      pitchShift: 1.0,
      reverb: 0,
      bassDb: 0,
      trebleDb: 0,
    },
  },
];

function httpError(message, statusCode) {
  return Object.assign(new Error(message), { statusCode });
}

function clampNumber(val, min, max, fallback) {
  const n = Number(val);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function isExecutableFile(candidate) {
  if (!candidate || typeof candidate !== 'string') return false;
  try {
    const st = fs.statSync(candidate);
    if (!st.isFile()) return false;
    fs.accessSync(candidate, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function isRegularFile(candidate) {
  if (!candidate || typeof candidate !== 'string') return false;
  try {
    return fs.statSync(candidate).isFile();
  } catch {
    return false;
  }
}

function normalizeEffects(raw = {}) {
  const obj = isPlainObject(raw) ? raw : {};
  return {
    pitchShift: clampNumber(obj.pitchShift, 0.5, 2.0, 1.0),
    reverb: clampNumber(obj.reverb, 0, 100, 0),
    bassDb: clampNumber(obj.bassDb, -12, 12, 0),
    trebleDb: clampNumber(obj.trebleDb, -12, 12, 0),
  };
}

function normalizeRvcOptions(raw = {}) {
  const obj = isPlainObject(raw) ? raw : {};
  const method = String(obj.f0Method || 'rmvpe').trim().toLowerCase();
  const validMethods = new Set(['rmvpe', 'crepe', 'pm', 'harvest']);
  return {
    enabled: Boolean(obj.enabled),
    modelName: obj.modelName ? path.basename(String(obj.modelName).trim()) : '',
    f0UpKey: Math.round(clampNumber(obj.f0UpKey, -12, 12, 0)),
    f0Method: validMethods.has(method) ? method : 'rmvpe',
    indexRate: clampNumber(obj.indexRate, 0, 1, 0.75),
    protect: clampNumber(obj.protect, 0, 0.5, 0.33),
    rmsMixRate: clampNumber(obj.rmsMixRate, 0, 1, 0.25),
  };
}

export function normalizePresetShape(raw, existing = null) {
  const base = existing || {};
  const engine =
    String(raw.engine || base.engine || 'piper').trim().toLowerCase() === 'pocket-tts'
      ? 'pocket-tts'
      : 'piper';
  const rawId = slugify(String(raw.id || base.id || raw.name || 'preset')).slice(0, 48) || 'preset';
  const name = String(raw.name || base.name || rawId).trim().slice(0, 80);

  if (engine === 'pocket-tts') {
    const rawClamp = raw.noiseClamp !== undefined ? raw.noiseClamp : base.noiseClamp;
    const parsedClamp =
      rawClamp === null || rawClamp === '' || Number(rawClamp) <= 0
        ? null
        : clampNumber(rawClamp, 0.5, 6.0, 2.5);
    return {
      id: rawId,
      name,
      description: String(raw.description ?? base.description ?? '').trim().slice(0, 240),
      builtin: Boolean(base.builtin),
      engine: 'pocket-tts',
      language: String(raw.language || base.language || 'portuguese_24l').trim(),
      voiceFile: path.basename(String(raw.voiceFile || base.voiceFile || 'mrj_pt24l_ref01.safetensors').trim()),
      temperature: clampNumber(raw.temperature ?? base.temperature, 0.05, 1.5, 0.3),
      samplerDecodeSteps: Math.round(clampNumber(raw.samplerDecodeSteps ?? base.samplerDecodeSteps, 1, 16, 4)),
      noiseClamp: parsedClamp,
      pauseMs: Math.round(clampNumber(raw.pauseMs ?? base.pauseMs, 0, 2000, 220)),
      loudnorm: raw.loudnorm !== undefined ? Boolean(raw.loudnorm) : Boolean(base.loudnorm ?? true),
      effects: normalizeEffects(raw.effects || base.effects || {}),
      rvc: normalizeRvcOptions({ ...(base.rvc || {}), ...(isPlainObject(raw.rvc) ? raw.rvc : {}) }),
    };
  }

  return {
    id: rawId,
    name,
    description: String(raw.description ?? base.description ?? '').trim().slice(0, 240),
    builtin: Boolean(base.builtin),
    engine: 'piper',
    modelName: path.basename(String(raw.modelName || base.modelName || 'pt_BR-faber-medium.onnx').trim()),
    lengthScale: clampNumber(raw.lengthScale ?? base.lengthScale, 0.5, 2.5, 1.5),
    noiseScale: clampNumber(raw.noiseScale ?? base.noiseScale, 0.1, 1.5, 0.67),
    noiseW: clampNumber(raw.noiseW ?? base.noiseW, 0.1, 1.5, 0.8),
    sentenceSilence: clampNumber(raw.sentenceSilence ?? base.sentenceSilence, 0, 2.0, 0.2),
    loudnorm: raw.loudnorm !== undefined ? Boolean(raw.loudnorm) : Boolean(base.loudnorm ?? false),
    effects: normalizeEffects(raw.effects || base.effects || { pitchShift: 0.9 }),
    rvc: normalizeRvcOptions({ ...(base.rvc || {}), ...(isPlainObject(raw.rvc) ? raw.rvc : {}) }),
  };
}

export function getRvcModelsDefaultDir() {
  if (process.env.RVC_MODELS_DIR && process.env.RVC_MODELS_DIR.trim()) {
    return path.resolve(process.env.RVC_MODELS_DIR.trim());
  }
  return path.join(os.homedir(), '.local', 'share', 'crom-youtube-studio', 'rvc-models');
}

export function getPiperModelsDefaultDir() {
  if (process.env.PIPER_MODELS_DIR && process.env.PIPER_MODELS_DIR.trim()) {
    return path.resolve(process.env.PIPER_MODELS_DIR.trim());
  }
  return path.join(os.homedir(), '.local', 'share', 'crom-youtube-studio', 'piper-models');
}

/**
 * Discovers Pocket TTS, Piper ONNX binary/models, and FFmpeg using HOME + env vars.
 */
export function discoverTtsEnvironment(options = {}) {
  const home = os.homedir();
  const ffmpegPath = resolveFfmpegPath();

  // 1. Pocket TTS discovery
  const pocketCandidates = [
    process.env.POCKET_TTS_DIR,
    options.pocketTtsDir,
    path.join(home, 'Documentos', 'GitHub', 'pocket-tts-local'),
    path.join(home, 'Documents', 'GitHub', 'pocket-tts-local'),
    path.join(home, 'GitHub', 'pocket-tts-local'),
    path.join(home, 'pocket-tts-local'),
  ].filter(Boolean);

  let pocketDir = '';
  let pocketPython = '';
  let pocketVoices = [];
  for (const dir of pocketCandidates) {
    try {
      const py = path.join(dir, '.venv', 'bin', 'python');
      if (isExecutableFile(py)) {
        pocketDir = fs.realpathSync(dir);
        pocketPython = py;
        break;
      }
    } catch {
      // keep trying
    }
  }

  if (pocketDir) {
    const voicesDir = path.join(pocketDir, 'voices');
    if (fs.existsSync(voicesDir)) {
      try {
        pocketVoices = fs
          .readdirSync(voicesDir, { withFileTypes: true })
          .filter((e) => e.isFile() && /\.(safetensors|wav)$/i.test(e.name))
          .map((e) => e.name)
          .sort();
      } catch {
        pocketVoices = [];
      }
    }
  }

  // 2. Piper binary discovery
  const piperCandidates = [
    process.env.PIPER_BIN,
    options.piperBin,
    path.join(home, '.local', 'share', 'myvoice', 'piper', 'piper'),
    path.join(home, '.local', 'bin', 'piper_dist', 'piper', 'piper'),
    path.join(home, '.local', 'bin', 'piper'),
    '/usr/local/bin/piper',
    '/usr/bin/piper',
  ].filter(Boolean);

  for (const dir of String(process.env.PATH || '').split(path.delimiter).filter(Boolean)) {
    piperCandidates.push(path.join(dir, 'piper'));
  }

  let piperBin = '';
  let piperLibDir = '';
  let espeakDataDir = '';
  for (const cand of piperCandidates) {
    if (isExecutableFile(cand)) {
      try {
        piperBin = fs.realpathSync(cand);
      } catch {
        piperBin = cand;
      }
      const parent = path.dirname(piperBin);
      if (fs.existsSync(path.join(parent, 'espeak-ng-data'))) {
        espeakDataDir = path.join(parent, 'espeak-ng-data');
      }
      if (
        fs.existsSync(path.join(parent, 'libpiper_phonemize.so')) ||
        fs.existsSync(path.join(parent, 'libpiper_phonemize.so.1'))
      ) {
        piperLibDir = parent;
      }
      break;
    }
  }

  // 3. Piper ONNX models discovery
  const modelDirs = [
    process.env.PIPER_MODELS_DIR,
    options.piperModelsDir,
    path.join(home, '.local', 'share', 'myvoice'),
    getPiperModelsDefaultDir(),
    path.join(home, '.local', 'share', 'piper-voices'),
    path.join(home, '.local', 'share', 'piper'),
    path.join(home, 'Documentos', 'GitHub', 'cromyvoice', 'models'),
  ].filter(Boolean);

  const uniqueModelDirs = [...new Set(modelDirs.map((d) => path.resolve(d)))];
  const modelsMap = new Map();
  for (const dir of uniqueModelDirs) {
    if (!fs.existsSync(dir)) continue;
    try {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (!entry.isFile() || !entry.name.endsWith('.onnx')) continue;
        const onnxPath = path.join(dir, entry.name);
        const jsonPath = `${onnxPath}.json`;
        if (!modelsMap.has(entry.name)) {
          modelsMap.set(entry.name, {
            name: entry.name,
            onnxPath,
            configPath: isRegularFile(jsonPath) ? jsonPath : '',
            sizeBytes: fs.statSync(onnxPath).size,
            dir,
          });
        }
      }
    } catch {
      // ignore unreadable dirs
    }
  }

  // 4. Optional pronunciation dictionary
  const dictCandidates = [
    options.kdenliveRoot ? path.join(options.kdenliveRoot, 'ferramentas', 'dicionario_pronuncia.json') : '',
    path.join(home, '.local', 'share', 'crom-youtube-studio', 'dicionario_pronuncia.json'),
  ].filter(Boolean);
  let pronunciationDictPath = '';
  for (const cand of dictCandidates) {
    if (isRegularFile(cand)) {
      pronunciationDictPath = cand;
      break;
    }
  }

  const piperModels = Array.from(modelsMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  const faberModel = modelsMap.get('pt_BR-faber-medium.onnx') || null;
  const pocketBatchScript = path.join(REPO_ROOT, 'scripts', 'tts-pocket-batch.py');
  const rvcConvertScript = path.join(REPO_ROOT, 'scripts', 'tts-rvc-convert.py');

  // 5. RVC v2 local CPU runner & models discovery (Nivel 2)
  const rvcCandidates = [
    process.env.RVC_LOCAL_DIR,
    options.rvcDir,
    path.join(home, 'Documentos', 'GitHub', 'rvc-local'),
    path.join(home, 'Documents', 'GitHub', 'rvc-local'),
    path.join(home, 'GitHub', 'rvc-local'),
    path.join(home, 'rvc-local'),
  ].filter(Boolean);

  let rvcDir = '';
  let rvcPython = '';
  for (const dir of rvcCandidates) {
    try {
      const py = path.join(dir, '.venv', 'bin', 'python');
      if (isExecutableFile(py)) {
        rvcDir = fs.realpathSync(dir);
        rvcPython = py;
        break;
      }
    } catch {
      // keep trying
    }
  }

  const rvcModelDirs = [
    process.env.RVC_MODELS_DIR,
    options.rvcModelsDir,
    getRvcModelsDefaultDir(),
    rvcDir ? path.join(rvcDir, 'models') : '',
  ].filter(Boolean);

  const uniqueRvcDirs = [...new Set(rvcModelDirs.map((d) => path.resolve(d)))];
  const rvcModelsMap = new Map();
  for (const dir of uniqueRvcDirs) {
    if (!fs.existsSync(dir)) continue;
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      const indexFiles = entries.filter((e) => e.isFile() && e.name.endsWith('.index')).map((e) => e.name);
      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith('.pth')) continue;
        if (!rvcModelsMap.has(entry.name)) {
          const pthPath = path.join(dir, entry.name);
          const stem = entry.name.replace(/\.pth$/i, '');
          const exactIdx = `${stem}.index`;
          const matchedIndex =
            indexFiles.find((n) => n === exactIdx) ||
            indexFiles.find((n) => n.includes(stem)) ||
            (indexFiles.length === 1 ? indexFiles[0] : '');
          rvcModelsMap.set(entry.name, {
            name: entry.name,
            pthPath,
            indexPath: matchedIndex ? path.join(dir, matchedIndex) : '',
            sizeBytes: fs.statSync(pthPath).size,
            dir,
          });
        }
      }
    } catch {
      // ignore unreadable dirs
    }
  }
  const rvcModels = Array.from(rvcModelsMap.values()).sort((a, b) => a.name.localeCompare(b.name));

  return {
    ffmpeg: {
      available: Boolean(ffmpegPath),
      path: ffmpegPath || '',
    },
    pocketTts: {
      available: Boolean(pocketDir && pocketPython && pocketVoices.length > 0 && isRegularFile(pocketBatchScript)),
      dir: pocketDir,
      pythonPath: pocketPython,
      batchScript: pocketBatchScript,
      voices: pocketVoices,
      hasDefaultVoice: pocketVoices.includes('mrj_pt24l_ref01.safetensors'),
      language: 'portuguese_24l',
    },
    piper: {
      available: Boolean(piperBin && piperModels.length > 0),
      binaryAvailable: Boolean(piperBin),
      binaryPath: piperBin,
      libDir: piperLibDir,
      espeakDataDir,
      defaultModelsDir: getPiperModelsDefaultDir(),
      models: piperModels,
      hasFaberModel: Boolean(faberModel),
      faberModelPath: faberModel ? faberModel.onnxPath : '',
    },
    rvc: {
      available: Boolean(rvcPython && isRegularFile(rvcConvertScript) && rvcModels.length > 0),
      runnerAvailable: Boolean(rvcPython && isRegularFile(rvcConvertScript)),
      dir: rvcDir,
      pythonPath: rvcPython,
      convertScript: rvcConvertScript,
      defaultModelsDir: getRvcModelsDefaultDir(),
      models: rvcModels,
    },
    pronunciationDictPath,
  };
}

function downloadFileFollowRedirects(url, destPath, redirectsLeft = 6) {
  return new Promise((resolve, reject) => {
    if (redirectsLeft < 0) {
      reject(new Error(`Muitos redirecionamentos ao baixar ${url}`));
      return;
    }
    const req = https.get(
      url,
      {
        headers: {
          'User-Agent': 'crom-youtube-studio/1.0',
          Accept: '*/*',
        },
        timeout: 30000,
      },
      (res) => {
        const status = Number(res.statusCode || 0);
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume();
          const nextUrl = new URL(res.headers.location, url).href;
          downloadFileFollowRedirects(nextUrl, destPath, redirectsLeft - 1).then(resolve, reject);
          return;
        }
        if (status !== 200) {
          res.resume();
          reject(new Error(`Falha no download (HTTP ${status}) de ${url}`));
          return;
        }
        fs.mkdirSync(path.dirname(destPath), { recursive: true });
        const tmpPath = `${destPath}.tmp.${process.pid}`;
        const out = fs.createWriteStream(tmpPath);
        res.pipe(out);
        out.on('finish', () => {
          out.close(() => {
            fs.renameSync(tmpPath, destPath);
            resolve(destPath);
          });
        });
        out.on('error', (err) => {
          fs.rmSync(tmpPath, { force: true });
          reject(err);
        });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy(new Error(`Timeout ao baixar ${url}`));
    });
  });
}

/**
 * Downloads pt_BR-faber-medium.onnx (+ .json) into user local share dir if missing.
 */
export async function downloadPiperModel(modelName = 'pt_BR-faber-medium.onnx', targetDir = null) {
  const safeName = path.basename(String(modelName || 'pt_BR-faber-medium.onnx').trim());
  if (safeName !== 'pt_BR-faber-medium.onnx') {
    throw httpError('Download automático suportado para o modelo pt_BR-faber-medium.onnx.', 400);
  }
  const dir = targetDir ? path.resolve(targetDir) : getPiperModelsDefaultDir();
  fs.mkdirSync(dir, { recursive: true });
  const onnxDest = path.join(dir, 'pt_BR-faber-medium.onnx');
  const jsonDest = path.join(dir, 'pt_BR-faber-medium.onnx.json');

  if (!isRegularFile(onnxDest) || fs.statSync(onnxDest).size < 10_000_000) {
    await downloadFileFollowRedirects(`${PIPER_FABER_BASE_URL}/pt_BR-faber-medium.onnx`, onnxDest);
  }
  if (!isRegularFile(jsonDest) || fs.statSync(jsonDest).size < 100) {
    await downloadFileFollowRedirects(`${PIPER_FABER_BASE_URL}/pt_BR-faber-medium.onnx.json`, jsonDest);
  }
  return {
    ok: true,
    modelName: 'pt_BR-faber-medium.onnx',
    onnxPath: onnxDest,
    configPath: jsonDest,
    sizeBytes: fs.statSync(onnxDest).size,
  };
}

function getWorkspaceTtsContext(wsPath) {
  if (!wsPath || typeof wsPath !== 'string' || !fs.existsSync(wsPath)) {
    throw httpError('Workspace não encontrado', 404);
  }
  const wsReal = fs.realpathSync(wsPath);
  const studioDataDir = path.join(wsReal, STUDIO_DATA_DIR_NAME);
  const quarantineDir = path.join(studioDataDir, 'quarantine');
  const narrationsDir = path.join(wsReal, NARRATIONS_DIR_NAME);
  assertInsideRoot(wsReal, studioDataDir);
  assertInsideRoot(wsReal, narrationsDir);
  return {
    wsReal,
    studioDataDir,
    quarantineDir,
    narrationsDir,
    registryPath: path.join(studioDataDir, REGISTRY_FILE),
    presetsPath: path.join(studioDataDir, PRESETS_FILE),
    categoriesPath: path.join(studioDataDir, CATEGORIES_FILE),
    overridesPath: path.join(studioDataDir, OVERRIDES_FILE),
  };
}

function loadRegistry(ctx) {
  const data = readJsonSafe(ctx.registryPath, {
    defaultData: { schemaVersion: 1, items: [] },
    schemaVersion: 1,
    quarantineDir: ctx.quarantineDir,
  });
  return {
    schemaVersion: 1,
    items: Array.isArray(data?.items) ? data.items : [],
  };
}

function saveRegistry(ctx, items) {
  fs.mkdirSync(ctx.studioDataDir, { recursive: true });
  writeJsonAtomic(
    ctx.registryPath,
    { schemaVersion: 1, updatedAt: new Date().toISOString(), items },
    { schemaVersion: 1, backup: true }
  );
}

export function listVoicePresets(wsPath) {
  const ctx = getWorkspaceTtsContext(wsPath);
  const stored = readJsonSafe(ctx.presetsPath, {
    defaultData: { schemaVersion: 1, presets: [] },
    schemaVersion: 1,
    quarantineDir: ctx.quarantineDir,
  });
  const customList = Array.isArray(stored?.presets) ? stored.presets : [];
  const merged = new Map();
  for (const p of BUILTIN_VOICE_PRESETS) {
    merged.set(p.id, normalizePresetShape(p, p));
  }
  for (const p of customList) {
    if (!p || !p.id) continue;
    const existing = merged.get(p.id) || null;
    merged.set(p.id, normalizePresetShape(p, existing));
  }
  return Array.from(merged.values());
}

export async function saveVoicePreset(wsPath, payload) {
  const ctx = getWorkspaceTtsContext(wsPath);
  if (!payload || typeof payload !== 'object') {
    throw httpError('Payload inválido para preset de voz', 400);
  }
  const rawName = String(payload.name || '').trim();
  if (!rawName) {
    throw httpError('Nome do perfil de voz é obrigatório', 400);
  }
  fs.mkdirSync(ctx.studioDataDir, { recursive: true });
  return withFileLock(ctx.presetsPath, async () => {
    const stored = readJsonSafe(ctx.presetsPath, {
      defaultData: { schemaVersion: 1, presets: [] },
      schemaVersion: 1,
      quarantineDir: ctx.quarantineDir,
    });
    const customList = Array.isArray(stored?.presets) ? [...stored.presets] : [];
    const targetId = slugify(String(payload.id || rawName)).slice(0, 48) || `perfil-${Date.now().toString(36)}`;
    const builtinBase = BUILTIN_VOICE_PRESETS.find((b) => b.id === targetId) || null;
    const idx = customList.findIndex((p) => p && p.id === targetId);
    const normalized = normalizePresetShape(
      { ...payload, id: targetId, name: rawName },
      idx >= 0 ? { ...customList[idx], builtin: Boolean(builtinBase) } : builtinBase
    );
    if (idx >= 0) {
      customList[idx] = normalized;
    } else {
      customList.push(normalized);
    }
    writeJsonAtomic(
      ctx.presetsPath,
      { schemaVersion: 1, updatedAt: new Date().toISOString(), presets: customList },
      { schemaVersion: 1, backup: true }
    );
    return {
      ok: true,
      preset: normalized,
      presets: listVoicePresets(ctx.wsReal),
    };
  });
}

export async function deleteVoicePreset(wsPath, presetId) {
  const ctx = getWorkspaceTtsContext(wsPath);
  const cleanId = String(presetId || '').trim();
  if (!cleanId) {
    throw httpError('ID do perfil de voz ausente', 400);
  }
  if (BUILTIN_VOICE_PRESETS.some((b) => b.id === cleanId) && !ctx.presetsPath) {
    throw httpError('Perfis integrados não podem ser excluídos.', 400);
  }
  return withFileLock(ctx.presetsPath, async () => {
    const stored = readJsonSafe(ctx.presetsPath, {
      defaultData: { schemaVersion: 1, presets: [] },
      schemaVersion: 1,
      quarantineDir: ctx.quarantineDir,
    });
    const customList = Array.isArray(stored?.presets) ? stored.presets : [];
    const idx = customList.findIndex((p) => p && p.id === cleanId);
    const isBuiltin = BUILTIN_VOICE_PRESETS.some((b) => b.id === cleanId);
    if (idx === -1) {
      if (isBuiltin) {
        throw httpError(`O perfil integrado "${cleanId}" não pode ser excluído (apenas redefinido/customizado).`, 400);
      }
      throw httpError(`Perfil "${cleanId}" não encontrado`, 404);
    }
    customList.splice(idx, 1);
    writeJsonAtomic(
      ctx.presetsPath,
      { schemaVersion: 1, updatedAt: new Date().toISOString(), presets: customList },
      { schemaVersion: 1, backup: true }
    );
    return {
      ok: true,
      deletedId: cleanId,
      presets: listVoicePresets(ctx.wsReal),
    };
  });
}

export function listAudioCategories(wsPath) {
  const ctx = getWorkspaceTtsContext(wsPath);
  const stored = readJsonSafe(ctx.categoriesPath, {
    defaultData: { schemaVersion: 1, categories: [] },
    schemaVersion: 1,
    quarantineDir: ctx.quarantineDir,
  });
  const custom = Array.isArray(stored?.categories) ? stored.categories : [];
  const map = new Map();
  for (const c of DEFAULT_AUDIO_CATEGORIES) {
    map.set(c.id, { ...c });
  }
  for (const c of custom) {
    if (!c || !c.id) continue;
    map.set(c.id, {
      id: String(c.id),
      label: String(c.label || c.id).trim(),
      color: String(c.color || '#64748b').trim(),
      builtin: map.has(c.id) ? Boolean(map.get(c.id).builtin) : false,
    });
  }
  return Array.from(map.values());
}

export async function createAudioCategory(wsPath, { id, label, color = '#6366f1' }) {
  const ctx = getWorkspaceTtsContext(wsPath);
  const cleanLabel = String(label || id || '').trim().slice(0, 48);
  if (!cleanLabel) {
    throw httpError('Nome da categoria é obrigatório', 400);
  }
  const cleanId = slugify(String(id || cleanLabel)).slice(0, 40) || `cat-${Date.now().toString(36)}`;
  fs.mkdirSync(ctx.studioDataDir, { recursive: true });
  return withFileLock(ctx.categoriesPath, async () => {
    const stored = readJsonSafe(ctx.categoriesPath, {
      defaultData: { schemaVersion: 1, categories: [] },
      schemaVersion: 1,
      quarantineDir: ctx.quarantineDir,
    });
    const list = Array.isArray(stored?.categories) ? [...stored.categories] : [];
    const idx = list.findIndex((c) => c && c.id === cleanId);
    const entry = {
      id: cleanId,
      label: cleanLabel,
      color: /^#[0-9a-fA-F]{3,8}$/.test(String(color || '').trim()) ? String(color).trim() : '#6366f1',
      builtin: false,
    };
    if (idx >= 0) list[idx] = entry;
    else list.push(entry);
    writeJsonAtomic(
      ctx.categoriesPath,
      { schemaVersion: 1, updatedAt: new Date().toISOString(), categories: list },
      { schemaVersion: 1, backup: true }
    );
    return { ok: true, category: entry, categories: listAudioCategories(ctx.wsReal) };
  });
}

function loadOverrides(ctx) {
  const stored = readJsonSafe(ctx.overridesPath, {
    defaultData: { schemaVersion: 1, items: {} },
    schemaVersion: 1,
    quarantineDir: ctx.quarantineDir,
  });
  return isPlainObject(stored?.items) ? stored.items : {};
}

function loadPronunciationDict(dictPath) {
  if (!dictPath || !isRegularFile(dictPath)) return {};
  try {
    const parsed = JSON.parse(fs.readFileSync(dictPath, 'utf8'));
    return isPlainObject(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function applyPronunciationDictionary(text, dict) {
  if (!text || !dict || !Object.keys(dict).length) return text;
  let out = String(text);
  for (const [term, replacement] of Object.entries(dict)) {
    if (!term || typeof replacement !== 'string') continue;
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])`, 'giu');
    out = out.replace(re, replacement);
  }
  return out;
}

/**
 * Strips YAML frontmatter, stage cues ([GANCHO], [TELA], [B-ROLL], [CORTE]),
 * timestamps, code blocks, and Markdown formatting while keeping spoken prose natural.
 */
export function prepareNarrationText(rawMarkdown, options = {}) {
  const {
    preserveVoiceTags = false,
    pronunciationDict = null,
  } = options;

  let text = String(rawMarkdown || '').replace(/\r\n/g, '\n');

  // Remove YAML frontmatter
  if (text.startsWith('---\n')) {
    const endIdx = text.indexOf('\n---\n', 4);
    if (endIdx !== -1) {
      text = text.slice(endIdx + 5);
    } else if (text.endsWith('\n---')) {
      text = '';
    }
  }

  // Remove fenced code blocks (usually screen content, not spoken narration)
  text = text.replace(/```[\s\S]*?```/g, ' ');
  text = text.replace(/`([^`]+)`/g, '$1');

  // Preserve voice switches temporarily when multivoice is enabled (token avoids Markdown syntax chars)
  const voicePlaceholders = [];
  if (preserveVoiceTags) {
    text = text.replace(/\[(mrj|crom|j|voz:[a-z0-9_-]+)\]/gi, (match) => {
      const token = `@@VOICETAG${voicePlaceholders.length}@@`;
      voicePlaceholders.push(match);
      return `\n${token}\n`;
    });
  }

  // Remove HTML tags and images, keep markdown link text
  text = text.replace(/!\[[^\]]*\]\([^)]*\)/g, ' ');
  text = text.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
  text = text.replace(/<[^>]+>/g, ' ');

  // Remove stage cues & standalone square bracket directions
  text = text.replace(/\[(?:GANCHO|TELA|B-ROLL|CORTE|PAUSA|SILENCIO|SILÊNCIO|AUDIO|ÁUDIO|SFX|MUSICA|MÚSICA|INTRO|OUTRO|CTA)[^\]]*\]/gi, ' ');
  text = text.replace(/\[\s*(?:x| )\s*\]/gi, ' ');

  // Remove timestamps like 00:00, [01:25], (00:35 - 01:10)
  text = text.replace(/[\[(]?\b\d{1,2}:\d{2}(?::\d{2})?(?:\s*[-–—]\s*\d{1,2}:\d{2}(?::\d{2})?)?[\])]?/g, ' ');

  // Remove markdown heading markers, blockquotes, lists, emphasis, horizontal rules
  text = text
    .split('\n')
    .map((line) => {
      let l = line.trim();
      if (!l) return '';
      if (/^[-*_]{3,}$/.test(l)) return '';
      l = l.replace(/^#{1,6}\s+/, '');
      l = l.replace(/^>\s*/, '');
      l = l.replace(/^[-*+]\s+/, '');
      l = l.replace(/^\d+[.)]\s+/, '');
      l = l.replace(/\*\*([^*]+)\*\*/g, '$1');
      l = l.replace(/__([^_]+)__/g, '$1');
      l = l.replace(/\*([^*]+)\*/g, '$1');
      l = l.replace(/_([^_]+)_/g, '$1');
      l = l.replace(/~~([^~]+)~~/g, '$1');
      // Strip remaining non-voice square-bracket metadata at line start
      l = l.replace(/^\[[^\]]{2,40}\]\s*/g, '');
      return l.replace(/\s+/g, ' ').trim();
    })
    .filter(Boolean)
    .join('\n');

  if (preserveVoiceTags) {
    for (let i = 0; i < voicePlaceholders.length; i += 1) {
      text = text.replace(`@@VOICETAG${i}@@`, voicePlaceholders[i]);
    }
  }

  if (pronunciationDict) {
    text = applyPronunciationDictionary(text, pronunciationDict);
  }

  return text.trim();
}

export function splitTextIntoChunks(text, maxChars = 280) {
  const clean = String(text || '').replace(/\r\n/g, '\n').trim();
  if (!clean) return [];
  const limit = Math.max(80, Math.min(800, Number(maxChars) || 280));
  const chunks = [];

  for (const para of clean.split(/\n+/)) {
    const trimmed = para.replace(/\s+/g, ' ').trim();
    if (!trimmed) continue;
    if (trimmed.length <= limit) {
      chunks.push(trimmed);
      continue;
    }

    const sentences = trimmed.split(/(?<=[.!?…;])\s+/);
    let current = '';
    for (const sent of sentences) {
      if (!sent) continue;
      if (sent.length > limit) {
        if (current) {
          chunks.push(current.trim());
          current = '';
        }
        // Hard-wrap very long sentence by comma or spaces
        const words = sent.split(/\s+/);
        let sub = '';
        for (const w of words) {
          if ((`${sub} ${w}`).trim().length > limit && sub) {
            chunks.push(sub.trim());
            sub = w;
          } else {
            sub = sub ? `${sub} ${w}` : w;
          }
        }
        if (sub) chunks.push(sub.trim());
      } else if ((`${current} ${sent}`).trim().length > limit && current) {
        chunks.push(current.trim());
        current = sent;
      } else {
        current = current ? `${current} ${sent}` : sent;
      }
    }
    if (current) chunks.push(current.trim());
  }

  return chunks;
}

/**
 * Parses [mrj] / [crom] / [voz:<id>] blocks for multivoice narration mode.
 */
export function parseMultivoiceBlocks(rawText, defaultVoiceA = 'mrj-pocket', defaultVoiceB = 'crom-j') {
  const lines = String(rawText || '').replace(/\r\n/g, '\n').split('\n');
  const blocks = [];
  let currentVoice = defaultVoiceA;
  let buffer = [];

  const flush = () => {
    const joined = buffer.join('\n').trim();
    if (joined) {
      blocks.push({ voiceId: currentVoice, text: joined });
    }
    buffer = [];
  };

  for (const rawLine of lines) {
    let line = rawLine.trim();
    if (!line) {
      if (buffer.length) buffer.push('');
      continue;
    }
    const tagMatch = /^\[(?:(mrj)|(crom|j)|voz:([a-z0-9_-]+))\]\s*(.*)$/i.exec(line);
    const speakerMatch = /^(Mr\.?\s*J|Crom)\s*:\s*(.*)$/i.exec(line);
    if (tagMatch) {
      flush();
      if (tagMatch[1]) currentVoice = defaultVoiceA;
      else if (tagMatch[2]) currentVoice = defaultVoiceB;
      else if (tagMatch[3]) currentVoice = tagMatch[3].toLowerCase();
      if (tagMatch[4]) buffer.push(tagMatch[4]);
    } else if (speakerMatch) {
      flush();
      currentVoice = /^c/i.test(speakerMatch[1]) ? defaultVoiceB : defaultVoiceA;
      if (speakerMatch[2]) buffer.push(speakerMatch[2]);
    } else {
      buffer.push(line);
    }
  }
  flush();
  return blocks;
}

export function readWavInfo(filePath) {
  if (!isRegularFile(filePath)) {
    return { sizeBytes: 0, sampleRate: 0, channels: 0, durationSec: 0 };
  }
  const st = fs.statSync(filePath);
  try {
    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(Math.min(st.size, 4096));
    fs.readSync(fd, buf, 0, buf.length, 0);
    fs.closeSync(fd);
    if (buf.length >= 44 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WAVE') {
      let offset = 12;
      let sampleRate = 0;
      let channels = 0;
      let byteRate = 0;
      let dataSize = 0;
      while (offset + 8 <= buf.length) {
        const chunkId = buf.toString('ascii', offset, offset + 4);
        const chunkSize = buf.readUInt32LE(offset + 4);
        if (chunkId === 'fmt ' && offset + 24 <= buf.length) {
          channels = buf.readUInt16LE(offset + 10);
          sampleRate = buf.readUInt32LE(offset + 12);
          byteRate = buf.readUInt32LE(offset + 16);
        } else if (chunkId === 'data') {
          dataSize = chunkSize;
          break;
        }
        offset += 8 + chunkSize + (chunkSize % 2);
      }
      const durationSec = byteRate > 0 && dataSize > 0 ? Number((dataSize / byteRate).toFixed(2)) : 0;
      return { sizeBytes: st.size, sampleRate, channels, durationSec };
    }
  } catch {
    // ignore malformed wav header
  }
  return { sizeBytes: st.size, sampleRate: 0, channels: 0, durationSec: 0 };
}

function buildFfmpegFilterChain(preset, sampleRate = 22050) {
  const fx = normalizeEffects(preset.effects || {});
  const filters = [];

  if (Math.abs(fx.pitchShift - 1.0) > 0.005) {
    const sr = Number(sampleRate) > 0 ? Number(sampleRate) : 22050;
    const targetRate = Math.round(sr * fx.pitchShift);
    const invTempo = clampNumber(1 / fx.pitchShift, 0.5, 2.0, 1.0);
    filters.push(`asetrate=${targetRate},aresample=${sr},atempo=${invTempo.toFixed(4)}`);
  }

  if (Math.abs(fx.bassDb) >= 0.5) {
    filters.push(`equalizer=f=120:width_type=h:width=200:g=${fx.bassDb.toFixed(1)}`);
  }
  if (Math.abs(fx.trebleDb) >= 0.5) {
    filters.push(`equalizer=f=6500:width_type=h:width=3000:g=${fx.trebleDb.toFixed(1)}`);
  }
  if (fx.reverb >= 1) {
    const decay = clampNumber((fx.reverb / 100) * 0.55, 0.05, 0.75, 0.25);
    filters.push(`aecho=0.8:0.88:42:${decay.toFixed(2)}`);
  }
  if (preset.loudnorm) {
    filters.push('highpass=f=70,loudnorm=I=-14:TP=-1.0:LRA=11');
  }
  return filters;
}

async function applyFfmpegPostProcessing(inputWav, outputWav, preset, env) {
  const info = readWavInfo(inputWav);
  const filters = buildFfmpegFilterChain(preset, info.sampleRate || 22050);
  if (!filters.length && !preset.loudnorm) {
    if (inputWav !== outputWav) {
      fs.copyFileSync(inputWav, outputWav);
    }
    return;
  }
  if (!env.ffmpeg.available) {
    throw httpError('FFmpeg não encontrado para aplicar pitch/efeitos ou normalização -14 LUFS.', 503);
  }
  const args = ['-y', '-i', inputWav, '-af', filters.join(',')];
  if (preset.loudnorm) {
    args.push('-ar', '48000', '-ac', '1');
  }
  args.push('-c:a', 'pcm_s16le', outputWav);
  await execFileAsync(env.ffmpeg.path, args, { timeout: LONG_TTS_TIMEOUT_MS, maxBuffer: 20 * 1024 * 1024 });
}

async function synthesizePiperRaw(text, preset, rawOutWav, env) {
  if (!env.piper.binaryAvailable) {
    throw httpError('Binário Piper TTS não encontrado no sistema.', 503);
  }
  let modelObj = env.piper.models.find((m) => m.name === preset.modelName);
  if (!modelObj && preset.modelName === 'pt_BR-faber-medium.onnx') {
    await downloadPiperModel('pt_BR-faber-medium.onnx');
    const refreshed = discoverTtsEnvironment();
    modelObj = refreshed.piper.models.find((m) => m.name === 'pt_BR-faber-medium.onnx');
  }
  if (!modelObj) {
    throw httpError(`Modelo ONNX Piper "${preset.modelName}" não encontrado em ${env.piper.defaultModelsDir}.`, 404);
  }

  const piperEnv = { ...process.env };
  if (env.piper.libDir) {
    piperEnv.LD_LIBRARY_PATH = piperEnv.LD_LIBRARY_PATH
      ? `${env.piper.libDir}:${piperEnv.LD_LIBRARY_PATH}`
      : env.piper.libDir;
  }
  if (env.piper.espeakDataDir) {
    piperEnv.ESPEAK_DATA_PATH = env.piper.espeakDataDir;
  }

  const args = [
    '--model', modelObj.onnxPath,
    '--output_file', rawOutWav,
    '--length_scale', String(clampNumber(preset.lengthScale, 0.5, 2.5, 1.5)),
    '--noise_scale', String(clampNumber(preset.noiseScale, 0.1, 1.5, 0.67)),
    '--noise_w', String(clampNumber(preset.noiseW, 0.1, 1.5, 0.8)),
    '--sentence_silence', String(clampNumber(preset.sentenceSilence, 0, 2.0, 0.2)),
  ];
  if (modelObj.configPath) {
    args.push('--config', modelObj.configPath);
  }
  if (env.piper.espeakDataDir) {
    args.push('--espeak_data', env.piper.espeakDataDir);
  }

  await new Promise((resolve, reject) => {
    const child = execFile(
      env.piper.binaryPath,
      args,
      { env: piperEnv, timeout: LONG_TTS_TIMEOUT_MS, maxBuffer: 20 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) {
          reject(httpError(`Erro ao executar Piper TTS: ${stderr || err.message}`, 500));
        } else {
          resolve({ stdout, stderr });
        }
      }
    );
    child.stdin.write(`${String(text || '').trim()}\n`, 'utf8');
    child.stdin.end();
  });
}

async function synthesizePocketRaw(chunks, preset, rawOutWav, env, tmpDir) {
  if (!env.pocketTts.available) {
    throw httpError(
      'Pocket TTS local (.venv/bin/python + voices/*.safetensors) não encontrado neste computador.',
      503
    );
  }
  const requestedVoice = path.basename(String(preset.voiceFile || 'mrj_pt24l_ref01.safetensors'));
  let voicePath = path.join(env.pocketTts.dir, 'voices', requestedVoice);
  if (!isRegularFile(voicePath)) {
    const fallback = env.pocketTts.voices[0];
    if (!fallback) {
      throw httpError(`Arquivo de voz "${requestedVoice}" não encontrado em ${env.pocketTts.dir}/voices.`, 404);
    }
    voicePath = path.join(env.pocketTts.dir, 'voices', fallback);
  }

  const jobFile = path.join(tmpDir, 'pocket-job.json');
  writeFileAtomic(
    jobFile,
    JSON.stringify({
      language: preset.language || 'portuguese_24l',
      voicePath,
      outputPath: rawOutWav,
      temperature: clampNumber(preset.temperature, 0.05, 1.5, 0.3),
      samplerDecodeSteps: Math.round(clampNumber(preset.samplerDecodeSteps, 1, 16, 4)),
      noiseClamp: preset.noiseClamp ?? null,
      pauseMs: Math.round(clampNumber(preset.pauseMs, 0, 2000, 220)),
      chunks,
    }),
    { backup: false }
  );

  try {
    await execFileAsync(env.pocketTts.pythonPath, [env.pocketTts.batchScript, jobFile], {
      cwd: env.pocketTts.dir,
      timeout: LONG_TTS_TIMEOUT_MS,
      maxBuffer: 20 * 1024 * 1024,
    });
  } catch (err) {
    throw httpError(`Erro ao executar Pocket TTS: ${err?.stderr || err.message}`, 500);
  }
}

async function applyRvcConversion(inputWav, outputWav, rvcCfg, env, tmpDir) {
  if (!env.rvc?.runnerAvailable) {
    throw httpError('Runner local RVC v2 (rvc-local/.venv) não encontrado neste computador.', 503);
  }
  const requestedName = path.basename(String(rvcCfg.modelName || '').trim());
  const modelObj =
    env.rvc.models.find((m) => m.name === requestedName) ||
    (requestedName ? null : env.rvc.models[0]);
  if (!modelObj) {
    throw httpError(
      `Modelo RVC "${requestedName || '(nenhum)'}" não encontrado em ${env.rvc.defaultModelsDir}.`,
      404
    );
  }

  const jobFile = path.join(tmpDir, `rvc-job-${crypto.randomBytes(4).toString('hex')}.json`);
  writeFileAtomic(
    jobFile,
    JSON.stringify({
      inputWav,
      outputWav,
      modelPath: modelObj.pthPath,
      indexPath: modelObj.indexPath || '',
      device: 'cpu',
      f0UpKey: Math.round(clampNumber(rvcCfg.f0UpKey, -12, 12, 0)),
      f0Method: rvcCfg.f0Method || 'rmvpe',
      indexRate: clampNumber(rvcCfg.indexRate, 0, 1, 0.75),
      protect: clampNumber(rvcCfg.protect, 0, 0.5, 0.33),
      rmsMixRate: clampNumber(rvcCfg.rmsMixRate, 0, 1, 0.25),
    }),
    { backup: false }
  );

  try {
    await execFileAsync(env.rvc.pythonPath, [env.rvc.convertScript, jobFile], {
      cwd: env.rvc.dir,
      timeout: LONG_TTS_TIMEOUT_MS,
      maxBuffer: 20 * 1024 * 1024,
    });
  } catch (err) {
    throw httpError(`Erro na conversão RVC v2: ${err?.stderr || err.message}`, 500);
  }
}

async function renderSegmentToWav(text, preset, destWav, env, tmpDir) {
  const rawWav = path.join(tmpDir, `raw-${crypto.randomBytes(4).toString('hex')}.wav`);
  if (preset.engine === 'pocket-tts') {
    const chunks = [];
    for (const sent of String(text || '').split(/(?<=[.!?…])\s+/)) {
      if (!sent.trim()) continue;
      chunks.push(...splitTextIntoChunks(sent, 160));
    }
    if (!chunks.length) {
      throw httpError('Texto vazio após limpeza para Pocket TTS.', 400);
    }
    await synthesizePocketRaw(chunks, preset, rawWav, env, tmpDir);
  } else {
    await synthesizePiperRaw(text, preset, rawWav, env);
  }

  let stageWav = rawWav;
  if (preset.rvc?.enabled && preset.rvc?.modelName) {
    const rvcWav = path.join(tmpDir, `rvc-${crypto.randomBytes(4).toString('hex')}.wav`);
    await applyRvcConversion(rawWav, rvcWav, preset.rvc, env, tmpDir);
    stageWav = rvcWav;
  }

  await applyFfmpegPostProcessing(stageWav, destWav, preset, env);
}

/**
 * Generates and persists TTS narration audio inside <workspace>/narracoes/YYYY-MM/,
 * registering complete metadata in .studio-data/narracoes.json.
 */
export async function generateNarration(wsPath, options = {}) {
  const ctx = getWorkspaceTtsContext(wsPath);
  const env = discoverTtsEnvironment({ kdenliveRoot: options.kdenliveRoot });
  const presets = listVoicePresets(ctx.wsReal);

  const mode = String(options.mode || 'single').trim().toLowerCase() === 'multivoice' ? 'multivoice' : 'single';
  const origin = String(options.origin || 'pagina-narracao').trim() || 'pagina-narracao';
  const category = slugify(String(options.category || (options.docPath ? 'narracao-roteiro' : mode === 'multivoice' ? 'multivozes' : 'teste-voz'))) || 'geral';

  // Resolve source text: either direct text or from script path + version
  let rawText = String(options.text || '');
  const docPath = String(options.docPath || '').replace(/\\/g, '/').replace(/^\/+/, '').trim();
  const docVersion = String(options.docVersion || 'principal').trim() || 'principal';
  let docTitle = String(options.docTitle || '').trim();

  if (docPath && !rawText.trim()) {
    const resolved = readRefContent(ctx.wsReal, docPath, docVersion);
    rawText = resolved.content || '';
  }
  if (!docTitle && docPath) {
    docTitle = path.basename(docPath, '.md');
  }

  const shouldClean = options.cleanMarkdown !== undefined ? Boolean(options.cleanMarkdown) : Boolean(docPath);
  const dict = options.usePronunciationDict !== false ? loadPronunciationDict(env.pronunciationDictPath) : null;

  const preparedText = shouldClean
    ? prepareNarrationText(rawText, {
        preserveVoiceTags: mode === 'multivoice',
        pronunciationDict: dict,
      })
    : dict
    ? applyPronunciationDictionary(rawText.trim(), dict)
    : rawText.trim();

  if (!preparedText) {
    throw httpError('Nenhum texto válido disponível para gerar narração.', 400);
  }

  // Merge selected preset + optional inline overrides from UI sliders
  const requestedVoiceId = String(options.voiceId || options.presetId || 'mrj-pocket').trim();
  const basePreset =
    presets.find((p) => p.id === requestedVoiceId) ||
    presets.find((p) => p.id === 'mrj-pocket') ||
    BUILTIN_VOICE_PRESETS[0];

  const effectivePreset = normalizePresetShape(
    {
      ...basePreset,
      ...(isPlainObject(options.overrides) ? options.overrides : {}),
      effects: {
        ...(basePreset.effects || {}),
        ...(isPlainObject(options.overrides?.effects) ? options.overrides.effects : {}),
      },
      rvc: {
        ...(basePreset.rvc || {}),
        ...(isPlainObject(options.overrides?.rvc) ? options.overrides.rvc : {}),
      },
      ...(options.loudnorm !== undefined ? { loudnorm: Boolean(options.loudnorm) } : {}),
    },
    basePreset
  );

  const now = new Date();
  const ym = now.toISOString().slice(0, 7);
  const monthDir = path.join(ctx.narrationsDir, ym);
  fs.mkdirSync(monthDir, { recursive: true });

  const id = `nar-${now.toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}-${crypto.randomBytes(3).toString('hex')}`;
  const baseSlug = slugify(options.title || docTitle || preparedText.slice(0, 42)).slice(0, 48) || 'narracao';
  const fileName = `${id}-${baseSlug}.wav`;
  const finalAbs = assertInsideRoot(ctx.narrationsDir, path.join(monthDir, fileName), { allowEqual: false });
  const relPath = path.relative(ctx.wsReal, finalAbs).replace(/\\/g, '/');

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crom-tts-'));
  const voicesUsed = new Set();

  try {
    if (mode === 'multivoice') {
      const voiceA = String(options.voiceId || 'mrj-pocket').trim() || 'mrj-pocket';
      const voiceB = String(options.secondaryVoiceId || 'crom-j').trim() || 'crom-j';
      const blocks = parseMultivoiceBlocks(preparedText, voiceA, voiceB);
      if (!blocks.length) {
        throw httpError('Nenhum bloco de fala encontrado no modo multivozes.', 400);
      }
      if (!env.ffmpeg.available) {
        throw httpError('FFmpeg é obrigatório para concatenar áudio no modo Multivozes.', 503);
      }
      const partPaths = [];
      for (let i = 0; i < blocks.length; i += 1) {
        const blk = blocks[i];
        const blkPreset =
          presets.find((p) => p.id === blk.voiceId) ||
          (blk.voiceId === effectivePreset.id ? effectivePreset : presets[0]);
        const normalizedBlkPreset =
          blkPreset.id === effectivePreset.id ? effectivePreset : normalizePresetShape(blkPreset, blkPreset);
        voicesUsed.add(normalizedBlkPreset.id);
        const partRaw = path.join(tmpDir, `part-${i}.wav`);
        const partNorm = path.join(tmpDir, `part-norm-${i}.wav`);
        await renderSegmentToWav(blk.text, normalizedBlkPreset, partRaw, env, tmpDir);
        // Normalize sample rate/channels before concat so Pocket (24kHz) and Piper (22kHz) mix cleanly
        await execFileAsync(
          env.ffmpeg.path,
          ['-y', '-i', partRaw, '-ar', '48000', '-ac', '1', '-c:a', 'pcm_s16le', partNorm],
          { timeout: 60_000 }
        );
        partPaths.push(partNorm);
      }
      const concatTxt = path.join(tmpDir, 'concat.txt');
      fs.writeFileSync(
        concatTxt,
        partPaths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join('\n'),
        'utf8'
      );
      await execFileAsync(
        env.ffmpeg.path,
        ['-y', '-f', 'concat', '-safe', '0', '-i', concatTxt, '-c:a', 'pcm_s16le', finalAbs],
        { timeout: 120_000 }
      );
    } else {
      voicesUsed.add(effectivePreset.id);
      await renderSegmentToWav(preparedText, effectivePreset, finalAbs, env, tmpDir);
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  const wavInfo = readWavInfo(finalAbs);
  const title =
    String(options.title || '').trim() ||
    (docPath ? `${docTitle} (${docVersion})` : preparedText.replace(/\s+/g, ' ').slice(0, 68));

  const record = {
    id,
    title,
    fileName,
    relPath,
    sourceKind: 'narration',
    origin: mode === 'multivoice' && origin === 'pagina-narracao' ? 'multivozes' : origin,
    mode,
    category,
    engine: mode === 'multivoice' ? 'multivoice' : effectivePreset.engine,
    voiceId: effectivePreset.id,
    voiceName: effectivePreset.name,
    voicesUsed: Array.from(voicesUsed),
    presetSnapshot: effectivePreset,
    docPath: docPath || '',
    docVersion: docPath ? docVersion : '',
    docTitle: docTitle || '',
    textPreview: preparedText.replace(/\s+/g, ' ').slice(0, 220),
    charCount: preparedText.length,
    wordCount: preparedText.split(/\s+/).filter(Boolean).length,
    durationSec: wavInfo.durationSec,
    sampleRate: wavInfo.sampleRate,
    sizeBytes: wavInfo.sizeBytes,
    createdAt: now.toISOString(),
  };

  await withFileLock(ctx.registryPath, async () => {
    const reg = loadRegistry(ctx);
    const items = [record, ...reg.items.filter((x) => x && x.id !== id)];
    saveRegistry(ctx, items);
  });

  return {
    ok: true,
    item: record,
    absPath: finalAbs,
  };
}

function walkWorkspaceRecordingsAudio(wsReal, overrides = {}) {
  const recRoot = path.join(wsReal, RECORDINGS_DIR_NAME);
  if (!fs.existsSync(recRoot)) return [];
  const results = [];

  const metaByDir = new Map();
  const walk = (dir) => {
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.isSymbolicLink() || e.name.startsWith('.')) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        const metaFile = path.join(full, 'meta.json');
        if (isRegularFile(metaFile)) {
          try {
            metaByDir.set(full, JSON.parse(fs.readFileSync(metaFile, 'utf8')));
          } catch {
            // ignore bad take meta
          }
        }
        walk(full);
      } else if (e.isFile() && AUDIO_EXT_RE.test(e.name)) {
        const relPath = path.relative(wsReal, full).replace(/\\/g, '/');
        const st = fs.statSync(full);
        const dirMeta = metaByDir.get(dir) || null;
        const isClone = relPath.startsWith(`${RECORDINGS_DIR_NAME}/clonagem-voz/`);
        const isTakeVoice = /voz|combinado|audio|track/i.test(e.name);
        if (!isClone && !dirMeta && !isTakeVoice) continue;

        const id = `ws-${crypto.createHash('sha1').update(relPath).digest('hex').slice(0, 12)}`;
        const ov = overrides[id] || {};
        const subFolder = isClone
          ? relPath.split('/').slice(2, -1).join('/') || 'raiz'
          : dirMeta?.sessionId || 'sessao';
        const wavInfo = e.name.toLowerCase().endsWith('.wav') ? readWavInfo(full) : { durationSec: 0, sampleRate: 0 };

        results.push({
          id,
          title: ov.title || (dirMeta ? `${dirMeta.title || dirMeta.sessionId} (${e.name})` : e.name),
          fileName: e.name,
          relPath,
          sourceKind: 'workspace-audio',
          origin: isClone ? 'clonagem-voz' : 'gravacao-multitrack',
          mode: 'arquivo',
          category: ov.category || (isClone ? 'clonagem-voz' : 'gravacao-bruta'),
          engine: isClone ? 'referencia-voz' : 'captura',
          voiceId: isClone ? subFolder : '',
          voiceName: isClone ? `Clonagem (${subFolder})` : 'Microfone / Gravação',
          voicesUsed: [],
          docPath: ov.docPath ?? (dirMeta?.scriptPath || ''),
          docVersion: '',
          docTitle: dirMeta?.title || '',
          textPreview: isClone ? `Pasta: ${subFolder}` : `Sessão ${dirMeta?.sessionId || ''}/${dirMeta?.takeId || ''}`,
          charCount: 0,
          wordCount: 0,
          durationSec: wavInfo.durationSec || 0,
          sampleRate: wavInfo.sampleRate || 0,
          sizeBytes: st.size,
          createdAt: st.mtime.toISOString(),
        });
      }
    }
  };
  walk(recRoot);
  return results;
}

/**
 * Lists all audio files across TTS narrations (narracoes/) and workspace recordings/voice-cloning (gravacoes/).
 */
export function listUnifiedAudios(wsPath, filters = {}) {
  const ctx = getWorkspaceTtsContext(wsPath);
  const reg = loadRegistry(ctx);
  const overrides = loadOverrides(ctx);

  const narrations = reg.items
    .filter((item) => {
      if (!item || !item.relPath) return false;
      const abs = path.join(ctx.wsReal, item.relPath);
      return isRegularFile(abs);
    })
    .map((item) => ({
      ...item,
      origin: item.origin || 'pagina-narracao',
      category: item.category || 'geral',
    }));

  const workspaceAudios =
    filters.includeWorkspaceAudio === false ? [] : walkWorkspaceRecordingsAudio(ctx.wsReal, overrides);

  let items = [...narrations, ...workspaceAudios];
  items.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));

  if (filters.category && filters.category !== 'all') {
    items = items.filter((it) => it.category === filters.category);
  }
  if (filters.origin && filters.origin !== 'all') {
    items = items.filter((it) => it.origin === filters.origin);
  }
  if (filters.voiceId && filters.voiceId !== 'all') {
    items = items.filter(
      (it) => it.voiceId === filters.voiceId || (Array.isArray(it.voicesUsed) && it.voicesUsed.includes(filters.voiceId))
    );
  }
  if (filters.docPath) {
    const cleanDoc = String(filters.docPath).replace(/\\/g, '/').trim();
    items = items.filter((it) => it.docPath === cleanDoc);
  }
  if (filters.q) {
    const needle = String(filters.q).toLowerCase().trim();
    items = items.filter((it) =>
      `${it.title} ${it.textPreview} ${it.docPath} ${it.voiceName} ${it.origin} ${it.category}`
        .toLowerCase()
        .includes(needle)
    );
  }

  return items;
}

export async function updateNarrationMeta(wsPath, audioId, patch = {}) {
  const ctx = getWorkspaceTtsContext(wsPath);
  const cleanId = String(audioId || '').trim();
  if (!cleanId || !SAFE_ID_RE.test(cleanId)) {
    throw httpError('ID de áudio inválido', 400);
  }

  return withFileLock(ctx.registryPath, async () => {
    const reg = loadRegistry(ctx);
    const idx = reg.items.findIndex((it) => it && it.id === cleanId);
    if (idx !== -1) {
      const curr = reg.items[idx];
      const next = {
        ...curr,
        ...(patch.title !== undefined ? { title: String(patch.title).trim().slice(0, 120) || curr.title } : {}),
        ...(patch.category !== undefined ? { category: slugify(String(patch.category || 'geral')) || 'geral' } : {}),
        ...(patch.docPath !== undefined ? { docPath: String(patch.docPath || '').replace(/\\/g, '/').trim() } : {}),
      };
      reg.items[idx] = next;
      saveRegistry(ctx, reg.items);
      return { ok: true, item: next };
    }

    // Override metadata for workspace audio (e.g., gravacoes/clonagem-voz)
    fs.mkdirSync(ctx.studioDataDir, { recursive: true });
    const overrides = loadOverrides(ctx);
    overrides[cleanId] = {
      ...(overrides[cleanId] || {}),
      ...(patch.title !== undefined ? { title: String(patch.title).trim().slice(0, 120) } : {}),
      ...(patch.category !== undefined ? { category: slugify(String(patch.category || 'geral')) || 'geral' } : {}),
      ...(patch.docPath !== undefined ? { docPath: String(patch.docPath || '').replace(/\\/g, '/').trim() } : {}),
    };
    writeJsonAtomic(
      ctx.overridesPath,
      { schemaVersion: 1, updatedAt: new Date().toISOString(), items: overrides },
      { schemaVersion: 1, backup: true }
    );
    return { ok: true, id: cleanId, override: overrides[cleanId] };
  });
}

export async function upsertRestoredNarration(wsPath, itemMeta, dest) {
  if (!itemMeta || !isPlainObject(itemMeta)) return null;
  const ctx = getWorkspaceTtsContext(wsPath);
  return withFileLock(ctx.registryPath, async () => {
    const reg = loadRegistry(ctx);
    const restoredItem = {
      ...itemMeta,
      relPath: dest?.relPath || itemMeta.relPath,
      fileName: dest?.relPath ? path.basename(dest.relPath) : itemMeta.fileName,
    };
    const next = [restoredItem, ...reg.items.filter((x) => x && x.id !== restoredItem.id)];
    saveRegistry(ctx, next);
    return restoredItem;
  });
}

export async function deleteNarrationAudio(wsPath, audioId) {
  const ctx = getWorkspaceTtsContext(wsPath);
  const cleanId = String(audioId || '').trim();
  if (!cleanId) {
    throw httpError('ID de áudio ausente', 400);
  }
  return withFileLock(ctx.registryPath, async () => {
    const reg = loadRegistry(ctx);
    const idx = reg.items.findIndex((it) => it && it.id === cleanId);
    if (idx === -1) {
      throw httpError('Áudio não encontrado no registro de narrações', 404);
    }
    const [entry] = reg.items.splice(idx, 1);
    const sourceAbs = assertInsideRoot(ctx.narrationsDir, path.resolve(ctx.wsReal, entry.relPath), {
      allowEqual: false,
    });
    let trashed = null;
    if (isRegularFile(sourceAbs)) {
      trashed = await moveToTrash(ctx.wsReal, {
        kind: 'narration',
        originalPath: entry.relPath,
        title: entry.title || entry.fileName,
        metadata: entry,
        sourceAbsPath: sourceAbs,
      });
      fs.rmSync(sourceAbs, { force: true });
    }
    saveRegistry(ctx, reg.items);
    return { ok: true, deletedId: cleanId, trashed };
  });
}

function getAudioMime(ext) {
  switch (String(ext || '').toLowerCase()) {
    case '.wav': return 'audio/wav';
    case '.mp3': return 'audio/mpeg';
    case '.ogg': return 'audio/ogg';
    case '.m4a': return 'audio/mp4';
    case '.flac': return 'audio/flac';
    case '.opus': return 'audio/opus';
    case '.webm': return 'audio/webm';
    default: return 'application/octet-stream';
  }
}

export function streamNarrationAudio(wsPath, relPath, req, res) {
  const ctx = getWorkspaceTtsContext(wsPath);
  const cleanRel = String(relPath || '').replace(/\\/g, '/').replace(/^\/+/, '').trim();
  if (!cleanRel || cleanRel.includes('\0')) {
    throw httpError('Caminho de áudio inválido', 400);
  }

  const recRoot = path.join(ctx.wsReal, RECORDINGS_DIR_NAME);
  const absCandidate = path.resolve(ctx.wsReal, cleanRel);
  const insideNarr = cleanRel.startsWith(`${NARRATIONS_DIR_NAME}/`);
  const insideRec = cleanRel.startsWith(`${RECORDINGS_DIR_NAME}/`);
  if (!insideNarr && !insideRec) {
    throw httpError('Streaming permitido apenas em narracoes/ ou gravacoes/.', 403);
  }

  const allowedRoot = insideNarr ? ctx.narrationsDir : recRoot;
  assertInsideRoot(allowedRoot, absCandidate, { allowEqual: false });
  if (!fs.existsSync(absCandidate)) {
    throw httpError('Arquivo de áudio não encontrado', 404);
  }
  const st = fs.lstatSync(absCandidate);
  if (st.isSymbolicLink() || !st.isFile()) {
    throw httpError('Acesso negado ao arquivo de áudio', 403);
  }
  const realAbs = assertInsideRoot(allowedRoot, fs.realpathSync(absCandidate), { allowEqual: false });
  const totalSize = st.size;
  const contentType = getAudioMime(path.extname(realAbs));
  const rangeHeader = req.headers?.range;

  if (rangeHeader) {
    const match = /^bytes=(\d*)-(\d*)$/i.exec(String(rangeHeader).trim());
    if (!match || (match[1] === '' && match[2] === '')) {
      res.writeHead(416, { 'Content-Range': `bytes */${totalSize}`, 'Accept-Ranges': 'bytes' });
      res.end();
      return;
    }
    let start;
    let end;
    if (match[1] === '') {
      const suffixLen = Number(match[2]);
      if (!Number.isFinite(suffixLen) || suffixLen <= 0) {
        res.writeHead(416, { 'Content-Range': `bytes */${totalSize}`, 'Accept-Ranges': 'bytes' });
        res.end();
        return;
      }
      start = Math.max(0, totalSize - suffixLen);
      end = totalSize - 1;
    } else {
      start = Number(match[1]);
      end = match[2] !== '' ? Number(match[2]) : totalSize - 1;
    }
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start || start >= totalSize) {
      res.writeHead(416, { 'Content-Range': `bytes */${totalSize}`, 'Accept-Ranges': 'bytes' });
      res.end();
      return;
    }
    end = Math.min(end, totalSize - 1);
    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${totalSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': end - start + 1,
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
