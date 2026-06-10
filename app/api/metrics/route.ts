import { NextResponse } from "next/server";
import { getMetrics } from "@/lib/metrics";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 30; // a contagem ao vivo do n8n é lenta; aqui damos tempo

export async function GET() {
  try {
    // liveN8n: faz a leitura pesada do n8n e atualiza o cache no Redis.
    const m = await getMetrics({ liveN8n: true });
    return NextResponse.json(m);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "erro" }, { status: 500 });
  }
}
