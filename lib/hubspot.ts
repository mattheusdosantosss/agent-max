import { normalizarTopico } from "./pricing";
import type { TopicCount, DayCount } from "./types";

const BASE = "https://api.hubapi.com";

type HsContact = {
  properties: Record<string, string | null>;
};

function headers() {
  const token = process.env.HUBSPOT_TOKEN;
  if (!token) throw new Error("HUBSPOT_TOKEN ausente");
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

// Conta contatos que batem num filtro, lendo o campo `total` da Search API.
async function contarComFiltro(filters: any[]): Promise<number> {
  const res = await fetch(`${BASE}/crm/v3/objects/contacts/search`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ filterGroups: [{ filters }], limit: 1 }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`HubSpot search ${res.status}`);
  const data = await res.json();
  return data.total ?? 0;
}

// Pagina todos os contatos que têm motivo_do_contato preenchido e devolve as
// propriedades necessárias para agregar tópicos / motivos / datas de escalação.
async function buscarInteracoes(): Promise<HsContact[]> {
  const out: HsContact[] = [];
  let after: string | undefined = undefined;
  for (let i = 0; i < 50; i++) {
    const body: any = {
      filterGroups: [
        {
          filters: [
            {
              propertyName: "motivo_do_contato",
              operator: "HAS_PROPERTY",
            },
          ],
        },
      ],
      properties: [
        "motivo_do_contato",
        "motivo_da_escalacao",
        "atendimento_humano",
        "data_de_escalacao",
      ],
      limit: 100,
    };
    if (after) body.after = after;
    const res = await fetch(`${BASE}/crm/v3/objects/contacts/search`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(body),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`HubSpot search ${res.status}`);
    const data = await res.json();
    out.push(...(data.results ?? []));
    after = data.paging?.next?.after;
    if (!after) break;
  }
  return out;
}

function agregar(
  contacts: HsContact[],
  prop: string,
  normaliza: boolean
): TopicCount[] {
  const m = new Map<string, number>();
  for (const c of contacts) {
    const raw = c.properties[prop];
    if (!raw) continue;
    const label = normaliza ? normalizarTopico(raw) : raw;
    m.set(label, (m.get(label) ?? 0) + 1);
  }
  return [...m.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}

function escalacoesPorDia(contacts: HsContact[]): DayCount[] {
  const m = new Map<string, number>();
  for (const c of contacts) {
    const d = c.properties["data_de_escalacao"];
    if (!d) continue;
    const dia = new Date(d).toISOString().slice(0, 10);
    m.set(dia, (m.get(dia) ?? 0) + 1);
  }
  return [...m.entries()]
    .map(([date, value]) => ({ date, value }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export async function getHubspotMetrics() {
  const interacoes = await buscarInteracoes();
  const escaladas = await contarComFiltro([
    { propertyName: "atendimento_humano", operator: "EQ", value: "true" },
  ]);

  return {
    conversasUnicas: interacoes.length,
    escaladas,
    topicos: agregar(interacoes, "motivo_do_contato", true),
    motivosEscalacao: agregar(interacoes, "motivo_da_escalacao", false),
    escalacoesPorDia: escalacoesPorDia(interacoes),
  };
}
