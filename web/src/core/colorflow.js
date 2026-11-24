import { PALETTES, STORAGE_KEY_PREFS } from './constants.js';
import { state } from './state.js';
import { loadJsonStorage, saveJsonStorage } from './utils.js';

export const ColorFlowEngine = {
  rafId: null,
  lastPaint: 0,
  phaseOffset: 0,
  lastActivePaletteId: 'crom-magenta',

  init() {
    const saved = loadJsonStorage(STORAGE_KEY_PREFS, {});
    if (saved.color) {
      state.color = { ...state.color, ...saved.color };
    }
    if (saved.readerFontSize) {
      state.readerFontSize = Math.min(24, Math.max(13, Number(saved.readerFontSize)));
    }
    state.prefs = {
      tabBarAlwaysOpen: Boolean(saved.tabBarAlwaysOpen),
      catalogLayout: saved.catalogLayout === 'grid' ? 'grid' : 'stacked',
      wbLayout: saved.wbLayout === 'list' ? 'list' : 'grid',
    };
    const reduced = globalThis.matchMedia && globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced && saved.color === undefined) {
      state.color.dynamic = false;
    }

    this.renderMenu();
    this.applyCurrent(performance.now());
    this.loop(performance.now());

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) this.lastPaint = 0;
    });
  },

  getCycleDurationMs() {
    if (state.color.speed === 'slow') return 84000;
    if (state.color.speed === 'fast') return 26000;
    return 48000;
  },

  lerp(a, b, t) {
    return Math.round(a + (b - a) * t);
  },

  lerpRgb(c1, c2, t) {
    return [
      this.lerp(c1[0], c2[0], t),
      this.lerp(c1[1], c2[1], t),
      this.lerp(c1[2], c2[2], t),
    ];
  },

  rgbHex(rgb) {
    return '#' + rgb.map((v) => v.toString(16).padStart(2, '0')).join('');
  },

  applyPaletteTriplet(a1, a2, a3, labelName) {
    const root = document.documentElement.style;
    root.setProperty('--accent', this.rgbHex(a1));
    root.setProperty('--accent-rgb', a1.join(', '));
    root.setProperty('--accent-2', this.rgbHex(a2));
    root.setProperty('--accent-2-rgb', a2.join(', '));
    root.setProperty('--accent-3', this.rgbHex(a3));
    root.setProperty('--accent-3-rgb', a3.join(', '));

    const lbl = document.getElementById('colorPillLabel');
    if (lbl && labelName) lbl.textContent = labelName;
  },

  applyCurrent(now) {
    if (!state.color.dynamic) {
      const pal = PALETTES.find((p) => p.id === state.color.fixedId) || PALETTES[0];
      this.lastActivePaletteId = pal.id;
      this.applyPaletteTriplet(pal.a1, pal.a2, pal.a3, pal.name);
      return;
    }

    const cycle = this.getCycleDurationMs();
    const progress = ((now + this.phaseOffset) % cycle) / cycle;
    const scaled = progress * PALETTES.length;
    const idx = Math.floor(scaled) % PALETTES.length;
    const nextIdx = (idx + 1) % PALETTES.length;
    const localT = scaled - Math.floor(scaled);
    const smoothT = 0.5 - 0.5 * Math.cos(Math.PI * localT);

    const p1 = PALETTES[idx];
    const p2 = PALETTES[nextIdx];
    const a1 = this.lerpRgb(p1.a1, p2.a1, smoothT);
    const a2 = this.lerpRgb(p1.a2, p2.a2, smoothT);
    const a3 = this.lerpRgb(p1.a3, p2.a3, smoothT);

    const closest = smoothT < 0.5 ? p1 : p2;
    this.lastActivePaletteId = closest.id;
    this.applyPaletteTriplet(a1, a2, a3, `Dinâmico • ${closest.name}`);
  },

  loop(now) {
    if (!document.hidden && state.color.dynamic) {
      if (now - this.lastPaint >= 48) {
        this.lastPaint = now;
        this.applyCurrent(now);
      }
    }
    this.rafId = requestAnimationFrame((ts) => this.loop(ts));
  },

  savePrefs() {
    const prefs = loadJsonStorage(STORAGE_KEY_PREFS, {});
    prefs.color = state.color;
    saveJsonStorage(STORAGE_KEY_PREFS, prefs);
  },

  renderMenu() {
    const toggle = document.getElementById('dynamicFlowToggle');
    if (toggle) toggle.checked = state.color.dynamic;

    document.querySelectorAll('#flowSpeedGroup button').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.speed === state.color.speed);
    });

    const list = document.getElementById('paletteList');
    if (!list) return;
    list.innerHTML = PALETTES.map((p) => {
      const selected = !state.color.dynamic && state.color.fixedId === p.id;
      return `
        <button type="button" class="palette-item${selected ? ' is-selected' : ''}" data-palette-id="${p.id}">
          <span class="palette-dots" style="background: linear-gradient(135deg, rgb(${p.a2.join(',')}), rgb(${p.a1.join(',')}))"></span>
          <span>${p.name}</span>
        </button>
      `;
    }).join('');
  },
};
