import { NextResponse } from "next/server";
import { todasConversas } from "@/lib/store";
import { agruparAtendimentos } from "@/lib/atendimentos";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

// Todos os atendimentos que estão no Redis (janela atual), agrupados por contato +
// janela de 24h. Slim: sem o texto cru — só o resumo p/ a lista da aba Atendimentos.
export async function GET() {
  try {
    const todas = await todasConversas();
    const atendimentos = agruparAtendimentos(todas).map((a) => ({
      atendimentoId: a.atendimentoId,
      whatsapp: a.whatsapp || "",
      contactId: a.contactId || "",
      nome: a.nome || "",
      inicio: a.inicio,
      fim: a.fim,
      motivoIA: a.motivoIA || "",
      resumoIA: a.resumoIA || "",
      resolvidoIA: a.resolvidoIA || "",
      sentimentoIA: a.sentimentoIA || "",
      ids: a.registros.map((r) => r.id),
    }));
    return NextResponse.json({ total: atendimentos.length, atendimentos });
  } catch (e: any) {
    return NextResponse.json({ total: 0, atendimentos: [], erro: String(e?.message ?? e) });
  }
}
