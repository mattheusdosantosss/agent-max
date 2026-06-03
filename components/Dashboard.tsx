"use client";

import { useState } from "react";
import type { Metrics, TopicCount, DayCount } from "@/lib/types";

function fmt(n: number | null | undefined) {
  if (n == null) return "—";
  return n.toLocaleString("pt-BR");
}
function pct(n: number | null) {
  if (n == null) return "—";
  return (n * 100).toFixed(1).replace(".", ",") + "%";
}
function usd(n: number | null) {
  if (n == null) return "—";
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
          <div className="bar-track">
            <div className="bar-fill" style={{ width: `${(d.value / max) * 100}%` }} />
          </div>
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
        {data.map((d) => (
          <span key={d.date}>{d.date.slice(8, 10)}/{d.date.slice(5, 7)}</span>
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
    } finally {
      setLoading(false);
    }
  }

  const stamp = new Date(m.atualizadoEm).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
  });

  return (
    <div className="wrap">
      <header className="header">
        <div className="brand">
          <div className="logo">
            {[10, 18, 14, 24, 16, 8].map((h, i) => (
              <span key={i} style={{ height: `${h}px` }} />
            ))}
          </div>
          <div>
            <h1>
              MAX <b>· ATENDIMENTO</b>
              <span className="pill">v1</span>
            </h1>
            <div className="sub">
              Volume · escalações · tópicos · custo · HubSpot + n8n ao vivo
            </div>
          </div>
        </div>
        <div className="headright">
          <div className="stamp">
            {stamp}
            <small>
              {m.fontes.hubspot ? "hub ✓" : "hub seed"} ·{" "}
              {m.fontes.n8n ? "n8n ✓" : "n8n off"}
            </small>
          </div>
          <button className="iconbtn" onClick={toggleTheme} title="Tema">
            {theme === "dark" ? "☾" : "☀"}
          </button>
          <div className="live">
            <span className="dot" /> ao vivo
          </div>
          <button className="btn" onClick={atualizar} disabled={loading}>
            {loading ? "..." : "Atualizar"}
          </button>
        </div>
      </header>
      <hr className="hr" />

      {/* KPIs - métricas 1, 2, 4 */}
      <section className="kpis">
        <div className="kpi lead">
          <div className="lab">Dúvidas · mensagens</div>
          <div className="num">{fmt(m.mensagens)}</div>
          <div className="cap">{m.fontes.n8n ? "execuções no n8n" : "ligue o n8n p/ contar"}</div>
        </div>
        <div className="kpi">
          <div className="lab">Conversas únicas</div>
          <div className="num">{fmt(m.conversasUnicas)}</div>
          <div className="cap">contatos identificados no CRM</div>
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

      {/* Métrica 3 - principais dúvidas */}
      <section className="card">
        <div className="card-head">
          <div>
            <div className="title">Principais Dúvidas</div>
            <div className="cap">
              motivo do contato gravado pelo Max · <span className="chip">motivo_do_contato</span>
            </div>
          </div>
          <div className="right">
            <div className="rlab">tópicos</div>
            <div className="rnum">{m.topicos.length}</div>
          </div>
        </div>
        <Bars data={m.topicos} />
      </section>

      {/* Métrica 2 - escalações no tempo + motivos */}
      <div className="grid2">
        <section className="card">
          <div className="card-head">
            <div>
              <div className="title">Escalações no Tempo</div>
              <div className="cap">
                por dia · <span className="chip">data_de_escalacao</span>
              </div>
            </div>
            <div className="right">
              <div className="rlab">total</div>
              <div className="rnum">{fmt(m.escaladas)}</div>
            </div>
          </div>
          <Cols data={m.escalacoesPorDia} />
        </section>

        <section className="card">
          <div className="card-head">
            <div>
              <div className="title">Motivos da Escalação</div>
              <div className="cap">
                por que foi pra humano · <span className="chip">motivo_da_escalacao</span>
              </div>
            </div>
          </div>
          <Bars data={m.motivosEscalacao} />
        </section>
      </div>

      {/* Métrica 4 - custo */}
      <section className="card">
        <div className="card-head">
          <div>
            <div className="title">Custo do LLM</div>
            <div className="cap">estimativa a partir do volume × preço por token</div>
          </div>
          <div className="right">
            <div className="rlab">acumulado</div>
            <div className="rnum">{usd(m.custo.totalUSD)}</div>
          </div>
        </div>
        <div className="costwrap">
          <div>
            <div className="costbig">{usd(m.custo.totalUSD)}</div>
            <div className="costsub">
              {m.custo.estimado ? "estimativa" : "real"} · modelo{" "}
              <b>{m.custo.modelo}</b>
            </div>
          </div>
          <div>
            <div className="kv">
              <span className="muted">Mensagens (n8n)</span>
              <span>{fmt(m.mensagens)}</span>
            </div>
            <div className="kv">
              <span className="muted">Custo por mensagem</span>
              <span>{usd(m.custo.porMensagemUSD)}</span>
            </div>
            <div className="kv">
              <span className="muted">Conversas únicas (Hub)</span>
              <span>{fmt(m.conversasUnicas)}</span>
            </div>
          </div>
        </div>
        <div className={`note ${m.custo.totalUSD == null ? "warn" : ""}`}>{m.custo.nota}</div>
      </section>

      <div className="footer">
        Agent Max · Dashboard v1 · The Best Speaker 2026 · clique em Atualizar p/ recarregar
      </div>
    </div>
  );
}
