// n8n Public API. Header de auth: X-N8N-API-KEY.
// Conta execuções do workflow do Max = volume de mensagens processadas.

function cfg() {
  const base = process.env.N8N_BASE_URL;
  const key = process.env.N8N_API_KEY;
  const workflowId = process.env.N8N_WORKFLOW_ID;
  if (!base || !key || !workflowId) return null;
  return { base: base.replace(/\/$/, ""), key, workflowId };
}

export async function getN8nMensagens(): Promise<number | null> {
  const c = cfg();
  if (!c) return null;

  let total = 0;
  let cursor: string | undefined = undefined;
  // pagina até ~50k execuções (250 * 200)
  for (let i = 0; i < 200; i++) {
    const url = new URL(`${c.base}/api/v1/executions`);
    url.searchParams.set("workflowId", c.workflowId);
    url.searchParams.set("limit", "250");
    url.searchParams.set("includeData", "false");
    if (cursor) url.searchParams.set("cursor", cursor);

    const res = await fetch(url.toString(), {
      headers: { "X-N8N-API-KEY": c.key, accept: "application/json" },
      cache: "no-store",
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
