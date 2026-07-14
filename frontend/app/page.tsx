"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  TrendingUp, TrendingDown, Minus, BarChart2, Zap,
  BrainCircuit, Repeat2, CheckCircle2, Cpu, Activity,
  Target, Bot, ArrowUpRight, Wallet, Flame, Brain,
  Shield, BookOpen, BarChart, Trophy,
} from "lucide-react";
import { getAuthData } from "@/lib/auth";

interface TickerData {
  symbol: string;
  lastPrice: string;
  priceChangePercent: string;
  quoteVolume: string;
}

interface FearGreed {
  value: number;
  value_classification: string;
}

interface MarketHealth {
  score: number;
  label: string;
  color: string;
  emoji: string;
  bg: string;
  border: string;
}

const WATCH = ["BTCUSDT","ETHUSDT","BNBUSDT","SOLUSDT","XRPUSDT","ADAUSDT","DOGEUSDT","AVAXUSDT"];

function fmtPrice(price: string): string {
  const n = parseFloat(price);
  if (n >= 10000) return n.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
  if (n >= 100)   return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (n >= 1)     return n.toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 4 });
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 4, maximumFractionDigits: 5 });
}

function fmtVol(vol: string): string {
  const n = parseFloat(vol);
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(0)}M`;
  return `$${n.toFixed(0)}`;
}

function calcMarketHealth(fg: FearGreed | null, btcPct: number | null): MarketHealth {
  let score = 50;
  if (fg) score = fg.value;
  if (btcPct !== null) {
    if (btcPct > 3) score = Math.min(100, score + 10);
    else if (btcPct < -3) score = Math.max(0, score - 10);
  }
  if (score >= 65) return { score, label: "Mercado Saudável", color: "#10b981", emoji: "🟢", bg: "rgba(16,185,129,0.07)", border: "rgba(16,185,129,0.25)" };
  if (score >= 40) return { score, label: "Mercado Neutro", color: "#f59e0b", emoji: "🟡", bg: "rgba(245,158,11,0.07)", border: "rgba(245,158,11,0.25)" };
  return { score, label: "Mercado de Risco", color: "#ef4444", emoji: "🔴", bg: "rgba(239,68,68,0.07)", border: "rgba(239,68,68,0.25)" };
}

function loadStats() {
  if (typeof window === "undefined") return { totalOps: 0, winRate: null, activeBots: 0 };
  try {
    let wins = 0, losses = 0, totalOps = 0;
    const srd: { ativo?: boolean; trades?: { status?: string }[] }[] = JSON.parse(localStorage.getItem("allwin_srd_wallets_v1") || "[]");
    const activeBots = srd.filter((b) => b.ativo).length;
    for (const w of srd) for (const t of w.trades || []) { totalOps++; if (t.status === "tp") wins++; else if (t.status === "sl") losses++; }
    const fut: { trades?: { tipo?: string; pnl_brl?: number }[] }[] = JSON.parse(localStorage.getItem("allwin_futures_wallets_v1") || "[]");
    for (const w of fut) for (const t of w.trades || []) { if (t.tipo !== "V") continue; totalOps++; if ((t.pnl_brl ?? 0) >= 0) wins++; else losses++; }
    const bot: { trades?: { tipo?: string; pnl_brl?: number }[] }[] = JSON.parse(localStorage.getItem("allwin_bot_wallets_v1") || "[]");
    for (const w of bot) for (const t of w.trades || []) { if (t.tipo !== "V") continue; totalOps++; if ((t.pnl_brl ?? 0) >= 0) wins++; else losses++; }
    const cerebro: { status?: string }[] = JSON.parse(localStorage.getItem("allwin_cerebro_learn_v1") || "[]");
    totalOps += cerebro.length;
    const total = wins + losses;
    return { totalOps, winRate: total > 0 ? (wins / total) * 100 : null, activeBots };
  } catch { return { totalOps: 0, winRate: null, activeBots: 0 }; }
}

const CARTEIRA_TOOLS = [
  { href: "/cripto", label: "Análise Profunda", sub: "Técnico, fundamental, RSI, MACD, Fibonacci", Icon: BarChart2, color: "#3b82f6" },
  { href: "/cripto/sinais", label: "Sinais IA", sub: "Score composto, grade, RS Score, Day Trade", Icon: Zap, color: "#8b5cf6" },
  { href: "/cripto/trade", label: "Trade Spot", sub: "Execução real via Binance API + Futuros", Icon: Repeat2, color: "#f59e0b" },
  { href: "/cripto/finalizadas", label: "Histórico", sub: "Todas as operações com métricas de P&L", Icon: CheckCircle2, color: "#06b6d4" },
];

const FUTURES_TOOLS = [
  { href: "/cripto/futures", label: "IA Engine", sub: "17 perfis + 30 bots gregos. Auto Trade 24/7", Icon: BrainCircuit, color: "#10b981" },
  { href: "/cripto/cerebro", label: "Cérebro Central", sub: "Sinal agregado, Brain Score, classificação", Icon: Brain, color: "#6366f1" },
  { href: "/cripto/bot-srd", label: "BOT SRD", sub: "Scalping SRD com aprendizado incremental", Icon: Cpu, color: "#10b981" },
  { href: "/cripto/backtest", label: "Backtest & IA", sub: "Backtest + otimização + candidatos evolucionários", Icon: BarChart, color: "#f59e0b" },
];

export default function Home() {
  const [tickers, setTickers] = useState<TickerData[]>([]);
  const [fg, setFg] = useState<FearGreed | null>(null);
  const [stats, setStats] = useState({ totalOps: 0, winRate: null as number | null, activeBots: 0 });
  const [mounted, setMounted] = useState(false);
  const [authData, setAuthData] = useState<{ usuario: string } | null>(null);

  function fetchTickers() {
    const syms = JSON.stringify(WATCH);
    fetch(`https://api.binance.com/api/v3/ticker/24hr?symbols=${encodeURIComponent(syms)}`)
      .then((r) => r.json())
      .then((data: TickerData[]) => {
        const ordered = WATCH.map((s) => data.find((d) => d.symbol === s)).filter(Boolean) as TickerData[];
        setTickers(ordered);
      }).catch(() => {});
  }

  function fetchFG() {
    fetch("https://api.alternative.me/fng/?limit=1")
      .then((r) => r.json())
      .then((d) => { if (d.data?.[0]) setFg({ value: parseInt(d.data[0].value), value_classification: d.data[0].value_classification }); })
      .catch(() => {});
  }

  useEffect(() => {
    setMounted(true);
    setStats(loadStats());
    setAuthData(getAuthData());
    fetchTickers();
    fetchFG();
    const id = setInterval(fetchTickers, 15_000);
    return () => clearInterval(id);
  }, []);

  const btc = tickers.find((t) => t.symbol === "BTCUSDT");
  const btcPct = btc ? parseFloat(btc.priceChangePercent) : null;
  const btcUp = btcPct !== null && btcPct >= 0;
  const health = calcMarketHealth(fg, btcPct);

  return (
    <main className="min-h-screen relative overflow-x-hidden" style={{ background: "var(--bg-page)" }}>

      {/* Ambient orbs */}
      <div style={{ position: "absolute", top: "-60px", left: "8%", width: 600, height: 600, borderRadius: "50%", background: "radial-gradient(circle, rgba(99,102,241,0.055) 0%, transparent 65%)", pointerEvents: "none" }} />
      <div style={{ position: "absolute", top: "100px", right: "5%", width: 400, height: 400, borderRadius: "50%", background: "radial-gradient(circle, rgba(16,185,129,0.04) 0%, transparent 65%)", pointerEvents: "none" }} />

      {/* ── Ticker strip ── */}
      {tickers.length > 0 && (
        <div className="border-b no-scrollbar overflow-x-auto" style={{ background: "rgba(0,0,0,0.3)", borderColor: "var(--border)" }}>
          <div className="flex items-center gap-6 px-5 py-2.5 min-w-max">
            <div className="flex items-center gap-1.5 shrink-0 pr-3 border-r" style={{ borderColor: "var(--border)" }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22C55E", display: "inline-block", boxShadow: "0 0 6px rgba(34,197,94,0.8)" }} />
              <span className="text-[10.5px] font-semibold" style={{ color: "#22C55E" }}>LIVE</span>
            </div>
            {tickers.map((t) => {
              const pct = parseFloat(t.priceChangePercent);
              const pos = pct > 0;
              const neu = Math.abs(pct) < 0.05;
              const col = neu ? "var(--text-muted)" : pos ? "#22C55E" : "#EF4444";
              return (
                <Link key={t.symbol} href={`/cripto?coin=${t.symbol}`} className="flex items-center gap-2 no-underline shrink-0">
                  <span className="text-[11.5px] font-bold" style={{ color: "var(--text-primary)" }}>{t.symbol.replace("USDT","")}</span>
                  <span className="text-[11.5px]" style={{ color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>${fmtPrice(t.lastPrice)}</span>
                  <span className="text-[10.5px] font-semibold flex items-center gap-0.5 px-1.5 py-0.5 rounded" style={{ color: col, background: neu ? "transparent" : pos ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.08)" }}>
                    {neu ? <Minus size={9} /> : pos ? <TrendingUp size={9} /> : <TrendingDown size={9} />}
                    {pos && "+"}{pct.toFixed(2)}%
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-5 pt-10 pb-20">

        {/* ── Header da home ── */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <div className="text-[12px] font-semibold mb-1" style={{ color: "var(--text-muted)", letterSpacing: "1.5px", textTransform: "uppercase" }}>
              Bem-vindo de volta
            </div>
            <h1 className="text-[28px] sm:text-[36px] font-black tracking-tight" style={{ letterSpacing: "-0.04em", color: "var(--text-primary)", lineHeight: 1.15 }}>
              {authData?.usuario ?? "Rodrigo"}
            </h1>
          </div>

          {/* Market Health Badge */}
          <div style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "12px 18px", borderRadius: 14,
            background: health.bg, border: `1px solid ${health.border}`,
            minWidth: 200,
          }}>
            <div style={{ fontSize: 22 }}>{health.emoji}</div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.5px", textTransform: "uppercase", color: health.color, marginBottom: 1 }}>
                {health.label}
              </div>
              <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>
                Fear &amp; Greed: <span style={{ color: health.color, fontWeight: 700 }}>{fg?.value ?? "–"}</span>
                {btc && <span> · BTC {btcUp ? "+" : ""}{btcPct?.toFixed(2)}%</span>}
              </div>
            </div>
          </div>
        </div>

        {/* ── Stats line ── */}
        {mounted && (
          <div className="grid grid-cols-3 gap-3 mb-8">
            <div className="rounded-xl p-4 border" style={{ background: "rgba(99,102,241,0.06)", borderColor: "rgba(99,102,241,0.15)" }}>
              <div className="flex items-center gap-1.5 mb-1">
                <Activity size={11} style={{ color: "#6366f1" }} />
                <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: "#6366f1" }}>Total Ops</span>
              </div>
              <div className="text-[24px] font-black" style={{ color: "var(--text-primary)", fontVariantNumeric: "tabular-nums" }}>{stats.totalOps.toLocaleString("pt-BR")}</div>
            </div>
            {stats.winRate !== null && (
              <div className="rounded-xl p-4 border" style={{ background: stats.winRate >= 50 ? "rgba(16,185,129,0.06)" : "rgba(239,68,68,0.06)", borderColor: stats.winRate >= 50 ? "rgba(16,185,129,0.15)" : "rgba(239,68,68,0.15)" }}>
                <div className="flex items-center gap-1.5 mb-1">
                  <Target size={11} style={{ color: stats.winRate >= 50 ? "#10b981" : "#ef4444" }} />
                  <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: stats.winRate >= 50 ? "#10b981" : "#ef4444" }}>Win Rate</span>
                </div>
                <div className="text-[24px] font-black" style={{ color: stats.winRate >= 50 ? "#10b981" : "#ef4444", fontVariantNumeric: "tabular-nums" }}>{stats.winRate.toFixed(1)}%</div>
              </div>
            )}
            <div className="rounded-xl p-4 border" style={{ background: "rgba(16,185,129,0.06)", borderColor: "rgba(16,185,129,0.15)" }}>
              <div className="flex items-center gap-1.5 mb-1">
                <Bot size={11} style={{ color: "#10b981" }} />
                <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: "#10b981" }}>Bots Ativos</span>
              </div>
              <div className="text-[24px] font-black" style={{ color: "var(--text-primary)", fontVariantNumeric: "tabular-nums" }}>{stats.activeBots}</div>
            </div>
          </div>
        )}

        {/* ── Dois ambientes ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-8">

          {/* CARTEIRA */}
          <EnvironmentCard
            href="/carteira"
            emoji="📁"
            label="CARTEIRA"
            description="Spot · Swing · Longo Prazo · Análise Fundamentalista"
            color="#10b981"
            tools={CARTEIRA_TOOLS}
            badge="Análise & Trade"
          />

          {/* FUTURES */}
          <EnvironmentCard
            href="/futures"
            emoji="📈"
            label="FUTURES"
            description="Day Trade · Scalp · Alavancadas · Auto Trade 24/7"
            color="#6366f1"
            tools={FUTURES_TOOLS}
            badge="IA Engine"
          />
        </div>

        {/* ── Acesso rápido — Cérebro Central ── */}
        <CerebroCard />

        {/* ── Grade de módulos ── */}
        <div className="mt-8">
          <div className="flex items-center gap-3 mb-4">
            <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>Outros Módulos</span>
            <div className="flex-1 h-px" style={{ background: "var(--border-subtle)" }} />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { href: "/cripto/rsscore", label: "RS Score", Icon: BarChart, color: "#f59e0b", sub: "Força relativa" },
              { href: "/cripto/daytrade", label: "Day Trade", Icon: Zap, color: "#8b5cf6", sub: "Scanner multi-TF" },
              { href: "/cripto/ranking", label: "Rankings", Icon: Trophy, color: "#fbbf24", sub: "Pódio de carteiras" },
              { href: "/cripto/ia-analisa", label: "IA Analisa", Icon: BookOpen, color: "#06b6d4", sub: "Perfis OpenAI" },
            ].map(({ href, label, Icon, color, sub }) => (
              <Link key={href} href={href} className="no-underline group rounded-xl p-4 border flex flex-col transition-all duration-200" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = `${color}40`; e.currentTarget.style.background = `${color}07`; e.currentTarget.style.transform = "translateY(-2px)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.background = "var(--bg-card)"; e.currentTarget.style.transform = "translateY(0)"; }}>
                <div style={{ width: 34, height: 34, borderRadius: 10, background: `${color}15`, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 10 }}>
                  <Icon size={16} style={{ color }} />
                </div>
                <div className="text-[13px] font-bold" style={{ color: "var(--text-primary)" }}>{label}</div>
                <div className="text-[11.5px] mt-0.5" style={{ color: "var(--text-muted)" }}>{sub}</div>
              </Link>
            ))}
          </div>
        </div>

        {/* BTC info bottom */}
        {btc && (
          <div className="mt-8 text-center">
            <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
              BTC <span style={{ color: "var(--text-primary)", fontWeight: 700 }}>${fmtPrice(btc.lastPrice)}</span>
              {" · "}Vol {fmtVol(btc.quoteVolume)}
              {" · "}Dados em tempo real via Binance API
            </span>
          </div>
        )}
      </div>
    </main>
  );
}

function EnvironmentCard({
  href, emoji, label, description, color, tools, badge,
}: {
  href: string; emoji: string; label: string; description: string;
  color: string; tools: { href: string; label: string; sub: string; Icon: React.ElementType; color: string }[];
  badge: string;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      className="rounded-2xl border overflow-hidden transition-all duration-200"
      style={{
        background: hovered ? `${color}07` : "var(--bg-card)",
        borderColor: hovered ? `${color}40` : "var(--border)",
        boxShadow: hovered ? `0 0 40px ${color}15, 0 8px 32px rgba(0,0,0,0.25)` : "none",
        transform: hovered ? "translateY(-2px)" : "translateY(0)",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Header da card */}
      <div className="p-5 pb-4" style={{ borderBottom: `1px solid ${color}15` }}>
        <div className="flex items-start justify-between mb-3">
          <div style={{
            width: 48, height: 48, borderRadius: 14,
            background: `${color}15`, border: `1px solid ${color}25`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 22,
          }}>
            {emoji}
          </div>
          <span style={{
            fontSize: 10, fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase",
            padding: "4px 10px", borderRadius: 99,
            background: `${color}12`, color, border: `1px solid ${color}25`,
          }}>
            {badge}
          </span>
        </div>
        <div className="text-[22px] font-black tracking-tight" style={{ color: "var(--text-primary)", letterSpacing: "-0.04em", marginBottom: 4 }}>
          {label}
        </div>
        <div className="text-[12.5px]" style={{ color: "var(--text-muted)", lineHeight: 1.5 }}>
          {description}
        </div>
        <Link href={href} className="no-underline inline-flex items-center gap-1.5 mt-4 px-4 py-2 rounded-xl text-[12.5px] font-semibold transition-all duration-150"
          style={{ background: `${color}15`, color, border: `1px solid ${color}25` }}
          onMouseEnter={(e) => { e.currentTarget.style.background = `${color}25`; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = `${color}15`; }}>
          Abrir área
          <ArrowUpRight size={13} />
        </Link>
      </div>

      {/* Ferramentas */}
      <div className="p-3 grid grid-cols-2 gap-2">
        {tools.map(({ href: th, label: tl, sub: ts, Icon, color: tc }) => (
          <Link key={th} href={th} className="no-underline rounded-xl p-3 border transition-all duration-150"
            style={{ background: "rgba(255,255,255,0.02)", borderColor: "rgba(255,255,255,0.05)" }}
            onMouseEnter={(e) => { e.currentTarget.style.background = `${tc}08`; e.currentTarget.style.borderColor = `${tc}30`; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.02)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.05)"; }}>
            <div style={{ width: 28, height: 28, borderRadius: 8, background: `${tc}15`, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 8 }}>
              <Icon size={13} style={{ color: tc }} />
            </div>
            <div className="text-[11.5px] font-bold" style={{ color: "var(--text-primary)" }}>{tl}</div>
            <div className="text-[10px] mt-0.5 leading-relaxed" style={{ color: "var(--text-muted)" }}>{ts}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function CerebroCard() {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      className="rounded-2xl border p-5 transition-all duration-200"
      style={{
        background: hovered ? "rgba(99,102,241,0.07)" : "var(--bg-card)",
        borderColor: hovered ? "rgba(99,102,241,0.4)" : "rgba(99,102,241,0.2)",
        boxShadow: hovered ? "0 0 40px rgba(99,102,241,0.12), 0 8px 32px rgba(0,0,0,0.2)" : "0 0 0 1px rgba(99,102,241,0.08)",
        transform: hovered ? "translateY(-2px)" : "translateY(0)",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <div style={{
            width: 52, height: 52, borderRadius: 15,
            background: "linear-gradient(135deg, rgba(99,102,241,0.2), rgba(168,85,247,0.15))",
            border: "1px solid rgba(99,102,241,0.35)",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 0 24px rgba(99,102,241,0.2)",
          }}>
            <Brain size={24} style={{ color: "#818cf8" }} />
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[18px] font-black" style={{ color: "var(--text-primary)", letterSpacing: "-0.04em" }}>Cérebro Central</span>
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase", padding: "2px 8px", borderRadius: 99, background: "rgba(99,102,241,0.12)", color: "#818cf8", border: "1px solid rgba(99,102,241,0.25)" }}>NÚCLEO</span>
            </div>
            <p className="text-[12.5px]" style={{ color: "var(--text-muted)", lineHeight: 1.5 }}>
              Hub central de inteligência · Brain Score · Classificação Premium/Forte/Moderada/Experimental · Aprende com cada resultado
            </p>
          </div>
        </div>
        <Link href="/cripto/cerebro" className="no-underline inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-[13px] transition-all duration-150 shrink-0"
          style={{ background: "rgba(99,102,241,0.15)", color: "#818cf8", border: "1px solid rgba(99,102,241,0.3)" }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(99,102,241,0.25)"; e.currentTarget.style.boxShadow = "0 0 16px rgba(99,102,241,0.2)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(99,102,241,0.15)"; e.currentTarget.style.boxShadow = "none"; }}>
          Abrir Cérebro
          <ArrowUpRight size={14} />
        </Link>
      </div>
    </div>
  );
}
