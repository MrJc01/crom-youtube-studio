import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { REPO_ROOT, loadConfig } from '../config.mjs';
import { resolveFfmpegPath } from '../recordings.mjs';
import { resolveNgrokPath } from '../remote-access.mjs';
import { parseFrontmatter } from '../sync.mjs';
import { discoverTtsEnvironment } from '../tts.mjs';

const execFileAsync = promisify(execFile);

const IGNORED_MD_DIRS = new Set(['studio', '.git', 'node_modules', 'gravacoes', 'quadros']);

function walkMarkdownFilesForDoctor(dir, relBase = '') {
  if (!dir || !fs.existsSync(dir)) return [];
  let st;
  try {
    st = fs.lstatSync(dir);
  } catch {
    return [];
  }
  if (st.isSymbolicLink() || !st.isDirectory()) return [];

  const results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

  for (const entry of entries) {
    if (entry.isSymbolicLink() || entry.name.startsWith('.')) continue;
    const fullPath = path.join(dir, entry.name);
    const relPath = relBase ? `${relBase}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (IGNORED_MD_DIRS.has(entry.name)) continue;
      results.push(...walkMarkdownFilesForDoctor(fullPath, relPath));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
      results.push({ fullPath, relPath });
    }
  }
  return results;
}

function validateMarkdownFrontmatter(raw) {
  const norm = String(raw || '').replace(/\r\n/g, '\n');
  if (!norm.startsWith('---\n')) {
    return {
      syntaxError: null,
      missingFields: ['frontmatter', 'id', 'titulo', 'status'],
      meta: {},
    };
  }

  const endIdx = norm.indexOf('\n---\n', 4);
  const altEndIdx =
    endIdx === -1 && norm.endsWith('\n---') ? norm.length - 4 : endIdx;

  if (altEndIdx === -1) {
    return {
      syntaxError: 'Bloco frontmatter YAML não fechado (falta "---" final)',
      missingFields: ['id', 'titulo', 'status'],
      meta: {},
    };
  }

  const yamlBlock = norm.slice(4, altEndIdx);
  for (const line of yamlBlock.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    if (!trimmed.includes(':') && !trimmed.startsWith('-')) {
      return {
        syntaxError: `Linha YAML inválida no frontmatter: "${trimmed.slice(0, 60)}"`,
        missingFields: [],
        meta: {},
      };
    }
  }

  const { meta } = parseFrontmatter(norm);
  const missingFields = [];
  if (!meta.id || String(meta.id).trim() === '') missingFields.push('id');
  if (!meta.titulo || String(meta.titulo).trim() === '') missingFields.push('titulo');
  if (!meta.status || String(meta.status).trim() === '') missingFields.push('status');

  return {
    syntaxError: null,
    missingFields,
    meta,
  };
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

async function resolveBinaryPath(name) {
  const candidates = [
    path.join(os.homedir(), '.local', 'bin', name),
    `/usr/local/bin/${name}`,
    `/usr/bin/${name}`,
    `/bin/${name}`,
  ];
  for (const cand of candidates) {
    if (isExecutableFile(cand)) return cand;
  }
  try {
    const { stdout } = await execFileAsync('which', [name], { timeout: 2000 });
    const found = stdout.split(/\r?\n/)[0]?.trim() || '';
    if (isExecutableFile(found)) return found;
  } catch {
    // not found in PATH
  }
  return null;
}

function formatBytesHuman(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

async function checkDiskFree(targetPath) {
  const probe = targetPath && fs.existsSync(targetPath) ? targetPath : REPO_ROOT;
  try {
    const { stdout } = await execFileAsync('df', ['-Pk', probe], { timeout: 5000 });
    const lines = stdout.trim().split(/\r?\n/);
    if (lines.length >= 2) {
      const cols = lines[lines.length - 1].trim().split(/\s+/);
      const totalKb = Number(cols[1]);
      const usedKb = Number(cols[2]);
      const availKb = Number(cols[3]);
      const capacity = cols[4] || '';
      const mount = cols.slice(5).join(' ') || '/';
      if (Number.isFinite(availKb)) {
        const freeBytes = availKb * 1024;
        return {
          ok: true,
          filesystem: cols[0] || '',
          totalKb,
          usedKb,
          freeKb: availKb,
          freeBytes,
          freeHuman: formatBytesHuman(freeBytes),
          capacity,
          mount,
        };
      }
    }
  } catch (err) {
    return { ok: false, error: err?.message || String(err), freeBytes: 0, freeKb: 0, freeHuman: '?' };
  }
  return { ok: false, error: 'Saída inesperada do comando df', freeBytes: 0, freeKb: 0, freeHuman: '?' };
}

function listFilesSafe(dirPath) {
  if (!dirPath || !fs.existsSync(dirPath)) return [];
  try {
    const st = fs.lstatSync(dirPath);
    if (st.isSymbolicLink() || !st.isDirectory()) return [];
    return fs
      .readdirSync(dirPath, { withFileTypes: true })
      .filter((e) => e.isFile() && !e.isSymbolicLink() && !e.name.startsWith('.'))
      .map((e) => e.name);
  } catch {
    return [];
  }
}

/**
 * Runs diagnostic health checks across all configured workspaces, JSON/YAML files,
 * quarantine/trash counts, Kdenlive link, system binaries, and disk space.
 */
export async function runDoctor(passedConfig = null) {
  const config = passedConfig || loadConfig();
  const checks = [];
  const channels = {};

  function addCheck(check) {
    checks.push(check);
  }

  for (const key of config.channelOrder || []) {
    const ch = config.channels[key];
    if (!ch) continue;
    const wsPath = ch.workspacePath || '';
    const exists = Boolean(wsPath && fs.existsSync(wsPath));

    const channelReport = {
      key,
      name: ch.name || key,
      workspacePath: wsPath,
      exists,
      markdownCount: 0,
      markdownIssues: [],
      jsonCount: 0,
      jsonIssues: [],
      quarantineCount: 0,
      quarantineFiles: [],
      trashCount: 0,
      kdenliveSymlink: null,
    };

    if (!exists) {
      addCheck({
        id: `ws-${key}-missing`,
        category: 'workspace',
        channel: key,
        level: 'error',
        title: `Workspace "${key}" ausente`,
        message: `Diretório não encontrado: ${wsPath || '(vazio)'}`,
      });
      channels[key] = channelReport;
      continue;
    }

    // 1. Check all .md files (YAML validity + required fields)
    const mdFiles = walkMarkdownFilesForDoctor(wsPath);
    channelReport.markdownCount = mdFiles.length;
    const mdSyntaxErrors = [];
    const mdFieldWarnings = [];

    for (const f of mdFiles) {
      try {
        const raw = fs.readFileSync(f.fullPath, 'utf8');
        const res = validateMarkdownFrontmatter(raw);
        if (res.syntaxError) {
          mdSyntaxErrors.push({ path: f.relPath, reason: res.syntaxError });
          channelReport.markdownIssues.push({ path: f.relPath, level: 'error', reason: res.syntaxError });
        } else if (res.missingFields.length > 0) {
          const reason = `Campos ausentes: ${res.missingFields.join(', ')}`;
          mdFieldWarnings.push({ path: f.relPath, reason });
          channelReport.markdownIssues.push({ path: f.relPath, level: 'warning', reason });
        }
      } catch (err) {
        mdSyntaxErrors.push({ path: f.relPath, reason: err.message });
        channelReport.markdownIssues.push({ path: f.relPath, level: 'error', reason: err.message });
      }
    }

    if (mdSyntaxErrors.length > 0) {
      addCheck({
        id: `md-${key}-yaml-error`,
        category: 'markdown',
        channel: key,
        level: 'error',
        title: `${key}: YAML inválido em ${mdSyntaxErrors.length} arquivo(s) .md`,
        message: mdSyntaxErrors.map((x) => `${x.path} (${x.reason})`).join('; '),
        details: mdSyntaxErrors,
      });
    }
    if (mdFieldWarnings.length > 0) {
      addCheck({
        id: `md-${key}-fields-warn`,
        category: 'markdown',
        channel: key,
        level: 'warning',
        title: `${key}: ${mdFieldWarnings.length} arquivo(s) .md sem id/titulo/status`,
        message: mdFieldWarnings.map((x) => `${x.path} (${x.reason})`).join('; '),
        details: mdFieldWarnings,
      });
    }
    if (mdSyntaxErrors.length === 0 && mdFieldWarnings.length === 0) {
      addCheck({
        id: `md-${key}-ok`,
        category: 'markdown',
        channel: key,
        level: 'info',
        title: `${key}: ${mdFiles.length} arquivos .md íntegros`,
        message: 'Todos os arquivos Markdown possuem frontmatter YAML válido com id, titulo e status.',
      });
    }

    // 2. Check .studio-data/*.json and quadros/*.excalidraw
    const studioDataDir = path.join(wsPath, '.studio-data');
    const quadrosDir = path.join(wsPath, 'quadros');
    const jsonTargets = [];

    for (const fname of listFilesSafe(studioDataDir)) {
      if (fname.toLowerCase().endsWith('.json')) {
        jsonTargets.push({
          relPath: `.studio-data/${fname}`,
          absPath: path.join(studioDataDir, fname),
        });
      }
    }
    const trashManifest = path.join(studioDataDir, 'trash', 'manifest.json');
    if (fs.existsSync(trashManifest)) {
      jsonTargets.push({
        relPath: '.studio-data/trash/manifest.json',
        absPath: trashManifest,
      });
    }
    for (const fname of listFilesSafe(quadrosDir)) {
      if (fname.toLowerCase().endsWith('.excalidraw')) {
        jsonTargets.push({
          relPath: `quadros/${fname}`,
          absPath: path.join(quadrosDir, fname),
        });
      }
    }

    channelReport.jsonCount = jsonTargets.length;
    for (const jt of jsonTargets) {
      try {
        const raw = fs.readFileSync(jt.absPath, 'utf8');
        JSON.parse(raw);
      } catch (err) {
        channelReport.jsonIssues.push({ path: jt.relPath, reason: err.message });
      }
    }

    if (channelReport.jsonIssues.length > 0) {
      addCheck({
        id: `json-${key}-invalid`,
        category: 'json',
        channel: key,
        level: 'error',
        title: `${key}: ${channelReport.jsonIssues.length} JSON(s) corrompido(s)`,
        message: channelReport.jsonIssues.map((x) => `${x.path} (${x.reason})`).join('; '),
        details: channelReport.jsonIssues,
      });
    } else {
      addCheck({
        id: `json-${key}-ok`,
        category: 'json',
        channel: key,
        level: 'info',
        title: `${key}: ${jsonTargets.length} JSONs/quadros válidos`,
        message: 'Todos os arquivos em .studio-data/*.json e quadros/*.excalidraw são JSON válido.',
      });
    }

    // 3. Quarantine count
    const quarantineDir = path.join(studioDataDir, 'quarantine');
    const quarantineFiles = listFilesSafe(quarantineDir);
    channelReport.quarantineFiles = quarantineFiles;
    channelReport.quarantineCount = quarantineFiles.length;
    if (quarantineFiles.length > 0) {
      addCheck({
        id: `quarantine-${key}`,
        category: 'quarantine',
        channel: key,
        level: 'warning',
        title: `${key}: ${quarantineFiles.length} arquivo(s) em quarentena`,
        message: `Arquivos recuperados/isolados em .studio-data/quarantine/: ${quarantineFiles.join(', ')}`,
        details: quarantineFiles,
      });
    }

    // 4. Trash count
    if (fs.existsSync(trashManifest)) {
      try {
        const parsedTrash = JSON.parse(fs.readFileSync(trashManifest, 'utf8'));
        channelReport.trashCount = Array.isArray(parsedTrash?.items) ? parsedTrash.items.length : 0;
      } catch {
        channelReport.trashCount = 0;
      }
    }
    addCheck({
      id: `trash-${key}`,
      category: 'trash',
      channel: key,
      level: 'info',
      title: `${key}: ${channelReport.trashCount} item(ns) na lixeira`,
      message: channelReport.trashCount > 0
        ? `${channelReport.trashCount} item(ns) recuperável(eis) em .studio-data/trash/.`
        : 'Lixeira vazia.',
    });

    // 5. Workspace kdenlive-producao symlink (if present)
    const wsKdenliveLink = path.join(wsPath, 'kdenlive-producao');
    try {
      const lst = fs.lstatSync(wsKdenliveLink);
      const targetExists = fs.existsSync(wsKdenliveLink);
      channelReport.kdenliveSymlink = {
        present: true,
        isSymlink: lst.isSymbolicLink(),
        valid: targetExists,
      };
      if (!targetExists) {
        addCheck({
          id: `symlink-${key}-kdenlive`,
          category: 'kdenlive',
          channel: key,
          level: 'warning',
          title: `${key}: symlink kdenlive-producao quebrado`,
          message: `O link ${wsKdenliveLink} aponta para um destino inexistente.`,
        });
      }
    } catch {
      channelReport.kdenliveSymlink = { present: false, isSymlink: false, valid: false };
    }

    channels[key] = channelReport;
  }

  // 6. Configured kdenliveRoot check
  const kdenliveRoot = config.kdenliveRoot || '';
  const kdenliveExists = Boolean(kdenliveRoot && fs.existsSync(kdenliveRoot));
  if (kdenliveRoot && !kdenliveExists) {
    addCheck({
      id: 'kdenlive-root-missing',
      category: 'kdenlive',
      channel: 'system',
      level: 'warning',
      title: 'Pasta Kdenlive configurada não encontrada',
      message: `kdenliveRoot aponta para caminho inexistente: ${kdenliveRoot}`,
    });
  } else {
    addCheck({
      id: 'kdenlive-root-ok',
      category: 'kdenlive',
      channel: 'system',
      level: 'info',
      title: kdenliveRoot ? 'Ponte Kdenlive conectada' : 'Ponte Kdenlive não configurada',
      message: kdenliveRoot || 'Nenhum kdenliveRoot configurado.',
    });
  }

  // 7. System binaries
  const ffmpegPath = resolveFfmpegPath();
  const ngrokPath = resolveNgrokPath();
  const ttsEnv = discoverTtsEnvironment({ kdenliveRoot: config.kdenliveRoot });
  const [ghPath, tarPath] = await Promise.all([resolveBinaryPath('gh'), resolveBinaryPath('tar')]);

  const tools = {
    ffmpeg: { available: Boolean(ffmpegPath), path: ffmpegPath },
    gh: { available: Boolean(ghPath), path: ghPath },
    ngrok: { available: Boolean(ngrokPath), path: ngrokPath },
    tar: { available: Boolean(tarPath), path: tarPath },
    pocketTts: {
      available: ttsEnv.pocketTts.available,
      path: ttsEnv.pocketTts.pythonPath || ttsEnv.pocketTts.dir || '',
      voices: ttsEnv.pocketTts.voices,
    },
    piper: {
      available: ttsEnv.piper.binaryAvailable,
      path: ttsEnv.piper.binaryPath || '',
      hasFaberModel: ttsEnv.piper.hasFaberModel,
      modelsCount: ttsEnv.piper.models.length,
    },
  };

  if (!tarPath) {
    addCheck({
      id: 'bin-tar',
      category: 'binaries',
      channel: 'system',
      level: 'warning',
      title: 'Binário "tar" ausente',
      message: 'Necessário para gerar backups portáteis (.tar.gz).',
    });
  } else {
    addCheck({
      id: 'bin-tar',
      category: 'binaries',
      channel: 'system',
      level: 'info',
      title: 'tar disponível',
      message: tarPath,
    });
  }

  for (const [toolName, info] of [
    ['ffmpeg', tools.ffmpeg],
    ['gh', tools.gh],
    ['ngrok', tools.ngrok],
  ]) {
    addCheck({
      id: `bin-${toolName}`,
      category: 'binaries',
      channel: 'system',
      level: 'info',
      title: info.available ? `${toolName} disponível` : `${toolName} não instalado (opcional)`,
      message: info.available ? info.path : `Binário "${toolName}" não localizado no sistema.`,
    });
  }

  addCheck({
    id: 'tts-pocket',
    category: 'tts',
    channel: 'system',
    level: 'info',
    title: ttsEnv.pocketTts.available
      ? `Pocket TTS (Voz MrJ) disponível (${ttsEnv.pocketTts.voices.length} voz(es))`
      : 'Pocket TTS (Voz MrJ) não configurado (opcional)',
    message: ttsEnv.pocketTts.available
      ? `${ttsEnv.pocketTts.dir} (${ttsEnv.pocketTts.voices.join(', ')})`
      : 'Configure pocket-tts-local (.venv + voices/*.safetensors) para usar a voz do MrJ.',
  });

  addCheck({
    id: 'tts-piper',
    category: 'tts',
    channel: 'system',
    level: 'info',
    title: ttsEnv.piper.available
      ? `Piper ONNX (Voz Crom) disponível (${ttsEnv.piper.models.length} modelo(s))`
      : ttsEnv.piper.binaryAvailable
      ? 'Piper ONNX sem modelo baixado (use --baixar-piper)'
      : 'Piper ONNX não instalado (opcional)',
    message: ttsEnv.piper.binaryAvailable
      ? `${ttsEnv.piper.binaryPath} | pt_BR-faber-medium: ${ttsEnv.piper.hasFaberModel ? 'OK' : 'ausente'}`
      : 'Instale o binário piper e o modelo pt_BR-faber-medium.onnx.',
  });

  addCheck({
    id: 'tts-rvc',
    category: 'tts',
    channel: 'system',
    level: 'info',
    title: ttsEnv.rvc?.available
      ? `RVC v2 (Nível 2) pronto (${ttsEnv.rvc.models.length} modelo(s) .pth)`
      : ttsEnv.rvc?.runnerAvailable
      ? 'RVC v2 runner pronto (aguardando modelo .pth)'
      : 'RVC v2 local não configurado (opcional)',
    message: ttsEnv.rvc?.runnerAvailable
      ? `Pasta de modelos: ${ttsEnv.rvc.defaultModelsDir}`
      : 'Configure rvc-local (.venv) + modelo .pth para conversão de timbre Nível 2 em CPU.',
  });

  // 8. Disk space (df -k)
  const firstWs = (config.channelOrder || [])
    .map((k) => config.channels[k]?.workspacePath)
    .find((p) => p && fs.existsSync(p));
  const disk = await checkDiskFree(firstWs || REPO_ROOT);
  if (!disk.ok) {
    addCheck({
      id: 'disk-free',
      category: 'disk',
      channel: 'system',
      level: 'warning',
      title: 'Não foi possível verificar espaço em disco',
      message: disk.error || 'Erro desconhecido ao executar df.',
    });
  } else {
    const lowCrit = disk.freeBytes < 100 * 1024 * 1024;
    const lowWarn = disk.freeBytes < 500 * 1024 * 1024;
    addCheck({
      id: 'disk-free',
      category: 'disk',
      channel: 'system',
      level: lowCrit ? 'error' : lowWarn ? 'warning' : 'info',
      title: `Espaço livre em disco: ${disk.freeHuman}`,
      message: `Montagem ${disk.mount} (${disk.capacity} usado, ${disk.freeHuman} disponível).`,
    });
  }

  const summary = {
    errors: checks.filter((c) => c.level === 'error').length,
    warnings: checks.filter((c) => c.level === 'warning').length,
    infos: checks.filter((c) => c.level === 'info').length,
  };

  return {
    ok: summary.errors === 0,
    checkedAt: new Date().toISOString(),
    summary,
    checks,
    channels,
    tools,
    kdenlive: {
      configured: Boolean(kdenliveRoot),
      available: kdenliveExists,
      root: kdenliveRoot,
    },
    disk,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const argv = process.argv.slice(2);
  const jsonOut = argv.includes('--json');
  const config = loadConfig(argv);
  const report = await runDoctor(config);

  if (jsonOut) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`[Crom Studio Doctor] Status: ${report.ok ? 'OK' : 'FALHAS ENCONTRADAS'} | Erros: ${report.summary.errors} | Avisos: ${report.summary.warnings} | Infos: ${report.summary.infos}`);
    for (const c of report.checks) {
      const icon = c.level === 'error' ? '✖' : c.level === 'warning' ? '⚠' : '✓';
      console.log(`  ${icon} [${c.channel}] ${c.title} — ${c.message}`);
    }
  }

  process.exit(report.ok ? 0 : 1);
}
