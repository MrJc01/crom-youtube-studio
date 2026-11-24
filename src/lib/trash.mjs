import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  assertInsideRoot,
  isPlainObject,
  readJsonSafe,
  writeFileAtomic,
  writeJsonAtomic,
  withFileLock,
} from './storage.mjs';

export const TRASH_VALID_KINDS = new Set(['doc', 'board', 'note', 'playlist', 'narration']);
export const DEFAULT_TRASH_MAX_DAYS = 30;

function httpError(message, statusCode) {
  return Object.assign(new Error(message), { statusCode });
}

function getTrashContext(wsPath, { ensureDirs = false } = {}) {
  if (!wsPath || typeof wsPath !== 'string' || !fs.existsSync(wsPath)) {
    throw httpError('Workspace não encontrado', 404);
  }
  const wsReal = fs.realpathSync(wsPath);
  const studioDataDir = path.join(wsReal, '.studio-data');
  const quarantineDir = path.join(studioDataDir, 'quarantine');
  const trashDir = path.join(studioDataDir, 'trash');
  const itemsDir = path.join(trashDir, 'items');
  const manifestPath = path.join(trashDir, 'manifest.json');

  assertInsideRoot(wsReal, studioDataDir);
  assertInsideRoot(wsReal, trashDir);
  assertInsideRoot(wsReal, itemsDir);
  assertInsideRoot(wsReal, manifestPath);

  if (ensureDirs) {
    fs.mkdirSync(itemsDir, { recursive: true });
    assertInsideRoot(wsReal, itemsDir);
  }

  return { wsReal, studioDataDir, quarantineDir, trashDir, itemsDir, manifestPath };
}

function defaultManifest() {
  return {
    schemaVersion: 1,
    items: [],
  };
}

function loadManifest(ctx) {
  if (!fs.existsSync(ctx.manifestPath)) {
    return defaultManifest();
  }
  const raw = readJsonSafe(ctx.manifestPath, {
    defaultData: defaultManifest(),
    schemaVersion: 1,
    quarantineDir: ctx.quarantineDir,
  });
  const items = Array.isArray(raw?.items) ? raw.items.filter((x) => x && typeof x === 'object') : [];
  return {
    schemaVersion: 1,
    items,
  };
}

function saveManifest(ctx, manifest) {
  fs.mkdirSync(ctx.itemsDir, { recursive: true });
  writeJsonAtomic(
    ctx.manifestPath,
    {
      items: Array.isArray(manifest.items) ? manifest.items : [],
    },
    { schemaVersion: 1, backup: true }
  );
}

function sortTrashItemsNewestFirst(items) {
  return [...items].sort((a, b) => {
    const cmp = String(b.deletedAt || '').localeCompare(String(a.deletedAt || ''));
    if (cmp !== 0) return cmp;
    return String(b.id || '').localeCompare(String(a.id || ''));
  });
}

function removePayloadFile(ctx, payloadFile) {
  if (!payloadFile || typeof payloadFile !== 'string') return;
  try {
    const abs = assertInsideRoot(ctx.trashDir, path.resolve(ctx.trashDir, payloadFile), {
      allowEqual: false,
    });
    if (fs.existsSync(abs)) {
      fs.unlinkSync(abs);
    }
    const bak = `${abs}.bak`;
    if (fs.existsSync(bak)) {
      fs.unlinkSync(bak);
    }
  } catch {
    // ignore payload removal error
  }
}

function isItemExpired(item, nowMs, maxDays) {
  const days = Number.isFinite(Number(maxDays)) ? Number(maxDays) : DEFAULT_TRASH_MAX_DAYS;
  const deletedMs = Date.parse(item?.deletedAt || '');
  const expiresMs = Date.parse(item?.expiresAt || '');

  if (days <= 0) {
    return Number.isFinite(deletedMs) ? deletedMs <= nowMs : true;
  }

  const cutoffMs = nowMs - days * 86_400_000;
  if (Number.isFinite(deletedMs) && deletedMs <= cutoffMs) {
    return true;
  }
  if (days === DEFAULT_TRASH_MAX_DAYS && Number.isFinite(expiresMs) && expiresMs <= nowMs) {
    return true;
  }
  return false;
}

/**
 * Removes trash entries older than `maxDays` along with their stored payloads.
 */
export function pruneExpiredTrash(wsPath, maxDays = DEFAULT_TRASH_MAX_DAYS) {
  const ctx = getTrashContext(wsPath, { ensureDirs: false });
  if (!fs.existsSync(ctx.manifestPath)) {
    return { removedCount: 0, remainingCount: 0, items: [] };
  }

  const manifest = loadManifest(ctx);
  const nowMs = Date.now();
  const kept = [];
  let removedCount = 0;

  for (const item of manifest.items) {
    if (isItemExpired(item, nowMs, maxDays)) {
      removePayloadFile(ctx, item.payloadFile);
      removedCount += 1;
    } else {
      kept.push(item);
    }
  }

  if (removedCount > 0) {
    saveManifest(ctx, { items: kept });
  }

  return {
    removedCount,
    remainingCount: kept.length,
    items: sortTrashItemsNewestFirst(kept),
  };
}

/**
 * Moves a doc, board, note, or playlist into the workspace's recoverable trash.
 */
export async function moveToTrash(
  wsPath,
  {
    kind,
    originalPath = '',
    title = '',
    metadata = {},
    sourceAbsPath = null,
    content = null,
    itemPayload = null,
    maxDays = DEFAULT_TRASH_MAX_DAYS,
  } = {}
) {
  const cleanKind = String(kind || '').trim().toLowerCase();
  if (!TRASH_VALID_KINDS.has(cleanKind)) {
    throw httpError(`Tipo de item inválido na lixeira: "${kind}"`, 400);
  }

  const ctx = getTrashContext(wsPath, { ensureDirs: true });

  return withFileLock(ctx.manifestPath, async () => {
    const id = `tr-${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}`;
    const isStructured = cleanKind === 'note' || cleanKind === 'playlist';
    const payloadRel = isStructured ? `items/${id}.json` : `items/${id}.blob`;
    const payloadAbs = assertInsideRoot(ctx.trashDir, path.join(ctx.trashDir, payloadRel), {
      allowEqual: false,
    });

    if (isStructured) {
      const payloadData =
        itemPayload !== null && itemPayload !== undefined
          ? itemPayload
          : content !== null && content !== undefined
          ? content
          : {};
      writeJsonAtomic(payloadAbs, { itemPayload: payloadData }, { schemaVersion: 1, backup: false });
    } else {
      let rawBuf;
      if (content !== null && content !== undefined) {
        rawBuf = Buffer.isBuffer(content) ? content : Buffer.from(String(content), 'utf8');
      } else if (sourceAbsPath) {
        const safeSource = assertInsideRoot(ctx.wsReal, sourceAbsPath, { allowEqual: false });
        if (!fs.existsSync(safeSource)) {
          throw httpError(`Arquivo de origem não encontrado para lixeira: ${originalPath || safeSource}`, 404);
        }
        rawBuf = fs.readFileSync(safeSource);
      } else {
        throw httpError('Conteúdo ou caminho de origem obrigatório para mover para a lixeira.', 400);
      }
      writeFileAtomic(payloadAbs, rawBuf, { backup: false });
    }

    const nowMs = Date.now();
    const deletedAt = new Date(nowMs).toISOString();
    const ttlDays = Number.isFinite(Number(maxDays)) && Number(maxDays) > 0 ? Number(maxDays) : DEFAULT_TRASH_MAX_DAYS;
    const expiresAt = new Date(nowMs + ttlDays * 86_400_000).toISOString();

    const cleanOriginal = String(originalPath || '').replace(/\\/g, '/').replace(/^\/+/, '').trim();
    const entry = {
      id,
      kind: cleanKind,
      originalPath: cleanOriginal,
      title: String(title || cleanOriginal || id).trim() || id,
      deletedAt,
      expiresAt,
      payloadFile: payloadRel,
      metadata: isPlainObject(metadata) ? metadata : {},
    };

    const manifest = loadManifest(ctx);
    manifest.items.unshift(entry);
    saveManifest(ctx, manifest);

    return entry;
  });
}

/**
 * Silently prunes expired items and returns current trash entries (newest first).
 */
export function listTrash(wsPath) {
  const ctx = getTrashContext(wsPath, { ensureDirs: false });
  if (!fs.existsSync(ctx.manifestPath)) {
    return { items: [], trashDir: ctx.trashDir };
  }
  const pruned = pruneExpiredTrash(wsPath, DEFAULT_TRASH_MAX_DAYS);
  return {
    items: pruned.items,
    trashDir: ctx.trashDir,
  };
}

function buildRestoredConflictPath(wsReal, relPath, kind) {
  const norm = String(relPath || '').replace(/\\/g, '/').replace(/^\/+/, '').trim();
  if (!norm || norm.includes('\0')) {
    throw httpError('Caminho original inválido na lixeira', 400);
  }
  const parts = norm.split('/');
  if (parts.some((p) => !p || p === '.' || p === '..' || p.startsWith('.'))) {
    throw httpError('Caminho original proibido na lixeira', 403);
  }

  const targetAbs = assertInsideRoot(wsReal, path.resolve(wsReal, norm), { allowEqual: false });
  if (!fs.existsSync(targetAbs)) {
    return { relPath: norm, absPath: targetAbs, renamed: false };
  }

  const dirRel = path.posix.dirname(norm);
  const ext = path.posix.extname(norm);
  const stem = path.posix.basename(norm, ext);
  const ts = Date.now().toString(36);

  for (let i = 0; i < 100; i += 1) {
    const suffix = i === 0 ? `-restaurado-${ts}` : `-restaurado-${ts}-${i + 1}`;
    let nextStem;
    if (kind === 'board') {
      const cleanStem =
        stem
          .toLowerCase()
          .replace(/[^a-z0-9_-]+/g, '-')
          .replace(/^-+|-+$/g, '') || 'quadro';
      const maxStemLen = Math.max(4, 64 - suffix.length);
      nextStem = `${cleanStem.slice(0, maxStemLen).replace(/[-_]+$/, '') || 'quadro'}${suffix}`;
    } else {
      nextStem = `${stem}${suffix}`;
    }
    const nextFile = `${nextStem}${ext}`;
    const candidateRel = dirRel && dirRel !== '.' ? `${dirRel}/${nextFile}` : nextFile;
    const candidateAbs = assertInsideRoot(wsReal, path.resolve(wsReal, candidateRel), {
      allowEqual: false,
    });
    if (!fs.existsSync(candidateAbs)) {
      return { relPath: candidateRel, absPath: candidateAbs, renamed: true, newId: nextStem };
    }
  }

  throw httpError('Não foi possível alocar nome único para restauração.', 409);
}

/**
 * Restores a trashed item back into the workspace (or invokes handlers for note/playlist).
 */
export async function restoreFromTrash(wsPath, trashId, handlers = {}) {
  const cleanId = String(trashId || '').trim();
  if (!cleanId) {
    throw httpError('ID do item na lixeira ausente', 400);
  }
  const ctx = getTrashContext(wsPath, { ensureDirs: false });

  return withFileLock(ctx.manifestPath, async () => {
    const manifest = loadManifest(ctx);
    const idx = manifest.items.findIndex((it) => it && it.id === cleanId);
    if (idx === -1) {
      throw httpError(`Item "${cleanId}" não encontrado na lixeira`, 404);
    }

    const entry = manifest.items[idx];
    const payloadAbs = assertInsideRoot(
      ctx.trashDir,
      path.resolve(ctx.trashDir, String(entry.payloadFile || '')),
      { allowEqual: false }
    );
    if (!fs.existsSync(payloadAbs)) {
      throw httpError(`Payload do item "${cleanId}" não encontrado na lixeira`, 404);
    }

    if (entry.kind === 'doc' || entry.kind === 'board' || entry.kind === 'narration') {
      let rawBuf = fs.readFileSync(payloadAbs);
      const fallbackRel =
        entry.kind === 'board'
          ? `quadros/${cleanId.toLowerCase()}.excalidraw`
          : entry.kind === 'narration'
          ? `narracoes/${cleanId}.wav`
          : `01-ideias/${cleanId}.md`;
      const dest = buildRestoredConflictPath(ctx.wsReal, entry.originalPath || fallbackRel, entry.kind);

      if (entry.kind === 'board' && dest.renamed && dest.newId) {
        try {
          const parsed = JSON.parse(rawBuf.toString('utf8'));
          if (isPlainObject(parsed)) {
            if (isPlainObject(parsed.cromMeta)) {
              parsed.cromMeta.id = dest.newId;
              parsed.cromMeta.updatedAt = new Date().toISOString();
            }
            rawBuf = Buffer.from(`${JSON.stringify(parsed, null, 2)}\n`, 'utf8');
          }
        } catch {
          // preserve raw bytes if non-JSON
        }
      }

      writeFileAtomic(dest.absPath, rawBuf, { backup: false });
      if (entry.kind === 'narration' && typeof handlers.onRestoreNarration === 'function') {
        await handlers.onRestoreNarration(entry.metadata, dest);
      }
      removePayloadFile(ctx, entry.payloadFile);
      manifest.items.splice(idx, 1);
      saveManifest(ctx, manifest);

      return {
        restored: true,
        item: entry,
        targetPath: dest.relPath,
        renamed: dest.renamed,
      };
    }

    const parsedPayload = readJsonSafe(payloadAbs, {
      defaultData: {},
      schemaVersion: null,
      quarantineDir: ctx.quarantineDir,
    });
    const itemPayload =
      isPlainObject(parsedPayload) && Object.prototype.hasOwnProperty.call(parsedPayload, 'itemPayload')
        ? parsedPayload.itemPayload
        : parsedPayload;

    if (entry.kind === 'note' && typeof handlers.onRestoreNote === 'function') {
      await handlers.onRestoreNote(itemPayload, entry);
    } else if (entry.kind === 'playlist' && typeof handlers.onRestorePlaylist === 'function') {
      await handlers.onRestorePlaylist(itemPayload, entry);
    }

    removePayloadFile(ctx, entry.payloadFile);
    manifest.items.splice(idx, 1);
    saveManifest(ctx, manifest);

    return {
      restored: true,
      item: {
        ...entry,
        itemPayload,
      },
      targetPath: entry.originalPath || null,
    };
  });
}

/**
 * Permanently deletes a single item from trash.
 */
export async function purgeTrashItem(wsPath, trashId) {
  const cleanId = String(trashId || '').trim();
  if (!cleanId) {
    throw httpError('ID do item na lixeira ausente', 400);
  }
  const ctx = getTrashContext(wsPath, { ensureDirs: false });

  return withFileLock(ctx.manifestPath, async () => {
    const manifest = loadManifest(ctx);
    const idx = manifest.items.findIndex((it) => it && it.id === cleanId);
    if (idx === -1) {
      throw httpError(`Item "${cleanId}" não encontrado na lixeira`, 404);
    }
    const [removed] = manifest.items.splice(idx, 1);
    removePayloadFile(ctx, removed.payloadFile);
    saveManifest(ctx, manifest);
    return {
      ok: true,
      purged: cleanId,
      items: sortTrashItemsNewestFirst(manifest.items),
    };
  });
}

/**
 * Permanently empties all items in workspace trash.
 */
export async function purgeAllTrash(wsPath) {
  const ctx = getTrashContext(wsPath, { ensureDirs: false });
  if (!fs.existsSync(ctx.trashDir)) {
    return { ok: true, purgedCount: 0, items: [] };
  }

  return withFileLock(ctx.manifestPath, async () => {
    const manifest = loadManifest(ctx);
    const purgedCount = manifest.items.length;

    for (const item of manifest.items) {
      removePayloadFile(ctx, item.payloadFile);
    }

    if (fs.existsSync(ctx.itemsDir)) {
      for (const entry of fs.readdirSync(ctx.itemsDir, { withFileTypes: true })) {
        if (entry.isFile() && !entry.isSymbolicLink()) {
          try {
            fs.unlinkSync(path.join(ctx.itemsDir, entry.name));
          } catch {
            // ignore
          }
        }
      }
    }

    saveManifest(ctx, { items: [] });
    return {
      ok: true,
      purgedCount,
      items: [],
    };
  });
}
