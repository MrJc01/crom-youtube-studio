import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createStudioServer } from '../src/server.mjs';
import { createStateCache } from '../src/state-cache.mjs';

function makeIsolatedEnv(prefix = 'crom-test-api-') {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const wsMrj = path.join(tmpDir, 'ws-mrj');
  const wsCrom = path.join(tmpDir, 'ws-crom');
  fs.mkdirSync(path.join(wsMrj, '01-ideias'), { recursive: true });
  fs.mkdirSync(path.join(wsMrj, '02-roteiros', 'rascunhos'), { recursive: true });
  fs.mkdirSync(path.join(wsMrj, 'quadros'), { recursive: true });
  fs.mkdirSync(path.join(wsMrj, '.studio-data'), { recursive: true });
  fs.mkdirSync(path.join(wsCrom, '01-ideias'), { recursive: true });

  fs.writeFileSync(
    path.join(wsMrj, 'AGENTS.md'),
    '---\nid: "agents"\ntitulo: "AGENTS"\nstatus: "referencia"\n---\n\n# AGENTS\n',
    'utf8'
  );
  fs.writeFileSync(
    path.join(wsCrom, '01-ideias', 'crom-base.md'),
    '---\nid: "crom-1"\ntitulo: "Crom Base"\nstatus: "ideia"\n---\n\n# Crom\n',
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
        name: 'MrJ Test',
        workspacePath: wsMrj,
        seriesList: ['Imagine', 'Reavaliar', 'Pensamentos'],
      },
      crom: {
        name: 'Crom Test',
        workspacePath: wsCrom,
        seriesList: ['Geral'],
      },
    },
    remote: {
      lanEnabled: false,
      pinEnabled: false,
      pinCode: '',
      ngrokAuthtoken: '',
    },
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
        name: 'MrJ Test',
        handle: '@mrj_test',
        channelId: '',
        url: '',
        status: 'ativo',
        statusLabel: 'Ativo',
        subscribers: 0,
        totalVideos: null,
        avatar: '',
        bio: '',
        bannerEnabled: false,
        bannerBadge: '',
        bannerTitle: '',
        bannerSubtitle: '',
        bannerDocPath: '',
        workspacePath: wsMrj,
        workspacePathRaw: wsMrj,
        kdenliveFolder: 'videos/mrj',
        seriesList: ['Imagine', 'Reavaliar', 'Pensamentos'],
        spotlightSeries: [],
        links: {},
      },
      crom: {
        key: 'crom',
        name: 'Crom Test',
        handle: '@crom_test',
        channelId: '',
        url: '',
        status: 'ativo',
        statusLabel: 'Ativo',
        subscribers: 0,
        totalVideos: null,
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

  return { tmpDir, wsMrj, wsCrom, config };
}

async function startServer(config) {
  const server = createStudioServer(config);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  const port = addr.port;
  config.port = port;
  return { server, baseUrl: `http://127.0.0.1:${port}` };
}

async function closeServer(server) {
  if (!server) return;
  if (typeof server.closeAllConnections === 'function') {
    server.closeAllConnections();
  }
  await server.remoteManager?.shutdown().catch(() => {});
  await new Promise((resolve) => server.close(() => resolve()));
}

test('API integration: doc CRUD + trash restore + SSE + notes recovery + curadoria + doctor + backup + remote 429', async () => {
  const { tmpDir, wsMrj, config } = makeIsolatedEnv();
  const { server, baseUrl } = await startServer(config);
  const sseController = new AbortController();

  try {
    // 1. Health & initial state
    const healthRes = await fetch(`${baseUrl}/api/health`);
    assert.equal(healthRes.status, 200);
    const health = await healthRes.json();
    assert.equal(health.ok, true);
    assert.deepEqual(health.channels, ['mrj', 'crom']);

    const stateRes = await fetch(`${baseUrl}/api/state`);
    assert.equal(stateRes.status, 200);
    const stateJson = await stateRes.json();
    assert.ok(stateJson.channels.mrj);
    assert.ok(stateJson.channels.crom);

    // 2. SSE connection & live doc creation event
    const sseRes = await fetch(`${baseUrl}/api/events`, { signal: sseController.signal });
    assert.equal(sseRes.status, 200);
    const sseReader = sseRes.body.getReader();
    const decoder = new TextDecoder();
    let sseBuffer = '';

    async function readSseUntil(predicate, timeoutMs = 4000) {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        if (predicate(sseBuffer)) return sseBuffer;
        const chunkPromise = sseReader.read();
        const timerPromise = new Promise((_, rej) =>
          setTimeout(() => rej(new Error(`Timeout aguardando SSE: ${sseBuffer}`)), Math.max(50, deadline - Date.now()))
        );
        const { value, done } = await Promise.race([chunkPromise, timerPromise]);
        if (done) break;
        sseBuffer += decoder.decode(value, { stream: true });
      }
      assert.ok(predicate(sseBuffer), `Evento SSE esperado não chegou: ${sseBuffer}`);
      return sseBuffer;
    }

    await readSseUntil((buf) => buf.includes('event: ready'));

    // 3. CSRF block on cross-site mutation
    const csrfBlocked = await fetch(`${baseUrl}/api/doc`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Sec-Fetch-Site': 'cross-site',
      },
      body: JSON.stringify({ channel: 'mrj', filename: 'csrf-evil', content: 'x' }),
    });
    assert.equal(csrfBlocked.status, 403);

    // 4. Create doc -> SSE update -> PUT update -> DELETE to trash -> Restore from trash
    const docBody = '---\nid: "teste-api"\ntitulo: "Roteiro API"\nstatus: "ideia"\n---\n\n# Roteiro API\n';
    const createDocRes = await fetch(`${baseUrl}/api/doc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channel: 'mrj',
        folder: '01-ideias',
        filename: 'roteiro-api',
        content: docBody,
      }),
    });
    assert.equal(createDocRes.status, 201);
    const createdDoc = await createDocRes.json();
    assert.equal(createdDoc.ok, true);
    assert.equal(createdDoc.path, '01-ideias/roteiro-api.md');
    assert.equal(fs.existsSync(path.join(wsMrj, createdDoc.path)), true);

    await readSseUntil((buf) => buf.includes('"reason":"doc-create"') && buf.includes('01-ideias/roteiro-api.md'));

    const updatedDocBody = `${docBody}\nLinha adicionada.\n`;
    const putDocRes = await fetch(`${baseUrl}/api/doc`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channel: 'mrj',
        path: createdDoc.path,
        content: updatedDocBody,
      }),
    });
    assert.equal(putDocRes.status, 200);

    // Proteção de AGENTS.md e traversal
    const delProtected = await fetch(`${baseUrl}/api/doc?channel=mrj&path=AGENTS.md`, { method: 'DELETE' });
    assert.equal(delProtected.status, 403);
    const delTraversal = await fetch(`${baseUrl}/api/doc?channel=mrj&path=../evil.md`, { method: 'DELETE' });
    assert.equal(delTraversal.status, 403);

    // DELETE move para lixeira
    const delDocRes = await fetch(`${baseUrl}/api/doc?channel=mrj&path=${encodeURIComponent(createdDoc.path)}`, {
      method: 'DELETE',
    });
    assert.equal(delDocRes.status, 200);
    const delDocJson = await delDocRes.json();
    assert.equal(fs.existsSync(path.join(wsMrj, createdDoc.path)), false);
    assert.ok(delDocJson.trashed?.id);

    const trashListRes = await fetch(`${baseUrl}/api/trash?channel=mrj`);
    assert.equal(trashListRes.status, 200);
    const trashList = await trashListRes.json();
    assert.ok(trashList.items.some((it) => it.id === delDocJson.trashed.id && it.kind === 'doc'));

    // Restore from trash
    const restoreRes = await fetch(`${baseUrl}/api/trash/restore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel: 'mrj', id: delDocJson.trashed.id }),
    });
    assert.equal(restoreRes.status, 200);
    const restoreJson = await restoreRes.json();
    assert.equal(restoreJson.ok, true);
    assert.equal(fs.existsSync(path.join(wsMrj, createdDoc.path)), true);
    assert.equal(fs.readFileSync(path.join(wsMrj, createdDoc.path), 'utf8'), updatedDocBody);

    // 5. Notes CRUD + corruption recovery
    const noteCreate1 = await fetch(`${baseUrl}/api/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel: 'mrj', title: 'Nota Keep 1', content: 'Conteudo 1' }),
    });
    assert.equal(noteCreate1.status, 201);
    const note1 = (await noteCreate1.json()).note;

    const noteUpdate = await fetch(`${baseUrl}/api/notes`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel: 'mrj', id: note1.id, title: 'Nota Keep Editada', pinned: true }),
    });
    assert.equal(noteUpdate.status, 200);

    // Agora notas.json tem .bak válido da gravação anterior; corrompemos o principal!
    const notasPath = path.join(wsMrj, '.studio-data', 'notas.json');
    assert.equal(fs.existsSync(`${notasPath}.bak`), true);
    fs.writeFileSync(notasPath, '{"notes": [BROKEN_CORRUPT', 'utf8');

    const notesRecoveredRes = await fetch(`${baseUrl}/api/notes?channel=mrj`);
    assert.equal(notesRecoveredRes.status, 200);
    const notesRecovered = await notesRecoveredRes.json();
    assert.equal(notesRecovered.notes.length, 1);
    assert.equal(notesRecovered.notes[0].id, note1.id);
    const quarantineDir = path.join(wsMrj, '.studio-data', 'quarantine');
    assert.equal(fs.existsSync(quarantineDir), true);
    assert.ok(fs.readdirSync(quarantineDir).some((f) => f.includes('notas.json.corrupted')));

    // Delete nota -> vai para lixeira -> restaura via /api/trash/restore
    const noteDeleteRes = await fetch(
      `${baseUrl}/api/notes?channel=mrj&id=${encodeURIComponent(note1.id)}`,
      { method: 'DELETE' }
    );
    assert.equal(noteDeleteRes.status, 200);
    const trashAfterNoteDel = await (await fetch(`${baseUrl}/api/trash?channel=mrj`)).json();
    const trashedNote = trashAfterNoteDel.items.find((it) => it.kind === 'note');
    assert.ok(trashedNote, 'Nota excluída deve ir para a lixeira recuperável');

    const restoreNoteRes = await fetch(`${baseUrl}/api/trash/restore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel: 'mrj', id: trashedNote.id }),
    });
    assert.equal(restoreNoteRes.status, 200);
    const notesAfterRestore = await (await fetch(`${baseUrl}/api/notes?channel=mrj`)).json();
    assert.ok(notesAfterRestore.notes.some((n) => n.id === note1.id));

    // 6. Curadoria CRUD
    const curGet = await (await fetch(`${baseUrl}/api/curadoria?channel=mrj`)).json();
    assert.equal(curGet.ok, true);
    assert.ok(Array.isArray(curGet.curadoria.categories));

    const plCreate = await fetch(`${baseUrl}/api/curadoria/playlists`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channel: 'mrj',
        mode: 'manual',
        title: 'Lista QA',
        kind: 'reagir',
      }),
    });
    assert.equal(plCreate.status, 201);
    const plJson = await plCreate.json();

    const vidPut = await fetch(`${baseUrl}/api/curadoria/video`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channel: 'mrj',
        videoId: 'dQw4w9WgXcQ',
        status: 'reagir',
        category: 'reagir',
        notes: 'Anotação de teste',
      }),
    });
    assert.equal(vidPut.status, 200);

    const plDel = await fetch(
      `${baseUrl}/api/curadoria/playlists?channel=mrj&id=${encodeURIComponent(plJson.playlist.id)}`,
      { method: 'DELETE' }
    );
    assert.equal(plDel.status, 200);

    // Playlist excluída vai para a lixeira e pode ser restaurada
    const trashPl = await (await fetch(`${baseUrl}/api/trash?channel=mrj`)).json();
    const trashedPlItem = trashPl.items.find((it) => it.kind === 'playlist');
    assert.ok(trashedPlItem, 'Playlist excluída deve ir para a lixeira');
    const restorePlRes = await fetch(`${baseUrl}/api/trash/restore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel: 'mrj', id: trashedPlItem.id }),
    });
    assert.equal(restorePlRes.status, 200);
    const curAfterPlRestore = await (await fetch(`${baseUrl}/api/curadoria?channel=mrj`)).json();
    assert.ok(curAfterPlRestore.curadoria.playlists.some((p) => p.id === plJson.playlist.id));

    // 7. Doctor endpoint
    const docReportRes = await fetch(`${baseUrl}/api/doctor`);
    assert.equal(docReportRes.status, 200);
    const docReport = await docReportRes.json();
    assert.equal(typeof docReport.ok, 'boolean');
    assert.ok(docReport.summary);
    assert.ok(docReport.channels.mrj);

    // 8. Backup download endpoint (tar.gz válido + limpeza de arquivo temporário)
    const backupRes = await fetch(`${baseUrl}/api/backup/download?channel=mrj&includeRecordings=0`);
    assert.equal(backupRes.status, 200);
    assert.ok(String(backupRes.headers.get('content-type') || '').includes('application/gzip'));
    assert.ok(String(backupRes.headers.get('content-disposition') || '').includes('.tar.gz'));
    const archiveBuf = Buffer.from(await backupRes.arrayBuffer());
    assert.ok(archiveBuf.length > 50);
    assert.equal(archiveBuf[0], 0x1f);
    assert.equal(archiveBuf[1], 0x8b);
    const tmpArchive = path.join(tmpDir, 'downloaded.tar.gz');
    fs.writeFileSync(tmpArchive, archiveBuf);
    const tarOut = execFileSync('tar', ['-tzf', tmpArchive], { encoding: 'utf8' });
    assert.ok(tarOut.includes('mrj/01-ideias/roteiro-api.md'));

    // 9. Static & SPA fallback routes
    const mdJsRes = await fetch(`${baseUrl}/markdown.js`);
    assert.equal(mdJsRes.status, 200);
    assert.ok(String(mdJsRes.headers.get('content-type') || '').includes('javascript'));
    const frameRes = await fetch(`${baseUrl}/excalidraw-frame.html`);
    assert.equal(frameRes.status, 200);
    const spaRes = await fetch(`${baseUrl}/mrj/roteiros`);
    assert.equal(spaRes.status, 200);
    assert.ok(String(spaRes.headers.get('content-type') || '').includes('text/html'));

    // 10. Remote PIN unlock + rate-limit 429
    const pinSetup = await fetch(`${baseUrl}/api/remote/pin`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pinEnabled: true, pinCode: '9876' }),
    });
    assert.equal(pinSetup.status, 200);

    for (let attempt = 1; attempt <= 5; attempt++) {
      const unlockRes = await fetch(`${baseUrl}/api/remote/unlock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: '0000' }),
      });
      assert.equal(unlockRes.status, 401);
    }

    const sixthRes = await fetch(`${baseUrl}/api/remote/unlock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: '0000' }),
    });
    assert.equal(sixthRes.status, 429);
    assert.ok(Number(sixthRes.headers.get('retry-after')) > 0, 'Deve enviar header Retry-After no HTTP 429');
  } finally {
    sseController.abort();
    await closeServer(server);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('stateCache keeps untouched channels in RAM on refreshChannel and debounces/flushes disk bundles', async () => {
  const { tmpDir, wsMrj, config } = makeIsolatedEnv('crom-test-cache-');
  const tmpDataDir = path.join(tmpDir, 'data');
  const tmpWebDir = path.join(tmpDir, 'web');
  config.disableDiskBundles = false;
  config.dataDir = tmpDataDir;
  config.webDir = tmpWebDir;

  const cache = createStateCache(config, { serverMode: true });
  try {
    const initial = cache.init({ flushDisk: false });
    assert.equal(fs.existsSync(path.join(tmpDataDir, 'data.json')), false);
    const cromRefBefore = initial.channels.crom;

    // Adiciona um novo arquivo apenas em mrj e atualiza somente o canal mrj
    fs.writeFileSync(
      path.join(wsMrj, '01-ideias', 'cache-only.md'),
      '---\nid: "cache-1"\ntitulo: "Cache Only"\nstatus: "ideia"\n---\n\n# Cache Only\n',
      'utf8'
    );
    const afterMrj = cache.refreshChannel('mrj', { flushDisk: false });
    assert.equal(afterMrj.channels.crom, cromRefBefore, 'Canal não alterado deve permanecer com a mesma referência em RAM');
    assert.ok(afterMrj.channels.mrj.docs.some((d) => d.path === '01-ideias/cache-only.md'));

    // Agenda flush curto e aguarda gravação debounced em disco isolado
    cache.scheduleDiskFlush(40);
    assert.equal(cache.hasPendingFlush(), true);
    await new Promise((r) => setTimeout(r, 120));
    assert.equal(cache.hasPendingFlush(), false);
    assert.equal(fs.existsSync(path.join(tmpDataDir, 'data.json')), true);
    assert.equal(fs.existsSync(path.join(tmpWebDir, 'data.js')), true);

    // flushNow() escreve imediatamente e limpa timer pendente
    fs.writeFileSync(
      path.join(wsMrj, '01-ideias', 'cache-now.md'),
      '---\nid: "cache-2"\ntitulo: "Cache Now"\nstatus: "ideia"\n---\n\n# Cache Now\n',
      'utf8'
    );
    cache.refreshChannel('mrj', { flushDisk: true });
    assert.equal(cache.hasPendingFlush(), true);
    await cache.flushNow();
    assert.equal(cache.hasPendingFlush(), false);
    const written = JSON.parse(fs.readFileSync(path.join(tmpDataDir, 'data.json'), 'utf8'));
    assert.ok(written.channels.mrj.docs.some((d) => d.path === '01-ideias/cache-now.md'));
  } finally {
    cache.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
