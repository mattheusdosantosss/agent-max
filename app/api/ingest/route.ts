import { NextResponse } from "next/server";
import { salvarConversa, type ConversaStore } from "@/lib/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  const secret = process.env.INGEST_SECRET;
  const auth =
    req.headers.get("x-ingest-secret") ||
    (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!secret || auth !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "json inválido" }, { status: 400 }); }

  try {
    const id = String(body.id ?? body.executionId ?? body.contactId ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    const nome =
      body.nome ??
      (body.firstname ? `${body.firstname} ${body.lastname ?? ""}`.trim() : undefined);

    const tu = body.tokenUsageEstimate ?? body.usage ?? {};
    const num = (v: any) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : undefined; };
    const promptTokens = num(body.promptTokens ?? tu.promptTokens ?? tu.prompt_tokens ?? tu.input_tokens);
    const completionTokens = num(body.completionTokens ?? tu.completionTokens ?? tu.completion_tokens ?? tu.output_tokens);

    const c: ConversaStore = {
      id,
      ts: body.ts ? Number(body.ts) : Date.now(),
      pergunta: String(body.pergunta ?? body.msgcli ?? body.mensagem ?? "").slice(0, 2000),
      resposta: String(body.resposta ?? body.output ?? body.resposta_max ?? "").slice(0, 2000),
      contactId: body.contactId ? String(body.contactId) : undefined,
      whatsapp: body.whatsapp ? String(body.whatsapp) : undefined,
      nome: nome ? String(nome) : undefined,
      motivo: body.motivo ? String(body.motivo) : undefined,
      promptTokens,
      completionTokens,
    };

    const ok = await salvarConversa(c);
    // Telemetria fire-and-forget: NUNCA derruba o fluxo do Max.
    // Mesmo sem store, responde 200 (com aviso) pra o nó do n8n não acusar erro.
    if (!ok) {
      console.warn("ingest: store indisponível (faltam UPSTASH_REDIS_REST_URL/TOKEN ou KV_REST_API_*)");
      return NextResponse.json({ ok: true, stored: false, warn: "store indisponível" });
    }
    return NextResponse.json({ ok: true, stored: true, id: c.id });
  } catch (e: any) {
    // Qualquer erro de Redis/parse é logado e engolido — o Max já respondeu ao usuário.
    console.error("ingest erro (engolido p/ não quebrar o fluxo):", e);
    return NextResponse.json({ ok: true, stored: false, warn: String(e?.message ?? e) });
  }
}
