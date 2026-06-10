import type { Metrics, Conversa } from "./types";
import { SEED } from "./seed";
import { getHubspotMetrics } from "./hubspot";
import { getN8nMensagens } from "./n8n";
import { precoDoModelo } from "./pricing";
import { tokensAcumulados, totalConversas, n8nCountCache, salvarN8nCount } from "./store";

// Fallback: estimativa por tokens médios fixos (quando não há leitura real do n8n).
function custoEstimado(mensagens: number | null) {
  const modelo = process.env.LLM_MODEL ?? "—";
  const preco = precoDoModelo(modelo);
  const tIn = Number(process.env.LLM_AVG_TOKENS_IN ?? 17700);
  const tOut = Number(process.env.LLM_AVG_TOKENS_OUT ?? 90);
  if (mensagens == null || !preco) {
    return {
      modelo, totalUSD: null as number | null, porMensagemUSD: null as number | null, estimado: true,
      nota: !preco
        ? `Modelo "${modelo}" sem preço cadastrado. Ajuste lib/pricing.ts ou LLM_MODEL.`
        : "Sem volume do n8n para estimar.",
    };
  }
  const porMsg = (tIn / 1e6) * preco.in + (tOut / 1e6) * preco.out;
  return {
    modelo, totalUSD: porMsg * mensagens, porMensagemUSD: porMsg, estimado: true,
    nota: `Estimativa = ${mensagens} msgs × (${tIn} tok in + ${tOut} tok out) ao preço do ${modelo}. Ative a leitura de tokens do n8n para o valor real.`,
  };
}

// Custo real: soma dos tokens reais que o n8n empurra junto de cada conversa (Redis).
function custoRealTokens(tok: { prompt: number; completion: number; n: number } | null) {
  const modelo = process.env.LLM_MODEL ?? "gpt-4.1-mini";
  const preco = precoDoModelo(modelo);
  if (!preco || !tok || tok.n === 0) return null; // cai no fallback (estimativa)
  const total = (tok.prompt / 1e6) * preco.in + (tok.completion / 1e6) * preco.out;
  const porMsg = total / tok.n;
  const f = (x: number) => Math.round(x).toLocaleString("pt-BR");
  return {
    modelo, totalUSD: total, porMensagemUSD: porMsg, estimado: false,
    nota: `Custo real dos tokens de ${tok.n} conversas capturadas (${f(tok.prompt)} prompt + ${f(tok.completion)} completion) ao preço do ${modelo}. Acumula conforme novas conversas chegam. Valor exato faturado: painel da OpenAI.`,
  };
}

export async function getMetrics(opts: { liveN8n?: boolean } = {}): Promise<Metrics> {
  const fontes = {
    hubspot: !!process.env.HUBSPOT_TOKEN,
    n8n: !!(process.env.N8N_API_KEY && process.env.N8N_WORKFLOW_ID && process.env.N8N_BASE_URL),
  };

  let hub = {
    conversasUnicas: SEED.conversasUnicas, escaladas: SEED.escaladas, topicos: SEED.topicos,
    motivosEscalacao: SEED.motivosEscalacao, escalacoesPorDia: SEED.escalacoesPorDia,
    regioes: SEED.regioes, contatos: SEED.contatos, excluidosTeste: 0,
  };
  if (fontes.hubspot) {
    try { hub = await getHubspotMetrics(); }
    catch (e) { console.error("HubSpot falhou, usando seed:", e); }
  }

  // Volume de mensagens (execuções do n8n). A contagem ao vivo é LENTA (instância
  // self-hosted), então só roda quando opts.liveN8n=true (rota /api/metrics, com budget
  // maior). O render da página lê o último valor guardado no Redis = instantâneo, sem "—".
  const conversas: Conversa[] = [];
  let n8nErro = "";
  let n8nN: number | null = null;
  if (opts.liveN8n && fontes.n8n) {
    try {
      n8nN = await getN8nMensagens();
      if (n8nN != null) await salvarN8nCount(n8nN); // grava o valor bom no cache
    } catch (e: any) { n8nErro = String(e?.message ?? e); console.error("n8n volume:", e); }
  }
  let cache: { n: number; at: number } | null = null;
  try { cache = await n8nCountCache(); } catch (e) { console.error("n8n cache:", e); }
  let redisConv = 0;
  try { redisConv = await totalConversas(); } catch (e) { console.error("redis total:", e); }
  // Prioridade: contagem ao vivo recém-lida > cache do Redis > nº de conversas capturadas.
  const mensagens: number | null =
    n8nN != null ? n8nN : (cache?.n ?? (redisConv > 0 ? redisConv : null));

  let tok: { prompt: number; completion: number; n: number } | null = null;
  try { tok = await tokensAcumulados(); } catch (e) { console.error("tokens store:", e); }

  const taxaEscalacao = hub.conversasUnicas > 0 ? hub.escaladas / hub.conversasUnicas : null;
  let custo = custoRealTokens(tok) ?? custoEstimado(mensagens);
  // Se a leitura ao vivo falhou MAS temos cache, sinaliza que é valor guardado.
  if (n8nErro && n8nN == null && mensagens != null) {
    custo = { ...custo, nota: `${custo.nota} (volume do último valor lido do n8n; a leitura ao vivo agora falhou: ${n8nErro})` };
  } else if (mensagens == null && (n8nErro || opts.liveN8n)) {
    const lento = /abort|timeout|timed out/i.test(n8nErro);
    const dica = lento
      ? "n8n demorou demais pra responder mesmo com 20s. Instância muito lenta/fria — clique em Atualizar de novo p/ aquecer."
      : (n8nErro ? "n8n recusou a Public API (status acima)." : "Clique em Atualizar p/ ler o volume do n8n e popular o cache.");
    custo = { ...custo, nota: `Sem volume do n8n. ${dica}` };
  }

  return {
    mensagens,
    conversasUnicas: hub.conversasUnicas,
    escaladas: hub.escaladas,
    taxaEscalacao,
    topicos: hub.topicos,
    motivosEscalacao: hub.motivosEscalacao,
    escalacoesPorDia: hub.escalacoesPorDia,
    regioes: hub.regioes,
    contatos: hub.contatos,
    conversas,
    custo,
    fontes,
    excluidosTeste: hub.excluidosTeste,
    atualizadoEm: new Date().toISOString(),
  };
}
