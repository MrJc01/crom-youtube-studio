import { MD } from '../core/constants.js';
import { setView } from '../core/router.js';
import { getActiveChannelData, registerViewRenderer, state } from '../core/state.js';
import { copyText } from '../core/utils.js';

export function renderAgentView(container) {
  const chData = getActiveChannelData();
  const channel = chData.channel || {};
  const docs = chData.docs || [];
  const targetDoc =
    docs.find((d) => d.path === state.agentSelectedDoc) ||
    docs.find((d) => d.topFolder === '06-series' || d.topFolder === '02-roteiros') ||
    docs[0];
  const targetPath = targetDoc ? targetDoc.path : 'AGENTS.md';
  const wsPath = chData.workspacePath || channel.name;

  const prompts = [
    {
      title: 'Editar Roteiro via Git (Dinâmica 1 — Nunca sobrescrever direto)',
      text: `Leia ${wsPath}/AGENTS.md e ${wsPath}/../00-VERSIONAMENTO-ROTEIROS.md. Revise "${targetPath}" (canal ${chData.key}) preservando o histórico e salve como revisão Git: crom-studio roteiro commit --canal ${chData.key} --arquivo "${targetPath}" --versao principal --autor "Agente" --msg "Resumo do ajuste" --stdin`,
    },
    {
      title: 'Criar Versão Alternativa / Variante (Dinâmica 2)',
      text: `Leia ${wsPath}/AGENTS.md e "${targetPath}". Crie uma versão alternativa sem alterar a principal via: crom-studio roteiro nova-versao --canal ${chData.key} --arquivo "${targetPath}" --nome "v2-enxuta" --desc "Abordagem alternativa mais curta" --autor "Agente" --stdin`,
    },
    {
      title: 'Escrever Roteiro Longo a partir de uma Ficha/Série',
      text: `Leia AGENTS.md e "${targetPath}" em ${wsPath}. Crie um roteiro longo completo em 02-roteiros/rascunhos/ ou na pasta da série mantendo o esquema YAML e o tom de ${channel.handle || channel.name}. Depois rode: crom-studio --sync.`,
    },
    {
      title: 'Levar Roteiro para a Esteira Kdenlive + MCP',
      text: `Leia "${targetPath}" em ${wsPath} e siga PROCESSO-NOVO-VIDEO.md no diretório Kdenlive. Inicialize o projeto com ./criar_video.sh --canal ${chData.key} <slug> e monte a timeline usando o MCP kdenlive-mcp-plus.`,
    },
  ];

  container.innerHTML = `
    <div class="agent-grid">
      <div>
        <div class="section-subhead">
          <h2 class="panel-title" style="font-size:16px;">Prompts Prontos para o Agente (${MD.escapeHtml(channel.name)})</h2>
          <select class="select-dark" id="agentTargetDocSel" style="max-width:250px;">
            ${docs.map((d) => `<option value="${MD.escapeHtml(d.path)}"${d.path === targetPath ? ' selected' : ''}>${MD.escapeHtml(d.path)}</option>`).join('')}
          </select>
        </div>

        ${prompts
          .map(
            (p, idx) => `
              <div class="prompt-card">
                <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
                  <strong style="font-size:13px;">${MD.escapeHtml(p.title)}</strong>
                  <button type="button" class="btn-sm btn-accent" data-copy-prompt="${idx}">Copiar Prompt</button>
                </div>
                <pre>${MD.escapeHtml(p.text)}</pre>
              </div>
            `
          )
          .join('')}

        <div class="prompt-card">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <strong style="font-size:13px;">Abrir com Bandeja do Sistema + Servidor Local</strong>
            <button type="button" class="btn-sm" id="copyRunCmdBtn">Copiar</button>
          </div>
          <pre>./bin/crom-studio --tray --open --canal ${MD.escapeHtml(chData.key)}</pre>
        </div>
      </div>

      <div>
        <div class="section-subhead">
          <h2 class="panel-title" style="font-size:16px;">Mapa Completo de Arquivos (${docs.length} .md)</h2>
          <button type="button" class="btn-sm btn-accent" data-open-doc="AGENTS.md">Ler AGENTS.md</button>
        </div>
        <div class="glass-card" style="max-height:620px; overflow-y:auto;">
          ${docs
            .map(
              (d) => `
                <div class="tree-row" data-open-doc="${MD.escapeHtml(d.path)}">
                  <div style="min-width:0;">
                    <div style="font-family:var(--font-mono); font-size:11.5px; color:var(--text-1); overflow:hidden; text-overflow:ellipsis;">${MD.escapeHtml(d.path)}</div>
                    <div style="font-size:11px; color:var(--text-3);">${MD.escapeHtml(d.meta.titulo)}</div>
                  </div>
                  <span class="status-pill st-${MD.escapeHtml(d.meta.status)}">${MD.escapeHtml(d.meta.status)}</span>
                </div>
              `
            )
            .join('')}
        </div>
      </div>
    </div>
  `;

  document.getElementById('agentTargetDocSel').onchange = (e) => {
    state.agentSelectedDoc = e.target.value;
    renderAgentView(container);
  };

  container.querySelectorAll('[data-copy-prompt]').forEach((btn) => {
    btn.onclick = () => copyText(prompts[Number(btn.dataset.copyPrompt)].text, 'Prompt copiado!');
  });

  document.getElementById('copyRunCmdBtn').onclick = () =>
    copyText(`./bin/crom-studio --tray --open --canal ${chData.key}`, 'Comando copiado!');

  container.querySelectorAll('[data-open-doc]').forEach((el) => {
    el.onclick = () => setView('scripts', el.dataset.openDoc);
  });
}

registerViewRenderer('agent', renderAgentView);
