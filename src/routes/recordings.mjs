import {
  convertTrackToMp4,
  createRecordingTake,
  deleteRecording,
  listRecordings,
  saveRecordingTrack,
  streamRecordingMedia,
} from '../recordings.mjs';
import { readJsonBody, resolveChannel, sendJson } from './http-utils.mjs';

export async function handleRecordingsRoutes({
  req,
  res,
  urlObj,
  pathname,
  method,
  config,
  stateCache,
  watchHub,
}) {
  if (method === 'GET' && pathname === '/api/recordings') {
    const rawChannel = urlObj.searchParams.get('channel') || config.defaultChannel;
    const { key, workspaceReal } = resolveChannel(config, rawChannel);
    const recordings = await listRecordings(workspaceReal);
    return sendJson(res, 200, { ok: true, channel: key, ...recordings });
  }

  if (method === 'POST' && pathname === '/api/recordings/session') {
    const body = await readJsonBody(req);
    const rawChannel = body.channel || urlObj.searchParams.get('channel') || config.defaultChannel;
    const { key, workspaceReal } = resolveChannel(config, rawChannel);
    watchHub.markApiWrite();
    const result = await createRecordingTake(workspaceReal, body);
    const state = stateCache.refreshChannel(key, { flushDisk: true });
    watchHub.broadcast({
      type: 'change',
      source: 'api',
      reason: 'recording-session',
      channel: key,
      ts: Date.now(),
    });
    return sendJson(res, 201, { ok: true, channel: key, ...result, state });
  }

  if (method === 'POST' && pathname === '/api/recordings/track') {
    const rawChannel =
      urlObj.searchParams.get('channel') ||
      req.headers['x-channel'] ||
      config.defaultChannel;
    const { key, workspaceReal } = resolveChannel(config, rawChannel);
    const sessionId = urlObj.searchParams.get('sessionId') || req.headers['x-session-id'];
    const takeId = urlObj.searchParams.get('takeId') || req.headers['x-take-id'];
    const kind = urlObj.searchParams.get('kind') || req.headers['x-kind'];
    const ext = urlObj.searchParams.get('ext') || req.headers['x-ext'] || 'webm';

    watchHub.markApiWrite(3000);
    const result = await saveRecordingTrack(workspaceReal, {
      sessionId,
      takeId,
      kind,
      ext,
      req,
    });
    const state = stateCache.refreshChannel(key, { flushDisk: true });
    watchHub.broadcast({
      type: 'change',
      source: 'api',
      reason: 'recording-track',
      channel: key,
      sessionId,
      takeId,
      ts: Date.now(),
    });
    return sendJson(res, 201, { ok: true, channel: key, ...result, state });
  }

  if (method === 'POST' && pathname === '/api/recordings/convert-mp4') {
    const body = await readJsonBody(req);
    const rawChannel = body.channel || urlObj.searchParams.get('channel') || config.defaultChannel;
    const { key, workspaceReal } = resolveChannel(config, rawChannel);
    watchHub.markApiWrite(3000);
    const result = await convertTrackToMp4(workspaceReal, body);
    const state = stateCache.refreshChannel(key, { flushDisk: true });
    watchHub.broadcast({
      type: 'change',
      source: 'api',
      reason: 'recording-convert-mp4',
      channel: key,
      ts: Date.now(),
    });
    return sendJson(res, 200, { ok: true, channel: key, ...result, state });
  }

  if ((method === 'GET' || method === 'HEAD') && pathname === '/api/recordings/media') {
    const rawChannel = urlObj.searchParams.get('channel') || config.defaultChannel;
    const relPath = urlObj.searchParams.get('path') || urlObj.searchParams.get('relPath');
    const { workspaceReal } = resolveChannel(config, rawChannel);
    return streamRecordingMedia(workspaceReal, relPath, req, res);
  }

  if (method === 'DELETE' && pathname === '/api/recordings') {
    let sessionId = urlObj.searchParams.get('sessionId');
    let takeId = urlObj.searchParams.get('takeId');
    let rawChannel = urlObj.searchParams.get('channel');
    if (!sessionId || !rawChannel) {
      const body = await readJsonBody(req).catch(() => ({}));
      if (!sessionId) sessionId = body.sessionId;
      if (!takeId) takeId = body.takeId;
      if (!rawChannel) rawChannel = body.channel;
    }
    const { key, workspaceReal } = resolveChannel(config, rawChannel || config.defaultChannel);
    watchHub.markApiWrite();
    const result = await deleteRecording(workspaceReal, { sessionId, takeId });
    const state = stateCache.refreshChannel(key, { flushDisk: true });
    watchHub.broadcast({
      type: 'change',
      source: 'api',
      reason: 'recording-delete',
      channel: key,
      ts: Date.now(),
    });
    return sendJson(res, 200, { ok: true, channel: key, ...result, state });
  }

  return false;
}
