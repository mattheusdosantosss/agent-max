import type { Metrics, Conversa } from "./types";
import { SEED } from "./seed";
import { getHubspotMetrics } from "./hubspot";
import { getN8nMensagens, getN8nUsage, type N8nUsage } from "./n8n";
import { precoDoModelo } from "./pricing";

// Fallback: estimativa por tokens médios fixos (quando não há leitura real do n8n).
function custoEstimado(mensagens: number | null) {
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
    nota: `Estimativa = ${mensagens} msgs × (${tIn} tok in + ${tOut} tok out) ao preço do ${modelo}. Ative a leitura de tokens do n8n para o valor real.`,
  };
}

// Custo real: usa os tokens reais lidos das execuções do n8n (tokenUsageEstimate).
function custoReal(mensagens: number | null, usage: N8nUsage | null) {
  const modelo = process.env.LLM_MODEL ?? "gpt-4.1-mini";
  const preco = precoDoModelo(modelo);
  if (!preco || !usage || usage.calls === 0 || usage.execs === 0) return null; // cai no fallback
  const custoLido = (usage.prompt / 1e6) * preco.in + (usage.completion / 1e6) * preco.out;
  const porMsg = custoLido / usage.execs;
  const cobriuTudo = mensagens == null ? true : usage.execs >= mensagens;
  const totalUSD = cobriuTudo ? custoLido : porMsg * (mensagens as number);
  const n = (x: number) => Math.round(x).toLocaleString("pt-BR");
  return {
    modelo, totalUSD, porMensagemUSD: porMsg, estimado: !cobriuTudo,
    nota: cobriuTudo
      ? `Custo a partir dos tokens reais de ${usage.execs} execuções (${n(usage.prompt)} prompt + ${n(usage.completion)} completion) ao preço do ${modelo}. Para o valor exato faturado, ver o painel da OpenAI.`
      : `Custo médio real por execução (amostra de ${usage.execs} execuções, ${n(usage.prompt + usage.completion)} tokens) × ${mensagens} mensagens. O n8n retém só parte do histórico, por isso o total é extrapolado.`,
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
  let usage: N8nUsage | null = null;
  const conversas: Conversa[] = []; // mensagens não são mais exibidas (n8n não retém histórico longo)
  if (fontes.n8n) {
    try { mensagens = await getN8nMensagens(); } catch (e) { console.error("n8n volume:", e); }
    try { usage = await getN8nUsage(200); } catch (e) { console.error("n8n usage:", e); }
  }

  const taxaEscalacao = hub.conversasUnicas > 0 ? hub.escaladas / hub.conversasUnicas : null;
  const custo = custoReal(mensagens, usage) ?? custoEstimado(mensagens);

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
