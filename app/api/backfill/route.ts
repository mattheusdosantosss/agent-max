import { NextResponse } from "next/server";
import { fetchExecPage, parseExecParaStore } from "@/lib/n8n";
import { salvarConversa } from "@/lib/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

// Workflow do Max (The Best Speaker Brasil) — confirmado ao vivo.
// Fixo aqui pra o backfill puxar SEMPRE o Max, independente do N8N_WORKFLOW_ID do Vercel.
const MAX_WORKFLOW = "ABZUMMhJizuP9mDv";

async function run(req: Request) {
  const url = new URL(req.url);
  const secret = process.env.INGEST_SECRET;
  const provided = url.searchParams.get("secret") || (req.headers.get("x-ingest-secret") || "");
  if (!secret || provided !== secret) {
    return NextResponse.json({ error: "unauthorized (passe ?secret=INGEST_SECRET)" }, { status: 401 });
  }

  const workflowId = url.searchParams.get("workflowId") || MAX_WORKFLOW;
  let cursor = url.searchParams.get("cursor") || undefined;

  const t0 = Date.now();
  const budgetMs = 45000; // margem segura abaixo do maxDuration
  let processed = 0, saved = 0, semConteudo = 0, comContactId = 0, paginas = 0;
  let erro: string | undefined;

  try {
    while (Date.now() - t0 < budgetMs && paginas < 12) {
      const { execs, nextCursor } = await fetchExecPage(workflowId, cursor);
      paginas++;
      for (const e of execs) {
        processed++;
        const c = parseExecParaStore(e);
        if (!c || (!c.pergunta && !c.resposta)) { semConteudo++; continue; }
        if (c.contactId) comContactId++;
        const ok = await salvarConversa(c);
        if (ok) saved++;
      }
      cursor = nextCursor;
      if (!cursor || execs.length === 0) { cursor = undefined; break; }
    }
  } catch (e: any) {
    erro = String(e?.message ?? e);
  }

  return NextResponse.json({
    ok: !erro,
    workflowId,
    paginas,
    processed,        // execuções lidas
    saved,            // gravadas no Redis (novas; dedupe ignora repetidas)
    comContactId,     // quantas tinham contactId pra vincular
    semConteudo,      // ignoradas (sem pergunta/resposta)
    nextCursor: cursor ?? null,
    done: !cursor,
    erro,
  });
}

export async function GET(req: Request) { return run(req); }
export async function POST(req: Request) { return run(req); }
