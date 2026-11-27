import { MD, STATUS_VISUAL, STORAGE_KEY_PREFS } from '../core/constants.js';
import {
  copyText,
  downloadTextFile,
  formatDatePt,
  formatNumber,
  formatVersionDescription,
  formatVersionLabel,
  loadJsonStorage,
  saveJsonStorage,
  showToast,
} from '../core/utils.js';
import {
  getActiveChannelData,
  getActiveDoc,
  getChannelSeriesList,
  getDocDefaultVersion,
  getStoredDefaultVersion,
  normalizePayload,
  persistDeleteDoc,
  persistSaveDoc,
  registerLifecycleHooks,
  registerViewRenderer,
  resolveRelativeMdPath,
  setStoredDefaultVersion,
  state,
} from '../core/state.js';
import { renderCurrentView, setView, syncBrowserUrl, updateHeaderChrome } from '../core/router.js';
import { syncActiveTabFromState } from '../core/tabs.js';
import { openKdenliveModal, openNewDocModal, openNewVersionModal } from '../core/modals.js';
import { openScriptNarrationModal } from './narration.js';

let speechState = {
  active: false,
  paused: false,
  idx: 0,
  rate: 1.0,
  blocks: [],
  activeEl: null,
  runId: 0,
  mode: 'browser', // 'browser' | 'server-piper'
  audio: null,
  cache: new Map(), // index -> Promise<string blobUrl>
};

function clearSpeechHighlight() {
  if (speechState.activeEl) {
    speechState.activeEl.style.outline = '';
    speechState.activeEl.style.background = '';
    speechState.activeEl.style.borderRadius = '';
    speechState.activeEl.style.paddingLeft = '';
    speechState.activeEl = null;
  }
}

function clearServerSpeechAudio() {
  if (speechState.audio) {
    try {
      speechState.audio.onended = null;
      speechState.audio.onerror = null;
      speechState.audio.pause();
      speechState.audio.src = '';
    } catch {
      // ignore
    }
    speechState.audio = null;
  }
  for (const prom of speechState.cache.values()) {
    Promise.resolve(prom)
      .then((u) => { if (u) URL.revokeObjectURL(u); })
      .catch(() => {});
  }
  speechState.cache.clear();
}

function updateSpeechToolbarUi() {
  const playBtn = document.getElementById('speechToggleBtn');
  const stopBtn = document.getElementById('speechStopBtn');
  const rateBtn = document.getElementById('speechRateBtn');
  if (playBtn) {
    if (!speechState.active) {
      playBtn.textContent = '🔊 Ouvir';
      playBtn.classList.remove('is-active');
    } else if (speechState.paused) {
      playBtn.textContent = '▶ Retomar';
      playBtn.classList.add('is-active');
    } else {
      playBtn.textContent = '⏸ Pausar';
      playBtn.classList.add('is-active');
    }
  }
  if (stopBtn) stopBtn.style.display = speechState.active ? '' : 'none';
  if (rateBtn) rateBtn.textContent = `${speechState.rate}x`;
}

function stopBrowserSpeech() {
  speechState.runId += 1;
  speechState.active = false;
  speechState.paused = false;
  speechState.idx = 0;
  speechState.blocks = [];
  clearSpeechHighlight();
  clearServerSpeechAudio();
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      // ignore
    }
  }
  updateSpeechToolbarUi();
}

function pickPtVoice() {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
  const voices = window.speechSynthesis.getVoices() || [];
  return (
    voices.find((v) => /^pt[-_]br/i.test(v.lang)) ||
    voices.find((v) => /^pt/i.test(v.lang)) ||
    null
  );
}

function shouldUseServerPiper() {
  if (!state.serverMode) return false;
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return true;
  const voices = window.speechSynthesis.getVoices() || [];
  return voices.length === 0;
}

function prefetchPiperBlock(index) {
  if (index < 0 || index >= speechState.blocks.length) return null;
  if (speechState.cache.has(index)) return speechState.cache.get(index);
  const text = speechState.blocks[index].text;
  const prom = fetch('/api/tts/speak', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  }).then(async (res) => {
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  });
  speechState.cache.set(index, prom);
  return prom;
}

function cleanSpeechText(raw) {
  return String(raw || '')
    .replace(/\[(mrj|crom|gancho|tela|b-roll|corte|áudio|audio|sfx)\]/gi, ' ')
    .replace(/\b\d{2}:\d{2}(?:\s*[–-]\s*\d{2}:\d{2})?\s*[—-]?/g, ' ')
    .replace(/https?:\/\/\S+/g, ' link ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function speakBlockWithPiper(index, runId) {
  speechState.mode = 'server-piper';
  if (speechState.audio) {
    try {
      speechState.audio.onended = null;
      speechState.audio.onerror = null;
      speechState.audio.pause();
    } catch {
      // ignore
    }
  }
  try {
    const urlPromise = prefetchPiperBlock(index);
    // Pré-carrega o próximo parágrafo em paralelo para zero pausa entre blocos
    if (index + 1 < speechState.blocks.length) prefetchPiperBlock(index + 1);
    const blobUrl = await urlPromise;
    if (!speechState.active || speechState.paused || speechState.runId !== runId) return;
    const audio = new Audio(blobUrl);
    audio.playbackRate = speechState.rate;
    speechState.audio = audio;
    audio.onended = () => {
      if (!speechState.active || speechState.paused || speechState.runId !== runId) return;
      speakBlockAt(index + 1);
    };
    audio.onerror = () => {
      if (!speechState.active || speechState.runId !== runId) return;
      speakBlockAt(index + 1);
    };
    await audio.play();
  } catch (err) {
    if (!speechState.active || speechState.runId !== runId) return;
    showToast(`Falha na voz local (Piper): ${err?.message || err}`, 'warn');
    stopBrowserSpeech();
  }
}

function speakBlockAt(index) {
  if (index >= speechState.blocks.length) {
    stopBrowserSpeech();
    showToast('Leitura em voz alta concluída.', 'ok');
    return;
  }
  const runId = ++speechState.runId;
  speechState.active = true;
  speechState.paused = false;
  speechState.idx = index;

  const item = speechState.blocks[index];
  clearSpeechHighlight();
  speechState.activeEl = item.el;
  item.el.style.outline = '2px solid var(--accent, #00e5ff)';
  item.el.style.background = 'rgba(0, 229, 255, 0.11)';
  item.el.style.borderRadius = '8px';
  item.el.style.paddingLeft = '6px';
  item.el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  updateSpeechToolbarUi();

  if (shouldUseServerPiper()) {
    speakBlockWithPiper(index, runId);
    return;
  }

  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    showToast('Este navegador não suporta síntese de voz (speechSynthesis).', 'warn');
    return;
  }

  speechState.mode = 'browser';
  try {
    window.speechSynthesis.cancel();
  } catch {
    // ignore
  }

  const utt = new SpeechSynthesisUtterance(item.text);
  const voice = pickPtVoice();
  if (voice) utt.voice = voice;
  utt.lang = voice?.lang || 'pt-BR';
  utt.rate = speechState.rate;
  utt.onend = () => {
    if (!speechState.active || speechState.paused || speechState.runId !== runId) return;
    speakBlockAt(index + 1);
  };
  utt.onerror = (ev) => {
    if (ev?.error === 'interrupted' || ev?.error === 'canceled') return;
    if (!speechState.active || speechState.runId !== runId) return;
    speakBlockAt(index + 1);
  };
  window.speechSynthesis.speak(utt);
}

function startOrToggleBrowserSpeech(startIdx = null) {
  if (!state.serverMode && (typeof window === 'undefined' || !('speechSynthesis' in window))) {
    showToast('Este navegador não suporta leitura em voz alta.', 'warn');
    return;
  }
  if (startIdx === null && speechState.active && !speechState.paused) {
    speechState.paused = true;
    speechState.runId += 1;
    if (speechState.mode === 'server-piper' && speechState.audio) {
      try { speechState.audio.pause(); } catch { /* ignore */ }
    } else if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try { window.speechSynthesis.cancel(); } catch { /* ignore */ }
    }
    updateSpeechToolbarUi();
    return;
  }
  if (startIdx === null && speechState.active && speechState.paused) {
    if (speechState.mode === 'server-piper' && speechState.audio) {
      speechState.paused = false;
      const runId = ++speechState.runId;
      speechState.audio.playbackRate = speechState.rate;
      speechState.audio.onended = () => {
        if (!speechState.active || speechState.paused || speechState.runId !== runId) return;
        speakBlockAt(speechState.idx + 1);
      };
      updateSpeechToolbarUi();
      speechState.audio.play().catch(() => speakBlockAt(speechState.idx));
      return;
    }
    speakBlockAt(speechState.idx);
    return;
  }

  const art = document.getElementById('mdArticle');
  if (!art) return;
  const rawEls = Array.from(art.querySelectorAll('h1, h2, h3, h4, p, li, blockquote, figcaption'));
  const blocks = [];
  for (const el of rawEls) {
    if (el.closest('figure') && el.tagName !== 'FIGCAPTION') continue;
    const text = cleanSpeechText(el.innerText || el.textContent || '');
    if (text && text.length >= 2) {
      blocks.push({ el, text });
    }
  }
  if (!blocks.length) {
    showToast('Nenhum texto encontrado para ler.', 'warn');
    return;
  }
  clearServerSpeechAudio();
  speechState.blocks = blocks;
  speakBlockAt(startIdx !== null ? Math.max(0, Math.min(startIdx, blocks.length - 1)) : 0);
}

export async function loadVersionHistory(
  docPath,
  { force = false, skipRender = false, autoSelectDefault = true } = {}
) {
  if (!state.serverMode || !docPath) return null;
  const chKey = state.activeChannel;
  const fetchKey = `${chKey}::${docPath}`;
  if (!force && state.versionLoading && state.versionFetchedKey === fetchKey) {
    return state.versionHistory;
  }
  state.versionLoading = true;
  state.versionFetchedKey = fetchKey;
  state.versionError = null;
  const preTargetVer = (state.activeVersion || 'principal').trim() || 'principal';
  const wantPreContent =
    preTargetVer !== 'principal' &&
    state.loadedVersionKey !== `${chKey}::${docPath}::${preTargetVer}`;
  if (wantPreContent) {
    state.versionContentLoading = true;
  }

  try {
    const historyReq = fetch(
      `/api/versions?channel=${encodeURIComponent(chKey)}&path=${encodeURIComponent(docPath)}`,
      { cache: 'no-store' }
    ).then(async (res) => ({ ok: res.ok, json: await res.json() }));

    const contentReq = wantPreContent
      ? fetch(
          `/api/versions/content?channel=${encodeURIComponent(chKey)}&path=${encodeURIComponent(docPath)}&ref=${encodeURIComponent(`ver:${preTargetVer}`)}`,
          { cache: 'no-store' }
        )
          .then(async (res) => ({ ok: res.ok, json: await res.json() }))
          .catch(() => ({ ok: false, json: {} }))
      : Promise.resolve(null);

    const [histOut, preContentOut] = await Promise.all([historyReq, contentReq]);
    const json = histOut.json;
    if (!histOut.ok) throw new Error(json?.error || 'Erro ao carregar histórico do roteiro');
    if (state.activeChannel !== chKey || getActiveDoc()?.path !== docPath) return json;

    state.versionHistory = json;
    const hasServerDefault = typeof json.defaultVersion === 'string' && json.defaultVersion.trim().length > 0;
    const knownNames = (json.versions || []).map((v) => v.name);
    let serverDefault = 'principal';
    if (hasServerDefault) {
      serverDefault = knownNames.includes(json.defaultVersion) ? json.defaultVersion : 'principal';
      setStoredDefaultVersion(chKey, docPath, serverDefault);
    } else {
      const localDef = getStoredDefaultVersion(chKey, docPath);
      serverDefault = localDef && knownNames.includes(localDef) ? localDef : 'principal';
      state.versionHistory = {
        ...json,
        defaultVersion: serverDefault,
        versions: (json.versions || []).map((v) => ({ ...v, isDefault: v.name === serverDefault })),
      };
    }

    if (autoSelectDefault && !state.versionExplicit && state.activeVersion !== serverDefault) {
      state.activeVersion = serverDefault;
    }

    const finalVer = (state.activeVersion || 'principal').trim() || 'principal';
    const versionExists = (json.versions || []).some((v) => v.name === finalVer);
    let resolvedVer = finalVer;
    if (!versionExists) {
      resolvedVer = serverDefault;
      state.activeVersion = resolvedVer;
      state.versionExplicit = false;
      showToast(`Versão "${finalVer}" não encontrada; abrindo "${formatVersionLabel(resolvedVer)}".`);
    }

    const desiredKey = `${chKey}::${docPath}::${resolvedVer}`;
    if (resolvedVer === 'principal') {
      if (!state.hasUnsavedEdits) {
        state.dirtyBody = null;
        state.dirtyMeta = null;
      }
      state.loadedVersionKey = desiredKey;
      state.versionContentLoading = false;
    } else if (state.loadedVersionKey !== desiredKey) {
      let verContentOut = resolvedVer === preTargetVer ? preContentOut : null;
      if (!verContentOut) {
        verContentOut = await fetch(
          `/api/versions/content?channel=${encodeURIComponent(chKey)}&path=${encodeURIComponent(docPath)}&ref=${encodeURIComponent(`ver:${resolvedVer}`)}`,
          { cache: 'no-store' }
        )
          .then(async (res) => ({ ok: res.ok, json: await res.json() }))
          .catch(() => ({ ok: false, json: {} }));
      }
      if (state.activeChannel !== chKey || getActiveDoc()?.path !== docPath) return json;
      if (verContentOut?.ok) {
        const parsed = MD.parseFrontmatter(verContentOut.json?.content || '');
        state.dirtyMeta = Object.keys(parsed.meta).length ? parsed.meta : null;
        state.dirtyBody = parsed.body;
        state.hasUnsavedEdits = false;
        state.loadedVersionKey = desiredKey;
      } else {
        state.activeVersion = 'principal';
        state.dirtyMeta = null;
        state.dirtyBody = null;
        state.loadedVersionKey = `${chKey}::${docPath}::principal`;
      }
      state.versionContentLoading = false;
    } else {
      state.versionContentLoading = false;
    }

    syncBrowserUrl({ replace: true });

    const revs = json.revisions || [];
    if (!state.diffFromRef || !state.diffToRef || state.diffDocPath !== docPath) {
      state.diffDocPath = docPath;
      if (revs.length >= 2) {
        state.diffFromRef = `rev:${revs[1].id}`;
        state.diffToRef = `rev:${revs[0].id}`;
      } else if (revs.length === 1) {
        state.diffFromRef = `rev:${revs[0].id}`;
        state.diffToRef = `ver:${serverDefault}`;
      } else {
        state.diffFromRef = `ver:${serverDefault}`;
        state.diffToRef = `ver:${serverDefault}`;
      }
    }
    if (state.docMode === 'history' && !state.diffResult && state.diffFromRef && state.diffToRef) {
      await loadDiffForDoc(docPath, state.diffFromRef, state.diffToRef, { silentRender: true });
    }
    return json;
  } catch (err) {
    state.versionContentLoading = false;
    if (state.activeChannel === chKey && getActiveDoc()?.path === docPath) {
      state.versionError = err.message;
    }
    return null;
  } finally {
    state.versionLoading = false;
    if (!skipRender && state.view === 'scripts' && state.activeChannel === chKey && getActiveDoc()?.path === docPath) {
      renderScriptsView(document.getElementById('viewContainer'));
    }
  }
}

export async function switchDocVersion(
  docPath,
  versionName = 'principal',
  { silent = false, replaceUrl = false } = {}
) {
  const cleanVer = (versionName || 'principal').trim() || 'principal';
  stopPrompter();
  stopBrowserSpeech();
  state.selectedRevPreview = null;
  state.revPreviewContent = null;
  state.hasUnsavedEdits = false;
  state.versionExplicit = true;
  if (cleanVer === 'principal') {
    state.activeVersion = 'principal';
    state.dirtyBody = null;
    state.dirtyMeta = null;
    state.versionContentLoading = false;
    state.loadedVersionKey = `${state.activeChannel}::${docPath}::principal`;
    syncBrowserUrl({ replace: replaceUrl });
    updateHeaderChrome();
    if (state.view === 'scripts') renderScriptsView(document.getElementById('viewContainer'));
    if (!silent) showToast('Versão "Base" aberta');
    return;
  }
  if (!state.serverMode) {
    showToast('Múltiplas versões requerem o servidor local (./bin/crom-studio --tray).');
    return;
  }
  try {
    const res = await fetch(
      `/api/versions/content?channel=${encodeURIComponent(state.activeChannel)}&path=${encodeURIComponent(docPath)}&ref=${encodeURIComponent(`ver:${cleanVer}`)}`,
      { cache: 'no-store' }
    );
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || `Versão "${cleanVer}" não encontrada`);
    const parsed = MD.parseFrontmatter(json.content || '');
    state.activeVersion = cleanVer;
    state.dirtyMeta = Object.keys(parsed.meta).length ? parsed.meta : null;
    state.dirtyBody = parsed.body;
    state.hasUnsavedEdits = false;
    state.versionContentLoading = false;
    state.loadedVersionKey = `${state.activeChannel}::${docPath}::${cleanVer}`;
    syncBrowserUrl({ replace: replaceUrl });
    updateHeaderChrome();
    if (state.view === 'scripts') renderScriptsView(document.getElementById('viewContainer'));
    if (!silent) showToast(`Versão "${formatVersionLabel(cleanVer)}" aberta`);
  } catch (err) {
    state.versionContentLoading = false;
    showToast(err.message);
  }
}

export async function setDefaultDocVersion(docPath, versionName = 'principal') {
  if (!docPath) return;
  const cleanVer = (versionName || 'principal').trim() || 'principal';
  const chKey = state.activeChannel;
  if (!state.serverMode) {
    setStoredDefaultVersion(chKey, docPath, cleanVer);
    if (state.versionHistory) {
      state.versionHistory.defaultVersion = cleanVer;
      state.versionHistory.versions = (state.versionHistory.versions || []).map((v) => ({
        ...v,
        isDefault: v.name === cleanVer,
      }));
    }
    syncBrowserUrl({ replace: true });
    if (state.view === 'scripts') renderScriptsView(document.getElementById('viewContainer'));
    showToast(`★ "${formatVersionLabel(cleanVer)}" agora abre primeiro neste roteiro!`);
    return;
  }
  try {
    const res = await fetch('/api/versions/default', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channel: chKey,
        path: docPath,
        versionName: cleanVer,
      }),
    });
    if (res.status === 405) {
      setStoredDefaultVersion(chKey, docPath, cleanVer);
      if (state.versionHistory) {
        state.versionHistory = {
          ...state.versionHistory,
          defaultVersion: cleanVer,
          versions: (state.versionHistory.versions || []).map((v) => ({
            ...v,
            isDefault: v.name === cleanVer,
          })),
        };
      }
      syncBrowserUrl({ replace: true });
      updateHeaderChrome();
      if (state.view === 'scripts') renderScriptsView(document.getElementById('viewContainer'));
      showToast(`★ "${formatVersionLabel(cleanVer)}" salva localmente para abrir primeiro!`);
      return;
    }
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Erro ao definir versão inicial');
    if (json.state) state.data = normalizePayload(json.state);
    if (json.history) state.versionHistory = json.history;
    state.versionFetchedKey = `${chKey}::${docPath}`;
    const resolvedDef = json.defaultVersion || cleanVer;
    setStoredDefaultVersion(chKey, docPath, resolvedDef);
    syncBrowserUrl({ replace: true });
    updateHeaderChrome();
    if (state.view === 'scripts') renderScriptsView(document.getElementById('viewContainer'));
    showToast(`★ "${formatVersionLabel(resolvedDef)}" agora abre primeiro neste roteiro!`);
  } catch (err) {
    showToast(err.message);
  }
}

export async function loadDiffForDoc(docPath, fromRef, toRef, { silentRender = false } = {}) {
  if (!state.serverMode || !docPath) return null;
  try {
    const res = await fetch(
      `/api/versions/diff?channel=${encodeURIComponent(state.activeChannel)}&path=${encodeURIComponent(docPath)}&from=${encodeURIComponent(fromRef)}&to=${encodeURIComponent(toRef)}`,
      { cache: 'no-store' }
    );
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Erro ao calcular diff');
    state.diffDocPath = docPath;
    state.diffFromRef = fromRef;
    state.diffToRef = toRef;
    state.diffResult = json;
    state.selectedRevPreview = null;
    state.revPreviewContent = null;
    if (!silentRender && state.view === 'scripts') {
      renderScriptsView(document.getElementById('viewContainer'));
    }
    return json;
  } catch (err) {
    showToast(err.message);
    return null;
  }
}

export async function loadRevisionPreview(docPath, revId) {
  if (!state.serverMode || !docPath || !revId) return;
  try {
    const ref = revId === 'disk' ? 'disk' : `rev:${revId}`;
    const res = await fetch(
      `/api/versions/content?channel=${encodeURIComponent(state.activeChannel)}&path=${encodeURIComponent(docPath)}&ref=${encodeURIComponent(ref)}`,
      { cache: 'no-store' }
    );
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Erro ao ler snapshot');
    state.selectedRevPreview = revId;
    state.revPreviewContent = json.content || '';
    if (state.view === 'scripts') renderScriptsView(document.getElementById('viewContainer'));
  } catch (err) {
    showToast(err.message);
  }
}

export async function restoreDocRevision(docPath, revId, targetVersion = 'principal') {
  if (!state.serverMode || !docPath || !revId || revId === 'disk') return;
  const labelTarget = `versão "${formatVersionLabel(targetVersion)}"`;
  if (!confirm(`Restaurar o snapshot ${revId} para ${labelTarget}? (O histórico atual não será perdido; uma nova revisão de restauração será gravada.)`)) {
    return;
  }
  try {
    const res = await fetch('/api/versions/restore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channel: state.activeChannel,
        path: docPath,
        revId,
        targetVersion,
        author: 'MrJ',
      }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Erro ao restaurar revisão');
    state.data = normalizePayload(json.state);
    state.versionHistory = json.history;
    state.activeVersion = json.version || targetVersion;
    state.loadedVersionKey = `${state.activeChannel}::${docPath}::${state.activeVersion}`;
    state.versionContentLoading = false;
    state.hasUnsavedEdits = false;
    if (state.activeVersion === 'principal') {
      state.dirtyBody = null;
      state.dirtyMeta = null;
    } else {
      const parsed = MD.parseFrontmatter(json.content || '');
      state.dirtyMeta = Object.keys(parsed.meta).length ? parsed.meta : null;
      state.dirtyBody = parsed.body;
    }
    state.diffResult = null;
    state.selectedRevPreview = null;
    state.revPreviewContent = null;
    syncBrowserUrl({ replace: true });
    updateHeaderChrome();
    renderCurrentView();
    showToast(`Snapshot ${revId} restaurado como ${json.revision?.id || 'nova revisão'}!`);
  } catch (err) {
    showToast(err.message);
  }
}

export async function promoteDocVersion(docPath, versionName) {
  if (!state.serverMode || !docPath || !versionName || versionName === 'principal') return;
  if (!confirm(`Aplicar o conteúdo da versão "${versionName}" no arquivo .md Base em disco? (Será gravado um commit no histórico.)`)) {
    return;
  }
  try {
    const res = await fetch('/api/versions/promote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channel: state.activeChannel,
        path: docPath,
        versionName,
        author: 'MrJ',
      }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Erro ao aplicar versão na Base');
    state.data = normalizePayload(json.state);
    state.versionHistory = json.history;
    state.activeVersion = 'principal';
    state.versionExplicit = true;
    state.loadedVersionKey = `${state.activeChannel}::${docPath}::principal`;
    state.versionContentLoading = false;
    state.dirtyBody = null;
    state.dirtyMeta = null;
    state.hasUnsavedEdits = false;
    state.diffResult = null;
    syncBrowserUrl({ replace: false });
    updateHeaderChrome();
    renderCurrentView();
    showToast(`Conteúdo de "${versionName}" aplicado na versão Base!`);
  } catch (err) {
    showToast(err.message);
  }
}

export async function deleteDocVersion(docPath, versionName) {
  if (!state.serverMode || !docPath || !versionName || versionName === 'principal') return;
  if (!confirm(`Excluir a versão "${versionName}"? (Os commits já salvos continuam na linha do tempo.)`)) {
    return;
  }
  try {
    const res = await fetch(
      `/api/versions?channel=${encodeURIComponent(state.activeChannel)}&path=${encodeURIComponent(docPath)}&versionName=${encodeURIComponent(versionName)}`,
      { method: 'DELETE' }
    );
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Erro ao excluir versão');
    state.data = normalizePayload(json.state);
    state.versionHistory = json.history;
    const nextDefault = json.history?.defaultVersion || json.defaultVersion || 'principal';
    setStoredDefaultVersion(state.activeChannel, docPath, nextDefault);
    if (state.activeVersion === versionName) {
      state.activeVersion = nextDefault;
      state.versionExplicit = false;
      state.dirtyBody = null;
      state.dirtyMeta = null;
      state.hasUnsavedEdits = false;
      state.loadedVersionKey = nextDefault === 'principal' ? `${state.activeChannel}::${docPath}::principal` : '';
      if (nextDefault !== 'principal') {
        await switchDocVersion(docPath, nextDefault, { silent: true, replaceUrl: true });
      }
    }
    syncBrowserUrl({ replace: true });
    updateHeaderChrome();
    renderCurrentView();
    showToast(`Versão "${versionName}" removida.`);
  } catch (err) {
    showToast(err.message);
  }
}

function buildStarterBoardElementsForDoc(doc, meta) {
  const title = (meta?.titulo || doc?.meta?.titulo || doc?.filename || 'Roteiro').slice(0, 64);
  const serie = meta?.serie || doc?.meta?.serie || '';
  const status = meta?.status || doc?.meta?.status || 'ideia';
  const now = Date.now();
  const rectId = `doc-node-${now}`;
  const textId = `doc-node-txt-${now}`;
  const label = `${title}\n[${status}]${serie ? ` • ${serie}` : ''}\n${doc.path}`;
  return [
    {
      id: rectId,
      type: 'rectangle',
      x: 160,
      y: 140,
      width: 280,
      height: 116,
      angle: 0,
      strokeColor: '#e12d78',
      backgroundColor: '#1f1629',
      fillStyle: 'solid',
      strokeWidth: 2,
      strokeStyle: 'solid',
      roughness: 0,
      opacity: 100,
      groupIds: [],
      frameId: null,
      roundness: { type: 3 },
      seed: Math.floor(Math.random() * 1000000),
      version: 1,
      versionNonce: Math.floor(Math.random() * 1000000),
      isDeleted: false,
      boundElements: [{ id: textId, type: 'text' }],
      updated: now,
      link: null,
      locked: false,
      customData: {
        docPath: doc.path,
        docTitle: meta?.titulo || doc?.meta?.titulo || doc.path,
        docStatus: status,
        docSerie: serie,
      },
    },
    {
      id: textId,
      type: 'text',
      x: 174,
      y: 160,
      width: 252,
      height: 76,
      angle: 0,
      strokeColor: '#f8fafc',
      backgroundColor: 'transparent',
      fillStyle: 'solid',
      strokeWidth: 1,
      strokeStyle: 'solid',
      roughness: 0,
      opacity: 100,
      groupIds: [],
      frameId: null,
      roundness: null,
      seed: Math.floor(Math.random() * 1000000),
      version: 1,
      versionNonce: Math.floor(Math.random() * 1000000),
      isDeleted: false,
      boundElements: null,
      updated: now,
      link: null,
      locked: false,
      text: label,
      fontSize: 15,
      fontFamily: 5,
      textAlign: 'center',
      verticalAlign: 'middle',
      containerId: rectId,
      originalText: label,
      autoResize: true,
      lineHeight: 1.25,
    },
  ];
}

function renderHistoryDiffTab(activeDoc) {
  if (!state.serverMode) {
    return `
      <div class="doc-body-scroll">
        <div class="glass-card" style="max-width:600px; margin:24px auto;">
          <h3 class="gc-title">Histórico Git & Diff de Roteiros</h3>
          <p class="gc-desc">
            O histórico de revisões, comparação linha a linha e múltiplas versões estão disponíveis quando o painel roda com o servidor local:
            <code>./bin/crom-studio --tray</code> (ou <code>npm start</code>).
          </p>
        </div>
      </div>
    `;
  }

  if (state.versionLoading && !state.versionHistory) {
    return `<div class="doc-body-scroll"><p style="color:var(--text-3); padding:24px;">Carregando histórico de revisões...</p></div>`;
  }

  if (state.versionError) {
    return `
      <div class="doc-body-scroll">
        <div class="glass-card" style="max-width:560px; margin:24px auto;">
          <h3 class="gc-title">Erro ao carregar histórico</h3>
          <p class="gc-desc">${MD.escapeHtml(state.versionError)}</p>
          <div class="gc-actions">
            <button type="button" class="btn-sm btn-accent" id="retryHistoryBtn">Tentar novamente</button>
          </div>
        </div>
      </div>
    `;
  }

  const history = state.versionHistory || { versions: [], revisions: [], defaultVersion: 'principal' };
  const versions = history.versions || [];
  const revisions = history.revisions || [];
  const defaultVersion = history.defaultVersion || getDocDefaultVersion(state.activeChannel, activeDoc.path);

  const buildRefOptions = (selectedVal) => {
    const verOpts = versions.map((v) => {
      const val = `ver:${v.name}`;
      const lbl = formatVersionLabel(v.name);
      const star = v.name === defaultVersion ? ' ★' : '';
      return `<option value="${MD.escapeHtml(val)}"${selectedVal === val ? ' selected' : ''}>Versão: ${MD.escapeHtml(lbl)}${star}${v.headRev ? ` (${MD.escapeHtml(v.headRev)})` : ''}</option>`;
    });
    const revOpts = revisions.map((r) => {
      const val = r.id === 'disk' ? 'disk' : `rev:${r.id}`;
      const isSelected = selectedVal === val || (r.id === 'disk' && selectedVal === 'rev:disk');
      const revVerLabel = formatVersionLabel(r.version);
      return `<option value="${MD.escapeHtml(val)}"${isSelected ? ' selected' : ''}>${MD.escapeHtml(r.id)} (${MD.escapeHtml(revVerLabel)}) — ${MD.escapeHtml(String(r.message || '').slice(0, 42))}</option>`;
    });
    return [...verOpts, ...revOpts].join('');
  };

  const timelineHtml = revisions.length
    ? revisions
        .map((rev) => {
          const isSelected = state.selectedRevPreview === rev.id;
          const dateStr = formatDatePt(String(rev.createdAt || '').slice(0, 10));
          const revVerLabel = formatVersionLabel(rev.version);
          return `
            <div class="git-rev-card${isSelected ? ' is-selected' : ''}">
              <div class="git-rev-top">
                <span style="font-weight:700; color:var(--text-1);">${MD.escapeHtml(rev.id)}</span>
                <span class="git-kind-badge kind-${MD.escapeHtml(rev.kind || 'commit')}">${MD.escapeHtml(rev.kind || 'commit')}</span>
                <span style="color:var(--accent);">${MD.escapeHtml(revVerLabel)}</span>
              </div>
              <div style="font-size:12px; font-weight:600; color:var(--text-1); line-height:1.35;">${MD.escapeHtml(rev.message || '')}</div>
              <div style="font-size:11px; color:var(--text-3); display:flex; justify-content:space-between; gap:6px; flex-wrap:wrap;">
                <span>${MD.escapeHtml(rev.author || 'MrJ')} • ${MD.escapeHtml(dateStr)}</span>
                <span style="font-family:var(--font-mono);">
                  <span style="color:#86efac;">+${Number(rev.added || 0)}</span>
                  <span style="color:#fda4af;">-${Number(rev.removed || 0)}</span>
                  • ${Number(rev.words || 0)} pal.
                </span>
              </div>
              <div style="display:flex; gap:6px; flex-wrap:wrap; margin-top:2px;">
                <button type="button" class="kc-move-btn" data-rev-preview="${MD.escapeHtml(rev.id)}">Snapshot</button>
                <button type="button" class="kc-move-btn" data-rev-diff="${MD.escapeHtml(rev.id)}">Diff c/ atual</button>
                ${rev.id !== 'disk' ? `<button type="button" class="kc-move-btn" data-rev-restore="${MD.escapeHtml(rev.id)}">Restaurar</button>` : ''}
              </div>
            </div>
          `;
        })
        .join('')
    : '<p style="color:var(--text-3); font-size:12px; padding:10px;">Nenhuma revisão registrada ainda. Salve uma edição para criar o primeiro snapshot.</p>';

  let rightPaneHtml = '';
  if (state.selectedRevPreview && state.revPreviewContent !== null) {
    rightPaneHtml = `
      <div class="git-diff-toolbar">
        <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
          <strong style="font-size:12.5px;">Snapshot: <code>${MD.escapeHtml(state.selectedRevPreview)}</code></strong>
          <span style="font-size:11px; color:var(--text-3);">(${MD.escapeHtml(activeDoc.path)})</span>
        </div>
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          ${state.selectedRevPreview !== 'disk' ? `<button type="button" class="btn-sm btn-accent" id="restorePreviewBtn">↺ Restaurar este snapshot</button>` : ''}
          <button type="button" class="btn-sm" id="closeRevPreviewBtn">Voltar ao Diff</button>
        </div>
      </div>
      <div class="diff-viewer">
        <pre style="margin:0; white-space:pre-wrap; word-break:break-word; font-family:var(--font-mono); font-size:12px; line-height:1.6; color:var(--text-1);">${MD.escapeHtml(state.revPreviewContent)}</pre>
      </div>
    `;
  } else {
    const diff = state.diffResult;
    const diffBodyHtml = diff
      ? (diff.lines || [])
          .map((line) => {
            const marker = line.type === 'add' ? '+' : line.type === 'del' ? '-' : ' ';
            return `
              <div class="diff-line is-${MD.escapeHtml(line.type)}">
                <span class="diff-ln">${line.oldLine ?? ''}</span>
                <span class="diff-ln">${line.newLine ?? ''}</span>
                <span class="diff-ln">${marker}</span>
                <span>${MD.escapeHtml(line.text)}</span>
              </div>
            `;
          })
          .join('') || '<p style="color:var(--text-3); padding:12px;">Sem diferenças entre as referências selecionadas.</p>'
      : '<p style="color:var(--text-3); padding:12px;">Selecione duas referências acima para visualizar as alterações linha a linha.</p>';

    rightPaneHtml = `
      <div class="git-diff-toolbar">
        <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
          <span style="font-size:11px; color:var(--text-3);">De:</span>
          <select class="select-dark" id="diffFromSelect" style="height:28px; font-size:11.5px; max-width:210px;">
            ${buildRefOptions(state.diffFromRef)}
          </select>
          <button type="button" class="icon-btn-sm" id="diffSwapBtn" title="Inverter comparação">⇄</button>
          <span style="font-size:11px; color:var(--text-3);">Para:</span>
          <select class="select-dark" id="diffToSelect" style="height:28px; font-size:11.5px; max-width:210px;">
            ${buildRefOptions(state.diffToRef)}
          </select>
        </div>
        ${diff
          ? `<div style="font-family:var(--font-mono); font-size:11px; display:flex; gap:10px;">
              <span style="color:#86efac;">+${Number(diff.added || 0)}</span>
              <span style="color:#fda4af;">-${Number(diff.removed || 0)}</span>
              <span style="color:var(--text-3);">${Number(diff.unchanged || 0)} iguais</span>
            </div>`
          : ''}
      </div>
      <div class="diff-viewer">${diffBodyHtml}</div>
    `;
  }

  return `
    <div class="git-view-grid">
      <div class="git-timeline">
        <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:4px;">
          <span class="insp-title">Linha do Tempo (${revisions.length})</span>
          <button type="button" class="kc-move-btn" id="refreshHistoryBtn">↻ Atualizar</button>
        </div>
        ${timelineHtml}
      </div>
      <div class="git-diff-pane">${rightPaneHtml}</div>
    </div>
  `;
}

function bindHistoryDiffEvents(activeDoc, container) {
  const retryBtn = document.getElementById('retryHistoryBtn');
  if (retryBtn) retryBtn.onclick = () => loadVersionHistory(activeDoc.path, { force: true });

  const refreshBtn = document.getElementById('refreshHistoryBtn');
  if (refreshBtn) refreshBtn.onclick = () => loadVersionHistory(activeDoc.path, { force: true });

  const fromSel = document.getElementById('diffFromSelect');
  const toSel = document.getElementById('diffToSelect');
  if (fromSel && toSel) {
    const triggerDiff = () => loadDiffForDoc(activeDoc.path, fromSel.value, toSel.value);
    fromSel.onchange = triggerDiff;
    toSel.onchange = triggerDiff;
  }

  const swapBtn = document.getElementById('diffSwapBtn');
  if (swapBtn && fromSel && toSel) {
    swapBtn.onclick = () => {
      loadDiffForDoc(activeDoc.path, toSel.value, fromSel.value);
    };
  }

  container.querySelectorAll('[data-rev-preview]').forEach((btn) => {
    btn.onclick = () => loadRevisionPreview(activeDoc.path, btn.dataset.revPreview);
  });

  container.querySelectorAll('[data-rev-diff]').forEach((btn) => {
    btn.onclick = () => {
      const revId = btn.dataset.revDiff;
      const fromRef = revId === 'disk' ? 'disk' : `rev:${revId}`;
      const toRef = `ver:${state.activeVersion || 'principal'}`;
      loadDiffForDoc(activeDoc.path, fromRef, toRef);
    };
  });

  container.querySelectorAll('[data-rev-restore]').forEach((btn) => {
    btn.onclick = () => restoreDocRevision(activeDoc.path, btn.dataset.revRestore, state.activeVersion || 'principal');
  });

  const closePrevBtn = document.getElementById('closeRevPreviewBtn');
  if (closePrevBtn) {
    closePrevBtn.onclick = () => {
      state.selectedRevPreview = null;
      state.revPreviewContent = null;
      if (!state.diffResult && state.diffFromRef && state.diffToRef) {
        loadDiffForDoc(activeDoc.path, state.diffFromRef, state.diffToRef);
      } else {
        renderScriptsView(container);
      }
    };
  }

  const restorePrevBtn = document.getElementById('restorePreviewBtn');
  if (restorePrevBtn && state.selectedRevPreview) {
    restorePrevBtn.onclick = () =>
      restoreDocRevision(activeDoc.path, state.selectedRevPreview, state.activeVersion || 'principal');
  }
}

export function stopPrompter() {
  state.prompter.playing = false;
  if (state.prompter.rafId) {
    cancelAnimationFrame(state.prompter.rafId);
    state.prompter.rafId = null;
  }
}

function bindPrompterEvents() {
  const playBtn = document.getElementById('prompterPlayBtn');
  const resetBtn = document.getElementById('prompterResetBtn');
  const speedInp = document.getElementById('prompterSpeed');
  const speedVal = document.getElementById('prompterSpeedVal');
  const sizeInp = document.getElementById('prompterSize');
  const mirrorBtn = document.getElementById('prompterMirrorBtn');
  const stage = document.getElementById('prompterStage');
  const textEl = document.getElementById('prompterText');

  if (!stage || !playBtn) return;

  state.prompter.scrollPos = stage.scrollTop;

  const tick = (ts) => {
    if (!state.prompter.playing) return;
    if (!state.prompter.lastTs) state.prompter.lastTs = ts;
    const dt = Math.min(80, ts - state.prompter.lastTs) / 1000;
    state.prompter.lastTs = ts;

    // Preserve user manual scroll, then accumulate fractional sub-pixels cleanly
    if (Math.abs(stage.scrollTop - Math.floor(state.prompter.scrollPos)) > 3) {
      state.prompter.scrollPos = stage.scrollTop;
    }
    const maxScroll = Math.max(0, stage.scrollHeight - stage.clientHeight);
    state.prompter.scrollPos = Math.min(
      maxScroll,
      state.prompter.scrollPos + state.prompter.speed * 22 * dt
    );
    stage.scrollTop = Math.floor(state.prompter.scrollPos);

    if (maxScroll > 0 && stage.scrollTop >= maxScroll) {
      stopPrompter();
      playBtn.textContent = '▶ Iniciar Rolagem';
      return;
    }
    state.prompter.rafId = requestAnimationFrame(tick);
  };

  playBtn.onclick = () => {
    state.prompter.playing = !state.prompter.playing;
    playBtn.textContent = state.prompter.playing ? '⏸ Pausar (Espaço)' : '▶ Iniciar Rolagem';
    if (state.prompter.playing) {
      state.prompter.scrollPos = stage.scrollTop;
      state.prompter.lastTs = 0;
      state.prompter.rafId = requestAnimationFrame(tick);
    } else {
      stopPrompter();
    }
  };

  resetBtn.onclick = () => {
    state.prompter.scrollPos = 0;
    stage.scrollTo({ top: 0, behavior: 'smooth' });
  };
  speedInp.oninput = () => {
    state.prompter.speed = Number(speedInp.value);
    if (speedVal) speedVal.textContent = `${state.prompter.speed.toFixed(1)}x`;
  };
  sizeInp.oninput = () => {
    state.prompter.fontSize = Number(sizeInp.value);
    if (textEl) textEl.style.fontSize = `${state.prompter.fontSize}px`;
  };
  mirrorBtn.onclick = () => {
    state.prompter.mirrored = !state.prompter.mirrored;
    stage.classList.toggle('is-mirrored', state.prompter.mirrored);
    mirrorBtn.textContent = state.prompter.mirrored ? '⇄ Normal' : '⇄ Espelhar';
  };
}

export async function saveCurrentDoc() {
  const activeDoc = getActiveDoc();
  if (!activeDoc) return;
  const activeVersion = state.activeVersion || 'principal';
  const commitMessage = (state.commitMessageDraft || '').trim();
  const meta = { ...(state.dirtyMeta || activeDoc.meta) };
  const body = state.dirtyBody !== null ? state.dirtyBody : activeDoc.body;

  let newPath = null;
  if (activeVersion === 'principal' && activeDoc.topFolder === '02-roteiros') {
    let targetSub = null;
    if (['roteiro', 'pesquisa', 'ideia'].includes(meta.status)) targetSub = '02-roteiros/rascunhos';
    else if (['gravando', 'edicao'].includes(meta.status)) targetSub = '02-roteiros/em-producao';
    else if (meta.status === 'publicado') targetSub = '02-roteiros/publicados';
    if (targetSub && activeDoc.folder !== targetSub) {
      newPath = `${targetSub}/${activeDoc.filename}`;
    }
  }

  const fullRaw = MD.serializeFrontmatter(meta, body);
  try {
    const finalPath = await persistSaveDoc(activeDoc.path, fullRaw, newPath, {
      version: activeVersion,
      commitMessage,
    });
    state.hasUnsavedEdits = false;
    state.commitMessageDraft = '';
    if (activeVersion === 'principal') {
      state.dirtyBody = null;
      state.dirtyMeta = null;
    } else {
      state.dirtyMeta = meta;
      state.dirtyBody = body;
    }
    state.versionFetchedKey = `${state.activeChannel}::${finalPath}`;
    state.loadedVersionKey = `${state.activeChannel}::${finalPath}::${activeVersion}`;
    state.diffResult = null;
    updateHeaderChrome();
    renderCurrentView();
    showToast(
      state.serverMode
        ? activeVersion === 'principal'
          ? `Salvo em ${finalPath}!`
          : `Versão "${formatVersionLabel(activeVersion)}" salva no histórico de ${finalPath}!`
        : `Salvo no rascunho local (${finalPath}). Use "Baixar .md" ou inicie o servidor.`
    );
  } catch (err) {
    showToast(err.message);
  }
}

export function backToScriptsList({ skipConfirm = false } = {}) {
  if (!skipConfirm && state.hasUnsavedEdits) {
    if (!confirm('Existem alterações não salvas neste roteiro. Deseja voltar para a lista mesmo assim?')) return;
  }
  stopPrompter();
  setView('scripts', null);
}

function openScriptFromList(docPath, mode = 'read') {
  state.docMode = mode;
  setView('scripts', docPath);
}

function countScriptEcosystemLinks(chData, docPath) {
  const eco = chData?.projectLinks?.[docPath];
  if (!eco) return 0;
  return (
    (eco.boards?.length || 0) +
    (eco.recordings?.length || 0) +
    (eco.notes?.length || 0) +
    (eco.curadoria?.length || 0) +
    (eco.kdenlive?.length || 0)
  );
}

function getVisibleScriptsForList() {
  const chData = getActiveChannelData();
  const docs = chData.docs || [];
  const q = String(state.scriptsSearch || '').trim().toLowerCase();
  const stFilter = state.scriptsStatusFilter || 'all';
  const folderFilter = state.scriptsFolderFilter || 'all';
  const filtered = docs.filter((d) => {
    if (stFilter !== 'all' && d.meta.status !== stFilter) return false;
    if (folderFilter !== 'all' && d.topFolder !== folderFilter) return false;
    if (q) {
      const hay = `${d.meta.titulo} ${d.path} ${d.meta.serie} ${d.meta.resumo} ${(d.meta.tags || []).join(' ')}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  return { chData, allDocs: docs, filtered, ch: chData.key || state.activeChannel };
}

function renderScriptsListCardsHtml(chData, allDocs, filtered, ch) {
  const layout = state.prefs?.scriptsLayout === 'list' ? 'list' : 'grid';
  if (allDocs.length === 0) {
    return `
      <div class="glass-card wb-empty-state">
        <div class="wb-empty-icon">📄</div>
        <h3 style="margin:0; font-size:17px;">Nenhum roteiro ou documento .md neste workspace</h3>
        <p style="margin:0; max-width:520px; color:var(--text-2); font-size:13px;">
          Crie seu primeiro roteiro, short ou ideia em Markdown com versionamento automático em <code>.roteiro-git/</code>.
        </p>
        <div class="wb-empty-actions">
          <button type="button" class="btn-sm btn-accent" id="scriptsEmptyCreateBtn">+ Novo Roteiro</button>
          <button type="button" class="btn-sm" id="scriptsEmptyShortBtn">+ Novo Short</button>
        </div>
      </div>
    `;
  }
  if (filtered.length === 0) {
    return `
      <div class="glass-card wb-empty-state" style="padding:28px 20px;">
        <h3 style="margin:0; font-size:15px;">Nenhum roteiro encontrado para esse filtro</h3>
        <p style="margin:0; color:var(--text-3); font-size:12.5px;">Tente outro termo de busca ou altere os filtros de status e pasta.</p>
        <div class="wb-empty-actions">
          <button type="button" class="btn-sm" id="scriptsClearFiltersBtn">Limpar Filtros</button>
        </div>
      </div>
    `;
  }

  const wrapClass = layout === 'list' ? 'wb-boards-list' : 'wb-boards-grid';
  const cardExtraClass = layout === 'list' ? ' is-list-row' : '';
  const cardsHtml = filtered
    .map((d) => {
      const st = d.meta.status || 'ideia';
      const vis = STATUS_VISUAL[st] || STATUS_VISUAL.ideia;
      const ecoCount = countScriptEcosystemLinks(chData, d.path);
      const revBadge = d.versioning?.headRev ? `Git ${d.versioning.headRev}` : '';
      const hasMultiVersions = Number(d.versioning?.versionsCount || 1) > 1;
      const defaultVerBadge = hasMultiVersions
        ? `★ ${formatVersionLabel(d.versioning?.defaultVersion || 'principal')}`
        : '';
      const ctxUrl = `/${ch}/roteiros/${d.path}`;
      const words = Number(d.stats?.words || 0);
      return `
        <article class="wb-board-card${cardExtraClass}" data-open-script-card="${MD.escapeHtml(d.path)}" data-open-doc="${MD.escapeHtml(d.path)}" data-context-url="${MD.escapeHtml(ctxUrl)}" tabindex="0" role="button" aria-label="Abrir roteiro ${MD.escapeHtml(d.meta.titulo || d.path)}">
          <div class="wb-board-card-main">
            <div class="wb-board-card-top">
              <h3 class="wb-board-title">${MD.escapeHtml(d.meta.titulo || d.filename || d.path)}</h3>
              <span class="status-pill st-${MD.escapeHtml(st)}">${MD.escapeHtml(vis.label)}</span>
            </div>
            <div class="wb-board-slug-row">
              <span class="wb-board-file">${MD.escapeHtml(d.path)}</span>
              ${d.meta.serie ? `<span class="tag-pill">${MD.escapeHtml(d.meta.serie)}</span>` : ''}
              ${revBadge ? `<span class="tag-pill">${MD.escapeHtml(revBadge)}</span>` : ''}
              ${defaultVerBadge ? `<span class="tag-pill ver-card-default-pill" title="Versão configurada para abrir primeiro (${d.versioning.versionsCount} versões)">${MD.escapeHtml(defaultVerBadge)}</span>` : ''}
            </div>
            ${d.meta.resumo ? `<p class="script-card-summary">${MD.escapeHtml(d.meta.resumo)}</p>` : ''}
            <div class="wb-board-meta">
              <span>${formatNumber(words)} pal. • ~${d.stats?.speakMinutes || 1} min</span>
              ${d.meta.duracao_estimada ? `<span>• Alvo ${MD.escapeHtml(d.meta.duracao_estimada)}</span>` : ''}
              ${ecoCount > 0 ? `<span>• 🔗 ${ecoCount} vínculo${ecoCount === 1 ? '' : 's'}</span>` : ''}
            </div>
          </div>
          <div class="wb-board-actions">
            <button type="button" class="btn-sm btn-accent" data-sc-open="${MD.escapeHtml(d.path)}">Abrir</button>
            <button type="button" class="btn-sm" data-sc-edit="${MD.escapeHtml(d.path)}">Editar</button>
            <button type="button" class="btn-sm" data-sc-prompter="${MD.escapeHtml(d.path)}">Teleprompter</button>
            <button type="button" class="btn-sm" data-sc-record="${MD.escapeHtml(d.path)}">🎙️ Gravar</button>
          </div>
        </article>
      `;
    })
    .join('');

  return `<div class="${wrapClass}">${cardsHtml}</div>`;
}

function bindScriptsListCardEvents(rootEl, container) {
  if (!rootEl) return;
  rootEl.querySelectorAll('.wb-board-card[data-open-script-card]').forEach((card) => {
    card.onclick = (e) => {
      if (e.ctrlKey || e.metaKey || e.target.closest('button, a, input, select')) return;
      openScriptFromList(card.dataset.openScriptCard, 'read');
    };
    card.onkeydown = (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && e.target === card) {
        e.preventDefault();
        openScriptFromList(card.dataset.openScriptCard, 'read');
      }
    };
  });
  rootEl.querySelectorAll('[data-sc-open]').forEach((btn) => {
    btn.onclick = (e) => {
      e.stopPropagation();
      openScriptFromList(btn.dataset.scOpen, 'read');
    };
  });
  rootEl.querySelectorAll('[data-sc-edit]').forEach((btn) => {
    btn.onclick = (e) => {
      e.stopPropagation();
      openScriptFromList(btn.dataset.scEdit, 'edit');
    };
  });
  rootEl.querySelectorAll('[data-sc-prompter]').forEach((btn) => {
    btn.onclick = (e) => {
      e.stopPropagation();
      openScriptFromList(btn.dataset.scPrompter, 'prompter');
    };
  });
  rootEl.querySelectorAll('[data-sc-record]').forEach((btn) => {
    btn.onclick = (e) => {
      e.stopPropagation();
      setView('recorder', null, { roteiroPath: btn.dataset.scRecord });
    };
  });
  document.getElementById('scriptsEmptyCreateBtn')?.addEventListener('click', () => openNewDocModal());
  document.getElementById('scriptsEmptyShortBtn')?.addEventListener('click', () => {
    openNewDocModal({ type: 'short', serie: 'Shorts & Cortes', folder: '03-shorts' });
  });
  document.getElementById('scriptsClearFiltersBtn')?.addEventListener('click', () => {
    state.scriptsSearch = '';
    state.scriptsStatusFilter = 'all';
    state.scriptsFolderFilter = 'all';
    renderScriptsListView(container);
  });
}

function updateScriptsListBodyOnly(container) {
  const bodyEl = document.getElementById('scriptsCardsContainer');
  if (!bodyEl) return;
  const { chData, allDocs, filtered, ch } = getVisibleScriptsForList();
  bodyEl.innerHTML = renderScriptsListCardsHtml(chData, allDocs, filtered, ch);
  bindScriptsListCardEvents(bodyEl, container);
}

export function renderScriptsListView(container) {
  if (!container) return;
  const { chData, allDocs, filtered, ch } = getVisibleScriptsForList();
  const chName = chData.channel?.name || ch;
  const inProdCount = allDocs.filter((d) => ['roteiro', 'gravando', 'edicao'].includes(d.meta.status)).length;
  const totalWords = allDocs.reduce((acc, d) => acc + Number(d.stats?.words || 0), 0);
  const foldersList = Array.from(new Set(allDocs.map((d) => d.topFolder))).sort();
  const layout = state.prefs?.scriptsLayout === 'list' ? 'list' : 'grid';

  container.innerHTML = `
    <section class="wb-list-page" id="scriptsListPage">
      <div class="glass-card wb-list-header">
        <div class="wb-list-head-top">
          <div>
            <h2 style="margin:0; font-size:20px;">Lista de Roteiros • ${MD.escapeHtml(chName)}</h2>
            <p style="margin:4px 0 0; font-size:12.5px; color:var(--text-2);">
              Escolha um roteiro, ideia ou documento para abrir o leitor, editor, teleprompter ou histórico de revisões.
            </p>
          </div>
          <div class="wb-list-kpis" id="scriptsListKpis">
            <span class="wb-kpi-pill"><strong>${formatNumber(allDocs.length)}</strong> arquivo${allDocs.length === 1 ? '' : 's'} .md</span>
            <span class="wb-kpi-pill"><strong>${formatNumber(inProdCount)}</strong> em produção</span>
            <span class="wb-kpi-pill"><strong>${formatNumber(totalWords)}</strong> palavras</span>
          </div>
        </div>

        <div class="wb-list-toolbar">
          <div class="wb-list-filters">
            <input type="search" class="search-box-sm wb-list-search" id="scriptsListSearch" placeholder="Buscar por título, série, pasta ou tag..." value="${MD.escapeHtml(state.scriptsSearch || '')}">
            <select class="script-list-select" id="scriptsListStatusFilter" aria-label="Filtrar por status">
              <option value="all"${state.scriptsStatusFilter === 'all' ? ' selected' : ''}>Status: Todos</option>
              <option value="ideia"${state.scriptsStatusFilter === 'ideia' ? ' selected' : ''}>Ideia</option>
              <option value="pesquisa"${state.scriptsStatusFilter === 'pesquisa' ? ' selected' : ''}>Pesquisa</option>
              <option value="roteiro"${state.scriptsStatusFilter === 'roteiro' ? ' selected' : ''}>Roteiro</option>
              <option value="gravando"${state.scriptsStatusFilter === 'gravando' ? ' selected' : ''}>Gravando</option>
              <option value="edicao"${state.scriptsStatusFilter === 'edicao' ? ' selected' : ''}>Edição</option>
              <option value="publicado"${state.scriptsStatusFilter === 'publicado' ? ' selected' : ''}>Publicado</option>
              <option value="referencia"${state.scriptsStatusFilter === 'referencia' ? ' selected' : ''}>Referência</option>
            </select>
            <select class="script-list-select" id="scriptsListFolderFilter" aria-label="Filtrar por pasta">
              <option value="all"${state.scriptsFolderFilter === 'all' ? ' selected' : ''}>Pasta: Todas</option>
              ${foldersList.map((f) => `<option value="${MD.escapeHtml(f)}"${state.scriptsFolderFilter === f ? ' selected' : ''}>${MD.escapeHtml(f)}</option>`).join('')}
            </select>
            <div class="mode-switch" id="scriptsLayoutSwitch" aria-label="Alternar visualização Lista ou Grade">
              <button type="button" data-sc-layout="list" class="${layout === 'list' ? 'active' : ''}">☰ Lista</button>
              <button type="button" data-sc-layout="grid" class="${layout === 'grid' ? 'active' : ''}">▦ Grade</button>
            </div>
          </div>

          <div class="wb-list-actions">
            <button type="button" class="btn-sm btn-accent" id="scriptsListNewBtn">+ Novo Roteiro</button>
            <button type="button" class="btn-sm" id="scriptsListNewShortBtn">+ Novo Short</button>
          </div>
        </div>
      </div>

      <div id="scriptsCardsContainer">
        ${renderScriptsListCardsHtml(chData, allDocs, filtered, ch)}
      </div>
    </section>
  `;

  const searchInp = document.getElementById('scriptsListSearch');
  if (searchInp) {
    searchInp.oninput = () => {
      state.scriptsSearch = searchInp.value;
      updateScriptsListBodyOnly(container);
    };
  }
  const stSel = document.getElementById('scriptsListStatusFilter');
  if (stSel) {
    stSel.onchange = () => {
      state.scriptsStatusFilter = stSel.value;
      updateScriptsListBodyOnly(container);
    };
  }
  const fldSel = document.getElementById('scriptsListFolderFilter');
  if (fldSel) {
    fldSel.onchange = () => {
      state.scriptsFolderFilter = fldSel.value;
      updateScriptsListBodyOnly(container);
    };
  }
  container.querySelectorAll('#scriptsLayoutSwitch [data-sc-layout]').forEach((btn) => {
    btn.onclick = () => {
      const next = btn.dataset.scLayout === 'list' ? 'list' : 'grid';
      state.prefs = { ...(state.prefs || {}), scriptsLayout: next };
      const saved = loadJsonStorage(STORAGE_KEY_PREFS, {});
      saved.scriptsLayout = next;
      saveJsonStorage(STORAGE_KEY_PREFS, saved);
      container.querySelectorAll('#scriptsLayoutSwitch [data-sc-layout]').forEach((b) => b.classList.toggle('active', b === btn));
      updateScriptsListBodyOnly(container);
    };
  });

  document.getElementById('scriptsListNewBtn')?.addEventListener('click', () => openNewDocModal());
  document.getElementById('scriptsListNewShortBtn')?.addEventListener('click', () => {
    openNewDocModal({ type: 'short', serie: 'Shorts & Cortes', folder: '03-shorts' });
  });

  bindScriptsListCardEvents(document.getElementById('scriptsCardsContainer'), container);
}

export function renderScriptsView(container) {
  const chData = getActiveChannelData();
  const docs = chData.docs || [];
  const activeDoc = getActiveDoc();
  if (!activeDoc) {
    renderScriptsListView(container);
    return;
  }

  if (state.serverMode && activeDoc) {
    const expectedFetchKey = `${state.activeChannel}::${activeDoc.path}`;
    if (state.versionFetchedKey !== expectedFetchKey && !state.versionLoading) {
      loadVersionHistory(activeDoc.path);
    }
  }

  const filtered = docs.filter((d) => {
    if (state.scriptsStatusFilter !== 'all' && d.meta.status !== state.scriptsStatusFilter) return false;
    if (state.scriptsFolderFilter !== 'all' && d.topFolder !== state.scriptsFolderFilter) return false;
    if (state.scriptsSearch) {
      const q = state.scriptsSearch.toLowerCase();
      const hay = `${d.meta.titulo} ${d.path} ${d.meta.serie} ${d.meta.resumo} ${(d.meta.tags || []).join(' ')}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const foldersList = Array.from(new Set(docs.map((d) => d.topFolder))).sort();
  const seriesOptions = Array.from(
    new Set([...getChannelSeriesList(chData), activeDoc?.meta?.serie].filter(Boolean))
  );
  const currentMeta = state.dirtyMeta || activeDoc?.meta || {};
  const currentBody = state.dirtyBody !== null ? state.dirtyBody : activeDoc?.body || '';
  const liveStats = MD.analyzeStats(currentBody);

  let workspaceHtml = '<p style="padding:30px; color:var(--text-3);">Nenhum arquivo selecionado.</p>';
  let inspectorHtml = '<p style="color:var(--text-3); font-size:12px;">Nenhum documento selecionado.</p>';

  if (activeDoc) {
    let bodySectionHtml = '';
    if (state.versionContentLoading && state.docMode !== 'history') {
      bodySectionHtml = `
        <div class="doc-body-scroll">
          <p style="color:var(--text-3); padding:24px;">Carregando versão "${MD.escapeHtml(formatVersionLabel(state.activeVersion))}"...</p>
        </div>
      `;
    } else if (state.docMode === 'read') {
      bodySectionHtml = `
        <div class="doc-body-scroll" id="readerScroll">
          <article class="md-article" id="mdArticle" style="font-size:${state.readerFontSize}px;">
            ${MD.renderMarkdown(currentBody)}
          </article>
        </div>
      `;
    } else if (state.docMode === 'edit') {
      const shortcutsHtml = `
        <div class="editor-shortcuts">
          <button type="button" data-insert="\`[GANCHO]\` ">+ [GANCHO]</button>
          <button type="button" data-insert="\`[TELA]\` ">+ [TELA]</button>
          <button type="button" data-insert="\`[B-ROLL]\` ">+ [B-ROLL]</button>
          <button type="button" data-insert="\`[CORTE]\` ">+ [CORTE]</button>
          <button type="button" data-insert="\n00:00 — ">+ Timestamp</button>
          <button type="button" data-insert="\n- [ ] ">+ Checklist</button>
        </div>
      `;
      const textareaHtml = `<textarea class="md-textarea" id="mdEditorInput" spellcheck="true" style="font-size:${state.readerFontSize}px;">${MD.escapeHtml(currentBody)}</textarea>`;
      if (state.editorSplit) {
        bodySectionHtml = `
          <div class="editor-split">
            <div class="editor-pane">
              ${shortcutsHtml}
              ${textareaHtml}
            </div>
            <div class="preview-pane">
              <article class="md-article" id="mdLivePreview" style="font-size:${state.readerFontSize}px;">
                ${MD.renderMarkdown(currentBody)}
              </article>
            </div>
          </div>
        `;
      } else {
        bodySectionHtml = `
          <div class="editor-single-pane">
            ${shortcutsHtml}
            ${textareaHtml}
          </div>
        `;
      }
    } else if (state.docMode === 'history') {
      bodySectionHtml = renderHistoryDiffTab(activeDoc);
    } else {
      bodySectionHtml = `
        <div class="prompter-wrap">
          <div class="prompter-controls">
            <div class="prompter-ctrl-group">
              <button type="button" class="btn-sm btn-accent" id="prompterPlayBtn">${state.prompter.playing ? '⏸ Pausar (Espaço)' : '▶ Iniciar Rolagem'}</button>
              <button type="button" class="btn-sm" id="prompterResetBtn">↺ Topo</button>
            </div>
            <div class="prompter-ctrl-group">
              <label>Velocidade <strong id="prompterSpeedVal" style="min-width:34px; display:inline-block; text-align:right;">${Number(state.prompter.speed).toFixed(1)}x</strong> <input type="range" id="prompterSpeed" min="0.1" max="8" step="0.1" value="${state.prompter.speed}"></label>
              <label>Fonte <input type="range" id="prompterSize" min="22" max="54" step="2" value="${state.prompter.fontSize}"></label>
              <button type="button" class="btn-sm" id="prompterMirrorBtn">${state.prompter.mirrored ? '⇄ Normal' : '⇄ Espelhar'}</button>
            </div>
          </div>
          <div class="prompter-stage${state.prompter.mirrored ? ' is-mirrored' : ''}" id="prompterStage">
            <div class="prompter-guide"></div>
            <div class="prompter-text md-article" id="prompterText" style="font-size:${state.prompter.fontSize}px;">
              ${MD.renderMarkdown(currentBody)}
            </div>
          </div>
        </div>
      `;
    }

    const defaultVersion = getDocDefaultVersion(state.activeChannel, activeDoc.path);
    const fallbackVerNames = Array.isArray(activeDoc.versioning?.versions) && activeDoc.versioning.versions.length
      ? activeDoc.versioning.versions
      : ['principal'];
    const versions = state.versionHistory?.versions || fallbackVerNames.map((name) => ({
      name,
      description: name === 'principal' ? 'Arquivo .md base no workspace' : '',
      isPrimary: name === 'principal',
      isDefault: name === defaultVersion,
      headRev: name === 'principal' ? activeDoc.versioning?.headRev || null : null,
    }));
    const activeVerName = state.activeVersion || 'principal';
    const isActiveDefault = activeVerName === defaultVersion;
    const hasMultipleVersions = versions.length > 1;
    const versionBarHtml = hasMultipleVersions
      ? `
        <div class="version-bar">
          <div class="version-bar-pills" role="tablist" aria-label="Versões do roteiro">
            ${versions
              .map((v) => {
                const isAct = v.name === activeVerName;
                const isDef = v.name === defaultVersion;
                const label = formatVersionLabel(v.name);
                const desc = formatVersionDescription(v);
                return `
                  <button type="button" class="ver-bar-pill${isAct ? ' is-active' : ''}${isDef ? ' is-default' : ''}" data-switch-version="${MD.escapeHtml(v.name)}" role="tab" aria-selected="${isAct ? 'true' : 'false'}" title="${MD.escapeHtml(desc || label)}${isDef ? ' • Abre primeiro' : ''}">
                    <span class="ver-chip-dot"></span>
                    <span>${MD.escapeHtml(label)}</span>
                    ${isDef ? '<span class="ver-star-tag" title="Abre primeiro">★</span>' : ''}
                  </button>
                `;
              })
              .join('')}
          </div>
          <div class="version-bar-actions">
            ${isActiveDefault
              ? '<span class="ver-default-badge" title="Esta versão abre automaticamente ao abrir este roteiro">★ Abre primeiro</span>'
              : `<button type="button" class="btn-sm ver-set-default-btn" id="varSetDefaultBtn" data-set-default-version="${MD.escapeHtml(activeVerName)}" title="Definir esta versão para abrir primeiro automaticamente">★ Abrir primeiro</button>`
            }
            <button type="button" class="btn-sm" id="varCompareBtn">Comparar</button>
            ${activeVerName !== 'principal'
              ? `
                <button type="button" class="btn-sm" id="varPromoteBtn" title="Copiar o conteúdo desta versão para o arquivo .md Base em disco">Aplicar na Base</button>
                <button type="button" class="btn-sm btn-danger" id="varDeleteBtn">Excluir</button>
              `
              : ''}
          </div>
        </div>
      `
      : '';

    workspaceHtml = `
      <div class="doc-toolbar-clean">
        <div style="display:flex; align-items:center; gap:8px; min-width:0; flex-wrap:wrap;">
          <button type="button" class="btn-sm" id="scriptsBackToListBtn" title="Voltar para a lista de roteiros">← Roteiros</button>
          <button type="button" class="icon-btn-sm${!state.scriptsListCollapsed ? ' is-active' : ''}" id="toggleListBtn" title="Mostrar/ocultar lista de roteiros">◧</button>
          <span class="doc-path-chip" title="${MD.escapeHtml(activeDoc.path)}">${MD.escapeHtml(activeDoc.path)}${state.hasUnsavedEdits ? ' •' : ''}</span>
          <div class="mode-switch" id="docModeSwitch">
            <button type="button" class="${state.docMode === 'read' ? 'active' : ''}" data-doc-mode="read">Ler</button>
            <button type="button" class="${state.docMode === 'edit' ? 'active' : ''}" data-doc-mode="edit">Editar</button>
            <button type="button" class="${state.docMode === 'prompter' ? 'active' : ''}" data-doc-mode="prompter">Teleprompter</button>
            <button type="button" class="${state.docMode === 'history' ? 'active' : ''}" data-doc-mode="history">Histórico & Diff</button>
          </div>
        </div>
        <div class="doc-actions">
          <div class="zoom-group" title="Tamanho da fonte no leitor e editor">
            <button type="button" id="fontMinusBtn">A-</button>
            <span id="fontZoomVal">${state.readerFontSize}px</span>
            <button type="button" id="fontPlusBtn">A+</button>
          </div>
          ${state.docMode === 'read' ? `
            <div class="zoom-group" title="Leitura em voz alta pelo navegador com destaque no texto">
              <button type="button" id="speechToggleBtn">🔊 Ouvir</button>
              <button type="button" id="speechRateBtn" title="Velocidade da fala">${speechState.rate}x</button>
              <button type="button" id="speechStopBtn" title="Parar leitura" style="display:${speechState.active ? '' : 'none'};">⏹</button>
            </div>
          ` : ''}
          ${state.docMode === 'edit' ? `<button type="button" class="icon-btn-sm${state.editorSplit ? ' is-active' : ''}" id="toggleSplitBtn" title="Alternar entre Editor Split e Painel Único">${state.editorSplit ? '⫿ Split' : '▭ Único'}</button>` : ''}
          <button type="button" class="icon-btn-sm${state.focusMode ? ' is-active' : ''}" id="toggleFocusBtn" title="Modo Foco (Esc para sair)">⛶</button>
          <button type="button" class="btn-sm btn-accent" id="saveDocBtn">Salvar${state.hasUnsavedEdits ? ' •' : ''} (Ctrl+S)</button>
          <button type="button" class="icon-btn-sm${!state.inspectorCollapsed ? ' is-active' : ''}" id="toggleInspectorBtn" title="Mostrar/ocultar inspetor direito">◨</button>
        </div>
      </div>
      ${versionBarHtml}
      ${bodySectionHtml}
    `;

    const isProtected = activeDoc.path === 'AGENTS.md' || activeDoc.path === 'README.md';
    const recentRevs = (state.versionHistory?.revisions || []).slice(0, 3);
    const versionRowsHtml = versions
      .map((v) => {
        const isAct = v.name === activeVerName;
        const isDef = v.name === defaultVersion;
        const label = formatVersionLabel(v.name);
        const desc = formatVersionDescription(v);
        return `
          <div class="ver-row-item${isAct ? ' is-active' : ''}${isDef ? ' is-default' : ''}">
            <button type="button" class="ver-row-main" data-switch-version="${MD.escapeHtml(v.name)}" title="${MD.escapeHtml(desc || label)}">
              <span class="ver-chip-dot"></span>
              <span class="ver-row-name">${MD.escapeHtml(label)}</span>
              ${v.headRev ? `<small class="ver-row-rev">${MD.escapeHtml(v.headRev)}</small>` : ''}
            </button>
            ${isDef
              ? '<span class="ver-default-pill" title="Abre primeiro ao abrir este roteiro">★ Abre primeiro</span>'
              : `<button type="button" class="ver-make-default-btn" data-set-default-version="${MD.escapeHtml(v.name)}" title="Definir ${MD.escapeHtml(label)} para abrir primeiro">☆ Abrir primeiro</button>`
            }
          </div>
        `;
      })
      .join('');

    const recentCommitsHtml = state.serverMode
      ? recentRevs.length
        ? recentRevs
            .map(
              (r) => `
                <button type="button" class="insp-rev-row" data-insp-rev="${MD.escapeHtml(r.id)}">
                  <div style="display:flex; justify-content:space-between; gap:6px; font-family:var(--font-mono); font-size:10.5px;">
                    <strong>${MD.escapeHtml(r.id)}</strong>
                    <span style="color:var(--accent);">${MD.escapeHtml(formatVersionLabel(r.version))}</span>
                    <span style="color:var(--text-3);">${formatDatePt(String(r.createdAt || '').slice(0, 10))}</span>
                  </div>
                  <div style="color:var(--text-2); margin-top:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${MD.escapeHtml(r.message || '')}</div>
                </button>
              `
            )
            .join('')
        : '<span style="font-size:11px; color:var(--text-3);">Sem commits gravados ainda.</span>'
      : '<span style="font-size:11px; color:var(--text-3);">Conecte via servidor local para versionamento Git.</span>';

    // v5: Ecossistema Conectado do Roteiro
    const eco = chData.projectLinks?.[activeDoc.path] || {
      boards: [],
      recordings: [],
      narrations: [],
      notes: [],
      curadoria: [],
      kdenlive: [],
    };
    const ecoRecordings = eco.recordings || [];
    const ecoNarrations = eco.narrations || [];
    const ecoBoards = eco.boards || [];
    const ecoNotes = eco.notes || [];
    const ecoCuradoria = eco.curadoria || [];
    const ecoKdenlive = eco.kdenlive || [];
    const ecoTotalLinks =
      ecoRecordings.length + ecoNarrations.length + ecoBoards.length + ecoNotes.length + ecoCuradoria.length + ecoKdenlive.length;

    const ecosystemHtml = `
      <div class="insp-section" id="inspEcosystemCard">
        <div class="insp-title-row">
          <span class="insp-title">Ecossistema do Projeto</span>
          <span style="font-family:var(--font-mono); font-size:10px; color:var(--text-3);">${ecoTotalLinks} vínculo(s)</span>
        </div>

        <div style="display:flex; flex-direction:column; gap:6px;">
          <button type="button" class="btn-sm insp-eco-cta" id="ecoNarrateScriptBtn">🔊 Narrar este roteiro</button>
          <button type="button" class="btn-sm insp-eco-cta" id="ecoRecordScriptBtn">🎙️ Gravar este roteiro</button>
          <button type="button" class="btn-sm" id="ecoBoardActionBtn" style="width:100%; justify-content:center;">${ecoBoards.length ? '✎ Abrir Quadro Vinculado' : '✎ Criar Quadro deste Roteiro'}</button>
        </div>

        ${ecoNarrations.length
          ? `<div class="insp-eco-group">
              <div class="insp-eco-subhead"><span>🔊 Narrações</span><span>${ecoNarrations.length}</span></div>
              <div class="insp-eco-list">
                ${ecoNarrations
                  .map(
                    (nar) => `
                      <div class="insp-eco-nar-card">
                        <div style="display:flex; justify-content:space-between; gap:6px; align-items:center;">
                          <span class="insp-eco-item-title">${MD.escapeHtml(nar.title || nar.id)}</span>
                          <span class="insp-eco-item-meta">${MD.escapeHtml(formatVersionLabel(nar.docVersion))}</span>
                        </div>
                        <audio controls preload="none" src="/api/tts/media?channel=${encodeURIComponent(chData.key)}&path=${encodeURIComponent(nar.relPath)}" style="width:100%; height:28px; margin-top:4px;"></audio>
                      </div>
                    `
                  )
                  .join('')}
              </div>
            </div>`
          : ''}

        ${ecoRecordings.length
          ? `<div class="insp-eco-group">
              <div class="insp-eco-subhead"><span>🎙️ Gravações</span><span>${ecoRecordings.length}</span></div>
              <div class="insp-eco-list">
                ${ecoRecordings
                  .map(
                    (rec) => `
                      <button type="button" class="insp-eco-item" data-eco-rec="${MD.escapeHtml(rec.sessionId)}">
                        <span class="insp-eco-item-title">${MD.escapeHtml(rec.title || rec.sessionId)} (${MD.escapeHtml(rec.takeId || 'take')})</span>
                        <span class="insp-eco-item-meta">${Number(rec.tracksCount || 0)} faixas</span>
                      </button>
                    `
                  )
                  .join('')}
              </div>
            </div>`
          : ''}

        ${ecoBoards.length
          ? `<div class="insp-eco-group">
              <div class="insp-eco-subhead"><span>✎ Quadros Excalidraw</span><span>${ecoBoards.length}</span></div>
              <div class="insp-eco-list">
                ${ecoBoards
                  .map(
                    (b) => `
                      <button type="button" class="insp-eco-item" data-eco-board="${MD.escapeHtml(b.id)}">
                        <span class="insp-eco-item-title">${MD.escapeHtml(b.title || b.id)}</span>
                        <span class="insp-eco-item-meta">${MD.escapeHtml(b.preferredMode || 'board')}</span>
                      </button>
                    `
                  )
                  .join('')}
              </div>
            </div>`
          : ''}

        ${ecoNotes.length
          ? `<div class="insp-eco-group">
              <div class="insp-eco-subhead"><span>📝 Notas Keep</span><span>${ecoNotes.length}</span></div>
              <div class="insp-eco-list">
                ${ecoNotes
                  .map(
                    (n) => `
                      <button type="button" class="insp-eco-item" data-eco-note="${MD.escapeHtml(n.id)}">
                        <span class="insp-eco-item-title">${MD.escapeHtml(n.title || 'Nota rápida')}</span>
                        <span class="insp-eco-item-meta">${MD.escapeHtml(n.color || 'keep')}</span>
                      </button>
                    `
                  )
                  .join('')}
              </div>
            </div>`
          : ''}

        ${ecoCuradoria.length
          ? `<div class="insp-eco-group">
              <div class="insp-eco-subhead"><span>🎬 Vídeos / Curadoria</span><span>${ecoCuradoria.length}</span></div>
              <div class="insp-eco-list">
                ${ecoCuradoria
                  .map(
                    (v) => `
                      <button type="button" class="insp-eco-item" data-eco-curadoria="${MD.escapeHtml(v.videoId)}" data-eco-source="${MD.escapeHtml(v.source || '')}">
                        <span class="insp-eco-item-title">${MD.escapeHtml(v.title || v.playlistTitle || v.videoId)}</span>
                        <span class="insp-eco-item-meta">${MD.escapeHtml(v.source === 'playlist' ? 'playlist' : 'vídeo')}</span>
                      </button>
                    `
                  )
                  .join('')}
              </div>
            </div>`
          : ''}

        ${ecoKdenlive.length
          ? `<div class="insp-eco-group">
              <div class="insp-eco-subhead"><span>🎞 Kdenlive</span><span>${ecoKdenlive.length}</span></div>
              <div class="insp-eco-list">
                ${ecoKdenlive
                  .map(
                    (k) => `
                      <button type="button" class="insp-eco-item" data-eco-kdenlive="${MD.escapeHtml(k.slug)}">
                        <span class="insp-eco-item-title">${MD.escapeHtml(k.title || k.slug)}</span>
                        <span class="insp-eco-item-meta">${k.hasRender ? 'render' : k.hasProgress ? 'progresso' : 'projeto'}</span>
                      </button>
                    `
                  )
                  .join('')}
              </div>
            </div>`
          : ''}

        ${ecoTotalLinks === 0
          ? '<span style="font-size:11px; color:var(--text-3); line-height:1.45;">Nenhum item ligado ainda. Grave um take ou crie um quadro a partir deste roteiro.</span>'
          : ''}
      </div>
    `;

    inspectorHtml = `
      <div class="insp-section">
        <div class="insp-title-row">
          <span class="insp-title">Metadados</span>
          <span class="status-pill st-${MD.escapeHtml(currentMeta.status || 'ideia')}">${MD.escapeHtml(currentMeta.status || 'ideia')}</span>
        </div>
        <div class="insp-meta-grid">
          <div class="fm-field fm-field-full">
            <label>Título</label>
            <input type="text" data-fm="titulo" value="${MD.escapeHtml(currentMeta.titulo || '')}">
          </div>
          <div class="fm-field">
            <label>Status</label>
            <select data-fm="status">
              ${['ideia', 'pesquisa', 'roteiro', 'gravando', 'edicao', 'publicado', 'referencia', 'template', 'arquivado']
                .map((st) => `<option value="${st}"${currentMeta.status === st ? ' selected' : ''}>${st}</option>`)
                .join('')}
            </select>
          </div>
          <div class="fm-field">
            <label>Série</label>
            <select data-fm="serie">
              ${seriesOptions
                .map((sr) => `<option value="${MD.escapeHtml(sr)}"${currentMeta.serie === sr ? ' selected' : ''}>${MD.escapeHtml(sr)}</option>`)
                .join('')}
            </select>
          </div>
          <div class="fm-field">
            <label>Duração Est.</label>
            <input type="text" data-fm="duracao_estimada" value="${MD.escapeHtml(currentMeta.duracao_estimada || '')}">
          </div>
          <div class="fm-field">
            <label>Data Alvo</label>
            <input type="date" data-fm="data_alvo" value="${MD.escapeHtml(currentMeta.data_alvo || '')}">
          </div>
        </div>
        <div class="insp-stats-row" id="inspStatsRow">
          <span>${formatNumber(liveStats.words)} pal.</span>
          <span>~${liveStats.speakMinutes} min fala</span>
          <span>${liveStats.checksDone}/${liveStats.checksTotal} checks</span>
        </div>
      </div>

      ${ecosystemHtml}

      <div class="insp-section">
        <div class="insp-title-row">
          <span class="insp-title">Versões do Roteiro</span>
          <button type="button" class="kc-move-btn" id="inspNewVersionBtn">+ Nova Versão</button>
        </div>
        <div class="version-list-insp">${versionRowsHtml}</div>
        ${hasMultipleVersions
          ? `
            <div class="insp-actions-stack" style="margin-top:8px;">
              ${!isActiveDefault
                ? `<button type="button" class="btn-sm ver-set-default-btn" id="inspSetDefaultVerBtn" data-set-default-version="${MD.escapeHtml(activeVerName)}" style="grid-column: 1 / -1;">★ Definir como inicial</button>`
                : ''}
              <button type="button" class="btn-sm" id="inspCompareVarBtn"${activeVerName === 'principal' ? ' style="grid-column: 1 / -1;"' : ''}>Comparar</button>
              ${activeVerName !== 'principal'
                ? '<button type="button" class="btn-sm btn-accent" id="inspPromoteVarBtn" title="Copiar o conteúdo desta versão para o arquivo .md Base em disco">Aplicar na Base</button>'
                : ''}
            </div>
          `
          : ''}
      </div>

      <div class="insp-section">
        <div class="insp-title-row">
          <span class="insp-title">Git do Roteiro</span>
          <button type="button" class="kc-move-btn" id="inspOpenHistoryBtn">Histórico ↗</button>
        </div>
        <input type="text" class="search-box-sm" id="inspCommitMsgInput" placeholder="Mensagem do commit..." value="${MD.escapeHtml(state.commitMessageDraft || '')}" style="height:31px; font-size:11.5px; margin-bottom:6px;">
        <button type="button" class="btn-sm btn-accent" id="inspCommitSaveBtn" style="width:100%; justify-content:center;">Salvar Commit</button>
        <div class="insp-rev-mini">${recentCommitsHtml}</div>
      </div>

      <div class="insp-section">
        <div class="insp-title-row">
          <span class="insp-title">Ações & Produção</span>
        </div>
        <div class="insp-actions-stack">
          <button type="button" class="btn-sm btn-kdenlive" id="produceKdenliveBtn" style="grid-column: 1 / -1;">▶ Produzir no Kdenlive</button>
          <button type="button" class="btn-sm" id="copyPromptDocBtn">Prompt Agente</button>
          <button type="button" class="btn-sm" id="downloadDocBtn">Baixar .md</button>
          ${isProtected ? '' : '<button type="button" class="btn-sm btn-danger" id="deleteDocBtn" style="grid-column: 1 / -1;">Mover para Lixeira</button>'}
        </div>
      </div>
    `;
  }

  container.innerHTML = `
    <section class="scripts-layout${state.scriptsListCollapsed ? ' is-list-collapsed' : ''}${state.inspectorCollapsed ? ' is-inspector-collapsed' : ''}">
      <aside class="scripts-sidebar">
        <input type="search" class="search-box-sm" id="scriptsSearchInput" placeholder="Filtrar arquivos .md..." value="${MD.escapeHtml(state.scriptsSearch)}">
        <div class="scripts-filter-row">
          <select class="select-dark" id="scriptsStatusSel" style="height:30px; font-size:11px;">
            <option value="all"${state.scriptsStatusFilter === 'all' ? ' selected' : ''}>Status: Todos</option>
            <option value="gravando"${state.scriptsStatusFilter === 'gravando' ? ' selected' : ''}>Gravando</option>
            <option value="edicao"${state.scriptsStatusFilter === 'edicao' ? ' selected' : ''}>Edição</option>
            <option value="roteiro"${state.scriptsStatusFilter === 'roteiro' ? ' selected' : ''}>Roteiro</option>
            <option value="ideia"${state.scriptsStatusFilter === 'ideia' ? ' selected' : ''}>Ideia</option>
            <option value="pesquisa"${state.scriptsStatusFilter === 'pesquisa' ? ' selected' : ''}>Pesquisa</option>
            <option value="publicado"${state.scriptsStatusFilter === 'publicado' ? ' selected' : ''}>Publicado</option>
            <option value="referencia"${state.scriptsStatusFilter === 'referencia' ? ' selected' : ''}>Referência</option>
            <option value="template"${state.scriptsStatusFilter === 'template' ? ' selected' : ''}>Template</option>
          </select>
          <select class="select-dark" id="scriptsFolderSel" style="height:30px; font-size:11px;">
            <option value="all"${state.scriptsFolderFilter === 'all' ? ' selected' : ''}>Pasta: Todas</option>
            ${foldersList.map((f) => `<option value="${MD.escapeHtml(f)}"${state.scriptsFolderFilter === f ? ' selected' : ''}>${MD.escapeHtml(f)}</option>`).join('')}
          </select>
        </div>

        <div class="doc-list">
          ${filtered
            .map(
              (d) => `
                <button type="button" class="doc-list-item${activeDoc && d.path === activeDoc.path ? ' active' : ''}" data-select-doc="${MD.escapeHtml(d.path)}">
                  <div class="dli-top">
                    <span class="status-pill st-${MD.escapeHtml(d.meta.status)}">${MD.escapeHtml(d.meta.status)}</span>
                    <span style="font-family:var(--font-mono); font-size:10px; color:var(--text-3);">${d.stats.words} pal.</span>
                  </div>
                  <span class="dli-title">${MD.escapeHtml(d.meta.titulo)}</span>
                  <div class="dli-meta">
                    <span>${MD.escapeHtml(d.folder)}</span>
                    <span>${MD.escapeHtml(d.meta.serie)}</span>
                  </div>
                </button>
              `
            )
            .join('') || '<p style="color:var(--text-3); padding:14px;">Nada encontrado.</p>'}
        </div>
      </aside>

      <div class="doc-workspace">
        ${workspaceHtml}
      </div>

      <aside class="doc-inspector">
        ${inspectorHtml}
      </aside>
    </section>
  `;

  const searchEl = document.getElementById('scriptsSearchInput');
  if (searchEl) {
    searchEl.oninput = () => {
      state.scriptsSearch = searchEl.value;
      const pos = searchEl.selectionStart;
      renderScriptsView(container);
      const again = document.getElementById('scriptsSearchInput');
      if (again) {
        again.focus();
        again.setSelectionRange(pos, pos);
      }
    };
  }
  const stSel = document.getElementById('scriptsStatusSel');
  if (stSel) stSel.onchange = () => { state.scriptsStatusFilter = stSel.value; renderScriptsView(container); };
  const flSel = document.getElementById('scriptsFolderSel');
  if (flSel) flSel.onchange = () => { state.scriptsFolderFilter = flSel.value; renderScriptsView(container); };

  container.querySelectorAll('[data-select-doc]').forEach((btn) => {
    btn.onclick = () => {
      if (
        state.hasUnsavedEdits &&
        btn.dataset.selectDoc !== state.selectedDocPath &&
        !confirm('Você tem alterações não salvas neste documento. Descartar e abrir o outro arquivo?')
      ) {
        return;
      }
      stopPrompter();
      stopBrowserSpeech();
      const nextDocPath = btn.dataset.selectDoc;
      const nextInitialVer = getDocDefaultVersion(state.activeChannel, nextDocPath);
      state.selectedDocPath = nextDocPath;
      state.activeVersion = nextInitialVer;
      state.versionExplicit = false;
      state.versionContentLoading = Boolean(state.serverMode && nextInitialVer !== 'principal');
      state.loadedVersionKey = '';
      state.versionHistory = null;
      state.versionFetchedKey = '';
      state.diffDocPath = '';
      state.diffFromRef = null;
      state.diffToRef = null;
      state.diffResult = null;
      state.selectedRevPreview = null;
      state.revPreviewContent = null;
      state.dirtyBody = null;
      state.dirtyMeta = null;
      state.hasUnsavedEdits = false;
      state.commitMessageDraft = '';
      syncActiveTabFromState();
      syncBrowserUrl({ replace: false });
      updateHeaderChrome();
      renderScriptsView(container);
    };
  });

  if (!activeDoc) return;

  const toggleListBtn = document.getElementById('toggleListBtn');
  if (toggleListBtn) {
    toggleListBtn.onclick = () => {
      state.scriptsListCollapsed = !state.scriptsListCollapsed;
      renderScriptsView(container);
    };
  }

  document.getElementById('scriptsBackToListBtn')?.addEventListener('click', () => backToScriptsList());

  const toggleInspBtn = document.getElementById('toggleInspectorBtn');
  if (toggleInspBtn) {
    toggleInspBtn.onclick = () => {
      state.inspectorCollapsed = !state.inspectorCollapsed;
      renderScriptsView(container);
    };
  }

  const toggleSplitBtn = document.getElementById('toggleSplitBtn');
  if (toggleSplitBtn) {
    toggleSplitBtn.onclick = () => {
      state.editorSplit = !state.editorSplit;
      renderScriptsView(container);
    };
  }

  const toggleFocusBtn = document.getElementById('toggleFocusBtn');
  if (toggleFocusBtn) {
    toggleFocusBtn.onclick = () => {
      state.focusMode = !state.focusMode;
      syncBrowserUrl({ replace: true });
      updateHeaderChrome();
      renderScriptsView(container);
    };
  }

  const applyFontSize = (nextSize) => {
    state.readerFontSize = Math.min(24, Math.max(13, nextSize));
    const prefs = loadJsonStorage(STORAGE_KEY_PREFS, {});
    prefs.readerFontSize = state.readerFontSize;
    saveJsonStorage(STORAGE_KEY_PREFS, prefs);
    const valSpan = document.getElementById('fontZoomVal');
    if (valSpan) valSpan.textContent = `${state.readerFontSize}px`;
    const artEl = document.getElementById('mdArticle');
    if (artEl) artEl.style.fontSize = `${state.readerFontSize}px`;
    const edEl = document.getElementById('mdEditorInput');
    if (edEl) edEl.style.fontSize = `${state.readerFontSize}px`;
    const prevEl = document.getElementById('mdLivePreview');
    if (prevEl) prevEl.style.fontSize = `${state.readerFontSize}px`;
  };
  const fontMinusBtn = document.getElementById('fontMinusBtn');
  if (fontMinusBtn) fontMinusBtn.onclick = () => applyFontSize(state.readerFontSize - 1);
  const fontPlusBtn = document.getElementById('fontPlusBtn');
  if (fontPlusBtn) fontPlusBtn.onclick = () => applyFontSize(state.readerFontSize + 1);

  const speechToggleBtn = document.getElementById('speechToggleBtn');
  if (speechToggleBtn) speechToggleBtn.onclick = () => startOrToggleBrowserSpeech();
  const speechStopBtn = document.getElementById('speechStopBtn');
  if (speechStopBtn) speechStopBtn.onclick = () => stopBrowserSpeech();
  const speechRateBtn = document.getElementById('speechRateBtn');
  if (speechRateBtn) {
    const rates = [1.0, 1.15, 1.3, 1.5, 0.9];
    speechRateBtn.onclick = () => {
      const next = rates[(rates.indexOf(speechState.rate) + 1) % rates.length];
      speechState.rate = next;
      updateSpeechToolbarUi();
      if (speechState.active && !speechState.paused) {
        if (speechState.mode === 'server-piper' && speechState.audio) {
          speechState.audio.playbackRate = next;
        } else {
          speakBlockAt(speechState.idx);
        }
      }
    };
  }
  const mdArt = document.getElementById('mdArticle');
  if (mdArt) {
    const jumpSpeechToEventTarget = (ev, requireActive) => {
      if (requireActive && !speechState.active) return;
      if (ev.target?.closest?.('a, button, video, audio, input, select, textarea, summary')) return;
      if (requireActive && window.getSelection?.()?.toString().trim()) return;
      const target = ev.target?.closest?.('h1, h2, h3, h4, p, li, blockquote, figcaption');
      if (!target) return;
      if (!speechState.active || !speechState.blocks.length) {
        startOrToggleBrowserSpeech(0);
      }
      const idx = speechState.blocks.findIndex((b) => b.el === target);
      if (idx >= 0) speakBlockAt(idx);
    };
    mdArt.addEventListener('click', (ev) => jumpSpeechToEventTarget(ev, true));
    mdArt.addEventListener('dblclick', (ev) => jumpSpeechToEventTarget(ev, false));
  }

  container.querySelectorAll('#docModeSwitch button').forEach((btn) => {
    btn.onclick = () => {
      stopPrompter();
      stopBrowserSpeech();
      state.docMode = btn.dataset.docMode;
      syncBrowserUrl({ replace: true });
      renderScriptsView(container);
      if (
        state.docMode === 'history' &&
        state.serverMode &&
        !state.diffResult &&
        !state.selectedRevPreview &&
        state.diffFromRef &&
        state.diffToRef
      ) {
        loadDiffForDoc(activeDoc.path, state.diffFromRef, state.diffToRef);
      }
    };
  });

  container.querySelectorAll('[data-fm]').forEach((el) => {
    const updateMetaField = () => {
      state.dirtyMeta = { ...(state.dirtyMeta || activeDoc.meta), [el.dataset.fm]: el.value };
      state.hasUnsavedEdits = true;
    };
    el.onchange = updateMetaField;
    if (el.tagName === 'INPUT' && el.type === 'text') {
      el.oninput = updateMetaField;
    }
  });

  const article = document.getElementById('mdArticle');
  if (article) {
    article.querySelectorAll('.md-task-box').forEach((chk) => {
      chk.onchange = async () => {
        const idx = Number(chk.dataset.checkIndex);
        const baseBody = state.dirtyBody !== null ? state.dirtyBody : activeDoc.body;
        const updatedBody = MD.toggleCheckboxInMarkdown(baseBody, idx);
        state.dirtyBody = updatedBody;
        const activeVer = state.activeVersion || 'principal';
        const metaToSave = { ...(state.dirtyMeta || activeDoc.meta) };
        const fullRaw = MD.serializeFrontmatter(metaToSave, updatedBody);
        try {
          await persistSaveDoc(activeDoc.path, fullRaw, null, {
            version: activeVer,
            commitMessage: 'Checklist atualizado no leitor',
          });
          state.hasUnsavedEdits = false;
          if (activeVer === 'principal') {
            state.dirtyBody = null;
            state.dirtyMeta = null;
          } else {
            state.dirtyMeta = metaToSave;
            state.dirtyBody = updatedBody;
          }
          updateHeaderChrome();
          renderScriptsView(container);
          showToast(state.serverMode ? 'Checkbox salvo direto no arquivo .md!' : 'Checkbox atualizado no rascunho local.');
        } catch (err) {
          showToast(err.message);
        }
      };
    });

    article.querySelectorAll('[data-rel-md]').forEach((link) => {
      link.onclick = (e) => {
        e.preventDefault();
        const resolved = resolveRelativeMdPath(activeDoc.folder, link.dataset.relMd);
        const found = docs.find((d) => d.path === resolved);
        if (found) {
          stopPrompter();
          stopBrowserSpeech();
          const nextInitialVer = getDocDefaultVersion(state.activeChannel, found.path);
          state.selectedDocPath = found.path;
          state.activeVersion = nextInitialVer;
          state.versionExplicit = false;
          state.versionContentLoading = Boolean(state.serverMode && nextInitialVer !== 'principal');
          state.loadedVersionKey = '';
          state.versionHistory = null;
          state.versionFetchedKey = '';
          state.diffDocPath = '';
          state.diffResult = null;
          state.selectedRevPreview = null;
          state.revPreviewContent = null;
          state.dirtyBody = null;
          state.dirtyMeta = null;
          state.hasUnsavedEdits = false;
          state.commitMessageDraft = '';
          syncActiveTabFromState();
          syncBrowserUrl({ replace: false });
          updateHeaderChrome();
          renderScriptsView(container);
        } else {
          showToast(`Arquivo não encontrado neste canal: ${resolved}`);
        }
      };
    });
  }

  container.querySelectorAll('[data-copy-code]').forEach((btn) => {
    btn.onclick = () => copyText(btn.dataset.copyCode, 'Bloco copiado!');
  });

  const editorInput = document.getElementById('mdEditorInput');
  const livePreview = document.getElementById('mdLivePreview');
  if (editorInput) {
    editorInput.oninput = () => {
      state.dirtyBody = editorInput.value;
      state.hasUnsavedEdits = true;
      if (livePreview) livePreview.innerHTML = MD.renderMarkdown(editorInput.value);
      const statsEl = document.getElementById('inspStatsRow');
      if (statsEl) {
        const st = MD.analyzeStats(editorInput.value);
        statsEl.innerHTML = `<span>${formatNumber(st.words)} pal.</span><span>~${st.speakMinutes} min fala</span><span>${st.checksDone}/${st.checksTotal} checks</span>`;
      }
    };

    container.querySelectorAll('[data-insert]').forEach((btn) => {
      btn.onclick = () => {
        const snippet = btn.dataset.insert;
        const start = editorInput.selectionStart;
        const end = editorInput.selectionEnd;
        const v = editorInput.value;
        editorInput.value = v.slice(0, start) + snippet + v.slice(end);
        editorInput.selectionStart = editorInput.selectionEnd = start + snippet.length;
        editorInput.focus();
        editorInput.dispatchEvent(new Event('input'));
      };
    });
  }

  // v5: Bindings Ecossistema do Projeto
  document.getElementById('ecoNarrateScriptBtn')?.addEventListener('click', () => {
    openScriptNarrationModal({
      docPath: activeDoc.path,
      docTitle: currentMeta.titulo || activeDoc.meta?.titulo || activeDoc.filename,
      defaultVersion: state.activeVersion || 'principal',
    });
  });

  document.getElementById('ecoRecordScriptBtn')?.addEventListener('click', () => {
    setView('recorder', null, { roteiroPath: activeDoc.path });
  });

  document.getElementById('ecoBoardActionBtn')?.addEventListener('click', async () => {
    const linkedBoards = chData.projectLinks?.[activeDoc.path]?.boards || [];
    if (linkedBoards.length > 0) {
      setView('whiteboard', null, { boardId: linkedBoards[0].id });
      return;
    }
    if (!state.serverMode) {
      showToast('Criar quadro vinculado requer o servidor local (./bin/crom-studio --tray).');
      return;
    }
    try {
      const boardTitle = currentMeta.titulo || activeDoc.meta.titulo || activeDoc.filename;
      const elements = buildStarterBoardElementsForDoc(activeDoc, currentMeta);
      const res = await fetch('/api/boards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel: chData.key,
          title: boardTitle,
          preferredMode: 'nodes',
          elements,
          appState: { viewBackgroundColor: '#ffffff', theme: 'dark', gridSize: 20 },
          files: {},
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Erro ao criar quadro conectado');
      state.boardsList = json.boards || state.boardsList;
      state.wbListFetchedChannel = chData.key;
      if (json.state) state.data = normalizePayload(json.state);
      showToast(`Quadro "${json.board.title}" criado com o card deste roteiro!`);
      setView('whiteboard', null, { boardId: json.board.id });
    } catch (err) {
      showToast(err.message);
    }
  });

  container.querySelectorAll('[data-eco-rec]').forEach((btn) => {
    btn.onclick = () => setView('recorder', null, { roteiroPath: activeDoc.path });
  });

  container.querySelectorAll('[data-eco-board]').forEach((btn) => {
    btn.onclick = () => setView('whiteboard', null, { boardId: btn.dataset.ecoBoard });
  });

  container.querySelectorAll('[data-eco-note]').forEach((btn) => {
    btn.onclick = () => {
      state.notesState.highlightNoteId = btn.dataset.ecoNote;
      setView('notes');
    };
  });

  container.querySelectorAll('[data-eco-curadoria]').forEach((btn) => {
    btn.onclick = () => {
      state.catalogSubTab = btn.dataset.ecoSource === 'playlist' ? 'playlists' : 'videos';
      setView('catalog');
    };
  });

  container.querySelectorAll('[data-eco-kdenlive]').forEach((btn) => {
    btn.onclick = () => setView('production');
  });

  const saveBtn = document.getElementById('saveDocBtn');
  if (saveBtn) saveBtn.onclick = () => saveCurrentDoc();

  const inspCommitInp = document.getElementById('inspCommitMsgInput');
  if (inspCommitInp) {
    inspCommitInp.oninput = () => {
      state.commitMessageDraft = inspCommitInp.value;
    };
    inspCommitInp.onkeydown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        saveCurrentDoc();
      }
    };
  }

  const inspCommitBtn = document.getElementById('inspCommitSaveBtn');
  if (inspCommitBtn) inspCommitBtn.onclick = () => saveCurrentDoc();

  const inspOpenHistBtn = document.getElementById('inspOpenHistoryBtn');
  if (inspOpenHistBtn) {
    inspOpenHistBtn.onclick = () => {
      stopPrompter();
      state.docMode = 'history';
      syncBrowserUrl({ replace: true });
      renderScriptsView(container);
      if (state.serverMode && !state.diffResult && !state.selectedRevPreview && state.diffFromRef && state.diffToRef) {
        loadDiffForDoc(activeDoc.path, state.diffFromRef, state.diffToRef);
      }
    };
  }

  container.querySelectorAll('[data-insp-rev]').forEach((btn) => {
    btn.onclick = () => {
      if (!state.serverMode) {
        showToast('Histórico Git requer o servidor local.');
        return;
      }
      stopPrompter();
      state.docMode = 'history';
      syncBrowserUrl({ replace: true });
      loadRevisionPreview(activeDoc.path, btn.dataset.inspRev);
    };
  });

  const inspNewVerBtn = document.getElementById('inspNewVersionBtn');
  if (inspNewVerBtn) inspNewVerBtn.onclick = () => openNewVersionModal(activeDoc);

  container.querySelectorAll('[data-switch-version]').forEach((btn) => {
    btn.onclick = () => {
      const verName = btn.dataset.switchVersion;
      if (verName === state.activeVersion) return;
      if (state.hasUnsavedEdits && !confirm('Você tem alterações não salvas. Descartar e trocar de versão?')) {
        return;
      }
      switchDocVersion(activeDoc.path, verName);
    };
  });

  container.querySelectorAll('[data-set-default-version]').forEach((btn) => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const verName = btn.dataset.setDefaultVersion || state.activeVersion || 'principal';
      setDefaultDocVersion(activeDoc.path, verName);
    };
  });

  const goCompareVariant = () => {
    if (!state.serverMode) {
      showToast('Comparação de versões requer o servidor local.');
      return;
    }
    stopPrompter();
    state.docMode = 'history';
    syncBrowserUrl({ replace: true });
    const allVers = state.versionHistory?.versions || [];
    const curVer = state.activeVersion || 'principal';
    if (curVer !== 'principal') {
      loadDiffForDoc(activeDoc.path, 'ver:principal', `ver:${curVer}`);
    } else {
      const defVer = getDocDefaultVersion(state.activeChannel, activeDoc.path);
      const otherVer =
        (defVer !== 'principal' ? defVer : null) ||
        allVers.find((v) => v.name !== 'principal')?.name ||
        'principal';
      loadDiffForDoc(activeDoc.path, 'ver:principal', `ver:${otherVer}`);
    }
  };

  const varCmpBtn = document.getElementById('varCompareBtn');
  if (varCmpBtn) varCmpBtn.onclick = goCompareVariant;
  const inspCmpBtn = document.getElementById('inspCompareVarBtn');
  if (inspCmpBtn) inspCmpBtn.onclick = goCompareVariant;

  const varPromBtn = document.getElementById('varPromoteBtn');
  if (varPromBtn) varPromBtn.onclick = () => promoteDocVersion(activeDoc.path, state.activeVersion);
  const inspPromBtn = document.getElementById('inspPromoteVarBtn');
  if (inspPromBtn) inspPromBtn.onclick = () => promoteDocVersion(activeDoc.path, state.activeVersion);

  const varDelBtn = document.getElementById('varDeleteBtn');
  if (varDelBtn) varDelBtn.onclick = () => deleteDocVersion(activeDoc.path, state.activeVersion);

  const kdenliveBtn = document.getElementById('produceKdenliveBtn');
  if (kdenliveBtn) kdenliveBtn.onclick = () => openKdenliveModal(activeDoc);

  const downloadBtn = document.getElementById('downloadDocBtn');
  if (downloadBtn) {
    downloadBtn.onclick = () => {
      const meta = state.dirtyMeta || activeDoc.meta;
      const body = state.dirtyBody !== null ? state.dirtyBody : activeDoc.body;
      downloadTextFile(activeDoc.filename, MD.serializeFrontmatter(meta, body));
    };
  }

  const promptBtn = document.getElementById('copyPromptDocBtn');
  if (promptBtn) {
    promptBtn.onclick = () => {
      const ch = chData.channel || {};
      const wsPath = chData.workspacePath || ch.name;
      const activeVer = state.activeVersion || 'principal';
      const prompt = `Leia AGENTS.md e "${activeDoc.path}" no workspace ${wsPath} (canal ${chData.key}). Nunca sobrescreva fora do versionamento Git: após editar, grave com \`./bin/crom-studio roteiro commit --canal ${chData.key} --arquivo "${activeDoc.path}" --versao ${activeVer} --autor "Agente" --msg "Resumo da revisão" --stdin\` (ou crie variante com \`./bin/crom-studio roteiro nova-versao --canal ${chData.key} --arquivo "${activeDoc.path}" --nome "v2-alternativa" --autor "Agente" --stdin\`).`;
      copyText(prompt, 'Prompt Git-safe pronto para colar no agente!');
    };
  }

  const delBtn = document.getElementById('deleteDocBtn');
  if (delBtn) {
    delBtn.onclick = async () => {
      if (!confirm(`Deseja mover "${activeDoc.path}" para a Lixeira (recuperável por 30 dias)?`)) return;
      try {
        await persistDeleteDoc(activeDoc.path);
        state.trashChannel = '';
        backToScriptsList({ skipConfirm: true });
        showToast('Arquivo movido para a Lixeira (30 dias).');
      } catch (err) {
        showToast(err.message);
      }
    };
  }

  if (state.docMode === 'history') {
    bindHistoryDiffEvents(activeDoc, container);
  }
  bindPrompterEvents();
}

registerViewRenderer('scripts', renderScriptsView);
registerLifecycleHooks({ stopPrompter, loadVersionHistory, switchDocVersion });
