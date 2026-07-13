"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import {
  TrendingUp, TrendingDown, Target, Zap, Bot,
  RefreshCw, ChevronDown, ChevronUp, Trophy, Flame,
  BarChart2, Activity, Filter, AlertTriangle,
} from "lucide-react";

// ── Tipo normalizado ───────────────────────────────────────────────────────────

interface FinTrade {
  id: string;
  simbolo: string;
  category: "sinais" | "futures_ia" | "daytrade" | "futuros" | "scalp" | "bot";
  subcategory: string;
  direction: "LONG" | "SHORT";
  pnl_brl: number | null;
  pnl_pct: number | null;
  score: number | null;
  leverage: number | null;
  status: string;
  registrado_em: string;
}

interface Stats {
  total: number;
  wins: number;
  losses: number;
  expirados: number;
  winRate: number;
  avgGain: number;
  avgLoss: number;
  payback: number;
  profitFactor: number;
  expectancy: number;
  bestPct: number;
  worstPct: number;
  totalPnlBrl: number;
  totalPnlPct: number;
  maxDrawdown: number;
}

// ── Loaders ───────────────────────────────────────────────────────────────────

function loadSinaisHist(): FinTrade[] {
  try {
    const all: any[] = JSON.parse(localStorage.getItem("allwin_trade_hist") ?? "[]");
    return all
      .filter(e => e.source === "sinais" && e.status !== "aberto")
      .map(e => {
        let pnl_pct: number | null = null;
        if (e.preco_entrada) {
          if (e.status === "sl")  pnl_pct = (e.sl  - e.preco_entrada) / e.preco_entrada * 100;
          if (e.status === "tp1") pnl_pct = (e.tp1 - e.preco_entrada) / e.preco_entrada * 100;
          if (e.status === "tp2") pnl_pct = (e.tp2 - e.preco_entrada) / e.preco_entrada * 100;
          if (e.status === "tp3") pnl_pct = (e.tp3 - e.preco_entrada) / e.preco_entrada * 100;
        }
        return {
          id: e.id, simbolo: e.simbolo, category: "sinais" as const,
          subcategory: "Sinais IA", direction: "LONG" as const,
          pnl_brl: null, pnl_pct, score: e.score ?? null, leverage: null,
          status: e.status, registrado_em: e.registrado_em,
        } satisfies FinTrade;
      });
  } catch { return []; }
}

function loadFuturesIAHist(): FinTrade[] {
  try {
    const all: any[] = JSON.parse(localStorage.getItem("allwin_trade_hist") ?? "[]");
    return all
      .filter(e => e.source === "futures_ia" && e.status !== "aberto")
      .map(e => {
        const lev = e.leverage ?? 1;
        let pnl_pct: number | null = null;
        if (e.status === "tp") pnl_pct =  e.tp_pct * lev;
        if (e.status === "sl") pnl_pct = -e.sl_pct * lev;
        return {
          id: e.id, simbolo: e.simbolo, category: "futures_ia" as const,
          subcategory: "Futuros IA", direction: (e.direction ?? "LONG") as "LONG" | "SHORT",
          pnl_brl: null, pnl_pct, score: e.score ?? null, leverage: lev,
          status: e.status, registrado_em: e.registrado_em,
        } satisfies FinTrade;
      });
  } catch { return []; }
}

function loadDaytradeWallets(): FinTrade[] {
  try {
    const wallets: Record<string, any> = JSON.parse(
      localStorage.getItem("allwin_dt_wallets_v2") ?? "{}"
    );
    const out: FinTrade[] = [];
    for (const [perfilId, w] of Object.entries(wallets)) {
      const sub = w.perfil_nome ?? perfilId;
      for (const t of (w.trades ?? []) as any[]) {
        if (t.tipo !== "V") continue;
        out.push({
          id: t.id, simbolo: t.simbolo, category: "daytrade",
          subcategory: sub, direction: (t.direction ?? "LONG") as "LONG" | "SHORT",
          pnl_brl: t.pnl_brl ?? null, pnl_pct: t.pct ?? null,
          score: t.score ?? null, leverage: null,
          status: (t.pnl_brl ?? 0) >= 0 ? "tp" : "sl",
          registrado_em: new Date(t.time).toISOString(),
        });
      }
    }
    return out;
  } catch { return []; }
}

function loadFuturesWallets(): FinTrade[] {
  try {
    const wallets: Record<string, any> = JSON.parse(
      localStorage.getItem("allwin_futures_wallets_v1") ?? "{}"
    );
    const out: FinTrade[] = [];
    for (const [perfilId, w] of Object.entries(wallets)) {
      const isScalp = perfilId.startsWith("f_scalp");
      const cat: FinTrade["category"] = isScalp ? "scalp" : "futuros";
      const sub = w.perfil_nome ?? perfilId;
      for (const t of (w.trades ?? []) as any[]) {
        if (t.tipo !== "V") continue;
        out.push({
          id: t.id, simbolo: t.simbolo, category: cat,
          subcategory: sub, direction: (t.direction ?? "LONG") as "LONG" | "SHORT",
          pnl_brl: t.pnl_brl ?? null, pnl_pct: t.pct ?? null,
          score: t.score ?? null, leverage: null,
          status: (t.pnl_brl ?? 0) >= 0 ? "tp" : "sl",
          registrado_em: new Date(t.time).toISOString(),
        });
      }
    }
    return out;
  } catch { return []; }
}

function loadBotWallets(): FinTrade[] {
  try {
    const wallets: Record<string, any> = JSON.parse(
      localStorage.getItem("allwin_bot_wallets_v1") ?? "{}"
    );
    const out: FinTrade[] = [];
    for (const [botId, w] of Object.entries(wallets)) {
      const sub = w.name ?? botId;
      for (const t of (w.trades ?? []) as any[]) {
        if (t.tipo !== "V") continue;
        out.push({
          id: t.id, simbolo: t.simbolo, category: "bot",
          subcategory: sub, direction: (t.direction ?? "LONG") as "LONG" | "SHORT",
          pnl_brl: t.pnl_brl ?? null, pnl_pct: t.pct ?? null,
          score: t.score ?? null, leverage: null,
          status: (t.pnl_brl ?? 0) >= 0 ? "tp" : "sl",
          registrado_em: new Date(t.time).toISOString(),
        });
      }
    }
    return out;
  } catch { return []; }
}

function loadAll(): FinTrade[] {
  if (typeof window === "undefined") return [];
  return [
    ...loadSinaisHist(),
    ...loadFuturesIAHist(),
    ...loadDaytradeWallets(),
    ...loadFuturesWallets(),
    ...loadBotWallets(),
  ].sort((a, b) => new Date(b.registrado_em).getTime() - new Date(a.registrado_em).getTime());
}

// ── Métricas ─────────────────────────────────────────────────────────────────

function calcStats(trades: FinTrade[]): Stats {
  if (!trades.length) return {
    total:0, wins:0, losses:0, expirados:0, winRate:0, avgGain:0, avgLoss:0,
    payback:0, profitFactor:0, expectancy:0, bestPct:0, worstPct:0,
    totalPnlBrl:0, totalPnlPct:0, maxDrawdown:0,
  };

  const expirados = trades.filter(t => t.status === "expirado").length;
  const active    = trades.filter(t => t.status !== "expirado");
  const wins      = active.filter(t => (t.pnl_pct ?? 0) > 0);
  const losses    = active.filter(t => (t.pnl_pct ?? 0) < 0);

  const gainPcts = wins.map(t => t.pnl_pct!);
  const lossPcts = losses.map(t => Math.abs(t.pnl_pct!));

  const avgGain = gainPcts.length ? gainPcts.reduce((a,b)=>a+b,0)/gainPcts.length : 0;
  const avgLoss = lossPcts.length ? lossPcts.reduce((a,b)=>a+b,0)/lossPcts.length : 0;
  const totalGain = gainPcts.reduce((a,b)=>a+b,0);
  const totalLoss = lossPcts.reduce((a,b)=>a+b,0);

  const winRate      = active.length ? wins.length / active.length * 100 : 0;
  const profitFactor = totalLoss > 0 ? totalGain / totalLoss : totalGain > 0 ? 99 : 0;
  const payback      = avgGain > 0 ? avgLoss / avgGain : 0;
  const expectancy   = (winRate/100)*avgGain - (1-winRate/100)*avgLoss;

  const allPcts = trades.map(t => t.pnl_pct ?? 0);
  const totalPnlBrl = trades.reduce((a,t)=>a+(t.pnl_brl??0), 0);
  const totalPnlPct = allPcts.reduce((a,b)=>a+b, 0);

  // Drawdown sobre % acumulado
  const sorted = [...trades].sort((a,b)=>new Date(a.registrado_em).getTime()-new Date(b.registrado_em).getTime());
  let running=0, peak=0, maxDD=0;
  for (const t of sorted) {
    running += t.pnl_pct ?? 0;
    if (running > peak) peak = running;
    const dd = peak > 0 ? (peak - running)/peak*100 : 0;
    if (dd > maxDD) maxDD = dd;
  }

  return {
    total: trades.length, wins: wins.length, losses: losses.length, expirados,
    winRate, avgGain, avgLoss, payback, profitFactor, expectancy,
    bestPct: allPcts.length ? Math.max(...allPcts) : 0,
    worstPct: allPcts.length ? Math.min(...allPcts) : 0,
    totalPnlBrl, totalPnlPct, maxDrawdown: maxDD,
  };
}

// ── Config categorias ─────────────────────────────────────────────────────────

const CATS = [
  { id: "all",        label: "Tudo",       color: "#6b7280", icon: Activity },
  { id: "daytrade",   label: "Day Trade",  color: "#3b82f6", icon: TrendingUp },
  { id: "futuros",    label: "Futuros",    color: "#f59e0b", icon: BarChart2 },
  { id: "scalp",      label: "Scalp",      color: "#22d3ee", icon: Zap },
  { id: "bot",        label: "Bots",       color: "#a855f7", icon: Bot },
  { id: "sinais",     label: "Sinais IA",  color: "#8b5cf6", icon: Target },
  { id: "futures_ia", label: "Futuros IA", color: "#10b981", icon: Flame },
] as const;

type CatId = typeof CATS[number]["id"];

// ── Helpers ───────────────────────────────────────────────────────────────────

function fPct(v: number) { return `${v>=0?"+":""}${v.toFixed(2)}%`; }
function fBRL(v: number) {
  if (Math.abs(v)>=1000) return `R$ ${(v/1000).toFixed(1)}k`;
  return `R$ ${v.toFixed(2)}`;
}
function fDate(iso: string) {
  try { return new Date(iso).toLocaleDateString("pt-BR",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"}); }
  catch { return iso; }
}
function statusLabel(s: string) {
  const m: Record<string,string> = { tp:"TP",tp1:"TP1",tp2:"TP2",tp3:"TP3",sl:"SL",expirado:"EXP" };
  return m[s] ?? s.toUpperCase();
}
function statusColor(s: string) {
  if (s==="sl") return "#ef4444";
  if (s==="expirado") return "#6b7280";
  return "#10b981";
}
function scoreColor(s: number | null) {
  if (!s) return "#6b7280";
  if (s>=80) return "#10b981"; if (s>=65) return "#84cc16";
  if (s>=50) return "#f59e0b"; if (s>=35) return "#f97316";
  return "#ef4444";
}

// ── Stat Card ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, color, icon: Icon }: {
  label: string; value: string; sub?: string; color: string; icon?: React.FC<any>;
}) {
  return (
    <div className="rounded-xl p-3 flex flex-col gap-1 min-w-[110px]"
      style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
      <div className="flex items-center gap-1.5">
        {Icon && <Icon size={12} style={{color}} />}
        <span className="text-[10px] font-semibold uppercase tracking-wide" style={{color:"var(--text-muted)"}}>{label}</span>
      </div>
      <span className="text-xl font-bold tabular-nums" style={{color}}>{value}</span>
      {sub && <span className="text-[10px]" style={{color:"var(--text-muted)"}}>{sub}</span>}
    </div>
  );
}

// ── Trade Row ─────────────────────────────────────────────────────────────────

function TradeRow({ t }: { t: FinTrade }) {
  const pnl = t.pnl_pct ?? 0;
  const isWin = pnl > 0;
  const catCfg = CATS.find(c => c.id === t.category);
  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors hover:bg-[var(--bg)]"
      style={{ borderBottom:"1px solid var(--border)" }}>
      {/* Símbolo + direction */}
      <div className="flex flex-col min-w-[60px]">
        <span className="text-xs font-bold" style={{color:"var(--text-primary)"}}>{t.simbolo}</span>
        <span className="text-[10px] font-semibold" style={{color: t.direction==="LONG"?"#10b981":"#ef4444"}}>
          {t.direction}
        </span>
      </div>

      {/* Category badge */}
      <span className="hidden sm:inline text-[10px] font-bold px-1.5 py-0.5 rounded-md"
        style={{ background:`${catCfg?.color}22`, color: catCfg?.color }}>
        {catCfg?.label ?? t.category}
      </span>
      {t.subcategory && t.subcategory !== catCfg?.label && (
        <span className="hidden md:inline text-[10px]" style={{color:"var(--text-muted)"}}>{t.subcategory}</span>
      )}

      {/* Score */}
      {t.score != null && (
        <span className="hidden lg:inline text-[10px] font-bold tabular-nums"
          style={{color: scoreColor(t.score)}}>{t.score.toFixed(0)}</span>
      )}

      {/* Leverage */}
      {t.leverage != null && t.leverage > 1 && (
        <span className="hidden lg:inline text-[10px]" style={{color:"#f59e0b"}}>{t.leverage}x</span>
      )}

      {/* P&L */}
      <div className="ml-auto flex items-center gap-2">
        {t.pnl_brl != null && (
          <span className="text-xs tabular-nums" style={{color: isWin?"#10b981":"#ef4444"}}>
            {fBRL(t.pnl_brl)}
          </span>
        )}
        {t.pnl_pct != null && (
          <span className="text-xs font-bold tabular-nums w-16 text-right" style={{color: isWin?"#10b981":"#ef4444"}}>
            {fPct(pnl)}
          </span>
        )}
        <span className="text-[10px] font-bold w-8 text-center rounded"
          style={{ background:`${statusColor(t.status)}22`, color:statusColor(t.status) }}>
          {statusLabel(t.status)}
        </span>
        <span className="hidden sm:inline text-[10px] w-24 text-right" style={{color:"var(--text-muted)"}}>
          {fDate(t.registrado_em)}
        </span>
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function FinalizadasPage() {
  const [trades, setTrades]     = useState<FinTrade[]>([]);
  const [cat, setCat]           = useState<CatId>("all");
  const [colorFilter, setColor] = useState<"all"|"green"|"red">("all");
  const [subFilter, setSub]     = useState<string>("all");
  const [showList, setShowList] = useState(true);
  const [lastRefresh, setLast]  = useState(new Date());

  const reload = useCallback(() => {
    setTrades(loadAll());
    setLast(new Date());
  }, []);

  useEffect(() => {
    reload();
    const iv = setInterval(reload, 30_000);
    const onFocus = () => reload();
    window.addEventListener("focus", onFocus);
    return () => { clearInterval(iv); window.removeEventListener("focus", onFocus); };
  }, [reload]);

  // Subcategorias disponíveis na categoria atual
  const subcats = useMemo(() => {
    const base = cat === "all" ? trades : trades.filter(t => t.category === cat);
    return ["all", ...Array.from(new Set(base.map(t => t.subcategory)))];
  }, [trades, cat]);

  const filtered = useMemo(() => {
    let list = cat === "all" ? trades : trades.filter(t => t.category === cat);
    if (subFilter !== "all") list = list.filter(t => t.subcategory === subFilter);
    if (colorFilter === "green") list = list.filter(t => (t.pnl_pct ?? 0) > 0);
    if (colorFilter === "red")   list = list.filter(t => (t.pnl_pct ?? 0) < 0 || t.status === "sl");
    return list;
  }, [trades, cat, subFilter, colorFilter]);

  const stats = useMemo(() => calcStats(filtered), [filtered]);
  const catCfg = CATS.find(c => c.id === cat)!;

  return (
    <div className="min-h-screen" style={{background:"var(--bg)"}}>
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-5">

        {/* ── Header ── */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold" style={{color:"var(--text-primary)"}}>
              Operações Finalizadas
            </h1>
            <p className="text-xs mt-0.5" style={{color:"var(--text-muted)"}}>
              Estudo de performance · atualiza a cada 30s · última: {lastRefresh.toLocaleTimeString("pt-BR")}
            </p>
          </div>
          <button onClick={reload}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
            style={{background:"var(--bg-card)",border:"1px solid var(--border)",color:"var(--text-muted)"}}>
            <RefreshCw size={12}/> Atualizar
          </button>
        </div>

        {/* ── Tabs de categoria ── */}
        <div className="flex flex-wrap gap-1 p-1 rounded-xl"
          style={{background:"var(--bg-card)",border:"1px solid var(--border)"}}>
          {CATS.map(c => {
            const count = c.id === "all" ? trades.length : trades.filter(t=>t.category===c.id).length;
            const active = cat === c.id;
            return (
              <button key={c.id}
                onClick={() => { setCat(c.id); setSub("all"); }}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-semibold transition-all"
                style={{
                  background: active ? `${c.color}22` : "transparent",
                  border: active ? `1px solid ${c.color}55` : "1px solid transparent",
                  color: active ? c.color : "var(--text-muted)",
                }}>
                <c.icon size={11} />
                {c.label}
                <span className="text-[10px] opacity-70">({count})</span>
              </button>
            );
          })}
        </div>

        {/* ── Filtros ── */}
        <div className="flex flex-wrap gap-2 items-center">
          {/* Verde / Vermelho */}
          <div className="flex gap-1 p-0.5 rounded-lg" style={{background:"var(--bg-card)",border:"1px solid var(--border)"}}>
            {([
              { id:"all",   label:"Todos",  color:"var(--text-muted)" },
              { id:"green", label:"🟢 Green", color:"#10b981" },
              { id:"red",   label:"🔴 Red",   color:"#ef4444" },
            ] as const).map(f => (
              <button key={f.id} onClick={() => setColor(f.id)}
                className="px-3 py-1.5 rounded-md text-[11px] font-semibold transition-all"
                style={{
                  background: colorFilter===f.id ? (f.id==="green"?"#10b98122":f.id==="red"?"#ef444422":"var(--bg)") : "transparent",
                  color: colorFilter===f.id ? f.color : "var(--text-muted)",
                }}>
                {f.label}
              </button>
            ))}
          </div>

          {/* Sub-categorias */}
          {subcats.length > 2 && (
            <div className="flex gap-1 flex-wrap">
              {subcats.map(s => (
                <button key={s} onClick={() => setSub(s)}
                  className="px-2.5 py-1 rounded-lg text-[10px] font-semibold transition-all"
                  style={{
                    background: subFilter===s ? `${catCfg.color}22` : "var(--bg-card)",
                    border: `1px solid ${subFilter===s ? catCfg.color+"55" : "var(--border)"}`,
                    color: subFilter===s ? catCfg.color : "var(--text-muted)",
                  }}>
                  {s === "all" ? "Todos" : s}
                </button>
              ))}
            </div>
          )}

          <span className="ml-auto text-xs" style={{color:"var(--text-muted)"}}>
            {filtered.length} operações
          </span>
        </div>

        {/* ── Dashboard de métricas ── */}
        {filtered.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
            <StatCard label="Win Rate"
              value={`${stats.winRate.toFixed(1)}%`}
              sub={`${stats.wins}W / ${stats.losses}L`}
              color={stats.winRate>=55?"#10b981":stats.winRate>=45?"#f59e0b":"#ef4444"}
              icon={Trophy}/>
            <StatCard label="Total P&L %"
              value={fPct(stats.totalPnlPct)}
              sub={stats.totalPnlBrl!==0?fBRL(stats.totalPnlBrl):undefined}
              color={stats.totalPnlPct>=0?"#10b981":"#ef4444"}
              icon={stats.totalPnlPct>=0?TrendingUp:TrendingDown}/>
            <StatCard label="Profit Factor"
              value={stats.profitFactor>=99?"∞":stats.profitFactor.toFixed(2)}
              sub={stats.profitFactor>=2?"Excelente":stats.profitFactor>=1.5?"Bom":stats.profitFactor>=1?"Regular":"Negativo"}
              color={stats.profitFactor>=2?"#10b981":stats.profitFactor>=1.5?"#84cc16":stats.profitFactor>=1?"#f59e0b":"#ef4444"}
              icon={BarChart2}/>
            <StatCard label="Expectância"
              value={`${stats.expectancy>=0?"+":""}${stats.expectancy.toFixed(2)}%`}
              sub="por operação"
              color={stats.expectancy>0?"#10b981":stats.expectancy===0?"#6b7280":"#ef4444"}
              icon={Activity}/>
            <StatCard label="Payback"
              value={stats.payback>0?`${stats.payback.toFixed(1)}x`:"—"}
              sub="ganhos p/ cobrir 1 perda"
              color={stats.payback<=1?"#10b981":stats.payback<=2?"#f59e0b":"#ef4444"}
              icon={RefreshCw}/>
            <StatCard label="Avg Ganho"
              value={`+${stats.avgGain.toFixed(2)}%`}
              sub={`${stats.wins} trades`}
              color="#10b981"
              icon={TrendingUp}/>
            <StatCard label="Avg Perda"
              value={`-${stats.avgLoss.toFixed(2)}%`}
              sub={`${stats.losses} trades`}
              color="#ef4444"
              icon={TrendingDown}/>
            <StatCard label="Melhor Trade"
              value={fPct(stats.bestPct)}
              color="#10b981"
              icon={Flame}/>
            <StatCard label="Pior Trade"
              value={fPct(stats.worstPct)}
              color="#ef4444"
              icon={AlertTriangle}/>
            <StatCard label="Max Drawdown"
              value={`-${stats.maxDrawdown.toFixed(1)}%`}
              sub="pico→vale acum."
              color={stats.maxDrawdown<=10?"#10b981":stats.maxDrawdown<=25?"#f59e0b":"#ef4444"}
              icon={TrendingDown}/>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 gap-3"
            style={{background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:16}}>
            <Filter size={32} style={{color:"var(--text-muted)",opacity:0.4}}/>
            <p className="text-sm" style={{color:"var(--text-muted)"}}>
              Nenhuma operação finalizada{cat!=="all"?` em ${catCfg.label}`:""}
            </p>
            <p className="text-xs" style={{color:"var(--text-muted)",opacity:0.6}}>
              Complete operações nas páginas Sinais IA, Futuros, Scalp, Bots ou Day Trade
            </p>
          </div>
        )}

        {/* ── Barra de resumo rápido por categoria ── */}
        {cat === "all" && trades.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            {CATS.filter(c=>c.id!=="all").map(c => {
              const ct = trades.filter(t=>t.category===c.id);
              if (!ct.length) return null;
              const s = calcStats(ct);
              return (
                <button key={c.id} onClick={() => { setCat(c.id); setSub("all"); }}
                  className="rounded-xl p-3 text-left transition-all hover:scale-[1.02]"
                  style={{background:"var(--bg-card)",border:`1px solid ${c.color}33`}}>
                  <div className="flex items-center gap-1.5 mb-1">
                    <c.icon size={10} style={{color:c.color}}/>
                    <span className="text-[10px] font-bold" style={{color:c.color}}>{c.label}</span>
                  </div>
                  <p className="text-base font-bold tabular-nums"
                    style={{color:s.totalPnlPct>=0?"#10b981":"#ef4444"}}>
                    {fPct(s.totalPnlPct)}
                  </p>
                  <p className="text-[10px]" style={{color:"var(--text-muted)"}}>
                    {ct.length} ops · WR {s.winRate.toFixed(0)}%
                  </p>
                </button>
              );
            })}
          </div>
        )}

        {/* ── Lista de operações ── */}
        {filtered.length > 0 && (
          <div className="rounded-xl overflow-hidden"
            style={{background:"var(--bg-card)",border:"1px solid var(--border)"}}>
            <button onClick={()=>setShowList(v=>!v)}
              className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold"
              style={{color:"var(--text-primary)"}}>
              <span>Operações ({filtered.length})</span>
              {showList ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}
            </button>
            {showList && (
              <div className="divide-y" style={{borderTop:"1px solid var(--border)"}}>
                {/* Cabeçalho */}
                <div className="flex items-center gap-3 px-3 py-1.5"
                  style={{background:"var(--bg)"}}>
                  <span className="text-[10px] font-bold uppercase w-[60px]" style={{color:"var(--text-muted)"}}>Símbolo</span>
                  <span className="hidden sm:inline text-[10px] font-bold uppercase" style={{color:"var(--text-muted)"}}>Tipo</span>
                  <span className="ml-auto text-[10px] font-bold uppercase" style={{color:"var(--text-muted)"}}>P&L</span>
                  <span className="text-[10px] font-bold uppercase w-8 text-center" style={{color:"var(--text-muted)"}}>ST</span>
                  <span className="hidden sm:inline text-[10px] font-bold uppercase w-24 text-right" style={{color:"var(--text-muted)"}}>Data</span>
                </div>
                {filtered.map(t => <TradeRow key={t.id} t={t}/>)}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
