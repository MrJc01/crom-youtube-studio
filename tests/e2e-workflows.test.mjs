import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { resolveFfmpegPath } from '../src/recordings.mjs';
import { createStudioServer } from '../src/server.mjs';

function makeIsolatedStudioEnv(prefix = 'crom-e2e-wf-') {
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
    '---\nid: "crom-1"\ntitulo: "Crom Base"\nstatus: "ideia"\n---\n\n# Crom Base\n',
    'utf8'
  );

  const cfgPath = path.join(tmpDir, 'config.local.json');
  const rawCfg = {
    port: 0,
    host: '127.0.0.1',
    defaultChannel: 'mrj',
    kdenliveRoot: '',
    channels: {
      mrj: { name: 'MrJ E2E', workspacePath: wsMrj, seriesList: ['Imagine', 'Reavaliar', 'Pensamentos'] },
      crom: { name: 'Crom E2E', workspacePath: wsCrom, seriesList: ['Geral'] },
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
        name: 'Crom E2E',
        handle: '@crom_e2e',
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

async function startTestServer(config) {
  const server = createStudioServer(config);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  config.port = port;
  return { server, baseUrl: `http://127.0.0.1:${port}` };
}

async function stopTestServer(server) {
  if (!server) return;
  if (typeof server.closeAllConnections === 'function') {
    server.closeAllConnections();
  }
  await server.remoteManager?.shutdown().catch(() => {});
  await new Promise((resolve) => server.close(() => resolve()));
}

test('Jornada 1: Roteiros, Git rNNN, Versões Alternativas, Diff, Restore, SSE e Lixeira', async () => {
  const { tmpDir, wsMrj, config } = makeIsolatedStudioEnv();
  const { server, baseUrl } = await startTestServer(config);
  const sseController = new AbortController();

  try {
    const sseRes = await fetch(`${baseUrl}/api/events`, { signal: sseController.signal });
    assert.equal(sseRes.status, 200);
    const reader = sseRes.body.getReader();
    const decoder = new TextDecoder();
    let sseBuf = '';

    async function waitSse(predicate, timeoutMs = 4000) {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        if (predicate(sseBuf)) return;
        const { value, done } = await Promise.race([
          reader.read(),
          new Promise((_, rej) => setTimeout(() => rej(new Error(`SSE timeout: ${sseBuf}`)), Math.max(50, deadline - Date.now()))),
        ]);
        if (done) break;
        sseBuf += decoder.decode(value, { stream: true });
      }
      assert.ok(predicate(sseBuf), `Evento SSE ausente: ${sseBuf}`);
    }

    await waitSse((b) => b.includes('event: ready'));

    const v1Text = '---\nid: "j1-doc"\ntitulo: "Jornada Git"\nstatus: "roteiro"\n---\n\n# Jornada Git\nLinha v1\n';
    const created = await fetch(`${baseUrl}/api/doc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channel: 'mrj',
        folder: '02-roteiros/rascunhos',
        filename: '2026-11-jornada-git',
        content: v1Text,
      }),
    });
    assert.equal(created.status, 201);
    const docPath = (await created.json()).path;
    await waitSse((b) => b.includes('"reason":"doc-create"'));

    const v2Text = `${v1Text}Linha v2 adicionada\n`;
    const commitRes = await fetch(`${baseUrl}/api/versions/commit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel: 'mrj', path: docPath, version: 'principal', content: v2Text, message: 'Ajuste v2' }),
    });
    assert.equal(commitRes.status, 200);
    const commitJson = await commitRes.json();
    assert.equal(commitJson.revision.id, 'r002');
    await waitSse((b) => b.includes('"reason":"version-commit"'));

    const altRes = await fetch(`${baseUrl}/api/versions/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channel: 'mrj',
        path: docPath,
        name: 'v2-enxuta',
        fromVersion: 'principal',
        content: `${v1Text}Gancho enxuto alternativo\n`,
      }),
    });
    assert.equal(altRes.status, 201);
    const altJson = await altRes.json();
    assert.equal(altJson.history.defaultVersion, 'principal');
    assert.equal(altJson.history.versions.find((v) => v.name === 'principal')?.isDefault, true);
    assert.equal(altJson.history.versions.find((v) => v.name === 'v2-enxuta')?.isDefault, false);

    const setDefRes = await fetch(`${baseUrl}/api/versions/default`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel: 'mrj', path: docPath, versionName: 'v2-enxuta' }),
    });
    assert.equal(setDefRes.status, 200);
    const setDefJson = await setDefRes.json();
    assert.equal(setDefJson.defaultVersion, 'v2-enxuta');
    assert.equal(setDefJson.history.defaultVersion, 'v2-enxuta');
    assert.equal(setDefJson.history.versions.find((v) => v.name === 'v2-enxuta')?.isDefault, true);
    assert.equal(setDefJson.history.versions.find((v) => v.name === 'principal')?.isDefault, false);
    const stateDoc = setDefJson.state.channels.mrj.docs.find((d) => d.path === docPath);
    assert.equal(stateDoc?.versioning?.defaultVersion, 'v2-enxuta');
    await waitSse((b) => b.includes('"reason":"version-default"'));

    const missingDefRes = await fetch(`${baseUrl}/api/versions/default`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel: 'mrj', path: docPath, versionName: 'nao-existe' }),
    });
    assert.equal(missingDefRes.status, 404);

    const delVerRes = await fetch(
      `${baseUrl}/api/versions?channel=mrj&path=${encodeURIComponent(docPath)}&versionName=v2-enxuta`,
      { method: 'DELETE' }
    );
    assert.equal(delVerRes.status, 200);
    const delVerJson = await delVerRes.json();
    assert.equal(delVerJson.defaultVersion, 'principal');
    assert.equal(delVerJson.history.defaultVersion, 'principal');

    const altRes2 = await fetch(`${baseUrl}/api/versions/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channel: 'mrj',
        path: docPath,
        name: 'v2-enxuta',
        fromVersion: 'principal',
        content: `${v1Text}Gancho enxuto alternativo\n`,
      }),
    });
    assert.equal(altRes2.status, 201);

    const diffRes = await fetch(
      `${baseUrl}/api/versions/diff?channel=mrj&path=${encodeURIComponent(docPath)}&from=ver:principal&to=ver:v2-enxuta`
    );
    assert.equal(diffRes.status, 200);
    const diffJson = await diffRes.json();
    assert.ok(diffJson.added >= 1 && diffJson.removed >= 1);

    const restoreRevRes = await fetch(`${baseUrl}/api/versions/restore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel: 'mrj', path: docPath, revId: 'r001', targetVersion: 'principal' }),
    });
    assert.equal(restoreRevRes.status, 200);
    const restoreRevJson = await restoreRevRes.json();
    assert.equal(restoreRevJson.revision.id, 'r005');
    assert.equal(fs.readFileSync(path.join(wsMrj, docPath), 'utf8'), v1Text);

    const delRes = await fetch(`${baseUrl}/api/doc?channel=mrj&path=${encodeURIComponent(docPath)}`, { method: 'DELETE' });
    assert.equal(delRes.status, 200);
    const delJson = await delRes.json();
    assert.equal(fs.existsSync(path.join(wsMrj, docPath)), false);
    await waitSse((b) => b.includes('"reason":"doc-delete"'));

    const trashRestoreRes = await fetch(`${baseUrl}/api/trash/restore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel: 'mrj', id: delJson.trashed.id }),
    });
    assert.equal(trashRestoreRes.status, 200);
    assert.equal(fs.existsSync(path.join(wsMrj, docPath)), true);
    assert.equal(fs.readFileSync(path.join(wsMrj, docPath), 'utf8'), v1Text);
    await waitSse((b) => b.includes('"reason":"trash-restore"'));
  } finally {
    sseController.abort();
    await stopTestServer(server);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('Jornada 2: Gravação Multi-Track (ffmpeg wav + mp4 + Range 206) e vínculo em projectLinks', async (t) => {
  const ffmpegPath = resolveFfmpegPath();
  if (!ffmpegPath) {
    t.skip('ffmpeg indisponível neste ambiente');
    return;
  }

  const { tmpDir, wsMrj, config } = makeIsolatedStudioEnv();
  const { server, baseUrl } = await startTestServer(config);

  try {
    const docRes = await fetch(`${baseUrl}/api/doc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channel: 'mrj',
        folder: '02-roteiros/rascunhos',
        filename: '2026-11-roteiro-gravacao',
        content: '---\nid: "rot-grav"\ntitulo: "Roteiro Gravação"\nstatus: "gravando"\n---\n\n# Roteiro Gravação\n',
      }),
    });
    assert.equal(docRes.status, 201);
    const docPath = (await docRes.json()).path;

    const sessRes = await fetch(`${baseUrl}/api/recordings/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channel: 'mrj',
        slug: 'roteiro-gravacao',
        title: 'Take E2E',
        mode: 'all-and-separate',
        scriptPath: docPath,
      }),
    });
    assert.equal(sessRes.status, 201);
    const sessJson = await sessRes.json();

    const voiceWebm = path.join(tmpDir, 'voice.webm');
    const screenWebm = path.join(tmpDir, 'screen.webm');
    execFileSync(ffmpegPath, ['-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1', '-c:a', 'libopus', voiceWebm], {
      stdio: 'ignore',
    });
    execFileSync(ffmpegPath, ['-y', '-f', 'lavfi', '-i', 'testsrc=size=320x240:rate=15:duration=1', '-c:v', 'libvpx', screenWebm], {
      stdio: 'ignore',
    });

    const voiceUp = await fetch(
      `${baseUrl}/api/recordings/track?channel=mrj&sessionId=${encodeURIComponent(sessJson.sessionId)}&takeId=${encodeURIComponent(sessJson.takeId)}&kind=voz&ext=webm`,
      { method: 'POST', body: fs.readFileSync(voiceWebm) }
    );
    assert.equal(voiceUp.status, 201);
    const voiceJson = await voiceUp.json();
    const takeDir = path.join(wsMrj, 'gravacoes', sessJson.sessionId, sessJson.takeId);
    assert.equal(fs.existsSync(path.join(takeDir, '04-voz.webm')), true);
    assert.equal(fs.existsSync(path.join(takeDir, '04-voz.wav')), true);
    assert.ok(voiceJson.extraTracks?.some((tr) => tr.fileName === '04-voz.wav'));

    const screenUp = await fetch(
      `${baseUrl}/api/recordings/track?channel=mrj&sessionId=${encodeURIComponent(sessJson.sessionId)}&takeId=${encodeURIComponent(sessJson.takeId)}&kind=tela&ext=webm`,
      { method: 'POST', body: fs.readFileSync(screenWebm) }
    );
    assert.equal(screenUp.status, 201);

    const mp4Res = await fetch(`${baseUrl}/api/recordings/convert-mp4`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channel: 'mrj',
        sessionId: sessJson.sessionId,
        takeId: sessJson.takeId,
        fileName: '02-tela.webm',
      }),
    });
    assert.equal(mp4Res.status, 200);
    assert.equal(fs.existsSync(path.join(takeDir, '02-tela.mp4')), true);

    const mediaRel = `gravacoes/${sessJson.sessionId}/${sessJson.takeId}/02-tela.mp4`;
    const rangeRes = await fetch(
      `${baseUrl}/api/recordings/media?channel=mrj&path=${encodeURIComponent(mediaRel)}`,
      { headers: { Range: 'bytes=0-63' } }
    );
    assert.equal(rangeRes.status, 206);
    assert.equal(rangeRes.headers.get('accept-ranges'), 'bytes');
    assert.ok(String(rangeRes.headers.get('content-range') || '').startsWith('bytes 0-63/'));
    const rangeBytes = Buffer.from(await rangeRes.arrayBuffer());
    assert.equal(rangeBytes.length, 64);

    const stateRes = await fetch(`${baseUrl}/api/state`);
    const state = await stateRes.json();
    const links = state.channels.mrj.projectLinks?.[docPath];
    assert.ok(links, 'projectLinks deve conter o roteiro vinculado');
    assert.equal(links.recordings.length, 1);
    assert.equal(links.recordings[0].sessionId, sessJson.sessionId);
    assert.ok(links.recordings[0].tracksCount >= 4);
  } finally {
    await stopTestServer(server);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('Jornada 3: Curadoria, Notas Keep, Quadros Excalidraw, projectLinks e Recuperação de Corrupção', async () => {
  const { tmpDir, wsMrj, config } = makeIsolatedStudioEnv();
  const { server, baseUrl } = await startTestServer(config);

  try {
    // Curadoria playlist -> create-script
    const plRes = await fetch(`${baseUrl}/api/curadoria/playlists`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channel: 'mrj',
        mode: 'manual',
        title: 'Curadoria E2E',
        kind: 'reagir',
        items: [{ videoId: 'dQw4w9WgXcQ', title: 'Video Ref E2E' }],
      }),
    });
    assert.equal(plRes.status, 201);
    const plId = (await plRes.json()).playlist.id;

    const scriptRes = await fetch(`${baseUrl}/api/curadoria/create-script`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channel: 'mrj',
        videoId: 'dQw4w9WgXcQ',
        playlistId: plId,
        title: 'Análise Vídeo Ref',
        serie: 'Reavaliar',
      }),
    });
    assert.equal(scriptRes.status, 201);
    const docPath = (await scriptRes.json()).docPath;

    // Nota Keep + checklist -> linkedDocPath + to-doc + export/import round-trip
    const noteRes = await fetch(`${baseUrl}/api/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channel: 'mrj',
        title: 'Checklist de Pesquisa',
        kind: 'checklist',
        checklist: [{ text: 'Verificar fontes', done: true }],
        linkedDocPath: docPath,
      }),
    });
    assert.equal(noteRes.status, 201);
    const noteId = (await noteRes.json()).note.id;

    const noteToDocSrc = await fetch(`${baseUrl}/api/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel: 'mrj', title: 'Nota Virando Ideia', content: 'Corpo da nota' }),
    });
    const note2Id = (await noteToDocSrc.json()).note.id;
    const toDocRes = await fetch(`${baseUrl}/api/notes/to-doc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel: 'mrj', noteId: note2Id, targetType: 'ideia' }),
    });
    assert.equal(toDocRes.status, 201);
    assert.ok((await toDocRes.json()).docPath.startsWith('01-ideias/'));

    // Quadro Excalidraw com customData.docPath
    const boardRes = await fetch(`${baseUrl}/api/boards`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channel: 'mrj',
        title: 'Fluxo Curadoria',
        preferredMode: 'nodes',
        elements: [
          {
            id: 'card-doc-1',
            type: 'rectangle',
            x: 10,
            y: 10,
            width: 220,
            height: 90,
            customData: { docPath },
          },
        ],
      }),
    });
    assert.equal(boardRes.status, 201);

    // Valida projectLinks consolidado
    const state = await (await fetch(`${baseUrl}/api/state`)).json();
    const links = state.channels.mrj.projectLinks?.[docPath];
    assert.ok(links);
    assert.equal(links.boards.length, 1);
    assert.equal(links.notes.length, 1);
    assert.equal(links.notes[0].id, noteId);
    assert.ok(links.curadoria.some((c) => c.videoId === 'dQw4w9WgXcQ'));

    // Exportação JSON / MD / TXT + Import round-trip
    for (const fmt of ['json', 'md', 'txt']) {
      const expRes = await fetch(`${baseUrl}/api/notes/export?channel=mrj&format=${fmt}`);
      assert.equal(expRes.status, 200);
      const txt = await expRes.text();
      assert.ok(txt.includes('Checklist de Pesquisa'));
      if (fmt === 'json') {
        const parsedExp = JSON.parse(txt);
        const impRes = await fetch(`${baseUrl}/api/notes/import`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ channel: 'mrj', notes: parsedExp.notes }),
        });
        assert.equal(impRes.status, 200);
      }
    }

    // Corrompe notas.json -> auto-recupera via .bak + quarentena + doctor detecta
    const notasPath = path.join(wsMrj, '.studio-data', 'notas.json');
    assert.equal(fs.existsSync(`${notasPath}.bak`), true);
    fs.writeFileSync(notasPath, '{{{BROKEN_JSON', 'utf8');

    const recoveredNotes = await (await fetch(`${baseUrl}/api/notes?channel=mrj`)).json();
    assert.ok(recoveredNotes.notes.some((n) => n.id === noteId));

    const doctorReport = await (await fetch(`${baseUrl}/api/doctor`)).json();
    assert.ok(doctorReport.channels.mrj.quarantineCount >= 1);
    assert.ok(doctorReport.summary.warnings >= 1);
  } finally {
    await stopTestServer(server);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('Jornada 4: Concorrência (20 mutações paralelas), CSRF 403, LAN QR, PIN 429 e Backup tar.gz', async () => {
  const { tmpDir, wsMrj, config } = makeIsolatedStudioEnv();
  const { server, baseUrl } = await startTestServer(config);

  try {
    // 20 mutações paralelas em notas
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, idx) =>
        fetch(`${baseUrl}/api/notes`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ channel: 'mrj', title: `Nota Paralela ${idx}`, content: `Item ${idx}` }),
        })
      )
    );
    for (const r of results) {
      assert.equal(r.status, 201);
    }
    const notesAfter = await (await fetch(`${baseUrl}/api/notes?channel=mrj`)).json();
    assert.equal(notesAfter.notes.length, 20, 'Todas as 20 mutações paralelas devem persistir sem perda');

    // CSRF 403 para Origin externo
    const csrfRes = await fetch(`${baseUrl}/api/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example' },
      body: JSON.stringify({ channel: 'mrj', title: 'Bloqueada' }),
    });
    assert.equal(csrfRes.status, 403);

    // LAN toggle + QR SVG (quando houver interface ativa no sistema)
    const lanOn = await fetch(`${baseUrl}/api/remote/lan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: true }),
    });
    if (lanOn.status === 200) {
      const lanJson = await lanOn.json();
      assert.equal(lanJson.lanEnabled, true);
      assert.ok(lanJson.lanUrl.startsWith('http://'));
      assert.ok(String(lanJson.lanQrSvg || '').includes('<svg'));

      const lanOff = await fetch(`${baseUrl}/api/remote/lan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: false }),
      });
      assert.equal(lanOff.status, 200);
      assert.equal((await lanOff.json()).lanEnabled, false);
    }

    // Brute-force PIN -> 429 Retry-After
    const pinRes = await fetch(`${baseUrl}/api/remote/pin`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pinEnabled: true, pinCode: '4321' }),
    });
    assert.equal(pinRes.status, 200);

    for (let i = 1; i <= 5; i++) {
      const bad = await fetch(`${baseUrl}/api/remote/unlock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: '9999' }),
      });
      assert.equal(bad.status, 401);
    }
    const locked = await fetch(`${baseUrl}/api/remote/unlock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: '9999' }),
    });
    assert.equal(locked.status, 429);
    assert.ok(Number(locked.headers.get('retry-after')) > 0);

    // Backup tar.gz válido
    fs.writeFileSync(path.join(wsMrj, '01-ideias', 'para-backup.md'), '---\nid: "bk"\ntitulo: "BK"\nstatus: "ideia"\n---\n', 'utf8');
    const bkRes = await fetch(`${baseUrl}/api/backup/download?channel=all&includeRecordings=0`);
    assert.equal(bkRes.status, 200);
    const bkBuf = Buffer.from(await bkRes.arrayBuffer());
    const bkPath = path.join(tmpDir, 'e2e-backup.tar.gz');
    fs.writeFileSync(bkPath, bkBuf);
    const listing = execFileSync('tar', ['-tzf', bkPath], { encoding: 'utf8' });
    assert.ok(listing.includes('mrj/01-ideias/para-backup.md'));
    assert.ok(listing.includes('crom/01-ideias/crom-base.md'));
    assert.equal(listing.includes('.bak'), false);
    assert.equal(listing.includes('quarantine/'), false);
    assert.equal(listing.includes('trash/'), false);
  } finally {
    await stopTestServer(server);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
