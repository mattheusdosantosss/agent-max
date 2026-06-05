// n8n Public API. Header de auth: X-N8N-API-KEY.
import type { Conversa } from "./types";

function cfg() {
  const base = process.env.N8N_BASE_URL;
  const key = process.env.N8N_API_KEY;
  const workflowId = process.env.N8N_WORKFLOW_ID;
  if (!base || !key || !workflowId) return null;
  let b = base.trim().replace(/\/$/, "");
  if (!/^https?:\/\//i.test(b)) b = "https://" + b; // tolera URL sem esquema
  return { base: b, key, workflowId };
}

// Conta execuções do workflow do Max = volume de mensagens processadas.
export async function getN8nMensagens(): Promise<number | null> {
  const c = cfg();
  if (!c) return null;
  let total = 0;
  let cursor: string | undefined = undefined;
  for (let i = 0; i < 200; i++) {
    const url = new URL(`${c.base}/api/v1/executions`);
    url.searchParams.set("workflowId", c.workflowId);
    url.searchParams.set("limit", "250");
    url.searchParams.set("includeData", "false");
    if (cursor) url.searchParams.set("cursor", cursor);
    const res = await fetch(url.toString(), {
      headers: { "X-N8N-API-KEY": c.key, accept: "application/json" }, cache: "no-store",
    });
    if (!res.ok) throw new Error(`n8n executions ${res.status}`);
    const data = await res.json();
    const batch = data.data ?? [];
    total += batch.length;
    cursor = data.nextCursor ?? undefined;
    if (!cursor || batch.length === 0) break;
  }
  return total;
}

// Procura recursivamente o primeiro valor-texto sob uma das chaves candidatas.
function findByKeys(obj: any, keys: string[], depth = 0): string {
  if (obj == null || depth > 7 || typeof obj === "string") return "";
  if (Array.isArray(obj)) {
    for (const it of obj) { const r = findByKeys(it, keys, depth + 1); if (r) return r; }
    return "";
  }
  if (typeof obj === "object") {
    for (const k of Object.keys(obj)) {
      if (keys.includes(k.toLowerCase()) && typeof obj[k] === "string" && obj[k].trim()) return obj[k].trim();
    }
    for (const k of Object.keys(obj)) { const r = findByKeys(obj[k], keys, depth + 1); if (r) return r; }
  }
  return "";
}

// Coleta todas as strings do payload (p/ achar telefone/email por regex).
function collectStrings(obj: any, out: string[], depth = 0) {
  if (obj == null || depth > 8) return;
  if (typeof obj === "string") { out.push(obj); return; }
  if (Array.isArray(obj)) { for (const it of obj) collectStrings(it, out, depth + 1); return; }
  if (typeof obj === "object") { for (const k of Object.keys(obj)) collectStrings(obj[k], out, depth + 1); }
}
function acharEmail(strs: string[]): string {
  const re = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
  for (const s of strs) { const m = s.match(re); if (m) return m[0].toLowerCase(); }
  return "";
}
function acharTelefone(strs: string[]): string {
  for (const s of strs) {
    const cand = s.match(/\+?\d[\d\s().\-]{8,}\d/);
    if (cand) {
      const dg = cand[0].replace(/\D/g, "");
      if (dg.length >= 10 && dg.length <= 13) return dg;
    }
  }
  return "";
}

function parseExec(e: any): Conversa {
  const runData = e?.data?.resultData?.runData ?? {};
  const nodes = Object.keys(runData);
  const jsons: any[] = [];
  for (const n of nodes) {
    try {
      const main = runData[n]?.[0]?.data?.main?.[0] ?? [];
      for (const item of main) if (item?.json) jsons.push(item.json);
    } catch { /* ignore */ }
  }
  const inKeys = ["chatinput", "message", "text", "query", "question", "pergunta", "input", "content", "body"];
  const outKeys = ["output", "response", "resposta", "answer", "reply", "text", "message"];
  let pergunta = "";
  for (const j of jsons) { if (!pergunta) pergunta = findByKeys(j, inKeys); }
  let resposta = "";
  for (let i = jsons.length - 1; i >= 0; i--) { if (!resposta) resposta = findByKeys(jsons[i], outKeys); }
  const strs: string[] = [];
  for (const j of jsons) collectStrings(j, strs);
  return {
    id: String(e?.id ?? ""),
    quando: e?.startedAt ?? e?.stoppedAt ?? "",
    status: e?.status ?? (e?.finished ? "success" : ""),
    pergunta: pergunta.slice(0, 600),
    resposta: resposta.slice(0, 600),
    telefone: acharTelefone(strs),
    email: acharEmail(strs),
    nodes,
  };
}

// Lê as execuções recentes COM dados (paginando) e extrai pergunta/resposta + identificador.
export async function getN8nConversas(max = 400): Promise<Conversa[] | null> {
  const c = cfg();
  if (!c) return null;
  const out: Conversa[] = [];
  let cursor: string | undefined = undefined;
  for (let i = 0; i < 6 && out.length < max; i++) {
    const url = new URL(`${c.base}/api/v1/executions`);
    url.searchParams.set("workflowId", c.workflowId);
    url.searchParams.set("limit", "100");
    url.searchParams.set("includeData", "true");
    if (cursor) url.searchParams.set("cursor", cursor);
    const res = await fetch(url.toString(), {
      headers: { "X-N8N-API-KEY": c.key, accept: "application/json" }, cache: "no-store",
    });
    if (!res.ok) throw new Error(`n8n exec data ${res.status}`);
    const data = await res.json();
    const batch = data.data ?? [];
    for (const e of batch) out.push(parseExec(e));
    cursor = data.nextCursor ?? undefined;
    if (!cursor || batch.length === 0) break;
  }
  return out;
}
