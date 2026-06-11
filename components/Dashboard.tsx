"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Metrics, TopicCount, DayCount, RegiaoCount, Contato } from "@/lib/types";
import { BR_W, BR_H, BR_STATES, BR_REGION_CENTROIDS, UF_TO_REGION, REGION_ORDER } from "@/lib/brazilMap";

function fmt(n: number | null | undefined) { if (n == null) return "—"; return n.toLocaleString("pt-BR"); }
function pct(n: number | null) { if (n == null) return "—"; return (n * 100).toFixed(1).replace(".", ",") + "%"; }
function usd(n: number | null, casas = 2) {
  if (n == null) return "—";
  const min = n !== 0 && Math.abs(n) < 0.01 ? 4 : casas;
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: min, maximumFractionDigits: Math.max(min, 6) });
}
function dataCurta(iso: string) {
  if (!iso) return "—";
  const d = new Date(iso); if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}
function iniciais(s: string) { return s.split(" ").filter(Boolean).slice(0, 2).map((x) => x[0]).join("").toUpperCase() || "?"; }

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
      <div className="cols">{data.map((d) => (<div className="col" key={d.date}><div className="colv">{d.value}</div><div className="colbar" style={{ height: `${(d.value / max) * 100}%` }} /></div>))}</div>
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
      const reg = UF_TO_REGION[r.uf]; if (reg) rc[reg] += r.value;
    }
    const t = REGION_ORDER.reduce((a, reg) => a + rc[reg], 0);
    return { regCount: rc, semUF: s, total: t };
  }, [regioes]);
  if (total === 0 && semUF === 0) return <div className="empty">sem região ainda — ligue o HubSpot</div>;
  const max = Math.max(1, ...REGION_ORDER.map((r) => regCount[r]));
  const color = (reg: string) => { const v = regCount[reg] || 0; if (v === 0) return "var(--panel-3)"; return `rgba(255,106,26,${0.3 + (v / max) * 0.7})`; };
  const pcOf = (v: number) => (total ? ((v / total) * 100).toFixed(1).replace(".", ",") : "0");
  return (
    <div className="regiao-grid">
      <div className="mapbox" ref={boxRef}>
        <div className="svgholder">
          <svg viewBox={`0 0 ${BR_W} ${BR_H}`} xmlns="http://www.w3.org/2000/svg">
            {BR_STATES.map((s) => (
              <path key={s.uf} d={s.d} className="st"
                style={{ fill: color(s.reg), filter: hover === s.reg ? "brightness(1.35)" : undefined }}
                onMouseMove={(e) => { const b = boxRef.current?.getBoundingClientRect(); if (b) setTip({ x: e.clientX - b.left, y: e.clientY - b.top, reg: s.reg }); setHover(s.reg); }}
                onMouseLeave={() => { setHover(null); setTip(null); }} />
            ))}
            {REGION_ORDER.map((reg) => { const c = BR_REGION_CENTROIDS[reg]; if (!c) return null; return (<g key={reg}><text className="reglabel" x={c.cx} y={c.cy - 3}>{reg}</text><text className="regnum" x={c.cx} y={c.cy + 12}>{regCount[reg]}</text></g>); })}
          </svg>
        </div>
        {tip && (<div className="tip on" style={{ left: Math.min(tip.x + 14, (boxRef.current?.clientWidth || 320) - 165), top: tip.y + 14 }}><b>{tip.reg}</b> · <span className="tnum">{regCount[tip.reg]}</span> {regCount[tip.reg] === 1 ? "candidato" : "candidatos"} · {pcOf(regCount[tip.reg])}%</div>)}
      </div>
      <div>
        <ul className="rank">
          {REGION_ORDER.slice().sort((a, b) => regCount[b] - regCount[a]).map((reg) => (
            <li key={reg} className={hover === reg ? "hot" : ""} onMouseEnter={() => setHover(reg)} onMouseLeave={() => setHover(null)}>
              <span className="sw" style={{ background: color(reg) }} /><span className="nm">{reg}</span><span className="v">{regCount[reg]}</span><span className="pc">{pcOf(regCount[reg])}%</span>
            </li>
          ))}
        </ul>
        <div className="note">27 estados agrupados nas 5 regiões · cor mais intensa = mais inscritos · cinza = sem inscrito ainda.<br />Sem UF informada: <b>{semUF} {semUF === 1 ? "contato" : "contatos"}</b> (não plotados).</div>
      </div>
    </div>
  );
}

/* ---------------- Drill-down das Principais Dúvidas ---------------- */
function DuvidasDrill({ contatos }: { contatos: Contato[] }) {
  const [sel, setSel] = useState(0);
  const grupos = useMemo(() => {
    const m = new Map<string, Contato[]>();
    for (const c of contatos) { if (!m.has(c.motivo)) m.set(c.motivo, []); m.get(c.motivo)!.push(c); }
    return [...m.entries()]
      .map(([label, people]) => ({ label, value: people.length, people: people.slice().sort((a, b) => b.criadoEm.localeCompare(a.criadoEm)) }))
      .sort((a, b) => b.value - a.value);
  }, [contatos]);
  if (!grupos.length) return <div className="empty">sem dados ainda</div>;
  const max = Math.max(...grupos.map((g) => g.value));
  const total = grupos.reduce((s, g) => s + g.value, 0);
  const cur = Math.min(sel, grupos.length - 1);
  const selG = grupos[cur];
  return (
    <div className="duv">
      <div className="bars">
        {grupos.map((g, idx) => (
          <div className={`bar-row click ${idx === cur ? "sel" : ""}`} key={g.label} onClick={() => setSel(idx)}>
            <div className="bl">{g.label}</div>
            <div className="bar-track"><div className="bar-fill" style={{ width: `${(g.value / max) * 100}%` }} /></div>
            <div className="bv">{g.value}</div>
            <div className="bp">{Math.round((g.value / total) * 100)}%</div>
          </div>
        ))}
      </div>
      <div className="people">
        <div className="phead"><b>{selG.value}</b> contato(s) em “{selG.label}”</div>
        <div className="plist">
          {selG.people.map((pp) => (
            <div className="prow" key={pp.id || pp.email}>
              <div className="av">{iniciais(pp.nome)}</div>
              <div><div className="pn">{pp.nome}</div><div className="pm">{dataCurta(pp.criadoEm)}</div></div>
              <div className="pmeta">{pp.uf !== "—" && <span className="ufb">{pp.uf}</span>}<span className={`escpill ${pp.escalou ? "on" : ""}`}>{pp.escalou ? "escalado" : "bot"}</span></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------------- Volume por período (chamaram × escalados) ---------------- */
function VolumePorDia({ contatos }: { contatos: Contato[] }) {
  const [modo, setModo] = useState<"dia" | "semana" | "mes">("mes");
  const [tip, setTip] = useState<{ x: number; y: number; label: string; cham: number; esc: number } | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const periodos = useMemo(() => {
    const m = new Map<string, { label: string; ord: string; cham: number; esc: number }>();
    for (const c of contatos) {
      const iso = c.criadoEm; if (!iso) continue;
      const d = new Date(iso); if (isNaN(d.getTime())) continue;
      let key: string, label: string;
      if (modo === "dia") { key = iso.slice(0, 10); label = `${iso.slice(8, 10)}/${iso.slice(5, 7)}`; }
      else if (modo === "mes") { key = iso.slice(0, 7); const [y, mo] = key.split("-"); label = `${mo}/${y.slice(2)}`; }
      else {
        const tmp = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
        const dow = (tmp.getUTCDay() + 6) % 7; tmp.setUTCDate(tmp.getUTCDate() - dow);
        key = tmp.toISOString().slice(0, 10); label = `${key.slice(8, 10)}/${key.slice(5, 7)}`;
      }
      if (!m.has(key)) m.set(key, { label, ord: key, cham: 0, esc: 0 });
      const o = m.get(key)!; o.cham++; if (c.escalou) o.esc++;
    }
    return [...m.values()].sort((a, b) => a.ord.localeCompare(b.ord));
  }, [contatos, modo]);
  if (!periodos.length) return <div className="empty">sem datas registradas ainda</div>;
  const vmax = Math.max(...periodos.map((p) => p.cham));
  return (
    <>
      <div className="vol-top">
        <div className="vol-legend"><span><i className="i-cham" /> chamaram</span><span><i className="i-esc" /> escalados p/ humano</span></div>
        <div className="seg">
          {([["dia", "Dia"], ["semana", "Semana"], ["mes", "Mês"]] as const).map(([k, lbl]) => (
            <button key={k} className={modo === k ? "on" : ""} onClick={() => setModo(k)}>{lbl}</button>
          ))}
        </div>
      </div>
      <div className="vol" ref={boxRef}>
        {periodos.map((p) => {
          const h = (p.cham / vmax) * 100;
          const escFrac = p.cham ? p.esc / p.cham : 0;
          return (
            <div className="vcol" key={p.ord}
              onMouseMove={(e) => { const b = boxRef.current?.getBoundingClientRect(); if (b) setTip({ x: e.clientX - b.left, y: e.clientY - b.top, label: p.label, cham: p.cham, esc: p.esc }); }}
              onMouseLeave={() => setTip(null)}>
              <span className="vtot">{p.cham}</span>
              <div className="vstack" style={{ height: `${h}%` }}>
                <div className="vseg-rest" style={{ flex: 1 - escFrac }} />
                <div className="vseg-esc" style={{ flex: escFrac }} />
              </div>
              <span className="vx">{p.label}</span>
            </div>
          );
        })}
        {tip && (
          <div className="vtip on" style={{ left: tip.x, top: tip.y - 10 }}>
            <b>{tip.label}</b> · <span className="tn">{tip.cham}</span> chamaram · <span className="tn">{tip.esc}</span> escalados ({tip.cham ? Math.round((tip.esc / tip.cham) * 100) : 0}%)
          </div>
        )}
      </div>
    </>
  );
}

/* ---------------- Análise do Max (IA, automática + persistida) ---------------- */
const ANALISE_VALIDADE_MS = 12 * 60 * 60 * 1000; // 12h

function relativo(ts: number | null) {
  if (!ts) return "—";
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return "agora";
  const m = Math.floor(s / 60); if (m < 60) return `há ${m} min`;
  const h = Math.floor(m / 60); if (h < 24) return `há ${h}h`;
  const d = Math.floor(h / 24); return `há ${d}d`;
}

function AnaliseMax() {
  const [analise, setAnalise] = useState<any>(null);
  const [base, setBase] = useState<any>(null);
  const [quando, setQuando] = useState<number | null>(null);
  const [gerando, setGerando] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");

  async function gerar() {
    setGerando(true); setErro("");
    try {
      const r = await fetch("/api/analise", { method: "POST" });
      const d = await r.json();
      if (!r.ok) { setErro(d.error || "Falha ao gerar análise."); return; }
      setAnalise(d.analise); setBase(d.base); setQuando(d.ts ?? Date.now());
    } catch (e: any) { setErro(String(e?.message ?? e)); }
    finally { setGerando(false); }
  }

  useEffect(() => {
    let vivo = true;
    (async () => {
      let ts: number | null = null;
      try {
        const r = await fetch("/api/analise");
        const d = await r.json();
        if (vivo && d.analise) { setAnalise(d.analise); setBase(d.base); setQuando(d.ts); ts = d.ts; }
      } catch { /* ignore */ }
      if (vivo) setCarregando(false);
      const vencida = !ts || Date.now() - ts > ANALISE_VALIDADE_MS;
      if (vivo && vencida) gerar();
    })();
    return () => { vivo = false; };
  }, []);

  const sevClass = (s: string) => (s === "alta" ? "bad" : "warn");
  const semAnalise = !analise;

  return (
    <div className="an-panel">
      <div className="an-head">
        <div>
          <div className="an-title">Análise do Max</div>
          <div className="an-cap">
            diagnóstico por IA · atualiza sozinho
            {analise && !gerando && <> · última {relativo(quando)}</>}
            {gerando && <> · <span className="an-live">atualizando…</span></>}
          </div>
        </div>
        {analise && !gerando && (
          <button className="an-link" onClick={gerar} title="Gerar agora">↻ atualizar</button>
        )}
      </div>

      {(carregando || (gerando && semAnalise)) && (
        <div className="an-load">
          <div className="an-skel" style={{ width: "62%" }} /><div className="an-skel" style={{ width: "92%" }} /><div className="an-skel" style={{ width: "78%" }} /><div className="an-skel" style={{ width: "70%" }} />
          <div className="an-foot">{gerando ? "Lendo conversas e métricas e analisando…" : "Carregando última análise…"}</div>
        </div>
      )}

      {erro && semAnalise && <div className="an-erro">{erro}</div>}

      {analise && (
        <div className="an-result" style={gerando ? { opacity: 0.55 } : undefined}>
          <div className="an-score">
            <div><div className="an-big">{typeof analise.nota === "number" ? analise.nota.toLocaleString("pt-BR") : "—"}</div><div className="an-label">nota geral</div></div>
            <div><div className="an-verdict">{analise.verdict}</div><div className="an-sub">{analise.resumo}</div></div>
          </div>
          {Array.isArray(analise.fortes) && analise.fortes.length > 0 && (
            <div className="an-sec"><h3><span className="an-dot good" /> Pontos fortes</h3>
              {analise.fortes.map((it: any, i: number) => (<div className="an-item good" key={i}><b>{it.titulo}</b> {it.detalhe}{it.evidencia && <span className="an-ev">{it.evidencia}</span>}</div>))}
            </div>
          )}
          {Array.isArray(analise.problemas) && analise.problemas.length > 0 && (
            <div className="an-sec"><h3><span className="an-dot bad" /> Problemas encontrados</h3>
              {analise.problemas.map((it: any, i: number) => (<div className={`an-item ${sevClass(it.severidade)}`} key={i}><b>{it.titulo}</b> {it.detalhe}{it.evidencia && <span className="an-ev">{it.evidencia}</span>}</div>))}
            </div>
          )}
          {Array.isArray(analise.sugestoes) && analise.sugestoes.length > 0 && (
            <div className="an-sec"><h3><span className="an-dot tip" /> Sugestões de melhoria</h3>
              {analise.sugestoes.map((it: any, i: number) => (<div className="an-item tip" key={i}><b>{it.titulo}</b> {it.detalhe}</div>))}
            </div>
          )}
          {base && <div className="an-foot">Baseado em {base.conversas} contatos, {base.escaladas} escalações e {base.amostra} conversas{base.corpus ? ` (corpus de ${base.corpus} guardadas)` : ""} · fonte: {base.fonte} · modelo {base.modelo}. Gerado por IA — revise antes de agir.</div>}
        </div>
      )}
    </div>
  );
}

/* ---------------- Atendimentos (contatos + perfil + conversa) ---------------- */
type ConvUI = { id: string; ts: number; pergunta: string; resposta: string; contactId: string; whatsapp: string; nome: string; motivo: string };
function digitsTail(s: string) { return (s || "").replace(/\D/g, "").slice(-8); }

function Atendimentos({ contatos, excluidosTeste, conversas }: { contatos: Contato[]; excluidosTeste: number; conversas: ConvUI[] }) {
  const [sel, setSel] = useState(0);
  const [q, setQ] = useState("");
  const escaladosN = useMemo(() => contatos.filter((c) => c.escalou).length, [contatos]);
  const ufsN = useMemo(() => new Set(contatos.map((c) => c.uf).filter((u) => u !== "—")).size, [contatos]);
  const filtrados = useMemo(() => {
    const t = q.trim().toLowerCase();
    return contatos.map((c, i) => ({ c, i })).filter(({ c }) => !t || `${c.nome} ${c.email} ${c.telefone} ${c.uf}`.toLowerCase().includes(t));
  }, [contatos, q]);
  if (!contatos.length) return <div className="empty">sem contatos ainda — ligue o HubSpot</div>;
  const cur = Math.min(sel, contatos.length - 1);
  const selC = contatos[cur];
  const regiao = selC.uf !== "—" ? (UF_TO_REGION[selC.uf] || "—") : "—";
  const thread = useMemo(() => {
    const cid = selC.id;
    const tail = digitsTail(selC.telefone);
    return conversas
      .filter((cv) => (cid && cv.contactId === cid) || (tail && cv.whatsapp && digitsTail(cv.whatsapp) === tail))
      .sort((a, b) => a.ts - b.ts);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversas, selC.id, selC.telefone]);
  return (
    <>
      <div className="summ">
        <div className="scard"><div className="v">{contatos.length}</div><div className="l">contatos</div></div>
        <div className="scard accent"><div className="v">{escaladosN}</div><div className="l">escalados</div></div>
        <div className="scard"><div className="v">{ufsN}</div><div className="l">UFs</div></div>
        <div className="scard"><div className="v">{excluidosTeste}</div><div className="l">de teste fora</div></div>
      </div>
      <div className="split">
        <div className="master">
          <div className="msearch"><input placeholder="buscar contato…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <div className="mlist">
            {filtrados.map(({ c, i }) => (
              <div className={`crow ${i === cur ? "sel" : ""}`} key={c.id || c.email || i} onClick={() => setSel(i)}>
                <div className="av">{iniciais(c.nome)}</div>
                <div className="txt"><div className="nm">{c.nome}</div><div className="pv">{c.motivo}</div></div>
                <div className="meta"><span className={`escdot ${c.escalou ? "on" : ""}`} title={c.escalou ? "escalado" : ""} /></div>
              </div>
            ))}
          </div>
        </div>
        <div className="detail">
          <div className="dhead">
            <div className="av">{iniciais(selC.nome)}</div>
            <div><div className="hn">{selC.nome}</div><div className="hm">{[selC.telefone, selC.email].filter(Boolean).join(" · ") || "—"}</div></div>
            <div className="tags">{selC.uf !== "—" && <span className="tg uf">{selC.uf}</span>}{selC.escalou && <span className="tg esc">escalado</span>}</div>
          </div>
          <div className="pgrid">
            <div className="pf"><div className="pl">Motivo do contato</div><div className="pv2">{selC.motivo}</div></div>
            <div className="pf"><div className="pl">Atendimento humano</div><div className="pv2">{selC.escalou ? "sim — escalado" : "não — resolvido pelo bot"}</div></div>
            <div className="pf"><div className="pl">UF</div><div className="pv2">{selC.uf}</div></div>
            <div className="pf"><div className="pl">Região</div><div className="pv2">{regiao}</div></div>
            <div className="pf"><div className="pl">Telefone</div><div className="pv2">{selC.telefone || "—"}</div></div>
            <div className="pf"><div className="pl">Email</div><div className="pv2 ellip">{selC.email || "—"}</div></div>
            <div className="pf wide"><div className="pl">Primeiro contato</div><div className="pv2">{dataCurta(selC.criadoEm)}</div></div>
          </div>
          <div className="conv">
            <div className="conv-h">Conversa{thread.length ? <span className="conv-n">{thread.length} troca(s)</span> : null}</div>
            {thread.length ? (
              <div className="thread">
                {thread.map((cv) => (
                  <div className="exch" key={cv.id}>
                    {cv.pergunta ? <div className="bubble user"><div className="brole">Cliente</div><div className="btext">{cv.pergunta}</div></div> : null}
                    {cv.resposta ? <div className="bubble bot"><div className="brole">Max</div><div className="btext">{cv.resposta}</div></div> : null}
                  </div>
                ))}
              </div>
            ) : (
              <div className="conv-empty">
                Sem conversa vinculada a este contato ainda.
                {conversas.length > 0
                  ? ` Há ${conversas.length} conversa(s) capturada(s) no Redis, mas falta o ingest enviar o contactId (ou o whatsapp) pra amarrar ao contato.`
                  : " Nenhuma conversa capturada ainda — verifique se o nó HTTP do ingest está disparando."}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

export default function Dashboard({ initial }: { initial: Metrics }) {
  const [m, setM] = useState<Metrics>(initial);
  const [convs, setConvs] = useState<ConvUI[]>([]);
  const [loading, setLoading] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  function toggleTheme() { const t = theme === "dark" ? "light" : "dark"; setTheme(t); document.documentElement.setAttribute("data-theme", t); }
  async function carregarConversas() { try { const r = await fetch("/api/conversas", { cache: "no-store" }); if (r.ok) { const j = await r.json(); setConvs(j.conversas || []); } } catch {} }
  async function atualizar() { setLoading(true); try { const r = await fetch("/api/metrics", { cache: "no-store" }); if (r.ok) setM(await r.json()); await carregarConversas(); } finally { setLoading(false); } }

  // Aquece o cache no primeiro acesso: se o volume do n8n não veio (cache vazio),
  // dispara a leitura ao vivo uma vez em segundo plano (sem o usuário clicar).
  const aqueceu = useRef(false);
  useEffect(() => {
    if (aqueceu.current) return;
    aqueceu.current = true;
    carregarConversas();
    if (initial.mensagens == null && initial.fontes.n8n) atualizar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stamp = new Date(m.atualizadoEm).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const comRegiao = m.regioes.filter((r) => r.uf !== "—").reduce((s, r) => s + r.value, 0);

  return (
    <div className="wrap">
      <header className="header">
        <div className="brand">
          <div className="logo">{[10, 18, 14, 24, 16, 8].map((h, i) => (<span key={i} style={{ height: `${h}px` }} />))}</div>
          <div><h1>MAX <b>· ATENDIMENTO</b><span className="pill">v1</span></h1><div className="sub">Volume · escalações · tópicos · custo · atendimentos · região · HubSpot + n8n</div></div>
        </div>
        <div className="headright">
          <div className="stamp">{stamp}<small>{m.fontes.hubspot ? "hub ✓" : "hub seed"} · {m.fontes.n8n ? "n8n ✓" : "n8n off"}</small></div>
          <button className="iconbtn" onClick={toggleTheme} title="Tema">{theme === "dark" ? "☾" : "☀"}</button>
          <div className="live"><span className="dot" /> ao vivo</div>
          <button className="btn" onClick={atualizar} disabled={loading}>{loading ? "..." : "Atualizar"}</button>
        </div>
      </header>
      <hr className="hr" />

      {!m.fontes.hubspot && (<div className="note warn topnote">HubSpot em modo <b>seed</b> (dados de 03/06). Configure <span className="chip">HUBSPOT_TOKEN</span> no Vercel + Redeploy para atendimentos, região e tópicos ao vivo.</div>)}

      <section className="kpis">
        <div className="kpi lead"><div className="lab">Dúvidas · mensagens</div><div className="num">{fmt(m.mensagens)}</div><div className="cap">{m.fontes.n8n ? "execuções no n8n" : "ligue o n8n p/ contar"}</div></div>
        <div className="kpi"><div className="lab">Conversas únicas</div><div className="num">{fmt(m.conversasUnicas)}</div><div className="cap">contatos no CRM{m.excluidosTeste ? ` · ${m.excluidosTeste} de teste fora` : ""}</div></div>
        <div className="kpi"><div className="lab">Escaladas p/ humano</div><div className="num">{fmt(m.escaladas)}</div><div className="cap">taxa {pct(m.taxaEscalacao)} das únicas</div></div>
        <div className="kpi"><div className="lab">Custo do LLM {m.custo.estimado ? "(est.)" : ""}</div><div className="num">{usd(m.custo.totalUSD)}</div><div className="cap">modelo {m.custo.modelo}</div></div>
      </section>

      <section className="card">
        <div className="card-head"><div><div className="title">Principais Dúvidas</div><div className="cap">clique numa dúvida pra ver os contatos · <span className="chip">motivo_do_contato</span></div></div><div className="right"><div className="rlab">tópicos</div><div className="rnum">{m.topicos.length}</div></div></div>
        {m.contatos.length ? <DuvidasDrill contatos={m.contatos} /> : <Bars data={m.topicos} />}
      </section>

      <section className="card">
        <div className="card-head"><div><div className="title">Representação por Região</div><div className="cap">candidatos por região · passe o mouse no mapa · <span className="chip">state → região</span></div></div><div className="right"><div className="rlab">com região</div><div className="rnum">{fmt(comRegiao)}</div></div></div>
        <BrazilMap regioes={m.regioes} />
      </section>

      <section className="card">
        <div className="card-head"><div><div className="title">Volume por dia</div><div className="cap">quantos chamaram o Max e quantos foram escalados · <span className="chip">createdate</span></div></div><div className="right"><div className="rlab">escalados</div><div className="rnum">{fmt(m.escaladas)}</div></div></div>
        <VolumePorDia contatos={m.contatos} />
      </section>

      <div className="grid2">
        <section className="card">
          <div className="card-head"><div><div className="title">Escalações no Tempo</div><div className="cap">por dia · <span className="chip">data_de_escalacao</span></div></div><div className="right"><div className="rlab">total</div><div className="rnum">{fmt(m.escaladas)}</div></div></div>
          <Cols data={m.escalacoesPorDia} />
        </section>
        <section className="card">
          <div className="card-head"><div><div className="title">Motivos da Escalação</div><div className="cap">por que foi pra humano · <span className="chip">motivo_da_escalacao</span></div></div></div>
          <Bars data={m.motivosEscalacao} />
        </section>
      </div>

      <section className="card">
        <div className="card-head"><div><div className="title">Atendimentos</div><div className="cap">contatos do Max · clique pra ver o perfil</div></div><div className="right"><div className="rlab">contatos</div><div className="rnum">{m.contatos.length}</div></div></div>
        <AnaliseMax />
        <Atendimentos contatos={m.contatos} excluidosTeste={m.excluidosTeste} conversas={convs} />
      </section>

      <section className="card">
        <div className="card-head"><div><div className="title">Custo do LLM</div><div className="cap">tokens reais lidos do n8n × preço do modelo</div></div><div className="right"><div className="rlab">acumulado</div><div className="rnum">{usd(m.custo.totalUSD)}</div></div></div>
        <div className="costwrap">
          <div><div className="costbig">{usd(m.custo.totalUSD)}</div><div className="costsub">{m.custo.estimado ? "estimativa" : "real"} · modelo <b>{m.custo.modelo}</b></div></div>
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
