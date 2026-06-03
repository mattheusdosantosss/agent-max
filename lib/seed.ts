import type { Metrics } from "./types";

// Snapshot real do HubSpot (puxado em 03/06/2026). Serve de fallback para o
// dashboard renderizar mesmo sem as variáveis de ambiente configuradas.
// Quando HUBSPOT_TOKEN / N8N_API_KEY estiverem setados, os valores vêm ao vivo.
export const SEED: Metrics = {
  mensagens: null, // só o n8n sabe (egress liberado na Vercel)
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
  custo: {
    modelo: "—",
    totalUSD: null,
    porMensagemUSD: null,
    estimado: true,
    nota: "Configure N8N_API_KEY e LLM_MODEL para estimar o custo.",
  },
  fontes: { hubspot: false, n8n: false },
  atualizadoEm: new Date().toISOString(),
};
