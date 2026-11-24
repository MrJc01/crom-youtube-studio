import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createPinRateLimiter, verifySameOriginMutation } from '../src/middleware/security.mjs';
import { createRemoteAccessManager } from '../src/remote-access.mjs';

function makeTempConfig() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crom-test-sec-'));
  const wsDir = path.join(tmpDir, 'ws-mrj');
  fs.mkdirSync(wsDir, { recursive: true });
  const cfgPath = path.join(tmpDir, 'config.local.json');
  const raw = {
    port: 4179,
    host: '127.0.0.1',
    defaultChannel: 'mrj',
    kdenliveRoot: '',
    channels: {
      mrj: {
        name: 'MrJ',
        workspacePath: wsDir,
        seriesList: ['Imagine'],
      },
    },
    remote: {
      lanEnabled: false,
      pinEnabled: true,
      pinCode: '2468',
      ngrokAuthtoken: '',
    },
  };
  fs.writeFileSync(cfgPath, `${JSON.stringify(raw, null, 2)}\n`, 'utf8');
  return {
    tmpDir,
    config: {
      configPath: cfgPath,
      port: 4179,
      host: '127.0.0.1',
      defaultChannel: 'mrj',
      kdenliveRoot: '',
      kdenliveRootRaw: '',
      channelOrder: ['mrj'],
      channels: {
        mrj: {
          key: 'mrj',
          name: 'MrJ',
          workspacePath: wsDir,
          workspacePathRaw: wsDir,
          seriesList: ['Imagine'],
          spotlightSeries: [],
          links: {},
        },
      },
      remote: { ...raw.remote },
    },
  };
}

test('verifySameOriginMutation blocks cross-site/foreign origins (403) and allows same-origin and CLI', () => {
  assert.equal(
    verifySameOriginMutation({
      method: 'GET',
      headers: { 'sec-fetch-site': 'cross-site', origin: 'https://evil.example' },
    }),
    true
  );

  // CLI / curl sem Origin é permitido
  assert.equal(
    verifySameOriginMutation({
      method: 'POST',
      headers: { host: '127.0.0.1:4173' },
    }),
    true
  );

  // Same-origin localhost e IP LAN permitido
  assert.equal(
    verifySameOriginMutation({
      method: 'POST',
      headers: { host: '127.0.0.1:4173', origin: 'http://127.0.0.1:4173', 'sec-fetch-site': 'same-origin' },
    }),
    true
  );
  assert.equal(
    verifySameOriginMutation(
      {
        method: 'PUT',
        headers: { host: '192.168.1.50:4173', origin: 'http://192.168.1.50:4173' },
      },
      { allowedHosts: ['192.168.1.50:4173'] }
    ),
    true
  );
  assert.equal(
    verifySameOriginMutation({
      method: 'DELETE',
      headers: { host: 'abc.ngrok-free.app', origin: 'https://abc.ngrok-free.app' },
    }),
    true
  );

  // Cross-site explícito bloqueado (403)
  assert.throws(
    () =>
      verifySameOriginMutation({
        method: 'POST',
        headers: { host: '127.0.0.1:4173', 'sec-fetch-site': 'cross-site' },
      }),
    (err) => err.statusCode === 403
  );

  // Origin externo não autorizado bloqueado (403)
  assert.throws(
    () =>
      verifySameOriginMutation({
        method: 'POST',
        headers: { host: '192.168.1.50:4173', origin: 'https://attacker.evil.com' },
      }),
    (err) => err.statusCode === 403
  );

  // Origin null bloqueado (403)
  assert.throws(
    () =>
      verifySameOriginMutation({
        method: 'DELETE',
        headers: { host: '127.0.0.1:4173', origin: 'null' },
      }),
    (err) => err.statusCode === 403
  );
});

test('createPinRateLimiter locks IP after 5 failed attempts and reports 6th attempt blocked', () => {
  const limiter = createPinRateLimiter({ maxAttempts: 5, windowMs: 60_000, lockoutMs: 120_000 });
  const ip = '192.168.1.77';

  for (let i = 1; i <= 4; i++) {
    const pre = limiter.check(ip);
    assert.equal(pre.allowed, true);
    const fail = limiter.recordFailure(ip);
    assert.equal(fail.allowed, true);
    assert.equal(fail.remainingAttempts, 5 - i);
  }

  // 5ª tentativa dispara lockout
  const fifth = limiter.recordFailure(ip);
  assert.equal(fifth.allowed, false);
  assert.equal(fifth.remainingAttempts, 0);
  assert.ok(fifth.retryAfterSec > 0);

  // 6ª tentativa é bloqueada imediatamente em check()
  const sixth = limiter.check(ip);
  assert.equal(sixth.allowed, false);
  assert.equal(sixth.remainingAttempts, 0);
  assert.ok(sixth.retryAfterSec > 0);

  // Outro IP não é afetado
  assert.equal(limiter.check('192.168.1.88').allowed, true);

  // Reset libera novamente
  limiter.reset(ip);
  assert.equal(limiter.check(ip).allowed, true);
  assert.equal(limiter.check(ip).remainingAttempts, 5);
});

test('remote-access enforces PIN on external/proxied requests, allows loopback, and verifies HttpOnly cookie', async () => {
  const { tmpDir, config } = makeTempConfig();
  try {
    const remoteManager = createRemoteAccessManager({
      config,
      getRequestHandler: () => null,
    });

    function createMockRes() {
      const headers = {};
      return {
        statusCode: 0,
        headers,
        body: '',
        setHeader(k, v) {
          headers[k.toLowerCase()] = v;
        },
        writeHead(code, hdrs = {}) {
          this.statusCode = code;
          for (const [k, v] of Object.entries(hdrs)) {
            headers[k.toLowerCase()] = v;
          }
        },
        end(chunk = '') {
          this.body = String(chunk || '');
        },
      };
    }

    // Loopback direto passa sem PIN
    const resLoopback = createMockRes();
    const okLoopback = remoteManager.enforceRemotePin(
      { method: 'GET', headers: { host: '127.0.0.1:4179' }, socket: { remoteAddress: '127.0.0.1' } },
      resLoopback,
      '/api/state'
    );
    assert.equal(okLoopback, true);

    // Requisição externa (LAN IP) para API sem cookie recebe 401 JSON
    const resLanApi = createMockRes();
    const okLanApi = remoteManager.enforceRemotePin(
      { method: 'GET', headers: { host: '192.168.1.10:4179' }, socket: { remoteAddress: '192.168.1.99' } },
      resLanApi,
      '/api/state'
    );
    assert.equal(okLanApi, false);
    assert.equal(resLanApi.statusCode, 401);
    assert.equal(JSON.parse(resLanApi.body).pinRequired, true);

    // Requisição via proxy/ngrok para HTML sem cookie recebe 401 HTML
    const resNgrokHtml = createMockRes();
    const okNgrokHtml = remoteManager.enforceRemotePin(
      {
        method: 'GET',
        headers: { host: 'demo.ngrok-free.app', 'x-forwarded-for': '1.2.3.4' },
        socket: { remoteAddress: '127.0.0.1' },
      },
      resNgrokHtml,
      '/mrj'
    );
    assert.equal(okNgrokHtml, false);
    assert.equal(resNgrokHtml.statusCode, 401);
    assert.ok(resNgrokHtml.body.includes('Desbloquear Acesso'));

    // PIN válido gera cookie HttpOnly que libera o acesso subsequente
    const validRes = remoteManager.validatePinSubmission('2468', {
      headers: {},
      socket: { remoteAddress: '192.168.1.99' },
    });
    const isValid = typeof validRes === 'object' ? validRes.ok : Boolean(validRes);
    assert.equal(isValid, true);

    const cookieRes = createMockRes();
    remoteManager.setPinAuthCookie(
      { headers: {}, socket: { encrypted: false, remoteAddress: '192.168.1.99' } },
      cookieRes
    );
    const setCookie = String(cookieRes.headers['set-cookie'] || '');
    assert.ok(setCookie.includes('crom_remote_pin='));
    assert.ok(setCookie.includes('HttpOnly'));

    const cookiePair = setCookie.split(';')[0];
    const resAuthed = createMockRes();
    const okAuthed = remoteManager.enforceRemotePin(
      {
        method: 'GET',
        headers: { host: '192.168.1.10:4179', cookie: cookiePair },
        socket: { remoteAddress: '192.168.1.99' },
      },
      resAuthed,
      '/api/state'
    );
    assert.equal(okAuthed, true);

    await remoteManager.shutdown();
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
