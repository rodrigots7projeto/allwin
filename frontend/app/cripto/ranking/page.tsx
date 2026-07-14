"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import {
  Trophy, Activity,
  X, Bot, Zap, Target, Flame, RefreshCw, ChevronDown, ChevronUp,
  Cpu,
} from "lucide-react";

// ── Interfaces ────────────────────────────────────────────────────────────────

interface TradeLite {
  id: string;
  simbolo: string;
  direction: "LONG" | "SHORT";
  pnl_pct: number | null;
  pnl_brl: number | null;
  status: string;
  leverage: number | null;
  registrado_em: string;
  motivo_entrada?: string;
  motivo_saida?: string;
}

interface RankEntry {
  id: string;
  name: string;
  category: CatId;
  totalPnl: number;
  totalBrl: number;
  wins: number;
  losses: number;
  total: number;
  winRate: number;
  avgGain: number;
  avgLoss: number;
  profitFactor: number;
  bestTrade: number;
  worstTrade: number;
  streak: number;       // current win/loss streak
  trades: TradeLite[];
}

// ── Category config ───────────────────────────────────────────────────────────

const CATS = [
  { id: "daytrade"        as const, label: "Carteira",     color: "#3b82f6", icon: Activity,   desc: "Perfis Day Trade"    },
  { id: "futures_ia"      as const, label: "IA Análise",   color: "#f59e0b", icon: Target,     desc: "Símbolo por IA"      },
  { id: "futuros_ia_tiro" as const, label: "Tiro Certo IA",color: "#22c55e", icon: Zap,        desc: "Símbolo Tiro Curto"  },
  { id: "scalp"           as const, label: "Scalp",        color: "#22d3ee", icon: Flame,      desc: "Perfis Scalp"        },
  { id: "bot"             as const, label: "Bot",          color: "#a855f7", icon: Bot,        desc: "Bots Futuros"        },
  { id: "srd_bot"         as const, label: "BOT SRD",      color: "#10b981", icon: Cpu,        desc: "Bots SRD"            },
] as const;

type CatId = typeof CATS[number]["id"];

// ── Stats helper ──────────────────────────────────────────────────────────────

function computeStats(trades: TradeLite[]) {
  const withPnl = trades.filter(t => t.pnl_pct != null && !isNaN(t.pnl_pct!));
  const wins    = withPnl.filter(t => (t.pnl_pct ?? 0) > 0);
  const losses  = withPnl.filter(t => (t.pnl_pct ?? 0) < 0);
  const totalPnl = withPnl.reduce((s, t) => s + (t.pnl_pct ?? 0), 0);
  const totalBrl = trades.reduce((s, t) => s + (t.pnl_brl ?? 0), 0);
  const winRate  = withPnl.length ? (wins.length / withPnl.length) * 100 : 0;
  const avgGain  = wins.length   ? wins.reduce((s,t)=>s+(t.pnl_pct??0),0)/wins.length : 0;
  const avgLoss  = losses.length ? Math.abs(losses.reduce((s,t)=>s+(t.pnl_pct??0),0)/losses.length) : 0;
  const grossW   = wins.reduce((s,t)=>s+(t.pnl_pct??0),0);
  const grossL   = Math.abs(losses.reduce((s,t)=>s+(t.pnl_pct??0),0));
  const profitFactor = grossL>0 ? grossW/grossL : grossW>0 ? 99 : 0;
  const allPcts  = withPnl.map(t => t.pnl_pct ?? 0);
  // current streak
  let streak = 0;
  for (let i = trades.length - 1; i >= 0; i--) {
    const p = trades[i].pnl_pct;
    if (p == null) break;
    if (streak === 0) streak = p > 0 ? 1 : -1;
    else if (streak > 0 && p > 0) streak++;
    else if (streak < 0 && p < 0) streak--;
    else break;
  }
  return {
    totalPnl, totalBrl,
    wins: wins.length, losses: losses.length, total: trades.length,
    winRate, avgGain, avgLoss, profitFactor,
    bestTrade:  allPcts.length ? Math.max(...allPcts) : 0,
    worstTrade: allPcts.length ? Math.min(...allPcts) : 0,
    streak,
  };
}

// ── Data loaders ──────────────────────────────────────────────────────────────

function loadRankings(): Record<CatId, RankEntry[]> {
  const empty: Record<CatId, RankEntry[]> = {
    daytrade:[], futures_ia:[], futuros_ia_tiro:[], scalp:[], bot:[], srd_bot:[],
  };
  if (typeof window === "undefined") return empty;

  try {
    // — DayTrade —
    const dtWallets: Record<string, any> = JSON.parse(localStorage.getItem("allwin_dt_wallets_v2") ?? "{}");
    empty.daytrade = Object.entries(dtWallets).map(([id, w]) => {
      const trades: TradeLite[] = (w.trades ?? []).filter((t: any) => t.tipo === "V").map((t: any) => ({
        id: t.id, simbolo: t.simbolo,
        direction: (t.direction ?? "LONG") as "LONG"|"SHORT",
        pnl_pct: t.pct ?? null, pnl_brl: t.pnl_brl ?? null,
        status: (t.pnl_brl ?? 0) >= 0 ? "tp" : "sl", leverage: null,
        registrado_em: t.time ? new Date(t.time).toISOString() : "",
        motivo_entrada: t.motivo_entrada, motivo_saida: t.motivo_saida,
      }));
      return { id, name: w.perfil_nome ?? id, category: "daytrade" as const, trades, ...computeStats(trades) };
    }).filter(e => e.total > 0).sort((a,b) => b.totalPnl - a.totalPnl);
  } catch {}

  try {
    // — Futures IA (grouped by symbol) —
    const hist: any[] = JSON.parse(localStorage.getItem("allwin_trade_hist") ?? "[]");
    const iaMap:   Record<string, TradeLite[]> = {};
    const tiroMap: Record<string, TradeLite[]> = {};
    for (const e of hist.filter(e => e.source === "futures_ia" && e.status !== "aberto")) {
      const lev = e.leverage ?? 1;
      let pnl_pct: number | null = null;
      if (e.status === "tp" && e.tp_pct != null) pnl_pct =  e.tp_pct * lev;
      if (e.status === "sl" && e.sl_pct != null) pnl_pct = -e.sl_pct * lev;
      const tl: TradeLite = {
        id: e.id, simbolo: e.simbolo,
        direction: (e.direction ?? "LONG") as "LONG"|"SHORT",
        pnl_pct, pnl_brl: null, status: e.status,
        leverage: lev, registrado_em: e.registrado_em ?? "",
      };
      const map = String(e.id ?? "").startsWith("ia_tiro_") ? tiroMap : iaMap;
      (map[e.simbolo] ??= []).push(tl);
    }
    empty.futures_ia = Object.entries(iaMap).map(([sym, trades]) => ({
      id: sym, name: sym, category: "futures_ia" as const, trades, ...computeStats(trades),
    })).filter(e => e.total > 0).sort((a,b) => b.totalPnl - a.totalPnl);
    empty.futuros_ia_tiro = Object.entries(tiroMap).map(([sym, trades]) => ({
      id: sym, name: sym, category: "futuros_ia_tiro" as const, trades, ...computeStats(trades),
    })).filter(e => e.total > 0).sort((a,b) => b.totalPnl - a.totalPnl);
  } catch {}

  try {
    // — Scalp / Futuros wallets —
    const futWallets: Record<string, any> = JSON.parse(localStorage.getItem("allwin_futures_wallets_v1") ?? "{}");
    empty.scalp = Object.entries(futWallets)
      .filter(([id]) => id.startsWith("f_scalp"))
      .map(([id, w]) => {
        const trades: TradeLite[] = (w.trades ?? []).filter((t: any) => t.tipo === "V").map((t: any) => {
          const pnl_pct = t.pct ?? null;
          const pnl_brl = t.pnl_brl ?? null;
          return { id: t.id, simbolo: t.simbolo, direction: (t.direction ?? "LONG") as "LONG"|"SHORT", pnl_pct, pnl_brl, status: (pnl_brl ?? 0) >= 0 ? "tp" : "sl", leverage: null, registrado_em: t.time ? new Date(t.time).toISOString() : "", motivo_entrada: t.motivo_entrada, motivo_saida: t.motivo_saida };
        });
        return { id, name: w.perfil_nome ?? id, category: "scalp" as const, trades, ...computeStats(trades) };
      }).filter(e => e.total > 0).sort((a,b) => b.totalPnl - a.totalPnl);
  } catch {}

  try {
    // — Bots —
    const botWallets: Record<string, any> = JSON.parse(localStorage.getItem("allwin_bot_wallets_v1") ?? "{}");
    empty.bot = Object.entries(botWallets).map(([id, w]) => {
      const trades: TradeLite[] = (w.trades ?? []).filter((t: any) => t.tipo === "V").map((t: any) => {
        const pnl_pct = t.pct ?? null;
        const pnl_brl = t.pnl_brl ?? null;
        return { id: t.id, simbolo: t.simbolo, direction: (t.direction ?? "LONG") as "LONG"|"SHORT", pnl_pct, pnl_brl, status: (pnl_brl ?? 0) >= 0 ? "tp" : "sl", leverage: null, registrado_em: t.time ? new Date(t.time).toISOString() : "", motivo_entrada: t.motivo_entrada, motivo_saida: t.motivo_saida };
      });
      return { id, name: w.perfil_nome ?? id, category: "bot" as const, trades, ...computeStats(trades) };
    }).filter(e => e.total > 0).sort((a,b) => b.totalPnl - a.totalPnl);
  } catch {}

  try {
    // — BOT SRD —
    const srdWallets: Record<string, any> = JSON.parse(localStorage.getItem("allwin_srd_wallets_v1") ?? "{}");
    empty.srd_bot = Object.entries(srdWallets).map(([id, w]) => {
      const trades: TradeLite[] = (w.trades ?? []).filter((t: any) => t.status !== "aberto").map((t: any) => {
        const lev = t.leverage ?? 1;
        let pnl_pct: number | null = null;
        if (t.status === "tp") pnl_pct =  (t.tp_pct ?? 0) * lev;
        if (t.status === "sl") pnl_pct = -(t.sl_pct ?? 0) * lev;
        return { id: t.id, simbolo: t.simbolo, direction: (t.direction ?? "LONG") as "LONG"|"SHORT", pnl_pct, pnl_brl: null, status: t.status, leverage: lev, registrado_em: t.registrado_em ?? "", motivo_entrada: t.motivo_entrada };
      });
      return { id, name: w.botId ?? id, category: "srd_bot" as const, trades, ...computeStats(trades) };
    }).filter(e => e.total > 0).sort((a,b) => b.totalPnl - a.totalPnl);
  } catch {}

  return empty;
}

// ── Formatters ────────────────────────────────────────────────────────────────

const fPct = (v: number) => `${v>=0?"+":""}${v.toFixed(2)}%`;
const fPF  = (v: number) => v >= 99 ? "∞" : v.toFixed(2);
function fDate(iso: string) {
  try { return new Date(iso).toLocaleString("pt-BR",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"}); }
  catch { return iso; }
}
function statusColor(s: string) {
  if (s === "sl") return "#ef4444";
  if (s === "expirado") return "#6b7280";
  return "#10b981";
}

// ── Podium ────────────────────────────────────────────────────────────────────

const MEDAL_CONFIG = [
  { rank: 2, label: "2º", bgGrad: "linear-gradient(180deg,#94a3b8,#64748b)", textColor: "#e2e8f0", h: 96,  icon: "🥈", glow: "#94a3b822" },
  { rank: 1, label: "1º", bgGrad: "linear-gradient(180deg,#fbbf24,#f59e0b)", textColor: "#1c1207", h: 132, icon: "🥇", glow: "#fbbf2444" },
  { rank: 3, label: "3º", bgGrad: "linear-gradient(180deg,#cd7f32,#a0522d)", textColor: "#fef3c7", h: 72,  icon: "🥉", glow: "#cd7f3222" },
];

function PodiumBlock({ entry, rank, selected, onSelect, color }: {
  entry: RankEntry; rank: number; selected: boolean; onSelect: () => void; color: string;
}) {
  const cfg = MEDAL_CONFIG.find(m => m.rank === rank)!;
  return (
    <div className="flex flex-col items-center gap-2 flex-1 max-w-[200px]" style={{ marginTop: rank === 1 ? 0 : rank === 2 ? 36 : 60 }}>
      {/* Avatar / medal */}
      <button
        onClick={onSelect}
        className="flex flex-col items-center gap-1.5 transition-all duration-200 group"
        style={{ transform: selected ? "scale(1.08)" : "scale(1)" }}
      >
        <div className="text-4xl">{cfg.icon}</div>
        <div className="text-[13px] font-extrabold" style={{ color }}>{entry.name}</div>
        <div
          className="text-xl font-black tabular-nums"
          style={{ color: entry.totalPnl >= 0 ? "#10b981" : "#ef4444" }}
        >
          {fPct(entry.totalPnl)}
        </div>
        <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>
          {entry.total} ops · WR {entry.winRate.toFixed(0)}%
        </div>
      </button>

      {/* Podium block */}
      <div
        onClick={onSelect}
        className="w-full rounded-t-xl cursor-pointer transition-all duration-200 flex items-center justify-center"
        style={{
          height: cfg.h,
          background: selected ? cfg.bgGrad : "var(--bg-card)",
          border: selected ? `2px solid ${color}` : "2px solid var(--border)",
          boxShadow: selected ? `0 0 24px ${cfg.glow}` : undefined,
        }}
      >
        <span
          className="text-2xl font-black"
          style={{ color: selected ? cfg.textColor : "var(--text-muted)", opacity: selected ? 1 : 0.3 }}
        >
          {cfg.label}
        </span>
      </div>
    </div>
  );
}

// ── Rank List Item ────────────────────────────────────────────────────────────

function RankListItem({ entry, rank, selected, onSelect, color }: {
  entry: RankEntry; rank: number; selected: boolean; onSelect: () => void; color: string;
}) {
  const medal = rank <= 3 ? ["🥇","🥈","🥉"][rank-1] : null;
  return (
    <button
      onClick={onSelect}
      className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all duration-150"
      style={{
        background: selected ? `${color}15` : "var(--bg-card)",
        border: `1px solid ${selected ? color+"66" : "var(--border)"}`,
        transform: selected ? "scale(1.005)" : "scale(1)",
      }}
    >
      <span className="text-lg w-8 text-center shrink-0">{medal ?? `#${rank}`}</span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-bold truncate" style={{ color: "var(--text-primary)" }}>{entry.name}</div>
        <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>
          {entry.total} ops · WR {entry.winRate.toFixed(0)}% · PF {fPF(entry.profitFactor)}
        </div>
      </div>
      {entry.streak !== 0 && (
        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md shrink-0"
          style={{ background: entry.streak > 0 ? "#10b98122" : "#ef444422", color: entry.streak > 0 ? "#10b981" : "#ef4444" }}>
          {entry.streak > 0 ? "🔥" : "❄️"} {Math.abs(entry.streak)}
        </span>
      )}
      <div className="text-right shrink-0">
        <div className="text-sm font-black tabular-nums"
          style={{ color: entry.totalPnl >= 0 ? "#10b981" : "#ef4444" }}>
          {fPct(entry.totalPnl)}
        </div>
        {entry.totalBrl !== 0 && (
          <div className="text-[10px] tabular-nums" style={{ color: "var(--text-muted)" }}>
            R$ {entry.totalBrl >= 0 ? "+" : ""}{entry.totalBrl.toFixed(0)}
          </div>
        )}
      </div>
    </button>
  );
}

// ── Trade Row (expandable) ────────────────────────────────────────────────────

function TradeDetailRow({ t }: { t: TradeLite }) {
  const [expanded, setExpanded] = useState(false);
  const pnl = t.pnl_pct ?? 0;
  const isWin = pnl > 0;
  const hasMotivo = !!(t.motivo_entrada || t.motivo_saida);
  return (
    <div style={{ borderBottom: "1px solid var(--border)" }}>
      <div
        className="flex items-center gap-3 px-4 py-2.5 hover:bg-[var(--bg)] transition-colors"
        style={{ cursor: hasMotivo ? "pointer" : "default" }}
        onClick={() => hasMotivo && setExpanded(v => !v)}
      >
        <div className="flex flex-col min-w-[56px]">
          <span className="text-xs font-bold" style={{ color: "var(--text-primary)" }}>{t.simbolo}</span>
          <span className="text-[9px] font-semibold" style={{ color: t.direction === "LONG" ? "#10b981" : "#ef4444" }}>
            {t.direction}{t.leverage && t.leverage > 1 ? ` ${t.leverage}x` : ""}
          </span>
        </div>
        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded"
          style={{ background: `${statusColor(t.status)}22`, color: statusColor(t.status) }}>
          {t.status === "sl" ? "SL" : t.status === "expirado" ? "EXP" : "TP"}
        </span>
        <span className="ml-auto text-xs font-bold tabular-nums"
          style={{ color: isWin ? "#10b981" : "#ef4444" }}>
          {t.pnl_pct != null ? fPct(pnl) : "—"}
        </span>
        <span className="text-[10px] w-24 text-right" style={{ color: "var(--text-muted)" }}>
          {fDate(t.registrado_em)}
        </span>
        {hasMotivo && (
          <span className="text-[9px]" style={{ color: "var(--text-muted)", opacity: 0.5 }}>
            {expanded ? "▲" : "▼"}
          </span>
        )}
      </div>
      {expanded && hasMotivo && (
        <div className="px-4 pb-2 pt-1 flex flex-col gap-1" style={{ background: "var(--bg)" }}>
          {t.motivo_entrada && (
            <div className="flex gap-2 items-start">
              <span className="text-[9px] font-bold uppercase tracking-wide mt-0.5 shrink-0" style={{ color: "#10b981" }}>Entrada</span>
              <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{t.motivo_entrada}</span>
            </div>
          )}
          {t.motivo_saida && (
            <div className="flex gap-2 items-start">
              <span className="text-[9px] font-bold uppercase tracking-wide mt-0.5 shrink-0" style={{ color: isWin ? "#10b981" : "#ef4444" }}>Saída</span>
              <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{t.motivo_saida}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Detail Panel ──────────────────────────────────────────────────────────────

function StatChip({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex flex-col gap-0.5 px-3 py-2 rounded-xl"
      style={{ background: "var(--bg)", border: "1px solid var(--border)" }}>
      <span className="text-[9px] font-bold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>{label}</span>
      <span className="text-base font-black tabular-nums" style={{ color: color ?? "var(--text-primary)" }}>{value}</span>
    </div>
  );
}

function DetailPanel({ entry, color, onClose }: { entry: RankEntry; color: string; onClose: () => void }) {
  const [showAll, setShowAll] = useState(false);
  const trades = showAll ? entry.trades : entry.trades.slice(0, 20);

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: "var(--bg-card)", border: `2px solid ${color}44` }}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid var(--border)" }}>
        <div>
          <h3 className="text-base font-black" style={{ color: "var(--text-primary)" }}>{entry.name}</h3>
          <p className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>
            {entry.total} operações · {entry.wins}W / {entry.losses}L
          </p>
        </div>
        <button onClick={onClose}
          className="flex items-center justify-center w-7 h-7 rounded-lg transition-colors"
          style={{ border: "1px solid var(--border)", background: "var(--bg)" }}>
          <X size={14} style={{ color: "var(--text-muted)" }} />
        </button>
      </div>

      {/* Stats grid */}
      <div className="p-4 grid grid-cols-3 sm:grid-cols-6 gap-2">
        <StatChip label="Total P&L"
          value={fPct(entry.totalPnl)}
          color={entry.totalPnl >= 0 ? "#10b981" : "#ef4444"} />
        <StatChip label="Win Rate"
          value={`${entry.winRate.toFixed(1)}%`}
          color={entry.winRate >= 55 ? "#10b981" : entry.winRate >= 45 ? "#f59e0b" : "#ef4444"} />
        <StatChip label="Profit Factor"
          value={fPF(entry.profitFactor)}
          color={entry.profitFactor >= 2 ? "#10b981" : entry.profitFactor >= 1 ? "#f59e0b" : "#ef4444"} />
        <StatChip label="Avg Ganho"
          value={`+${entry.avgGain.toFixed(2)}%`}
          color="#10b981" />
        <StatChip label="Avg Perda"
          value={`-${entry.avgLoss.toFixed(2)}%`}
          color="#ef4444" />
        <StatChip label="Streak atual"
          value={entry.streak === 0 ? "—" : `${entry.streak > 0 ? "+" : ""}${entry.streak}`}
          color={entry.streak > 0 ? "#10b981" : entry.streak < 0 ? "#ef4444" : "var(--text-muted)"} />
        <StatChip label="Melhor Trade"
          value={fPct(entry.bestTrade)}
          color="#10b981" />
        <StatChip label="Pior Trade"
          value={fPct(entry.worstTrade)}
          color="#ef4444" />
        {entry.totalBrl !== 0 && (
          <StatChip label="P&L R$"
            value={`R$ ${entry.totalBrl >= 0 ? "+" : ""}${entry.totalBrl.toFixed(0)}`}
            color={entry.totalBrl >= 0 ? "#10b981" : "#ef4444"} />
        )}
      </div>

      {/* Trade list */}
      <div style={{ borderTop: "1px solid var(--border)" }}>
        <div className="flex items-center justify-between px-4 py-2"
          style={{ background: "var(--bg)" }}>
          <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
            Operações ({entry.total})
          </span>
          <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
            P&L
          </span>
        </div>
        <div style={{ maxHeight: 360, overflowY: "auto" }}>
          {trades.map(t => <TradeDetailRow key={t.id} t={t} />)}
        </div>
        {entry.trades.length > 20 && (
          <div className="p-3 text-center" style={{ borderTop: "1px solid var(--border)" }}>
            <button onClick={() => setShowAll(v => !v)}
              className="flex items-center gap-1.5 mx-auto text-[11px] font-semibold transition-colors"
              style={{ color: color }}>
              {showAll ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              {showAll ? "Mostrar menos" : `Ver todas (${entry.trades.length})`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Category Section ──────────────────────────────────────────────────────────

function CategorySection({ entries, catCfg }: {
  entries: RankEntry[];
  catCfg: typeof CATS[number];
}) {
  const [selected, setSelected] = useState<RankEntry | null>(null);
  const color = catCfg.color;

  const top3   = entries.slice(0, 3);
  const rest   = entries.slice(3);

  // Podium order: 2nd (left), 1st (center), 3rd (right)
  const podiumOrder = top3.length === 0 ? [] :
    top3.length === 1 ? [top3[0]] :
    top3.length === 2 ? [top3[1], top3[0]] :
    [top3[1], top3[0], top3[2]];
  const podiumRanks = top3.length === 1 ? [1] : top3.length === 2 ? [2, 1] : [2, 1, 3];

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 rounded-xl gap-2"
        style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
        <Trophy size={28} style={{ color: "var(--text-muted)", opacity: 0.3 }} />
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          Sem operações finalizadas em {catCfg.label}
        </p>
        <p className="text-[11px]" style={{ color: "var(--text-muted)", opacity: 0.6 }}>
          Complete operações para ver o ranking
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Podium */}
      <div className="rounded-2xl overflow-hidden"
        style={{ background: "var(--bg-card)", border: `1px solid ${color}33` }}>
        {/* Section header */}
        <div className="flex items-center gap-3 px-5 py-4" style={{ borderBottom: "1px solid var(--border)" }}>
          <catCfg.icon size={16} style={{ color }} />
          <div>
            <h2 className="text-sm font-black" style={{ color: "var(--text-primary)" }}>{catCfg.label}</h2>
            <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>{catCfg.desc} · {entries.length} participantes</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-[11px] font-bold" style={{ color }}>
              Líder: {entries[0].name}
            </span>
            <span className="text-[11px] font-black tabular-nums"
              style={{ color: entries[0].totalPnl >= 0 ? "#10b981" : "#ef4444" }}>
              {fPct(entries[0].totalPnl)}
            </span>
          </div>
        </div>

        {/* Podium stage */}
        {top3.length > 0 && (
          <div className="flex items-end justify-center gap-3 px-6 pt-8 pb-0">
            {podiumOrder.map((entry, i) => (
              <PodiumBlock
                key={entry.id}
                entry={entry}
                rank={podiumRanks[i]}
                selected={selected?.id === entry.id}
                onSelect={() => setSelected(s => s?.id === entry.id ? null : entry)}
                color={color}
              />
            ))}
          </div>
        )}
      </div>

      {/* Detail panel (if selected from podium) */}
      {selected && (
        <DetailPanel entry={selected} color={color} onClose={() => setSelected(null)} />
      )}

      {/* Full ranked list */}
      <div className="flex flex-col gap-2">
        <p className="text-[11px] font-bold uppercase tracking-wide px-1" style={{ color: "var(--text-muted)" }}>
          Ranking completo
        </p>
        {entries.map((entry, i) => (
          <RankListItem
            key={entry.id}
            entry={entry}
            rank={i + 1}
            selected={selected?.id === entry.id}
            onSelect={() => setSelected(s => s?.id === entry.id ? null : entry)}
            color={color}
          />
        ))}
      </div>

      {/* Detail for list item (if selected from list and not top3) */}
      {selected && !top3.find(e => e.id === selected.id) && (
        <DetailPanel entry={selected} color={color} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}

// ── Overall top 3 ─────────────────────────────────────────────────────────────

function OverallPodium({ rankings }: { rankings: Record<CatId, RankEntry[]> }) {
  const [selected, setSelected] = useState<(RankEntry & { catLabel: string; catColor: string }) | null>(null);

  const all = useMemo(() => {
    const out: (RankEntry & { catLabel: string; catColor: string })[] = [];
    for (const cat of CATS) {
      for (const e of rankings[cat.id]) {
        out.push({ ...e, catLabel: cat.label, catColor: cat.color });
      }
    }
    return out.sort((a, b) => b.totalPnl - a.totalPnl);
  }, [rankings]);

  const top3 = all.slice(0, 3);
  if (top3.length === 0) return null;

  const podiumOrder = top3.length === 1 ? [top3[0]] : top3.length === 2 ? [top3[1], top3[0]] : [top3[1], top3[0], top3[2]];
  const podiumRanks = top3.length === 1 ? [1] : top3.length === 2 ? [2, 1] : [2, 1, 3];

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-2xl overflow-hidden"
        style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
        <div className="flex items-center gap-3 px-5 py-4" style={{ borderBottom: "1px solid var(--border)" }}>
          <Trophy size={18} style={{ color: "#fbbf24" }} />
          <div>
            <h2 className="text-sm font-black" style={{ color: "var(--text-primary)" }}>Ranking Geral — Todos os Perfis</h2>
            <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
              Melhor desempenho em todas as categorias · {all.length} participantes
            </p>
          </div>
        </div>
        <div className="flex items-end justify-center gap-3 px-6 pt-8 pb-0">
          {podiumOrder.map((entry, i) => (
            <PodiumBlock
              key={entry.id + entry.category}
              entry={entry}
              rank={podiumRanks[i]}
              selected={selected?.id === entry.id && selected?.category === entry.category}
              onSelect={() => setSelected(s => s?.id === entry.id && s?.category === entry.category ? null : entry)}
              color={entry.catColor}
            />
          ))}
        </div>
        {/* category badges below podium */}
        <div className="flex justify-center gap-6 pb-4 pt-4">
          {podiumOrder.map((entry) => (
            <span key={entry.id + entry.category}
              className="text-[10px] font-bold px-2 py-1 rounded-lg"
              style={{ background: `${entry.catColor}22`, color: entry.catColor }}>
              {entry.catLabel}
            </span>
          ))}
        </div>
      </div>

      {selected && (
        <DetailPanel
          entry={selected}
          color={selected.catColor}
          onClose={() => setSelected(null)}
        />
      )}

      {/* Top 10 list */}
      <div className="flex flex-col gap-2">
        <p className="text-[11px] font-bold uppercase tracking-wide px-1" style={{ color: "var(--text-muted)" }}>
          Top 10 geral
        </p>
        {all.slice(0, 10).map((entry, i) => {
          const cat = CATS.find(c => c.id === entry.category)!;
          return (
            <div key={entry.id + entry.category} className="flex items-center gap-3">
              <RankListItem
                entry={entry}
                rank={i + 1}
                selected={selected?.id === entry.id && selected?.category === entry.category}
                onSelect={() => setSelected(s => s?.id === entry.id && s?.category === entry.category ? null : entry)}
                color={cat.color}
              />
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0 hidden sm:inline"
                style={{ background: `${cat.color}22`, color: cat.color }}>
                {cat.label}
              </span>
            </div>
          );
        })}
      </div>

      {selected && !top3.find(e => e.id === selected.id && e.category === selected.category) && (
        <DetailPanel entry={selected} color={selected.catColor} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function RankingPage() {
  const [rankings, setRankings] = useState<Record<CatId, RankEntry[]>>({
    daytrade:[], futures_ia:[], futuros_ia_tiro:[], scalp:[], bot:[], srd_bot:[],
  });
  const [activeCat, setActiveCat] = useState<"geral" | CatId>("geral");
  const [lastRefresh, setLast] = useState(new Date());

  const reload = useCallback(() => {
    setRankings(loadRankings());
    setLast(new Date());
  }, []);

  useEffect(() => {
    reload();
    window.addEventListener("focus", reload);
    return () => window.removeEventListener("focus", reload);
  }, [reload]);

  const totalOps = useMemo(
    () => Object.values(rankings).reduce((s, arr) => s + arr.reduce((ss, e) => ss + e.total, 0), 0),
    [rankings]
  );

  const totalParticipants = useMemo(
    () => Object.values(rankings).reduce((s, arr) => s + arr.length, 0),
    [rankings]
  );

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-5">

        {/* ── Header ── */}
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Trophy size={22} style={{ color: "#fbbf24" }} />
              <h1 className="text-2xl font-black" style={{ color: "var(--text-primary)" }}>
                Ranking
              </h1>
            </div>
            <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
              {totalParticipants} perfis · {totalOps} operações · última atualização: {lastRefresh.toLocaleTimeString("pt-BR")}
            </p>
          </div>
          <button onClick={reload}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold"
            style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-muted)" }}>
            <RefreshCw size={12}/> Atualizar
          </button>
        </div>

        {/* ── Category tabs ── */}
        <div className="flex flex-wrap gap-1 p-1 rounded-xl overflow-x-auto"
          style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <button
            onClick={() => setActiveCat("geral")}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-semibold transition-all whitespace-nowrap"
            style={{
              background: activeCat === "geral" ? "#fbbf2422" : "transparent",
              border: activeCat === "geral" ? "1px solid #fbbf2455" : "1px solid transparent",
              color: activeCat === "geral" ? "#fbbf24" : "var(--text-muted)",
            }}>
            <Trophy size={11}/> Geral
          </button>
          {CATS.map(c => {
            const count = rankings[c.id].length;
            const active = activeCat === c.id;
            return (
              <button key={c.id} onClick={() => setActiveCat(c.id)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-semibold transition-all whitespace-nowrap"
                style={{
                  background: active ? `${c.color}22` : "transparent",
                  border: active ? `1px solid ${c.color}55` : "1px solid transparent",
                  color: active ? c.color : "var(--text-muted)",
                }}>
                <c.icon size={11}/>
                {c.label}
                <span className="text-[9px] opacity-60">({count})</span>
              </button>
            );
          })}
        </div>

        {/* ── Content ── */}
        {activeCat === "geral" ? (
          <OverallPodium rankings={rankings} />
        ) : (
          <CategorySection
            entries={rankings[activeCat]}
            catCfg={CATS.find(c => c.id === activeCat)!}
          />
        )}

      </div>
    </div>
  );
}
