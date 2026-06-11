import { NextResponse } from "next/server";
import { conversasRecentes, totalConversas } from "@/lib/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET: devolve as conversas persistidas no Redis (ingest), para vincular na aba
// Atendimentos. Só os campos que a UI usa — nada de tokens.
export async function GET() {
  try {
    const [recentes, total] = await Promise.all([conversasRecentes(500), totalConversas()]);
    const conversas = recentes.map((c) => ({
      id: c.id,
      ts: c.ts,
      pergunta: c.pergunta || "",
      resposta: c.resposta || "",
      contactId: c.contactId || "",
      whatsapp: c.whatsapp || "",
      nome: c.nome || "",
      motivo: c.motivo || "",
    }));
    return NextResponse.json({ conversas, total });
  } catch (e: any) {
    return NextResponse.json({ conversas: [], total: 0, erro: String(e?.message ?? e) });
  }
}
