"use client";

import { useMemo, useState } from "react";
import type { Metrics, TopicCount, DayCount, RegiaoCount, Contato, Conversa } from "@/lib/types";

function fmt(n: number | null | undefined) {
  if (n == null) return "—";
  return n.toLocaleString("pt-BR");
}
function pct(n: number | null) {
  if (n == null) return "—";
  return (n * 100).toFixed(1).replace(".", ",") + "%";
}
function usd(n: number | null, casas = 2) {
  if (n == null) return "—";
  const min = n !== 0 && Math.abs(n) < 0.01 ? 4 : casas;
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: min, maximumFractionDigits: Math.max(min, 6) });
}
function dataCurta(iso: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function Bars({ data }: { data: TopicCount[] }) {
  if (!data.length) return <div className="empty">sem dados ainda</div>;
  const max = Math.max(...data.map((d) => d.value));
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div className="bars">
      {data.map((d, i) => (
        <div className="bar-row reveal" style={{ animationDelay: `${i * 45}ms` }} key={d.label}>
          <div className="bl">{d.label}</div>
          <div className="bar-track"><div className="bar-fill" style={{ width: `${(d.value / max) * 100}%` }} /></div>
          <div className="bv">{fmt(d.value)}</div>
          <div className="bp">{((d.value / total) * 100).toFixed(0)}%</div>
        </div>
      ))}
    </div>
  );
}

function Cols({ data }: { data: DayCount[] }) {
  if (!data.length) return <div className="empty">nenhuma escalação com data registrada ainda</div>;
  const max = Math.max(...data.map((d) => d.value));
  return (
    <>
      <div className="cols">
        {data.map((d) => (
          <div className="col" key={d.date}>
            <div className="colv">{d.value}</div>
            <div className="colbar" style={{ height: `${(d.value / max) * 100}%` }} />
          </div>
        ))}
      </div>
      <div className="colx">
        {data.map((d) => (<span key={d.date}>{d.date.slice(8, 10)}/{d.date.slice(5, 7)}</span>))}
      </div>
    </>
  );
}

function Regiao({ data }: { data: RegiaoCount[] }) {
  if (!data.length) return <div className="empty">sem região ainda — ligue o HubSpot</div>;
  const max = Math.max(...data.map((d) => d.value));
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div className="bars">
      {data.map((d, i) => (
        <div className="bar-row reveal" style={{ animationDelay: `${i * 45}ms` }} key={d.uf}>
          <div className="bl">{d.uf === "—" ? "Não informado" : d.uf}</div>
          <div className="bar-track"><div className={`bar-fill ${d.uf === "—" ? "muted-fill" : ""}`} style={{ width: `${(d.value / max) * 100}%` }} /></div>
          <div className="bv">{fmt(d.value)}</div>
          <div className="bp">{((d.value / total) * 100).toFixed(0)}%</div>
        </div>
      ))}
    </div>
  );
}

function TabelaContatos({ contatos }: { contatos: Contato[] }) {
  const [q, setQ] = useState("");
  const [motivo, setMotivo] = useState("todos");
  const [soEscalados, setSoEscalados] = useState(false);

  const motivos = useMemo(() => ["todos", ...Array.from(new Set(contatos.map((c) => c.motivo)))], [contatos]);
  const filtrados = useMemo(() => {
    const t = q.trim().toLowerCase();
    return contatos.filter((c) => {
      if (soEscalados && !c.escalou) return false;
      if (motivo !== "todos" && c.motivo !== motivo) return false;
      if (t && !(`${c.nome} ${c.email} ${c.telefone} ${c.uf}`.toLowerCase().includes(t))) return false;
      return true;
    });
  }, [contatos, q, motivo, soEscalados]);

  if (!contatos.length) return <div className="empty">sem contatos ainda — ligue o HubSpot</div>;

  return (
    <>
      <div className="tbar">
        <input className="inp" placeholder="buscar nome, email, telefone, UF…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="sel" value={motivo} onChange={(e) => setMotivo(e.target.value)}>
          {motivos.map((m) => (<option key={m} value={m}>{m === "todos" ? "todos os motivos" : m}</option>))}
        </select>
        <label className="chk"><input type="checkbox" checked={soEscalados} onChange={(e) => setSoEscalados(e.target.checked)} /> só escalados</label>
        <span className="tcount">{filtrados.length} de {contatos.length}</span>
      </div>
      <div className="tablewrap">
        <table className="tbl">
          <thead><tr><th>Contato</th><th>Motivo</th><th>UF</th><th>Escalou</th><th>Quando</th></tr></thead>
          <tbody>
            {filtrados.map((c) => (
              <tr key={c.id || c.email}>
                <td>
                  <div className="cname">{c.nome}</div>
                  <div className="cmeta">{c.email}{c.telefone ? ` · ${c.telefone}` : ""}</div>
                </td>
                <td>{c.motivo}</td>
                <td>{c.uf === "—" ? "—" : c.uf}</td>
                <td>{c.escalou ? <span className="tag esc">sim</span> : <span className="tag">não</span>}</td>
                <td className="cwhen">{dataCurta(c.criadoEm)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Conversas({ conversas }: { conversas: Conversa[] }) {
  const [aberta, setAberta] = useState<string | null>(null);
  if (!conversas.length) return <div className="empty">sem conversas — ligue o n8n</div>;
  const semTexto = conversas.every((c) => !c.pergunta && !c.resposta);
  return (
    <>
      {semTexto && (
        <div className="note warn">
          Não consegui mapear o texto automaticamente. Nós das execuções: <b>{Array.from(new Set(conversas.flatMap((c) => c.nodes))).join(", ") || "—"}</b>. Me diz qual nó tem a pergunta e qual tem a resposta que eu fecho a extração.
        </div>
      )}
      <div className="convlist">
        {conversas.map((c) => (
          <div className={`conv ${aberta === c.id ? "open" : ""}`} key={c.id} onClick={() => setAberta(aberta === c.id ? null : c.id)}>
            <div className="convtop">
              <span className="convwhen">{dataCurta(c.quando)}</span>
              <span className={`tag ${c.status === "success" ? "ok" : c.status === "error" ? "err" : ""}`}>{c.status || "?"}</span>
            </div>
            <div className="convq"><b>Usuário:</b> {c.pergunta || <i className="faint">—</i>}</div>
            <div className="convr"><b>Max:</b> {c.resposta || <i className="faint">—</i>}</div>
          </div>
        ))}
      </div>
    </>
  );
}

export default function Dashboard({ initial }: { initial: Metrics }) {
  const [m, setM] = useState<Metrics>(initial);
  const [loading, setLoading] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  function toggleTheme() {
    const t = theme === "dark" ? "light" : "dark";
    setTheme(t);
    document.documentElement.setAttribute("data-theme", t);
  }
  async function atualizar() {
    setLoading(true);
    try {
      const r = await fetch("/api/metrics", { cache: "no-store" });
      if (r.ok) setM(await r.json());
    } finally { setLoading(false); }
  }

  const stamp = new Date(m.atualizadoEm).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

  return (
    <div className="wrap">
      <header className="header">
        <div className="brand">
          <div className="logo">{[10, 18, 14, 24, 16, 8].map((h, i) => (<span key={i} style={{ height: `${h}px` }} />))}</div>
          <div>
            <h1>MAX <b>· ATENDIMENTO</b><span className="pill">v1</span></h1>
            <div className="sub">Volume · escalações · tópicos · custo · contatos · região · HubSpot + n8n</div>
          </div>
        </div>
        <div className="headright">
          <div className="stamp">{stamp}<small>{m.fontes.hubspot ? "hub ✓" : "hub seed"} · {m.fontes.n8n ? "n8n ✓" : "n8n off"}</small></div>
          <button className="iconbtn" onClick={toggleTheme} title="Tema">{theme === "dark" ? "☾" : "☀"}</button>
          <div className="live"><span className="dot" /> ao vivo</div>
          <button className="btn" onClick={atualizar} disabled={loading}>{loading ? "..." : "Atualizar"}</button>
        </div>
      </header>
      <hr className="hr" />

      {!m.fontes.hubspot && (
        <div className="note warn topnote">HubSpot em modo <b>seed</b> (dados de 03/06). Configure <span className="chip">HUBSPOT_TOKEN</span> no Vercel + Redeploy para contatos, região e tópicos ao vivo.</div>
      )}

      <section className="kpis">
        <div className="kpi lead">
          <div className="lab">Dúvidas · mensagens</div>
          <div className="num">{fmt(m.mensagens)}</div>
          <div className="cap">{m.fontes.n8n ? "execuções no n8n" : "ligue o n8n p/ contar"}</div>
        </div>
        <div className="kpi">
          <div className="lab">Conversas únicas</div>
          <div className="num">{fmt(m.conversasUnicas)}</div>
          <div className="cap">contatos no CRM{m.excluidosTeste ? ` · ${m.excluidosTeste} de teste fora` : ""}</div>
        </div>
        <div className="kpi">
          <div className="lab">Escaladas p/ humano</div>
          <div className="num">{fmt(m.escaladas)}</div>
          <div className="cap">taxa {pct(m.taxaEscalacao)} das únicas</div>
        </div>
        <div className="kpi">
          <div className="lab">Custo do LLM {m.custo.estimado ? "(est.)" : ""}</div>
          <div className="num">{usd(m.custo.totalUSD)}</div>
          <div className="cap">modelo {m.custo.modelo}</div>
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <div><div className="title">Principais Dúvidas</div><div className="cap">motivo do contato gravado pelo Max · <span className="chip">motivo_do_contato</span></div></div>
          <div className="right"><div className="rlab">tópicos</div><div className="rnum">{m.topicos.length}</div></div>
        </div>
        <Bars data={m.topicos} />
      </section>

      <div className="grid2">
        <section className="card">
          <div className="card-head">
            <div><div className="title">Por Região</div><div className="cap">UF do contato (normalizada) · <span className="chip">state</span></div></div>
            <div className="right"><div className="rlab">UFs</div><div className="rnum">{m.regioes.filter((r) => r.uf !== "—").length}</div></div>
          </div>
          <Regiao data={m.regioes} />
        </section>
        <section className="card">
          <div className="card-head">
            <div><div className="title">Escalações no Tempo</div><div className="cap">por dia · <span className="chip">data_de_escalacao</span></div></div>
            <div className="right"><div className="rlab">total</div><div className="rnum">{fmt(m.escaladas)}</div></div>
          </div>
          <Cols data={m.escalacoesPorDia} />
        </section>
      </div>

      <section className="card">
        <div className="card-head">
          <div><div className="title">Contatos atendidos</div><div className="cap">quem chegou ao Max · busca e filtros</div></div>
          <div className="right"><div className="rlab">total</div><div className="rnum">{m.contatos.length}</div></div>
        </div>
        <TabelaContatos contatos={m.contatos} />
      </section>

      <section className="card">
        <div className="card-head">
          <div><div className="title">Conversas (texto)</div><div className="cap">últimas execuções do n8n · pergunta e resposta</div></div>
          <div className="right"><div className="rlab">amostra</div><div className="rnum">{m.conversas.length}</div></div>
        </div>
        <Conversas conversas={m.conversas} />
      </section>

      <section className="card">
        <div className="card-head">
          <div><div className="title">Custo do LLM</div><div className="cap">estimativa a partir do volume × preço por token</div></div>
          <div className="right"><div className="rlab">acumulado</div><div className="rnum">{usd(m.custo.totalUSD)}</div></div>
        </div>
        <div className="costwrap">
          <div>
            <div className="costbig">{usd(m.custo.totalUSD)}</div>
            <div className="costsub">{m.custo.estimado ? "estimativa" : "real"} · modelo <b>{m.custo.modelo}</b></div>
          </div>
          <div>
            <div className="kv"><span className="muted">Mensagens (n8n)</span><span>{fmt(m.mensagens)}</span></div>
            <div className="kv"><span className="muted">Custo por mensagem</span><span>{usd(m.custo.porMensagemUSD)}</span></div>
            <div className="kv"><span className="muted">Conversas únicas (Hub)</span><span>{fmt(m.conversasUnicas)}</span></div>
          </div>
        </div>
        <div className={`note ${m.custo.totalUSD == null ? "warn" : ""}`}>{m.custo.nota}</div>
      </section>

      <div className="footer">Agent Max · Dashboard v1 · The Best Speaker 2026 · clique em Atualizar p/ recarregar</div>
    </div>
  );
}
