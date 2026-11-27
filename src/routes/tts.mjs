import {
  createAudioCategory,
  deleteNarrationAudio,
  deleteVoicePreset,
  discoverTtsEnvironment,
  downloadPiperModel,
  generateNarration,
  listAudioCategories,
  listUnifiedAudios,
  listVoicePresets,
  prepareNarrationText,
  saveVoicePreset,
  streamNarrationAudio,
  synthesizeQuickSpeechWav,
  updateNarrationMeta,
} from '../tts.mjs';
import { readRefContent } from '../versioning.mjs';
import { readJsonBody, resolveChannel, sendJson } from './http-utils.mjs';

export async function handleTtsRoutes({
  req,
  res,
  urlObj,
  pathname,
  method,
  config,
  stateCache,
  watchHub,
}) {
  if (method === 'GET' && pathname === '/api/tts/status') {
    const rawChannel = urlObj.searchParams.get('channel') || config.defaultChannel;
    const { key, workspaceReal } = resolveChannel(config, rawChannel);
    const env = discoverTtsEnvironment({ kdenliveRoot: config.kdenliveRoot });
    const presets = listVoicePresets(workspaceReal);
    const categories = listAudioCategories(workspaceReal);
    return sendJson(res, 200, { ok: true, channel: key, env, presets, categories });
  }

  if (method === 'POST' && pathname === '/api/tts/piper/download-model') {
    const body = await readJsonBody(req).catch(() => ({}));
    const modelName = String(body.modelName || 'pt_BR-faber-medium.onnx').trim();
    const downloadResult = await downloadPiperModel(modelName);
    const env = discoverTtsEnvironment({ kdenliveRoot: config.kdenliveRoot });
    return sendJson(res, 200, { ...downloadResult, env });
  }

  if (method === 'POST' && pathname === '/api/tts/preview-text') {
    const body = await readJsonBody(req);
    const rawChannel = body.channel || urlObj.searchParams.get('channel') || config.defaultChannel;
    const { key, workspaceReal } = resolveChannel(config, rawChannel);
    let rawText = String(body.text || '');
    const docPath = String(body.docPath || '').trim();
    const docVersion = String(body.docVersion || 'principal').trim() || 'principal';
    if (docPath && !rawText.trim()) {
      const resolved = readRefContent(workspaceReal, docPath, docVersion);
      rawText = resolved.content || '';
    }
    const preparedText = prepareNarrationText(rawText, {
      preserveVoiceTags: Boolean(body.preserveVoiceTags),
    });
    return sendJson(res, 200, {
      ok: true,
      channel: key,
      preparedText,
      charCount: preparedText.length,
      wordCount: preparedText ? preparedText.split(/\s+/).filter(Boolean).length : 0,
    });
  }

  if (method === 'POST' && pathname === '/api/tts/speak') {
    const body = await readJsonBody(req);
    const wavBuf = await synthesizeQuickSpeechWav(body.text || '', {
      kdenliveRoot: config.kdenliveRoot,
    });
    res.writeHead(200, {
      'Content-Type': 'audio/wav',
      'Content-Length': wavBuf.length,
      'Cache-Control': 'no-store',
    });
    res.end(wavBuf);
    return;
  }

  if (method === 'POST' && pathname === '/api/tts/generate') {
    const body = await readJsonBody(req);
    const rawChannel = body.channel || urlObj.searchParams.get('channel') || config.defaultChannel;
    const { key, workspaceReal } = resolveChannel(config, rawChannel);

    watchHub.markApiWrite(4000);
    const result = await generateNarration(workspaceReal, {
      text: body.text,
      docPath: body.docPath,
      docVersion: body.docVersion,
      docTitle: body.docTitle,
      voiceId: body.voiceId,
      secondaryVoiceId: body.secondaryVoiceId,
      mode: body.mode,
      category: body.category,
      title: body.title,
      origin: body.origin || (body.docPath ? 'roteiro' : 'pagina-narracao'),
      cleanMarkdown: body.cleanMarkdown,
      usePronunciationDict: body.usePronunciationDict,
      loudnorm: body.loudnorm,
      overrides: body.overrides,
      kdenliveRoot: config.kdenliveRoot,
    });

    const state = stateCache.refreshChannel(key, { flushDisk: true });
    watchHub.broadcast({
      type: 'change',
      source: 'api',
      reason: 'tts-generate',
      channel: key,
      id: result.item.id,
      ts: Date.now(),
    });
    return sendJson(res, 201, { ok: true, channel: key, item: result.item, state });
  }

  if (method === 'GET' && pathname === '/api/tts/audios') {
    const rawChannel = urlObj.searchParams.get('channel') || config.defaultChannel;
    const { key, workspaceReal } = resolveChannel(config, rawChannel);
    const items = listUnifiedAudios(workspaceReal, {
      category: urlObj.searchParams.get('category') || 'all',
      origin: urlObj.searchParams.get('origin') || 'all',
      voiceId: urlObj.searchParams.get('voiceId') || 'all',
      docPath: urlObj.searchParams.get('docPath') || '',
      q: urlObj.searchParams.get('q') || '',
      includeWorkspaceAudio: urlObj.searchParams.get('includeWorkspaceAudio') !== '0',
    });
    const categories = listAudioCategories(workspaceReal);
    return sendJson(res, 200, { ok: true, channel: key, count: items.length, items, categories });
  }

  if ((method === 'GET' || method === 'HEAD') && pathname === '/api/tts/media') {
    const rawChannel = urlObj.searchParams.get('channel') || config.defaultChannel;
    const relPath = urlObj.searchParams.get('path') || '';
    const { workspaceReal } = resolveChannel(config, rawChannel);
    return streamNarrationAudio(workspaceReal, relPath, req, res);
  }

  if (method === 'PATCH' && pathname === '/api/tts/audios') {
    const body = await readJsonBody(req);
    const rawChannel = body.channel || urlObj.searchParams.get('channel') || config.defaultChannel;
    const { key, workspaceReal } = resolveChannel(config, rawChannel);
    watchHub.markApiWrite();
    const updated = await updateNarrationMeta(workspaceReal, body.id, {
      title: body.title,
      category: body.category,
      docPath: body.docPath,
    });
    const state = stateCache.refreshChannel(key, { flushDisk: true });
    watchHub.broadcast({
      type: 'change',
      source: 'api',
      reason: 'tts-audio-update',
      channel: key,
      id: body.id,
      ts: Date.now(),
    });
    return sendJson(res, 200, { ...updated, channel: key, state });
  }

  if (method === 'DELETE' && pathname === '/api/tts/audios') {
    let rawChannel = urlObj.searchParams.get('channel');
    let audioId = urlObj.searchParams.get('id');
    if (!rawChannel || !audioId) {
      const body = await readJsonBody(req).catch(() => ({}));
      if (!rawChannel) rawChannel = body.channel;
      if (!audioId) audioId = body.id;
    }
    const { key, workspaceReal } = resolveChannel(config, rawChannel || config.defaultChannel);
    watchHub.markApiWrite();
    const result = await deleteNarrationAudio(workspaceReal, audioId);
    const state = stateCache.refreshChannel(key, { flushDisk: true });
    watchHub.broadcast({
      type: 'change',
      source: 'api',
      reason: 'tts-audio-delete',
      channel: key,
      id: audioId,
      ts: Date.now(),
    });
    return sendJson(res, 200, { ...result, channel: key, state });
  }

  if (method === 'GET' && pathname === '/api/tts/presets') {
    const rawChannel = urlObj.searchParams.get('channel') || config.defaultChannel;
    const { key, workspaceReal } = resolveChannel(config, rawChannel);
    return sendJson(res, 200, { ok: true, channel: key, presets: listVoicePresets(workspaceReal) });
  }

  if (method === 'POST' && pathname === '/api/tts/presets') {
    const body = await readJsonBody(req);
    const rawChannel = body.channel || urlObj.searchParams.get('channel') || config.defaultChannel;
    const { key, workspaceReal } = resolveChannel(config, rawChannel);
    watchHub.markApiWrite();
    const resPreset = await saveVoicePreset(workspaceReal, body.preset || body);
    return sendJson(res, 200, { ...resPreset, channel: key });
  }

  if (method === 'DELETE' && pathname === '/api/tts/presets') {
    let rawChannel = urlObj.searchParams.get('channel');
    let presetId = urlObj.searchParams.get('id');
    if (!rawChannel || !presetId) {
      const body = await readJsonBody(req).catch(() => ({}));
      if (!rawChannel) rawChannel = body.channel;
      if (!presetId) presetId = body.id;
    }
    const { key, workspaceReal } = resolveChannel(config, rawChannel || config.defaultChannel);
    watchHub.markApiWrite();
    const resDel = await deleteVoicePreset(workspaceReal, presetId);
    return sendJson(res, 200, { ...resDel, channel: key });
  }

  if (method === 'GET' && pathname === '/api/tts/categories') {
    const rawChannel = urlObj.searchParams.get('channel') || config.defaultChannel;
    const { key, workspaceReal } = resolveChannel(config, rawChannel);
    return sendJson(res, 200, { ok: true, channel: key, categories: listAudioCategories(workspaceReal) });
  }

  if (method === 'POST' && pathname === '/api/tts/categories') {
    const body = await readJsonBody(req);
    const rawChannel = body.channel || urlObj.searchParams.get('channel') || config.defaultChannel;
    const { key, workspaceReal } = resolveChannel(config, rawChannel);
    watchHub.markApiWrite();
    const resCat = await createAudioCategory(workspaceReal, body);
    return sendJson(res, 201, { ...resCat, channel: key });
  }

  return false;
}
