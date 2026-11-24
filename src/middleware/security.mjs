const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function httpError(message, statusCode) {
  return Object.assign(new Error(message), { statusCode });
}

function normalizeHostEntry(raw) {
  const clean = String(raw || '').trim().toLowerCase();
  if (!clean) return { host: '', hostname: '' };
  if (clean.includes('://')) {
    try {
      const u = new URL(clean);
      return {
        host: u.host.toLowerCase(),
        hostname: u.hostname.toLowerCase().replace(/^\[|\]$/g, ''),
      };
    } catch {
      return { host: clean, hostname: clean };
    }
  }
  const hostname = clean.replace(/^\[([^\]]+)\](?::\d+)?$/, '$1').replace(/:\d+$/, '');
  return { host: clean, hostname };
}

function isLocalhostHostname(hostname) {
  return hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '::1';
}

function isNgrokHostname(hostname) {
  return (
    hostname.endsWith('.ngrok-free.app') ||
    hostname.endsWith('.ngrok.io') ||
    hostname.endsWith('.ngrok-free.dev')
  );
}

/**
 * Verifies same-origin / allowed-host policy on mutating HTTP requests (CSRF protection).
 * Requests without an Origin header (CLI/curl) are allowed unless Sec-Fetch-Site is 'cross-site'.
 */
export function verifySameOriginMutation(req, { allowedHosts = [] } = {}) {
  const method = String(req?.method || 'GET').toUpperCase();
  if (!MUTATION_METHODS.has(method)) {
    return true;
  }

  const headers = req?.headers || {};
  const secFetchSite = String(headers['sec-fetch-site'] || '').trim().toLowerCase();
  if (secFetchSite === 'cross-site') {
    throw httpError('Requisição cross-site bloqueada (CSRF).', 403);
  }

  const originHeader = headers.origin;
  if (originHeader === undefined) {
    return true;
  }

  const rawOrigin = String(originHeader).trim();
  if (!rawOrigin) {
    return true;
  }
  if (rawOrigin.toLowerCase() === 'null') {
    throw httpError('Origem nula bloqueada em mutação (CSRF).', 403);
  }

  let originUrl;
  try {
    originUrl = new URL(rawOrigin);
  } catch {
    throw httpError('Header Origin inválido (CSRF).', 403);
  }

  const originHost = originUrl.host.toLowerCase();
  const originHostname = originUrl.hostname.toLowerCase().replace(/^\[|\]$/g, '');

  if (isLocalhostHostname(originHostname) || isNgrokHostname(originHostname)) {
    return true;
  }

  const reqHost = String(headers.host || '').trim().toLowerCase();
  if (reqHost && originHost === reqHost) {
    return true;
  }

  const forwardedRaw = String(headers['x-forwarded-host'] || '');
  if (forwardedRaw) {
    const forwardedHosts = forwardedRaw
      .split(',')
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean);
    if (forwardedHosts.includes(originHost)) {
      return true;
    }
  }

  if (Array.isArray(allowedHosts) && allowedHosts.length > 0) {
    for (const rawAllowed of allowedHosts) {
      const norm = normalizeHostEntry(rawAllowed);
      if (!norm.host && !norm.hostname) continue;
      if (originHost === norm.host || originHostname === norm.hostname) {
        return true;
      }
    }
  }

  throw httpError(`Origem não autorizada para mutação (CSRF): ${originHost}`, 403);
}

function normalizeClientIp(ip) {
  const raw = String(ip || 'unknown').trim();
  if (!raw) return 'unknown';
  return raw.replace(/^::ffff:/i, '');
}

/**
 * In-memory per-IP PIN attempt rate limiter with sliding window and lockout.
 */
export function createPinRateLimiter({
  maxAttempts = 5,
  windowMs = 5 * 60_000,
  lockoutMs = 5 * 60_000,
} = {}) {
  const records = new Map();

  function pruneRecord(rec, now) {
    if (rec.lockedUntil > 0 && now >= rec.lockedUntil) {
      rec.lockedUntil = 0;
      rec.attempts = [];
      return;
    }
    const cutoff = now - windowMs;
    if (rec.attempts.length > 0) {
      rec.attempts = rec.attempts.filter((ts) => ts > cutoff);
    }
  }

  function check(ip) {
    const key = normalizeClientIp(ip);
    const rec = records.get(key);
    if (!rec) {
      return { allowed: true, retryAfterSec: 0, remainingAttempts: maxAttempts };
    }
    const now = Date.now();
    pruneRecord(rec, now);

    if (rec.lockedUntil > now) {
      const retryAfterSec = Math.max(1, Math.ceil((rec.lockedUntil - now) / 1000));
      return { allowed: false, retryAfterSec, remainingAttempts: 0 };
    }

    if (rec.attempts.length === 0) {
      records.delete(key);
      return { allowed: true, retryAfterSec: 0, remainingAttempts: maxAttempts };
    }

    return {
      allowed: true,
      retryAfterSec: 0,
      remainingAttempts: Math.max(0, maxAttempts - rec.attempts.length),
    };
  }

  function recordFailure(ip) {
    const key = normalizeClientIp(ip);
    const now = Date.now();
    let rec = records.get(key);
    if (!rec) {
      rec = { attempts: [], lockedUntil: 0 };
      records.set(key, rec);
    }
    pruneRecord(rec, now);

    if (rec.lockedUntil > now) {
      const retryAfterSec = Math.max(1, Math.ceil((rec.lockedUntil - now) / 1000));
      return {
        allowed: false,
        attempts: rec.attempts.length,
        retryAfterSec,
        remainingAttempts: 0,
      };
    }

    rec.attempts.push(now);
    if (rec.attempts.length >= maxAttempts) {
      rec.lockedUntil = now + lockoutMs;
      const retryAfterSec = Math.max(1, Math.ceil(lockoutMs / 1000));
      return {
        allowed: false,
        attempts: rec.attempts.length,
        retryAfterSec,
        remainingAttempts: 0,
      };
    }

    return {
      allowed: true,
      attempts: rec.attempts.length,
      retryAfterSec: 0,
      remainingAttempts: Math.max(0, maxAttempts - rec.attempts.length),
    };
  }

  function reset(ip) {
    records.delete(normalizeClientIp(ip));
  }

  function clearAll() {
    records.clear();
  }

  return {
    check,
    recordFailure,
    reset,
    clearAll,
  };
}
