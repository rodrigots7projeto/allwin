"use client";

import { AnalyticsPanel } from "@/components/alpha/AnalyticsPanel";
import { AlphaPriceChart } from "@/components/alpha/AlphaPriceChart";
import { CompanyOverviewCard } from "@/components/alpha/CompanyOverviewCard";
import { EarningsChart } from "@/components/alpha/EarningsChart";
import { FundamentaisAlphaCard } from "@/components/alpha/FundamentaisAlphaCard";
import { VolumeChart } from "@/components/alpha/VolumeChart";
import { getAlphaStock, getCotacao, getEmpresaB3, getHistorico } from "@/lib/api";
import type { AlphaFullPortfolio, PontoHistorico, QuoteData } from "@/types";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

// ── Formatadores ──────────────────────────────────────────────────────────────

const R = (v: number, d = 2) =>
  `R$ ${new Intl.NumberFormat("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d }).format(v)}`;

const Pct = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;

const Vol = (v: number) => {
  if (v >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
  return String(v);
};

const Bi = (v: number | null) => {
  if (!v) return "—";
  if (v >= 1e12) return `R$ ${(v / 1e12).toFixed(2)} tri`;
  if (v >= 1e9)  return `R$ ${(v / 1e9).toFixed(1)} bi`;
  if (v >= 1e6)  return `R$ ${(v / 1e6).toFixed(0)} mi`;
  return R(v);
};

// ── Skeleton ──────────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="w-full space-y-4 animate-pulse">
      <div className="h-36 rounded-2xl bg-[var(--border)]/40" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => <div key={i} className="h-24 rounded-2xl bg-[var(--border)]/40" />)}
      </div>
      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <div className="h-80 rounded-2xl bg-[var(--border)]/40" />
          <div className="h-56 rounded-2xl bg-[var(--border)]/40" />
          <div className="h-64 rounded-2xl bg-[var(--border)]/40" />
        </div>
        <div className="space-y-4">
          <div className="h-96 rounded-2xl bg-[var(--border)]/40" />
          <div className="h-80 rounded-2xl bg-[var(--border)]/40" />
        </div>
      </div>
    </div>
  );
}

// ── Stat Card ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, cor = "neutral", icon }: {
  label: string; value: string; sub?: string;
  cor?: "emerald" | "red" | "amber" | "blue" | "neutral"; icon?: string;
}) {
  const COR: Record<string, string> = {
    emerald: "text-emerald-500 bg-emerald-500/10",
    red:     "text-red-500 bg-red-500/10",
    amber:   "text-amber-400 bg-amber-400/10",
    blue:    "text-blue-400 bg-blue-400/10",
    neutral: "text-[var(--text-secondary)] bg-[var(--border)]/30",
  };
  const textCor = COR[cor].split(" ")[0];
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4 flex flex-col gap-1.5">
      <p className="text-xs text-[var(--text-secondary)] font-medium">{label}</p>
      <p className={`text-xl font-bold leading-tight ${textCor}`}>
        {icon && <span className="mr-1 text-base">{icon}</span>}{value}
      </p>
      {sub && <span className={`text-xs px-2 py-0.5 rounded-full w-fit font-medium ${COR[cor]}`}>{sub}</span>}
    </div>
  );
}

// ── Tab: US Stocks ─────────────────────────────────────────────────────────────

const US_SUGESTOES = ["IBM", "AAPL", "TSLA", "MSFT", "AMZN", "GOOGL", "META", "NVDA"];

function TabUS() {
  const [symbol, setSymbol] = useState("IBM");
  const [input, setInput]   = useState("IBM");
  const [data, setData]     = useState<AlphaFullPortfolio | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  const buscar = useCallback(async (sym: string) => {
    const s = sym.trim().toUpperCase();
    if (!s) return;
    abort.current?.abort();
    abort.current = new AbortController();
    setLoading(true); setError(null); setSymbol(s); setInput(s);
    try {
      setData(await getAlphaStock(s));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao buscar dados");
      setData(null);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { buscar("IBM"); }, [buscar]);

  const d = data;
  const varCor = (v: number) => v >= 0 ? "emerald" : "red" as const;

  return (
    <div className="flex flex-col gap-6">
      {/* Busca */}
      <form onSubmit={(e) => { e.preventDefault(); buscar(input); }} className="flex gap-2 max-w-md">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value.toUpperCase())}
          placeholder="Ex: AAPL, TSLA, MSFT…"
          maxLength={10}
          className="flex-1 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-2.5
                     text-sm font-mono text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]
                     focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/50 transition-all"
        />
        <button
          type="submit" disabled={loading}
          className="px-5 py-2.5 rounded-xl bg-blue-500 text-white text-sm font-semibold
                     hover:bg-blue-600 disabled:opacity-50 transition-colors shrink-0"
        >
          {loading ? "…" : "Analisar"}
        </button>
      </form>

      {/* Sugestões */}
      <div className="flex flex-wrap gap-2 -mt-3">
        {US_SUGESTOES.map((s) => (
          <button key={s} onClick={() => buscar(s)}
            className={`px-3 py-1 rounded-lg text-xs font-mono font-semibold border transition-all
              ${symbol === s
                ? "border-blue-500 bg-blue-500/15 text-blue-400"
                : "border-[var(--border)] text-[var(--text-secondary)] hover:border-blue-500/50 hover:text-blue-400"}`}>
            {s}
          </button>
        ))}
      </div>

      {loading && <Skeleton />}
      {error && !loading && (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-5 text-center">
          <p className="text-red-400 font-semibold mb-1">Ativo não encontrado</p>
          <p className="text-sm text-[var(--text-secondary)]">{error}</p>
          <p className="text-xs text-[var(--text-secondary)] mt-2">
            Limite gratuito Alpha Vantage: 25 req/dia · 5 req/min
          </p>
        </div>
      )}

      {d && !loading && (
        <div className="space-y-4">
          {/* Header ativo */}
          <div className="flex items-start justify-between gap-3 rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-blue-500/15 flex items-center justify-center shrink-0">
                <span className="text-blue-400 font-bold">{d.symbol.slice(0, 2)}</span>
              </div>
              <div>
                <h2 className="text-lg font-bold text-[var(--text-primary)]">{d.symbol}</h2>
                <p className="text-xs text-[var(--text-secondary)]">{d.overview.nome} · {d.overview.exchange}</p>
              </div>
            </div>
            <div className="text-right shrink-0">
              <p className="text-2xl font-bold text-[var(--text-primary)]">{R(d.preco_brl)}</p>
              <p className={`text-sm font-semibold ${d.variacao_pct >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                {d.variacao_pct >= 0 ? "▲" : "▼"} {R(Math.abs(d.variacao_brl))} ({Pct(d.variacao_pct)})
              </p>
              <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                USD/BRL: {d.usd_brl.toFixed(4)} · {d.data_cotacao}
              </p>
            </div>
          </div>

          {/* 4 Stat Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard label="Máxima / Mínima"
              value={`${R(d.maximo_brl)} / ${R(d.minimo_brl)}`}
              sub={`Abertura: ${R(d.abertura_brl)}`} cor="neutral" />
            <StatCard label="Variação diária"
              value={Pct(d.variacao_pct)}
              sub={`Ontem: ${R(d.fechamento_anterior_brl)}`}
              cor={varCor(d.variacao_pct)} icon={d.variacao_pct >= 0 ? "▲" : "▼"} />
            <StatCard label="Market Cap"
              value={Bi(d.overview.market_cap_brl)}
              sub={d.overview.setor || undefined} cor="blue" />
            <StatCard label="Volume"
              value={Vol(d.volume)}
              sub={`P/L: ${d.overview.pe_trailing?.toFixed(1) ?? "—"}×`}
              cor={d.volume > (d.series[d.series.length - 1]?.volume ?? 0) ? "emerald" : "amber"} />
          </div>

          {/* Layout principal: gráficos + sidepanel */}
          <div className="grid lg:grid-cols-3 gap-4">

            {/* Coluna esquerda: gráficos */}
            <div className="lg:col-span-2 space-y-4">
              <CompanyOverviewCard overview={d.overview} symbol={d.symbol} />
              <AlphaPriceChart series={d.series} symbol={d.symbol} sma7={d.sma7_brl} sma21={d.sma21_brl} />
              <VolumeChart series={d.series} volumeMedio={
                d.series.reduce((s, p) => s + p.volume, 0) / (d.series.length || 1)
              } />
              {d.earnings.length > 0 && <EarningsChart earnings={d.earnings} />}
            </div>

            {/* Coluna direita: análise */}
            <div className="space-y-4">
              <AnalyticsPanel
                score={d.score}
                insights={d.insights}
                tendencia={d.tendencia}
                sma7={d.sma7_brl}
                sma21={d.sma21_brl}
                precoAtual={d.preco_brl}
                maximo30d={Math.max(...d.series.slice(-30).map((p) => p.maximo))}
                minimo30d={Math.min(...d.series.slice(-30).map((p) => p.minimo))}
              />
              <FundamentaisAlphaCard overview={d.overview} precoAtual={d.preco_brl} />
            </div>
          </div>

          <p className="text-center text-[11px] text-[var(--text-secondary)] pb-4">
            Fonte: Alpha Vantage · Preços convertidos com USD/BRL = {d.usd_brl.toFixed(4)} ·
            Cache: QUOTE 5min · FUNDAMENTOS 24h · Não constitui recomendação de investimento
          </p>
        </div>
      )}
    </div>
  );
}

// ── Tab: B3 Brasil ─────────────────────────────────────────────────────────────

const B3_SUGESTOES = ["PETR4", "VALE3", "ITUB4", "WEGE3", "BBAS3", "RDOR3", "KNRI11", "HGLG11", "XPLG11", "MXRF11"];

function TabB3() {
  const [ticker, setTicker]   = useState("PETR4");
  const [input, setInput]     = useState("PETR4");
  const [cotacao, setCotacao] = useState<QuoteData | null>(null);
  const [hist, setHist]       = useState<PontoHistorico[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const buscar = useCallback(async (t: string) => {
    const s = t.trim().toUpperCase();
    if (!s) return;
    setLoading(true); setError(null); setTicker(s); setInput(s);
    try {
      const [q, h, empresa] = await Promise.all([
        getCotacao(s),
        getHistorico(s, "1y", "1wk").catch(() => [] as PontoHistorico[]),
        getEmpresaB3(s).catch(() => null),
      ]);
      // Enriquece setor/subsetor via B3 quando BRAPI não retorna
      if (!q.setor && empresa) {
        const classif = (empresa as { industryClassification?: string }).industryClassification ?? "";
        const partes = classif.split("/").map((p: string) => p.trim()).filter(Boolean);
        if (partes[0]) q.setor = partes[0];
        if (partes[1]) q.subsetor = partes[1];
      }
      setCotacao(q);
      setHist(h);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Ativo não encontrado");
      setCotacao(null); setHist([]);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { buscar("PETR4"); }, [buscar]);

  const q = cotacao;
  const up = q && q.variacao_pct >= 0;

  return (
    <div className="flex flex-col gap-6">
      {/* Busca */}
      <form onSubmit={(e) => { e.preventDefault(); buscar(input); }} className="flex gap-2 max-w-md">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value.toUpperCase())}
          placeholder="Ex: PETR4, VALE3, KNRI11…"
          maxLength={10}
          className="flex-1 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-2.5
                     text-sm font-mono text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]
                     focus:outline-none focus:ring-2 focus:ring-emerald-500/40 transition-all"
        />
        <button type="submit" disabled={loading}
          className="px-5 py-2.5 rounded-xl bg-emerald-500 text-white text-sm font-semibold
                     hover:bg-emerald-600 disabled:opacity-50 transition-colors shrink-0">
          {loading ? "…" : "Buscar"}
        </button>
      </form>

      {/* Sugestões */}
      <div className="flex flex-wrap gap-2 -mt-3">
        {B3_SUGESTOES.map((s) => (
          <button key={s} onClick={() => buscar(s)}
            className={`px-3 py-1 rounded-lg text-xs font-mono font-semibold border transition-all
              ${ticker === s
                ? "border-emerald-500 bg-emerald-500/15 text-emerald-500"
                : "border-[var(--border)] text-[var(--text-secondary)] hover:border-emerald-500/50 hover:text-emerald-500"}`}>
            {s}
          </button>
        ))}
      </div>

      {loading && (
        <div className="space-y-4 animate-pulse">
          <div className="h-36 rounded-2xl bg-[var(--border)]/40" />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[...Array(4)].map((_, i) => <div key={i} className="h-24 rounded-2xl bg-[var(--border)]/40" />)}
          </div>
        </div>
      )}

      {error && !loading && (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-5 text-center">
          <p className="text-red-400 font-semibold">{error}</p>
        </div>
      )}

      {q && !loading && (
        <div className="space-y-4">
          {/* Card principal */}
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div className="flex items-center gap-3">
                {q.logo_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={q.logo_url} alt={q.ticker} className="w-11 h-11 rounded-xl bg-white p-1 object-contain" />
                )}
                <div>
                  <h2 className="text-lg font-bold text-[var(--text-primary)]">{q.ticker}</h2>
                  <p className="text-xs text-[var(--text-secondary)]">{q.nome_longo || q.nome_curto} · B3</p>
                  {q.setor && <p className="text-xs text-[var(--text-secondary)]">{q.setor}</p>}
                </div>
              </div>
              <div className="text-right shrink-0">
                <p className="text-2xl font-bold text-[var(--text-primary)]">{R(q.preco_atual)}</p>
                <p className={`text-sm font-semibold ${up ? "text-emerald-500" : "text-red-500"}`}>
                  {up ? "▲" : "▼"} {R(Math.abs(q.variacao))} ({Pct(q.variacao_pct)})
                </p>
                <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">Fechamento anterior: {R(q.preco_fechamento_anterior)}</p>
              </div>
            </div>

            {/* Grid de métricas */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "Abertura",   value: R(q.preco_abertura) },
                { label: "Máxima",     value: R(q.preco_max) },
                { label: "Mínima",     value: R(q.preco_min) },
                { label: "Volume",     value: Vol(q.volume) },
                { label: "Market Cap", value: Bi(q.market_cap) },
                { label: "P/L",        value: q.preco_lucro ? `${q.preco_lucro.toFixed(1)}×` : "—" },
                { label: "LPA",        value: q.lpa ? R(q.lpa) : "—" },
                { label: "Moeda",      value: q.moeda },
              ].map(({ label, value }) => (
                <div key={label} className="bg-[var(--border)]/20 rounded-xl p-3">
                  <p className="text-[10px] text-[var(--text-secondary)]">{label}</p>
                  <p className="text-sm font-semibold text-[var(--text-primary)]">{value}</p>
                </div>
              ))}
            </div>

            {/* Faixa 52 semanas */}
            {q.cinquenta_dois_semanas_alta && q.cinquenta_dois_semanas_baixa && (
              <div className="mt-4 pt-4 border-t border-[var(--border)]">
                <div className="flex justify-between text-[11px] text-[var(--text-secondary)] mb-1">
                  <span>Mín 52S: {R(q.cinquenta_dois_semanas_baixa)}</span>
                  <span className="font-semibold text-[var(--text-primary)]">Faixa de 52 semanas</span>
                  <span>Máx 52S: {R(q.cinquenta_dois_semanas_alta)}</span>
                </div>
                <div className="relative h-2 rounded-full bg-[var(--border)]">
                  <div className="absolute h-full w-full rounded-full bg-gradient-to-r from-red-500 via-amber-400 to-emerald-500 opacity-60" />
                  {(() => {
                    const pct = Math.min(100, Math.max(0,
                      ((q.preco_atual - q.cinquenta_dois_semanas_baixa!) /
                       (q.cinquenta_dois_semanas_alta! - q.cinquenta_dois_semanas_baixa!)) * 100
                    ));
                    return (
                      <div className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white border-2 border-emerald-500 shadow"
                        style={{ left: `calc(${pct}% - 6px)` }} />
                    );
                  })()}
                </div>
              </div>
            )}
          </div>

          {/* Histórico simples (recharts) */}
          {hist.length > 0 && (
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
              {/* Importação dinâmica para evitar SSR issue com recharts */}
              <HistoricoB3Chart dados={hist} ticker={q.ticker} />
            </div>
          )}

          {/* Link para análise completa */}
          <Link
            href={`/ativo/${q.ticker}`}
            className="flex items-center justify-center gap-2 w-full py-3 rounded-2xl
                       border border-emerald-500/40 bg-emerald-500/5 text-emerald-500
                       hover:bg-emerald-500/10 transition-colors text-sm font-semibold"
          >
            Ver análise completa de {q.ticker} →
            <span className="text-xs opacity-70">(Fundamentos · Valuation · Índices B3)</span>
          </Link>

          <p className="text-center text-[11px] text-[var(--text-secondary)]">
            Fonte: brapi.dev · Todos os valores em R$ (BRL)
          </p>
        </div>
      )}
    </div>
  );
}

// ── Gráfico B3 inline ─────────────────────────────────────────────────────────

function HistoricoB3Chart({ dados, ticker }: { dados: PontoHistorico[]; ticker: string }) {
  const { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } =
    require("recharts") as typeof import("recharts");

  const data = dados.map((p) => ({
    data: new Date(p.data).toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }),
    preco: p.fechamento_ajustado,
  }));
  const prices = dados.map((p) => p.fechamento_ajustado);
  const mn = Math.min(...prices), mx = Math.max(...prices);
  const pad = (mx - mn) * 0.05;

  return (
    <>
      <h3 className="text-sm font-semibold text-[var(--text-secondary)] mb-3">Histórico — {ticker} (1 ano, semanal)</h3>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="data" tick={{ fill: "var(--text-secondary)", fontSize: 10 }} tickLine={false} axisLine={false}
              interval={Math.ceil(data.length / 8)} />
            <YAxis domain={[mn - pad, mx + pad]} tick={{ fill: "var(--text-secondary)", fontSize: 10 }}
              tickLine={false} axisLine={false}
              tickFormatter={(v: number) => `R$${v.toFixed(0)}`} width={60} />
            <Tooltip contentStyle={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "10px", fontSize: 12 }}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={(v: any) => [`R$ ${Number(v).toFixed(2)}`, "Preço"]}
              labelStyle={{ color: "var(--text-secondary)" }} />
            <Line type="monotone" dataKey="preco" stroke="#10b981" strokeWidth={2} dot={false}
              activeDot={{ r: 4, fill: "#10b981" }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────

type Tab = "us" | "br";

export default function PortfolioAlphaPage() {
  const [tab, setTab] = useState<Tab>("us");

  return (
    <>
      <main className="flex flex-col items-center px-4 py-10 gap-6 max-w-6xl mx-auto w-full">

        {/* Hero */}
        <div className="text-center">
          <h1 className="text-3xl font-bold text-[var(--text-primary)] mb-1">
            Portfólio Inteligente Alpha
          </h1>
          <p className="text-sm text-[var(--text-secondary)]">
            Dados completos Alpha Vantage · B3 · todos os valores em R$ (BRL)
          </p>
        </div>

        {/* Tabs */}
        <div className="flex rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-1 gap-1 self-center">
          <button
            onClick={() => setTab("us")}
            className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${
              tab === "us"
                ? "bg-blue-500 text-white shadow-sm"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}
          >
            🇺🇸 US Stocks
          </button>
          <button
            onClick={() => setTab("br")}
            className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${
              tab === "br"
                ? "bg-emerald-500 text-white shadow-sm"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}
          >
            🇧🇷 Brasil B3
          </button>
        </div>

        {/* Conteúdo da tab ativa */}
        <div className="w-full">
          {tab === "us" ? <TabUS /> : <TabB3 />}
        </div>
      </main>
    </>
  );
}
