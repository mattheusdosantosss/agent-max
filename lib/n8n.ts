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
  return {
    id: String(e?.id ?? ""),
    quando: e?.startedAt ?? e?.stoppedAt ?? "",
    status: e?.status ?? (e?.finished ? "success" : ""),
    pergunta: pergunta.slice(0, 600),
    resposta: resposta.slice(0, 600),
    nodes,
  };
}

// Lê as execuções recentes COM dados e extrai melhor-esforço pergunta/resposta.
export async function getN8nConversas(limit = 25): Promise<Conversa[] | null> {
  const c = cfg();
  if (!c) return null;
  const url = new URL(`${c.base}/api/v1/executions`);
  url.searchParams.set("workflowId", c.workflowId);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("includeData", "true");
  const res = await fetch(url.toString(), {
    headers: { "X-N8N-API-KEY": c.key, accept: "application/json" }, cache: "no-store",
  });
  if (!res.ok) throw new Error(`n8n exec data ${res.status}`);
  const data = await res.json();
  return (data.data ?? []).map(parseExec);
}
