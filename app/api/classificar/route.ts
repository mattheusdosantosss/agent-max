import { NextResponse } from "next/server";
import { todasConversas, atualizarConversas, type ConversaStore } from "@/lib/store";
import { agruparAtendimentos, precisaClassificar, type Atendimento } from "@/lib/atendimentos";
import { buscarContatoIdPorTelefone, atualizarMotivoContato } from "@/lib/hubspot";
import { chamarLLM } from "@/lib/llm";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

// Quantos atendimentos classificar por chamada. O cron roda de hora em hora e vai
// drenando o backlog aos poucos — mantém cada execução rápida e barata.
const BATCH = 12;

// Vocabulário preferido (as categorias que já existem). A IA pode criar uma nova
// quando nenhuma serve, inclusive marcar contatos fora de escopo.
const CATEGORIAS = [
  "Inscrição", "Pagamento", "Datas e horários", "Etapas da competição",
  "Uso da plataforma", "Vídeo de palestra", "Reclamação / suporte",
  "Resposta automática de IA", "Engano / número errado", "Spam", "Teste interno",
  "Outros assuntos",
];

// Rótulos genéricos que o modo ?refazer=1 reavalia (mesmo já classificados).
const GENERICOS = new Set(["outros assuntos", "fora de escopo", ""]);

function autorizado(req: Request): boolean {
  const secret = process.env.CLASSIFY_SECRET;
  if (!secret) return false;
  const h =
    req.headers.get("x-classify-secret") ||
    (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  return h === secret;
}

// Remove e-mail/telefone do texto antes de mandar pra OpenAI.
function limpa(s: string): string {
  return (s || "")
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, "[email]")
    .replace(/\+?\d[\d\s().-]{8,}\d/g, "[telefone]")
    .slice(0, 700);
}

function textoDoAtendimento(a: Atendimento): string {
  return a.registros
    .map((r) => `Cliente: ${limpa(r.pergunta) || "(sem texto)"}\nMax: ${limpa(r.resposta) || "(sem texto)"}`)
    .join("\n---\n")
    .slice(0, 3500);
}

type Classificacao = {
  motivo: string;
  fora_de_escopo: boolean;
  resumo: string;
  resolvido: string;     // sim | parcial | nao
  sentimento: string;    // positivo | neutro | negativo
};

const RESOLVIDO = new Set(["sim", "parcial", "nao"]);
const SENTIMENTO = new Set(["positivo", "neutro", "negativo"]);

async function classificarLote(
  itens: { i: number; texto: string }[]
): Promise<Record<number, Classificacao>> {
  const sys = `Você analisa atendimentos do "Max", assistente de WhatsApp do The Best Speaker Brasil 2026 (competição de palestrantes). Para CADA atendimento, leia a conversa e produza:

- "motivo": o MOTIVO REAL e ESPECÍFICO do contato, em poucas palavras. Esforce-se para ser preciso; NÃO use "Outros assuntos" a menos que seja realmente impossível identificar. Reutilize uma destas quando encaixar: ${CATEGORIAS.join("; ")}.
  ATENÇÃO aos casos em que o "cliente" NÃO é uma pessoa fazendo uma pergunta:
   • Se a mensagem do cliente for uma RESPOSTA AUTOMÁTICA de outro bot/IA, saudação automática de OUTRA empresa, mensagem de ausência ("estou temporariamente ausente"), texto de marketing/broadcast ou recado enlatado → motivo = "Resposta automática de IA".
   • Número errado / pessoa enganada → "Engano / número errado". Spam/propaganda → "Spam". Teste interno → "Teste interno".
  Só invente um rótulo novo (curto, 2-4 palavras, em português) quando nenhuma opção acima servir.
- "fora_de_escopo": true quando NÃO é uma dúvida legítima sobre a competição (inclui os casos especiais acima).
- "resumo": 1-2 frases explicando o que houve (análise objetiva, em português).
- "resolvido": "sim" (Max resolveu), "parcial" (em parte/pendente) ou "nao" (não resolveu / escalado sem solução).
- "sentimento": "positivo", "neutro" ou "negativo".

Responda APENAS com JSON válido (sem markdown):
{"resultados":[{"i": number, "motivo": "...", "fora_de_escopo": boolean, "resumo": "...", "resolvido": "sim|parcial|nao", "sentimento": "positivo|neutro|negativo"}]}`;

  const user = itens.map((it) => `### Atendimento i=${it.i}\n${it.texto}`).join("\n\n");

  const content = await chamarLLM({ system: sys, user, json: true, temperature: 0.2 });
  const parsed = JSON.parse(content || "{}");
  const out: Record<number, Classificacao> = {};
  for (const r of parsed.resultados ?? []) {
    const i = Number(r.i);
    if (!Number.isFinite(i)) continue;
    const motivo = String(r.motivo ?? "").trim();
    const resolvido = String(r.resolvido ?? "").trim().toLowerCase();
    const sentimento = String(r.sentimento ?? "").trim().toLowerCase();
    out[i] = {
      motivo: motivo || "Outros assuntos",
      fora_de_escopo: r.fora_de_escopo === true,
      resumo: String(r.resumo ?? "").trim().slice(0, 500),
      resolvido: RESOLVIDO.has(resolvido) ? resolvido : "",
      sentimento: SENTIMENTO.has(sentimento) ? sentimento : "",
    };
  }
  return out;
}

async function handler(req: Request) {
  if (!autorizado(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const todas = await todasConversas();
  if (!todas.length) return NextResponse.json({ ok: true, classificados: 0, restantes: 0, hubspotAtualizados: 0, aviso: "nenhuma conversa no Redis ainda" });

  // ?refazer=1 reavalia também os já classificados como genéricos ("Outros assuntos" /
  // "Fora de escopo") — sweep manual; o cron normal (sem o param) só pega os pendentes.
  const refazer = new URL(req.url).searchParams.get("refazer");
  const atendimentos = agruparAtendimentos(todas);
  let pendentes = atendimentos.filter(precisaClassificar);
  if (refazer) {
    const ja = new Set(pendentes.map((a) => a.atendimentoId));
    const extra = atendimentos.filter(
      (a) => !ja.has(a.atendimentoId) && GENERICOS.has((a.motivoIA ?? "").trim().toLowerCase())
    );
    pendentes = [...pendentes, ...extra];
  }
  const lote = pendentes.slice(0, BATCH);

  if (!lote.length) {
    return NextResponse.json({ ok: true, classificados: 0, restantes: 0, hubspotAtualizados: 0 });
  }

  // 1) Classifica o lote numa única chamada.
  let result: Record<number, Classificacao>;
  try {
    result = await classificarLote(lote.map((a, i) => ({ i, texto: textoDoAtendimento(a) })));
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 502 });
  }

  // 2) Carimba motivoIA + atendimentoId nos registros e salva no Redis.
  const mudados: ConversaStore[] = [];
  const classificadosOk: Atendimento[] = [];
  lote.forEach((a, i) => {
    const c = result[i];
    if (!c) return;
    // Usa o rótulo específico da IA (ex.: "Resposta automática de IA"); só cai pra
    // "Fora de escopo" se a IA marcou fora de escopo mas não deu um rótulo útil.
    const motivo = c.motivo || (c.fora_de_escopo ? "Fora de escopo" : "Outros assuntos");
    for (const r of a.registros) {
      r.motivoIA = motivo;
      r.resumoIA = c.resumo || motivo; // nunca vazio: evita reprocessar em loop
      r.resolvidoIA = c.resolvido;
      r.sentimentoIA = c.sentimento;
      r.atendimentoId = a.atendimentoId;
      mudados.push(r);
    }
    a.motivoIA = motivo;
    classificadosOk.push(a);
  });
  await atualizarConversas(mudados);

  // 3) Write-back no HubSpot: só pro atendimento MAIS RECENTE de cada contato.
  // (Atendimentos vêm ordenados do mais recente pro mais antigo.)
  const ultimoPorChave = new Map<string, string>();
  for (const a of atendimentos) if (!ultimoPorChave.has(a.chave)) ultimoPorChave.set(a.chave, a.atendimentoId);

  let hubspotAtualizados = 0;
  let faltaEscopo = false;
  const jaResolvido = new Map<string, string | null>(); // chave -> contactId
  for (const a of classificadosOk) {
    if (ultimoPorChave.get(a.chave) !== a.atendimentoId) continue; // não é o mais recente
    try {
      let contactId = a.contactId || null;
      if (!contactId && a.whatsapp) {
        if (jaResolvido.has(a.chave)) contactId = jaResolvido.get(a.chave)!;
        else { contactId = await buscarContatoIdPorTelefone(a.whatsapp); jaResolvido.set(a.chave, contactId); }
      }
      if (!contactId || !a.motivoIA) continue;
      const { ok, status } = await atualizarMotivoContato(contactId, a.motivoIA);
      if (ok) hubspotAtualizados++;
      else if (status === 403) faltaEscopo = true;
    } catch (e) {
      console.error("classificar/hubspot:", e);
    }
  }

  return NextResponse.json({
    ok: true,
    classificados: classificadosOk.length,
    restantes: Math.max(0, pendentes.length - lote.length),
    hubspotAtualizados,
    ...(faltaEscopo ? { aviso: "token do HubSpot sem escopo crm.objects.contacts.write — write-back ignorado" } : {}),
  });
}

// n8n chama via POST; GET liberado pra testar no navegador/curl com o mesmo segredo.
export async function POST(req: Request) { return handler(req); }
export async function GET(req: Request) { return handler(req); }
