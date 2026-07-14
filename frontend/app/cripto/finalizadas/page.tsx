"use client";

import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import {
  TrendingUp, TrendingDown, Target, Zap, Bot,
  RefreshCw, ChevronDown, ChevronUp, Trophy, Flame,
  BarChart2, Activity, Filter, AlertTriangle,
  CalendarDays, List, ChevronLeft, ChevronRight, X, Search,
  Database,
} from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

// ── Tipo normalizado ───────────────────────────────────────────────────────────

interface FinTrade {
  id: string;
  simbolo: string;
  category: "sinais" | "futures_ia" | "futuros_ia_tiro" | "daytrade" | "futuros" | "scalp" | "bot" | "srd_bot";
  subcategory: string;
  direction: "LONG" | "SHORT";
  pnl_brl: number | null;
  pnl_pct: number | null;
  score: number | null;
  leverage: number | null;
  status: string;
  registrado_em: string;
  motivo_entrada?: string;
  motivo_saida?: string;
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
          if (e.status === "sl"  && e.sl  != null) pnl_pct = (e.sl  - e.preco_entrada) / e.preco_entrada * 100;
          if (e.status === "tp1" && e.tp1 != null) pnl_pct = (e.tp1 - e.preco_entrada) / e.preco_entrada * 100;
          if (e.status === "tp2" && e.tp2 != null) pnl_pct = (e.tp2 - e.preco_entrada) / e.preco_entrada * 100;
          if (e.status === "tp3" && e.tp3 != null) pnl_pct = (e.tp3 - e.preco_entrada) / e.preco_entrada * 100;
        }
        return {
          id: e.id, simbolo: e.simbolo, category: "sinais" as const,
          subcategory: "Sinais IA", direction: (e.direction ?? "LONG") as "LONG" | "SHORT",
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
      .filter(e => e.source === "futures_ia" && e.status !== "aberto" && !String(e.id ?? "").startsWith("ia_tiro_"))
      .map(e => {
        const lev = e.leverage ?? 1;
        let pnl_pct: number | null = null;
        if (e.status === "tp" && e.tp_pct != null) pnl_pct =  (e.tp_pct) * lev;
        if (e.status === "sl" && e.sl_pct != null) pnl_pct = -(e.sl_pct) * lev;
        return {
          id: e.id, simbolo: e.simbolo, category: "futures_ia" as const,
          subcategory: "IA Análise", direction: (e.direction ?? "LONG") as "LONG" | "SHORT",
          pnl_brl: null, pnl_pct, score: e.score ?? null, leverage: lev,
          status: e.status, registrado_em: e.registrado_em,
        } satisfies FinTrade;
      });
  } catch { return []; }
}

function loadIATiroHist(): FinTrade[] {
  try {
    const all: any[] = JSON.parse(localStorage.getItem("allwin_trade_hist") ?? "[]");
    return all
      .filter(e => e.source === "futures_ia" && e.status !== "aberto" && String(e.id ?? "").startsWith("ia_tiro_"))
      .map(e => {
        const lev = e.leverage ?? 1;
        let pnl_pct: number | null = null;
        if (e.status === "tp" && e.tp_pct != null) pnl_pct =  (e.tp_pct) * lev;
        if (e.status === "sl" && e.sl_pct != null) pnl_pct = -(e.sl_pct) * lev;
        return {
          id: e.id, simbolo: e.simbolo, category: "futuros_ia_tiro" as const,
          subcategory: "Tiro Curto IA", direction: (e.direction ?? "LONG") as "LONG" | "SHORT",
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
        const pnl_pct = t.pct ?? null;
        const pnl_brl = t.pnl_brl ?? null;
        const status = pnl_brl != null ? (pnl_brl >= 0 ? "tp" : "sl") : "tp";
        const registrado_em = t.time ? new Date(t.time).toISOString() : new Date().toISOString();
        out.push({
          id: t.id, simbolo: t.simbolo, category: "daytrade",
          subcategory: sub, direction: (t.direction ?? "LONG") as "LONG" | "SHORT",
          pnl_brl, pnl_pct, score: t.score ?? null, leverage: null,
          status, registrado_em,
          motivo_entrada: t.motivo_entrada, motivo_saida: t.motivo_saida,
        } satisfies FinTrade);
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
        const pnl_pct = t.pct ?? null;
        const pnl_brl = t.pnl_brl ?? null;
        const status = pnl_brl != null ? (pnl_brl >= 0 ? "tp" : "sl") : (pnl_pct != null ? (pnl_pct >= 0 ? "tp" : "sl") : "tp");
        const registrado_em = t.time ? new Date(t.time).toISOString() : new Date().toISOString();
        out.push({
          id: t.id, simbolo: t.simbolo, category: cat,
          subcategory: sub, direction: (t.direction ?? "LONG") as "LONG" | "SHORT",
          pnl_brl, pnl_pct, score: t.score ?? null, leverage: null,
          status, registrado_em,
          motivo_entrada: t.motivo_entrada, motivo_saida: t.motivo_saida,
        } satisfies FinTrade);
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
    for (const [perfilId, w] of Object.entries(wallets)) {
      const sub = w.perfil_nome ?? perfilId;
      for (const t of (w.trades ?? []) as any[]) {
        if (t.tipo !== "V") continue;
        const pnl_pct = t.pct ?? null;
        const pnl_brl = t.pnl_brl ?? null;
        const status = pnl_brl != null ? (pnl_brl >= 0 ? "tp" : "sl") : (pnl_pct != null ? (pnl_pct >= 0 ? "tp" : "sl") : "tp");
        const registrado_em = t.time ? new Date(t.time).toISOString() : new Date().toISOString();
        out.push({
          id: t.id, simbolo: t.simbolo, category: "bot",
          subcategory: sub, direction: (t.direction ?? "LONG") as "LONG" | "SHORT",
          pnl_brl, pnl_pct, score: t.score ?? null, leverage: null,
          status, registrado_em,
          motivo_entrada: t.motivo_entrada, motivo_saida: t.motivo_saida,
        } satisfies FinTrade);
      }
    }
    return out;
  } catch { return []; }
}

function loadSRDBotHist(): FinTrade[] {
  try {
    const wallets: Record<string, any> = JSON.parse(
      localStorage.getItem("allwin_srd_wallets_v1") ?? "{}"
    );
    const out: FinTrade[] = [];
    for (const [, w] of Object.entries(wallets)) {
      const sub = w.botId ?? "SRD Bot";
      for (const t of (w.trades ?? []) as any[]) {
        if (t.status === "aberto") continue;
        const lev = t.leverage ?? 1;
        let pnl_pct: number | null = null;
        if (t.status === "tp") pnl_pct =  (t.tp_pct ?? 0) * lev;
        if (t.status === "sl") pnl_pct = -(t.sl_pct ?? 0) * lev;
        out.push({
          id: t.id, simbolo: t.simbolo, category: "srd_bot",
          subcategory: sub, direction: (t.direction ?? "LONG") as "LONG" | "SHORT",
          pnl_brl: null, pnl_pct,
          score: t.score ?? null, leverage: lev,
          status: t.status ?? "tp", registrado_em: t.registrado_em ?? new Date().toISOString(),
          motivo_entrada: t.motivo_entrada,
        } satisfies FinTrade);
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
    ...loadIATiroHist(),
    ...loadDaytradeWallets(),
    ...loadFuturesWallets(),
    ...loadBotWallets(),
    ...loadSRDBotHist(),
  ].sort((a, b) => new Date(b.registrado_em).getTime() - new Date(a.registrado_em).getTime());
}

// ── Loaders do backend (MySQL) — sem limite de quota ─────────────────────────
// Futures + Scalp vêm de /cripto/wallets/futures
// Bot vem de /cripto/wallets/bot
// Daytrade vem de /cripto/wallets/daytrade
// SRD Bot e Sinais IA são localStorage-only (sem sync de backend)

function mapWalletTrades(
  wallets: Record<string, any>,
  getCat: (id: string) => FinTrade["category"],
): FinTrade[] {
  const out: FinTrade[] = [];
  for (const [perfilId, w] of Object.entries(wallets)) {
    const cat = getCat(perfilId);
    const sub = w.perfil_nome ?? perfilId;
    for (const t of (w.trades ?? []) as any[]) {
      if (t.tipo !== "V") continue;
      const pnl_pct = t.pct ?? null;
      const pnl_brl = t.pnl_brl ?? null;
      const status = pnl_brl != null
        ? (pnl_brl >= 0 ? "tp" : "sl")
        : (pnl_pct != null ? (pnl_pct >= 0 ? "tp" : "sl") : "tp");
      const registrado_em = t.time
        ? new Date(t.time).toISOString()
        : new Date().toISOString();
      out.push({
        id: t.id ?? `${t.simbolo}-${t.time}`,
        simbolo: t.simbolo,
        category: cat,
        subcategory: sub,
        direction: (t.direction ?? "LONG") as "LONG" | "SHORT",
        pnl_brl, pnl_pct,
        score: t.score ?? null,
        leverage: null,
        status, registrado_em,
        motivo_entrada: t.motivo_entrada,
        motivo_saida: t.motivo_saida,
      } satisfies FinTrade);
    }
  }
  return out;
}

async function loadAllFromBackend(): Promise<FinTrade[]> {
  const results: FinTrade[] = [];
  try {
    // Futures + Scalp
    const futRes = await fetch(`${API}/cripto/wallets/futures?per_perfil_limit=5000`);
    if (futRes.ok) {
      const futData: Record<string, any> = await futRes.json();
      results.push(...mapWalletTrades(futData, (id) => id.startsWith("f_scalp") ? "scalp" : "futuros"));
    }
  } catch {}
  try {
    // Bots (grecos/romanos)
    const botRes = await fetch(`${API}/cripto/wallets/bot?per_perfil_limit=5000`);
    if (botRes.ok) {
      const botData: Record<string, any> = await botRes.json();
      results.push(...mapWalletTrades(botData, () => "bot"));
    }
  } catch {}
  try {
    // Daytrade
    const dtRes = await fetch(`${API}/cripto/wallets/daytrade?per_perfil_limit=5000`);
    if (dtRes.ok) {
      const dtData: Record<string, any> = await dtRes.json();
      results.push(...mapWalletTrades(dtData, () => "daytrade"));
    }
  } catch {}
  return results;
}

// Merge localStorage + backend, deduplica por ID, ordena por data
function mergeAndSort(local: FinTrade[], backend: FinTrade[]): FinTrade[] {
  const seen = new Set<string>();
  const combined: FinTrade[] = [];
  // Backend primeiro (mais completo), depois local para preencher o que falta
  for (const t of [...backend, ...local]) {
    if (!seen.has(t.id)) {
      seen.add(t.id);
      combined.push(t);
    }
  }
  return combined.sort(
    (a, b) => new Date(b.registrado_em).getTime() - new Date(a.registrado_em).getTime()
  );
}

// ── Stats ─────────────────────────────────────────────────────────────────────

function calcStats(trades: FinTrade[]): Stats {
  const withPnl = trades.filter(t => t.pnl_pct != null && !isNaN(t.pnl_pct));
  const wins    = withPnl.filter(t => (t.pnl_pct ?? 0) > 0);
  const losses  = withPnl.filter(t => (t.pnl_pct ?? 0) < 0);
  const exps    = trades.filter(t => t.status === "expirado");
  const winRate = withPnl.length ? (wins.length / withPnl.length) * 100 : 0;
  const avgGain = wins.length  ? wins.reduce((s,t) => s+(t.pnl_pct??0),0)/wins.length : 0;
  const avgLoss = losses.length? Math.abs(losses.reduce((s,t)=>s+(t.pnl_pct??0),0)/losses.length) : 0;
  const payback = avgGain > 0 && avgLoss > 0 ? avgLoss / avgGain : 0;
  const grossW  = wins.reduce((s,t)=>s+(t.pnl_pct??0),0);
  const grossL  = Math.abs(losses.reduce((s,t)=>s+(t.pnl_pct??0),0));
  const profitFactor = grossL > 0 ? grossW / grossL : grossW > 0 ? 99 : 0;
  const expectancy   = winRate/100 * avgGain - (1 - winRate/100) * avgLoss;
  const totalPnlBrl  = trades.reduce((s,t)=>s+(t.pnl_brl??0),0);
  const allPcts      = withPnl.map(t => t.pnl_pct ?? 0);
  let totalPnlPct = 0, maxDD = 0, peak = 0;
  for (const p of [...allPcts].reverse()) {
    totalPnlPct += p;
    if (totalPnlPct > peak) peak = totalPnlPct;
    if (peak - totalPnlPct > maxDD) maxDD = peak - totalPnlPct;
  }
  return {
    total: trades.length, wins: wins.length, losses: losses.length,
    expirados: exps.length, winRate, avgGain, avgLoss, payback,
    profitFactor, expectancy,
    bestPct: allPcts.length ? Math.max(...allPcts) : 0,
    worstPct: allPcts.length ? Math.min(...allPcts) : 0,
    totalPnlBrl, totalPnlPct, maxDrawdown: maxDD,
  };
}

// ── Config categorias ─────────────────────────────────────────────────────────

const CATS = [
  { id: "all",              label: "Tudo",          color: "#6b7280", icon: Activity },
  { id: "daytrade",         label: "Day Trade",     color: "#3b82f6", icon: TrendingUp },
  { id: "futuros",          label: "Futuros",       color: "#f59e0b", icon: BarChart2 },
  { id: "scalp",            label: "Scalp",         color: "#22d3ee", icon: Zap },
  { id: "bot",              label: "Bots",          color: "#a855f7", icon: Bot },
  { id: "srd_bot",          label: "BOT SRD",       color: "#10b981", icon: TrendingDown },
  { id: "sinais",           label: "Sinais IA",     color: "#8b5cf6", icon: Target },
  { id: "futures_ia",       label: "Futuros IA",    color: "#f59e0b", icon: Flame },
  { id: "futuros_ia_tiro",  label: "Tiro Curto IA", color: "#22c55e", icon: Zap },
] as const;

type CatId = typeof CATS[number]["id"];

// ── Helpers ───────────────────────────────────────────────────────────────────

function fPct(v: number) { return `${v>=0?"+":""}${v.toFixed(2)}%`; }
function fBRL(v: number) {
  if (Math.abs(v)>=1000) return `R$ ${(v/1000).toFixed(1)}k`;
  return `R$ ${v.toFixed(2)}`;
}
function fDate(iso: string) {
  try { return new Date(iso).toLocaleString("pt-BR",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"}); }
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

const MONTH_NAMES = [
  "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
  "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro",
];
const DOW_LABELS = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];

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
  const [expanded, setExpanded] = useState(false);
  const pnl = t.pnl_pct ?? 0;
  const isWin = pnl > 0;
  const catCfg = CATS.find(c => c.id === t.category);
  const hasMotivo = !!(t.motivo_entrada || t.motivo_saida);
  return (
    <div style={{ borderBottom:"1px solid var(--border)" }}>
      <div
        className="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors hover:bg-[var(--bg)]"
        style={{ cursor: hasMotivo ? "pointer" : "default" }}
        onClick={() => hasMotivo && setExpanded(v => !v)}
      >
      <div className="flex flex-col min-w-[60px]">
        <span className="text-xs font-bold" style={{color:"var(--text-primary)"}}>{t.simbolo}</span>
        <span className="text-[10px] font-semibold" style={{color: t.direction==="LONG"?"#10b981":"#ef4444"}}>
          {t.direction}
        </span>
      </div>
      <span className="hidden sm:inline text-[10px] font-bold px-1.5 py-0.5 rounded-md"
        style={{ background:`${catCfg?.color}22`, color: catCfg?.color }}>
        {catCfg?.label ?? t.category}
      </span>
      {t.subcategory && t.subcategory !== catCfg?.label && (
        <span className="hidden md:inline text-[10px]" style={{color:"var(--text-muted)"}}>{t.subcategory}</span>
      )}
      {t.score != null && (
        <span className="hidden lg:inline text-[10px] font-bold tabular-nums"
          style={{color: scoreColor(t.score)}}>{t.score.toFixed(0)}</span>
      )}
      {t.leverage != null && t.leverage > 1 && (
        <span className="hidden lg:inline text-[10px]" style={{color:"#f59e0b"}}>{t.leverage}x</span>
      )}
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
        {hasMotivo && (
          <span className="text-[9px]" style={{color:"var(--text-muted)",opacity:0.5}}>
            {expanded ? "▲" : "▼"}
          </span>
        )}
      </div>
      </div>
      {expanded && hasMotivo && (
        <div className="px-4 pb-3 pt-1 flex flex-col gap-1.5 rounded-b-lg"
          style={{background:"var(--bg)",borderTop:"1px solid var(--border)"}}>
          {t.motivo_entrada && (
            <div className="flex gap-2 items-start">
              <span className="text-[9px] font-bold uppercase tracking-wide mt-0.5 shrink-0"
                style={{color:"#10b981"}}>Entrada</span>
              <span className="text-[11px]" style={{color:"var(--text-muted)"}}>{t.motivo_entrada}</span>
            </div>
          )}
          {t.motivo_saida && (
            <div className="flex gap-2 items-start">
              <span className="text-[9px] font-bold uppercase tracking-wide mt-0.5 shrink-0"
                style={{color: isWin?"#10b981":"#ef4444"}}>Saída</span>
              <span className="text-[11px]" style={{color:"var(--text-muted)"}}>{t.motivo_saida}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Calendar View ─────────────────────────────────────────────────────────────

interface DayStat {
  pnl: number;
  wins: number;
  losses: number;
  count: number;
  trades: FinTrade[];
}

function CalendarView({ trades, calDate, onNavigate, onSelectDay, selectedDay }: {
  trades: FinTrade[];
  calDate: Date;
  onNavigate: (dir: -1|1) => void;
  onSelectDay: (day: string|null) => void;
  selectedDay: string|null;
}) {
  const year        = calDate.getFullYear();
  const month       = calDate.getMonth();
  const monthPrefix = `${year}-${String(month+1).padStart(2,"0")}`;
  const today       = new Date().toISOString().slice(0,10);

  // Group ALL trades by date key (YYYY-MM-DD)
  const byDay = useMemo<Record<string, DayStat>>(() => {
    const map: Record<string, DayStat> = {};
    for (const t of trades) {
      if (!t.registrado_em) continue;
      // Slice to YYYY-MM-DD safely
      const day = t.registrado_em.length >= 10 ? t.registrado_em.slice(0,10) : "";
      if (!day || day.length !== 10) continue;
      if (!map[day]) map[day] = { pnl:0, wins:0, losses:0, count:0, trades:[] };
      map[day].trades.push(t);
      map[day].count++;
      map[day].pnl += t.pnl_pct ?? 0;
      if ((t.pnl_pct ?? 0) > 0) map[day].wins++;
      else map[day].losses++;
    }
    return map;
  }, [trades]);

  // Only this month's trades
  const monthTrades = useMemo(
    () => trades.filter(t => t.registrado_em?.startsWith(monthPrefix)),
    [trades, monthPrefix]
  );
  const monthStats = useMemo(() => calcStats(monthTrades), [monthTrades]);

  // Day-level stats for the displayed month (for Melhor/Pior Dia)
  const monthDayPnls = useMemo(() =>
    Object.entries(byDay)
      .filter(([day]) => day.startsWith(monthPrefix))
      .map(([, s]) => s.pnl),
    [byDay, monthPrefix]
  );
  const bestDayPnl  = monthDayPnls.length ? Math.max(...monthDayPnls) : 0;
  const worstDayPnl = monthDayPnls.length ? Math.min(...monthDayPnls) : 0;

  // Build calendar grid (Sunday start)
  const daysInMonth = new Date(year, month+1, 0).getDate();
  const startDow    = new Date(year, month, 1).getDay();
  const cells: (number|null)[] = [
    ...Array(startDow).fill(null),
    ...Array.from({length: daysInMonth}, (_,i) => i+1),
  ];
  while (cells.length % 7) cells.push(null);
  const weeks: (number|null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i+7));

  function cellBg(s: DayStat|undefined, isSel: boolean): string {
    if (!s) return "transparent";
    if (isSel) return s.pnl >= 0 ? "rgba(16,185,129,0.30)" : "rgba(239,68,68,0.30)";
    if (s.pnl >= 15) return "rgba(16,185,129,0.90)";
    if (s.pnl >= 5)  return "rgba(16,185,129,0.55)";
    if (s.pnl >= 0)  return "rgba(16,185,129,0.20)";
    if (s.pnl >= -5) return "rgba(239,68,68,0.20)";
    if (s.pnl >=-15) return "rgba(239,68,68,0.55)";
    return "rgba(239,68,68,0.90)";
  }
  function cellTextColor(s: DayStat|undefined): string {
    if (!s) return "var(--text-muted)";
    if (Math.abs(s.pnl) >= 15) return "#fff";
    return s.pnl >= 0 ? "#10b981" : "#ef4444";
  }

  return (
    <div className="flex flex-col gap-4">

      {/* Month summary stats */}
      {monthStats.total > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          <StatCard label="P&L do Mês"
            value={fPct(monthStats.totalPnlPct)}
            color={monthStats.totalPnlPct>=0?"#10b981":"#ef4444"}
            icon={monthStats.totalPnlPct>=0?TrendingUp:TrendingDown}/>
          <StatCard label="Win Rate"
            value={`${monthStats.winRate.toFixed(1)}%`}
            sub={`${monthStats.wins}W / ${monthStats.losses}L`}
            color={monthStats.winRate>=55?"#10b981":monthStats.winRate>=45?"#f59e0b":"#ef4444"}
            icon={Trophy}/>
          <StatCard label="Operações"
            value={String(monthStats.total)}
            sub="no mês"
            color="var(--text-primary)"
            icon={Activity}/>
          <StatCard label="Melhor Dia"
            value={fPct(bestDayPnl)}
            color="#10b981"
            icon={Flame}/>
          <StatCard label="Pior Dia"
            value={fPct(worstDayPnl)}
            color="#ef4444"
            icon={AlertTriangle}/>
        </div>
      ) : (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm"
          style={{background:"var(--bg-card)",border:"1px solid var(--border)",color:"var(--text-muted)"}}>
          <CalendarDays size={16}/>
          Sem operações em {MONTH_NAMES[month]} {year} — use as setas para navegar até o mês desejado.
        </div>
      )}

      {/* Calendar card */}
      <div className="rounded-2xl overflow-hidden"
        style={{background:"var(--bg-card)",border:"1px solid var(--border)"}}>

        {/* Month navigation header */}
        <div className="flex items-center justify-between px-5 py-4"
          style={{borderBottom:"1px solid var(--border)"}}>
          <button onClick={() => onNavigate(-1)}
            className="flex items-center justify-center w-9 h-9 rounded-xl transition-colors"
            style={{border:"1px solid var(--border)",background:"var(--bg)"}}
            onMouseEnter={e => (e.currentTarget.style.borderColor="var(--text-muted)")}
            onMouseLeave={e => (e.currentTarget.style.borderColor="var(--border)")}>
            <ChevronLeft size={16} style={{color:"var(--text-primary)"}}/>
          </button>

          <div className="text-center select-none">
            <h2 className="text-base font-bold" style={{color:"var(--text-primary)"}}>
              {MONTH_NAMES[month]} {year}
            </h2>
            {monthStats.total > 0 && (
              <p className="text-[11px] mt-0.5 font-semibold tabular-nums"
                style={{color: monthStats.totalPnlPct>=0?"#10b981":"#ef4444"}}>
                {fPct(monthStats.totalPnlPct)} · {monthStats.total} ops · WR {monthStats.winRate.toFixed(0)}%
              </p>
            )}
          </div>

          <button onClick={() => onNavigate(1)}
            className="flex items-center justify-center w-9 h-9 rounded-xl transition-colors"
            style={{border:"1px solid var(--border)",background:"var(--bg)"}}
            onMouseEnter={e => (e.currentTarget.style.borderColor="var(--text-muted)")}
            onMouseLeave={e => (e.currentTarget.style.borderColor="var(--border)")}>
            <ChevronRight size={16} style={{color:"var(--text-primary)"}}/>
          </button>
        </div>

        <div className="p-3 sm:p-5">
          {/* Day-of-week headers */}
          <div className="grid grid-cols-7 mb-2">
            {DOW_LABELS.map(d => (
              <div key={d} className="text-center text-[10px] font-bold uppercase tracking-wider py-1.5"
                style={{color:"var(--text-muted)"}}>
                {d}
              </div>
            ))}
          </div>

          {/* Week rows */}
          <div className="flex flex-col gap-1.5">
            {weeks.map((week, wi) => (
              <div key={wi} className="grid grid-cols-7 gap-1.5">
                {week.map((d, di) => {
                  if (!d) {
                    return (
                      <div key={`e-${wi}-${di}`}
                        className="rounded-xl"
                        style={{minHeight:88,background:"var(--bg)",opacity:0.3}}/>
                    );
                  }
                  const dayKey = `${monthPrefix}-${String(d).padStart(2,"0")}`;
                  const s      = byDay[dayKey];
                  const isToday = dayKey === today;
                  const isSel   = dayKey === selectedDay;
                  const pnl     = s?.pnl ?? 0;

                  return (
                    <button key={dayKey}
                      onClick={() => onSelectDay(isSel ? null : dayKey)}
                      className="rounded-xl text-left transition-all duration-150 cursor-pointer relative overflow-hidden group"
                      style={{
                        minHeight: 88,
                        background: s ? cellBg(s, isSel) : isToday ? "var(--bg)" : "var(--bg)",
                        border: isSel
                          ? `2px solid ${pnl>=0?"#10b981":"#ef4444"}`
                          : isToday
                            ? "2px solid rgba(255,255,255,0.25)"
                            : s
                              ? "1px solid rgba(255,255,255,0.06)"
                              : "1px solid var(--border)",
                        transform: isSel ? "scale(1.02)" : undefined,
                        boxShadow: isSel ? `0 0 0 1px ${pnl>=0?"#10b98155":"#ef444455"}, 0 4px 12px ${pnl>=0?"#10b98122":"#ef444422"}` : undefined,
                      }}>
                      {/* Hover overlay */}
                      {!isSel && (
                        <div className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-150"
                          style={{background:"rgba(255,255,255,0.05)"}}/>
                      )}

                      <div className="relative p-2">
                        {/* Day number */}
                        <div className="flex items-start justify-between">
                          <span className="text-[12px] font-bold leading-none"
                            style={{
                              color: s
                                ? cellTextColor(s)
                                : isToday
                                  ? "var(--text-primary)"
                                  : "var(--text-muted)",
                            }}>
                            {d}
                          </span>
                          {isToday && (
                            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 mt-0.5"
                              style={{background: s ? cellTextColor(s) : "var(--text-muted)"}}/>
                          )}
                        </div>

                        {/* Stats */}
                        {s && (
                          <div className="mt-2 flex flex-col gap-1">
                            {/* P&L */}
                            <p className="text-[11px] font-bold tabular-nums leading-none"
                              style={{color: cellTextColor(s)}}>
                              {fPct(s.pnl)}
                            </p>
                            {/* Count */}
                            <p className="text-[9px] font-medium leading-none"
                              style={{color: s.pnl>=0?"rgba(16,185,129,0.75)":"rgba(239,68,68,0.75)"}}>
                              {s.count} op{s.count!==1?"s":""}
                            </p>
                            {/* W/L badges */}
                            <div className="flex gap-0.5 flex-wrap mt-0.5">
                              {s.wins > 0 && (
                                <span className="text-[9px] px-1 py-0.5 rounded-md font-bold leading-none"
                                  style={{background:"rgba(16,185,129,0.25)",color:"#10b981"}}>
                                  {s.wins}W
                                </span>
                              )}
                              {s.losses > 0 && (
                                <span className="text-[9px] px-1 py-0.5 rounded-md font-bold leading-none"
                                  style={{background:"rgba(239,68,68,0.25)",color:"#ef4444"}}>
                                  {s.losses}L
                                </span>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>

          {/* Legend */}
          <div className="flex items-center gap-3 mt-4 pt-3 flex-wrap"
            style={{borderTop:"1px solid var(--border)"}}>
            <span className="text-[10px] font-semibold uppercase tracking-wide" style={{color:"var(--text-muted)"}}>Legenda:</span>
            {[
              { bg:"rgba(16,185,129,0.20)", label:"Lucro leve" },
              { bg:"rgba(16,185,129,0.55)", label:"Lucro médio" },
              { bg:"rgba(16,185,129,0.90)", label:"Lucro forte" },
              { bg:"rgba(239,68,68,0.20)",  label:"Perda leve" },
              { bg:"rgba(239,68,68,0.55)",  label:"Perda média" },
              { bg:"rgba(239,68,68,0.90)",  label:"Perda forte" },
            ].map(l => (
              <div key={l.label} className="flex items-center gap-1">
                <span className="w-3 h-3 rounded-sm inline-block flex-shrink-0" style={{background:l.bg}}/>
                <span className="text-[9px]" style={{color:"var(--text-muted)"}}>{l.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Selected day detail panel */}
      {selectedDay && byDay[selectedDay] && (() => {
        const ds = byDay[selectedDay];
        const ds_stats = calcStats(ds.trades);
        return (
          <div className="rounded-2xl overflow-hidden"
            style={{
              background:"var(--bg-card)",
              border:`2px solid ${ds.pnl>=0?"#10b98155":"#ef444455"}`,
            }}>
            {/* Day header */}
            <div className="flex items-center justify-between px-4 py-3"
              style={{borderBottom:"1px solid var(--border)"}}>
              <div className="flex flex-col gap-1">
                <h3 className="text-sm font-bold" style={{color:"var(--text-primary)"}}>
                  {new Date(selectedDay + "T12:00:00").toLocaleDateString("pt-BR",{
                    weekday:"long",day:"2-digit",month:"long",year:"numeric"
                  })}
                </h3>
                <div className="flex flex-wrap gap-3">
                  <span className="text-[11px] font-bold tabular-nums"
                    style={{color: ds.pnl>=0?"#10b981":"#ef4444"}}>
                    {fPct(ds.pnl)} P&L
                  </span>
                  <span className="text-[11px]" style={{color:"var(--text-muted)"}}>
                    {ds.count} operações · {ds.wins}W / {ds.losses}L
                  </span>
                  <span className="text-[11px]" style={{color:"var(--text-muted)"}}>
                    WR {ds_stats.winRate.toFixed(0)}% · PF {ds_stats.profitFactor.toFixed(2)}
                  </span>
                </div>
              </div>
              <button onClick={() => onSelectDay(null)}
                className="flex items-center justify-center w-7 h-7 rounded-lg transition-colors flex-shrink-0"
                style={{border:"1px solid var(--border)",background:"var(--bg)"}}
                onMouseEnter={e => (e.currentTarget.style.background="var(--border)")}
                onMouseLeave={e => (e.currentTarget.style.background="var(--bg)")}>
                <X size={13} style={{color:"var(--text-muted)"}}/>
              </button>
            </div>
            {/* Trades list */}
            <div style={{maxHeight:360,overflowY:"auto"}}>
              {ds.trades.map(t => <TradeRow key={t.id} t={t}/>)}
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function FinalizadasPage() {
  const [trades, setTrades]     = useState<FinTrade[]>([]);
  const [backendLoaded, setBackendLoaded] = useState(false);
  const [backendCount, setBackendCount]   = useState(0);
  const [cat, setCat]           = useState<CatId>("all");
  const [colorFilter, setColor] = useState<"all"|"green"|"red">("all");
  const [subFilter, setSub]     = useState<string>("all");
  const [dirFilter, setDir]     = useState<"all"|"LONG"|"SHORT">("all");
  const [stFilter, setSt]       = useState<"all"|"tp"|"sl"|"expirado">("all");
  const [symbolSearch, setSymbol] = useState("");
  const [showList, setShowList] = useState(true);
  const [viewMode, setViewMode] = useState<"list"|"calendar">("list");
  const [lastRefresh, setLast]  = useState(new Date());
  const [calDate, setCalDate]   = useState(() => new Date());
  const [selectedDay, setSelDay] = useState<string|null>(null);
  const calInitialized           = useRef(false);

  const reload = useCallback(async () => {
    // 1) localStorage imediatamente — resposta instantânea na UI
    const local = loadAll();
    setTrades(local);
    setLast(new Date());
    if (!calInitialized.current && local.length > 0) {
      calInitialized.current = true;
      const latest = local.find(t => t.registrado_em?.length >= 10);
      if (latest) setCalDate(new Date(latest.registrado_em.slice(0,10) + "T12:00:00"));
    }
    // 2) MySQL via backend — completo, sem limite de quota localStorage
    // Substitui localStorage quando necessário (ex: trades perdidos por quota overflow)
    try {
      const backend = await loadAllFromBackend();
      if (backend.length > 0) {
        const merged = mergeAndSort(local, backend);
        setTrades(merged);
        setBackendCount(backend.length);
        setBackendLoaded(true);
        setLast(new Date());
        if (!calInitialized.current && merged.length > 0) {
          calInitialized.current = true;
          const latest = merged.find(t => t.registrado_em?.length >= 10);
          if (latest) setCalDate(new Date(latest.registrado_em.slice(0,10) + "T12:00:00"));
        }
      }
    } catch { /* silencioso — localStorage é o fallback */ }
  }, []);

  useEffect(() => {
    reload();
    const iv = setInterval(() => reload(), 30_000);
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
    if (dirFilter !== "all")     list = list.filter(t => t.direction === dirFilter);
    if (stFilter !== "all")      list = list.filter(t => t.status.startsWith(stFilter));
    if (symbolSearch)            list = list.filter(t => t.simbolo.toLowerCase().includes(symbolSearch.toLowerCase()));
    return list;
  }, [trades, cat, subFilter, colorFilter, dirFilter, stFilter, symbolSearch]);

  const stats   = useMemo(() => calcStats(filtered), [filtered]);
  const catCfg  = CATS.find(c => c.id === cat)!;

  const navigateCal = (dir: -1|1) => {
    setCalDate(d => {
      const n = new Date(d);
      n.setMonth(n.getMonth() + dir);
      return n;
    });
    setSelDay(null);
  };

  return (
    <div className="min-h-screen" style={{background:"var(--bg)"}}>
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-5">

        {/* ── Header ── */}
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold" style={{color:"var(--text-primary)"}}>
              Operações Finalizadas
            </h1>
            <p className="text-xs mt-0.5" style={{color:"var(--text-muted)"}}>
              Estudo de performance · atualiza a cada 30s · última: {lastRefresh.toLocaleTimeString("pt-BR")}
            </p>
            {backendLoaded && (
              <div className="flex items-center gap-1 text-[10px] mt-0.5" style={{color:"#10b981"}}>
                <Database size={9}/>
                MySQL: {backendCount.toLocaleString("pt-BR")} trades completos
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* Vista: Lista / Calendário */}
            <div className="flex gap-0.5 p-0.5 rounded-lg" style={{background:"var(--bg-card)",border:"1px solid var(--border)"}}>
              {([
                { id:"list",     icon: List,         label:"Lista" },
                { id:"calendar", icon: CalendarDays,  label:"Calendário" },
              ] as const).map(v => (
                <button key={v.id} onClick={() => setViewMode(v.id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-semibold transition-all"
                  style={{
                    background: viewMode===v.id ? catCfg.color+"22" : "transparent",
                    color: viewMode===v.id ? catCfg.color : "var(--text-muted)",
                    border: viewMode===v.id ? `1px solid ${catCfg.color}44` : "1px solid transparent",
                  }}>
                  <v.icon size={12}/>{v.label}
                </button>
              ))}
            </div>
            <button onClick={reload}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
              style={{background:"var(--bg-card)",border:"1px solid var(--border)",color:"var(--text-muted)"}}>
              <RefreshCw size={12}/> Atualizar
            </button>
          </div>
        </div>

        {/* ── Tabs de categoria ── */}
        <div className="flex flex-wrap gap-1 p-1 rounded-xl overflow-x-auto"
          style={{background:"var(--bg-card)",border:"1px solid var(--border)"}}>
          {CATS.map(c => {
            const count = c.id === "all" ? trades.length : trades.filter(t=>t.category===c.id).length;
            const active = cat === c.id;
            return (
              <button key={c.id}
                onClick={() => { setCat(c.id); setSub("all"); }}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-semibold transition-all whitespace-nowrap"
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
        <div className="rounded-xl p-3 flex flex-wrap gap-2 items-center"
          style={{background:"var(--bg-card)",border:"1px solid var(--border)"}}>

          {/* Verde / Vermelho */}
          <div className="flex gap-0.5 p-0.5 rounded-lg" style={{background:"var(--bg)",border:"1px solid var(--border)"}}>
            {([
              { id:"all",   label:"Todos" },
              { id:"green", label:"🟢 Green" },
              { id:"red",   label:"🔴 Red" },
            ] as const).map(f => (
              <button key={f.id} onClick={() => setColor(f.id)}
                className="px-2.5 py-1 rounded-md text-[10px] font-semibold transition-all"
                style={{
                  background: colorFilter===f.id ? "var(--bg-card)" : "transparent",
                  color: colorFilter===f.id
                    ? f.id==="green" ? "#10b981" : f.id==="red" ? "#ef4444" : "var(--text-primary)"
                    : "var(--text-muted)",
                }}>
                {f.label}
              </button>
            ))}
          </div>

          {/* LONG / SHORT */}
          <div className="flex gap-0.5 p-0.5 rounded-lg" style={{background:"var(--bg)",border:"1px solid var(--border)"}}>
            {([
              { id:"all",   label:"↕ Dir" },
              { id:"LONG",  label:"↑ LONG" },
              { id:"SHORT", label:"↓ SHORT" },
            ] as const).map(f => (
              <button key={f.id} onClick={() => setDir(f.id)}
                className="px-2.5 py-1 rounded-md text-[10px] font-semibold transition-all"
                style={{
                  background: dirFilter===f.id ? "var(--bg-card)" : "transparent",
                  color: dirFilter===f.id
                    ? f.id==="LONG" ? "#10b981" : f.id==="SHORT" ? "#ef4444" : "var(--text-primary)"
                    : "var(--text-muted)",
                }}>
                {f.label}
              </button>
            ))}
          </div>

          {/* Status: TP / SL / EXP */}
          <div className="flex gap-0.5 p-0.5 rounded-lg" style={{background:"var(--bg)",border:"1px solid var(--border)"}}>
            {([
              { id:"all",      label:"Status" },
              { id:"tp",       label:"TP" },
              { id:"sl",       label:"SL" },
              { id:"expirado", label:"EXP" },
            ] as const).map(f => (
              <button key={f.id} onClick={() => setSt(f.id)}
                className="px-2.5 py-1 rounded-md text-[10px] font-semibold transition-all"
                style={{
                  background: stFilter===f.id ? "var(--bg-card)" : "transparent",
                  color: stFilter===f.id
                    ? f.id==="tp" ? "#10b981" : f.id==="sl" ? "#ef4444" : f.id==="expirado" ? "#6b7280" : "var(--text-primary)"
                    : "var(--text-muted)",
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
                    background: subFilter===s ? `${catCfg.color}22` : "var(--bg)",
                    border: `1px solid ${subFilter===s ? catCfg.color+"55" : "var(--border)"}`,
                    color: subFilter===s ? catCfg.color : "var(--text-muted)",
                  }}>
                  {s === "all" ? "Todos Bots" : s}
                </button>
              ))}
            </div>
          )}

          {/* Symbol search */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg ml-auto"
            style={{background:"var(--bg)",border:"1px solid var(--border)"}}>
            <Search size={11} style={{color:"var(--text-muted)"}}/>
            <input
              type="text"
              placeholder="Símbolo…"
              value={symbolSearch}
              onChange={e => setSymbol(e.target.value)}
              className="bg-transparent outline-none text-[11px] w-20"
              style={{color:"var(--text-primary)"}}
            />
            {symbolSearch && (
              <button onClick={() => setSymbol("")}>
                <X size={10} style={{color:"var(--text-muted)"}}/>
              </button>
            )}
          </div>

          <span className="text-[11px]" style={{color:"var(--text-muted)"}}>
            {filtered.length} ops
          </span>
        </div>

        {/* ── Métricas ── */}
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
              color="#10b981" icon={TrendingUp}/>
            <StatCard label="Avg Perda"
              value={`-${stats.avgLoss.toFixed(2)}%`}
              sub={`${stats.losses} trades`}
              color="#ef4444" icon={TrendingDown}/>
            <StatCard label="Melhor Trade"
              value={fPct(stats.bestPct)}
              color="#10b981" icon={Flame}/>
            <StatCard label="Pior Trade"
              value={fPct(stats.worstPct)}
              color="#ef4444" icon={AlertTriangle}/>
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
              Nenhuma operação{cat!=="all"?` em ${catCfg.label}`:""}
            </p>
            <p className="text-xs" style={{color:"var(--text-muted)",opacity:0.6}}>
              Complete operações nas páginas Sinais IA, Futuros, Scalp, Bots ou Day Trade
            </p>
          </div>
        )}

        {/* ── Resumo por categoria (só no modo Tudo) ── */}
        {cat === "all" && trades.length > 0 && viewMode === "list" && (
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

        {/* ── Calendário ── */}
        {viewMode === "calendar" && (
          <CalendarView
            trades={filtered}
            calDate={calDate}
            onNavigate={navigateCal}
            onSelectDay={setSelDay}
            selectedDay={selectedDay}
          />
        )}

        {/* ── Lista de operações ── */}
        {viewMode === "list" && filtered.length > 0 && (
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
                <div className="flex items-center gap-3 px-3 py-1.5" style={{background:"var(--bg)"}}>
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
