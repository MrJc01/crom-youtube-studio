import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  assertInsideRoot,
  readJsonSafe,
  writeFileAtomic,
  writeJsonAtomic,
} from './lib/storage.mjs';

export const GIT_DIR_NAME = '.roteiro-git';

function slugify(text) {
  return (
    String(text || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || ''
  );
}

function sha256(text) {
  return crypto.createHash('sha256').update(String(text || ''), 'utf8').digest('hex');
}

function normalizeNewlines(text) {
  return String(text || '').replace(/\r\n/g, '\n');
}

function countWords(rawText) {
  const norm = normalizeNewlines(rawText);
  let body = norm;
  if (norm.startsWith('---\n')) {
    const endIdx = norm.indexOf('\n---\n', 4);
    if (endIdx !== -1) body = norm.slice(endIdx + 5);
  }
  return body
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[#>*_~`|[\]-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean).length;
}

export function getDocKey(relPath) {
  const norm = String(relPath || '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .trim();
  if (!norm || norm.includes('\0')) {
    throw Object.assign(new Error('Caminho inválido para versionamento'), { statusCode: 400 });
  }
  const parts = norm.split('/');
  if (parts.some((p) => !p || p === '.' || p === '..' || p.startsWith('.'))) {
    throw Object.assign(new Error('Segmento proibido no caminho do roteiro'), { statusCode: 403 });
  }
  const withoutExt = norm.replace(/\.md$/i, '');
  return withoutExt.replace(/\//g, '__');
}

export function getDocGitDir(workspaceRoot, relPath) {
  const rootReal = fs.realpathSync(workspaceRoot);
  const docKey = getDocKey(relPath);
  const baseGit = path.join(rootReal, GIT_DIR_NAME);
  const docDir = assertInsideRoot(baseGit, path.resolve(baseGit, docKey), {
    allowEqual: false,
    message: 'Diretório de histórico inválido',
  });
  return { rootReal, docKey, baseGit, docDir };
}

function getMainMdAbs(workspaceRoot, relPath) {
  const rootReal = fs.realpathSync(workspaceRoot);
  const norm = String(relPath || '').replace(/\\/g, '/').replace(/^\/+/, '').trim();
  const abs = assertInsideRoot(rootReal, path.resolve(rootReal, norm), {
    allowEqual: false,
    message: 'Caminho fora do workspace',
  });
  return { rootReal, norm, abs };
}

function normalizeVersionName(name, { allowPrincipal = true } = {}) {
  const raw = String(name || '').trim().toLowerCase();
  if (!raw || raw === 'principal') {
    if (!allowPrincipal) {
      throw Object.assign(new Error('O nome "principal" é reservado para a linha principal'), { statusCode: 400 });
    }
    return 'principal';
  }
  const slug = slugify(raw);
  if (!slug || slug === 'principal') {
    throw Object.assign(new Error('Nome de versão inválido'), { statusCode: 400 });
  }
  return slug;
}

function formatRevId(num) {
  return `r${String(num).padStart(3, '0')}`;
}

function getQuarantineDirFromDocDir(docDir) {
  const wsReal = path.dirname(path.dirname(docDir));
  return path.join(wsReal, '.studio-data', 'quarantine');
}

function readIndex(docDir) {
  const idxPath = path.join(docDir, 'index.json');
  if (!fs.existsSync(idxPath)) return null;
  return readJsonSafe(idxPath, {
    defaultData: null,
    schemaVersion: 1,
    quarantineDir: getQuarantineDirFromDocDir(docDir),
  });
}

function writeIndex(docDir, index) {
  fs.mkdirSync(path.join(docDir, 'revisoes'), { recursive: true });
  fs.mkdirSync(path.join(docDir, 'versoes'), { recursive: true });
  writeJsonAtomic(path.join(docDir, 'index.json'), index, {
    schemaVersion: 1,
    backup: true,
  });
}

function writeRevSnapshot(docDir, revId, content) {
  const revDir = path.join(docDir, 'revisoes');
  fs.mkdirSync(revDir, { recursive: true });
  writeFileAtomic(path.join(revDir, `${revId}.md`), content, {
    encoding: 'utf8',
    backup: false,
  });
}

function readRevSnapshot(docDir, revId) {
  if (!/^r\d{3,}$/.test(String(revId || ''))) {
    throw Object.assign(new Error(`Revisão inválida: ${revId}`), { statusCode: 400 });
  }
  const revPath = path.join(docDir, 'revisoes', `${revId}.md`);
  if (!fs.existsSync(revPath)) {
    throw Object.assign(new Error(`Snapshot ${revId} não encontrado`), { statusCode: 404 });
  }
  return fs.readFileSync(revPath, 'utf8');
}

function writeVariantFile(docDir, versionName, content) {
  const verDir = path.join(docDir, 'versoes');
  fs.mkdirSync(verDir, { recursive: true });
  writeFileAtomic(path.join(verDir, `${versionName}.md`), content, {
    encoding: 'utf8',
    backup: false,
  });
}

function readVariantFile(docDir, versionName) {
  const verPath = path.join(docDir, 'versoes', `${versionName}.md`);
  if (!fs.existsSync(verPath)) {
    throw Object.assign(new Error(`Versão alternativa "${versionName}" não encontrada`), { statusCode: 404 });
  }
  return fs.readFileSync(verPath, 'utf8');
}

/**
 * Diff linha a linha puro JavaScript (LCS no miolo após trim de prefixo/sufixo comum).
 */
export function computeLineDiff(oldText, newText) {
  const a = normalizeNewlines(oldText).split('\n');
  const b = normalizeNewlines(newText).split('\n');

  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) {
    start += 1;
  }

  let endA = a.length - 1;
  let endB = b.length - 1;
  while (endA >= start && endB >= start && a[endA] === b[endB]) {
    endA -= 1;
    endB -= 1;
  }

  const lines = [];
  for (let i = 0; i < start; i++) {
    lines.push({ type: 'same', oldLine: i + 1, newLine: i + 1, text: a[i] });
  }

  const midA = a.slice(start, endA + 1);
  const midB = b.slice(start, endB + 1);
  const m = midA.length;
  const n = midB.length;

  let added = 0;
  let removed = 0;

  if (m === 0 && n === 0) {
    // Sem mudanças no miolo
  } else if (m * n <= 250000) {
    const cols = n + 1;
    const dp = new Int32Array((m + 1) * cols);
    for (let i = m - 1; i >= 0; i--) {
      const rowOffset = i * cols;
      const nextRowOffset = (i + 1) * cols;
      for (let j = n - 1; j >= 0; j--) {
        if (midA[i] === midB[j]) {
          dp[rowOffset + j] = dp[nextRowOffset + j + 1] + 1;
        } else {
          const down = dp[nextRowOffset + j];
          const right = dp[rowOffset + j + 1];
          dp[rowOffset + j] = down >= right ? down : right;
        }
      }
    }

    let i = 0;
    let j = 0;
    while (i < m && j < n) {
      if (midA[i] === midB[j]) {
        lines.push({
          type: 'same',
          oldLine: start + i + 1,
          newLine: start + j + 1,
          text: midA[i],
        });
        i += 1;
        j += 1;
      } else if (dp[(i + 1) * cols + j] >= dp[i * cols + j + 1]) {
        lines.push({ type: 'del', oldLine: start + i + 1, newLine: null, text: midA[i] });
        removed += 1;
        i += 1;
      } else {
        lines.push({ type: 'add', oldLine: null, newLine: start + j + 1, text: midB[j] });
        added += 1;
        j += 1;
      }
    }
    while (i < m) {
      lines.push({ type: 'del', oldLine: start + i + 1, newLine: null, text: midA[i] });
      removed += 1;
      i += 1;
    }
    while (j < n) {
      lines.push({ type: 'add', oldLine: null, newLine: start + j + 1, text: midB[j] });
      added += 1;
      j += 1;
    }
  } else {
    // Fallback para arquivos muito grandes (> ~500 linhas alteradas no miolo)
    for (let i = 0; i < m; i++) {
      lines.push({ type: 'del', oldLine: start + i + 1, newLine: null, text: midA[i] });
      removed += 1;
    }
    for (let j = 0; j < n; j++) {
      lines.push({ type: 'add', oldLine: null, newLine: start + j + 1, text: midB[j] });
      added += 1;
    }
  }

  for (let i = endA + 1, j = endB + 1; i < a.length && j < b.length; i++, j++) {
    lines.push({ type: 'same', oldLine: i + 1, newLine: j + 1, text: a[i] });
  }

  return {
    added,
    removed,
    unchanged: lines.filter((l) => l.type === 'same').length,
    lines,
  };
}

function appendRevisionRecord(index, docDir, { version, kind, message, author, content, parentRev = null, prevContent = '' }) {
  const revNum = Number(index.nextRev || 1);
  const revId = formatRevId(revNum);
  index.nextRev = revNum + 1;

  const now = new Date().toISOString();
  const normContent = normalizeNewlines(content);
  const hash = sha256(normContent);
  const diffStats = prevContent !== null && prevContent !== undefined
    ? computeLineDiff(prevContent, normContent)
    : { added: normContent.split('\n').length, removed: 0 };

  writeRevSnapshot(docDir, revId, normContent);

  const record = {
    id: revId,
    parentRev,
    version,
    kind,
    message: String(message || '').trim() || `Revisão ${revId}`,
    author: String(author || 'MrJ').trim() || 'MrJ',
    createdAt: now,
    hash,
    added: diffStats.added,
    removed: diffStats.removed,
    words: countWords(normContent),
  };

  index.revisions.push(record);
  if (index.versions[version]) {
    index.versions[version].headRev = revId;
    index.versions[version].hash = hash;
    index.versions[version].updatedAt = now;
  }

  return { record, normContent, hash, now };
}

/**
 * Garante que o arquivo atual em disco possui histórico sincronizado antes de qualquer alteração.
 * Se o .md principal foi editado manualmente fora do sistema, cria um snapshot de resgate automático.
 */
export function ensureSyncedBaseline(workspaceRoot, relPath, { author = 'Sistema' } = {}) {
  const { docKey, docDir } = getDocGitDir(workspaceRoot, relPath);
  const { norm, abs } = getMainMdAbs(workspaceRoot, relPath);
  const diskExists = fs.existsSync(abs);
  const diskContent = diskExists ? normalizeNewlines(fs.readFileSync(abs, 'utf8')) : '';

  let index = readIndex(docDir);
  const now = new Date().toISOString();

  if (!index) {
    index = {
      docPath: norm,
      docKey,
      activeVersion: 'principal',
      nextRev: 1,
      versions: {
        principal: {
          name: 'principal',
          description: 'Arquivo .md principal no workspace',
          baseVersion: null,
          baseRev: null,
          createdAt: now,
          updatedAt: now,
          headRev: null,
          hash: '',
          isPrimary: true,
        },
      },
      revisions: [],
    };

    if (diskExists) {
      appendRevisionRecord(index, docDir, {
        version: 'principal',
        kind: 'init',
        message: 'Snapshot inicial automático (versão em disco)',
        author,
        content: diskContent,
        parentRev: null,
        prevContent: '',
      });
    }
    writeIndex(docDir, index);
    return { index, docDir, mainAbs: abs, rel: norm };
  }

  // Se o .md principal mudou externamente desde a última revisão gravada, cria snapshot automático
  if (diskExists) {
    const diskHash = sha256(diskContent);
    const primaryMeta = index.versions.principal;
    if (!primaryMeta || primaryMeta.hash !== diskHash) {
      const parentRev = primaryMeta?.headRev || null;
      const prevContent = parentRev ? readRevSnapshot(docDir, parentRev) : '';
      if (!primaryMeta) {
        index.versions.principal = {
          name: 'principal',
          description: 'Arquivo .md principal no workspace',
          baseVersion: null,
          baseRev: null,
          createdAt: now,
          updatedAt: now,
          headRev: null,
          hash: '',
          isPrimary: true,
        };
      }
      appendRevisionRecord(index, docDir, {
        version: 'principal',
        kind: 'sync',
        message: 'Snapshot automático de alteração externa em disco',
        author,
        content: diskContent,
        parentRev,
        prevContent,
      });
      writeIndex(docDir, index);
    }
  }

  return { index, docDir, mainAbs: abs, rel: norm };
}

/**
 * Resumo leve para indexação no sync.mjs (não cria pastas .roteiro-git se ainda não existem).
 */
export function getVersioningSummary(workspaceRoot, relPath) {
  try {
    const { docDir } = getDocGitDir(workspaceRoot, relPath);
    const index = readIndex(docDir);
    if (!index) {
      return {
        initialized: false,
        totalRevisions: 0,
        versionsCount: 1,
        versions: ['principal'],
        headRev: null,
        lastCommitMessage: '',
        lastCommitAt: '',
      };
    }
    const lastRev = index.revisions[index.revisions.length - 1] || null;
    const versions = Object.keys(index.versions || { principal: true });
    return {
      initialized: true,
      totalRevisions: index.revisions.length,
      versionsCount: versions.length,
      versions,
      headRev: index.versions.principal?.headRev || lastRev?.id || null,
      lastCommitMessage: lastRev?.message || '',
      lastCommitAt: lastRev?.createdAt || '',
    };
  } catch {
    return {
      initialized: false,
      totalRevisions: 0,
      versionsCount: 1,
      versions: ['principal'],
      headRev: null,
      lastCommitMessage: '',
      lastCommitAt: '',
    };
  }
}

export function getHistory(workspaceRoot, relPath) {
  const { docKey, docDir } = getDocGitDir(workspaceRoot, relPath);
  const { norm, abs } = getMainMdAbs(workspaceRoot, relPath);
  if (!fs.existsSync(abs)) {
    throw Object.assign(new Error(`Arquivo não encontrado: ${norm}`), { statusCode: 404 });
  }

  const diskContent = normalizeNewlines(fs.readFileSync(abs, 'utf8'));
  const index = readIndex(docDir);

  if (!index) {
    const now = fs.statSync(abs).mtime.toISOString();
    return {
      docPath: norm,
      docKey,
      initialized: false,
      versions: [
        {
          name: 'principal',
          description: 'Arquivo .md principal no workspace',
          baseVersion: null,
          baseRev: null,
          createdAt: now,
          updatedAt: now,
          headRev: 'disk',
          hash: sha256(diskContent),
          isPrimary: true,
          words: countWords(diskContent),
        },
      ],
      revisions: [
        {
          id: 'disk',
          parentRev: null,
          version: 'principal',
          kind: 'init',
          message: 'Estado atual em disco (ainda sem histórico gravado)',
          author: 'Disco',
          createdAt: now,
          hash: sha256(diskContent),
          added: diskContent.split('\n').length,
          removed: 0,
          words: countWords(diskContent),
        },
      ],
    };
  }

  const diskHash = sha256(diskContent);
  const outVersions = Object.values(index.versions || {}).map((v) => {
    let words = 0;
    try {
      const content = v.isPrimary ? diskContent : readVariantFile(docDir, v.name);
      words = countWords(content);
    } catch {
      words = 0;
    }
    return {
      ...v,
      dirtyExternal: Boolean(v.isPrimary && v.hash && v.hash !== diskHash),
      words,
    };
  });

  return {
    docPath: index.docPath || norm,
    docKey,
    initialized: true,
    versions: outVersions,
    revisions: [...(index.revisions || [])].reverse(),
  };
}

export function readRefContent(workspaceRoot, relPath, ref = 'ver:principal') {
  const { docDir } = getDocGitDir(workspaceRoot, relPath);
  const { abs } = getMainMdAbs(workspaceRoot, relPath);
  const rawRef = String(ref || 'ver:principal').trim();

  if (rawRef === 'disk' || rawRef === 'rev:disk' || rawRef === 'ver:principal') {
    if (rawRef === 'ver:principal' || rawRef === 'disk' || rawRef === 'rev:disk') {
      if (!fs.existsSync(abs)) {
        throw Object.assign(new Error(`Arquivo não encontrado: ${relPath}`), { statusCode: 404 });
      }
      return {
        ref: rawRef,
        content: normalizeNewlines(fs.readFileSync(abs, 'utf8')),
      };
    }
  }

  if (rawRef.startsWith('rev:')) {
    const revId = rawRef.slice(4).trim();
    return {
      ref: rawRef,
      content: readRevSnapshot(docDir, revId),
    };
  }

  if (/^r\d{3,}$/.test(rawRef)) {
    return {
      ref: `rev:${rawRef}`,
      content: readRevSnapshot(docDir, rawRef),
    };
  }

  const verName = rawRef.startsWith('ver:') ? rawRef.slice(4).trim() : rawRef;
  const safeVer = normalizeVersionName(verName);
  if (safeVer === 'principal') {
    if (!fs.existsSync(abs)) {
      throw Object.assign(new Error(`Arquivo não encontrado: ${relPath}`), { statusCode: 404 });
    }
    return {
      ref: 'ver:principal',
      content: normalizeNewlines(fs.readFileSync(abs, 'utf8')),
    };
  }

  const index = readIndex(docDir);
  if (!index || !index.versions?.[safeVer]) {
    throw Object.assign(new Error(`Versão "${safeVer}" não existe para este roteiro`), { statusCode: 404 });
  }
  return {
    ref: `ver:${safeVer}`,
    content: readVariantFile(docDir, safeVer),
  };
}

/**
 * Dinâmica 1: Registra nova revisão (commit) em uma linha/versão existente ('principal' ou variante).
 */
export function commitRevision(workspaceRoot, relPath, { content, version = 'principal', message = '', author = 'MrJ', kind = 'commit' }) {
  const safeVer = normalizeVersionName(version);
  const normContent = normalizeNewlines(content);
  const { abs } = getMainMdAbs(workspaceRoot, relPath);

  if (kind === 'init' && !fs.existsSync(abs)) {
    writeFileAtomic(abs, normContent, { encoding: 'utf8', backup: false });
    const baseline = ensureSyncedBaseline(workspaceRoot, relPath, { author });
    // Atualiza mensagem/kind da r001 caso informados
    if (baseline.index.revisions.length === 1) {
      baseline.index.revisions[0].message = String(message || 'Criação do roteiro').trim();
      baseline.index.revisions[0].author = String(author || 'MrJ').trim();
      baseline.index.revisions[0].kind = 'init';
      writeIndex(baseline.docDir, baseline.index);
    }
    return {
      ok: true,
      version: 'principal',
      revision: baseline.index.revisions[0],
      history: getHistory(workspaceRoot, relPath),
    };
  }

  const { index, docDir, mainAbs } = ensureSyncedBaseline(workspaceRoot, relPath, { author });
  const verMeta = index.versions?.[safeVer];
  if (!verMeta) {
    throw Object.assign(new Error(`Versão "${safeVer}" não encontrada. Use nova-versao para criá-la primeiro.`), {
      statusCode: 404,
    });
  }

  const prevContent = verMeta.headRev
    ? readRevSnapshot(docDir, verMeta.headRev)
    : safeVer === 'principal' && fs.existsSync(mainAbs)
      ? fs.readFileSync(mainAbs, 'utf8')
      : '';

  const newHash = sha256(normContent);
  if (verMeta.hash === newHash && verMeta.headRev) {
    return {
      ok: true,
      unchanged: true,
      version: safeVer,
      revision: index.revisions.find((r) => r.id === verMeta.headRev) || index.revisions[index.revisions.length - 1],
      history: getHistory(workspaceRoot, relPath),
    };
  }

  if (safeVer === 'principal') {
    writeFileAtomic(mainAbs, normContent, { encoding: 'utf8', backup: false });
  } else {
    writeVariantFile(docDir, safeVer, normContent);
  }

  const { record } = appendRevisionRecord(index, docDir, {
    version: safeVer,
    kind,
    message: message || `Atualização na versão ${safeVer}`,
    author,
    content: normContent,
    parentRev: verMeta.headRev || null,
    prevContent,
  });

  writeIndex(docDir, index);
  return {
    ok: true,
    unchanged: false,
    version: safeVer,
    revision: record,
    history: getHistory(workspaceRoot, relPath),
  };
}

/**
 * Dinâmica 2: Cria uma nova versão alternativa (variante/branch) sem alterar a versão principal.
 */
export function createVersion(
  workspaceRoot,
  relPath,
  { name, description = '', fromVersion = 'principal', fromRev = null, content = null, author = 'MrJ', message = '' }
) {
  const safeName = normalizeVersionName(name, { allowPrincipal: false });
  const { index, docDir } = ensureSyncedBaseline(workspaceRoot, relPath, { author });

  if (index.versions[safeName]) {
    throw Object.assign(new Error(`Já existe uma versão chamada "${safeName}" neste roteiro`), { statusCode: 409 });
  }

  let baseRef = fromRev ? `rev:${fromRev}` : `ver:${normalizeVersionName(fromVersion)}`;
  const baseData = readRefContent(workspaceRoot, relPath, baseRef);
  const initialContent = content !== null && content !== undefined ? normalizeNewlines(content) : baseData.content;

  const baseVerName = fromRev ? 'principal' : normalizeVersionName(fromVersion);
  const baseRevId = fromRev || index.versions[baseVerName]?.headRev || null;
  const now = new Date().toISOString();

  index.versions[safeName] = {
    name: safeName,
    description: String(description || '').trim(),
    baseVersion: baseVerName,
    baseRev: baseRevId,
    createdAt: now,
    updatedAt: now,
    headRev: null,
    hash: '',
    isPrimary: false,
  };

  writeVariantFile(docDir, safeName, initialContent);

  const { record } = appendRevisionRecord(index, docDir, {
    version: safeName,
    kind: 'branch',
    message: message || `Nova versão "${safeName}" criada a partir de ${fromRev || baseVerName}`,
    author,
    content: initialContent,
    parentRev: baseRevId,
    prevContent: baseData.content,
  });

  writeIndex(docDir, index);
  return {
    ok: true,
    version: index.versions[safeName],
    revision: record,
    content: initialContent,
    history: getHistory(workspaceRoot, relPath),
  };
}

/**
 * Restaura uma revisão histórica (rNNN) criando um novo commit append-only na versão alvo.
 */
export function restoreRevision(
  workspaceRoot,
  relPath,
  { revId, targetVersion = 'principal', author = 'MrJ', message = '' }
) {
  const safeVer = normalizeVersionName(targetVersion);
  const { index, docDir, mainAbs } = ensureSyncedBaseline(workspaceRoot, relPath, { author });
  const targetMeta = index.versions?.[safeVer];
  if (!targetMeta) {
    throw Object.assign(new Error(`Versão alvo "${safeVer}" não encontrada`), { statusCode: 404 });
  }

  const snapshotContent = readRevSnapshot(docDir, revId);
  const prevContent = targetMeta.headRev ? readRevSnapshot(docDir, targetMeta.headRev) : '';

  if (safeVer === 'principal') {
    writeFileAtomic(mainAbs, snapshotContent, { encoding: 'utf8', backup: false });
  } else {
    writeVariantFile(docDir, safeVer, snapshotContent);
  }

  const { record } = appendRevisionRecord(index, docDir, {
    version: safeVer,
    kind: 'restore',
    message: message || `Restaurado de ${revId} para "${safeVer}"`,
    author,
    content: snapshotContent,
    parentRev: targetMeta.headRev || null,
    prevContent,
  });

  writeIndex(docDir, index);
  return {
    ok: true,
    version: safeVer,
    revision: record,
    content: snapshotContent,
    history: getHistory(workspaceRoot, relPath),
  };
}

/**
 * Promove uma versão alternativa para o arquivo .md principal, preservando histórico anterior.
 */
export function promoteVersion(workspaceRoot, relPath, { versionName, author = 'MrJ', message = '' }) {
  const safeVer = normalizeVersionName(versionName, { allowPrincipal: false });
  const { index, docDir, mainAbs } = ensureSyncedBaseline(workspaceRoot, relPath, { author });

  if (!index.versions?.[safeVer]) {
    throw Object.assign(new Error(`Versão "${safeVer}" não encontrada`), { statusCode: 404 });
  }

  const variantContent = readVariantFile(docDir, safeVer);
  const primaryMeta = index.versions.principal;
  const prevContent = primaryMeta?.headRev ? readRevSnapshot(docDir, primaryMeta.headRev) : '';

  writeFileAtomic(mainAbs, variantContent, { encoding: 'utf8', backup: false });

  const { record } = appendRevisionRecord(index, docDir, {
    version: 'principal',
    kind: 'promote',
    message: message || `Promovida a versão "${safeVer}" para principal`,
    author,
    content: variantContent,
    parentRev: primaryMeta?.headRev || null,
    prevContent,
  });

  writeIndex(docDir, index);
  return {
    ok: true,
    version: 'principal',
    promotedFrom: safeVer,
    revision: record,
    content: variantContent,
    history: getHistory(workspaceRoot, relPath),
  };
}

export function deleteVersion(workspaceRoot, relPath, { versionName }) {
  const safeVer = normalizeVersionName(versionName, { allowPrincipal: false });
  const { docDir } = getDocGitDir(workspaceRoot, relPath);
  const index = readIndex(docDir);
  if (!index || !index.versions?.[safeVer]) {
    throw Object.assign(new Error(`Versão "${safeVer}" não encontrada`), { statusCode: 404 });
  }
  delete index.versions[safeVer];
  const verFile = path.join(docDir, 'versoes', `${safeVer}.md`);
  if (fs.existsSync(verFile)) fs.unlinkSync(verFile);
  writeIndex(docDir, index);
  return {
    ok: true,
    deletedVersion: safeVer,
    history: getHistory(workspaceRoot, relPath),
  };
}

export function diffTargets(workspaceRoot, relPath, { from, to }) {
  const left = readRefContent(workspaceRoot, relPath, from);
  const right = readRefContent(workspaceRoot, relPath, to);
  const diff = computeLineDiff(left.content, right.content);
  return {
    from: left.ref,
    to: right.ref,
    ...diff,
  };
}

export function migrateDocHistory(workspaceRoot, oldRelPath, newRelPath) {
  const oldInfo = getDocGitDir(workspaceRoot, oldRelPath);
  const newInfo = getDocGitDir(workspaceRoot, newRelPath);
  if (!fs.existsSync(oldInfo.docDir) || oldInfo.docDir === newInfo.docDir) {
    return false;
  }
  fs.mkdirSync(path.dirname(newInfo.docDir), { recursive: true });
  if (fs.existsSync(newInfo.docDir)) {
    fs.rmSync(newInfo.docDir, { recursive: true, force: true });
  }
  fs.renameSync(oldInfo.docDir, newInfo.docDir);
  const idx = readIndex(newInfo.docDir);
  if (idx) {
    idx.docPath = newRelPath;
    idx.docKey = newInfo.docKey;
    writeIndex(newInfo.docDir, idx);
  }
  return true;
}

export function deleteDocHistory(workspaceRoot, relPath) {
  try {
    const { docDir } = getDocGitDir(workspaceRoot, relPath);
    if (fs.existsSync(docDir)) {
      fs.rmSync(docDir, { recursive: true, force: true });
      return true;
    }
  } catch {
    // ignora
  }
  return false;
}
