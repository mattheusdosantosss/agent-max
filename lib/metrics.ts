import type { Metrics, Conversa } from "./types";
import { SEED } from "./seed";
import { getHubspotMetrics } from "./hubspot";
import { getN8nMensagens } from "./n8n";
import { precoDoModelo } from "./pricing";
import { tokensAcumulados } from "./store";

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

export async function getMetrics(): Promise<Metrics> {
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

  let mensagens: number | null = SEED.mensagens;
  const conversas: Conversa[] = []; // mensagens não são exibidas (sem histórico longo no n8n)
  if (fontes.n8n) {
    try { mensagens = await getN8nMensagens(); } catch (e) { console.error("n8n volume:", e); }
  }

  let tok: { prompt: number; completion: number; n: number } | null = null;
  try { tok = await tokensAcumulados(); } catch (e) { console.error("tokens store:", e); }

  const taxaEscalacao = hub.conversasUnicas > 0 ? hub.escaladas / hub.conversasUnicas : null;
  const custo = custoRealTokens(tok) ?? custoEstimado(mensagens);

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
