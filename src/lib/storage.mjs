import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const fileLockQueues = new Map();

function httpError(message, statusCode) {
  return Object.assign(new Error(message), { statusCode });
}

export function isPlainObject(value) {
  return Boolean(
    value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      !(value instanceof Map) &&
      !(value instanceof Set) &&
      Object.prototype.toString.call(value) === '[object Object]'
  );
}

export function slugify(text, fallback = 'sem-titulo') {
  const clean = String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return clean || fallback;
}

export function sha256(text) {
  return crypto.createHash('sha256').update(String(text || ''), 'utf8').digest('hex');
}

function resolveCanonicalPath(targetPath) {
  const abs = path.resolve(targetPath);
  const missingParts = [];
  let probe = abs;

  while (!fs.existsSync(probe)) {
    const parent = path.dirname(probe);
    if (parent === probe) break;
    missingParts.unshift(path.basename(probe));
    probe = parent;
  }

  const realBase = fs.existsSync(probe) ? fs.realpathSync(probe) : probe;
  return missingParts.length ? path.resolve(realBase, ...missingParts) : realBase;
}

function isInsideCanonicalRoot(rootReal, candidate) {
  if (candidate === rootReal) return true;
  if (rootReal === path.sep) return candidate.startsWith(path.sep);
  return candidate.startsWith(rootReal + path.sep);
}

/**
 * Validates that targetPath resolves strictly inside rootDir without path traversal or symlink escape.
 * Throws an error with `.statusCode = 403` on violation.
 */
export function assertInsideRoot(
  rootDir,
  targetPath,
  { allowEqual = true, allowSymlinks = false, message = 'Acesso fora do diretório permitido bloqueado' } = {}
) {
  if (!rootDir || typeof rootDir !== 'string' || rootDir.includes('\0')) {
    throw httpError(message, 403);
  }
  if (!targetPath || typeof targetPath !== 'string' || targetPath.includes('\0')) {
    throw httpError(message, 403);
  }

  const rootReal = resolveCanonicalPath(rootDir);
  const resolvedCandidate = path.isAbsolute(targetPath)
    ? path.resolve(targetPath)
    : path.resolve(rootReal, targetPath);

  if (!isInsideCanonicalRoot(rootReal, resolvedCandidate)) {
    throw httpError(message, 403);
  }
  if (!allowEqual && resolvedCandidate === rootReal) {
    throw httpError(message, 403);
  }

  const rel = path.relative(rootReal, resolvedCandidate);
  if (rel && (rel.startsWith('..') || path.isAbsolute(rel))) {
    throw httpError(message, 403);
  }

  if (rel) {
    let cur = rootReal;
    for (const part of rel.split(path.sep)) {
      if (!part || part === '.') continue;
      cur = path.join(cur, part);
      let lstat;
      try {
        lstat = fs.lstatSync(cur);
      } catch (err) {
        if (err && err.code === 'ENOENT') break;
        throw err;
      }
      if (lstat.isSymbolicLink() && !allowSymlinks) {
        throw httpError('Symlinks não são permitidos nesta operação', 403);
      }
    }
  }

  const targetCanonical = resolveCanonicalPath(resolvedCandidate);
  if (!isInsideCanonicalRoot(rootReal, targetCanonical)) {
    throw httpError(message, 403);
  }
  if (!allowEqual && targetCanonical === rootReal) {
    throw httpError(message, 403);
  }

  return targetCanonical;
}

/**
 * Serializes concurrent async operations on the same lockKey using a FIFO Promise queue.
 */
export async function withFileLock(lockKey, asyncFn) {
  if (typeof asyncFn !== 'function') {
    throw new TypeError('withFileLock requer uma função assíncrona ou síncrona.');
  }
  const key = path.resolve(String(lockKey || 'default'));
  const previous = fileLockQueues.get(key) || Promise.resolve();

  let releaseCurrent;
  const currentDone = new Promise((resolve) => {
    releaseCurrent = resolve;
  });

  fileLockQueues.set(key, currentDone);

  try {
    await previous.catch(() => {});
    return await asyncFn();
  } finally {
    releaseCurrent();
    if (fileLockQueues.get(key) === currentDone) {
      fileLockQueues.delete(key);
    }
  }
}

function writeBufferAtomic(targetPath, buf) {
  const dir = path.dirname(targetPath);
  fs.mkdirSync(dir, { recursive: true });
  const rand = Math.random().toString(36).slice(2, 8);
  const tmpPath = `${targetPath}.tmp.${process.pid}.${rand}`;
  let fd = null;

  try {
    fd = fs.openSync(tmpPath, 'w', 0o666);
    let offset = 0;
    while (offset < buf.length) {
      const written = fs.writeSync(fd, buf, offset, buf.length - offset);
      if (written <= 0) {
        throw new Error(`Falha ao gravar bytes completos em ${tmpPath}`);
      }
      offset += written;
    }
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = null;
    fs.renameSync(tmpPath, targetPath);
  } catch (err) {
    if (fd !== null) {
      try {
        fs.closeSync(fd);
      } catch {
        // ignore close failure on error path
      }
    }
    try {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    } catch {
      // ignore temp cleanup failure
    }
    throw err;
  }
}

/**
 * Writes content to filePath atomically (mkdir -> optional .bak -> tmp + fsync + close + rename).
 */
export function writeFileAtomic(filePath, content, { encoding = 'utf8', backup = false } = {}) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });

  if (backup && fs.existsSync(filePath)) {
    try {
      const st = fs.lstatSync(filePath);
      if (st.isFile() && !st.isSymbolicLink() && st.size > 0) {
        const existingBuf = fs.readFileSync(filePath);
        if (existingBuf.length > 0) {
          writeBufferAtomic(`${filePath}.bak`, existingBuf);
        }
      }
    } catch {
      // backup failure must not leave corrupted target
    }
  }

  const buf =
    Buffer.isBuffer(content)
      ? content
      : ArrayBuffer.isView(content)
      ? Buffer.from(content.buffer, content.byteOffset, content.byteLength)
      : Buffer.from(String(content ?? ''), encoding);

  writeBufferAtomic(filePath, buf);
  return { filePath, bytes: buf.length, sha256: crypto.createHash('sha256').update(buf).digest('hex') };
}

function attachSchemaVersion(obj, schemaVersion) {
  if (!isPlainObject(obj)) return obj;
  if (schemaVersion === null || schemaVersion === false || schemaVersion === undefined) {
    return obj;
  }
  const { schemaVersion: _prev, ...rest } = obj;
  return { schemaVersion, ...rest };
}

/**
 * Atomically writes JSON (2-space indented + trailing newline), injecting schemaVersion on plain objects.
 */
export function writeJsonAtomic(filePath, data, { schemaVersion = 1, backup = true } = {}) {
  let payload = data;
  if (isPlainObject(data)) {
    payload = attachSchemaVersion(data, schemaVersion);
  }
  const json = `${JSON.stringify(payload, null, 2)}\n`;
  return writeFileAtomic(filePath, json, { encoding: 'utf8', backup });
}

function cloneDefaultData(defaultData, schemaVersion) {
  const raw = typeof defaultData === 'function' ? defaultData() : defaultData;
  if (raw === undefined) return null;
  const cloned = structuredClone(raw);
  if (isPlainObject(cloned) && cloned.schemaVersion === undefined) {
    return attachSchemaVersion(cloned, schemaVersion);
  }
  return cloned;
}

function applyMigration(parsed, schemaVersion, migrate) {
  let result = typeof migrate === 'function' ? migrate(parsed) : parsed;
  if (isPlainObject(result) && result.schemaVersion === undefined) {
    result = attachSchemaVersion(result, schemaVersion);
  }
  return result;
}

function moveToQuarantine(filePath, quarantineDir) {
  const qDir = quarantineDir || path.join(path.dirname(filePath), 'quarantine');
  fs.mkdirSync(qDir, { recursive: true });
  const base = path.basename(filePath);
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  let dest = path.join(qDir, `${base}.corrupted.${ts}`);
  if (fs.existsSync(dest)) {
    dest = path.join(qDir, `${base}.corrupted.${ts}-${Math.random().toString(36).slice(2, 6)}`);
  }

  try {
    fs.renameSync(filePath, dest);
  } catch (err) {
    if (err && err.code === 'EXDEV') {
      fs.copyFileSync(filePath, dest);
      fs.unlinkSync(filePath);
    } else {
      throw err;
    }
  }
  return dest;
}

/**
 * Reads JSON safely with metadata: quarantines corrupted files instead of dropping silently
 * and attempts recovery from `${filePath}.bak`.
 */
export function readJsonWithMeta(
  filePath,
  { defaultData = null, schemaVersion = 1, migrate = null, quarantineDir = null } = {}
) {
  if (!filePath || typeof filePath !== 'string' || !fs.existsSync(filePath)) {
    return {
      data: cloneDefaultData(defaultData, schemaVersion),
      exists: false,
      recovered: false,
      corruptedBackupPath: null,
      error: null,
    };
  }

  let raw = '';
  try {
    const st = fs.lstatSync(filePath);
    if (st.isSymbolicLink() || !st.isFile()) {
      throw httpError(`Arquivo JSON inválido ou symlink não permitido: ${filePath}`, 403);
    }
    raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    const data = applyMigration(parsed, schemaVersion, migrate);
    return {
      data,
      exists: true,
      recovered: false,
      corruptedBackupPath: null,
      error: null,
    };
  } catch (err) {
    if (err && err.statusCode === 403) {
      throw err;
    }

    let corruptedBackupPath = null;
    try {
      if (fs.existsSync(filePath)) {
        corruptedBackupPath = moveToQuarantine(filePath, quarantineDir);
      }
    } catch {
      corruptedBackupPath = null;
    }

    const bakPath = `${filePath}.bak`;
    if (fs.existsSync(bakPath)) {
      try {
        const bakStat = fs.lstatSync(bakPath);
        if (bakStat.isFile() && !bakStat.isSymbolicLink() && bakStat.size > 0) {
          const bakRaw = fs.readFileSync(bakPath, 'utf8');
          const bakParsed = JSON.parse(bakRaw);
          const recoveredData = applyMigration(bakParsed, schemaVersion, migrate);
          const healedJson =
            typeof migrate === 'function' || (isPlainObject(recoveredData) && recoveredData.schemaVersion !== undefined)
              ? `${JSON.stringify(recoveredData, null, 2)}\n`
              : bakRaw;
          writeBufferAtomic(filePath, Buffer.from(healedJson, 'utf8'));
          return {
            data: recoveredData,
            exists: true,
            recovered: true,
            corruptedBackupPath,
            error: err?.message || String(err),
          };
        }
      } catch {
        // .bak also invalid/unreadable; fall through to defaultData
      }
    }

    return {
      data: cloneDefaultData(defaultData, schemaVersion),
      exists: true,
      recovered: false,
      corruptedBackupPath,
      error: err?.message || String(err),
    };
  }
}

export function readJsonSafe(filePath, options = {}) {
  return readJsonWithMeta(filePath, options).data;
}
