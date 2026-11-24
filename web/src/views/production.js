import { MD } from '../core/constants.js';
import { setView } from '../core/router.js';
import { getActiveChannelData, registerViewRenderer, state } from '../core/state.js';
import { copyText, formatDatePt, showToast } from '../core/utils.js';

export function renderProductionView(container) {
  const chData = getActiveChannelData();
  const docs = chData.docs || [];
  const scheduled = docs
    .filter((d) => d.meta.data_alvo && d.meta.status !== 'publicado')
    .sort((a, b) => a.meta.data_alvo.localeCompare(b.meta.data_alvo));

  const prodDocs = docs.filter(
    (d) =>
      d.topFolder === '04-producao' ||
      d.path === '00-canal/ponte-kdenlive.md' ||
      d.path === '00-canal/identidade-e-status.md'
  );
  const kitDoc = docs.find((d) => d.path === '04-producao/kit-descricao-e-links.md');
  const rightDoc =
    kitDoc ||
    docs.find((d) => d.path === '00-canal/ponte-kdenlive.md') ||
    docs.find((d) => d.path === '00-canal/identidade-e-posicionamento.md');

  const kdenlive = state.data?.kdenlive || {};
  const modelos = kdenlive.modelos || [];
  const estilos = kdenlive.estilos || [];
  const kdenliveVideos = chData.key === 'mrj' ? kdenlive.videosMrj || [] : kdenlive.videosCrom || [];

  const kdenliveBridgeHtml = kdenlive.available
    ? `
      <section class="kdenlive-section">
        <div class="section-subhead">
          <div>
            <h2 class="panel-title" style="font-size:16px;">Ponte Kdenlive — ${MD.escapeHtml(kdenlive.root)}</h2>
            <span style="font-size:12px; color:var(--text-3);">Modelos de produção, estilos visuais (<code>estilos/*.md</code>) e projetos de vídeo para <strong>${MD.escapeHtml(chData.channel.name)}</strong>.</span>
          </div>
          <button type="button" class="btn-sm btn-kdenlive" id="copyKdenliveBaseCmdBtn">Copiar ./criar_video.sh --canal ${MD.escapeHtml(chData.key)}</button>
        </div>

        <h3 style="font-size:13px; color:var(--text-2); margin: 8px 0 10px;">Modelos de Vídeo (canal.json)</h3>
        <div class="cards-grid-3" style="margin-bottom: 20px;">
          ${modelos
            .map((m) => {
              const baseCmd = (m.comando || []).join('\n');
              const adaptedCmd =
                m.nome === 'ensaio' ? `./criar_video.sh --canal ${chData.key} <slug>` : baseCmd;
              return `
                <div class="glass-card">
                  <div class="gc-top">
                    <span class="status-pill st-roteiro">${MD.escapeHtml(m.nome)}</span>
                    <span style="font-family:var(--font-mono); font-size:11px; color:var(--text-3);">${MD.escapeHtml(m.velocidade || '')}</span>
                  </div>
                  <p class="gc-desc">${MD.escapeHtml(m.quando_usar || '')}</p>
                  <div class="kdenlive-cmd-box">${MD.escapeHtml(adaptedCmd)}</div>
                  <div class="gc-actions">
                    <button type="button" class="btn-sm" data-copy-text="${MD.escapeHtml(adaptedCmd)}">Copiar Comando</button>
                  </div>
                </div>
              `;
            })
            .join('')}
        </div>

        <h3 style="font-size:13px; color:var(--text-2); margin: 8px 0 10px;">Estilos Visuais Disponíveis (${estilos.length} estilos em estilos/*.md)</h3>
        <div class="cards-grid-3" style="margin-bottom: 20px;">
          ${estilos
            .map(
              (st) => `
                <div class="glass-card">
                  <div class="gc-top">
                    <strong style="font-size:13.5px;">${MD.escapeHtml(st.slug)}</strong>
                    <div class="style-swatches">
                      ${(st.colors || []).map((hex) => `<span class="style-swatch-dot" style="background:${MD.escapeHtml(hex)}" title="${MD.escapeHtml(hex)}"></span>`).join('')}
                    </div>
                  </div>
                  <p class="gc-desc">${MD.escapeHtml(st.summary || st.name)}</p>
                  <div class="gc-actions">
                    <button type="button" class="btn-sm" data-copy-text="estilos/${MD.escapeHtml(st.filename)}">Copiar Caminho</button>
                  </div>
                </div>
              `
            )
            .join('')}
        </div>

        <h3 style="font-size:13px; color:var(--text-2); margin: 8px 0 10px;">Pastas em ${chData.key === 'mrj' ? 'videos/mrj/' : 'videos/'} (${kdenliveVideos.length})</h3>
        <div class="glass-card">
          ${kdenliveVideos.length
            ? kdenliveVideos
                .map(
                  (kv) => `
                    <div class="tree-row" style="cursor:default;">
                      <div>
                        <div style="font-family:var(--font-mono); font-size:12px; color:var(--text-1);">${MD.escapeHtml(kv.slug)}</div>
                        <div style="font-size:11px; color:var(--text-3);">${MD.escapeHtml(kv.title)}${kv.serie ? ` • ${MD.escapeHtml(kv.serie)}` : ''}</div>
                      </div>
                      <div style="display:flex; gap:6px; align-items:center;">
                        ${kv.hasRender ? '<span class="status-pill st-publicado">Render OK</span>' : '<span class="status-pill st-edicao">Em projeto</span>'}
                        ${kv.youtubeUrl ? `<a class="btn-sm" href="${MD.escapeHtml(kv.youtubeUrl)}" target="_blank" rel="noopener noreferrer">YouTube ↗</a>` : ''}
                      </div>
                    </div>
                  `
                )
                .join('')
            : `<p style="color:var(--text-3); margin:0;">Nenhum projeto em <code>${chData.key === 'mrj' ? 'videos/mrj/' : 'videos/'}</code> ainda. Use <code>./criar_video.sh --canal ${MD.escapeHtml(chData.key)} &lt;slug&gt;</code> para criar o primeiro!</p>`}
        </div>
      </section>
    `
    : `
      <section class="kdenlive-section">
        <div class="glass-card">
          <h3 class="gc-title">Ponte Kdenlive</h3>
          <p class="gc-desc">Pasta Kdenlive não configurada ou não encontrada (${MD.escapeHtml(kdenlive.root || 'kdenliveRoot vazio')}). Configure <code>kdenliveRoot</code> no <code>config.local.json</code> e rode <code>npm run sync</code>.</p>
        </div>
      </section>
    `;

  container.innerHTML = `
    <div class="agent-grid">
      <div>
        <div class="section-subhead">
          <h2 class="panel-title" style="font-size:16px;">Fila Agendada (por Data Alvo)</h2>
          <button type="button" class="btn-sm" data-open-doc="00-canal/calendario-editorial.md">Calendário Editorial</button>
        </div>

        <div class="glass-card" style="margin-bottom:16px;">
          ${scheduled
            .map(
              (d) => `
                <button type="button" class="history-row" data-open-doc="${MD.escapeHtml(d.path)}">
                  <div>
                    <span class="hr-title">${MD.escapeHtml(d.meta.titulo)}</span>
                    <span class="hr-sub">${MD.escapeHtml(d.meta.serie)} • ${MD.escapeHtml(d.meta.duracao_estimada)}</span>
                  </div>
                  <span class="hr-date">${formatDatePt(d.meta.data_alvo)}</span>
                  <span class="status-pill st-${MD.escapeHtml(d.meta.status)}">${MD.escapeHtml(d.meta.status)}</span>
                </button>
              `
            )
            .join('') || '<p style="color:var(--text-3);">Nenhum roteiro com data alvo futura definida.</p>'}
        </div>

        <div class="section-subhead">
          <h2 class="panel-title" style="font-size:16px;">Documentos de Produção (${MD.escapeHtml(chData.channel.name)})</h2>
        </div>
        <div class="cards-grid-3" style="grid-template-columns:1fr 1fr;">
          ${prodDocs
            .map(
              (d) => `
                <div class="glass-card">
                  <h3 class="gc-title">${MD.escapeHtml(d.meta.titulo)}</h3>
                  <p class="gc-desc">${MD.escapeHtml(d.meta.resumo || d.path)}</p>
                  <button type="button" class="btn-sm btn-accent" data-open-doc="${MD.escapeHtml(d.path)}">Abrir Documento</button>
                </div>
              `
            )
            .join('') || '<p style="color:var(--text-3);">Sem documentos de produção.</p>'}
        </div>
      </div>

      <div>
        <div class="section-subhead">
          <h2 class="panel-title" style="font-size:16px;">${rightDoc ? MD.escapeHtml(rightDoc.meta.titulo) : 'Guia de Publicação'}</h2>
          ${rightDoc ? '<button type="button" class="btn-sm btn-accent" id="copyKitDescBtn">Copiar Bloco Principal</button>' : ''}
        </div>
        <div class="glass-card">
          <div class="md-article" style="font-size:13px;">
            ${rightDoc ? MD.renderMarkdown(rightDoc.body) : '<p>Nenhum documento de referência encontrado.</p>'}
          </div>
        </div>
      </div>
    </div>

    ${kdenliveBridgeHtml}
  `;

  container.querySelectorAll('[data-open-doc]').forEach((el) => {
    el.onclick = () => {
      const target = el.dataset.openDoc;
      if (docs.some((d) => d.path === target)) setView('scripts', target);
      else showToast(`Arquivo ${target} não existe neste canal.`);
    };
  });

  container.querySelectorAll('[data-copy-text]').forEach((btn) => {
    btn.onclick = () => copyText(btn.dataset.copyText, 'Copiado!');
  });

  const baseKdBtn = document.getElementById('copyKdenliveBaseCmdBtn');
  if (baseKdBtn) {
    baseKdBtn.onclick = () => {
      const root = kdenlive.root || '~/Videos/youtube-kdenlive';
      copyText(`cd ${root} && ./criar_video.sh --canal ${chData.key} novo-video`, 'Comando base Kdenlive copiado!');
    };
  }

  const copyKitBtn = document.getElementById('copyKitDescBtn');
  if (copyKitBtn && rightDoc) {
    copyKitBtn.onclick = () => {
      const match = /```(?:text|bash)?\n([\s\S]*?)```/.exec(rightDoc.body);
      copyText(match ? match[1] : rightDoc.body, 'Conteúdo copiado!');
    };
  }
}

registerViewRenderer('production', renderProductionView);
