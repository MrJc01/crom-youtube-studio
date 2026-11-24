import { execFileSync, spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import QRCode from 'qrcode';
import { saveRemoteConfigUpdates } from './config.mjs';

const COOKIE_NAME = 'crom_remote_pin';
const PIN_TTL_MS = 12 * 60 * 60 * 1000;

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

export function resolveNgrokPath() {
  const candidates = [];
  if (process.env.NGROK_PATH) {
    candidates.push(process.env.NGROK_PATH.trim());
  }
  candidates.push('/usr/local/bin/ngrok');
  candidates.push('/usr/bin/ngrok');
  candidates.push(path.join(os.homedir(), '.local', 'bin', 'ngrok'));

  for (const cand of candidates) {
    if (isExecutableFile(cand)) return cand;
  }

  try {
    const found = execFileSync('which', ['ngrok'], {
      encoding: 'utf8',
      timeout: 2000,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .split(/\r?\n/)[0]
      .trim();
    if (isExecutableFile(found)) return found;
  } catch {
    // ngrok não encontrado no PATH
  }
  return null;
}

function isPrivateRfc1918(ip) {
  if (ip.startsWith('192.168.') || ip.startsWith('10.')) return true;
  const m = /^172\.(\d+)\./.exec(ip);
  if (m) {
    const second = Number(m[1]);
    return second >= 16 && second <= 31;
  }
  return false;
}

function interfaceScore(name, ip) {
  let score = 0;
  const lower = String(name || '').toLowerCase();
  if (/^(wl|wlan|wifi|wlp)/.test(lower)) score += 50;
  else if (/^(en|eth|eno|enp|ens)/.test(lower)) score += 35;
  if (/^(docker|br-|veth|virbr|tun|tap|wg|tailscale|zt)/.test(lower)) score -= 60;
  if (isPrivateRfc1918(ip)) score += 30;
  if (ip.startsWith('192.168.')) score += 10;
  return score;
}

export function discoverLanIpv4Addresses() {
  const nets = os.networkInterfaces();
  const list = [];

  for (const [ifName, entries] of Object.entries(nets)) {
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      const isV4 = entry.family === 'IPv4' || entry.family === 4;
      if (!isV4 || entry.internal) continue;
      if (!entry.address || entry.address.startsWith('169.254.')) continue;
      list.push({
        name: ifName,
        address: entry.address,
        netmask: entry.netmask || '',
        score: interfaceScore(ifName, entry.address),
      });
    }
  }

  list.sort((a, b) => b.score - a.score || a.address.localeCompare(b.address));
  return list.map(({ name, address, netmask }) => ({ name, address, netmask }));
}

export async function generateQrSvg(url) {
  if (!url) return null;
  return QRCode.toString(String(url), {
    type: 'svg',
    margin: 2,
    width: 220,
    color: {
      dark: '#0b0c12',
      light: '#ffffff',
    },
  });
}

function parseCookies(cookieHeader) {
  const out = {};
  if (!cookieHeader || typeof cookieHeader !== 'string') return out;
  for (const part of cookieHeader.split(';')) {
    const eqIdx = part.indexOf('=');
    if (eqIdx === -1) continue;
    const key = part.slice(0, eqIdx).trim();
    const val = part.slice(eqIdx + 1).trim();
    if (key) {
      try {
        out[key] = decodeURIComponent(val);
      } catch {
        out[key] = val;
      }
    }
  }
  return out;
}

function renderPinUnlockHtml() {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Acesso Remoto Protegido — Crom YouTube Studio</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #0b0c12;
      --card: rgba(20, 23, 34, 0.92);
      --border: rgba(255, 255, 255, 0.12);
      --text: #f3f5fc;
      --muted: #9aa3b8;
      --accent: #38bdf8;
      --danger: #f43f5e;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: 20px;
      background:
        radial-gradient(600px circle at 20% 20%, rgba(56, 189, 248, 0.12), transparent 60%),
        radial-gradient(600px circle at 80% 80%, rgba(139, 92, 246, 0.12), transparent 60%),
        var(--bg);
      color: var(--text);
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    .pin-card {
      width: 100%;
      max-width: 380px;
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 28px 24px;
      box-shadow: 0 24px 60px rgba(0, 0, 0, 0.55);
    }
    .pin-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      font-weight: 600;
      color: var(--accent);
      background: rgba(56, 189, 248, 0.12);
      border: 1px solid rgba(56, 189, 248, 0.28);
      padding: 4px 10px;
      border-radius: 999px;
      margin-bottom: 14px;
    }
    h1 {
      margin: 0 0 8px;
      font-size: 20px;
      line-height: 1.3;
    }
    p {
      margin: 0 0 18px;
      font-size: 13.5px;
      line-height: 1.5;
      color: var(--muted);
    }
    form {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    input[type="password"] {
      width: 100%;
      padding: 12px 14px;
      border-radius: 10px;
      border: 1px solid var(--border);
      background: rgba(11, 12, 18, 0.85);
      color: var(--text);
      font-size: 16px;
      letter-spacing: 0.18em;
      text-align: center;
      outline: none;
    }
    input[type="password"]:focus {
      border-color: var(--accent);
      box-shadow: 0 0 0 3px rgba(56, 189, 248, 0.18);
    }
    button {
      padding: 11px 16px;
      border: 0;
      border-radius: 10px;
      background: linear-gradient(135deg, #38bdf8, #818cf8);
      color: #060810;
      font-weight: 700;
      font-size: 14px;
      cursor: pointer;
    }
    button:disabled {
      opacity: 0.6;
      cursor: wait;
    }
    .pin-error {
      min-height: 18px;
      font-size: 12.5px;
      color: var(--danger);
      text-align: center;
    }
  </style>
</head>
<body>
  <main class="pin-card">
    <span class="pin-badge">🔒 Crom YouTube Studio</span>
    <h1>Acesso Remoto Protegido</h1>
    <p>Digite o PIN configurado no estúdio para liberar o painel neste dispositivo.</p>
    <form id="pinUnlockForm">
      <input id="pinInput" type="password" inputmode="numeric" autocomplete="current-password" placeholder="••••" autofocus required />
      <button id="pinSubmitBtn" type="submit">Desbloquear Acesso</button>
      <div class="pin-error" id="pinError"></div>
    </form>
  </main>
  <script>
    (function () {
      var form = document.getElementById('pinUnlockForm');
      var input = document.getElementById('pinInput');
      var btn = document.getElementById('pinSubmitBtn');
      var errEl = document.getElementById('pinError');
      form.addEventListener('submit', async function (e) {
        e.preventDefault();
        errEl.textContent = '';
        btn.disabled = true;
        try {
          var res = await fetch('/api/remote/unlock', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pin: input.value })
          });
          var data = await res.json().catch(function () { return {}; });
          if (!res.ok || !data.ok) {
            errEl.textContent = data.error || 'PIN incorreto.';
            input.select();
            return;
          }
          window.location.reload();
        } catch (_err) {
          errEl.textContent = 'Erro de conexão ao validar PIN.';
        } finally {
          btn.disabled = false;
        }
      });
    })();
  </script>
</body>
</html>`;
}

export function createRemoteAccessManager({ config, getRequestHandler, onStatusChange = null }) {
  const sessionSecret = crypto.randomBytes(32);

  let mainPort = Number(config.port || 4173);
  let lanServer = null;
  let lanSockets = new Set();
  let lanIpBound = null;
  let lanPortBound = null;
  let lanUrl = null;
  let lanError = null;

  let ngrokProc = null;
  let ngrokUrl = null;
  let ngrokError = null;
  let ngrokExitedEarly = false;
  let ngrokExitInfo = '';

  function notifyChange() {
    if (typeof onStatusChange === 'function') {
      try {
        onStatusChange();
      } catch {
        // ignora erro de callback
      }
    }
  }

  function pinDigest(pin) {
    return crypto.createHash('sha256').update(String(pin || ''), 'utf8').digest('hex').slice(0, 16);
  }

  function signPinToken(pin) {
    const expMs = Date.now() + PIN_TTL_MS;
    const digest = pinDigest(pin);
    const payload = `${expMs}.${digest}`;
    const sig = crypto.createHmac('sha256', sessionSecret).update(payload).digest('hex');
    return `${payload}.${sig}`;
  }

  function verifyRemoteCookie(req) {
    const configuredPin = config.remote?.pinCode || '';
    if (!configuredPin) return false;
    const cookies = parseCookies(req.headers?.cookie);
    const rawToken = cookies[COOKIE_NAME];
    if (!rawToken) return false;

    const parts = rawToken.split('.');
    if (parts.length !== 3) return false;
    const [expStr, digest, sigHex] = parts;
    const expMs = Number(expStr);
    if (!Number.isFinite(expMs) || Date.now() > expMs) return false;
    if (digest !== pinDigest(configuredPin)) return false;

    const expectedSig = crypto.createHmac('sha256', sessionSecret).update(`${expStr}.${digest}`).digest();
    let providedSig;
    try {
      providedSig = Buffer.from(sigHex, 'hex');
    } catch {
      return false;
    }
    if (providedSig.length !== expectedSig.length) return false;
    return crypto.timingSafeEqual(providedSig, expectedSig);
  }

  function validatePinSubmission(submittedPin) {
    const configuredPin = String(config.remote?.pinCode || '');
    const candidate = String(submittedPin || '');
    if (!configuredPin || !candidate) return false;
    const a = crypto.createHash('sha256').update(candidate, 'utf8').digest();
    const b = crypto.createHash('sha256').update(configuredPin, 'utf8').digest();
    return crypto.timingSafeEqual(a, b);
  }

  function setPinAuthCookie(req, res) {
    const configuredPin = String(config.remote?.pinCode || '');
    const token = signPinToken(configuredPin);
    const isHttps =
      Boolean(req.socket?.encrypted) ||
      String(req.headers?.['x-forwarded-proto'] || '').toLowerCase().includes('https');
    const maxAgeSec = Math.floor(PIN_TTL_MS / 1000);
    const parts = [
      `${COOKIE_NAME}=${encodeURIComponent(token)}`,
      'HttpOnly',
      'Path=/',
      'SameSite=Lax',
      `Max-Age=${maxAgeSec}`,
    ];
    if (isHttps) parts.push('Secure');
    res.setHeader('Set-Cookie', parts.join('; '));
  }

  function isLoopbackDirectRequest(req) {
    const rawIp = String(req.socket?.remoteAddress || '');
    const isLoopbackIp = rawIp === '127.0.0.1' || rawIp === '::1' || rawIp === '::ffff:127.0.0.1';
    if (!isLoopbackIp) return false;

    const h = req.headers || {};
    if (h['x-forwarded-for'] || h.forwarded || h['x-real-ip'] || h['x-forwarded-host']) {
      return false;
    }
    const host = String(h.host || '').toLowerCase();
    if (host.includes('.ngrok')) {
      return false;
    }
    return true;
  }

  function enforceRemotePin(req, res, pathname) {
    const pinActive = Boolean(config.remote?.pinEnabled && config.remote?.pinCode);
    if (!pinActive) return true;
    if (isLoopbackDirectRequest(req)) return true;
    if (pathname === '/api/remote/unlock' && req.method === 'POST') return true;
    if (verifyRemoteCookie(req)) return true;

    if (pathname.startsWith('/api/')) {
      res.writeHead(401, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      });
      res.end(
        JSON.stringify({
          ok: false,
          pinRequired: true,
          error: 'Acesso remoto protegido por PIN. Desbloqueie primeiro.',
        })
      );
      return false;
    }

    res.writeHead(401, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    res.end(renderPinUnlockHtml());
    return false;
  }

  async function closeLanServerOnly() {
    if (!lanServer) {
      lanIpBound = null;
      lanPortBound = null;
      lanUrl = null;
      return;
    }
    const srv = lanServer;
    lanServer = null;
    lanIpBound = null;
    lanPortBound = null;
    lanUrl = null;

    for (const sock of lanSockets) {
      try {
        sock.destroy();
      } catch {
        // ignora
      }
    }
    lanSockets.clear();
    if (typeof srv.closeAllConnections === 'function') {
      try {
        srv.closeAllConnections();
      } catch {
        // ignora
      }
    }
    await new Promise((resolve) => {
      try {
        srv.close(() => resolve());
      } catch {
        resolve();
      }
    });
  }

  async function startLanServerInternal() {
    const interfaces = discoverLanIpv4Addresses();
    const primary = interfaces[0];
    if (!primary) {
      lanError = 'Nenhuma interface Wi-Fi/LAN IPv4 ativa encontrada neste computador.';
      throw httpError(lanError, 400);
    }

    if (lanServer && lanIpBound === primary.address && lanUrl) {
      lanError = null;
      return;
    }

    await closeLanServerOnly();
    const handler = getRequestHandler();
    if (typeof handler !== 'function') {
      throw httpError('Request handler indisponível para o servidor LAN.', 500);
    }

    const basePort = Number(mainPort || config.port || 4173);
    let lastErr = null;

    for (let offset = 0; offset <= 5; offset++) {
      const candidatePort = basePort + offset;
      const srv = http.createServer(handler);
      const sockets = new Set();
      srv.on('connection', (sock) => {
        sockets.add(sock);
        sock.on('close', () => sockets.delete(sock));
      });

      const bound = await new Promise((resolve) => {
        const onError = (err) => {
          srv.removeListener('listening', onListening);
          resolve({ ok: false, err });
        };
        const onListening = () => {
          srv.removeListener('error', onError);
          resolve({ ok: true });
        };
        srv.once('error', onError);
        srv.once('listening', onListening);
        srv.listen(candidatePort, primary.address);
      });

      if (bound.ok) {
        lanServer = srv;
        lanSockets = sockets;
        lanIpBound = primary.address;
        lanPortBound = candidatePort;
        lanUrl = `http://${primary.address}:${candidatePort}`;
        lanError = null;
        return;
      }

      lastErr = bound.err;
      for (const s of sockets) {
        try {
          s.destroy();
        } catch {
          // ignora
        }
      }
      if (bound.err?.code !== 'EADDRINUSE') {
        break;
      }
    }

    lanError = `Não foi possível abrir o servidor Wi-Fi LAN em ${primary.address}: ${lastErr?.message || 'erro desconhecido'}`;
    throw httpError(lanError, 500);
  }

  async function setLanEnabled(enabled, { persist = true } = {}) {
    const target = Boolean(enabled);
    if (target) {
      await startLanServerInternal();
      if (persist) {
        saveRemoteConfigUpdates(config, { lanEnabled: true });
      }
    } else {
      await closeLanServerOnly();
      lanError = null;
      if (persist) {
        saveRemoteConfigUpdates(config, { lanEnabled: false });
      }
    }
    notifyChange();
    return getStatus();
  }

  async function stopNgrok() {
    const proc = ngrokProc;
    ngrokProc = null;
    ngrokUrl = null;
    ngrokError = null;
    ngrokExitedEarly = false;
    ngrokExitInfo = '';

    if (proc && !proc.killed && proc.exitCode === null) {
      await new Promise((resolve) => {
        let finished = false;
        const done = () => {
          if (finished) return;
          finished = true;
          resolve();
        };
        proc.once('exit', done);
        try {
          proc.kill('SIGTERM');
        } catch {
          done();
          return;
        }
        setTimeout(() => {
          if (!finished && proc.exitCode === null) {
            try {
              proc.kill('SIGKILL');
            } catch {
              // ignora
            }
          }
          done();
        }, 1500).unref();
      });
    }
    notifyChange();
    return getStatus();
  }

  function parseNgrokLogLine(line) {
    const trimmed = String(line || '').trim();
    if (!trimmed) return;
    try {
      const obj = JSON.parse(trimmed);
      if (obj.err || obj.lvl === 'eror' || obj.lvl === 'error' || obj.lvl === 'crit') {
        const msg = String(obj.err || obj.msg || '');
        if (msg) {
          ngrokExitInfo = msg;
        }
      }
      if (obj.url && typeof obj.url === 'string' && obj.url.startsWith('https://')) {
        ngrokUrl = obj.url;
      }
    } catch {
      if (/ERR_NGROK_\d+/i.test(trimmed) || /authentication failed/i.test(trimmed)) {
        ngrokExitInfo = trimmed;
      }
    }
  }

  async function startNgrok(targetPort = null, authtoken = undefined) {
    const ngrokBin = resolveNgrokPath();
    if (!ngrokBin) {
      ngrokError = 'Binário "ngrok" não encontrado no sistema (/usr/local/bin/ngrok ou PATH).';
      throw httpError(ngrokError, 503);
    }

    if (authtoken !== undefined && typeof authtoken === 'string' && authtoken.trim()) {
      saveRemoteConfigUpdates(config, { ngrokAuthtoken: authtoken.trim() });
    }

    const effectiveToken =
      (typeof authtoken === 'string' && authtoken.trim()) ||
      String(config.remote?.ngrokAuthtoken || '').trim();

    await stopNgrok();

    const portToTunnel = Number(targetPort || mainPort || config.port || 4173);
    const spawnEnv = { ...process.env };
    if (effectiveToken) {
      spawnEnv.NGROK_AUTHTOKEN = effectiveToken;
    }

    ngrokExitedEarly = false;
    ngrokExitInfo = '';
    ngrokError = null;

    const child = spawn(
      ngrokBin,
      ['http', `http://127.0.0.1:${portToTunnel}`, '--log=stdout', '--log-format=json'],
      {
        env: spawnEnv,
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    );
    ngrokProc = child;

    let stdoutBuf = '';
    let stderrBuf = '';

    child.stdout?.on('data', (chunk) => {
      stdoutBuf += chunk.toString('utf8');
      const lines = stdoutBuf.split('\n');
      stdoutBuf = lines.pop() || '';
      for (const l of lines) parseNgrokLogLine(l);
    });

    child.stderr?.on('data', (chunk) => {
      stderrBuf += chunk.toString('utf8');
      const lines = stderrBuf.split('\n');
      stderrBuf = lines.pop() || '';
      for (const l of lines) parseNgrokLogLine(l);
    });

    child.on('exit', (code, signal) => {
      if (ngrokProc === child) {
        ngrokExitedEarly = true;
        if (!ngrokUrl && !ngrokExitInfo) {
          ngrokExitInfo = `ngrok encerrou (code=${code ?? 'null'}, signal=${signal ?? 'null'})`;
        }
        ngrokProc = null;
        ngrokUrl = null;
      }
    });

    const deadline = Date.now() + 8000;
    let foundUrl = null;

    while (Date.now() < deadline) {
      if (ngrokUrl && ngrokUrl.startsWith('https://')) {
        foundUrl = ngrokUrl;
        break;
      }
      if (ngrokExitedEarly) {
        break;
      }
      try {
        const res = await fetch('http://127.0.0.1:4040/api/tunnels', {
          signal: AbortSignal.timeout(1000),
        });
        if (res.ok) {
          const data = await res.json();
          const tunnels = Array.isArray(data?.tunnels) ? data.tunnels : [];
          const httpsTunnel =
            tunnels.find((t) => String(t?.public_url || '').startsWith('https://')) ||
            tunnels.find((t) => t?.public_url);
          if (httpsTunnel?.public_url) {
            foundUrl = httpsTunnel.public_url;
            break;
          }
        }
      } catch {
        // aguarda API local 4040 subir
      }
      await new Promise((r) => setTimeout(r, 250));
    }

    if (!foundUrl) {
      const detail = ngrokExitInfo || 'Tempo limite (8s) ao iniciar túnel ngrok.';
      await stopNgrok();
      const needsToken = /4018|authtoken|auth/i.test(detail);
      ngrokError = needsToken
        ? 'ngrok precisa de um Authtoken válido. Cole seu token do painel ngrok.com e tente novamente.'
        : `Não foi possível abrir o túnel ngrok: ${detail}`;
      throw Object.assign(httpError(ngrokError, needsToken ? 400 : 502), {
        hint: needsToken
          ? 'Crie uma conta gratuita em dashboard.ngrok.com, copie seu Authtoken e cole no campo acima.'
          : 'Verifique se outra instância do ngrok já está ocupando a porta 4040 ou sua conexão de rede.',
      });
    }

    ngrokUrl = foundUrl;
    ngrokError = null;
    notifyChange();
    return getStatus();
  }

  async function updatePin({ pinEnabled, pinCode, clearPin = false } = {}) {
    saveRemoteConfigUpdates(config, {
      ...(pinEnabled !== undefined ? { pinEnabled } : {}),
      ...(pinCode !== undefined ? { pinCode } : {}),
      ...(clearPin ? { clearPin: true } : {}),
    });
    notifyChange();
    return getStatus();
  }

  async function getStatus() {
    const interfaces = discoverLanIpv4Addresses();
    const primaryIp = lanIpBound || interfaces[0]?.address || null;
    const lanActive = Boolean(lanServer && lanUrl);
    const ngrokBin = resolveNgrokPath();
    const ngrokActive = Boolean(ngrokProc && ngrokProc.exitCode === null && ngrokUrl);

    const [lanQrSvg, ngrokQrSvg] = await Promise.all([
      lanActive && lanUrl ? generateQrSvg(lanUrl) : Promise.resolve(null),
      ngrokActive && ngrokUrl ? generateQrSvg(ngrokUrl) : Promise.resolve(null),
    ]);

    return {
      ok: true,
      localUrl: `http://127.0.0.1:${mainPort}`,
      port: mainPort,
      lan: {
        enabled: lanActive,
        configuredEnabled: Boolean(config.remote?.lanEnabled),
        url: lanActive ? lanUrl : null,
        ip: primaryIp,
        port: lanActive ? lanPortBound : null,
        qrSvg: lanQrSvg,
        interfaces,
        error: lanError,
      },
      ngrok: {
        available: Boolean(ngrokBin),
        active: ngrokActive,
        url: ngrokActive ? ngrokUrl : null,
        qrSvg: ngrokQrSvg,
        hasAuthtoken: Boolean(config.remote?.ngrokAuthtoken),
        error: ngrokError,
      },
      pin: {
        enabled: Boolean(config.remote?.pinEnabled),
        configured: Boolean(config.remote?.pinCode),
      },
      // Aliases planos convenientes para o frontend
      lanEnabled: lanActive,
      lanUrl: lanActive ? lanUrl : null,
      lanIp: primaryIp,
      lanQrSvg,
      ngrokAvailable: Boolean(ngrokBin),
      ngrokActive,
      ngrokUrl: ngrokActive ? ngrokUrl : null,
      ngrokQrSvg,
      hasNgrokAuthtoken: Boolean(config.remote?.ngrokAuthtoken),
      pinEnabled: Boolean(config.remote?.pinEnabled),
      pinConfigured: Boolean(config.remote?.pinCode),
    };
  }

  async function initOnListen(actualPort) {
    if (Number.isFinite(Number(actualPort)) && Number(actualPort) > 0) {
      mainPort = Number(actualPort);
    }
    if (config.remote?.lanEnabled) {
      try {
        await startLanServerInternal();
      } catch (err) {
        lanError = err.message;
      }
    }
  }

  function cleanupSync() {
    if (ngrokProc && ngrokProc.exitCode === null) {
      try {
        ngrokProc.kill('SIGTERM');
      } catch {
        // ignora
      }
    }
    if (lanServer) {
      for (const sock of lanSockets) {
        try {
          sock.destroy();
        } catch {
          // ignora
        }
      }
      try {
        lanServer.closeAllConnections?.();
        lanServer.close();
      } catch {
        // ignora
      }
      lanServer = null;
    }
  }

  async function shutdown() {
    await Promise.allSettled([stopNgrok(), closeLanServerOnly()]);
  }

  return {
    getStatus,
    setLanEnabled,
    startNgrok,
    stopNgrok,
    updatePin,
    validatePinSubmission,
    setPinAuthCookie,
    enforceRemotePin,
    initOnListen,
    shutdown,
    cleanupSync,
  };
}
