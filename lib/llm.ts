// Camada única de LLM. O provedor é escolhido por env LLM_PROVIDER (openai | gemini |
// anthropic), default openai. Trocar de provedor = trocar env, sem mexer no código.
// Usado tanto pela classificação de motivo (/api/classificar) quanto pela Análise do Max.

export type LLMOpts = {
  system: string;
  user: string;
  json?: boolean;        // pede saída JSON (response_format / responseMimeType)
  temperature?: number;
  modelo?: string;       // override; senão usa o default do provedor
};

export function provider(): "openai" | "gemini" | "anthropic" {
  const p = (process.env.LLM_PROVIDER ?? "openai").toLowerCase();
  return p === "gemini" || p === "anthropic" ? p : "openai";
}

export function modeloPadrao(override?: string): string {
  if (override) return override;
  switch (provider()) {
    case "gemini": return process.env.GEMINI_MODEL ?? "gemini-2.0-flash";
    case "anthropic": return process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5-20251001";
    default: return process.env.OPENAI_MODEL ?? "gpt-4.1-mini";
  }
}

async function chamarOpenAI(o: LLMOpts, modelo: string): Promise<string> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY ausente no Vercel");
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: modelo,
      temperature: o.temperature ?? 0.3,
      ...(o.json ? { response_format: { type: "json_object" } } : {}),
      messages: [{ role: "system", content: o.system }, { role: "user", content: o.user }],
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 220)}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}

// Nomes de modelo do Gemini mudam com frequência (o Google aposenta versões). Por isso,
// se o modelo configurado der 404 (não existe), tentamos os próximos da lista — assim a
// rota se recupera sozinha de troca de nomes sem precisar de novo deploy.
// Inclui variantes -lite, que têm cotas grátis próprias (mais folgadas) — úteis quando
// o modelo principal estoura a cota do free tier (429).
const GEMINI_FALLBACKS = [
  "gemini-2.0-flash", "gemini-2.5-flash",
  "gemini-2.0-flash-lite", "gemini-2.5-flash-lite", "gemini-flash-latest",
];

async function chamarGemini(o: LLMOpts, modelo: string): Promise<string> {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY ausente no Vercel");
  const candidatos = Array.from(new Set([modelo, ...GEMINI_FALLBACKS]));
  const body = JSON.stringify({
    system_instruction: { parts: [{ text: o.system }] },
    contents: [{ role: "user", parts: [{ text: o.user }] }],
    generationConfig: {
      temperature: o.temperature ?? 0.3,
      ...(o.json ? { responseMimeType: "application/json" } : {}),
    },
  });

  let ultimoErro = "";
  for (const m of candidatos) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${key}`;
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body });
    // 404 = modelo não existe; 429 = cota estourada; 5xx (503 = "high demand"/UNAVAILABLE,
    // 500/502 transitórios) = modelo sobrecarregado. Em todos, tenta o próximo candidato —
    // os modelos têm cotas e capacidade independentes, então outro costuma estar disponível.
    if (res.status === 404 || res.status === 429 || res.status >= 500) { ultimoErro = `${res.status} em ${m}`; continue; }
    if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 220)}`);
    const data = await res.json();
    const parts = data.candidates?.[0]?.content?.parts ?? [];
    return parts.map((p: any) => p?.text ?? "").join("").trim();
  }
  throw new Error(`Nenhum modelo Gemini disponível agora — cota estourada (429) ou sobrecarga do Google (503). Tentei: ${candidatos.join(", ")}. Último: ${ultimoErro}. Geralmente é temporário; o cron tenta de novo na próxima hora.`);
}

async function chamarAnthropic(o: LLMOpts, modelo: string): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY ausente no Vercel");
  const sys = o.json ? `${o.system}\n\nResponda APENAS com JSON válido, sem markdown.` : o.system;
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: modelo,
      max_tokens: 2048,
      temperature: o.temperature ?? 0.3,
      system: sys,
      messages: [{ role: "user", content: o.user }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 220)}`);
  const data = await res.json();
  return (data.content ?? []).map((b: any) => b?.text ?? "").join("").trim();
}

// Chama o provedor ativo e devolve o texto da resposta. Em modo json, remove cercas
// ```json caso o modelo as inclua (alguns fazem), pra o JSON.parse do chamador funcionar.
export async function chamarLLM(o: LLMOpts): Promise<string> {
  const modelo = modeloPadrao(o.modelo);
  let txt: string;
  switch (provider()) {
    case "gemini": txt = await chamarGemini(o, modelo); break;
    case "anthropic": txt = await chamarAnthropic(o, modelo); break;
    default: txt = await chamarOpenAI(o, modelo);
  }
  if (o.json) txt = txt.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  return txt;
}
