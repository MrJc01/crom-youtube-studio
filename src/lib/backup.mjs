import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { assertInsideRoot } from './storage.mjs';

const execFileAsync = promisify(execFile);

function httpError(message, statusCode) {
  return Object.assign(new Error(message), { statusCode });
}

function shouldSkipFileName(name) {
  if (!name) return true;
  if (name === '.DS_Store' || name === 'Thumbs.db') return true;
  if (name.endsWith('.bak')) return true;
  if (/\.tmp($|\.)/i.test(name)) return true;
  if (name.endsWith('.swp') || name.endsWith('.swo') || name.endsWith('~')) return true;
  return false;
}

function copyFilteredTree(srcDir, destDir, wsReal, { filterFile = null, skipDirs = new Set() } = {}) {
  if (!fs.existsSync(srcDir)) return;
  const srcStat = fs.lstatSync(srcDir);
  if (srcStat.isSymbolicLink() || !srcStat.isDirectory()) return;

  assertInsideRoot(wsReal, srcDir);
  fs.mkdirSync(destDir, { recursive: true });

  const entries = fs.readdirSync(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;
    if (shouldSkipFileName(entry.name)) continue;

    const srcFull = path.join(srcDir, entry.name);
    const destFull = path.join(destDir, entry.name);

    if (entry.isDirectory()) {
      if (skipDirs.has(entry.name)) continue;
      copyFilteredTree(srcFull, destFull, wsReal, { filterFile, skipDirs });
    } else if (entry.isFile()) {
      if (filterFile && !filterFile(entry.name, srcFull)) continue;
      assertInsideRoot(wsReal, srcFull, { allowEqual: false });
      fs.mkdirSync(path.dirname(destFull), { recursive: true });
      fs.copyFileSync(srcFull, destFull);
    }
  }
}

function copyMarkdownFilesRecursive(srcDir, destDir, wsReal) {
  if (!fs.existsSync(srcDir)) return;
  const st = fs.lstatSync(srcDir);
  if (st.isSymbolicLink() || !st.isDirectory()) return;

  const SKIP_TOP_AND_SPECIAL = new Set([
    '.git',
    '.roteiro-git',
    '.studio-data',
    'node_modules',
    'studio',
    'gravacoes',
    'quadros',
  ]);

  const entries = fs.readdirSync(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;
    if (entry.name.startsWith('.') || shouldSkipFileName(entry.name)) continue;

    const srcFull = path.join(srcDir, entry.name);
    const destFull = path.join(destDir, entry.name);

    if (entry.isDirectory()) {
      if (SKIP_TOP_AND_SPECIAL.has(entry.name)) continue;
      copyMarkdownFilesRecursive(srcFull, destFull, wsReal);
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
      assertInsideRoot(wsReal, srcFull, { allowEqual: false });
      fs.mkdirSync(path.dirname(destFull), { recursive: true });
      fs.copyFileSync(srcFull, destFull);
    }
  }
}

function stageChannelWorkspace(wsPath, channelStagingDir, { includeRecordings = false } = {}) {
  const wsReal = fs.realpathSync(wsPath);
  fs.mkdirSync(channelStagingDir, { recursive: true });

  // 1. All .md documents across workspace folders
  copyMarkdownFilesRecursive(wsReal, channelStagingDir, wsReal);

  // 2. Excalidraw boards
  const quadrosSrc = path.join(wsReal, 'quadros');
  if (fs.existsSync(quadrosSrc)) {
    copyFilteredTree(quadrosSrc, path.join(channelStagingDir, 'quadros'), wsReal, {
      skipDirs: new Set(['quarantine', 'trash']),
    });
  }

  // 3. .studio-data/*.json only (excludes quarantine/, trash/, *.bak, *.tmp*)
  const studioDataSrc = path.join(wsReal, '.studio-data');
  if (fs.existsSync(studioDataSrc)) {
    const sdStat = fs.lstatSync(studioDataSrc);
    if (!sdStat.isSymbolicLink() && sdStat.isDirectory()) {
      const studioDataDest = path.join(channelStagingDir, '.studio-data');
      fs.mkdirSync(studioDataDest, { recursive: true });
      for (const entry of fs.readdirSync(studioDataSrc, { withFileTypes: true })) {
        if (entry.isSymbolicLink() || !entry.isFile()) continue;
        if (shouldSkipFileName(entry.name)) continue;
        if (!entry.name.toLowerCase().endsWith('.json')) continue;
        const srcFull = path.join(studioDataSrc, entry.name);
        assertInsideRoot(wsReal, srcFull, { allowEqual: false });
        fs.copyFileSync(srcFull, path.join(studioDataDest, entry.name));
      }
    }
  }

  // 4. .roteiro-git/
  const gitSrc = path.join(wsReal, '.roteiro-git');
  if (fs.existsSync(gitSrc)) {
    copyFilteredTree(gitSrc, path.join(channelStagingDir, '.roteiro-git'), wsReal, {
      skipDirs: new Set(['quarantine', 'trash']),
    });
  }

  // 5. gravacoes/ (only when requested)
  if (includeRecordings) {
    const recSrc = path.join(wsReal, 'gravacoes');
    if (fs.existsSync(recSrc)) {
      copyFilteredTree(recSrc, path.join(channelStagingDir, 'gravacoes'), wsReal);
    }
  }
}

/**
 * Creates a portable `.tar.gz` backup archive preserving `<channelKey>/...` layout.
 */
export async function createBackupArchive(
  config,
  { channel = 'all', includeRecordings = false, outputPath = '' } = {}
) {
  if (!config || typeof config !== 'object' || !config.channels) {
    throw httpError('Configuração inválida para geração de backup.', 400);
  }

  const rawChan = String(channel || 'all').trim().toLowerCase();
  const targetKeys =
    !rawChan || rawChan === 'all'
      ? [...(config.channelOrder || Object.keys(config.channels))]
      : [rawChan];

  if (targetKeys.length === 0) {
    throw httpError('Nenhum workspace configurado para backup.', 400);
  }

  for (const key of targetKeys) {
    const ch = config.channels[key];
    if (!ch) {
      throw httpError(`Canal inválido para backup: "${key}"`, 400);
    }
    if (!ch.workspacePath || !fs.existsSync(ch.workspacePath)) {
      throw httpError(`Workspace do canal "${key}" não encontrado no disco.`, 404);
    }
  }

  const createdAt = new Date().toISOString();
  const stamp = createdAt.slice(0, 19).replace(/[:T]/g, '-');
  const label = targetKeys.length === 1 ? targetKeys[0] : 'all';
  const defaultFileName = `crom-studio-backup-${label}-${stamp}.tar.gz`;

  let archivePath;
  let fileName;
  if (outputPath && typeof outputPath === 'string' && outputPath.trim()) {
    archivePath = path.resolve(outputPath.trim());
    fs.mkdirSync(path.dirname(archivePath), { recursive: true });
    fileName = path.basename(archivePath);
  } else {
    const uniq = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    archivePath = path.join(os.tmpdir(), `${uniq}-${defaultFileName}`);
    fileName = defaultFileName;
  }

  const stagingDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crom-studio-backup-stage-'));
  try {
    for (const key of targetKeys) {
      const wsPath = config.channels[key].workspacePath;
      stageChannelWorkspace(wsPath, path.join(stagingDir, key), {
        includeRecordings: Boolean(includeRecordings),
      });
    }

    await execFileAsync('tar', ['-czf', archivePath, '-C', stagingDir, ...targetKeys], {
      timeout: 180000,
    });

    const stat = fs.statSync(archivePath);
    return {
      ok: true,
      archivePath,
      fileName,
      size: stat.size,
      channels: targetKeys,
      includeRecordings: Boolean(includeRecordings),
      createdAt,
    };
  } catch (err) {
    try {
      if (fs.existsSync(archivePath) && !outputPath) {
        fs.unlinkSync(archivePath);
      }
    } catch {
      // ignore cleanup error
    }
    if (err && err.code === 'ENOENT') {
      throw httpError('Utilitário "tar" não encontrado no sistema para criar backup.', 503);
    }
    throw err;
  } finally {
    try {
      fs.rmSync(stagingDir, { recursive: true, force: true });
    } catch {
      // ignore staging cleanup error
    }
  }
}
