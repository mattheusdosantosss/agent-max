export type TopicCount = { label: string; value: number };
export type DayCount = { date: string; value: number };
export type RegiaoCount = { uf: string; value: number };

export type Contato = {
  id: string;
  nome: string;
  email: string;
  telefone: string;
  whatsapp: string; // hs_whatsapp_phone_number (p/ casar com as conversas do Redis)
  motivo: string;   // normalizado
  escalou: boolean;
  uf: string;       // normalizado ("—" se vazio)
  criadoEm: string; // ISO ou ""
};

export type Conversa = {
  id: string;
  quando: string;   // ISO ou ""
  status: string;
  pergunta: string; // texto do usuário (best-effort)
  resposta: string; // texto do Max (best-effort)
  telefone: string; // identificador do contato (best-effort) p/ vincular ao HubSpot
  email: string;    // idem
  nodes: string[];  // debug: nós da execução (quando não extrai texto)
};

export type Metrics = {
  mensagens: number | null;
  conversasUnicas: number;
  escaladas: number;
  taxaEscalacao: number | null;
  topicos: TopicCount[];
  motivosEscalacao: TopicCount[];
  escalacoesPorDia: DayCount[];
  regioes: RegiaoCount[];
  contatos: Contato[];
  conversas: Conversa[];
  custo: {
    modelo: string;
    totalUSD: number | null;
    porMensagemUSD: number | null;
    estimado: boolean;
    nota: string;
  };
  fontes: { hubspot: boolean; n8n: boolean };
  excluidosTeste: number;
  atualizadoEm: string;
};
