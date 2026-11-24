import { MD, STATUS_VISUAL, STORAGE_KEY_PREFS } from '../core/constants.js';
import { copyText, downloadTextFile, formatDatePt, formatNumber, loadJsonStorage, saveJsonStorage, showToast } from '../core/utils.js';
import {
  getActiveChannelData,
  getActiveDoc,
  getChannelSeriesList,
  normalizePayload,
  persistDeleteDoc,
  persistSaveDoc,
  registerLifecycleHooks,
  registerViewRenderer,
  resolveRelativeMdPath,
  state,
} from '../core/state.js';
import { renderCurrentView, setView, syncBrowserUrl, updateHeaderChrome } from '../core/router.js';
import { syncActiveTabFromState } from '../core/tabs.js';
import { openKdenliveModal, openNewDocModal, openNewVersionModal } from '../core/modals.js';

export async function loadVersionHistory(docPath, { force = false, skipRender = false } = {}) {
  if (!state.serverMode || !docPath) return null;
  const chKey = state.activeChannel;
  const fetchKey = `${chKey}::${docPath}`;
  if (!force && state.versionLoading && state.versionFetchedKey === fetchKey) {
    return state.versionHistory;
  }
  state.versionLoading = true;
  state.versionFetchedKey = fetchKey;
  state.versionError = null;
  try {
    const res = await fetch(
      `/api/versions?channel=${encodeURIComponent(chKey)}&path=${encodeURIComponent(docPath)}`,
      { cache: 'no-store' }
    );
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Erro ao carregar histórico do roteiro');
    if (state.activeChannel !== chKey || getActiveDoc()?.path !== docPath) return json;
    state.versionHistory = json;
    const revs = json.revisions || [];
    if (!state.diffFromRef || !state.diffToRef || state.diffDocPath !== docPath) {
      state.diffDocPath = docPath;
      if (revs.length >= 2) {
        state.diffFromRef = `rev:${revs[1].id}`;
        state.diffToRef = `rev:${revs[0].id}`;
      } else if (revs.length === 1) {
        state.diffFromRef = `rev:${revs[0].id}`;
        state.diffToRef = 'ver:principal';
      } else {
        state.diffFromRef = 'ver:principal';
        state.diffToRef = 'ver:principal';
      }
    }
    if (state.docMode === 'history' && !state.diffResult && state.diffFromRef && state.diffToRef) {
      await loadDiffForDoc(docPath, state.diffFromRef, state.diffToRef, { silentRender: true });
    }
    return json;
  } catch (err) {
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

export async function switchDocVersion(docPath, versionName = 'principal') {
  const cleanVer = (versionName || 'principal').trim() || 'principal';
  stopPrompter();
  state.selectedRevPreview = null;
  state.revPreviewContent = null;
  state.hasUnsavedEdits = false;
  if (cleanVer === 'principal') {
    state.activeVersion = 'principal';
    state.dirtyBody = null;
    state.dirtyMeta = null;
    syncBrowserUrl({ replace: false });
    updateHeaderChrome();
    if (state.view === 'scripts') renderScriptsView(document.getElementById('viewContainer'));
    return;
  }
  if (!state.serverMode) {
    showToast('Versões alternativas requerem o servidor local (./bin/crom-studio --tray).');
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
    syncBrowserUrl({ replace: false });
    updateHeaderChrome();
    if (state.view === 'scripts') renderScriptsView(document.getElementById('viewContainer'));
    showToast(`Editando versão "${cleanVer}"`);
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
  const labelTarget = targetVersion === 'principal' ? 'arquivo principal' : `versão "${targetVersion}"`;
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
  if (!confirm(`Promover a versão "${versionName}" para substituir o .md principal em disco? (Será gravado um commit de promoção no histórico.)`)) {
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
    if (!res.ok) throw new Error(json.error || 'Erro ao promover versão');
    state.data = normalizePayload(json.state);
    state.versionHistory = json.history;
    state.activeVersion = 'principal';
    state.dirtyBody = null;
    state.dirtyMeta = null;
    state.hasUnsavedEdits = false;
    state.diffResult = null;
    syncBrowserUrl({ replace: false });
    updateHeaderChrome();
    renderCurrentView();
    showToast(`Versão "${versionName}" promovida para principal!`);
  } catch (err) {
    showToast(err.message);
  }
}

export async function deleteDocVersion(docPath, versionName) {
  if (!state.serverMode || !docPath || !versionName || versionName === 'principal') return;
  if (!confirm(`Excluir a versão alternativa "${versionName}"? (Os commits já salvos continuam na linha do tempo.)`)) {
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
    if (state.activeVersion === versionName) {
      state.activeVersion = 'principal';
      state.dirtyBody = null;
      state.dirtyMeta = null;
      state.hasUnsavedEdits = false;
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
            O histórico de revisões, comparação linha a linha e versões alternativas estão disponíveis quando o painel roda com o servidor local:
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

  const history = state.versionHistory || { versions: [], revisions: [] };
  const versions = history.versions || [];
  const revisions = history.revisions || [];

  const buildRefOptions = (selectedVal) => {
    const verOpts = versions.map((v) => {
      const val = `ver:${v.name}`;
      return `<option value="${MD.escapeHtml(val)}"${selectedVal === val ? ' selected' : ''}>Versão: ${MD.escapeHtml(v.name)}${v.headRev ? ` (${MD.escapeHtml(v.headRev)})` : ''}</option>`;
    });
    const revOpts = revisions.map((r) => {
      const val = r.id === 'disk' ? 'disk' : `rev:${r.id}`;
      const isSelected = selectedVal === val || (r.id === 'disk' && selectedVal === 'rev:disk');
      return `<option value="${MD.escapeHtml(val)}"${isSelected ? ' selected' : ''}>${MD.escapeHtml(r.id)} (${MD.escapeHtml(r.version || 'principal')}) — ${MD.escapeHtml(String(r.message || '').slice(0, 42))}</option>`;
    });
    return [...verOpts, ...revOpts].join('');
  };

  const timelineHtml = revisions.length
    ? revisions
        .map((rev) => {
          const isSelected = state.selectedRevPreview === rev.id;
          const dateStr = formatDatePt(String(rev.createdAt || '').slice(0, 10));
          return `
            <div class="git-rev-card${isSelected ? ' is-selected' : ''}">
              <div class="git-rev-top">
                <span style="font-weight:700; color:var(--text-1);">${MD.escapeHtml(rev.id)}</span>
                <span class="git-kind-badge kind-${MD.escapeHtml(rev.kind || 'commit')}">${MD.escapeHtml(rev.kind || 'commit')}</span>
                <span style="color:var(--accent);">${MD.escapeHtml(rev.version || 'principal')}</span>
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
  const sizeInp = document.getElementById('prompterSize');
  const mirrorBtn = document.getElementById('prompterMirrorBtn');
  const stage = document.getElementById('prompterStage');
  const textEl = document.getElementById('prompterText');

  if (!stage || !playBtn) return;

  const tick = (ts) => {
    if (!state.prompter.playing) return;
    if (!state.prompter.lastTs) state.prompter.lastTs = ts;
    const dt = Math.min(80, ts - state.prompter.lastTs) / 1000;
    state.prompter.lastTs = ts;
    stage.scrollTop += state.prompter.speed * 26 * dt;
    state.prompter.rafId = requestAnimationFrame(tick);
  };

  playBtn.onclick = () => {
    state.prompter.playing = !state.prompter.playing;
    playBtn.textContent = state.prompter.playing ? '⏸ Pausar (Espaço)' : '▶ Iniciar Rolagem';
    if (state.prompter.playing) {
      state.prompter.lastTs = 0;
      state.prompter.rafId = requestAnimationFrame(tick);
    } else {
      stopPrompter();
    }
  };

  resetBtn.onclick = () => stage.scrollTo({ top: 0, behavior: 'smooth' });
  speedInp.oninput = () => { state.prompter.speed = Number(speedInp.value); };
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
    state.diffResult = null;
    updateHeaderChrome();
    renderCurrentView();
    showToast(
      state.serverMode
        ? activeVersion === 'principal'
          ? `Salvo em ${finalPath}!`
          : `Versão "${activeVersion}" salva no histórico de ${finalPath}!`
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
    if (state.docMode === 'read') {
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
              <label>Velocidade <input type="range" id="prompterSpeed" min="0.6" max="8" step="0.4" value="${state.prompter.speed}"></label>
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

    const versions = state.versionHistory?.versions || [
      { name: 'principal', description: 'Arquivo .md principal no workspace', isPrimary: true, headRev: activeDoc.versioning?.headRev || null },
    ];
    const activeVerObj = versions.find((v) => v.name === state.activeVersion);
    const variantBannerHtml =
      state.activeVersion !== 'principal'
        ? `
          <div class="variant-banner">
            <div>
              <span>⎇ Versão alternativa ativa: <strong>${MD.escapeHtml(state.activeVersion)}</strong></span>
              ${activeVerObj?.description ? `<span style="color:var(--text-2); margin-left:6px;">— ${MD.escapeHtml(activeVerObj.description)}</span>` : ''}
            </div>
            <div style="display:flex; gap:6px; flex-wrap:wrap;">
              <button type="button" class="btn-sm" id="varSwitchPrincipalBtn">← Principal</button>
              <button type="button" class="btn-sm" id="varCompareBtn">Comparar com principal</button>
              <button type="button" class="btn-sm btn-accent" id="varPromoteBtn">Promover para principal</button>
              <button type="button" class="btn-sm btn-danger" id="varDeleteBtn">Excluir versão</button>
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
          ${state.docMode === 'edit' ? `<button type="button" class="icon-btn-sm${state.editorSplit ? ' is-active' : ''}" id="toggleSplitBtn" title="Alternar entre Editor Split e Painel Único">${state.editorSplit ? '⫿ Split' : '▭ Único'}</button>` : ''}
          <button type="button" class="icon-btn-sm${state.focusMode ? ' is-active' : ''}" id="toggleFocusBtn" title="Modo Foco (Esc para sair)">⛶</button>
          <button type="button" class="btn-sm btn-accent" id="saveDocBtn">Salvar${state.hasUnsavedEdits ? ' •' : ''} (Ctrl+S)</button>
          <button type="button" class="icon-btn-sm${!state.inspectorCollapsed ? ' is-active' : ''}" id="toggleInspectorBtn" title="Mostrar/ocultar inspetor direito">◨</button>
        </div>
      </div>
      ${variantBannerHtml}
      ${bodySectionHtml}
    `;

    const isProtected = activeDoc.path === 'AGENTS.md' || activeDoc.path === 'README.md';
    const recentRevs = (state.versionHistory?.revisions || []).slice(0, 3);
    const versionChipsHtml = versions
      .map(
        (v) => `
          <button type="button" class="ver-chip${v.name === state.activeVersion ? ' is-active' : ''}" data-switch-version="${MD.escapeHtml(v.name)}" title="${MD.escapeHtml(v.description || v.name)}">
            <span class="ver-chip-dot"></span>
            <span>${MD.escapeHtml(v.name)}</span>
            ${v.headRev ? `<small style="opacity:0.7; font-family:var(--font-mono);">${MD.escapeHtml(v.headRev)}</small>` : ''}
          </button>
        `
      )
      .join('');

    const recentCommitsHtml = state.serverMode
      ? recentRevs.length
        ? recentRevs
            .map(
              (r) => `
                <button type="button" class="insp-rev-row" data-insp-rev="${MD.escapeHtml(r.id)}">
                  <div style="display:flex; justify-content:space-between; gap:6px; font-family:var(--font-mono); font-size:10.5px;">
                    <strong>${MD.escapeHtml(r.id)}</strong>
                    <span style="color:var(--accent);">${MD.escapeHtml(r.version || 'principal')}</span>
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
      notes: [],
      curadoria: [],
      kdenlive: [],
    };
    const ecoRecordings = eco.recordings || [];
    const ecoBoards = eco.boards || [];
    const ecoNotes = eco.notes || [];
    const ecoCuradoria = eco.curadoria || [];
    const ecoKdenlive = eco.kdenlive || [];
    const ecoTotalLinks =
      ecoRecordings.length + ecoBoards.length + ecoNotes.length + ecoCuradoria.length + ecoKdenlive.length;

    const ecosystemHtml = `
      <div class="insp-section" id="inspEcosystemCard">
        <div class="insp-title-row">
          <span class="insp-title">Ecossistema do Projeto</span>
          <span style="font-family:var(--font-mono); font-size:10px; color:var(--text-3);">${ecoTotalLinks} vínculo(s)</span>
        </div>

        <div style="display:flex; flex-direction:column; gap:6px;">
          <button type="button" class="btn-sm insp-eco-cta" id="ecoRecordScriptBtn">🎙️ Gravar este roteiro</button>
          <button type="button" class="btn-sm" id="ecoBoardActionBtn" style="width:100%; justify-content:center;">${ecoBoards.length ? '✎ Abrir Quadro Vinculado' : '✎ Criar Quadro deste Roteiro'}</button>
        </div>

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
          <span class="insp-title">Versões Alternativas</span>
          <button type="button" class="kc-move-btn" id="inspNewVersionBtn">+ Nova Versão</button>
        </div>
        <div class="version-chip-list">${versionChipsHtml}</div>
        ${state.activeVersion !== 'principal'
          ? `
            <div class="insp-actions-stack" style="margin-top:8px;">
              <button type="button" class="btn-sm" id="inspCompareVarBtn">Comparar</button>
              <button type="button" class="btn-sm btn-accent" id="inspPromoteVarBtn">Promover</button>
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
      state.selectedDocPath = btn.dataset.selectDoc;
      state.activeVersion = 'principal';
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

  container.querySelectorAll('#docModeSwitch button').forEach((btn) => {
    btn.onclick = () => {
      stopPrompter();
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
          state.selectedDocPath = found.path;
          state.activeVersion = 'principal';
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

  const goCompareVariant = () => {
    if (!state.serverMode) {
      showToast('Comparação de versões requer o servidor local.');
      return;
    }
    stopPrompter();
    state.docMode = 'history';
    syncBrowserUrl({ replace: true });
    loadDiffForDoc(activeDoc.path, 'ver:principal', `ver:${state.activeVersion}`);
  };

  const varSwitchBtn = document.getElementById('varSwitchPrincipalBtn');
  if (varSwitchBtn) {
    varSwitchBtn.onclick = () => {
      if (state.hasUnsavedEdits && !confirm('Descartar alterações não salvas e voltar para a versão principal?')) return;
      switchDocVersion(activeDoc.path, 'principal');
    };
  }
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
