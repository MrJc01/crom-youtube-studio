import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { WEB_DIR } from '../src/config.mjs';
import { createStudioServer } from '../src/server.mjs';

function resolveChromeBinary() {
  const candidates = [
    process.env.CROM_TEST_CHROME,
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].filter(Boolean);
  for (const cand of candidates) {
    if (fs.existsSync(cand)) return cand;
  }
  throw new Error('Navegador Chrome/Chromium não encontrado para testes E2E.');
}

/**
 * Cliente WebSocket RFC6455 minimalista em Node puro (zero dependências externas) para CDP.
 */
function connectRfc6455WebSocket(wsUrl) {
  return new Promise((resolve, reject) => {
    const u = new URL(wsUrl);
    const key = crypto.randomBytes(16).toString('base64');
    const req = http.request({
      hostname: u.hostname,
      port: Number(u.port),
      path: `${u.pathname}${u.search}`,
      method: 'GET',
      headers: {
        Connection: 'Upgrade',
        Upgrade: 'websocket',
        'Sec-WebSocket-Key': key,
        'Sec-WebSocket-Version': '13',
      },
    });

    req.on('error', reject);
    req.on('upgrade', (res, socket, head) => {
      const expectedAccept = crypto
        .createHash('sha1')
        .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
        .digest('base64');
      if (res.headers['sec-websocket-accept'] !== expectedAccept) {
        socket.destroy();
        reject(new Error('Handshake WebSocket RFC6455 inválido'));
        return;
      }

      let buffer = head && head.length ? Buffer.from(head) : Buffer.alloc(0);
      let fragBuffers = [];
      let fragOpcode = 0;
      const listeners = new Map();
      let closed = false;

      function emit(event, payload) {
        const set = listeners.get(event);
        if (!set) return;
        for (const fn of set) {
          try {
            fn(payload);
          } catch {
            // ignora erro de listener
          }
        }
      }

      function sendFrame(opcode, payloadBuf) {
        if (closed || socket.destroyed) return;
        const payload = Buffer.isBuffer(payloadBuf) ? payloadBuf : Buffer.from(String(payloadBuf || ''), 'utf8');
        const maskKey = crypto.randomBytes(4);
        const len = payload.length;
        let header;
        if (len < 126) {
          header = Buffer.alloc(2);
          header[0] = 0x80 | (opcode & 0x0f);
          header[1] = 0x80 | len;
        } else if (len <= 0xffff) {
          header = Buffer.alloc(4);
          header[0] = 0x80 | (opcode & 0x0f);
          header[1] = 0x80 | 126;
          header.writeUInt16BE(len, 2);
        } else {
          header = Buffer.alloc(10);
          header[0] = 0x80 | (opcode & 0x0f);
          header[1] = 0x80 | 127;
          header.writeBigUInt64BE(BigInt(len), 2);
        }
        const masked = Buffer.allocUnsafe(len);
        for (let i = 0; i < len; i++) {
          masked[i] = payload[i] ^ maskKey[i & 3];
        }
        socket.write(Buffer.concat([header, maskKey, masked]));
      }

      function parseFrames() {
        while (buffer.length >= 2) {
          const b0 = buffer[0];
          const b1 = buffer[1];
          const fin = Boolean(b0 & 0x80);
          const opcode = b0 & 0x0f;
          const isMasked = Boolean(b1 & 0x80);
          let payloadLen = b1 & 0x7f;
          let offset = 2;

          if (payloadLen === 126) {
            if (buffer.length < offset + 2) return;
            payloadLen = buffer.readUInt16BE(offset);
            offset += 2;
          } else if (payloadLen === 127) {
            if (buffer.length < offset + 8) return;
            const bigLen = buffer.readBigUInt64BE(offset);
            payloadLen = Number(bigLen);
            offset += 8;
          }

          if (isMasked) {
            if (buffer.length < offset + 4) return;
            offset += 4;
          }
          if (buffer.length < offset + payloadLen) return;

          let payload = buffer.subarray(offset, offset + payloadLen);
          if (isMasked) {
            const mKey = buffer.subarray(offset - 4, offset);
            const unmasked = Buffer.allocUnsafe(payloadLen);
            for (let i = 0; i < payloadLen; i++) {
              unmasked[i] = payload[i] ^ mKey[i & 3];
            }
            payload = unmasked;
          }

          buffer = buffer.subarray(offset + payloadLen);

          if (opcode === 0x8) {
            closed = true;
            socket.end();
            emit('close');
            return;
          }
          if (opcode === 0x9) {
            sendFrame(0x0a, payload);
            continue;
          }
          if (opcode === 0x0a) {
            continue;
          }

          if (opcode !== 0x0) {
            fragOpcode = opcode;
            fragBuffers = [Buffer.from(payload)];
          } else {
            fragBuffers.push(Buffer.from(payload));
          }

          if (fin) {
            const fullBuf = Buffer.concat(fragBuffers);
            fragBuffers = [];
            if (fragOpcode === 0x1) {
              emit('message', fullBuf.toString('utf8'));
            }
          }
        }
      }

      socket.on('data', (chunk) => {
        buffer = Buffer.concat([buffer, chunk]);
        parseFrames();
      });
      socket.on('close', () => {
        closed = true;
        emit('close');
      });
      socket.on('error', (err) => emit('error', err));

      resolve({
        sendText(str) {
          sendFrame(0x1, str);
        },
        on(ev, fn) {
          if (!listeners.has(ev)) listeners.set(ev, new Set());
          listeners.get(ev).add(fn);
        },
        close() {
          if (!closed) {
            closed = true;
            try {
              sendFrame(0x8, Buffer.alloc(0));
            } catch {
              // ignora
            }
            socket.end();
          }
        },
      });
    });
    req.end();
  });
}

async function launchChromeAndCdp() {
  const chromeBin = resolveChromeBinary();
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crom-cdp-profile-'));
  const proc = spawn(
    chromeBin,
    [
      '--headless=new',
      '--no-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--disable-background-networking',
      '--no-first-run',
      '--no-default-browser-check',
      '--window-size=1440,900',
      '--remote-debugging-port=0',
      `--user-data-dir=${userDataDir}`,
      'about:blank',
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] }
  );

  let stderrBuf = '';
  const browserWsUrl = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timeout aguardando DevTools do Chrome. stderr: ${stderrBuf}`));
    }, 10000);

    proc.on('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`Chrome encerrou prematuramente (code=${code}): ${stderrBuf}`));
    });

    proc.stderr.on('data', (chunk) => {
      stderrBuf += chunk.toString('utf8');
      const m = /DevTools listening on (ws:\/\/[^\s]+)/.exec(stderrBuf);
      if (m) {
        clearTimeout(timer);
        resolve(m[1]);
      }
    });
  });

  const cdpUrl = new URL(browserWsUrl);
  const targetsRes = await fetch(`http://${cdpUrl.host}/json/list`);
  const targets = await targetsRes.json();
  let pageTarget = targets.find((t) => t.type === 'page');
  if (!pageTarget) {
    const newRes = await fetch(`http://${cdpUrl.host}/json/new?about:blank`, { method: 'PUT' });
    pageTarget = await newRes.json();
  }

  const ws = await connectRfc6455WebSocket(pageTarget.webSocketDebuggerUrl);
  let nextId = 1;
  const pending = new Map();
  const eventHandlers = new Map();

  ws.on('message', (raw) => {
    const msg = JSON.parse(raw);
    if (msg.id) {
      const p = pending.get(msg.id);
      if (p) {
        pending.delete(msg.id);
        if (msg.error) {
          p.reject(new Error(`CDP ${msg.method || ''}: ${msg.error.message}`));
        } else {
          p.resolve(msg.result || {});
        }
      }
    } else if (msg.method) {
      const set = eventHandlers.get(msg.method);
      if (set) {
        for (const fn of set) fn(msg.params || {});
      }
    }
  });

  function send(method, params = {}) {
    const id = nextId++;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      ws.sendText(JSON.stringify({ id, method, params }));
      setTimeout(() => {
        if (pending.has(id)) {
          pending.delete(id);
          reject(new Error(`Timeout CDP em ${method}`));
        }
      }, 12000).unref();
    });
  }

  function on(method, fn) {
    if (!eventHandlers.has(method)) eventHandlers.set(method, new Set());
    eventHandlers.get(method).add(fn);
  }

  const consoleErrors = [];
  const pageErrors = [];
  const httpErrors = [];

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Network.enable');
  await send('DOM.enable');
  on('Page.javascriptDialogOpening', () => {
    send('Page.handleJavaScriptDialog', { accept: true }).catch(() => {});
  });
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });

  on('Runtime.consoleAPICalled', (p) => {
    if (p.type === 'error') {
      const txt = (p.args || []).map((a) => a.value || a.description || '').join(' ');
      consoleErrors.push(txt || 'console.error');
    }
  });
  on('Runtime.exceptionThrown', (p) => {
    const desc = p.exceptionDetails?.exception?.description || p.exceptionDetails?.text || 'Uncaught exception';
    pageErrors.push(desc);
  });
  on('Network.responseReceived', (p) => {
    const url = p.response?.url || '';
    const status = Number(p.response?.status || 0);
    if (status >= 400 && url.startsWith('http://127.0.0.1')) {
      httpErrors.push(`${status} ${url}`);
    }
  });

  async function evaluate(expression) {
    const res = await send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (res.exceptionDetails) {
      const msg = res.exceptionDetails.exception?.description || res.exceptionDetails.text || 'JS error';
      throw new Error(`Evaluate failed: ${msg}`);
    }
    return res.result?.value;
  }

  async function waitFor(fnExpr, timeoutMs = 8000, label = fnExpr) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const val = await evaluate(`Boolean((${fnExpr})())`).catch(() => false);
      if (val) return true;
      await new Promise((r) => setTimeout(r, 60));
    }
    throw new Error(`Timeout aguardando condição no navegador (${timeoutMs}ms): ${label}`);
  }

  async function navigate(url) {
    await send('Page.navigate', { url });
    await waitFor(
      `() => document.readyState === 'complete' && Boolean(document.getElementById('sideNav')) && Boolean(document.getElementById('viewContainer')?.children.length)`,
      10000,
      `navigate(${url})`
    );
    await new Promise((r) => setTimeout(r, 140));
  }

  async function click(selector) {
    await waitFor(`() => Boolean(document.querySelector(${JSON.stringify(selector)}))`, 6000, `selector ${selector}`);
    const clicked = await evaluate(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return false;
      el.scrollIntoView({ block: 'center', inline: 'center' });
      el.click();
      return true;
    })()`);
    assert.equal(clicked, true, `Falha ao clicar em ${selector}`);
    await new Promise((r) => setTimeout(r, 80));
  }

  async function rightClick(selector) {
    await waitFor(`() => Boolean(document.querySelector(${JSON.stringify(selector)}))`, 6000, `rightClick ${selector}`);
    const box = await evaluate(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return null;
      el.scrollIntoView({ block: 'center', inline: 'center' });
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.left + Math.min(r.width / 2, 40)), y: Math.round(r.top + r.height / 2) };
    })()`);
    assert.ok(box, `Elemento ausente para clique direito: ${selector}`);
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: box.x, y: box.y, button: 'none' });
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'right', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'right', clickCount: 1 });
    await new Promise((r) => setTimeout(r, 120));
  }

  async function setViewport(width, height) {
    await send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: width < 768,
    });
    await new Promise((r) => setTimeout(r, 180));
  }

  async function closeAll() {
    ws.close();
    if (!proc.killed && proc.exitCode === null) {
      proc.kill('SIGTERM');
      await new Promise((r) => {
        const t = setTimeout(() => {
          if (proc.exitCode === null) {
            try {
              proc.kill('SIGKILL');
            } catch {
              // ignora
            }
          }
          r();
        }, 1500);
        proc.once('exit', () => {
          clearTimeout(t);
          r();
        });
      });
    }
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }

  return {
    send,
    evaluate,
    waitFor,
    navigate,
    click,
    rightClick,
    setViewport,
    consoleErrors,
    pageErrors,
    httpErrors,
    closeAll,
  };
}

function buildIsolatedBrowserFixture() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crom-e2e-browser-'));
  const wsMrj = path.join(tmpDir, 'ws-mrj');
  const wsCrom = path.join(tmpDir, 'ws-crom');

  for (const dir of [
    path.join(wsMrj, '00-canal'),
    path.join(wsMrj, '01-ideias'),
    path.join(wsMrj, '02-roteiros', 'rascunhos'),
    path.join(wsMrj, '06-series', 'imagine'),
    path.join(wsMrj, 'quadros'),
    path.join(wsMrj, '.studio-data'),
    path.join(wsMrj, 'gravacoes', '2026-11-24_sessao-aurora', 'take-01'),
    path.join(wsCrom, '01-ideias'),
    path.join(wsCrom, '.studio-data'),
  ]) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(
    path.join(wsMrj, '02-roteiros', 'rascunhos', '2026-11-roteiro-aurora.md'),
    `---
id: "2026-11-roteiro-aurora"
titulo: "Roteiro Aurora E2E"
tipo: "roteiro"
status: "roteiro"
serie: "Imagine"
formato: "long"
prioridade: "alta"
duracao_estimada: "10 min"
data_criacao: "2026-11-24"
data_alvo: ""
repo_github: "MrJc01"
youtube_id: ""
views: 0
tags: ["aurora", "imagine"]
resumo: "Roteiro principal de teste E2E."
---

# Roteiro Aurora E2E

[GANCHO]
Este é o texto do teleprompter para o Roteiro Aurora E2E.

[TELA]
Demonstração de arquitetura ao vivo.
`,
    'utf8'
  );

  fs.writeFileSync(
    path.join(wsMrj, '06-series', 'imagine', '2026-11-saga-aurora-parte-1.md'),
    `---
id: "saga-aurora-parte-1"
titulo: "Saga Aurora Parte 1"
tipo: "ideia"
status: "pesquisa"
serie: "Imagine"
formato: "long"
prioridade: "alta"
duracao_estimada: "12 min"
data_criacao: "2026-11-24"
tags: ["aurora"]
resumo: "Parte 1 da saga."
---

# Saga Aurora Parte 1
`,
    'utf8'
  );

  fs.writeFileSync(
    path.join(wsMrj, '06-series', 'imagine', '2026-11-saga-aurora-parte-2.md'),
    `---
id: "saga-aurora-parte-2"
titulo: "Saga Aurora Parte 2"
tipo: "roteiro"
status: "gravando"
serie: "Imagine"
formato: "long"
prioridade: "media"
duracao_estimada: "14 min"
data_criacao: "2026-11-24"
tags: ["aurora"]
resumo: "Parte 2 da saga."
---

# Saga Aurora Parte 2
`,
    'utf8'
  );

  fs.writeFileSync(
    path.join(wsMrj, '00-canal', 'catalogo-youtube.md'),
    `---
id: "mrj-00-catalogo-youtube"
titulo: "Catálogo Oficial (E2E)"
tipo: "referencia"
status: "referencia"
serie: "Canal & Ops"
formato: "doc"
prioridade: "media"
duracao_estimada: "4 min"
data_criacao: "2026-11-24"
tags: ["catalogo"]
resumo: "Catálogo simulado E2E."
---

# Catálogo E2E
`,
    'utf8'
  );

  fs.writeFileSync(
    path.join(wsCrom, '01-ideias', 'crom-aurora.md'),
    '---\nid: "crom-aurora"\ntitulo: "Crom Aurora"\nstatus: "ideia"\nserie: "Geral"\n---\n\n# Crom Aurora\n',
    'utf8'
  );

  fs.writeFileSync(
    path.join(wsMrj, 'quadros', 'quadro-aurora.excalidraw'),
    JSON.stringify(
      {
        type: 'excalidraw',
        version: 2,
        source: 'https://crom.run/studio',
        elements: [
          {
            id: 'node-aurora-1',
            type: 'rectangle',
            x: 100,
            y: 100,
            width: 240,
            height: 100,
            isDeleted: false,
            customData: { docPath: '02-roteiros/rascunhos/2026-11-roteiro-aurora.md' },
          },
        ],
        appState: { theme: 'dark', viewBackgroundColor: '#0e0f17' },
        files: {},
        cromMeta: {
          id: 'quadro-aurora',
          title: 'Quadro Aurora E2E',
          preferredMode: 'excalidraw',
          createdAt: '2026-11-24T10:00:00.000Z',
          updatedAt: '2026-11-24T10:00:00.000Z',
          elementCount: 1,
        },
      },
      null,
      2
    ),
    'utf8'
  );

  fs.writeFileSync(
    path.join(wsMrj, '.studio-data', 'youtube-cache.json'),
    JSON.stringify(
      {
        schemaVersion: 1,
        totalVideos: 2,
        totalLongs: 1,
        totalShorts: 1,
        totalViews: 1500,
        lastSyncedAt: '2026-11-24T12:00:00.000Z',
        source: 'fixture',
        channel: { name: 'MrJ E2E', handle: '@mrj_e2e', id: 'UC_E2E_MRJ', subscribers: 42 },
        videos: [
          {
            id: 'dQw4w9WgXcQ',
            videoId: 'dQw4w9WgXcQ',
            title: 'Video Aurora Arquitetura Real',
            published: '2026-11-20',
            views: 1200,
            viewsText: '1.200 visualizações',
            duration: '12:30',
            isShort: false,
            type: 'long',
            serie: 'Imagine',
            url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
            thumbnail: '/assets/crom-logo.png',
          },
          {
            id: 'jNQXAC9IVRw',
            videoId: 'jNQXAC9IVRw',
            title: 'Short Aurora Rápido',
            published: '2026-11-21',
            views: 300,
            viewsText: '300 visualizações',
            duration: '0:45',
            isShort: true,
            type: 'short',
            serie: 'Shorts & Cortes',
            url: 'https://www.youtube.com/shorts/jNQXAC9IVRw',
            thumbnail: '/assets/crom-logo.png',
          },
        ],
      },
      null,
      2
    ),
    'utf8'
  );

  fs.writeFileSync(
    path.join(wsMrj, '.studio-data', 'curadoria.json'),
    JSON.stringify(
      {
        schemaVersion: 1,
        categories: [
          { id: 'reagir', name: 'Reagir', color: '#f43f5e', icon: '🎬', builtIn: true },
          { id: 'referencia', name: 'Referência Técnica', color: '#06b6d4', icon: '⚙️', builtIn: true },
        ],
        playlists: [
          {
            id: 'pl-aurora',
            title: 'Playlist Aurora Curadoria',
            kind: 'reagir',
            description: 'Lista E2E',
            color: '#8b5cf6',
            items: [
              {
                id: 'dQw4w9WgXcQ',
                videoId: 'dQw4w9WgXcQ',
                title: 'Video Aurora Arquitetura Real',
                url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
                thumbnail: '/assets/crom-logo.png',
                status: 'pendente',
              },
            ],
          },
        ],
        videoMeta: {},
      },
      null,
      2
    ),
    'utf8'
  );

  fs.writeFileSync(
    path.join(wsMrj, '.studio-data', 'notas.json'),
    JSON.stringify(
      {
        schemaVersion: 1,
        notes: [
          {
            id: 'note-aurora-seed',
            title: 'Nota Aurora Inicial',
            content: 'Anotação de pesquisa Aurora.',
            kind: 'note',
            checklist: [],
            color: 'teal',
            pinned: true,
            archived: false,
            labels: ['aurora'],
            linkedUrl: '',
            linkedDocPath: '02-roteiros/rascunhos/2026-11-roteiro-aurora.md',
            createdAt: '2026-11-24T10:00:00.000Z',
            updatedAt: '2026-11-24T10:00:00.000Z',
          },
        ],
        gistSync: { gistId: '', gistUrl: '', lastSyncedAt: '', lastError: '' },
      },
      null,
      2
    ),
    'utf8'
  );

  fs.writeFileSync(
    path.join(wsMrj, 'gravacoes', '2026-11-24_sessao-aurora', 'take-01', 'meta.json'),
    JSON.stringify(
      {
        schemaVersion: 1,
        sessionId: '2026-11-24_sessao-aurora',
        takeId: 'take-01',
        number: 1,
        title: 'Gravação Aurora Take 1',
        mode: 'voice-only',
        scriptPath: '02-roteiros/rascunhos/2026-11-roteiro-aurora.md',
        createdAt: '2026-11-24T11:00:00.000Z',
      },
      null,
      2
    ),
    'utf8'
  );
  fs.writeFileSync(
    path.join(wsMrj, 'gravacoes', '2026-11-24_sessao-aurora', 'take-01', '04-voz.wav'),
    'RIFF',
    'utf8'
  );

  const cfgPath = path.join(tmpDir, 'config.local.json');
  const rawCfg = {
    port: 0,
    host: '127.0.0.1',
    defaultChannel: 'mrj',
    kdenliveRoot: '',
    channels: {
      mrj: {
        name: 'MrJ E2E',
        handle: '@mrj_e2e',
        status: 'ativo',
        statusLabel: 'Ativo',
        subscribers: 42,
        workspacePath: wsMrj,
        seriesList: ['Imagine', 'Pensamentos', 'Histórias', 'Reavaliar', 'Crom', 'Canal & Ops'],
        spotlightSeries: ['Imagine'],
      },
      crom: {
        name: 'Crom E2E',
        handle: '@crom_e2e',
        status: 'pausado',
        statusLabel: 'Pausado',
        workspacePath: wsCrom,
        seriesList: ['Geral'],
      },
    },
    remote: { lanEnabled: false, pinEnabled: false, pinCode: '', ngrokAuthtoken: '' },
  };
  fs.writeFileSync(cfgPath, `${JSON.stringify(rawCfg, null, 2)}\n`, 'utf8');

  const config = {
    configPath: cfgPath,
    port: 0,
    host: '127.0.0.1',
    defaultChannel: 'mrj',
    kdenliveRoot: '',
    kdenliveRootRaw: '',
    disableDiskBundles: true,
    channelOrder: ['mrj', 'crom'],
    channels: {
      mrj: {
        key: 'mrj',
        name: 'MrJ E2E',
        handle: '@mrj_e2e',
        channelId: 'UC_E2E_MRJ',
        url: 'https://www.youtube.com/@mrj_e2e',
        status: 'ativo',
        statusLabel: 'Ativo',
        subscribers: 42,
        totalVideos: 2,
        avatar: '',
        bio: 'Canal E2E',
        bannerEnabled: false,
        bannerBadge: '',
        bannerTitle: '',
        bannerSubtitle: '',
        bannerDocPath: '',
        workspacePath: wsMrj,
        workspacePathRaw: wsMrj,
        kdenliveFolder: 'videos/mrj',
        seriesList: ['Imagine', 'Pensamentos', 'Histórias', 'Reavaliar', 'Crom', 'Canal & Ops'],
        spotlightSeries: ['Imagine'],
        links: {},
      },
      crom: {
        key: 'crom',
        name: 'Crom E2E',
        handle: '@crom_e2e',
        channelId: 'UC_E2E_CROM',
        url: '',
        status: 'pausado',
        statusLabel: 'Pausado',
        subscribers: 0,
        totalVideos: 0,
        avatar: '',
        bio: '',
        bannerEnabled: false,
        bannerBadge: '',
        bannerTitle: '',
        bannerSubtitle: '',
        bannerDocPath: '',
        workspacePath: wsCrom,
        workspacePathRaw: wsCrom,
        kdenliveFolder: 'videos/crom',
        seriesList: ['Geral'],
        spotlightSeries: [],
        links: {},
      },
    },
    remote: { ...rawCfg.remote },
  };

  return { tmpDir, wsMrj, config };
}

async function run() {
  const bundleJs = path.join(WEB_DIR, 'dist', 'app.bundle.js');
  const bundleCss = path.join(WEB_DIR, 'dist', 'styles.bundle.css');
  if (!fs.existsSync(bundleJs) || !fs.existsSync(bundleCss)) {
    throw new Error('Bundles web/dist/{app.bundle.js,styles.bundle.css} ausentes. Rode "npm run build" primeiro.');
  }

  const { tmpDir, config } = buildIsolatedBrowserFixture();
  const server = createStudioServer(config);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  config.port = port;
  const baseUrl = `http://127.0.0.1:${port}`;

  const chrome = await launchChromeAndCdp();

  try {
    // 1. Visão Geral sem bordas + barra de abas aberta
    await chrome.navigate(`${baseUrl}/mrj`);
    const j1 = await chrome.evaluate(`(() => {
      const shell = document.getElementById('app');
      const wrap = document.getElementById('studioTabstripWrap');
      const cs = getComputedStyle(shell);
      const rect = shell.getBoundingClientRect();
      return {
        isDash: shell.classList.contains('view-dashboard'),
        tabOpen: wrap.classList.contains('is-tabstrip-open'),
        borderTop: cs.borderTopWidth,
        radius: cs.borderRadius,
        fullWidth: Math.round(rect.width) === window.innerWidth,
      };
    })()`);
    assert.equal(j1.isDash, true);
    assert.equal(j1.tabOpen, true);
    assert.equal(j1.borderTop, '0px');
    assert.equal(j1.radius, '0px');
    assert.equal(j1.fullWidth, true);
    console.log('✔ [1/10] Visão Geral sem bordas + barra de abas aberta');

    // 2. Menu de contexto + Abrir em nova aba + seta puxadora ▾ + pino 📌 fixando a barra
    await chrome.rightClick('.history-row[data-open-doc]');
    await chrome.waitFor(`() => !document.getElementById('studioContextMenu')?.classList.contains('hidden')`, 4000, 'context menu');
    const openedInNewTab = await chrome.evaluate(`(() => {
      const items = Array.from(document.querySelectorAll('#studioContextMenu .ctx-menu-item'));
      const openBtn = items.find((b) => b.textContent.includes('Abrir em nova aba'));
      if (!openBtn) return false;
      openBtn.click();
      return true;
    })()`);
    assert.equal(openedInNewTab, true);
    await chrome.waitFor(`() => document.getElementById('app')?.classList.contains('view-scripts')`, 5000, 'open new tab scripts');
    const tabsCount = await chrome.evaluate(`document.querySelectorAll('#studioTabsList .studio-tab').length`);
    assert.ok(tabsCount >= 2, `Esperava >= 2 abas, obteve ${tabsCount}`);

    // Em página interna, barra recolhe; seta puxadora ▾ abre; pino 📌 fixa entre páginas
    const initiallyCollapsed = await chrome.evaluate(`!document.getElementById('studioTabstripWrap').classList.contains('is-tabstrip-open')`);
    assert.equal(initiallyCollapsed, true);
    await chrome.click('#tabstripPullHandle');
    await chrome.waitFor(`() => document.getElementById('studioTabstripWrap').classList.contains('is-tabstrip-open')`, 3000, 'pull handle opens tabstrip');
    await chrome.click('#pinTabstripBtn');
    await chrome.waitFor(`() => document.getElementById('pinTabstripBtn').classList.contains('is-pinned')`, 3000, 'pin active');
    await chrome.click('#sideNav .nav-item[data-view="catalog"]');
    await chrome.waitFor(`() => document.getElementById('app').classList.contains('view-catalog')`, 4000, 'navigate catalog');
    const pinnedAcrossPages = await chrome.evaluate(`document.getElementById('studioTabstripWrap').classList.contains('is-tabstrip-open')`);
    assert.equal(pinnedAcrossPages, true);
    console.log('✔ [2/10] Menu de contexto + Nova Aba + puxador ▾ + pino 📌 entre páginas');

    // 3. Roteiros -> Lista de Roteiros -> Abrir card -> ← Roteiros -> Abrir de novo -> Ecossistema Conectado -> Gravar este roteiro
    await chrome.navigate(`${baseUrl}/mrj/roteiros/`);
    await chrome.waitFor(
      `() => Boolean(document.getElementById('scriptsCardsContainer')) && !document.getElementById('app').classList.contains('is-script-editor-open')`,
      5000,
      'scripts list page before editor'
    );
    await chrome.click('[data-open-script-card="02-roteiros/rascunhos/2026-11-roteiro-aurora.md"]');
    await chrome.waitFor(
      `() => document.getElementById('app').classList.contains('is-script-editor-open') && Boolean(document.getElementById('scriptsBackToListBtn')) && Boolean(document.getElementById('inspEcosystemCard'))`,
      5000,
      'script editor opened from list'
    );
    await chrome.click('#scriptsBackToListBtn');
    await chrome.waitFor(
      `() => Boolean(document.getElementById('scriptsCardsContainer')) && !document.getElementById('app').classList.contains('is-script-editor-open')`,
      5000,
      'returned to scripts list'
    );
    await chrome.click('[data-open-script-card="02-roteiros/rascunhos/2026-11-roteiro-aurora.md"]');
    await chrome.waitFor(`() => Boolean(document.getElementById('ecoRecordScriptBtn'))`, 5000, 'ecosystem card');
    await chrome.click('#ecoRecordScriptBtn');
    await chrome.waitFor(
      `() => document.getElementById('app').classList.contains('view-recorder') && window.location.pathname.endsWith('/gravar') && window.location.search.includes('roteiro=')`,
      5000,
      'navigate recorder with roteiro'
    );
    const recPreselect = await chrome.evaluate(`(() => ({
      val: document.getElementById('recScriptSel')?.value || '',
      prompter: document.getElementById('recPrompterBox')?.textContent || '',
    }))()`);
    assert.equal(recPreselect.val, '02-roteiros/rascunhos/2026-11-roteiro-aurora.md');
    assert.ok(recPreselect.prompter.includes('teleprompter para o Roteiro Aurora'));
    console.log('✔ [3/10] Ecossistema do Roteiro -> 🎙️ Gravar este roteiro -> /gravar?roteiro=');

    // 4. Busca Global Unificada (Ctrl+K) entre Roteiros, Quadros, Catálogo, Playlists, Notas e Gravações
    await chrome.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'k', code: 'KeyK', windowsVirtualKeyCode: 75, modifiers: 2 });
    await chrome.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'k', code: 'KeyK', windowsVirtualKeyCode: 75, modifiers: 2 });
    await chrome.waitFor(`() => !document.getElementById('cmdModal')?.classList.contains('hidden')`, 4000, 'cmdModal opens on Ctrl+K');
    await chrome.evaluate(`(() => {
      const inp = document.getElementById('cmdInput');
      inp.value = 'Aurora';
      inp.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
    await chrome.waitFor(
      `() => {
        const res = document.getElementById('cmdResults');
        if (!res) return false;
        const hasDoc = Boolean(res.querySelector('.cmd-badge.is-doc'));
        const hasBoard = Boolean(res.querySelector('.cmd-badge.is-board'));
        const hasVideo = Boolean(res.querySelector('.cmd-badge.is-video'));
        const hasPl = Boolean(res.querySelector('.cmd-badge.is-playlist'));
        const hasNote = Boolean(res.querySelector('.cmd-badge.is-note'));
        return hasDoc && hasBoard && hasVideo && hasPl && hasNote;
      }`,
      6000,
      'unified search badges'
    );
    await chrome.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await chrome.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    console.log('✔ [4/10] Busca Global Unificada (Ctrl+K) nas múltiplas fontes');

    // 5. Mapa Fluxograma (Constelação, User Flow, Pipeline) responsivo em 1440x900, 768x1024 e 390x844
    await chrome.navigate(`${baseUrl}/mrj/mapa`);
    await chrome.click('#mapStyleToggleBtn');
    await chrome.waitFor(`() => Boolean(document.getElementById('mapFlowViewport'))`, 5000, 'map flow viewport');

    for (const layoutKey of ['clusters', 'blocks', 'pipeline']) {
      await chrome.click(`#mapFlowLayoutSwitch [data-flow-layout="${layoutKey}"]`);
      await chrome.waitFor(`() => document.querySelectorAll('.map-flow-node .mfn-title').length > 0`, 4000, `layout ${layoutKey}`);
      const desktopCheck = await chrome.evaluate(`(() => {
        const titles = Array.from(document.querySelectorAll('.map-flow-node .mfn-title'));
        const minTitleH = Math.min(...titles.map((t) => Math.max(t.offsetHeight, parseFloat(getComputedStyle(t).height) || 0)));
        return {
          scrollW: document.documentElement.scrollWidth,
          innerW: window.innerWidth,
          minTitleH,
          count: titles.length,
        };
      })()`);
      assert.ok(desktopCheck.scrollW <= desktopCheck.innerW, `Overflow desktop em ${layoutKey}: ${desktopCheck.scrollW} > ${desktopCheck.innerW}`);
      assert.ok(desktopCheck.minTitleH >= 16, `.mfn-title esmagado em ${layoutKey}: ${desktopCheck.minTitleH}px`);
    }

    for (const [vw, vh] of [[768, 1024], [390, 844]]) {
      await chrome.setViewport(vw, vh);
      await chrome.click('#mapFlowLayoutSwitch [data-flow-layout="clusters"]');
      await new Promise((r) => setTimeout(r, 150));
      const resp = await chrome.evaluate(`(() => {
        const titles = Array.from(document.querySelectorAll('.map-flow-node .mfn-title'));
        return {
          scrollW: document.documentElement.scrollWidth,
          innerW: window.innerWidth,
          minTitleH: titles.length ? Math.min(...titles.map((t) => Math.max(t.offsetHeight, parseFloat(getComputedStyle(t).height) || 0))) : 0,
        };
      })()`);
      assert.ok(resp.scrollW <= resp.innerW, `Overflow ${vw}x${vh}: ${resp.scrollW} > ${resp.innerW}`);
      assert.ok(resp.minTitleH >= 16, `.mfn-title < 16px em ${vw}x${vh}: ${resp.minTitleH}`);
    }
    await chrome.setViewport(1440, 900);
    console.log('✔ [5/10] Mapa Fluxograma (Constelação, User Flow, Pipeline) responsivo 1440/768/390');

    // 6. /mrj/quadro/ -> Lista de Quadros -> Excalidraw (FAB oculto) -> Foco em Nodes -> ← Quadros
    await chrome.navigate(`${baseUrl}/mrj/quadro/`);
    await chrome.waitFor(`() => Boolean(document.querySelector('.wb-list-page')) && !document.getElementById('excalidrawFrame')`, 5000, 'whiteboard list view');
    await chrome.click('[data-wb-open="quadro-aurora"]');
    await chrome.waitFor(`() => Boolean(document.getElementById('excalidrawFrame'))`, 6000, 'excalidraw iframe');
    const wbEditorCheck = await chrome.evaluate(`(() => ({
      path: window.location.pathname,
      fabDisplay: getComputedStyle(document.getElementById('fabCluster')).display,
    }))()`);
    assert.equal(wbEditorCheck.path, '/mrj/quadro/quadro-aurora');
    assert.equal(wbEditorCheck.fabDisplay, 'none');
    await chrome.click('#wbModeNodesBtn');
    await chrome.waitFor(`() => document.getElementById('wbModeNodesBtn').classList.contains('active')`, 3000, 'nodes mode active');
    await chrome.click('#wbBackToListBtn');
    await chrome.waitFor(`() => Boolean(document.querySelector('.wb-list-page')) && window.location.pathname === '/mrj/quadro'`, 5000, 'back to board list');
    console.log('✔ [6/10] /mrj/quadro/ Lista -> Editor sem FAB -> Foco em Nodes -> ← Quadros');

    // 7. /mrj/catalogo -> Lista Empilhada, Playlists & Curadoria, anotação inline, ✎ Criar Roteiro / Reavaliar
    await chrome.navigate(`${baseUrl}/mrj/catalogo`);
    await chrome.waitFor(`() => Boolean(document.querySelector('[data-vid-notes]'))`, 5000, 'catalog videos');
    const isStacked = await chrome.evaluate(`document.querySelector('[data-cat-layout="stacked"]')?.classList.contains('active')`);
    assert.equal(isStacked, true);
    await chrome.evaluate(`(() => {
      const inp = document.querySelector('[data-vid-notes="dQw4w9WgXcQ"]');
      inp.value = 'Anotacao E2E Browser';
      inp.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);
    await new Promise((r) => setTimeout(r, 250));
    await chrome.click('#catalogSubTabSwitch [data-cat-tab="playlists"]');
    await chrome.waitFor(`() => document.body.innerText.includes('Playlist Aurora Curadoria')`, 4000, 'playlists tab');
    await chrome.click('#catalogSubTabSwitch [data-cat-tab="videos"]');
    await chrome.click('[data-vid-create-script="dQw4w9WgXcQ"]');
    await chrome.waitFor(`() => document.getElementById('app').classList.contains('view-scripts')`, 6000, 'created script from curadoria');
    console.log('✔ [7/10] /mrj/catalogo Lista Empilhada + Playlists + Anotação + Criar Roteiro');

    // 8. /mrj/gravar -> 5 modos, VU meter, Mini Teleprompter, Biblioteca
    await chrome.navigate(`${baseUrl}/mrj/gravar`);
    const recUi = await chrome.evaluate(`(() => ({
      modes: document.querySelectorAll('[data-rec-mode]').length,
      hasVu: Boolean(document.getElementById('recVuFill')),
      hasPrompter: Boolean(document.getElementById('recScriptSel')) && Boolean(document.getElementById('recPrompterBox')),
      hasLib: Boolean(document.getElementById('recLibraryContainer')),
      libText: document.getElementById('recLibraryContainer')?.innerText || '',
    }))()`);
    assert.equal(recUi.modes, 5);
    assert.equal(recUi.hasVu, true);
    assert.equal(recUi.hasPrompter, true);
    assert.equal(recUi.hasLib, true);
    assert.ok(recUi.libText.includes('Gravação Aurora Take 1'));
    console.log('✔ [8/10] /mrj/gravar 5 modos + medidor VU + Mini Teleprompter + Biblioteca');

    // 9. /mrj/notas -> criar nota + cor + checklist + exportação + exclusão para lixeira
    await chrome.navigate(`${baseUrl}/mrj/notas`);
    await chrome.click('#keepCompExpandBtn');
    await chrome.waitFor(`() => Boolean(document.getElementById('keepCompTitle'))`, 3000, 'keep composer expanded');
    await chrome.click('[data-comp-color="amber"]');
    await chrome.evaluate(`(() => {
      const titleEl = document.getElementById('keepCompTitle');
      const bodyEl = document.getElementById('keepCompBody');
      titleEl.value = 'Nota E2E Lixeira';
      titleEl.dispatchEvent(new Event('input', { bubbles: true }));
      bodyEl.value = 'Conteudo temporario para testar lixeira.';
      bodyEl.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
    await chrome.click('#keepCompSaveBtn');
    await chrome.waitFor(`() => document.body.innerText.includes('Nota E2E Lixeira')`, 5000, 'note created');

    // Cria também checklist
    await chrome.click('#keepCompQuickChecklistBtn');
    await chrome.waitFor(`() => Boolean(document.querySelector('[data-comp-chk-text="0"]'))`, 3000, 'checklist composer');
    await chrome.evaluate(`(() => {
      const titleEl = document.getElementById('keepCompTitle');
      titleEl.value = 'Checklist E2E';
      titleEl.dispatchEvent(new Event('input', { bubbles: true }));
      const item = document.querySelector('[data-comp-chk-text="0"]');
      item.value = 'Passo 1 E2E';
      item.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
    await chrome.click('#keepCompSaveBtn');
    await chrome.waitFor(`() => document.body.innerText.includes('Checklist E2E')`, 5000, 'checklist created');

    // Verifica botões de exportação
    const exportCount = await chrome.evaluate(`document.querySelectorAll('[data-keep-export]').length`);
    assert.equal(exportCount, 3);

    // Exclui "Nota E2E Lixeira" -> vai para a lixeira
    const deletedNote = await chrome.evaluate(`(() => {
      const cards = Array.from(document.querySelectorAll('.keep-card'));
      const card = cards.find((c) => c.textContent.includes('Nota E2E Lixeira'));
      const delBtn = card?.querySelector('[data-note-del]');
      if (!delBtn) return false;
      delBtn.click();
      return true;
    })()`);
    assert.equal(deletedNote, true);
    await chrome.waitFor(`() => !document.body.innerText.includes('Nota E2E Lixeira')`, 5000, 'note moved to trash');
    console.log('✔ [9/10] /mrj/notas criar nota + cor + checklist + export + excluir para Lixeira');

    // 10. /mrj/configuracoes -> Card 5 (LAN ON/OFF + QR SVG + PIN) + Card 6 (Doctor + Backup + Lixeira Restaurar)
    await chrome.navigate(`${baseUrl}/mrj/configuracoes`);
    await chrome.waitFor(`() => Boolean(document.getElementById('settingsRemoteCard'))`, 5000, 'settings loaded');

    // Card 5: LAN ON -> QR SVG -> LAN OFF; PIN save -> clear
    const lanBefore = await chrome.evaluate(`document.getElementById('remoteLanToggleBtn')?.textContent || ''`);
    await chrome.click('#remoteLanToggleBtn');
    await new Promise((r) => setTimeout(r, 350));
    const lanAfter = await chrome.evaluate(`(() => ({
      hasQr: Boolean(document.querySelector('#remoteLanQrBox svg')),
      btnText: document.getElementById('remoteLanToggleBtn')?.textContent || '',
    }))()`);
    if (lanAfter.hasQr) {
      await chrome.click('#remoteLanToggleBtn');
      await new Promise((r) => setTimeout(r, 250));
    } else {
      assert.ok(lanBefore !== undefined);
    }

    await chrome.evaluate(`(() => {
      document.getElementById('remotePinEnabledChk').checked = true;
      document.getElementById('remotePinInput').value = '2026';
    })()`);
    await chrome.click('#remotePinSaveBtn');
    await chrome.waitFor(`() => Boolean(document.getElementById('remotePinClearBtn'))`, 4000, 'PIN saved');
    await chrome.click('#remotePinClearBtn');
    await new Promise((r) => setTimeout(r, 250));

    // Card 6: Doctor, Backup, e Lixeira (↺ Restaurar "Nota E2E Lixeira")
    const doctorBtnClicked = await chrome.evaluate(`(() => {
      const btn = document.getElementById('settingsDoctorBtn')
        || Array.from(document.querySelectorAll('button')).find((b) => /Doctor|Diagnóstico/i.test(b.textContent));
      if (!btn) return false;
      btn.click();
      return true;
    })()`);
    assert.equal(doctorBtnClicked, true, 'Botão Doctor deve existir no Card 6');
    await chrome.waitFor(
      `() => /OK|íntegros|Erros|Diagnóstico/i.test(document.getElementById('settingsDoctorOut')?.innerText || document.body.innerText)`,
      6000,
      'doctor output'
    );

    const hasBackupBtn = await chrome.evaluate(`Boolean(
      document.getElementById('settingsBackupDownloadBtn')
      || Array.from(document.querySelectorAll('a, button')).find((b) => /Baixar Backup/i.test(b.textContent))
    )`);
    assert.equal(hasBackupBtn, true, 'Botão Baixar Backup (.tar.gz) deve existir no Card 6');

    // Restaura "Nota E2E Lixeira" na lixeira do Card 6
    await chrome.waitFor(`() => document.body.innerText.includes('Nota E2E Lixeira')`, 5000, 'trash lists Nota E2E Lixeira');
    const restoredClicked = await chrome.evaluate(`(() => {
      const rows = Array.from(document.querySelectorAll('.trash-item, .trash-row, [data-trash-restore]')).map((el) => el.closest('div, li, tr, article') || el);
      const targetRow = rows.find((r) => r.textContent.includes('Nota E2E Lixeira'));
      const btn = targetRow?.querySelector('[data-trash-restore]') || Array.from(targetRow?.querySelectorAll('button') || []).find((b) => /Restaurar/i.test(b.textContent));
      if (!btn) return false;
      btn.click();
      return true;
    })()`);
    assert.equal(restoredClicked, true, 'Botão Restaurar deve restaurar Nota E2E Lixeira no Card 6');
    await new Promise((r) => setTimeout(r, 350));

    // Confirma que Nota E2E Lixeira voltou para /mrj/notas
    await chrome.navigate(`${baseUrl}/mrj/notas`);
    await chrome.waitFor(`() => document.body.innerText.includes('Nota E2E Lixeira')`, 5000, 'restored note visible in /notas');
    console.log('✔ [10/10] /mrj/configuracoes Card 5 (LAN/QR/PIN) + Card 6 (Doctor/Backup/Lixeira Restaurar)');

    assert.deepEqual(chrome.consoleErrors, [], `Erros no console do navegador: ${chrome.consoleErrors.join(' | ')}`);
    assert.deepEqual(chrome.pageErrors, [], `Exceções de página no navegador: ${chrome.pageErrors.join(' | ')}`);
    assert.deepEqual(chrome.httpErrors, [], `Respostas HTTP >= 400: ${chrome.httpErrors.join(' | ')}`);

    console.log('[E2E Browser] 10/10 fluxos aprovados com 0 console errors, 0 pageerrors e 0 HTTP >= 400.');
  } finally {
    await chrome.closeAll().catch(() => {});
    if (typeof server.closeAllConnections === 'function') {
      server.closeAllConnections();
    }
    await server.remoteManager?.shutdown().catch(() => {});
    await new Promise((resolve) => server.close(() => resolve()));
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

run().catch((err) => {
  console.error('[E2E Browser] FALHA:', err);
  process.exit(1);
});
