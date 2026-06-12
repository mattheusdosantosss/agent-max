// Agrupamento de conversas em "atendimentos".
// Um contato é identificado pelo WhatsApp (o id do registro é só da execução do n8n).
// Dentro de um contato, um silêncio maior que 24h abre um atendimento novo — alinhado
// à janela de atendimento da API Oficial da Meta (depois de 24h é nova conversa).
import type { ConversaStore } from "./store";

export const JANELA_MS = 24 * 60 * 60 * 1000;

// Últimos 8 dígitos: ignora +55 / 0 na frente e variações de formatação.
export function digitsTail(s?: string): string {
  return (s || "").replace(/\D/g, "").slice(-8);
}

export type Atendimento = {
  atendimentoId: string;        // `${chave}:${inicio}`
  chave: string;                // tail do whatsapp (ou cid:/id: quando não há whatsapp)
  whatsapp?: string;
  contactId?: string;
  nome?: string;
  inicio: number;               // ts da 1ª mensagem
  fim: number;                  // ts da última
  registros: ConversaStore[];   // ordenados por ts
  motivoIA?: string;            // carimbado pelo cron de classificação (mesmo p/ todo o atendimento)
  resumoIA?: string;            // análise curta do atendimento
  resolvidoIA?: string;         // sim | parcial | nao
  sentimentoIA?: string;        // positivo | neutro | negativo
};

// Chave de identidade do contato: whatsapp normalizado; cai pra contactId ou id do
// registro quando o whatsapp não veio (registros antigos sem telefone capturado).
function chaveContato(c: ConversaStore): string {
  const tail = digitsTail(c.whatsapp);
  if (tail) return tail;
  if (c.contactId) return `cid:${c.contactId}`;
  return `id:${c.id}`;
}

export function agruparAtendimentos(convs: ConversaStore[]): Atendimento[] {
  const grupos = new Map<string, ConversaStore[]>();
  for (const c of convs) {
    const k = chaveContato(c);
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k)!.push(c);
  }

  const out: Atendimento[] = [];
  for (const [chave, regs] of grupos) {
    regs.sort((a, b) => a.ts - b.ts);
    let atual: ConversaStore[] = [];
    let lastTs = 0;

    const flush = () => {
      if (!atual.length) return;
      const inicio = atual[0].ts;
      const fim = atual[atual.length - 1].ts;
      out.push({
        atendimentoId: `${chave}:${inicio}`,
        chave,
        whatsapp: atual.find((r) => r.whatsapp)?.whatsapp,
        contactId: atual.find((r) => r.contactId)?.contactId,
        nome: atual.find((r) => r.nome)?.nome,
        inicio,
        fim,
        registros: atual,
        motivoIA: atual.find((r) => r.motivoIA)?.motivoIA,
        resumoIA: atual.find((r) => r.resumoIA)?.resumoIA,
        resolvidoIA: atual.find((r) => r.resolvidoIA)?.resolvidoIA,
        sentimentoIA: atual.find((r) => r.sentimentoIA)?.sentimentoIA,
      });
      atual = [];
    };

    for (const r of regs) {
      if (atual.length && r.ts - lastTs > JANELA_MS) flush();
      atual.push(r);
      lastTs = r.ts;
    }
    flush();
  }

  return out.sort((a, b) => b.inicio - a.inicio); // mais recente primeiro
}

// Um atendimento precisa ser (re)classificado se algum registro ainda não tem o motivo
// OU a análise (resumo). O OR no resumo faz os já classificados antes da análise
// individual serem reprocessados uma vez pra ganharem o diagnóstico completo.
export function precisaClassificar(a: Atendimento): boolean {
  return a.registros.some((r) => !r.motivoIA || !r.resumoIA);
}
