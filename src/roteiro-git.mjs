#!/usr/bin/env node
import fs from 'node:fs';
import { loadConfig, getCliArg } from './config.mjs';
import { syncWorkspace } from './sync.mjs';
import {
  getHistory,
  readRefContent,
  commitRevision,
  createVersion,
  restoreRevision,
  promoteVersion,
  setDefaultVersion,
  deleteVersion,
  diffTargets,
} from './versioning.mjs';

function printUsage() {
  console.log(`Uso: crom-studio roteiro <subcomando> [opções]

Subcomandos (Dinâmica 1 = Git de revisões | Dinâmica 2 = Versões diferentes):
  log          Lista versões e histórico de revisões de um roteiro
  commit       Registra uma nova revisão (Dinâmica 1) na versão indicada
  nova-versao  Cria uma versão alternativa/variante sem alterar a principal (Dinâmica 2)
  ler          Imprime o conteúdo de uma versão (ver:<nome>) ou revisão (rev:rNNN)
  diff         Compara linha a linha duas referências (--de e --para)
  restaurar    Restaura o conteúdo de uma revisão rNNN criando novo commit
  promover     Promove uma versão alternativa para o .md principal (só com OK do dono)
  versao-inicial  Define qual versão abre primeiro ao abrir o roteiro no Studio
  excluir-versao  Remove uma versão alternativa (não permite excluir "principal")

Opções comuns:
  --canal mrj|crom           Canal alvo (padrão: config.defaultChannel)
  --arquivo <caminho.md>     Caminho relativo ao workspace do canal
  --versao <nome>            Versão alvo (padrão: principal)
  --nome <slug>              Nome da nova versão (ex.: v2-enxuta, foco-benchmark)
  --desc <texto>             Descrição/objetivo da nova versão
  --de <ref>                 Referência origem para diff (ex.: ver:principal ou rev:r001)
  --para <ref>               Referência destino para diff (ex.: ver:v2-enxuta ou rev:r002)
  --rev <rNNN>               ID da revisão (ex.: r001)
  --autor <nome>             Autor do commit (ex.: Agente, MrJ)
  --msg <mensagem>           Mensagem explicando o que mudou
  --conteudo-arquivo <path>  Lê o novo conteúdo completo de um arquivo local
  --stdin                    Lê o novo conteúdo completo da entrada padrão (stdin)
  --json                     Saída em JSON estruturado`);
}

function readInputContent(argv) {
  const fileArg = getCliArg(argv, '--conteudo-arquivo');
  if (fileArg) {
    return fs.readFileSync(fileArg, 'utf8');
  }
  if (argv.includes('--stdin')) {
    return fs.readFileSync(0, 'utf8');
  }
  return null;
}

function resolveTarget(config, argv) {
  const rawChannel = getCliArg(argv, '--canal') || config.defaultChannel;
  const chKey = String(rawChannel || '').trim().toLowerCase();
  const chCfg = config.channels[chKey];
  if (!chCfg) {
    throw new Error(`Canal inválido: "${rawChannel}". Disponíveis: ${config.channelOrder.join(', ')}`);
  }
  const relPath = getCliArg(argv, '--arquivo') || getCliArg(argv, '--file');
  if (!relPath) {
    throw new Error('Informe --arquivo <caminho-relativo.md>.');
  }
  return { chKey, workspaceRoot: chCfg.workspacePath, relPath: relPath.replace(/^\/+/, '') };
}

function main() {
  const argv = process.argv.slice(2);
  const sub = argv[0];
  if (!sub || sub === '-h' || sub === '--help' || sub === 'help') {
    printUsage();
    process.exit(0);
  }

  const jsonOut = argv.includes('--json');
  const config = loadConfig(argv);
  const { workspaceRoot, relPath } = resolveTarget(config, argv);

  let result;
  switch (sub) {
    case 'log': {
      result = getHistory(workspaceRoot, relPath);
      if (jsonOut) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(`Arquivo: ${result.docPath} (${result.initialized ? 'versionado' : 'sem commits'})`);
        console.log(
          'Versões:',
          result.versions
            .map((v) => `${v.isDefault ? '★ ' : ''}${v.name} [${v.headRev || '-'}]`)
            .join(' | ')
        );
        console.log('Revisões:');
        for (const r of result.revisions) {
          console.log(`  ${r.id}  (${r.version}) [${r.kind}] +${r.added}/-${r.removed}  ${r.author}: ${r.message} (${r.createdAt})`);
        }
      }
      return;
    }

    case 'ler': {
      const ref = getCliArg(argv, '--ref') || (getCliArg(argv, '--rev') ? `rev:${getCliArg(argv, '--rev')}` : `ver:${getCliArg(argv, '--versao') || 'principal'}`);
      result = readRefContent(workspaceRoot, relPath, ref);
      if (jsonOut) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        process.stdout.write(result.content);
      }
      return;
    }

    case 'diff': {
      const from = getCliArg(argv, '--de') || 'ver:principal';
      const to = getCliArg(argv, '--para') || 'disk';
      result = diffTargets(workspaceRoot, relPath, { from, to });
      if (jsonOut) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(`Diff ${result.from} -> ${result.to} (+${result.added} / -${result.removed})`);
        for (const line of result.lines) {
          if (line.type === 'add') console.log(`+ ${line.text}`);
          else if (line.type === 'del') console.log(`- ${line.text}`);
        }
      }
      return;
    }

    case 'commit': {
      const content = readInputContent(argv);
      if (content === null) {
        throw new Error('Para commit, informe --conteudo-arquivo <arquivo> ou --stdin.');
      }
      const version = getCliArg(argv, '--versao') || 'principal';
      const message = getCliArg(argv, '--msg') || 'Atualização de roteiro';
      const author = getCliArg(argv, '--autor') || 'Agente';
      result = commitRevision(workspaceRoot, relPath, { content, version, message, author });
      syncWorkspace({ config });
      break;
    }

    case 'nova-versao': {
      const name = getCliArg(argv, '--nome') || getCliArg(argv, '--versao');
      if (!name) throw new Error('Informe --nome <slug-da-versao>.');
      const description = getCliArg(argv, '--desc') || '';
      const fromVersion = getCliArg(argv, '--de') || 'principal';
      const fromRev = getCliArg(argv, '--rev') || null;
      const author = getCliArg(argv, '--autor') || 'Agente';
      const message = getCliArg(argv, '--msg') || '';
      const content = readInputContent(argv);
      result = createVersion(workspaceRoot, relPath, {
        name,
        description,
        fromVersion,
        fromRev,
        content,
        author,
        message,
      });
      syncWorkspace({ config });
      break;
    }

    case 'restaurar': {
      const revId = getCliArg(argv, '--rev');
      if (!revId) throw new Error('Informe --rev <rNNN>.');
      const targetVersion = getCliArg(argv, '--versao') || 'principal';
      const author = getCliArg(argv, '--autor') || 'Agente';
      const message = getCliArg(argv, '--msg') || '';
      result = restoreRevision(workspaceRoot, relPath, { revId, targetVersion, author, message });
      syncWorkspace({ config });
      break;
    }

    case 'promover': {
      const versionName = getCliArg(argv, '--versao') || getCliArg(argv, '--nome');
      if (!versionName) throw new Error('Informe --versao <nome-da-variante>.');
      const author = getCliArg(argv, '--autor') || 'MrJ';
      const message = getCliArg(argv, '--msg') || '';
      result = promoteVersion(workspaceRoot, relPath, { versionName, author, message });
      syncWorkspace({ config });
      break;
    }

    case 'versao-inicial':
    case 'inicial': {
      const versionName = getCliArg(argv, '--versao') || getCliArg(argv, '--nome') || 'principal';
      result = setDefaultVersion(workspaceRoot, relPath, { versionName });
      syncWorkspace({ config });
      break;
    }

    case 'excluir-versao': {
      const versionName = getCliArg(argv, '--versao') || getCliArg(argv, '--nome');
      if (!versionName) throw new Error('Informe --versao <nome-da-variante>.');
      result = deleteVersion(workspaceRoot, relPath, { versionName });
      syncWorkspace({ config });
      break;
    }

    default:
      throw new Error(`Subcomando desconhecido: "${sub}". Use --help.`);
  }

  if (jsonOut) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(
      `[roteiro-git] OK (${sub}) -> ${relPath} | rev=${result.revision?.id || '-'} | versão=${result.version?.name || result.version || result.defaultVersion || '-'}`
    );
  }
}

try {
  main();
} catch (err) {
  console.error(`Erro: ${err.message}`);
  process.exit(1);
}
