import {
  buildChannelState,
  loadKdenliveSummary,
  syncWorkspace,
  writeDiskBundles,
} from './sync.mjs';

export function createStateCache(config, { serverMode = true } = {}) {
  let state = null;
  let flushTimer = null;
  let closed = false;

  function cancelScheduledFlush() {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
  }

  function runWriteDiskBundles(snapshot) {
    if (!snapshot || config?.disableDiskBundles) {
      return false;
    }
    const opts = {};
    if (config?.dataDir) opts.dataDir = config.dataDir;
    if (config?.webDir) opts.webDir = config.webDir;
    writeDiskBundles(snapshot, opts);
    return true;
  }

  function scheduleDiskFlush(delayMs = 2500) {
    if (closed || !state || config?.disableDiskBundles) return;
    cancelScheduledFlush();
    const waitMs = Math.max(0, Number(delayMs) || 0);
    flushTimer = setTimeout(() => {
      flushTimer = null;
      if (closed || !state) return;
      try {
        runWriteDiskBundles(state);
      } catch {
        // Ignora erro transitório em flush assíncrono em segundo plano
      }
    }, waitMs);
    if (typeof flushTimer.unref === 'function') {
      flushTimer.unref();
    }
  }

  function init({ flushDisk = false } = {}) {
    if (!state) {
      return refreshAll({ flushDisk });
    }
    return state;
  }

  function getState() {
    if (!state) {
      return refreshAll({ flushDisk: false });
    }
    return state;
  }

  function refreshAll({ flushDisk = true } = {}) {
    const next = syncWorkspace({ serverMode, config, writeDisk: false });
    state = next;
    if (flushDisk) {
      scheduleDiskFlush();
    }
    return state;
  }

  function refreshChannel(channelKey, { flushDisk = true } = {}) {
    const key = String(channelKey || '').trim().toLowerCase();
    const ch = config?.channels?.[key];
    if (!state || !ch) {
      return refreshAll({ flushDisk });
    }

    const kdenliveSummary = state.kdenlive || loadKdenliveSummary(config.kdenliveRoot);
    const channelState = buildChannelState(ch, config, kdenliveSummary);
    state = {
      ...state,
      generatedAt: new Date().toISOString(),
      defaultChannel: config.defaultChannel,
      channelOrder: [...(config.channelOrder || [])],
      channels: {
        ...state.channels,
        [key]: channelState,
      },
      kdenlive: kdenliveSummary,
    };

    if (flushDisk) {
      scheduleDiskFlush();
    }
    return state;
  }

  function flushNow() {
    cancelScheduledFlush();
    if (!state || config?.disableDiskBundles) {
      return Promise.resolve(state);
    }
    runWriteDiskBundles(state);
    return Promise.resolve(state);
  }

  function close() {
    closed = true;
    try {
      cancelScheduledFlush();
      if (state && !config?.disableDiskBundles) {
        runWriteDiskBundles(state);
      }
    } catch {
      // Ignora erro de flush durante encerramento
    }
  }

  return {
    init,
    getState,
    refreshChannel,
    refreshAll,
    scheduleDiskFlush,
    flushNow,
    close,
    hasPendingFlush() {
      return Boolean(flushTimer);
    },
  };
}
