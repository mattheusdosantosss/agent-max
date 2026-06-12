import { normalizarTopico, normalizarUF, ehTeste } from "./pricing";
import type { TopicCount, DayCount, RegiaoCount, Contato } from "./types";

const BASE = "https://api.hubapi.com";

type HsContact = { id?: string; properties: Record<string, string | null> };

function headers() {
  const token = process.env.HUBSPOT_TOKEN;
  if (!token) throw new Error("HUBSPOT_TOKEN ausente");
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

// Pagina todos os contatos com motivo_do_contato preenchido (os que o Max atendeu).
async function buscarInteracoes(): Promise<HsContact[]> {
  const out: HsContact[] = [];
  let after: string | undefined = undefined;
  for (let i = 0; i < 50; i++) {
    const body: any = {
      // Migração para a propriedade `produto`:
      //  Grupo 1 = já marcados como Max (produto = "The Best Speaker Brasil").
      //  Grupo 2 = ainda sem `produto` E sem marca do The Best School (fallback atual).
      // Conforme os fluxos populam `produto`, o grupo 1 cresce e o 2 some sozinho.
      filterGroups: [
        { filters: [
          { propertyName: "motivo_do_contato", operator: "HAS_PROPERTY" },
          { propertyName: "produto", operator: "EQ", value: "The Best Speaker Brasil" },
        ] },
        { filters: [
          { propertyName: "motivo_do_contato", operator: "HAS_PROPERTY" },
          { propertyName: "produto", operator: "NOT_HAS_PROPERTY" },
          { propertyName: "tbschool__status_do_checkout", operator: "NOT_HAS_PROPERTY" },
        ] },
      ],
      properties: [
        "motivo_do_contato", "motivo_da_escalacao", "atendimento_humano", "data_de_escalacao",
        "firstname", "lastname", "email", "phone", "state", "createdate", "produto",
      ],
      sorts: [{ propertyName: "createdate", direction: "DESCENDING" }],
      limit: 100,
    };
    if (after) body.after = after;
    const res = await fetch(`${BASE}/crm/v3/objects/contacts/search`, {
      method: "POST", headers: headers(), body: JSON.stringify(body), cache: "no-store",
    });
    if (!res.ok) throw new Error(`HubSpot search ${res.status}`);
    const data = await res.json();
    out.push(...(data.results ?? []));
    after = data.paging?.next?.after;
    if (!after) break;
  }
  return out;
}

function toISO(v: string | null | undefined): string {
  if (!v) return "";
  const d = /^\d+$/.test(v) ? new Date(Number(v)) : new Date(v);
  return isNaN(d.getTime()) ? "" : d.toISOString();
}
function nomeDe(p: Record<string, string | null>): string {
  const full = `${(p.firstname ?? "").trim()} ${(p.lastname ?? "").trim()}`.trim();
  return full || (p.email ?? "").trim() || "—";
}
function escalou(p: Record<string, string | null>): boolean {
  return (p.atendimento_humano ?? "").toLowerCase() === "true";
}

function agregar(contacts: HsContact[], prop: string, normaliza: boolean): TopicCount[] {
  const m = new Map<string, number>();
  for (const c of contacts) {
    const raw = c.properties[prop];
    if (!raw) continue;
    const label = normaliza ? normalizarTopico(raw) : raw;
    m.set(label, (m.get(label) ?? 0) + 1);
  }
  return [...m.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
}
function escalacoesPorDia(contacts: HsContact[]): DayCount[] {
  const m = new Map<string, number>();
  for (const c of contacts) {
    const iso = toISO(c.properties["data_de_escalacao"]);
    if (!iso) continue;
    const dia = iso.slice(0, 10);
    m.set(dia, (m.get(dia) ?? 0) + 1);
  }
  return [...m.entries()].map(([date, value]) => ({ date, value })).sort((a, b) => a.date.localeCompare(b.date));
}
function agregarUF(contatos: Contato[]): RegiaoCount[] {
  const m = new Map<string, number>();
  for (const c of contatos) m.set(c.uf, (m.get(c.uf) ?? 0) + 1);
  return [...m.entries()].map(([uf, value]) => ({ uf, value }))
    .sort((a, b) => (a.uf === "—" ? 1 : b.uf === "—" ? -1 : b.value - a.value));
}

// Resolve o id do contato no HubSpot a partir do número de WhatsApp. Telefone é
// chato de casar (formatos variados), então tentamos algumas variações com EQ e,
// por último, CONTAINS_TOKEN. Best-effort: devolve null se não achar.
export async function buscarContatoIdPorTelefone(whatsapp: string): Promise<string | null> {
  const dig = (whatsapp || "").replace(/\D/g, "");
  if (dig.length < 8) return null;
  const tail = dig.slice(-8);
  const semDDI = dig.startsWith("55") ? dig.slice(2) : dig;
  const variantes = Array.from(new Set([`+${dig}`, dig, semDDI, `+${semDDI}`]));

  // HubSpot Search aceita no máx. 5 filterGroups (OR entre grupos). Usamos IN p/
  // cobrir todas as variações de formato num filtro só, + CONTAINS_TOKEN como rede.
  const filterGroups: any[] = [
    { filters: [{ propertyName: "hs_whatsapp_phone_number", operator: "IN", values: variantes }] },
    { filters: [{ propertyName: "phone", operator: "IN", values: variantes }] },
    { filters: [{ propertyName: "mobilephone", operator: "IN", values: variantes }] },
    { filters: [{ propertyName: "hs_whatsapp_phone_number", operator: "CONTAINS_TOKEN", value: tail }] },
  ];

  const res = await fetch(`${BASE}/crm/v3/objects/contacts/search`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ filterGroups, properties: ["hs_whatsapp_phone_number", "phone"], limit: 1 }),
    cache: "no-store",
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.results?.[0]?.id ?? null;
}

// Sobrescreve o motivo_do_contato. Devolve {ok, status} — status 403 = token sem o
// escopo crm.objects.contacts.write (precisa liberar no app privado do HubSpot).
export async function atualizarMotivoContato(
  contactId: string,
  motivo: string
): Promise<{ ok: boolean; status: number }> {
  const res = await fetch(`${BASE}/crm/v3/objects/contacts/${contactId}`, {
    method: "PATCH",
    headers: headers(),
    body: JSON.stringify({ properties: { motivo_do_contato: motivo } }),
    cache: "no-store",
  });
  return { ok: res.ok, status: res.status };
}

export async function getHubspotMetrics() {
  const todas = await buscarInteracoes();
  const validos = todas.filter((c) => !ehTeste(c.properties.email, nomeDe(c.properties)));
  const excluidosTeste = todas.length - validos.length;

  const contatos: Contato[] = validos.map((c) => ({
    id: c.id ?? "",
    nome: nomeDe(c.properties),
    email: (c.properties.email ?? "").trim(),
    telefone: (c.properties.phone ?? "").trim(),
    motivo: normalizarTopico(c.properties.motivo_do_contato),
    escalou: escalou(c.properties),
    uf: normalizarUF(c.properties.state),
    criadoEm: toISO(c.properties.createdate),
  })).sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));

  return {
    conversasUnicas: validos.length,
    escaladas: validos.filter((c) => escalou(c.properties)).length,
    topicos: agregar(validos, "motivo_do_contato", true),
    motivosEscalacao: agregar(validos, "motivo_da_escalacao", false),
    escalacoesPorDia: escalacoesPorDia(validos),
    regioes: agregarUF(contatos),
    contatos,
    excluidosTeste,
  };
}
