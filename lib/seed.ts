import type { Metrics } from "./types";

// Snapshot real do HubSpot (puxado em 03/06/2026). Fallback p/ render sem env.
// Com HUBSPOT_TOKEN / N8N_* setados, tudo vem ao vivo.
export const SEED: Metrics = {
  mensagens: null,
  conversasUnicas: 26,
  escaladas: 8,
  taxaEscalacao: 8 / 26,
  topicos: [
    { label: "Uso da plataforma", value: 8 },
    { label: "Outros assuntos", value: 8 },
    { label: "Inscrição", value: 4 },
    { label: "Datas e horários", value: 2 },
    { label: "Etapas da competição", value: 1 },
    { label: "Pagamento", value: 1 },
    { label: "Vídeo de palestra", value: 1 },
    { label: "Reclamação / suporte", value: 1 },
  ],
  motivosEscalacao: [],
  escalacoesPorDia: [],
  regioes: [],
  contatos: [],
  conversas: [],
  custo: {
    modelo: "—", totalUSD: null, porMensagemUSD: null, estimado: true,
    nota: "Configure N8N_API_KEY e LLM_MODEL para estimar o custo.",
  },
  fontes: { hubspot: false, n8n: false },
  excluidosTeste: 0,
  atualizadoEm: new Date().toISOString(),
};
