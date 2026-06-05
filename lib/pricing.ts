// Preço em USD por 1.000.000 de tokens (entrada / saída).
// Fonte: tabelas públicas dos provedores. Ajuste se mudar.
export const PRICING: Record<string, { in: number; out: number }> = {
  "gpt-4o": { in: 2.5, out: 10 },
  "gpt-4o-mini": { in: 0.15, out: 0.6 },
  "gpt-4.1": { in: 2.0, out: 8 },
  "gpt-4.1-mini": { in: 0.4, out: 1.6 },
  "claude-sonnet-4": { in: 3, out: 15 },
  "claude-haiku": { in: 0.8, out: 4 },
  "gemini-1.5-flash": { in: 0.075, out: 0.3 },
  "gemini-1.5-pro": { in: 1.25, out: 5 },
};

export function precoDoModelo(modelo: string) {
  return PRICING[modelo] ?? null;
}

// O Max grava motivo_do_contato com vocabulário controlado, mas o campo é
// texto livre — então normalizamos caixa/acento p/ evitar duplicatas por drift.
const MAPA: Record<string, string> = {
  "duvida sobre uso da plataforma": "Uso da plataforma",
  "duvida sobre inscricao": "Inscrição",
  "duvida sobre datas e horarios": "Datas e horários",
  "duvida sobre etapas da competicao": "Etapas da competição",
  "duvida sobre pagamento": "Pagamento",
  "duvida sobre video de palestra": "Vídeo de palestra",
  "reclamacao ou suporte": "Reclamação / suporte",
  "outros assuntos": "Outros assuntos",
};

function semAcento(s: string) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function normalizarTopico(raw: string | null | undefined): string {
  if (!raw) return "Não classificado";
  const chave = semAcento(raw.trim().toLowerCase());
  if (MAPA[chave]) return MAPA[chave];
  // fallback: capitaliza a primeira letra do texto cru
  return raw.trim().charAt(0).toUpperCase() + raw.trim().slice(1);
}

// --- Região (UF) -----------------------------------------------------------
const UF_VALIDAS = new Set(["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"]);
const NOME_UF: Record<string, string> = {
  "rio de janeiro":"RJ","sao paulo":"SP","rio grande do sul":"RS","minas gerais":"MG",
  "parana":"PR","pernambuco":"PE","bahia":"BA","distrito federal":"DF","mato grosso do sul":"MS",
  "santa catarina":"SC","goias":"GO","ceara":"CE","espirito santo":"ES","para":"PA","paraiba":"PB",
  "amazonas":"AM","maranhao":"MA","rio grande do norte":"RN","mato grosso":"MT","piaui":"PI",
  "alagoas":"AL","sergipe":"SE","rondonia":"RO","tocantins":"TO","acre":"AC","amapa":"AP","roraima":"RR",
};

// Campo `state` é texto livre e vem sujo (ex.: "sp/?utm_source=email", "rio de janeiro").
export function normalizarUF(raw: string | null | undefined): string {
  if (!raw) return "—";
  // remove cauda de UTM/path mantendo espaços do nome do estado
  const limpo = semAcento(raw.trim().toLowerCase()).replace(/[\/?&].*$/, "").trim();
  if (!limpo) return "—";
  if (NOME_UF[limpo]) return NOME_UF[limpo];
  const token = limpo.split(/\s+/)[0].toUpperCase();
  if (UF_VALIDAS.has(token)) return token;
  return "—";
}

// Contatos de teste/internos que não devem contar nas métricas.
export function ehTeste(email: string | null | undefined, nome: string | null | undefined): boolean {
  const e = (email ?? "").toLowerCase();
  const n = (nome ?? "").toLowerCase();
  if (e.endsWith("@profissionaissa.com")) return true;
  if (e.includes("teste") || n.includes("teste")) return true;
  return false;
}
