import { NextResponse } from "next/server";
import { conversasRecentes, todasConversas, totalConversas, type ConversaStore } from "@/lib/store";
import { agruparAtendimentos, digitsTail, type Atendimento } from "@/lib/atendimentos";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

function mapConv(c: ConversaStore) {
  return {
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
  };
}
function mapAtend(a: Atendimento) {
  return {
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
  };
}

// GET sem params: as 500 conversas mais recentes (resumo p/ a página).
// GET ?contactId=&whatsapp=: filtra o CONJUNTO COMPLETO por aquele contato — usado
// pela aba Atendimentos pra mostrar a conversa de qualquer contato (inclusive antigos,
// fora da janela das 500 recentes).
export async function GET(req: Request) {
  const url = new URL(req.url);
  const qContact = (url.searchParams.get("contactId") || "").trim();
  const qWhats = (url.searchParams.get("whatsapp") || "").trim();
  const qDay = (url.searchParams.get("day") || "").trim(); // YYYY-MM-DD (horário de Brasília)
  const q = (url.searchParams.get("q") || "").trim().toLowerCase(); // busca por texto
  try {
    if (q) {
      const todas = await todasConversas();
      const arr = todas.filter(
        (c) =>
          (c.pergunta || "").toLowerCase().includes(q) ||
          (c.resposta || "").toLowerCase().includes(q) ||
          (c.nome || "").toLowerCase().includes(q)
      );
      arr.sort((a, b) => b.ts - a.ts);
      return NextResponse.json({ q, total: arr.length, conversas: arr.slice(0, 100).map(mapConv) });
    }
    if (qDay) {
      const slim = url.searchParams.get("slim") === "1"; // só atendimentos (sem texto cru)
      const start = Date.parse(`${qDay}T00:00:00-03:00`);
      if (Number.isFinite(start)) {
        const end = start + 24 * 60 * 60 * 1000;
        const todas = await todasConversas();
        const atends = agruparAtendimentos(todas).filter((a) => a.inicio >= start && a.inicio < end);
        const atendimentos = atends.map(mapAtend);
        if (slim) return NextResponse.json({ day: qDay, total: atends.length, atendimentos });
        const idset = new Set(atends.flatMap((a) => a.registros.map((r) => r.id)));
        const conversas = todas.filter((c) => idset.has(c.id)).map(mapConv);
        return NextResponse.json({ day: qDay, total: atends.length, atendimentos, conversas });
      }
    }
    if (qContact || qWhats) {
      const todas = await todasConversas();
      const tail = digitsTail(qWhats);
      const filtradas = todas.filter(
        (c) => (qContact && c.contactId === qContact) || (tail && digitsTail(c.whatsapp) === tail)
      );
      const conversas = filtradas.map(mapConv);
      const atendimentos = agruparAtendimentos(filtradas).map(mapAtend);
      return NextResponse.json({ conversas, atendimentos, total: filtradas.length });
    }

    const [recentes, total] = await Promise.all([conversasRecentes(500), totalConversas()]);
    const conversas = recentes.map(mapConv);
    const atendimentos = agruparAtendimentos(recentes).map(mapAtend);
    return NextResponse.json({ conversas, atendimentos, total });
  } catch (e: any) {
    return NextResponse.json({ conversas: [], atendimentos: [], total: 0, erro: String(e?.message ?? e) });
  }
}
