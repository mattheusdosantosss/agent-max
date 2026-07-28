import { NextResponse } from "next/server";
import { getHubspotMetrics } from "@/lib/hubspot";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

// Diagnóstico: tenta a busca real do HubSpot e devolve o motivo exato se falhar
// (status + corpo do erro). Sem dados sensíveis — só p/ sabermos por que caiu no seed.
export async function GET() {
  if (!process.env.HUBSPOT_TOKEN) {
    return NextResponse.json({ ok: false, error: "HUBSPOT_TOKEN ausente no Vercel" });
  }
  try {
    const m = await getHubspotMetrics();
    return NextResponse.json({ ok: true, conversasUnicas: m.conversasUnicas, contatos: m.contatos.length, excluidosTeste: m.excluidosTeste });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message ?? e) });
  }
}
