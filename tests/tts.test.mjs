import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  BUILTIN_VOICE_PRESETS,
  createAudioCategory,
  deleteVoicePreset,
  listAudioCategories,
  listUnifiedAudios,
  listVoicePresets,
  parseMultivoiceBlocks,
  prepareNarrationText,
  readWavInfo,
  saveVoicePreset,
  splitTextIntoChunks,
  updateNarrationMeta,
} from '../src/tts.mjs';
import { moveToTrash, restoreFromTrash } from '../src/lib/trash.mjs';
import { createStudioServer } from '../src/server.mjs';
import { createVersion } from '../src/versioning.mjs';

function makeTempTtsWorkspace() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crom-tts-unit-'));
  const wsPath = path.join(tmpDir, 'ws-mrj');
  fs.mkdirSync(path.join(wsPath, '02-roteiros', 'rascunhos'), { recursive: true });
  fs.mkdirSync(path.join(wsPath, 'gravacoes', 'clonagem-voz', 'cortes'), { recursive: true });
  fs.mkdirSync(path.join(wsPath, '.studio-data'), { recursive: true });

  // Arquivo WAV mínimo válido (silêncio) em clonagem-voz
  const wavHeader = Buffer.alloc(44 + 320);
  wavHeader.write('RIFF', 0);
  wavHeader.writeUInt32LE(36 + 320, 4);
  wavHeader.write('WAVE', 8);
  wavHeader.write('fmt ', 12);
  wavHeader.writeUInt32LE(16, 16);
  wavHeader.writeUInt16LE(1, 20);
  wavHeader.writeUInt16LE(1, 22);
  wavHeader.writeUInt32LE(16000, 24);
  wavHeader.writeUInt32LE(32000, 28);
  wavHeader.writeUInt16LE(2, 32);
  wavHeader.writeUInt16LE(16, 34);
  wavHeader.write('data', 36);
  wavHeader.writeUInt32LE(320, 40);
  fs.writeFileSync(path.join(wsPath, 'gravacoes', 'clonagem-voz', 'cortes', 'amostra.wav'), wavHeader);

  fs.writeFileSync(
    path.join(wsPath, '02-roteiros', 'rascunhos', 'roteiro-teste.md'),
    `---
id: "roteiro-teste"
titulo: "Roteiro TTS"
tipo: "roteiro"
status: "roteiro"
---

# Título do Roteiro

[GANCHO] 00:00 – 00:15
Olá **mundo**! Veja \`código\` no [link](https://example.com).

[TELA]
\`\`\`js
console.log("ignorar bloco de codigo");
\`\`\`

Segunda frase importante para narrar! Terceira frase aqui.
`,
    'utf8'
  );

  return { tmpDir, wsPath };
}

test('prepareNarrationText limpa YAML, blocos de código, [GANCHO]/[TELA], timestamps e Markdown', () => {
  const raw = `---
id: "abc"
titulo: "Teste"
---

# Introdução

[GANCHO] 00:00 - 00:25 | Abertura
Olá **MrJ**! Confira o [projeto](https://github.com) em produção.

\`\`\`bash
echo "nao narrar isso"
\`\`\`

- Item um com *itálico*
- [ ] Tarefa pendente
`;
  const cleaned = prepareNarrationText(raw);
  assert.equal(cleaned.includes('id:'), false);
  assert.equal(cleaned.includes('[GANCHO]'), false);
  assert.equal(cleaned.includes('00:00'), false);
  assert.equal(cleaned.includes('nao narrar isso'), false);
  assert.equal(cleaned.includes('Olá MrJ!'), true);
  assert.equal(cleaned.includes('Confira o projeto em produção.'), true);
  assert.equal(cleaned.includes('Item um com itálico'), true);
});

test('prepareNarrationText com preserveVoiceTags + parseMultivoiceBlocks alterna mrj-pocket e crom-j', () => {
  const raw = `---
titulo: "Dialogo"
---
[mrj] Olá pessoal, eu sou o Mr. J.

[crom] E eu sou a voz da Crom!`;
  const cleaned = prepareNarrationText(raw, { preserveVoiceTags: true });
  const blocks = parseMultivoiceBlocks(cleaned, 'mrj-pocket', 'crom-j');
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0].voiceId, 'mrj-pocket');
  assert.match(blocks[0].text, /Mr\. J/);
  assert.equal(blocks[1].voiceId, 'crom-j');
  assert.match(blocks[1].text, /voz da Crom/);
});

test('splitTextIntoChunks respeita limite máximo e preserva sentenças', () => {
  const text = 'Primeira frase curta. Segunda frase um pouco mais longa para testar divisão. Terceira frase final!';
  const chunks = splitTextIntoChunks(text, 85);
  assert.ok(chunks.length >= 2);
  for (const ch of chunks) {
    assert.ok(ch.length <= 85, `Chunk excedeu limite: ${ch.length}`);
  }
});

test('CRUD de presets de voz inclui crom-j (1.50x, pitch 0.90x) e mrj-pocket', async () => {
  const { tmpDir, wsPath } = makeTempTtsWorkspace();
  try {
    const presets = listVoicePresets(wsPath);
    const cromJ = presets.find((p) => p.id === 'crom-j');
    const mrjPocket = presets.find((p) => p.id === 'mrj-pocket');
    assert.ok(cromJ);
    assert.equal(cromJ.lengthScale, 1.5);
    assert.equal(cromJ.noiseScale, 0.67);
    assert.equal(cromJ.noiseW, 0.8);
    assert.equal(cromJ.sentenceSilence, 0.2);
    assert.equal(cromJ.effects.pitchShift, 0.9);
    assert.ok(mrjPocket);
    assert.equal(mrjPocket.engine, 'pocket-tts');
    assert.equal(mrjPocket.temperature, 0.3);

    const saved = await saveVoicePreset(wsPath, {
      name: 'Crom Grave Custom',
      engine: 'piper',
      lengthScale: 1.25,
      effects: { pitchShift: 0.82, bassDb: 4 },
    });
    assert.equal(saved.ok, true);
    assert.ok(saved.presets.some((p) => p.id === saved.preset.id && p.effects.bassDb === 4));

    const del = await deleteVoicePreset(wsPath, saved.preset.id);
    assert.equal(del.ok, true);
    assert.equal(del.presets.some((p) => p.id === saved.preset.id), false);
    assert.equal(BUILTIN_VOICE_PRESETS.length >= 2, true);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('listUnifiedAudios agrega clonagem-voz + categorias personalizadas + atualização inline + HTTP Range + lixeira narration', async () => {
  const { tmpDir, wsPath } = makeTempTtsWorkspace();
  try {
    // Cria versão alternativa do roteiro
    createVersion(wsPath, '02-roteiros/rascunhos/roteiro-teste.md', {
      name: 'v2-enxuta',
      content: '# Versão Enxuta\nTexto curto apenas para testar narração de variante.',
    });

    const catRes = await createAudioCategory(wsPath, { label: 'Bastidores Especial' });
    assert.equal(catRes.ok, true);
    assert.ok(listAudioCategories(wsPath).some((c) => c.id === 'bastidores-especial'));

    const unified = listUnifiedAudios(wsPath);
    assert.equal(unified.length, 1);
    assert.equal(unified[0].origin, 'clonagem-voz');
    assert.equal(unified[0].category, 'clonagem-voz');
    const wavInfo = readWavInfo(path.join(wsPath, unified[0].relPath));
    assert.equal(wavInfo.sampleRate, 16000);

    await updateNarrationMeta(wsPath, unified[0].id, { category: 'bastidores-especial' });
    const afterCat = listUnifiedAudios(wsPath, { category: 'bastidores-especial' });
    assert.equal(afterCat.length, 1);

    // Testa Lixeira kind: 'narration'
    const dummyWav = path.join(wsPath, 'narracoes', '2026-11', 'nar-dummy.wav');
    fs.mkdirSync(path.dirname(dummyWav), { recursive: true });
    fs.writeFileSync(dummyWav, Buffer.from('RIFFtest'));
    const tr = await moveToTrash(wsPath, {
      kind: 'narration',
      originalPath: 'narracoes/2026-11/nar-dummy.wav',
      title: 'Narração Teste',
      sourceAbsPath: dummyWav,
      metadata: { id: 'nar-dummy', relPath: 'narracoes/2026-11/nar-dummy.wav' },
    });
    fs.rmSync(dummyWav, { force: true });
    const rest = await restoreFromTrash(wsPath, tr.id);
    assert.equal(rest.restored, true);
    assert.equal(fs.existsSync(dummyWav), true);

    // Testa HTTP API /api/tts/*
    const server = createStudioServer({
      port: 0,
      host: '127.0.0.1',
      defaultChannel: 'mrj',
      channelOrder: ['mrj'],
      disableDiskBundles: true,
      channels: {
        mrj: { key: 'mrj', name: 'MrJ', workspacePath: wsPath, seriesList: ['Imagine'], links: {} },
      },
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    const baseUrl = `http://127.0.0.1:${port}`;
    try {
      const stRes = await fetch(`${baseUrl}/api/tts/status?channel=mrj`);
      assert.equal(stRes.status, 200);
      const stJson = await stRes.json();
      assert.equal(stJson.ok, true);
      assert.ok(stJson.presets.some((p) => p.id === 'crom-j'));

      const prevRes = await fetch(`${baseUrl}/api/tts/preview-text`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel: 'mrj',
          docPath: '02-roteiros/rascunhos/roteiro-teste.md',
          docVersion: 'v2-enxuta',
        }),
      });
      const prevJson = await prevRes.json();
      assert.equal(prevJson.ok, true);
      assert.match(prevJson.preparedText, /Versão Enxuta/);

      // Bloqueia traversal em /api/tts/media
      const badMedia = await fetch(`${baseUrl}/api/tts/media?channel=mrj&path=../../etc/passwd`);
      assert.equal(badMedia.status, 403);

      // Streaming Range 206 válido do wav de clonagem-voz
      const goodMedia = await fetch(
        `${baseUrl}/api/tts/media?channel=mrj&path=${encodeURIComponent('gravacoes/clonagem-voz/cortes/amostra.wav')}`,
        { headers: { Range: 'bytes=0-43' } }
      );
      assert.equal(goodMedia.status, 206);
      const chunkBuf = Buffer.from(await goodMedia.arrayBuffer());
      assert.equal(chunkBuf.length, 44);
    } finally {
      await new Promise((resolve) => server.close(() => resolve()));
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
