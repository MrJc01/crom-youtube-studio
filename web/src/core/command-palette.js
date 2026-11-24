import { MD } from './constants.js';
import { setView } from './router.js';
import { getActiveChannelData, state } from './state.js';
import { formatDatePt, formatNumber } from './utils.js';

let flatResults = [];

export async function prefetchUnifiedSearchSources() {
  if (!state.serverMode) return;
  const chKey = state.activeChannel;
  const tasks = [];

  if (state.notesState.channel !== chKey && !state.notesState.loading) {
    tasks.push(
      fetch(`/api/notes?channel=${encodeURIComponent(chKey)}`, { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : null))
        .then((json) => {
          if (json && state.activeChannel === chKey) {
            state.notesState.notes = Array.isArray(json.notes) ? json.notes : [];
            state.notesState.gistSync = json.gistSync || state.notesState.gistSync;
            state.notesState.channel = chKey;
          }
        })
        .catch(() => {})
    );
  }

  if (state.recorder.sessionsChannel !== chKey && !state.recorder.loading) {
    tasks.push(
      fetch(`/api/recordings?channel=${encodeURIComponent(chKey)}`, { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : null))
        .then((json) => {
          if (json && state.activeChannel === chKey) {
            state.recorder.sessions = Array.isArray(json.sessions) ? json.sessions : [];
            state.recorder.ffmpegAvailable = Boolean(json.ffmpegAvailable);
            state.recorder.recordingsDir = json.recordingsDir || '';
            state.recorder.sessionsChannel = chKey;
          }
        })
        .catch(() => {})
    );
  }

  if (state.wbListFetchedChannel !== chKey && !state.wbListLoading) {
    tasks.push(
      fetch(`/api/boards?channel=${encodeURIComponent(chKey)}`, { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : null))
        .then((json) => {
          if (json && state.activeChannel === chKey && Array.isArray(json.boards)) {
            state.boardsList = json.boards;
            state.wbListFetchedChannel = chKey;
            if (state.data?.channels?.[chKey]) {
              state.data.channels[chKey].boards = json.boards;
            }
          }
        })
        .catch(() => {})
    );
  }

  if (state.catalogCuradoriaChannel !== chKey && !state.catalogLoading) {
    tasks.push(
      fetch(`/api/curadoria?channel=${encodeURIComponent(chKey)}`, { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : null))
        .then((json) => {
          if (json?.curadoria && state.activeChannel === chKey) {
            state.catalogCuradoria = json.curadoria;
            state.catalogCuradoriaChannel = chKey;
          }
        })
        .catch(() => {})
    );
  }

  if (state.narrationState.loadedChannel !== chKey && !state.narrationState.loading) {
    tasks.push(
      fetch(`/api/tts/audios?channel=${encodeURIComponent(chKey)}`, { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : null))
        .then((json) => {
          if (json?.ok && state.activeChannel === chKey) {
            state.narrationState.items = Array.isArray(json.items) ? json.items : [];
            if (Array.isArray(json.categories)) state.narrationState.categories = json.categories;
            state.narrationState.loadedChannel = chKey;
          }
        })
        .catch(() => {})
    );
  }

  if (tasks.length) {
    await Promise.allSettled(tasks);
    const modal = document.getElementById('cmdModal');
    const inp = document.getElementById('cmdInput');
    if (modal && !modal.classList.contains('hidden') && inp) {
      renderCmdResults(inp.value, { preserveIndex: true });
    }
  }
}

export function openCmdModal() {
  const modal = document.getElementById('cmdModal');
  const inp = document.getElementById('cmdInput');
  if (!modal || !inp) return;
  inp.value = '';
  inp.placeholder = 'Buscar em roteiros, quadros, vídeos, playlists, notas Keep e gravações...';
  state.cmdSelectedIndex = 0;
  modal.classList.remove('hidden');
  renderCmdResults('');
  prefetchUnifiedSearchSources();
  setTimeout(() => inp.focus(), 30);
}

function buildUnifiedGroups(query) {
  const chData = getActiveChannelData();
  const q = String(query || '').trim().toLowerCase();
  const limitPerCat = q ? 6 : 3;

  // 1. Roteiros & Docs (.md)
  const docs = (chData.docs || [])
    .filter((d) => {
      if (!q) return true;
      const hay = `${d.meta.titulo} ${d.path} ${d.meta.serie} ${d.meta.resumo || ''} ${(d.meta.tags || []).join(' ')}`.toLowerCase();
      return hay.includes(q);
    })
    .slice(0, limitPerCat)
    .map((d) => ({
      kind: 'doc',
      badgeClass: 'is-doc',
      badgeLabel: d.meta.status || 'doc',
      title: d.meta.titulo || d.path,
      sub: `${d.path}${d.meta.serie ? ` • ${d.meta.serie}` : ''}`,
      docPath: d.path,
      onSelect: () => setView('scripts', d.path),
    }));

  // 2. Quadros Excalidraw
  const boardsPool =
    state.wbListFetchedChannel === chData.key
      ? state.boardsList
      : chData.boards || state.boardsList || [];
  const boards = boardsPool
    .filter((b) => {
      if (!q) return true;
      return `${b.title || ''} ${b.id || ''} ${(b.linkedDocPaths || []).join(' ')}`.toLowerCase().includes(q);
    })
    .slice(0, limitPerCat)
    .map((b) => ({
      kind: 'board',
      badgeClass: 'is-board',
      badgeLabel: b.preferredMode === 'nodes' ? 'Nodes' : 'Quadro',
      title: b.title || b.id,
      sub: `${b.id}.excalidraw • ${Number(b.elementCount || 0)} elem.`,
      onSelect: () => setView('whiteboard', null, { boardId: b.id }),
    }));

  // 3. Vídeos do Catálogo
  const videosRaw = chData.videos || chData.youtube?.videos || [];
  const videos = videosRaw
    .filter((v) => {
      if (!q) return true;
      return `${v.title || ''} ${v.serie || ''} ${v.videoId || v.id || ''}`.toLowerCase().includes(q);
    })
    .slice(0, limitPerCat)
    .map((v) => ({
      kind: 'video',
      badgeClass: 'is-video',
      badgeLabel: v.isShort || v.type === 'short' ? 'Short' : 'Vídeo',
      title: v.title || v.videoId || v.id,
      sub: `${formatNumber(v.views || 0)} views${v.published ? ` • ${formatDatePt(v.published)}` : ''}`,
      onSelect: () => {
        state.catalogSubTab = 'videos';
        state.catalogFilter = 'all';
        state.catalogCategoryFilter = 'all';
        state.catalogStatusFilter = 'all';
        state.catalogSearch = v.title || '';
        setView('catalog');
      },
    }));

  // 4. Playlists de Curadoria
  const curadoria =
    state.catalogCuradoria && state.catalogCuradoriaChannel === chData.key
      ? state.catalogCuradoria
      : chData.curadoria || { playlists: [] };
  const playlists = (curadoria.playlists || [])
    .filter((pl) => {
      if (!q) return true;
      const itemsTitles = (pl.items || []).map((it) => it.title || '').join(' ');
      return `${pl.title || ''} ${pl.kind || ''} ${pl.description || ''} ${itemsTitles}`.toLowerCase().includes(q);
    })
    .slice(0, limitPerCat)
    .map((pl) => ({
      kind: 'playlist',
      badgeClass: 'is-playlist',
      badgeLabel: 'Playlist',
      title: pl.title || pl.id,
      sub: `${pl.kind || 'custom'} • ${(pl.items || []).length} vídeos`,
      onSelect: () => {
        state.catalogSubTab = 'playlists';
        state.catalogExpandedPlaylistId = pl.id;
        setView('catalog');
      },
    }));

  // 5. Notas Rápidas (Keep)
  const notesPool =
    state.notesState.channel === chData.key ? state.notesState.notes || [] : chData.notes || [];
  const notes = notesPool
    .filter((n) => {
      if (!q) return !n.archived;
      const chkTxt = (n.checklist || []).map((c) => c.text || '').join(' ');
      return `${n.title || ''} ${n.content || ''} ${chkTxt} ${(n.labels || []).join(' ')}`.toLowerCase().includes(q);
    })
    .slice(0, limitPerCat)
    .map((n) => ({
      kind: 'note',
      badgeClass: 'is-note',
      badgeLabel: n.pinned ? '📌 Nota' : 'Nota',
      title: n.title || (n.content || '').slice(0, 60) || 'Nota Keep',
      sub: (n.labels || []).length
        ? (n.labels || []).map((l) => `#${l}`).join(' ')
        : (n.content || '').replace(/\s+/g, ' ').slice(0, 60) || (n.archived ? 'Arquivada' : 'Keep'),
      onSelect: () => {
        state.notesState.highlightNoteId = n.id;
        state.notesState.showArchived = Boolean(n.archived);
        setView('notes');
      },
    }));

  // 6. Sessões de Gravação
  const sessionsPool =
    state.recorder.sessionsChannel === chData.key
      ? state.recorder.sessions || []
      : chData.recordings || [];
  const recordings = sessionsPool
    .filter((sess) => {
      if (!q) return true;
      const takeScripts = (sess.takes || []).map((t) => t.scriptPath || '').join(' ');
      return `${sess.title || ''} ${sess.id || ''} ${sess.relDir || ''} ${takeScripts}`.toLowerCase().includes(q);
    })
    .slice(0, limitPerCat)
    .map((sess) => {
      const firstScript = (sess.takes || []).find((t) => t.scriptPath)?.scriptPath;
      return {
        kind: 'recording',
        badgeClass: 'is-recording',
        badgeLabel: 'Gravação',
        title: sess.title || sess.id,
        sub: `${(sess.takes || []).length} take(s)${firstScript ? ` • ${firstScript}` : ''}`,
        onSelect: () => setView('recorder', null, firstScript ? { roteiroPath: firstScript } : {}),
      };
    });

  // 7. Narrações & Áudios (TTS Local + Clonagem)
  const narPool =
    state.narrationState.loadedChannel === chData.key ? state.narrationState.items || [] : [];
  const narrations = narPool
    .filter((nar) => {
      if (!q) return true;
      return `${nar.title || ''} ${nar.voiceName || ''} ${nar.origin || ''} ${nar.category || ''} ${nar.docPath || ''}`
        .toLowerCase()
        .includes(q);
    })
    .slice(0, limitPerCat)
    .map((nar) => ({
      kind: 'narration',
      badgeClass: 'is-recording',
      badgeLabel: '🔊 Narração',
      title: nar.title || nar.fileName,
      sub: `${nar.origin} • ${nar.voiceName || nar.category}${nar.docPath ? ` • ${nar.docPath}` : ''}`,
      onSelect: () => {
        state.narrationState.filterSearch = nar.title || nar.fileName || '';
        setView('narration');
      },
    }));

  return [
    { key: 'docs', label: '📄 Roteiros & Docs (.md)', items: docs },
    { key: 'boards', label: '◈ Quadros Excalidraw', items: boards },
    { key: 'videos', label: '▶ Vídeos do Catálogo', items: videos },
    { key: 'playlists', label: '🎬 Playlists & Curadoria', items: playlists },
    { key: 'notes', label: '📝 Notas Keep', items: notes },
    { key: 'recordings', label: '🎙️ Sessões de Gravação', items: recordings },
    { key: 'narrations', label: '🔊 Narrações & Áudios TTS', items: narrations },
  ].filter((g) => g.items.length > 0);
}

export function renderCmdResults(query, { preserveIndex = false } = {}) {
  const box = document.getElementById('cmdResults');
  if (!box) return;

  const groups = buildUnifiedGroups(query);
  flatResults = [];
  for (const g of groups) {
    for (const item of g.items) {
      flatResults.push(item);
    }
  }

  if (!preserveIndex || state.cmdSelectedIndex >= flatResults.length) {
    state.cmdSelectedIndex = 0;
  }

  if (!flatResults.length) {
    box.innerHTML = `<p style="padding:18px; color:var(--text-3); margin:0;">Nenhum resultado encontrado nas 6 fontes deste workspace.</p>`;
    return;
  }

  let runningIdx = 0;
  const groupsHtml = groups
    .map((g) => {
      const itemsHtml = g.items
        .map((item) => {
          const idx = runningIdx++;
          const isSel = idx === state.cmdSelectedIndex;
          const docAttr = item.docPath ? ` data-cmd-doc="${MD.escapeHtml(item.docPath)}"` : '';
          return `
            <button type="button" class="cmd-item${isSel ? ' is-selected' : ''}" data-cmd-idx="${idx}"${docAttr}>
              <span class="cmd-item-main">
                <span class="cmd-item-title">${MD.escapeHtml(item.title)}</span>
                <span class="cmd-item-sub">${MD.escapeHtml(item.sub)}</span>
              </span>
              <span class="cmd-badge ${MD.escapeHtml(item.badgeClass)}">${MD.escapeHtml(item.badgeLabel)}</span>
            </button>
          `;
        })
        .join('');
      return `
        <div class="cmd-group-head">
          <span>${MD.escapeHtml(g.label)}</span>
          <span>${g.items.length}</span>
        </div>
        ${itemsHtml}
      `;
    })
    .join('');

  box.innerHTML = `
    ${groupsHtml}
    <div class="cmd-footer-hint">
      <span>↑↓ navegar • Enter abrir • Esc fechar</span>
      <span>${flatResults.length} resultado(s) em ${groups.length} fonte(s)</span>
    </div>
  `;

  box.querySelectorAll('[data-cmd-idx]').forEach((btn) => {
    btn.onclick = () => {
      const idx = Number(btn.dataset.cmdIdx);
      const item = flatResults[idx];
      document.getElementById('cmdModal')?.classList.add('hidden');
      if (item && typeof item.onSelect === 'function') item.onSelect();
    };
    btn.onmouseenter = () => {
      const idx = Number(btn.dataset.cmdIdx);
      if (state.cmdSelectedIndex !== idx) {
        state.cmdSelectedIndex = idx;
        box.querySelectorAll('[data-cmd-idx]').forEach((el) => {
          el.classList.toggle('is-selected', Number(el.dataset.cmdIdx) === idx);
        });
      }
    };
  });
}

export function handleCmdInputKeydown(e) {
  if (!flatResults.length) return;
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    state.cmdSelectedIndex = (state.cmdSelectedIndex + 1) % flatResults.length;
    updateSelectedCmdVisual();
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    state.cmdSelectedIndex = (state.cmdSelectedIndex - 1 + flatResults.length) % flatResults.length;
    updateSelectedCmdVisual();
  } else if (e.key === 'Enter') {
    e.preventDefault();
    const item = flatResults[state.cmdSelectedIndex] || flatResults[0];
    document.getElementById('cmdModal')?.classList.add('hidden');
    if (item && typeof item.onSelect === 'function') item.onSelect();
  }
}

function updateSelectedCmdVisual() {
  const box = document.getElementById('cmdResults');
  if (!box) return;
  const items = box.querySelectorAll('[data-cmd-idx]');
  items.forEach((el) => {
    const active = Number(el.dataset.cmdIdx) === state.cmdSelectedIndex;
    el.classList.toggle('is-selected', active);
    if (active) el.scrollIntoView({ block: 'nearest' });
  });
}
