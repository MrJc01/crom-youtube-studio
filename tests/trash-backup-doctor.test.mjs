import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createBackupArchive } from '../src/lib/backup.mjs';
import { runDoctor } from '../src/lib/doctor.mjs';
import {
  listTrash,
  moveToTrash,
  pruneExpiredTrash,
  purgeAllTrash,
  purgeTrashItem,
  restoreFromTrash,
} from '../src/lib/trash.mjs';

function makeTempWorkspace(prefix = 'crom-test-tbd-') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const ws = path.join(root, 'ws-mrj');
  fs.mkdirSync(path.join(ws, '01-ideias'), { recursive: true });
  fs.mkdirSync(path.join(ws, 'quadros'), { recursive: true });
  fs.mkdirSync(path.join(ws, '.studio-data'), { recursive: true });
  return { root, ws };
}

test('trash supports moveToTrash, restoreFromTrash, purgeTrashItem, purgeAllTrash, and prune for doc/board/note/playlist', async () => {
  const { root, ws } = makeTempWorkspace();
  try {
    // 1. doc
    const docRel = '01-ideias/minha-ideia.md';
    const docAbs = path.join(ws, docRel);
    const docContent = '---\nid: "ideia-1"\ntitulo: "Minha Ideia"\nstatus: "ideia"\n---\n\n# Minha Ideia\n';
    fs.writeFileSync(docAbs, docContent, 'utf8');

    const trashedDoc = await moveToTrash(ws, {
      kind: 'doc',
      originalPath: docRel,
      title: 'Minha Ideia',
      sourceAbsPath: docAbs,
      content: docContent,
    });
    fs.unlinkSync(docAbs);
    assert.equal(fs.existsSync(docAbs), false);

    // 2. board
    const boardRel = 'quadros/fluxo-teste.excalidraw';
    const boardAbs = path.join(ws, boardRel);
    const boardContent = JSON.stringify({ type: 'excalidraw', version: 2, elements: [{ id: 'e1' }] });
    fs.writeFileSync(boardAbs, boardContent, 'utf8');

    const trashedBoard = await moveToTrash(ws, {
      kind: 'board',
      originalPath: boardRel,
      title: 'Fluxo Teste',
      sourceAbsPath: boardAbs,
      content: boardContent,
    });
    fs.unlinkSync(boardAbs);

    // 3. note
    const notePayload = { id: 'note-1', title: 'Nota Keep', content: 'Texto importante' };
    const trashedNote = await moveToTrash(ws, {
      kind: 'note',
      originalPath: '.studio-data/notas.json#note-1',
      title: 'Nota Keep',
      itemPayload: notePayload,
    });

    // 4. playlist
    const playlistPayload = { id: 'pl-1', title: 'Referencias', items: [{ videoId: 'dQw4w9WgXcQ' }] };
    const trashedPlaylist = await moveToTrash(ws, {
      kind: 'playlist',
      originalPath: '.studio-data/curadoria.json#pl-1',
      title: 'Referencias',
      itemPayload: playlistPayload,
    });

    const listed = listTrash(ws);
    assert.equal(listed.items.length, 4);

    // Restaurar doc e board no disco
    const restoredDoc = await restoreFromTrash(ws, trashedDoc.id);
    assert.equal(restoredDoc.restored, true);
    assert.equal(restoredDoc.targetPath, docRel);
    assert.equal(fs.readFileSync(docAbs, 'utf8'), docContent);

    const restoredBoard = await restoreFromTrash(ws, trashedBoard.id);
    assert.equal(restoredBoard.restored, true);
    assert.equal(restoredBoard.targetPath, boardRel);
    assert.equal(fs.readFileSync(boardAbs, 'utf8'), boardContent);

    // Restaurar note e playlist via handlers
    let restoredNoteArg = null;
    let restoredPlaylistArg = null;
    await restoreFromTrash(ws, trashedNote.id, {
      onRestoreNote: (p) => {
        restoredNoteArg = p;
      },
    });
    assert.deepEqual(restoredNoteArg, notePayload);

    await restoreFromTrash(ws, trashedPlaylist.id, {
      onRestorePlaylist: (p) => {
        restoredPlaylistArg = p;
      },
    });
    assert.deepEqual(restoredPlaylistArg, playlistPayload);
    assert.equal(listTrash(ws).items.length, 0);

    // Purge individual e purgeAll
    const extra1 = await moveToTrash(ws, {
      kind: 'note',
      title: 'Extra 1',
      itemPayload: { id: 'n-extra-1' },
    });
    const extra2 = await moveToTrash(ws, {
      kind: 'note',
      title: 'Extra 2',
      itemPayload: { id: 'n-extra-2' },
    });
    await purgeTrashItem(ws, extra1.id);
    assert.equal(listTrash(ws).items.length, 1);
    assert.equal(listTrash(ws).items[0].id, extra2.id);

    // Prune expirado (maxDays = 0 limpa itens vencidos)
    const pruned = pruneExpiredTrash(ws, 0);
    assert.equal(pruned.removedCount, 1);
    assert.equal(listTrash(ws).items.length, 0);

    // PurgeAll
    await moveToTrash(ws, { kind: 'note', title: 'Extra 3', itemPayload: { id: 'n-extra-3' } });
    const purgedAll = await purgeAllTrash(ws);
    assert.equal(purgedAll.purgedCount, 1);
    assert.equal(listTrash(ws).items.length, 0);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('createBackupArchive creates valid .tar.gz excluding gravacoes/ by default and including when requested', async () => {
  const { root, ws } = makeTempWorkspace();
  const archives = [];
  try {
    fs.writeFileSync(
      path.join(ws, '01-ideias', 'roteiro.md'),
      '---\nid: "r1"\ntitulo: "Roteiro"\nstatus: "ideia"\n---\n\n# Roteiro\n',
      'utf8'
    );
    fs.writeFileSync(path.join(ws, 'quadros', 'mapa.excalidraw'), '{"type":"excalidraw","elements":[]}', 'utf8');
    fs.writeFileSync(path.join(ws, '.studio-data', 'notas.json'), '{"notes":[]}', 'utf8');
    fs.writeFileSync(path.join(ws, '.studio-data', 'notas.json.bak'), '{"notes":[]}', 'utf8');
    fs.mkdirSync(path.join(ws, '.studio-data', 'quarantine'), { recursive: true });
    fs.writeFileSync(path.join(ws, '.studio-data', 'quarantine', 'bad.corrupted'), 'bad', 'utf8');
    fs.mkdirSync(path.join(ws, '.studio-data', 'trash'), { recursive: true });
    fs.writeFileSync(path.join(ws, '.studio-data', 'trash', 'manifest.json'), '{"items":[]}', 'utf8');
    fs.mkdirSync(path.join(ws, '.roteiro-git', '01-ideias__roteiro'), { recursive: true });
    fs.writeFileSync(path.join(ws, '.roteiro-git', '01-ideias__roteiro', 'index.json'), '{}', 'utf8');
    fs.mkdirSync(path.join(ws, 'gravacoes', '2026-11-24_teste', 'take-01'), { recursive: true });
    fs.writeFileSync(path.join(ws, 'gravacoes', '2026-11-24_teste', 'take-01', '04-voz.wav'), 'RIFF', 'utf8');

    const config = {
      channelOrder: ['mrj'],
      channels: {
        mrj: { key: 'mrj', name: 'MrJ', workspacePath: ws },
      },
    };

    const backup = await createBackupArchive(config, { channel: 'all', includeRecordings: false });
    archives.push(backup.archivePath);
    assert.equal(backup.ok, true);
    assert.equal(backup.includeRecordings, false);
    assert.ok(backup.size > 0);
    assert.equal(fs.existsSync(backup.archivePath), true);

    const listing = execFileSync('tar', ['-tzf', backup.archivePath], { encoding: 'utf8' });
    const lines = listing.split(/\r?\n/).filter(Boolean);
    assert.ok(lines.some((l) => l.endsWith('mrj/01-ideias/roteiro.md')));
    assert.ok(lines.some((l) => l.endsWith('mrj/quadros/mapa.excalidraw')));
    assert.ok(lines.some((l) => l.endsWith('mrj/.studio-data/notas.json')));
    assert.ok(lines.some((l) => l.includes('mrj/.roteiro-git/')));
    assert.equal(lines.some((l) => l.includes('gravacoes/')), false);
    assert.equal(lines.some((l) => l.includes('quarantine/')), false);
    assert.equal(lines.some((l) => l.includes('trash/')), false);
    assert.equal(lines.some((l) => l.endsWith('.bak')), false);

    // Com gravações habilitado
    const backupWithRec = await createBackupArchive(config, { channel: 'mrj', includeRecordings: true });
    archives.push(backupWithRec.archivePath);
    const listingRec = execFileSync('tar', ['-tzf', backupWithRec.archivePath], { encoding: 'utf8' });
    assert.ok(listingRec.includes('mrj/gravacoes/2026-11-24_teste/take-01/04-voz.wav'));
  } finally {
    for (const arch of archives) {
      fs.rmSync(arch, { force: true });
    }
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('runDoctor detects invalid YAML frontmatter, corrupted JSON, and quarantine items', async () => {
  const { root, ws } = makeTempWorkspace();
  try {
    // Workspace saudável primeiro
    fs.writeFileSync(
      path.join(ws, '01-ideias', 'valido.md'),
      '---\nid: "ok-1"\ntitulo: "Válido"\nstatus: "ideia"\n---\n\n# Válido\n',
      'utf8'
    );
    fs.writeFileSync(path.join(ws, '.studio-data', 'notas.json'), '{"notes":[]}', 'utf8');

    const config = {
      kdenliveRoot: '',
      channelOrder: ['mrj'],
      channels: {
        mrj: { key: 'mrj', name: 'MrJ', workspacePath: ws },
      },
    };

    const healthy = await runDoctor(config);
    assert.equal(healthy.ok, true);
    assert.equal(healthy.summary.errors, 0);
    assert.equal(healthy.channels.mrj.quarantineCount, 0);

    // Injeta YAML inválido, JSON inválido e item em quarentena
    fs.writeFileSync(
      path.join(ws, '01-ideias', 'quebrado.md'),
      '---\nid: "broken"\ntitulo: "Sem fechamento"\n\n# Corpo',
      'utf8'
    );
    fs.writeFileSync(path.join(ws, '.studio-data', 'corrompido.json'), '{not json', 'utf8');
    fs.mkdirSync(path.join(ws, '.studio-data', 'quarantine'), { recursive: true });
    fs.writeFileSync(path.join(ws, '.studio-data', 'quarantine', 'notas.json.corrupted.1'), '{}', 'utf8');

    const unhealthy = await runDoctor(config);
    assert.equal(unhealthy.ok, false);
    assert.ok(unhealthy.summary.errors >= 2);
    assert.ok(unhealthy.summary.warnings >= 1);
    assert.equal(unhealthy.channels.mrj.quarantineCount, 1);
    assert.ok(unhealthy.channels.mrj.markdownIssues.some((i) => i.path.includes('quebrado.md')));
    assert.ok(unhealthy.channels.mrj.jsonIssues.some((i) => i.path.includes('corrompido.json')));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
