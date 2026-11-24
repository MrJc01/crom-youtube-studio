import fs from 'node:fs';
import path from 'node:path';
import { ASSETS_DIR, DATA_DIR, WEB_DIR } from '../config.mjs';
import { assertInsideRoot } from '../lib/storage.mjs';
import { parseFrontmatter, slugify } from '../sync.mjs';

export const MAX_BODY_BYTES = 35 * 1024 * 1024;
export const PROTECTED_FILES = new Set(['AGENTS.md', 'README.md']);

export const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.wasm': 'application/wasm',
  '.excalidraw': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

export function sendJson(res, status, data, extraHeaders = {}) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...extraHeaders,
  });
  res.end(body);
}

export function readJsonBody(req, { maxBytes = MAX_BODY_BYTES } = {}) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > maxBytes) {
        reject(Object.assign(new Error('Payload muito grande'), { statusCode: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(Object.assign(new Error('JSON inválido'), { statusCode: 400 }));
      }
    });
    req.on('error', reject);
  });
}

export function assertNoSymlinkChain(rootReal, targetAbs) {
  const rel = path.relative(rootReal, targetAbs);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) {
    throw Object.assign(new Error('Acesso fora do workspace bloqueado'), { statusCode: 403 });
  }

  let cur = rootReal;
  for (const part of rel.split(path.sep)) {
    cur = path.join(cur, part);
    if (!fs.existsSync(cur)) {
      break;
    }
    const st = fs.lstatSync(cur);
    if (st.isSymbolicLink()) {
      throw Object.assign(new Error('Symlinks não são permitidos nesta operação'), { statusCode: 403 });
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

export function resolveChannel(config, rawChannel) {
  const key = String(rawChannel || config.defaultChannel || '')
    .trim()
    .toLowerCase();
  const cfg = config.channels[key];
  if (!cfg) {
    throw Object.assign(new Error(`Canal inválido: ${rawChannel || '(vazio)'}`), { statusCode: 400 });
  }
  if (!cfg.workspacePath || !fs.existsSync(cfg.workspacePath)) {
    throw Object.assign(new Error(`Workspace do canal "${key}" não encontrado no disco`), {
      statusCode: 404,
    });
  }
  const workspaceReal = fs.realpathSync(cfg.workspacePath);
  return { key, cfg, workspaceReal };
}

export function validateRelativeSegments(normalized, { allowEmpty = false } = {}) {
  if (!normalized) {
    if (allowEmpty) return [];
    throw Object.assign(new Error('Caminho ausente'), { statusCode: 400 });
  }
  if (normalized.includes('\0')) {
    throw Object.assign(new Error('Caminho inválido'), { statusCode: 400 });
  }
  const segments = normalized.split('/');
  for (const seg of segments) {
    if (!seg || seg === '.' || seg === '..' || seg.startsWith('.')) {
      throw Object.assign(new Error('Segmento de caminho proibido'), { statusCode: 403 });
    }
  }
  if (segments[0] === 'studio' || segments[0] === 'node_modules') {
    throw Object.assign(new Error('Pasta protegida do sistema'), { statusCode: 403 });
  }
  return segments;
}

export function resolveSafeMdPath(config, rawChannel, relPath) {
  if (!relPath || typeof relPath !== 'string') {
    throw Object.assign(new Error('Caminho ausente'), { statusCode: 400 });
  }
  const { key, workspaceReal } = resolveChannel(config, rawChannel);
  const normalized = relPath.replace(/\\/g, '/').replace(/^\/+/, '').trim();
  validateRelativeSegments(normalized);

  if (!normalized.toLowerCase().endsWith('.md')) {
    throw Object.assign(new Error('Apenas arquivos .md são permitidos na API'), { statusCode: 400 });
  }

  const abs = path.resolve(workspaceReal, normalized);
  assertInsideRoot(workspaceReal, abs);
  assertNoSymlinkChain(workspaceReal, abs);

  return { channel: key, workspaceReal, abs, rel: normalized };
}

export function resolveSafeFolder(config, rawChannel, folder) {
  const { key, workspaceReal } = resolveChannel(config, rawChannel);
  if (!folder || folder === 'raiz' || folder === '.') {
    return { channel: key, workspaceReal, abs: workspaceReal, rel: '' };
  }
  const normalized = String(folder).replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').trim();
  validateRelativeSegments(normalized, { allowEmpty: true });

  const abs = path.resolve(workspaceReal, normalized);
  assertInsideRoot(workspaceReal, abs);
  assertNoSymlinkChain(workspaceReal, abs);

  return { channel: key, workspaceReal, abs, rel: normalized };
}

export function yamlQuote(val) {
  return `"${String(val ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/[\r\n]+/g, ' ')
    .trim()}"`;
}

export function buildYamlFrontmatter(fields = {}) {
  const tags = Array.isArray(fields.tags) ? fields.tags.filter(Boolean) : [];
  const tagsYaml = `[${tags.map((t) => yamlQuote(t)).join(', ')}]`;
  return [
    '---',
    `id: ${yamlQuote(fields.id || '')}`,
    `titulo: ${yamlQuote(fields.titulo || 'Sem título')}`,
    `tipo: ${yamlQuote(fields.tipo || 'roteiro')}`,
    `status: ${yamlQuote(fields.status || 'roteiro')}`,
    `serie: ${yamlQuote(fields.serie || 'Geral')}`,
    `formato: ${yamlQuote(fields.formato || 'long')}`,
    `prioridade: ${yamlQuote(fields.prioridade || 'media')}`,
    `duracao_estimada: ${yamlQuote(fields.duracao_estimada || '10 min')}`,
    `data_criacao: ${yamlQuote(fields.data_criacao || new Date().toISOString().slice(0, 10))}`,
    `data_alvo: ${yamlQuote(fields.data_alvo || '')}`,
    `repo_github: ${yamlQuote(fields.repo_github || '')}`,
    `youtube_id: ${yamlQuote(fields.youtube_id || '')}`,
    `views: ${Number.isFinite(Number(fields.views)) ? Number(fields.views) : 0}`,
    `tags: ${tagsYaml}`,
    `resumo: ${yamlQuote(fields.resumo || '')}`,
    '---',
  ].join('\n');
}

export function findUniqueDocRelPath(config, rawChannel, folderRel, baseSlug) {
  const safeFolder = resolveSafeFolder(config, rawChannel, folderRel);
  const cleanBase = slugify(baseSlug).slice(0, 72) || 'documento';
  for (let i = 0; i < 100; i++) {
    const suffix = i === 0 ? '' : `-${i + 1}`;
    const fileName = `${cleanBase}${suffix}.md`;
    const relPath = safeFolder.rel ? `${safeFolder.rel}/${fileName}` : fileName;
    const candidate = resolveSafeMdPath(config, rawChannel, relPath);
    if (!fs.existsSync(candidate.abs)) {
      return candidate;
    }
  }
  throw Object.assign(new Error('Não foi possível gerar um nome único de arquivo .md.'), { statusCode: 409 });
}

export function extractDocTitle(content, relPath) {
  try {
    const { meta, body } = parseFrontmatter(content);
    if (meta?.titulo && typeof meta.titulo === 'string') {
      return meta.titulo.trim();
    }
    const h1 = String(body || '')
      .split(/\r?\n/)
      .find((line) => line.trim().startsWith('# '));
    if (h1) return h1.replace(/^#\s+/, '').trim();
  } catch {
    // fallback para nome do arquivo
  }
  return path.basename(String(relPath || 'documento.md'), '.md');
}

export function serveFileSafe(res, rootDir, relPath, cacheControl = 'no-cache', method = 'GET') {
  if (!fs.existsSync(rootDir)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(method === 'HEAD' ? undefined : 'Diretório não encontrado');
    return;
  }
  const rootReal = fs.realpathSync(rootDir);
  const normalized = String(relPath || '').replace(/^\/+/, '');
  const segments = normalized ? normalized.split('/') : [];
  if (!segments.length || segments.some((s) => !s || s === '.' || s === '..' || s.startsWith('.'))) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(method === 'HEAD' ? undefined : 'Acesso negado');
    return;
  }

  const abs = path.resolve(rootReal, normalized);
  if (abs !== rootReal && !abs.startsWith(rootReal + path.sep)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(method === 'HEAD' ? undefined : 'Acesso negado');
    return;
  }

  if (!fs.existsSync(abs)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(method === 'HEAD' ? undefined : 'Arquivo não encontrado');
    return;
  }

  const lstat = fs.lstatSync(abs);
  if (lstat.isSymbolicLink() || lstat.isDirectory()) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(method === 'HEAD' ? undefined : 'Acesso negado');
    return;
  }

  const realAbs = fs.realpathSync(abs);
  if (!realAbs.startsWith(rootReal + path.sep)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(method === 'HEAD' ? undefined : 'Acesso negado');
    return;
  }

  const ext = path.extname(realAbs).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';
  res.writeHead(200, {
    'Content-Type': contentType,
    'Content-Length': lstat.size,
    'Cache-Control': cacheControl,
  });
  if (method === 'HEAD') {
    res.end();
    return;
  }
  fs.createReadStream(realAbs).pipe(res);
}

export function serveSpaHtml(res, method = 'GET') {
  const indexPath = path.join(WEB_DIR, 'index.html');
  if (!fs.existsSync(indexPath)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(method === 'HEAD' ? undefined : 'index.html não encontrado');
    return;
  }
  let html = fs.readFileSync(indexPath, 'utf8');
  if (!html.includes('<base ')) {
    html = html.replace('<head>', '<head>\n  <base href="/">');
  }
  const buf = Buffer.from(html, 'utf8');
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Length': buf.length,
    'Cache-Control': 'no-cache',
  });
  res.end(method === 'HEAD' ? undefined : buf);
}

export function serveStatic(reqPath, res, method = 'GET') {
  let cleanPath;
  try {
    cleanPath = decodeURIComponent(String(reqPath || '/').split('?')[0]);
  } catch {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(method === 'HEAD' ? undefined : 'URL inválida');
    return;
  }

  if (cleanPath === '/data.js') {
    return serveFileSafe(res, DATA_DIR, 'data.js', 'no-store', method);
  }

  if (cleanPath.startsWith('/assets/')) {
    return serveFileSafe(res, ASSETS_DIR, cleanPath.slice('/assets/'.length), 'no-cache', method);
  }

  if (cleanPath.startsWith('/dist/')) {
    return serveFileSafe(res, path.join(WEB_DIR, 'dist'), cleanPath.slice('/dist/'.length), 'no-cache', method);
  }

  if (cleanPath.startsWith('/vendor/')) {
    return serveFileSafe(res, path.join(WEB_DIR, 'vendor'), cleanPath.slice('/vendor/'.length), 'no-cache', method);
  }

  if (cleanPath === '/' || cleanPath === '/index.html') {
    return serveSpaHtml(res, method);
  }

  if (fs.existsSync(WEB_DIR)) {
    const webRootReal = fs.realpathSync(WEB_DIR);
    const relStatic = cleanPath.replace(/^\/+/, '');
    const segments = relStatic ? relStatic.split('/') : [];
    if (segments.length && !segments.some((s) => !s || s === '.' || s === '..' || s.startsWith('.'))) {
      const candidate = path.resolve(webRootReal, relStatic);
      if (candidate.startsWith(webRootReal + path.sep) && fs.existsSync(candidate)) {
        const st = fs.lstatSync(candidate);
        if (!st.isSymbolicLink() && !st.isDirectory()) {
          return serveFileSafe(res, WEB_DIR, relStatic, 'no-cache', method);
        }
      }
    }
  }

  if (!cleanPath.startsWith('/api/')) {
    return serveSpaHtml(res, method);
  }

  sendJson(res, 404, { error: 'Endpoint não encontrado' });
}
