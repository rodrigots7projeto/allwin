"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { AnaliseHubNav } from "@/components/AnaliseHubNav";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

// ── Mapeamento TradingView ────────────────────────────────────────────────────

const TV_SYMBOLS: Record<string, string> = {
  BTC:  "BINANCE:BTCUSDT",
  ETH:  "BINANCE:ETHUSDT",
  SOL:  "BINANCE:SOLUSDT",
  BNB:  "BINANCE:BNBUSDT",
  XRP:  "BINANCE:XRPUSDT",
  DOGE: "BINANCE:DOGEUSDT",
  ADA:  "BINANCE:ADAUSDT",
  AVAX: "BINANCE:AVAXUSDT",
  LINK: "BINANCE:LINKUSDT",
  LTC:  "BINANCE:LTCUSDT",
  DOT:  "BINANCE:DOTUSDT",
  MATIC:"BINANCE:MATICUSDT",
};

const MOEDAS = [
  { simbolo: "BTC",  nome: "Bitcoin",   icon: "₿" },
  { simbolo: "ETH",  nome: "Ethereum",  icon: "Ξ" },
  { simbolo: "SOL",  nome: "Solana",    icon: "◎" },
  { simbolo: "BNB",  nome: "BNB",       icon: "B" },
  { simbolo: "XRP",  nome: "XRP",       icon: "✕" },
  { simbolo: "DOGE", nome: "Dogecoin",  icon: "Ð" },
  { simbolo: "ADA",  nome: "Cardano",   icon: "₳" },
  { simbolo: "AVAX", nome: "Avalanche", icon: "A" },
  { simbolo: "LINK", nome: "Chainlink", icon: "⬡" },
  { simbolo: "LTC",  nome: "Litecoin",  icon: "Ł" },
  { simbolo: "DOT",  nome: "Polkadot",  icon: "●" },
  { simbolo: "MATIC",nome: "Polygon",   icon: "⬟" },
];

const INTERVALOS = [
  { label: "1h",  tv: "60"  },
  { label: "4h",  tv: "240" },
  { label: "1D",  tv: "D"   },
  { label: "1S",  tv: "W"   },
  { label: "1M",  tv: "M"   },
];

// ── Tipos backend ─────────────────────────────────────────────────────────────

interface Candle {
  data: string;
  timestamp: number;
  abertura: number;
  maxima: number;
  minima: number;
  fechamento: number;
  volume: number;
}

// ── TradingView Widget ────────────────────────────────────────────────────────

declare global {
  interface Window {
    TradingView?: {
      widget: new (config: Record<string, unknown>) => unknown;
    };
  }
}

function TradingViewWidget({ simbolo, intervalo, tema }: {
  simbolo: string;
  intervalo: string;
  tema: "dark" | "light";
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetRef    = useRef<unknown>(null);
  const scriptRef    = useRef<HTMLScriptElement | null>(null);

  useEffect(() => {
    const containerId = `tv_${simbolo}_${Date.now()}`;
    if (!containerRef.current) return;
    containerRef.current.id = containerId;

    function createWidget() {
      if (!window.TradingView || !containerRef.current) return;
      widgetRef.current = new window.TradingView.widget({
        container_id:       containerId,
        symbol:             TV_SYMBOLS[simbolo] ?? `BINANCE:${simbolo}USDT`,
        interval:           intervalo,
        timezone:           "America/Sao_Paulo",
        theme:              tema,
        style:              "1",       // candlestick
        locale:             "br",
        toolbar_bg:         tema === "dark" ? "#1a1a2e" : "#f8fafc",
        enable_publishing:  false,
        hide_top_toolbar:   false,
        hide_legend:        false,
        save_image:         false,
        withdateranges:     true,
        allow_symbol_change:false,
        width:              "100%",
        height:             520,
        studies: [
          "MASimple@tv-basicstudies",
          "MACD@tv-basicstudies",
          "RSI@tv-basicstudies",
          "BB@tv-basicstudies",
          "Volume@tv-basicstudies",
        ],
        overrides: {
          "mainSeriesProperties.candleStyle.upColor":       "#10b981",
          "mainSeriesProperties.candleStyle.downColor":     "#ef4444",
          "mainSeriesProperties.candleStyle.borderUpColor": "#10b981",
          "mainSeriesProperties.candleStyle.borderDownColor":"#ef4444",
          "mainSeriesProperties.candleStyle.wickUpColor":   "#10b981",
          "mainSeriesProperties.candleStyle.wickDownColor": "#ef4444",
        },
      });
    }

    if (window.TradingView) {
      createWidget();
    } else {
      const existing = document.getElementById("tv-script");
      if (existing) {
        existing.addEventListener("load", createWidget, { once: true });
      } else {
        const script = document.createElement("script");
        script.id  = "tv-script";
        script.src = "https://s3.tradingview.com/tv.js";
        script.async = true;
        script.onload = createWidget;
        document.head.appendChild(script);
        scriptRef.current = script;
      }
    }

    return () => {
      if (containerRef.current) containerRef.current.innerHTML = "";
    };
  }, [simbolo, intervalo, tema]);

  return (
    <div className="rounded-xl overflow-hidden border border-[var(--border)]">
      <div ref={containerRef} className="w-full" style={{ height: 520 }} />
    </div>
  );
}

// ── Lightweight Charts (candlestick BRL) ──────────────────────────────────────

function LightweightChart({ candles, simbolo, tema }: {
  candles: Candle[];
  simbolo: string;
  tema: "dark" | "light";
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current || candles.length === 0) return;

    let chart: unknown = null;
    let cleanup = () => {};

    import("lightweight-charts").then(({ createChart, CrosshairMode }) => {
      if (!containerRef.current) return;

      const isDark = tema === "dark";
      chart = createChart(containerRef.current, {
        width:  containerRef.current.clientWidth,
        height: 480,
        layout: {
          background: { color: isDark ? "#0f172a" : "#ffffff" },
          textColor:  isDark ? "#94a3b8" : "#374151",
        },
        grid: {
          vertLines:   { color: isDark ? "#1e293b" : "#f1f5f9" },
          horzLines:   { color: isDark ? "#1e293b" : "#f1f5f9" },
        },
        crosshair: { mode: CrosshairMode.Normal },
        rightPriceScale: {
          borderColor: isDark ? "#334155" : "#e2e8f0",
        },
        timeScale: {
          borderColor:   isDark ? "#334155" : "#e2e8f0",
          timeVisible:   true,
          secondsVisible:false,
        },
      });

      const c = chart as {
        addCandlestickSeries: (o: Record<string, unknown>) => {
          setData: (d: unknown[]) => void;
        };
        addHistogramSeries: (o: Record<string, unknown>) => {
          setData: (d: unknown[]) => void;
        };
        timeScale: () => { fitContent: () => void };
        remove: () => void;
        resize: (w: number, h: number) => void;
      };

      const candleSeries = c.addCandlestickSeries({
        upColor:          "#10b981",
        downColor:        "#ef4444",
        borderUpColor:    "#10b981",
        borderDownColor:  "#ef4444",
        wickUpColor:      "#10b981",
        wickDownColor:    "#ef4444",
      });

      const volSeries = c.addHistogramSeries({
        priceFormat:    { type: "volume" },
        priceScaleId:   "",
        color:          "#22d3ee",
        base:           0,
        scaleMargins:   { top: 0.85, bottom: 0 },
      });

      const cData = candles.map((cd) => ({
        time:  cd.timestamp as unknown as string,
        open:  cd.abertura,
        high:  cd.maxima,
        low:   cd.minima,
        close: cd.fechamento,
      }));

      const vData = candles.map((cd) => ({
        time:  cd.timestamp as unknown as string,
        value: cd.volume,
        color: cd.fechamento >= cd.abertura ? "#10b98140" : "#ef444440",
      }));

      candleSeries.setData(cData);
      volSeries.setData(vData);
      c.timeScale().fitContent();

      const ro = new ResizeObserver(() => {
        if (containerRef.current && c) {
          c.resize(containerRef.current.clientWidth, 480);
        }
      });
      if (containerRef.current) ro.observe(containerRef.current);

      cleanup = () => {
        ro.disconnect();
        c.remove();
      };
    });

    return () => cleanup();
  }, [candles, tema]);

  return (
    <div className="rounded-xl overflow-hidden border border-[var(--border)]">
      <div className="px-4 py-2 border-b border-[var(--border)] flex items-center gap-2">
        <span className="text-xs font-semibold text-emerald-500">🕯 Candles BRL</span>
        <span className="text-xs text-[var(--text-muted)]">— {simbolo}/BRL via CoinGecko · {candles.length} dias</span>
      </div>
      <div ref={containerRef} className="w-full" style={{ height: 480 }} />
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function ChartsPage() {
  const [simbolo,   setSimboloRaw] = useState("BTC");
  const [intervalo, setIntervalo]  = useState("D");
  const [modo,      setModo]       = useState<"tv" | "brl">("tv");
  const [candles,   setCandles]    = useState<Candle[]>([]);
  const [loadingBRL,setLoadingBRL] = useState(false);
  const [tema,      setTema]       = useState<"dark" | "light">("dark");

  // Detecta tema do sistema
  useEffect(() => {
    const root = document.documentElement;
    const t = root.getAttribute("data-theme") as "dark" | "light" | null;
    setTema(t ?? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));

    const obs = new MutationObserver(() => {
      const t2 = root.getAttribute("data-theme") as "dark" | "light" | null;
      setTema(t2 ?? "dark");
    });
    obs.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);

  const fetchCandles = useCallback((sim: string) => {
    setLoadingBRL(true);
    fetch(`${API}/cripto/${sim}`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        const raw: Candle[] = d?.historico?.candles ?? [];
        setCandles(raw);
        setLoadingBRL(false);
      })
      .catch(() => setLoadingBRL(false));
  }, []);

  const setSimbol = (s: string) => {
    setSimboloRaw(s);
    if (modo === "brl") fetchCandles(s);
  };

  useEffect(() => {
    if (modo === "brl") fetchCandles(simbolo);
  }, [modo, simbolo, fetchCandles]);

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-4">
      <AnaliseHubNav />

      {/* ── Seletor de moeda ── */}
      <div className="flex flex-wrap gap-1.5">
        {MOEDAS.map((m) => (
          <button
            key={m.simbolo}
            onClick={() => setSimbol(m.simbolo)}
            title={m.nome}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
              simbolo === m.simbolo
                ? "bg-emerald-500 text-white border-emerald-500 shadow"
                : "bg-[var(--bg-card)] text-[var(--text-secondary)] border-[var(--border)] hover:border-emerald-400 hover:text-[var(--text-primary)]"
            }`}
          >
            <span className="font-mono text-sm leading-none">{m.icon}</span>
            {m.simbolo}
          </button>
        ))}
      </div>

      {/* ── Controles ── */}
      <div className="flex flex-wrap items-center gap-3">

        {/* Toggle modo */}
        <div className="flex rounded-lg border border-[var(--border)] overflow-hidden">
          <button
            onClick={() => setModo("tv")}
            className={`px-4 py-2 text-xs font-semibold transition-all ${
              modo === "tv"
                ? "bg-blue-600 text-white"
                : "bg-[var(--bg-card)] text-[var(--text-secondary)] hover:bg-[var(--border)]/40"
            }`}
          >
            📺 TradingView
          </button>
          <button
            onClick={() => setModo("brl")}
            className={`px-4 py-2 text-xs font-semibold transition-all ${
              modo === "brl"
                ? "bg-emerald-600 text-white"
                : "bg-[var(--bg-card)] text-[var(--text-secondary)] hover:bg-[var(--border)]/40"
            }`}
          >
            🕯 Candles BRL
          </button>
        </div>

        {/* Intervalo (só TradingView) */}
        {modo === "tv" && (
          <div className="flex rounded-lg border border-[var(--border)] overflow-hidden">
            {INTERVALOS.map((iv) => (
              <button
                key={iv.tv}
                onClick={() => setIntervalo(iv.tv)}
                className={`px-3 py-2 text-xs font-semibold transition-all ${
                  intervalo === iv.tv
                    ? "bg-[var(--border)] text-[var(--text-primary)]"
                    : "bg-[var(--bg-card)] text-[var(--text-secondary)] hover:bg-[var(--border)]/40"
                }`}
              >
                {iv.label}
              </button>
            ))}
          </div>
        )}

        {/* Badge símbolo */}
        <div className="ml-auto text-xs text-[var(--text-muted)]">
          {modo === "tv"
            ? `${TV_SYMBOLS[simbolo] ?? simbolo} • par USDT`
            : `${simbolo}/BRL • CoinGecko • diário`
          }
        </div>
      </div>

      {/* ── Charts ── */}
      {modo === "tv" ? (
        <TradingViewWidget
          key={`${simbolo}-${intervalo}`}
          simbolo={simbolo}
          intervalo={intervalo}
          tema={tema}
        />
      ) : loadingBRL ? (
        <div className="flex items-center justify-center h-[480px] bg-[var(--bg-card)] rounded-xl border border-[var(--border)]">
          <div className="text-center">
            <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-[var(--text-secondary)]">Carregando candles BRL…</p>
          </div>
        </div>
      ) : candles.length > 0 ? (
        <LightweightChart key={simbolo} candles={candles} simbolo={simbolo} tema={tema} />
      ) : (
        <div className="flex items-center justify-center h-[480px] bg-[var(--bg-card)] rounded-xl border border-[var(--border)]">
          <p className="text-sm text-[var(--text-muted)]">Sem dados disponíveis</p>
        </div>
      )}

      {/* ── Info footer ── */}
      <div className="text-xs text-[var(--text-muted)] text-center pb-2">
        {modo === "tv"
          ? "Gráfico em tempo real via TradingView · par USDT na Binance"
          : "Candles históricos em BRL via CoinGecko API · atualizado a cada 1h"
        }
      </div>
    </div>
  );
}
