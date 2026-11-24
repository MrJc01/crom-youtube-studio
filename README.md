# Crom YouTube Studio

Painel web editorial **multi-canal** para YouTube com interface **borderless ponta a ponta**, barra de abas superior retrátil e **fixável (`📌`)**, menu de contexto personalizado no botão direito, leitor/editor de roteiros Markdown, **Git de Roteiros + Versões Alternativas**, **Mapa de Roteiros** em cartões e **Fluxograma responsivo**, **Quadro & Fluxos** com **Excalidraw completo (`pt-BR`) + Modo Foco em Nodes**, **Catálogo YouTube completo paginado (Longs + Shorts) & Curadoria em Lista Empilhada**, **Estúdio de Gravação Multi-Track** (combinado + faixas separadas + `.wav` automático + MP4 + teleprompter), **Notas estilo Google Keep** (+ sync via **GitHub Gist privado** e exportação), **Acesso Remoto** (Wi-Fi LAN, `ngrok`, QR Code SVG offline e PIN opcional), pipeline Kanban, sincronização em tempo real (`fs.watch` + SSE), ponte com **Kdenlive / MCP (`kdenlive-mcp-plus`)** e ícone na bandeja do sistema (system tray).

Construído em **Node.js (>= 20)** no backend (APIs nativas `http`/`fs`/`crypto`/`fetch`), **HTML/CSS/JS clássico** no frontend, bundle local oficial de **`@excalidraw/excalidraw`** (zero dependência de CDN em runtime), **`qrcode`** para SVG offline e **Python 3 + GTK 3 / AyatanaAppIndicator3** para o aplicativo de bandeja no Linux. Utilitários opcionais do sistema (`ffmpeg`, `gh` CLI e `ngrok`) habilitam extração `.wav`/`.mp4`, sync de Gist privado e túnel público.

---

## Principais Recursos

- **Interface Borderless, Barra de Abas Retrátil/Fixável (`📌`) & Menu de Contexto Personalizado:**
  - Shell sem bordas externas (`.viewport-frame` e `.studio-shell` edge-to-edge) com scroll limpo em todas as telas.
  - **Barra de abas superior retrátil e fixável (estilo OpenCode / navegador):** abre automaticamente na **Visão Geral** e recolhe para o puxador superior (`▾`) nas páginas internas; o botão **`📌`** (`#pinTabstripBtn`) permite fixar a barra sempre aberta em todas as páginas (`localStorage`). Suporta `+` nova aba, `Ctrl+Click` / clique do meio e abas dedicadas para **links externos** (com player embutido para YouTube).
  - **Menu de contexto no botão direito (`#studioContextMenu`):** em roteiros, cards, barra lateral, abas e links externos, oferece **Abrir em nova aba**, **Abrir em aba (segundo plano)**, **Abrir na barra de abas (topo)**, **Copiar como contexto** (Markdown estruturado), **Copiar link / URL / caminho** e **Enviar para o Quadro (Excalidraw)**.
- **URLs amigáveis com SPA fallback (`src/server.mjs`):**
  - `/<canal>` — Visão Geral (única tela com KPIs no cabeçalho e switcher grande de canais)
  - `/<canal>/roteiros` e `/<canal>/roteiros/<caminho.md>` — Roteiros & Leitor (suporta `?modo=ler|editar|teleprompter|historico&versao=<slug>&foco=1`)
  - `/<canal>/mapa` — Mapa de Roteiros (Cartões coloridos por status + **Fluxograma interativo responsivo**)
  - `/<canal>/quadro` e `/<canal>/quadro/<slug>` — **Quadro & Fluxos** (Excalidraw limpo sem FAB + Foco em Nodes, salvos em `<workspace>/quadros/*.excalidraw`)
  - `/<canal>/pipeline` — Pipeline Kanban interativo
  - `/<canal>/ideias` — Ideias, Séries & GitHub
  - `/<canal>/catalogo` — **Catálogo YouTube Completo (Longs + Shorts) & Playlists / Curadoria**
  - `/<canal>/gravar` — **Estúdio de Gravação Multi-Track & Biblioteca de Takes**
  - `/<canal>/notas` — **Notas Estilo Google Keep (+ Sync Gist Privado)**
  - `/<canal>/producao` — Produção & Ponte Kdenlive
  - `/<canal>/agente` — Central do Agente & Arquivos
  - `/<canal>/configuracoes` — Configurações do Studio, Workspaces e Acesso Remoto
  - *(Compatibilidade preservada com `?canal=<id>` e `#/<canal>/...` ao abrir via `file://`.)*
- **Catálogo Completo Paginado, Playlists & Curadoria (`/<canal>/catalogo`):**
  - Scraper Node nativo (`src/youtube-scraper.mjs`) que percorre `/videos` e `/shorts` com continuações `youtubei/v1/browse` + enriquecimento/fallback via feed RSS público, superando o teto de 15 itens do RSS e registrando `totalVideos`, `totalLongs`, `totalShorts` e `totalViews`.
  - Alternância entre **Lista Empilhada (`☰`)** e **Grade (`▦`)**, agrupamento (`Nenhum`, `Categoria`, `Tipo (Long/Short)`, `Status`, `Ano`), filtros por categoria/status/busca, estrela de favorito e **anotações rápidas por vídeo** persistidas atomicamente em `<workspace>/.studio-data/curadoria.json`.
  - Aba **Playlists & Curadoria** (`src/catalog-curadoria.mjs`): criação de playlists locais, **importação de playlists públicas do YouTube por URL**, adição de vídeo avulso por URL (hidratação automática via `oEmbed`/watch), gerenciamento de categorias customizadas e botão **`✎ Criar Roteiro / Reavaliar`** (`POST /api/curadoria/create-script`) que gera o `.md` já vinculado ao vídeo.
- **Estúdio de Gravação Multi-Track (`/<canal>/gravar`):**
  - Modos de captura no navegador: **`Tudo Junto + Separado`** (grava PiP combinado em `<canvas>` + faixas individuais separadas ao mesmo tempo), **`Tela + Voz`**, **`Webcam + Voz`**, **`Só Narração (Voz)`** e **`Só Tela`**.
  - Seleção de microfone/câmera, posicionamento e tamanho de webcam PiP, medidor VU em tempo real (`AudioContext` + `AnalyserNode`) e **mini teleprompter** integrado com qualquer roteiro do workspace.
  - Upload em stream binário (até ~512 MB por faixa) organizado em `<workspace>/gravacoes/<AAAA-MM-DD>_<slug>/take-<NN>/` (`01-combinado.*`, `02-tela.*`, `03-webcam.*`, `04-voz.*` + `meta.json`).
  - Quando `ffmpeg` está disponível no sistema: extração automática de **`04-voz.wav`** (`pcm_s16le`, `48kHz`, mono) para faixas de voz e conversão opcional sob demanda para **`.mp4`** (`libx264` + `aac`).
  - Biblioteca de takes com player inline (`GET /api/recordings/media` com `Accept-Ranges: bytes` e HTTP `206 Partial Content`), cópia de caminho da pasta e exclusão segura.
- **Notas Estilo Google Keep (`/<canal>/notas`):**
  - Composer expansível para notas em texto livre ou checklists interativos, 8 cores estilo Keep, seções **Fixadas** e **Outras**, arquivamento, labels/tags, link opcional e conversão direta para roteiro/ideia `.md` (`POST /api/notes/to-doc`).
  - Persistência atômica em `<workspace>/.studio-data/notas.json`, exportação em **`JSON`**, **`Markdown`** e **`TXT`**, importação **`JSON`** e sincronização opcional via **GitHub Gist privado** (`gh` CLI, sempre secreto/privado — nunca `--public`).
- **Acesso Remoto (Wi-Fi LAN, `ngrok`, QR Code SVG & PIN) (`/<canal>/configuracoes`):**
  - **Wi-Fi LAN dinâmico:** sobe e encerra um servidor HTTP secundário no IP IPv4 da rede local sem reiniciar a porta principal `:4173`.
  - **Túnel `ngrok`:** ativação e desligamento explícito (`▶ Ativar ngrok` / `⏹ Desligar ngrok`) pela interface ou chip rápido na topbar (`#remoteLiveChip`), com encerramento automático no shutdown do servidor.
  - **QR Code SVG offline:** geração local de `<svg>` escaneável para LAN e `ngrok` usando o pacote `qrcode`.
  - **Proteção opcional por PIN:** conexões externas (LAN ou túnel `ngrok`) exigem desbloqueio via PIN (`timingSafeEqual` + cookie `HttpOnly` assinado), enquanto o acesso direto local em loopback (`127.0.0.1` / `::1`) permanece livre sem pedir PIN.
- **Leitor de Roteiros limpo, Modo Foco & Inspetor Direito:**
  - Topbar enxuta nas páginas internas (contagens e switcher expandido ficam apenas na Visão Geral).
  - Área central focada em leitura/escrita com ajuste de tamanho de fonte (`A-` / `A+`) e **Modo Foco (`⛶`)**, além do **Inspetor Direito** para metadados YAML, versões alternativas e aba **Histórico & Diff**.
- **Git de Roteiros + Versões Alternativas (2 Dinâmicas Distintas):**
  - **Dinâmica 1 — Git de Roteiros:** snapshots imutáveis (`r001`, `r002`, ...) em `<workspace>/.roteiro-git/<docKey>/revisoes/`, diff linha a linha, snapshot de resgate automático para edições externas e restauração append-only.
  - **Dinâmica 2 — Versões Alternativas:** variantes nomeadas (`v2-enxuta`, `gancho-direto`, ...) em `<workspace>/.roteiro-git/<docKey>/versoes/<slug>.md` sem alterar o `.md` principal, com commits independentes, diff contra `principal` e promoção controlada.
- **Mapa de Roteiros & Modo Fluxograma Responsivo (`/<canal>/mapa`):**
  - Alterna entre **Cartões** coloridos por status e **Fluxograma interativo** com 3 layouts (**Constelação (Clusters)**, **User Flow (Blocos)** e **Pipeline (Etapas)**), enquadramento automático por bounding box real (`ResizeObserver`), títulos legíveis sem corte, zero overflow horizontal em desktop/tablet/mobile, drag-to-pan (`PointerEvent`), zoom, **Tela Cheia (`⛶`)** e exportação direta via **`✎ Abrir no Quadro (Excalidraw)`**.
- **Quadro & Fluxos — Excalidraw Local Limpo + Foco em Nodes (`/<canal>/quadro`):**
  - Bundle offline de **`@excalidraw/excalidraw`** em `pt-BR` servido localmente em `/excalidraw-frame.html`, ocultando os botões flutuantes `.fab-cluster` durante o uso do quadro (`body.is-whiteboard-view`) para manter livre o canvas e o botão `?`.
  - Dois modos persistidos por quadro: **✎ Excalidraw Completo** e **◈ Foco em Nodes** (cards numerados, `+ Próximo` com `Tab`, `+ Ramo`, `+ Grupo`, `+ Decisão`, `+ Destino`, alinhamento e setas conectadas), além de **`📄 + Roteiro`**, importação `.excalidraw`, **Tela Cheia (`⛶`)**, auto-save (`900ms`) + `Ctrl+S` e sync SSE.
- **Atualização em Tempo Real (`fs.watch` + SSE `/api/events`), Ponte Kdenlive & System Tray (`tray/tray.py`):**
  - Watchers em arquivos `.md`, `.excalidraw`, `.roteiro-git/` e `config.local.json` disparam re-sincronização e SSE; ponte somente-leitura com `kdenliveRoot`; ícone de bandeja GTK 3 para subir, reiniciar e abrir o painel.

---

## Arquitetura do Repositório

```text
crom-youtube-studio/
├── config.example.json       # Modelo genérico de configuração (versionado)
├── config.local.json         # Configuração real da sua máquina (gitignored)
├── package.json              # Scripts Node, dependências (@excalidraw/excalidraw, qrcode) e build:whiteboard
├── LICENSE                   # Licença MIT
├── scripts/
│   └── build-whiteboard.mjs  # Gera web/vendor/excalidraw/ (bundle, CSS e fontes locais)
├── src/
│   ├── config.mjs            # Carrega/salva config (--config, CROM_STUDIO_CONFIG, config.local.json) e remote
│   ├── sync.mjs              # Varre workspaces .md/.excalidraw/.studio-data/gravacoes e coordena sync YouTube
│   ├── youtube-scraper.mjs   # Paginação completa /videos e /shorts (youtubei/v1/browse) + playlists + fallback RSS
│   ├── catalog-curadoria.mjs # Persistência de categorias, playlists e curadoria (.studio-data/curadoria.json)
│   ├── recordings.mjs        # Sessões/takes multi-track em gravacoes/, extração .wav, MP4 e streaming HTTP 206
│   ├── notes.mjs             # Notas estilo Keep (.studio-data/notas.json), export/import e Gist privado via gh
│   ├── remote-access.mjs     # Servidor Wi-Fi LAN dinâmico, lifecycle ngrok, QR Code SVG offline e gate PIN
│   ├── boards.mjs            # Persistência atômica de quadros (<workspace>/quadros/*.excalidraw)
│   ├── versioning.mjs        # Motor das 2 dinâmicas (.roteiro-git/<docKey>/revisoes e versoes)
│   ├── roteiro-git.mjs       # CLI de versionamento (crom-studio roteiro ...)
│   ├── whiteboard-entry.jsx  # Wrapper React/Excalidraw + dock Foco em Nodes + ponte postMessage
│   └── server.mjs            # Servidor HTTP + API REST + SPA fallback + fs.watch/SSE (/api/events)
├── web/
│   ├── index.html            # Shell HTML (barra de abas retrátil/fixável, modais, topbar chip e menu de contexto)
│   ├── styles.css            # Tema escuro borderless, abas, fluxograma responsivo, catálogo, gravador, Keep e remoto
│   ├── markdown.js           # Parser/serializador YAML + renderizador Markdown seguro
│   ├── app.js                # SPA multi-canal, abas, menu contextual, Fluxograma, Quadro, Curadoria, Gravador, Keep e Remoto
│   ├── excalidraw-frame.html # Host isolado do Excalidraw local
│   ├── vendor/               # Assets compilados do Excalidraw (gitignored)
│   └── data.js               # Bundle JS gerado pelo sync (gitignored)
├── data/                     # Caches YouTube por canal e data.json/data.js gerados (gitignored)
├── assets/                   # Ícones da aplicação e bandeja (crom-logo.png, crom-tray.png, crom-tray-off.png, .svg)
├── tray/
│   └── tray.py               # Aplicativo GTK 3 / AyatanaAppIndicator3 single-instance
└── bin/
    ├── crom-studio           # CLI unificado (--tray, --server, --sync, --sync-youtube, --open, --canal, roteiro ...)
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

### 1. Instalar dependências e compilar o Excalidraw local

```bash
npm install
# O script postinstall executa automaticamente: npm run build:whiteboard
# (gera web/vendor/excalidraw/bundle.js, excalidraw.css e fonts/ localmente)
```

### 2. Dependências opcionais do sistema (para recursos extras da v4)

- **`ffmpeg`**: habilita extração automática para `04-voz.wav` (48 kHz mono lossless) e conversão para `.mp4` no Estúdio de Gravação.
- **`gh` (GitHub CLI autenticado via `gh auth login`)**: habilita sincronização de notas com **GitHub Gist privado**.
- **`ngrok`**: habilita abertura/fechamento de túnel HTTPS público a partir da tela de Configurações.

### 3. Sincronizar arquivos Markdown, catálogo completo e caches

```bash
npm run sync
# ou com atualização completa do catálogo YouTube (longs + Shorts + RSS):
npm run sync:youtube
```

### 4. Iniciar o servidor web diretamente

```bash
npm start
# acesse http://127.0.0.1:4173/canal-principal
# ex.: /mrj, /mrj/catalogo, /mrj/gravar, /mrj/notas, /mrj/mapa, /mrj/quadro, /mrj/configuracoes
```

### 5. Iniciar com o ícone na bandeja do sistema (recomendado no Desktop Linux)

```bash
./bin/crom-studio --tray --open
```

Principais opções do CLI `bin/crom-studio`:

- `--tray`: inicia (ou aciona via socket UNIX) o aplicativo de bandeja `tray/tray.py`.
- `--open` / `--no-open`: abre ou não o navegador padrão ao iniciar.
- `--canal <chave>`: define o canal aberto no navegador.
- `--server`: sobe `node src/server.mjs` em foreground.
- `--sync` / `--sync-youtube`: roda `src/sync.mjs` (com ou sem atualização do YouTube).
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
- `GET /api/state` → estado multi-canal sincronizado (`channels`, `kdenlive`, `curadoria`, `notesCount`, `recordingsCount`)
- `GET /api/events` → stream SSE (`event: ready` e `event: update` disparado por `fs.watch` ou API)
- `POST /api/sync-youtube` → atualiza catálogo paginado + RSS do YouTube (`{ channel: "all" | "<canal>" }`)

### Configurações e Workspaces (`config.local.json`)

- `GET /api/config` → retorna a configuração editável atual (`port`, `host`, `defaultChannel`, `kdenliveRoot`, `channels`, `remote` sem segredos)
- `PUT /api/config` → atualiza configurações gerais ou de um/mais canais e recarrega watchers
- `POST /api/config/channels` → adiciona novo workspace (com `createFolder: true` opcional para criar pastas iniciais e `README.md`)
- `DELETE /api/config/channels` → remove um workspace da configuração (`?key=<canal>` ou JSON body)

### Documentos Markdown

- `POST /api/doc` → cria novo `.md` com revisão inicial `r001` (`{ channel, folder, filename, content }`)
- `PUT /api/doc` → atualiza/move `.md` registrando revisão (`{ channel, path, newPath, content, version, commitMessage, author }`)
- `DELETE /api/doc` → remove `.md` e seu diretório `.roteiro-git/<docKey>` (`?channel=...&path=...`)

### Catálogo, Playlists & Curadoria (`<workspace>/.studio-data/curadoria.json`)

- `GET /api/curadoria?channel=<canal>` → retorna `{ categories, playlists, videoMeta }`
- `PUT /api/curadoria/video` → atualiza categoria, status, notas, tags, estrela ou vínculo com roteiro de um vídeo
- `POST|PUT|DELETE /api/curadoria/playlists` → cria (ou importa playlist pública do YouTube por URL), edita ou exclui playlist de curadoria
- `POST|PUT|DELETE /api/curadoria/playlists/item` → adiciona vídeo por URL/objeto (hidratando metadados), atualiza anotações/status do item ou remove da playlist
- `POST|DELETE /api/curadoria/categories` → cria/atualiza ou remove categorias personalizadas
- `POST /api/curadoria/create-script` → cria `.md` em `02-roteiros/rascunhos/` (série padrão `"Reavaliar"` ou escolhida), vincula `linkedDocPath` e atualiza o Studio

### Estúdio de Gravação Multi-Track (`<workspace>/gravacoes/`)

- `GET /api/recordings?channel=<canal>` → lista sessões/takes ordenados por data e informa disponibilidade de `ffmpeg`
- `POST /api/recordings/session` → cria pasta da sessão/take (`<AAAA-MM-DD>_<slug>/take-<NN>`) e `meta.json`
- `POST /api/recordings/track` → upload binário em stream (até ~512 MB) para `combinado`, `tela`, `webcam` ou `voz` (extraindo `04-voz.wav` automaticamente via `ffmpeg`)
- `POST /api/recordings/convert-mp4` → converte faixa gravada para `.mp4` (`libx264` + `aac`) via `ffmpeg`
- `GET|HEAD /api/recordings/media?channel=<canal>&path=<relPath>` → streaming de áudio/vídeo com `Accept-Ranges: bytes` e HTTP `206 Partial Content`
- `DELETE /api/recordings?channel=<canal>&sessionId=<id>&takeId=<take>` → remove take específico ou sessão inteira com segurança

### Notas Estilo Keep & Gist Privado (`<workspace>/.studio-data/notas.json`)

- `GET|POST|PUT|DELETE /api/notes` → CRUD completo de notas, checklists, cores, pin, arquivamento e labels
- `GET /api/notes/export?channel=<canal>&format=json|md|txt` → exporta notas em `JSON`, `Markdown` ou `TXT`
- `POST /api/notes/import` → importa notas a partir de payload `JSON`
- `POST /api/notes/sync-gist` → cria/atualiza **GitHub Gist privado** via `gh` CLI (`crom-studio-notas-<canal>.json`)
- `POST /api/notes/to-doc` → converte nota diretamente em `.md` (`01-ideias/` ou `02-roteiros/rascunhos/`)

### Acesso Remoto (Wi-Fi LAN, `ngrok`, QR Code SVG & PIN)

- `GET /api/remote/status` → retorna status de rede LAN, túnel `ngrok`, `lanQrSvg`, `ngrokQrSvg` e estado do PIN
- `POST /api/remote/lan` → liga/desliga o servidor HTTP secundário no IP LAN (`{ enabled: boolean }`)
- `POST /api/remote/ngrok/start` → inicia túnel `ngrok` (`{ authtoken? }`) e retorna URL pública + QR Code SVG
- `POST /api/remote/ngrok/stop` → encerra o túnel `ngrok` ativo
- `PUT /api/remote/pin` → ativa/desativa ou atualiza o PIN para acessos externos (`{ enabled, pinCode? }`)
- `POST /api/remote/unlock` → valida o PIN com `timingSafeEqual` e define cookie `HttpOnly` (`crom_remote_pin`)

### Quadros Excalidraw (`<workspace>/quadros/*.excalidraw`)

- `GET /api/boards?channel=<canal>` → lista quadros salvos no workspace (`{ ok, channel, boards }`)
- `GET /api/boards/item?channel=<canal>&id=<slug>` → retorna metadados e cena Excalidraw v2 (`{ ok, channel, board, scene }`)
- `POST /api/boards` → cria quadro atomicamente (`{ channel, title, id?, elements?, appState?, files?, preferredMode? }`)
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

- O indexador (`src/sync.mjs`) ignora symlinks (`entry.isSymbolicLink()`), diretórios ocultos iniciados por `.` (`.git`, `.roteiro-git`, `.studio-data`) e diretórios internos (`studio`, `node_modules`), enquanto o `LiveWatchHub` (`src/server.mjs`) ignora `.studio-data/` e `gravacoes/` nos watchers de `.md`/`.excalidraw`.
- A API valida o canal contra `config.channels`, bloqueia path traversal (`..`, segmentos ocultos), bloqueia leitura/escrita através de symlinks via `realpathSync`/`lstatSync` (incluindo `gravacoes/`, `quadros/` e `.studio-data/`) e protege `AGENTS.md` e `README.md` na raiz de cada workspace contra remoção ou movimentação.
- Acesso remoto protege endpoints e páginas externas via PIN com `timingSafeEqual` + cookie `HttpOnly`, mantendo `127.0.0.1` local livre e Gist sync estritamente privado.

---

## Licença

[MIT](LICENSE)
