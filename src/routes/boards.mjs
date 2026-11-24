import {
  BOARDS_DIR_NAME,
  createBoard,
  deleteBoard,
  listBoards,
  readBoard,
  saveBoard,
} from '../boards.mjs';
import { readJsonBody, resolveChannel, sendJson } from './http-utils.mjs';

export async function handleBoardsRoutes({
  req,
  res,
  urlObj,
  pathname,
  method,
  config,
  stateCache,
  watchHub,
}) {
  if (method === 'GET' && pathname === '/api/boards') {
    const rawChannel = urlObj.searchParams.get('channel') || config.defaultChannel;
    const { key, workspaceReal } = resolveChannel(config, rawChannel);
    const boards = await listBoards(workspaceReal);
    return sendJson(res, 200, { ok: true, channel: key, boards });
  }

  if (method === 'GET' && pathname === '/api/boards/item') {
    const rawChannel = urlObj.searchParams.get('channel') || config.defaultChannel;
    const boardId = urlObj.searchParams.get('id') ?? urlObj.searchParams.get('slug');
    const { key, workspaceReal } = resolveChannel(config, rawChannel);
    const { board, scene } = await readBoard(workspaceReal, boardId);
    return sendJson(res, 200, { ok: true, channel: key, board, scene });
  }

  if (method === 'POST' && pathname === '/api/boards') {
    const body = await readJsonBody(req);
    const rawChannel = body.channel || urlObj.searchParams.get('channel') || config.defaultChannel;
    const { key, workspaceReal } = resolveChannel(config, rawChannel);
    watchHub.markBoardDirTouch();
    const result = await createBoard(workspaceReal, body);
    watchHub.markBoardWrite(key, result.board.path, true, result.fileHash);
    const state = stateCache.refreshChannel(key, { flushDisk: true });
    watchHub.broadcast({
      type: 'change',
      source: 'api',
      reason: 'board-create',
      channel: key,
      boardId: result.board.id,
      ts: Date.now(),
    });
    return sendJson(res, 201, {
      ok: true,
      channel: key,
      board: result.board,
      scene: result.scene,
      boards: result.boards,
      state,
    });
  }

  if (method === 'PUT' && pathname === '/api/boards') {
    const body = await readJsonBody(req);
    const rawChannel = body.channel || urlObj.searchParams.get('channel') || config.defaultChannel;
    const { key, workspaceReal } = resolveChannel(config, rawChannel);
    const boardId =
      body.id ?? body.slug ?? urlObj.searchParams.get('id') ?? urlObj.searchParams.get('slug');
    const result = await saveBoard(workspaceReal, boardId, body);
    if (result.renamed) {
      watchHub.markBoardWrite(
        key,
        `${BOARDS_DIR_NAME}/${result.previousId}.excalidraw`,
        false,
        null
      );
    }
    watchHub.markBoardWrite(key, result.board.path, true, result.fileHash);
    const refreshedState = stateCache.refreshChannel(key, { flushDisk: true });
    const state = result.renamed ? refreshedState : undefined;
    watchHub.broadcast({
      type: 'change',
      source: 'api',
      reason: 'board-save',
      channel: key,
      boardId: result.board.id,
      ts: Date.now(),
    });
    return sendJson(res, 200, {
      ok: true,
      channel: key,
      board: result.board,
      updatedAt: result.board.updatedAt,
      boards: result.boards,
      ...(state ? { state } : {}),
    });
  }

  if (method === 'DELETE' && pathname === '/api/boards') {
    let boardId = urlObj.searchParams.get('id') ?? urlObj.searchParams.get('slug');
    let rawChannel = urlObj.searchParams.get('channel');
    if (!boardId || !rawChannel) {
      const body = await readJsonBody(req).catch(() => ({}));
      if (!boardId) boardId = body.id ?? body.slug;
      if (!rawChannel) rawChannel = body.channel;
    }
    const { key, workspaceReal } = resolveChannel(config, rawChannel || config.defaultChannel);
    const result = await deleteBoard(workspaceReal, boardId);
    watchHub.markBoardWrite(key, `${BOARDS_DIR_NAME}/${result.deleted}.excalidraw`, false, null);
    const state = stateCache.refreshChannel(key, { flushDisk: true });
    watchHub.broadcast({
      type: 'change',
      source: 'api',
      reason: 'board-delete',
      channel: key,
      boardId: result.deleted,
      ts: Date.now(),
    });
    return sendJson(res, 200, {
      ok: true,
      channel: key,
      deleted: result.deleted,
      boards: result.boards,
      state,
    });
  }

  return false;
}
