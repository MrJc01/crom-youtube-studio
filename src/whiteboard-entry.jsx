import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  CaptureUpdateAction,
  Excalidraw,
  FONT_FAMILY,
  ROUNDNESS,
  convertToExcalidrawElements,
  getCommonBounds,
  getSceneVersion,
  restoreElements,
} from '@excalidraw/excalidraw';

const ACCENT_PALETTE = [
  { id: 'laranja', label: 'Laranja', ui: '#f97316', canvas: '#fc6000', pillText: '#ffffff' },
  { id: 'magenta', label: 'Magenta', ui: '#e12d78', canvas: '#e64980', pillText: '#ffffff' },
  { id: 'ciano', label: 'Ciano', ui: '#38bdf8', canvas: '#1c7ed6', pillText: '#ffffff' },
  { id: 'verde', label: 'Verde', ui: '#22c55e', canvas: '#009834', pillText: '#ffffff' },
  { id: 'roxo', label: 'Roxo', ui: '#8b5cf6', canvas: '#7950f2', pillText: '#ffffff' },
  { id: 'ambar', label: 'Âmbar', ui: '#f59e0b', canvas: '#e67700', pillText: '#ffffff' },
];

const CARD_BG_CANVAS = '#f0f4fc';
const GROUP_BG_CANVAS = '#f6f8fd';
const TEXT_INK_CANVAS = '#1e1e1e';
const GROUP_LABEL_CANVAS = '#495057';
const CARD_WIDTH = 252;
const CARD_HEIGHT = 114;
const DIAMOND_WIDTH = 200;
const DIAMOND_HEIGHT = 122;
const PILL_WIDTH = 216;
const PILL_HEIGHT = 56;
const FLOW_GAP_X = 88;
const FLOW_GAP_Y = 78;
const ARROW_GAP = 6;

const SAFE_APP_STATE_KEYS = [
  'viewBackgroundColor',
  'theme',
  'gridModeEnabled',
  'gridSize',
  'gridStep',
  'scrollX',
  'scrollY',
  'zoom',
  'name',
  'objectsSnapModeEnabled',
  'zenModeEnabled',
  'exportBackground',
  'exportEmbedScene',
  'exportWithDarkMode',
  'exportScale',
  'currentItemStrokeColor',
  'currentItemBackgroundColor',
  'currentItemFillStyle',
  'currentItemStrokeWidth',
  'currentItemStrokeStyle',
  'currentItemRoughness',
  'currentItemOpacity',
  'currentItemFontFamily',
  'currentItemFontSize',
  'currentItemTextAlign',
  'currentItemStartArrowhead',
  'currentItemEndArrowhead',
  'currentItemRoundness',
  'currentItemArrowType',
];

function randomId(prefix = 'crom') {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 14)}`;
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function randomNonce() {
  return Math.floor(Math.random() * 2147483646) + 1;
}

function isPlainObject(v) {
  return Boolean(
    v &&
      typeof v === 'object' &&
      !Array.isArray(v) &&
      !(v instanceof Map) &&
      !(v instanceof Set) &&
      Object.prototype.toString.call(v) === '[object Object]'
  );
}

function sanitizeAppState(rawAppState) {
  if (!isPlainObject(rawAppState)) return {};
  const clean = {};
  for (const key of SAFE_APP_STATE_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(rawAppState, key)) continue;
    const val = rawAppState[key];
    if (val === undefined || typeof val === 'function' || typeof val === 'symbol') continue;
    if (val instanceof Map || val instanceof Set) continue;

    if (key === 'zoom') {
      if (isPlainObject(val) && Number.isFinite(Number(val.value)) && Number(val.value) > 0) {
        clean.zoom = { value: Number(val.value) };
      }
      continue;
    }

    if (
      typeof val === 'string' ||
      typeof val === 'boolean' ||
      val === null ||
      (typeof val === 'number' && Number.isFinite(val))
    ) {
      clean[key] = val;
    }
  }
  return clean;
}

function sanitizeSceneForExport(elements, appState, files) {
  const cleanElements = (Array.isArray(elements) ? elements : [])
    .filter((el) => el && !el.isDeleted && el.type !== 'selection')
    .map((el) => JSON.parse(JSON.stringify(el)));

  const referencedFileIds = new Set();
  for (const el of cleanElements) {
    if (el.fileId) referencedFileIds.add(el.fileId);
  }

  const cleanFiles = {};
  if (isPlainObject(files)) {
    for (const [fileId, fileObj] of Object.entries(files)) {
      if (referencedFileIds.has(fileId) && isPlainObject(fileObj)) {
        cleanFiles[fileId] = JSON.parse(JSON.stringify(fileObj));
      }
    }
  }

  return {
    elements: cleanElements,
    appState: sanitizeAppState(appState),
    files: cleanFiles,
  };
}

function computeSceneSignature(elements, appState, files) {
  const list = Array.isArray(elements) ? elements : [];
  const activeCount = list.filter((el) => el && !el.isDeleted && el.type !== 'selection').length;
  const versionSum = getSceneVersion(list);
  const fileKeys = isPlainObject(files) ? Object.keys(files).sort().join(',') : '';
  return [
    list.length,
    activeCount,
    versionSum,
    fileKeys,
    appState?.viewBackgroundColor || '',
    appState?.theme || '',
    appState?.gridModeEnabled ? '1' : '0',
    appState?.gridSize ?? '',
  ].join('|');
}

function postToParent(payload) {
  if (typeof window === 'undefined') return;
  if (!window.parent || window.parent === window) return;
  window.parent.postMessage(payload, window.location.origin);
}

function truncateText(text, maxLen) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (clean.length <= maxLen) return clean;
  return `${clean.slice(0, Math.max(0, maxLen - 1)).trimEnd()}…`;
}

function wrapTextLines(text, maxLineLen = 30, maxLines = 2) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  const words = clean.split(' ');
  const lines = [];
  let current = '';
  for (const word of words) {
    if (!current) {
      current = word;
    } else if (`${current} ${word}`.length <= maxLineLen) {
      current = `${current} ${word}`;
    } else {
      lines.push(current);
      current = word;
      if (lines.length >= maxLines) break;
    }
  }
  if (lines.length < maxLines && current) {
    lines.push(current);
  }
  if (lines.length === maxLines && words.join(' ').length > lines.join(' ').length) {
    lines[maxLines - 1] = truncateText(lines[maxLines - 1], maxLineLen);
  }
  return lines.join('\n');
}

function getBindableAnchor(element, side) {
  const { x, y, width, height } = element;
  switch (side) {
    case 'right':
      return { x: x + width + ARROW_GAP, y: y + height / 2, fixedPoint: [1, 0.5] };
    case 'left':
      return { x: x - ARROW_GAP, y: y + height / 2, fixedPoint: [0, 0.5] };
    case 'bottom':
      return { x: x + width / 2, y: y + height + ARROW_GAP, fixedPoint: [0.5, 1] };
    case 'top':
    default:
      return { x: x + width / 2, y: y - ARROW_GAP, fixedPoint: [0.5, 0] };
  }
}

function pickConnectionSides(fromEl, toEl, preferredDirection = 'auto') {
  if (preferredDirection === 'right') return { fromSide: 'right', toSide: 'left', orientation: 'horizontal' };
  if (preferredDirection === 'down') return { fromSide: 'bottom', toSide: 'top', orientation: 'vertical' };

  const fcX = fromEl.x + fromEl.width / 2;
  const fcY = fromEl.y + fromEl.height / 2;
  const tcX = toEl.x + toEl.width / 2;
  const tcY = toEl.y + toEl.height / 2;
  const dx = tcX - fcX;
  const dy = tcY - fcY;

  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0
      ? { fromSide: 'right', toSide: 'left', orientation: 'horizontal' }
      : { fromSide: 'left', toSide: 'right', orientation: 'horizontal' };
  }
  return dy >= 0
    ? { fromSide: 'bottom', toSide: 'top', orientation: 'vertical' }
    : { fromSide: 'top', toSide: 'bottom', orientation: 'vertical' };
}

function computeElbowGeometry(fromEl, toEl, preferredDirection = 'auto') {
  const { fromSide, toSide, orientation } = pickConnectionSides(fromEl, toEl, preferredDirection);
  const start = getBindableAnchor(fromEl, fromSide);
  const end = getBindableAnchor(toEl, toSide);
  const dx = Math.round(end.x - start.x);
  const dy = Math.round(end.y - start.y);

  let points;
  if (orientation === 'horizontal') {
    if (Math.abs(dy) < 2) {
      points = [
        [0, 0],
        [dx, 0],
      ];
    } else {
      const mx = Math.round(dx / 2);
      points = [
        [0, 0],
        [mx, 0],
        [mx, dy],
        [dx, dy],
      ];
    }
  } else if (Math.abs(dx) < 2) {
    points = [
      [0, 0],
      [0, dy],
    ];
  } else {
    const my = Math.round(dy / 2);
    points = [
      [0, 0],
      [0, my],
      [dx, my],
      [dx, dy],
    ];
  }

  return {
    x: Math.round(start.x),
    y: Math.round(start.y),
    width: Math.max(1, Math.abs(dx)),
    height: Math.max(1, Math.abs(dy)),
    points,
    startBinding: {
      elementId: fromEl.id,
      focus: 0,
      gap: ARROW_GAP,
      fixedPoint: start.fixedPoint,
    },
    endBinding: {
      elementId: toEl.id,
      focus: 0,
      gap: ARROW_GAP,
      fixedPoint: end.fixedPoint,
    },
  };
}

function createBoundElbowArrow(fromEl, toEl, opts = {}) {
  const {
    strokeColor = '#fc6000',
    strokeStyle = 'dashed',
    direction = 'auto',
  } = opts;
  const geom = computeElbowGeometry(fromEl, toEl, direction);
  const id = randomId('arrow');
  const [baseArrow] = convertToExcalidrawElements(
    [
      {
        id,
        type: 'arrow',
        x: geom.x,
        y: geom.y,
        width: geom.width,
        height: geom.height,
        points: geom.points,
        strokeColor,
        strokeStyle,
        strokeWidth: 2,
        roughness: 0,
        opacity: 100,
        startArrowhead: null,
        endArrowhead: 'arrow',
        roundness: null,
      },
    ],
    { regenerateIds: false }
  );

  return {
    ...baseArrow,
    id,
    x: geom.x,
    y: geom.y,
    width: geom.width,
    height: geom.height,
    points: geom.points,
    elbowed: true,
    roundness: null,
    fixedSegments: null,
    startIsSpecial: false,
    endIsSpecial: false,
    startBinding: geom.startBinding,
    endBinding: geom.endBinding,
    customData: { cromFlowArrow: true },
  };
}

function addArrowBindingRef(element, arrowId) {
  const existing = Array.isArray(element.boundElements) ? element.boundElements : [];
  if (existing.some((b) => b.id === arrowId)) return element;
  return {
    ...element,
    boundElements: [...existing, { id: arrowId, type: 'arrow' }],
    version: (element.version || 1) + 1,
    versionNonce: randomNonce(),
    updated: Date.now(),
  };
}

function isBindableNodeElement(el) {
  return Boolean(
    el &&
      !el.isDeleted &&
      (el.type === 'rectangle' || el.type === 'diamond' || el.type === 'ellipse') &&
      !el.customData?.cromGroupContainer
  );
}

function getSelectedBindableNodes(elements, appState) {
  const selectedIds = appState?.selectedElementIds || {};
  const byId = new Map(elements.filter((e) => e && !e.isDeleted).map((e) => [e.id, e]));
  const result = [];
  const seen = new Set();

  for (const id of Object.keys(selectedIds)) {
    if (!selectedIds[id]) continue;
    let el = byId.get(id);
    if (!el) continue;
    if (el.type === 'text' && el.containerId) {
      el = byId.get(el.containerId);
    }
    if (el && isBindableNodeElement(el) && !seen.has(el.id)) {
      seen.add(el.id);
      result.push(el);
    }
  }
  return result;
}

function parseNodeNumbers(elements) {
  const byId = new Map();
  const pairs = [];
  for (const el of elements) {
    if (!el || el.isDeleted) continue;
    if (el.customData?.nodeNumber) {
      const m = String(el.customData.nodeNumber).match(/^(\d+)\.(\d+)$/);
      if (m) pairs.push([Number(m[1]), Number(m[2])]);
      byId.set(el.id, String(el.customData.nodeNumber));
    }
  }
  for (const el of elements) {
    if (!el || el.isDeleted || el.type !== 'text') continue;
    const m = String(el.text || '').trim().match(/^(\d+)\.(\d+)\b/);
    if (m) {
      pairs.push([Number(m[1]), Number(m[2])]);
      if (el.containerId && !byId.has(el.containerId)) {
        byId.set(el.containerId, `${m[1]}.${m[2]}`);
      }
    }
  }
  return { byId, pairs };
}

function computeNextNodeNumber(elements, baseNode = null, mode = 'sibling') {
  const { byId, pairs } = parseNodeNumbers(elements);

  if (mode === 'major') {
    const maxMajor = pairs.reduce((acc, [maj]) => Math.max(acc, maj), 0);
    return `${maxMajor + 1}.0`;
  }

  if (baseNode) {
    const baseNum = byId.get(baseNode.id);
    if (baseNum) {
      const m = baseNum.match(/^(\d+)\.(\d+)$/);
      if (m) {
        const major = Number(m[1]);
        const maxMinor = pairs
          .filter(([maj]) => maj === major)
          .reduce((acc, [, min]) => Math.max(acc, min), Number(m[2]));
        return `${major}.${maxMinor + 1}`;
      }
    }
  }

  if (!pairs.length) return '1.0';
  const latestMajor = pairs[pairs.length - 1][0];
  const maxMinor = pairs
    .filter(([maj]) => maj === latestMajor)
    .reduce((acc, [, min]) => Math.max(acc, min), -1);
  return `${latestMajor}.${maxMinor + 1}`;
}

function getViewportCenterSceneCoords(appState) {
  const zoom = Number(appState?.zoom?.value) || 1;
  const width = Number(appState?.width) || 1200;
  const height = Number(appState?.height) || 720;
  const scrollX = Number(appState?.scrollX) || 0;
  const scrollY = Number(appState?.scrollY) || 0;
  return {
    x: Math.round(-scrollX + width / (2 * zoom)),
    y: Math.round(-scrollY + height / (2 * zoom)),
  };
}

function findNonOverlappingSlot(elements, desiredX, desiredY, w, h, stepX = 0, stepY = 48) {
  const actives = elements.filter((el) => el && !el.isDeleted && isBindableNodeElement(el));
  let x = Math.round(desiredX);
  let y = Math.round(desiredY);
  for (let i = 0; i < 14; i += 1) {
    const collides = actives.some(
      (el) =>
        x < el.x + el.width + 20 &&
        x + w + 20 > el.x &&
        y < el.y + el.height + 20 &&
        y + h + 20 > el.y
    );
    if (!collides) break;
    x += stepX;
    y += stepY;
  }
  return { x, y };
}

function buildNodeElements({
  kind = 'card',
  x,
  y,
  accent,
  nodeNumber,
  text,
  width,
  height,
  customData = {},
  link = null,
}) {
  const id = randomId('node');
  const isPill = kind === 'destination';
  const isDiamond = kind === 'decision';
  const shapeType = isDiamond ? 'diamond' : 'rectangle';
  const w = width || (isDiamond ? DIAMOND_WIDTH : isPill ? PILL_WIDTH : CARD_WIDTH);
  const h = height || (isDiamond ? DIAMOND_HEIGHT : isPill ? PILL_HEIGHT : CARD_HEIGHT);

  const skeleton = {
    id,
    type: shapeType,
    x: Math.round(x),
    y: Math.round(y),
    width: w,
    height: h,
    strokeColor: accent.canvas,
    backgroundColor: isPill ? accent.canvas : CARD_BG_CANVAS,
    fillStyle: 'solid',
    strokeWidth: 2,
    strokeStyle: 'solid',
    roughness: 0,
    opacity: 100,
    roundness: isDiamond
      ? { type: ROUNDNESS.ADAPTIVE_RADIUS }
      : isPill
      ? { type: ROUNDNESS.ADAPTIVE_RADIUS, value: Math.round(h / 2) }
      : { type: ROUNDNESS.ADAPTIVE_RADIUS },
    link: link || null,
    customData: {
      cromNode: true,
      nodeKind: kind,
      nodeNumber,
      accentId: accent.id,
      ...customData,
    },
    label: {
      text,
      fontSize: isPill ? 15 : 14,
      fontFamily: FONT_FAMILY.Nunito,
      textAlign: isPill || isDiamond ? 'center' : 'left',
      verticalAlign: 'middle',
      strokeColor: isPill ? accent.pillText : TEXT_INK_CANVAS,
    },
  };

  return convertToExcalidrawElements([skeleton], { regenerateIds: false });
}

function buildGroupElements({ x, y, width, height, title, accent }) {
  const containerId = randomId('groupbox');
  const titleId = randomId('grouplabel');

  return convertToExcalidrawElements(
    [
      {
        id: containerId,
        type: 'rectangle',
        x: Math.round(x),
        y: Math.round(y),
        width: Math.round(width),
        height: Math.round(height),
        strokeColor: accent.canvas,
        backgroundColor: GROUP_BG_CANVAS,
        fillStyle: 'solid',
        strokeWidth: 2,
        strokeStyle: 'dashed',
        roughness: 0,
        opacity: 65,
        roundness: { type: ROUNDNESS.ADAPTIVE_RADIUS },
        customData: {
          cromGroupContainer: true,
          groupTitle: title,
        },
      },
      {
        id: titleId,
        type: 'text',
        x: Math.round(x + 18),
        y: Math.round(y + 14),
        text: title,
        fontSize: 16,
        fontFamily: FONT_FAMILY.Nunito,
        strokeColor: GROUP_LABEL_CANVAS,
        customData: {
          cromGroupLabel: true,
          groupContainerId: containerId,
        },
      },
    ],
    { regenerateIds: false }
  );
}

function WhiteboardApp() {
  const apiRef = useRef(null);
  const readySentRef = useRef(false);
  const pendingLoadRef = useRef(null);
  const suppressDirtyUntilRef = useRef(0);
  const lastSignatureRef = useRef('');
  const dirtyTimerRef = useRef(null);
  const nodeFocusRef = useRef(false);
  const canvasThemeRef = useRef('dark');

  const [nodeFocus, setNodeFocus] = useState(false);
  const [canvasTheme, setCanvasTheme] = useState('dark');
  const [accentId, setAccentId] = useState('laranja');
  const [arrowStyle, setArrowStyle] = useState('dashed');
  const [savedLabel, setSavedLabel] = useState('');

  const selectedAccent = ACCENT_PALETTE.find((a) => a.id === accentId) || ACCENT_PALETTE[0];

  useEffect(() => {
    nodeFocusRef.current = nodeFocus;
  }, [nodeFocus]);

  useEffect(() => {
    canvasThemeRef.current = canvasTheme;
  }, [canvasTheme]);

  const applyScenePayload = useCallback((payload) => {
    const api = apiRef.current;
    if (!api) {
      pendingLoadRef.current = payload;
      return;
    }

    if (dirtyTimerRef.current) {
      clearTimeout(dirtyTimerRef.current);
      dirtyTimerRef.current = null;
    }

    const scene = payload?.scene || {};
    const rawElements = Array.isArray(scene.elements) ? scene.elements : [];
    const restoredElements = restoreElements(rawElements, null, { repairBindings: true });
    const rawAppState = sanitizeAppState(scene.appState || {});
    const targetTheme = rawAppState.theme === 'light' ? 'light' : 'dark';

    let viewBg = rawAppState.viewBackgroundColor;
    if (
      restoredElements.length === 0 &&
      targetTheme === 'dark' &&
      (!viewBg || ['#0e0f17', '#090a11', '#121212'].includes(String(viewBg).toLowerCase()))
    ) {
      viewBg = '#ffffff';
    }
    if (!viewBg) viewBg = '#ffffff';

    const hasSavedScroll =
      Number.isFinite(rawAppState.scrollX) && Number.isFinite(rawAppState.scrollY);

    const nextAppState = {
      ...rawAppState,
      theme: targetTheme,
      viewBackgroundColor: viewBg,
      scrollX: Number.isFinite(rawAppState.scrollX) ? rawAppState.scrollX : 0,
      scrollY: Number.isFinite(rawAppState.scrollY) ? rawAppState.scrollY : 0,
      zoom: rawAppState.zoom || { value: 1 },
      selectedElementIds: {},
      selectedGroupIds: {},
      editingGroupId: null,
    };

    suppressDirtyUntilRef.current = Date.now() + 420;

    if (isPlainObject(scene.files)) {
      const fileEntries = Object.values(scene.files).filter(
        (f) => isPlainObject(f) && f.id && f.dataURL
      );
      if (fileEntries.length) {
        api.addFiles(fileEntries);
      }
    }

    setCanvasTheme(targetTheme);
    if (typeof payload?.nodeFocus === 'boolean') {
      setNodeFocus(payload.nodeFocus);
    }

    api.updateScene({
      elements: restoredElements,
      appState: nextAppState,
      captureUpdate: CaptureUpdateAction.NEVER,
    });
    api.history.clear();

    lastSignatureRef.current = computeSceneSignature(
      restoredElements,
      nextAppState,
      scene.files || {}
    );

    if (restoredElements.length > 0 && !hasSavedScroll) {
      requestAnimationFrame(() => {
        try {
          api.scrollToContent(restoredElements, { fitToContent: true, animate: false });
        } catch {
          // ignore viewport fit error before layout
        }
      });
    }
  }, []);

  const handleExcalidrawAPI = useCallback(
    (api) => {
      if (!api) return;
      apiRef.current = api;
      if (pendingLoadRef.current) {
        const pending = pendingLoadRef.current;
        pendingLoadRef.current = null;
        applyScenePayload(pending);
      }
      if (!readySentRef.current) {
        readySentRef.current = true;
        postToParent({ type: 'wb:ready' });
      }
    },
    [applyScenePayload]
  );

  const handleExcalidrawChange = useCallback((elements, appState, files) => {
    if (appState?.theme && appState.theme !== canvasThemeRef.current) {
      canvasThemeRef.current = appState.theme;
      setCanvasTheme(appState.theme);
    }

    const sig = computeSceneSignature(elements, appState, files);
    if (Date.now() < suppressDirtyUntilRef.current) {
      lastSignatureRef.current = sig;
      return;
    }
    if (sig === lastSignatureRef.current) {
      return;
    }
    lastSignatureRef.current = sig;

    if (dirtyTimerRef.current) {
      clearTimeout(dirtyTimerRef.current);
    }
    dirtyTimerRef.current = setTimeout(() => {
      dirtyTimerRef.current = null;
      const api = apiRef.current;
      const curElements = api ? api.getSceneElements() : elements;
      const curAppState = api ? api.getAppState() : appState;
      const curFiles = api ? api.getFiles() : files;
      const scene = sanitizeSceneForExport(curElements, curAppState, curFiles);
      postToParent({
        type: 'wb:dirty',
        scene,
        elementCount: scene.elements.length,
      });
    }, 250);
  }, []);

  const commitElements = useCallback((nextElements, selectedIds = null, scrollTarget = null) => {
    const api = apiRef.current;
    if (!api) return;
    const update = {
      elements: nextElements,
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    };
    if (selectedIds) {
      update.appState = {
        selectedElementIds: selectedIds,
        activeTool: {
          type: 'selection',
          customType: null,
          locked: false,
          lastActiveTool: null,
        },
      };
    }
    api.updateScene(update);
    if (scrollTarget) {
      requestAnimationFrame(() => {
        try {
          api.scrollToContent(scrollTarget, { animate: true, fitToContent: false });
        } catch {
          // ignore
        }
      });
    }
  }, []);

  const handleAddNode = useCallback(() => {
    const api = apiRef.current;
    if (!api) return;
    const allElements = api.getSceneElements();
    const appState = api.getAppState();
    const selected = getSelectedBindableNodes(allElements, appState);
    const anchor = selected.length === 1 ? selected[0] : null;
    const num = computeNextNodeNumber(allElements, anchor, 'sibling');

    let targetX;
    let targetY;
    if (anchor) {
      const slot = findNonOverlappingSlot(
        allElements,
        anchor.x + anchor.width + FLOW_GAP_X,
        anchor.y,
        CARD_WIDTH,
        CARD_HEIGHT,
        0,
        52
      );
      targetX = slot.x;
      targetY = slot.y;
    } else {
      const center = getViewportCenterSceneCoords(appState);
      const slot = findNonOverlappingSlot(
        allElements,
        center.x - CARD_WIDTH / 2,
        center.y - CARD_HEIGHT / 2,
        CARD_WIDTH,
        CARD_HEIGHT,
        28,
        44
      );
      targetX = slot.x;
      targetY = slot.y;
    }

    const newEls = buildNodeElements({
      kind: 'card',
      x: targetX,
      y: targetY,
      accent: selectedAccent,
      nodeNumber: num,
      text: `${num} • Novo Node\n• Objetivo do passo\n• Próxima ação`,
    });
    const newCard = newEls[0];
    commitElements([...allElements, ...newEls], { [newCard.id]: true }, [newCard]);
  }, [commitElements, selectedAccent]);

  const handleAddNext = useCallback(() => {
    const api = apiRef.current;
    if (!api) return;
    const allElements = api.getSceneElements();
    const appState = api.getAppState();
    const selected = getSelectedBindableNodes(allElements, appState);

    if (selected.length !== 1) {
      if (selected.length === 0) {
        const candidates = allElements.filter(isBindableNodeElement);
        if (!candidates.length) {
          handleAddNode();
          return;
        }
        api.setToast({
          message: 'Selecione 1 node para encadear o próximo passo.',
          duration: 2400,
          closable: true,
        });
        return;
      }
      api.setToast({
        message: 'Selecione apenas 1 node para usar "→ + Próximo".',
        duration: 2400,
        closable: true,
      });
      return;
    }

    const sourceNode = selected[0];
    const num = computeNextNodeNumber(allElements, sourceNode, 'sibling');
    const slot = findNonOverlappingSlot(
      allElements,
      sourceNode.x + sourceNode.width + FLOW_GAP_X,
      sourceNode.y + (sourceNode.height - CARD_HEIGHT) / 2,
      CARD_WIDTH,
      CARD_HEIGHT,
      0,
      58
    );

    const created = buildNodeElements({
      kind: 'card',
      x: slot.x,
      y: slot.y,
      accent: selectedAccent,
      nodeNumber: num,
      text: `${num} • Próximo Passo\n• Ação principal\n• Critério de saída`,
    });
    let nextCard = created[0];
    const arrow = createBoundElbowArrow(sourceNode, nextCard, {
      strokeColor: selectedAccent.canvas,
      strokeStyle: arrowStyle,
      direction: 'right',
    });
    nextCard = addArrowBindingRef(nextCard, arrow.id);
    const updatedSource = addArrowBindingRef(sourceNode, arrow.id);

    const nextElements = allElements
      .map((el) => (el.id === updatedSource.id ? updatedSource : el))
      .concat([nextCard, ...created.slice(1), arrow]);

    commitElements(nextElements, { [nextCard.id]: true }, [nextCard]);
  }, [arrowStyle, commitElements, handleAddNode, selectedAccent]);

  const handleAddBranch = useCallback(() => {
    const api = apiRef.current;
    if (!api) return;
    const allElements = api.getSceneElements();
    const appState = api.getAppState();
    const selected = getSelectedBindableNodes(allElements, appState);

    if (selected.length !== 1) {
      api.setToast({
        message: 'Selecione 1 node de origem para criar um ramo abaixo.',
        duration: 2400,
        closable: true,
      });
      return;
    }

    const sourceNode = selected[0];
    const num = computeNextNodeNumber(allElements, sourceNode, 'sibling');
    const slot = findNonOverlappingSlot(
      allElements,
      sourceNode.x + (sourceNode.width - CARD_WIDTH) / 2,
      sourceNode.y + sourceNode.height + FLOW_GAP_Y,
      CARD_WIDTH,
      CARD_HEIGHT,
      CARD_WIDTH + 48,
      0
    );

    const created = buildNodeElements({
      kind: 'card',
      x: slot.x,
      y: slot.y,
      accent: selectedAccent,
      nodeNumber: num,
      text: `${num} • Ramo Alternativo\n• Condição do fluxo\n• Resultado`,
    });
    let branchCard = created[0];
    const arrow = createBoundElbowArrow(sourceNode, branchCard, {
      strokeColor: selectedAccent.canvas,
      strokeStyle: arrowStyle,
      direction: 'down',
    });
    branchCard = addArrowBindingRef(branchCard, arrow.id);
    const updatedSource = addArrowBindingRef(sourceNode, arrow.id);

    const nextElements = allElements
      .map((el) => (el.id === updatedSource.id ? updatedSource : el))
      .concat([branchCard, ...created.slice(1), arrow]);

    commitElements(nextElements, { [branchCard.id]: true }, [branchCard]);
  }, [arrowStyle, commitElements, selectedAccent]);

  const handleConnectSelected = useCallback(() => {
    const api = apiRef.current;
    if (!api) return;
    const allElements = api.getSceneElements();
    const appState = api.getAppState();
    const selected = getSelectedBindableNodes(allElements, appState);

    if (selected.length < 2) {
      api.setToast({
        message: 'Selecione 2 ou mais nodes para interligar.',
        duration: 2400,
        closable: true,
      });
      return;
    }

    const sorted = [...selected].sort((a, b) => {
      const colDiff = Math.round(a.x / 60) - Math.round(b.x / 60);
      if (colDiff !== 0) return colDiff;
      return a.y - b.y;
    });

    const updatedMap = new Map(allElements.map((el) => [el.id, el]));
    const newArrows = [];

    for (let i = 0; i < sorted.length - 1; i += 1) {
      const fromEl = updatedMap.get(sorted[i].id) || sorted[i];
      const toEl = updatedMap.get(sorted[i + 1].id) || sorted[i + 1];

      const alreadyLinked = allElements.some(
        (el) =>
          !el.isDeleted &&
          el.type === 'arrow' &&
          el.startBinding?.elementId === fromEl.id &&
          el.endBinding?.elementId === toEl.id
      );
      if (alreadyLinked) continue;

      const arrow = createBoundElbowArrow(fromEl, toEl, {
        strokeColor: selectedAccent.canvas,
        strokeStyle: arrowStyle,
        direction: 'auto',
      });
      updatedMap.set(fromEl.id, addArrowBindingRef(fromEl, arrow.id));
      updatedMap.set(toEl.id, addArrowBindingRef(toEl, arrow.id));
      newArrows.push(arrow);
    }

    if (!newArrows.length) {
      api.setToast({
        message: 'Os nodes selecionados já estão interligados.',
        duration: 2200,
        closable: true,
      });
      return;
    }

    const nextElements = allElements
      .map((el) => updatedMap.get(el.id) || el)
      .concat(newArrows);

    commitElements(nextElements);
  }, [arrowStyle, commitElements, selectedAccent]);

  const handleAddGroup = useCallback(() => {
    const api = apiRef.current;
    if (!api) return;
    const allElements = api.getSceneElements();
    const appState = api.getAppState();
    const selected = getSelectedBindableNodes(allElements, appState);
    const majorNum = computeNextNodeNumber(allElements, null, 'major');

    let gx;
    let gy;
    let gw;
    let gh;
    if (selected.length > 0) {
      const selectedWithChildren = [];
      const selectedIdSet = new Set(selected.map((s) => s.id));
      for (const el of allElements) {
        if (!el || el.isDeleted) continue;
        if (selectedIdSet.has(el.id) || (el.containerId && selectedIdSet.has(el.containerId))) {
          selectedWithChildren.push(el);
        }
      }
      const [minX, minY, maxX, maxY] = getCommonBounds(selectedWithChildren);
      gx = minX - 28;
      gy = minY - 52;
      gw = Math.max(320, maxX - minX + 56);
      gh = Math.max(180, maxY - minY + 80);
    } else {
      const center = getViewportCenterSceneCoords(appState);
      gx = center.x - 280;
      gy = center.y - 140;
      gw = 560;
      gh = 280;
    }

    const groupEls = buildGroupElements({
      x: gx,
      y: gy,
      width: gw,
      height: gh,
      title: selected.length ? `${majorNum} Seção do Fluxo` : `${majorNum} Onboarding`,
      accent: selectedAccent,
    });

    // Coloca a caixa de grupo atrás dos cards existentes
    const nextElements = [...groupEls, ...allElements];
    commitElements(nextElements, { [groupEls[0].id]: true }, [groupEls[0]]);
  }, [commitElements, selectedAccent]);

  const handleAddLinkedKind = useCallback(
    (kind) => {
      const api = apiRef.current;
      if (!api) return;
      const allElements = api.getSceneElements();
      const appState = api.getAppState();
      const selected = getSelectedBindableNodes(allElements, appState);
      const sourceNode = selected.length === 1 ? selected[0] : null;
      const isPill = kind === 'destination';
      const w = isPill ? PILL_WIDTH : DIAMOND_WIDTH;
      const h = isPill ? PILL_HEIGHT : DIAMOND_HEIGHT;
      const num = computeNextNodeNumber(
        allElements,
        sourceNode,
        isPill ? 'major' : 'sibling'
      );

      let pos;
      if (sourceNode) {
        pos = findNonOverlappingSlot(
          allElements,
          sourceNode.x + sourceNode.width + FLOW_GAP_X,
          sourceNode.y + (sourceNode.height - h) / 2,
          w,
          h,
          0,
          56
        );
      } else {
        const center = getViewportCenterSceneCoords(appState);
        pos = findNonOverlappingSlot(allElements, center.x - w / 2, center.y - h / 2, w, h, 24, 44);
      }

      const created = buildNodeElements({
        kind,
        x: pos.x,
        y: pos.y,
        accent: selectedAccent,
        nodeNumber: num,
        text: isPill ? `${num} Próximo Fluxo` : `${num} ?\nDecisão?`,
      });
      let targetNode = created[0];
      let nextElements;

      if (sourceNode) {
        const arrow = createBoundElbowArrow(sourceNode, targetNode, {
          strokeColor: selectedAccent.canvas,
          strokeStyle: arrowStyle,
          direction: 'right',
        });
        targetNode = addArrowBindingRef(targetNode, arrow.id);
        const updatedSource = addArrowBindingRef(sourceNode, arrow.id);
        nextElements = allElements
          .map((el) => (el.id === updatedSource.id ? updatedSource : el))
          .concat([targetNode, ...created.slice(1), arrow]);
      } else {
        nextElements = [...allElements, ...created];
      }

      commitElements(nextElements, { [targetNode.id]: true }, [targetNode]);
    },
    [arrowStyle, commitElements, selectedAccent]
  );

  const handleAlignSelected = useCallback(() => {
    const api = apiRef.current;
    if (!api) return;
    const allElements = api.getSceneElements();
    const appState = api.getAppState();
    let nodes = getSelectedBindableNodes(allElements, appState);
    if (nodes.length < 2) {
      nodes = allElements.filter((el) => isBindableNodeElement(el) && el.customData?.cromNode);
    }
    if (nodes.length < 2) {
      api.setToast({
        message: 'Selecione 2 ou mais nodes para alinhar.',
        duration: 2400,
        closable: true,
      });
      return;
    }

    const sorted = [...nodes].sort((a, b) => a.x - b.x || a.y - b.y);
    let cursorX = Math.round(Math.min(...sorted.map((n) => n.x)));
    const avgCenterY =
      sorted.reduce((sum, n) => sum + n.y + n.height / 2, 0) / sorted.length;

    const deltas = new Map();
    const movedNodes = new Map();
    for (const node of sorted) {
      const nextX = cursorX;
      const nextY = Math.round(avgCenterY - node.height / 2);
      deltas.set(node.id, { dx: nextX - node.x, dy: nextY - node.y });
      movedNodes.set(node.id, {
        ...node,
        x: nextX,
        y: nextY,
        version: (node.version || 1) + 1,
        versionNonce: randomNonce(),
        updated: Date.now(),
      });
      cursorX += node.width + FLOW_GAP_X;
    }

    const byId = new Map(
      allElements.map((el) => [el.id, movedNodes.get(el.id) || el])
    );

    const nextElements = allElements.map((el) => {
      if (!el || el.isDeleted) return el;
      if (movedNodes.has(el.id)) return movedNodes.get(el.id);

      if (el.type === 'text' && el.containerId && deltas.has(el.containerId)) {
        const d = deltas.get(el.containerId);
        return {
          ...el,
          x: Math.round(el.x + d.dx),
          y: Math.round(el.y + d.dy),
          version: (el.version || 1) + 1,
          versionNonce: randomNonce(),
          updated: Date.now(),
        };
      }

      if (el.type === 'arrow' && el.startBinding?.elementId && el.endBinding?.elementId) {
        const sMoved = deltas.has(el.startBinding.elementId);
        const eMoved = deltas.has(el.endBinding.elementId);
        if (sMoved || eMoved) {
          const fromEl = byId.get(el.startBinding.elementId);
          const toEl = byId.get(el.endBinding.elementId);
          if (fromEl && toEl) {
            const geom = computeElbowGeometry(fromEl, toEl, 'auto');
            return {
              ...el,
              x: geom.x,
              y: geom.y,
              width: geom.width,
              height: geom.height,
              points: geom.points,
              elbowed: true,
              roundness: null,
              startBinding: geom.startBinding,
              endBinding: geom.endBinding,
              version: (el.version || 1) + 1,
              versionNonce: randomNonce(),
              updated: Date.now(),
            };
          }
        }
      }
      return el;
    });

    commitElements(nextElements);
  }, [commitElements]);

  const handleInsertTemplate = useCallback(() => {
    const api = apiRef.current;
    if (!api) return;
    const allElements = api.getSceneElements();
    const appState = api.getAppState();
    const active = allElements.filter((el) => el && !el.isDeleted);

    let originX = 80;
    let originY = 110;
    if (active.length > 0) {
      const [minX, , , maxY] = getCommonBounds(active);
      originX = Math.round(minX);
      originY = Math.round(maxY + 90);
    } else {
      const center = getViewportCenterSceneCoords(appState);
      originX = Math.round(center.x - 520);
      originY = Math.round(center.y - 120);
    }

    const majorNum = active.length
      ? parseNodeNumbers(active).pairs.reduce((acc, [maj]) => Math.max(acc, maj), 0) + 1
      : 1;

    const accent1 = selectedAccent;
    const accent2 = ACCENT_PALETTE[(ACCENT_PALETTE.findIndex((a) => a.id === accent1.id) + 1) % ACCENT_PALETTE.length];
    const accent3 = ACCENT_PALETTE[(ACCENT_PALETTE.findIndex((a) => a.id === accent1.id) + 2) % ACCENT_PALETTE.length];

    const c1 = buildNodeElements({
      kind: 'card',
      x: originX + 32,
      y: originY + 56,
      accent: accent1,
      nodeNumber: `${majorNum}.0`,
      text: `${majorNum}.0 • Gancho & Tensão\n• Promessa nos primeiros 30s\n• Pergunta central`,
    });
    const c2 = buildNodeElements({
      kind: 'card',
      x: originX + 32 + CARD_WIDTH + FLOW_GAP_X,
      y: originY + 56,
      accent: accent2,
      nodeNumber: `${majorNum}.1`,
      text: `${majorNum}.1 • Desenvolvimento\n• Evidência / Bastidores\n• Virada narrativa`,
    });
    const c3 = buildNodeElements({
      kind: 'card',
      x: originX + 32 + (CARD_WIDTH + FLOW_GAP_X) * 2,
      y: originY + 56,
      accent: accent3,
      nodeNumber: `${majorNum}.2`,
      text: `${majorNum}.2 • Fechamento & CTA\n• Síntese da tese\n• Gancho para próximo vídeo`,
    });
    const dest = buildNodeElements({
      kind: 'destination',
      x: originX + 32 + (CARD_WIDTH + FLOW_GAP_X) * 3 + 20,
      y: originY + 56 + (CARD_HEIGHT - PILL_HEIGHT) / 2,
      accent: accent1,
      nodeNumber: `${majorNum + 1}.0`,
      text: `${majorNum + 1}.0 Próximo Fluxo`,
    });

    let n1 = c1[0];
    let n2 = c2[0];
    let n3 = c3[0];
    let p1 = dest[0];

    const a1 = createBoundElbowArrow(n1, n2, {
      strokeColor: accent1.canvas,
      strokeStyle: arrowStyle,
      direction: 'right',
    });
    const a2 = createBoundElbowArrow(n2, n3, {
      strokeColor: accent2.canvas,
      strokeStyle: arrowStyle,
      direction: 'right',
    });
    const a3 = createBoundElbowArrow(n3, p1, {
      strokeColor: accent3.canvas,
      strokeStyle: arrowStyle,
      direction: 'right',
    });

    n1 = addArrowBindingRef(n1, a1.id);
    n2 = addArrowBindingRef(addArrowBindingRef(n2, a1.id), a2.id);
    n3 = addArrowBindingRef(addArrowBindingRef(n3, a2.id), a3.id);
    p1 = addArrowBindingRef(p1, a3.id);

    const groupWidth = (CARD_WIDTH + FLOW_GAP_X) * 2 + CARD_WIDTH + 64;
    const groupEls = buildGroupElements({
      x: originX,
      y: originY,
      width: groupWidth,
      height: CARD_HEIGHT + 92,
      title: `${majorNum}.0 Fluxo Principal`,
      accent: accent1,
    });

    const createdAll = [
      ...groupEls,
      n1,
      ...c1.slice(1),
      n2,
      ...c2.slice(1),
      n3,
      ...c3.slice(1),
      a1,
      a2,
      p1,
      ...dest.slice(1),
      a3,
    ];

    commitElements([...allElements, ...createdAll], { [n1.id]: true }, createdAll);
  }, [arrowStyle, commitElements, selectedAccent]);

  const insertScriptNode = useCallback(
    (doc) => {
      const api = apiRef.current;
      if (!api || !doc) return;
      const allElements = api.getSceneElements();
      const appState = api.getAppState();
      const selected = getSelectedBindableNodes(allElements, appState);
      const sourceNode = selected.length === 1 ? selected[0] : null;
      const num = computeNextNodeNumber(allElements, sourceNode, 'sibling');

      const title = truncateText(doc.titulo || doc.path || 'Roteiro', 34);
      const serie = doc.serie || 'Geral';
      const status = doc.status || 'ideia';
      const words = Number(doc.words) || 0;
      const summary = wrapTextLines(doc.resumo || '', 32, 2);
      const cardText = [
        `${num} • ${title}`,
        `[${serie}] • ${status} • ${words} pal.`,
        summary ? summary : null,
      ]
        .filter(Boolean)
        .join('\n');

      const w = 276;
      const h = summary ? 132 : 108;
      let pos;
      if (sourceNode) {
        pos = findNonOverlappingSlot(
          allElements,
          sourceNode.x + sourceNode.width + FLOW_GAP_X,
          sourceNode.y + (sourceNode.height - h) / 2,
          w,
          h,
          0,
          56
        );
      } else {
        const center = getViewportCenterSceneCoords(appState);
        pos = findNonOverlappingSlot(allElements, center.x - w / 2, center.y - h / 2, w, h, 28, 46);
      }

      const created = buildNodeElements({
        kind: 'card',
        x: pos.x,
        y: pos.y,
        width: w,
        height: h,
        accent: selectedAccent,
        nodeNumber: num,
        text: cardText,
        customData: {
          docPath: doc.path || '',
          docTitle: doc.titulo || '',
          docStatus: status,
          docSerie: serie,
        },
      });
      let card = created[0];
      let nextElements;

      if (sourceNode) {
        const arrow = createBoundElbowArrow(sourceNode, card, {
          strokeColor: selectedAccent.canvas,
          strokeStyle: arrowStyle,
          direction: 'right',
        });
        card = addArrowBindingRef(card, arrow.id);
        const updatedSource = addArrowBindingRef(sourceNode, arrow.id);
        nextElements = allElements
          .map((el) => (el.id === updatedSource.id ? updatedSource : el))
          .concat([card, ...created.slice(1), arrow]);
      } else {
        nextElements = [...allElements, ...created];
      }

      commitElements(nextElements, { [card.id]: true }, [card]);
    },
    [arrowStyle, commitElements, selectedAccent]
  );

  const toggleNodeFocusInternal = useCallback((nextVal) => {
    setNodeFocus(nextVal);
    postToParent({ type: 'wb:mode-changed', nodeFocus: nextVal });
  }, []);

  useEffect(() => {
    const onMessage = (event) => {
      if (event.origin !== window.location.origin) return;
      if (window.parent && window.parent !== window && event.source !== window.parent) return;
      const msg = event.data;
      if (!isPlainObject(msg) || typeof msg.type !== 'string') return;

      switch (msg.type) {
        case 'wb:load-scene': {
          applyScenePayload(msg);
          break;
        }
        case 'wb:set-node-focus': {
          setNodeFocus(Boolean(msg.nodeFocus));
          break;
        }
        case 'wb:request-snapshot': {
          const api = apiRef.current;
          const scene = api
            ? sanitizeSceneForExport(api.getSceneElements(), api.getAppState(), api.getFiles())
            : { elements: [], appState: {}, files: {} };
          postToParent({
            type: 'wb:snapshot',
            requestId: msg.requestId,
            scene,
          });
          break;
        }
        case 'wb:insert-script-node': {
          insertScriptNode(msg.doc);
          break;
        }
        case 'wb:saved-ack': {
          if (msg.updatedAt) {
            try {
              const d = new Date(msg.updatedAt);
              const hh = String(d.getHours()).padStart(2, '0');
              const mm = String(d.getMinutes()).padStart(2, '0');
              setSavedLabel(`Salvo ${hh}:${mm}`);
            } catch {
              setSavedLabel('Salvo');
            }
          } else {
            setSavedLabel('Salvo');
          }
          break;
        }
        default:
          break;
      }
    };

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [applyScenePayload, insertScriptNode]);

  useEffect(() => {
    const onKeyDown = (e) => {
      const isCtrlOrCmd = e.ctrlKey || e.metaKey;
      const key = String(e.key || '').toLowerCase();

      if (isCtrlOrCmd && key === 's') {
        e.preventDefault();
        e.stopPropagation();
        const api = apiRef.current;
        const scene = api
          ? sanitizeSceneForExport(api.getSceneElements(), api.getAppState(), api.getFiles())
          : { elements: [], appState: {}, files: {} };
        postToParent({ type: 'wb:save-request', scene });
        return;
      }

      if (e.key === 'F11' || (isCtrlOrCmd && e.shiftKey && key === 'f')) {
        e.preventDefault();
        e.stopPropagation();
        postToParent({ type: 'wb:toggle-fullscreen' });
        return;
      }

      if (e.altKey && !isCtrlOrCmd && key === 'n') {
        e.preventDefault();
        e.stopPropagation();
        toggleNodeFocusInternal(!nodeFocusRef.current);
        return;
      }

      if (e.key === 'Tab' && !isCtrlOrCmd && !e.shiftKey && !e.altKey && nodeFocusRef.current) {
        const tag = (document.activeElement?.tagName || '').toLowerCase();
        if (
          tag === 'input' ||
          tag === 'textarea' ||
          tag === 'select' ||
          document.activeElement?.isContentEditable
        ) {
          return;
        }
        const api = apiRef.current;
        if (!api) return;
        const appState = api.getAppState();
        if (appState?.editingTextElement) return;
        const selected = getSelectedBindableNodes(api.getSceneElements(), appState);
        if (selected.length === 1) {
          e.preventDefault();
          e.stopPropagation();
          handleAddNext();
        }
      }
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [handleAddNext, toggleNodeFocusInternal]);

  return (
    <div className={`wb-frame-root${nodeFocus ? ' is-node-focus' : ''}`}>
      <div className="wb-canvas-host">
        <Excalidraw
          excalidrawAPI={handleExcalidrawAPI}
          langCode="pt-BR"
          theme={canvasTheme}
          initialData={{
            appState: {
              theme: 'dark',
              viewBackgroundColor: '#ffffff',
              currentItemRoughness: 0,
            },
          }}
          UIOptions={{
            canvasActions: {
              loadScene: true,
              saveToActiveFile: false,
              export: { saveFileToDisk: true },
              toggleTheme: true,
              changeViewBackgroundColor: true,
              clearCanvas: true,
            },
          }}
          onChange={handleExcalidrawChange}
        />
      </div>

      {nodeFocus ? (
        <div className="node-dock" role="toolbar" aria-label="Barra rápida de Foco em Nodes">
          <div className="node-dock-group" title="Cor de destaque dos próximos nodes">
            {ACCENT_PALETTE.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`node-color-dot${accentId === item.id ? ' is-active' : ''}`}
                style={{ '--dot-color': item.ui }}
                title={`Cor: ${item.label}`}
                aria-label={`Cor ${item.label}`}
                onClick={() => setAccentId(item.id)}
              />
            ))}
          </div>

          <span className="node-dock-sep" />

          <button
            type="button"
            className={`node-dock-btn node-dock-toggle${arrowStyle === 'dashed' ? ' is-dashed' : ''}`}
            onClick={() => setArrowStyle((s) => (s === 'dashed' ? 'solid' : 'dashed'))}
            title="Alternar estilo das setas entre tracejada e sólida"
          >
            {arrowStyle === 'dashed' ? '┄ Tracejada' : '─ Sólida'}
          </button>

          <span className="node-dock-sep" />

          <button
            type="button"
            className="node-dock-btn is-primary"
            onClick={handleAddNode}
            title="Criar novo node numerado no canvas"
          >
            + Node
          </button>

          <button
            type="button"
            className="node-dock-btn"
            onClick={handleAddNext}
            title="Criar próximo node à direita conectado com seta (Tab)"
          >
            → + Próximo
          </button>

          <button
            type="button"
            className="node-dock-btn"
            onClick={handleAddBranch}
            title="Criar ramo filho abaixo do node selecionado"
          >
            ↓ + Ramo
          </button>

          <button
            type="button"
            className="node-dock-btn"
            onClick={handleConnectSelected}
            title="Interligar 2 ou mais nodes selecionados em sequência"
          >
            ↔ Interligar
          </button>

          <button
            type="button"
            className="node-dock-btn"
            onClick={handleAddGroup}
            title="Envolver seleção em seção tracejada ou criar novo grupo"
          >
            ⬚ + Grupo
          </button>

          <button
            type="button"
            className="node-dock-btn"
            onClick={() => handleAddLinkedKind('decision')}
            title="Adicionar losango de decisão"
          >
            ◆ + Decisão
          </button>

          <button
            type="button"
            className="node-dock-btn"
            onClick={() => handleAddLinkedKind('destination')}
            title="Adicionar selo colorido de próximo fluxo"
          >
            ● + Destino
          </button>

          <button
            type="button"
            className="node-dock-btn"
            onClick={() => postToParent({ type: 'wb:request-script-picker' })}
            title="Inserir card preenchido com um roteiro do workspace"
          >
            📄 + Roteiro
          </button>

          <button
            type="button"
            className="node-dock-btn"
            onClick={handleAlignSelected}
            title="Alinhar nodes selecionados em linha horizontal"
          >
            ⚡ Alinhar
          </button>

          <button
            type="button"
            className="node-dock-btn"
            onClick={handleInsertTemplate}
            title="Inserir grupo inicial 1.0 Fluxo Principal com 3 nodes conectados"
          >
            ✦ Modelo User Flow
          </button>

          <span className="node-dock-sep" />

          {savedLabel ? <span className="node-dock-status">{savedLabel}</span> : null}

          <button
            type="button"
            className="node-dock-btn is-subtle"
            onClick={() => toggleNodeFocusInternal(false)}
            title="Voltar à barra completa do Excalidraw (Alt+N)"
          >
            ✎ Completo
          </button>

          <button
            type="button"
            className="node-dock-btn is-subtle"
            onClick={() => postToParent({ type: 'wb:toggle-fullscreen' })}
            title="Alternar tela cheia (F11)"
          >
            ⛶
          </button>
        </div>
      ) : (
        <div className="wb-mini-focus-wrap">
          {savedLabel ? <span className="wb-mini-status">{savedLabel}</span> : null}
          <button
            type="button"
            className="wb-mini-focus-btn"
            onClick={() => toggleNodeFocusInternal(true)}
            title="Ativar barra rápida Foco em Nodes (Alt+N)"
          >
            ◈ Foco em Nodes
          </button>
        </div>
      )}
    </div>
  );
}

const rootEl = document.getElementById('excalidraw-root');
if (rootEl) {
  window.__CROM_WB_MOUNTED__ = true;
  const fallback = document.getElementById('wbFallbackCard');
  if (fallback) fallback.remove();
  createRoot(rootEl).render(<WhiteboardApp />);
}
