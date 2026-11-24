import { KANBAN_COLS, MD, SERIE_META } from '../core/constants.js';
import { setView } from '../core/router.js';
import { openNewDocModal } from '../core/modals.js';
import {
  getActiveChannelData,
  getChannelSeriesList,
  getSeriesStats,
  initSelectedSeriesForChannel,
  registerViewRenderer,
  state,
} from '../core/state.js';
import { formatDatePt, formatNumber } from '../core/utils.js';

export function buildChartPoints(chData) {
  const videos = [...(chData.videos || [])].filter((v) => state.selectedSeries.has(v.serie));
  const docs = (chData.docs || []).filter(
    (d) =>
      (state.selectedSeries.size === 0 || state.selectedSeries.has(d.meta.serie)) &&
      d.meta.status !== 'template' &&
      d.meta.status !== 'referencia'
  );

  if (state.chartMode === 'pipeline') {
    return KANBAN_COLS.map((col) => {
      const count = docs.filter((d) => d.meta.status === col.key).length;
      return {
        xLabel: col.label,
        pillDate: `${count} arquivos`,
        badgeText: `${count} itens`,
        value: count,
        title: `Estágio ${col.label}: ${count} documento(s) nas séries selecionadas`,
        action: () => setView('pipeline'),
      };
    });
  }

  const sorted = videos.sort((a, b) => String(a.published || '').localeCompare(String(b.published || '')));
  if (sorted.length === 0) {
    return [
      {
        xLabel: 'Sem vídeos',
        pillDate: `${docs.length} .md`,
        badgeText: '0 vídeos',
        value: 0,
        title:
          docs.length > 0
            ? `As séries selecionadas têm ${docs.length} arquivo(s) .md — clique para abrir Pipeline .md`
            : 'Selecione 1+ série com vídeos ou alterne para Pipeline .md',
        action: () => {
          state.chartMode = 'pipeline';
          state.chartHoverIdx = null;
          renderDashboard(document.getElementById('viewContainer'));
        },
      },
    ];
  }

  let running = 0;
  return sorted.map((v) => {
    running += Number(v.views || 0);
    const val = state.chartMode === 'cumulative' ? running : Number(v.views || 0);
    return {
      xLabel: String(v.published || '').slice(5),
      pillDate: formatDatePt(v.published),
      badgeText: `${formatNumber(val)} views`,
      value: val,
      title: `${v.title} (${v.type === 'short' ? 'Short' : 'Longo'} • ${v.serie})`,
      url: v.url,
      action: () => globalThis.open(v.url, '_blank', 'noopener,noreferrer'),
    };
  });
}

export function renderMainChartSvg(points) {
  const W = 680;
  const H = 238;
  const padL = 48;
  const padR = 26;
  const padT = 36;
  const padB = 34;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const maxRaw = Math.max(1, ...points.map((p) => p.value));
  const stepNice = maxRaw <= 10 ? 2 : maxRaw <= 50 ? 10 : maxRaw <= 500 ? 100 : 250;
  const maxY = Math.ceil((maxRaw * 1.16) / stepNice) * stepNice;

  const coords = points.map((p, idx) => {
    const x = points.length === 1 ? padL + plotW / 2 : padL + (idx / (points.length - 1)) * plotW;
    const y = padT + plotH - (p.value / maxY) * plotH;
    return { ...p, x, y, idx };
  });

  let activeIdx = state.chartHoverIdx;
  if (activeIdx === null || activeIdx < 0 || activeIdx >= coords.length) {
    let bestIdx = coords.length - 1;
    let bestVal = -1;
    coords.forEach((c, i) => {
      if (c.value > bestVal) {
        bestVal = c.value;
        bestIdx = i;
      }
    });
    activeIdx = bestIdx;
  }
  const active = coords[activeIdx] || coords[0];

  const dots = [];
  const cols = Math.max(8, Math.min(14, coords.length));
  for (let r = 0; r <= 4; r++) {
    const gy = padT + (r / 4) * plotH;
    for (let c = 0; c <= cols; c++) {
      const gx = padL + (c / cols) * plotW;
      dots.push(`<circle cx="${gx.toFixed(1)}" cy="${gy.toFixed(1)}" r="1.05" fill="rgba(255,255,255,0.16)" />`);
    }
  }

  const yLabels = [];
  for (let r = 0; r <= 4; r++) {
    const val = Math.round(maxY * (1 - r / 4));
    const gy = padT + (r / 4) * plotH + 3;
    yLabels.push(
      `<text x="${padL - 10}" y="${gy.toFixed(1)}" text-anchor="end" class="chart-y-label">${formatNumber(val)}</text>`
    );
  }

  const xStep = Math.max(1, Math.ceil(coords.length / 8));
  const xLabels = coords
    .filter((_, i) => i % xStep === 0 || i === coords.length - 1)
    .filter((c) => Math.abs(c.x - active.x) > 42)
    .map(
      (c) =>
        `<text x="${c.x.toFixed(1)}" y="${H - 9}" text-anchor="middle" class="chart-x-label">${MD.escapeHtml(c.xLabel)}</text>`
    )
    .join('');

  const pathD = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
  const areaD =
    coords.length > 1
      ? `${pathD} L${coords[coords.length - 1].x.toFixed(1)},${(padT + plotH).toFixed(1)} L${coords[0].x.toFixed(1)},${(padT + plotH).toFixed(1)} Z`
      : '';

  const badgeW = Math.max(66, active.badgeText.length * 7.2 + 16);
  const badgeX = Math.min(Math.max(active.x - badgeW / 2, padL), W - padR - badgeW);
  const badgeY = 4;

  const pillW = Math.max(82, active.pillDate.length * 6.8 + 18);
  const pillX = Math.min(Math.max(active.x - pillW / 2, padL - 6), W - padR - pillW + 6);

  const hitCols = coords
    .map((c, i) => {
      const half = coords.length > 1 ? plotW / (coords.length - 1) / 2 : plotW / 2;
      return `<rect x="${(c.x - half).toFixed(1)}" y="${padT}" width="${(half * 2).toFixed(1)}" height="${plotH}" class="chart-hit-col" data-chart-idx="${i}" />`;
    })
    .join('');

  return {
    active,
    svg: `
      <svg viewBox="0 0 ${W} ${H}" class="chart-svg" preserveAspectRatio="none">
        <defs>
          <linearGradient id="cromAreaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="var(--accent)" stop-opacity="0.22" />
            <stop offset="100%" stop-color="var(--accent)" stop-opacity="0" />
          </linearGradient>
        </defs>
        ${dots.join('')}
        ${yLabels.join('')}
        ${xLabels}
        ${areaD ? `<path d="${areaD}" fill="url(#cromAreaGrad)" />` : ''}
        ${coords.length > 1 ? `<path d="${pathD}" fill="none" stroke="#ffffff" stroke-width="2.1" stroke-linejoin="round" stroke-linecap="round" />` : ''}
        <line x1="${active.x.toFixed(1)}" y1="26" x2="${active.x.toFixed(1)}" y2="${H - 28}" stroke="var(--accent)" stroke-width="1.3" stroke-opacity="0.85" />
        <rect x="${(active.x - 4).toFixed(1)}" y="${(active.y - 4).toFixed(1)}" width="8" height="8" rx="1.5" fill="#141522" stroke="#ffffff" stroke-width="2" />
        <rect x="${badgeX.toFixed(1)}" y="${badgeY}" width="${badgeW.toFixed(1)}" height="22" rx="5" class="chart-badge-rect" />
        <text x="${(badgeX + badgeW / 2).toFixed(1)}" y="${badgeY + 14.5}" text-anchor="middle" class="chart-badge-text">${MD.escapeHtml(active.badgeText)}</text>
        <rect x="${pillX.toFixed(1)}" y="${H - 24}" width="${pillW.toFixed(1)}" height="20" rx="5" class="chart-date-pill" />
        <text x="${(pillX + pillW / 2).toFixed(1)}" y="${H - 10.5}" text-anchor="middle" class="chart-date-text">${MD.escapeHtml(active.pillDate)}</text>
        ${hitCols}
      </svg>
    `,
  };
}

export function renderSparklineSvg(values, strokeColor = 'var(--accent)') {
  if (!values || values.length < 2) values = [2, 5, 4, 8, 6, 11];
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = Math.max(1, max - min);
  const w = 78;
  const h = 22;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = h - 2 - ((v - min) / span) * (h - 4);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return `<svg viewBox="0 0 ${w} ${h}" class="spark-svg"><polyline fill="none" stroke="${strokeColor}" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" points="${pts.join(' ')}" /></svg>`;
}

export function bindChartHoverEvents(box, pts) {
  box.querySelectorAll('[data-chart-idx]').forEach((rect) => {
    rect.onmouseenter = () => {
      const idx = Number(rect.dataset.chartIdx);
      if (state.chartHoverIdx !== idx) {
        state.chartHoverIdx = idx;
        const updated = renderMainChartSvg(pts);
        box.innerHTML = updated.svg;
        const cap = document.getElementById('chartActiveTitle');
        if (cap) cap.textContent = updated.active.title;
        bindChartHoverEvents(box, pts);
      }
    };
    rect.onclick = () => {
      const pt = pts[Number(rect.dataset.chartIdx)];
      if (pt && pt.action) pt.action();
    };
  });
}

export function renderDashboard(container) {
  const chData = getActiveChannelData();
  const channel = chData.channel || {};
  const isPaused = channel.status === 'pausado';
  const seriesList = getSeriesStats(chData);
  const chartPoints = buildChartPoints(chData);
  const chartRendered = renderMainChartSvg(chartPoints);

  const docs = chData.docs || [];
  const videos = chData.videos || [];
  const totalViews = videos.reduce((acc, v) => acc + Number(v.views || 0), 0);
  const totalVideosPublic = Number(channel.totalVideos || videos.length || 0);

  const topSeriesForPulse = seriesList
    .filter((s) => s.videosCount > 0)
    .sort((a, b) => b.views - a.views)
    .slice(0, 3);

  const totalWords = docs.reduce((a, d) => a + (d.stats?.words || 0), 0);
  const checksDone = docs.reduce((a, d) => a + (d.stats?.checksDone || 0), 0);
  const checksTotal = docs.reduce((a, d) => a + (d.stats?.checksTotal || 0), 0);

  const filteredDocs = docs.filter((d) => {
    if (state.historyStatusFilter !== 'all' && d.meta.status !== state.historyStatusFilter) return false;
    if (state.historyFolderFilter !== 'all' && d.topFolder !== state.historyFolderFilter) return false;
    if (state.selectorTab !== 'balance' && state.selectedSeries.size > 0 && !state.selectedSeries.has(d.meta.serie)) {
      return false;
    }
    return true;
  });

  const foldersList = Array.from(new Set(docs.map((d) => d.topFolder))).sort();

  let channelBannerHtml = '';
  if (channel.bannerEnabled && (channel.bannerTitle || channel.bannerSubtitle || channel.bannerBadge)) {
    channelBannerHtml = `
      <div class="channel-status-banner${isPaused ? '' : ' is-active'}">
        <div class="csb-left">
          ${channel.bannerBadge ? `<span class="channel-status-badge ${isPaused ? 'is-pausado' : 'is-ativo'}">${MD.escapeHtml(channel.bannerBadge)}</span>` : ''}
          <div>
            ${channel.bannerTitle ? `<div class="csb-title">${MD.escapeHtml(channel.bannerTitle)}</div>` : ''}
            ${channel.bannerSubtitle ? `<div class="csb-sub">${MD.escapeHtml(channel.bannerSubtitle)}</div>` : ''}
          </div>
        </div>
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          ${channel.bannerDocPath ? `<button type="button" class="btn-sm" data-open-doc="${MD.escapeHtml(channel.bannerDocPath)}">Abrir Doc</button>` : ''}
          <button type="button" class="btn-sm" id="bannerConfigBtn">⚙ Configurar</button>
        </div>
      </div>
    `;
  }

  let seriesSpotlightHtml = '';
  const spotlightList = Array.isArray(channel.spotlightSeries) ? channel.spotlightSeries : [];
  if (spotlightList.length > 0) {
    const spotItems = spotlightList
      .map((name) => {
        const stat = seriesList.find((s) => s.name === name) || {
          name,
          meta: SERIE_META[name] || { icon: '✦', color: '#e12d78' },
          docsCount: 0,
          videosCount: 0,
        };
        const isOnlyThis = state.selectedSeries.size === 1 && state.selectedSeries.has(name);
        const manifestDoc = docs.find((d) => d.meta.serie === name && d.filename.toLowerCase() === '_serie.md');
        const folderPath = SERIE_META[name]?.folder || (manifestDoc ? manifestDoc.folder : '');
        const openPath = manifestDoc?.path || (folderPath ? `${folderPath}/_serie.md` : '');
        return `
          <div class="serie-chip-card${isOnlyThis ? ' is-selected' : ''}" data-spot-filter="${MD.escapeHtml(name)}" style="cursor:pointer;">
            <span class="sel-icon" style="background: ${stat.meta.color}22; border: 1px solid ${stat.meta.color}66; color:${stat.meta.color}">${stat.meta.icon}</span>
            <div style="min-width:0; flex:1;">
              <div class="sel-name">${MD.escapeHtml(name)}</div>
              <div class="sel-sub">${stat.docsCount} .md${folderPath ? ` • ${MD.escapeHtml(folderPath)}` : ` • ${stat.videosCount} vídeos`}</div>
            </div>
            ${openPath ? `<button type="button" class="kc-move-btn" data-spot-open="${MD.escapeHtml(openPath)}" title="Abrir manifesto da série">Abrir</button>` : ''}
          </div>
        `;
      })
      .join('');

    const hasSeriesReadme = docs.some((d) => d.path === '06-series/README.md');
    seriesSpotlightHtml = `
      <section class="series-spotlight">
        <div class="section-subhead" style="margin-bottom:10px;">
          <h2 class="panel-title">Séries em Destaque (${MD.escapeHtml(channel.name || chData.key)})</h2>
          <div style="display:flex; gap:8px;">
            ${hasSeriesReadme ? '<button type="button" class="btn-sm" data-open-doc="06-series/README.md">Mapa das Séries</button>' : ''}
            <button type="button" class="btn-sm btn-accent" id="newSerieEpBtn">+ Novo Episódio de Série</button>
          </div>
        </div>
        <div class="series-spotlight-grid">${spotItems}</div>
      </section>
    `;
  }

  let selectorBodyHtml = '';
  if (state.selectorTab === 'balance') {
    const maxWeight = Math.max(1, ...seriesList.map((s) => Math.max(s.views, s.docsCount * 10)));
    selectorBodyHtml = `
      <div class="selector-list">
        ${seriesList
          .map((s) => {
            const weight = Math.max(s.views, s.docsCount * 10);
            const pct = Math.round((weight / maxWeight) * 100);
            return `
              <div class="selector-row is-active" style="flex-direction:column; align-items:stretch; gap:6px;">
                <div style="display:flex; justify-content:space-between; font-size:12px;">
                  <strong>${MD.escapeHtml(s.name)}</strong>
                  <span style="font-family:var(--font-mono); color:var(--text-2);">${formatNumber(s.views)} views • ${s.docsCount} .md</span>
                </div>
                <div style="height:5px; border-radius:99px; background:rgba(255,255,255,0.06); overflow:hidden;">
                  <div style="height:100%; width:${Math.max(6, pct)}%; background:linear-gradient(90deg, var(--accent-2), var(--accent)); border-radius:99px;"></div>
                </div>
              </div>
            `;
          })
          .join('')}
      </div>
    `;
  } else {
    selectorBodyHtml = `
      <div class="selector-list">
        ${seriesList
          .map((s) => {
            const isActive = state.selectedSeries.has(s.name);
            return `
              <button type="button" class="selector-row${isActive ? ' is-active' : ''}" data-serie-toggle="${MD.escapeHtml(s.name)}">
                <span class="sel-radio">${isActive ? '✓' : ''}</span>
                <span class="sel-icon" style="background: ${s.meta.color}22; border: 1px solid ${s.meta.color}66; color:${s.meta.color}">${s.meta.icon}</span>
                <span class="sel-info">
                  <span class="sel-name">${MD.escapeHtml(s.name)}</span>
                  <span class="sel-sub">${s.videosCount} vídeos • ${formatNumber(s.views)} views • ${s.docsCount} .md</span>
                </span>
                <span class="sel-dot"></span>
              </button>
            `;
          })
          .join('')}
      </div>
      <div class="selector-actions">
        <button type="button" class="btn-outline-sm" id="selectAllSeriesBtn">Selecionar Todos</button>
        <button type="button" class="btn-outline-sm is-strong" id="clearAllSeriesBtn">Limpar Filtro</button>
      </div>
    `;
  }

  const pulseHtml =
    state.pulseTab === 'channel'
      ? `
        <div class="pulse-hero">
          <span class="pulse-label">${totalVideosPublic > videos.length ? `Últimos ${videos.length} no feed RSS (${totalVideosPublic} vídeos públicos)` : 'Total acumulado no catálogo'}</span>
          <div class="pulse-big-row">
            <span class="pulse-big-num">${formatNumber(totalViews)} <small style="font-size:13px; color:var(--text-3); font-weight:500;">views</small></span>
            ${renderSparklineSvg(videos.slice().reverse().map((v) => v.views), 'var(--accent)')}
            <span class="pulse-delta is-up">${formatNumber(totalVideosPublic)} vídeos</span>
          </div>
        </div>
        <div class="pulse-list">
          ${topSeriesForPulse
            .map((s, idx) => {
              const vSeries = videos
                .filter((v) => v.serie === s.name)
                .slice()
                .reverse()
                .map((v) => Number(v.views || 0));
              const avg = s.videosCount ? Math.round(s.views / s.videosCount) : 0;
              const colors = ['var(--accent)', 'var(--accent-2)', 'var(--info)'];
              return `
                <div class="pulse-item">
                  <div>
                    <span class="pulse-item-label">${MD.escapeHtml(s.name)} (${s.videosCount} vídeos)</span>
                    <span class="pulse-item-val">${formatNumber(s.views)} <small style="font-size:11px; color:var(--text-3); font-weight:500;">views</small></span>
                  </div>
                  ${renderSparklineSvg(vSeries, colors[idx % colors.length])}
                  <span class="pulse-delta">${avg} méd</span>
                </div>
              `;
            })
            .join('') || '<div class="pulse-item"><span class="pulse-item-label">Nenhum vídeo indexado no RSS ainda.</span></div>'}
        </div>
      `
      : `
        <div class="pulse-hero">
          <span class="pulse-label">Volume escrito no workspace (${MD.escapeHtml(channel.name || chData.key)})</span>
          <div class="pulse-big-row">
            <span class="pulse-big-num">${formatNumber(totalWords)} <small style="font-size:13px; color:var(--text-3); font-weight:500;">palavras</small></span>
            ${renderSparklineSvg([Math.max(100, Math.round(totalWords * 0.2)), Math.max(200, Math.round(totalWords * 0.55)), totalWords], 'var(--accent)')}
            <span class="pulse-delta is-up">${docs.length} .md</span>
          </div>
        </div>
        <div class="pulse-list">
          <div class="pulse-item">
            <div>
              <span class="pulse-item-label">Em Produção / Roteiro</span>
              <span class="pulse-item-val">${docs.filter((d) => ['roteiro', 'gravando', 'edicao'].includes(d.meta.status)).length}</span>
            </div>
            ${renderSparklineSvg([1, 2, 2, Math.max(1, docs.filter((d) => d.meta.status === 'roteiro').length)], 'var(--accent)')}
            <span class="pulse-delta is-up">ativos</span>
          </div>
          <div class="pulse-item">
            <div>
              <span class="pulse-item-label">Ideias & Pesquisa</span>
              <span class="pulse-item-val">${docs.filter((d) => ['ideia', 'pesquisa'].includes(d.meta.status)).length}</span>
            </div>
            ${renderSparklineSvg([1, 2, 3, Math.max(1, docs.filter((d) => d.meta.status === 'ideia').length)], 'var(--accent-2)')}
            <span class="pulse-delta">backlog</span>
          </div>
          <div class="pulse-item">
            <div>
              <span class="pulse-item-label">Checklists Concluídos</span>
              <span class="pulse-item-val">${checksDone}/${checksTotal}</span>
            </div>
            ${renderSparklineSvg([1, 2, 3, Math.max(1, checksDone)], 'var(--ok)')}
            <span class="pulse-delta is-up">${checksTotal ? Math.round((checksDone / checksTotal) * 100) : 0}%</span>
          </div>
        </div>
      `;

  container.innerHTML = `
    ${channelBannerHtml}
    ${seriesSpotlightHtml}

    <section class="dash-grid">
      <div class="dash-card">
        <div class="panel-head">
          <h2 class="panel-title">Desempenho & Fluxo (${MD.escapeHtml(channel.handle || channel.name)})</h2>
          <div class="tab-strip" id="chartModeTabs">
            <button type="button" class="${state.chartMode === 'views' ? 'active' : ''}" data-chart-mode="views">Views / Vídeo</button>
            <button type="button" class="${state.chartMode === 'cumulative' ? 'active' : ''}" data-chart-mode="cumulative">Acumulado</button>
            <button type="button" class="${state.chartMode === 'pipeline' ? 'active' : ''}" data-chart-mode="pipeline">Pipeline .md</button>
          </div>
        </div>
        <div class="chart-box" id="mainChartBox">
          ${chartRendered.svg}
        </div>
        <div class="chart-caption-bar">
          <span class="chart-caption-title" id="chartActiveTitle">${MD.escapeHtml(chartRendered.active.title)}</span>
          <button type="button" class="btn-sm" id="chartOpenTargetBtn">${state.chartMode === 'pipeline' ? 'Abrir Kanban ↗' : chartRendered.active.url ? 'Abrir no YouTube ↗' : 'Ver Pipeline .md ↗'}</button>
        </div>
      </div>

      <div class="dash-card selector-panel">
        <div class="panel-head">
          <div class="tab-strip" id="selectorTabs" style="width:100%; justify-content:space-between;">
            <button type="button" class="${state.selectorTab === 'multi' ? 'active' : ''}" data-sel-tab="multi">Múltipla</button>
            <button type="button" class="${state.selectorTab === 'single' ? 'active' : ''}" data-sel-tab="single">Única</button>
            <button type="button" class="${state.selectorTab === 'balance' ? 'active' : ''}" data-sel-tab="balance">Balanço</button>
          </div>
        </div>
        ${selectorBodyHtml}
      </div>
    </section>

    <section class="dash-bottom">
      <div class="dash-card">
        <div class="panel-head">
          <h2 class="panel-title">Pulso do Estúdio</h2>
          <div class="tab-strip" id="pulseTabs">
            <button type="button" class="${state.pulseTab === 'channel' ? 'active' : ''}" data-pulse-tab="channel">Canal</button>
            <button type="button" class="${state.pulseTab === 'production' ? 'active' : ''}" data-pulse-tab="production">Roteiros</button>
          </div>
        </div>
        ${pulseHtml}
      </div>

      <div class="dash-card">
        <div class="history-head">
          <h2 class="panel-title">Roteiros & Arquivos Markdown</h2>
          <div class="filter-selects">
            <select class="select-dark" id="histStatusSelect">
              <option value="all"${state.historyStatusFilter === 'all' ? ' selected' : ''}>Todos os status</option>
              <option value="gravando"${state.historyStatusFilter === 'gravando' ? ' selected' : ''}>Gravando</option>
              <option value="roteiro"${state.historyStatusFilter === 'roteiro' ? ' selected' : ''}>Roteiro</option>
              <option value="ideia"${state.historyStatusFilter === 'ideia' ? ' selected' : ''}>Ideia</option>
              <option value="pesquisa"${state.historyStatusFilter === 'pesquisa' ? ' selected' : ''}>Pesquisa</option>
              <option value="publicado"${state.historyStatusFilter === 'publicado' ? ' selected' : ''}>Publicado</option>
              <option value="referencia"${state.historyStatusFilter === 'referencia' ? ' selected' : ''}>Referência</option>
              <option value="template"${state.historyStatusFilter === 'template' ? ' selected' : ''}>Template</option>
            </select>
            <select class="select-dark" id="histFolderSelect">
              <option value="all"${state.historyFolderFilter === 'all' ? ' selected' : ''}>Todas as pastas</option>
              ${foldersList.map((f) => `<option value="${MD.escapeHtml(f)}"${state.historyFolderFilter === f ? ' selected' : ''}>${MD.escapeHtml(f)}</option>`).join('')}
            </select>
          </div>
        </div>

        <div class="history-list">
          ${filteredDocs
            .slice(0, 10)
            .map((doc) => {
              const speakLabel = doc.stats.speakMinutes ? `${doc.stats.speakMinutes} min fala` : `${doc.stats.words} pal.`;
              return `
                <button type="button" class="history-row" data-open-doc="${MD.escapeHtml(doc.path)}">
                  <div style="min-width:0;">
                    <span class="hr-title">${MD.escapeHtml(doc.meta.titulo)}</span>
                    <span class="hr-sub">${MD.escapeHtml(doc.path)} • ${MD.escapeHtml(doc.meta.serie)}</span>
                  </div>
                  <span class="hr-date">${formatDatePt(doc.meta.data_alvo || doc.meta.data_criacao)}</span>
                  <div class="hr-right">
                    <span class="status-pill st-${MD.escapeHtml(doc.meta.status)}">${MD.escapeHtml(doc.meta.status)}</span>
                    <span class="hr-metric-sub" style="margin-top:3px;">${speakLabel} • ${formatNumber(doc.stats.words)} pal.</span>
                  </div>
                </button>
              `;
            })
            .join('') || '<p style="color:var(--text-3); padding:18px;">Nenhum arquivo combina com esse filtro.</p>'}
        </div>
      </div>
    </section>
  `;

  const bannerCfgBtn = document.getElementById('bannerConfigBtn');
  if (bannerCfgBtn) {
    bannerCfgBtn.onclick = () => {
      state.settingsChannelKey = chData.key;
      setView('settings');
    };
  }

  const newSerieEpBtn = document.getElementById('newSerieEpBtn');
  if (newSerieEpBtn) {
    newSerieEpBtn.onclick = () => {
      const firstSpot =
        (Array.isArray(channel.spotlightSeries) && channel.spotlightSeries[0]) ||
        getChannelSeriesList(chData)[0] ||
        '';
      const spotFolder = SERIE_META[firstSpot]?.folder || '02-roteiros/rascunhos';
      openNewDocModal({
        type: spotFolder.startsWith('06-series/') ? 'episodio-serie' : 'roteiro-longo',
        serie: firstSpot,
        folder: spotFolder,
      });
    };
  }

  container.querySelectorAll('[data-spot-filter]').forEach((card) => {
    card.onclick = (e) => {
      if (e.target.closest('[data-spot-open]')) return;
      const name = card.dataset.spotFilter;
      const isAlreadyOnly = state.selectedSeries.size === 1 && state.selectedSeries.has(name);
      if (isAlreadyOnly) {
        initSelectedSeriesForChannel(chData);
      } else {
        state.selectedSeries = new Set([name]);
      }
      state.chartHoverIdx = null;
      renderDashboard(container);
    };
  });

  container.querySelectorAll('[data-spot-open]').forEach((btn) => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const target = btn.dataset.spotOpen;
      const found = docs.find((d) => d.path === target);
      if (found) setView('scripts', found.path);
      else setView('scripts');
    };
  });

  container.querySelectorAll('#chartModeTabs button').forEach((btn) => {
    btn.onclick = () => {
      state.chartMode = btn.dataset.chartMode;
      state.chartHoverIdx = null;
      renderDashboard(container);
    };
  });

  container.querySelectorAll('#selectorTabs button').forEach((btn) => {
    btn.onclick = () => {
      state.selectorTab = btn.dataset.selTab;
      if (state.selectorTab === 'single' && state.selectedSeries.size > 1) {
        const first = Array.from(state.selectedSeries)[0] || seriesList[0]?.name || '';
        state.selectedSeries = first ? new Set([first]) : new Set();
      }
      renderDashboard(container);
    };
  });

  container.querySelectorAll('[data-serie-toggle]').forEach((btn) => {
    btn.onclick = () => {
      const name = btn.dataset.serieToggle;
      if (state.selectorTab === 'single') {
        state.selectedSeries = new Set([name]);
      } else if (state.selectedSeries.has(name)) {
        state.selectedSeries.delete(name);
      } else {
        state.selectedSeries.add(name);
      }
      state.chartHoverIdx = null;
      renderDashboard(container);
    };
  });

  const selAllBtn = document.getElementById('selectAllSeriesBtn');
  if (selAllBtn) {
    selAllBtn.onclick = () => {
      state.selectedSeries = new Set(seriesList.map((s) => s.name));
      state.chartHoverIdx = null;
      renderDashboard(container);
    };
  }

  const clrAllBtn = document.getElementById('clearAllSeriesBtn');
  if (clrAllBtn) {
    clrAllBtn.onclick = () => {
      state.selectedSeries.clear();
      state.chartHoverIdx = null;
      renderDashboard(container);
    };
  }

  container.querySelectorAll('#pulseTabs button').forEach((btn) => {
    btn.onclick = () => {
      state.pulseTab = btn.dataset.pulseTab;
      renderDashboard(container);
    };
  });

  const stSel = document.getElementById('histStatusSelect');
  if (stSel) {
    stSel.onchange = () => {
      state.historyStatusFilter = stSel.value;
      renderDashboard(container);
    };
  }
  const flSel = document.getElementById('histFolderSelect');
  if (flSel) {
    flSel.onchange = () => {
      state.historyFolderFilter = flSel.value;
      renderDashboard(container);
    };
  }

  container.querySelectorAll('[data-open-doc]').forEach((row) => {
    row.onclick = () => setView('scripts', row.dataset.openDoc);
  });

  const chartBox = document.getElementById('mainChartBox');
  if (chartBox) bindChartHoverEvents(chartBox, chartPoints);

  const openTargetBtn = document.getElementById('chartOpenTargetBtn');
  if (openTargetBtn) {
    openTargetBtn.onclick = () => {
      if (chartRendered.active.action) chartRendered.active.action();
    };
  }
}

registerViewRenderer('dashboard', renderDashboard);
