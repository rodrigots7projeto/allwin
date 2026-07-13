"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  BarChart2,
  Zap,
  BrainCircuit,
  Repeat2,
  TrendingUp,
  TrendingDown,
  Minus,
  ArrowRight,
} from "lucide-react";

interface TickerData {
  symbol: string;
  lastPrice: string;
  priceChangePercent: string;
  quoteVolume: string;
}

const WATCH = [
  "BTCUSDT","ETHUSDT","BNBUSDT","SOLUSDT",
  "XRPUSDT","ADAUSDT","DOGEUSDT","AVAXUSDT",
];

const SECTIONS = [
  {
    href: "/cripto",
    label: "Análise",
    sub: "Deep dive técnico por moeda — RSI, MACD, EMA, Bollinger, Fibonacci, sentimento e probabilidade log-normal.",
    Icon: BarChart2,
    accent: "#3B82F6",
    tags: ["Técnica", "Gráficos", "vs BTC", "Motor IA"],
  },
  {
    href: "/cripto/sinais",
    label: "Sinais IA",
    sub: "Scanner com score composto, grade A+/A/B/C, timing AGORA/EM BREVE e histórico de acerto com P&L real.",
    Icon: Zap,
    accent: "#8B5CF6",
    tags: ["Score IA", "RS Pro", "Day Trade", "Histórico"],
  },
  {
    href: "/cripto/futures",
    label: "IA Engine",
    sub: "Paper trading com 16 carteiras, perfis IA configuráveis, backtest com otimização por gerações e auto-trade.",
    Icon: BrainCircuit,
    accent: "#10B981",
    tags: ["Carteiras", "Perfis IA", "Backtest", "Auto Trade"],
  },
  {
    href: "/cripto/trade",
    label: "Trade Spot",
    sub: "Trading real via Binance API com credenciais locais. Posições, ordens e 50+ pares em um lugar.",
    Icon: Repeat2,
    accent: "#F59E0B",
    tags: ["Spot", "Ordens", "Posições", "50+ pares"],
  },
  {
    href: "/cripto/trade-futuros",
    label: "Trade Futuros",
    sub: "Futuros Binance com alavancagem, LONG & SHORT, gestão de risco e liquidação automática.",
    Icon: TrendingUp,
    accent: "#EF4444",
    tags: ["Futures", "LONG/SHORT", "Alavancagem", "Risco"],
  },
];

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

function coinLabel(symbol: string): string {
  return symbol.replace("USDT", "");
}

export default function Home() {
  const [tickers, setTickers] = useState<TickerData[]>([]);

  function fetchTickers() {
    const syms = JSON.stringify(WATCH);
    fetch(`https://api.binance.com/api/v3/ticker/24hr?symbols=${encodeURIComponent(syms)}`)
      .then((r) => r.json())
      .then((data: TickerData[]) => {
        const ordered = WATCH
          .map((s) => data.find((d) => d.symbol === s))
          .filter(Boolean) as TickerData[];
        setTickers(ordered);
      })
      .catch(() => {});
  }

  useEffect(() => {
    fetchTickers();
    const id = setInterval(fetchTickers, 15000);
    return () => clearInterval(id);
  }, []);

  const btc = tickers.find((t) => t.symbol === "BTCUSDT");
  const btcPct = btc ? parseFloat(btc.priceChangePercent) : null;

  return (
    <main className="min-h-screen">
      {/* ── Ticker strip ── */}
      {tickers.length > 0 && (
        <div
          className="border-b overflow-x-auto"
          style={{
            background: "rgba(0,0,0,0.25)",
            borderColor: "var(--border)",
            scrollbarWidth: "none",
          }}
        >
          <div className="flex items-center gap-5 px-5 py-2 min-w-max">
            {tickers.map((t) => {
              const pct = parseFloat(t.priceChangePercent);
              const pos = pct > 0;
              const neu = Math.abs(pct) < 0.05;
              return (
                <Link
                  key={t.symbol}
                  href={`/cripto?coin=${t.symbol}`}
                  className="flex items-center gap-2 no-underline shrink-0 group"
                >
                  <span
                    className="text-[11.5px] font-bold"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {coinLabel(t.symbol)}
                  </span>
                  <span
                    className="text-[11.5px] font-mono"
                    style={{ color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}
                  >
                    ${fmtPrice(t.lastPrice)}
                  </span>
                  <span
                    className="text-[10.5px] font-semibold flex items-center gap-0.5"
                    style={{
                      color: neu ? "var(--text-muted)" : pos ? "#10B981" : "#EF4444",
                    }}
                  >
                    {neu ? (
                      <Minus size={9} />
                    ) : pos ? (
                      <TrendingUp size={9} />
                    ) : (
                      <TrendingDown size={9} />
                    )}
                    {pos && "+"}
                    {pct.toFixed(2)}%
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Hero ── */}
      <div className="max-w-5xl mx-auto px-5 pt-16 pb-10 text-center">
        {/* BTC status pill */}
        {btc && btcPct !== null && (
          <div
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[11px] font-semibold mb-6"
            style={{
              background: btcPct >= 0 ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.1)",
              border: `1px solid ${btcPct >= 0 ? "rgba(16,185,129,0.3)" : "rgba(239,68,68,0.3)"}`,
              color: btcPct >= 0 ? "#10B981" : "#EF4444",
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: btcPct >= 0 ? "#10B981" : "#EF4444",
                display: "inline-block",
                boxShadow: btcPct >= 0
                  ? "0 0 6px rgba(16,185,129,0.6)"
                  : "0 0 6px rgba(239,68,68,0.6)",
              }}
            />
            BTC ${fmtPrice(btc.lastPrice)} &nbsp;·&nbsp;
            {btcPct >= 0 ? "+" : ""}{btcPct.toFixed(2)}% 24h
            &nbsp;·&nbsp; Vol {fmtVol(btc.quoteVolume)}
          </div>
        )}

        <h1
          className="text-4xl sm:text-[52px] font-black tracking-tight leading-none mb-4"
          style={{ color: "var(--text-primary)", letterSpacing: "-0.035em" }}
        >
          Análise profissional
          <br />
          <span
            style={{
              background: "linear-gradient(135deg, #F7931A 0%, #FBBF24 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            para cripto.
          </span>
        </h1>
        <p
          className="text-[15px] sm:text-[17px] max-w-lg mx-auto"
          style={{ color: "var(--text-secondary)", lineHeight: 1.65 }}
        >
          Score IA, sinais em tempo real, paper trading e execução real na Binance — tudo em uma só plataforma.
        </p>
      </div>

      {/* ── Section cards ── */}
      <div className="max-w-5xl mx-auto px-5 pb-20">
        <p
          className="text-[11px] font-semibold uppercase tracking-widest mb-4"
          style={{ color: "var(--text-muted)" }}
        >
          Seções
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {SECTIONS.map(({ href, label, sub, Icon, accent, tags }) => (
            <Link
              key={href}
              href={href}
              className="group no-underline rounded-xl p-5 border flex flex-col transition-all duration-200"
              style={{
                background: "var(--bg-card)",
                borderColor: "var(--border)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = `${accent}50`;
                e.currentTarget.style.background = `${accent}0A`;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "var(--border)";
                e.currentTarget.style.background = "var(--bg-card)";
              }}
            >
              <div className="flex items-start justify-between mb-3">
                <div
                  className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: `${accent}18` }}
                >
                  <Icon size={17} style={{ color: accent }} />
                </div>
                <ArrowRight
                  size={13}
                  className="opacity-0 group-hover:opacity-60 transition-opacity mt-1"
                  style={{ color: accent }}
                />
              </div>

              <div
                className="text-[14.5px] font-bold mb-1.5"
                style={{ color: "var(--text-primary)" }}
              >
                {label}
              </div>
              <div
                className="text-[12.5px] mb-4 flex-1"
                style={{ color: "var(--text-secondary)", lineHeight: 1.55 }}
              >
                {sub}
              </div>

              <div className="flex flex-wrap gap-1">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                    style={{
                      background: "rgba(255,255,255,0.04)",
                      color: "var(--text-muted)",
                      border: "1px solid var(--border)",
                    }}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
