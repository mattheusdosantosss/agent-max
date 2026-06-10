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

  const id = String(body.id ?? body.executionId ?? body.contactId ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  const nome =
    body.nome ??
    (body.firstname ? `${body.firstname} ${body.lastname ?? ""}`.trim() : undefined);

  const c: ConversaStore = {
    id,
    ts: body.ts ? Number(body.ts) : Date.now(),
    pergunta: String(body.pergunta ?? body.msgcli ?? body.mensagem ?? "").slice(0, 2000),
    resposta: String(body.resposta ?? body.output ?? body.resposta_max ?? "").slice(0, 2000),
    contactId: body.contactId ? String(body.contactId) : undefined,
    whatsapp: body.whatsapp ? String(body.whatsapp) : undefined,
    nome: nome ? String(nome) : undefined,
    motivo: body.motivo ? String(body.motivo) : undefined,
  };

  const ok = await salvarConversa(c);
  if (!ok) return NextResponse.json({ error: "store indisponível (faltam UPSTASH_REDIS_REST_URL/TOKEN)" }, { status: 503 });
  return NextResponse.json({ ok: true, id: c.id });
}
