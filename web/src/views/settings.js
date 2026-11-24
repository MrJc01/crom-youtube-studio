import { ColorFlowEngine } from '../core/colorflow.js';
import { MD, STORAGE_KEY_PREFS } from '../core/constants.js';
import { openNewWorkspaceModal } from '../core/modals.js';
import {
  syncBrowserUrl,
  updateHeaderChrome,
  updateRemoteChip,
} from '../core/router.js';
import {
  getActiveChannelData,
  getChannelInitials,
  getChannelKeys,
  initSelectedSeriesForChannel,
  normalizePayload,
  registerLifecycleHooks,
  registerViewRenderer,
  state,
} from '../core/state.js';
import {
  copyText,
  loadJsonStorage,
  saveJsonStorage,
  showToast,
} from '../core/utils.js';
import {
  bindSettingsHealthEvents,
  renderSettingsHealthCardHtml,
} from './settings-health.js';

export async function loadRemoteStatus({ quiet = false, rerender = false } = {}) {
  if (!state.serverMode) return null;
  if (!quiet) state.remoteLoading = true;
  try {
    const res = await fetch('/api/remote/status', { cache: 'no-store' });
    const json = await res.json();
    if (res.ok) {
      state.remoteStatus = json;
      updateRemoteChip();
    }
    return state.remoteStatus;
  } catch {
    return null;
  } finally {
    state.remoteLoading = false;
    if (rerender && state.view === 'settings') {
      renderSettingsView(document.getElementById('viewContainer'));
    }
  }
}

export async function loadSettingsConfig({ force = false } = {}) {
  if (!state.serverMode) return null;
  if (!force && state.settingsLoading) return state.settingsConfig;
  if (force) state.trashChannel = '';
  state.settingsLoading = true;
  state.settingsError = null;
  try {
    const [cfgRes] = await Promise.all([
      fetch('/api/config', { cache: 'no-store' }),
      loadRemoteStatus({ quiet: true, rerender: false }),
    ]);
    const json = await cfgRes.json();
    if (!cfgRes.ok) throw new Error(json.error || 'Erro ao carregar configurações');
    state.settingsConfig = json.config;
    if (!state.settingsChannelKey || !state.settingsConfig?.channels?.[state.settingsChannelKey]) {
      state.settingsChannelKey = state.settingsConfig?.channels?.[state.activeChannel]
        ? state.activeChannel
        : (state.settingsConfig?.defaultChannel || state.settingsConfig?.channelOrder?.[0] || null);
    }
    return state.settingsConfig;
  } catch (err) {
    state.settingsError = err.message;
    return null;
  } finally {
    state.settingsLoading = false;
    if (state.view === 'settings') {
      renderSettingsView(document.getElementById('viewContainer'));
    }
  }
}

export function renderSettingsView(container) {
  if (!container) return;

  if (!state.serverMode) {
    container.innerHTML = `
      <section class="settings-layout">
        <div class="settings-card">
          <div class="settings-card-head">
            <h3>Configurações do Workspace</h3>
            <span class="settings-path-badge is-miss">Modo Standalone</span>
          </div>
          <p style="margin:0; font-size:13px; color:var(--text-2); line-height:1.6;">
            A edição de workspaces, pastas locais, banners, links e configurações em <code>config.local.json</code> está disponível apenas com o servidor local ativo:
            <code>./bin/crom-studio --tray</code> (ou <code>npm start</code>).
          </p>
          <div class="settings-form-grid" style="margin-top:6px;">
            <div class="settings-toggle-row settings-field-full">
              <span>Fluxo de Cores Dinâmico</span>
              <label class="switch-inline">
                <input type="checkbox" id="setColorDynamic"${state.color.dynamic ? ' checked' : ''}>
                <span>Ativo</span>
              </label>
            </div>
            <div class="settings-toggle-row settings-field-full">
              <span>Fonte do Leitor / Editor</span>
              <div class="zoom-group">
                <button type="button" id="setFontMinusBtn">A-</button>
                <span id="setFontVal">${state.readerFontSize}px</span>
                <button type="button" id="setFontPlusBtn">A+</button>
              </div>
            </div>
          </div>
        </div>
      </section>
    `;
    const dynChk = document.getElementById('setColorDynamic');
    if (dynChk) {
      dynChk.onchange = (e) => {
        state.color.dynamic = e.target.checked;
        ColorFlowEngine.savePrefs();
        ColorFlowEngine.applyCurrent(performance.now());
        ColorFlowEngine.renderMenu();
      };
    }
    const minusBtn = document.getElementById('setFontMinusBtn');
    const plusBtn = document.getElementById('setFontPlusBtn');
    const setFont = (next) => {
      state.readerFontSize = Math.min(24, Math.max(13, next));
      const prefs = loadJsonStorage(STORAGE_KEY_PREFS, {});
      prefs.readerFontSize = state.readerFontSize;
      saveJsonStorage(STORAGE_KEY_PREFS, prefs);
      const val = document.getElementById('setFontVal');
      if (val) val.textContent = `${state.readerFontSize}px`;
    };
    if (minusBtn) minusBtn.onclick = () => setFont(state.readerFontSize - 1);
    if (plusBtn) plusBtn.onclick = () => setFont(state.readerFontSize + 1);
    return;
  }

  if (!state.settingsConfig && !state.settingsError) {
    if (!state.settingsLoading) loadSettingsConfig();
    container.innerHTML = `<div class="settings-card"><p style="margin:0; color:var(--text-3);">Carregando configurações do Studio...</p></div>`;
    return;
  }

  if (state.settingsError && !state.settingsConfig) {
    container.innerHTML = `
      <div class="settings-card">
        <div class="settings-card-head"><h3>Erro ao carregar configurações</h3></div>
        <p style="margin:0; color:var(--danger);">${MD.escapeHtml(state.settingsError)}</p>
        <div><button type="button" class="btn-sm btn-accent" id="retrySettingsBtn">Tentar novamente</button></div>
      </div>
    `;
    const retryBtn = document.getElementById('retrySettingsBtn');
    if (retryBtn) retryBtn.onclick = () => loadSettingsConfig({ force: true });
    return;
  }

  const cfg = state.settingsConfig;
  const order = cfg.channelOrder || Object.keys(cfg.channels || {});
  if (!state.settingsChannelKey || !cfg.channels[state.settingsChannelKey]) {
    state.settingsChannelKey = cfg.channels[state.activeChannel]
      ? state.activeChannel
      : (cfg.defaultChannel || order[0]);
  }
  const selectedKey = state.settingsChannelKey;
  const ch = cfg.channels[selectedKey] || {};
  const seriesItems = Array.isArray(ch.seriesList) ? ch.seriesList : [];
  const spotSet = new Set(Array.isArray(ch.spotlightSeries) ? ch.spotlightSeries : []);
  const allCheckboxSeries = Array.from(new Set([...seriesItems, ...spotSet]));
  const links = ch.links || {};
  const initials = getChannelInitials(ch);

  const tabsHtml = order
    .map((k) => {
      const item = cfg.channels[k] || {};
      const isAct = k === selectedKey;
      const isPaused = item.status === 'pausado';
      const isHidden = item.status === 'oculto';
      return `
        <button type="button" class="settings-ws-tab${isAct ? ' is-active' : ''}" data-settings-tab="${MD.escapeHtml(k)}">
          <span>${MD.escapeHtml(item.name || k)}</span>
          <span style="font-family:var(--font-mono); font-size:10.5px; color:var(--text-3);">${MD.escapeHtml(k)}</span>
          ${isHidden ? '' : `<span class="channel-status-badge ${isPaused ? 'is-pausado' : 'is-ativo'}">${MD.escapeHtml(item.statusLabel || (isPaused ? 'PAUSADO' : 'ATIVO'))}</span>`}
        </button>
      `;
    })
    .join('');

  if (!state.remoteStatus && !state.remoteLoading) {
    loadRemoteStatus({ quiet: false, rerender: true });
  }
  const rs = state.remoteStatus || {};
  const lanInfo = rs.lan || {};
  const ngrokInfo = rs.ngrok || {};
  const pinInfo = rs.pin || {};
  const lanEnabled = Boolean(rs.lanEnabled ?? lanInfo.enabled);
  const lanUrl = rs.lanUrl || lanInfo.url || '';
  const lanQrSvg = rs.lanQrSvg || lanInfo.qrSvg || '';
  const ngrokActive = Boolean(rs.ngrokActive ?? ngrokInfo.active);
  const ngrokUrl = rs.ngrokUrl || ngrokInfo.url || '';
  const ngrokQrSvg = rs.ngrokQrSvg || ngrokInfo.qrSvg || '';
  const hasNgrokToken = Boolean(rs.hasNgrokAuthtoken ?? ngrokInfo.hasAuthtoken);
  const pinEnabled = Boolean(rs.pinEnabled ?? pinInfo.enabled);
  const pinConfigured = Boolean(rs.pinConfigured ?? pinInfo.configured);

  container.innerHTML = `
    <section class="settings-layout">
      <div class="section-subhead" style="margin:0;">
        <div class="settings-ws-tabs">${tabsHtml}</div>
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          <button type="button" class="btn-sm" id="settingsNewWsBtn">+ Novo Workspace</button>
          <button type="button" class="btn-primary" id="settingsSaveBtn">💾 Salvar Configurações</button>
        </div>
      </div>

      <div class="settings-grid">
        <!-- Card 1: Identidade, Status & Métricas -->
        <div class="settings-card">
          <div class="settings-card-head">
            <h3>1. Identidade, Status & Métricas</h3>
            <span style="font-family:var(--font-mono); font-size:11px; color:var(--text-3);">chave: ${MD.escapeHtml(selectedKey)}</span>
          </div>

          <div class="settings-avatar-preview">
            <img id="setAvatarPreview" src="${MD.escapeHtml(ch.avatar || '')}" alt="${MD.escapeHtml(ch.name || selectedKey)}" referrerpolicy="no-referrer" style="${ch.avatar ? '' : 'display:none;'}" onerror="this.style.display='none'; document.getElementById('setAvatarFallback').style.display='grid';">
            <div id="setAvatarFallback" style="width:44px; height:44px; border-radius:999px; background:rgba(var(--accent-rgb),0.2); border:1px solid var(--border-strong); display:${ch.avatar ? 'none' : 'grid'}; place-items:center; font-weight:700; flex-shrink:0;">${MD.escapeHtml(initials)}</div>
            <div style="min-width:0; flex:1;">
              <div style="font-weight:600; font-size:13.5px;" id="setPreviewName">${MD.escapeHtml(ch.name || selectedKey)}</div>
              <div style="font-family:var(--font-mono); font-size:11px; color:var(--text-3);" id="setPreviewHandle">${MD.escapeHtml(ch.handle || '')}</div>
            </div>
          </div>

          <div class="settings-form-grid">
            <label>
              <span>Nome de exibição</span>
              <input type="text" id="setWsName" value="${MD.escapeHtml(ch.name || '')}">
            </label>
            <label>
              <span>Handle (@canal)</span>
              <input type="text" id="setWsHandle" value="${MD.escapeHtml(ch.handle || '')}">
            </label>
            <label>
              <span>YouTube Channel ID</span>
              <input type="text" id="setWsChannelId" value="${MD.escapeHtml(ch.channelId || '')}" placeholder="UC...">
            </label>
            <label>
              <span>URL do Canal</span>
              <input type="text" id="setWsUrl" value="${MD.escapeHtml(ch.url || '')}">
            </label>
            <label class="settings-field-full">
              <span>URL do Avatar</span>
              <input type="text" id="setWsAvatar" value="${MD.escapeHtml(ch.avatar || '')}" placeholder="https://...">
            </label>
            <label class="settings-field-full">
              <span>Bio / Descrição</span>
              <textarea id="setWsBio" rows="2">${MD.escapeHtml(ch.bio || '')}</textarea>
            </label>
            <label>
              <span>Status</span>
              <select id="setWsStatus">
                <option value="ativo"${ch.status === 'ativo' ? ' selected' : ''}>Ativo</option>
                <option value="pausado"${ch.status === 'pausado' ? ' selected' : ''}>Pausado / Offline</option>
                <option value="oculto"${ch.status === 'oculto' ? ' selected' : ''}>Oculto (sem badge/ponto)</option>
              </select>
            </label>
            <label>
              <span>Rótulo do Status (statusLabel)</span>
              <input type="text" id="setWsStatusLabel" value="${MD.escapeHtml(ch.statusLabel || '')}" placeholder="Ex.: Ativo, Pausado...">
            </label>
            <label>
              <span>Inscritos</span>
              <input type="number" id="setWsSubscribers" min="0" value="${Number(ch.subscribers || 0)}">
            </label>
            <label>
              <span>Total de Vídeos Públicos</span>
              <input type="number" id="setWsTotalVideos" min="0" value="${ch.totalVideos !== null && ch.totalVideos !== undefined ? Number(ch.totalVideos) : ''}" placeholder="auto">
            </label>
          </div>
        </div>

        <!-- Card 2: Banner da Visão Geral -->
        <div class="settings-card">
          <div class="settings-card-head">
            <h3>2. Banner da Visão Geral</h3>
          </div>
          <div class="settings-toggle-row">
            <div>
              <div style="font-size:12.5px; font-weight:600; color:var(--text-1);">Exibir banner na Visão Geral</div>
              <div style="font-size:11px; color:var(--text-3);">Mostra aviso ou destaque configurável no topo do Dashboard deste workspace.</div>
            </div>
            <label class="switch-inline">
              <input type="checkbox" id="setBannerEnabled"${ch.bannerEnabled ? ' checked' : ''}>
              <span>Ativado</span>
            </label>
          </div>
          <div class="settings-form-grid">
            <label>
              <span>Badge do Banner</span>
              <input type="text" id="setBannerBadge" value="${MD.escapeHtml(ch.bannerBadge || '')}" placeholder="Ex.: PAUSADO, NOVO...">
            </label>
            <label>
              <span>Doc vinculado (opcional)</span>
              <input type="text" id="setBannerDocPath" value="${MD.escapeHtml(ch.bannerDocPath || '')}" placeholder="Ex.: 00-canal/identidade-e-status.md">
            </label>
            <label class="settings-field-full">
              <span>Título do Banner</span>
              <input type="text" id="setBannerTitle" value="${MD.escapeHtml(ch.bannerTitle || '')}" placeholder="Título principal exibido no banner">
            </label>
            <label class="settings-field-full">
              <span>Subtítulo / Descrição do Banner</span>
              <textarea id="setBannerSubtitle" rows="3" placeholder="Detalhes contextuais do banner...">${MD.escapeHtml(ch.bannerSubtitle || '')}</textarea>
            </label>
          </div>
        </div>

        <!-- Card 3: Pastas, Séries & Links -->
        <div class="settings-card">
          <div class="settings-card-head">
            <h3>3. Pastas, Séries & Links</h3>
            <span class="settings-path-badge ${ch.workspaceExists ? 'is-ok' : 'is-miss'}">${ch.workspaceExists ? '✓ Pasta no disco OK' : '✕ Pasta não encontrada'}</span>
          </div>
          <div class="settings-form-grid">
            <label class="settings-field-full">
              <span>Caminho da Pasta do Workspace</span>
              <input type="text" id="setWsPath" value="${MD.escapeHtml(ch.workspacePathRaw || ch.workspacePath || '')}" required>
            </label>
            <label class="settings-field-full">
              <span>Subpasta Kdenlive</span>
              <input type="text" id="setWsKdenliveFolder" value="${MD.escapeHtml(ch.kdenliveFolder || 'videos')}">
            </label>
            <label class="settings-field-full">
              <span>Séries do Workspace (uma por linha)</span>
              <textarea id="setWsSeriesList" rows="4">${MD.escapeHtml(seriesItems.join('\n'))}</textarea>
            </label>
            <div class="settings-field-full">
              <span>Séries em Destaque na Visão Geral (Spotlight)</span>
              <div class="settings-series-checks" id="setSpotlightChecks">
                ${allCheckboxSeries.length
                  ? allCheckboxSeries
                      .map(
                        (s) => `
                          <label class="settings-series-chk">
                            <input type="checkbox" name="setSpotlightSerie" value="${MD.escapeHtml(s)}"${spotSet.has(s) ? ' checked' : ''}>
                            <span>${MD.escapeHtml(s)}</span>
                          </label>
                        `
                      )
                      .join('')
                  : '<span style="font-size:11.5px; color:var(--text-3);">Adicione séries acima para selecionar destaques.</span>'}
              </div>
            </div>
            <label>
              <span>GitHub</span>
              <input type="text" id="setLinkGithub" value="${MD.escapeHtml(links.github || '')}" placeholder="https://github.com/...">
            </label>
            <label>
              <span>Hub / Site</span>
              <input type="text" id="setLinkHub" value="${MD.escapeHtml(links.hub || '')}" placeholder="https://...">
            </label>
            <label>
              <span>TabNews</span>
              <input type="text" id="setLinkTabnews" value="${MD.escapeHtml(links.tabnews || '')}">
            </label>
            <label>
              <span>Medium</span>
              <input type="text" id="setLinkMedium" value="${MD.escapeHtml(links.medium || '')}">
            </label>
            <label>
              <span>TikTok</span>
              <input type="text" id="setLinkTiktok" value="${MD.escapeHtml(links.tiktok || '')}">
            </label>
            <label>
              <span>X / Twitter</span>
              <input type="text" id="setLinkX" value="${MD.escapeHtml(links.x || '')}">
            </label>
          </div>
        </div>

        <!-- Card 4: Global & Aparência -->
        <div class="settings-card">
          <div class="settings-card-head">
            <h3>4. Global & Aparência</h3>
            <span style="font-family:var(--font-mono); font-size:11px; color:var(--text-3);">${MD.escapeHtml(cfg.writableFile || 'config.local.json')}</span>
          </div>
          <div class="settings-form-grid">
            <label>
              <span>Workspace Padrão</span>
              <select id="setDefaultChannel">
                ${order
                  .map((k) => `<option value="${MD.escapeHtml(k)}"${cfg.defaultChannel === k ? ' selected' : ''}>${MD.escapeHtml(cfg.channels[k]?.name || k)} (${MD.escapeHtml(k)})</option>`)
                  .join('')}
              </select>
            </label>
            <div>
              <span>Status da Fábrica Kdenlive</span>
              <div style="padding-top:4px;">
                <span class="settings-path-badge ${cfg.kdenliveExists ? 'is-ok' : 'is-miss'}">${cfg.kdenliveExists ? '✓ Kdenlive encontrado' : '✕ Pasta Kdenlive ausente'}</span>
              </div>
            </div>
            <label class="settings-field-full">
              <span>Kdenlive Root (kdenliveRoot)</span>
              <input type="text" id="setKdenliveRoot" value="${MD.escapeHtml(cfg.kdenliveRootRaw || cfg.kdenliveRoot || '')}">
            </label>
            <label>
              <span>Host</span>
              <input type="text" id="setHost" value="${MD.escapeHtml(cfg.host || '127.0.0.1')}">
            </label>
            <label>
              <span>Porta</span>
              <input type="number" id="setPort" min="1024" max="65535" value="${Number(cfg.port || 4173)}">
            </label>
          </div>

          <div class="settings-toggle-row" id="settingsRestartAlert" style="background:rgba(245,185,66,0.08); border-color:rgba(245,185,66,0.28); font-size:11.5px; color:#ffd479;">
            <span>Alterações em <strong>Host</strong> ou <strong>Porta</strong> exigem reiniciar o servidor para entrar em vigor.</span>
          </div>

          <div class="settings-toggle-row">
            <div>
              <div style="font-size:12.5px; font-weight:600; color:var(--text-1);">ColorFlow Dinâmico</div>
              <div style="font-size:11px; color:var(--text-3);">Transição suave das cores de destaque e aurora.</div>
            </div>
            <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
              <label class="switch-inline">
                <input type="checkbox" id="setColorDynamic"${state.color.dynamic ? ' checked' : ''}>
                <span>Ativo</span>
              </label>
              <div class="seg-mini" id="setColorSpeedGroup">
                <button type="button" data-speed="slow" class="${state.color.speed === 'slow' ? 'active' : ''}">Ultra Suave</button>
                <button type="button" data-speed="medium" class="${state.color.speed === 'medium' ? 'active' : ''}">Suave</button>
                <button type="button" data-speed="fast" class="${state.color.speed === 'fast' ? 'active' : ''}">Vivo</button>
              </div>
            </div>
          </div>

          <div class="settings-toggle-row">
            <span>Tamanho da fonte no Leitor / Editor</span>
            <div class="zoom-group">
              <button type="button" id="setFontMinusBtn">A-</button>
              <span id="setFontVal">${state.readerFontSize}px</span>
              <button type="button" id="setFontPlusBtn">A+</button>
            </div>
          </div>

          <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:4px;">
            <button type="button" class="btn-sm" id="settingsSyncWorkspaceBtn">↻ Sync Workspace</button>
            <button type="button" class="btn-sm" id="settingsSyncRssBtn">↻ Sync RSS (${MD.escapeHtml(selectedKey)})</button>
          </div>
        </div>

        <!-- Card 5: Acesso Remoto (Wi-Fi Local, ngrok & QR Code) -->
        <div class="settings-card remote-card" id="settingsRemoteCard">
          <div class="settings-card-head">
            <h3>5. Acesso Remoto (Wi-Fi Local, ngrok & QR Code)</h3>
            <button type="button" class="btn-sm" id="remoteRefreshBtn">↻ Atualizar Status</button>
          </div>

          <div class="remote-blocks-grid">
            <!-- Bloco Wi-Fi Local -->
            <div class="remote-block">
              <div class="remote-block-head">
                <strong style="font-size:13.5px;">📶 Wi-Fi Local (Rede Interna)</strong>
                <span class="settings-path-badge ${lanEnabled ? 'is-ok' : 'is-miss'}">${lanEnabled ? 'Ativo' : 'Desligado'}</span>
              </div>
              <p style="margin:0; font-size:12px; color:var(--text-2); line-height:1.45;">
                O celular precisa estar conectado na <strong>mesma rede Wi-Fi</strong> deste computador.
              </p>
              <div style="display:flex; gap:8px; flex-wrap:wrap;">
                <button type="button" class="btn-sm ${lanEnabled ? 'btn-danger' : 'btn-accent'}" id="remoteLanToggleBtn">
                  ${lanEnabled ? '⏹ Desligar Wi-Fi LAN' : '▶ Ligar Wi-Fi LAN'}
                </button>
              </div>
              ${lanInfo.error ? `<div style="font-size:11.5px; color:var(--danger);">${MD.escapeHtml(lanInfo.error)}</div>` : ''}
              ${lanEnabled && lanUrl
                ? `
                  <div class="remote-url-box">
                    <a href="${MD.escapeHtml(lanUrl)}" target="_blank" rel="noopener noreferrer">${MD.escapeHtml(lanUrl)}</a>
                    <button type="button" class="kc-move-btn" id="remoteCopyLanBtn">Copiar</button>
                  </div>
                  ${lanQrSvg ? `<div class="remote-qr-box" id="remoteLanQrBox" aria-label="QR Code Wi-Fi LAN">${lanQrSvg}</div>` : ''}
                `
                : '<div style="font-size:11.5px; color:var(--text-3);">Ative para gerar o link local e o QR Code escaneável no celular.</div>'}
            </div>

            <!-- Bloco Túnel Público (ngrok) -->
            <div class="remote-block">
              <div class="remote-block-head">
                <strong style="font-size:13.5px;">🌐 Túnel Público (ngrok)</strong>
                <span class="settings-path-badge ${ngrokActive ? 'is-ok' : 'is-miss'}">${ngrokActive ? 'Túnel ON' : 'Desligado'}</span>
              </div>
              <label style="display:flex; flex-direction:column; gap:4px; font-size:12px; color:var(--text-2);">
                <span>Authtoken ngrok (opcional)</span>
                <input type="password" id="remoteNgrokTokenInput" autocomplete="off" placeholder="${hasNgrokToken ? 'Authtoken configurado (preencha só para alterar)' : 'Cole seu Authtoken do ngrok.com'}" style="width:100%; box-sizing:border-box; padding:8px 10px; border-radius:8px; background:var(--bg-input); border:1px solid var(--border); font-size:12px;">
              </label>
              <div style="display:flex; gap:8px; flex-wrap:wrap;">
                ${ngrokActive
                  ? `<button type="button" class="btn-ngrok-stop" id="remoteNgrokStopBtn">⏹ Desligar ngrok</button>`
                  : `<button type="button" class="btn-ngrok-start" id="remoteNgrokStartBtn">▶ Ativar ngrok</button>`}
              </div>
              ${ngrokInfo.error ? `<div style="font-size:11.5px; color:var(--danger);">${MD.escapeHtml(ngrokInfo.error)}</div>` : ''}
              ${ngrokActive && ngrokUrl
                ? `
                  <div class="remote-url-box">
                    <a href="${MD.escapeHtml(ngrokUrl)}" target="_blank" rel="noopener noreferrer">${MD.escapeHtml(ngrokUrl)}</a>
                    <button type="button" class="kc-move-btn" id="remoteCopyNgrokBtn">Copiar</button>
                  </div>
                  ${ngrokQrSvg ? `<div class="remote-qr-box" id="remoteNgrokQrBox" aria-label="QR Code Túnel ngrok">${ngrokQrSvg}</div>` : ''}
                `
                : `<div style="font-size:11.5px; color:var(--text-3);">${ngrokInfo.available === false ? 'Binário ngrok não encontrado no sistema.' : 'Gera um endereço HTTPS público temporário para acessar de qualquer lugar.'}</div>`}
            </div>

            <!-- Bloco PIN de Acesso Remoto -->
            <div class="remote-block">
              <div class="remote-block-head">
                <strong style="font-size:13.5px;">🔐 PIN de Acesso Remoto</strong>
                <span class="settings-path-badge ${pinEnabled && pinConfigured ? 'is-ok' : 'is-miss'}">${pinEnabled && pinConfigured ? 'Protegido' : 'Livre'}</span>
              </div>
              <p style="margin:0; font-size:12px; color:var(--text-2); line-height:1.45;">
                O acesso local em <code>127.0.0.1</code> nunca pede PIN. Apenas conexões via Wi-Fi LAN ou ngrok solicitam desbloqueio.
              </p>
              <label class="switch-inline" style="font-size:12.5px; color:var(--text-1);">
                <input type="checkbox" id="remotePinEnabledChk"${pinEnabled ? ' checked' : ''}>
                <span>Ativar proteção por PIN</span>
              </label>
              <label style="display:flex; flex-direction:column; gap:4px; font-size:12px; color:var(--text-2);">
                <span>PIN (4–8 dígitos)</span>
                <input type="password" inputmode="numeric" maxlength="8" id="remotePinInput" autocomplete="new-password" placeholder="${pinConfigured ? 'PIN já configurado (digite novo para alterar)' : 'Ex.: 2026'}" style="width:100%; box-sizing:border-box; padding:8px 10px; border-radius:8px; background:var(--bg-input); border:1px solid var(--border); font-size:12.5px;">
              </label>
              <div style="display:flex; gap:8px; flex-wrap:wrap;">
                <button type="button" class="btn-sm btn-accent" id="remotePinSaveBtn">Salvar PIN</button>
                ${pinConfigured ? '<button type="button" class="btn-sm btn-danger" id="remotePinClearBtn">Limpar PIN</button>' : ''}
              </div>
            </div>
          </div>
        </div>

        <!-- Card 6: Saúde (Doctor), Backup Portátil & Lixeira (30 dias) -->
        ${renderSettingsHealthCardHtml(selectedKey)}
      </div>

      <div class="settings-danger-zone">
        <div>
          <strong style="font-size:13px; color:#fda4af;">Zona de Perigo — Remover Workspace da Configuração</strong>
          <div style="font-size:11.5px; color:var(--text-2); margin-top:2px;">
            Remove apenas a entrada <code>${MD.escapeHtml(selectedKey)}</code> do <code>${MD.escapeHtml(cfg.writableFile || 'config.local.json')}</code>. Os arquivos <code>.md</code> no disco <strong>não</strong> são apagados.
          </div>
        </div>
        <button type="button" class="btn-sm btn-danger" id="settingsDeleteWsBtn"${order.length <= 1 ? ' disabled title="Não é possível remover o único workspace"' : ''}>Remover Workspace</button>
      </div>
    </section>
  `;

  container.querySelectorAll('[data-settings-tab]').forEach((btn) => {
    btn.onclick = () => {
      state.settingsChannelKey = btn.dataset.settingsTab;
      renderSettingsView(container);
    };
  });

  const newWsBtn = document.getElementById('settingsNewWsBtn');
  if (newWsBtn) newWsBtn.onclick = () => openNewWorkspaceModal();

  const avatarInp = document.getElementById('setWsAvatar');
  const avatarPrev = document.getElementById('setAvatarPreview');
  const avatarFb = document.getElementById('setAvatarFallback');
  if (avatarInp && avatarPrev && avatarFb) {
    avatarInp.oninput = () => {
      const url = avatarInp.value.trim();
      if (url) {
        avatarPrev.style.display = 'block';
        avatarFb.style.display = 'none';
        avatarPrev.src = url;
      } else {
        avatarPrev.style.display = 'none';
        avatarFb.style.display = 'grid';
      }
    };
  }

  const wsNameInp = document.getElementById('setWsName');
  if (wsNameInp) {
    wsNameInp.oninput = () => {
      const nm = document.getElementById('setPreviewName');
      if (nm) nm.textContent = wsNameInp.value.trim() || selectedKey;
      if (avatarFb) avatarFb.textContent = (wsNameInp.value.trim() || selectedKey).slice(0, 2).toUpperCase();
    };
  }
  const wsHandleInp = document.getElementById('setWsHandle');
  if (wsHandleInp) {
    wsHandleInp.oninput = () => {
      const hd = document.getElementById('setPreviewHandle');
      if (hd) hd.textContent = wsHandleInp.value.trim();
    };
  }

  const seriesTextarea = document.getElementById('setWsSeriesList');
  const spotContainer = document.getElementById('setSpotlightChecks');
  if (seriesTextarea && spotContainer) {
    seriesTextarea.oninput = () => {
      const checkedNow = new Set(
        Array.from(spotContainer.querySelectorAll('input[name="setSpotlightSerie"]:checked')).map((el) => el.value)
      );
      const list = seriesTextarea.value
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean);
      spotContainer.innerHTML = list.length
        ? list
            .map(
              (s) => `
                <label class="settings-series-chk">
                  <input type="checkbox" name="setSpotlightSerie" value="${MD.escapeHtml(s)}"${checkedNow.has(s) ? ' checked' : ''}>
                  <span>${MD.escapeHtml(s)}</span>
                </label>
              `
            )
            .join('')
        : '<span style="font-size:11.5px; color:var(--text-3);">Adicione séries acima para selecionar destaques.</span>';
    };
  }

  const colorDynChk = document.getElementById('setColorDynamic');
  if (colorDynChk) {
    colorDynChk.onchange = (e) => {
      state.color.dynamic = e.target.checked;
      ColorFlowEngine.savePrefs();
      ColorFlowEngine.applyCurrent(performance.now());
      ColorFlowEngine.renderMenu();
    };
  }
  container.querySelectorAll('#setColorSpeedGroup button').forEach((btn) => {
    btn.onclick = () => {
      state.color.speed = btn.dataset.speed;
      state.color.dynamic = true;
      ColorFlowEngine.savePrefs();
      ColorFlowEngine.applyCurrent(performance.now());
      ColorFlowEngine.renderMenu();
      renderSettingsView(container);
    };
  });

  const setFont = (next) => {
    state.readerFontSize = Math.min(24, Math.max(13, next));
    const prefs = loadJsonStorage(STORAGE_KEY_PREFS, {});
    prefs.readerFontSize = state.readerFontSize;
    saveJsonStorage(STORAGE_KEY_PREFS, prefs);
    const valEl = document.getElementById('setFontVal');
    if (valEl) valEl.textContent = `${state.readerFontSize}px`;
  };
  const fMinus = document.getElementById('setFontMinusBtn');
  const fPlus = document.getElementById('setFontPlusBtn');
  if (fMinus) fMinus.onclick = () => setFont(state.readerFontSize - 1);
  if (fPlus) fPlus.onclick = () => setFont(state.readerFontSize + 1);

  const syncWsBtn = document.getElementById('settingsSyncWorkspaceBtn');
  if (syncWsBtn) {
    syncWsBtn.onclick = async () => {
      try {
        const res = await fetch('/api/state', { cache: 'no-store' });
        const fresh = await res.json();
        if (!res.ok) throw new Error(fresh.error || 'Erro ao reindexar');
        state.data = normalizePayload(fresh);
        await loadSettingsConfig({ force: true });
        updateHeaderChrome();
        showToast('Workspace reindexado com sucesso!');
      } catch (err) {
        showToast(err.message);
      }
    };
  }

  const syncRssBtn = document.getElementById('settingsSyncRssBtn');
  if (syncRssBtn) {
    syncRssBtn.onclick = async () => {
      showToast(`Consultando RSS de ${selectedKey}...`);
      try {
        const res = await fetch('/api/sync-youtube', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ channel: selectedKey }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Erro no sync RSS');
        if (json.state) state.data = normalizePayload(json.state);
        updateHeaderChrome();
        showToast(json.warning || `RSS sincronizado (${json.updatedCount || 0} vídeos).`);
      } catch (err) {
        showToast(err.message);
      }
    };
  }

  const saveBtn = document.getElementById('settingsSaveBtn');
  if (saveBtn) {
    saveBtn.onclick = async () => {
      const seriesList = (document.getElementById('setWsSeriesList')?.value || '')
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean);
      const seriesSet = new Set(seriesList);
      const spotlightSeries = Array.from(
        container.querySelectorAll('input[name="setSpotlightSerie"]:checked')
      )
        .map((el) => el.value)
        .filter((s) => seriesSet.size === 0 || seriesSet.has(s));

      const totalVidRaw = (document.getElementById('setWsTotalVideos')?.value || '').trim();
      const linksPayload = {
        github: document.getElementById('setLinkGithub')?.value.trim() || '',
        hub: document.getElementById('setLinkHub')?.value.trim() || '',
        tabnews: document.getElementById('setLinkTabnews')?.value.trim() || '',
        medium: document.getElementById('setLinkMedium')?.value.trim() || '',
        tiktok: document.getElementById('setLinkTiktok')?.value.trim() || '',
        x: document.getElementById('setLinkX')?.value.trim() || '',
      };

      const payload = {
        defaultChannel: document.getElementById('setDefaultChannel')?.value,
        kdenliveRootRaw: document.getElementById('setKdenliveRoot')?.value.trim(),
        host: document.getElementById('setHost')?.value.trim(),
        port: Number(document.getElementById('setPort')?.value),
        channelKey: selectedKey,
        channelData: {
          name: document.getElementById('setWsName')?.value.trim(),
          handle: document.getElementById('setWsHandle')?.value.trim(),
          channelId: document.getElementById('setWsChannelId')?.value.trim(),
          url: document.getElementById('setWsUrl')?.value.trim(),
          avatar: document.getElementById('setWsAvatar')?.value.trim(),
          bio: document.getElementById('setWsBio')?.value.trim(),
          status: document.getElementById('setWsStatus')?.value,
          statusLabel: document.getElementById('setWsStatusLabel')?.value.trim(),
          subscribers: Number(document.getElementById('setWsSubscribers')?.value || 0),
          totalVideos: totalVidRaw === '' ? null : Number(totalVidRaw),
          bannerEnabled: Boolean(document.getElementById('setBannerEnabled')?.checked),
          bannerBadge: document.getElementById('setBannerBadge')?.value.trim(),
          bannerTitle: document.getElementById('setBannerTitle')?.value.trim(),
          bannerSubtitle: document.getElementById('setBannerSubtitle')?.value.trim(),
          bannerDocPath: document.getElementById('setBannerDocPath')?.value.trim(),
          workspacePathRaw: document.getElementById('setWsPath')?.value.trim(),
          kdenliveFolder: document.getElementById('setWsKdenliveFolder')?.value.trim(),
          seriesList,
          spotlightSeries,
          links: linksPayload,
        },
      };

      try {
        const res = await fetch('/api/config', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Erro ao salvar configurações');
        state.settingsConfig = json.config;
        state.data = normalizePayload(json.state);
        initSelectedSeriesForChannel(getActiveChannelData());
        updateHeaderChrome();
        renderSettingsView(container);
        showToast(
          json.restartRequired
            ? 'Configurações salvas! Reinicie o servidor para aplicar o novo Host/Porta.'
            : `Configurações salvas em ${json.config?.writableFile || 'config.local.json'}!`
        );
      } catch (err) {
        showToast(err.message);
      }
    };
  }

  const delWsBtn = document.getElementById('settingsDeleteWsBtn');
  if (delWsBtn) {
    delWsBtn.onclick = async () => {
      if (order.length <= 1) return;
      if (
        !confirm(
          `Remover o workspace "${ch.name || selectedKey}" (${selectedKey}) das configurações do Studio?\n\nNenhum arquivo .md no disco será apagado.`
        )
      ) {
        return;
      }
      try {
        const res = await fetch(`/api/config/channels?key=${encodeURIComponent(selectedKey)}`, {
          method: 'DELETE',
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Erro ao remover workspace');
        state.settingsConfig = json.config;
        state.data = normalizePayload(json.state);
        if (state.activeChannel === selectedKey) {
          state.activeChannel = state.data?.defaultChannel || getChannelKeys()[0] || 'mrj';
          state.selectedDocPath = null;
          state.activeVersion = 'principal';
          state.versionHistory = null;
          state.versionFetchedKey = '';
          state.dirtyBody = null;
          state.dirtyMeta = null;
          state.hasUnsavedEdits = false;
          initSelectedSeriesForChannel(getActiveChannelData());
          syncBrowserUrl({ replace: true });
        }
        state.settingsChannelKey = state.activeChannel;
        state.trashChannel = '';
        updateHeaderChrome();
        renderSettingsView(container);
        showToast(`Workspace "${selectedKey}" removido da configuração (arquivos preservados no disco).`);
      } catch (err) {
        showToast(err.message);
      }
    };
  }

  // Bindings Card 5: Acesso Remoto
  document.getElementById('remoteRefreshBtn')?.addEventListener('click', () => loadRemoteStatus({ quiet: false, rerender: true }));
  document.getElementById('remoteCopyLanBtn')?.addEventListener('click', () => {
    if (lanUrl) copyText(lanUrl, 'URL Wi-Fi LAN copiada!');
  });
  document.getElementById('remoteCopyNgrokBtn')?.addEventListener('click', () => {
    if (ngrokUrl) copyText(ngrokUrl, 'URL pública ngrok copiada!');
  });

  document.getElementById('remoteLanToggleBtn')?.addEventListener('click', async () => {
    try {
      const res = await fetch('/api/remote/lan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !lanEnabled }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Erro ao alternar Wi-Fi LAN');
      state.remoteStatus = json;
      if (json.config) state.settingsConfig = json.config;
      updateRemoteChip();
      renderSettingsView(container);
      showToast(json.lanEnabled ? `Wi-Fi LAN ligado em ${json.lanUrl}` : 'Wi-Fi LAN desligado.');
    } catch (err) {
      showToast(err.message);
    }
  });

  document.getElementById('remoteNgrokStartBtn')?.addEventListener('click', async () => {
    const tokenVal = document.getElementById('remoteNgrokTokenInput')?.value.trim() || '';
    showToast('Iniciando túnel ngrok...');
    try {
      const res = await fetch('/api/remote/ngrok/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tokenVal ? { authtoken: tokenVal } : {}),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.hint ? `${json.error} (${json.hint})` : (json.error || 'Erro ao ativar ngrok'));
      state.remoteStatus = json;
      if (json.config) state.settingsConfig = json.config;
      updateRemoteChip();
      renderSettingsView(container);
      showToast(`Túnel ngrok ativo: ${json.ngrokUrl}`);
    } catch (err) {
      showToast(err.message);
    }
  });

  document.getElementById('remoteNgrokStopBtn')?.addEventListener('click', async () => {
    try {
      const res = await fetch('/api/remote/ngrok/stop', { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Erro ao desligar ngrok');
      state.remoteStatus = json;
      updateRemoteChip();
      renderSettingsView(container);
      showToast('Túnel ngrok desligado!');
    } catch (err) {
      showToast(err.message);
    }
  });

  document.getElementById('remotePinSaveBtn')?.addEventListener('click', async () => {
    const enabled = Boolean(document.getElementById('remotePinEnabledChk')?.checked);
    const pinRaw = document.getElementById('remotePinInput')?.value.trim() || '';
    if (pinRaw && (pinRaw.length < 4 || pinRaw.length > 8)) {
      showToast('O PIN deve ter entre 4 e 8 dígitos/caracteres.');
      return;
    }
    if (enabled && !pinConfigured && !pinRaw) {
      showToast('Defina um PIN de 4 a 8 dígitos para ativar a proteção.');
      return;
    }
    try {
      const res = await fetch('/api/remote/pin', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pinEnabled: enabled,
          ...(pinRaw ? { pinCode: pinRaw } : {}),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Erro ao salvar PIN');
      state.remoteStatus = json;
      if (json.config) state.settingsConfig = json.config;
      updateRemoteChip();
      renderSettingsView(container);
      showToast(enabled ? 'Proteção por PIN ativada!' : 'PIN atualizado (proteção desativada).');
    } catch (err) {
      showToast(err.message);
    }
  });

  document.getElementById('remotePinClearBtn')?.addEventListener('click', async () => {
    try {
      const res = await fetch('/api/remote/pin', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pinEnabled: false, clearPin: true }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Erro ao limpar PIN');
      state.remoteStatus = json;
      if (json.config) state.settingsConfig = json.config;
      updateRemoteChip();
      renderSettingsView(container);
      showToast('PIN removido.');
    } catch (err) {
      showToast(err.message);
    }
  });

  // Bindings Card 6: Saúde, Backup & Lixeira
  bindSettingsHealthEvents(container, selectedKey, { autoFetchTrash: true });
}

registerViewRenderer('settings', renderSettingsView);
registerLifecycleHooks({ loadRemoteStatus, loadSettingsConfig });
