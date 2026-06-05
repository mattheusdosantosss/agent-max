"use client";

import { useMemo, useRef, useState, Fragment } from "react";
import type { Metrics, TopicCount, DayCount, RegiaoCount, Contato, Conversa } from "@/lib/types";
import { BR_W, BR_H, BR_STATES, BR_REGION_CENTROIDS, UF_TO_REGION, REGION_ORDER } from "@/lib/brazilMap";

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
function iniciais(s: string) {
  return s.split(" ").filter(Boolean).slice(0, 2).map((x) => x[0]).join("").toUpperCase() || "?";
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
      <div className="colx">{data.map((d) => (<span key={d.date}>{d.date.slice(8, 10)}/{d.date.slice(5, 7)}</span>))}</div>
    </>
  );
}

/* ---------------- Mapa do Brasil por região ---------------- */
function BrazilMap({ regioes }: { regioes: RegiaoCount[] }) {
  const [hover, setHover] = useState<string | null>(null);
  const [tip, setTip] = useState<{ x: number; y: number; reg: string } | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  const { regCount, semUF, total } = useMemo(() => {
    const rc: Record<string, number> = { Norte: 0, Nordeste: 0, "Centro-Oeste": 0, Sudeste: 0, Sul: 0 };
    let s = 0;
    for (const r of regioes) {
      if (r.uf === "—") { s += r.value; continue; }
      const reg = UF_TO_REGION[r.uf];
      if (reg) rc[reg] += r.value;
    }
    const t = REGION_ORDER.reduce((a, reg) => a + rc[reg], 0);
    return { regCount: rc, semUF: s, total: t };
  }, [regioes]);

  if (total === 0 && semUF === 0) return <div className="empty">sem região ainda — ligue o HubSpot</div>;

  const max = Math.max(1, ...REGION_ORDER.map((r) => regCount[r]));
  const color = (reg: string) => {
    const v = regCount[reg] || 0;
    if (v === 0) return "var(--panel-3)";
    return `rgba(255,106,26,${0.3 + (v / max) * 0.7})`;
  };
  const pcOf = (v: number) => (total ? ((v / total) * 100).toFixed(1).replace(".", ",") : "0");

  return (
    <div className="regiao-grid">
      <div className="mapbox" ref={boxRef}>
        <div className="svgholder">
          <svg viewBox={`0 0 ${BR_W} ${BR_H}`} xmlns="http://www.w3.org/2000/svg">
            {BR_STATES.map((s) => (
              <path
                key={s.uf}
                d={s.d}
                className="st"
                style={{ fill: color(s.reg), filter: hover === s.reg ? "brightness(1.35)" : undefined }}
                onMouseMove={(e) => {
                  const b = boxRef.current?.getBoundingClientRect();
                  if (b) setTip({ x: e.clientX - b.left, y: e.clientY - b.top, reg: s.reg });
                  setHover(s.reg);
                }}
                onMouseLeave={() => { setHover(null); setTip(null); }}
              />
            ))}
            {REGION_ORDER.map((reg) => {
              const c = BR_REGION_CENTROIDS[reg];
              if (!c) return null;
              return (
                <g key={reg}>
                  <text className="reglabel" x={c.cx} y={c.cy - 3}>{reg}</text>
                  <text className="regnum" x={c.cx} y={c.cy + 12}>{regCount[reg]}</text>
                </g>
              );
            })}
          </svg>
        </div>
        {tip && (
          <div className="tip on" style={{ left: Math.min(tip.x + 14, (boxRef.current?.clientWidth || 320) - 165), top: tip.y + 14 }}>
            <b>{tip.reg}</b> · <span className="tnum">{regCount[tip.reg]}</span> {regCount[tip.reg] === 1 ? "candidato" : "candidatos"} · {pcOf(regCount[tip.reg])}%
          </div>
        )}
      </div>
      <div>
        <ul className="rank">
          {REGION_ORDER.slice().sort((a, b) => regCount[b] - regCount[a]).map((reg) => (
            <li key={reg} className={hover === reg ? "hot" : ""} onMouseEnter={() => setHover(reg)} onMouseLeave={() => setHover(null)}>
              <span className="sw" style={{ background: color(reg) }} />
              <span className="nm">{reg}</span>
              <span className="v">{regCount[reg]}</span>
              <span className="pc">{pcOf(regCount[reg])}%</span>
            </li>
          ))}
        </ul>
        <div className="note">
          27 estados agrupados nas 5 regiões · cor mais intensa = mais inscritos · cinza = sem inscrito ainda.<br />
          Sem UF informada: <b>{semUF} {semUF === 1 ? "contato" : "contatos"}</b> (não plotados).
        </div>
      </div>
    </div>
  );
}

/* ---------------- Tabela de contatos (compacta) ---------------- */
function TabelaContatos({ contatos, excluidosTeste }: { contatos: Contato[]; excluidosTeste: number }) {
  const [q, setQ] = useState("");
  const [motivo, setMotivo] = useState("todos");
  const [soEscalados, setSoEscalados] = useState(false);
  const motivos = useMemo(() => ["todos", ...Array.from(new Set(contatos.map((c) => c.motivo)))], [contatos]);
  const escaladosN = useMemo(() => contatos.filter((c) => c.escalou).length, [contatos]);
  const ufsN = useMemo(() => new Set(contatos.map((c) => c.uf).filter((u) => u !== "—")).size, [contatos]);
  const filtrados = useMemo(() => {
    const t = q.trim().toLowerCase();
    return contatos.filter((c) => {
      if (soEscalados && !c.escalou) return false;
      if (motivo !== "todos" && c.motivo !== motivo) return false;
      if (t && !`${c.nome} ${c.email} ${c.telefone} ${c.uf}`.toLowerCase().includes(t)) return false;
      return true;
    });
  }, [contatos, q, motivo, soEscalados]);

  if (!contatos.length) return <div className="empty">sem contatos ainda — ligue o HubSpot</div>;

  return (
    <>
      <div className="summ">
        <div className="scard"><div className="v">{contatos.length}</div><div className="l">contatos</div></div>
        <div className="scard accent"><div className="v">{escaladosN}</div><div className="l">escalados</div></div>
        <div className="scard"><div className="v">{ufsN}</div><div className="l">UFs</div></div>
        <div className="scard"><div className="v">{excluidosTeste}</div><div className="l">de teste fora</div></div>
      </div>
      <div className="tbar">
        <input className="inp" placeholder="buscar nome, email, telefone, UF…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="sel" value={motivo} onChange={(e) => setMotivo(e.target.value)}>
          {motivos.map((mm) => (<option key={mm} value={mm}>{mm === "todos" ? "todos os motivos" : mm}</option>))}
        </select>
        <label className="chk"><input type="checkbox" checked={soEscalados} onChange={(e) => setSoEscalados(e.target.checked)} /> só escalados</label>
        <span className="tcount">{filtrados.length} de {contatos.length}</span>
      </div>
      <div className="tablewrap"><div className="tscroll">
        <table className="tbl"><thead><tr><th>Contato</th><th>Motivo</th><th>UF</th><th>Escalou</th><th>Quando</th></tr></thead>
          <tbody>
            {filtrados.map((c) => (
              <tr className="row" key={c.id || c.email}>
                <td><div className="who"><div className="av">{iniciais(c.nome)}</div><div className="txt"><div className="cname">{c.nome}</div><div className="cmeta">{c.email || "—"}</div></div></div></td>
                <td className="motivo">{c.motivo}</td>
                <td><span className="ufbadge">{c.uf}</span></td>
                <td><span className={`dot ${c.escalou ? "s" : "n"}`}><i />{c.escalou ? "sim" : "não"}</span></td>
                <td className="cwhen">{dataCurta(c.criadoEm)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div></div>
    </>
  );
}

/* ---------------- Conversas (tabela) ---------------- */
function Conversas({ conversas }: { conversas: Conversa[] }) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  if (!conversas.length) return <div className="empty">sem conversas — ligue o n8n</div>;
  const semTexto = conversas.every((c) => !c.pergunta && !c.resposta);
  const nodes = Array.from(new Set(conversas.flatMap((c) => c.nodes))).join(", ");
  const toggle = (id: string) => setOpen((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  return (
    <>
      {semTexto && (
        <div className="note warn">
          Não consegui mapear o texto automaticamente. Nós das execuções: <b>{nodes || "—"}</b>. Me diga qual nó tem a pergunta e qual tem a resposta que eu fecho a extração.
        </div>
      )}
      <div className="tablewrap"><div className="tscroll">
        <table className="tbl convtbl">
          <colgroup><col className="c1" /><col className="c2" /><col className="c3" /></colgroup>
          <thead><tr><th>Conversa</th><th>Status</th><th>Quando</th></tr></thead>
          <tbody>
            {conversas.map((c) => (
              <Fragment key={c.id}>
                <tr className={`row ${open.has(c.id) ? "open" : ""}`} onClick={() => toggle(c.id)}>
                  <td>
                    <div className="who">
                      <div className="av chat">&#128172;</div>
                      <div className="txt">
                        <div className="cname">{c.pergunta || "—"}</div>
                        <div className="cmeta">Max: {c.resposta || "—"}</div>
                      </div>
                    </div>
                  </td>
                  <td><span className={`stat ${c.status === "success" ? "ok" : c.status === "error" ? "err" : ""}`}>{c.status || "?"}</span><span className="chev">&#9656;</span></td>
                  <td className="cwhen">{dataCurta(c.quando)}</td>
                </tr>
                {open.has(c.id) && (
                  <tr className="detail"><td colSpan={3}><div className="inner">
                    <div className="msg u"><span className="tag">Usuário</span><span>{c.pergunta || "—"}</span></div>
                    <div className="msg b"><span className="tag">Max</span><span>{c.resposta || "—"}</span></div>
                  </div></td></tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div></div>
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
  const comRegiao = m.regioes.filter((r) => r.uf !== "—").reduce((s, r) => s + r.value, 0);

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

      <section className="card">
        <div className="card-head">
          <div><div className="title">Representação por Região</div><div className="cap">candidatos por região · passe o mouse no mapa · <span className="chip">state → região</span></div></div>
          <div className="right"><div className="rlab">com região</div><div className="rnum">{fmt(comRegiao)}</div></div>
        </div>
        <BrazilMap regioes={m.regioes} />
      </section>

      <div className="grid2">
        <section className="card">
          <div className="card-head">
            <div><div className="title">Escalações no Tempo</div><div className="cap">por dia · <span className="chip">data_de_escalacao</span></div></div>
            <div className="right"><div className="rlab">total</div><div className="rnum">{fmt(m.escaladas)}</div></div>
          </div>
          <Cols data={m.escalacoesPorDia} />
        </section>
        <section className="card">
          <div className="card-head">
            <div><div className="title">Motivos da Escalação</div><div className="cap">por que foi pra humano · <span className="chip">motivo_da_escalacao</span></div></div>
          </div>
          <Bars data={m.motivosEscalacao} />
        </section>
      </div>

      <section className="card">
        <div className="card-head">
          <div><div className="title">Contatos atendidos</div><div className="cap">quem chegou ao Max · busca e filtros</div></div>
          <div className="right"><div className="rlab">total</div><div className="rnum">{m.contatos.length}</div></div>
        </div>
        <TabelaContatos contatos={m.contatos} excluidosTeste={m.excluidosTeste} />
      </section>

      <section className="card">
        <div className="card-head">
          <div><div className="title">Conversas</div><div className="cap">últimas execuções do n8n · clique pra abrir a conversa</div></div>
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
