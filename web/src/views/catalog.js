import {
  CURADORIA_STATUSES,
  DEFAULT_CURADORIA_FALLBACK,
  MD,
  STORAGE_KEY_PREFS,
} from '../core/constants.js';
import { openNewDocModal } from '../core/modals.js';
import { setView, updateHeaderChrome } from '../core/router.js';
import {
  getActiveChannelData,
  normalizePayload,
  registerLifecycleHooks,
  registerViewRenderer,
  state,
} from '../core/state.js';
import {
  formatDatePt,
  formatNumber,
  loadJsonStorage,
  saveJsonStorage,
  showToast,
} from '../core/utils.js';

export function getActiveCuradoria(chData) {
  if (state.catalogCuradoria && state.catalogCuradoriaChannel === chData.key) {
    return state.catalogCuradoria;
  }
  return chData.curadoria || DEFAULT_CURADORIA_FALLBACK;
}

export async function ensureCatalogCuradoria(channelKey, { force = false } = {}) {
  if (!state.serverMode) return null;
  if (!force && state.catalogCuradoria && state.catalogCuradoriaChannel === channelKey) {
    return state.catalogCuradoria;
  }
  try {
    const res = await fetch(`/api/curadoria?channel=${encodeURIComponent(channelKey)}`, {
      cache: 'no-store',
    });
    const json = await res.json();
    if (res.ok && json.curadoria) {
      state.catalogCuradoria = json.curadoria;
      state.catalogCuradoriaChannel = channelKey;
      if (state.view === 'catalog' && state.activeChannel === channelKey) {
        renderCatalogView(document.getElementById('viewContainer'));
      }
    }
    return state.catalogCuradoria;
  } catch {
    return null;
  }
}

export function applyCuradoriaMutationResponse(json, channelKey) {
  if (json?.curadoria) {
    state.catalogCuradoria = json.curadoria;
    state.catalogCuradoriaChannel = channelKey;
  }
  if (json?.state) {
    state.data = normalizePayload(json.state);
  }
}

export function openPickPlaylistModal(videoObj) {
  if (!state.serverMode) {
    showToast('Adicionar à playlist requer o servidor local ativo.');
    return;
  }
  const chData = getActiveChannelData();
  const curadoria = getActiveCuradoria(chData);
  const playlists = curadoria.playlists || [];
  const modal = document.getElementById('catalogPlaylistPickModal');
  const body = document.getElementById('catalogPlaylistPickBody');
  if (!modal || !body) return;

  const vidId = videoObj.videoId || videoObj.id;
  body.innerHTML = `
    <div style="font-size:12.5px; color:var(--text-2);">
      Vídeo: <strong style="color:var(--text-1);">${MD.escapeHtml(videoObj.title || vidId)}</strong>
    </div>
    ${playlists.length
      ? `<div class="wb-script-picker-list">
          ${playlists
            .map(
              (pl) => `
                <button type="button" class="wb-script-picker-item" data-pick-pl="${MD.escapeHtml(pl.id)}">
                  <span>
                    <strong style="color:var(--text-1);">${MD.escapeHtml(pl.title)}</strong>
                    <small style="display:block; color:var(--text-3);">${MD.escapeHtml(pl.kind || 'custom')} • ${(pl.items || []).length} vídeos</small>
                  </span>
                  <span class="btn-sm btn-accent">+ Adicionar</span>
                </button>
              `
            )
            .join('')}
        </div>`
      : `<p style="margin:0; font-size:12.5px; color:var(--text-3);">Nenhuma playlist criada ainda. Crie uma rapidamente abaixo:</p>`}
    <form id="quickCreatePlInModalForm" style="display:flex; gap:8px; flex-wrap:wrap; padding-top:6px; border-top:1px solid var(--border-soft);">
      <input type="text" id="quickPlTitleInp" placeholder="Nova playlist (ex.: Reagir Agora)" required style="flex:1; min-width:160px;">
      <button type="submit" class="btn-sm btn-accent">Criar & Adicionar</button>
    </form>
  `;

  modal.classList.remove('hidden');

  body.querySelectorAll('[data-pick-pl]').forEach((btn) => {
    btn.onclick = async () => {
      try {
        const res = await fetch('/api/curadoria/playlists/item', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            channel: chData.key,
            playlistId: btn.dataset.pickPl,
            item: {
              videoId: vidId,
              id: vidId,
              title: videoObj.title,
              url: videoObj.url,
              thumbnail: videoObj.thumbnail,
              duration: videoObj.duration || '',
              views: videoObj.views || 0,
              viewsText: videoObj.viewsText || '',
              isShort:
                videoObj.isShort !== undefined
                  ? Boolean(videoObj.isShort)
                  : videoObj.type === 'short',
            },
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Erro ao adicionar na playlist');
        applyCuradoriaMutationResponse(json, chData.key);
        modal.classList.add('hidden');
        showToast(`Adicionado à playlist "${json.playlist?.title || ''}"!`);
        if (state.view === 'catalog') renderCatalogView(document.getElementById('viewContainer'));
      } catch (err) {
        showToast(err.message);
      }
    };
  });

  const quickForm = document.getElementById('quickCreatePlInModalForm');
  if (quickForm) {
    quickForm.onsubmit = async (e) => {
      e.preventDefault();
      const title = document.getElementById('quickPlTitleInp')?.value.trim();
      if (!title) return;
      try {
        const res = await fetch('/api/curadoria/playlists', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            channel: chData.key,
            mode: 'manual',
            title,
            kind: 'reagir',
            items: [
              {
                videoId: vidId,
                id: vidId,
                title: videoObj.title,
                url: videoObj.url,
                thumbnail: videoObj.thumbnail,
                duration: videoObj.duration || '',
                views: videoObj.views || 0,
                isShort:
                  videoObj.isShort !== undefined
                    ? Boolean(videoObj.isShort)
                    : videoObj.type === 'short',
              },
            ],
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Erro ao criar playlist');
        applyCuradoriaMutationResponse(json, chData.key);
        modal.classList.add('hidden');
        showToast(`Playlist "${title}" criada com o vídeo!`);
        if (state.view === 'catalog') renderCatalogView(document.getElementById('viewContainer'));
      } catch (err) {
        showToast(err.message);
      }
    };
  }
}

export function renderCatalogView(container) {
  if (!container) return;
  const chData = getActiveChannelData();
  const channel = chData.channel || {};
  const rawVideos = chData.videos || [];
  const curadoria = getActiveCuradoria(chData);
  const categories = curadoria.categories || DEFAULT_CURADORIA_FALLBACK.categories;
  const playlists = curadoria.playlists || [];
  const videoMetaMap = curadoria.videoMeta || {};

  if (state.serverMode && state.catalogCuradoriaChannel !== chData.key && !state.catalogLoading) {
    state.catalogLoading = true;
    ensureCatalogCuradoria(chData.key, { force: true }).finally(() => {
      state.catalogLoading = false;
    });
  }

  const isVideoShort = (v) => (v.isShort !== undefined ? Boolean(v.isShort) : v.type === 'short');
  const longsCount = rawVideos.filter((v) => !isVideoShort(v)).length;
  const shortsCount = rawVideos.filter((v) => isVideoShort(v)).length;
  const totalVideosCount = Math.max(rawVideos.length, Number(channel.totalVideos || 0));
  const totalViewsCount =
    rawVideos.reduce((acc, v) => acc + Number(v.views || 0), 0) || Number(channel.totalViews || 0);
  const layoutMode = state.prefs?.catalogLayout === 'grid' ? 'grid' : 'stacked';

  const catMap = new Map(categories.map((c) => [c.id, c]));
  const statusMap = new Map(CURADORIA_STATUSES.map((s) => [s.id, s.label]));

  const upsertMetaRemote = async (videoId, patch, { rerender = false } = {}) => {
    if (!state.serverMode) {
      showToast('Anotações e curadoria exigem o servidor local ativo.');
      return;
    }
    try {
      const res = await fetch('/api/curadoria/video', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: chData.key, videoId, ...patch }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Erro ao salvar curadoria');
      applyCuradoriaMutationResponse(json, chData.key);
      if (rerender && state.view === 'catalog') {
        renderCatalogView(container);
      } else {
        showToast('Curadoria salva!');
      }
    } catch (err) {
      showToast(err.message);
    }
  };

  const triggerCreateCuradoriaScript = async (videoItem, metaNotes = '', playlistId = null) => {
    if (!state.serverMode) {
      showToast('Criar roteiro pela curadoria requer o servidor local ativo.');
      return;
    }
    const vidId = videoItem.videoId || videoItem.id;
    try {
      const res = await fetch('/api/curadoria/create-script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel: chData.key,
          videoId: vidId,
          title: videoItem.title || '',
          url: videoItem.url || '',
          channelName: videoItem.channelName || channel.name || '',
          notes: metaNotes || '',
          serie: 'Reavaliar',
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Erro ao criar roteiro');
      if (playlistId && vidId) {
        await fetch('/api/curadoria/playlists/item', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            channel: chData.key,
            playlistId,
            videoId: vidId,
            linkedDocPath: json.docPath,
            status: 'roteirizado',
          }),
        }).catch(() => {});
      }
      if (json.state) state.data = normalizePayload(json.state);
      state.catalogCuradoriaChannel = '';
      showToast(`Roteiro criado: ${json.docPath}`);
      setView('scripts', json.docPath);
    } catch (err) {
      showToast(err.message);
    }
  };

  let videos = [...rawVideos];
  if (state.catalogFilter === 'long') videos = videos.filter((v) => !isVideoShort(v));
  if (state.catalogFilter === 'short') videos = videos.filter((v) => isVideoShort(v));
  if (state.catalogSearch) {
    const q = state.catalogSearch.toLowerCase();
    videos = videos.filter((v) => {
      const vid = v.videoId || v.id;
      const vm = videoMetaMap[vid] || {};
      return `${v.title} ${v.serie || ''} ${vm.notes || ''}`.toLowerCase().includes(q);
    });
  }
  if (state.catalogCategoryFilter !== 'all') {
    videos = videos.filter((v) => {
      const vid = v.videoId || v.id;
      const vm = videoMetaMap[vid] || {};
      if (state.catalogCategoryFilter === '__none__') return !vm.category;
      return vm.category === state.catalogCategoryFilter;
    });
  }
  if (state.catalogStatusFilter !== 'all') {
    videos = videos.filter((v) => {
      const vid = v.videoId || v.id;
      const vm = videoMetaMap[vid] || {};
      return (vm.status || 'pendente') === state.catalogStatusFilter;
    });
  }

  if (state.catalogSort === 'views') {
    videos.sort((a, b) => Number(b.views || 0) - Number(a.views || 0));
  } else if (state.catalogSort === 'starred') {
    videos.sort((a, b) => {
      const sa = videoMetaMap[a.videoId || a.id]?.starred ? 1 : 0;
      const sb = videoMetaMap[b.videoId || b.id]?.starred ? 1 : 0;
      if (sb !== sa) return sb - sa;
      return String(b.published || '').localeCompare(String(a.published || ''));
    });
  } else {
    videos.sort((a, b) => String(b.published || '').localeCompare(String(a.published || '')));
  }

  const renderVideoItemHtml = (v) => {
    const vidId = v.videoId || v.id;
    const isShort = isVideoShort(v);
    const vm = videoMetaMap[vidId] || {};
    const dateStr = v.published ? formatDatePt(v.published) : v.publishedText || '—';
    const viewsStr = v.views ? `${formatNumber(v.views)} views` : v.viewsText || '0 views';
    const curCat = vm.category || '';
    const curStatus = vm.status || 'pendente';
    const linkedDoc =
      vm.linkedDocPath || (chData.docs || []).find((d) => d.meta.youtube_id === vidId)?.path || '';

    const catOptions = [
      '<option value="">Sem categoria</option>',
      ...categories.map(
        (c) =>
          `<option value="${MD.escapeHtml(c.id)}"${curCat === c.id ? ' selected' : ''}>${MD.escapeHtml(c.icon)} ${MD.escapeHtml(c.name)}</option>`
      ),
    ].join('');
    const stOptions = CURADORIA_STATUSES.map(
      (s) =>
        `<option value="${s.id}"${curStatus === s.id ? ' selected' : ''}>${MD.escapeHtml(s.label)}</option>`
    ).join('');

    if (layoutMode === 'grid') {
      return `
        <article class="glass-card" data-ext-url="${MD.escapeHtml(v.url)}" data-ext-title="${MD.escapeHtml(v.title)}">
          <div class="yt-thumb-wrap">
            <img src="${MD.escapeHtml(v.thumbnail)}" alt="${MD.escapeHtml(v.title)}" loading="lazy" onerror="this.style.opacity='0.15'">
            <span class="yt-type-chip">${isShort ? 'SHORT' : 'LONGO'}</span>
            ${v.duration ? `<span class="cat-dur-chip">${MD.escapeHtml(v.duration)}</span>` : ''}
            <span class="yt-views-chip">${MD.escapeHtml(viewsStr)}</span>
          </div>
          <div style="display:flex; justify-content:space-between; font-size:11px; color:var(--text-3); gap:6px;">
            <span>${MD.escapeHtml(dateStr)}</span>
            <span>${MD.escapeHtml(v.serie || '')}</span>
          </div>
          <h3 class="gc-title" style="font-size:13.5px; line-height:1.4;">${MD.escapeHtml(v.title)}</h3>
          <div class="cat-stack-controls">
            <select class="select-dark" data-vid-cat="${MD.escapeHtml(vidId)}" style="flex:1; min-width:110px;">${catOptions}</select>
            <select class="select-dark" data-vid-status="${MD.escapeHtml(vidId)}" style="flex:1; min-width:100px;">${stOptions}</select>
            <button type="button" class="cat-star-btn${vm.starred ? ' is-starred' : ''}" data-vid-star="${MD.escapeHtml(vidId)}" title="Favoritar">★</button>
          </div>
          <input type="text" class="cat-notes-input" data-vid-notes="${MD.escapeHtml(vidId)}" placeholder="Anotação rápida (Enter/sair salva)..." value="${MD.escapeHtml(vm.notes || '')}">
          <div class="gc-actions">
            <a class="btn-sm btn-accent" href="${MD.escapeHtml(v.url)}" target="_blank" rel="noopener noreferrer">Assistir ↗</a>
            <button type="button" class="btn-sm" data-vid-add-pl="${MD.escapeHtml(vidId)}">+ Playlist</button>
            ${linkedDoc
              ? `<button type="button" class="btn-sm" data-open-doc="${MD.escapeHtml(linkedDoc)}">📄 Abrir Roteiro</button>`
              : `<button type="button" class="btn-sm" data-vid-create-script="${MD.escapeHtml(vidId)}">✎ Criar Roteiro / Reavaliar</button>`}
          </div>
        </article>
      `;
    }

    return `
      <article class="cat-stack-row" data-ext-url="${MD.escapeHtml(v.url)}" data-ext-title="${MD.escapeHtml(v.title)}">
        <div class="cat-stack-thumb">
          <img src="${MD.escapeHtml(v.thumbnail)}" alt="${MD.escapeHtml(v.title)}" loading="lazy" onerror="this.style.opacity='0.15'">
          <span class="yt-type-chip">${isShort ? 'SHORT' : 'LONGO'}</span>
          ${v.duration ? `<span class="cat-dur-chip">${MD.escapeHtml(v.duration)}</span>` : ''}
        </div>
        <div class="cat-stack-body">
          <div class="cat-stack-head">
            <div style="min-width:0; flex:1;">
              <h3 class="cat-stack-title">${MD.escapeHtml(v.title)}</h3>
              <div class="cat-stack-meta">
                <span>${MD.escapeHtml(dateStr)}</span>
                <span>•</span>
                <strong style="color:var(--text-2);">${MD.escapeHtml(viewsStr)}</strong>
                ${v.serie ? `<span>•</span><span>${MD.escapeHtml(v.serie)}</span>` : ''}
                ${curCat && catMap.get(curCat) ? `<span class="cat-tag-chip" style="padding:1px 8px; font-size:10.5px; border-color:${MD.escapeHtml(catMap.get(curCat).color)}66;">${MD.escapeHtml(catMap.get(curCat).icon)} ${MD.escapeHtml(catMap.get(curCat).name)}</span>` : ''}
              </div>
            </div>
            <button type="button" class="cat-star-btn${vm.starred ? ' is-starred' : ''}" data-vid-star="${MD.escapeHtml(vidId)}" title="Favoritar vídeo">★</button>
          </div>
          <div class="cat-stack-controls">
            <select class="select-dark" data-vid-cat="${MD.escapeHtml(vidId)}">${catOptions}</select>
            <select class="select-dark" data-vid-status="${MD.escapeHtml(vidId)}">${stOptions}</select>
            <input type="text" class="cat-notes-input" data-vid-notes="${MD.escapeHtml(vidId)}" placeholder="Anotação rápida sobre gancho, corte ou reação..." value="${MD.escapeHtml(vm.notes || '')}">
          </div>
          <div style="display:flex; align-items:center; gap:7px; flex-wrap:wrap;">
            <a class="btn-sm btn-accent" href="${MD.escapeHtml(v.url)}" target="_blank" rel="noopener noreferrer">Assistir ↗</a>
            <button type="button" class="btn-sm" data-vid-add-pl="${MD.escapeHtml(vidId)}">+ Playlist</button>
            <button type="button" class="btn-sm" data-vid-create-script="${MD.escapeHtml(vidId)}">✎ Criar Roteiro / Reavaliar</button>
            ${linkedDoc ? `<button type="button" class="btn-sm" data-open-doc="${MD.escapeHtml(linkedDoc)}">📄 Abrir Roteiro</button>` : ''}
            <button type="button" class="btn-sm" data-postmortem-for="${MD.escapeHtml(vidId)}">Post-Mortem</button>
          </div>
        </div>
      </article>
    `;
  };

  let mainBodyHtml = '';
  if (state.catalogSubTab === 'playlists') {
    mainBodyHtml = `
      <div class="cat-playlists-layout">
        <div class="cat-panels-row">
          <div class="glass-card">
            <h3 class="gc-title">Criar Playlist de Curadoria</h3>
            <form id="catCreatePlaylistForm" style="display:flex; flex-direction:column; gap:8px;">
              <div class="form-row-2">
                <input type="text" class="search-box-sm" id="catPlTitleInp" placeholder="Nome (ex.: Reagir Tech BR)" required style="margin:0;">
                <select class="select-dark" id="catPlKindSel">
                  <option value="reagir">🎬 Reagir</option>
                  <option value="inspiracao">✨ Inspiração</option>
                  <option value="referencia">⚙️ Referência Técnica</option>
                  <option value="estudo">📚 Estudo</option>
                  <option value="custom">📁 Customizada</option>
                </select>
              </div>
              <input type="text" class="search-box-sm" id="catPlDescInp" placeholder="Descrição / critério de curadoria (opcional)" style="margin:0;">
              <div><button type="submit" class="btn-sm btn-accent">+ Criar Playlist</button></div>
            </form>
          </div>

          <div class="glass-card">
            <h3 class="gc-title">Importar Playlist do YouTube</h3>
            <form id="catImportPlaylistForm" style="display:flex; flex-direction:column; gap:8px;">
              <input type="text" class="search-box-sm" id="catImportPlUrlInp" placeholder="Cole URL ou ID (ex.: https://youtube.com/playlist?list=PL...)" required style="margin:0;">
              <div class="form-row-2">
                <input type="text" class="search-box-sm" id="catImportPlTitleInp" placeholder="Nome personalizado (opcional)" style="margin:0;">
                <select class="select-dark" id="catImportPlKindSel">
                  <option value="reagir">🎬 Reagir</option>
                  <option value="inspiracao">✨ Inspiração</option>
                  <option value="referencia">⚙️ Referência Técnica</option>
                  <option value="estudo">📚 Estudo</option>
                </select>
              </div>
              <div><button type="submit" class="btn-sm btn-accent">⤓ Importar Playlist Pública</button></div>
            </form>
          </div>
        </div>

        <div class="glass-card">
          <div class="gc-top">
            <h3 class="gc-title">Categorias Customizadas (${categories.length})</h3>
          </div>
          <div class="cat-chip-row">
            ${categories
              .map(
                (c) => `
                  <span class="cat-tag-chip" style="border-color:${MD.escapeHtml(c.color)}66;">
                    <span>${MD.escapeHtml(c.icon)}</span>
                    <span>${MD.escapeHtml(c.name)}</span>
                    ${!c.builtIn ? `<button type="button" class="cat-tag-del" data-del-cat="${MD.escapeHtml(c.id)}" title="Remover categoria">✕</button>` : ''}
                  </span>
                `
              )
              .join('')}
          </div>
          <form id="catAddCategoryForm" style="display:flex; gap:8px; flex-wrap:wrap; align-items:center; margin-top:4px;">
            <input type="text" class="search-box-sm" id="catNewCatIcon" value="🏷️" style="width:52px; margin:0; text-align:center;" title="Ícone">
            <input type="text" class="search-box-sm" id="catNewCatName" placeholder="Nova categoria..." required style="flex:1; min-width:150px; margin:0;">
            <input type="color" id="catNewCatColor" value="#38bdf8" style="width:36px; height:32px; border:none; background:none; padding:0;" title="Cor">
            <button type="submit" class="btn-sm">+ Adicionar Categoria</button>
          </form>
        </div>

        ${playlists.length
          ? playlists
              .map((pl) => {
                const items = pl.items || [];
                const expanded = state.catalogExpandedPlaylistId === pl.id || playlists.length === 1;
                return `
                  <section class="cat-playlist-card">
                    <div class="cat-playlist-head">
                      <div style="min-width:0; flex:1;">
                        <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                          <strong style="font-size:15px;">${MD.escapeHtml(pl.title)}</strong>
                          <span class="status-pill st-roteiro">${MD.escapeHtml(pl.kind || 'custom')}</span>
                          <span class="kanban-count">${items.length} vídeos</span>
                        </div>
                        ${pl.description ? `<div style="font-size:12px; color:var(--text-3); margin-top:3px;">${MD.escapeHtml(pl.description)}</div>` : ''}
                      </div>
                      <div style="display:flex; align-items:center; gap:7px; flex-wrap:wrap;">
                        ${pl.sourceUrl ? `<a class="btn-sm" href="${MD.escapeHtml(pl.sourceUrl)}" target="_blank" rel="noopener noreferrer">YouTube ↗</a>` : ''}
                        <button type="button" class="btn-sm" data-toggle-pl="${MD.escapeHtml(pl.id)}">${expanded ? '▾ Recolher' : '▸ Expandir'}</button>
                        <button type="button" class="btn-sm btn-danger" data-del-pl="${MD.escapeHtml(pl.id)}">Excluir</button>
                      </div>
                    </div>

                    ${expanded
                      ? `
                        <form class="cat-add-pl-item-form" data-pl-add-form="${MD.escapeHtml(pl.id)}" style="display:flex; gap:8px; flex-wrap:wrap; padding-top:6px; border-top:1px solid var(--border-soft);">
                          <input type="text" class="search-box-sm" data-pl-url-input="${MD.escapeHtml(pl.id)}" placeholder="Adicionar vídeo avulso por URL ou ID (youtube.com/watch?v=..., /shorts/...)..." required style="flex:1; min-width:220px; margin:0;">
                          <button type="submit" class="btn-sm btn-accent">+ Adicionar Vídeo</button>
                        </form>
                        <div class="cat-stacked-list">
                          ${items.length
                            ? items
                                .map((it) => {
                                  const vid = it.videoId || it.id;
                                  const stOpts = CURADORIA_STATUSES.map(
                                    (s) => `<option value="${s.id}"${(it.status || 'pendente') === s.id ? ' selected' : ''}>${MD.escapeHtml(s.label)}</option>`
                                  ).join('');
                                  const catOpts = [
                                    '<option value="">Sem categoria</option>',
                                    ...categories.map(
                                      (c) => `<option value="${MD.escapeHtml(c.id)}"${it.category === c.id ? ' selected' : ''}>${MD.escapeHtml(c.icon)} ${MD.escapeHtml(c.name)}</option>`
                                    ),
                                  ].join('');
                                  return `
                                    <article class="cat-stack-row" data-ext-url="${MD.escapeHtml(it.url)}" data-ext-title="${MD.escapeHtml(it.title)}">
                                      <div class="cat-stack-thumb">
                                        <img src="${MD.escapeHtml(it.thumbnail)}" alt="${MD.escapeHtml(it.title)}" loading="lazy" onerror="this.style.opacity='0.15'">
                                        <span class="yt-type-chip">${it.isShort ? 'SHORT' : 'VÍDEO'}</span>
                                        ${it.duration ? `<span class="cat-dur-chip">${MD.escapeHtml(it.duration)}</span>` : ''}
                                      </div>
                                      <div class="cat-stack-body">
                                        <div class="cat-stack-head">
                                          <div style="min-width:0; flex:1;">
                                            <h4 class="cat-stack-title">${MD.escapeHtml(it.title)}</h4>
                                            <div class="cat-stack-meta">
                                              ${it.channelName ? `<span>${MD.escapeHtml(it.channelName)}</span><span>•</span>` : ''}
                                              <span>${it.views ? `${formatNumber(it.views)} views` : it.viewsText || 'Link salvo'}</span>
                                            </div>
                                          </div>
                                        </div>
                                        <div class="cat-stack-controls">
                                          <select class="select-dark" data-pl-item-cat="${MD.escapeHtml(pl.id)}::${MD.escapeHtml(vid)}">${catOpts}</select>
                                          <select class="select-dark" data-pl-item-status="${MD.escapeHtml(pl.id)}::${MD.escapeHtml(vid)}">${stOpts}</select>
                                          <input type="text" class="cat-notes-input" data-pl-item-notes="${MD.escapeHtml(pl.id)}::${MD.escapeHtml(vid)}" placeholder="Notas para reação / roteiro..." value="${MD.escapeHtml(it.notes || '')}">
                                        </div>
                                        <div style="display:flex; gap:7px; flex-wrap:wrap;">
                                          <a class="btn-sm btn-accent" href="${MD.escapeHtml(it.url)}" target="_blank" rel="noopener noreferrer">Assistir ↗</a>
                                          <button type="button" class="btn-sm" data-pl-create-script="${MD.escapeHtml(pl.id)}::${MD.escapeHtml(vid)}">✎ Criar Roteiro / Reavaliar</button>
                                          ${it.linkedDocPath ? `<button type="button" class="btn-sm" data-open-doc="${MD.escapeHtml(it.linkedDocPath)}">📄 Abrir Roteiro</button>` : ''}
                                          <button type="button" class="btn-sm btn-danger" data-pl-rem-item="${MD.escapeHtml(pl.id)}::${MD.escapeHtml(vid)}">Remover</button>
                                        </div>
                                      </div>
                                    </article>
                                  `;
                                })
                                .join('')
                            : '<p style="margin:6px 0; font-size:12.5px; color:var(--text-3);">Playlist vazia. Cole uma URL de vídeo acima para adicionar.</p>'}
                        </div>
                      `
                      : ''}
                  </section>
                `;
              })
              .join('')
          : '<div class="glass-card"><p style="margin:0; color:var(--text-3);">Nenhuma playlist de curadoria criada ou importada ainda.</p></div>'}
      </div>
    `;
  } else {
    const renderCollection = (list) => {
      if (!list.length) {
        return '<div class="glass-card"><p style="margin:0; color:var(--text-3);">Nenhum vídeo encontrado com os filtros atuais.</p></div>';
      }
      if (layoutMode === 'grid') {
        return `<div class="cards-grid-3">${list.map(renderVideoItemHtml).join('')}</div>`;
      }
      return `<div class="cat-stacked-list">${list.map(renderVideoItemHtml).join('')}</div>`;
    };

    if (state.catalogGroupBy && state.catalogGroupBy !== 'none') {
      const groups = new Map();
      for (const v of videos) {
        const vid = v.videoId || v.id;
        const vm = videoMetaMap[vid] || {};
        let keyLabel = 'Outros';
        if (state.catalogGroupBy === 'category') {
          keyLabel = vm.category
            ? `${catMap.get(vm.category)?.icon || '🏷️'} ${catMap.get(vm.category)?.name || vm.category}`
            : 'Sem Categoria';
        } else if (state.catalogGroupBy === 'type') {
          keyLabel = isVideoShort(v) ? 'Shorts' : 'Vídeos Longos';
        } else if (state.catalogGroupBy === 'status') {
          keyLabel = statusMap.get(vm.status || 'pendente') || 'Pendente';
        } else if (state.catalogGroupBy === 'year') {
          const yr = String(v.published || '').slice(0, 4);
          keyLabel = /^\d{4}$/.test(yr) ? yr : 'Sem Data Exata';
        }
        if (!groups.has(keyLabel)) groups.set(keyLabel, []);
        groups.get(keyLabel).push(v);
      }
      mainBodyHtml = Array.from(groups.entries())
        .map(
          ([label, list]) => `
            <div class="cat-group-header">
              <span>${MD.escapeHtml(label)}</span>
              <span class="kanban-count">${list.length}</span>
            </div>
            ${renderCollection(list)}
          `
        )
        .join('');
    } else {
      mainBodyHtml = renderCollection(videos);
    }
  }

  container.innerHTML = `
    <div class="cat-kpi-bar">
      <div class="cat-kpi-pill">
        <span>Total de Vídeos</span>
        <strong>${formatNumber(totalVideosCount)}</strong>
      </div>
      <div class="cat-kpi-pill">
        <span>Vídeos Longos</span>
        <strong>${formatNumber(longsCount)}</strong>
      </div>
      <div class="cat-kpi-pill">
        <span>Shorts</span>
        <strong>${formatNumber(shortsCount)}</strong>
      </div>
      <div class="cat-kpi-pill">
        <span>Views Somadas</span>
        <strong>${formatNumber(totalViewsCount)}</strong>
      </div>
      <div class="cat-kpi-pill">
        <span>Playlists Curadoria</span>
        <strong>${formatNumber(playlists.length)}</strong>
      </div>
    </div>

    <div class="section-subhead">
      <div class="mode-switch" id="catalogSubTabSwitch">
        <button type="button" class="${state.catalogSubTab === 'videos' ? 'active' : ''}" data-cat-tab="videos">Vídeos do Canal (${rawVideos.length})</button>
        <button type="button" class="${state.catalogSubTab === 'playlists' ? 'active' : ''}" data-cat-tab="playlists">Playlists & Curadoria (${playlists.length})</button>
      </div>

      <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
        <button type="button" class="btn-sm" id="openCatalogDocBtn">Abrir catalogo-youtube.md</button>
        <button type="button" class="btn-sm btn-accent" id="syncYoutubeBtn">⟳ Sincronizar Canal Agora (${MD.escapeHtml(channel.handle || chData.key)})</button>
      </div>
    </div>

    ${state.catalogSubTab === 'videos'
      ? `
        <div class="cat-toolbar">
          <div class="cat-toolbar-group">
            <div class="mode-switch" id="catalogTypeSwitch">
              <button type="button" class="${state.catalogFilter === 'all' ? 'active' : ''}" data-cf="all">Todos (${rawVideos.length})</button>
              <button type="button" class="${state.catalogFilter === 'long' ? 'active' : ''}" data-cf="long">Longos (${longsCount})</button>
              <button type="button" class="${state.catalogFilter === 'short' ? 'active' : ''}" data-cf="short">Shorts (${shortsCount})</button>
            </div>
            <input type="search" class="search-box-sm" id="catalogSearchInput" placeholder="Buscar por título, série ou nota..." value="${MD.escapeHtml(state.catalogSearch)}" style="width:210px; margin:0; height:32px;">
            <select class="select-dark" id="catalogCatFilterSel" title="Filtrar por Categoria">
              <option value="all"${state.catalogCategoryFilter === 'all' ? ' selected' : ''}>Todas Categorias</option>
              <option value="__none__"${state.catalogCategoryFilter === '__none__' ? ' selected' : ''}>Sem Categoria</option>
              ${categories.map((c) => `<option value="${MD.escapeHtml(c.id)}"${state.catalogCategoryFilter === c.id ? ' selected' : ''}>${MD.escapeHtml(c.icon)} ${MD.escapeHtml(c.name)}</option>`).join('')}
            </select>
            <select class="select-dark" id="catalogStatusFilterSel" title="Filtrar por Status">
              <option value="all"${state.catalogStatusFilter === 'all' ? ' selected' : ''}>Todos Status</option>
              ${CURADORIA_STATUSES.map((s) => `<option value="${s.id}"${state.catalogStatusFilter === s.id ? ' selected' : ''}>${MD.escapeHtml(s.label)}</option>`).join('')}
            </select>
          </div>

          <div class="cat-toolbar-group">
            <select class="select-dark" id="catalogSortSel" title="Ordenação">
              <option value="date"${state.catalogSort === 'date' ? ' selected' : ''}>Mais recentes</option>
              <option value="views"${state.catalogSort === 'views' ? ' selected' : ''}>Mais visualizações</option>
              <option value="starred"${state.catalogSort === 'starred' ? ' selected' : ''}>Favoritos primeiro</option>
            </select>
            <select class="select-dark" id="catalogGroupBySel" title="Agrupar por">
              <option value="none"${state.catalogGroupBy === 'none' ? ' selected' : ''}>Agrupar: Nenhum</option>
              <option value="category"${state.catalogGroupBy === 'category' ? ' selected' : ''}>Agrupar: Categoria</option>
              <option value="type"${state.catalogGroupBy === 'type' ? ' selected' : ''}>Agrupar: Tipo (Long/Short)</option>
              <option value="status"${state.catalogGroupBy === 'status' ? ' selected' : ''}>Agrupar: Status</option>
              <option value="year"${state.catalogGroupBy === 'year' ? ' selected' : ''}>Agrupar: Ano</option>
            </select>
            <div class="mode-switch" id="catalogLayoutSwitch">
              <button type="button" class="${layoutMode === 'stacked' ? 'active' : ''}" data-cat-layout="stacked">☰ Lista Empilhada</button>
              <button type="button" class="${layoutMode === 'grid' ? 'active' : ''}" data-cat-layout="grid">▦ Grade</button>
            </div>
          </div>
        </div>
      `
      : ''}

    ${mainBodyHtml}
  `;

  container.querySelectorAll('#catalogSubTabSwitch button').forEach((btn) => {
    btn.onclick = () => {
      state.catalogSubTab = btn.dataset.catTab;
      renderCatalogView(container);
    };
  });

  document.getElementById('openCatalogDocBtn').onclick = () => setView('scripts', '00-canal/catalogo-youtube.md');

  document.getElementById('syncYoutubeBtn').onclick = async () => {
    if (!state.serverMode) {
      showToast('Para sincronizar o canal completo ao vivo, inicie o servidor local.');
      return;
    }
    showToast(`Sincronizando catálogo completo de ${channel.handle || chData.key}...`);
    try {
      const res = await fetch('/api/sync-youtube', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: state.activeChannel }),
      });
      const json = await res.json();
      if (json.state) state.data = normalizePayload(json.state);
      updateHeaderChrome();
      renderCatalogView(container);
      showToast(json.warning || `Sincronizado! ${json.updatedCount} vídeos no catálogo.`);
    } catch (err) {
      showToast(`Falha na sincronização: ${err.message}`);
    }
  };

  if (state.catalogSubTab === 'videos') {
    container.querySelectorAll('#catalogTypeSwitch button').forEach((btn) => {
      btn.onclick = () => {
        state.catalogFilter = btn.dataset.cf;
        renderCatalogView(container);
      };
    });
    const searchEl = document.getElementById('catalogSearchInput');
    if (searchEl) {
      searchEl.oninput = () => {
        state.catalogSearch = searchEl.value;
        const pos = searchEl.selectionStart;
        renderCatalogView(container);
        const again = document.getElementById('catalogSearchInput');
        if (again) {
          again.focus();
          again.setSelectionRange(pos, pos);
        }
      };
    }
    document.getElementById('catalogCatFilterSel').onchange = (e) => {
      state.catalogCategoryFilter = e.target.value;
      renderCatalogView(container);
    };
    document.getElementById('catalogStatusFilterSel').onchange = (e) => {
      state.catalogStatusFilter = e.target.value;
      renderCatalogView(container);
    };
    document.getElementById('catalogSortSel').onchange = (e) => {
      state.catalogSort = e.target.value;
      renderCatalogView(container);
    };
    document.getElementById('catalogGroupBySel').onchange = (e) => {
      state.catalogGroupBy = e.target.value;
      renderCatalogView(container);
    };
    container.querySelectorAll('#catalogLayoutSwitch button').forEach((btn) => {
      btn.onclick = () => {
        const next = btn.dataset.catLayout === 'grid' ? 'grid' : 'stacked';
        state.prefs = { ...(state.prefs || {}), catalogLayout: next };
        const saved = loadJsonStorage(STORAGE_KEY_PREFS, {});
        saved.catalogLayout = next;
        saveJsonStorage(STORAGE_KEY_PREFS, saved);
        renderCatalogView(container);
      };
    });

    container.querySelectorAll('[data-vid-cat]').forEach((sel) => {
      sel.onchange = () =>
        upsertMetaRemote(sel.dataset.vidCat, { category: sel.value }, { rerender: state.catalogGroupBy === 'category' });
    });
    container.querySelectorAll('[data-vid-status]').forEach((sel) => {
      sel.onchange = () =>
        upsertMetaRemote(sel.dataset.vidStatus, { status: sel.value }, { rerender: state.catalogGroupBy === 'status' });
    });
    container.querySelectorAll('[data-vid-star]').forEach((btn) => {
      btn.onclick = () => {
        const vidId = btn.dataset.vidStar;
        const nextStar = !videoMetaMap[vidId]?.starred;
        upsertMetaRemote(vidId, { starred: nextStar }, { rerender: true });
      };
    });
    container.querySelectorAll('[data-vid-notes]').forEach((inp) => {
      const commitNotes = () => {
        const vidId = inp.dataset.vidNotes;
        const prev = videoMetaMap[vidId]?.notes || '';
        if (inp.value !== prev) {
          upsertMetaRemote(vidId, { notes: inp.value });
        }
      };
      inp.onchange = commitNotes;
      inp.onkeydown = (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          inp.blur();
        }
      };
    });
    container.querySelectorAll('[data-vid-add-pl]').forEach((btn) => {
      btn.onclick = () => {
        const vidId = btn.dataset.vidAddPl;
        const vid = rawVideos.find((x) => (x.videoId || x.id) === vidId);
        if (vid) openPickPlaylistModal(vid);
      };
    });
    container.querySelectorAll('[data-vid-create-script]').forEach((btn) => {
      btn.onclick = () => {
        const vidId = btn.dataset.vidCreateScript;
        const vid = rawVideos.find((x) => (x.videoId || x.id) === vidId);
        if (vid) triggerCreateCuradoriaScript(vid, videoMetaMap[vidId]?.notes || '');
      };
    });
    container.querySelectorAll('[data-open-doc]').forEach((btn) => {
      btn.onclick = () => setView('scripts', btn.dataset.openDoc);
    });
    container.querySelectorAll('[data-postmortem-for]').forEach((btn) => {
      btn.onclick = () => {
        const vidId = btn.dataset.postmortemFor;
        const vid = rawVideos.find((x) => (x.videoId || x.id) === vidId);
        const existing = (chData.docs || []).find((d) => d.meta.youtube_id === vidId);
        if (existing) {
          setView('scripts', existing.path);
        } else if (vid) {
          openNewDocModal({
            type: 'post-mortem',
            folder: '02-roteiros/publicados',
            title: `Post-Mortem: ${vid.title}`,
            serie: vid.serie,
            summary: `Análise do vídeo ${vidId} (${vid.views} views, publicado em ${vid.published}).`,
          });
        }
      };
    });
  } else {
    const createPlForm = document.getElementById('catCreatePlaylistForm');
    if (createPlForm) {
      createPlForm.onsubmit = async (e) => {
        e.preventDefault();
        if (!state.serverMode) return showToast('Requer servidor local ativo.');
        const title = document.getElementById('catPlTitleInp')?.value.trim();
        const kind = document.getElementById('catPlKindSel')?.value || 'custom';
        const description = document.getElementById('catPlDescInp')?.value.trim() || '';
        try {
          const res = await fetch('/api/curadoria/playlists', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ channel: chData.key, mode: 'manual', title, kind, description }),
          });
          const json = await res.json();
          if (!res.ok) throw new Error(json.error || 'Erro ao criar playlist');
          applyCuradoriaMutationResponse(json, chData.key);
          state.catalogExpandedPlaylistId = json.playlist?.id || null;
          renderCatalogView(container);
          showToast(`Playlist "${title}" criada!`);
        } catch (err) {
          showToast(err.message);
        }
      };
    }

    const importPlForm = document.getElementById('catImportPlaylistForm');
    if (importPlForm) {
      importPlForm.onsubmit = async (e) => {
        e.preventDefault();
        if (!state.serverMode) return showToast('Requer servidor local ativo.');
        const urlOrId = document.getElementById('catImportPlUrlInp')?.value.trim();
        const title = document.getElementById('catImportPlTitleInp')?.value.trim() || undefined;
        const kind = document.getElementById('catImportPlKindSel')?.value || 'reagir';
        showToast('Importando playlist do YouTube...');
        try {
          const res = await fetch('/api/curadoria/playlists', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ channel: chData.key, mode: 'import', urlOrId, title, kind }),
          });
          const json = await res.json();
          if (!res.ok) throw new Error(json.error || 'Erro ao importar playlist');
          applyCuradoriaMutationResponse(json, chData.key);
          state.catalogExpandedPlaylistId = json.playlist?.id || null;
          renderCatalogView(container);
          showToast(`Playlist "${json.playlist?.title || ''}" importada (${(json.playlist?.items || []).length} vídeos)!`);
        } catch (err) {
          showToast(err.message);
        }
      };
    }

    const addCatForm = document.getElementById('catAddCategoryForm');
    if (addCatForm) {
      addCatForm.onsubmit = async (e) => {
        e.preventDefault();
        if (!state.serverMode) return showToast('Requer servidor local ativo.');
        const name = document.getElementById('catNewCatName')?.value.trim();
        const icon = document.getElementById('catNewCatIcon')?.value.trim() || '🏷️';
        const color = document.getElementById('catNewCatColor')?.value || '#38bdf8';
        try {
          const res = await fetch('/api/curadoria/categories', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ channel: chData.key, name, icon, color }),
          });
          const json = await res.json();
          if (!res.ok) throw new Error(json.error || 'Erro ao criar categoria');
          applyCuradoriaMutationResponse(json, chData.key);
          renderCatalogView(container);
          showToast(`Categoria "${name}" salva!`);
        } catch (err) {
          showToast(err.message);
        }
      };
    }

    container.querySelectorAll('[data-del-cat]').forEach((btn) => {
      btn.onclick = async () => {
        if (!state.serverMode) return;
        try {
          const res = await fetch(
            `/api/curadoria/categories?channel=${encodeURIComponent(chData.key)}&id=${encodeURIComponent(btn.dataset.delCat)}`,
            { method: 'DELETE' }
          );
          const json = await res.json();
          if (!res.ok) throw new Error(json.error || 'Erro ao remover categoria');
          applyCuradoriaMutationResponse(json, chData.key);
          renderCatalogView(container);
        } catch (err) {
          showToast(err.message);
        }
      };
    });

    container.querySelectorAll('[data-toggle-pl]').forEach((btn) => {
      btn.onclick = () => {
        const plId = btn.dataset.togglePl;
        state.catalogExpandedPlaylistId = state.catalogExpandedPlaylistId === plId ? null : plId;
        renderCatalogView(container);
      };
    });

    container.querySelectorAll('[data-del-pl]').forEach((btn) => {
      btn.onclick = async () => {
        if (!state.serverMode) return;
        if (!confirm('Remover esta playlist de curadoria?')) return;
        try {
          const res = await fetch(
            `/api/curadoria/playlists?channel=${encodeURIComponent(chData.key)}&id=${encodeURIComponent(btn.dataset.delPl)}`,
            { method: 'DELETE' }
          );
          const json = await res.json();
          if (!res.ok) throw new Error(json.error || 'Erro ao excluir playlist');
          applyCuradoriaMutationResponse(json, chData.key);
          renderCatalogView(container);
          showToast('Playlist removida.');
        } catch (err) {
          showToast(err.message);
        }
      };
    });

    container.querySelectorAll('[data-pl-add-form]').forEach((form) => {
      form.onsubmit = async (e) => {
        e.preventDefault();
        if (!state.serverMode) return showToast('Requer servidor local ativo.');
        const playlistId = form.dataset.plAddForm;
        const urlOrId = form.querySelector(`[data-pl-url-input="${playlistId}"]`)?.value.trim();
        if (!urlOrId) return;
        showToast('Buscando metadados do vídeo...');
        try {
          const res = await fetch('/api/curadoria/playlists/item', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ channel: chData.key, playlistId, urlOrId }),
          });
          const json = await res.json();
          if (!res.ok) throw new Error(json.error || 'Erro ao adicionar vídeo');
          applyCuradoriaMutationResponse(json, chData.key);
          renderCatalogView(container);
          showToast(`Adicionado: ${json.addedItem?.title || urlOrId}`);
        } catch (err) {
          showToast(err.message);
        }
      };
    });

    const updatePlItem = async (pairStr, patch) => {
      if (!state.serverMode) return;
      const [playlistId, videoId] = pairStr.split('::');
      try {
        const res = await fetch('/api/curadoria/playlists/item', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ channel: chData.key, playlistId, videoId, ...patch }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Erro ao atualizar item');
        applyCuradoriaMutationResponse(json, chData.key);
        showToast('Item atualizado!');
      } catch (err) {
        showToast(err.message);
      }
    };

    container.querySelectorAll('[data-pl-item-cat]').forEach((sel) => {
      sel.onchange = () => updatePlItem(sel.dataset.plItemCat, { category: sel.value });
    });
    container.querySelectorAll('[data-pl-item-status]').forEach((sel) => {
      sel.onchange = () => updatePlItem(sel.dataset.plItemStatus, { status: sel.value });
    });
    container.querySelectorAll('[data-pl-item-notes]').forEach((inp) => {
      inp.onchange = () => updatePlItem(inp.dataset.plItemNotes, { notes: inp.value });
    });
    container.querySelectorAll('[data-pl-create-script]').forEach((btn) => {
      btn.onclick = () => {
        const [playlistId, videoId] = btn.dataset.plCreateScript.split('::');
        const pl = playlists.find((p) => p.id === playlistId);
        const item = (pl?.items || []).find((it) => (it.videoId || it.id) === videoId);
        if (item) triggerCreateCuradoriaScript(item, item.notes || '', playlistId);
      };
    });
    container.querySelectorAll('[data-open-doc]').forEach((btn) => {
      btn.onclick = () => setView('scripts', btn.dataset.openDoc);
    });
    container.querySelectorAll('[data-pl-rem-item]').forEach((btn) => {
      btn.onclick = async () => {
        if (!state.serverMode) return;
        const [playlistId, videoId] = btn.dataset.plRemItem.split('::');
        try {
          const res = await fetch(
            `/api/curadoria/playlists/item?channel=${encodeURIComponent(chData.key)}&playlistId=${encodeURIComponent(playlistId)}&videoId=${encodeURIComponent(videoId)}`,
            { method: 'DELETE' }
          );
          const json = await res.json();
          if (!res.ok) throw new Error(json.error || 'Erro ao remover item');
          applyCuradoriaMutationResponse(json, chData.key);
          renderCatalogView(container);
        } catch (err) {
          showToast(err.message);
        }
      };
    });
  }
}

registerLifecycleHooks({ ensureCatalogCuradoria });
registerViewRenderer('catalog', renderCatalogView);
