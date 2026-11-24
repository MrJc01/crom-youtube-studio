import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { readJsonSafe, writeJsonAtomic, withFileLock } from './lib/storage.mjs';
import { moveToTrash } from './lib/trash.mjs';

export const STUDIO_DATA_DIR_NAME = '.studio-data';
export const NOTES_FILE_NAME = 'notas.json';

function httpError(message, statusCode) {
  return Object.assign(new Error(message), { statusCode });
}

function genId(prefix = 'note') {
  return `${prefix}-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
}

function ensureStudioDataDir(wsPath, { create = false } = {}) {
  if (!wsPath || typeof wsPath !== 'string' || !fs.existsSync(wsPath)) {
    throw httpError('Workspace não encontrado', 404);
  }
  const wsReal = fs.realpathSync(wsPath);
  const dataDir = path.join(wsReal, STUDIO_DATA_DIR_NAME);

  if (fs.existsSync(dataDir)) {
    const st = fs.lstatSync(dataDir);
    if (st.isSymbolicLink() || !st.isDirectory()) {
      throw httpError('Diretório .studio-data inválido ou symlink não permitido', 403);
    }
    const dataDirReal = fs.realpathSync(dataDir);
    if (dataDirReal !== dataDir || !dataDirReal.startsWith(wsReal + path.sep)) {
      throw httpError('Diretório .studio-data fora do workspace', 403);
    }
    return { wsReal, dataDirReal, exists: true };
  }

  if (!create) {
    return { wsReal, dataDirReal: dataDir, exists: false };
  }

  fs.mkdirSync(dataDir, { recursive: true });
  const st = fs.lstatSync(dataDir);
  if (st.isSymbolicLink() || !st.isDirectory()) {
    throw httpError('Diretório .studio-data inválido', 403);
  }
  return { wsReal, dataDirReal: fs.realpathSync(dataDir), exists: true };
}

function resolveNotesFilePath(wsPath, { createDir = false } = {}) {
  const { wsReal, dataDirReal, exists } = ensureStudioDataDir(wsPath, { create: createDir });
  const filePath = path.join(dataDirReal, NOTES_FILE_NAME);
  if (exists && fs.existsSync(filePath)) {
    const st = fs.lstatSync(filePath);
    if (st.isSymbolicLink() || !st.isFile()) {
      throw httpError('Arquivo notas.json inválido ou symlink não permitido', 403);
    }
  }
  return { wsReal, dataDirReal, filePath, dirExists: exists };
}

function normalizeChecklist(rawList) {
  if (!Array.isArray(rawList)) return [];
  const out = [];
  for (const item of rawList) {
    if (typeof item === 'string') {
      const txt = item.trim();
      if (txt) out.push({ id: genId('chk'), text: txt, done: false });
      continue;
    }
    if (!item || typeof item !== 'object') continue;
    out.push({
      id: String(item.id || genId('chk')).trim().slice(0, 64),
      text: String(item.text ?? ''),
      done: Boolean(item.done),
    });
  }
  return out;
}

function normalizeLabels(rawLabels) {
  let list = [];
  if (Array.isArray(rawLabels)) {
    list = rawLabels;
  } else if (typeof rawLabels === 'string') {
    list = rawLabels.split(',');
  }
  const seen = new Set();
  const out = [];
  for (const raw of list) {
    const clean = String(raw || '').trim().slice(0, 40);
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
  }
  return out;
}

function normalizeNote(raw = {}, existing = null) {
  const nowIso = new Date().toISOString();
  const checklist =
    raw.checklist !== undefined
      ? normalizeChecklist(raw.checklist)
      : existing
      ? existing.checklist
      : [];

  let kind = raw.kind !== undefined ? String(raw.kind).trim().toLowerCase() : existing?.kind;
  if (kind !== 'note' && kind !== 'checklist') {
    kind = checklist.length > 0 && !String(raw.content ?? existing?.content ?? '').trim() ? 'checklist' : 'note';
  }

  const rawId = raw.id !== undefined ? String(raw.id).trim() : existing?.id || genId('note');
  const safeId = rawId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80) || genId('note');

  const colorRaw = raw.color !== undefined ? String(raw.color || 'default').trim() : existing?.color || 'default';
  const color = colorRaw.slice(0, 32) || 'default';

  return {
    id: safeId,
    title: raw.title !== undefined ? String(raw.title ?? '') : existing?.title || '',
    content: raw.content !== undefined ? String(raw.content ?? '') : existing?.content || '',
    kind,
    checklist,
    color,
    pinned: raw.pinned !== undefined ? Boolean(raw.pinned) : Boolean(existing?.pinned),
    archived: raw.archived !== undefined ? Boolean(raw.archived) : Boolean(existing?.archived),
    labels: raw.labels !== undefined ? normalizeLabels(raw.labels) : existing?.labels || [],
    linkedUrl: raw.linkedUrl !== undefined ? String(raw.linkedUrl ?? '').trim() : existing?.linkedUrl || '',
    linkedDocPath:
      raw.linkedDocPath !== undefined ? String(raw.linkedDocPath ?? '').trim() : existing?.linkedDocPath || '',
    createdAt:
      typeof raw.createdAt === 'string' && raw.createdAt
        ? raw.createdAt
        : existing?.createdAt || nowIso,
    updatedAt:
      typeof raw.updatedAt === 'string' && raw.updatedAt && raw._preserveUpdatedAt
        ? raw.updatedAt
        : nowIso,
  };
}

function sortNotes(notes) {
  return [...notes].sort((a, b) => {
    if (Boolean(a.pinned) !== Boolean(b.pinned)) {
      return a.pinned ? -1 : 1;
    }
    return String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || ''));
  });
}

function defaultNotesData() {
  return {
    notes: [],
    gistSync: {
      gistId: '',
      gistUrl: '',
      lastSyncedAt: '',
      lastError: '',
    },
  };
}

function loadNotesData(wsPath) {
  const { filePath, dataDirReal, dirExists } = resolveNotesFilePath(wsPath, { createDir: false });
  if (!dirExists || !fs.existsSync(filePath)) {
    return defaultNotesData();
  }
  const parsed =
    readJsonSafe(filePath, {
      defaultData: defaultNotesData(),
      schemaVersion: 1,
      quarantineDir: path.join(dataDirReal, 'quarantine'),
    }) || {};
  const notes = Array.isArray(parsed.notes)
    ? parsed.notes.map((n) => normalizeNote({ ...n, _preserveUpdatedAt: true }))
    : [];
  const gs = parsed.gistSync && typeof parsed.gistSync === 'object' ? parsed.gistSync : {};
  return {
    notes: sortNotes(notes),
    gistSync: {
      gistId: String(gs.gistId || ''),
      gistUrl: String(gs.gistUrl || ''),
      lastSyncedAt: String(gs.lastSyncedAt || ''),
      lastError: String(gs.lastError || ''),
    },
  };
}

function saveNotesData(wsPath, data) {
  const { filePath } = resolveNotesFilePath(wsPath, { createDir: true });
  const payload = {
    notes: sortNotes(Array.isArray(data.notes) ? data.notes : []),
    gistSync: {
      gistId: String(data.gistSync?.gistId || ''),
      gistUrl: String(data.gistSync?.gistUrl || ''),
      lastSyncedAt: String(data.gistSync?.lastSyncedAt || ''),
      lastError: String(data.gistSync?.lastError || ''),
    },
  };
  writeJsonAtomic(filePath, payload, { schemaVersion: 1, backup: true });
  return payload;
}

export function listNotes(wsPath) {
  return loadNotesData(wsPath);
}

export async function createNote(wsPath, payload = {}) {
  const { filePath } = resolveNotesFilePath(wsPath, { createDir: true });
  return withFileLock(filePath, async () => {
    const data = loadNotesData(wsPath);
    const note = normalizeNote({
      ...payload,
      id: payload.id || genId('note'),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    if (data.notes.some((n) => n.id === note.id)) {
      note.id = genId('note');
    }

    data.notes.unshift(note);
    const saved = saveNotesData(wsPath, data);
    const savedNote = saved.notes.find((n) => n.id === note.id) || note;
    return {
      note: savedNote,
      notes: saved.notes,
      gistSync: saved.gistSync,
    };
  });
}

export async function updateNote(wsPath, noteId, patch = {}) {
  const cleanId = String(noteId || '').trim();
  if (!cleanId) {
    throw httpError('ID da nota ausente', 400);
  }
  const { filePath } = resolveNotesFilePath(wsPath, { createDir: true });
  return withFileLock(filePath, async () => {
    const data = loadNotesData(wsPath);
    const idx = data.notes.findIndex((n) => n.id === cleanId);
    if (idx === -1) {
      throw httpError(`Nota "${cleanId}" não encontrada`, 404);
    }

    const updated = normalizeNote({ ...patch, id: cleanId }, data.notes[idx]);
    data.notes[idx] = updated;
    const saved = saveNotesData(wsPath, data);
    const savedNote = saved.notes.find((n) => n.id === cleanId) || updated;
    return {
      note: savedNote,
      notes: saved.notes,
      gistSync: saved.gistSync,
    };
  });
}

export async function deleteNote(wsPath, noteId) {
  const cleanId = String(noteId || '').trim();
  if (!cleanId) {
    throw httpError('ID da nota ausente', 400);
  }
  const { wsReal, filePath } = resolveNotesFilePath(wsPath, { createDir: false });
  return withFileLock(filePath, async () => {
    const data = loadNotesData(wsPath);
    const idx = data.notes.findIndex((n) => n.id === cleanId);
    if (idx === -1) {
      throw httpError(`Nota "${cleanId}" não encontrada`, 404);
    }

    const noteObj = data.notes[idx];
    const trashed = await moveToTrash(wsReal, {
      kind: 'note',
      originalPath: `.studio-data/notas.json#${cleanId}`,
      title: noteObj.title || 'Nota sem título',
      itemPayload: noteObj,
      metadata: {
        noteId: cleanId,
        color: noteObj.color || 'default',
        linkedDocPath: noteObj.linkedDocPath || '',
      },
    });

    data.notes.splice(idx, 1);
    const saved = saveNotesData(wsPath, data);
    return {
      deletedId: cleanId,
      trashed,
      notes: saved.notes,
      gistSync: saved.gistSync,
    };
  });
}

export async function upsertRestoredNote(wsPath, noteObj) {
  if (!noteObj || typeof noteObj !== 'object' || Array.isArray(noteObj)) {
    throw httpError('Payload de nota inválido para restauração', 400);
  }
  const { filePath } = resolveNotesFilePath(wsPath, { createDir: true });
  return withFileLock(filePath, async () => {
    const data = loadNotesData(wsPath);
    const restored = normalizeNote({
      ...noteObj,
      _preserveUpdatedAt: Boolean(noteObj.updatedAt),
    });
    const idx = data.notes.findIndex((n) => n.id === restored.id);
    if (idx !== -1) {
      data.notes[idx] = restored;
    } else {
      data.notes.unshift(restored);
    }
    const saved = saveNotesData(wsPath, data);
    const savedNote = saved.notes.find((n) => n.id === restored.id) || restored;
    return {
      note: savedNote,
      notes: saved.notes,
      gistSync: saved.gistSync,
    };
  });
}

export function exportNotes(wsPath, format = 'json') {
  const fmt = String(format || 'json').trim().toLowerCase();
  const data = loadNotesData(wsPath);
  const exportedAt = new Date().toISOString();

  if (fmt === 'json') {
    return {
      format: 'json',
      mimeType: 'application/json; charset=utf-8',
      ext: 'json',
      filename: 'crom-studio-notas.json',
      content: `${JSON.stringify({ version: 1, exportedAt, notes: data.notes }, null, 2)}\n`,
    };
  }

  if (fmt === 'md' || fmt === 'markdown') {
    const lines = ['# Notas — Crom YouTube Studio', '', `_Exportado em ${exportedAt}_`, ''];
    for (const note of data.notes) {
      const badges = [];
      if (note.pinned) badges.push('Fixada');
      if (note.archived) badges.push('Arquivada');
      if (note.color && note.color !== 'default') badges.push(`Cor: ${note.color}`);
      const badgeStr = badges.length ? ` (${badges.join(' • ')})` : '';
      lines.push(`## ${note.title || 'Sem título'}${badgeStr}`);
      if (note.labels.length) {
        lines.push(`Tags: ${note.labels.map((l) => `\`${l}\``).join(' ')}`);
      }
      if (note.linkedUrl) {
        lines.push(`Link: ${note.linkedUrl}`);
      }
      if (note.linkedDocPath) {
        lines.push(`Roteiro vinculado: \`${note.linkedDocPath}\``);
      }
      lines.push('');
      if (note.content) {
        lines.push(note.content);
        lines.push('');
      }
      if (note.checklist.length) {
        for (const item of note.checklist) {
          lines.push(`- [${item.done ? 'x' : ' '}] ${item.text}`);
        }
        lines.push('');
      }
      lines.push('---', '');
    }
    return {
      format: 'md',
      mimeType: 'text/markdown; charset=utf-8',
      ext: 'md',
      filename: 'crom-studio-notas.md',
      content: `${lines.join('\n')}\n`,
    };
  }

  if (fmt === 'txt' || fmt === 'text') {
    const lines = [`NOTAS — CROM YOUTUBE STUDIO (${exportedAt})`, '='.repeat(52), ''];
    for (const note of data.notes) {
      const flags = [note.pinned ? 'FIXADA' : '', note.archived ? 'ARQUIVADA' : ''].filter(Boolean);
      lines.push(`[${note.title || 'Sem título'}]${flags.length ? ` (${flags.join(', ')})` : ''}`);
      if (note.labels.length) lines.push(`Tags: ${note.labels.join(', ')}`);
      if (note.linkedUrl) lines.push(`URL: ${note.linkedUrl}`);
      if (note.linkedDocPath) lines.push(`Arquivo: ${note.linkedDocPath}`);
      if (note.content) lines.push(note.content);
      if (note.checklist.length) {
        for (const item of note.checklist) {
          lines.push(`  ${item.done ? '[x]' : '[ ]'} ${item.text}`);
        }
      }
      lines.push('-'.repeat(40));
    }
    return {
      format: 'txt',
      mimeType: 'text/plain; charset=utf-8',
      ext: 'txt',
      filename: 'crom-studio-notas.txt',
      content: `${lines.join('\n')}\n`,
    };
  }

  throw httpError(`Formato de exportação inválido: "${format}". Use json, md ou txt.`, 400);
}

export async function importNotes(wsPath, payload) {
  let rawObj = payload;
  if (typeof payload === 'string') {
    try {
      rawObj = JSON.parse(payload);
    } catch {
      throw httpError('JSON inválido para importação de notas.', 400);
    }
  } else if (rawObj && typeof rawObj === 'object' && !Array.isArray(rawObj)) {
    const nestedRaw = rawObj.content ?? rawObj.json ?? rawObj.data;
    if (typeof nestedRaw === 'string') {
      try {
        rawObj = JSON.parse(nestedRaw);
      } catch {
        throw httpError('JSON inválido no campo de importação.', 400);
      }
    } else if (nestedRaw && typeof nestedRaw === 'object') {
      rawObj = nestedRaw;
    }
  }

  const mode = String((payload && !Array.isArray(payload) && payload.mode) || 'merge')
    .trim()
    .toLowerCase();

  let incomingList = [];
  if (Array.isArray(rawObj)) {
    incomingList = rawObj;
  } else if (rawObj && typeof rawObj === 'object' && Array.isArray(rawObj.notes)) {
    incomingList = rawObj.notes;
  } else {
    throw httpError('Payload de importação deve conter um array "notes".', 400);
  }

  const { filePath } = resolveNotesFilePath(wsPath, { createDir: true });
  return withFileLock(filePath, async () => {
    const data = loadNotesData(wsPath);
    let addedCount = 0;
    let updatedCount = 0;

    if (mode === 'replace') {
      data.notes = incomingList.map((item) => {
        addedCount += 1;
        return normalizeNote({ ...item, _preserveUpdatedAt: Boolean(item?.updatedAt) });
      });
    } else {
      const byId = new Map(data.notes.map((n) => [n.id, n]));
      for (const rawItem of incomingList) {
        if (!rawItem || typeof rawItem !== 'object') continue;
        const incomingId = rawItem.id ? String(rawItem.id).trim() : '';
        const existing = incomingId ? byId.get(incomingId) : null;
        const normalized = normalizeNote(
          { ...rawItem, _preserveUpdatedAt: Boolean(rawItem.updatedAt) },
          existing || null
        );
        if (existing) {
          byId.set(normalized.id, normalized);
          updatedCount += 1;
        } else {
          byId.set(normalized.id, normalized);
          addedCount += 1;
        }
      }
      data.notes = Array.from(byId.values());
    }

    const saved = saveNotesData(wsPath, data);
    return {
      importedCount: addedCount + updatedCount,
      addedCount,
      updatedCount,
      total: saved.notes.length,
      notes: saved.notes,
      gistSync: saved.gistSync,
    };
  });
}

function runGh(args, { input = null, timeout = 15000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = execFile(
      'gh',
      args,
      {
        encoding: 'utf8',
        timeout,
        maxBuffer: 8 * 1024 * 1024,
      },
      (err, stdout, stderr) => {
        if (err) {
          err.stdout = stdout || '';
          err.stderr = stderr || '';
          reject(err);
          return;
        }
        resolve({ stdout: stdout || '', stderr: stderr || '' });
      }
    );
    if (input !== null && child.stdin) {
      child.stdin.write(input);
      child.stdin.end();
    }
  });
}

function mergeNoteArrays(localNotes, remoteNotes) {
  const byId = new Map();
  for (const note of localNotes) {
    byId.set(note.id, note);
  }
  let addedFromRemote = 0;
  let updatedFromRemote = 0;

  for (const rawRemote of remoteNotes) {
    if (!rawRemote || typeof rawRemote !== 'object') continue;
    const normRemote = normalizeNote({ ...rawRemote, _preserveUpdatedAt: Boolean(rawRemote.updatedAt) });
    const local = byId.get(normRemote.id);
    if (!local) {
      byId.set(normRemote.id, normRemote);
      addedFromRemote += 1;
    } else {
      const localTs = String(local.updatedAt || local.createdAt || '');
      const remoteTs = String(normRemote.updatedAt || normRemote.createdAt || '');
      if (remoteTs > localTs) {
        byId.set(normRemote.id, normRemote);
        updatedFromRemote += 1;
      }
    }
  }

  return {
    merged: sortNotes(Array.from(byId.values())),
    addedFromRemote,
    updatedFromRemote,
  };
}

export async function syncNotesGist(wsPath, channelKey, mode = 'sync') {
  const safeChannel = String(channelKey || 'studio').replace(/[^a-z0-9_-]/gi, '') || 'studio';
  const cleanMode = ['push', 'pull', 'sync'].includes(String(mode || 'sync').toLowerCase())
    ? String(mode || 'sync').toLowerCase()
    : 'sync';
  const fileName = `crom-studio-notas-${safeChannel}.json`;
  const { filePath } = resolveNotesFilePath(wsPath, { createDir: true });

  return withFileLock(filePath, async () => {
    const data = loadNotesData(wsPath);

    const recordFailure = (errorMsg, hint) => {
      data.gistSync = {
        ...data.gistSync,
        lastError: errorMsg,
      };
      const saved = saveNotesData(wsPath, data);
      return {
        ok: false,
        error: errorMsg,
        hint,
        gistSync: saved.gistSync,
        notes: saved.notes,
      };
    };

    try {
      await runGh(['auth', 'status'], { timeout: 6000 });
    } catch (err) {
      if (err.code === 'ENOENT') {
        return recordFailure(
          'GitHub CLI (gh) não está instalado neste sistema.',
          'Instale o pacote "gh" e execute "gh auth login" com permissão de gist.'
        );
      }
      return recordFailure(
        'GitHub CLI (gh) não está autenticado.',
        'Execute "gh auth login" (ou "gh auth refresh -s gist") no terminal para sincronizar suas notas em um Gist privado.'
      );
    }

    try {
      let gistId = data.gistSync.gistId || '';
      let gistUrl = data.gistSync.gistUrl || '';
      let remoteGist = null;

      if (gistId) {
        try {
          const { stdout } = await runGh(['api', `gists/${gistId}`]);
          const parsedGist = JSON.parse(stdout);
          if (parsedGist && parsedGist.public === false) {
            remoteGist = parsedGist;
            gistUrl = parsedGist.html_url || gistUrl;
          } else if (parsedGist && parsedGist.public === true) {
            // Nunca reutilizar gist público para notas privadas
            gistId = '';
            gistUrl = '';
          }
        } catch {
          if (cleanMode === 'pull') {
            return recordFailure(
              `Gist privado "${gistId}" não encontrado no GitHub.`,
              'Execute uma sincronização (sync/push) para recriar o Gist privado.'
            );
          }
          gistId = '';
          gistUrl = '';
        }
      }

      if (!gistId) {
        const { stdout: listOut } = await runGh(['api', 'gists?per_page=30']);
        const gists = JSON.parse(listOut || '[]');
        const existingSecret = Array.isArray(gists)
          ? gists.find((g) => g && g.public === false && g.files && g.files[fileName])
          : null;
        if (existingSecret) {
          gistId = existingSecret.id;
          gistUrl = existingSecret.html_url || '';
          const { stdout: fullOut } = await runGh(['api', `gists/${gistId}`]);
          remoteGist = JSON.parse(fullOut);
        }
      }

      let addedFromRemote = 0;
      let updatedFromRemote = 0;

      if (remoteGist && (cleanMode === 'pull' || cleanMode === 'sync')) {
        const fileObj =
          remoteGist.files?.[fileName] ||
          Object.values(remoteGist.files || {}).find((f) => f && f.filename?.endsWith('.json'));
        if (fileObj?.content) {
          try {
            const remoteParsed = JSON.parse(fileObj.content);
            const remoteNotes = Array.isArray(remoteParsed?.notes)
              ? remoteParsed.notes
              : Array.isArray(remoteParsed)
              ? remoteParsed
              : [];
            const mergedRes = mergeNoteArrays(data.notes, remoteNotes);
            data.notes = mergedRes.merged;
            addedFromRemote = mergedRes.addedFromRemote;
            updatedFromRemote = mergedRes.updatedFromRemote;
          } catch {
            // JSON remoto inválido: sobrescreve no push se estiver em sync
          }
        }
      }

      if (!gistId) {
        if (cleanMode === 'pull') {
          return recordFailure(
            'Nenhum Gist privado de notas foi encontrado nesta conta GitHub.',
            'Crie ou sincronize suas notas primeiro para gerar o Gist privado.'
          );
        }

        const bodyJson = JSON.stringify(
          {
            version: 1,
            channel: safeChannel,
            updatedAt: new Date().toISOString(),
            notes: sortNotes(data.notes),
          },
          null,
          2
        );

        // SEMPRE secreto/privado: gh gist create é privado por padrão (NUNCA passar --public)
        const { stdout } = await runGh(
          ['gist', 'create', '-', '-f', fileName, '-d', `Crom YouTube Studio — Notas (${safeChannel})`],
          { input: bodyJson }
        );
        const createdUrl = stdout
          .split(/\r?\n/)
          .map((l) => l.trim())
          .find((l) => l.startsWith('https://'));
        gistUrl = createdUrl || '';
        gistId = createdUrl ? createdUrl.split('/').filter(Boolean).pop() || '' : '';
      } else if (cleanMode === 'push' || cleanMode === 'sync') {
        const bodyJson = JSON.stringify(
          {
            version: 1,
            channel: safeChannel,
            updatedAt: new Date().toISOString(),
            notes: sortNotes(data.notes),
          },
          null,
          2
        );
        const patchPayload = JSON.stringify({
          description: `Crom YouTube Studio — Notas (${safeChannel})`,
          files: {
            [fileName]: {
              content: bodyJson,
            },
          },
        });
        const { stdout } = await runGh(['api', '-X', 'PATCH', `gists/${gistId}`, '--input', '-'], {
          input: patchPayload,
        });
        const updatedGist = JSON.parse(stdout || '{}');
        gistUrl = updatedGist.html_url || gistUrl;
      }

      data.gistSync = {
        gistId,
        gistUrl,
        lastSyncedAt: new Date().toISOString(),
        lastError: '',
      };
      const saved = saveNotesData(wsPath, data);

      return {
        ok: true,
        mode: cleanMode,
        isPrivate: true,
        addedFromRemote,
        updatedFromRemote,
        gistSync: saved.gistSync,
        notes: saved.notes,
      };
    } catch (err) {
      const rawMsg = String(err.stderr || err.message || 'Erro ao sincronizar Gist privado');
      const needsScope = /403|scope|gist|authentication/i.test(rawMsg);
      return recordFailure(
        `Falha ao sincronizar Gist privado: ${rawMsg.split(/\r?\n/)[0]}`,
        needsScope
          ? 'Execute "gh auth refresh -s gist" no terminal para habilitar o escopo de Gist.'
          : 'Verifique sua conexão com a internet e o status de "gh auth status".'
      );
    }
  });
}
