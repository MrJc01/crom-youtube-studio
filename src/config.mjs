import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const REPO_ROOT = path.resolve(__dirname, '..');
export const DATA_DIR = path.join(REPO_ROOT, 'data');
export const WEB_DIR = path.join(REPO_ROOT, 'web');
export const ASSETS_DIR = path.join(REPO_ROOT, 'assets');

export function resolveUserPath(rawPath, baseDir = REPO_ROOT) {
  if (!rawPath || typeof rawPath !== 'string') return '';
  const trimmed = rawPath.trim();
  if (!trimmed) return '';
  if (trimmed === '~') return os.homedir();
  if (trimmed.startsWith('~/')) {
    return path.join(os.homedir(), trimmed.slice(2));
  }
  return path.resolve(baseDir, trimmed);
}

export function getCliArg(argv, flag) {
  const args = Array.isArray(argv) ? argv : process.argv.slice(2);
  const eqPrefix = `${flag}=`;
  for (let i = 0; i < args.length; i++) {
    const token = args[i];
    if (token === flag && i + 1 < args.length) {
      return args[i + 1];
    }
    if (token.startsWith(eqPrefix)) {
      return token.slice(eqPrefix.length);
    }
  }
  return null;
}

export function findConfigPath(argv = process.argv.slice(2)) {
  const cliConfig = getCliArg(argv, '--config');
  if (cliConfig) {
    const resolved = resolveUserPath(cliConfig, process.cwd());
    if (!fs.existsSync(resolved)) {
      throw new Error(`Arquivo de configuração não encontrado em --config: ${resolved}`);
    }
    return resolved;
  }

  if (process.env.CROM_STUDIO_CONFIG) {
    const resolved = resolveUserPath(process.env.CROM_STUDIO_CONFIG, process.cwd());
    if (!fs.existsSync(resolved)) {
      throw new Error(`Arquivo de configuração não encontrado em CROM_STUDIO_CONFIG: ${resolved}`);
    }
    return resolved;
  }

  const localPath = path.join(REPO_ROOT, 'config.local.json');
  if (fs.existsSync(localPath)) return localPath;

  const examplePath = path.join(REPO_ROOT, 'config.example.json');
  if (fs.existsSync(examplePath)) return examplePath;

  throw new Error('Nenhum arquivo config.local.json ou config.example.json encontrado.');
}

export function loadConfig(argv = process.argv.slice(2)) {
  const configPath = findConfigPath(argv);
  const configDir = path.dirname(configPath);
  const raw = JSON.parse(fs.readFileSync(configPath, 'utf8'));

  const cliPort = getCliArg(argv, '--port');
  const cliHost = getCliArg(argv, '--host');

  const port = Number(cliPort || process.env.PORT || raw.port || 4173);
  const host = String(cliHost || process.env.HOST || raw.host || '127.0.0.1');
  const kdenliveRoot = resolveUserPath(raw.kdenliveRoot || '', configDir);

  const rawChannels = raw.channels && typeof raw.channels === 'object' ? raw.channels : {};
  const channels = {};
  const channelOrder = [];

  for (const [key, ch] of Object.entries(rawChannels)) {
    const safeKey = String(key).trim().toLowerCase();
    if (!safeKey || !ch || typeof ch !== 'object') continue;
    channelOrder.push(safeKey);
    channels[safeKey] = {
      key: safeKey,
      name: String(ch.name || safeKey),
      handle: String(ch.handle || ''),
      channelId: String(ch.channelId || ''),
      url: String(ch.url || (ch.handle ? `https://www.youtube.com/${ch.handle}` : '')),
      status: String(ch.status || 'ativo'),
      statusLabel: String(ch.statusLabel || (ch.status === 'pausado' ? 'Offline / Pausado' : 'Ativo')),
      subscribers: Number(ch.subscribers || 0),
      totalVideos: ch.totalVideos !== undefined ? Number(ch.totalVideos) : null,
      avatar: String(ch.avatar || ''),
      bio: String(ch.bio || ''),
      workspacePath: resolveUserPath(ch.workspacePath || '', configDir),
      kdenliveFolder: String(ch.kdenliveFolder || 'videos'),
      seriesList: Array.isArray(ch.seriesList) ? ch.seriesList.map(String) : [],
    };
  }

  const requestedDefault = String(raw.defaultChannel || '').trim().toLowerCase();
  const defaultChannel = channels[requestedDefault]
    ? requestedDefault
    : (channelOrder[0] || '');

  return {
    configPath,
    port,
    host,
    defaultChannel,
    kdenliveRoot,
    channelOrder,
    channels,
  };
}
