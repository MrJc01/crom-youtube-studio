import { KEEP_COLORS, MD } from '../core/constants.js';
import { setView } from '../core/router.js';
import {
  getActiveChannelData,
  normalizePayload,
  registerLifecycleHooks,
  registerViewRenderer,
  state,
} from '../core/state.js';
import { formatDatePt, showToast } from '../core/utils.js';

export async function loadNotesForChannel(channelKey, { rerender = true } = {}) {
  if (!state.serverMode) return;
  state.notesState.loading = true;
  try {
    const res = await fetch(`/api/notes?channel=${encodeURIComponent(channelKey)}`, { cache: 'no-store' });
    const json = await res.json();
    if (res.ok) {
      state.notesState.notes = Array.isArray(json.notes) ? json.notes : [];
      state.notesState.gistSync = json.gistSync || null;
      state.notesState.channel = channelKey;
    }
  } catch {
    // ignora
  } finally {
    state.notesState.loading = false;
    if (rerender && state.view === 'notes' && state.activeChannel === channelKey) {
      renderNotesView(document.getElementById('viewContainer'));
    }
  }
}

export function openNoteEditModal(note) {
  const chData = getActiveChannelData();
  const modal = document.getElementById('noteEditModal');
  const body = document.getElementById('noteEditModalBody');
  if (!modal || !body || !note) return;

  let editColor = note.color || 'default';
  let editKind = note.kind || 'note';
  let editPinned = Boolean(note.pinned);
  let editChecklist = Array.isArray(note.checklist)
    ? note.checklist.map((it) => ({ ...it }))
    : [];

  const renderModalContent = () => {
    body.innerHTML = `
      <form id="noteEditForm" style="display:flex; flex-direction:column; gap:10px;">
        <label>
          <span>Título</span>
          <input type="text" id="noteEditTitleInp" value="${MD.escapeHtml(note.title || '')}" placeholder="Título da nota...">
        </label>
        <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; flex-wrap:wrap;">
          <div class="mode-switch" id="noteEditKindSwitch">
            <button type="button" class="${editKind === 'note' ? 'active' : ''}" data-nek="note">Texto</button>
            <button type="button" class="${editKind === 'checklist' ? 'active' : ''}" data-nek="checklist">☑ Checklist</button>
          </div>
          <button type="button" class="btn-sm${editPinned ? ' btn-accent' : ''}" id="noteEditPinBtn">${editPinned ? '📌 Fixada' : '📌 Fixar'}</button>
        </div>
        ${editKind === 'checklist'
          ? `<div style="display:flex; flex-direction:column; gap:6px;">
              ${editChecklist
                .map(
                  (it, idx) => `
                    <div style="display:flex; align-items:center; gap:6px;">
                      <input type="checkbox" data-ne-chk-done="${idx}"${it.done ? ' checked' : ''} style="width:auto;">
                      <input type="text" data-ne-chk-text="${idx}" value="${MD.escapeHtml(it.text || '')}" placeholder="Item da lista..." style="flex:1;">
                      <button type="button" class="btn-sm btn-danger" data-ne-chk-del="${idx}">✕</button>
                    </div>
                  `
                )
                .join('')}
              <div><button type="button" class="btn-sm" id="noteEditAddChkBtn">+ Adicionar item</button></div>
            </div>`
          : `<label>
              <span>Conteúdo</span>
              <textarea id="noteEditContentInp" rows="5" placeholder="Escreva sua ideia, gancho ou anotação...">${MD.escapeHtml(note.content || '')}</textarea>
            </label>`}
        <div class="form-row-2">
          <label>
            <span>Tags / Labels (vírgula)</span>
            <input type="text" id="noteEditLabelsInp" value="${MD.escapeHtml((note.labels || []).join(', '))}" placeholder="gancho, urgente, ideia">
          </label>
          <label>
            <span>Link opcional</span>
            <input type="url" id="noteEditUrlInp" value="${MD.escapeHtml(note.linkedUrl || '')}" placeholder="https://...">
          </label>
        </div>
        <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap;">
          <div class="keep-color-dots">
            ${KEEP_COLORS.map(
              (c) => `<button type="button" class="keep-color-dot${editColor === c.id ? ' is-active' : ''}" data-ne-color="${c.id}" style="background:${c.dot};" title="${MD.escapeHtml(c.label)}"></button>`
            ).join('')}
          </div>
          <div style="display:flex; gap:8px;">
            <button type="button" class="btn-ghost" data-close-modal="noteEditModal">Cancelar</button>
            <button type="submit" class="btn-primary">Salvar Nota</button>
          </div>
        </div>
      </form>
    `;

    body.querySelectorAll('[data-close-modal]').forEach((b) => {
      b.onclick = () => modal.classList.add('hidden');
    });
    body.querySelectorAll('#noteEditKindSwitch button').forEach((b) => {
      b.onclick = () => {
        editKind = b.dataset.nek;
        if (editKind === 'checklist' && !editChecklist.length) {
          editChecklist = [{ id: `c-${Date.now()}`, text: '', done: false }];
        }
        renderModalContent();
      };
    });
    document.getElementById('noteEditPinBtn').onclick = () => {
      editPinned = !editPinned;
      renderModalContent();
    };
    body.querySelectorAll('[data-ne-color]').forEach((b) => {
      b.onclick = () => {
        editColor = b.dataset.neColor;
        renderModalContent();
      };
    });
    body.querySelectorAll('[data-ne-chk-done]').forEach((chk) => {
      chk.onchange = () => {
        editChecklist[Number(chk.dataset.neChkDone)].done = chk.checked;
      };
    });
    body.querySelectorAll('[data-ne-chk-text]').forEach((inp) => {
      inp.oninput = () => {
        editChecklist[Number(inp.dataset.neChkText)].text = inp.value;
      };
    });
    body.querySelectorAll('[data-ne-chk-del]').forEach((b) => {
      b.onclick = () => {
        editChecklist.splice(Number(b.dataset.neChkDel), 1);
        renderModalContent();
      };
    });
    document.getElementById('noteEditAddChkBtn')?.addEventListener('click', () => {
      editChecklist.push({ id: `c-${Date.now()}`, text: '', done: false });
      renderModalContent();
    });

    document.getElementById('noteEditForm').onsubmit = async (e) => {
      e.preventDefault();
      const title = document.getElementById('noteEditTitleInp')?.value || '';
      const content = document.getElementById('noteEditContentInp')?.value ?? note.content ?? '';
      const labels = document.getElementById('noteEditLabelsInp')?.value || '';
      const linkedUrl = document.getElementById('noteEditUrlInp')?.value.trim() || '';
      const cleanChecklist = editChecklist.filter((it) => it.text.trim());

      try {
        const res = await fetch('/api/notes', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            channel: chData.key,
            id: note.id,
            title,
            content: editKind === 'note' ? content : '',
            kind: editKind,
            checklist: editKind === 'checklist' ? cleanChecklist : [],
            color: editColor,
            pinned: editPinned,
            labels,
            linkedUrl,
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Erro ao atualizar nota');
        state.notesState.notes = json.notes || [];
        state.notesState.gistSync = json.gistSync || state.notesState.gistSync;
        if (json.state) state.data = normalizePayload(json.state);
        modal.classList.add('hidden');
        renderNotesView(document.getElementById('viewContainer'));
        showToast('Nota atualizada!');
      } catch (err) {
        showToast(err.message);
      }
    };
  };

  renderModalContent();
  modal.classList.remove('hidden');
}

export function renderNotesView(container) {
  if (!container) return;
  const chData = getActiveChannelData();
  const ns = state.notesState;

  if (state.serverMode && ns.channel !== chData.key && !ns.loading) {
    loadNotesForChannel(chData.key, { rerender: true });
  }

  const allNotes = ns.notes || [];
  const labelsSet = new Set();
  for (const n of allNotes) {
    for (const l of n.labels || []) labelsSet.add(l);
  }

  const filterNote = (n) => {
    if (!ns.showArchived && n.archived) return false;
    if (ns.showArchived && !n.archived) return false;
    if (ns.colorFilter !== 'all' && (n.color || 'default') !== ns.colorFilter) return false;
    if (ns.labelFilter !== 'all' && !(n.labels || []).includes(ns.labelFilter)) return false;
    if (ns.search) {
      const q = ns.search.toLowerCase();
      const chkTxt = (n.checklist || []).map((c) => c.text).join(' ');
      const hay = `${n.title} ${n.content} ${chkTxt} ${(n.labels || []).join(' ')} ${n.linkedUrl || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  };

  const visibleNotes = allNotes.filter(filterNote);
  const pinnedNotes = visibleNotes.filter((n) => n.pinned);
  const otherNotes = visibleNotes.filter((n) => !n.pinned);

  const renderKeepCard = (n) => {
    const colorClass = `kc-${KEEP_COLORS.some((c) => c.id === n.color) ? n.color : 'default'}`;
    const isHighlighted = ns.highlightNoteId && ns.highlightNoteId === n.id;
    const checklistHtml = (n.checklist || []).length
      ? `<div class="keep-checklist">
          ${(n.checklist || [])
            .map(
              (it) => `
                <label class="keep-check-item${it.done ? ' is-done' : ''}">
                  <input type="checkbox" data-note-chk="${MD.escapeHtml(n.id)}::${MD.escapeHtml(it.id)}"${it.done ? ' checked' : ''}>
                  <span>${MD.escapeHtml(it.text)}</span>
                </label>
              `
            )
            .join('')}
        </div>`
      : '';

    return `
      <article class="keep-card ${colorClass}${isHighlighted ? ' is-highlighted' : ''}" data-note-id="${MD.escapeHtml(n.id)}">
        <div class="keep-card-head">
          <h3 class="keep-card-title">${MD.escapeHtml(n.title || (n.kind === 'checklist' ? 'Checklist' : 'Nota'))}</h3>
          <button type="button" class="btn-sm${n.pinned ? ' btn-accent' : ''}" data-note-pin="${MD.escapeHtml(n.id)}" title="${n.pinned ? 'Desafixar' : 'Fixar no topo'}">📌</button>
        </div>
        ${n.content ? `<p class="keep-card-body">${MD.escapeHtml(n.content)}</p>` : ''}
        ${checklistHtml}
        ${(n.labels || []).length
          ? `<div class="cat-chip-row">${n.labels.map((l) => `<span class="cat-tag-chip" style="padding:1px 7px; font-size:10.5px;">#${MD.escapeHtml(l)}</span>`).join('')}</div>`
          : ''}
        ${n.linkedUrl
          ? `<a href="${MD.escapeHtml(n.linkedUrl)}" target="_blank" rel="noopener noreferrer" data-ext-url="${MD.escapeHtml(n.linkedUrl)}" data-ext-title="${MD.escapeHtml(n.title || n.linkedUrl)}" style="font-family:var(--font-mono); font-size:11px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">🔗 ${MD.escapeHtml(n.linkedUrl)}</a>`
          : ''}
        ${n.linkedDocPath
          ? `<div><button type="button" class="kc-move-btn" data-open-doc="${MD.escapeHtml(n.linkedDocPath)}">📄 ${MD.escapeHtml(n.linkedDocPath)}</button></div>`
          : ''}

        <div class="keep-card-actions">
          <div class="keep-color-dots">
            ${KEEP_COLORS.map(
              (c) => `<button type="button" class="keep-color-dot${(n.color || 'default') === c.id ? ' is-active' : ''}" data-note-color="${MD.escapeHtml(n.id)}::${c.id}" style="width:14px; height:14px; background:${c.dot};" title="${MD.escapeHtml(c.label)}"></button>`
            ).join('')}
          </div>
          <div style="display:flex; gap:5px; flex-wrap:wrap;">
            <button type="button" class="btn-sm" data-note-edit="${MD.escapeHtml(n.id)}">✎ Editar</button>
            <button type="button" class="btn-sm btn-accent" data-note-todoc="${MD.escapeHtml(n.id)}::roteiro" title="Transformar em Roteiro (.md)">→ Roteiro</button>
            <button type="button" class="btn-sm" data-note-todoc="${MD.escapeHtml(n.id)}::ideia" title="Transformar em Ideia (.md)">→ Ideia</button>
            <button type="button" class="btn-sm" data-note-archive="${MD.escapeHtml(n.id)}" title="${n.archived ? 'Restaurar' : 'Arquivar'}">${n.archived ? '↩' : '📦'}</button>
            <button type="button" class="btn-sm btn-danger" data-note-del="${MD.escapeHtml(n.id)}" title="Mover para Lixeira">✕</button>
          </div>
        </div>
      </article>
    `;
  };

  const gs = ns.gistSync || {};
  const gistHintBox = gs.lastError
    ? `<div class="settings-toggle-row" style="margin-bottom:14px; border-color:rgba(245,185,66,0.35); background:rgba(245,185,66,0.08); font-size:12px;">
        <div>
          <strong style="color:#ffd479;">Sync Gist Privado:</strong> ${MD.escapeHtml(gs.lastError)}
          ${gs.lastHint ? `<div style="font-size:11px; color:var(--text-2); margin-top:2px;">💡 ${MD.escapeHtml(gs.lastHint)}</div>` : ''}
        </div>
      </div>`
    : gs.gistUrl
    ? `<div class="settings-toggle-row" style="margin-bottom:14px; border-color:rgba(54,211,153,0.32); background:rgba(54,211,153,0.07); font-size:12px;">
        <div>
          <strong style="color:#86efac;">☁️ Gist Privado sincronizado</strong>
          ${gs.lastSyncedAt ? `<span style="color:var(--text-3); margin-left:6px;">(${formatDatePt(gs.lastSyncedAt)})</span>` : ''}
        </div>
        <a class="btn-sm" href="${MD.escapeHtml(gs.gistUrl)}" target="_blank" rel="noopener noreferrer">Abrir Gist Privado ↗</a>
      </div>`
    : '';

  container.innerHTML = `
    <div class="keep-toolbar">
      <div class="cat-toolbar-group">
        <input type="search" class="search-box-sm" id="keepSearchInput" placeholder="Buscar notas, checklists ou tags..." value="${MD.escapeHtml(ns.search)}" style="width:220px; margin:0; height:32px;">
        <select class="select-dark" id="keepColorFilterSel">
          <option value="all"${ns.colorFilter === 'all' ? ' selected' : ''}>Todas as cores</option>
          ${KEEP_COLORS.map((c) => `<option value="${c.id}"${ns.colorFilter === c.id ? ' selected' : ''}>${MD.escapeHtml(c.label)}</option>`).join('')}
        </select>
        <select class="select-dark" id="keepLabelFilterSel">
          <option value="all"${ns.labelFilter === 'all' ? ' selected' : ''}>Todas as tags</option>
          ${Array.from(labelsSet).sort().map((l) => `<option value="${MD.escapeHtml(l)}"${ns.labelFilter === l ? ' selected' : ''}>#${MD.escapeHtml(l)}</option>`).join('')}
        </select>
        <button type="button" class="btn-sm${ns.showArchived ? ' btn-accent' : ''}" id="keepToggleArchivedBtn">${ns.showArchived ? '📦 Vendo Arquivadas' : '📦 Mostrar Arquivadas'}</button>
      </div>

      <div class="cat-toolbar-group">
        <button type="button" class="btn-sm btn-accent" id="keepSyncGistBtn">☁️ Sync Gist Privado</button>
        <button type="button" class="btn-sm" data-keep-export="json">⤓ Exportar JSON</button>
        <button type="button" class="btn-sm" data-keep-export="md">⤓ MD</button>
        <button type="button" class="btn-sm" data-keep-export="txt">⤓ TXT</button>
        <button type="button" class="btn-sm" id="keepImportBtn">⤒ Importar JSON</button>
        <input type="file" id="keepImportFileInput" accept=".json,application/json" hidden>
      </div>
    </div>

    ${gistHintBox}

    <section class="keep-composer${ns.composerColor !== 'default' ? ` kc-${ns.composerColor}` : ''}" id="keepComposerBox">
      ${ns.composerExpanded
        ? `
          <div style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
            <input type="text" class="keep-composer-title" id="keepCompTitle" placeholder="Título da nota..." value="${MD.escapeHtml(ns.compTitleDraft || '')}">
            <button type="button" class="btn-sm${ns.composerPinned ? ' btn-accent' : ''}" id="keepCompPinBtn" title="Fixar nota">📌</button>
          </div>
          ${ns.composerKind === 'checklist'
            ? `<div style="display:flex; flex-direction:column; gap:6px;">
                ${(ns.composerChecklist || [])
                  .map(
                    (it, idx) => `
                      <div style="display:flex; align-items:center; gap:6px;">
                        <input type="checkbox" data-comp-chk-done="${idx}"${it.done ? ' checked' : ''} style="width:auto;">
                        <input type="text" data-comp-chk-text="${idx}" placeholder="Item da checklist..." value="${MD.escapeHtml(it.text || '')}" style="flex:1; border-bottom:1px solid var(--border-soft); padding:4px 0;">
                        <button type="button" class="btn-sm" data-comp-chk-del="${idx}">✕</button>
                      </div>
                    `
                  )
                  .join('')}
                <div><button type="button" class="btn-sm" id="keepCompAddChkBtn">+ Adicionar item</button></div>
              </div>`
            : `<textarea id="keepCompBody" rows="3" placeholder="Escreva sua ideia, gancho ou anotação rápida...">${MD.escapeHtml(ns.compBodyDraft || '')}</textarea>`}
          <div class="form-row-2">
            <input type="text" id="keepCompLabels" placeholder="Tags separadas por vírgula (ex.: shorts, pauta)" value="${MD.escapeHtml(ns.compLabelsDraft || '')}" style="border-bottom:1px solid var(--border-soft); padding:5px 0; font-size:12px;">
            <input type="url" id="keepCompUrl" placeholder="Link opcional (https://...)" value="${MD.escapeHtml(ns.compUrlDraft || '')}" style="border-bottom:1px solid var(--border-soft); padding:5px 0; font-size:12px;">
          </div>
          <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap; padding-top:4px; border-top:1px solid var(--border-soft);">
            <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
              <button type="button" class="btn-sm" id="keepCompToggleKindBtn">${ns.composerKind === 'checklist' ? '✎ Modo Texto' : '☑ Modo Checklist'}</button>
              <div class="keep-color-dots">
                ${KEEP_COLORS.map(
                  (c) => `<button type="button" class="keep-color-dot${ns.composerColor === c.id ? ' is-active' : ''}" data-comp-color="${c.id}" style="background:${c.dot};" title="${MD.escapeHtml(c.label)}"></button>`
                ).join('')}
              </div>
            </div>
            <div style="display:flex; gap:8px;">
              <button type="button" class="btn-sm" id="keepCompCloseBtn">Fechar</button>
              <button type="button" class="btn-sm btn-accent" id="keepCompSaveBtn">Salvar Nota</button>
            </div>
          </div>
        `
        : `
          <div style="display:flex; align-items:center; justify-content:space-between; gap:10px;">
            <button type="button" id="keepCompExpandBtn" style="flex:1; text-align:left; font-size:13.5px; color:var(--text-2); padding:4px 2px;">Criar uma nota...</button>
            <button type="button" class="btn-sm" id="keepCompQuickChecklistBtn">☑ Nova Checklist</button>
          </div>
        `}
    </section>

    ${!state.serverMode
      ? '<div class="glass-card"><p style="margin:0; color:var(--text-3);">As Notas estilo Keep e Sync Gist Privado funcionam com o servidor local ativo.</p></div>'
      : visibleNotes.length === 0
      ? `<div class="glass-card"><p style="margin:0; color:var(--text-3);">${ns.showArchived ? 'Nenhuma nota arquivada.' : 'Nenhuma nota encontrada. Crie uma nota acima!'}</p></div>`
      : ns.showArchived
      ? `<div class="keep-section-label">ARQUIVADAS (${visibleNotes.length})</div><div class="keep-grid">${visibleNotes.map(renderKeepCard).join('')}</div>`
      : `
        ${pinnedNotes.length ? `<div class="keep-section-label">FIXADAS (${pinnedNotes.length})</div><div class="keep-grid">${pinnedNotes.map(renderKeepCard).join('')}</div>` : ''}
        ${otherNotes.length ? `<div class="keep-section-label">${pinnedNotes.length ? 'OUTRAS' : 'NOTAS'} (${otherNotes.length})</div><div class="keep-grid">${otherNotes.map(renderKeepCard).join('')}</div>` : ''}
      `}
  `;

  if (ns.highlightNoteId) {
    const targetId = ns.highlightNoteId;
    const highlightedEl = Array.from(container.querySelectorAll('.keep-card[data-note-id]')).find(
      (el) => el.dataset.noteId === targetId
    );
    if (highlightedEl) {
      highlightedEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => {
        if (ns.highlightNoteId === targetId) ns.highlightNoteId = '';
        highlightedEl.classList.remove('is-highlighted');
      }, 2600);
    }
  }

  const searchInp = document.getElementById('keepSearchInput');
  if (searchInp) {
    searchInp.oninput = () => {
      ns.search = searchInp.value;
      const pos = searchInp.selectionStart;
      renderNotesView(container);
      const again = document.getElementById('keepSearchInput');
      if (again) {
        again.focus();
        again.setSelectionRange(pos, pos);
      }
    };
  }
  document.getElementById('keepColorFilterSel')?.addEventListener('change', (e) => {
    ns.colorFilter = e.target.value;
    renderNotesView(container);
  });
  document.getElementById('keepLabelFilterSel')?.addEventListener('change', (e) => {
    ns.labelFilter = e.target.value;
    renderNotesView(container);
  });
  document.getElementById('keepToggleArchivedBtn')?.addEventListener('click', () => {
    ns.showArchived = !ns.showArchived;
    renderNotesView(container);
  });

  document.getElementById('keepSyncGistBtn')?.addEventListener('click', async () => {
    if (!state.serverMode) return showToast('Requer servidor local ativo.');
    showToast('Sincronizando com Gist privado...');
    try {
      const res = await fetch('/api/notes/sync-gist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: chData.key, mode: 'sync' }),
      });
      const json = await res.json();
      ns.notes = json.notes || ns.notes;
      ns.gistSync = { ...(json.gistSync || {}), lastHint: json.hint || '' };
      if (json.state) state.data = normalizePayload(json.state);
      renderNotesView(container);
      if (json.ok) {
        showToast('Notas sincronizadas no GitHub Gist privado!');
      } else {
        showToast(json.error || 'Falha no sync Gist.');
      }
    } catch (err) {
      showToast(err.message);
    }
  });

  container.querySelectorAll('[data-keep-export]').forEach((btn) => {
    btn.onclick = () => {
      if (!state.serverMode) return showToast('Requer servidor local ativo.');
      const fmt = btn.dataset.keepExport;
      globalThis.open(`/api/notes/export?channel=${encodeURIComponent(chData.key)}&format=${encodeURIComponent(fmt)}`, '_blank', 'noopener');
    };
  });

  const importFileInp = document.getElementById('keepImportFileInput');
  document.getElementById('keepImportBtn')?.addEventListener('click', () => importFileInp?.click());
  importFileInp?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const notesPayload = Array.isArray(parsed) ? parsed : parsed.notes;
      const res = await fetch('/api/notes/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: chData.key, notes: notesPayload, mode: 'merge' }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Erro ao importar JSON');
      ns.notes = json.notes || [];
      if (json.state) state.data = normalizePayload(json.state);
      renderNotesView(container);
      showToast(`${json.importedCount || 0} nota(s) importada(s)!`);
    } catch (err) {
      showToast(`Erro na importação: ${err.message}`);
    } finally {
      e.target.value = '';
    }
  });

  document.getElementById('keepCompExpandBtn')?.addEventListener('click', () => {
    ns.composerExpanded = true;
    ns.composerKind = 'note';
    renderNotesView(container);
    document.getElementById('keepCompTitle')?.focus();
  });
  document.getElementById('keepCompQuickChecklistBtn')?.addEventListener('click', () => {
    ns.composerExpanded = true;
    ns.composerKind = 'checklist';
    if (!ns.composerChecklist?.length) ns.composerChecklist = [{ id: 'c1', text: '', done: false }];
    renderNotesView(container);
  });
  document.getElementById('keepCompPinBtn')?.addEventListener('click', () => {
    ns.composerPinned = !ns.composerPinned;
    renderNotesView(container);
  });
  document.getElementById('keepCompToggleKindBtn')?.addEventListener('click', () => {
    ns.composerKind = ns.composerKind === 'checklist' ? 'note' : 'checklist';
    if (ns.composerKind === 'checklist' && !ns.composerChecklist?.length) {
      ns.composerChecklist = [{ id: 'c1', text: '', done: false }];
    }
    renderNotesView(container);
  });
  document.getElementById('keepCompCloseBtn')?.addEventListener('click', () => {
    ns.composerExpanded = false;
    renderNotesView(container);
  });
  document.getElementById('keepCompTitle')?.addEventListener('input', (e) => { ns.compTitleDraft = e.target.value; });
  document.getElementById('keepCompBody')?.addEventListener('input', (e) => { ns.compBodyDraft = e.target.value; });
  document.getElementById('keepCompLabels')?.addEventListener('input', (e) => { ns.compLabelsDraft = e.target.value; });
  document.getElementById('keepCompUrl')?.addEventListener('input', (e) => { ns.compUrlDraft = e.target.value; });

  container.querySelectorAll('[data-comp-color]').forEach((btn) => {
    btn.onclick = () => {
      ns.composerColor = btn.dataset.compColor;
      renderNotesView(container);
    };
  });
  container.querySelectorAll('[data-comp-chk-done]').forEach((chk) => {
    chk.onchange = () => {
      ns.composerChecklist[Number(chk.dataset.compChkDone)].done = chk.checked;
    };
  });
  container.querySelectorAll('[data-comp-chk-text]').forEach((inp) => {
    inp.oninput = () => {
      ns.composerChecklist[Number(inp.dataset.compChkText)].text = inp.value;
    };
    inp.onkeydown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        ns.composerChecklist.push({ id: `c-${Date.now()}`, text: '', done: false });
        renderNotesView(container);
      }
    };
  });
  container.querySelectorAll('[data-comp-chk-del]').forEach((btn) => {
    btn.onclick = () => {
      ns.composerChecklist.splice(Number(btn.dataset.compChkDel), 1);
      renderNotesView(container);
    };
  });
  document.getElementById('keepCompAddChkBtn')?.addEventListener('click', () => {
    ns.composerChecklist.push({ id: `c-${Date.now()}`, text: '', done: false });
    renderNotesView(container);
  });

  document.getElementById('keepCompSaveBtn')?.addEventListener('click', async () => {
    if (!state.serverMode) return showToast('Requer servidor local ativo.');
    const title = (document.getElementById('keepCompTitle')?.value ?? ns.compTitleDraft ?? '').trim();
    const content = (document.getElementById('keepCompBody')?.value ?? ns.compBodyDraft ?? '').trim();
    const labelsVal = document.getElementById('keepCompLabels')?.value ?? ns.compLabelsDraft ?? '';
    const urlVal = document.getElementById('keepCompUrl')?.value ?? ns.compUrlDraft ?? '';
    const cleanChecklist = (ns.composerChecklist || []).filter((it) => it.text.trim());
    if (!title && !content && !cleanChecklist.length) {
      showToast('Digite um título, texto ou item de checklist.');
      return;
    }
    try {
      const res = await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel: chData.key,
          title,
          content: ns.composerKind === 'note' ? content : '',
          kind: ns.composerKind,
          checklist: ns.composerKind === 'checklist' ? cleanChecklist : [],
          color: ns.composerColor,
          pinned: ns.composerPinned,
          labels: labelsVal,
          linkedUrl: urlVal,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Erro ao salvar nota');
      ns.notes = json.notes || [];
      ns.gistSync = json.gistSync || ns.gistSync;
      if (json.state) state.data = normalizePayload(json.state);
      ns.composerExpanded = false;
      ns.compTitleDraft = '';
      ns.compBodyDraft = '';
      ns.compLabelsDraft = '';
      ns.compUrlDraft = '';
      ns.composerPinned = false;
      ns.composerColor = 'default';
      ns.composerChecklist = [{ id: 'c1', text: '', done: false }];
      renderNotesView(container);
      showToast('Nota criada!');
    } catch (err) {
      showToast(err.message);
    }
  });

  const patchNote = async (noteId, patch, toastMsg = '') => {
    if (!state.serverMode) return;
    try {
      const res = await fetch('/api/notes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: chData.key, id: noteId, ...patch }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Erro ao atualizar nota');
      ns.notes = json.notes || [];
      if (json.state) state.data = normalizePayload(json.state);
      renderNotesView(container);
      if (toastMsg) showToast(toastMsg);
    } catch (err) {
      showToast(err.message);
    }
  };

  container.querySelectorAll('[data-note-pin]').forEach((btn) => {
    btn.onclick = () => {
      const note = allNotes.find((x) => x.id === btn.dataset.notePin);
      if (note) patchNote(note.id, { pinned: !note.pinned });
    };
  });
  container.querySelectorAll('[data-note-color]').forEach((btn) => {
    btn.onclick = () => {
      const [noteId, color] = btn.dataset.noteColor.split('::');
      patchNote(noteId, { color });
    };
  });
  container.querySelectorAll('[data-note-chk]').forEach((chk) => {
    chk.onchange = () => {
      const [noteId, itemId] = chk.dataset.noteChk.split('::');
      const note = allNotes.find((x) => x.id === noteId);
      if (!note) return;
      const nextList = (note.checklist || []).map((it) => (it.id === itemId ? { ...it, done: chk.checked } : it));
      patchNote(noteId, { checklist: nextList });
    };
  });
  container.querySelectorAll('[data-note-edit]').forEach((btn) => {
    btn.onclick = () => {
      const note = allNotes.find((x) => x.id === btn.dataset.noteEdit);
      if (note) openNoteEditModal(note);
    };
  });
  container.querySelectorAll('[data-note-archive]').forEach((btn) => {
    btn.onclick = () => {
      const note = allNotes.find((x) => x.id === btn.dataset.noteArchive);
      if (note) patchNote(note.id, { archived: !note.archived }, note.archived ? 'Nota restaurada!' : 'Nota arquivada.');
    };
  });
  container.querySelectorAll('[data-note-del]').forEach((btn) => {
    btn.onclick = async () => {
      if (!confirm('Mover esta nota para a Lixeira (recuperável por 30 dias)?')) return;
      try {
        const res = await fetch(`/api/notes?channel=${encodeURIComponent(chData.key)}&id=${encodeURIComponent(btn.dataset.noteDel)}`, {
          method: 'DELETE',
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Erro ao excluir nota');
        ns.notes = json.notes || [];
        state.trashChannel = '';
        if (json.state) state.data = normalizePayload(json.state);
        renderNotesView(container);
        showToast('Nota movida para a Lixeira (recuperável por 30 dias).');
      } catch (err) {
        showToast(err.message);
      }
    };
  });
  container.querySelectorAll('[data-note-todoc]').forEach((btn) => {
    btn.onclick = async () => {
      const [noteId, targetType] = btn.dataset.noteTodoc.split('::');
      try {
        const res = await fetch('/api/notes/to-doc', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ channel: chData.key, noteId, targetType }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Erro ao converter nota em .md');
        if (json.state) state.data = normalizePayload(json.state);
        showToast(`Criado ${json.docPath}!`);
        setView('scripts', json.docPath);
      } catch (err) {
        showToast(err.message);
      }
    };
  });
  container.querySelectorAll('[data-open-doc]').forEach((btn) => {
    btn.onclick = () => setView('scripts', btn.dataset.openDoc);
  });
}

registerViewRenderer('notes', renderNotesView);
registerLifecycleHooks({ loadNotesForChannel });
