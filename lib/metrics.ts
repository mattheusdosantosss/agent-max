import type { Metrics, Conversa } from "./types";
import { SEED } from "./seed";
import { getHubspotMetrics } from "./hubspot";
import { getN8nMensagens } from "./n8n";
import { precoDoModelo } from "./pricing";

function estimarCusto(mensagens: number | null) {
  const modelo = process.env.LLM_MODEL ?? "—";
  const preco = precoDoModelo(modelo);
  const tIn = Number(process.env.LLM_AVG_TOKENS_IN ?? 1200);
  const tOut = Number(process.env.LLM_AVG_TOKENS_OUT ?? 350);
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
    nota: `Estimativa = ${mensagens} msgs × (${tIn} tok in + ${tOut} tok out) ao preço do ${modelo}. Para custo exato, plugue a API de billing do provedor.`,
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
  const conversas: Conversa[] = []; // mensagens não são mais exibidas (n8n não retém histórico longo)
  if (fontes.n8n) {
    try { mensagens = await getN8nMensagens(); } catch (e) { console.error("n8n volume:", e); }
  }

  const taxaEscalacao = hub.conversasUnicas > 0 ? hub.escaladas / hub.conversasUnicas : null;

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
    custo: estimarCusto(mensagens),
    fontes,
    excluidosTeste: hub.excluidosTeste,
    atualizadoEm: new Date().toISOString(),
  };
}
