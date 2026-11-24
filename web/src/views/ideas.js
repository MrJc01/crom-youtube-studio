import { MD } from '../core/constants.js';
import { openKdenliveModal, openNewDocModal } from '../core/modals.js';
import { setView } from '../core/router.js';
import { getActiveChannelData, registerViewRenderer } from '../core/state.js';

export function renderIdeasView(container) {
  const chData = getActiveChannelData();
  const docs = chData.docs || [];
  const seriesDocs = docs.filter((d) => d.topFolder === '06-series' && d.filename !== 'README.md');
  const ideaDocs = docs.filter(
    (d) => d.topFolder === '01-ideias' || (d.meta.status === 'ideia' && d.topFolder !== '06-series')
  );
  const repos = chData.githubRepos || [];

  const seriesSectionHtml = seriesDocs.length
    ? `
      <div class="section-subhead">
        <div>
          <h2 class="panel-title" style="font-size:16px;">Séries em Destaque (06-series/)</h2>
          <span style="font-size:12px; color:var(--text-3);">Imagine, Pensamentos, Histórias, Reavaliar e Crom — manifestos e pautas abertas.</span>
        </div>
        <button type="button" class="btn-sm btn-accent" id="newSerieDocBtn">+ Novo Episódio em Série</button>
      </div>
      <div class="cards-grid-3" style="margin-bottom: 28px;">
        ${seriesDocs
          .map(
            (d) => `
              <div class="glass-card">
                <div class="gc-top">
                  <span class="status-pill st-${MD.escapeHtml(d.meta.status)}">${MD.escapeHtml(d.meta.status)}</span>
                  <span style="font-family:var(--font-mono); font-size:11px; color:var(--text-3);">${MD.escapeHtml(d.meta.serie)}</span>
                </div>
                <h3 class="gc-title">${MD.escapeHtml(d.meta.titulo)}</h3>
                <p class="gc-desc">${MD.escapeHtml(d.meta.resumo || 'Sem resumo definido ainda.')}</p>
                <div class="gc-actions">
                  <button type="button" class="btn-sm btn-accent" data-open-doc="${MD.escapeHtml(d.path)}">Abrir Arquivo</button>
                  <button type="button" class="btn-sm btn-kdenlive" data-kdenlive-doc="${MD.escapeHtml(d.path)}">Kdenlive</button>
                </div>
              </div>
            `
          )
          .join('')}
      </div>
    `
    : '';

  container.innerHTML = `
    ${seriesSectionHtml}

    <div class="section-subhead">
      <div>
        <h2 class="panel-title" style="font-size:16px;">Fichas de Ideia (.md em 01-ideias/)</h2>
      </div>
      <button type="button" class="btn-sm btn-accent" id="newIdeaBtn">+ Nova Ideia</button>
    </div>

    <div class="cards-grid-3" style="margin-bottom: 28px;">
      ${ideaDocs
        .map(
          (d) => `
            <div class="glass-card">
              <div class="gc-top">
                <span class="status-pill st-${MD.escapeHtml(d.meta.status)}">${MD.escapeHtml(d.meta.status)}</span>
                <span style="font-family:var(--font-mono); font-size:11px; color:var(--text-3);">${MD.escapeHtml(d.meta.serie)}</span>
              </div>
              <h3 class="gc-title">${MD.escapeHtml(d.meta.titulo)}</h3>
              <p class="gc-desc">${MD.escapeHtml(d.meta.resumo || 'Sem resumo definido ainda.')}</p>
              <div class="gc-actions">
                <button type="button" class="btn-sm btn-accent" data-open-doc="${MD.escapeHtml(d.path)}">Abrir Ficha</button>
                <button type="button" class="btn-sm" data-script-from-idea="${MD.escapeHtml(d.path)}">Virar Roteiro</button>
              </div>
            </div>
          `
        )
        .join('') || '<p style="color:var(--text-3);">Nenhuma ficha em 01-ideias/ ainda.</p>'}
    </div>

    <div class="section-subhead">
      <div>
        <h2 class="panel-title" style="font-size:16px;">Repositórios Reais (github.com/MrJc01)</h2>
        <span style="font-size:12px; color:var(--text-3);">Projetos reais prontos para virar episódios de vídeo ou retomada de canal.</span>
      </div>
    </div>

    <div class="cards-grid-3">
      ${repos
        .map(
          (r) => `
            <div class="glass-card">
              <div class="gc-top">
                <span class="status-pill st-roteiro">${MD.escapeHtml(r.language)}</span>
                <span style="font-family:var(--font-mono); font-size:12px; color:var(--warn);">★ ${r.stars}</span>
              </div>
              <h3 class="gc-title">${MD.escapeHtml(r.name)}</h3>
              <p class="gc-desc">${MD.escapeHtml(r.description)}</p>
              <div class="gc-actions">
                <button type="button" class="btn-sm btn-accent" data-repo-to-script="${MD.escapeHtml(r.name)}">+ Criar Roteiro</button>
                ${r.linkedDoc ? `<button type="button" class="btn-sm" data-open-doc="${MD.escapeHtml(r.linkedDoc)}">Ver .md</button>` : ''}
                <a class="btn-sm" href="${MD.escapeHtml(r.url)}" target="_blank" rel="noopener noreferrer">GitHub ↗</a>
              </div>
            </div>
          `
        )
        .join('')}
    </div>
  `;

  const newSerieBtn = document.getElementById('newSerieDocBtn');
  if (newSerieBtn) {
    newSerieBtn.onclick = () =>
      openNewDocModal({ type: 'episodio-serie', serie: 'Imagine', folder: '06-series/imagine' });
  }
  document.getElementById('newIdeaBtn').onclick = () => openNewDocModal({ type: 'ideia', folder: '01-ideias' });

  container.querySelectorAll('[data-open-doc]').forEach((btn) => {
    btn.onclick = () => setView('scripts', btn.dataset.openDoc);
  });
  container.querySelectorAll('[data-kdenlive-doc]').forEach((btn) => {
    btn.onclick = () => {
      const doc = docs.find((d) => d.path === btn.dataset.kdenliveDoc);
      if (doc) openKdenliveModal(doc);
    };
  });

  container.querySelectorAll('[data-script-from-idea]').forEach((btn) => {
    btn.onclick = () => {
      const doc = docs.find((d) => d.path === btn.dataset.scriptFromIdea);
      if (doc) {
        openNewDocModal({
          type: 'roteiro-longo',
          folder: '02-roteiros/rascunhos',
          title: doc.meta.titulo.replace(/^Ideia:\s*/i, ''),
          serie: doc.meta.serie,
          repo: doc.meta.repo_github,
          summary: doc.meta.resumo,
        });
      }
    };
  });

  container.querySelectorAll('[data-repo-to-script]').forEach((btn) => {
    btn.onclick = () => {
      const repo = repos.find((x) => x.name === btn.dataset.repoToScript);
      if (repo) {
        openNewDocModal({
          type: 'roteiro-longo',
          folder: '02-roteiros/rascunhos',
          title: `${repo.name}: Bastidores e Arquitetura Real em ${repo.language}`,
          serie: repo.serie || (chData.key === 'crom' ? 'Projetos do GitHub' : 'Construção Real'),
          repo: `MrJc01/${repo.name}`,
          summary: repo.description,
        });
      }
    };
  });
}

registerViewRenderer('ideas', renderIdeasView);
