import { MD } from '../core/constants.js';
import { updateHeaderChrome } from '../core/router.js';
import { normalizePayload, state } from '../core/state.js';
import { formatDateTimePt, showToast } from '../core/utils.js';

let backupScope = 'all';

export function getDoctorLevelClass(level) {
  if (level === 'error') return 'is-error';
  if (level === 'warning') return 'is-warn';
  return 'is-ok';
}

export function getDoctorLevelIcon(level) {
  if (level === 'error') return '✕';
  if (level === 'warning') return '⚠';
  return '✓';
}

export async function loadDoctorReport({ rerender = true } = {}) {
  if (!state.serverMode) return null;
  state.doctorLoading = true;
  state.doctorError = null;
  if (rerender) refreshSettingsHealthCard();
  try {
    const res = await fetch('/api/doctor', { cache: 'no-store' });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Erro ao executar diagnóstico (Doctor)');
    state.doctorReport = json;
    return json;
  } catch (err) {
    state.doctorError = err.message || 'Erro ao executar Doctor';
    return null;
  } finally {
    state.doctorLoading = false;
    if (rerender) refreshSettingsHealthCard();
  }
}

export async function loadTrashForChannel(
  channelKey = state.settingsChannelKey || state.activeChannel,
  { force = false, rerender = true } = {}
) {
  if (!state.serverMode || !channelKey) return [];
  if (!force && state.trashChannel === channelKey && !state.trashLoading) {
    return state.trashItems;
  }
  state.trashLoading = true;
  state.trashError = null;
  state.trashChannel = channelKey;
  if (rerender) refreshSettingsHealthCard(channelKey);
  try {
    const res = await fetch(`/api/trash?channel=${encodeURIComponent(channelKey)}`, { cache: 'no-store' });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Erro ao carregar lixeira');
    if (state.trashChannel === channelKey) {
      state.trashItems = Array.isArray(json.items) ? json.items : [];
    }
    return state.trashItems;
  } catch (err) {
    state.trashError = err.message || 'Erro ao consultar lixeira';
    return [];
  } finally {
    state.trashLoading = false;
    if (rerender) refreshSettingsHealthCard(channelKey);
  }
}

function buildBackupDownloadUrl(selectedKey) {
  const scope = backupScope === selectedKey ? selectedKey : 'all';
  const inc = state.backupIncludeRecordings ? '1' : '0';
  return `/api/backup/download?channel=${encodeURIComponent(scope)}&includeRecordings=${inc}`;
}

export function renderSettingsHealthCardHtml(selectedKey) {
  const report = state.doctorReport;
  const trashItems = state.trashChannel === selectedKey ? state.trashItems || [] : [];
  const docSummary = report?.summary || { errors: 0, warnings: 0, infos: 0 };
  const tools = report?.tools || {};
  const toolBadgesHtml = report
    ? ['tar', 'ffmpeg', 'gh', 'ngrok']
        .map((t) => {
          const ok = Boolean(tools[t]?.available);
          return `<span class="settings-path-badge ${ok ? 'is-ok' : 'is-miss'}">${ok ? '✓' : '✕'} ${t}</span>`;
        })
        .join('')
    : '';

  const doctorOutHtml = state.doctorError
    ? `<div style="font-size:12px; color:var(--danger);">${MD.escapeHtml(state.doctorError)}</div>`
    : report
    ? `
      <div class="doctor-summary-grid">
        <div class="doctor-stat-pill">
          <span>Erros</span>
          <strong style="color:${docSummary.errors ? 'var(--danger)' : '#86efac'};">${docSummary.errors}</strong>
        </div>
        <div class="doctor-stat-pill">
          <span>Avisos</span>
          <strong style="color:${docSummary.warnings ? '#ffd479' : 'var(--text-1)'};">${docSummary.warnings}</strong>
        </div>
        <div class="doctor-stat-pill">
          <span>Disco Livre</span>
          <strong>${MD.escapeHtml(report.disk?.freeHuman || '—')}</strong>
        </div>
      </div>
      <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; flex-wrap:wrap; font-size:11.5px;">
        <span class="settings-path-badge ${report.ok ? 'is-ok' : 'is-miss'}">${report.ok ? '✓ Diagnóstico OK' : '✕ Falhas Encontradas'}</span>
        <span style="color:var(--text-3);">${formatDateTimePt(report.checkedAt)}</span>
      </div>
      <div style="display:flex; gap:5px; flex-wrap:wrap;">${toolBadgesHtml}</div>
      <div class="doctor-checks-list">
        ${(report.checks || [])
          .map(
            (c) => `
              <div class="doctor-check-row ${getDoctorLevelClass(c.level)}">
                <div style="display:flex; justify-content:space-between; gap:8px;">
                  <strong>${getDoctorLevelIcon(c.level)} ${MD.escapeHtml(c.title)}</strong>
                  <span style="font-family:var(--font-mono); font-size:10px; color:var(--text-3);">${MD.escapeHtml(c.channel || 'system')}</span>
                </div>
                <div style="color:var(--text-2); line-height:1.4;">${MD.escapeHtml(c.message || '')}</div>
              </div>
            `
          )
          .join('')}
      </div>
    `
    : `<p style="margin:0; font-size:11.5px; color:var(--text-3); line-height:1.45;">
        Valida frontmatter YAML de todos os <code>.md</code>, JSONs em <code>.studio-data/</code> e <code>quadros/</code>, quarentena, binários e espaço em disco.
      </p>`;

  const trashListHtml = state.trashLoading && !trashItems.length
    ? '<div style="font-size:12px; color:var(--text-3);">Carregando itens da lixeira...</div>'
    : state.trashError
    ? `<div style="font-size:12px; color:var(--danger);">${MD.escapeHtml(state.trashError)}</div>`
    : !trashItems.length
    ? `<div style="font-size:12px; color:var(--text-3);">Lixeira vazia em <code>${MD.escapeHtml(selectedKey)}</code>.</div>`
    : trashItems
        .map(
          (it) => `
            <div class="trash-item-row trash-item" data-trash-id="${MD.escapeHtml(it.id)}">
              <div class="trash-item-head">
                <strong style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${MD.escapeHtml(it.title || it.originalPath || it.id)}</strong>
                <span class="trash-kind-badge">${MD.escapeHtml(it.kind || 'item')}</span>
              </div>
              <div style="font-family:var(--font-mono); font-size:10.5px; color:var(--text-3); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                ${MD.escapeHtml(it.originalPath || it.id)} • ${formatDateTimePt(it.deletedAt)}
              </div>
              <div class="trash-item-actions">
                <button type="button" class="btn-sm btn-accent" data-trash-restore="${MD.escapeHtml(it.id)}">↺ Restaurar</button>
                <button type="button" class="btn-sm btn-danger" data-trash-purge="${MD.escapeHtml(it.id)}">✕ Excluir</button>
              </div>
            </div>
          `
        )
        .join('');

  return `
    <div class="settings-card health-card" id="settingsHealthCard">
      <div class="settings-card-head">
        <h3>6. Saúde do Estúdio, Backup Portátil & Lixeira (30 dias)</h3>
        <span style="font-family:var(--font-mono); font-size:11px; color:var(--text-3);">workspace: ${MD.escapeHtml(selectedKey)}</span>
      </div>

      <div class="health-blocks-grid">
        <!-- Bloco 1: Doctor -->
        <div class="health-block">
          <div class="remote-block-head">
            <strong style="font-size:13.5px;">🩺 Diagnóstico (Doctor)</strong>
            <button type="button" class="btn-sm btn-accent" id="settingsDoctorBtn"${state.doctorLoading ? ' disabled' : ''}>
              ${state.doctorLoading ? '⏳ Analisando...' : '🩺 Executar Doctor'}
            </button>
          </div>
          <div id="settingsDoctorOut" style="display:flex; flex-direction:column; gap:8px;">
            ${doctorOutHtml}
          </div>
        </div>

        <!-- Bloco 2: Backup Portátil (.tar.gz) -->
        <div class="health-block">
          <div class="remote-block-head">
            <strong style="font-size:13.5px;">📦 Backup Portátil (.tar.gz)</strong>
            <span class="settings-path-badge is-ok">Tar + Gzip</span>
          </div>
          <p style="margin:0; font-size:12px; color:var(--text-2); line-height:1.45;">
            Compacta <code>.md</code>, <code>quadros/</code>, <code>.studio-data/*.json</code> e <code>.roteiro-git/</code> sem caminhos locais fixos.
          </p>
          <label style="display:flex; flex-direction:column; gap:4px; font-size:12px; color:var(--text-2);">
            <span>Escopo do Backup</span>
            <select id="settingsBackupScopeSel" style="width:100%; padding:7px 10px; border-radius:8px; background:var(--bg-input); border:1px solid var(--border); font-size:12px;">
              <option value="all"${backupScope !== selectedKey ? ' selected' : ''}>Todos os workspaces</option>
              <option value="${MD.escapeHtml(selectedKey)}"${backupScope === selectedKey ? ' selected' : ''}>Apenas "${MD.escapeHtml(selectedKey)}"</option>
            </select>
          </label>
          <label class="switch-inline" style="font-size:12px; color:var(--text-1);">
            <input type="checkbox" id="settingsBackupIncludeRecChk"${state.backupIncludeRecordings ? ' checked' : ''}>
            <span>Incluir gravações (<code>gravacoes/</code>)</span>
          </label>
          <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:auto;">
            <a class="btn-sm btn-accent" id="settingsBackupDownloadBtn" href="${buildBackupDownloadUrl(selectedKey)}" download>⤓ Baixar Backup (.tar.gz)</a>
          </div>
        </div>

        <!-- Bloco 3: Lixeira Recuperável (30 dias) -->
        <div class="health-block">
          <div class="remote-block-head">
            <strong style="font-size:13.5px;">🗑 Lixeira (30 dias)</strong>
            <div style="display:flex; gap:6px; align-items:center;">
              <button type="button" class="btn-sm" id="settingsTrashRefreshBtn"${state.trashLoading ? ' disabled' : ''}>↻</button>
              ${trashItems.length ? '<button type="button" class="btn-sm btn-danger" id="settingsTrashEmptyBtn">Esvaziar</button>' : ''}
            </div>
          </div>
          <div class="trash-list" id="settingsTrashList">
            ${trashListHtml}
          </div>
        </div>
      </div>
    </div>
  `;
}

export function refreshSettingsHealthCard(selectedKey = state.settingsChannelKey || state.activeChannel) {
  const card = document.getElementById('settingsHealthCard');
  const container = document.getElementById('viewContainer');
  if (!card || !container || state.view !== 'settings') return;
  const tmp = document.createElement('div');
  tmp.innerHTML = renderSettingsHealthCardHtml(selectedKey).trim();
  const nextCard = tmp.firstElementChild;
  if (nextCard) {
    card.replaceWith(nextCard);
    bindSettingsHealthEvents(container, selectedKey, { autoFetchTrash: false });
  }
}

export function bindSettingsHealthEvents(container, selectedKey, { autoFetchTrash = true } = {}) {
  if (autoFetchTrash && state.serverMode && state.trashChannel !== selectedKey && !state.trashLoading) {
    loadTrashForChannel(selectedKey, { force: false, rerender: true });
  }

  document.getElementById('settingsDoctorBtn')?.addEventListener('click', () => {
    loadDoctorReport({ rerender: true });
  });

  const scopeSel = document.getElementById('settingsBackupScopeSel');
  const recChk = document.getElementById('settingsBackupIncludeRecChk');
  const dlBtn = document.getElementById('settingsBackupDownloadBtn');
  const syncBackupHref = () => {
    if (dlBtn) dlBtn.href = buildBackupDownloadUrl(selectedKey);
  };
  if (scopeSel) {
    scopeSel.onchange = () => {
      backupScope = scopeSel.value;
      syncBackupHref();
    };
  }
  if (recChk) {
    recChk.onchange = () => {
      state.backupIncludeRecordings = recChk.checked;
      syncBackupHref();
    };
  }
  if (dlBtn) {
    dlBtn.onclick = () => {
      showToast('Gerando e baixando backup .tar.gz...');
    };
  }

  document.getElementById('settingsTrashRefreshBtn')?.addEventListener('click', () => {
    loadTrashForChannel(selectedKey, { force: true, rerender: true });
  });

  document.getElementById('settingsTrashEmptyBtn')?.addEventListener('click', async () => {
    if (!confirm(`Esvaziar permanentemente toda a lixeira de "${selectedKey}"?`)) return;
    try {
      const res = await fetch(`/api/trash?channel=${encodeURIComponent(selectedKey)}&all=1`, {
        method: 'DELETE',
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Erro ao esvaziar lixeira');
      state.trashItems = Array.isArray(json.items) ? json.items : [];
      state.trashChannel = selectedKey;
      if (json.state) state.data = normalizePayload(json.state);
      updateHeaderChrome();
      refreshSettingsHealthCard(selectedKey);
      showToast('Lixeira esvaziada permanentemente.');
    } catch (err) {
      showToast(err.message);
    }
  });

  container.querySelectorAll('[data-trash-restore]').forEach((btn) => {
    btn.onclick = async () => {
      const trashId = btn.dataset.trashRestore;
      try {
        const res = await fetch('/api/trash/restore', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ channel: selectedKey, id: trashId }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Erro ao restaurar item');
        if (json.state) state.data = normalizePayload(json.state);
        state.notesState.channel = '';
        state.catalogCuradoriaChannel = '';
        state.wbListFetchedChannel = '';
        await loadTrashForChannel(selectedKey, { force: true, rerender: true });
        updateHeaderChrome();
        const targetInfo = json.restored?.targetPath ? ` (${json.restored.targetPath})` : '';
        showToast(`Item restaurado com sucesso${targetInfo}!`);
      } catch (err) {
        showToast(err.message);
      }
    };
  });

  container.querySelectorAll('[data-trash-purge]').forEach((btn) => {
    btn.onclick = async () => {
      const trashId = btn.dataset.trashPurge;
      if (!confirm('Excluir permanentemente este item da lixeira?')) return;
      try {
        const res = await fetch(
          `/api/trash?channel=${encodeURIComponent(selectedKey)}&id=${encodeURIComponent(trashId)}`,
          { method: 'DELETE' }
        );
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Erro ao excluir item');
        state.trashItems = Array.isArray(json.items) ? json.items : [];
        state.trashChannel = selectedKey;
        if (json.state) state.data = normalizePayload(json.state);
        updateHeaderChrome();
        refreshSettingsHealthCard(selectedKey);
        showToast('Item removido permanentemente da lixeira.');
      } catch (err) {
        showToast(err.message);
      }
    };
  });
}
