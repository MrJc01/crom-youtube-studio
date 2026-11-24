import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  assertInsideRoot,
  readJsonSafe,
  readJsonWithMeta,
  withFileLock,
  writeFileAtomic,
  writeJsonAtomic,
} from '../src/lib/storage.mjs';

function makeTempDir(prefix = 'crom-test-storage-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

test('writeFileAtomic and writeJsonAtomic create .bak, inject schemaVersion, and leave no .tmp files', () => {
  const tmpDir = makeTempDir();
  try {
    const filePath = path.join(tmpDir, 'nested', 'state.json');

    writeJsonAtomic(filePath, { items: ['alpha'] }, { schemaVersion: 1, backup: true });
    assert.equal(fs.existsSync(filePath), true);
    assert.equal(fs.existsSync(`${filePath}.bak`), false);

    const first = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    assert.equal(first.schemaVersion, 1);
    assert.deepEqual(first.items, ['alpha']);

    writeJsonAtomic(filePath, { items: ['alpha', 'beta'] }, { schemaVersion: 1, backup: true });
    assert.equal(fs.existsSync(`${filePath}.bak`), true);

    const bak = JSON.parse(fs.readFileSync(`${filePath}.bak`, 'utf8'));
    assert.deepEqual(bak.items, ['alpha']);

    const second = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    assert.deepEqual(second.items, ['alpha', 'beta']);

    const entries = fs.readdirSync(path.dirname(filePath));
    assert.equal(
      entries.some((name) => name.includes('.tmp.')),
      false,
      'Não devem sobrar arquivos temporários .tmp após escrita atômica'
    );

    const txtPath = path.join(tmpDir, 'note.txt');
    writeFileAtomic(txtPath, 'hello-atomic', { backup: false });
    assert.equal(fs.readFileSync(txtPath, 'utf8'), 'hello-atomic');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('readJsonWithMeta quarantines corrupted JSON and recovers from .bak without silent data loss', () => {
  const tmpDir = makeTempDir();
  try {
    const filePath = path.join(tmpDir, 'notes.json');
    const quarantineDir = path.join(tmpDir, 'quarantine');

    writeJsonAtomic(filePath, { notes: [{ id: 'n1', title: 'Original' }] }, { backup: true });
    writeJsonAtomic(filePath, { notes: [{ id: 'n1', title: 'Updated' }] }, { backup: true });

    // Corrompe o arquivo principal mantendo o .bak válido (Original)
    fs.writeFileSync(filePath, '{"notes": [CORRUPTED JSON', 'utf8');

    const res = readJsonWithMeta(filePath, {
      defaultData: { notes: [] },
      schemaVersion: 1,
      quarantineDir,
    });

    assert.equal(res.exists, true);
    assert.equal(res.recovered, true);
    assert.ok(res.corruptedBackupPath, 'Deve registrar caminho do arquivo quarentenado');
    assert.equal(fs.existsSync(res.corruptedBackupPath), true);
    assert.equal(fs.readFileSync(res.corruptedBackupPath, 'utf8'), '{"notes": [CORRUPTED JSON');
    assert.deepEqual(res.data.notes, [{ id: 'n1', title: 'Original' }]);

    // Arquivo principal deve ter sido curado com o conteúdo recuperado do .bak
    const healed = readJsonSafe(filePath, { defaultData: { notes: [] } });
    assert.deepEqual(healed.notes, [{ id: 'n1', title: 'Original' }]);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('readJsonWithMeta quarantines corrupted JSON when no .bak exists and returns defaultData', () => {
  const tmpDir = makeTempDir();
  try {
    const filePath = path.join(tmpDir, 'curadoria.json');
    const quarantineDir = path.join(tmpDir, 'quarantine');
    fs.writeFileSync(filePath, 'NOT_JSON_AT_ALL{{{', 'utf8');

    const res = readJsonWithMeta(filePath, {
      defaultData: () => ({ categories: [], playlists: [] }),
      schemaVersion: 1,
      quarantineDir,
    });

    assert.equal(res.exists, true);
    assert.equal(res.recovered, false);
    assert.ok(res.corruptedBackupPath);
    assert.equal(fs.existsSync(res.corruptedBackupPath), true);
    assert.equal(res.data.schemaVersion, 1);
    assert.deepEqual(res.data.playlists, []);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('withFileLock serializes concurrent read-modify-write updates without lost updates', async () => {
  const tmpDir = makeTempDir();
  try {
    const filePath = path.join(tmpDir, 'counter.json');
    writeJsonAtomic(filePath, { count: 0 }, { backup: false });

    const totalTasks = 20;
    await Promise.all(
      Array.from({ length: totalTasks }, (_, i) =>
        withFileLock(filePath, async () => {
          const cur = readJsonSafe(filePath, { defaultData: { count: 0 } });
          await new Promise((r) => setTimeout(r, (i % 3) + 1));
          writeJsonAtomic(filePath, { count: cur.count + 1 }, { backup: false });
        })
      )
    );

    const finalData = readJsonSafe(filePath, { defaultData: { count: 0 } });
    assert.equal(finalData.count, totalTasks);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('assertInsideRoot blocks path traversal, null bytes, and symlink escapes with 403', () => {
  const tmpDir = makeTempDir();
  const outsideDir = makeTempDir('crom-test-outside-');
  try {
    const rootDir = path.join(tmpDir, 'workspace');
    fs.mkdirSync(path.join(rootDir, '01-ideias'), { recursive: true });
    fs.writeFileSync(path.join(outsideDir, 'secret.txt'), 'secret', 'utf8');

    const okPath = assertInsideRoot(rootDir, path.join(rootDir, '01-ideias', 'novo.md'));
    assert.ok(okPath.startsWith(fs.realpathSync(rootDir)));

    assert.throws(
      () => assertInsideRoot(rootDir, path.join(rootDir, '..', 'outside.md')),
      (err) => err.statusCode === 403
    );

    assert.throws(
      () => assertInsideRoot(rootDir, '/etc/passwd'),
      (err) => err.statusCode === 403
    );

    assert.throws(
      () => assertInsideRoot(rootDir, `${rootDir}/01-ideias/a\0b.md`),
      (err) => err.statusCode === 403
    );

    const linkPath = path.join(rootDir, '01-ideias', 'escape-link');
    fs.symlinkSync(outsideDir, linkPath);
    assert.throws(
      () => assertInsideRoot(rootDir, path.join(linkPath, 'secret.txt')),
      (err) => err.statusCode === 403
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    fs.rmSync(outsideDir, { recursive: true, force: true });
  }
});
