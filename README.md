# Crom YouTube Studio

Painel web editorial **multi-canal** para YouTube com leitor/editor de roteiros Markdown, teleprompter em tempo real, pipeline Kanban, sincronizador de feed RSS do YouTube, ponte com a fábrica de vídeos **Kdenlive / MCP (`kdenlive-mcp-plus`)** e ícone persistente na bandeja do sistema (system tray).

Construído em **Node.js nativo (zero dependências externas)** no backend, **HTML/CSS/JS clássico** no frontend (compatível inclusive via `file://` sem CORS) e **Python 3 + GTK 3 / AyatanaAppIndicator3** para o aplicativo de bandeja no Linux.

---

## Principais Recursos

- **Multi-canal com troca em 1 clique:** alterne instantaneamente entre múltiplos workspaces de canais no topo da barra lateral ou no cabeçalho (`?canal=<id>` na URL + persistência em `localStorage`), com suporte a badge de status (`ATIVO` vs `PAUSADO`).
- **Indexação e edição direta de `.md`:** lê e grava frontmatter YAML, checklists interativos (`- [ ]` ↔ `- [x]`), marcações de roteiro (`[GANCHO]`, `[TELA]`, `[B-ROLL]`, `[CORTE]`), timestamps (`00:00`) e séries temáticas (incluindo suporte automático para `06-series/<serie>/`).
- **Leitor, Editor Split e Teleprompter:** modos de leitura limpa, edição lado a lado com preview ao vivo e teleprompter com controle de velocidade, fonte e espelhamento.
- **Sincronização YouTube RSS:** atualiza caches locais (`data/<canal>-youtube-cache.json`) e tabelas em `00-canal/catalogo-youtube.md` via `node src/sync.mjs --youtube` ou `POST /api/sync-youtube`.
- **Ponte Kdenlive + MCP (`kdenlive-mcp-plus`):** lê em modo somente-leitura `canais.json`, `canal.json`, `estilos/*.md` e pastas de projetos de vídeo em `kdenliveRoot`, exibindo modelos/estilos na aba **Produção** e gerando comandos `./criar_video.sh --canal <canal> <slug>` + prompts prontos para o MCP no leitor de roteiros.
- **Ícone na Bandeja do Sistema (`tray/tray.py`):** controla o servidor Node em background, abre o Studio direto no canal desejado, dispara sincronizações RSS e abre pastas de trabalho sem duplicar instâncias.
- **Estética escura translúcida + `ColorFlowEngine`:** fluxo suave e configurável de paletas dinâmicas sem bloquear a leitura.

---

## Arquitetura do Repositório

```text
crom-youtube-studio/
├── config.example.json       # Modelo genérico de configuração (versionado)
├── config.local.json         # Configuração real da sua máquina (gitignored)
├── package.json              # Scripts Node sem dependências externas
├── LICENSE                   # Licença MIT
├── src/
│   ├── config.mjs            # Carrega --config, CROM_STUDIO_CONFIG, config.local.json ou config.example.json
│   ├── sync.mjs              # Varre workspaces .md (ignorando symlinks), caches RSS e Kdenlive -> data/
│   └── server.mjs            # Servidor HTTP + API REST multi-canal (/api/health, /api/state, /api/doc, /api/sync-youtube)
├── web/
│   ├── index.html            # Shell HTML (carrega scripts clássicos com defer para suportar file://)
│   ├── styles.css            # Tema escuro translúcido e layout responsivo
│   ├── markdown.js           # Parser/serializador YAML + renderizador Markdown seguro
│   ├── app.js                # Aplicação multi-canal, gráficos SVG, Kanban, Teleprompter e Ponte Kdenlive
│   └── data.js               # Bundle JS gerado pelo sync (gitignored)
├── data/                     # Caches RSS por canal e data.json/data.js gerados (gitignored)
├── assets/                   # Ícones da aplicação e bandeja (crom-logo.png, crom-tray.png, crom-tray-off.png, .svg)
├── tray/
│   └── tray.py               # Aplicativo GTK 3 / AyatanaAppIndicator3 single-instance
└── bin/
    ├── crom-studio           # CLI unificado (--tray, --server, --sync, --sync-youtube, --open, --canal, --check)
    └── install-desktop.sh    # Instalador de atalho .desktop (e --autostart opcional)
```

---

## Configuração (`config.example.json` → `config.local.json`)

Nunca comite caminhos absolutos pessoais ou caches locais. Copie o modelo para criar sua configuração local (já listada no `.gitignore`):

```bash
cp config.example.json config.local.json
```

Edite `config.local.json` apontando para os diretórios reais dos seus canais e da sua fábrica Kdenlive:

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
      "avatar": "",
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

### 1. Sincronizar arquivos Markdown e caches

```bash
npm run sync
# ou com atualização via feed RSS público do YouTube:
npm run sync:youtube
```

### 2. Iniciar o servidor web diretamente

```bash
npm start
# acesse http://127.0.0.1:4173/?canal=mrj (ou ?canal=crom)
```

### 3. Iniciar com o ícone na bandeja do sistema (recomendado no Desktop Linux)

```bash
./bin/crom-studio --tray --open
```

Principais opções do CLI `bin/crom-studio`:

- `--tray`: inicia (ou aciona via socket UNIX) o aplicativo de bandeja `tray/tray.py`.
- `--open` / `--no-open`: abre ou não o navegador padrão ao iniciar.
- `--canal <chave>`: define o canal aberto no navegador (`?canal=<chave>`).
- `--server`: sobe `node src/server.mjs` em foreground.
- `--sync` / `--sync-youtube`: roda `src/sync.mjs` (com ou sem RSS).
- `--check`: valida dependências Python/GTK e arquivos necessários para a bandeja.

Para instalar o atalho no menu de aplicativos do Linux (e opcionalmente no autostart da sessão):

```bash
./bin/install-desktop.sh
# ou com inicialização automática no login:
./bin/install-desktop.sh --autostart
```

---

## Integração Kdenlive & MCP (`kdenlive-mcp-plus`)

Quando `kdenliveRoot` está configurado:

1. `src/sync.mjs` lê (sem alterar nenhum arquivo da pasta Kdenlive) `canais.json`, `canal.json`, `estilos/*.md` e as subpastas de projetos de vídeo por canal.
2. A aba **Produção** lista os modelos de produção (`edicao-artigos`, `vitrine-projetos`, `ensaio`, `documentario`), os estilos visuais com prévia de paleta e os projetos existentes.
3. No leitor de roteiros, o botão **▶ Produzir no Kdenlive** gera:
   - O comando CLI `./criar_video.sh --canal <canal> <slug> [--serie <serie>]`
   - O prompt completo para o agente conectado ao MCP **`kdenlive-mcp-plus`**.

---

## Endpoints da API Local (`src/server.mjs`)

- `GET /api/health` → `{ ok, port, host, defaultChannel, channels }`
- `GET /api/state` → estado multi-canal sincronizado (`channels`, `kdenlive`)
- `POST /api/doc` → cria novo `.md` no canal informado (`{ channel, folder, filename, content }`)
- `PUT /api/doc` → atualiza ou move `.md` dentro do workspace do canal (`{ channel, path, newPath, content }`)
- `DELETE /api/doc` → remove `.md` (`?channel=...&path=...`)
- `POST /api/sync-youtube` → atualiza o RSS do YouTube (`{ channel: "all" | "<canal>" }`)

### Segurança embutida

- O indexador (`src/sync.mjs`) ignora symlinks (`entry.isSymbolicLink()`) e diretórios internos (`studio`, `.git`, `node_modules`).
- A API valida o canal contra `config.channels`, bloqueia path traversal (`..`, segmentos ocultos), bloqueia leitura/escrita através de symlinks via `realpathSync`/`lstatSync` e protege `AGENTS.md` e `README.md` na raiz de cada workspace contra remoção ou movimentação.

---

## Licença

[MIT](LICENSE)
