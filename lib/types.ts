export type TopicCount = { label: string; value: number };

export type DayCount = { date: string; value: number };

export type Metrics = {
  // 1 - quantas duvidas chegaram (dois lados)
  mensagens: number | null;        // n8n: total de execucoes (inclui anonimos)
  conversasUnicas: number;         // HubSpot: contatos com motivo_do_contato
  // 2 - quantas passou pra humano
  escaladas: number;               // HubSpot: atendimento_humano = true
  taxaEscalacao: number | null;    // escaladas / conversasUnicas
  // 3 - principais duvidas
  topicos: TopicCount[];           // motivo_do_contato agregado
  motivosEscalacao: TopicCount[];  // motivo_da_escalacao agregado (bonus)
  escalacoesPorDia: DayCount[];    // data_de_escalacao por dia
  // 4 - custo do LLM (estimativa)
  custo: {
    modelo: string;
    totalUSD: number | null;
    porMensagemUSD: number | null;
    estimado: boolean;
    nota: string;
  };
  // meta
  fontes: { hubspot: boolean; n8n: boolean };
  atualizadoEm: string;
};
