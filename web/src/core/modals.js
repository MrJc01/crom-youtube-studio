import { MD, SERIE_META } from './constants.js';
import { setView } from './router.js';
import { getActiveChannelData, getChannelSeriesList, state } from './state.js';
import { copyText, formatDatePt, formatVersionLabel, showToast } from './utils.js';

export function openNewWorkspaceModal() {
  if (!state.serverMode) {
    showToast('Adicionar novo workspace requer o servidor local (./bin/crom-studio --tray).');
    return;
  }
  const modal = document.getElementById('newWorkspaceModal');
  const keyEl = document.getElementById('newWsKey');
  const nameEl = document.getElementById('newWsName');
  const handleEl = document.getElementById('newWsHandle');
  const kdEl = document.getElementById('newWsKdenliveFolder');
  const pathEl = document.getElementById('newWsPath');
  const seriesEl = document.getElementById('newWsSeries');
  const createEl = document.getElementById('newWsCreateFolder');

  if (keyEl) {
    keyEl.value = '';
    delete keyEl.dataset.touched;
  }
  if (nameEl) nameEl.value = '';
  if (handleEl) handleEl.value = '';
  if (kdEl) {
    kdEl.value = '';
    delete kdEl.dataset.touched;
  }
  if (pathEl) pathEl.value = '';
  if (seriesEl) seriesEl.value = 'Geral, Shorts & Cortes, Canal & Ops';
  if (createEl) createEl.checked = true;

  modal?.classList.remove('hidden');
  setTimeout(() => nameEl?.focus(), 40);
}

export function populateNewDocSelects(chData) {
  const serieEl = document.getElementById('newDocSerie');
  const folderEl = document.getElementById('newDocFolder');
  const seriesList = getChannelSeriesList(chData);

  serieEl.innerHTML = seriesList
    .map((s) => `<option value="${MD.escapeHtml(s)}">${MD.escapeHtml(s)}</option>`)
    .join('');

  const seen = new Set();
  const folders = [];
  const pushFolder = (value, label = value) => {
    if (!value || value === 'raiz' || seen.has(value)) return;
    seen.add(value);
    folders.push({ value, label });
  };

  for (const s of seriesList) {
    const sFolder = SERIE_META[s]?.folder;
    if (sFolder) pushFolder(sFolder, `${sFolder} (Série ${s})`);
  }

  const standardFolders = [
    '02-roteiros/rascunhos',
    '02-roteiros/em-producao',
    '03-shorts',
    '01-ideias',
    '02-roteiros/publicados',
    '04-producao',
  ];
  for (const sf of standardFolders) pushFolder(sf, sf);
  for (const cf of chData.folders || []) pushFolder(cf, cf);

  folderEl.innerHTML = folders
    .map((f) => `<option value="${MD.escapeHtml(f.value)}">${MD.escapeHtml(f.label)}</option>`)
    .join('');
}

export function openNewDocModal(prefill = {}) {
  const chData = getActiveChannelData();
  populateNewDocSelects(chData);

  const modal = document.getElementById('newDocModal');
  const typeEl = document.getElementById('newDocType');
  const folderEl = document.getElementById('newDocFolder');
  const serieEl = document.getElementById('newDocSerie');
  const titleEl = document.getElementById('newDocTitle');
  const repoEl = document.getElementById('newDocRepo');
  const summaryEl = document.getElementById('newDocSummary');
  const dateEl = document.getElementById('newDocTargetDate');

  const seriesList = getChannelSeriesList(chData);
  const defaultSerie = prefill.serie || seriesList[0] || 'Geral';
  const serieFolder = SERIE_META[defaultSerie]?.folder;
  const hasSerieFolder = Boolean(
    serieFolder && Array.from(folderEl.options).some((o) => o.value === serieFolder)
  );
  const defaultType = prefill.type || (hasSerieFolder ? 'episodio-serie' : 'roteiro-longo');
  const defaultFolder = prefill.folder || (hasSerieFolder ? serieFolder : '02-roteiros/rascunhos');
  const githubLink = chData.channel?.links?.github || '';
  const defaultRepo = githubLink ? githubLink.replace(/\/+$/, '').split('/').pop() : 'MrJc01';

  typeEl.value = defaultType;
  if (Array.from(serieEl.options).some((o) => o.value === defaultSerie)) {
    serieEl.value = defaultSerie;
  }
  if (Array.from(folderEl.options).some((o) => o.value === defaultFolder)) {
    folderEl.value = defaultFolder;
  }
  titleEl.value = prefill.title || '';
  repoEl.value = prefill.repo ?? defaultRepo;
  summaryEl.value = prefill.summary || '';
  dateEl.value = prefill.date || '';

  modal.classList.remove('hidden');
  setTimeout(() => titleEl.focus(), 40);
}

export function buildTemplateBody(type, title, summary, repo, serie) {
  if (type === 'episodio-serie') {
    return `# ${serie} — ${title}

- **Série:** ${serie}
- **Repositório / Referência:** \`${repo || 'MrJc01'}\`

## Premissa & Conceito Central

${summary || '[Qual a ideia principal deste episódio, pergunta central ou construção proposta?]'}

## Estrutura Sugerida

### \`[GANCHO]\` 00:00 – 00:40 | Abertura Direta
- Apresentar o conceito ou curiosidade logo no segundo 0.

### 00:40 – 05:00 | Desenvolvimento / Bastidores / Análise
- Detalhar arquitetura, histórias, referências ou opinião fundamentada.

### 05:00 – Fim | Fechamento & Pergunta para a Comunidade
- Conexão com os comentários e próximos passos.

## Checklist de Produção

- [ ] Definir 3 opções de título A/B e thumbnail
- [ ] Separar referências visuais / prints / links
- [ ] Levar para Kdenlive com \`./criar_video.sh\`
`;
  }

  if (type === 'short') {
    return `# Short — ${title}

- **Duração alvo:** 45 segundos (~115 palavras)
- **Repositório:** \`${repo || 'MrJc01'}\`

---

## 00:00 – 00:06 | Gancho Seco
\`[TELA]\` [Mostrar resultado/terminal logo no segundo 0]
> **Fala:** "${summary || 'Frase de impacto direta sobre o projeto.'}"

## 00:06 – 00:32 | Como Funciona
\`[B-ROLL]\` [Zoom no código ou diagrama]
> **Fala:** "[Explicar a arquitetura ou ideia central em linguagem direta.]"

## 00:32 – 00:45 | CTA
> **Fala:** "Código e referências abertas — vídeo completo ligado aqui embaixo."
`;
  }

  if (type === 'ideia') {
    return `# Ideia — ${title}

- **Repositório:** \`${repo || 'MrJc01'}\`

## Tese Central

${summary || '[Por que esse vídeo merece ser gravado e qual problema real resolve?]'}

## Próximos Passos

- [ ] Validar referências / demo rodando limpo
- [ ] Definir 3 opções de título e thumbnail
- [ ] Transformar em roteiro ou episódio de série
`;
  }

  if (type === 'post-mortem') {
    return `# Post-Mortem — ${title}

${summary || ''}

## O que Funcionou Bem

- [Gancho / tema / ritmo]

## O que Melhorar no Próximo

- [Retenção / clareza / B-roll]
`;
  }

  return `# Roteiro — ${title}

## Opções de Título (Teste A/B)

1. **A:** \`${title}\`
2. **B:** \`[Variação focada em resultado]\`
3. **C:** \`[Variação curiosidade técnica]\`

## Checklist Pré-Gravação

- [ ] Demo testada e material separado
- [ ] Gancho dos primeiros 40s validado

---

## 00:00 — Gancho (00:00 – 00:45)

\`[TELA]\` [Mostrar aplicação, referência ou conceito funcionando]

**Fala:**
00:00 — ${summary || '[Abrir direto mostrando o problema ou ideia real na tela.]'}

---

## 00:45 — Desenvolvimento (00:45 – 07:00)

\`[B-ROLL]\` [Diagramas, código ou referências]

---

## 07:00 — Encerramento & CTA (07:00 – 09:00)

**Fala:**
07:00 — Links e código na descrição — até o próximo vídeo!
`;
}

export function openNotifDrawer() {
  const chData = getActiveChannelData();
  const drawer = document.getElementById('notifDrawer');
  const body = document.getElementById('notifBody');
  const docs = chData.docs || [];

  const activeItems = docs.filter((d) => ['gravando', 'edicao', 'roteiro'].includes(d.meta.status));
  const incompleteChecks = docs.filter((d) => (d.stats?.checksTotal || 0) > (d.stats?.checksDone || 0));

  body.innerHTML = `
    <p style="font-size:12px; color:var(--text-3); margin-top:0;">Resumo vivo da fila em <strong>${MD.escapeHtml(chData.channel.name)} (${MD.escapeHtml(chData.channel.handle)})</strong>:</p>
    ${activeItems
      .map(
        (d) => `
          <div class="drawer-item">
            <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
              <span class="status-pill st-${MD.escapeHtml(d.meta.status)}">${MD.escapeHtml(d.meta.status)}</span>
              <span style="font-size:11px; color:var(--text-3);">${d.meta.data_alvo ? formatDatePt(d.meta.data_alvo) : 'Sem data'}</span>
            </div>
            <div style="font-weight:600; font-size:13px; margin-bottom:6px;">${MD.escapeHtml(d.meta.titulo)}</div>
            <button type="button" class="btn-sm btn-accent" data-drawer-doc="${MD.escapeHtml(d.path)}">Abrir Roteiro</button>
          </div>
        `
      )
      .join('') || '<p style="font-size:12px; color:var(--text-3);">Nenhum roteiro em andamento no momento.</p>'}

    <h3 style="font-size:13px; margin:18px 0 8px;">Checklists em Aberto</h3>
    ${incompleteChecks
      .slice(0, 5)
      .map(
        (d) => `
          <div class="drawer-item">
            <div style="font-size:12.5px; font-weight:600;">${MD.escapeHtml(d.meta.titulo)}</div>
            <div style="font-size:11.5px; color:var(--text-3); margin:4px 0 8px;">${d.stats.checksDone}/${d.stats.checksTotal} concluídos</div>
            <button type="button" class="btn-sm" data-drawer-doc="${MD.escapeHtml(d.path)}">Ir para Checklist</button>
          </div>
        `
      )
      .join('') || '<p style="font-size:12px; color:var(--text-3);">Todos os checklists concluídos.</p>'}
  `;

  body.querySelectorAll('[data-drawer-doc]').forEach((btn) => {
    btn.onclick = () => {
      drawer.classList.add('hidden');
      setView('scripts', btn.dataset.drawerDoc);
    };
  });

  drawer.classList.remove('hidden');
}

export function openNewVersionModal(doc) {
  if (!doc) return;
  if (!state.serverMode) {
    showToast('Criar nova versão requer o servidor local rodando.');
    return;
  }
  const nameEl = document.getElementById('newVerName');
  const descEl = document.getElementById('newVerDesc');
  const fromEl = document.getElementById('newVerFrom');
  const versions = state.versionHistory?.versions || [{ name: 'principal', description: 'Arquivo .md base no workspace' }];
  const defaultVer = state.versionHistory?.defaultVersion || 'principal';
  const revs = (state.versionHistory?.revisions || []).filter((r) => r.id && r.id !== 'disk').slice(0, 12);

  const existingVariants = versions.filter((v) => !v.isPrimary).length;
  nameEl.value = `v${existingVariants + 2}-versao`;
  descEl.value = '';
  fromEl.innerHTML = [
    ...versions.map((v) => {
      const lbl = formatVersionLabel(v.name);
      const star = v.name === defaultVer ? ' ★' : '';
      return `<option value="ver:${MD.escapeHtml(v.name)}"${v.name === state.activeVersion ? ' selected' : ''}>Versão: ${MD.escapeHtml(lbl)}${star}${v.headRev ? ` (${v.headRev})` : ''}</option>`;
    }),
    ...revs.map(
      (r) => `<option value="rev:${MD.escapeHtml(r.id)}">Commit ${MD.escapeHtml(r.id)} — ${MD.escapeHtml(r.message)}</option>`
    ),
  ].join('');

  document.getElementById('newVersionModal').classList.remove('hidden');
  nameEl.focus();
  nameEl.select();
}

export function openKdenliveModal(doc) {
  const chData = getActiveChannelData();
  const chKey = chData.key;
  const kdenlive = state.data?.kdenlive || {};
  const estilos = kdenlive.estilos || [];
  const kdenliveRoot = kdenlive.root || '~/Videos/youtube-kdenlive';

  const rawSlug = doc.filename.replace(/\.md$/i, '').replace(/^\d{4}-\d{2}-/, '');
  const defaultSlug = MD.slugify(rawSlug);
  const defaultSerieSlug = doc.path.startsWith('06-series/')
    ? doc.path.split('/')[1]
    : doc.meta.serie && doc.meta.serie !== 'Canal & Ops'
      ? MD.slugify(doc.meta.serie)
      : '';

  const modal = document.getElementById('kdenliveModal');
  const body = document.getElementById('kdenliveModalBody');

  body.innerHTML = `
    <div class="form-row-3">
      <label>
        <span>Canal</span>
        <input type="text" id="kdCanalInput" value="${MD.escapeHtml(chKey)}" readonly>
      </label>
      <label>
        <span>Slug do Vídeo</span>
        <input type="text" id="kdSlugInput" value="${MD.escapeHtml(defaultSlug)}">
      </label>
      <label>
        <span>Série (--serie, opcional)</span>
        <input type="text" id="kdSerieInput" value="${MD.escapeHtml(defaultSerieSlug)}" placeholder="ex.: imagine">
      </label>
    </div>

    <label>
      <span>Estilo Visual (estilos/*.md)</span>
      <select id="kdEstiloSelect">
        <option value="">Escolher/propor estilo sob medida</option>
        ${estilos
          .map(
            (e) =>
              `<option value="${MD.escapeHtml(e.slug)}">${MD.escapeHtml(e.slug)} — ${MD.escapeHtml(e.summary.slice(0, 70))}</option>`
          )
          .join('')}
      </select>
    </label>

    <label>
      <span>1. Comando na Fábrica Kdenlive (${MD.escapeHtml(kdenliveRoot)})</span>
      <pre class="kdenlive-cmd-box" id="kdCliPreview"></pre>
    </label>

    <label>
      <span>2. Prompt para o Agente com MCP <code>kdenlive-mcp-plus</code></span>
      <textarea id="kdPromptPreview" rows="6" readonly style="font-family:var(--font-mono); font-size:11.5px;"></textarea>
    </label>

    <div class="modal-actions">
      <button type="button" class="btn-ghost" data-close-modal="kdenliveModal">Fechar</button>
      <button type="button" class="btn-sm" id="kdCopyCliBtn">Copiar Comando CLI</button>
      <button type="button" class="btn-sm btn-kdenlive" id="kdCopyPromptBtn">Copiar Prompt MCP</button>
      <button type="button" class="btn-primary" id="kdCopyAllBtn">Copiar Comando + Prompt</button>
    </div>
  `;

  const updateOutputs = () => {
    const slug = MD.slugify(document.getElementById('kdSlugInput').value || defaultSlug);
    const serie = document.getElementById('kdSerieInput').value.trim();
    const estilo = document.getElementById('kdEstiloSelect').value;

    const serieArg = serie ? ` --serie ${serie}` : '';
    const cliCmd = `cd ${kdenliveRoot}\n./criar_video.sh --canal ${chKey} ${slug}${serieArg}`;
    const targetVideoDir = chKey === 'mrj' ? `videos/mrj/${slug}` : `videos/${slug}`;
    const estiloNote = estilo
      ? `Use o estilo visual \`estilos/${estilo}.md\`.`
      : 'Proponha um estilo visual adequado a partir de `estilos/*.md` seguindo o PROCESSO-NOVO-VIDEO.md.';

    const mcpPrompt = [
      `Produza o vídeo "${doc.meta.titulo}" para o canal ${chData.channel.name} (${chData.channel.handle}).`,
      `1) Leia o roteiro completo em "${chData.workspacePath ? `${chData.workspacePath}/${doc.path}` : doc.path}".`,
      `2) Em ${kdenliveRoot}, leia LEIA-PRIMEIRO.md e PROCESSO-NOVO-VIDEO.md (e CANAIS.md).`,
      `3) Inicialize a pasta do projeto com: ./criar_video.sh --canal ${chKey} ${slug}${serieArg} (pasta destino: ${targetVideoDir}).`,
      `4) ${estiloNote}`,
      `5) Gere narração CromyVoice, cenas Remotion/Three.js e monte a timeline final no Kdenlive usando o MCP \`kdenlive-mcp-plus\`, validando com \`python3 ferramentas/verificar_video.py ${targetVideoDir}\`.`,
    ].join('\n');

    document.getElementById('kdCliPreview').textContent = cliCmd;
    document.getElementById('kdPromptPreview').value = mcpPrompt;
  };

  updateOutputs();

  document.getElementById('kdSlugInput').oninput = updateOutputs;
  document.getElementById('kdSerieInput').oninput = updateOutputs;
  document.getElementById('kdEstiloSelect').onchange = updateOutputs;

  document.getElementById('kdCopyCliBtn').onclick = () => {
    copyText(document.getElementById('kdCliPreview').textContent, 'Comando ./criar_video.sh copiado!');
  };
  document.getElementById('kdCopyPromptBtn').onclick = () => {
    copyText(document.getElementById('kdPromptPreview').value, 'Prompt kdenlive-mcp-plus copiado!');
  };
  document.getElementById('kdCopyAllBtn').onclick = () => {
    const cli = document.getElementById('kdCliPreview').textContent;
    const prm = document.getElementById('kdPromptPreview').value;
    copyText(`${cli}\n\n---\n\n${prm}`, 'Comando e prompt Kdenlive copiados!');
  };
  body.querySelectorAll('[data-close-modal]').forEach((btn) => {
    btn.onclick = () => modal.classList.add('hidden');
  });

  modal.classList.remove('hidden');
}
