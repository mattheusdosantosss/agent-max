import { Redis } from "@upstash/redis";

let _redis: Redis | null = null;
function redis(): Redis | null {
  if (_redis) return _redis;
  // A integração do Vercel injeta KV_REST_API_*; a conta Upstash direta usa UPSTASH_REDIS_REST_*.
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  _redis = new Redis({ url, token });
  return _redis;
}
export function storeAtivo() { return !!redis(); }

export type ConversaStore = {
  id: string;
  ts: number;
  pergunta: string;
  resposta: string;
  contactId?: string;
  whatsapp?: string;
  nome?: string;
  motivo?: string;          // motivo cru vindo do Max/HubSpot (legado)
  motivoIA?: string;        // motivo real classificado pelo cron /api/classificar
  atendimentoId?: string;   // a qual atendimento (janela de 24h) este registro pertence
  promptTokens?: number;
  completionTokens?: number;
};

// Prefixo de chaves: permite dividir o MESMO banco Upstash com outros projetos
// (ex.: psa-farmer) sem colisão. Configurável por env, default "maxdash:".
const P = process.env.REDIS_PREFIX ?? "maxdash:";
const K_HASH = `${P}conv`;          // hash: id -> ConversaStore
const K_INDEX = `${P}conv:ts`;      // sorted set: score=ts, member=id
const K_ANALISES = `${P}analises`;  // list (LPUSH, mais recente no topo)
const K_LATEST = `${P}analise:latest`;
const K_TOK_P = `${P}tok:prompt`;
const K_TOK_C = `${P}tok:completion`;
const K_TOK_N = `${P}tok:n`;
const K_N8N_COUNT = `${P}n8n:count`; // último volume de execuções lido do n8n (cache)
const MAX_CONV = 5000;

function parse<T>(v: unknown): T | null {
  if (v == null) return null;
  if (typeof v === "string") { try { return JSON.parse(v) as T; } catch { return null; } }
  return v as T;
}

export async function salvarConversa(c: ConversaStore): Promise<boolean> {
  const r = redis(); if (!r) return false;
  const score = Number.isFinite(c.ts) ? c.ts : Date.now(); // nunca null/NaN no zadd
  const novo = !(await r.hexists(K_HASH, c.id));
  await r.hset(K_HASH, { [c.id]: JSON.stringify(c) });
  await r.zadd(K_INDEX, { score, member: c.id });
  // mantém só as MAX_CONV mais recentes
  await r.zremrangebyrank(K_INDEX, 0, -(MAX_CONV + 1));
  // contadores de custo: só soma quando a conversa é nova (evita dobrar em reenvio)
  if (novo && ((c.promptTokens ?? 0) > 0 || (c.completionTokens ?? 0) > 0)) {
    await r.incrby(K_TOK_P, Math.round(c.promptTokens ?? 0));
    await r.incrby(K_TOK_C, Math.round(c.completionTokens ?? 0));
    await r.incr(K_TOK_N);
  }
  return true;
}

export async function tokensAcumulados(): Promise<{ prompt: number; completion: number; n: number } | null> {
  const r = redis(); if (!r) return null;
  const vals = (await r.mget(K_TOK_P, K_TOK_C, K_TOK_N)) as (string | number | null)[];
  const num = (v: unknown) => (v == null ? 0 : Number(v) || 0);
  return { prompt: num(vals?.[0]), completion: num(vals?.[1]), n: num(vals?.[2]) };
}

export async function conversasRecentes(n = 50): Promise<ConversaStore[]> {
  const r = redis(); if (!r) return [];
  const ids = (await r.zrange(K_INDEX, 0, n - 1, { rev: true })) as string[];
  if (!ids?.length) return [];
  const vals = (await r.hmget(K_HASH, ...ids)) as Record<string, unknown> | null;
  const out: ConversaStore[] = [];
  for (const id of ids) {
    const c = parse<ConversaStore>(vals?.[id]);
    if (c) out.push(c);
  }
  return out;
}

export async function totalConversas(): Promise<number> {
  const r = redis(); if (!r) return 0;
  return (await r.zcard(K_INDEX)) ?? 0;
}

// Todas as conversas guardadas (até MAX_CONV). Usado pelo cron de classificação,
// que precisa do conjunto inteiro pra agrupar por contato corretamente.
export async function todasConversas(): Promise<ConversaStore[]> {
  const r = redis(); if (!r) return [];
  const ids = (await r.zrange(K_INDEX, 0, -1)) as string[];
  if (!ids?.length) return [];
  const vals = (await r.hmget(K_HASH, ...ids)) as Record<string, unknown> | null;
  const out: ConversaStore[] = [];
  for (const id of ids) {
    const c = parse<ConversaStore>(vals?.[id]);
    if (c) out.push(c);
  }
  return out;
}

// Regrava conversas já existentes (ex.: carimbar motivoIA + atendimentoId). Não mexe
// no índice nem nos contadores de custo — só atualiza o JSON no hash.
export async function atualizarConversas(convs: ConversaStore[]): Promise<void> {
  const r = redis(); if (!r || !convs.length) return;
  const payload: Record<string, string> = {};
  for (const c of convs) payload[c.id] = JSON.stringify(c);
  await r.hset(K_HASH, payload);
}

// Cache do volume de execuções do n8n: a contagem ao vivo é lenta (instância
// self-hosted), então guardamos o último valor bom e a página lê daqui (instantâneo).
export async function salvarN8nCount(n: number): Promise<void> {
  const r = redis(); if (!r) return;
  await r.set(K_N8N_COUNT, JSON.stringify({ n, at: Date.now() }));
}
export async function n8nCountCache(): Promise<{ n: number; at: number } | null> {
  const r = redis(); if (!r) return null;
  return parse<{ n: number; at: number }>(await r.get(K_N8N_COUNT));
}

export async function salvarAnalise(rec: any): Promise<boolean> {
  const r = redis(); if (!r) return false;
  const com = { ...rec, ts: Date.now() };
  await r.lpush(K_ANALISES, JSON.stringify(com));
  await r.ltrim(K_ANALISES, 0, 49);
  await r.set(K_LATEST, JSON.stringify(com));
  return true;
}

export async function analiseLatest(): Promise<any | null> {
  const r = redis(); if (!r) return null;
  return parse<any>(await r.get(K_LATEST));
}

export async function historicoAnalises(n = 10): Promise<any[]> {
  const r = redis(); if (!r) return [];
  const arr = (await r.lrange(K_ANALISES, 0, n - 1)) as unknown[];
  return arr.map((v) => parse<any>(v)).filter(Boolean);
}
