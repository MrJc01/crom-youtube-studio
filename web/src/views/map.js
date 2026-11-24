import {
  MD,
  SERIE_FLOW_PALETTE,
  SERIE_META,
  STATUS_VISUAL,
} from '../core/constants.js';
import { openNewDocModal } from '../core/modals.js';
import {
  setView,
  syncBrowserUrl,
  updateHeaderChrome,
} from '../core/router.js';
import {
  getActiveChannelData,
  normalizePayload,
  registerLifecycleHooks,
  registerViewRenderer,
  state,
} from '../core/state.js';
import { syncActiveTabFromState } from '../core/tabs.js';
import { formatNumber, showToast } from '../core/utils.js';

export function getSeriesFlowColor(serieName, idx = 0) {
  return SERIE_META[serieName]?.color || SERIE_FLOW_PALETTE[idx % SERIE_FLOW_PALETTE.length];
}

export function detectSequenceChains(docs) {
  const groups = new Map();
  for (const d of docs) {
    const slug = String(d.filename || d.path || '').replace(/\.md$/i, '').toLowerCase();
    let m = /^(.*?)[-_ ]?(?:parte|part|pt|ep|cap)[-_ ]?(\d+)(?:[-_ ].*)?$/.exec(slug);
    if (!m) {
      m = /^(.{3,}?\D)-(\d{1,2})$/.exec(slug);
    }
    if (!m) continue;
    const prefix = m[1].replace(/[-_ ]+$/, '');
    const num = Number(m[2]);
    if (!prefix || Number.isNaN(num)) continue;
    const key = `${d.meta.serie || 'geral'}::${prefix}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ doc: d, num });
  }
  const edges = [];
  for (const items of groups.values()) {
    if (items.length < 2) continue;
    items.sort((a, b) => a.num - b.num);
    for (let i = 0; i < items.length - 1; i++) {
      edges.push({ fromPath: items[i].doc.path, toPath: items[i + 1].doc.path });
    }
  }
  return edges;
}

export function renderClusterShapeSvg(cx, cy, r, shapeIdx, color) {
  const s = shapeIdx % 6;
  const fill = `${color}26`;
  const glow = `${color}45`;
  if (s === 0) {
    const pts = [];
    for (let i = 0; i < 8; i++) {
      const a = Math.PI / 8 + (i * Math.PI) / 4;
      pts.push(`${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`);
    }
    return `<polygon points="${pts.join(' ')}" fill="${fill}" stroke="${color}" stroke-width="2.2" /><polygon points="${pts.join(' ')}" fill="none" stroke="${glow}" stroke-width="6" opacity="0.25" />`;
  }
  if (s === 1) {
    const d = r * 1.15;
    const pts = `${cx},${cy - d} ${cx + d},${cy} ${cx},${cy + d} ${cx - d},${cy}`;
    return `<polygon points="${pts}" fill="${fill}" stroke="${color}" stroke-width="2.2" />`;
  }
  if (s === 2) {
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" stroke="${color}" stroke-width="2.2" /><circle cx="${cx}" cy="${cy}" r="${r + 6}" fill="none" stroke="${glow}" stroke-width="1.2" stroke-dasharray="4 4" />`;
  }
  if (s === 3) {
    const w = r * 2.25;
    const h = r * 1.45;
    return `<rect x="${cx - w / 2}" y="${cy - h / 2}" width="${w}" height="${h}" rx="${h / 2}" fill="${fill}" stroke="${color}" stroke-width="2.2" />`;
  }
  if (s === 4) {
    const w = r * 1.9;
    return `<rect x="${cx - w / 2}" y="${cy - w / 2}" width="${w}" height="${w}" rx="18" fill="${fill}" stroke="${color}" stroke-width="2.2" />`;
  }
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3 - Math.PI / 6;
    pts.push(`${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`);
  }
  return `<polygon points="${pts.join(' ')}" fill="${fill}" stroke="${color}" stroke-width="2.2" />`;
}

export function computeFlowLayout(docs, chData, layoutKind) {
  const seqEdges = detectSequenceChains(docs);
  const seqSet = new Set(seqEdges.map((e) => `${e.fromPath}=>${e.toPath}`));
  const groupsMap = new Map();
  for (const d of docs) {
    const key = d.meta.serie || 'Sem Série';
    if (!groupsMap.has(key)) groupsMap.set(key, []);
    groupsMap.get(key).push(d);
  }
  const groups = Array.from(groupsMap.entries()).sort((a, b) => b[1].length - a[1].length);

  if (layoutKind === 'blocks') {
    const vpW = document.getElementById('mapFlowViewport')?.clientWidth || globalThis.innerWidth || 1200;
    const cols = vpW < 920 ? 1 : groups.length <= 1 ? 1 : 2;
    const maxPerRow = vpW < 760 ? 2 : 3;
    const secPadX = 24;
    const secPadTop = 48;
    const secPadBot = 24;
    const cardW = 232;
    const cardH = 100;
    const gapX = 36;
    const gapY = 28;
    const secGapX = 46;
    const secGapY = 44;

    const sections = [];
    const nodes = [];
    const edges = [];
    const nodeByPath = new Map();

    const builtSections = groups.map(([serieName, items], gIdx) => {
      const color = getSeriesFlowColor(serieName, gIdx);
      const colsInSec = Math.min(maxPerRow, Math.max(1, items.length));
      const rowsInSec = Math.max(1, Math.ceil(items.length / maxPerRow));
      const secW = secPadX * 2 + colsInSec * cardW + Math.max(0, colsInSec - 1) * gapX;
      const secH = secPadTop + secPadBot + rowsInSec * cardH + Math.max(0, rowsInSec - 1) * gapY;
      return { serieName, items, gIdx, color, secW, secH, colsInSec };
    });

    const rowHeights = [];
    const colWidths = new Array(cols).fill(0);
    builtSections.forEach((sec, idx) => {
      const c = idx % cols;
      const r = Math.floor(idx / cols);
      colWidths[c] = Math.max(colWidths[c], sec.secW);
      rowHeights[r] = Math.max(rowHeights[r] || 0, sec.secH);
    });

    const margin = 48;
    const colXs = [];
    let curX = margin;
    for (let c = 0; c < cols; c++) {
      colXs.push(curX);
      curX += colWidths[c] + secGapX;
    }
    const rowYs = [];
    let curY = margin;
    for (let r = 0; r < rowHeights.length; r++) {
      rowYs.push(curY);
      curY += rowHeights[r] + secGapY;
    }

    builtSections.forEach((sec, idx) => {
      const c = idx % cols;
      const r = Math.floor(idx / cols);
      const sx = colXs[c];
      const sy = rowYs[r];
      const secNum = idx + 1;

      sections.push({
        id: `sec-${secNum}`,
        x: sx,
        y: sy,
        w: sec.secW,
        h: sec.secH,
        color: sec.color,
        label: `${secNum}.0 ${sec.serieName}`,
        count: sec.items.length,
      });

      sec.items.forEach((doc, itemIdx) => {
        const ic = itemIdx % maxPerRow;
        const ir = Math.floor(itemIdx / maxPerRow);
        const nx = sx + secPadX + ic * (cardW + gapX);
        const ny = sy + secPadTop + ir * (cardH + gapY);
        const node = {
          doc,
          x: nx,
          y: ny,
          w: cardW,
          h: cardH,
          badge: `${secNum}.${itemIdx + 1}`,
          badgeColor: sec.color,
        };
        nodes.push(node);
        nodeByPath.set(doc.path, node);

        if (ic > 0) {
          const prevNode = nodes[nodes.length - 2];
          if (prevNode && !seqSet.has(`${prevNode.doc.path}=>${doc.path}`)) {
            edges.push({
              kind: 'elbow',
              fromX: prevNode.x + prevNode.w,
              fromY: prevNode.y + prevNode.h / 2,
              toX: node.x,
              toY: node.y + node.h / 2,
              color: `${sec.color}99`,
              dashed: true,
            });
          }
        }
      });
    });

    for (const se of seqEdges) {
      const a = nodeByPath.get(se.fromPath);
      const b = nodeByPath.get(se.toPath);
      if (a && b) {
        edges.push({
          kind: 'sequence',
          fromX: a.x + a.w,
          fromY: a.y + a.h / 2,
          toX: b.x,
          toY: b.y + b.h / 2,
          color: '#f59e0b',
          dashed: true,
        });
      }
    }

    const canvasW = Math.max(760, curX - secGapX + margin);
    const canvasH = Math.max(520, curY - secGapY + margin);
    return {
      layout: 'blocks',
      width: canvasW,
      height: canvasH,
      center: null,
      rings: [],
      hubs: [],
      sections,
      stageHeaders: [],
      nodes,
      edges,
    };
  }

  if (layoutKind === 'pipeline') {
    const stages = [
      { key: 'ideia', label: 'Ideia' },
      { key: 'pesquisa', label: 'Pesquisa' },
      { key: 'roteiro', label: 'Roteiro' },
      { key: 'gravando', label: 'Gravando' },
      { key: 'edicao', label: 'Edição' },
      { key: 'publicado', label: 'Publicado' },
    ];
    const knownKeys = new Set(stages.map((s) => s.key));
    const extraDocs = docs.filter((d) => !knownKeys.has(d.meta.status));
    if (extraDocs.length) stages.push({ key: 'outros', label: 'Docs & Outros' });

    const colW = 248;
    const colGap = 46;
    const cardW = 228;
    const cardH = 98;
    const cardGapY = 20;
    const marginX = 48;
    const headY = 48;
    const headH = 44;
    const startCardsY = headY + headH + 34;

    const stageHeaders = [];
    const nodes = [];
    const edges = [];
    const nodeByPath = new Map();
    let maxCards = 1;

    stages.forEach((st, colIdx) => {
      const colDocs =
        st.key === 'outros' ? extraDocs : docs.filter((d) => (d.meta.status || 'ideia') === st.key);
      maxCards = Math.max(maxCards, colDocs.length);
      const vis = STATUS_VISUAL[st.key] || STATUS_VISUAL.referencia;
      const cx = marginX + colIdx * (colW + colGap);

      stageHeaders.push({
        key: st.key,
        label: st.label,
        count: colDocs.length,
        x: cx,
        y: headY,
        w: colW,
        h: headH,
        color: vis.color,
        bg: vis.bg,
        border: vis.border,
      });

      if (colIdx > 0) {
        const prevHead = stageHeaders[colIdx - 1];
        edges.push({
          kind: 'stage',
          fromX: prevHead.x + prevHead.w,
          fromY: prevHead.y + prevHead.h / 2,
          toX: cx,
          toY: headY + headH / 2,
          color: 'rgba(255,255,255,0.42)',
          dashed: false,
        });
      }

      const spineX = cx + 10;
      colDocs.forEach((doc, rowIdx) => {
        const nx = cx + 20;
        const ny = startCardsY + rowIdx * (cardH + cardGapY);
        const sIdx = groups.findIndex(([name]) => name === doc.meta.serie);
        const badgeColor = getSeriesFlowColor(doc.meta.serie, Math.max(0, sIdx));
        const node = {
          doc,
          x: nx,
          y: ny,
          w: cardW,
          h: cardH,
          badge: doc.meta.serie || 'Geral',
          badgeColor,
        };
        nodes.push(node);
        nodeByPath.set(doc.path, node);

        edges.push({
          kind: 'branch',
          fromX: spineX,
          fromY: headY + headH,
          toX: nx,
          toY: ny + cardH / 2,
          color: `${vis.color}88`,
          dashed: false,
        });
      });
    });

    for (const se of seqEdges) {
      const a = nodeByPath.get(se.fromPath);
      const b = nodeByPath.get(se.toPath);
      if (a && b) {
        edges.push({
          kind: 'sequence',
          fromX: a.x + a.w,
          fromY: a.y + a.h / 2,
          toX: b.x,
          toY: b.y + b.h / 2,
          color: '#f59e0b',
          dashed: true,
        });
      }
    }

    const canvasW = marginX * 2 + stages.length * colW + Math.max(0, stages.length - 1) * colGap;
    const canvasH = Math.max(540, startCardsY + maxCards * (cardH + cardGapY) + 60);
    return {
      layout: 'pipeline',
      width: canvasW,
      height: canvasH,
      center: null,
      rings: [],
      hubs: [],
      sections: [],
      stageHeaders,
      nodes,
      edges,
    };
  }

  // Default: 'clusters' — Constelação (Clusters)
  const cardW = 228;
  const cardH = 98;
  const clusters = groups.map(([serieName, items], idx) => {
    const n = items.length;
    const childRx = Math.max(210, (n * 245) / (2 * Math.PI));
    const childRy = Math.max(170, (n * 175) / (2 * Math.PI));
    const outerR = Math.max(childRx, childRy) + 140;
    return {
      serieName,
      items,
      idx,
      color: getSeriesFlowColor(serieName, idx),
      shapeIdx: idx,
      childRx,
      childRy,
      outerR,
    };
  });

  const totalArc = clusters.reduce((acc, c) => acc + c.outerR * 2 + 88, 0);
  const maxClusterR = clusters.reduce((m, c) => Math.max(m, c.outerR), 280);
  const hubOrbitR =
    clusters.length <= 1 ? 300 : Math.max(460, maxClusterR + 210, totalArc / (2 * Math.PI));

  const worldHalf = Math.ceil(hubOrbitR + maxClusterR + 220);
  const cx = worldHalf;
  const cy = worldHalf;
  const canvasSize = worldHalf * 2;

  const hubs = [];
  const nodes = [];
  const edges = [];
  const nodeByPath = new Map();
  const hubLinks = [];
  const hubR = 56;
  const minHubDist = hubR + 128;
  const pad = 22;

  let angleCursor = -Math.PI / 2;
  clusters.forEach((cl) => {
    const wedge =
      clusters.length === 1 ? 0 : ((cl.outerR * 2 + 88) / (totalArc || 1)) * Math.PI * 2;
    const theta = clusters.length === 1 ? -Math.PI / 4 : angleCursor + wedge / 2;
    angleCursor += wedge;

    const hx = cx + hubOrbitR * Math.cos(theta);
    const hy = cy + hubOrbitR * Math.sin(theta);
    hubs.push({
      serieName: cl.serieName,
      count: cl.items.length,
      x: hx,
      y: hy,
      r: hubR,
      shapeIdx: cl.shapeIdx,
      color: cl.color,
    });

    edges.push({
      kind: 'curve',
      fromX: cx,
      fromY: cy,
      toX: hx,
      toY: hy,
      color: cl.color,
      width: 2.2,
    });

    const localNodes = cl.items.map((doc, i) => {
      const a = (i / Math.max(1, cl.items.length)) * Math.PI * 2 - Math.PI / 2;
      const nx = hx + cl.childRx * Math.cos(a) - cardW / 2;
      const ny = hy + cl.childRy * Math.sin(a) - cardH / 2;
      return {
        doc,
        x: nx,
        y: ny,
        w: cardW,
        h: cardH,
        badge: STATUS_VISUAL[doc.meta.status]?.label || doc.meta.status || 'Ideia',
        badgeColor: STATUS_VISUAL[doc.meta.status]?.color || cl.color,
      };
    });

    for (let iter = 0; iter < 36; iter++) {
      for (let i = 0; i < localNodes.length; i++) {
        const a = localNodes[i];
        const acx = a.x + a.w / 2;
        const acy = a.y + a.h / 2;
        const dxH = acx - hx;
        const dyH = acy - hy;
        const distH = Math.hypot(dxH, dyH) || 1;
        if (distH < minHubDist) {
          const push = minHubDist - distH;
          a.x += (dxH / distH) * push;
          a.y += (dyH / distH) * push;
        }
        for (let j = i + 1; j < localNodes.length; j++) {
          const b = localNodes[j];
          const ox = Math.min(a.x + a.w + pad, b.x + b.w + pad) - Math.max(a.x, b.x);
          const oy = Math.min(a.y + a.h + pad, b.y + b.h + pad) - Math.max(a.y, b.y);
          if (ox > 0 && oy > 0) {
            if (ox < oy) {
              const dir = a.x <= b.x ? -1 : 1;
              a.x += dir * (ox / 2);
              b.x -= dir * (ox / 2);
            } else {
              const dir = a.y <= b.y ? -1 : 1;
              a.y += dir * (oy / 2);
              b.y -= dir * (oy / 2);
            }
          }
        }
      }
    }

    for (const node of localNodes) {
      nodes.push(node);
      nodeByPath.set(node.doc.path, node);
      hubLinks.push({ node, hx, hy, color: `${cl.color}88` });
    }
  });

  const minCenterDist = 96 + Math.hypot(cardW, cardH) / 2;
  for (let iter = 0; iter < 28; iter++) {
    let movedAny = false;
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      const acx = a.x + a.w / 2;
      const acy = a.y + a.h / 2;

      const dxC = acx - cx;
      const dyC = acy - cy;
      const distC = Math.hypot(dxC, dyC) || 1;
      if (distC < minCenterDist) {
        const pushC = minCenterDist - distC;
        a.x += (dxC / distC) * pushC;
        a.y += (dyC / distC) * pushC;
        movedAny = true;
      }

      for (const h of hubs) {
        const dxH = a.x + a.w / 2 - h.x;
        const dyH = a.y + a.h / 2 - h.y;
        const distH = Math.hypot(dxH, dyH) || 1;
        if (distH < minHubDist) {
          const pushH = minHubDist - distH;
          a.x += (dxH / distH) * pushH;
          a.y += (dyH / distH) * pushH;
          movedAny = true;
        }
      }

      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j];
        const ox = Math.min(a.x + a.w + pad, b.x + b.w + pad) - Math.max(a.x, b.x);
        const oy = Math.min(a.y + a.h + pad, b.y + b.h + pad) - Math.max(a.y, b.y);
        if (ox > 0 && oy > 0) {
          movedAny = true;
          if (ox < oy) {
            const dir = a.x <= b.x ? -1 : 1;
            a.x += dir * (ox / 2);
            b.x -= dir * (ox / 2);
          } else {
            const dir = a.y <= b.y ? -1 : 1;
            a.y += dir * (oy / 2);
            b.y -= dir * (oy / 2);
          }
        }
      }
    }
    if (!movedAny) break;
  }

  for (const hl of hubLinks) {
    edges.push({
      kind: 'curve',
      fromX: hl.hx,
      fromY: hl.hy,
      toX: hl.node.x + hl.node.w / 2,
      toY: hl.node.y + hl.node.h / 2,
      color: hl.color,
      width: 1.4,
    });
  }

  for (const se of seqEdges) {
    const a = nodeByPath.get(se.fromPath);
    const b = nodeByPath.get(se.toPath);
    if (a && b) {
      edges.push({
        kind: 'sequence',
        fromX: a.x + a.w / 2,
        fromY: a.y + a.h / 2,
        toX: b.x + b.w / 2,
        toY: b.y + b.h / 2,
        color: '#f59e0b',
        dashed: true,
      });
    }
  }

  const ch = chData.channel || {};
  return {
    layout: 'clusters',
    width: canvasSize,
    height: canvasSize,
    center: { x: cx, y: cy, name: ch.name || chData.key, sub: `${docs.length} roteiros` },
    rings: [Math.round(hubOrbitR * 0.52), Math.round(hubOrbitR), Math.round(hubOrbitR + maxClusterR * 0.68)],
    hubs,
    sections: [],
    stageHeaders: [],
    nodes,
    edges,
  };
}

export function renderFlowchartSvgAndNodes(model) {
  const svgParts = [];
  svgParts.push(`
    <defs>
      <marker id="flowArrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
        <path d="M0,1 L7,4 L0,7 Z" fill="rgba(255,255,255,0.5)" />
      </marker>
      <marker id="flowArrowSeq" markerWidth="9" markerHeight="9" refX="7" refY="4" orient="auto">
        <path d="M0,1 L7,4 L0,7 Z" fill="#f59e0b" />
      </marker>
    </defs>
  `);

  if (model.center && model.rings.length) {
    for (const r of model.rings) {
      svgParts.push(
        `<circle cx="${model.center.x}" cy="${model.center.y}" r="${r}" fill="none" stroke="rgba(255,255,255,0.05)" stroke-width="1" stroke-dasharray="6 8" />`
      );
    }
  }

  for (const sec of model.sections) {
    svgParts.push(
      `<rect x="${sec.x}" y="${sec.y}" width="${sec.w}" height="${sec.h}" rx="16" fill="rgba(16,18,29,0.55)" stroke="${sec.color}66" stroke-width="1.5" stroke-dasharray="7 5" />`
    );
  }

  for (const edge of model.edges) {
    if (edge.kind === 'curve') {
      const dx = (edge.toX - edge.fromX) * 0.45;
      const d = `M ${edge.fromX.toFixed(1)} ${edge.fromY.toFixed(1)} C ${(edge.fromX + dx).toFixed(1)} ${edge.fromY.toFixed(1)}, ${(edge.toX - dx).toFixed(1)} ${edge.toY.toFixed(1)}, ${edge.toX.toFixed(1)} ${edge.toY.toFixed(1)}`;
      svgParts.push(`<path d="${d}" fill="none" stroke="${edge.color}" stroke-width="${edge.width || 1.5}" />`);
    } else if (edge.kind === 'branch') {
      const d = `M ${edge.fromX.toFixed(1)} ${edge.fromY.toFixed(1)} L ${edge.fromX.toFixed(1)} ${edge.toY.toFixed(1)} L ${edge.toX.toFixed(1)} ${edge.toY.toFixed(1)}`;
      svgParts.push(`<path d="${d}" fill="none" stroke="${edge.color}" stroke-width="1.5" />`);
    } else if (edge.kind === 'stage') {
      svgParts.push(
        `<line x1="${edge.fromX.toFixed(1)}" y1="${edge.fromY.toFixed(1)}" x2="${(edge.toX - 4).toFixed(1)}" y2="${edge.toY.toFixed(1)}" stroke="${edge.color}" stroke-width="1.8" marker-end="url(#flowArrow)" />`
      );
    } else {
      const midX = (edge.fromX + edge.toX) / 2;
      const d = `M ${edge.fromX.toFixed(1)} ${edge.fromY.toFixed(1)} L ${midX.toFixed(1)} ${edge.fromY.toFixed(1)} L ${midX.toFixed(1)} ${edge.toY.toFixed(1)} L ${edge.toX.toFixed(1)} ${edge.toY.toFixed(1)}`;
      svgParts.push(
        `<path d="${d}" fill="none" stroke="${edge.color}" stroke-width="2" stroke-dasharray="6 4" marker-end="url(#flowArrowSeq)" />`
      );
    }
  }

  for (const hub of model.hubs) {
    svgParts.push(renderClusterShapeSvg(hub.x, hub.y, hub.r, hub.shapeIdx, hub.color));
  }

  const centerHtml = model.center
    ? `
      <div class="map-flow-center" style="left:${model.center.x}px; top:${model.center.y}px;">
        <div class="map-flow-center-name">${MD.escapeHtml(model.center.name)}</div>
        <div class="map-flow-center-sub">${MD.escapeHtml(model.center.sub)}</div>
      </div>
    `
    : '';

  const hubsHtml = model.hubs
    .map(
      (h) => `
        <div class="map-flow-hub" style="left:${h.x}px; top:${h.y}px; width:${h.r * 2}px; height:${h.r * 2}px;">
          <span class="map-flow-hub-title">${MD.escapeHtml(h.serieName)}</span>
          <span class="map-flow-hub-count">${h.count} .md</span>
        </div>
      `
    )
    .join('');

  const sectionsHtml = model.sections
    .map(
      (s) => `
        <div class="map-flow-section-label" style="left:${s.x + 14}px; top:${s.y + 10}px; background:${s.color}28; border-color:${s.color}66;">
          <span>${MD.escapeHtml(s.label)}</span>
          <span style="opacity:0.75; font-family:var(--font-mono); font-size:10px;">(${s.count})</span>
        </div>
      `
    )
    .join('');

  const stagesHtml = model.stageHeaders
    .map(
      (sh) => `
        <div class="map-flow-stage-head" style="left:${sh.x}px; top:${sh.y}px; width:${sh.w}px; height:${sh.h}px; --st-color:${sh.color}; --st-border:${sh.border};">
          <span>${MD.escapeHtml(sh.label)}</span>
          <span class="kanban-count">${sh.count}</span>
        </div>
      `
    )
    .join('');

  const nodesHtml = model.nodes
    .map((n) => {
      const d = n.doc;
      const st = d.meta.status || 'ideia';
      const vis = STATUS_VISUAL[st] || STATUS_VISUAL.ideia;
      const fullTitle = d.meta.titulo || d.name || d.path;
      return `
        <button
          type="button"
          class="map-flow-node"
          data-flow-doc="${MD.escapeHtml(d.path)}"
          title="${MD.escapeHtml(fullTitle)}"
          style="left:${Math.round(n.x)}px; top:${Math.round(n.y)}px; width:${n.w}px; height:${n.h}px; --st-color:${vis.color};"
        >
          <div class="mfn-top">
            <span class="mfn-badge" style="background:${n.badgeColor};">${MD.escapeHtml(n.badge)}</span>
            <span class="mfn-status-wrap" style="color:${vis.color};">
              <span class="mfn-status-dot" style="background:${vis.color};" title="${MD.escapeHtml(vis.label)}"></span>
              ${n.badge !== vis.label ? `<span>${MD.escapeHtml(vis.label)}</span>` : ''}
            </span>
          </div>
          <div class="mfn-title">${MD.escapeHtml(fullTitle)}</div>
          <div class="mfn-meta">
            <span>${MD.escapeHtml(d.meta.serie || d.topFolder || vis.label)}</span>
            <span>${formatNumber(d.stats?.words || 0)} pal.</span>
          </div>
        </button>
      `;
    })
    .join('');

  return `
    <div class="map-flow-canvas" id="mapFlowCanvas" style="width:${model.width}px; height:${model.height}px; transform:translate(${state.mapFlowPanX}px, ${state.mapFlowPanY}px) scale(${state.mapFlowZoom});">
      <svg class="map-flow-svg" width="${model.width}" height="${model.height}" viewBox="0 0 ${model.width} ${model.height}">
        ${svgParts.join('')}
      </svg>
      ${sectionsHtml}
      ${stagesHtml}
      ${centerHtml}
      ${hubsHtml}
      ${nodesHtml}
    </div>
  `;
}

export function convertFlowModelToExcalidrawElements(model) {
  const elements = [];
  const now = Date.now();
  let seedBase = 1000;
  const nextSeed = () => (seedBase += 79);
  const uid = (prefix) => `${prefix}-${Math.random().toString(36).slice(2, 9)}`;

  const addRectWithText = ({
    id,
    x,
    y,
    w,
    h,
    strokeColor,
    bgColor,
    strokeStyle = 'solid',
    roundness = { type: 3 },
    text,
    fontSize = 14,
    textColor = '#1e1e1e',
    customData = undefined,
  }) => {
    const rectId = id || uid('rect');
    const textId = uid('txt');
    elements.push({
      id: rectId,
      type: 'rectangle',
      x: Math.round(x),
      y: Math.round(y),
      width: Math.round(w),
      height: Math.round(h),
      angle: 0,
      strokeColor,
      backgroundColor: bgColor,
      fillStyle: 'solid',
      strokeWidth: 2,
      strokeStyle,
      roughness: 0,
      opacity: 100,
      groupIds: [],
      frameId: null,
      roundness,
      seed: nextSeed(),
      version: 1,
      versionNonce: nextSeed(),
      isDeleted: false,
      boundElements: text ? [{ id: textId, type: 'text' }] : [],
      updated: now,
      link: null,
      locked: false,
      ...(customData ? { customData } : {}),
    });
    if (text) {
      elements.push({
        id: textId,
        type: 'text',
        x: Math.round(x + 10),
        y: Math.round(y + h / 2 - fontSize * 0.7),
        width: Math.max(40, Math.round(w - 20)),
        height: Math.round(fontSize * 1.5),
        angle: 0,
        strokeColor: textColor,
        backgroundColor: 'transparent',
        fillStyle: 'solid',
        strokeWidth: 1,
        strokeStyle: 'solid',
        roughness: 0,
        opacity: 100,
        groupIds: [],
        frameId: null,
        roundness: null,
        seed: nextSeed(),
        version: 1,
        versionNonce: nextSeed(),
        isDeleted: false,
        boundElements: [],
        updated: now,
        link: null,
        locked: false,
        text,
        fontSize,
        fontFamily: 1,
        textAlign: 'center',
        verticalAlign: 'middle',
        containerId: rectId,
        originalText: text,
        autoResize: true,
        lineHeight: 1.25,
      });
    }
    return rectId;
  };

  for (const sec of model.sections) {
    addRectWithText({
      x: sec.x,
      y: sec.y,
      w: sec.w,
      h: sec.h,
      strokeColor: sec.color,
      bgColor: 'transparent',
      strokeStyle: 'dashed',
    });
    elements.push({
      id: uid('seclbl'),
      type: 'text',
      x: Math.round(sec.x + 14),
      y: Math.round(sec.y + 12),
      width: 240,
      height: 22,
      angle: 0,
      strokeColor: sec.color,
      backgroundColor: 'transparent',
      fillStyle: 'solid',
      strokeWidth: 1,
      strokeStyle: 'solid',
      roughness: 0,
      opacity: 100,
      groupIds: [],
      frameId: null,
      roundness: null,
      seed: nextSeed(),
      version: 1,
      versionNonce: nextSeed(),
      isDeleted: false,
      boundElements: [],
      updated: now,
      link: null,
      locked: false,
      text: sec.label,
      fontSize: 16,
      fontFamily: 1,
      textAlign: 'left',
      verticalAlign: 'top',
      containerId: null,
      originalText: sec.label,
      autoResize: true,
      lineHeight: 1.25,
    });
  }

  for (const sh of model.stageHeaders) {
    addRectWithText({
      x: sh.x,
      y: sh.y,
      w: sh.w,
      h: sh.h,
      strokeColor: sh.color,
      bgColor: '#eef2fa',
      text: `${sh.label} (${sh.count})`,
      fontSize: 15,
    });
  }

  if (model.center) {
    addRectWithText({
      x: model.center.x - 95,
      y: model.center.y - 34,
      w: 190,
      h: 68,
      strokeColor: '#e12d78',
      bgColor: '#f8edf5',
      text: `${model.center.name}\n${model.center.sub}`,
      fontSize: 14,
    });
  }

  for (const hub of model.hubs) {
    addRectWithText({
      x: hub.x - 64,
      y: hub.y - 32,
      w: 128,
      h: 64,
      strokeColor: hub.color,
      bgColor: '#eef2fa',
      text: `${hub.serieName}\n(${hub.count})`,
      fontSize: 13,
    });
  }

  for (const n of model.nodes) {
    const st = n.doc.meta.status || 'ideia';
    const vis = STATUS_VISUAL[st] || STATUS_VISUAL.ideia;
    const shortTitle =
      n.doc.meta.titulo.length > 42 ? `${n.doc.meta.titulo.slice(0, 39)}...` : n.doc.meta.titulo;
    addRectWithText({
      x: n.x,
      y: n.y,
      w: n.w,
      h: n.h,
      strokeColor: vis.color,
      bgColor: '#f0f4fc',
      text: `${shortTitle}\n[${vis.label}]`,
      fontSize: 13,
      customData: {
        docPath: n.doc.path,
        docTitle: n.doc.meta.titulo,
        docStatus: st,
        docSerie: n.doc.meta.serie || '',
      },
    });
  }

  for (const edge of model.edges) {
    const dx = edge.toX - edge.fromX;
    const dy = edge.toY - edge.fromY;
    elements.push({
      id: uid('arr'),
      type: 'arrow',
      x: Math.round(edge.fromX),
      y: Math.round(edge.fromY),
      width: Math.max(1, Math.abs(Math.round(dx))),
      height: Math.max(1, Math.abs(Math.round(dy))),
      angle: 0,
      strokeColor: edge.kind === 'sequence' ? '#f59e0b' : '#64748b',
      backgroundColor: 'transparent',
      fillStyle: 'solid',
      strokeWidth: edge.kind === 'sequence' ? 2 : 1.5,
      strokeStyle: edge.dashed ? 'dashed' : 'solid',
      roughness: 0,
      opacity: 100,
      groupIds: [],
      frameId: null,
      roundness: { type: 2 },
      seed: nextSeed(),
      version: 1,
      versionNonce: nextSeed(),
      isDeleted: false,
      boundElements: [],
      updated: now,
      link: null,
      locked: false,
      points: [
        [0, 0],
        [Math.round(dx), Math.round(dy)],
      ],
      lastCommittedPoint: null,
      startBinding: null,
      endBinding: null,
      startArrowhead: null,
      endArrowhead: 'arrow',
    });
  }

  return elements;
}

export async function exportFlowchartToBoard(model, chData) {
  if (!state.serverMode) {
    showToast('Exportar fluxograma para o Quadro requer o servidor local rodando.');
    return;
  }
  const layoutLabels = { clusters: 'Constelação', blocks: 'User Flow', pipeline: 'Pipeline' };
  const chName = chData.channel?.name || chData.key;
  const title = `Mapa ${chName} — ${layoutLabels[state.mapFlowLayout] || 'Fluxograma'}`;
  const elements = convertFlowModelToExcalidrawElements(model);
  try {
    const res = await fetch('/api/boards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channel: chData.key,
        title,
        elements,
        appState: { viewBackgroundColor: '#ffffff', theme: 'dark', gridSize: 20 },
        files: {},
        preferredMode: 'nodes',
      }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Erro ao exportar fluxograma');
    state.boardsList = json.boards || [];
    state.wbListFetchedChannel = chData.key;
    if (json.state) state.data = normalizePayload(json.state);
    state.mapFlowFullscreen = false;
    setView('whiteboard', null, { boardId: json.board.id });
    showToast(`Fluxograma aberto em "${json.board.title}"!`);
  } catch (err) {
    showToast(err.message);
  }
}

let mapFlowResizeObserver = null;
const mapFlowPointerCleanups = [];

export function cleanupMapFlowObservers() {
  if (mapFlowResizeObserver) {
    try {
      mapFlowResizeObserver.disconnect();
    } catch {
      // ignora
    }
    mapFlowResizeObserver = null;
  }
  while (mapFlowPointerCleanups.length) {
    const fn = mapFlowPointerCleanups.pop();
    try {
      fn();
    } catch {
      // ignora
    }
  }
}

export function applyFlowViewportTransform(viewport, model) {
  const canvas = document.getElementById('mapFlowCanvas');
  if (canvas) {
    canvas.style.transform = `translate(${state.mapFlowPanX}px, ${state.mapFlowPanY}px) scale(${state.mapFlowZoom})`;
  }
  const resetBtn = document.getElementById('mapFlowZoomResetBtn');
  if (resetBtn) resetBtn.textContent = `${Math.round(state.mapFlowZoom * 100)}%`;
  if (viewport && model && !canvas) {
    viewport.dataset.modelReady = '1';
  }
}

export function fitFlowchartToViewport(model) {
  const vp = document.getElementById('mapFlowViewport');
  if (!vp || !model) return;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const expandBox = (x1, y1, x2, y2) => {
    if (Number.isFinite(x1)) minX = Math.min(minX, x1);
    if (Number.isFinite(y1)) minY = Math.min(minY, y1);
    if (Number.isFinite(x2)) maxX = Math.max(maxX, x2);
    if (Number.isFinite(y2)) maxY = Math.max(maxY, y2);
  };

  for (const n of model.nodes || []) expandBox(n.x, n.y, n.x + n.w, n.y + n.h);
  for (const h of model.hubs || []) expandBox(h.x - h.r, h.y - h.r, h.x + h.r, h.y + h.r);
  if (model.center) expandBox(model.center.x - 95, model.center.y - 45, model.center.x + 95, model.center.y + 45);
  for (const s of model.sections || []) expandBox(s.x, s.y, s.x + s.w, s.y + s.h);
  for (const sh of model.stageHeaders || []) expandBox(sh.x, sh.y, sh.x + sh.w, sh.y + sh.h);

  if (!Number.isFinite(minX) || !Number.isFinite(maxX)) {
    minX = 0;
    minY = 0;
    maxX = model.width || 900;
    maxY = model.height || 540;
  }

  const margin = 52;
  const boxW = Math.max(120, maxX - minX + margin * 2);
  const boxH = Math.max(120, maxY - minY + margin * 2);
  const vw = vp.clientWidth || 900;
  const vh = vp.clientHeight || 540;
  const fitZoom = Math.min(1.05, Math.max(0.14, Math.min(vw / boxW, vh / boxH)));
  state.mapFlowZoom = Number(fitZoom.toFixed(2));
  const boxCx = (minX + maxX) / 2;
  const boxCy = (minY + maxY) / 2;
  state.mapFlowPanX = Math.round(vw / 2 - boxCx * state.mapFlowZoom);
  state.mapFlowPanY = Math.round(vh / 2 - boxCy * state.mapFlowZoom);
  applyFlowViewportTransform(vp, model);
}

export function renderMapView(container) {
  cleanupMapFlowObservers();
  const chData = getActiveChannelData();
  const docsAll = chData.docs || [];
  const docsPool = state.mapHideMeta
    ? docsAll.filter(
        (d) =>
          d.meta.status !== 'template' &&
          d.meta.status !== 'referencia' &&
          d.path !== 'AGENTS.md' &&
          d.path !== 'README.md'
      )
    : docsAll;

  const statusOrder = ['publicado', 'gravando', 'edicao', 'roteiro', 'pesquisa', 'ideia', 'referencia', 'template', 'arquivado'];
  const statusCounts = {};
  for (const st of statusOrder) statusCounts[st] = 0;
  for (const d of docsPool) {
    const st = d.meta.status || 'ideia';
    statusCounts[st] = (statusCounts[st] || 0) + 1;
  }

  const totalPool = docsPool.length || 1;
  const distSegmentsHtml = statusOrder
    .filter((st) => statusCounts[st] > 0)
    .map((st) => {
      const vis = STATUS_VISUAL[st] || STATUS_VISUAL.ideia;
      const pct = ((statusCounts[st] / totalPool) * 100).toFixed(2);
      return `<div class="map-dist-seg" style="width:${pct}%; background:${vis.color};" title="${vis.label}: ${statusCounts[st]} arquivo(s) (${Math.round((statusCounts[st] / totalPool) * 100)}%)"></div>`;
    })
    .join('');

  const legendHtml = `
    <button type="button" class="map-legend-pill${state.mapStatusFilter === 'all' ? ' is-active' : ''}" data-map-status="all" style="--st-color: var(--accent);">
      <span class="map-legend-dot"></span>
      <span>Todos (${docsPool.length})</span>
    </button>
    ${statusOrder
      .filter((st) => statusCounts[st] > 0)
      .map((st) => {
        const vis = STATUS_VISUAL[st] || STATUS_VISUAL.ideia;
        const active = state.mapStatusFilter === st;
        return `
          <button type="button" class="map-legend-pill${active ? ' is-active' : ''}" data-map-status="${st}" style="--st-color: ${vis.color};">
            <span class="map-legend-dot"></span>
            <span>${vis.label} (${statusCounts[st]})</span>
          </button>
        `;
      })
      .join('')}
  `;

  const filteredDocs = docsPool.filter((d) => {
    if (state.mapStatusFilter !== 'all' && d.meta.status !== state.mapStatusFilter) return false;
    if (state.mapSearch) {
      const q = state.mapSearch.toLowerCase();
      const hay = `${d.meta.titulo} ${d.meta.serie} ${d.path} ${d.meta.resumo} ${(d.meta.tags || []).join(' ')}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const renderMapCard = (d) => {
    const st = d.meta.status || 'ideia';
    const vis = STATUS_VISUAL[st] || STATUS_VISUAL.ideia;
    const ver = d.versioning || {};
    const verLabel =
      ver.versionsCount > 1
        ? `${ver.versionsCount} vers. • ${ver.headRev || ''}`
        : ver.headRev
          ? `${ver.headRev}`
          : '';
    return `
      <button type="button" class="map-card" data-open-map-doc="${MD.escapeHtml(d.path)}" style="--st-color:${vis.color}; --st-bg:${vis.bg}; --st-border:${vis.border};">
        <div style="display:flex; align-items:center; justify-content:space-between; gap:6px; width:100%;">
          <span class="status-pill st-${MD.escapeHtml(st)}">${MD.escapeHtml(vis.label)}</span>
          ${verLabel ? `<span style="font-family:var(--font-mono); font-size:10px; color:var(--text-3);">${MD.escapeHtml(verLabel)}</span>` : ''}
        </div>
        <span class="map-card-title">${MD.escapeHtml(d.meta.titulo)}</span>
        <div class="map-card-foot">
          <span>${MD.escapeHtml(d.meta.serie || d.topFolder)}</span>
          <span>${formatNumber(d.stats.words)} pal.${d.meta.duracao_estimada ? ` • ${MD.escapeHtml(d.meta.duracao_estimada)}` : ''}</span>
        </div>
      </button>
    `;
  };

  let bodyHtml = '';
  let flowModel = null;

  if (!filteredDocs.length) {
    bodyHtml = `<div class="panel" style="padding:36px; text-align:center; color:var(--text-3);">Nenhum roteiro encontrado com esses filtros.</div>`;
  } else if (state.mapStyle === 'flowchart') {
    flowModel = computeFlowLayout(filteredDocs, chData, state.mapFlowLayout);
    bodyHtml = `
      <div class="map-flow-shell${state.mapFlowFullscreen ? ' is-flow-fullscreen' : ''}" id="mapFlowShell">
        <div class="map-flow-toolbar">
          <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
            <div class="mode-switch" id="mapFlowLayoutSwitch">
              <button type="button" class="${state.mapFlowLayout === 'clusters' ? 'active' : ''}" data-flow-layout="clusters">Constelação (Clusters)</button>
              <button type="button" class="${state.mapFlowLayout === 'blocks' ? 'active' : ''}" data-flow-layout="blocks">User Flow (Blocos)</button>
              <button type="button" class="${state.mapFlowLayout === 'pipeline' ? 'active' : ''}" data-flow-layout="pipeline">Pipeline (Etapas)</button>
            </div>
            <div class="zoom-group" title="Zoom do fluxograma">
              <button type="button" id="mapFlowZoomOutBtn">-</button>
              <button type="button" id="mapFlowZoomResetBtn">${Math.round(state.mapFlowZoom * 100)}%</button>
              <button type="button" id="mapFlowZoomInBtn">+</button>
              <button type="button" id="mapFlowFitBtn">Ajustar</button>
            </div>
          </div>
          <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
            <button type="button" class="btn-sm" id="mapFlowFullscreenBtn">${state.mapFlowFullscreen ? '✕ Sair Tela Cheia' : '⛶ Tela Cheia'}</button>
            <button type="button" class="btn-sm btn-accent" id="mapExportToBoardBtn">✎ Abrir no Quadro (Excalidraw)</button>
          </div>
        </div>
        <div class="map-flow-viewport" id="mapFlowViewport">
          ${renderFlowchartSvgAndNodes(flowModel)}
        </div>
        <div class="map-flow-tooltip hidden" id="mapFlowTooltip"></div>
      </div>
    `;
  } else if (state.mapGroupBy === 'mosaic') {
    const sorted = [...filteredDocs].sort((a, b) => {
      const ia = statusOrder.indexOf(a.meta.status);
      const ib = statusOrder.indexOf(b.meta.status);
      if (ia !== ib) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
      return String(b.mtime || '').localeCompare(String(a.mtime || ''));
    });
    bodyHtml = `<div class="map-mosaic-grid">${sorted.map(renderMapCard).join('')}</div>`;
  } else {
    const groups = new Map();
    for (const d of filteredDocs) {
      const key =
        state.mapGroupBy === 'folder' ? d.topFolder || 'raiz' : d.meta.serie || 'Sem Série';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(d);
    }

    bodyHtml = Array.from(groups.entries())
      .sort((a, b) => b[1].length - a[1].length)
      .map(([groupName, items]) => {
        const sMeta = SERIE_META[groupName] || {};
        const icon = sMeta.icon || (state.mapGroupBy === 'folder' ? '📁' : '•');
        const pubCount = items.filter((i) => i.meta.status === 'publicado').length;
        const activeCount = items.filter((i) => ['roteiro', 'gravando', 'edicao'].includes(i.meta.status)).length;
        const sortedItems = [...items].sort((a, b) => {
          const ia = statusOrder.indexOf(a.meta.status);
          const ib = statusOrder.indexOf(b.meta.status);
          return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
        });
        return `
          <section class="map-serie-section">
            <div class="map-serie-head">
              <div style="display:flex; align-items:center; gap:9px;">
                <span style="color:${sMeta.color || 'var(--accent)'}; font-size:15px;">${icon}</span>
                <h3 style="margin:0; font-size:14.5px; font-weight:600;">${MD.escapeHtml(groupName)}</h3>
                <span class="kanban-count">${items.length}</span>
              </div>
              <div style="display:flex; align-items:center; gap:10px; font-family:var(--font-mono); font-size:11px; color:var(--text-3);">
                <span style="color:#22c55e;">${pubCount} pub.</span>
                <span style="color:var(--accent);">${activeCount} em prod.</span>
              </div>
            </div>
            <div class="map-cards-grid">
              ${sortedItems.map(renderMapCard).join('')}
            </div>
          </section>
        `;
      })
      .join('');
  }

  container.innerHTML = `
    <div class="map-header-bar">
      <div class="section-subhead" style="margin:0;">
        <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
          <div class="mode-switch" id="mapGroupSwitch">
            <button type="button" class="${state.mapStyle === 'cards' && state.mapGroupBy === 'serie' ? 'active' : ''}" data-map-group="serie">Por Série</button>
            <button type="button" class="${state.mapStyle === 'cards' && state.mapGroupBy === 'mosaic' ? 'active' : ''}" data-map-group="mosaic">Mosaico por Status</button>
            <button type="button" class="${state.mapStyle === 'cards' && state.mapGroupBy === 'folder' ? 'active' : ''}" data-map-group="folder">Por Pasta</button>
          </div>
          <input type="search" class="search-box-sm" id="mapSearchInput" placeholder="Buscar no mapa..." value="${MD.escapeHtml(state.mapSearch)}">
        </div>
        <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
          <button type="button" class="btn-sm${state.mapStyle === 'flowchart' ? ' btn-accent' : ''}" id="mapStyleToggleBtn">${state.mapStyle === 'flowchart' ? '▦ Estilo: Cartões' : '◈ Estilo: Fluxograma'}</button>
          <button type="button" class="btn-sm" id="mapHideMetaBtn">${state.mapHideMeta ? 'Mostrar Docs/Templates' : 'Ocultar Docs/Templates'}</button>
          <button type="button" class="btn-sm btn-accent" id="mapNewDocBtn">+ Novo Roteiro</button>
        </div>
      </div>
      <div class="map-dist-bar" title="Distribuição proporcional dos status">${distSegmentsHtml}</div>
      <div class="map-legend">${legendHtml}</div>
    </div>

    ${bodyHtml}
  `;

  container.querySelectorAll('#mapGroupSwitch button').forEach((btn) => {
    btn.onclick = () => {
      state.mapStyle = 'cards';
      state.mapGroupBy = btn.dataset.mapGroup;
      state.mapFlowFullscreen = false;
      syncActiveTabFromState();
      updateHeaderChrome();
      renderMapView(container);
    };
  });

  const styleToggleBtn = document.getElementById('mapStyleToggleBtn');
  if (styleToggleBtn) {
    styleToggleBtn.onclick = () => {
      state.mapStyle = state.mapStyle === 'flowchart' ? 'cards' : 'flowchart';
      state.mapFlowFullscreen = false;
      state.mapFlowAutoFitKey = '';
      syncActiveTabFromState();
      updateHeaderChrome();
      renderMapView(container);
    };
  }

  const mapSearchEl = document.getElementById('mapSearchInput');
  if (mapSearchEl) {
    mapSearchEl.oninput = () => {
      state.mapSearch = mapSearchEl.value;
      const pos = mapSearchEl.selectionStart;
      renderMapView(container);
      const again = document.getElementById('mapSearchInput');
      if (again) {
        again.focus();
        again.setSelectionRange(pos, pos);
      }
    };
  }

  container.querySelectorAll('[data-map-status]').forEach((btn) => {
    btn.onclick = () => {
      state.mapStatusFilter = btn.dataset.mapStatus;
      renderMapView(container);
    };
  });

  const hideMetaBtn = document.getElementById('mapHideMetaBtn');
  if (hideMetaBtn) {
    hideMetaBtn.onclick = () => {
      state.mapHideMeta = !state.mapHideMeta;
      renderMapView(container);
    };
  }

  const mapNewBtn = document.getElementById('mapNewDocBtn');
  if (mapNewBtn) mapNewBtn.onclick = () => openNewDocModal();

  container.querySelectorAll('[data-open-map-doc]').forEach((card) => {
    card.onclick = () => setView('scripts', card.dataset.openMapDoc);
  });

  if (flowModel) {
    const fitKey = `${chData.key}::${state.mapFlowLayout}::${filteredDocs.length}`;
    if (state.mapFlowAutoFitKey !== fitKey) {
      state.mapFlowAutoFitKey = fitKey;
      requestAnimationFrame(() => fitFlowchartToViewport(flowModel));
    }

    container.querySelectorAll('#mapFlowLayoutSwitch button').forEach((btn) => {
      btn.onclick = () => {
        state.mapFlowLayout = btn.dataset.flowLayout;
        state.mapFlowAutoFitKey = '';
        renderMapView(container);
      };
    });

    const zoomStep = (delta) => {
      state.mapFlowZoom = Math.min(2.2, Math.max(0.14, Number((state.mapFlowZoom + delta).toFixed(2))));
      applyFlowViewportTransform(document.getElementById('mapFlowViewport'), flowModel);
    };
    document.getElementById('mapFlowZoomOutBtn')?.addEventListener('click', () => zoomStep(-0.15));
    document.getElementById('mapFlowZoomInBtn')?.addEventListener('click', () => zoomStep(0.15));
    document.getElementById('mapFlowZoomResetBtn')?.addEventListener('click', () => {
      state.mapFlowZoom = 1;
      applyFlowViewportTransform(document.getElementById('mapFlowViewport'), flowModel);
    });
    document.getElementById('mapFlowFitBtn')?.addEventListener('click', () => fitFlowchartToViewport(flowModel));

    document.getElementById('mapFlowFullscreenBtn')?.addEventListener('click', () => {
      state.mapFlowFullscreen = !state.mapFlowFullscreen;
      state.mapFlowAutoFitKey = '';
      updateHeaderChrome();
      renderMapView(container);
    });

    document.getElementById('mapExportToBoardBtn')?.addEventListener('click', () => {
      exportFlowchartToBoard(flowModel, chData);
    });

    const vp = document.getElementById('mapFlowViewport');
    const tooltip = document.getElementById('mapFlowTooltip');
    if (vp) {
      let dragState = null;
      vp.addEventListener('pointerdown', (e) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        dragState = {
          pointerId: e.pointerId,
          startX: e.clientX,
          startY: e.clientY,
          origPanX: state.mapFlowPanX,
          origPanY: state.mapFlowPanY,
          moved: false,
          targetNode: e.target.closest('[data-flow-doc]'),
        };
      });
      const onPointerMove = (e) => {
        if (!dragState || e.pointerId !== dragState.pointerId) return;
        const dx = e.clientX - dragState.startX;
        const dy = e.clientY - dragState.startY;
        if (!dragState.moved && Math.hypot(dx, dy) > 5) {
          dragState.moved = true;
          vp.classList.add('is-panning');
        }
        if (dragState.moved) {
          state.mapFlowPanX = dragState.origPanX + dx;
          state.mapFlowPanY = dragState.origPanY + dy;
          applyFlowViewportTransform(vp, flowModel);
        }
      };
      const onPointerEnd = (e) => {
        if (!dragState || e.pointerId !== dragState.pointerId) return;
        const wasMoved = dragState.moved;
        const nodeBtn = dragState.targetNode;
        dragState = null;
        vp.classList.remove('is-panning');
        if (!wasMoved && nodeBtn && !(e.ctrlKey || e.metaKey) && e.type === 'pointerup') {
          state.mapFlowFullscreen = false;
          setView('scripts', nodeBtn.dataset.flowDoc);
        }
      };
      globalThis.addEventListener('pointermove', onPointerMove);
      globalThis.addEventListener('pointerup', onPointerEnd);
      globalThis.addEventListener('pointercancel', onPointerEnd);
      mapFlowPointerCleanups.push(() => {
        globalThis.removeEventListener('pointermove', onPointerMove);
        globalThis.removeEventListener('pointerup', onPointerEnd);
        globalThis.removeEventListener('pointercancel', onPointerEnd);
      });

      if (globalThis.ResizeObserver) {
        let lastVpW = vp.clientWidth;
        let lastVpH = vp.clientHeight;
        mapFlowResizeObserver = new ResizeObserver((entries) => {
          if (state.view !== 'map' || state.mapStyle !== 'flowchart') return;
          const entry = entries[0];
          const nw = Math.round(entry?.contentRect?.width || vp.clientWidth || 0);
          const nh = Math.round(entry?.contentRect?.height || vp.clientHeight || 0);
          if (!nw || !nh) return;
          const crossedBreak =
            state.mapFlowLayout === 'blocks' &&
            ((lastVpW < 920) !== (nw < 920) || (lastVpW < 760) !== (nw < 760));
          if (crossedBreak) {
            lastVpW = nw;
            lastVpH = nh;
            state.mapFlowAutoFitKey = '';
            renderMapView(container);
            return;
          }
          if (Math.abs(nw - lastVpW) > 10 || Math.abs(nh - lastVpH) > 10) {
            lastVpW = nw;
            lastVpH = nh;
            fitFlowchartToViewport(flowModel);
          }
        });
        mapFlowResizeObserver.observe(vp);
      }

      vp.addEventListener(
        'wheel',
        (e) => {
          e.preventDefault();
          const rect = vp.getBoundingClientRect();
          const mx = e.clientX - rect.left;
          const my = e.clientY - rect.top;
          const prevZoom = state.mapFlowZoom;
          const factor = e.deltaY < 0 ? 1.1 : 0.9;
          const nextZoom = Math.min(2.2, Math.max(0.14, Number((prevZoom * factor).toFixed(2))));
          const ratio = nextZoom / prevZoom;
          state.mapFlowPanX = Math.round(mx - (mx - state.mapFlowPanX) * ratio);
          state.mapFlowPanY = Math.round(my - (my - state.mapFlowPanY) * ratio);
          state.mapFlowZoom = nextZoom;
          applyFlowViewportTransform(vp, flowModel);
        },
        { passive: false }
      );

      vp.querySelectorAll('[data-flow-doc]').forEach((nodeEl) => {
        nodeEl.addEventListener('mouseenter', () => {
          if (!tooltip) return;
          const doc = filteredDocs.find((d) => d.path === nodeEl.dataset.flowDoc);
          if (!doc) return;
          const vis = STATUS_VISUAL[doc.meta.status] || STATUS_VISUAL.ideia;
          tooltip.innerHTML = `
            <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:4px;">
              <span class="status-pill st-${MD.escapeHtml(doc.meta.status)}">${MD.escapeHtml(vis.label)}</span>
              <span style="font-family:var(--font-mono); font-size:10px; color:var(--text-3);">${MD.escapeHtml(doc.meta.serie || '')}</span>
            </div>
            <div style="font-weight:700; color:#fff; margin-bottom:4px;">${MD.escapeHtml(doc.meta.titulo)}</div>
            <div style="font-family:var(--font-mono); font-size:10px; color:var(--text-3); margin-bottom:5px;">${formatNumber(doc.stats?.words || 0)} pal. • ${MD.escapeHtml(doc.meta.duracao_estimada || '—')}</div>
            ${doc.meta.resumo ? `<div style="font-size:11px; color:var(--text-2); line-height:1.4;">${MD.escapeHtml(doc.meta.resumo)}</div>` : ''}
          `;
          const shellRect = document.getElementById('mapFlowShell')?.getBoundingClientRect();
          const nRect = nodeEl.getBoundingClientRect();
          if (shellRect) {
            const left = Math.min(shellRect.width - 295, Math.max(12, nRect.right - shellRect.left + 10));
            const top = Math.min(shellRect.height - 150, Math.max(54, nRect.top - shellRect.top));
            tooltip.style.left = `${Math.round(left)}px`;
            tooltip.style.top = `${Math.round(top)}px`;
          }
          tooltip.classList.remove('hidden');
        });
        nodeEl.addEventListener('mouseleave', () => {
          tooltip?.classList.add('hidden');
        });
      });
    }
  }
}

registerLifecycleHooks({ cleanupMapFlowObservers });
registerViewRenderer('map', renderMapView);
