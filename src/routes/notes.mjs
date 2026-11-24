import {
  createNote,
  deleteNote,
  exportNotes,
  importNotes,
  listNotes,
  syncNotesGist,
  updateNote,
} from '../notes.mjs';
import { slugify } from '../sync.mjs';
import { commitRevision } from '../versioning.mjs';
import {
  buildYamlFrontmatter,
  findUniqueDocRelPath,
  readJsonBody,
  resolveChannel,
  sendJson,
} from './http-utils.mjs';

export async function handleNotesRoutes({
  req,
  res,
  urlObj,
  pathname,
  method,
  config,
  stateCache,
  watchHub,
}) {
  if (method === 'GET' && pathname === '/api/notes') {
    const rawChannel = urlObj.searchParams.get('channel') || config.defaultChannel;
    const { key, workspaceReal } = resolveChannel(config, rawChannel);
    const data = await listNotes(workspaceReal);
    return sendJson(res, 200, { ok: true, channel: key, ...data });
  }

  if (method === 'POST' && pathname === '/api/notes') {
    const body = await readJsonBody(req);
    const rawChannel = body.channel || urlObj.searchParams.get('channel') || config.defaultChannel;
    const { key, workspaceReal } = resolveChannel(config, rawChannel);
    watchHub.markApiWrite();
    const result = await createNote(workspaceReal, body);
    const state = stateCache.refreshChannel(key, { flushDisk: true });
    watchHub.broadcast({
      type: 'change',
      source: 'api',
      reason: 'note-create',
      channel: key,
      ts: Date.now(),
    });
    return sendJson(res, 201, { ok: true, channel: key, ...result, state });
  }

  if (method === 'PUT' && pathname === '/api/notes') {
    const body = await readJsonBody(req);
    const rawChannel = body.channel || urlObj.searchParams.get('channel') || config.defaultChannel;
    const { key, workspaceReal } = resolveChannel(config, rawChannel);
    const noteId =
      body.id || body.noteId || urlObj.searchParams.get('id') || urlObj.searchParams.get('noteId');
    const patch = body.patch && typeof body.patch === 'object' ? body.patch : body;
    watchHub.markApiWrite();
    const result = await updateNote(workspaceReal, noteId, patch);
    const state = stateCache.refreshChannel(key, { flushDisk: true });
    watchHub.broadcast({
      type: 'change',
      source: 'api',
      reason: 'note-update',
      channel: key,
      ts: Date.now(),
    });
    return sendJson(res, 200, { ok: true, channel: key, ...result, state });
  }

  if (method === 'DELETE' && pathname === '/api/notes') {
    let noteId = urlObj.searchParams.get('id') || urlObj.searchParams.get('noteId');
    let rawChannel = urlObj.searchParams.get('channel');
    if (!noteId || !rawChannel) {
      const body = await readJsonBody(req).catch(() => ({}));
      if (!noteId) noteId = body.id || body.noteId;
      if (!rawChannel) rawChannel = body.channel;
    }
    const { key, workspaceReal } = resolveChannel(config, rawChannel || config.defaultChannel);
    watchHub.markApiWrite();
    const result = await deleteNote(workspaceReal, noteId);
    const state = stateCache.refreshChannel(key, { flushDisk: true });
    watchHub.broadcast({
      type: 'change',
      source: 'api',
      reason: 'note-delete',
      channel: key,
      ts: Date.now(),
    });
    return sendJson(res, 200, { ok: true, channel: key, ...result, state });
  }

  if (method === 'GET' && pathname === '/api/notes/export') {
    const rawChannel = urlObj.searchParams.get('channel') || config.defaultChannel;
    const format = urlObj.searchParams.get('format') || 'json';
    const { key, workspaceReal } = resolveChannel(config, rawChannel);
    const exported = await exportNotes(workspaceReal, format);
    res.writeHead(200, {
      'Content-Type': exported.mimeType,
      'Content-Disposition': `attachment; filename="${key}-${exported.filename}"`,
      'Cache-Control': 'no-store',
    });
    res.end(exported.content);
    return true;
  }

  if (method === 'POST' && pathname === '/api/notes/import') {
    const body = await readJsonBody(req);
    const rawChannel =
      (!Array.isArray(body) && body?.channel) ||
      urlObj.searchParams.get('channel') ||
      config.defaultChannel;
    const { key, workspaceReal } = resolveChannel(config, rawChannel);
    watchHub.markApiWrite();
    const result = await importNotes(workspaceReal, body);
    const state = stateCache.refreshChannel(key, { flushDisk: true });
    watchHub.broadcast({
      type: 'change',
      source: 'api',
      reason: 'note-import',
      channel: key,
      ts: Date.now(),
    });
    return sendJson(res, 200, { ok: true, channel: key, ...result, state });
  }

  if (method === 'POST' && pathname === '/api/notes/sync-gist') {
    const body = await readJsonBody(req).catch(() => ({}));
    const rawChannel = body.channel || urlObj.searchParams.get('channel') || config.defaultChannel;
    const { key, workspaceReal } = resolveChannel(config, rawChannel);
    watchHub.markApiWrite();
    const result = await syncNotesGist(workspaceReal, key, body.mode || 'sync');
    const state = stateCache.refreshChannel(key, { flushDisk: true });
    if (result.ok) {
      watchHub.broadcast({
        type: 'change',
        source: 'api',
        reason: 'note-sync-gist',
        channel: key,
        ts: Date.now(),
      });
    }
    return sendJson(res, 200, { channel: key, ...result, state });
  }

  if (method === 'POST' && pathname === '/api/notes/to-doc') {
    const body = await readJsonBody(req);
    const rawChannel = body.channel || urlObj.searchParams.get('channel') || config.defaultChannel;
    const { key, cfg, workspaceReal } = resolveChannel(config, rawChannel);
    const noteId = String(body.noteId || body.id || '').trim();

    let sourceNote = null;
    if (noteId) {
      const allNotes = (await listNotes(workspaceReal)).notes;
      sourceNote = allNotes.find((n) => n.id === noteId);
      if (!sourceNote) {
        return sendJson(res, 404, { error: `Nota "${noteId}" não encontrada.` });
      }
    }

    const isIdea =
      body.targetType === 'ideia' ||
      body.tipo === 'ideia' ||
      String(body.folder || '').startsWith('01-ideias');
    const folderRel = String(body.folder || (isIdea ? '01-ideias' : '02-roteiros/rascunhos')).trim();
    const noteTitle = String(body.title || sourceNote?.title || 'Nota do Estúdio').trim() || 'Nota do Estúdio';
    const todayIso = new Date().toISOString().slice(0, 10);
    const ymPrefix = todayIso.slice(0, 7);
    const slugInput = isIdea ? noteTitle : `${ymPrefix}-${noteTitle}`;
    const target = findUniqueDocRelPath(config, key, folderRel, slugInput);

    const defaultSerie = cfg.seriesList?.includes('Pensamentos')
      ? 'Pensamentos'
      : cfg.seriesList?.[0] || 'Geral';
    const serie = String(body.serie || defaultSerie).trim();
    const labels = sourceNote?.labels?.length ? sourceNote.labels : [];
    const tags = Array.from(
      new Set([isIdea ? 'ideia' : 'roteiro', ...labels.map((l) => slugify(l))].filter(Boolean))
    );
    const docId = `${ymPrefix}-${slugify(noteTitle)}`.slice(0, 80);

    const frontmatter = buildYamlFrontmatter({
      id: docId,
      titulo: noteTitle,
      tipo: body.tipo || (isIdea ? 'ideia' : 'roteiro'),
      status: body.status || (isIdea ? 'ideia' : 'roteiro'),
      serie,
      formato: body.formato || 'long',
      prioridade: body.prioridade || 'media',
      duracao_estimada: body.duracao_estimada || '8 min',
      data_criacao: todayIso,
      data_alvo: '',
      repo_github: '',
      youtube_id: '',
      views: 0,
      tags,
      resumo: body.resumo || `Documento criado a partir da nota "${noteTitle}".`,
    });

    const mdSections = [frontmatter, '', `# ${noteTitle}`, ''];
    const bodyText = String(body.content ?? sourceNote?.content ?? '').trim();
    if (bodyText) {
      mdSections.push(bodyText, '');
    }
    const checklist = Array.isArray(sourceNote?.checklist) ? sourceNote.checklist : [];
    if (checklist.length) {
      mdSections.push('## Checklist', '');
      for (const item of checklist) {
        mdSections.push(`- [${item.done ? 'x' : ' '}] ${item.text}`);
      }
      mdSections.push('');
    }
    const linkedUrl = String(body.linkedUrl ?? sourceNote?.linkedUrl ?? '').trim();
    if (linkedUrl) {
      mdSections.push('## Referências', '', `- ${linkedUrl}`, '');
    }

    watchHub.markApiWrite();
    const verRes = commitRevision(target.workspaceReal, target.rel, {
      content: mdSections.join('\n'),
      version: 'principal',
      message: 'Criado a partir de nota do Keep',
      author: body.author || 'MrJ',
      kind: 'init',
    });

    let updatedNote = sourceNote;
    if (sourceNote) {
      updatedNote = (await updateNote(workspaceReal, sourceNote.id, { linkedDocPath: target.rel })).note;
    }

    const state = stateCache.refreshChannel(key, { flushDisk: true });
    watchHub.broadcast({
      type: 'change',
      source: 'api',
      reason: 'note-to-doc',
      channel: key,
      path: target.rel,
      ts: Date.now(),
    });

    return sendJson(res, 201, {
      ok: true,
      channel: key,
      docPath: target.rel,
      path: target.rel,
      revision: verRes.revision,
      note: updatedNote,
      state,
    });
  }

  return false;
}
