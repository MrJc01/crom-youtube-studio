import { pathToFileURL } from 'node:url';
import { getCliArg, loadConfig } from './config.mjs';
import {
  discoverTtsEnvironment,
  downloadPiperModel,
  generateNarration,
  listUnifiedAudios,
  listVoicePresets,
} from './tts.mjs';
import { syncWorkspace } from './sync.mjs';

function printHelp() {
  console.log(`Uso:
  crom-studio narrar [opções]

Opções principais:
  --canal mrj|crom            Canal/workspace alvo (padrão: mrj)
  --texto "<frase>"           Texto direto para sintetizar
  --arquivo <caminho.md>      Roteiro Markdown relativo ao workspace
  --versao <nome>             Versão do roteiro (principal ou variante; padrão: principal)
  --voz <id>                  Preset de voz (mrj-pocket | crom-j | crom-faber-normal | custom)
  --voz-secundaria <id>       Segunda voz para modo multivozes (padrão: crom-j)
  --modo single|multivoice    Modo de síntese (padrão: single)
  --categoria <id>            Categoria do áudio na biblioteca (ex.: narracao-roteiro, teste-voz)
  --titulo "<titulo>"         Título personalizado do áudio gerado
  --loudnorm                  Força normalização YouTube -14 LUFS / 48 kHz
  --no-loudnorm               Desativa loudnorm mesmo no preset
  --pitch <float>             Override de pitch shift (0.50 a 2.00)
  --velocidade <float>        Override de lengthScale Piper (0.50 a 2.50)
  --temp <float>              Override de temperatura Pocket TTS (0.05 a 1.50)
  --passos <int>              Passos de decodificação Pocket TTS (1 a 16)
  --noise-clamp <float>       Noise clamp Pocket TTS (ex: 2.5; 0 = desativa)
  --voz-arquivo <arquivo>     Arquivo .safetensors/.wav específico em Pocket TTS voices/
  --rvc <modelo.pth>          Ativa conversão Nível 2 RVC v2 local com o modelo .pth
  --rvc-pitch <int>           Ajuste de semitons no RVC (-12 a 12; padrão: 0)
  --rvc-index-rate <float>    Peso do índice FAISS no RVC (0.0 a 1.0; padrão: 0.75)
  --rvc-protect <float>       Proteção de consoantes no RVC (0.0 a 0.5; padrão: 0.33)
  --sem-limpeza               Não limpa marcações [GANCHO]/[TELA]/Markdown
  --baixar-piper              Baixa o modelo pt_BR-faber-medium.onnx localmente
  --status                    Mostra status de disponibilidade dos motores locais
  --listar-vozes              Lista perfis/presets de voz disponíveis
  --listar-audios             Lista todos os áudios gerados no workspace
  --no-sync                   Não executa sync após gerar áudio
  --json                      Saída em JSON estruturado
  -h, --help                  Exibe esta ajuda`);
}

function getOptionalNumberArg(args, flag) {
  const raw = getCliArg(args, flag);
  if (raw === null || raw === undefined || raw === '') return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

export async function runTtsCli(argv = process.argv.slice(2)) {
  if (argv.includes('--help') || argv.includes('-h')) {
    printHelp();
    return 0;
  }

  const config = loadConfig(argv);
  const channelKey = getCliArg(argv, '--canal') || getCliArg(argv, '--channel') || config.defaultChannel || 'mrj';
  const ch = config.channels?.[channelKey];
  if (!ch) {
    throw new Error(`Canal inválido: "${channelKey}"`);
  }

  const asJson = argv.includes('--json');

  if (argv.includes('--baixar-piper')) {
    const res = await downloadPiperModel('pt_BR-faber-medium.onnx');
    if (asJson) {
      console.log(JSON.stringify(res, null, 2));
    } else {
      console.log(`[TTS Piper] Modelo pronto em ${res.onnxPath} (${(res.sizeBytes / (1024 * 1024)).toFixed(1)} MB)`);
    }
    return 0;
  }

  if (argv.includes('--status')) {
    const env = discoverTtsEnvironment({ kdenliveRoot: config.kdenliveRoot });
    if (asJson) {
      console.log(JSON.stringify({ ok: true, channel: channelKey, env }, null, 2));
    } else {
      console.log(`[TTS Status — canal ${channelKey}]`);
      console.log(`- Pocket TTS (Voz MrJ): ${env.pocketTts.available ? `OK (${env.pocketTts.dir} | vozes: ${env.pocketTts.voices.join(', ')})` : 'Indisponível'}`);
      console.log(`- Piper ONNX (Voz Crom): ${env.piper.binaryAvailable ? `binário OK (${env.piper.binaryPath})` : 'binário ausente'} | pt_BR-faber-medium: ${env.piper.hasFaberModel ? 'OK' : 'não baixado'}`);
      console.log(`- RVC v2 (Nível 2 CPU): ${env.rvc.runnerAvailable ? `runner OK (${env.rvc.models.length} modelo(s) .pth em ${env.rvc.defaultModelsDir})` : 'runner não configurado (opcional)'}`);
      console.log(`- FFmpeg: ${env.ffmpeg.available ? `OK (${env.ffmpeg.path})` : 'Indisponível'}`);
    }
    return 0;
  }

  if (argv.includes('--listar-vozes')) {
    const presets = listVoicePresets(ch.workspacePath);
    if (asJson) {
      console.log(JSON.stringify({ ok: true, channel: channelKey, presets }, null, 2));
    } else {
      console.log(`[Perfis de Voz — ${channelKey}]`);
      for (const p of presets) {
        console.log(`- ${p.id} (${p.engine}): ${p.name}${p.builtin ? ' [padrão]' : ''}`);
      }
    }
    return 0;
  }

  if (argv.includes('--listar-audios')) {
    const category = getCliArg(argv, '--categoria') || 'all';
    const docPath = getCliArg(argv, '--arquivo') || '';
    const items = listUnifiedAudios(ch.workspacePath, { category, docPath });
    if (asJson) {
      console.log(JSON.stringify({ ok: true, channel: channelKey, count: items.length, items }, null, 2));
    } else {
      console.log(`[Biblioteca de Áudios — ${channelKey}] (${items.length} itens)`);
      for (const it of items) {
        console.log(`- ${it.id} | ${it.origin} | ${it.category} | ${it.voiceName || '-'} | ${it.relPath}${it.docPath ? ` (roteiro: ${it.docPath}@${it.docVersion || 'principal'})` : ''}`);
      }
    }
    return 0;
  }

  const text = getCliArg(argv, '--texto') || '';
  const docPath = getCliArg(argv, '--arquivo') || '';
  const docVersion = getCliArg(argv, '--versao') || 'principal';
  if (!text && !docPath) {
    printHelp();
    throw new Error('Informe --texto "..." ou --arquivo <caminho.md>.');
  }

  const overrides = {};
  const pitch = getOptionalNumberArg(argv, '--pitch');
  const speed = getOptionalNumberArg(argv, '--velocidade');
  const temp = getOptionalNumberArg(argv, '--temp');
  const steps = getOptionalNumberArg(argv, '--passos');
  const noiseClamp = getOptionalNumberArg(argv, '--noise-clamp');
  const voiceFile = getCliArg(argv, '--voz-arquivo');
  const rvcModel = getCliArg(argv, '--rvc');
  const rvcPitch = getOptionalNumberArg(argv, '--rvc-pitch');
  const rvcIndexRate = getOptionalNumberArg(argv, '--rvc-index-rate');
  const rvcProtect = getOptionalNumberArg(argv, '--rvc-protect');
  if (pitch !== undefined) overrides.effects = { pitchShift: pitch };
  if (speed !== undefined) overrides.lengthScale = speed;
  if (temp !== undefined) overrides.temperature = temp;
  if (steps !== undefined) overrides.samplerDecodeSteps = steps;
  if (noiseClamp !== undefined) overrides.noiseClamp = noiseClamp;
  if (voiceFile) overrides.voiceFile = voiceFile;
  if (rvcModel) {
    overrides.rvc = {
      enabled: true,
      modelName: rvcModel,
      ...(rvcPitch !== undefined ? { f0UpKey: rvcPitch } : {}),
      ...(rvcIndexRate !== undefined ? { indexRate: rvcIndexRate } : {}),
      ...(rvcProtect !== undefined ? { protect: rvcProtect } : {}),
    };
  }

  const loudnorm = argv.includes('--loudnorm') ? true : argv.includes('--no-loudnorm') ? false : undefined;

  const result = await generateNarration(ch.workspacePath, {
    text,
    docPath,
    docVersion,
    voiceId: getCliArg(argv, '--voz') || 'mrj-pocket',
    secondaryVoiceId: getCliArg(argv, '--voz-secundaria') || 'crom-j',
    mode: getCliArg(argv, '--modo') || 'single',
    category: getCliArg(argv, '--categoria') || (docPath ? 'narracao-roteiro' : 'teste-voz'),
    title: getCliArg(argv, '--titulo') || '',
    origin: 'agente-cli',
    cleanMarkdown: !argv.includes('--sem-limpeza'),
    loudnorm,
    overrides,
    kdenliveRoot: config.kdenliveRoot,
  });

  if (!argv.includes('--no-sync')) {
    syncWorkspace({ config, writeDisk: true });
  }

  if (asJson) {
    console.log(JSON.stringify({ ...result, channel: channelKey }, null, 2));
  } else {
    console.log(`[Narração Gerada] ${result.absPath} (${result.item.durationSec}s | voz=${result.item.voiceId} | origem=agente-cli)`);
  }
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runTtsCli(process.argv.slice(2)).catch((err) => {
    const asJson = process.argv.includes('--json');
    if (asJson) {
      console.error(JSON.stringify({ ok: false, error: err.message }));
    } else {
      console.error(`[TTS Erro] ${err.message}`);
    }
    process.exit(1);
  });
}
