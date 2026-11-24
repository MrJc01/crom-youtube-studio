# Crom YouTube Studio

Painel web editorial **multi-canal** para YouTube com interface **borderless ponta a ponta**, barra de abas superior retrátil, menu de contexto personalizado no botão direito, leitor/editor de roteiros Markdown, **Git de Roteiros + Versões Alternativas**, teleprompter em tempo real, **Mapa de Roteiros** em cartões e **Fluxograma interativo**, página **Quadro & Fluxos** com **Excalidraw completo (`pt-BR`) + Modo Foco em Nodes**, pipeline Kanban, configurações de workspace pela UI, sincronização automática em tempo real (`fs.watch` + SSE), feed RSS do YouTube, ponte com **Kdenlive / MCP (`kdenlive-mcp-plus`)** e ícone persistente na bandeja do sistema (system tray).

Construído em **Node.js nativo** no backend, **HTML/CSS/JS clássico** no frontend, bundle local oficial de **`@excalidraw/excalidraw`** (zero dependência de CDN em runtime) e **Python 3 + GTK 3 / AyatanaAppIndicator3** para o aplicativo de bandeja no Linux.

---

## Principais Recursos

- **Interface Borderless, Barra de Abas Retrátil & Menu de Contexto Personalizado:**
  - Shell sem bordas externas (`.viewport-frame` e `.studio-shell` edge-to-edge) com scroll limpo em todas as telas.
  - **Barra de abas superior retrátil (estilo OpenCode / navegador):** fica aberta automaticamente na **Visão Geral** e recolhe para uma seta puxadora discreta (`▾`) no topo nas páginas internas; suporta `+` nova aba, `Ctrl+Click` / clique do meio, persistência local e abas dedicadas de **links externos** (com player embutido para YouTube).
  - **Menu de contexto no botão direito (`#studioContextMenu`):** em roteiros, cards, barra lateral, abas e links externos, oferece **Abrir em nova aba**, **Abrir em aba (segundo plano)**, **Abrir na barra de abas (topo)**, **Copiar como contexto** (Markdown estruturado), **Copiar link / URL / caminho** e **Enviar para o Quadro (Excalidraw)**.
- **URLs amigáveis com SPA fallback (`src/server.mjs`):**
  - `/<canal>` — Visão Geral (única tela com KPIs no cabeçalho e switcher grande de canais)
  - `/<canal>/roteiros` e `/<canal>/roteiros/<caminho.md>` — Roteiros & Leitor (suporta `?modo=ler|editar|teleprompter|historico&versao=<slug>&foco=1`)
  - `/<canal>/mapa` — Mapa de Roteiros (Cartões coloridos por status + **Estilo Fluxograma interativo**)
  - `/<canal>/quadro` e `/<canal>/quadro/<slug>` — **Quadro & Fluxos** (Excalidraw completo + Foco em Nodes, salvos em `<workspace>/quadros/*.excalidraw`)
  - `/<canal>/pipeline` — Pipeline Kanban interativo
  - `/<canal>/ideias` — Ideias, Séries & GitHub
  - `/<canal>/catalogo` — Catálogo YouTube (via RSS)
  - `/<canal>/producao` — Produção & Ponte Kdenlive
  - `/<canal>/agente` — Central do Agente & Arquivos
  - `/<canal>/configuracoes` — Configurações completas do Studio e dos Workspaces
  - *(Compatibilidade preservada com `?canal=<id>` e `#/<canal>/...` ao abrir via `file://`.)*
- **Leitor de Roteiros limpo, Modo Foco & Inspetor Direito:**
  - Topbar enxuta nas páginas internas (contagens e switcher expandido ficam apenas na Visão Geral).
  - Área central focada em leitura/escrita com ajuste de tamanho de fonte (`A-` / `A+`) e **Modo Foco (`⛶`)** que recolhe barras laterais e inspetor.
  - **Inspetor Direito** dedicado para metadados YAML, seleção/criação de versões alternativas e aba **Histórico & Diff** (`revisoes/` + comparação linha a linha).
- **Git de Roteiros + Versões Alternativas (2 Dinâmicas Distintas):**
  - **Dinâmica 1 — Git de Roteiros:** histórico imutável de snapshots (`r001`, `r002`, ...) em `<workspace>/.roteiro-git/<docKey>/revisoes/`, diff linha a linha, snapshot de resgate automático para edições externas e restauração append-only.
  - **Dinâmica 2 — Versões Alternativas:** variantes nomeadas (`v2-enxuta`, `gancho-direto`, ...) em `<workspace>/.roteiro-git/<docKey>/versoes/<slug>.md` sem alterar o `.md` principal, com commits independentes, diff contra `principal` e promoção controlada para o arquivo principal.
- **Mapa de Roteiros & Modo Fluxograma (`/<canal>/mapa`):**
  - Alterna entre **Cartões** coloridos por status (`publicado`, `gravando`, `edicao`, `roteiro`, `pesquisa`, `ideia`, `referencia`, `template`, `arquivado`) e **Fluxograma interativo** com 3 layouts (**Constelação (Clusters)**, **User Flow (Blocos)** e **Pipeline (Etapas)**), drag-to-pan, zoom, **Tela Cheia (`⛶`)** e exportação direta via **`✎ Abrir no Quadro (Excalidraw)`**.
- **Quadro & Fluxos — Excalidraw Local + Foco em Nodes (`/<canal>/quadro`):**
  - Bundle offline de **`@excalidraw/excalidraw`** em `pt-BR` servido localmente em `/excalidraw-frame.html` (sem fontes ou scripts externos).
  - Dois modos integrados e persistidos por quadro: **✎ Excalidraw Completo** (todas as ferramentas nativas de desenho, formas, imagem, biblioteca, exportação PNG/SVG/JSON) e **◈ Foco em Nodes** (barra rápida para criar cards numerados, `+ Próximo` com `Tab`, `+ Ramo`, `+ Grupo`, `+ Decisão`, `+ Destino`, alinhamento e setas tracejadas/sólidas conectadas).
  - Botão **`📄 + Roteiro`** para inserir qualquer `.md` do workspace como card no canvas, importação de `.excalidraw`, **Tela Cheia (`⛶`)**, auto-save com debounce (`900ms`) + `Ctrl+S` e atualização em tempo real via SSE.
- **Configurações do Workspace & Dropdown Multi-Canal:**
  - Dropdown de workspaces no canto inferior esquerdo (avatar do canal) com troca rápida e opção **`+ Criar Novo Workspace`** (com criação automática opcional de pastas e `README.md`).
  - Página `/<canal>/configuracoes` para editar `port`, `host`, `kdenliveRoot`, status configurável (`ativo`, `pausado` ou `oculto`), banner opcional, handle, `channelId`, `seriesList`, links e caminhos, persistindo direto em `config.local.json`.
- **FAB Speed-Dial (`+`) & Controle de Cor no Canto Inferior Direito:** menu flutuante `+` com acesso rápido a *Novo Roteiro*, *Novo Short*, *Nova Ideia*, *Nova Versão deste Roteiro*, *Novo Workspace* e *Configurações*, ao lado do botão de paletas do **`ColorFlowEngine`** e com modais responsivos.
- **Atualização em Tempo Real (`fs.watch` + SSE `/api/events`):** alterações externas feitas em arquivos `.md`, `.roteiro-git/` ou `config.local.json` disparam re-sincronização automática e eventos Server-Sent Events (`event: update`) para atualizar o navegador instantaneamente.
- **Sincronização YouTube RSS & Ponte Kdenlive (`kdenlive-mcp-plus`):** lê em modo somente-leitura `canais.json`, `canal.json`, `estilos/*.md` e projetos em `kdenliveRoot`, gerando comandos `./criar_video.sh --canal <canal> <slug>` e prompts para o MCP.
- **Ícone na Bandeja do Sistema (`tray/tray.py`):** gerencia o servidor Node em background, abre o navegador direto no canal desejado, dispara sync RSS e valida dependências.

---

## Arquitetura do Repositório

```text
crom-youtube-studio/
├── config.example.json       # Modelo genérico de configuração (versionado)
├── config.local.json         # Configuração real da sua máquina (gitignored)
├── package.json              # Scripts Node e build do Excalidraw (postinstall -> build:whiteboard)
├── LICENSE                   # Licença MIT
├── scripts/
│   └── build-whiteboard.mjs  # Gera web/vendor/excalidraw/ (bundle, CSS e fontes locais)
├── src/
│   ├── config.mjs            # Carrega/salva config (--config, CROM_STUDIO_CONFIG, config.local.json)
│   ├── sync.mjs              # Varre workspaces .md/.excalidraw (ignorando symlinks e ocultos) -> data/
│   ├── boards.mjs            # Persistência atômica e segura de quadros (<workspace>/quadros/*.excalidraw)
│   ├── versioning.mjs        # Motor das 2 dinâmicas (.roteiro-git/<docKey>/revisoes e versoes)
│   ├── roteiro-git.mjs       # CLI de versionamento (crom-studio roteiro ...)
│   ├── whiteboard-entry.jsx  # Wrapper React/Excalidraw + dock Foco em Nodes + ponte postMessage
│   └── server.mjs            # Servidor HTTP + API REST + SPA fallback + fs.watch/SSE (/api/events)
├── web/
│   ├── index.html            # Shell HTML (barra de abas retrátil, modais e menu de contexto)
│   ├── styles.css            # Tema escuro borderless, abas, fluxograma, quadro, inspetor e modais
│   ├── markdown.js           # Parser/serializador YAML + renderizador Markdown seguro
│   ├── app.js                # SPA multi-canal, abas, menu contextual, Fluxograma, Quadro, Git/Diff e SSE
│   ├── excalidraw-frame.html # Host isolado do Excalidraw local
│   ├── vendor/               # Assets compilados do Excalidraw (gitignored)
│   └── data.js               # Bundle JS gerado pelo sync (gitignored)
├── data/                     # Caches RSS por canal e data.json/data.js gerados (gitignored)
├── assets/                   # Ícones da aplicação e bandeja (crom-logo.png, crom-tray.png, crom-tray-off.png, .svg)
├── tray/
│   └── tray.py               # Aplicativo GTK 3 / AyatanaAppIndicator3 single-instance
└── bin/
    ├── crom-studio           # CLI unificado (--tray, --server, --sync, --sync-youtube, --open, --canal, roteiro ...)
    └── install-desktop.sh    # Instalador de atalho .desktop (e --autostart opcional)
```

---

## Configuração (`config.example.json` → `config.local.json`)

Nunca comite caminhos absolutos pessoais ou caches locais. Copie o modelo para criar sua configuração local (já listada no `.gitignore`):

```bash
cp config.example.json config.local.json
```

Edite `config.local.json` manualmente ou pela página **`/<canal>/configuracoes`** no próprio navegador:

```json
{
  "port": 4173,
  "host": "127.0.0.1",
  "defaultChannel": "canal-principal",
  "kdenliveRoot": "~/Videos/youtube-kdenlive",
  "channels": {
    "canal-principal": {
      "name": "Meu Canal",
      "handle": "@meu_canal",
      "channelId": "UCXXXXXXXXXXXXXXXXXXXXXX",
      "status": "ativo",
      "statusLabel": "Ativo",
      "subscribers": 0,
      "totalVideos": 0,
      "avatar": "",
      "bio": "Laboratório de construção de software, séries editoriais e bastidores reais.",
      "bannerEnabled": false,
      "workspacePath": "~/Documentos/Youtube/MeuCanal",
      "kdenliveFolder": "videos",
      "seriesList": ["Imagine", "Pensamentos", "Histórias", "Reavaliar", "Canal & Ops"]
    }
  }
}
```

### Ordem de resolução da configuração (`src/config.mjs`)

1. Flag CLI `--config <caminho>`
2. Variável de ambiente `CROM_STUDIO_CONFIG`
3. `config.local.json` na raiz do projeto
4. `config.example.json` (fallback padrão)

Caminhos relativos são resolvidos a partir do diretório do arquivo de configuração utilizado, e `~/` é expandido automaticamente para o `$HOME` do usuário.

---

## Como Executar

### 1. Instalar dependências e compilar o Excalidraw local

```bash
npm install
# O script postinstall executa automaticamente: npm run build:whiteboard
# (gera web/vendor/excalidraw/bundle.js, excalidraw.css e fonts/ localmente)
```

### 2. Sincronizar arquivos Markdown, quadros e caches

```bash
npm run sync
# ou com atualização via feed RSS público do YouTube:
npm run sync:youtube
```

### 3. Iniciar o servidor web diretamente

```bash
npm start
# acesse http://127.0.0.1:4173/canal-principal (ou /mrj, /crom, /mrj/mapa, /mrj/quadro, /mrj/configuracoes)
```

### 4. Iniciar com o ícone na bandeja do sistema (recomendado no Desktop Linux)

```bash
./bin/crom-studio --tray --open
```

Principais opções do CLI `bin/crom-studio`:

- `--tray`: inicia (ou aciona via socket UNIX) o aplicativo de bandeja `tray/tray.py`.
- `--open` / `--no-open`: abre ou não o navegador padrão ao iniciar.
- `--canal <chave>`: define o canal aberto no navegador.
- `--server`: sobe `node src/server.mjs` em foreground.
- `--sync` / `--sync-youtube`: roda `src/sync.mjs` (com ou sem RSS).
- `--status` / `--quit`: consulta ou encerra a instância ativa do tray.
- `--check`: valida dependências Python/GTK e arquivos necessários para a bandeja.
- `roteiro <subcomando>`: interface CLI do **Git de Roteiros & Versões Alternativas**.

Para instalar o atalho no menu de aplicativos do Linux (e opcionalmente no autostart da sessão):

```bash
./bin/install-desktop.sh
# ou com inicialização automática no login:
./bin/install-desktop.sh --autostart
```

---

## Git de Roteiros & Versões Alternativas (`crom-studio roteiro`)

Todo roteiro em `<workspace>/<caminho>.md` possui versionamento local isolado em `<workspace>/.roteiro-git/<docKey>/`:

- **Dinâmica 1 — Git de Roteiros (`revisoes/`):** registra snapshots imutáveis `r001`, `r002`, ... com hash SHA-256, contagem de palavras, diff linha a linha e restauração append-only (que cria uma nova revisão sem destruir o passado).
- **Dinâmica 2 — Versões Alternativas (`versoes/<slug>.md`):** cria variantes paralelas (ex.: `v2-enxuta`, `gancho-direto`) sem modificar o `.md` principal; cada variante aceita commits próprios, diff contra `principal` e promoção explícita para `principal`.

### Comandos CLI (`./bin/crom-studio roteiro` ou `npm run roteiro --`)

```bash
# Ver histórico de revisões e versões de um roteiro
./bin/crom-studio roteiro log --canal canal-principal --arquivo 02-roteiros/rascunhos/meu-roteiro.md

# Registrar novo commit na linha principal (ou em --versao <slug>)
cat novo.md | ./bin/crom-studio roteiro commit \
  --canal canal-principal \
  --arquivo 02-roteiros/rascunhos/meu-roteiro.md \
  --versao principal \
  --autor "Editor" \
  --msg "Ajuste de ritmo no Ato 2" \
  --stdin

# Criar versão alternativa sem tocar no .md principal
cat alternativa.md | ./bin/crom-studio roteiro nova-versao \
  --canal canal-principal \
  --arquivo 02-roteiros/rascunhos/meu-roteiro.md \
  --nome v2-enxuta \
  --desc "Corte de 10 minutos" \
  --de principal \
  --stdin

# Ler conteúdo de uma versão ou revisão específica
./bin/crom-studio roteiro ler --canal canal-principal --arquivo 02-roteiros/rascunhos/meu-roteiro.md --versao v2-enxuta
./bin/crom-studio roteiro ler --canal canal-principal --arquivo 02-roteiros/rascunhos/meu-roteiro.md --rev r001

# Comparar linha a linha (--de / --para aceitam ver:<nome>, rev:<rNNN> ou disk)
./bin/crom-studio roteiro diff --canal canal-principal --arquivo 02-roteiros/rascunhos/meu-roteiro.md --de ver:principal --para ver:v2-enxuta

# Restaurar uma revisão antiga (append-only)
./bin/crom-studio roteiro restaurar --canal canal-principal --arquivo 02-roteiros/rascunhos/meu-roteiro.md --rev r001

# Promover uma versão alternativa para o arquivo .md principal (apenas após aprovação)
./bin/crom-studio roteiro promover --canal canal-principal --arquivo 02-roteiros/rascunhos/meu-roteiro.md --versao v2-enxuta

# Excluir uma versão alternativa descartada (não permite excluir "principal")
./bin/crom-studio roteiro excluir-versao --canal canal-principal --arquivo 02-roteiros/rascunhos/meu-roteiro.md --versao v2-enxuta
```

---

## Integração Kdenlive & MCP (`kdenlive-mcp-plus`)

Quando `kdenliveRoot` está configurado:

1. `src/sync.mjs` lê (sem alterar nenhum arquivo da pasta Kdenlive) `canais.json`, `canal.json`, `estilos/*.md` e as subpastas de projetos de vídeo por canal.
2. A aba **Produção** (`/<canal>/producao`) lista os modelos de produção (`edicao-artigos`, `vitrine-projetos`, `ensaio`, `documentario`), os estilos visuais com prévia de paleta e os projetos existentes.
3. No leitor de roteiros, o botão **▶ Produzir no Kdenlive** gera:
   - O comando CLI `./criar_video.sh --canal <canal> <slug> [--serie <serie>]`
   - O prompt completo para o agente conectado ao MCP **`kdenlive-mcp-plus`**.

---

## Endpoints da API Local (`src/server.mjs`)

### Estado, Tempo Real e Saúde

- `GET /api/health` → `{ ok, port, host, defaultChannel, channels }`
- `GET /api/state` → estado multi-canal sincronizado (`channels`, `kdenlive`)
- `GET /api/events` → stream SSE (`event: ready` e `event: update` disparado por `fs.watch` ou API)
- `POST /api/sync-youtube` → atualiza o RSS do YouTube (`{ channel: "all" | "<canal>" }`)

### Configurações e Workspaces (`config.local.json`)

- `GET /api/config` → retorna a configuração editável atual (`port`, `host`, `defaultChannel`, `kdenliveRoot`, `channels`)
- `PUT /api/config` → atualiza configurações gerais ou de um/mais canais e recarrega watchers
- `POST /api/config/channels` → adiciona novo workspace (com `createFolder: true` opcional para criar pastas iniciais e `README.md`)
- `DELETE /api/config/channels` → remove um workspace da configuração (`?key=<canal>` ou JSON body)

### Documentos Markdown

- `POST /api/doc` → cria novo `.md` com revisão inicial `r001` (`{ channel, folder, filename, content }`)
- `PUT /api/doc` → atualiza/move `.md` registrando revisão (`{ channel, path, newPath, content, version, commitMessage, author }`)
- `DELETE /api/doc` → remove `.md` e seu diretório `.roteiro-git/<docKey>` (`?channel=...&path=...`)

### Quadros Excalidraw (`<workspace>/quadros/*.excalidraw`)

- `GET /api/boards?channel=<canal>` → lista quadros salvos no workspace (`{ ok, channel, boards }`)
- `GET /api/boards/item?channel=<canal>&id=<slug>` → retorna metadados e cena Excalidraw v2 (`{ ok, channel, board, scene }`)
- `POST /api/boards` → cria quadro atomically (`{ channel, title, id?, elements?, appState?, files?, preferredMode? }`)
- `PUT /api/boards` → salva elementos, `appState`, `files`, título, `preferredMode` (`excalidraw` | `nodes`) e `renameTo` opcional
- `DELETE /api/boards?channel=<canal>&id=<slug>` → remove o arquivo `.excalidraw` do workspace com validação estrita de slug e sem symlinks

### Git de Roteiros & Versões Alternativas

- `GET /api/versions?channel=<canal>&path=<relPath>` → histórico de revisões e lista de versões
- `GET /api/versions/content?channel=<canal>&path=<relPath>&ref=<ver:...|rev:rNNN|disk>` → lê o conteúdo de uma referência
- `GET /api/versions/diff?channel=<canal>&path=<relPath>&from=<ref>&to=<ref>` → diff linha a linha entre duas referências
- `POST /api/versions/commit` → registra revisão (`rNNN`) na linha `principal` ou em uma variante
- `POST /api/versions/create` → cria nova versão alternativa (`versoes/<slug>.md`) sem alterar `principal`
- `POST /api/versions/restore` → restaura uma revisão `rNNN` via commit append-only
- `POST /api/versions/promote` → promove versão alternativa para o `.md` principal preservando o histórico
- `DELETE /api/versions?channel=<canal>&path=<relPath>&versionName=<slug>` → remove versão alternativa

### Segurança embutida

- O indexador (`src/sync.mjs`) ignora symlinks (`entry.isSymbolicLink()`) e diretórios internos/ocultos (`studio`, `.git`, `.roteiro-git`, `node_modules`).
- A API valida o canal contra `config.channels`, bloqueia path traversal (`..`, segmentos ocultos), bloqueia leitura/escrita através de symlinks via `realpathSync`/`lstatSync` e protege `AGENTS.md` e `README.md` na raiz de cada workspace contra remoção ou movimentação.

---

## Licença

[MIT](LICENSE)
