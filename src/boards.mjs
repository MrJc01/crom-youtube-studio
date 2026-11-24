import fs from 'node:fs';
import path from 'node:path';
import {
  assertInsideRoot,
  isPlainObject,
  readJsonWithMeta,
  writeJsonAtomic,
  withFileLock,
} from './lib/storage.mjs';
import { moveToTrash } from './lib/trash.mjs';

export const BOARDS_DIR_NAME = 'quadros';
export const VALID_BOARD_SLUG_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;

const SAFE_APP_STATE_KEYS = new Set([
  'theme',
  'viewBackgroundColor',
  'gridSize',
  'gridStep',
  'gridModeEnabled',
  'zenModeEnabled',
  'objectsSnapModeEnabled',
  'viewModeEnabled',
  'scrollX',
  'scrollY',
  'zoom',
  'name',
  'currentItemStrokeColor',
  'currentItemBackgroundColor',
  'currentItemFillStyle',
  'currentItemStrokeWidth',
  'currentItemStrokeStyle',
  'currentItemRoughness',
  'currentItemOpacity',
  'currentItemFontFamily',
  'currentItemFontSize',
  'currentItemTextAlign',
  'currentItemStartArrowhead',
  'currentItemEndArrowhead',
  'currentItemRoundness',
  'currentItemArrowType',
  'exportBackground',
  'exportEmbedScene',
  'exportWithDarkMode',
  'exportScale',
  'frameRendering',
]);

function httpError(message, statusCode) {
  return Object.assign(new Error(message), { statusCode });
}

function getBoardsQuarantineDir(rootReal) {
  return path.join(rootReal, '.studio-data', 'quarantine');
}

/**
 * Validates a board slug strictly against path traversal, dots, slashes, and invalid characters.
 */
export function validateBoardId(rawId) {
  if (rawId === undefined || rawId === null) {
    throw httpError('ID do quadro ausente', 400);
  }
  if (typeof rawId !== 'string') {
    throw httpError('ID do quadro inválido', 400);
  }
  const trimmed = rawId.trim();
  if (!trimmed) {
    throw httpError('ID do quadro ausente', 400);
  }
  if (
    trimmed.includes('\0') ||
    trimmed.includes('/') ||
    trimmed.includes('\\') ||
    trimmed.includes('..') ||
    trimmed.includes('.')
  ) {
    throw httpError('ID de quadro proibido', 403);
  }
  if (!VALID_BOARD_SLUG_RE.test(trimmed)) {
    throw httpError(
      'Slug de quadro inválido. Use apenas letras minúsculas, números, "-" e "_" (máx. 64 caracteres).',
      400
    );
  }
  return trimmed;
}

function slugifyBoardTitle(rawTitle) {
  const base = String(rawTitle || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/^[^a-z0-9]+/, '');
  const trimmed = (base || 'quadro').slice(0, 64).replace(/[-_]+$/, '');
  return trimmed && VALID_BOARD_SLUG_RE.test(trimmed) ? trimmed : 'quadro';
}

function resolveBoardsDir(workspaceRoot, { ensureDir = false } = {}) {
  if (!workspaceRoot || typeof workspaceRoot !== 'string' || !fs.existsSync(workspaceRoot)) {
    throw httpError('Workspace não encontrado', 404);
  }
  const rootReal = fs.realpathSync(workspaceRoot);
  const boardsDir = path.join(rootReal, BOARDS_DIR_NAME);

  if (fs.existsSync(boardsDir)) {
    const stat = fs.lstatSync(boardsDir);
    if (stat.isSymbolicLink() || !stat.isDirectory()) {
      throw httpError('Diretório de quadros inválido ou symlink não permitido', 403);
    }
    const boardsDirReal = fs.realpathSync(boardsDir);
    if (
      boardsDirReal !== path.join(rootReal, BOARDS_DIR_NAME) ||
      !boardsDirReal.startsWith(rootReal + path.sep)
    ) {
      throw httpError('Diretório de quadros fora do workspace', 403);
    }
    return { rootReal, boardsDirReal, exists: true };
  }

  if (!ensureDir) {
    return { rootReal, boardsDirReal: boardsDir, exists: false };
  }

  fs.mkdirSync(boardsDir, { recursive: true });
  const stat = fs.lstatSync(boardsDir);
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw httpError('Diretório de quadros inválido ou symlink não permitido', 403);
  }
  const boardsDirReal = fs.realpathSync(boardsDir);
  if (
    boardsDirReal !== path.join(rootReal, BOARDS_DIR_NAME) ||
    !boardsDirReal.startsWith(rootReal + path.sep)
  ) {
    throw httpError('Diretório de quadros fora do workspace', 403);
  }
  return { rootReal, boardsDirReal, exists: true };
}

function resolveBoardFilePath(workspaceRoot, rawId, { ensureDir = false, mustExist = false } = {}) {
  const id = validateBoardId(rawId);
  const { rootReal, boardsDirReal, exists } = resolveBoardsDir(workspaceRoot, { ensureDir });
  const filePath = assertInsideRoot(boardsDirReal, path.resolve(boardsDirReal, `${id}.excalidraw`), {
    allowEqual: false,
    message: 'Caminho do quadro fora do diretório permitido',
  });

  if (path.dirname(filePath) !== boardsDirReal) {
    throw httpError('Caminho do quadro fora do diretório permitido', 403);
  }

  if (!exists) {
    if (mustExist) {
      throw httpError(`Quadro "${id}" não encontrado`, 404);
    }
    return { id, rootReal, boardsDirReal, filePath };
  }

  if (fs.existsSync(filePath)) {
    const st = fs.lstatSync(filePath);
    if (st.isSymbolicLink() || !st.isFile()) {
      throw httpError('Symlinks não são permitidos em arquivos de quadro', 403);
    }
    const realFile = fs.realpathSync(filePath);
    if (path.dirname(realFile) !== boardsDirReal || !realFile.startsWith(boardsDirReal + path.sep)) {
      throw httpError('Arquivo de quadro fora do diretório permitido', 403);
    }
  } else if (mustExist) {
    throw httpError(`Quadro "${id}" não encontrado`, 404);
  }

  return { id, rootReal, boardsDirReal, filePath };
}

/**
 * Keeps only persistent, JSON-serializable Excalidraw appState fields.
 */
export function sanitizeAppState(rawAppState) {
  if (!isPlainObject(rawAppState)) return {};
  const clean = {};

  for (const key of SAFE_APP_STATE_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(rawAppState, key)) continue;
    const val = rawAppState[key];
    if (val === undefined || typeof val === 'function' || typeof val === 'symbol') continue;
    if (val instanceof Map || val instanceof Set) continue;

    if (key === 'zoom') {
      if (isPlainObject(val) && Number.isFinite(Number(val.value))) {
        clean.zoom = { value: Number(val.value) };
      }
      continue;
    }

    if (key === 'frameRendering') {
      if (isPlainObject(val)) {
        const fr = {};
        for (const fk of ['enabled', 'clip', 'name', 'outline']) {
          if (typeof val[fk] === 'boolean') fr[fk] = val[fk];
        }
        clean.frameRendering = fr;
      }
      continue;
    }

    if (
      typeof val === 'string' ||
      typeof val === 'boolean' ||
      val === null ||
      (typeof val === 'number' && Number.isFinite(val))
    ) {
      clean[key] = val;
    }
  }

  return clean;
}

function sanitizeElements(rawElements) {
  if (!Array.isArray(rawElements)) return [];
  return rawElements.filter((el) => isPlainObject(el));
}

function sanitizeFiles(rawFiles) {
  if (!isPlainObject(rawFiles)) return {};
  const out = {};
  for (const [k, v] of Object.entries(rawFiles)) {
    if (k && isPlainObject(v)) {
      out[k] = v;
    }
  }
  return out;
}

function countActiveElements(elements) {
  if (!Array.isArray(elements)) return 0;
  return elements.filter((el) => el && !el.isDeleted).length;
}

function normalizePreferredMode(mode) {
  return mode === 'nodes' ? 'nodes' : 'excalidraw';
}

function buildBoardSummary(id, parsed, stat) {
  const elements = sanitizeElements(parsed?.elements);
  const files = sanitizeFiles(parsed?.files);
  const meta = isPlainObject(parsed?.cromMeta) ? parsed.cromMeta : {};
  const fallbackIso = stat.mtime.toISOString();
  const createdIso =
    typeof meta.createdAt === 'string' && meta.createdAt
      ? meta.createdAt
      : stat.birthtime && Number.isFinite(stat.birthtimeMs) && stat.birthtimeMs > 0
      ? stat.birthtime.toISOString()
      : fallbackIso;
  const updatedIso =
    typeof meta.updatedAt === 'string' && meta.updatedAt ? meta.updatedAt : fallbackIso;

  const rawTitle =
    typeof meta.title === 'string' && meta.title.trim()
      ? meta.title.trim()
      : typeof parsed?.appState?.name === 'string' && parsed.appState.name.trim()
      ? parsed.appState.name.trim()
      : id;

  const linkedDocPaths = [];
  const seenDocs = new Set();
  for (const el of elements) {
    if (!el || el.isDeleted) continue;
    const docPath = typeof el.customData?.docPath === 'string' ? el.customData.docPath.trim() : '';
    if (docPath && !seenDocs.has(docPath)) {
      seenDocs.add(docPath);
      linkedDocPaths.push(docPath);
    }
  }

  return {
    id,
    title: rawTitle,
    description: typeof meta.description === 'string' ? meta.description : '',
    path: `${BOARDS_DIR_NAME}/${id}.excalidraw`,
    preferredMode: normalizePreferredMode(meta.preferredMode),
    elementCount: countActiveElements(elements),
    linkedDocPaths,
    hasFiles: Object.keys(files).length > 0,
    sizeBytes: stat.size,
    createdAt: createdIso,
    updatedAt: updatedIso,
  };
}

function buildScenePayload(parsed) {
  return {
    type: 'excalidraw',
    version: Number(parsed?.version) || 2,
    source: typeof parsed?.source === 'string' && parsed.source ? parsed.source : 'https://crom.run/studio',
    elements: sanitizeElements(parsed?.elements),
    appState: sanitizeAppState(parsed?.appState),
    files: sanitizeFiles(parsed?.files),
  };
}

/**
 * Lists all valid `.excalidraw` boards in `<workspaceRoot>/quadros`, newest `updatedAt` first.
 */
export function listBoards(workspaceRoot) {
  if (!workspaceRoot || typeof workspaceRoot !== 'string' || !fs.existsSync(workspaceRoot)) {
    return [];
  }

  let dirInfo;
  try {
    dirInfo = resolveBoardsDir(workspaceRoot, { ensureDir: false });
  } catch {
    return [];
  }
  if (!dirInfo.exists) return [];

  const { rootReal, boardsDirReal } = dirInfo;
  const quarantineDir = getBoardsQuarantineDir(rootReal);
  const entries = fs.readdirSync(boardsDirReal, { withFileTypes: true });
  const boards = [];

  for (const entry of entries) {
    if (entry.isSymbolicLink() || !entry.isFile()) continue;
    if (entry.name.startsWith('.')) continue;
    if (!entry.name.toLowerCase().endsWith('.excalidraw')) continue;

    const id = entry.name.slice(0, -'.excalidraw'.length);
    if (!VALID_BOARD_SLUG_RE.test(id)) continue;

    const fullPath = path.join(boardsDirReal, entry.name);
    try {
      const st = fs.lstatSync(fullPath);
      if (st.isSymbolicLink() || !st.isFile()) continue;
      const realFile = fs.realpathSync(fullPath);
      if (path.dirname(realFile) !== boardsDirReal || !realFile.startsWith(boardsDirReal + path.sep)) {
        continue;
      }
      const res = readJsonWithMeta(realFile, {
        defaultData: null,
        schemaVersion: null,
        quarantineDir,
      });
      if (!isPlainObject(res.data)) continue;
      const currentStat = fs.lstatSync(realFile);
      boards.push(buildBoardSummary(id, res.data, currentStat));
    } catch {
      // Ignora arquivo corrompido ou em transição externa
    }
  }

  boards.sort((a, b) => {
    const diff = Date.parse(b.updatedAt || '') - Date.parse(a.updatedAt || '');
    if (Number.isFinite(diff) && diff !== 0) return diff;
    return (
      String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')) ||
      a.id.localeCompare(b.id, 'pt-BR')
    );
  });

  return boards;
}

/**
 * Reads a single Excalidraw board (`{ board, scene }`).
 */
export function readBoard(workspaceRoot, id) {
  const { id: safeId, rootReal, filePath } = resolveBoardFilePath(workspaceRoot, id, {
    ensureDir: false,
    mustExist: true,
  });

  const res = readJsonWithMeta(filePath, {
    defaultData: null,
    schemaVersion: null,
    quarantineDir: getBoardsQuarantineDir(rootReal),
  });
  if ((res.error && !res.recovered) || !res.data) {
    throw httpError(`Arquivo de quadro inválido: ${safeId}`, 400);
  }
  if (!isPlainObject(res.data)) {
    throw httpError(`Formato de quadro inválido: ${safeId}`, 400);
  }

  const stat = fs.lstatSync(filePath);
  return {
    board: buildBoardSummary(safeId, res.data, stat),
    scene: buildScenePayload(res.data),
  };
}

function allocateUniqueSlug(boardsDirReal, baseSlug) {
  const candidate0 = baseSlug;
  if (!fs.existsSync(path.join(boardsDirReal, `${candidate0}.excalidraw`))) {
    return candidate0;
  }
  const stem = baseSlug.slice(0, 55).replace(/[-_]+$/, '') || 'quadro';
  for (let i = 2; i < 10000; i += 1) {
    const candidate = `${stem}-${i}`;
    if (!fs.existsSync(path.join(boardsDirReal, `${candidate}.excalidraw`))) {
      return candidate;
    }
  }
  return `${stem.slice(0, 48)}-${Date.now()}`;
}

/**
 * Creates a new Excalidraw v2 board atomically inside `<workspaceRoot>/quadros`.
 */
export async function createBoard(workspaceRoot, payload = {}) {
  const body = isPlainObject(payload) ? payload : {};
  const rawTitle = typeof body.title === 'string' ? body.title.trim() : '';
  const rawExplicit = body.id !== undefined ? body.id : body.slug;
  const hasExplicit =
    rawExplicit !== undefined &&
    rawExplicit !== null &&
    (typeof rawExplicit !== 'string' || rawExplicit.trim() !== '');

  const { boardsDirReal } = resolveBoardsDir(workspaceRoot, { ensureDir: true });

  return withFileLock(path.join(boardsDirReal, '.boards.lock'), async () => {
    let safeId;
    let filePath;
    if (hasExplicit) {
      const resolved = resolveBoardFilePath(workspaceRoot, rawExplicit, {
        ensureDir: true,
        mustExist: false,
      });
      safeId = resolved.id;
      filePath = resolved.filePath;
      if (fs.existsSync(filePath)) {
        throw httpError(`Já existe um quadro com o slug "${safeId}"`, 409);
      }
    } else {
      const baseSlug = slugifyBoardTitle(rawTitle || 'quadro');
      safeId = allocateUniqueSlug(boardsDirReal, baseSlug);
      filePath = resolveBoardFilePath(workspaceRoot, safeId, {
        ensureDir: true,
        mustExist: false,
      }).filePath;
    }

    const now = new Date().toISOString();
    const title = rawTitle || safeId;
    const description = typeof body.description === 'string' ? body.description.trim() : '';
    const preferredMode = normalizePreferredMode(body.preferredMode);
    const elements = sanitizeElements(body.elements);
    const appState =
      body.appState !== undefined && body.appState !== null
        ? sanitizeAppState(body.appState)
        : { viewBackgroundColor: '#0e0f17', theme: 'dark' };
    const files = sanitizeFiles(body.files);

    const doc = {
      type: 'excalidraw',
      version: 2,
      source: 'https://crom.run/studio',
      elements,
      appState,
      files,
      cromMeta: {
        id: safeId,
        title,
        description,
        preferredMode,
        createdAt: now,
        updatedAt: now,
        elementCount: countActiveElements(elements),
      },
    };

    const writeRes = writeJsonAtomic(filePath, doc, { schemaVersion: 1, backup: true });
    const stat = fs.lstatSync(filePath);

    return {
      board: buildBoardSummary(safeId, doc, stat),
      scene: buildScenePayload(doc),
      boards: listBoards(workspaceRoot),
      fileHash: writeRes.sha256,
    };
  });
}

/**
 * Updates an existing Excalidraw v2 board (supporting optional `renameTo` slug and `title` change).
 */
export async function saveBoard(workspaceRoot, id, payload = {}) {
  const body = isPlainObject(payload) ? payload : {};
  const { id: currentId, rootReal, boardsDirReal, filePath: currentPath } = resolveBoardFilePath(
    workspaceRoot,
    id,
    {
      ensureDir: false,
      mustExist: true,
    }
  );

  return withFileLock(path.join(boardsDirReal, '.boards.lock'), async () => {
    const currentStat = fs.lstatSync(currentPath);
    const existingRes = readJsonWithMeta(currentPath, {
      defaultData: null,
      schemaVersion: null,
      quarantineDir: getBoardsQuarantineDir(rootReal),
    });
    if ((existingRes.error && !existingRes.recovered) || !existingRes.data) {
      throw httpError(`Arquivo de quadro inválido: ${currentId}`, 400);
    }
    if (!isPlainObject(existingRes.data)) {
      throw httpError(`Formato de quadro inválido: ${currentId}`, 400);
    }

    const existing = existingRes.data;
    const existingSummary = buildBoardSummary(currentId, existing, currentStat);

    let finalId = currentId;
    let finalPath = currentPath;
    const rawRenameTo = body.renameTo;
    const hasRename =
      rawRenameTo !== undefined &&
      rawRenameTo !== null &&
      (typeof rawRenameTo !== 'string' || rawRenameTo.trim() !== '');

    if (hasRename) {
      const nextResolved = resolveBoardFilePath(workspaceRoot, rawRenameTo, {
        ensureDir: true,
        mustExist: false,
      });
      if (nextResolved.id !== currentId) {
        if (fs.existsSync(nextResolved.filePath)) {
          throw httpError(`Já existe um quadro com o slug "${nextResolved.id}"`, 409);
        }
        finalId = nextResolved.id;
        finalPath = nextResolved.filePath;
      }
    }

    const now = new Date().toISOString();
    const title =
      body.title !== undefined && typeof body.title === 'string' && body.title.trim()
        ? body.title.trim()
        : existingSummary.title;
    const description =
      body.description !== undefined && typeof body.description === 'string'
        ? body.description.trim()
        : existingSummary.description;
    const preferredMode =
      body.preferredMode !== undefined
        ? normalizePreferredMode(body.preferredMode)
        : existingSummary.preferredMode;

    const elements =
      body.elements !== undefined ? sanitizeElements(body.elements) : sanitizeElements(existing.elements);
    const appState =
      body.appState !== undefined ? sanitizeAppState(body.appState) : sanitizeAppState(existing.appState);
    const files = body.files !== undefined ? sanitizeFiles(body.files) : sanitizeFiles(existing.files);

    const doc = {
      type: 'excalidraw',
      version: 2,
      source: typeof existing.source === 'string' && existing.source ? existing.source : 'https://crom.run/studio',
      elements,
      appState,
      files,
      cromMeta: {
        id: finalId,
        title,
        description,
        preferredMode,
        createdAt: existingSummary.createdAt,
        updatedAt: now,
        elementCount: countActiveElements(elements),
      },
    };

    const writeRes = writeJsonAtomic(finalPath, doc, { schemaVersion: 1, backup: true });
    const renamed = finalPath !== currentPath;
    if (renamed) {
      if (fs.existsSync(currentPath)) fs.unlinkSync(currentPath);
      if (fs.existsSync(`${currentPath}.bak`)) fs.unlinkSync(`${currentPath}.bak`);
    }
    const stat = fs.lstatSync(finalPath);

    return {
      board: buildBoardSummary(finalId, doc, stat),
      scene: buildScenePayload(doc),
      boards: listBoards(workspaceRoot),
      renamed,
      previousId: currentId,
      fileHash: writeRes.sha256,
    };
  });
}

/**
 * Moves an existing `.excalidraw` board file to recoverable trash before deleting it.
 */
export async function deleteBoard(workspaceRoot, id) {
  const { id: safeId, rootReal, boardsDirReal, filePath } = resolveBoardFilePath(workspaceRoot, id, {
    ensureDir: false,
    mustExist: true,
  });

  return withFileLock(path.join(boardsDirReal, '.boards.lock'), async () => {
    let title = safeId;
    try {
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (isPlainObject(parsed?.cromMeta) && typeof parsed.cromMeta.title === 'string' && parsed.cromMeta.title.trim()) {
        title = parsed.cromMeta.title.trim();
      }
    } catch {
      // keep fallback title
    }

    const relPath = `${BOARDS_DIR_NAME}/${safeId}.excalidraw`;
    const trashed = await moveToTrash(rootReal, {
      kind: 'board',
      originalPath: relPath,
      title,
      sourceAbsPath: filePath,
      metadata: { boardId: safeId },
    });

    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    if (fs.existsSync(`${filePath}.bak`)) fs.unlinkSync(`${filePath}.bak`);

    return {
      deleted: safeId,
      trashed,
      boards: listBoards(workspaceRoot),
    };
  });
}
