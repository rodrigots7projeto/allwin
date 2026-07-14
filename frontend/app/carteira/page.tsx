"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  BarChart2, Zap, TrendingUp, TrendingDown, Minus,
  Repeat2, CheckCircle2, Activity, Target, ArrowUpRight,
  DollarSign, Percent, Clock, ChevronRight, LayoutGrid,
  BookOpen, Shield, Wallet, BarChart,
} from "lucide-react";

const COLOR  = "#10b981";
const COLOR2 = "#059669";
const BORDER = "rgba(16,185,129,0.25)";
const BG     = "rgba(16,185,129,0.06)";

interface Ticker { symbol: string; lastPrice: string; priceChangePercent: string; }

const WATCH = ["BTCUSDT","ETHUSDT","SOLUSDT","BNBUSDT","XRPUSDT","ADAUSDT"];

const MODULES = [
  {
    href: "/cripto",
    label: "Análise Profunda",
    sub: "Técnico completo: RSI, MACD, EMA, Bollinger, Fibonacci, Score IA, sentimento de mercado",
    Icon: BarChart2,
    accent: "#3b82f6",
    tags: ["Técnica", "Fundamental", "Gráficos"],
    badge: "CORE",
  },
  {
    href: "/cripto/sinais",
    label: "Sinais IA",
    sub: "Scanner com score composto, grade A+/A/B/C, timing e histórico de acerto com P&L real",
    Icon: Zap,
    accent: "#8b5cf6",
    tags: ["Score IA", "Grade A+", "Histórico"],
    badge: "IA",
  },
  {
    href: "/cripto/rsscore",
    label: "RS Score",
    sub: "Força relativa — identifica as moedas mais fortes vs BTC e vs o mercado geral",
    Icon: BarChart,
    accent: "#f59e0b",
    tags: ["Força relativa", "vs BTC", "Ranking"],
    badge: null,
  },
  {
    href: "/cripto/daytrade",
    label: "Day Trade Scanner",
    sub: "Consenso multi-timeframe (1m → 1d) para entradas intraday com sinais precisos",
    Icon: Activity,
    accent: "#22d3ee",
    tags: ["Multi-TF", "Consenso", "Intraday"],
    badge: "SCAN",
  },
  {
    href: "/cripto/trade",
    label: "Trade Spot",
    sub: "Execução real via Binance API. Posições abertas, ordens e 50+ pares disponíveis",
    Icon: Repeat2,
    accent: "#f59e0b",
    tags: ["Spot", "Binance", "Ordens reais"],
    badge: "REAL",
  },
  {
    href: "/cripto/trade-futuros",
    label: "Trade Futuros",
    sub: "Futuros Binance com alavancagem, LONG & SHORT, gestão de risco e liquidação automática",
    Icon: TrendingUp,
    accent: "#ef4444",
    tags: ["Futures", "LONG/SHORT", "Alavancagem"],
    badge: "REAL",
  },
  {
    href: "/cripto/comparativo",
    label: "Comparativo IA",
    sub: "OpenAI compara altcoins vs BTC: crescimento, dividendos, equilíbrio e score dimensional",
    Icon: BookOpen,
    accent: "#6366f1",
    tags: ["OpenAI", "vs BTC", "Score"],
    badge: "IA",
  },
  {
    href: "/cripto/finalizadas",
    label: "Histórico Carteira",
    sub: "Todas as operações encerradas com métricas de performance, P&L e calendário de resultados",
    Icon: CheckCircle2,
    accent: "#06b6d4",
    tags: ["Histórico", "P&L", "Métricas"],
    badge: null,
  },
];

function fmtPrice(p: string) {
  const n = parseFloat(p);
  if (n >= 10000) return n.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
  if (n >= 100)   return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 4 });
}

function loadCarteiraStats() {
  if (typeof window === "undefined") return { totalOps: 0, wins: 0, losses: 0, winRate: null as number | null, pnlTotal: 0 };
  try {
    let wins = 0, losses = 0, totalOps = 0, pnlTotal = 0;
    const dt: { trades?: { tipo?: string; pnl_brl?: number }[] }[] = JSON.parse(localStorage.getItem("allwin_dt_wallets_v2") || "[]");
    for (const w of dt) for (const t of w.trades || []) { if (t.tipo !== "V") continue; totalOps++; pnlTotal += t.pnl_brl ?? 0; if ((t.pnl_brl ?? 0) >= 0) wins++; else losses++; }
    const hist: { status?: string; pnl_pct?: number }[] = JSON.parse(localStorage.getItem("allwin_trade_hist") || "[]");
    totalOps += hist.length;
    for (const t of hist) { if (t.status === "tp") wins++; else if (t.status === "sl") losses++; }
    const total = wins + losses;
    return { totalOps, wins, losses, winRate: total > 0 ? (wins / total) * 100 : null, pnlTotal };
  } catch { return { totalOps: 0, wins: 0, losses: 0, winRate: null, pnlTotal: 0 }; }
}

function loadRecentOps() {
  if (typeof window === "undefined") return [];
  try {
    const dt: { wallet_nome?: string; trades?: { tipo?: string; simbolo?: string; pnl_brl?: number; criado_em?: string }[] }[] = JSON.parse(localStorage.getItem("allwin_dt_wallets_v2") || "[]");
    const ops: { simbolo: string; pnl: number; data: string }[] = [];
    for (const w of dt) {
      for (const t of (w.trades || []).filter(t => t.tipo === "V").slice(-5)) {
        ops.push({ simbolo: t.simbolo || "?", pnl: t.pnl_brl ?? 0, data: t.criado_em || "" });
      }
    }
    return ops.sort((a, b) => (b.data > a.data ? 1 : -1)).slice(0, 6);
  } catch { return []; }
}

export default function CarteiraPage() {
  const [tickers, setTickers] = useState<Ticker[]>([]);
  const [stats, setStats] = useState({ totalOps: 0, wins: 0, losses: 0, winRate: null as number | null, pnlTotal: 0 });
  const [recent, setRecent] = useState<{ simbolo: string; pnl: number; data: string }[]>([]);
  const [mounted, setMounted] = useState(false);

  function fetchTickers() {
    const syms = JSON.stringify(WATCH);
    fetch(`https://api.binance.com/api/v3/ticker/24hr?symbols=${encodeURIComponent(syms)}`)
      .then(r => r.json())
      .then((data: Ticker[]) => setTickers(WATCH.map(s => data.find(d => d.symbol === s)).filter(Boolean) as Ticker[]))
      .catch(() => {});
  }

  useEffect(() => {
    setMounted(true);
    setStats(loadCarteiraStats());
    setRecent(loadRecentOps());
    fetchTickers();
    const id = setInterval(fetchTickers, 15_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-page)" }}>

      {/* ── ENV HEADER ── */}
      <div style={{
        background: `linear-gradient(135deg, rgba(16,185,129,0.08) 0%, rgba(5,150,105,0.04) 50%, transparent 100%)`,
        borderBottom: `1px solid ${BORDER}`,
        padding: "32px 0 0",
        position: "relative",
        overflow: "hidden",
      }}>
        {/* Glow orb */}
        <div style={{ position:"absolute", top:"-40px", right:"10%", width:400, height:400, borderRadius:"50%", background:"radial-gradient(circle, rgba(16,185,129,0.08) 0%, transparent 65%)", pointerEvents:"none" }} />

        <div className="max-w-7xl mx-auto px-5">
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 mb-4" style={{ fontSize: 11, color: "var(--text-muted)" }}>
            <Link href="/" className="no-underline hover:text-emerald-400 transition-colors" style={{ color: "var(--text-muted)" }}>Home</Link>
            <ChevronRight size={11} />
            <span style={{ color: COLOR, fontWeight: 700 }}>Carteira</span>
          </div>

          <div className="flex items-start justify-between flex-wrap gap-6 pb-8">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div style={{
                  width: 44, height: 44, borderRadius: 13,
                  background: "rgba(16,185,129,0.15)", border: `1.5px solid rgba(16,185,129,0.35)`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  boxShadow: "0 0 20px rgba(16,185,129,0.2)",
                }}>
                  <Wallet size={20} style={{ color: COLOR }} />
                </div>
                <div>
                  <div style={{ fontSize: 26, fontWeight: 900, color: "var(--text-primary)", letterSpacing: "-0.04em", lineHeight: 1.1 }}>
                    CARTEIRA
                  </div>
                  <div style={{ fontSize: 11, color: COLOR, fontWeight: 700, letterSpacing: "1.5px", textTransform: "uppercase", marginTop: 1 }}>
                    Análise · Spot · Swing · Day Trade
                  </div>
                </div>
              </div>
              <p style={{ fontSize: 13, color: "var(--text-muted)", maxWidth: 480, lineHeight: 1.6 }}>
                Ambiente dedicado à análise técnica/fundamentalista, sinais IA, trading spot e histórico de operações.
              </p>
            </div>

            {/* Live tickers inline */}
            <div className="hidden lg:flex items-center gap-4 flex-wrap">
              {tickers.map(t => {
                const pct = parseFloat(t.priceChangePercent);
                const up = pct >= 0;
                return (
                  <Link key={t.symbol} href={`/cripto?coin=${t.symbol}`} className="no-underline flex flex-col items-end"
                    style={{ minWidth: 70, padding: "8px 12px", borderRadius: 10, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)" }}>{t.symbol.replace("USDT","")}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)", fontVariantNumeric: "tabular-nums" }}>${fmtPrice(t.lastPrice)}</span>
                    <span style={{ fontSize: 10, color: up ? "#10b981" : "#ef4444", fontWeight: 600 }}>{up ? "+" : ""}{pct.toFixed(2)}%</span>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>

        {/* Stats strip */}
        {mounted && (
          <div style={{ borderTop: `1px solid ${BORDER}`, background: "rgba(16,185,129,0.03)" }}>
            <div className="max-w-7xl mx-auto px-5">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-0" style={{ borderLeft: `1px solid ${BORDER}` }}>
                {[
                  { Icon: Activity, label: "Operações", value: stats.totalOps.toLocaleString("pt-BR"), color: COLOR },
                  { Icon: Target, label: "Win Rate", value: stats.winRate != null ? `${stats.winRate.toFixed(1)}%` : "—", color: stats.winRate != null && stats.winRate >= 50 ? "#10b981" : "#ef4444" },
                  { Icon: TrendingUp, label: "Vitórias", value: stats.wins.toString(), color: "#10b981" },
                  { Icon: TrendingDown, label: "Perdas", value: stats.losses.toString(), color: "#ef4444" },
                ].map(({ Icon, label, value, color }) => (
                  <div key={label} className="flex items-center gap-3 px-5 py-3.5" style={{ borderRight: `1px solid ${BORDER}` }}>
                    <Icon size={14} style={{ color, flexShrink: 0 }} />
                    <div>
                      <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>{label}</div>
                      <div style={{ fontSize: 18, fontWeight: 900, color, fontVariantNumeric: "tabular-nums", lineHeight: 1.2 }}>{value}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── CONTENT ── */}
      <div className="max-w-7xl mx-auto px-5 py-8">

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* ── MÓDULOS (2/3) ── */}
          <div className="lg:col-span-2">
            <div className="flex items-center gap-3 mb-5">
              <LayoutGrid size={14} style={{ color: COLOR }} />
              <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "1.2px", textTransform: "uppercase", color: COLOR }}>
                Módulos da Carteira
              </span>
              <div className="flex-1 h-px" style={{ background: BORDER }} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {MODULES.map(({ href, label, sub, Icon, accent, tags, badge }) => (
                <ModuleCard key={href} href={href} label={label} sub={sub} Icon={Icon} accent={accent} tags={tags} badge={badge} />
              ))}
            </div>
          </div>

          {/* ── SIDEBAR (1/3) ── */}
          <div className="flex flex-col gap-4">

            {/* Quick actions */}
            <div style={{ background: "var(--bg-card)", border: `1px solid ${BORDER}`, borderRadius: 16, overflow: "hidden" }}>
              <div className="px-4 py-3 flex items-center gap-2" style={{ borderBottom: `1px solid ${BORDER}`, background: BG }}>
                <Shield size={13} style={{ color: COLOR }} />
                <span style={{ fontSize: 12, fontWeight: 700, color: COLOR, letterSpacing: "0.5px" }}>ACESSO RÁPIDO</span>
              </div>
              <div className="flex flex-col">
                {[
                  { href: "/cripto", label: "Analisar moeda", Icon: BarChart2, color: "#3b82f6" },
                  { href: "/cripto/sinais", label: "Ver Sinais IA", Icon: Zap, color: "#8b5cf6" },
                  { href: "/cripto/trade", label: "Abrir posição Spot", Icon: DollarSign, color: "#f59e0b" },
                  { href: "/cripto/finalizadas", label: "Ver histórico completo", Icon: CheckCircle2, color: "#06b6d4" },
                ].map(({ href, label, Icon, color }) => (
                  <Link key={href} href={href} className="no-underline flex items-center gap-3 px-4 py-3 transition-all duration-150 group"
                    style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
                    onMouseEnter={e => { e.currentTarget.style.background = `${color}08`; }}
                    onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}>
                    <div style={{ width: 30, height: 30, borderRadius: 9, background: `${color}15`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <Icon size={13} style={{ color }} />
                    </div>
                    <span style={{ fontSize: 12.5, color: "var(--text-secondary)", flex: 1 }}>{label}</span>
                    <ArrowUpRight size={12} style={{ color: "var(--text-muted)" }} />
                  </Link>
                ))}
              </div>
            </div>

            {/* Histórico recente */}
            {recent.length > 0 && (
              <div style={{ background: "var(--bg-card)", border: `1px solid var(--border)`, borderRadius: 16, overflow: "hidden" }}>
                <div className="px-4 py-3 flex items-center gap-2" style={{ borderBottom: "1px solid var(--border)" }}>
                  <Clock size={13} style={{ color: "var(--text-muted)" }} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.5px" }}>ÚLTIMAS OPERAÇÕES</span>
                </div>
                <div className="flex flex-col">
                  {recent.map((op, i) => (
                    <div key={i} className="flex items-center justify-between px-4 py-2.5" style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                      <div>
                        <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text-primary)" }}>{op.simbolo}</div>
                        <div style={{ fontSize: 10, color: "var(--text-muted)" }}>{op.data ? new Date(op.data).toLocaleDateString("pt-BR") : "—"}</div>
                      </div>
                      <div style={{ fontSize: 12.5, fontWeight: 700, color: op.pnl >= 0 ? "#10b981" : "#ef4444", fontVariantNumeric: "tabular-nums" }}>
                        {op.pnl >= 0 ? "+" : ""}R${op.pnl.toFixed(2)}
                      </div>
                    </div>
                  ))}
                </div>
                <Link href="/cripto/finalizadas" className="no-underline flex items-center justify-center gap-1.5 py-3 text-[12px] font-semibold transition-colors"
                  style={{ color: COLOR, borderTop: `1px solid ${BORDER}` }}>
                  Ver histórico completo <ArrowUpRight size={12} />
                </Link>
              </div>
            )}

            {/* Navegação entre ambientes */}
            <Link href="/futures" className="no-underline rounded-2xl p-4 border flex items-center gap-3 transition-all duration-150 group"
              style={{ background: "rgba(99,102,241,0.05)", border: "1px solid rgba(99,102,241,0.2)" }}
              onMouseEnter={e => { e.currentTarget.style.background = "rgba(99,102,241,0.1)"; e.currentTarget.style.borderColor = "rgba(99,102,241,0.4)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "rgba(99,102,241,0.05)"; e.currentTarget.style.borderColor = "rgba(99,102,241,0.2)"; }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(99,102,241,0.15)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <span style={{ fontSize: 18 }}>📈</span>
              </div>
              <div className="flex-1">
                <div style={{ fontSize: 12.5, fontWeight: 700, color: "#818cf8" }}>Ir para FUTURES</div>
                <div style={{ fontSize: 11, color: "var(--text-muted)" }}>IA Engine · Cérebro · Auto Trade</div>
              </div>
              <ArrowUpRight size={14} style={{ color: "#818cf8" }} />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function ModuleCard({ href, label, sub, Icon, accent, tags, badge }: {
  href: string; label: string; sub: string; Icon: React.ElementType;
  accent: string; tags: string[]; badge: string | null;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <Link
      href={href}
      className="no-underline rounded-2xl p-4 border flex flex-col gap-3 transition-all duration-200"
      style={{
        background: hovered ? `${accent}08` : "var(--bg-card)",
        borderColor: hovered ? `${accent}40` : "var(--border)",
        boxShadow: hovered ? `0 0 28px ${accent}12, 0 6px 20px rgba(0,0,0,0.2)` : "none",
        transform: hovered ? "translateY(-2px)" : "translateY(0)",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="flex items-start justify-between">
        <div style={{ width: 38, height: 38, borderRadius: 11, background: hovered ? `${accent}22` : `${accent}15`, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: hovered ? `0 0 12px ${accent}30` : "none", transition: "all 0.2s" }}>
          <Icon size={17} style={{ color: accent }} />
        </div>
        <div className="flex items-center gap-1.5">
          {badge && (
            <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.8px", textTransform: "uppercase", padding: "2px 7px", borderRadius: 99, background: `${accent}12`, color: accent, border: `1px solid ${accent}25` }}>
              {badge}
            </span>
          )}
          <ArrowUpRight size={13} style={{ color: accent, opacity: hovered ? 0.9 : 0, transition: "opacity 0.15s" }} />
        </div>
      </div>

      <div>
        <div style={{ fontSize: 14, fontWeight: 800, color: "var(--text-primary)", marginBottom: 4, letterSpacing: "-0.02em" }}>{label}</div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.55 }}>{sub}</div>
      </div>

      <div className="flex flex-wrap gap-1 mt-auto">
        {tags.map(tag => (
          <span key={tag} style={{
            fontSize: 10, padding: "2px 7px", borderRadius: 99, fontWeight: 600,
            background: hovered ? `${accent}10` : "rgba(255,255,255,0.04)",
            color: hovered ? accent : "var(--text-muted)",
            border: `1px solid ${hovered ? `${accent}30` : "rgba(255,255,255,0.08)"}`,
            transition: "all 0.15s",
          }}>{tag}</span>
        ))}
      </div>
    </Link>
  );
}
