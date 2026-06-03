import { NextResponse } from "next/server";
import { getMetrics } from "@/lib/metrics";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const m = await getMetrics();
    return NextResponse.json(m);
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "erro" },
      { status: 500 }
    );
  }
}
