"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Link from "next/link";
import {
  Brain, ChevronRight, TrendingUp, TrendingDown, RefreshCw,
  Clock, CheckCircle, XCircle, Circle, Search, SlidersHorizontal,
  Activity, Target, BarChart2, ArrowUpDown, Zap, X,
} from "lucide-react";

const API = "https://allwin-backend-production.up.railway.app/api/v1";
const BINANCE = "https://api.binance.com/api/v3";

const C = {
  brain:   "#6366f1",
  emerald: "#10b981",
  amber:   "#f59e0b",
  red:     "#ef4444",
  purple:  "#a855f7",
  gold:    "#fbbf24",
  cyan:    "#22d3ee",
  border:  "rgba(99,102,241,0.2)",
  bg:      "rgba(99,102,241,0.05)",
};

function brainTier(score: number) {
  if (score >= 85) return { label: "PREMIUM",      emoji: "🟢", color: C.gold,    bg: "rgba(251,191,36,0.08)",  border: "rgba(251,191,36,0.25)"  };
  if (score >= 70) return { label: "FORTE",         emoji: "🔵", color: "#60a5fa", bg: "rgba(96,165,250,0.08)",  border: "rgba(96,165,250,0.25)"  };
  if (score >= 55) return { label: "MODERADA",      emoji: "🟡", color: C.amber,   bg: "rgba(245,158,11,0.08)",  border: "rgba(245,158,11,0.25)"  };
  return              { label: "EXPERIMENTAL", emoji: "⚪", color: C.purple,  bg: "rgba(168,85,247,0.08)",  border: "rgba(168,85,247,0.25)"  };
}

interface Signal {
  id: string;
  simbolo: string;
  direction: string;
  source: string;
  confianca: number;
  score_tecnico?: number;
  score_fluxo?: number;
  score_contexto?: number;
  score_fundamental?: number;
  price_entrada?: number;
  tp_pct?: number;
  sl_pct?: number;
  status: string;
  aprovado: boolean;
  motivo?: string;
  pnl_pct?: number;
  telegram_entry: boolean;
  registrado_em?: string;
  fechado_em?: string;
}

type FilterTab = "todas" | "abertas" | "finalizadas" | "tp" | "sl";
type SortKey   = "data" | "confianca" | "pnl" | "simbolo";

interface ProcessProgress {
  total: number;
  done: number;
  tp: number;
  sl: number;
  skip: number;
  current: string;
  running: boolean;
}

function fmtDate(iso?: string) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) + " " +
           d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  } catch { return "—"; }
}

function fmtPrice(v?: number) {
  if (v == null) return "—";
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

// ── Binance klines (4h = ~83 dias cobertos com limit=500) ──
type Kline = [number, string, string, string, string, string];

async function fetchKlines(symbol: string, interval = "4h", limit = 500): Promise<Kline[]> {
  try {
    const r = await fetch(`${BINANCE}/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`);
    if (!r.ok) return [];
    return await r.json();
  } catch { return []; }
}

// ── Verifica TP/SL em klines históricas ──────────────────
function checkKlines(
  sig: Signal,
  klines: Kline[],
): { status: "tp" | "sl"; pnl_pct: number } | null {
  if (!sig.price_entrada) return null;
  const entry    = sig.price_entrada;
  const tpPct    = sig.tp_pct  ?? 2.0;
  const slPct    = sig.sl_pct  ?? 1.0;
  const isLong   = sig.direction.toUpperCase() === "LONG";
  const tpPrice  = isLong ? entry * (1 + tpPct / 100) : entry * (1 - tpPct / 100);
  const slPrice  = isLong ? entry * (1 - slPct / 100) : entry * (1 + slPct / 100);
  const entryTs  = sig.registrado_em ? new Date(sig.registrado_em).getTime() : 0;

  for (const k of klines) {
    const ts   = k[0];
    if (ts < entryTs) continue;           // candle anterior ao sinal
    const high = parseFloat(k[2]);
    const low  = parseFloat(k[3]);

    if (isLong) {
      if (high >= tpPrice) return { status: "tp", pnl_pct: +tpPct };
      if (low  <= slPrice) return { status: "sl", pnl_pct: -slPct };
    } else {
      if (low  <= tpPrice) return { status: "tp", pnl_pct: +tpPct };
      if (high >= slPrice) return { status: "sl", pnl_pct: -slPct };
    }
  }
  return null;
}

// ── PATCH no backend ──────────────────────────────────────
async function patchSignal(id: string, status: "tp" | "sl", pnl_pct: number) {
  try {
    await fetch(`${API}/cerebro/signal/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, pnl_pct, fechado_em: new Date().toISOString(), telegram_exit: false }),
    });
  } catch { /* fallback apenas local */ }
}

// ────────────────────────────────────────────────────────
export default function FuturesHistorico() {
  const [signals,  setSignals]  = useState<Signal[]>([]);
  const [loading,  setLoading]  = useState(false);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [tab,      setTab]      = useState<FilterTab>("todas");
  const [search,   setSearch]   = useState("");
  const [sortKey,  setSortKey]  = useState<SortKey>("data");
  const [sortDesc, setSortDesc] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [closing,  setClosing]  = useState<string | null>(null);
  const [progress, setProgress] = useState<ProcessProgress>({ total: 0, done: 0, tp: 0, sl: 0, skip: 0, current: "", running: false });
  const abortRef = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/cerebro/signals?limit=500`);
      if (res.ok) {
        const data: Signal[] = await res.json();
        localStorage.setItem("allwin_cerebro_v1", JSON.stringify(data));
        setSignals(data);
      } else {
        const cached = localStorage.getItem("allwin_cerebro_v1");
        if (cached) setSignals(JSON.parse(cached));
      }
    } catch {
      const cached = localStorage.getItem("allwin_cerebro_v1");
      if (cached) try { setSignals(JSON.parse(cached)); } catch { /* */ }
    }
    setLastSync(new Date());
    setLoading(false);
  }, []);

  useEffect(() => {
    const cached = localStorage.getItem("allwin_cerebro_v1");
    if (cached) try { setSignals(JSON.parse(cached)); } catch { /* */ }
    load();
  }, [load]);

  // ── batch processor: usa klines para fechar sinais abertos ──
  const processOpenSignals = useCallback(async (sigsToProcess?: Signal[]) => {
    const open = (sigsToProcess ?? signals).filter(
      s => s.status === "aprovado" && s.price_entrada != null
    );
    if (open.length === 0) return;

    abortRef.current = false;
    setProgress({ total: open.length, done: 0, tp: 0, sl: 0, skip: 0, current: "Iniciando...", running: true });

    // Agrupa por símbolo para fazer 1 chamada de klines por ativo
    const bySymbol = new Map<string, Signal[]>();
    for (const s of open) {
      const list = bySymbol.get(s.simbolo) ?? [];
      list.push(s);
      bySymbol.set(s.simbolo, list);
    }

    let done = 0, tp = 0, sl = 0, skip = 0;

    for (const [symbol, sigs] of bySymbol) {
      if (abortRef.current) break;

      setProgress(p => ({ ...p, current: `Verificando ${symbol.replace("USDT","")}...` }));

      // Tenta 4h primeiro (cobre ~83 dias), depois 1d se não achar
      let klines = await fetchKlines(symbol, "4h", 500);
      if (klines.length === 0) klines = await fetchKlines(symbol, "1d", 500);

      for (const sig of sigs) {
        if (abortRef.current) break;
        done++;

        const result = checkKlines(sig, klines);

        if (result) {
          // Atualiza estado local imediatamente
          setSignals(prev => {
            const updated = prev.map(s =>
              s.id === sig.id
                ? { ...s, status: result.status, pnl_pct: result.pnl_pct, fechado_em: new Date().toISOString() }
                : s
            );
            localStorage.setItem("allwin_cerebro_v1", JSON.stringify(updated));
            return updated;
          });
          // Persiste no backend
          await patchSignal(sig.id, result.status, result.pnl_pct);
          if (result.status === "tp") tp++; else sl++;
        } else {
          skip++;
        }

        setProgress(p => ({ ...p, done, tp, sl, skip }));
        // pequena pausa para não sobrecarregar a UI
        await new Promise(r => setTimeout(r, 15));
      }

      // rate limit suave entre símbolos
      await new Promise(r => setTimeout(r, 120));
    }

    setProgress(p => ({ ...p, running: false, current: `Concluído — ${tp} TP · ${sl} SL · ${skip} ainda abertos` }));
  }, [signals]);

  // Auto-processa quando os sinais carregam pela primeira vez
  const autoProcessed = useRef(false);
  useEffect(() => {
    if (autoProcessed.current) return;
    const open = signals.filter(s => s.status === "aprovado" && s.price_entrada);
    if (open.length > 0 && !loading) {
      autoProcessed.current = true;
      processOpenSignals(signals);
    }
  }, [signals, loading, processOpenSignals]);

  // ── close manual ──────────────────────────────────────
  async function closeSignal(id: string, status: "tp" | "sl", pnlPct: number) {
    setSignals(prev => {
      const updated = prev.map(s =>
        s.id === id ? { ...s, status, pnl_pct: pnlPct, fechado_em: new Date().toISOString() } : s
      );
      localStorage.setItem("allwin_cerebro_v1", JSON.stringify(updated));
      return updated;
    });
    await patchSignal(id, status, pnlPct);
    setClosing(null);
    setExpanded(null);
  }

  // ── stats ─────────────────────────────────────────────
  const stats = useMemo(() => {
    const total   = signals.length;
    const abertas = signals.filter(s => s.status === "aprovado").length;
    const tp      = signals.filter(s => s.status === "tp").length;
    const sl      = signals.filter(s => s.status === "sl").length;
    const closed  = tp + sl;
    const winRate = closed > 0 ? (tp / closed) * 100 : null;
    const pnlArr  = signals.filter(s => s.pnl_pct != null).map(s => s.pnl_pct!);
    const pnlTotal = pnlArr.reduce((a, b) => a + b, 0);
    const avgConf  = total > 0 ? signals.reduce((a, s) => a + s.confianca, 0) / total : 0;
    const byTier: Record<string, number> = {};
    for (const s of signals) { const t = brainTier(s.confianca).label; byTier[t] = (byTier[t] ?? 0) + 1; }
    return { total, abertas, tp, sl, closed, winRate, pnlTotal, avgConf, byTier };
  }, [signals]);

  // ── filter + sort ─────────────────────────────────────
  const filtered = useMemo(() => {
    let list = [...signals];
    if (tab === "abertas")          list = list.filter(s => s.status === "aprovado");
    else if (tab === "finalizadas") list = list.filter(s => s.status === "tp" || s.status === "sl");
    else if (tab === "tp")          list = list.filter(s => s.status === "tp");
    else if (tab === "sl")          list = list.filter(s => s.status === "sl");
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(s => s.simbolo.toLowerCase().includes(q) || s.source?.toLowerCase().includes(q) || s.direction.toLowerCase().includes(q));
    }
    list.sort((a, b) => {
      if (sortKey === "simbolo") return sortDesc ? b.simbolo.localeCompare(a.simbolo) : a.simbolo.localeCompare(b.simbolo);
      let va = 0, vb = 0;
      if (sortKey === "data")      { va = new Date(a.registrado_em || 0).getTime(); vb = new Date(b.registrado_em || 0).getTime(); }
      if (sortKey === "confianca") { va = a.confianca; vb = b.confianca; }
      if (sortKey === "pnl")       { va = a.pnl_pct ?? -999; vb = b.pnl_pct ?? -999; }
      return sortDesc ? vb - va : va - vb;
    });
    return list;
  }, [signals, tab, search, sortKey, sortDesc]);

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDesc(p => !p); else { setSortKey(k); setSortDesc(true); }
  }

  const TABS: { key: FilterTab; label: string; count: number; color: string }[] = [
    { key: "todas",       label: "Todas",       count: stats.total,   color: C.brain   },
    { key: "abertas",     label: "Abertas",     count: stats.abertas, color: C.cyan    },
    { key: "finalizadas", label: "Finalizadas", count: stats.closed,  color: C.amber   },
    { key: "tp",          label: "✅ TP",       count: stats.tp,      color: C.emerald },
    { key: "sl",          label: "❌ SL",       count: stats.sl,      color: C.red     },
  ];

  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-page)" }}>

      {/* ── HEADER ── */}
      <div style={{ background: "linear-gradient(135deg, rgba(99,102,241,0.07), rgba(79,82,204,0.03))", borderBottom: `1px solid ${C.border}`, padding: "20px 0" }}>
        <div className="max-w-7xl mx-auto px-5">
          <div className="flex items-center gap-2 mb-4" style={{ fontSize: 11, color: "var(--text-muted)" }}>
            <Link href="/" style={{ color: "var(--text-muted)", textDecoration: "none" }}
              onMouseEnter={e => e.currentTarget.style.color = "#818cf8"}
              onMouseLeave={e => e.currentTarget.style.color = "var(--text-muted)"}>Home</Link>
            <ChevronRight size={11} />
            <Link href="/futures" style={{ color: "var(--text-muted)", textDecoration: "none" }}
              onMouseEnter={e => e.currentTarget.style.color = "#818cf8"}
              onMouseLeave={e => e.currentTarget.style.color = "var(--text-muted)"}>Mesa Quant</Link>
            <ChevronRight size={11} />
            <span style={{ color: C.brain, fontWeight: 700 }}>Histórico</span>
          </div>

          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-3">
              <div style={{ width: 42, height: 42, borderRadius: 12, background: "rgba(99,102,241,0.15)", border: "1.5px solid rgba(99,102,241,0.35)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 0 20px rgba(99,102,241,0.2)" }}>
                <Brain size={20} style={{ color: C.brain }} />
              </div>
              <div>
                <div style={{ fontSize: 22, fontWeight: 900, color: "var(--text-primary)", letterSpacing: "-0.03em", lineHeight: 1 }}>Histórico Mesa Quant</div>
                <div style={{ fontSize: 11, color: C.brain, fontWeight: 700, letterSpacing: "1.2px", textTransform: "uppercase" }}>
                  Fecho automático · Klines Binance · TP/SL em tempo real
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {lastSync && (
                <span style={{ fontSize: 10, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 4 }}>
                  <Clock size={10} />{lastSync.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                </span>
              )}
              {!progress.running && (
                <button onClick={() => processOpenSignals()} style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 14px", borderRadius: 9, fontSize: 11.5, fontWeight: 700, cursor: "pointer", border: "1px solid rgba(16,185,129,0.3)", background: "rgba(16,185,129,0.08)", color: C.emerald }}>
                  <Zap size={11} /> Reprocessar sinais
                </button>
              )}
              <button onClick={load} disabled={loading} style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 14px", borderRadius: 9, fontSize: 11.5, fontWeight: 600, cursor: "pointer", border: `1px solid ${C.border}`, background: C.bg, color: C.brain }}>
                <RefreshCw size={11} style={{ animation: loading ? "spin 1s linear infinite" : "none" }} />
                Sincronizar
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── PROGRESS BAR ── */}
      {(progress.running || (progress.done > 0 && !progress.running)) && (
        <div style={{ background: "rgba(99,102,241,0.06)", borderBottom: `1px solid ${C.border}`, padding: "12px 0" }}>
          <div className="max-w-7xl mx-auto px-5">
            <div className="flex items-center gap-3 mb-2">
              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                {progress.running
                  ? <RefreshCw size={12} style={{ color: C.brain, animation: "spin 1s linear infinite" }} />
                  : <CheckCircle size={12} style={{ color: C.emerald }} />
                }
                <span style={{ fontSize: 11.5, fontWeight: 700, color: progress.running ? C.brain : C.emerald }}>
                  {progress.running ? `Processando histórico... ${pct}%` : "Processamento concluído"}
                </span>
              </div>
              <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{progress.current}</span>
              {progress.running && (
                <button onClick={() => { abortRef.current = true; }} style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 3, fontSize: 10.5, color: "var(--text-muted)", background: "transparent", border: "none", cursor: "pointer" }}>
                  <X size={10} /> Cancelar
                </button>
              )}
            </div>
            {/* Progress bar */}
            <div style={{ height: 4, borderRadius: 99, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${pct}%`, borderRadius: 99, background: `linear-gradient(90deg, ${C.brain}, ${C.emerald})`, transition: "width 0.3s" }} />
            </div>
            <div className="flex items-center gap-4 mt-2" style={{ fontSize: 10.5 }}>
              <span style={{ color: "var(--text-muted)" }}>{progress.done}/{progress.total} verificados</span>
              <span style={{ color: C.emerald, fontWeight: 700 }}>✅ {progress.tp} TP</span>
              <span style={{ color: C.red, fontWeight: 700 }}>❌ {progress.sl} SL</span>
              <span style={{ color: "var(--text-muted)" }}>⏳ {progress.skip} ainda abertos</span>
            </div>
          </div>
        </div>
      )}

      {/* ── STATS CARDS ── */}
      <div className="max-w-7xl mx-auto px-5 pt-6">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-5">
          {[
            { label: "Total",         value: stats.total,                                                    color: C.brain,   Icon: Brain       },
            { label: "Abertas",       value: stats.abertas,                                                  color: C.cyan,    Icon: Circle      },
            { label: "TP (green)",    value: stats.tp,                                                       color: C.emerald, Icon: CheckCircle },
            { label: "SL (red)",      value: stats.sl,                                                       color: C.red,     Icon: XCircle     },
            { label: "Win Rate",      value: stats.winRate != null ? `${stats.winRate.toFixed(1)}%` : "—",   color: stats.winRate != null && stats.winRate >= 50 ? C.emerald : C.red, Icon: Target },
            { label: "P&L Total",     value: stats.pnlTotal !== 0 ? `${stats.pnlTotal > 0 ? "+" : ""}${stats.pnlTotal.toFixed(2)}%` : "—", color: stats.pnlTotal >= 0 ? C.emerald : C.red, Icon: Activity },
          ].map(({ label, value, color, Icon }) => (
            <div key={label} style={{ background: "var(--bg-card)", border: `1px solid ${color}20`, borderRadius: 14, padding: "14px 16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 6 }}>
                <Icon size={11} style={{ color }} />
                <span style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px" }}>{label}</span>
              </div>
              <div style={{ fontSize: 22, fontWeight: 900, color, fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>{value}</div>
            </div>
          ))}
        </div>

        {/* Tier distribution */}
        <div className="flex items-center gap-3 mb-5 flex-wrap">
          <span style={{ fontSize: 10.5, color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px" }}>Distribuição:</span>
          {[
            { label: "PREMIUM",      emoji: "🟢", color: C.gold    },
            { label: "FORTE",         emoji: "🔵", color: "#60a5fa" },
            { label: "MODERADA",      emoji: "🟡", color: C.amber   },
            { label: "EXPERIMENTAL", emoji: "⚪", color: C.purple  },
          ].map(({ label, emoji, color }) => (
            <div key={label} style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 99, background: `${color}10`, border: `1px solid ${color}25` }}>
              <span style={{ fontSize: 11 }}>{emoji}</span>
              <span style={{ fontSize: 10.5, fontWeight: 700, color }}>{label}</span>
              <span style={{ fontSize: 12, fontWeight: 900, color, fontVariantNumeric: "tabular-nums" }}>{stats.byTier[label] ?? 0}</span>
            </div>
          ))}
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 99, background: C.bg, border: `1px solid ${C.border}` }}>
            <BarChart2 size={10} style={{ color: C.brain }} />
            <span style={{ fontSize: 10.5, color: "var(--text-muted)" }}>Conf. média:</span>
            <span style={{ fontSize: 12, fontWeight: 900, color: C.brain }}>{stats.avgConf.toFixed(1)}%</span>
          </div>
        </div>

        {/* ── FILTER TABS + SEARCH ── */}
        <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
          <div className="flex items-center gap-1.5 flex-wrap">
            {TABS.map(t => (
              <button key={t.key} onClick={() => setTab(t.key)} style={{
                padding: "6px 14px", borderRadius: 99, fontSize: 11.5, fontWeight: tab === t.key ? 700 : 500, cursor: "pointer",
                background: tab === t.key ? `${t.color}15` : "rgba(255,255,255,0.03)",
                border: `1px solid ${tab === t.key ? `${t.color}40` : "rgba(255,255,255,0.07)"}`,
                color: tab === t.key ? t.color : "var(--text-muted)", transition: "all 0.15s",
              }}>
                {t.label} <span style={{ marginLeft: 3, fontVariantNumeric: "tabular-nums" }}>({t.count})</span>
              </button>
            ))}
          </div>
          <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
            <Search size={12} style={{ position: "absolute", left: 10, color: "var(--text-muted)", pointerEvents: "none" }} />
            <input type="text" placeholder="Buscar ativo, direção..." value={search} onChange={e => setSearch(e.target.value)}
              style={{ paddingLeft: 30, paddingRight: 12, paddingTop: 7, paddingBottom: 7, borderRadius: 9, border: "1px solid var(--border)", background: "var(--bg-card)", color: "var(--text-primary)", fontSize: 12, outline: "none", width: 200 }} />
          </div>
        </div>

        {/* ── SORT BAR ── */}
        <div className="flex items-center gap-4 mb-3 px-2" style={{ fontSize: 10.5 }}>
          <span style={{ color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 4 }}>
            <SlidersHorizontal size={10} /> Ordenar:
          </span>
          {(["data","confianca","pnl","simbolo"] as SortKey[]).map(k => (
            <button key={k} onClick={() => toggleSort(k)}
              style={{ display: "flex", alignItems: "center", gap: 3, background: "transparent", border: "none", cursor: "pointer", padding: 0, fontSize: 10.5, fontWeight: sortKey === k ? 700 : 400, color: sortKey === k ? C.brain : "var(--text-muted)" }}>
              {{ data: "Data", confianca: "Confiança", pnl: "P&L", simbolo: "Ativo" }[k]}
              <ArrowUpDown size={9} style={{ opacity: sortKey === k ? 1 : 0.4 }} />
              {sortKey === k && <span style={{ fontSize: 9 }}>{sortDesc ? "↓" : "↑"}</span>}
            </button>
          ))}
          <span style={{ marginLeft: "auto", color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}>
            {filtered.length} resultado{filtered.length !== 1 ? "s" : ""}
          </span>
        </div>

        {/* ── LIST ── */}
        {loading && signals.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 0", color: "var(--text-muted)" }}>
            <RefreshCw size={24} style={{ animation: "spin 1s linear infinite", marginBottom: 10, color: C.brain }} />
            <div style={{ fontSize: 13 }}>Carregando histórico...</div>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 0", color: "var(--text-muted)" }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>🔍</div>
            <div style={{ fontSize: 13 }}>Nenhum sinal encontrado para este filtro.</div>
          </div>
        ) : (
          <div className="flex flex-col gap-2 pb-10">
            {filtered.map(sig => (
              <HistoricoRow
                key={sig.id}
                sig={sig}
                expanded={expanded === sig.id}
                closing={closing === sig.id}
                onToggle={() => { setExpanded(p => p === sig.id ? null : sig.id); setClosing(null); }}
                onStartClose={() => { setClosing(sig.id); setExpanded(sig.id); }}
                onClose={closeSignal}
                onCancelClose={() => setClosing(null)}
              />
            ))}
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

// ── Row ──────────────────────────────────────────────────
function HistoricoRow({ sig, expanded, closing, onToggle, onStartClose, onClose, onCancelClose }: {
  sig: Signal; expanded: boolean; closing: boolean;
  onToggle: () => void; onStartClose: () => void;
  onClose: (id: string, status: "tp" | "sl", pnl: number) => void;
  onCancelClose: () => void;
}) {
  const [closeStatus, setCloseStatus] = useState<"tp" | "sl">("tp");
  const [pnlInput,    setPnlInput]    = useState("");
  const [saving,      setSaving]      = useState(false);

  const tier    = brainTier(sig.confianca);
  const isLong  = sig.direction.toUpperCase() === "LONG";
  const dirCol  = isLong ? C.emerald : C.red;
  const DirIcon = isLong ? TrendingUp : TrendingDown;
  const isOpen  = sig.status === "aprovado";
  const isTp    = sig.status === "tp";
  const statusCol   = isOpen ? C.cyan : isTp ? C.emerald : C.red;
  const StatusIcon  = isOpen ? Circle : isTp ? CheckCircle : XCircle;
  const statusLabel = isOpen ? "ABERTA" : isTp ? "✅ TP" : "❌ SL";
  const tp = sig.price_entrada != null ? sig.price_entrada * (1 + (sig.tp_pct ?? 2) / 100) : null;
  const sl = sig.price_entrada != null ? sig.price_entrada * (1 - (sig.sl_pct ?? 1) / 100) : null;

  function autoFill(st: "tp" | "sl") {
    setCloseStatus(st);
    if (st === "tp" && sig.tp_pct != null) setPnlInput(`+${sig.tp_pct.toFixed(2)}`);
    if (st === "sl" && sig.sl_pct != null) setPnlInput(`-${sig.sl_pct.toFixed(2)}`);
  }

  async function handleClose() {
    const pnl = parseFloat(pnlInput.replace(",", "."));
    if (isNaN(pnl)) return;
    setSaving(true);
    await onClose(sig.id, closeStatus, pnl);
    setSaving(false);
  }

  return (
    <div style={{ borderRadius: 12, border: `1px solid ${expanded ? tier.border : "var(--border)"}`, background: expanded ? tier.bg : "var(--bg-card)", overflow: "hidden", transition: "border-color 0.15s, background 0.15s" }}
      onMouseEnter={e => { if (!expanded) e.currentTarget.style.borderColor = tier.border; }}
      onMouseLeave={e => { if (!expanded) e.currentTarget.style.borderColor = "var(--border)"; }}>

      <div style={{ display: "flex", alignItems: "center" }}>
        <button type="button" onClick={onToggle} style={{ flex: 1, background: "transparent", border: "none", cursor: "pointer", padding: "10px 13px", textAlign: "left" }}>
          <div className="flex items-center gap-3">
            <StatusIcon size={14} style={{ color: statusCol, flexShrink: 0 }} />
            <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 105 }}>
              <span style={{ fontSize: 13.5, fontWeight: 900, color: "var(--text-primary)" }}>
                {sig.simbolo.replace(/USDT|BUSD|USDC/g, "")}
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: 3, padding: "1px 6px", borderRadius: 99, background: `${dirCol}12`, border: `1px solid ${dirCol}25` }}>
                <DirIcon size={9} style={{ color: dirCol }} />
                <span style={{ fontSize: 9.5, fontWeight: 800, color: dirCol }}>{sig.direction.toUpperCase()}</span>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 3, padding: "2px 8px", borderRadius: 99, background: tier.bg, border: `1px solid ${tier.border}` }}>
              <span style={{ fontSize: 10.5 }}>{tier.emoji}</span>
              <span style={{ fontSize: 9.5, fontWeight: 800, color: tier.color }}>{tier.label}</span>
            </div>
            <span style={{ fontSize: 13, fontWeight: 900, color: tier.color, fontVariantNumeric: "tabular-nums", minWidth: 44 }}>{sig.confianca.toFixed(0)}%</span>
            <div className="hidden sm:flex flex-col" style={{ minWidth: 85 }}>
              <span style={{ fontSize: 9.5, color: "var(--text-muted)" }}>Entrada</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)", fontVariantNumeric: "tabular-nums" }}>{fmtPrice(sig.price_entrada)}</span>
            </div>
            <div className="hidden sm:flex flex-col" style={{ minWidth: 65 }}>
              <span style={{ fontSize: 9.5, color: "var(--text-muted)" }}>P&L</span>
              <span style={{ fontSize: 12.5, fontWeight: 900, color: sig.pnl_pct != null ? (sig.pnl_pct >= 0 ? C.emerald : C.red) : "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}>
                {sig.pnl_pct != null ? `${sig.pnl_pct > 0 ? "+" : ""}${sig.pnl_pct.toFixed(2)}%` : "—"}
              </span>
            </div>
            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
              <span style={{ fontSize: 9.5, padding: "3px 8px", borderRadius: 99, fontWeight: 800, background: `${statusCol}12`, border: `1px solid ${statusCol}25`, color: statusCol }}>{statusLabel}</span>
              <span className="hidden md:block" style={{ fontSize: 10.5, color: "var(--text-muted)" }}>{fmtDate(sig.registrado_em)}</span>
            </div>
          </div>
        </button>

        {isOpen && !closing && (
          <button onClick={onStartClose} style={{ flexShrink: 0, marginRight: 12, padding: "5px 10px", borderRadius: 7, fontSize: 10.5, fontWeight: 600, cursor: "pointer", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", color: "var(--text-muted)", whiteSpace: "nowrap" }}
            onMouseEnter={e => { e.currentTarget.style.background = "rgba(99,102,241,0.08)"; e.currentTarget.style.color = C.brain; }}
            onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.03)"; e.currentTarget.style.color = "var(--text-muted)"; }}>
            Fechar
          </button>
        )}
      </div>

      {/* Close form */}
      {isOpen && closing && (
        <div style={{ padding: "12px 14px", borderTop: `1px solid ${tier.border}`, background: "rgba(99,102,241,0.04)" }}>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: C.brain, marginBottom: 8 }}>
            Registrar resultado — {sig.simbolo.replace(/USDT|BUSD|USDC/g, "")} {sig.direction.toUpperCase()}
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <div style={{ display: "flex", gap: 5 }}>
              <button onClick={() => autoFill("tp")} style={{ padding: "6px 13px", borderRadius: 7, fontSize: 11.5, fontWeight: 700, cursor: "pointer", background: closeStatus === "tp" ? "rgba(16,185,129,0.12)" : "rgba(255,255,255,0.03)", border: `1px solid ${closeStatus === "tp" ? "rgba(16,185,129,0.35)" : "rgba(255,255,255,0.08)"}`, color: closeStatus === "tp" ? C.emerald : "var(--text-muted)" }}>✅ TP (green)</button>
              <button onClick={() => autoFill("sl")} style={{ padding: "6px 13px", borderRadius: 7, fontSize: 11.5, fontWeight: 700, cursor: "pointer", background: closeStatus === "sl" ? "rgba(239,68,68,0.1)" : "rgba(255,255,255,0.03)", border: `1px solid ${closeStatus === "sl" ? "rgba(239,68,68,0.35)" : "rgba(255,255,255,0.08)"}`, color: closeStatus === "sl" ? C.red : "var(--text-muted)" }}>❌ SL (red)</button>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ fontSize: 11, color: "var(--text-muted)" }}>P&L %:</span>
              <input type="text" placeholder={closeStatus === "tp" ? `+${sig.tp_pct?.toFixed(2) ?? "2.00"}` : `-${sig.sl_pct?.toFixed(2) ?? "1.00"}`} value={pnlInput} onChange={e => setPnlInput(e.target.value)}
                style={{ width: 80, padding: "5px 9px", borderRadius: 7, border: `1px solid ${closeStatus === "tp" ? "rgba(16,185,129,0.3)" : "rgba(239,68,68,0.3)"}`, background: "var(--bg-card)", color: closeStatus === "tp" ? C.emerald : C.red, fontSize: 13, fontWeight: 800, outline: "none", textAlign: "center" }} />
            </div>
            <button onClick={handleClose} disabled={saving || !pnlInput.trim()} style={{ padding: "6px 14px", borderRadius: 7, fontSize: 11.5, fontWeight: 700, cursor: "pointer", background: closeStatus === "tp" ? "rgba(16,185,129,0.12)" : "rgba(239,68,68,0.1)", border: `1px solid ${closeStatus === "tp" ? "rgba(16,185,129,0.35)" : "rgba(239,68,68,0.35)"}`, color: closeStatus === "tp" ? C.emerald : C.red, opacity: saving ? 0.6 : 1 }}>
              {saving ? "..." : "Confirmar"}
            </button>
            <button onClick={onCancelClose} style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 10.5, color: "var(--text-muted)", background: "transparent", border: "none", cursor: "pointer" }}>
              <X size={11} /> Cancelar
            </button>
          </div>
          <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 6 }}>
            Alvo: <strong style={{ color: C.emerald }}>{fmtPrice(tp ?? undefined)}</strong> · Stop: <strong style={{ color: C.red }}>{fmtPrice(sl ?? undefined)}</strong>
          </div>
        </div>
      )}

      {/* Expanded detail */}
      {expanded && !closing && (
        <div style={{ borderTop: `1px solid ${tier.border}`, padding: "13px 14px" }}>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
            {[
              { label: "Entrada",   value: fmtPrice(sig.price_entrada),                   color: "var(--text-primary)" },
              { label: "Alvo (TP)", value: fmtPrice(tp ?? undefined),                     color: C.emerald             },
              { label: "Stop (SL)", value: fmtPrice(sl ?? undefined),                     color: C.red                 },
              { label: "P&L",       value: sig.pnl_pct != null ? `${sig.pnl_pct > 0 ? "+" : ""}${sig.pnl_pct.toFixed(2)}%` : "—", color: sig.pnl_pct != null ? (sig.pnl_pct >= 0 ? C.emerald : C.red) : "var(--text-muted)" },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ textAlign: "center", padding: "8px", borderRadius: 9, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <div style={{ fontSize: 9.5, color: "var(--text-muted)", marginBottom: 3 }}>{label}</div>
                <div style={{ fontSize: 13, fontWeight: 900, color, fontVariantNumeric: "tabular-nums" }}>{value}</div>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
            {[
              { label: "RS Score",    score: sig.score_tecnico,     color: C.amber   },
              { label: "Sinais IA",   score: sig.score_fluxo,       color: C.purple  },
              { label: "IA Analista", score: sig.score_contexto,    color: C.cyan    },
              { label: "Tiro Curto",  score: sig.score_fundamental, color: C.emerald },
            ].map(({ label, score, color }) => (
              <div key={label} style={{ padding: "7px 9px", borderRadius: 8, background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <div style={{ fontSize: 9.5, color: "var(--text-muted)", marginBottom: 1 }}>{label}</div>
                <div style={{ fontSize: 13.5, fontWeight: 900, color: score != null ? color : "var(--text-muted)" }}>{score != null ? `${score.toFixed(0)}%` : "—"}</div>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-4 flex-wrap" style={{ fontSize: 11 }}>
            {sig.source && <span style={{ color: "var(--text-muted)" }}>Fonte: <strong style={{ color: "var(--text-secondary)" }}>{sig.source}</strong></span>}
            {sig.registrado_em && <span style={{ color: "var(--text-muted)" }}>Entrada: <strong style={{ color: "var(--text-secondary)" }}>{fmtDate(sig.registrado_em)}</strong></span>}
            {sig.fechado_em    && <span style={{ color: "var(--text-muted)" }}>Fechada: <strong style={{ color: "var(--text-secondary)" }}>{fmtDate(sig.fechado_em)}</strong></span>}
            {sig.telegram_entry && <span style={{ color: "#22c55e" }}>📲 Telegram enviado</span>}
          </div>
        </div>
      )}
    </div>
  );
}
