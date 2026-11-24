import { MD, VIEW_TITLES } from './constants.js';
import {
  buildFriendlyUrl,
  switchChannel,
} from './router.js';
import {
  getActiveChannelData,
  getActiveDoc,
  getLifecycleHooks,
  resolveRelativeMdPath,
  state,
} from './state.js';
import {
  buildDocContextMarkdown,
  buildLinkContextMarkdown,
  closeOtherTabs,
  closeTab,
  duplicateTab,
  getTabPresentation,
  openNewTab,
} from './tabs.js';
import { copyText, getHostnameLabel, showToast } from './utils.js';

export function closeContextMenu() {
  const menu = document.getElementById('studioContextMenu');
  if (menu) menu.classList.add('hidden');
}

export function showStudioContextMenu(clientX, clientY, headerLabel, items) {
  const menu = document.getElementById('studioContextMenu');
  if (!menu || !items.length) return;

  const itemsHtml = items
    .map((item, idx) => {
      if (item.sep) return '<div class="ctx-menu-sep" role="separator"></div>';
      return `
        <button type="button" class="ctx-menu-item${item.danger ? ' is-danger' : ''}" data-ctx-idx="${idx}" role="menuitem">
          <span class="ctx-menu-icon">${MD.escapeHtml(item.icon || '•')}</span>
          <span class="ctx-menu-label">${MD.escapeHtml(item.label)}</span>
        </button>
      `;
    })
    .join('');

  menu.innerHTML = `${headerLabel ? `<div class="ctx-menu-head">${MD.escapeHtml(headerLabel)}</div>` : ''}${itemsHtml}`;
  menu.style.visibility = 'hidden';
  menu.classList.remove('hidden');

  const rect = menu.getBoundingClientRect();
  const vw = globalThis.innerWidth || document.documentElement.clientWidth;
  const vh = globalThis.innerHeight || document.documentElement.clientHeight;
  const left = Math.max(8, Math.min(clientX, vw - rect.width - 8));
  const top = Math.max(8, Math.min(clientY, vh - rect.height - 8));
  menu.style.left = `${Math.round(left)}px`;
  menu.style.top = `${Math.round(top)}px`;
  menu.style.visibility = '';

  menu.querySelectorAll('[data-ctx-idx]').forEach((btn) => {
    btn.onclick = (ev) => {
      ev.stopPropagation();
      const item = items[Number(btn.dataset.ctxIdx)];
      closeContextMenu();
      if (item && typeof item.action === 'function') item.action();
    };
  });
}

export function resolveContextTarget(targetEl) {
  if (!targetEl || !(targetEl instanceof Element)) return null;
  if (targetEl.closest('input, textarea, select, [contenteditable], #excalidrawFrame')) return null;

  const tabEl = targetEl.closest('.studio-tab[data-tab-id]');
  if (tabEl) {
    return { kind: 'tab', tabId: tabEl.dataset.tabId };
  }

  const navEl = targetEl.closest('#sideNav .nav-item[data-view]');
  if (navEl) {
    return { kind: 'nav', view: navEl.dataset.view };
  }

  const docEl = targetEl.closest(
    '[data-select-doc], [data-open-doc], [data-open-map-doc], [data-flow-doc], [data-spot-open], [data-drawer-doc], [data-cmd-doc], a[data-rel-md], .kanban-card[data-doc-path], .kanban-card[data-drag-path]'
  );
  if (docEl) {
    let docPath =
      docEl.dataset.selectDoc ||
      docEl.dataset.openDoc ||
      docEl.dataset.openMapDoc ||
      docEl.dataset.flowDoc ||
      docEl.dataset.spotOpen ||
      docEl.dataset.drawerDoc ||
      docEl.dataset.cmdDoc ||
      docEl.dataset.docPath ||
      docEl.dataset.dragPath ||
      '';
    if (!docPath && docEl.dataset.relMd) {
      const activeDoc = getActiveDoc();
      docPath = resolveRelativeMdPath(activeDoc?.folder, docEl.dataset.relMd) || '';
    }
    if (docPath) {
      return { kind: 'doc', docPath };
    }
  }

  const ctxBoardCard = targetEl.closest('[data-context-url]');
  if (ctxBoardCard && ctxBoardCard.dataset.contextUrl) {
    const ctxUrl = ctxBoardCard.dataset.contextUrl.trim();
    const mBoard = /^\/([^/]+)\/quadro\/([^/?#]+)$/i.exec(ctxUrl);
    if (mBoard) {
      return {
        kind: 'board',
        channel: decodeURIComponent(mBoard[1]).toLowerCase(),
        boardId: decodeURIComponent(mBoard[2]).toLowerCase(),
        contextUrl: ctxUrl,
      };
    }
  }

  const extLink = targetEl.closest('a[href^="http://"], a[href^="https://"]');
  if (extLink) {
    return {
      kind: 'external',
      url: extLink.href,
      title: (extLink.getAttribute('title') || extLink.textContent || extLink.href).trim(),
    };
  }

  const extCard = targetEl.closest('[data-ext-url]');
  if (extCard && extCard.dataset.extUrl) {
    return {
      kind: 'external',
      url: extCard.dataset.extUrl,
      title: extCard.dataset.extTitle || extCard.dataset.extUrl,
    };
  }

  return null;
}

export function handleStudioContextMenu(e) {
  const resolved = resolveContextTarget(e.target);
  if (!resolved) {
    closeContextMenu();
    return;
  }

  e.preventDefault();
  const chData = getActiveChannelData();
  const docs = chData.docs || [];
  const hooks = getLifecycleHooks();

  if (resolved.kind === 'tab') {
    const tab = state.tabs.find((t) => t.id === resolved.tabId);
    if (!tab) return;
    const pres = getTabPresentation(tab);
    const tabUrl =
      tab.kind === 'link'
        ? tab.externalUrl
        : globalThis.location.protocol.startsWith('http')
          ? `${globalThis.location.origin}${buildFriendlyUrl(tab.channel, tab.view, tab.docPath, tab.boardId)}`
          : buildFriendlyUrl(tab.channel, tab.view, tab.docPath, tab.boardId);
    const items = [
      { icon: '⧉', label: 'Duplicar aba', action: () => duplicateTab(tab.id) },
      {
        icon: '📋',
        label: 'Copiar como contexto',
        action: () => {
          if (tab.kind === 'link') {
            copyText(buildLinkContextMarkdown(pres.title, tab.externalUrl), 'Contexto copiado!');
          } else if (tab.view === 'scripts' && tab.docPath) {
            const d = state.data?.channels?.[tab.channel]?.docs?.find((x) => x.path === tab.docPath);
            copyText(d ? buildDocContextMarkdown(d) : `${pres.title} — ${tabUrl}`, 'Contexto copiado!');
          } else {
            copyText(`- **Aba:** ${pres.title} (${tab.channel})\n- **URL:** ${tabUrl}`, 'Contexto copiado!');
          }
        },
      },
      { icon: '🔗', label: 'Copiar link', action: () => copyText(tabUrl, 'Link copiado!') },
      { sep: true },
      { icon: '✕', label: 'Fechar aba', danger: true, action: () => closeTab(tab.id) },
    ];
    if (state.tabs.length > 1) {
      items.push({ icon: '✕', label: 'Fechar outras abas', action: () => closeOtherTabs(tab.id) });
    }
    showStudioContextMenu(e.clientX, e.clientY, pres.title, items);
    return;
  }

  if (resolved.kind === 'doc') {
    const doc = docs.find((d) => d.path === resolved.docPath);
    const title = doc?.meta?.titulo || resolved.docPath;
    const urlPath = buildFriendlyUrl(state.activeChannel, 'scripts', resolved.docPath);
    const fullUrl = globalThis.location.protocol.startsWith('http')
      ? `${globalThis.location.origin}${urlPath}`
      : urlPath;

    const items = [
      {
        icon: '↗',
        label: 'Abrir em nova aba',
        action: () => {
          document.querySelectorAll('.modal-backdrop, .drawer-backdrop').forEach((m) => m.classList.add('hidden'));
          openNewTab(
            { kind: 'studio', channel: state.activeChannel, view: 'scripts', docPath: resolved.docPath },
            { activate: true }
          );
        },
      },
      {
        icon: '＋',
        label: 'Abrir em aba (segundo plano)',
        action: () => {
          openNewTab(
            { kind: 'studio', channel: state.activeChannel, view: 'scripts', docPath: resolved.docPath },
            { activate: false }
          );
        },
      },
      { sep: true },
      {
        icon: '📋',
        label: 'Copiar como contexto',
        action: () => {
          const mdText = doc
            ? buildDocContextMarkdown(doc)
            : `- **Arquivo:** \`${resolved.docPath}\`\n- **URL:** ${fullUrl}`;
          copyText(mdText, 'Contexto Markdown copiado!');
        },
      },
      { icon: '🔗', label: 'Copiar link (URL)', action: () => copyText(fullUrl, 'URL copiada!') },
      { icon: '📄', label: 'Copiar caminho do arquivo', action: () => copyText(resolved.docPath, 'Caminho copiado!') },
      { sep: true },
      {
        icon: '◈',
        label: 'Enviar para o Quadro (Excalidraw)',
        action: () => {
          document.querySelectorAll('.modal-backdrop, .drawer-backdrop').forEach((m) => m.classList.add('hidden'));
          if (doc && hooks.sendDocToWhiteboard) hooks.sendDocToWhiteboard(doc);
          else showToast('Documento não encontrado neste workspace.');
        },
      },
    ];
    showStudioContextMenu(e.clientX, e.clientY, title, items);
    return;
  }

  if (resolved.kind === 'board') {
    const targetCh = state.data?.channels?.[resolved.channel] ? resolved.channel : state.activeChannel;
    const list =
      targetCh === state.activeChannel && state.boardsList.length
        ? state.boardsList
        : state.data?.channels?.[targetCh]?.boards || [];
    const boardObj = list.find((b) => b.id === resolved.boardId);
    const bTitle = boardObj?.title || resolved.boardId;
    const urlPath = buildFriendlyUrl(targetCh, 'whiteboard', null, resolved.boardId);
    const fullUrl = globalThis.location.protocol.startsWith('http')
      ? `${globalThis.location.origin}${urlPath}`
      : urlPath;
    const items = [
      {
        icon: '✎',
        label: 'Abrir no Editor Excalidraw',
        action: () => {
          if (targetCh !== state.activeChannel) switchChannel(targetCh, { preserveView: false });
          hooks.openBoardEditor?.(resolved.boardId);
        },
      },
      {
        icon: '↗',
        label: 'Abrir em nova aba',
        action: () =>
          openNewTab(
            { kind: 'studio', channel: targetCh, view: 'whiteboard', boardId: resolved.boardId },
            { activate: true }
          ),
      },
      {
        icon: '＋',
        label: 'Abrir em aba (segundo plano)',
        action: () =>
          openNewTab(
            { kind: 'studio', channel: targetCh, view: 'whiteboard', boardId: resolved.boardId },
            { activate: false }
          ),
      },
      { sep: true },
      { icon: '🔗', label: 'Copiar link (URL)', action: () => copyText(fullUrl, 'URL do quadro copiada!') },
      { icon: '✎', label: 'Renomear quadro', action: () => hooks.openWbBoardModal?.('rename', resolved.boardId) },
      { icon: '🗑', label: 'Excluir quadro', danger: true, action: () => hooks.openWbDeleteConfirmModal?.(resolved.boardId) },
    ];
    showStudioContextMenu(e.clientX, e.clientY, bTitle, items);
    return;
  }

  if (resolved.kind === 'external') {
    const cleanTitle = resolved.title.replace(/\s*↗\s*$/, '').trim() || getHostnameLabel(resolved.url);
    const items = [
      {
        icon: '＋',
        label: 'Abrir na barra de abas (topo)',
        action: () => {
          openNewTab(
            { kind: 'link', channel: state.activeChannel, view: 'link', externalUrl: resolved.url, title: cleanTitle },
            { activate: true }
          );
        },
      },
      {
        icon: '↗',
        label: 'Abrir no navegador (nova guia)',
        action: () => globalThis.open(resolved.url, '_blank', 'noopener,noreferrer'),
      },
      { sep: true },
      {
        icon: '📋',
        label: 'Copiar como contexto',
        action: () => copyText(buildLinkContextMarkdown(cleanTitle, resolved.url), 'Contexto do link copiado!'),
      },
      { icon: '🔗', label: 'Copiar URL', action: () => copyText(resolved.url, 'URL copiada!') },
    ];
    showStudioContextMenu(e.clientX, e.clientY, cleanTitle, items);
    return;
  }

  if (resolved.kind === 'nav') {
    const view = resolved.view;
    const viewTitle = VIEW_TITLES[view] || view;
    const urlPath = buildFriendlyUrl(state.activeChannel, view, null, null);
    const fullUrl = globalThis.location.protocol.startsWith('http')
      ? `${globalThis.location.origin}${urlPath}`
      : urlPath;
    const items = [
      {
        icon: '↗',
        label: 'Abrir página em nova aba',
        action: () => openNewTab({ kind: 'studio', channel: state.activeChannel, view }, { activate: true }),
      },
      {
        icon: '＋',
        label: 'Abrir em aba (segundo plano)',
        action: () => openNewTab({ kind: 'studio', channel: state.activeChannel, view }, { activate: false }),
      },
      { sep: true },
      {
        icon: '📋',
        label: 'Copiar como contexto',
        action: () =>
          copyText(`- **Página:** ${viewTitle} (${chData.channel.name})\n- **URL:** ${fullUrl}`, 'Contexto da página copiado!'),
      },
      { icon: '🔗', label: 'Copiar URL amigável', action: () => copyText(fullUrl, 'URL amigável copiada!') },
    ];
    showStudioContextMenu(e.clientX, e.clientY, `${viewTitle} • ${chData.channel.name}`, items);
  }
}
