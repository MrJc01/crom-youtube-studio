# Crom YouTube Studio

Painel web editorial **multi-canal** para YouTube com interface **borderless ponta a ponta**, barra de abas superior retrátil e **fixável (`📌`)**, menu de contexto personalizado no botão direito, leitor/editor de roteiros Markdown com painel **Ecossistema do Projeto** (`🎙️ Gravar este roteiro`), **Git de Roteiros + Versões Alternativas**, **Busca Global Unificada (`Ctrl+K`)** em 6 fontes, **Mapa de Roteiros** em cartões e **Fluxograma responsivo**, **Quadro & Fluxos** com **Excalidraw completo (`pt-BR`) + Modo Foco em Nodes**, **Catálogo YouTube completo paginado (Longs + Shorts) & Curadoria em Lista Empilhada**, **Estúdio de Gravação Multi-Track** (combinado + faixas separadas + `.wav` automático + MP4 + teleprompter), **Notas estilo Google Keep** (+ sync via **GitHub Gist privado** e exportação), **Acesso Remoto** (Wi-Fi LAN, `ngrok`, QR Code SVG offline e PIN com proteção contra força bruta), **Saúde dos Dados (`doctor`), Backup Portátil (`.tar.gz`) & Lixeira Recuperável (30 dias)**, sincronização em tempo real (`fs.watch` + SSE + cache em RAM), ponte com **Kdenlive / MCP (`kdenlive-mcp-plus`)** e ícone na bandeja do sistema (system tray).

Construído em **Node.js (>= 20)** no backend modular (`src/lib/`, `src/middleware/`, `src/routes/`, `src/state-cache.mjs`), **ES Modules + CSS modular** no frontend compilados via `esbuild` (`scripts/build-web.mjs` → `web/dist/`), bundle local oficial de **`@excalidraw/excalidraw`** (zero dependência de CDN em runtime), **`qrcode`** para SVG offline e **Python 3 + GTK 3 / AyatanaAppIndicator3** para o aplicativo de bandeja no Linux. Utilitários opcionais do sistema (`ffmpeg`, `gh` CLI e `ngrok`) habilitam extração `.wav`/`.mp4`, sync de Gist privado e túnel público.

---

## Principais Recursos

- **Interface Borderless, Barra de Abas Retrátil/Fixável (`📌`) & Menu de Contexto Personalizado:**
  - Shell sem bordas externas (`.viewport-frame` e `.studio-shell` edge-to-edge) com scroll limpo em todas as telas.
  - **Barra de abas superior retrátil e fixável (estilo OpenCode / navegador):** abre automaticamente na **Visão Geral** e recolhe para o puxador superior (`▾`) nas páginas internas; o botão **`📌`** (`#pinTabstripBtn`) permite fixar a barra sempre aberta em todas as páginas (`localStorage`). Suporta `+` nova aba, `Ctrl+Click` / clique do meio e abas dedicadas para **links externos** (com player embutido para YouTube).
  - **Menu de contexto no botão direito (`#studioContextMenu`):** em roteiros, cards, barra lateral, abas e links externos, oferece **Abrir em nova aba**, **Abrir em aba (segundo plano)**, **Abrir na barra de abas (topo)**, **Copiar como contexto** (Markdown estruturado), **Copiar link / URL / caminho** e **Enviar para o Quadro (Excalidraw)**.
- **Busca Global Unificada (`Ctrl+K`):**
  - Paleta de comandos em `web/src/core/command-palette.js` que pesquisa simultaneamente em **6 fontes** do canal ativo agrupadas por categoria, com navegação por setas + `Enter`:
    1. **Roteiros & Docs (`.md`)** → abre `/<canal>/roteiros/<path>`
    2. **Quadros Excalidraw** → abre `/<canal>/quadro/<id>`
    3. **Vídeos do Catálogo** → abre o item no Catálogo
    4. **Playlists de Curadoria** → abre a aba Playlists no Catálogo
    5. **Notas Keep** → abre `/<canal>/notas`
    6. **Sessões de Gravação** → abre `/<canal>/gravar`
- **URLs amigáveis com SPA fallback (`src/routes/http-utils.mjs` + `src/server.mjs`):**
  - `/<canal>` — Visão Geral (única tela com KPIs no cabeçalho e switcher grande de canais)
  - `/<canal>/roteiros` e `/<canal>/roteiros/<caminho.md>` — Roteiros & Leitor (suporta `?modo=ler|editar|teleprompter|historico&versao=<slug>&foco=1`)
  - `/<canal>/mapa` — Mapa de Roteiros (Cartões coloridos por status + **Fluxograma interativo responsivo**)
  - `/<canal>/quadro` e `/<canal>/quadro/<slug>` — **Quadro & Fluxos** (Lista de Quadros + Excalidraw limpo sem FAB + Foco em Nodes, salvos em `<workspace>/quadros/*.excalidraw`)
  - `/<canal>/pipeline` — Pipeline Kanban interativo
  - `/<canal>/ideias` — Ideias, Séries & GitHub
  - `/<canal>/catalogo` — **Catálogo YouTube Completo (Longs + Shorts) & Playlists / Curadoria**
  - `/<canal>/gravar` — **Estúdio de Gravação Multi-Track & Biblioteca de Takes** (suporta `?roteiro=<path>`)
  - `/<canal>/notas` — **Notas Estilo Google Keep (+ Sync Gist Privado)**
  - `/<canal>/producao` — Produção & Ponte Kdenlive
  - `/<canal>/agente` — Central do Agente & Arquivos
  - `/<canal>/configuracoes` — Configurações do Studio, Workspaces, Acesso Remoto e Saúde / Backup / Lixeira
- **Leitor de Roteiros limpo, Ecossistema Conectado, Modo Foco & Inspetor Direito:**
  - Topbar enxuta nas páginas internas (contagens e switcher expandido ficam apenas na Visão Geral).
  - Área central focada em leitura/escrita com ajuste de tamanho de fonte (`A-` / `A+`) e **Modo Foco (`⛶`)**, além do **Inspetor Direito** para metadados YAML, versões alternativas e aba **Histórico & Diff**.
  - **Ecossistema do Projeto (`projectLinks`):** o inspetor exibe gravações, quadros Excalidraw, notas Keep, vídeos/playlists de curadoria e projetos Kdenlive conectados ao roteiro ativo, com o botão destaque **`🎙️ Gravar este roteiro`** que abre `/<canal>/gravar?roteiro=<path>` com o roteiro pré-selecionado no Mini Teleprompter e nome de sessão sugerido.
- **Git de Roteiros + Versões Alternativas (2 Dinâmicas Distintas):**
  - **Dinâmica 1 — Git de Roteiros:** snapshots imutáveis (`r001`, `r002`, ...) em `<workspace>/.roteiro-git/<docKey>/revisoes/`, diff linha a linha, snapshot de resgate automático para edições externas e restauração append-only.
  - **Dinâmica 2 — Versões Alternativas:** variantes nomeadas (`v2-enxuta`, `gancho-direto`, ...) em `<workspace>/.roteiro-git/<docKey>/versoes/<slug>.md` sem alterar o `.md` principal, com commits independentes, diff contra `principal` e promoção controlada.
- **Catálogo Completo Paginado, Playlists & Curadoria (`/<canal>/catalogo`):**
  - Scraper Node nativo (`src/youtube-scraper.mjs`) que percorre `/videos` e `/shorts` com continuações `youtubei/v1/browse` + enriquecimento/fallback via feed RSS público, superando o teto de 15 itens do RSS e registrando `totalVideos`, `totalLongs`, `totalShorts` e `totalViews`.
  - Alternância entre **Lista Empilhada (`☰`)** e **Grade (`▦`)**, agrupamento (`Nenhum`, `Categoria`, `Tipo (Long/Short)`, `Status`, `Ano`), filtros por categoria/status/busca, estrela de favorito e **anotações rápidas por vídeo** persistidas atomicamente em `<workspace>/.studio-data/curadoria.json`.
  - Aba **Playlists & Curadoria** (`src/catalog-curadoria.mjs`): criação de playlists locais, **importação de playlists públicas do YouTube por URL**, adição de vídeo avulso por URL (hidratação automática via `oEmbed`/watch), gerenciamento de categorias customizadas e botão **`✎ Criar Roteiro / Reavaliar`** (`POST /api/curadoria/create-script`) que gera o `.md` já vinculado ao vídeo.
- **Estúdio de Gravação Multi-Track (`/<canal>/gravar`):**
  - Modos de captura no navegador: **`Tudo Junto + Separado`** (grava PiP combinado em `<canvas>` + faixas individuais separadas ao mesmo tempo), **`Tela + Voz`**, **`Webcam + Voz`**, **`Só Narração (Voz)`** e **`Só Tela`**.
  - Seleção de microfone/câmera, posicionamento e tamanho de webcam PiP, medidor VU em tempo real (`AudioContext` + `AnalyserNode`) e **mini teleprompter** integrado com qualquer roteiro do workspace (incluindo vínculo automático via `?roteiro=`).
  - Upload em stream binário (até ~512 MB por faixa) organizado em `<workspace>/gravacoes/<AAAA-MM-DD>_<slug>/take-<NN>/` (`01-combinado.*`, `02-tela.*`, `03-webcam.*`, `04-voz.*` + `meta.json`).
  - Quando `ffmpeg` está disponível no sistema: extração automática de **`04-voz.wav`** (`pcm_s16le`, `48kHz`, mono) para faixas de voz e conversão opcional sob demanda para **`.mp4`** (`libx264` + `aac`).
  - Biblioteca de takes com player inline (`GET /api/recordings/media` com `Accept-Ranges: bytes` e HTTP `206 Partial Content`), cópia de caminho da pasta e exclusão segura.
- **Notas Estilo Google Keep (`/<canal>/notas`):**
  - Composer expansível para notas em texto livre ou checklists interativos, 8 cores estilo Keep, seções **Fixadas** e **Outras**, arquivamento, labels/tags, link opcional e conversão direta para roteiro/ideia `.md` (`POST /api/notes/to-doc`).
  - Persistência atômica em `<workspace>/.studio-data/notas.json`, exportação em **`JSON`**, **`Markdown`** e **`TXT`**, importação **`JSON`** e sincronização opcional via **GitHub Gist privado** (`gh` CLI, sempre secreto/privado — nunca `--public`).
- **Mapa de Roteiros & Modo Fluxograma Responsivo (`/<canal>/mapa`):**
  - Alterna entre **Cartões** coloridos por status e **Fluxograma interativo** com 3 layouts (**Constelação (Clusters)**, **User Flow (Blocos)** e **Pipeline (Etapas)**), enquadramento automático por bounding box real (`ResizeObserver`), títulos legíveis sem corte, zero overflow horizontal em desktop/tablet/mobile, drag-to-pan (`PointerEvent`), zoom, **Tela Cheia (`⛶`)** e exportação direta via **`✎ Abrir no Quadro (Excalidraw)`**.
- **Quadro & Fluxos — Excalidraw Local Limpo + Foco em Nodes (`/<canal>/quadro`):**
  - Lista de quadros estilo Studio com busca, filtro por modo, `☰ Lista` / `▦ Grade`, `+ Novo Quadro`, `⤒ Importar .excalidraw` e botão `← Quadros` no editor.
  - Bundle offline de **`@excalidraw/excalidraw`** em `pt-BR` servido localmente em `/excalidraw-frame.html`, ocultando os botões flutuantes `.fab-cluster` durante o uso do quadro (`body.is-whiteboard-view`) para manter livre o canvas e o botão `?`.
  - Dois modos persistidos por quadro: **✎ Excalidraw Completo** e **◈ Foco em Nodes** (cards numerados, `+ Próximo` com `Tab`, `+ Ramo`, `+ Grupo`, `+ Decisão`, `+ Destino`, alinhamento e setas conectadas), além de **`📄 + Roteiro`**, auto-save (`900ms`) + `Ctrl+S` e sync SSE.
- **Acesso Remoto (Wi-Fi LAN, `ngrok`, QR Code SVG & PIN) (`/<canal>/configuracoes`):**
  - **Wi-Fi LAN dinâmico:** sobe e encerra um servidor HTTP secundário no IP IPv4 da rede local sem reiniciar a porta principal `:4173`.
  - **Túnel `ngrok`:** ativação e desligamento explícito (`▶ Ativar ngrok` / `⏹ Desligar ngrok`) pela interface ou chip rápido na topbar (`#remoteLiveChip`), com encerramento automático no shutdown do servidor.
  - **QR Code SVG offline:** geração local de `<svg>` escaneável para LAN e `ngrok` usando o pacote `qrcode`.
  - **Proteção opcional por PIN com rate limit:** conexões externas exigem desbloqueio via PIN (`timingSafeEqual` + cookie `HttpOnly` assinado) com bloqueio HTTP `429 Retry-After` após 5 tentativas falhas, enquanto o acesso local em loopback (`127.0.0.1` / `::1`) permanece livre.
- **Persistência Atômica, Quarentena, Lixeira (30 dias), Cache em RAM, Backup & Doctor (`/<canal>/configuracoes` Card 6):**
  - **Cache em RAM + Workspace Portátil:** `src/state-cache.mjs` mantém o estado em memória e reconstrói apenas o canal alterado (`refreshChannel`), com gravação debounced em `data/`/`web/data.js` e flush imediato no shutdown; cada workspace armazena seu próprio cache do YouTube em `<workspace>/.studio-data/youtube-cache.json`.
  - **Escrita atômica e auto-recuperação (`src/lib/storage.mjs`):** gravações via arquivo temporário + `fsyncSync` + `renameSync` + backup `.bak`, serialização concorrente com `withFileLock`, preservação de JSON corrompido em `.studio-data/quarantine/` e recuperação automática do `.bak`.
  - **Lixeira Recuperável de 30 dias (`src/lib/trash.mjs`):** exclusões de roteiros (`.md`), quadros (`.excalidraw`), notas Keep e playlists vão para `<workspace>/.studio-data/trash/` com restauração ou purge definitivo pelo **Card 6 (`6. Saúde dos Dados, Backup & Lixeira`)**.
  - **Diagnóstico (`doctor`) e Backup Portátil (`.tar.gz`):** auditoria de YAML/JSON, quarentena, lixeira, Kdenlive, binários e disco livre, além de exportação `.tar.gz` (com opção para incluir ou excluir `gravacoes/`).
- **Atualização em Tempo Real (`fs.watch` + SSE `/api/events`), Ponte Kdenlive & System Tray (`tray/tray.py`):**
  - Watchers em arquivos `.md`, `.excalidraw`, `.roteiro-git/` e `config.local.json` disparam re-sincronização incremental e SSE; ponte somente-leitura com `kdenliveRoot`; ícone de bandeja GTK 3 para subir, reiniciar e abrir o painel.

---

## Arquitetura do Repositório

```text
crom-youtube-studio/
├── config.example.json       # Modelo genérico de configuração (versionado)
├── config.local.json         # Configuração real da máquina (gitignored)
├── package.json              # Scripts build, sync, start, doctor, backup, test, test:e2e, test:all
├── LICENSE                   # Licença MIT
├── scripts/
│   ├── build-whiteboard.mjs  # Gera web/vendor/excalidraw/ (bundle, CSS e fontes locais)
│   └── build-web.mjs         # Compila web/src/main.js e web/styles/main.css -> web/dist/
├── src/
│   ├── lib/
│   │   ├── storage.mjs       # assertInsideRoot, withFileLock, writeFileAtomic, writeJsonAtomic, quarentena/.bak
│   │   ├── trash.mjs         # Lixeira recuperável de 30 dias em <workspace>/.studio-data/trash/
│   │   ├── backup.mjs        # Gera backup portátil .tar.gz dos workspaces
│   │   └── doctor.mjs        # Diagnóstico de YAML/JSON, quarentena, lixeira, ferramentas e disco
│   ├── middleware/
│   │   └── security.mjs      # Proteção CSRF same-origin e rate limiter de tentativas PIN
│   ├── routes/
│   │   ├── http-utils.mjs    # Helpers JSON/YAML, validação de caminhos e estáticos (/dist, /vendor, SPA)
│   │   ├── config.mjs        # /api/health, /api/state, /api/sync, /api/config*, /api/doctor, /api/backup/download
│   │   ├── docs.mjs          # /api/doc, /api/versions*, /api/trash, /api/trash/restore
│   │   ├── boards.mjs        # /api/boards*
│   │   ├── catalog.mjs       # /api/sync-youtube, /api/curadoria*
│   │   ├── recordings.mjs    # /api/recordings* (streaming upload, MP4, Range HTTP 206)
│   │   ├── notes.mjs         # /api/notes* (Keep CRUD, export/import, Gist privado, to-doc)
│   │   └── remote.mjs        # /api/remote/* (LAN, ngrok, QR SVG, PIN com HTTP 429)
│   ├── config.mjs            # Carrega/salva config (--config, CROM_STUDIO_CONFIG, config.local.json)
│   ├── state-cache.mjs       # Cache em RAM por canal + flush debounced em disco e no shutdown
│   ├── sync.mjs              # Varre workspaces, calcula projectLinks/health e usa .studio-data/youtube-cache.json
│   ├── youtube-scraper.mjs   # Paginação completa /videos e /shorts (youtubei/v1/browse) + playlists + RSS
│   ├── catalog-curadoria.mjs # Categorias, playlists e curadoria (.studio-data/curadoria.json)
│   ├── recordings.mjs        # Sessões/takes multi-track em gravacoes/, .wav, MP4 e streaming HTTP 206
│   ├── notes.mjs             # Notas estilo Keep (.studio-data/notas.json), export/import e Gist privado
│   ├── remote-access.mjs     # Servidor Wi-Fi LAN dinâmico, lifecycle ngrok, QR SVG offline e rate limit PIN
│   ├── boards.mjs            # Persistência atômica de quadros (<workspace>/quadros/*.excalidraw)
│   ├── versioning.mjs        # Motor das 2 dinâmicas (.roteiro-git/<docKey>/revisoes e versoes)
│   ├── roteiro-git.mjs       # CLI de versionamento (crom-studio roteiro ...)
│   ├── whiteboard-entry.jsx  # Wrapper React/Excalidraw + dock Foco em Nodes + ponte postMessage
│   └── server.mjs            # Boot HTTP, LiveWatchHub (fs.watch + SSE), segurança CSRF/PIN e dispatch modular
├── web/
│   ├── index.html            # Shell HTML carregando dist/styles.bundle.css e dist/app.bundle.js
│   ├── markdown.js           # Parser/serializador YAML + renderizador Markdown seguro
│   ├── excalidraw-frame.html # Host isolado do Excalidraw local
│   ├── src/
│   │   ├── main.js           # Inicialização, registro das views e binding global de eventos
│   │   ├── core/             # colorflow, command-palette, constants, context-menu, modals, router, sse, state, tabs, utils
│   │   └── views/            # dashboard, scripts, map, whiteboard, pipeline, ideas, catalog, production, recorder, notes, agent, settings, settings-health
│   ├── styles/
│   │   ├── main.css          # Ponto de entrada CSS importando os parciais abaixo
│   │   └── 00-base.css ... 06-settings-responsive.css
│   ├── dist/                 # Bundles web compilados por build-web.mjs (gitignored)
│   ├── vendor/               # Assets compilados do Excalidraw (gitignored)
│   └── data.js               # Bundle JS gerado pelo sync (gitignored)
├── tests/
│   ├── storage.test.mjs              # Escrita atômica, .bak, quarentena, lock concorrente e assertInsideRoot
│   ├── trash-backup-doctor.test.mjs  # Lixeira 30d, backup .tar.gz e diagnóstico doctor
│   ├── security.test.mjs             # CSRF same-origin, rate limiter PIN e validação HTTP
│   ├── api-integration.test.mjs      # Integração REST/SSE em porta efêmera isolada
│   ├── e2e-workflows.test.mjs        # 4 jornadas full-stack de ponta a ponta
│   └── e2e-browser.mjs               # 10 jornadas E2E no Chrome Headless (CDP nativo)
├── data/                     # Bundles data.json / data.js gerados pelo sync/flush (gitignored)
├── assets/                   # Ícones da aplicação e bandeja (crom-logo.png, crom-tray*.png, .svg)
├── tray/
│   └── tray.py               # Aplicativo GTK 3 / AyatanaAppIndicator3 single-instance
└── bin/
    ├── crom-studio           # CLI unificado (--tray, serve, sync, doctor, backup, roteiro ...)
    └── install-desktop.sh    # Instalador de atalho .desktop (e --autostart opcional)
```

---

## Configuração (`config.example.json` → `config.local.json`)

Nunca comite caminhos absolutos pessoais, tokens ou caches locais. Copie o modelo para criar sua configuração local (já listada no `.gitignore`):

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

Opções de acesso remoto (`"remote": { "lanEnabled": false, "pinEnabled": false, "pinCode": "", "ngrokAuthtoken": "" }`) são gravadas **somente** em `config.local.json`. O endpoint `GET /api/config` nunca retorna `pinCode` ou `ngrokAuthtoken` em texto puro (expõe apenas flags booleanas `pinConfigured` e `hasNgrokAuthtoken`).

### Ordem de resolução da configuração (`src/config.mjs`)

1. Flag CLI `--config <caminho>`
2. Variável de ambiente `CROM_STUDIO_CONFIG`
3. `config.local.json` na raiz do projeto
4. `config.example.json` (fallback padrão)

Caminhos relativos são resolvidos a partir do diretório do arquivo de configuração utilizado, e `~/` é expandido automaticamente para o `$HOME` do usuário em tempo de execução.

---

## Como Executar

### 1. Instalar dependências e compilar os bundles locais

```bash
npm install
# O script postinstall executa automaticamente: npm run build
# (gera web/vendor/excalidraw/* e web/dist/app.bundle.js + styles.bundle.css)
```

Para recompilar manualmente após editar código:

```bash
npm run build         # compila Excalidraw + frontend modular
npm run build:web     # compila apenas web/src/main.js e web/styles/main.css -> web/dist/
```

### 2. Dependências opcionais do sistema

- **`ffmpeg`**: habilita extração automática para `04-voz.wav` (48 kHz mono lossless) e conversão para `.mp4` no Estúdio de Gravação.
- **`gh` (GitHub CLI autenticado via `gh auth login`)**: habilita sincronização de notas com **GitHub Gist privado**.
- **`ngrok`**: habilita abertura/fechamento de túnel HTTPS público a partir da tela de Configurações.

### 3. Sincronizar arquivos Markdown, catálogo completo e caches

```bash
npm run sync
# ou com atualização completa do catálogo YouTube (longs + Shorts + RSS):
npm run sync:youtube
```

Cada workspace passa a manter seu próprio `<workspace>/.studio-data/youtube-cache.json` portátil (migrado automaticamente de `data/<canal>-youtube-cache.json` quando existir).

### 4. Iniciar o servidor web diretamente

```bash
npm start
# ou via CLI:
./bin/crom-studio serve
# acesse http://127.0.0.1:4173/canal-principal
# ex.: /mrj, /mrj/catalogo, /mrj/gravar, /mrj/notas, /mrj/mapa, /mrj/quadro, /mrj/configuracoes
```

### 5. Iniciar com o ícone na bandeja do sistema (recomendado no Desktop Linux)

```bash
./bin/crom-studio --tray --open
```

Principais opções e subcomandos do CLI `bin/crom-studio`:

- `--tray`: inicia (ou aciona via socket UNIX) o aplicativo de bandeja `tray/tray.py`.
- `--open` / `--no-open`: abre ou não o navegador padrão ao iniciar.
- `--canal <chave>`: define o canal aberto no navegador.
- `--server` / `serve`: sobe `node src/server.mjs` em foreground (compilando `web/vendor/` ou `web/dist/` automaticamente se estiverem ausentes).
- `--sync` / `sync` / `--sync-youtube`: roda `src/sync.mjs` (com ou sem atualização do YouTube).
- `doctor [--json] [--config <arquivo>]`: verifica integridade YAML/JSON, quarentena, lixeira, symlink Kdenlive, binários e espaço em disco.
- `backup [--canal <chave>|all] [--com-gravacoes] [--output caminho.tar.gz] [--json]`: gera backup portátil `.tar.gz` (excluindo `gravacoes/` por padrão).
- `--status` / `--quit`: consulta ou encerra a instância ativa do tray.
- `--check`: valida dependências Python/GTK e arquivos necessários para a bandeja.
- `roteiro <subcomando>`: interface CLI do **Git de Roteiros & Versões Alternativas**.

Atalhos correspondentes via npm:

```bash
npm run doctor
npm run backup -- --canal all --output backup-studio.tar.gz
```

Para instalar o atalho no menu de aplicativos do Linux (e opcionalmente no autostart da sessão):

```bash
./bin/install-desktop.sh
# ou com inicialização automática no login:
./bin/install-desktop.sh --autostart
```

---

## Testes Automatizados & E2E

Todos os testes rodam em diretórios isolados criados com `fs.mkdtempSync` e portas efêmeras (`port: 0`), sem tocar nos workspaces reais do usuário:

```bash
# Suíte Node nativa (unitários, segurança, integração REST/SSE e 4 jornadas full-stack)
npm test

# 10 jornadas E2E reais em Chrome/Chromium Headless via protocolo CDP nativo
npm run test:e2e

# Executa ambas as suítes em sequência
npm run test:all
```

Cobertura principal:
- **`tests/storage.test.mjs`**: escrita atômica, `.bak`, quarentena de JSON corrompido com auto-recuperação, concorrência via `withFileLock` e bloqueio de path traversal (`403`).
- **`tests/trash-backup-doctor.test.mjs`**: ciclo completo da lixeira (`moveToTrash`, `restoreFromTrash`, `purgeTrashItem`), `createBackupArchive` (`.tar.gz` portátil) e `runDoctor`.
- **`tests/security.test.mjs`**: proteção CSRF `verifySameOriginMutation` (`403` em cross-site) e rate limiting de PIN (`429 Retry-After` após 5 tentativas falhas).
- **`tests/api-integration.test.mjs`**: ciclo REST/SSE completo sobre `createStudioServer` em porta efêmera.
- **`tests/e2e-workflows.test.mjs`**: 4 jornadas full-stack (ciclo de roteiro + lixeira/restauração + SSE; gravação multi-track `.webm` → `.wav` → `.mp4` + HTTP `206` + `projectLinks`; curadoria + notas Keep + quadros + recuperação de corrupção via `.bak`; 20 mutações paralelas + CSRF + PIN `429` + download `.tar.gz`).
- **`tests/e2e-browser.mjs`**: 10 jornadas reais no navegador Headless (shell borderless e abas, menu de contexto + `📌`, **Ecossistema Conectado** → `🎙️ Gravar este roteiro` no Mini Teleprompter, **Busca Global `Ctrl+K`**, Fluxograma responsivo em `1440x900`/`768x1024`/`390x844`, Lista de Quadros + Excalidraw sem FAB + Foco em Nodes, Catálogo/Curadoria, Gravador Multi-Track, Notas Keep → Lixeira → Restauração no Card 6, e Configurações Cards 5 & 6).

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

## Endpoints da API Local (`src/routes/*.mjs` + `src/server.mjs`)

### Estado, Tempo Real, Saúde e Backup (`src/routes/config.mjs`)

- `GET /api/health` → `{ ok, port, host, defaultChannel, channels }`
- `GET /api/state` → estado multi-canal em RAM (`channels` com `projectLinks` e `health`, `kdenlive`)
- `GET /api/events` → stream SSE (`event: ready` e `event: update` disparado por `fs.watch` ou API)
- `POST /api/sync` → força reconstrução em RAM + flush imediato em disco (`stateCache.flushNow()`)
- `GET /api/doctor` → relatório de saúde YAML/JSON, quarentena, lixeira, ferramentas (`tar`, `ffmpeg`, `gh`, `ngrok`) e disco livre
- `GET /api/backup/download?channel=<all|canal>&includeRecordings=<0|1>` → gera e faz stream de `.tar.gz` portátil (removendo arquivo temporário ao concluir)

### Configurações e Workspaces (`config.local.json`)

- `GET /api/config` → retorna a configuração editável atual (`port`, `host`, `defaultChannel`, `kdenliveRoot`, `channels`, `remote` sem segredos)
- `PUT /api/config` → atualiza configurações gerais ou de um/mais canais e recarrega watchers
- `POST /api/config/channels` → adiciona novo workspace (com `createFolder: true` opcional para criar pastas iniciais e `README.md`)
- `DELETE /api/config/channels` → remove um workspace da configuração (`?key=<canal>` ou JSON body)

### Documentos Markdown & Lixeira Recuperável (`src/routes/docs.mjs`)

- `POST /api/doc` → cria novo `.md` com revisão inicial `r001` (`{ channel, folder, filename, content }`)
- `PUT /api/doc` → atualiza/move `.md` registrando revisão (`{ channel, path, newPath, content, version, commitMessage, author }`)
- `DELETE /api/doc` → move o `.md` para a **lixeira recuperável (30 dias)** antes de remover do diretório (`?channel=...&path=...`)
- `GET /api/trash?channel=<canal>` → lista itens na lixeira (`doc`, `board`, `note`, `playlist`) após expirar itens > 30 dias
- `POST /api/trash/restore` → restaura item da lixeira (`{ channel, id }`) atualizando notas, playlists, quadros ou roteiros
- `DELETE /api/trash?channel=<canal>&id=<id>&all=<0|1>` → apaga permanentemente um item ou limpa toda a lixeira

### Catálogo, Playlists & Curadoria (`src/routes/catalog.mjs`)

- `POST /api/sync-youtube` → atualiza catálogo paginado + RSS do YouTube (`{ channel: "all" | "<canal>" }`)
- `GET /api/curadoria?channel=<canal>` → retorna `{ categories, playlists, videoMeta }`
- `PUT /api/curadoria/video` → atualiza categoria, status, notas, tags, estrela ou vínculo com roteiro de um vídeo
- `POST|PUT|DELETE /api/curadoria/playlists` → cria (ou importa playlist pública do YouTube por URL), edita ou move playlist excluída para a lixeira
- `POST|PUT|DELETE /api/curadoria/playlists/item` → adiciona vídeo por URL/objeto (hidratando metadados), atualiza anotações/status do item ou remove da playlist
- `POST|DELETE /api/curadoria/categories` → cria/atualiza ou remove categorias personalizadas
- `POST /api/curadoria/create-script` → cria `.md` em `02-roteiros/rascunhos/` (série padrão `"Reavaliar"` ou escolhida), vincula `linkedDocPath` e atualiza o Studio

### Estúdio de Gravação Multi-Track (`src/routes/recordings.mjs`)

- `GET /api/recordings?channel=<canal>` → lista sessões/takes ordenados por data e informa disponibilidade de `ffmpeg`
- `POST /api/recordings/session` → cria pasta da sessão/take (`<AAAA-MM-DD>_<slug>/take-<NN>`) e `meta.json`
- `POST /api/recordings/track` → upload binário em stream (até ~512 MB) para `combinado`, `tela`, `webcam` ou `voz` (extraindo `04-voz.wav` automaticamente via `ffmpeg`)
- `POST /api/recordings/convert-mp4` → converte faixa gravada para `.mp4` (`libx264` + `aac`) via `ffmpeg`
- `GET|HEAD /api/recordings/media?channel=<canal>&path=<relPath>` → streaming de áudio/vídeo com `Accept-Ranges: bytes` e HTTP `206 Partial Content`
- `DELETE /api/recordings?channel=<canal>&sessionId=<id>&takeId=<take>` → remove take específico ou sessão inteira com segurança

### Notas Estilo Keep & Gist Privado (`src/routes/notes.mjs`)

- `GET|POST|PUT|DELETE /api/notes` → CRUD completo de notas, checklists, cores, pin, arquivamento e labels (`DELETE` move para a lixeira de 30 dias)
- `GET /api/notes/export?channel=<canal>&format=json|md|txt` → exporta notas em `JSON`, `Markdown` ou `TXT`
- `POST /api/notes/import` → importa notas a partir de payload `JSON`
- `POST /api/notes/sync-gist` → cria/atualiza **GitHub Gist privado** via `gh` CLI (`crom-studio-notas-<canal>.json`)
- `POST /api/notes/to-doc` → converte nota diretamente em `.md` (`01-ideias/` ou `02-roteiros/rascunhos/`)

### Acesso Remoto (Wi-Fi LAN, `ngrok`, QR Code SVG & PIN) (`src/routes/remote.mjs`)

- `GET /api/remote/status` → retorna status de rede LAN, túnel `ngrok`, `lanQrSvg`, `ngrokQrSvg` e estado do PIN
- `POST /api/remote/lan` → liga/desliga o servidor HTTP secundário no IP LAN (`{ enabled: boolean }`)
- `POST /api/remote/ngrok/start` → inicia túnel `ngrok` (`{ authtoken? }`) e retorna URL pública + QR Code SVG
- `POST /api/remote/ngrok/stop` → encerra o túnel `ngrok` ativo
- `PUT /api/remote/pin` → ativa/desativa ou atualiza o PIN para acessos externos (`{ enabled, pinCode? }`)
- `POST /api/remote/unlock` → valida o PIN com `timingSafeEqual` + rate limiter (retorna HTTP `429` + `Retry-After` após 5 falhas) e define cookie `HttpOnly` (`crom_remote_pin`)

### Quadros Excalidraw (`src/routes/boards.mjs`)

- `GET /api/boards?channel=<canal>` → lista quadros salvos no workspace (`{ ok, channel, boards }`, incluindo `linkedDocPaths`)
- `GET /api/boards/item?channel=<canal>&id=<slug>` → retorna metadados e cena Excalidraw v2 (`{ ok, channel, board, scene }`)
- `POST /api/boards` → cria quadro atomicamente (`{ channel, title, id?, elements?, appState?, files?, preferredMode? }`)
- `PUT /api/boards` → salva elementos, `appState`, `files`, título, `preferredMode` (`excalidraw` | `nodes`) e `renameTo` opcional
- `DELETE /api/boards?channel=<canal>&id=<slug>` → move o arquivo `.excalidraw` para a lixeira de 30 dias com validação estrita de slug e sem symlinks

### Git de Roteiros & Versões Alternativas (`src/routes/docs.mjs`)

- `GET /api/versions?channel=<canal>&path=<relPath>` → histórico de revisões e lista de versões
- `GET /api/versions/content?channel=<canal>&path=<relPath>&ref=<ver:...|rev:rNNN|disk>` → lê o conteúdo de uma referência
- `GET /api/versions/diff?channel=<canal>&path=<relPath>&from=<ref>&to=<ref>` → diff linha a linha entre duas referências
- `POST /api/versions/commit` → registra revisão (`rNNN`) na linha `principal` ou em uma variante
- `POST /api/versions/create` → cria nova versão alternativa (`versoes/<slug>.md`) sem alterar `principal`
- `POST /api/versions/restore` → restaura uma revisão `rNNN` via commit append-only
- `POST /api/versions/promote` → promove versão alternativa para o `.md` principal preservando o histórico
- `DELETE /api/versions?channel=<canal>&path=<relPath>&versionName=<slug>` → remove versão alternativa

### Segurança embutida

- **Middleware CSRF & Rate Limiter (`src/middleware/security.mjs`):** requisições mutáveis (`POST`/`PUT`/`PATCH`/`DELETE`) validam `Sec-Fetch-Site` e `Origin` contra o host ativo (`403` em cross-site); desbloqueios de PIN via acesso remoto aplicam `createPinRateLimiter()` (`429 Retry-After`).
- **Isolamento de caminhos & escrita atômica (`src/lib/storage.mjs`):** `assertInsideRoot` bloqueia path traversal (`..`) e symlink escape (`realpathSync`/`lstatSync`), `writeJsonAtomic`/`writeFileAtomic` usam `.tmp` + `fsyncSync` + `renameSync` + `.bak`, `readJsonWithMeta` preserva arquivos corrompidos em `.studio-data/quarantine/` antes de recuperar `.bak`, e `withFileLock` evita race conditions concorrentes.
- **Proteção do indexador & arquivos essenciais:** `src/sync.mjs` ignora symlinks, diretórios ocultos (`.git`, `.roteiro-git`, `.studio-data`) e `gravacoes/`, enquanto `AGENTS.md` e `README.md` na raiz de cada workspace são protegidos contra remoção ou movimentação.

---

## Licença

[MIT](LICENSE)
