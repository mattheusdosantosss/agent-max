import { NextResponse } from "next/server";
import { conversasRecentes, totalConversas } from "@/lib/store";
import { agruparAtendimentos } from "@/lib/atendimentos";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET: conversas persistidas no Redis + os atendimentos já agrupados (janela 24h),
// pra UI montar a thread por atendimento e mostrar o motivo classificado pela IA.
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
      motivoIA: c.motivoIA || "",
      atendimentoId: c.atendimentoId || "",
    }));

    const atendimentos = agruparAtendimentos(recentes).map((a) => ({
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

    return NextResponse.json({ conversas, atendimentos, total });
  } catch (e: any) {
    return NextResponse.json({ conversas: [], atendimentos: [], total: 0, erro: String(e?.message ?? e) });
  }
}
