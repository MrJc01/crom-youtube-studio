import { KANBAN_COLS, MD } from '../core/constants.js';
import { openNewDocModal } from '../core/modals.js';
import { renderCurrentView, setView, updateHeaderChrome } from '../core/router.js';
import {
  activeFilename,
  getActiveChannelData,
  persistSaveDoc,
  registerViewRenderer,
} from '../core/state.js';
import { formatDatePt, showToast } from '../core/utils.js';

export async function moveDocStatus(docPath, nextStatus) {
  const chData = getActiveChannelData();
  const doc = (chData.docs || []).find((d) => d.path === docPath);
  if (!doc || doc.meta.status === nextStatus) return;

  const updatedMeta = { ...doc.meta, status: nextStatus };
  let newPath = null;
  if (doc.topFolder === '02-roteiros') {
    let targetSub = null;
    if (['ideia', 'pesquisa', 'roteiro'].includes(nextStatus)) targetSub = '02-roteiros/rascunhos';
    else if (['gravando', 'edicao'].includes(nextStatus)) targetSub = '02-roteiros/em-producao';
    else if (nextStatus === 'publicado') targetSub = '02-roteiros/publicados';
    if (targetSub && doc.folder !== targetSub) {
      newPath = `${targetSub}/${activeFilename(doc)}`;
    }
  }

  try {
    await persistSaveDoc(doc.path, MD.serializeFrontmatter(updatedMeta, doc.body), newPath);
    updateHeaderChrome();
    renderCurrentView();
    showToast(`Status alterado para "${nextStatus}"!`);
  } catch (err) {
    showToast(err.message);
  }
}

export function renderPipelineView(container) {
  const chData = getActiveChannelData();
  const docs = (chData.docs || []).filter(
    (d) => d.meta.status !== 'referencia' && d.meta.status !== 'template' && d.meta.status !== 'arquivado'
  );

  container.innerHTML = `
    <div class="section-subhead">
      <div>
        <span style="color:var(--text-2); font-size:13px;">Canal <strong>${MD.escapeHtml(chData.channel.name)}</strong> — arraste os cards entre colunas ou avance o estágio diretamente no arquivo .md.</span>
      </div>
      <button type="button" class="btn-sm btn-accent" id="kanbanNewBtn">+ Novo Item no Pipeline</button>
    </div>

    <div class="kanban-board">
      ${KANBAN_COLS.map((col, colIdx) => {
        const items = docs.filter((d) => d.meta.status === col.key);
        const nextCol = KANBAN_COLS[colIdx + 1];
        return `
          <div class="kanban-col" data-kanban-col="${col.key}">
            <div class="kanban-col-head">
              <span>${col.label}</span>
              <span class="kanban-count">${items.length}</span>
            </div>
            ${items
              .map(
                (d) => `
                  <div class="kanban-card" draggable="true" data-drag-path="${MD.escapeHtml(d.path)}" data-doc-path="${MD.escapeHtml(d.path)}">
                    <div style="display:flex; justify-content:space-between; align-items:center; gap:6px;">
                      <span class="status-pill st-${MD.escapeHtml(d.meta.status)}" style="font-size:9.5px;">${MD.escapeHtml(d.meta.formato === 'short' ? 'Short' : 'Longo')}</span>
                      <span style="font-family:var(--font-mono); font-size:10px; color:var(--text-3);">${d.stats.words} pal.</span>
                    </div>
                    <div class="kc-title" data-open-doc="${MD.escapeHtml(d.path)}" style="cursor:pointer;">${MD.escapeHtml(d.meta.titulo)}</div>
                    <div style="font-size:11px; color:var(--text-3);">${MD.escapeHtml(d.meta.serie)}</div>
                    <div class="kc-foot">
                      <span>${d.meta.data_alvo ? formatDatePt(d.meta.data_alvo) : 'Sem data'}</span>
                      ${nextCol ? `<button type="button" class="kc-move-btn" data-move-path="${MD.escapeHtml(d.path)}" data-next-status="${nextCol.key}">→ ${nextCol.label}</button>` : '<span>✓ No ar</span>'}
                    </div>
                  </div>
                `
              )
              .join('')}
          </div>
        `;
      }).join('')}
    </div>
  `;

  document.getElementById('kanbanNewBtn').onclick = () => openNewDocModal();

  container.querySelectorAll('[data-open-doc]').forEach((el) => {
    el.onclick = () => setView('scripts', el.dataset.openDoc);
  });

  container.querySelectorAll('[data-move-path]').forEach((btn) => {
    btn.onclick = (e) => {
      e.stopPropagation();
      moveDocStatus(btn.dataset.movePath, btn.dataset.nextStatus);
    };
  });

  let draggedPath = null;
  container.querySelectorAll('.kanban-card').forEach((card) => {
    card.ondragstart = () => {
      draggedPath = card.dataset.dragPath;
    };
  });
  container.querySelectorAll('.kanban-col').forEach((col) => {
    col.ondragover = (e) => {
      e.preventDefault();
      col.classList.add('is-drop-target');
    };
    col.ondragleave = () => col.classList.remove('is-drop-target');
    col.ondrop = (e) => {
      e.preventDefault();
      col.classList.remove('is-drop-target');
      if (draggedPath) {
        moveDocStatus(draggedPath, col.dataset.kanbanCol);
        draggedPath = null;
      }
    };
  });
}

registerViewRenderer('pipeline', renderPipelineView);
