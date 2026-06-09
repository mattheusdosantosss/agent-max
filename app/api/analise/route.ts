import { NextResponse } from "next/server";
import { getHubspotMetrics } from "@/lib/hubspot";
import { getN8nConversas } from "@/lib/n8n";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY não configurada no Vercel. Adicione em Settings → Environment Variables e faça Redeploy." },
      { status: 400 }
    );
  }
  const modelo = process.env.ANALISE_MODEL ?? "gpt-4.1-mini";

  // 1) Métricas agregadas (universo já filtrado = só Max)
  let hub: any = null;
  try { hub = await getHubspotMetrics(); }
  catch (e) { console.error("analise/hubspot:", e); }

  // 2) Amostra de conversas recentes (texto), com identificadores removidos
  let convs: { pergunta: string; resposta: string }[] = [];
  try {
    const c = await getN8nConversas(40);
    if (c) {
      convs = c
        .filter((x) => (x.pergunta || "").trim() || (x.resposta || "").trim())
        .slice(0, 25)
        .map((x) => ({ pergunta: limpa(x.pergunta), resposta: limpa(x.resposta) }));
    }
  } catch (e) { console.error("analise/n8n:", e); }

  const conversasUnicas = hub?.conversasUnicas ?? 0;
  const escaladas = hub?.escaladas ?? 0;
  const taxa = conversasUnicas > 0 ? ((escaladas / conversasUnicas) * 100).toFixed(1) + "%" : "—";
  const topTopicos = (hub?.topicos ?? []).slice(0, 10).map((t: any) => `${t.label}: ${t.value}`).join("; ") || "—";
  const topEsc = (hub?.motivosEscalacao ?? []).slice(0, 10).map((t: any) => `${t.label}: ${t.value}`).join("; ") || "—";

  const transcripts = convs.length
    ? convs.map((c, i) => `#${i + 1}\nCliente: ${c.pergunta || "(sem texto)"}\nMax: ${c.resposta || "(sem texto)"}`).join("\n\n")
    : "(nenhuma conversa retida no n8n no momento)";

  const sys = `Você é um analista sênior de qualidade de atendimento. Avalie o agente de IA "Max", assistente oficial de WhatsApp do The Best Speaker Brasil 2026 (uma competição de palestrantes). Seja objetivo, específico e acionável; baseie-se nas evidências fornecidas e não invente fatos. Dê atenção especial à ADEQUAÇÃO DAS ESCALAÇÕES: o Max só deve transferir para humano quando o cliente pede explicitamente ou há falha técnica real — escalar sem pedido é um problema. Avalie também precisão das respostas, tom, qualidade da classificação de motivos e custo. Responda em português do Brasil e APENAS com JSON válido (sem markdown, sem comentários) neste formato exato:
{"nota": number entre 0 e 10, "verdict": "frase curta", "resumo": "1-2 frases", "fortes": [{"titulo":"...","detalhe":"...","evidencia":"..."}], "problemas": [{"severidade":"alta|media|baixa","titulo":"...","detalhe":"...","evidencia":"..."}], "sugestoes": [{"titulo":"...","detalhe":"..."}]}`;

  const user = `MÉTRICAS (universo só do Max):
- Conversas únicas: ${conversasUnicas}
- Escaladas para humano: ${escaladas} (taxa ${taxa})
- Principais motivos de contato: ${topTopicos}
- Motivos de escalação: ${topEsc}
- Observação de custo: o prompt do Max tem ~17,7 mil tokens e é reenviado a cada mensagem, dominando o custo.

AMOSTRA DE CONVERSAS RECENTES (${convs.length}):
${transcripts}`;

  let res: Response;
  try {
    res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: modelo,
        temperature: 0.3,
        response_format: { type: "json_object" },
        messages: [{ role: "system", content: sys }, { role: "user", content: user }],
      }),
    });
  } catch (e: any) {
    return NextResponse.json({ error: `Falha ao chamar a OpenAI: ${e?.message ?? e}` }, { status: 502 });
  }
  if (!res.ok) {
    const t = await res.text();
    return NextResponse.json({ error: `OpenAI ${res.status}: ${t.slice(0, 240)}` }, { status: 502 });
  }
  const data = await res.json();
  let analise: any;
  try { analise = JSON.parse(data.choices?.[0]?.message?.content ?? "{}"); }
  catch { return NextResponse.json({ error: "A resposta do LLM não veio em JSON válido." }, { status: 502 }); }

  return NextResponse.json({
    analise,
    base: { conversas: conversasUnicas, escaladas, amostra: convs.length, modelo },
    geradoEm: new Date().toISOString(),
  });
}

// remove telefone/email do texto antes de enviar ao LLM
function limpa(s: string): string {
  return (s || "")
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, "[email]")
    .replace(/\+?\d[\d\s().-]{8,}\d/g, "[telefone]")
    .slice(0, 800);
}
