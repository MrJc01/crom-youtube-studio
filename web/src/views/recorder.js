import { MD } from '../core/constants.js';
import { copyText, formatBytesCompact, formatRecTimer, showToast } from '../core/utils.js';
import {
  getActiveChannelData,
  normalizePayload,
  recRuntime,
  registerLifecycleHooks,
  registerViewRenderer,
  state,
} from '../core/state.js';
import { applyRecorderScriptPreselect, setView, syncBrowserUrl } from '../core/router.js';

function stopStreamTracks(stream) {
  if (!stream) return;
  try {
    stream.getTracks().forEach((t) => t.stop());
  } catch {
    // ignora
  }
}

export function stopRecorderMediaStreams() {
  if (recRuntime.vuRafId) {
    cancelAnimationFrame(recRuntime.vuRafId);
    recRuntime.vuRafId = null;
  }
  if (recRuntime.canvasRafId) {
    cancelAnimationFrame(recRuntime.canvasRafId);
    recRuntime.canvasRafId = null;
  }
  if (state.recorder.timerId) {
    clearInterval(state.recorder.timerId);
    state.recorder.timerId = null;
  }
  if (state.recorder.prompterRafId) {
    cancelAnimationFrame(state.recorder.prompterRafId);
    state.recorder.prompterRafId = null;
  }
  state.recorder.prompterPlaying = false;
  stopStreamTracks(recRuntime.screenStream);
  stopStreamTracks(recRuntime.camStream);
  stopStreamTracks(recRuntime.micStream);
  recRuntime.screenStream = null;
  recRuntime.camStream = null;
  recRuntime.micStream = null;
  if (recRuntime.audioCtx) {
    try {
      recRuntime.audioCtx.close();
    } catch {
      // ignora
    }
    recRuntime.audioCtx = null;
    recRuntime.analyser = null;
  }
  state.recorder.micLevel = 0;
}

async function refreshRecorderDevices() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    state.recorder.devices = {
      cameras: devices.filter((d) => d.kind === 'videoinput'),
      mics: devices.filter((d) => d.kind === 'audioinput'),
    };
    if (!state.recorder.selectedCamId && state.recorder.devices.cameras[0]) {
      state.recorder.selectedCamId = state.recorder.devices.cameras[0].deviceId;
    }
    if (!state.recorder.selectedMicId && state.recorder.devices.mics[0]) {
      state.recorder.selectedMicId = state.recorder.devices.mics[0].deviceId;
    }
  } catch {
    // Navegador bloqueou enumeração sem permissão prévia
  }
}

export async function loadRecordingsLibrary(channelKey, { rerender = true } = {}) {
  if (!state.serverMode) return;
  state.recorder.loading = true;
  try {
    const res = await fetch(`/api/recordings?channel=${encodeURIComponent(channelKey)}`, { cache: 'no-store' });
    const json = await res.json();
    if (res.ok) {
      state.recorder.sessions = Array.isArray(json.sessions) ? json.sessions : [];
      state.recorder.ffmpegAvailable = Boolean(json.ffmpegAvailable);
      state.recorder.recordingsDir = json.recordingsDir || '';
      state.recorder.sessionsChannel = channelKey;
    }
  } catch {
    // mantém estado atual
  } finally {
    state.recorder.loading = false;
    if (rerender && state.view === 'recorder' && state.activeChannel === channelKey) {
      renderRecorderLibrarySection();
    }
  }
}

function pickRecorderMime(kind) {
  if (!globalThis.MediaRecorder || typeof MediaRecorder.isTypeSupported !== 'function') return '';
  const candidates =
    kind === 'audio'
      ? ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus']
      : ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  return candidates.find((m) => MediaRecorder.isTypeSupported(m)) || '';
}

function startMicVuLoop(micStream) {
  if (!micStream || !micStream.getAudioTracks().length) return;
  const AudioCtx = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AudioCtx) return;
  try {
    if (recRuntime.audioCtx) recRuntime.audioCtx.close().catch(() => {});
    const ctx = new AudioCtx();
    const src = ctx.createMediaStreamSource(micStream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    src.connect(analyser);
    recRuntime.audioCtx = ctx;
    recRuntime.analyser = analyser;

    const dataArr = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      if (!recRuntime.analyser || state.view !== 'recorder') return;
      analyser.getByteTimeDomainData(dataArr);
      let sum = 0;
      for (let i = 0; i < dataArr.length; i++) {
        const v = (dataArr[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / dataArr.length);
      const pct = Math.min(100, Math.round(rms * 260));
      state.recorder.micLevel = pct;
      const bar = document.getElementById('recVuFill');
      const lbl = document.getElementById('recVuPct');
      if (bar) bar.style.width = `${pct}%`;
      if (lbl) lbl.textContent = `${pct}%`;
      recRuntime.vuRafId = requestAnimationFrame(tick);
    };
    recRuntime.vuRafId = requestAnimationFrame(tick);
  } catch {
    // Ignora erro de AudioContext sem interação
  }
}

function startPipCanvasLoop() {
  const canvas = document.getElementById('recPreviewCanvas');
  if (!canvas) return;
  canvas.width = 1280;
  canvas.height = 720;
  const ctx = canvas.getContext('2d');
  recRuntime.canvasEl = canvas;

  if (!recRuntime.screenVideoEl) {
    recRuntime.screenVideoEl = document.createElement('video');
    recRuntime.screenVideoEl.muted = true;
    recRuntime.screenVideoEl.playsInline = true;
  }
  if (!recRuntime.camVideoEl) {
    recRuntime.camVideoEl = document.createElement('video');
    recRuntime.camVideoEl.muted = true;
    recRuntime.camVideoEl.playsInline = true;
  }

  if (recRuntime.screenStream) {
    recRuntime.screenVideoEl.srcObject = recRuntime.screenStream;
    recRuntime.screenVideoEl.play().catch(() => {});
  }
  if (recRuntime.camStream) {
    recRuntime.camVideoEl.srcObject = recRuntime.camStream;
    recRuntime.camVideoEl.play().catch(() => {});
  }

  const draw = () => {
    if (state.view !== 'recorder' || !recRuntime.canvasEl) return;
    ctx.fillStyle = '#07080f';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const sv = recRuntime.screenVideoEl;
    if (sv && sv.readyState >= 2 && sv.videoWidth > 0) {
      const scale = Math.min(canvas.width / sv.videoWidth, canvas.height / sv.videoHeight);
      const dw = sv.videoWidth * scale;
      const dh = sv.videoHeight * scale;
      ctx.drawImage(sv, (canvas.width - dw) / 2, (canvas.height - dh) / 2, dw, dh);
    } else {
      ctx.fillStyle = '#646b82';
      ctx.font = '600 22px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Aguardando captura de tela...', canvas.width / 2, canvas.height / 2);
    }

    const cv = recRuntime.camVideoEl;
    if (cv && cv.readyState >= 2 && cv.videoWidth > 0) {
      const sizeRatio = state.recorder.pipSize === 'lg' ? 0.34 : state.recorder.pipSize === 'sm' ? 0.2 : 0.27;
      const pw = Math.round(canvas.width * sizeRatio);
      const ph = Math.round((pw * cv.videoHeight) / Math.max(1, cv.videoWidth));
      const margin = 24;
      const pos = state.recorder.pipPos || 'bottom-right';
      const px = pos.includes('left') ? margin : canvas.width - pw - margin;
      const py = pos.includes('top') ? margin : canvas.height - ph - margin;

      ctx.save();
      ctx.beginPath();
      const rad = 16;
      ctx.roundRect ? ctx.roundRect(px, py, pw, ph, rad) : ctx.rect(px, py, pw, ph);
      ctx.clip();
      ctx.drawImage(cv, px, py, pw, ph);
      ctx.restore();

      ctx.strokeStyle = 'rgba(225, 45, 120, 0.85)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(px, py, pw, ph, rad) : ctx.rect(px, py, pw, ph);
      ctx.stroke();
    }

    recRuntime.canvasRafId = requestAnimationFrame(draw);
  };
  if (recRuntime.canvasRafId) cancelAnimationFrame(recRuntime.canvasRafId);
  recRuntime.canvasRafId = requestAnimationFrame(draw);
}

async function acquireRecorderStreams({ includeScreen, includeCam, includeMic }) {
  if (!navigator.mediaDevices) {
    throw new Error('MediaDevices API indisponível neste contexto (use localhost ou HTTPS).');
  }

  if (includeMic && !recRuntime.micStream) {
    const audioConstraints = state.recorder.selectedMicId
      ? { deviceId: { exact: state.recorder.selectedMicId } }
      : true;
    recRuntime.micStream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints, video: false });
    startMicVuLoop(recRuntime.micStream);
  }

  if (includeCam && !recRuntime.camStream) {
    const videoConstraints = state.recorder.selectedCamId
      ? { deviceId: { exact: state.recorder.selectedCamId }, width: { ideal: 1280 }, height: { ideal: 720 } }
      : { width: { ideal: 1280 }, height: { ideal: 720 } };
    recRuntime.camStream = await navigator.mediaDevices.getUserMedia({ video: videoConstraints, audio: false });
  }

  if (includeScreen && !recRuntime.screenStream) {
    recRuntime.screenStream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: 30 },
      audio: true,
    });
  }

  await refreshRecorderDevices();
}

function renderRecorderPreviewElement() {
  const mode = state.recorder.mode;
  const vidEl = document.getElementById('recPreviewVideo');
  const canvasEl = document.getElementById('recPreviewCanvas');
  const idleEl = document.getElementById('recPreviewIdle');
  if (!vidEl || !canvasEl || !idleEl) return;

  if (mode === 'all-and-separate' && (recRuntime.screenStream || recRuntime.camStream)) {
    canvasEl.classList.remove('hidden');
    vidEl.classList.add('hidden');
    idleEl.classList.add('hidden');
    startPipCanvasLoop();
    return;
  }

  canvasEl.classList.add('hidden');
  if (mode === 'webcam-voice' && recRuntime.camStream) {
    vidEl.srcObject = recRuntime.camStream;
    vidEl.classList.remove('hidden');
    idleEl.classList.add('hidden');
    vidEl.play().catch(() => {});
    return;
  }

  if ((mode === 'screen-voice' || mode === 'screen-only') && recRuntime.screenStream) {
    vidEl.srcObject = recRuntime.screenStream;
    vidEl.classList.remove('hidden');
    idleEl.classList.add('hidden');
    vidEl.play().catch(() => {});
    return;
  }

  vidEl.classList.add('hidden');
  idleEl.classList.remove('hidden');
}

function renderRecorderLibrarySection() {
  const box = document.getElementById('recLibraryContainer');
  if (!box) return;
  const chData = getActiveChannelData();
  const sessions = state.recorder.sessions || [];
  const trackLabels = {
    combinado: '🎬 Combinado',
    tela: '🖥 Tela',
    webcam: '📷 Webcam',
    voz: '🎙 Voz',
    outro: '📎 Faixa',
  };

  if (!state.serverMode) {
    box.innerHTML = '<div class="glass-card"><p style="margin:0; color:var(--text-3);">A biblioteca e gravação em disco exigem o servidor local ativo.</p></div>';
    return;
  }

  if (!sessions.length) {
    box.innerHTML = `
      <div class="glass-card">
        <p style="margin:0; color:var(--text-3);">Nenhuma gravação salva ainda em <code>${MD.escapeHtml(chData.key)}/gravacoes/</code>. Clique em <strong>● Gravar</strong> acima para capturar seu primeiro take!</p>
      </div>
    `;
    return;
  }

  box.innerHTML = `
    <div class="rec-library-list">
      ${sessions
        .map(
          (sess) => `
            <article class="glass-card">
              <div class="gc-top" style="flex-wrap:wrap;">
                <div>
                  <strong style="font-size:15px;">${MD.escapeHtml(sess.title)}</strong>
                  <div style="font-family:var(--font-mono); font-size:11px; color:var(--text-3); margin-top:2px;">
                    ${MD.escapeHtml(sess.relDir)} • ${(sess.takes || []).length} take(s)
                  </div>
                </div>
                <div style="display:flex; gap:7px; flex-wrap:wrap;">
                  <button type="button" class="btn-sm" data-rec-copy-dir="${MD.escapeHtml(sess.dirPath || sess.relDir)}">📋 Copiar Pasta</button>
                  <button type="button" class="btn-sm btn-danger" data-rec-del-session="${MD.escapeHtml(sess.id)}">Excluir Sessão</button>
                </div>
              </div>

              ${(sess.takes || [])
                .map((tk) => {
                  const activePl = state.recorder.activePlayer;
                  const isPlayingThis = activePl && activePl.sessionId === sess.id && activePl.takeId === tk.id;
                  const mp4Targets = (tk.tracks || []).filter(
                    (t) => t.ext === 'webm' && ['combinado', 'tela', 'webcam'].includes(t.kind)
                  );
                  return `
                    <div class="rec-take-card">
                      <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; flex-wrap:wrap;">
                        <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                          <span class="status-pill st-gravando">${MD.escapeHtml(tk.id)}</span>
                          <span style="font-family:var(--font-mono); font-size:11px; color:var(--text-2);">${MD.escapeHtml(tk.mode || '')}</span>
                          ${tk.scriptPath ? `<button type="button" class="kc-move-btn" data-open-doc="${MD.escapeHtml(tk.scriptPath)}">📄 ${MD.escapeHtml(tk.scriptPath)}</button>` : ''}
                        </div>
                        <div style="display:flex; gap:6px; flex-wrap:wrap;">
                          ${mp4Targets
                            .map((mt) => {
                              const convKey = `${sess.id}::${tk.id}::${mt.fileName}`;
                              const hasMp4 = tk.tracks.some((x) => x.fileName === `${mt.fileName.replace(/\.webm$/i, '')}.mp4`);
                              if (hasMp4) return '';
                              return `<button type="button" class="btn-sm" data-rec-mp4="${MD.escapeHtml(convKey)}"${state.recorder.convertingKey === convKey ? ' disabled' : ''}>${state.recorder.convertingKey === convKey ? 'Convertendo...' : `🎬 Converter MP4 (${MD.escapeHtml(mt.kind)})`}</button>`;
                            })
                            .join('')}
                          <button type="button" class="btn-sm btn-danger" data-rec-del-take="${MD.escapeHtml(sess.id)}::${MD.escapeHtml(tk.id)}">Excluir Take</button>
                        </div>
                      </div>

                      <div class="rec-track-badges">
                        ${(tk.tracks || [])
                          .map((tr) => {
                            const label = `${trackLabels[tr.kind] || tr.kind} (${tr.ext.toUpperCase()})`;
                            const mediaUrl = `/api/recordings/media?channel=${encodeURIComponent(chData.key)}&path=${encodeURIComponent(tr.relPath)}`;
                            return `
                              <button type="button" class="rec-track-pill" data-rec-play="${MD.escapeHtml(sess.id)}::${MD.escapeHtml(tk.id)}::${MD.escapeHtml(tr.relPath)}::${MD.escapeHtml(tr.mediaKind || 'video')}" title="Reproduzir ${MD.escapeHtml(tr.fileName)} (${formatBytesCompact(tr.size)})">
                                <span>▶ ${MD.escapeHtml(label)}</span>
                                <small style="color:var(--text-3);">${formatBytesCompact(tr.size)}</small>
                              </button>
                              <a class="kc-move-btn" href="${mediaUrl}" download="${MD.escapeHtml(tr.fileName)}" title="Baixar ${MD.escapeHtml(tr.fileName)}">⬇</a>
                            `;
                          })
                          .join('') || '<span style="font-size:11.5px; color:var(--text-3);">Sem faixas gravadas neste take.</span>'}
                      </div>

                      ${isPlayingThis
                        ? `
                          <div class="rec-player-box">
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                              <span style="font-family:var(--font-mono); font-size:11px; color:var(--text-2);">${MD.escapeHtml(activePl.relPath)}</span>
                              <button type="button" class="btn-sm" id="recClosePlayerBtn">✕ Fechar Player</button>
                            </div>
                            ${activePl.mediaKind === 'audio'
                              ? `<audio controls autoplay src="/api/recordings/media?channel=${encodeURIComponent(chData.key)}&path=${encodeURIComponent(activePl.relPath)}"></audio>`
                              : `<video controls autoplay playsinline src="/api/recordings/media?channel=${encodeURIComponent(chData.key)}&path=${encodeURIComponent(activePl.relPath)}"></video>`}
                          </div>
                        `
                        : ''}
                    </div>
                  `;
                })
                .join('')}
            </article>
          `
        )
        .join('')}
    </div>
  `;

  box.querySelectorAll('[data-rec-copy-dir]').forEach((btn) => {
    btn.onclick = () => copyText(btn.dataset.recCopyDir, 'Caminho da pasta copiado!');
  });
  box.querySelectorAll('[data-open-doc]').forEach((btn) => {
    btn.onclick = () => setView('scripts', btn.dataset.openDoc);
  });
  box.querySelectorAll('[data-rec-play]').forEach((btn) => {
    btn.onclick = () => {
      const [sessionId, takeId, relPath, mediaKind] = btn.dataset.recPlay.split('::');
      state.recorder.activePlayer = { sessionId, takeId, relPath, mediaKind };
      renderRecorderLibrarySection();
    };
  });
  document.getElementById('recClosePlayerBtn')?.addEventListener('click', () => {
    state.recorder.activePlayer = null;
    renderRecorderLibrarySection();
  });
  box.querySelectorAll('[data-rec-mp4]').forEach((btn) => {
    btn.onclick = async () => {
      const [sessionId, takeId, fileName] = btn.dataset.recMp4.split('::');
      state.recorder.convertingKey = btn.dataset.recMp4;
      renderRecorderLibrarySection();
      try {
        const res = await fetch('/api/recordings/convert-mp4', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ channel: chData.key, sessionId, takeId, fileName }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Erro ao converter para MP4');
        if (json.state) state.data = normalizePayload(json.state);
        showToast(`MP4 gerado: ${json.track?.fileName || 'ok'}`);
        await loadRecordingsLibrary(chData.key);
      } catch (err) {
        showToast(err.message);
      } finally {
        state.recorder.convertingKey = '';
        renderRecorderLibrarySection();
      }
    };
  });
  box.querySelectorAll('[data-rec-del-take]').forEach((btn) => {
    btn.onclick = async () => {
      const [sessionId, takeId] = btn.dataset.recDelTake.split('::');
      if (!confirm(`Excluir o ${takeId} da sessão ${sessionId}?`)) return;
      try {
        const res = await fetch(
          `/api/recordings?channel=${encodeURIComponent(chData.key)}&sessionId=${encodeURIComponent(sessionId)}&takeId=${encodeURIComponent(takeId)}`,
          { method: 'DELETE' }
        );
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Erro ao excluir take');
        if (json.state) state.data = normalizePayload(json.state);
        await loadRecordingsLibrary(chData.key);
        showToast('Take excluído.');
      } catch (err) {
        showToast(err.message);
      }
    };
  });
  box.querySelectorAll('[data-rec-del-session]').forEach((btn) => {
    btn.onclick = async () => {
      const sessionId = btn.dataset.recDelSession;
      if (!confirm(`Excluir toda a sessão "${sessionId}" e suas faixas?`)) return;
      try {
        const res = await fetch(
          `/api/recordings?channel=${encodeURIComponent(chData.key)}&sessionId=${encodeURIComponent(sessionId)}`,
          { method: 'DELETE' }
        );
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Erro ao excluir sessão');
        if (json.state) state.data = normalizePayload(json.state);
        await loadRecordingsLibrary(chData.key);
        showToast('Sessão removida.');
      } catch (err) {
        showToast(err.message);
      }
    };
  });
}

export function renderRecorderView(container) {
  if (!container) return;
  const chData = getActiveChannelData();
  const docs = chData.docs || [];
  const rec = state.recorder;

  // v5: Suporta ?roteiro=<path> direto na URL ou preseleção pendente sem sobrescrever escolha atual
  const queryRoteiro = new URLSearchParams(globalThis.location.search).get('roteiro');
  if (queryRoteiro && !rec.linkedDocPath) {
    applyRecorderScriptPreselect(chData, queryRoteiro);
  }

  if (!rec.devices.cameras.length && !rec.devices.mics.length) {
    refreshRecorderDevices();
  }
  if (state.serverMode && rec.sessionsChannel !== chData.key && !rec.loading) {
    loadRecordingsLibrary(chData.key, { rerender: true });
  }

  const linkedDoc = docs.find((d) => d.path === rec.linkedDocPath) || null;
  const modes = [
    { id: 'all-and-separate', label: '🎬 Tudo Junto + Separado (PiP + 3 faixas)' },
    { id: 'screen-voice', label: '🖥 Tela + Voz' },
    { id: 'webcam-voice', label: '📷 Webcam + Voz' },
    { id: 'voice-only', label: '🎙 Só Narração (Voz)' },
    { id: 'screen-only', label: '🖥 Só Tela' },
  ];

  container.innerHTML = `
    <div class="rec-grid">
      <section class="rec-card">
        <div class="section-subhead" style="margin:0;">
          <div>
            <h2 class="panel-title" style="font-size:16px;">Estúdio Multi-Track (${MD.escapeHtml(chData.channel?.name || chData.key)})</h2>
            <span style="font-size:12px; color:var(--text-3);">Captura combinada em PiP + faixas separadas (.webm) e extração automática de <code>04-voz.wav</code>.</span>
          </div>
          <span class="settings-path-badge ${rec.ffmpegAvailable ? 'is-ok' : 'is-miss'}" id="recFfmpegBadge">
            ${rec.ffmpegAvailable ? '✓ ffmpeg ativo (.wav / MP4)' : '⚠ ffmpeg não detectado'}
          </span>
        </div>

        <div class="rec-mode-pills" id="recModePills">
          ${modes
            .map(
              (m) => `<button type="button" class="rec-mode-btn${rec.mode === m.id ? ' active' : ''}" data-rec-mode="${m.id}">${MD.escapeHtml(m.label)}</button>`
            )
            .join('')}
        </div>

        <div class="form-row-2">
          <label style="display:flex; flex-direction:column; gap:4px; font-size:12px; color:var(--text-2);">
            <span>Título / Slug da Sessão</span>
            <input type="text" class="search-box-sm" id="recTitleInput" placeholder="Ex.: Episódio GTA 6 Parte 1" value="${MD.escapeHtml(rec.titleDraft || '')}" style="margin:0;">
          </label>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
            <label style="display:flex; flex-direction:column; gap:4px; font-size:12px; color:var(--text-2);">
              <span>Posição PiP</span>
              <select class="select-dark" id="recPipPosSel">
                <option value="bottom-right"${rec.pipPos === 'bottom-right' ? ' selected' : ''}>Inferior Direita</option>
                <option value="bottom-left"${rec.pipPos === 'bottom-left' ? ' selected' : ''}>Inferior Esquerda</option>
                <option value="top-right"${rec.pipPos === 'top-right' ? ' selected' : ''}>Superior Direita</option>
                <option value="top-left"${rec.pipPos === 'top-left' ? ' selected' : ''}>Superior Esquerda</option>
              </select>
            </label>
            <label style="display:flex; flex-direction:column; gap:4px; font-size:12px; color:var(--text-2);">
              <span>Tamanho PiP</span>
              <select class="select-dark" id="recPipSizeSel">
                <option value="sm"${rec.pipSize === 'sm' ? ' selected' : ''}>Pequena</option>
                <option value="md"${rec.pipSize === 'md' ? ' selected' : ''}>Média</option>
                <option value="lg"${rec.pipSize === 'lg' ? ' selected' : ''}>Grande</option>
              </select>
            </label>
          </div>
        </div>

        <div class="form-row-2">
          <label style="display:flex; flex-direction:column; gap:4px; font-size:12px; color:var(--text-2);">
            <span>Câmera</span>
            <select class="select-dark" id="recCamSel">
              <option value="">Câmera padrão do sistema</option>
              ${(rec.devices.cameras || [])
                .map(
                  (d, idx) => `<option value="${MD.escapeHtml(d.deviceId)}"${rec.selectedCamId === d.deviceId ? ' selected' : ''}>${MD.escapeHtml(d.label || `Câmera ${idx + 1}`)}</option>`
                )
                .join('')}
            </select>
          </label>
          <label style="display:flex; flex-direction:column; gap:4px; font-size:12px; color:var(--text-2);">
            <span>Microfone</span>
            <select class="select-dark" id="recMicSel">
              <option value="">Microfone padrão do sistema</option>
              ${(rec.devices.mics || [])
                .map(
                  (d, idx) => `<option value="${MD.escapeHtml(d.deviceId)}"${rec.selectedMicId === d.deviceId ? ' selected' : ''}>${MD.escapeHtml(d.label || `Microfone ${idx + 1}`)}</option>`
                )
                .join('')}
            </select>
          </label>
        </div>

        <div class="rec-preview-stage">
          <canvas id="recPreviewCanvas" class="hidden"></canvas>
          <video id="recPreviewVideo" class="hidden" muted playsinline></video>
          <div id="recPreviewIdle" style="padding:20px; text-align:center; color:var(--text-3); font-size:13px;">
            Clique em <strong>👁 Pré-visualizar</strong> ou <strong>● Gravar</strong> para ativar os dispositivos deste modo.
          </div>
          <div class="rec-live-badge${rec.status === 'recording' ? ' is-recording' : ''}" id="recStatusBadge">
            <span class="rec-live-dot"></span>
            <span id="recStatusText">${rec.status === 'recording' ? 'REC' : rec.status === 'paused' ? 'PAUSADO' : 'PRONTO'}</span>
            <span id="recTimerDisplay">${formatRecTimer(rec.elapsedSec || 0)}</span>
          </div>
        </div>

        <div class="rec-vu-wrap">
          <span style="font-family:var(--font-mono); font-size:11px; color:var(--text-2);">🎙 VU Voz</span>
          <div class="rec-vu-bar"><div class="rec-vu-fill" id="recVuFill" style="width:${rec.micLevel || 0}%;"></div></div>
          <span style="font-family:var(--font-mono); font-size:11px; color:var(--text-3); min-width:34px; text-align:right;" id="recVuPct">${rec.micLevel || 0}%</span>
        </div>

        <div class="rec-controls-bar">
          <button type="button" class="btn-sm" id="recPreviewBtn">👁 Pré-visualizar</button>
          <button type="button" class="rec-btn-record" id="recStartBtn"${rec.status !== 'idle' || rec.uploading ? ' disabled' : ''}>● Gravar</button>
          <button type="button" class="btn-sm" id="recPauseBtn"${rec.status === 'idle' ? ' disabled' : ''}>${rec.status === 'paused' ? '▶ Retomar' : '⏸ Pausar'}</button>
          <button type="button" class="btn-sm btn-accent" id="recStopSaveBtn"${rec.status === 'idle' || rec.uploading ? ' disabled' : ''}>⏹ Finalizar & Salvar</button>
          <button type="button" class="btn-sm" id="recRefreshDevicesBtn">↻ Dispositivos</button>
        </div>

        ${rec.uploadProgress ? `<div class="settings-toggle-row" style="font-size:12px; color:var(--info);">${MD.escapeHtml(rec.uploadProgress)}</div>` : ''}
        ${rec.lastSavedInfo
          ? `<div class="settings-toggle-row" style="border-color:rgba(54,211,153,0.4); background:rgba(54,211,153,0.08); font-size:12px; color:#86efac;">
              <div>
                <strong>✓ Take salvo em <code>${MD.escapeHtml(rec.lastSavedInfo.relDir)}</code></strong>
                <div style="font-size:11px; color:var(--text-2); margin-top:2px;">${MD.escapeHtml(rec.lastSavedInfo.note)}</div>
              </div>
              <button type="button" class="btn-sm" id="recCopyLastDirBtn">Copiar Pasta</button>
            </div>`
          : ''}
      </section>

      <section class="rec-card">
        <div class="section-subhead" style="margin:0;">
          <h2 class="panel-title" style="font-size:15px;">Roteiro Vinculado & Mini Teleprompter</h2>
          <div class="zoom-group">
            <button type="button" id="recPrompterFontMinus">A-</button>
            <span id="recPrompterFontVal">${rec.prompterFontSize}px</span>
            <button type="button" id="recPrompterFontPlus">A+</button>
          </div>
        </div>

        <select class="select-dark" id="recScriptSel" style="width:100%;">
          <option value="">Nenhum roteiro vinculado (gravação livre)</option>
          ${docs.map((d) => `<option value="${MD.escapeHtml(d.path)}"${rec.linkedDocPath === d.path ? ' selected' : ''}>${MD.escapeHtml(d.meta.titulo)} (${MD.escapeHtml(d.path)})</option>`).join('')}
        </select>

        <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
          <button type="button" class="btn-sm btn-accent" id="recPrompterPlayBtn">${rec.prompterPlaying ? '⏸ Pausar Teleprompter' : '▶ Play Teleprompter'}</button>
          <button type="button" class="btn-sm" id="recPrompterTopBtn">↺ Topo</button>
          <label style="display:inline-flex; align-items:center; gap:6px; font-size:11.5px; color:var(--text-2); margin-left:auto;">
            <span>Velocidade</span>
            <input type="range" id="recPrompterSpeedRange" min="0.5" max="5.5" step="0.5" value="${rec.prompterSpeed}" style="width:90px;">
          </label>
        </div>

        <div class="rec-teleprompter-box" id="recPrompterBox" style="font-size:${rec.prompterFontSize}px;">
          ${linkedDoc
            ? MD.escapeHtml(linkedDoc.body || '')
            : '<span style="color:var(--text-3);">Selecione um roteiro acima para narrar acompanhando o mini teleprompter em tempo real.</span>'}
        </div>
      </section>
    </div>

    <div class="section-subhead">
      <h2 class="panel-title" style="font-size:16px;">Biblioteca de Gravações (${(rec.sessions || []).length} sessões)</h2>
      <button type="button" class="btn-sm" id="recReloadLibBtn">↻ Atualizar Biblioteca</button>
    </div>
    <div id="recLibraryContainer"></div>
  `;

  renderRecorderPreviewElement();
  renderRecorderLibrarySection();

  container.querySelectorAll('[data-rec-mode]').forEach((btn) => {
    btn.onclick = () => {
      if (state.recorder.status !== 'idle') {
        showToast('Pare a gravação antes de mudar o modo.');
        return;
      }
      state.recorder.mode = btn.dataset.recMode;
      renderRecorderView(container);
    };
  });

  document.getElementById('recTitleInput')?.addEventListener('input', (e) => {
    state.recorder.titleDraft = e.target.value;
  });
  document.getElementById('recPipPosSel')?.addEventListener('change', (e) => {
    state.recorder.pipPos = e.target.value;
  });
  document.getElementById('recPipSizeSel')?.addEventListener('change', (e) => {
    state.recorder.pipSize = e.target.value;
  });
  document.getElementById('recCamSel')?.addEventListener('change', (e) => {
    state.recorder.selectedCamId = e.target.value;
  });
  document.getElementById('recMicSel')?.addEventListener('change', (e) => {
    state.recorder.selectedMicId = e.target.value;
  });

  document.getElementById('recRefreshDevicesBtn')?.addEventListener('click', async () => {
    await refreshRecorderDevices();
    renderRecorderView(container);
    showToast('Lista de dispositivos atualizada.');
  });

  document.getElementById('recPreviewBtn')?.addEventListener('click', async () => {
    try {
      stopRecorderMediaStreams();
      const m = state.recorder.mode;
      await acquireRecorderStreams({
        includeScreen: m === 'all-and-separate' || m === 'screen-voice' || m === 'screen-only',
        includeCam: m === 'all-and-separate' || m === 'webcam-voice',
        includeMic: m !== 'screen-only',
      });
      renderRecorderView(container);
      showToast('Pré-visualização pronta!');
    } catch (err) {
      showToast(`Permissão ou dispositivo indisponível: ${err.message}`);
    }
  });

  document.getElementById('recStartBtn')?.addEventListener('click', async () => {
    if (!state.serverMode) {
      showToast('Salvar gravações no disco exige o servidor local ativo.');
      return;
    }
    if (!globalThis.MediaRecorder) {
      showToast('MediaRecorder API não suportada neste navegador.');
      return;
    }
    const m = state.recorder.mode;
    try {
      await acquireRecorderStreams({
        includeScreen: m === 'all-and-separate' || m === 'screen-voice' || m === 'screen-only',
        includeCam: m === 'all-and-separate' || m === 'webcam-voice',
        includeMic: m !== 'screen-only',
      });
    } catch (err) {
      showToast(`Não foi possível capturar mídia: ${err.message}`);
      return;
    }

    renderRecorderPreviewElement();

    const tracksToRecord = [];
    if (m === 'all-and-separate') {
      const canvas = document.getElementById('recPreviewCanvas');
      if (canvas && canvas.captureStream) {
        const canvasStream = canvas.captureStream(30);
        const combinedTracks = [...canvasStream.getVideoTracks()];
        if (recRuntime.micStream) combinedTracks.push(...recRuntime.micStream.getAudioTracks().map((t) => t.clone()));
        tracksToRecord.push({ kind: 'combinado', stream: new MediaStream(combinedTracks), mediaKind: 'video' });
      }
      if (recRuntime.screenStream) {
        tracksToRecord.push({ kind: 'tela', stream: recRuntime.screenStream, mediaKind: 'video' });
      }
      if (recRuntime.camStream) {
        tracksToRecord.push({ kind: 'webcam', stream: recRuntime.camStream, mediaKind: 'video' });
      }
      if (recRuntime.micStream) {
        tracksToRecord.push({ kind: 'voz', stream: recRuntime.micStream, mediaKind: 'audio' });
      }
    } else if (m === 'screen-voice') {
      if (recRuntime.screenStream) {
        const mixed = [...recRuntime.screenStream.getVideoTracks()];
        if (recRuntime.micStream) mixed.push(...recRuntime.micStream.getAudioTracks().map((t) => t.clone()));
        tracksToRecord.push({ kind: 'tela', stream: new MediaStream(mixed), mediaKind: 'video' });
      }
      if (recRuntime.micStream) {
        tracksToRecord.push({ kind: 'voz', stream: recRuntime.micStream, mediaKind: 'audio' });
      }
    } else if (m === 'webcam-voice') {
      if (recRuntime.camStream) {
        const mixed = [...recRuntime.camStream.getVideoTracks()];
        if (recRuntime.micStream) mixed.push(...recRuntime.micStream.getAudioTracks().map((t) => t.clone()));
        tracksToRecord.push({ kind: 'webcam', stream: new MediaStream(mixed), mediaKind: 'video' });
      }
      if (recRuntime.micStream) {
        tracksToRecord.push({ kind: 'voz', stream: recRuntime.micStream, mediaKind: 'audio' });
      }
    } else if (m === 'voice-only') {
      if (recRuntime.micStream) {
        tracksToRecord.push({ kind: 'voz', stream: recRuntime.micStream, mediaKind: 'audio' });
      }
    } else if (m === 'screen-only') {
      if (recRuntime.screenStream) {
        tracksToRecord.push({ kind: 'tela', stream: recRuntime.screenStream, mediaKind: 'video' });
      }
    }

    if (!tracksToRecord.length) {
      showToast('Nenhuma faixa disponível para gravar neste modo.');
      return;
    }

    recRuntime.recorders = [];
    recRuntime.recordedBlobs = {};
    for (const item of tracksToRecord) {
      const mimeType = pickRecorderMime(item.mediaKind);
      const mr = mimeType ? new MediaRecorder(item.stream, { mimeType }) : new MediaRecorder(item.stream);
      const chunks = [];
      mr.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) chunks.push(ev.data);
      };
      const stopPromise = new Promise((resolve) => {
        mr.onstop = () => {
          const blob = new Blob(chunks, { type: mimeType || (item.mediaKind === 'audio' ? 'audio/webm' : 'video/webm') });
          recRuntime.recordedBlobs[item.kind] = blob;
          resolve({ kind: item.kind, blob });
        };
      });
      mr.start(1000);
      recRuntime.recorders.push({ kind: item.kind, mr, stopPromise });
    }

    state.recorder.status = 'recording';
    state.recorder.startedAt = Date.now();
    state.recorder.elapsedSec = 0;
    state.recorder.lastSavedInfo = null;
    if (state.recorder.timerId) clearInterval(state.recorder.timerId);
    state.recorder.timerId = setInterval(() => {
      if (state.recorder.status === 'recording') {
        state.recorder.elapsedSec += 1;
        const timerEl = document.getElementById('recTimerDisplay');
        if (timerEl) timerEl.textContent = formatRecTimer(state.recorder.elapsedSec);
      }
    }, 1000);

    renderRecorderView(container);
    showToast(`Gravação iniciada (${tracksToRecord.length} faixa(s))!`);
  });

  document.getElementById('recPauseBtn')?.addEventListener('click', () => {
    if (state.recorder.status === 'recording') {
      recRuntime.recorders.forEach((r) => {
        if (r.mr.state === 'recording') r.mr.pause();
      });
      state.recorder.status = 'paused';
      renderRecorderView(container);
    } else if (state.recorder.status === 'paused') {
      recRuntime.recorders.forEach((r) => {
        if (r.mr.state === 'paused') r.mr.resume();
      });
      state.recorder.status = 'recording';
      renderRecorderView(container);
    }
  });

  document.getElementById('recStopSaveBtn')?.addEventListener('click', async () => {
    if (state.recorder.status === 'idle') return;
    state.recorder.uploading = true;
    state.recorder.uploadProgress = 'Finalizando gravadores...';
    if (state.recorder.timerId) {
      clearInterval(state.recorder.timerId);
      state.recorder.timerId = null;
    }

    const stopPromises = recRuntime.recorders.map((r) => {
      if (r.mr.state !== 'inactive') r.mr.stop();
      return r.stopPromise;
    });
    const finishedTracks = await Promise.all(stopPromises);
    recRuntime.recorders = [];
    state.recorder.status = 'idle';

    try {
      const title = (document.getElementById('recTitleInput')?.value || state.recorder.titleDraft || '').trim() || 'Gravação do Estúdio';
      const sessRes = await fetch('/api/recordings/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel: chData.key,
          title,
          mode: state.recorder.mode,
          scriptPath: state.recorder.linkedDocPath || '',
        }),
      });
      const sessJson = await sessRes.json();
      if (!sessRes.ok) throw new Error(sessJson.error || 'Erro ao criar take de gravação');

      let wavInfo = '';
      for (let i = 0; i < finishedTracks.length; i++) {
        const item = finishedTracks[i];
        if (!item.blob || item.blob.size === 0) continue;
        state.recorder.uploadProgress = `Enviando faixa ${i + 1}/${finishedTracks.length} (${item.kind})...`;
        renderRecorderView(container);

        const upRes = await fetch(
          `/api/recordings/track?channel=${encodeURIComponent(chData.key)}&sessionId=${encodeURIComponent(sessJson.sessionId)}&takeId=${encodeURIComponent(sessJson.takeId)}&kind=${encodeURIComponent(item.kind)}&ext=webm`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/octet-stream' },
            body: item.blob,
          }
        );
        const upJson = await upRes.json();
        if (!upRes.ok) throw new Error(upJson.error || `Erro ao enviar faixa ${item.kind}`);
        if (upJson.wavExtracted) wavInfo = ' + 04-voz.wav extraído automaticamente!';
        if (upJson.state) state.data = normalizePayload(upJson.state);
      }

      state.recorder.lastSavedInfo = {
        dirPath: sessJson.take?.dirPath || sessJson.session?.dirPath || '',
        relDir: sessJson.take?.relDir || `${sessJson.session?.relDir}/${sessJson.takeId}`,
        note: `${finishedTracks.length} faixa(s) salvas${wavInfo}`,
      };
      showToast(`Gravação salva em ${state.recorder.lastSavedInfo.relDir}!`);
    } catch (err) {
      showToast(err.message);
    } finally {
      state.recorder.uploading = false;
      state.recorder.uploadProgress = '';
      stopRecorderMediaStreams();
      await loadRecordingsLibrary(chData.key, { rerender: false });
      renderRecorderView(container);
    }
  });

  document.getElementById('recCopyLastDirBtn')?.addEventListener('click', () => {
    if (state.recorder.lastSavedInfo) {
      copyText(state.recorder.lastSavedInfo.dirPath || state.recorder.lastSavedInfo.relDir, 'Pasta copiada!');
    }
  });

  document.getElementById('recReloadLibBtn')?.addEventListener('click', () => loadRecordingsLibrary(chData.key));

  document.getElementById('recScriptSel')?.addEventListener('change', (e) => {
    const nextPath = e.target.value;
    if (!nextPath) {
      state.recorder.linkedDocPath = '';
      if (state.recorder.titleDraft === state.recorder.autoSuggestedTitle) {
        state.recorder.titleDraft = '';
      }
      state.recorder.autoSuggestedTitle = '';
    } else {
      applyRecorderScriptPreselect(chData, nextPath);
    }
    syncBrowserUrl({ replace: true });
    renderRecorderView(container);
  });

  document.getElementById('recPrompterFontMinus')?.addEventListener('click', () => {
    state.recorder.prompterFontSize = Math.max(14, state.recorder.prompterFontSize - 2);
    const box = document.getElementById('recPrompterBox');
    const val = document.getElementById('recPrompterFontVal');
    if (box) box.style.fontSize = `${state.recorder.prompterFontSize}px`;
    if (val) val.textContent = `${state.recorder.prompterFontSize}px`;
  });
  document.getElementById('recPrompterFontPlus')?.addEventListener('click', () => {
    state.recorder.prompterFontSize = Math.min(38, state.recorder.prompterFontSize + 2);
    const box = document.getElementById('recPrompterBox');
    const val = document.getElementById('recPrompterFontVal');
    if (box) box.style.fontSize = `${state.recorder.prompterFontSize}px`;
    if (val) val.textContent = `${state.recorder.prompterFontSize}px`;
  });
  document.getElementById('recPrompterSpeedRange')?.addEventListener('input', (e) => {
    state.recorder.prompterSpeed = Number(e.target.value);
  });
  document.getElementById('recPrompterTopBtn')?.addEventListener('click', () => {
    const box = document.getElementById('recPrompterBox');
    if (box) box.scrollTop = 0;
  });
  document.getElementById('recPrompterPlayBtn')?.addEventListener('click', () => {
    state.recorder.prompterPlaying = !state.recorder.prompterPlaying;
    const btn = document.getElementById('recPrompterPlayBtn');
    if (btn) btn.textContent = state.recorder.prompterPlaying ? '⏸ Pausar Teleprompter' : '▶ Play Teleprompter';
    if (state.recorder.prompterPlaying) {
      state.recorder.prompterLastTs = performance.now();
      const step = (now) => {
        const box = document.getElementById('recPrompterBox');
        if (!state.recorder.prompterPlaying || !box || state.view !== 'recorder') return;
        const dt = (now - state.recorder.prompterLastTs) / 1000;
        state.recorder.prompterLastTs = now;
        box.scrollTop += state.recorder.prompterSpeed * 26 * dt;
        if (box.scrollTop + box.clientHeight >= box.scrollHeight - 2) {
          state.recorder.prompterPlaying = false;
          if (btn) btn.textContent = '▶ Play Teleprompter';
          return;
        }
        state.recorder.prompterRafId = requestAnimationFrame(step);
      };
      state.recorder.prompterRafId = requestAnimationFrame(step);
    } else if (state.recorder.prompterRafId) {
      cancelAnimationFrame(state.recorder.prompterRafId);
      state.recorder.prompterRafId = null;
    }
  });
}

registerViewRenderer('recorder', renderRecorderView);
registerLifecycleHooks({ stopRecorderMediaStreams, loadRecordingsLibrary });
