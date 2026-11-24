const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_CLIENT_VERSION = '2.20261123.00.00';

export const DESKTOP_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
  Cookie: 'CONSENT=YES+cb',
};

function decodeXmlEntities(str) {
  return String(str || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

function extractText(node) {
  if (node === null || node === undefined) return '';
  if (typeof node === 'string') return node.trim();
  if (typeof node === 'number') return String(node);
  if (typeof node !== 'object') return '';
  if (typeof node.simpleText === 'string') return node.simpleText.trim();
  if (typeof node.content === 'string') return node.content.trim();
  if (Array.isArray(node.runs)) {
    return node.runs
      .map((r) => (r && typeof r.text === 'string' ? r.text : ''))
      .join('')
      .trim();
  }
  if (node.text) return extractText(node.text);
  if (node.accessibility?.accessibilityData?.label) {
    return String(node.accessibility.accessibilityData.label).trim();
  }
  return '';
}

function extractJsonObjectAt(str, startBraceIdx) {
  if (startBraceIdx < 0 || str[startBraceIdx] !== '{') return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = startBraceIdx; i < str.length; i++) {
    const ch = str[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
    } else if (ch === '{') {
      depth += 1;
    } else if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(str.slice(startBraceIdx, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function extractNamedJsonFromHtml(html, patterns) {
  for (const re of patterns) {
    const m = re.exec(html);
    if (m) {
      const braceIdx = html.indexOf('{', m.index + m[0].length - 1);
      const parsed = extractJsonObjectAt(html, braceIdx);
      if (parsed) return parsed;
    }
  }
  return null;
}

function extractPageContext(html) {
  const ytInitialData = extractNamedJsonFromHtml(html, [
    /var\s+ytInitialData\s*=\s*\{/,
    /window\["ytInitialData"\]\s*=\s*\{/,
    /\bytInitialData\s*=\s*\{/,
  ]);
  const ytInitialPlayerResponse = extractNamedJsonFromHtml(html, [
    /var\s+ytInitialPlayerResponse\s*=\s*\{/,
    /window\["ytInitialPlayerResponse"\]\s*=\s*\{/,
    /\bytInitialPlayerResponse\s*=\s*\{/,
  ]);
  const apiKey =
    (/"INNERTUBE_API_KEY"\s*:\s*"([^"]+)"/.exec(html) || [])[1] || '';
  const clientVersion =
    (/"INNERTUBE_CLIENT_VERSION"\s*:\s*"([^"]+)"/.exec(html) || [])[1] ||
    DEFAULT_CLIENT_VERSION;
  return { ytInitialData, ytInitialPlayerResponse, apiKey, clientVersion };
}

export function parseViewCount(rawText) {
  if (typeof rawText === 'number' && Number.isFinite(rawText)) {
    return Math.max(0, Math.round(rawText));
  }
  const text = String(rawText || '').trim();
  if (!text) return 0;
  if (/^(sem\s+visualiza|no\s+views|nenhuma)/i.test(text)) return 0;

  // Match number + optional unit (pt-BR: mil, mi, bi; EN: K, M, B)
  const match =
    /(\d[\d.,\s]*)\s*(mil|mi|bi|[kmb])?(?:\b|$)/i.exec(text);
  if (!match) return 0;

  const numRaw = match[1].replace(/\s+/g, '');
  const unit = (match[2] || '').toLowerCase();

  let multiplier = 1;
  if (unit === 'mil' || unit === 'k') multiplier = 1_000;
  else if (unit === 'mi' || unit === 'm') multiplier = 1_000_000;
  else if (unit === 'bi' || unit === 'b') multiplier = 1_000_000_000;

  let value = 0;
  if (multiplier > 1) {
    // With unit suffix: e.g. "1,2 mil", "1.5K", "1,4 mi", "1.234,5 mil"
    let normalized = numRaw;
    if (normalized.includes(',') && normalized.includes('.')) {
      normalized =
        normalized.lastIndexOf(',') > normalized.lastIndexOf('.')
          ? normalized.replace(/\./g, '').replace(',', '.')
          : normalized.replace(/,/g, '');
    } else if (normalized.includes(',')) {
      normalized = normalized.replace(',', '.');
    }
    value = parseFloat(normalized);
  } else {
    // Without unit suffix: dots/commas are thousands separators ("1.234 visualizações", "1,234 views")
    const digitsOnly = numRaw.replace(/[.,]/g, '');
    value = parseInt(digitsOnly, 10);
  }

  return Number.isFinite(value) && value >= 0 ? Math.round(value * multiplier) : 0;
}

export function parseRelativePublishedDate(publishedText, nowMs = Date.now()) {
  const raw = String(publishedText || '').trim().toLowerCase();
  if (!raw) return '';

  const isoMatch = /^(\d{4}-\d{2}-\d{2})/.exec(raw);
  if (isoMatch) return isoMatch[1];

  const cleaned = raw
    .replace(/^(transmitido|streamed|estreou|premiered|publicado)\s+/i, '')
    .trim();

  const m =
    /(\d+)\s*(segundos?|seconds?|s|minutos?|minutes?|min|horas?|hours?|h|dias?|days?|d|semanas?|sem|weeks?|w|m[eê]s(?:es)?|months?|mo|anos?|years?|y)(?:\.|\b|$)/i.exec(
      cleaned
    );
  if (!m) return '';

  const amount = Number(m[1]);
  if (!Number.isFinite(amount) || amount < 0) return '';
  const unit = m[2].toLowerCase();

  const d = new Date(nowMs);
  if (/^(s|segundos?|seconds?)$/.test(unit)) {
    d.setTime(nowMs - amount * 1000);
  } else if (/^(min|minutos?|minutes?)$/.test(unit)) {
    d.setTime(nowMs - amount * 60 * 1000);
  } else if (/^(h|horas?|hours?)$/.test(unit)) {
    d.setTime(nowMs - amount * 3600 * 1000);
  } else if (/^(d|dias?|days?)$/.test(unit)) {
    d.setUTCDate(d.getUTCDate() - amount);
  } else if (/^(sem|semanas?|weeks?|w)$/.test(unit)) {
    d.setUTCDate(d.getUTCDate() - amount * 7);
  } else if (/^(m[eê]s(?:es)?|months?|mo)$/.test(unit)) {
    d.setUTCMonth(d.getUTCMonth() - amount);
  } else if (/^(anos?|years?|y)$/.test(unit)) {
    d.setUTCFullYear(d.getUTCFullYear() - amount);
  }

  return d.toISOString().slice(0, 10);
}

export function formatDurationSeconds(rawSeconds) {
  const secs = Number(rawSeconds);
  if (!Number.isFinite(secs) || secs <= 0) return '';
  const total = Math.round(secs);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function extractVideoId(urlOrId) {
  const raw = String(urlOrId || '').trim();
  if (!raw) return { videoId: '', urlHadShorts: false };
  if (/^[A-Za-z0-9_-]{11}$/.test(raw)) {
    return { videoId: raw, urlHadShorts: false };
  }

  const urlHadShorts = /\/shorts\/[A-Za-z0-9_-]{11}/i.test(raw);
  try {
    const parsed = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
    const vParam = parsed.searchParams.get('v');
    if (vParam && /^[A-Za-z0-9_-]{11}$/.test(vParam)) {
      return { videoId: vParam, urlHadShorts };
    }
    if (parsed.hostname === 'youtu.be' || parsed.hostname.endsWith('.youtu.be')) {
      const seg = parsed.pathname.split('/').filter(Boolean)[0];
      if (seg && /^[A-Za-z0-9_-]{11}$/.test(seg)) {
        return { videoId: seg, urlHadShorts };
      }
    }
    const pathMatch = /\/(?:shorts|embed|live|v)\/([A-Za-z0-9_-]{11})/i.exec(parsed.pathname);
    if (pathMatch) {
      return { videoId: pathMatch[1], urlHadShorts: urlHadShorts || parsed.pathname.toLowerCase().includes('/shorts/') };
    }
  } catch {
    // fallback regex below
  }

  const regexMatch =
    /(?:[?&]v=|youtu\.be\/|\/shorts\/|\/embed\/|\/live\/|\/v\/)([A-Za-z0-9_-]{11})/i.exec(raw);
  if (regexMatch) {
    return { videoId: regexMatch[1], urlHadShorts };
  }
  return { videoId: '', urlHadShorts: false };
}

export function extractPlaylistId(urlOrId) {
  const raw = String(urlOrId || '').trim();
  if (!raw) return '';
  try {
    if (raw.includes('://') || raw.includes('youtube.com') || raw.includes('youtu.be')) {
      const parsed = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
      const list = parsed.searchParams.get('list');
      if (list && /^[A-Za-z0-9_-]{8,}$/.test(list)) return list;
    }
  } catch {
    // fallback regex
  }
  const m = /[?&]list=([A-Za-z0-9_-]{8,})/.exec(raw);
  if (m) return m[1];
  if (/^[A-Za-z0-9_-]{8,}$/.test(raw)) return raw;
  return '';
}

function buildCanonicalVideoUrl(videoId, isShort) {
  return isShort
    ? `https://www.youtube.com/shorts/${videoId}`
    : `https://www.youtube.com/watch?v=${videoId}`;
}

function pickBestThumbnail(sources, videoId) {
  if (Array.isArray(sources) && sources.length > 0) {
    const valid = sources.filter((s) => s && typeof s.url === 'string' && s.url.startsWith('http'));
    if (valid.length > 0) {
      return valid[valid.length - 1].url;
    }
  }
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

function extractDurationFromLockup(node) {
  const overlays = node?.contentImage?.thumbnailViewModel?.overlays;
  if (!Array.isArray(overlays)) return '';
  for (const ov of overlays) {
    const badges = ov?.thumbnailBottomOverlayViewModel?.badges;
    if (!Array.isArray(badges)) continue;
    for (const b of badges) {
      const vm = b?.thumbnailBadgeViewModel;
      if (!vm?.text) continue;
      const t = String(vm.text).trim();
      if (/^\d+(?::\d{2}){1,2}$/.test(t)) return t;
    }
  }
  return '';
}

const RELATIVE_TIME_RE =
  /(?:^|\s)há\s+\d+|\bago\b|transmitido|streamed|estreou|premiered/i;

function parseLockupViewModel(node, { forceShorts = false } = {}) {
  if (!node || typeof node !== 'object') return null;
  if (
    node.contentType === 'LOCKUP_CONTENT_TYPE_PLAYLIST' ||
    node.contentType === 'LOCKUP_CONTENT_TYPE_CHANNEL'
  ) {
    return null;
  }

  const cmd = node.rendererContext?.commandContext?.onTap?.innertubeCommand;
  const webUrl = cmd?.commandMetadata?.webCommandMetadata?.url || '';
  const rawId =
    node.contentId ||
    cmd?.watchEndpoint?.videoId ||
    cmd?.reelWatchEndpoint?.videoId ||
    '';
  if (!/^[A-Za-z0-9_-]{11}$/.test(String(rawId))) return null;

  const isShort = Boolean(
    forceShorts ||
      cmd?.reelWatchEndpoint ||
      String(webUrl).startsWith('/shorts/')
  );

  const lockupMeta = node.metadata?.lockupMetadataViewModel;
  const title =
    extractText(lockupMeta?.title) ||
    extractText(node.title) ||
    String(node.rendererContext?.accessibilityContext?.label || '').trim();

  const rows =
    lockupMeta?.metadata?.contentMetadataViewModel?.metadataRows ||
    node.metadata?.contentMetadataViewModel?.metadataRows ||
    [];

  let viewsText = '';
  let views = 0;
  let publishedText = '';
  let channelName = '';

  for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
    const parts = rows[rowIdx]?.metadataParts || [];
    for (const part of parts) {
      const partText = extractText(part?.text);
      const a11y = String(part?.accessibilityLabel || '').trim();
      const combined = a11y || partText;
      if (!combined) continue;

      const looksLikeViews =
        part?.leadingIcon?.name === 'PLAY_ARROW_OUTLINED' ||
        /visualizaç|view/i.test(combined);
      const looksLikeTime = RELATIVE_TIME_RE.test(combined);

      if (looksLikeViews && !viewsText) {
        viewsText = a11y || partText;
        views = parseViewCount(partText || a11y);
      } else if (looksLikeTime && !publishedText) {
        publishedText = partText || a11y;
      } else if (rowIdx === 0 && rows.length > 1 && !channelName) {
        if (!/^e\s+/i.test(partText)) {
          channelName = partText;
        }
      }
    }
  }

  const duration = extractDurationFromLockup(node);
  const thumbnail = pickBestThumbnail(
    node.contentImage?.thumbnailViewModel?.image?.sources,
    rawId
  );

  return {
    id: rawId,
    videoId: rawId,
    title,
    channelName,
    url: buildCanonicalVideoUrl(rawId, isShort),
    thumbnail,
    duration,
    views,
    viewsText,
    published: parseRelativePublishedDate(publishedText),
    publishedText,
    isShort,
    type: isShort ? 'short' : 'long',
  };
}

function parseShortsLockupViewModel(node) {
  if (!node || typeof node !== 'object') return null;
  const cmd = node.onTap?.innertubeCommand;
  const webUrl = cmd?.commandMetadata?.webCommandMetadata?.url || '';
  const entityMatch = /^shorts-shelf-item-([A-Za-z0-9_-]{11})$/.exec(
    String(node.entityId || '')
  );
  const rawId =
    cmd?.reelWatchEndpoint?.videoId ||
    entityMatch?.[1] ||
    extractVideoId(webUrl).videoId ||
    '';
  if (!/^[A-Za-z0-9_-]{11}$/.test(rawId)) return null;

  const primaryTitle = extractText(node.overlayMetadata?.primaryText);
  const secondaryViews = extractText(node.overlayMetadata?.secondaryText);

  let title = primaryTitle;
  let viewsText = secondaryViews;

  if ((!title || !viewsText) && typeof node.accessibilityText === 'string') {
    const a11y = node.accessibilityText.replace(/\s*-\s*ver o Shorts.*$/i, '').trim();
    const m = /^(.*?),\s*([\d.,]+\s*(?:mil|mi|bi|[kmb])?\s*(?:visualizaç(?:ão|ões)|views?)|sem visualizações|no views)$/i.exec(a11y);
    if (m) {
      if (!title) title = m[1].trim();
      if (!viewsText) viewsText = m[2].trim();
    } else if (!title) {
      title = a11y;
    }
  }

  const thumbSources =
    node.thumbnailViewModel?.thumbnailViewModel?.image?.sources ||
    cmd?.reelWatchEndpoint?.thumbnail?.thumbnails;

  return {
    id: rawId,
    videoId: rawId,
    title,
    channelName: '',
    url: buildCanonicalVideoUrl(rawId, true),
    thumbnail: pickBestThumbnail(thumbSources, rawId),
    duration: '',
    views: parseViewCount(viewsText),
    viewsText,
    published: '',
    publishedText: '',
    isShort: true,
    type: 'short',
  };
}

function parseVideoRenderer(node, { forceShorts = false } = {}) {
  if (!node || typeof node !== 'object') return null;
  const rawId = String(node.videoId || '');
  if (!/^[A-Za-z0-9_-]{11}$/.test(rawId)) return null;

  const navUrl =
    node.navigationEndpoint?.commandMetadata?.webCommandMetadata?.url || '';
  const isShort = Boolean(
    forceShorts ||
      node.navigationEndpoint?.reelWatchEndpoint ||
      String(navUrl).includes('/shorts/') ||
      (Array.isArray(node.thumbnailOverlays) &&
        node.thumbnailOverlays.some(
          (o) => o?.thumbnailOverlayTimeStatusRenderer?.style === 'SHORTS'
        ))
  );

  const title = extractText(node.title);
  const channelName =
    extractText(node.shortBylineText) ||
    extractText(node.ownerText) ||
    extractText(node.longBylineText);

  let viewsText =
    extractText(node.viewCountText) || extractText(node.shortViewCountText);
  let publishedText = extractText(node.publishedTimeText);

  if (node.videoInfo && Array.isArray(node.videoInfo.runs)) {
    const infoParts = node.videoInfo.runs
      .map((r) => String(r?.text || '').trim())
      .filter((t) => t && t !== '•');
    for (const part of infoParts) {
      if (!viewsText && (/^\d[\d.,]*(\s*(mil|mi|bi|[kmb]))?$/i.test(part) || /visualizaç|view/i.test(part))) {
        viewsText = /visualizaç|view/i.test(part) ? part : `${part} visualizações`;
      } else if (!publishedText && RELATIVE_TIME_RE.test(part)) {
        publishedText = part;
      }
    }
  }

  let duration = extractText(node.lengthText);
  if (!duration && Array.isArray(node.thumbnailOverlays)) {
    for (const ov of node.thumbnailOverlays) {
      const t = extractText(ov?.thumbnailOverlayTimeStatusRenderer?.text);
      if (/^\d+(?::\d{2}){1,2}$/.test(t)) {
        duration = t;
        break;
      }
    }
  }
  if (!duration && node.lengthSeconds) {
    duration = formatDurationSeconds(node.lengthSeconds);
  }

  return {
    id: rawId,
    videoId: rawId,
    title,
    channelName,
    url: buildCanonicalVideoUrl(rawId, isShort),
    thumbnail: pickBestThumbnail(node.thumbnail?.thumbnails, rawId),
    duration,
    views: parseViewCount(viewsText),
    viewsText,
    published: parseRelativePublishedDate(publishedText),
    publishedText,
    isShort,
    type: isShort ? 'short' : 'long',
  };
}

function parseReelItemRenderer(node) {
  if (!node || typeof node !== 'object') return null;
  const rawId = String(node.videoId || '');
  if (!/^[A-Za-z0-9_-]{11}$/.test(rawId)) return null;
  const viewsText = extractText(node.viewCountText);
  return {
    id: rawId,
    videoId: rawId,
    title: extractText(node.headline),
    channelName: '',
    url: buildCanonicalVideoUrl(rawId, true),
    thumbnail: pickBestThumbnail(node.thumbnail?.thumbnails, rawId),
    duration: '',
    views: parseViewCount(viewsText),
    viewsText,
    published: '',
    publishedText: '',
    isShort: true,
    type: 'short',
  };
}

const IGNORED_CONT_KEYS = new Set([
  'header',
  'topbar',
  'engagementPanels',
  'showEngagementPanelEndpoint',
  'chipBarViewModel',
  'chipCloudRenderer',
  'feedFilterChipBarRenderer',
  'microformat',
  'frameworkUpdates',
]);

function extractVideosAndContinuation(root, { forceShorts = false, allowPlaylistRenderer = false } = {}) {
  const videos = [];
  let continuationToken = null;
  const visited = new WeakSet();

  function walk(node, depth, insideIgnoredForContinuation) {
    if (!node || typeof node !== 'object' || depth > 40) return;
    if (visited.has(node)) return;
    visited.add(node);

    if (Array.isArray(node)) {
      for (const item of node) {
        walk(item, depth + 1, insideIgnoredForContinuation);
      }
      return;
    }

    if (node.lockupViewModel) {
      const v = parseLockupViewModel(node.lockupViewModel, { forceShorts });
      if (v) videos.push(v);
    }
    if (node.shortsLockupViewModel) {
      const v = parseShortsLockupViewModel(node.shortsLockupViewModel);
      if (v) videos.push(v);
    }
    if (node.videoRenderer) {
      const v = parseVideoRenderer(node.videoRenderer, { forceShorts });
      if (v) videos.push(v);
    }
    if (node.gridVideoRenderer) {
      const v = parseVideoRenderer(node.gridVideoRenderer, { forceShorts });
      if (v) videos.push(v);
    }
    if (allowPlaylistRenderer && node.playlistVideoRenderer) {
      const v = parseVideoRenderer(node.playlistVideoRenderer, { forceShorts });
      if (v) videos.push(v);
    }
    if (node.reelItemRenderer) {
      const v = parseReelItemRenderer(node.reelItemRenderer);
      if (v) videos.push(v);
    }
    if (
      !insideIgnoredForContinuation &&
      !continuationToken &&
      node.continuationItemRenderer
    ) {
      const token =
        node.continuationItemRenderer?.continuationEndpoint?.continuationCommand
          ?.token ||
        node.continuationItemRenderer?.button?.buttonRenderer?.command
          ?.continuationCommand?.token;
      if (token) continuationToken = token;
    }

    for (const key of Object.keys(node)) {
      if (key === 'lockupViewModel' || key === 'shortsLockupViewModel' || key === 'videoRenderer' || key === 'gridVideoRenderer' || key === 'reelItemRenderer') {
        continue;
      }
      if (allowPlaylistRenderer && key === 'playlistVideoRenderer') continue;
      const nextIgnored = insideIgnoredForContinuation || IGNORED_CONT_KEYS.has(key);
      if (IGNORED_CONT_KEYS.has(key) && (key === 'header' || key === 'topbar' || key === 'engagementPanels' || key === 'showEngagementPanelEndpoint')) {
        continue;
      }
      walk(node[key], depth + 1, nextIgnored);
    }
  }

  walk(root, 0, false);
  return { videos, continuationToken };
}

function getSelectedTabRoot(ytInitialData) {
  const tabs = ytInitialData?.contents?.twoColumnBrowseResultsRenderer?.tabs;
  if (Array.isArray(tabs) && tabs.length > 0) {
    const selected = tabs.find((t) => t?.tabRenderer?.selected);
    if (selected?.tabRenderer?.content) {
      return {
        root: selected.tabRenderer.content,
        selectedTabUrl:
          selected.tabRenderer.endpoint?.commandMetadata?.webCommandMetadata
            ?.url || '',
        selectedTabTitle: extractText(selected.tabRenderer.title),
      };
    }
  }
  return {
    root: ytInitialData?.contents || ytInitialData,
    selectedTabUrl: '',
    selectedTabTitle: '',
  };
}

async function fetchText(url, options = {}) {
  const res = await fetch(url, {
    headers: { ...DESKTOP_HEADERS, ...(options.headers || {}) },
    signal: AbortSignal.timeout(options.timeoutMs || DEFAULT_TIMEOUT_MS),
    method: options.method || 'GET',
    body: options.body,
  });
  return res;
}

async function fetchContinuationPage({ apiKey, clientVersion, continuation }) {
  const endpoint = `https://www.youtube.com/youtubei/v1/browse?key=${encodeURIComponent(apiKey)}`;
  const res = await fetchText(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      context: {
        client: {
          clientName: 'WEB',
          clientVersion: clientVersion || DEFAULT_CLIENT_VERSION,
          hl: 'pt',
          gl: 'BR',
        },
      },
      continuation,
    }),
  });
  if (!res.ok) {
    throw new Error(`YouTube browse HTTP ${res.status}`);
  }
  return res.json();
}

async function fetchChannelRssEntries(channelId) {
  if (!channelId || /^UCX+$|^UCY+$/i.test(channelId)) return [];
  const feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`;
  const res = await fetch(feedUrl, {
    headers: { 'User-Agent': 'Crom-YouTube-Studio-Sync/4.0' },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) {
    throw new Error(`RSS HTTP ${res.status}`);
  }
  const xml = await res.text();
  const entryMatches = xml.match(/<entry>[\s\S]*?<\/entry>/g) || [];
  const items = [];
  for (const entryXml of entryMatches) {
    const videoId = (/<yt:videoId>([^<]+)<\/yt:videoId>/.exec(entryXml) || [])[1];
    if (!videoId) continue;
    const rawTitle = (/<title>([^<]+)<\/title>/.exec(entryXml) || [])[1] || '';
    const title = decodeXmlEntities(rawTitle);
    const published = (
      (/<published>([^<]+)<\/published>/.exec(entryXml) || [])[1] || ''
    ).slice(0, 10);
    const viewsRaw = (/<media:statistics\s+views="(\d+)"/.exec(entryXml) || [])[1];
    const views = viewsRaw !== undefined ? Number(viewsRaw) : 0;
    const href =
      (/<link\s+rel="alternate"\s+href="([^"]+)"/.exec(entryXml) || [])[1] ||
      `https://www.youtube.com/watch?v=${videoId}`;
    const isShort = href.includes('/shorts/');
    items.push({
      id: videoId,
      videoId,
      title,
      channelName: '',
      url: buildCanonicalVideoUrl(videoId, isShort),
      thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      duration: '',
      views,
      viewsText: views > 0 ? `${views.toLocaleString('pt-BR')} visualizações` : '',
      published,
      publishedText: '',
      isShort,
      type: isShort ? 'short' : 'long',
      _fromRss: true,
    });
  }
  return items;
}

async function scrapeTabPages({ urls, expectShorts = false, maxPages = 20 }) {
  let html = '';
  let context = null;

  for (const url of urls) {
    try {
      const res = await fetchText(url);
      if (!res.ok) continue;
      const body = await res.text();
      const ctx = extractPageContext(body);
      if (ctx.ytInitialData) {
        html = body;
        context = ctx;
        break;
      }
    } catch {
      // try fallback URL
    }
  }

  if (!context || !context.ytInitialData) {
    return { ok: false, videos: [] };
  }

  const { root, selectedTabUrl, selectedTabTitle } = getSelectedTabRoot(
    context.ytInitialData
  );

  // If we asked for /shorts but YouTube redirected to /featured or /videos (channel has no Shorts tab), skip!
  if (
    expectShorts &&
    selectedTabUrl &&
    !selectedTabUrl.toLowerCase().includes('/shorts') &&
    !selectedTabTitle.toLowerCase().includes('short')
  ) {
    return { ok: true, videos: [] };
  }

  const collected = [];
  const seenTokens = new Set();
  const initial = extractVideosAndContinuation(root, { forceShorts: expectShorts });
  collected.push(...initial.videos);

  let nextToken = initial.continuationToken;
  let pages = 1;

  while (
    nextToken &&
    pages < maxPages &&
    context.apiKey &&
    !seenTokens.has(nextToken)
  ) {
    seenTokens.add(nextToken);
    pages += 1;
    try {
      const browseJson = await fetchContinuationPage({
        apiKey: context.apiKey,
        clientVersion: context.clientVersion,
        continuation: nextToken,
      });
      const actionRoot = browseJson.onResponseReceivedActions || browseJson;
      const page = extractVideosAndContinuation(actionRoot, {
        forceShorts: expectShorts,
      });
      collected.push(...page.videos);
      nextToken = page.continuationToken;
    } catch {
      break;
    }
  }

  return { ok: true, videos: collected, pages };
}

function mergeVideoEntries(existing, incoming) {
  const isShort = Boolean(existing.isShort || incoming.isShort);
  const videoId = existing.videoId || incoming.videoId;
  const fromRss = Boolean(incoming._fromRss);
  const existingFromRss = Boolean(existing._fromRss);

  const published = fromRss && incoming.published
    ? incoming.published
    : existingFromRss && existing.published
    ? existing.published
    : existing.published || incoming.published || '';

  const views = fromRss
    ? incoming.views
    : existingFromRss
    ? existing.views
    : Math.max(Number(existing.views || 0), Number(incoming.views || 0));

  return {
    id: videoId,
    videoId,
    title: (fromRss && incoming.title) || existing.title || incoming.title || '',
    channelName: existing.channelName || incoming.channelName || '',
    url: buildCanonicalVideoUrl(videoId, isShort),
    thumbnail: existing.thumbnail || incoming.thumbnail || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    duration: existing.duration || incoming.duration || '',
    views,
    viewsText: existing.viewsText || incoming.viewsText || (views > 0 ? `${views.toLocaleString('pt-BR')} visualizações` : ''),
    published,
    publishedText: existing.publishedText || incoming.publishedText || '',
    isShort,
    type: isShort ? 'short' : 'long',
    _fromRss: existingFromRss || fromRss,
  };
}

function finalizeVideoRecord(v) {
  const isShort = Boolean(v.isShort);
  return {
    id: v.videoId,
    videoId: v.videoId,
    title: String(v.title || ''),
    url: buildCanonicalVideoUrl(v.videoId, isShort),
    thumbnail: v.thumbnail || `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`,
    duration: String(v.duration || ''),
    views: Number(v.views || 0),
    viewsText: String(v.viewsText || ''),
    published: String(v.published || ''),
    publishedText: String(v.publishedText || ''),
    isShort,
    type: isShort ? 'short' : 'long',
  };
}

export async function fetchChannelAllVideos({
  handle = '',
  channelId = '',
  maxPages = 20,
} = {}) {
  const cleanHandle = String(handle || '').trim().replace(/^@+/, '');
  const cleanChannelId = String(channelId || '').trim();

  if (!cleanHandle && !cleanChannelId) {
    throw new Error('Handle ou channelId obrigatório para buscar vídeos do canal.');
  }

  const videoUrls = [];
  const shortsUrls = [];
  if (cleanHandle) {
    videoUrls.push(`https://www.youtube.com/@${encodeURIComponent(cleanHandle)}/videos`);
    shortsUrls.push(`https://www.youtube.com/@${encodeURIComponent(cleanHandle)}/shorts`);
  }
  if (cleanChannelId) {
    videoUrls.push(`https://www.youtube.com/channel/${encodeURIComponent(cleanChannelId)}/videos`);
    shortsUrls.push(`https://www.youtube.com/channel/${encodeURIComponent(cleanChannelId)}/shorts`);
  }

  const [longsRes, shortsRes, rssRes] = await Promise.allSettled([
    scrapeTabPages({ urls: videoUrls, expectShorts: false, maxPages }),
    scrapeTabPages({ urls: shortsUrls, expectShorts: true, maxPages }),
    fetchChannelRssEntries(cleanChannelId),
  ]);

  const longsData =
    longsRes.status === 'fulfilled' ? longsRes.value : { ok: false, videos: [] };
  const shortsData =
    shortsRes.status === 'fulfilled' ? shortsRes.value : { ok: false, videos: [] };
  const rssEntries =
    rssRes.status === 'fulfilled' ? rssRes.value : [];

  const htmlSucceeded =
    (longsData.ok && longsData.videos.length > 0) ||
    (shortsData.ok && shortsData.videos.length > 0);

  if (!htmlSucceeded && rssEntries.length === 0) {
    const errMsg =
      rssRes.status === 'rejected'
        ? rssRes.reason?.message
        : 'Falha ao acessar YouTube HTML e RSS';
    throw new Error(errMsg || 'Falha ao buscar vídeos do canal');
  }

  const byId = new Map();

  // Insert RSS entries first if HTML failed, or merge RSS on top of HTML
  if (htmlSucceeded) {
    for (const v of longsData.videos) {
      const prev = byId.get(v.videoId);
      byId.set(v.videoId, prev ? mergeVideoEntries(prev, v) : { ...v });
    }
    for (const v of shortsData.videos) {
      const prev = byId.get(v.videoId);
      byId.set(v.videoId, prev ? mergeVideoEntries(prev, v) : { ...v });
    }
    for (const v of rssEntries) {
      const prev = byId.get(v.videoId);
      byId.set(v.videoId, prev ? mergeVideoEntries(prev, v) : { ...v });
    }
  } else {
    for (const v of rssEntries) {
      const prev = byId.get(v.videoId);
      byId.set(v.videoId, prev ? mergeVideoEntries(prev, v) : { ...v });
    }
  }

  const videos = Array.from(byId.values()).map(finalizeVideoRecord);

  // Keep dated items newest-first while preserving relative discovery order for undated Shorts
  videos.sort((a, b) => {
    if (a.published && b.published) {
      return b.published.localeCompare(a.published);
    }
    if (a.published && !b.published) return -1;
    if (!a.published && b.published) return 1;
    return 0;
  });

  const totalVideos = videos.length;
  const totalShorts = videos.filter((v) => v.isShort).length;
  const totalLongs = totalVideos - totalShorts;
  const totalViews = videos.reduce((acc, v) => acc + Number(v.views || 0), 0);
  const source = htmlSucceeded
    ? rssEntries.length > 0
      ? 'youtube-html+rss'
      : 'youtube-html'
    : 'rss-fallback';

  return {
    videos,
    totalVideos,
    totalLongs,
    totalShorts,
    totalViews,
    source,
  };
}

export async function fetchYouTubePlaylist(urlOrId, { maxPages = 20 } = {}) {
  const playlistId = extractPlaylistId(urlOrId);
  if (!playlistId) {
    throw Object.assign(new Error('URL ou ID de playlist do YouTube inválido'), {
      statusCode: 400,
    });
  }

  const sourceUrl = `https://www.youtube.com/playlist?list=${encodeURIComponent(playlistId)}`;
  const res = await fetchText(sourceUrl);
  if (!res.ok) {
    throw Object.assign(
      new Error(`Não foi possível carregar playlist (HTTP ${res.status})`),
      { statusCode: res.status === 404 ? 404 : 502 }
    );
  }
  const html = await res.text();
  const context = extractPageContext(html);
  if (!context.ytInitialData) {
    throw Object.assign(new Error('Estrutura da playlist não encontrada no HTML'), {
      statusCode: 502,
    });
  }

  const ytData = context.ytInitialData;
  const title =
    ytData?.metadata?.playlistMetadataRenderer?.title ||
    extractText(ytData?.header?.playlistHeaderRenderer?.title) ||
    extractText(
      ytData?.header?.pageHeaderRenderer?.content?.pageHeaderViewModel?.title
        ?.dynamicTextViewModel?.text
    ) ||
    ytData?.header?.pageHeaderRenderer?.pageTitle ||
    `Playlist ${playlistId}`;

  const rawChannelTitle =
    extractText(ytData?.header?.playlistHeaderRenderer?.ownerText) ||
    ytData?.header?.pageHeaderRenderer?.content?.pageHeaderViewModel?.metadata
      ?.contentMetadataViewModel?.metadataRows?.[0]?.metadataParts?.[0]
      ?.avatarStack?.avatarStackViewModel?.text?.content ||
    extractText(
      ytData?.sidebar?.playlistSidebarRenderer?.items?.[1]
        ?.playlistSidebarSecondaryInfoRenderer?.videoOwner?.videoOwnerRenderer
        ?.title
    ) ||
    '';
  const channelTitle = String(rawChannelTitle).replace(/^por\s+/i, '').trim();

  const { root } = getSelectedTabRoot(ytData);
  const collected = [];
  const seenTokens = new Set();

  const initial = extractVideosAndContinuation(root, {
    allowPlaylistRenderer: true,
  });
  collected.push(...initial.videos);

  let nextToken = initial.continuationToken;
  let pages = 1;
  while (
    nextToken &&
    pages < maxPages &&
    context.apiKey &&
    !seenTokens.has(nextToken)
  ) {
    seenTokens.add(nextToken);
    pages += 1;
    try {
      const browseJson = await fetchContinuationPage({
        apiKey: context.apiKey,
        clientVersion: context.clientVersion,
        continuation: nextToken,
      });
      const actionRoot = browseJson.onResponseReceivedActions || browseJson;
      const page = extractVideosAndContinuation(actionRoot, {
        allowPlaylistRenderer: true,
      });
      collected.push(...page.videos);
      nextToken = page.continuationToken;
    } catch {
      break;
    }
  }

  const byId = new Map();
  for (const item of collected) {
    const prev = byId.get(item.videoId);
    byId.set(item.videoId, prev ? mergeVideoEntries(prev, item) : { ...item });
  }

  const videos = Array.from(byId.values()).map((v) => ({
    ...finalizeVideoRecord(v),
    channelName: v.channelName || channelTitle || '',
  }));

  return {
    playlistId,
    title: String(title || '').trim(),
    channelTitle,
    sourceUrl,
    videos,
  };
}

export async function fetchYouTubeVideoMeta(urlOrId) {
  const { videoId, urlHadShorts } = extractVideoId(urlOrId);
  if (!videoId) {
    throw Object.assign(new Error('URL ou ID de vídeo do YouTube inválido'), {
      statusCode: 400,
    });
  }

  const probeUrl = buildCanonicalVideoUrl(videoId, urlHadShorts);
  const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(probeUrl)}&format=json`;
  const watchUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;

  const [oembedRes, watchRes] = await Promise.allSettled([
    fetchText(oembedUrl, { timeoutMs: 8000 }).then(async (r) =>
      r.ok ? r.json() : null
    ),
    fetchText(watchUrl, { timeoutMs: 12000 }).then(async (r) =>
      r.ok ? r.text() : ''
    ),
  ]);

  const oembed = oembedRes.status === 'fulfilled' ? oembedRes.value : null;
  const watchHtml = watchRes.status === 'fulfilled' ? watchRes.value : '';

  let title = oembed?.title ? String(oembed.title).trim() : '';
  let channelName = oembed?.author_name ? String(oembed.author_name).trim() : '';
  let thumbnail = oembed?.thumbnail_url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
  let duration = '';
  let views = 0;
  let viewsText = '';
  let isShort = Boolean(
    urlHadShorts ||
      (oembed && Number(oembed.height) > Number(oembed.width))
  );

  if (watchHtml) {
    const ctx = extractPageContext(watchHtml);
    const pr = ctx.ytInitialPlayerResponse;
    const vd = pr?.videoDetails;
    const mf = pr?.microformat?.playerMicroformatRenderer;

    if (vd) {
      if (!title && vd.title) title = String(vd.title).trim();
      if (!channelName && vd.author) channelName = String(vd.author).trim();
      if (vd.lengthSeconds) duration = formatDurationSeconds(vd.lengthSeconds);
      if (vd.viewCount !== undefined && vd.viewCount !== null) {
        views = Math.max(0, Number(vd.viewCount) || 0);
        if (views > 0) viewsText = `${views.toLocaleString('pt-BR')} visualizações`;
      }
      const thumbs = vd.thumbnail?.thumbnails;
      if (Array.isArray(thumbs) && thumbs.length > 0 && !oembed?.thumbnail_url) {
        thumbnail = pickBestThumbnail(thumbs, videoId);
      }
    }

    if (mf?.isShortsEligible) {
      isShort = true;
    }

    if (!title) {
      const titleTag = /<title>([^<]+)<\/title>/i.exec(watchHtml)?.[1] || '';
      const cleanedTitle = decodeXmlEntities(titleTag)
        .replace(/\s*-\s*YouTube\s*$/i, '')
        .trim();
      if (cleanedTitle && cleanedTitle.toLowerCase() !== 'youtube') {
        title = cleanedTitle;
      }
    }
  }

  if (!oembed && !watchHtml) {
    throw Object.assign(
      new Error(`Não foi possível obter metadados do vídeo ${videoId}`),
      { statusCode: 502 }
    );
  }

  return {
    id: videoId,
    videoId,
    title: title || `Vídeo ${videoId}`,
    channelName,
    url: buildCanonicalVideoUrl(videoId, isShort),
    thumbnail,
    duration,
    views,
    viewsText,
    isShort,
  };
}
