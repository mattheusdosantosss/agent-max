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
  motivo?: string;
};

// Prefixo de chaves: permite dividir o MESMO banco Upstash com outros projetos
// (ex.: psa-farmer) sem colisão. Configurável por env, default "maxdash:".
const P = process.env.REDIS_PREFIX ?? "maxdash:";
const K_HASH = `${P}conv`;          // hash: id -> ConversaStore
const K_INDEX = `${P}conv:ts`;      // sorted set: score=ts, member=id
const K_ANALISES = `${P}analises`;  // list (LPUSH, mais recente no topo)
const K_LATEST = `${P}analise:latest`;
const MAX_CONV = 5000;

function parse<T>(v: unknown): T | null {
  if (v == null) return null;
  if (typeof v === "string") { try { return JSON.parse(v) as T; } catch { return null; } }
  return v as T;
}

export async function salvarConversa(c: ConversaStore): Promise<boolean> {
  const r = redis(); if (!r) return false;
  await r.hset(K_HASH, { [c.id]: JSON.stringify(c) });
  await r.zadd(K_INDEX, { score: c.ts, member: c.id });
  // mantém só as MAX_CONV mais recentes
  await r.zremrangebyrank(K_INDEX, 0, -(MAX_CONV + 1));
  return true;
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
