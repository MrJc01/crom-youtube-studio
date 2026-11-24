import { MD } from '../core/constants.js';
import { renderCurrentView, setView, syncBrowserUrl, updateHeaderChrome } from '../core/router.js';
import { getActiveChannelData, registerViewRenderer, state } from '../core/state.js';
import { copyText, formatDatePt, formatNumber, showToast } from '../core/utils.js';

const ORIGIN_META = {
  roteiro: { label: 'Roteiro', cls: 'st-roteiro' },
  'pagina-narracao': { label: 'Estúdio Narração', cls: 'st-ideia' },
  'agente-cli': { label: 'Agente CLI', cls: 'st-gravando' },
  multivozes: { label: 'Multivozes', cls: 'st-edicao' },
  'clonagem-voz': { label: 'Clonagem de Voz', cls: 'st-pesquisa' },
  'gravacao-multitrack': { label: 'Gravação Multi-Track', cls: 'st-publicado' },
};

function formatAudioDuration(sec) {
  const n = Number(sec || 0);
  if (!n || !Number.isFinite(n)) return '—';
  if (n < 60) return `${n.toFixed(1)}s`;
  const m = Math.floor(n / 60);
  const s = Math.round(n % 60);
  return `${m}m ${String(s).padStart(2, '0')}s`;
}

function formatBytesShort(bytes) {
  const b = Number(bytes || 0);
  if (!b) return '—';
  if (b < 1024 * 1024) return `${Math.max(1, Math.round(b / 1024))} KB`;
  return `${(b / (1024 * 1024)).toFixed(2)} MB`;
}

function estimateSpeakTextStats(text, preset) {
  const clean = String(text || '').trim();
  const chars = clean.length;
  const words = clean ? clean.split(/\s+/).filter(Boolean).length : 0;
  // Ajuste aproximado conforme velocidade (lengthScale maior = mais lento)
  const factor = preset?.engine === 'piper' ? Number(preset?.lengthScale || 1) / 1.0 : 1.0;
  const sec = words > 0 ? Math.max(1, Math.round((words / 2.45) * factor)) : 0;
  return { chars, words, sec };
}

function applyPresetValuesToState(preset) {
  if (!preset) return;
  const ns = state.narrationState;
  ns.selectedPresetId = preset.id;
  ns.loudnorm = Boolean(preset.loudnorm);
  if (preset.engine === 'pocket-tts') {
    ns.voiceFile = String(preset.voiceFile || 'mrj_pt24l_ref01.safetensors');
    ns.temperature = Number(preset.temperature ?? 0.3);
    ns.samplerDecodeSteps = Number(preset.samplerDecodeSteps ?? 4);
    ns.noiseClamp = Number(preset.noiseClamp ?? 2.5);
    ns.pauseMs = Number(preset.pauseMs ?? 220);
  } else {
    ns.lengthScale = Number(preset.lengthScale ?? 1.5);
    ns.noiseScale = Number(preset.noiseScale ?? 0.67);
    ns.noiseW = Number(preset.noiseW ?? 0.8);
    ns.sentenceSilence = Number(preset.sentenceSilence ?? 0.2);
  }
  const fx = preset.effects || {};
  ns.pitchShift = Number(fx.pitchShift ?? 1.0);
  ns.reverb = Number(fx.reverb ?? 0);
  ns.bassDb = Number(fx.bassDb ?? 0);
  ns.trebleDb = Number(fx.trebleDb ?? 0);
  const rvc = preset.rvc || {};
  ns.rvcEnabled = Boolean(rvc.enabled);
  ns.rvcModelName = String(rvc.modelName || ns.rvcModelName || '');
  ns.rvcF0UpKey = Number(rvc.f0UpKey ?? 0);
  ns.rvcIndexRate = Number(rvc.indexRate ?? 0.75);
  ns.rvcProtect = Number(rvc.protect ?? 0.33);
}

function buildOverridesFromState(preset) {
  const ns = state.narrationState;
  const fx = {
    pitchShift: Number(ns.pitchShift ?? 1.0),
    reverb: Number(ns.reverb ?? 0),
    bassDb: Number(ns.bassDb ?? 0),
    trebleDb: Number(ns.trebleDb ?? 0),
  };
  const rvc = {
    enabled: Boolean(ns.rvcEnabled),
    modelName: String(ns.rvcModelName || '').trim(),
    f0UpKey: Number(ns.rvcF0UpKey ?? 0),
    indexRate: Number(ns.rvcIndexRate ?? 0.75),
    protect: Number(ns.rvcProtect ?? 0.33),
  };
  if (preset?.engine === 'pocket-tts') {
    return {
      voiceFile: String(ns.voiceFile || preset.voiceFile || 'mrj_pt24l_ref01.safetensors'),
      temperature: Number(ns.temperature ?? 0.3),
      samplerDecodeSteps: Number(ns.samplerDecodeSteps ?? 4),
      noiseClamp: Number(ns.noiseClamp) > 0 ? Number(ns.noiseClamp) : null,
      pauseMs: Number(ns.pauseMs ?? 220),
      loudnorm: Boolean(ns.loudnorm),
      effects: fx,
      rvc,
    };
  }
  return {
    lengthScale: Number(ns.lengthScale ?? 1.5),
    noiseScale: Number(ns.noiseScale ?? 0.67),
    noiseW: Number(ns.noiseW ?? 0.8),
    sentenceSilence: Number(ns.sentenceSilence ?? 0.2),
    loudnorm: Boolean(ns.loudnorm),
    effects: fx,
    rvc,
  };
}

async function fetchNarrationWorkspaceData(channelKey, { force = false } = {}) {
  if (!state.serverMode) return null;
  const ns = state.narrationState;
  if (ns.loading && !force) return null;
  ns.loading = true;
  try {
    const [statusRes, audiosRes] = await Promise.all([
      fetch(`/api/tts/status?channel=${encodeURIComponent(channelKey)}`, { cache: 'no-store' }),
      fetch(`/api/tts/audios?channel=${encodeURIComponent(channelKey)}`, { cache: 'no-store' }),
    ]);
    const statusJson = statusRes.ok ? await statusRes.json() : null;
    const audiosJson = audiosRes.ok ? await audiosRes.json() : null;
    if (statusJson?.ok) {
      ns.env = statusJson.env || null;
      ns.presets = Array.isArray(statusJson.presets) ? statusJson.presets : [];
      ns.categories = Array.isArray(statusJson.categories) ? statusJson.categories : [];
      const activePreset =
        ns.presets.find((p) => p.id === ns.selectedPresetId) || ns.presets[0];
      if (activePreset && ns.loadedChannel !== channelKey) {
        applyPresetValuesToState(activePreset);
      }
    }
    if (audiosJson?.ok) {
      ns.items = Array.isArray(audiosJson.items) ? audiosJson.items : [];
      if (Array.isArray(audiosJson.categories)) ns.categories = audiosJson.categories;
    }
    ns.loadedChannel = channelKey;
    return { statusJson, audiosJson };
  } catch {
    return null;
  } finally {
    ns.loading = false;
  }
}

async function loadVersionsForDoc(channelKey, docPath) {
  if (!state.serverMode || !docPath) return ['principal'];
  try {
    const res = await fetch(
      `/api/versions?channel=${encodeURIComponent(channelKey)}&path=${encodeURIComponent(docPath)}`,
      { cache: 'no-store' }
    );
    if (!res.ok) return ['principal'];
    const json = await res.json();
    const list = (json.versions || []).map((v) => v.name).filter(Boolean);
    return list.length ? list : ['principal'];
  } catch {
    return ['principal'];
  }
}

function getFilteredAudios() {
  const ns = state.narrationState;
  let list = Array.isArray(ns.items) ? [...ns.items] : [];
  if (ns.filterOrigin && ns.filterOrigin !== 'all') {
    list = list.filter((it) => it.origin === ns.filterOrigin);
  }
  if (ns.filterCategory && ns.filterCategory !== 'all') {
    list = list.filter((it) => it.category === ns.filterCategory);
  }
  if (ns.filterVoice && ns.filterVoice !== 'all') {
    list = list.filter(
      (it) => it.voiceId === ns.filterVoice || (Array.isArray(it.voicesUsed) && it.voicesUsed.includes(ns.filterVoice))
    );
  }
  if (ns.filterSearch && ns.filterSearch.trim()) {
    const q = ns.filterSearch.toLowerCase().trim();
    list = list.filter((it) =>
      `${it.title || ''} ${it.textPreview || ''} ${it.docPath || ''} ${it.voiceName || ''} ${it.origin || ''} ${it.category || ''}`
        .toLowerCase()
        .includes(q)
    );
  }
  return list;
}

function renderAudioCardHtml(item, channelKey, categories) {
  const orig = ORIGIN_META[item.origin] || { label: item.origin || 'Áudio', cls: 'st-referencia' };
  const mediaUrl = `/api/tts/media?channel=${encodeURIComponent(channelKey)}&path=${encodeURIComponent(item.relPath)}`;
  const isNarration = item.sourceKind === 'narration';

  const categoryOptions = categories
    .map(
      (c) =>
        `<option value="${MD.escapeHtml(c.id)}"${c.id === item.category ? ' selected' : ''}>${MD.escapeHtml(c.label)}</option>`
    )
    .join('');

  return `
    <article class="nar-audio-card" data-nar-card="${MD.escapeHtml(item.id)}">
      <div class="nar-audio-head">
        <div class="nar-audio-title-wrap">
          <div class="nar-audio-badges">
            <span class="status-pill ${orig.cls}">${MD.escapeHtml(orig.label)}</span>
            ${item.voiceName ? `<span class="badge-chip">${MD.escapeHtml(item.voiceName)}</span>` : ''}
            ${item.docVersion && item.docPath ? `<span class="badge-chip">${MD.escapeHtml(item.docVersion)}</span>` : ''}
          </div>
          <h4 class="nar-audio-title">${MD.escapeHtml(item.title || item.fileName)}</h4>
        </div>
        <div class="nar-audio-cat-wrap">
          <select class="select-dark nar-cat-select" data-nar-cat="${MD.escapeHtml(item.id)}" title="Alterar categoria do áudio">
            ${categoryOptions}
          </select>
        </div>
      </div>

      ${item.textPreview ? `<p class="nar-audio-preview">${MD.escapeHtml(item.textPreview)}</p>` : ''}

      <div class="nar-audio-player-row">
        <audio controls preload="none" src="${mediaUrl}" style="width:100%; height:36px;"></audio>
      </div>

      <div class="nar-audio-meta-row">
        <span>⏱ ${formatAudioDuration(item.durationSec)}</span>
        ${item.sampleRate ? `<span>• ${(item.sampleRate / 1000).toFixed(1)} kHz</span>` : ''}
        <span>• ${formatBytesShort(item.sizeBytes)}</span>
        <span>• ${formatDatePt(String(item.createdAt || '').slice(0, 10))}</span>
        ${item.docPath
          ? `<button type="button" class="nar-doc-link" data-nar-open-doc="${MD.escapeHtml(item.docPath)}" title="Abrir roteiro de origem">📄 ${MD.escapeHtml(item.docPath)}</button>`
          : `<span style="color:var(--text-3); font-family:var(--font-mono); font-size:10.5px;">${MD.escapeHtml(item.relPath)}</span>`}
      </div>

      <div class="nar-audio-actions">
        <a class="btn-sm" href="${mediaUrl}" download="${MD.escapeHtml(item.fileName || 'audio.wav')}">⬇ Baixar WAV</a>
        <button type="button" class="btn-sm" data-nar-copy="${MD.escapeHtml(item.relPath)}">📋 Copiar caminho</button>
        ${isNarration ? `<button type="button" class="btn-sm btn-danger-soft" data-nar-delete="${MD.escapeHtml(item.id)}">🗑 Lixeira</button>` : ''}
      </div>
    </article>
  `;
}

export async function renderNarrationView(container) {
  const chData = getActiveChannelData();
  const ns = state.narrationState;
  const channelKey = chData.key;

  if (state.serverMode && ns.loadedChannel !== channelKey && !ns.loading) {
    container.innerHTML = `<div class="empty-state-box">Carregando Estúdio de Vozes & Biblioteca de Áudios...</div>`;
    await fetchNarrationWorkspaceData(channelKey, { force: true });
    if (state.view !== 'narration') return;
  }

  const env = ns.env || {
    pocketTts: { available: false, voices: [] },
    piper: { binaryAvailable: false, hasFaberModel: false, models: [] },
    ffmpeg: { available: false },
  };
  const presets = ns.presets.length
    ? ns.presets
    : [
        { id: 'mrj-pocket', name: 'Voz do MrJ (Pocket TTS PT-BR)', engine: 'pocket-tts', temperature: 0.3, pauseMs: 220, loudnorm: true, effects: { pitchShift: 1, reverb: 0, bassDb: 0, trebleDb: 0 } },
        { id: 'crom-j', name: 'j — Voz da Crom (Piper Faber)', engine: 'piper', modelName: 'pt_BR-faber-medium.onnx', lengthScale: 1.5, noiseScale: 0.67, noiseW: 0.8, sentenceSilence: 0.2, loudnorm: false, effects: { pitchShift: 0.9, reverb: 0, bassDb: 0, trebleDb: 0 } },
      ];
  const categories = ns.categories.length
    ? ns.categories
    : [
        { id: 'narracao-roteiro', label: 'Narração de Roteiro' },
        { id: 'teste-voz', label: 'Teste de Voz' },
        { id: 'clonagem-voz', label: 'Referência / Clonagem' },
        { id: 'geral', label: 'Geral / Outros' },
      ];

  const activePreset = presets.find((p) => p.id === ns.selectedPresetId) || presets[0];
  const isPocket = activePreset.engine === 'pocket-tts';
  const filteredAudios = getFilteredAudios();
  const docs = chData.docs || [];
  if (!ns.selectedDocPath && docs.length) {
    const preferred = docs.find((d) => d.topFolder === '02-roteiros' || d.topFolder === '03-shorts') || docs[0];
    ns.selectedDocPath = preferred?.path || '';
  }

  const stats = estimateSpeakTextStats(ns.text, activePreset);

  container.innerHTML = `
    <section class="nar-shell">
      <div class="nar-header-card">
        <div>
          <span class="wb-eyebrow">SÍNTESE LOCAL OFFLINE • CUSTO ZERO</span>
          <h2 class="nar-h2">Estúdio de Vozes & Biblioteca de Narrações</h2>
          <p class="nar-sub">Gere narrações com a <strong>Voz do MrJ (Pocket TTS)</strong> e a <strong>Voz da Crom (Piper ONNX + FFmpeg)</strong>, misture diálogos ou gerencie todos os áudios do workspace por origem e categoria.</p>
        </div>

        <div class="nar-engine-strip">
          <div class="nar-engine-pill ${env.pocketTts?.available ? 'is-ok' : 'is-warn'}">
            <span>🎙️ Voz MrJ (Pocket TTS)</span>
            <strong>${env.pocketTts?.available ? 'Pronto' : 'Não detectado'}</strong>
          </div>
          <div class="nar-engine-pill ${env.piper?.binaryAvailable && env.piper?.hasFaberModel ? 'is-ok' : 'is-warn'}">
            <span>🤖 Voz Crom (Piper ONNX)</span>
            <strong>${env.piper?.binaryAvailable ? (env.piper?.hasFaberModel ? 'Faber Pronto' : 'Falta Modelo') : 'Binário Ausente'}</strong>
            ${env.piper?.binaryAvailable && !env.piper?.hasFaberModel
              ? `<button type="button" class="btn-xs btn-accent" id="narDownloadPiperBtn" ${ns.downloadingModel ? 'disabled' : ''}>${ns.downloadingModel ? 'Baixando...' : '⬇ Baixar Faber'}</button>`
              : ''}
          </div>
          <div class="nar-engine-pill ${env.ffmpeg?.available ? 'is-ok' : 'is-warn'}">
            <span>🎛️ FFmpeg</span>
            <strong>${env.ffmpeg?.available ? 'Ativo' : 'Ausente'}</strong>
          </div>
          <div class="nar-engine-pill ${env.rvc?.available ? 'is-ok' : 'is-warn'}">
            <span>✨ RVC v2 (Nível 2)</span>
            <strong>${env.rvc?.available ? `Pronto (${(env.rvc.models || []).length} .pth)` : env.rvc?.runnerAvailable ? 'Aguardando .pth' : 'Não configurado'}</strong>
          </div>
        </div>
      </div>

      <div class="nar-layout-grid">
        <!-- Painel Esquerdo: Sintetizador -->
        <div class="nar-synth-card">
          <div class="nar-source-tabs" role="tablist">
            <button type="button" class="btn-sm${ns.sourceTab === 'text' ? ' btn-accent' : ''}" data-nar-tab="text">Texto Único</button>
            <button type="button" class="btn-sm${ns.sourceTab === 'script' ? ' btn-accent' : ''}" data-nar-tab="script">De um Roteiro (.md)</button>
            <button type="button" class="btn-sm${ns.sourceTab === 'multivoice' ? ' btn-accent' : ''}" data-nar-tab="multivoice">Modo Script (Multivozes)</button>
          </div>

          <div class="nar-preset-bar">
            <label style="flex:1; min-width:210px;">
              <span class="nar-field-label">Perfil de Voz (Preset)</span>
              <select class="select-dark" id="narPresetSelect" style="width:100%;">
                ${presets
                  .map(
                    (p) =>
                      `<option value="${MD.escapeHtml(p.id)}"${p.id === activePreset.id ? ' selected' : ''}>${MD.escapeHtml(p.name)} [${p.engine === 'pocket-tts' ? 'Pocket TTS' : 'Piper ONNX'}]</option>`
                  )
                  .join('')}
              </select>
            </label>
            <div style="display:flex; gap:6px; align-items:flex-end;">
              <button type="button" class="btn-sm" id="narSavePresetBtn" title="Salvar ajustes atuais como preset personalizado">💾 Salvar Preset</button>
              <button type="button" class="btn-sm btn-danger-soft" id="narDeletePresetBtn" ${activePreset.builtin ? 'disabled title="Perfis integrados não podem ser excluídos"' : ''}>🗑 Excluir</button>
            </div>
          </div>

          ${ns.sourceTab === 'multivoice'
            ? `<div class="nar-multi-row">
                <label style="flex:1;">
                  <span class="nar-field-label">Voz [mrj] (Principal)</span>
                  <select class="select-dark" id="narVoiceSelectMultiA" style="width:100%;">
                    ${presets.map((p) => `<option value="${MD.escapeHtml(p.id)}"${p.id === ns.selectedPresetId ? ' selected' : ''}>${MD.escapeHtml(p.name)}</option>`).join('')}
                  </select>
                </label>
                <label style="flex:1;">
                  <span class="nar-field-label">Voz [crom] (Secundária)</span>
                  <select class="select-dark" id="narVoiceSelectMultiB" style="width:100%;">
                    ${presets.map((p) => `<option value="${MD.escapeHtml(p.id)}"${p.id === ns.secondaryPresetId ? ' selected' : ''}>${MD.escapeHtml(p.name)}</option>`).join('')}
                  </select>
                </label>
              </div>
              <div style="display:flex; gap:6px; flex-wrap:wrap;">
                <button type="button" class="btn-xs" id="narInsertMrjTagBtn">+ Inserir [mrj]</button>
                <button type="button" class="btn-xs" id="narInsertCromTagBtn">+ Inserir [crom]</button>
              </div>`
            : ''}

          ${ns.sourceTab === 'script'
            ? `<div class="nar-script-picker-box">
                <div style="display:grid; grid-template-columns:1.6fr 1fr; gap:8px;">
                  <label>
                    <span class="nar-field-label">Roteiro (.md)</span>
                    <select class="select-dark" id="narDocSelect" style="width:100%;">
                      ${docs
                        .map(
                          (d) =>
                            `<option value="${MD.escapeHtml(d.path)}"${d.path === ns.selectedDocPath ? ' selected' : ''}>${MD.escapeHtml(d.meta?.titulo || d.path)}</option>`
                        )
                        .join('')}
                    </select>
                  </label>
                  <label>
                    <span class="nar-field-label">Versão do Roteiro</span>
                    <select class="select-dark" id="narDocVersionSelect" style="width:100%;">
                      <option value="${MD.escapeHtml(ns.selectedDocVersion || 'principal')}">${MD.escapeHtml(ns.selectedDocVersion || 'principal')}</option>
                    </select>
                  </label>
                </div>
                <div style="display:flex; gap:8px; align-items:center; justify-content:space-between; flex-wrap:wrap;">
                  <label style="display:flex; align-items:center; gap:6px; font-size:12px; color:var(--text-2); cursor:pointer;">
                    <input type="checkbox" id="narCleanMdCheck" ${ns.cleanMarkdown ? 'checked' : ''}>
                    Remover [GANCHO]/[TELA], timestamps e Markdown automaticamente
                  </label>
                  <button type="button" class="btn-sm" id="narLoadDocTextBtn">⬇ Carregar texto no editor abaixo</button>
                </div>
              </div>`
            : ''}

          <label style="display:block;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
              <span class="nar-field-label">Texto para Conversão</span>
              <span style="font-family:var(--font-mono); font-size:11px; color:var(--text-3);" id="narTextCounter">${formatNumber(stats.chars)} caracteres • ${formatNumber(stats.words)} palavras</span>
            </div>
            <textarea class="nar-textarea" id="narTextInput" rows="7" placeholder="${ns.sourceTab === 'multivoice' ? '[mrj] Fala do Mr. J aqui...\n\n[crom] Resposta da Crom aqui...' : 'Digite ou cole o texto que deseja transformar em narração WAV local...'}">${MD.escapeHtml(ns.text)}</textarea>
          </label>

          <!-- Controles do Motor Ativo -->
          <div class="nar-params-box">
            <div class="nar-params-title">
              <span>${isPocket ? '⚙️ Sintonia Pocket TTS (Voz do MrJ)' : '⚙️ Sintonia e Ritmo (Piper Local ONNX)'}</span>
              <span class="badge-chip">${isPocket ? activePreset.voiceFile || 'mrj_pt24l_ref01.safetensors' : activePreset.modelName || 'pt_BR-faber-medium.onnx'}</span>
            </div>

            ${isPocket
              ? `<div style="margin-bottom:4px;">
                  <label>
                    <span class="nar-field-label">Referência de Voz (.safetensors / .wav)</span>
                    <select class="select-dark" id="narPocketVoiceSelect" style="width:100%;">
                      ${(env.pocketTts?.voices?.length ? env.pocketTts.voices : [ns.voiceFile || 'mrj_pt24l_ref01.safetensors'])
                        .map(
                          (vf) =>
                            `<option value="${MD.escapeHtml(vf)}"${vf === ns.voiceFile ? ' selected' : ''}>${MD.escapeHtml(vf)}</option>`
                        )
                        .join('')}
                    </select>
                  </label>
                </div>
                <div class="nar-sliders-grid">
                  <label class="nar-slider-item">
                    <div class="nar-slider-head"><span>Passos de Decodificação (Qualidade)</span><strong id="valDecodeSteps">${Math.round(ns.samplerDecodeSteps || 4)} passos</strong></div>
                    <input type="range" id="rngDecodeSteps" min="1" max="10" step="1" value="${Math.round(ns.samplerDecodeSteps || 4)}">
                    <div class="nar-slider-scale"><span>1 (Rápido)</span><span>4–6 (Fiel)</span><span>10 (Máx)</span></div>
                  </label>
                  <label class="nar-slider-item">
                    <div class="nar-slider-head"><span>Noise Clamp (Estabilidade)</span><strong id="valNoiseClamp">${Number(ns.noiseClamp) > 0 ? Number(ns.noiseClamp).toFixed(1) : 'Off'}</strong></div>
                    <input type="range" id="rngNoiseClamp" min="0" max="4.5" step="0.25" value="${Number(ns.noiseClamp || 0)}">
                  </label>
                  <label class="nar-slider-item">
                    <div class="nar-slider-head"><span>Temperatura (Expressividade)</span><strong id="valTemp">${Number(ns.temperature).toFixed(2)}</strong></div>
                    <input type="range" id="rngTemp" min="0.05" max="1.00" step="0.05" value="${Number(ns.temperature)}">
                  </label>
                  <label class="nar-slider-item">
                    <div class="nar-slider-head"><span>Pausa entre Blocos</span><strong id="valPauseMs">${Math.round(ns.pauseMs)} ms</strong></div>
                    <input type="range" id="rngPauseMs" min="0" max="1000" step="20" value="${Number(ns.pauseMs)}">
                  </label>
                </div>`
              : `<div class="nar-sliders-grid">
                  <label class="nar-slider-item">
                    <div class="nar-slider-head"><span>Velocidade (Length Scale)</span><strong id="valLengthScale">${Number(ns.lengthScale).toFixed(2)}x</strong></div>
                    <input type="range" id="rngLengthScale" min="0.50" max="2.50" step="0.05" value="${Number(ns.lengthScale)}">
                    <div class="nar-slider-scale"><span>Rápido (0.5)</span><span>Normal (1.0)</span><span>Lento (2.0+)</span></div>
                  </label>
                  <label class="nar-slider-item">
                    <div class="nar-slider-head"><span>Timbre / Sopro (Noise Scale)</span><strong id="valNoiseScale">${Number(ns.noiseScale).toFixed(2)}</strong></div>
                    <input type="range" id="rngNoiseScale" min="0.10" max="1.50" step="0.01" value="${Number(ns.noiseScale)}">
                  </label>
                  <label class="nar-slider-item">
                    <div class="nar-slider-head"><span>Articulação (Noise W)</span><strong id="valNoiseW">${Number(ns.noiseW).toFixed(2)}</strong></div>
                    <input type="range" id="rngNoiseW" min="0.10" max="1.50" step="0.01" value="${Number(ns.noiseW)}">
                  </label>
                  <label class="nar-slider-item">
                    <div class="nar-slider-head"><span>Pausa Sentenças</span><strong id="valSentenceSil">${Number(ns.sentenceSilence).toFixed(2)}s</strong></div>
                    <input type="range" id="rngSentenceSil" min="0.00" max="1.50" step="0.05" value="${Number(ns.sentenceSilence)}">
                  </label>
                </div>`}
          </div>

          <!-- Camada FFmpeg -->
          <div class="nar-params-box">
            <div class="nar-params-title">
              <span>🎛️ Camada FFmpeg de Modificação (Efeitos e Filtros)</span>
              <label style="display:flex; align-items:center; gap:6px; font-size:11.5px; color:var(--text-2); cursor:pointer;">
                <input type="checkbox" id="narLoudnormCheck" ${ns.loudnorm ? 'checked' : ''}>
                Normalizar -14 LUFS / 48 kHz
              </label>
            </div>
            <div class="nar-sliders-grid">
              <label class="nar-slider-item">
                <div class="nar-slider-head"><span>Grave / Agudo (Pitch Shift)</span><strong id="valPitch">${Number(ns.pitchShift).toFixed(2)}x</strong></div>
                <input type="range" id="rngPitch" min="0.60" max="1.60" step="0.02" value="${Number(ns.pitchShift)}">
              </label>
              <label class="nar-slider-item">
                <div class="nar-slider-head"><span>Reverberação (Eco)</span><strong id="valReverb">${Math.round(ns.reverb)}%</strong></div>
                <input type="range" id="rngReverb" min="0" max="100" step="5" value="${Number(ns.reverb)}">
              </label>
              <label class="nar-slider-item">
                <div class="nar-slider-head"><span>Reforço de Graves (Bass)</span><strong id="valBass">${Math.round(ns.bassDb)} dB</strong></div>
                <input type="range" id="rngBass" min="-12" max="12" step="1" value="${Number(ns.bassDb)}">
              </label>
              <label class="nar-slider-item">
                <div class="nar-slider-head"><span>Brilho dos Agudos (Treble)</span><strong id="valTreble">${Math.round(ns.trebleDb)} dB</strong></div>
                <input type="range" id="rngTreble" min="-12" max="12" step="1" value="${Number(ns.trebleDb)}">
              </label>
            </div>
          </div>

          <!-- Camada Nível 2: RVC v2 Local (Pós-conversão de timbre na CPU) -->
          <div class="nar-params-box">
            <div class="nar-params-title">
              <span>✨ Nível 2: Conversão de Timbre RVC v2 (CPU Local)</span>
              <label style="display:flex; align-items:center; gap:6px; font-size:11.5px; color:var(--text-2); cursor:pointer;">
                <input type="checkbox" id="narRvcEnabledCheck" ${ns.rvcEnabled ? 'checked' : ''} ${!(env.rvc?.models?.length) ? 'disabled' : ''}>
                Ativar RVC v2
              </label>
            </div>
            ${env.rvc?.models?.length
              ? `<div style="display:flex; flex-direction:column; gap:10px;">
                  <label>
                    <span class="nar-field-label">Modelo Treinado (.pth + .index)</span>
                    <select class="select-dark" id="narRvcModelSelect" style="width:100%;">
                      <option value="">Selecionar modelo...</option>
                      ${env.rvc.models
                        .map(
                          (m) =>
                            `<option value="${MD.escapeHtml(m.name)}"${m.name === ns.rvcModelName ? ' selected' : ''}>${MD.escapeHtml(m.name)}${m.indexPath ? ' (+ index)' : ''}</option>`
                        )
                        .join('')}
                    </select>
                  </label>
                  <div class="nar-sliders-grid">
                    <label class="nar-slider-item">
                      <div class="nar-slider-head"><span>Ajuste Semitons (f0)</span><strong id="valRvcPitch">${Math.round(ns.rvcF0UpKey)}</strong></div>
                      <input type="range" id="rngRvcPitch" min="-12" max="12" step="1" value="${Math.round(ns.rvcF0UpKey)}">
                    </label>
                    <label class="nar-slider-item">
                      <div class="nar-slider-head"><span>Fidelidade Timbre (Index)</span><strong id="valRvcIndex">${Number(ns.rvcIndexRate).toFixed(2)}</strong></div>
                      <input type="range" id="rngRvcIndex" min="0.00" max="1.00" step="0.05" value="${Number(ns.rvcIndexRate)}">
                    </label>
                    <label class="nar-slider-item">
                      <div class="nar-slider-head"><span>Proteção Consoantes</span><strong id="valRvcProtect">${Number(ns.rvcProtect).toFixed(2)}</strong></div>
                      <input type="range" id="rngRvcProtect" min="0.00" max="0.50" step="0.01" value="${Number(ns.rvcProtect)}">
                    </label>
                  </div>
                </div>`
              : `<div style="font-size:12px; color:var(--text-3); line-height:1.45;">
                  Runner RVC CPU <strong>${env.rvc?.runnerAvailable ? 'pronto' : 'não encontrado'}</strong>. Para ativar o Nível 2, treine seu modelo no Colab T4 usando <code>gravacoes/clonagem-voz/dataset-rvc/treinar-mrj-rvc-colab.ipynb</code> e copie <code>mrj_rvc.pth</code> + <code>.index</code> para <code>${MD.escapeHtml(env.rvc?.defaultModelsDir || '~/.local/share/crom-youtube-studio/rvc-models')}</code> (veja <code>04-producao/voz-nivel2-rvc-colab.md</code>).
                </div>`}
          </div>

          <div style="display:grid; grid-template-columns:1.2fr 1fr; gap:10px;">
            <label>
              <span class="nar-field-label">Título do Áudio (opcional)</span>
              <input type="text" class="search-box-sm" id="narTitleInput" placeholder="Ex: Gancho do vídeo Imagine #04" value="${MD.escapeHtml(ns.title)}">
            </label>
            <label>
              <span class="nar-field-label">Categoria na Biblioteca</span>
              <select class="select-dark" id="narCategorySelect" style="width:100%;">
                ${categories
                  .map(
                    (c) =>
                      `<option value="${MD.escapeHtml(c.id)}"${c.id === ns.category ? ' selected' : ''}>${MD.escapeHtml(c.label)}</option>`
                  )
                  .join('')}
              </select>
            </label>
          </div>

          <div class="nar-footer-bar">
            <div style="font-size:12px; color:var(--text-2);" id="narEstCostRow">
              <span>Duração Estimada: <strong>~${formatAudioDuration(stats.sec)}</strong></span>
              <span style="margin-left:10px; color:#4ade80;">• Custo: <strong>Gratuito (Local)</strong></span>
            </div>
            <button type="button" class="btn-primary" id="narGenerateBtn" ${ns.generating ? 'disabled' : ''}>
              ${ns.generating ? '⏳ Sintetizando áudio...' : '🔊 Gerar Áudio com Efeitos'}
            </button>
          </div>
        </div>

        <!-- Painel Direito: Biblioteca Unificada de Todos os Áudios -->
        <div class="nar-library-card">
          <div class="nar-lib-head">
            <div>
              <h3 style="margin:0; font-size:16px;">Biblioteca Unificada de Áudios</h3>
              <p style="margin:3px 0 0; font-size:12px; color:var(--text-3);">Todos os áudios gerados (roteiros, página Narração, agente CLI, multivozes) + referências/gravações em disco.</p>
            </div>
            <div style="display:flex; gap:6px; align-items:center;">
              <button type="button" class="btn-sm" id="narNewCategoryBtn">+ Categoria</button>
              <button type="button" class="btn-sm" id="narRefreshBtn">↻ Atualizar</button>
            </div>
          </div>

          <div class="nar-lib-filters">
            <input type="search" class="search-box-sm" id="narLibSearch" placeholder="Buscar por título, roteiro, texto ou voz..." value="${MD.escapeHtml(ns.filterSearch)}" style="flex:1; min-width:180px;">
            <select class="select-dark" id="narLibOriginFilter">
              <option value="all"${ns.filterOrigin === 'all' ? ' selected' : ''}>Origem: Todas</option>
              <option value="roteiro"${ns.filterOrigin === 'roteiro' ? ' selected' : ''}>Roteiro</option>
              <option value="pagina-narracao"${ns.filterOrigin === 'pagina-narracao' ? ' selected' : ''}>Estúdio Narração</option>
              <option value="agente-cli"${ns.filterOrigin === 'agente-cli' ? ' selected' : ''}>Agente CLI</option>
              <option value="multivozes"${ns.filterOrigin === 'multivozes' ? ' selected' : ''}>Multivozes</option>
              <option value="clonagem-voz"${ns.filterOrigin === 'clonagem-voz' ? ' selected' : ''}>Clonagem de Voz</option>
              <option value="gravacao-multitrack"${ns.filterOrigin === 'gravacao-multitrack' ? ' selected' : ''}>Gravação Multi-Track</option>
            </select>
            <select class="select-dark" id="narLibCatFilter">
              <option value="all"${ns.filterCategory === 'all' ? ' selected' : ''}>Categoria: Todas</option>
              ${categories
                .map(
                  (c) =>
                    `<option value="${MD.escapeHtml(c.id)}"${ns.filterCategory === c.id ? ' selected' : ''}>${MD.escapeHtml(c.label)}</option>`
                )
                .join('')}
            </select>
          </div>

          <div class="nar-lib-count">
            <span>Exibindo <strong>${filteredAudios.length}</strong> de ${ns.items.length} áudio(s) no canal <strong>${MD.escapeHtml(channelKey)}</strong></span>
          </div>

          <div class="nar-lib-list" id="narLibList">
            ${filteredAudios.length
              ? filteredAudios.map((item) => renderAudioCardHtml(item, channelKey, categories)).join('')
              : `<div class="empty-state-box">Nenhum áudio encontrado com os filtros atuais. Gere uma narração ao lado ou rode <code>./bin/crom-studio narrar</code>.</div>`}
          </div>
        </div>
      </div>
    </section>
  `;

  bindNarrationViewEvents(container, channelKey, presets, categories);
  if (ns.sourceTab === 'script' && ns.selectedDocPath) {
    populateScriptVersionSelect(channelKey, ns.selectedDocPath, ns.selectedDocVersion);
  }
}

async function populateScriptVersionSelect(channelKey, docPath, activeVer) {
  const sel = document.getElementById('narDocVersionSelect');
  if (!sel || !docPath) return;
  const versions = await loadVersionsForDoc(channelKey, docPath);
  if (!document.body.contains(sel)) return;
  sel.innerHTML = versions
    .map((v) => `<option value="${MD.escapeHtml(v)}"${v === activeVer ? ' selected' : ''}>${MD.escapeHtml(v)}</option>`)
    .join('');
}

function refreshLibListDom(container, channelKey, categories) {
  const listEl = document.getElementById('narLibList');
  const ns = state.narrationState;
  const filtered = getFilteredAudios();
  const countEl = container.querySelector('.nar-lib-count');
  if (countEl) {
    countEl.innerHTML = `<span>Exibindo <strong>${filtered.length}</strong> de ${ns.items.length} áudio(s) no canal <strong>${MD.escapeHtml(channelKey)}</strong></span>`;
  }
  if (!listEl) return;
  listEl.innerHTML = filtered.length
    ? filtered.map((item) => renderAudioCardHtml(item, channelKey, categories)).join('')
    : `<div class="empty-state-box">Nenhum áudio encontrado com os filtros atuais.</div>`;
  bindAudioCardEvents(listEl, container, channelKey, categories);
}

function bindAudioCardEvents(scopeEl, container, channelKey, categories) {
  scopeEl.querySelectorAll('[data-nar-open-doc]').forEach((btn) => {
    btn.onclick = () => {
      setView('scripts', btn.dataset.narOpenDoc);
    };
  });

  scopeEl.querySelectorAll('[data-nar-copy]').forEach((btn) => {
    btn.onclick = () => copyText(btn.dataset.narCopy, 'Caminho relativo copiado!');
  });

  scopeEl.querySelectorAll('[data-nar-cat]').forEach((sel) => {
    sel.onchange = async () => {
      const id = sel.dataset.narCat;
      const category = sel.value;
      try {
        const res = await fetch('/api/tts/audios', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ channel: channelKey, id, category }),
        });
        const json = await res.json();
        if (!res.ok || !json.ok) throw new Error(json.error || 'Falha ao atualizar categoria');
        const target = state.narrationState.items.find((x) => x.id === id);
        if (target) target.category = category;
        showToast('Categoria atualizada!');
      } catch (err) {
        showToast(err.message);
      }
    };
  });

  scopeEl.querySelectorAll('[data-nar-delete]').forEach((btn) => {
    btn.onclick = async () => {
      const id = btn.dataset.narDelete;
      if (!confirm('Mover este áudio gerado para a Lixeira recuperável (30 dias)?')) return;
      try {
        const res = await fetch(`/api/tts/audios?channel=${encodeURIComponent(channelKey)}&id=${encodeURIComponent(id)}`, {
          method: 'DELETE',
        });
        const json = await res.json();
        if (!res.ok || !json.ok) throw new Error(json.error || 'Erro ao remover áudio');
        if (json.state && state.data?.channels?.[channelKey]) {
          state.data.channels[channelKey] = json.state;
        }
        await fetchNarrationWorkspaceData(channelKey, { force: true });
        refreshLibListDom(container, channelKey, state.narrationState.categories);
        showToast('Áudio movido para a Lixeira.');
      } catch (err) {
        showToast(err.message);
      }
    };
  });
}

function bindNarrationViewEvents(container, channelKey, presets, categories) {
  const ns = state.narrationState;
  const activePreset = presets.find((p) => p.id === ns.selectedPresetId) || presets[0];

  document.getElementById('narDownloadPiperBtn')?.addEventListener('click', async () => {
    if (!state.serverMode) return showToast('Requer servidor local ativo.');
    ns.downloadingModel = true;
    renderNarrationView(container);
    try {
      const res = await fetch('/api/tts/piper/download-model', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelName: 'pt_BR-faber-medium.onnx' }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || 'Erro ao baixar modelo Piper');
      ns.env = json.env || ns.env;
      showToast('Modelo pt_BR-faber-medium.onnx baixado e pronto!');
    } catch (err) {
      showToast(err.message);
    } finally {
      ns.downloadingModel = false;
      renderNarrationView(container);
    }
  });

  container.querySelectorAll('[data-nar-tab]').forEach((btn) => {
    btn.onclick = () => {
      ns.sourceTab = btn.dataset.narTab;
      ns.mode = ns.sourceTab === 'multivoice' ? 'multivoice' : 'single';
      if (ns.sourceTab === 'script' && !ns.category) ns.category = 'narracao-roteiro';
      renderNarrationView(container);
    };
  });

  const presetSel = document.getElementById('narPresetSelect');
  if (presetSel) {
    presetSel.onchange = () => {
      const found = presets.find((p) => p.id === presetSel.value);
      if (found) applyPresetValuesToState(found);
      renderNarrationView(container);
    };
  }

  document.getElementById('narVoiceSelectMultiA')?.addEventListener('change', (e) => {
    ns.selectedPresetId = e.target.value;
  });
  document.getElementById('narVoiceSelectMultiB')?.addEventListener('change', (e) => {
    ns.secondaryPresetId = e.target.value;
  });

  const appendTag = (tag) => {
    const ta = document.getElementById('narTextInput');
    if (!ta) return;
    const prefix = ta.value.trim() ? '\n\n' : '';
    ta.value = `${ta.value}${prefix}[${tag}] `;
    ns.text = ta.value;
    ta.focus();
    ta.dispatchEvent(new Event('input'));
  };
  document.getElementById('narInsertMrjTagBtn')?.addEventListener('click', () => appendTag('mrj'));
  document.getElementById('narInsertCromTagBtn')?.addEventListener('click', () => appendTag('crom'));

  const docSel = document.getElementById('narDocSelect');
  if (docSel) {
    docSel.onchange = () => {
      ns.selectedDocPath = docSel.value;
      ns.selectedDocVersion = 'principal';
      populateScriptVersionSelect(channelKey, ns.selectedDocPath, ns.selectedDocVersion);
    };
  }
  document.getElementById('narDocVersionSelect')?.addEventListener('change', (e) => {
    ns.selectedDocVersion = e.target.value;
  });
  document.getElementById('narCleanMdCheck')?.addEventListener('change', (e) => {
    ns.cleanMarkdown = Boolean(e.target.checked);
  });

  document.getElementById('narLoadDocTextBtn')?.addEventListener('click', async () => {
    if (!ns.selectedDocPath) return;
    try {
      const res = await fetch('/api/tts/preview-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel: channelKey,
          docPath: ns.selectedDocPath,
          docVersion: ns.selectedDocVersion || 'principal',
          preserveVoiceTags: ns.sourceTab === 'multivoice',
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || 'Erro ao ler versão do roteiro');
      ns.text = json.preparedText || '';
      ns.category = 'narracao-roteiro';
      renderNarrationView(container);
      showToast(`Texto carregado (${json.wordCount} palavras faladas).`);
    } catch (err) {
      showToast(err.message);
    }
  });

  const textEl = document.getElementById('narTextInput');
  if (textEl) {
    textEl.oninput = () => {
      ns.text = textEl.value;
      const st = estimateSpeakTextStats(ns.text, activePreset);
      const cntEl = document.getElementById('narTextCounter');
      if (cntEl) cntEl.textContent = `${formatNumber(st.chars)} caracteres • ${formatNumber(st.words)} palavras`;
      const estEl = document.getElementById('narEstCostRow');
      if (estEl) {
        estEl.innerHTML = `<span>Duração Estimada: <strong>~${formatAudioDuration(st.sec)}</strong></span><span style="margin-left:10px; color:#4ade80;">• Custo: <strong>Gratuito (Local)</strong></span>`;
      }
    };
  }

  document.getElementById('narTitleInput')?.addEventListener('input', (e) => {
    ns.title = e.target.value;
  });
  document.getElementById('narCategorySelect')?.addEventListener('change', (e) => {
    ns.category = e.target.value;
  });
  document.getElementById('narLoudnormCheck')?.addEventListener('change', (e) => {
    ns.loudnorm = Boolean(e.target.checked);
  });
  document.getElementById('narPocketVoiceSelect')?.addEventListener('change', (e) => {
    ns.voiceFile = e.target.value;
  });
  document.getElementById('narRvcEnabledCheck')?.addEventListener('change', (e) => {
    ns.rvcEnabled = Boolean(e.target.checked);
    if (ns.rvcEnabled && !ns.rvcModelName && state.narrationState.env?.rvc?.models?.length) {
      ns.rvcModelName = state.narrationState.env.rvc.models[0].name;
    }
  });
  document.getElementById('narRvcModelSelect')?.addEventListener('change', (e) => {
    ns.rvcModelName = e.target.value;
  });

  const bindRange = (id, labelId, key, fmt) => {
    const inp = document.getElementById(id);
    if (!inp) return;
    inp.oninput = () => {
      const val = Number(inp.value);
      ns[key] = val;
      const lbl = document.getElementById(labelId);
      if (lbl) lbl.textContent = fmt(val);
    };
  };
  bindRange('rngTemp', 'valTemp', 'temperature', (v) => v.toFixed(2));
  bindRange('rngDecodeSteps', 'valDecodeSteps', 'samplerDecodeSteps', (v) => `${Math.round(v)} passos`);
  bindRange('rngNoiseClamp', 'valNoiseClamp', 'noiseClamp', (v) => (v > 0 ? v.toFixed(1) : 'Off'));
  bindRange('rngPauseMs', 'valPauseMs', 'pauseMs', (v) => `${Math.round(v)} ms`);
  bindRange('rngLengthScale', 'valLengthScale', 'lengthScale', (v) => `${v.toFixed(2)}x`);
  bindRange('rngNoiseScale', 'valNoiseScale', 'noiseScale', (v) => v.toFixed(2));
  bindRange('rngNoiseW', 'valNoiseW', 'noiseW', (v) => v.toFixed(2));
  bindRange('rngSentenceSil', 'valSentenceSil', 'sentenceSilence', (v) => `${v.toFixed(2)}s`);
  bindRange('rngPitch', 'valPitch', 'pitchShift', (v) => `${v.toFixed(2)}x`);
  bindRange('rngReverb', 'valReverb', 'reverb', (v) => `${Math.round(v)}%`);
  bindRange('rngBass', 'valBass', 'bassDb', (v) => `${Math.round(v)} dB`);
  bindRange('rngTreble', 'valTreble', 'trebleDb', (v) => `${Math.round(v)} dB`);
  bindRange('rngRvcPitch', 'valRvcPitch', 'rvcF0UpKey', (v) => `${Math.round(v)}`);
  bindRange('rngRvcIndex', 'valRvcIndex', 'rvcIndexRate', (v) => v.toFixed(2));
  bindRange('rngRvcProtect', 'valRvcProtect', 'rvcProtect', (v) => v.toFixed(2));

  document.getElementById('narSavePresetBtn')?.addEventListener('click', async () => {
    const suggested = activePreset.builtin ? `${activePreset.id}-custom` : activePreset.name;
    const name = prompt('Nome do Perfil de Voz personalizado:', suggested);
    if (!name || !name.trim()) return;
    try {
      const overrides = buildOverridesFromState(activePreset);
      const res = await fetch('/api/tts/presets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel: channelKey,
          name: name.trim(),
          engine: activePreset.engine,
          language: activePreset.language,
          voiceFile: activePreset.voiceFile,
          modelName: activePreset.modelName,
          ...overrides,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || 'Erro ao salvar preset');
      ns.presets = json.presets;
      ns.selectedPresetId = json.preset.id;
      showToast(`Preset "${json.preset.name}" salvo!`);
      renderNarrationView(container);
    } catch (err) {
      showToast(err.message);
    }
  });

  document.getElementById('narDeletePresetBtn')?.addEventListener('click', async () => {
    if (activePreset.builtin) return;
    if (!confirm(`Excluir o perfil personalizado "${activePreset.name}"?`)) return;
    try {
      const res = await fetch(`/api/tts/presets?channel=${encodeURIComponent(channelKey)}&id=${encodeURIComponent(activePreset.id)}`, {
        method: 'DELETE',
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || 'Erro ao excluir perfil');
      ns.presets = json.presets;
      applyPresetValuesToState(ns.presets[0]);
      showToast('Perfil excluído.');
      renderNarrationView(container);
    } catch (err) {
      showToast(err.message);
    }
  });

  document.getElementById('narGenerateBtn')?.addEventListener('click', async () => {
    if (!state.serverMode) return showToast('Síntese TTS requer o servidor local.');
    const useScript = ns.sourceTab === 'script' && !ns.text.trim();
    if (!ns.text.trim() && !useScript) {
      showToast('Digite um texto ou carregue um roteiro para gerar áudio.');
      return;
    }
    ns.generating = true;
    renderNarrationView(container);
    try {
      const overrides = buildOverridesFromState(activePreset);
      const res = await fetch('/api/tts/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel: channelKey,
          text: ns.text,
          docPath: ns.sourceTab === 'script' ? ns.selectedDocPath : '',
          docVersion: ns.sourceTab === 'script' ? ns.selectedDocVersion : 'principal',
          voiceId: ns.selectedPresetId,
          secondaryVoiceId: ns.secondaryPresetId,
          mode: ns.sourceTab === 'multivoice' ? 'multivoice' : 'single',
          category: ns.category,
          title: ns.title,
          origin: ns.sourceTab === 'multivoice' ? 'multivozes' : ns.sourceTab === 'script' ? 'roteiro' : 'pagina-narracao',
          cleanMarkdown: Boolean(ns.cleanMarkdown),
          loudnorm: Boolean(ns.loudnorm),
          overrides,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || 'Erro ao gerar narração');
      if (json.state && state.data?.channels?.[channelKey]) {
        state.data.channels[channelKey] = json.state;
      }
      await fetchNarrationWorkspaceData(channelKey, { force: true });
      showToast(`Áudio gerado (${formatAudioDuration(json.item.durationSec)})!`);
    } catch (err) {
      showToast(err.message);
    } finally {
      ns.generating = false;
      renderNarrationView(container);
    }
  });

  document.getElementById('narNewCategoryBtn')?.addEventListener('click', async () => {
    const label = prompt('Nome da nova categoria de áudio (ex: Bastidores, Shorts, B-Roll):');
    if (!label || !label.trim()) return;
    try {
      const res = await fetch('/api/tts/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: channelKey, label: label.trim() }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || 'Erro ao criar categoria');
      ns.categories = json.categories;
      showToast(`Categoria "${json.category.label}" adicionada!`);
      renderNarrationView(container);
    } catch (err) {
      showToast(err.message);
    }
  });

  document.getElementById('narRefreshBtn')?.addEventListener('click', async () => {
    await fetchNarrationWorkspaceData(channelKey, { force: true });
    renderNarrationView(container);
    showToast('Biblioteca de áudios atualizada.');
  });

  document.getElementById('narLibSearch')?.addEventListener('input', (e) => {
    ns.filterSearch = e.target.value;
    refreshLibListDom(container, channelKey, ns.categories);
  });
  document.getElementById('narLibOriginFilter')?.addEventListener('change', (e) => {
    ns.filterOrigin = e.target.value;
    refreshLibListDom(container, channelKey, ns.categories);
  });
  document.getElementById('narLibCatFilter')?.addEventListener('change', (e) => {
    ns.filterCategory = e.target.value;
    refreshLibListDom(container, channelKey, ns.categories);
  });

  const libList = document.getElementById('narLibList');
  if (libList) bindAudioCardEvents(libList, container, channelKey, categories);
}

/**
 * Opens #narrateScriptModal inside Roteiros so the user picks any script version,
 * voice preset (MrJ Pocket TTS or Crom Piper), edits/cleans text, and generates WAV linked to the script.
 */
export async function openScriptNarrationModal({ docPath, docTitle, defaultVersion = 'principal' }) {
  const modal = document.getElementById('narrateScriptModal');
  const bodyEl = document.getElementById('narrateScriptModalBody');
  if (!modal || !bodyEl) return;

  if (!state.serverMode) {
    showToast('Gerar narração de roteiro requer o servidor local (./bin/crom-studio --tray).');
    return;
  }

  const channelKey = state.activeChannel;
  bodyEl.innerHTML = `<div style="padding:18px; text-align:center; color:var(--text-3);">Carregando vozes e versões de "${MD.escapeHtml(docTitle || docPath)}"...</div>`;
  modal.classList.remove('hidden');

  await fetchNarrationWorkspaceData(channelKey, { force: true });
  const versions = await loadVersionsForDoc(channelKey, docPath);
  const presets = state.narrationState.presets.length
    ? state.narrationState.presets
    : [
        { id: 'mrj-pocket', name: 'Voz do MrJ (Pocket TTS PT-BR)', engine: 'pocket-tts' },
        { id: 'crom-j', name: 'j — Voz da Crom (Piper Faber)', engine: 'piper' },
      ];
  const categories = state.narrationState.categories.length
    ? state.narrationState.categories
    : [{ id: 'narracao-roteiro', label: 'Narração de Roteiro' }];

  let selectedVersion = versions.includes(defaultVersion) ? defaultVersion : versions[0] || 'principal';
  let previewText = '';

  const loadPreview = async (ver) => {
    const res = await fetch('/api/tts/preview-text', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel: channelKey, docPath, docVersion: ver }),
    });
    const json = await res.json();
    previewText = json.preparedText || '';
    const ta = document.getElementById('narModalTextArea');
    const st = document.getElementById('narModalStats');
    if (ta) ta.value = previewText;
    if (st) st.textContent = `${json.wordCount || 0} palavras faladas prontas (após limpeza de marcações)`;
  };

  bodyEl.innerHTML = `
    <div style="display:flex; flex-direction:column; gap:12px;">
      <div style="font-size:12.5px; color:var(--text-2);">
        Roteiro: <strong style="color:var(--text-1);">${MD.escapeHtml(docTitle || docPath)}</strong>
      </div>

      <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
        <label>
          <span>Versão do Roteiro</span>
          <select id="narModalVersionSel">
            ${versions.map((v) => `<option value="${MD.escapeHtml(v)}"${v === selectedVersion ? ' selected' : ''}>${MD.escapeHtml(v)}</option>`).join('')}
          </select>
        </label>
        <label>
          <span>Voz / Preset</span>
          <select id="narModalVoiceSel">
            ${presets.map((p) => `<option value="${MD.escapeHtml(p.id)}">${MD.escapeHtml(p.name)}</option>`).join('')}
          </select>
        </label>
      </div>

      <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
        <label>
          <span>Categoria</span>
          <select id="narModalCatSel">
            ${categories.map((c) => `<option value="${MD.escapeHtml(c.id)}"${c.id === 'narracao-roteiro' ? ' selected' : ''}>${MD.escapeHtml(c.label)}</option>`).join('')}
          </select>
        </label>
        <label style="justify-content:flex-end; flex-direction:row; align-items:center; gap:8px; padding-top:18px;">
          <input type="checkbox" id="narModalLoudnormCheck" checked>
          <span style="font-size:12px; color:var(--text-2);">Normalizar YouTube (-14 LUFS)</span>
        </label>
      </div>

      <label>
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <span>Texto limpo da versão (editável antes de gerar)</span>
          <small id="narModalStats" style="color:var(--text-3); font-family:var(--font-mono);">Carregando texto...</small>
        </div>
        <textarea id="narModalTextArea" rows="7" style="min-height:150px;"></textarea>
      </label>

      <div class="modal-actions" style="justify-content:space-between;">
        <button type="button" class="btn-ghost" id="narModalOpenStudioBtn">Abrir na página Narração ↗</button>
        <div style="display:flex; gap:8px;">
          <button type="button" class="btn-ghost" data-close-modal="narrateScriptModal">Cancelar</button>
          <button type="button" class="btn-primary" id="narModalGenerateBtn">🔊 Gerar Áudio desta Versão</button>
        </div>
      </div>
    </div>
  `;

  await loadPreview(selectedVersion).catch(() => {});

  bodyEl.querySelectorAll('[data-close-modal="narrateScriptModal"]').forEach((btn) => {
    btn.onclick = () => modal.classList.add('hidden');
  });

  document.getElementById('narModalVersionSel')?.addEventListener('change', (e) => {
    selectedVersion = e.target.value;
    loadPreview(selectedVersion).catch(() => {});
  });

  document.getElementById('narModalOpenStudioBtn')?.addEventListener('click', () => {
    const ns = state.narrationState;
    ns.sourceTab = 'script';
    ns.selectedDocPath = docPath;
    ns.selectedDocVersion = selectedVersion;
    ns.text = document.getElementById('narModalTextArea')?.value || previewText;
    ns.category = document.getElementById('narModalCatSel')?.value || 'narracao-roteiro';
    ns.selectedPresetId = document.getElementById('narModalVoiceSel')?.value || 'mrj-pocket';
    const foundPreset = presets.find((p) => p.id === ns.selectedPresetId);
    if (foundPreset) applyPresetValuesToState(foundPreset);
    modal.classList.add('hidden');
    setView('narration');
  });

  document.getElementById('narModalGenerateBtn')?.addEventListener('click', async (e) => {
    const genBtn = e.currentTarget;
    const textVal = document.getElementById('narModalTextArea')?.value || '';
    if (!textVal.trim()) {
      showToast('Texto vazio para narração.');
      return;
    }
    genBtn.disabled = true;
    genBtn.textContent = '⏳ Gerando áudio...';
    try {
      const voiceId = document.getElementById('narModalVoiceSel')?.value || 'mrj-pocket';
      const category = document.getElementById('narModalCatSel')?.value || 'narracao-roteiro';
      const loudnorm = Boolean(document.getElementById('narModalLoudnormCheck')?.checked);
      const res = await fetch('/api/tts/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel: channelKey,
          text: textVal,
          docPath,
          docVersion: selectedVersion,
          docTitle,
          voiceId,
          mode: 'single',
          category,
          origin: 'roteiro',
          cleanMarkdown: false,
          loudnorm,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || 'Erro ao sintetizar narração');
      if (json.state && state.data?.channels?.[channelKey]) {
        state.data.channels[channelKey] = json.state;
      }
      state.narrationState.loadedChannel = '';
      modal.classList.add('hidden');
      showToast(`Narração gerada (${formatAudioDuration(json.item.durationSec)})!`);
      if (state.view === 'scripts') {
        updateHeaderChrome();
        renderCurrentView();
      }
    } catch (err) {
      showToast(err.message);
      genBtn.disabled = false;
      genBtn.textContent = '🔊 Gerar Áudio desta Versão';
    }
  });
}

registerViewRenderer('narration', renderNarrationView);
