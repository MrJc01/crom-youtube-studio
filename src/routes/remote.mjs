import { getEditableConfig } from '../config.mjs';
import { readJsonBody, sendJson } from './http-utils.mjs';

export async function handleRemoteRoutes({
  req,
  res,
  pathname,
  method,
  config,
  watchHub,
  remoteManager,
}) {
  if (method === 'GET' && pathname === '/api/remote/status') {
    const status = await remoteManager.getStatus();
    return sendJson(res, 200, status);
  }

  if (method === 'POST' && pathname === '/api/remote/lan') {
    const body = await readJsonBody(req).catch(() => ({}));
    const current = await remoteManager.getStatus();
    const nextEnabled = body.enabled !== undefined ? Boolean(body.enabled) : !current.lanEnabled;
    watchHub.markApiWrite();
    const status = await remoteManager.setLanEnabled(nextEnabled);
    return sendJson(res, 200, { ...status, config: getEditableConfig(config) });
  }

  if (method === 'POST' && pathname === '/api/remote/ngrok/start') {
    const body = await readJsonBody(req).catch(() => ({}));
    watchHub.markApiWrite();
    const status = await remoteManager.startNgrok(config.port, body.authtoken);
    return sendJson(res, 200, { ...status, config: getEditableConfig(config) });
  }

  if (method === 'POST' && pathname === '/api/remote/ngrok/stop') {
    const status = await remoteManager.stopNgrok();
    return sendJson(res, 200, { ...status, config: getEditableConfig(config) });
  }

  if (method === 'PUT' && pathname === '/api/remote/pin') {
    const body = await readJsonBody(req);
    watchHub.markApiWrite();
    const status = await remoteManager.updatePin({
      pinEnabled: body.pinEnabled ?? body.enabled,
      pinCode: body.pinCode ?? body.pin,
      clearPin: Boolean(body.clearPin),
    });
    return sendJson(res, 200, { ...status, config: getEditableConfig(config) });
  }

  if (method === 'POST' && pathname === '/api/remote/unlock') {
    const body = await readJsonBody(req).catch(() => ({}));
    const pinGateActive = Boolean(config.remote?.pinEnabled && config.remote?.pinCode);
    if (!pinGateActive) {
      return sendJson(res, 200, { ok: true, unlocked: true });
    }

    const result = await remoteManager.validatePinSubmission(body.pin ?? body.pinCode, req);
    if (result && typeof result === 'object') {
      if (result.statusCode === 429) {
        const retryAfterSec = Math.max(1, Number(result.retryAfterSec ?? result.retryAfter ?? 300));
        return sendJson(
          res,
          429,
          {
            ok: false,
            error: result.error || 'Muitas tentativas de PIN incorretas. Aguarde antes de tentar novamente.',
            retryAfterSec,
          },
          { 'Retry-After': String(retryAfterSec) }
        );
      }
      if (!result.ok) {
        return sendJson(res, result.statusCode || 401, {
          ok: false,
          error: result.error || 'PIN incorreto.',
          ...(result.remainingAttempts !== undefined ? { remainingAttempts: result.remainingAttempts } : {}),
        });
      }
    } else if (!result) {
      return sendJson(res, 401, { ok: false, error: 'PIN incorreto.' });
    }

    remoteManager.setPinAuthCookie(req, res);
    return sendJson(res, 200, { ok: true, unlocked: true });
  }

  return false;
}
