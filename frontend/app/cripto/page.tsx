"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from "recharts";

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface CriptoData {
  simbolo: string; nome: string; blockchain: string; categoria: string;
  rank_mktcap: number;
  preco_atual: number; preco_abertura: number | null;
  preco_max_24h: number | null; preco_min_24h: number | null;
  variacao_24h: number | null; variacao_7d: number | null; variacao_30d: number | null;
  variacao_1a: number | null;
  market_data: {
    market_cap: number | null; fdv: number | null;
    volume_24h: number | null; volume_medio_30d: number | null;
    volume_market_cap: number | null; fdv_market_cap: number | null;
    spread: number | null; spread_pct: number | null; liquidez: string;
  };
  tokenomics: {
    supply_circulante: number | null; supply_maximo: number | null;
    supply_total: number | null; pct_emitido: number | null;
    inflacao_anual: number | null; queima: boolean; rating: string; score: number;
  };
  desenvolvimento: {
    commits_4semanas: number | null; stars: number | null; forks: number | null;
    issues_abertos: number | null; issues_fechados: number | null;
    pr_merged: number | null; contribuidores: number | null;
    adicoes_codigo: number | null; delecoes_codigo: number | null;
  } | null;
  tecnico: {
    rsi: { valor: number | null; sinal: string };
    macd: { macd: number; signal: number; histograma: number; sinal: string } | null;
    ema_9: { valor: number | null; sinal: string };
    ema_21: { valor: number | null; sinal: string };
    ema_50: { valor: number | null; sinal: string };
    ema_100: { valor: number | null; sinal: string };
    ema_200: { valor: number | null; sinal: string };
    sma_200: { valor: number | null; sinal: string };
    bollinger: { upper: number; middle: number; lower: number; sinal: string } | null;
    atr: { valor: number | null; percentual: number | null };
    obv: { sinal: string };
  };
  tendencia: { curto_prazo: string; medio_prazo: string; longo_prazo: string };
  volume_analise: { volume_24h: number | null; volume_relativo: number | null; sinal: string };
  suportes: { preco: number; distancia_pct: number }[];
  resistencias: { preco: number; distancia_pct: number }[];
  fibonacci: { baixo: number; alto: number; niveis: Record<string, number>; posicao_pct: number; entre: string[] };
  historico: {
    ath: number | null; atl: number | null;
    ath_data: string | null; atl_data: string | null;
    queda_desde_ath: number | null; alta_desde_atl: number | null;
    rentabilidade: Record<string, number | null>;
  };
  volatilidade: {
    vol_30d_pct: number | null; vol_anualizada_pct: number | null;
    drawdown_maximo_pct: number | null; sharpe: number | null; sortino: number | null;
    atr_pct: number | null; beta_btc: number | null;
  };
  sentimento: {
    fear_greed: { valor: number; classificacao: string } | null;
    sentimento_geral: string;
  };
  scores: { geral: number; compra: number; venda: number; risco: number; tokenomics: number };
  classificacao: string;
  probabilidades: Record<string, number>;
  gestao_risco: {
    stop_sugerido: number; alvo_1: number | null; alvo_2: number | null; alvo_3: number | null;
    faixa_compra_min: number; faixa_compra_max: number;
    faixa_realizacao_min: number; faixa_realizacao_max: number;
  };
  conclusao_ia: {
    resumo_tecnico: string; resumo_fundamentalista: string;
    pontos_positivos: string[]; pontos_negativos: string[];
    riscos: string[]; oportunidades: string[]; classificacao_final: string;
  };
  ohlcv: { data: string; abertura: number; maxima: number; minima: number; fechamento: number; volume: number }[];
}

const MOEDAS = [
  { simbolo: "BTC", nome: "Bitcoin",   emoji: "₿" },
  { simbolo: "ETH", nome: "Ethereum",  emoji: "Ξ" },
  { simbolo: "SOL", nome: "Solana",    emoji: "◎" },
  { simbolo: "BNB", nome: "BNB",       emoji: "⬡" },
  { simbolo: "XRP", nome: "XRP",       emoji: "✕" },
  { simbolo: "DOGE",nome: "Dogecoin",  emoji: "Ð" },
  { simbolo: "ADA", nome: "Cardano",   emoji: "₳" },
  { simbolo: "AVAX",nome: "Avalanche", emoji: "△" },
  { simbolo: "LINK",nome: "Chainlink", emoji: "⬡" },
  { simbolo: "LTC", nome: "Litecoin",  emoji: "Ł" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

function fBRL(v: number | null | undefined, decimals = 2): string {
  if (v == null) return "—";
  if (v >= 1e9)  return `R$ ${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6)  return `R$ ${(v / 1e6).toFixed(2)}M`;
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(v);
}
function fNum(v: number | null | undefined, d = 2): string {
  if (v == null) return "—";
  return v.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
}
function fPct(v: number | null | undefined, d = 2): string {
  if (v == null) return "—";
  return `${v >= 0 ? "+" : ""}${v.toFixed(d)}%`;
}
function varColor(v: number | null | undefined): string {
  if (v == null) return "var(--text-muted)";
  return v >= 0 ? "#10b981" : "#ef4444";
}
function sinaiColor(s: string): string {
  if (s === "compra") return "#10b981";
  if (s === "venda")  return "#ef4444";
  return "#f59e0b";
}
function scoreColor(s: number): string {
  if (s >= 80) return "#10b981";
  if (s >= 65) return "#84cc16";
  if (s >= 50) return "#f59e0b";
  if (s >= 35) return "#f97316";
  return "#ef4444";
}
function tendLabel(t: string): string {
  const m: Record<string,string> = { muito_alta:"↑↑ Muito Alta", alta:"↑ Alta", neutra:"→ Neutra", baixa:"↓ Baixa", muito_baixa:"↓↓ Muito Baixa" };
  return m[t] ?? t;
}
function tendColor(t: string): string {
  if (t === "muito_alta" || t === "alta") return "#10b981";
  if (t === "muito_baixa" || t === "baixa") return "#ef4444";
  return "#f59e0b";
}
function classifColor(c: string): string {
  if (c.includes("Forte") && c.includes("Compra")) return "#10b981";
  if (c.includes("Compra")) return "#84cc16";
  if (c.includes("Neutro")) return "#f59e0b";
  if (c.includes("Realização")) return "#f97316";
  return "#ef4444";
}

// ── Sub-componentes ───────────────────────────────────────────────────────────

function ScoreGauge({ score, label, cor }: { score: number; label?: string; cor?: string }) {
  const color = cor ?? scoreColor(score);
  const deg   = (score / 100) * 180;
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative w-24 h-12 overflow-hidden">
        <div className="absolute inset-0 rounded-t-full border-4 border-[var(--border)]" style={{ borderBottomColor: "transparent" }} />
        <div
          className="absolute bottom-0 left-1/2 w-1 h-10 origin-bottom rounded-full transition-all duration-700"
          style={{ backgroundColor: color, transform: `translateX(-50%) rotate(${deg - 90}deg)` }}
        />
        <div className="absolute inset-0 flex items-end justify-center pb-0.5">
          <span className="text-lg font-black" style={{ color }}>{score.toFixed(0)}</span>
        </div>
      </div>
      {label && <span className="text-xs text-[var(--text-muted)]">{label}</span>}
    </div>
  );
}

function SinalBadge({ sinal }: { sinal: string }) {
  const color = sinaiColor(sinal);
  const label = sinal === "compra" ? "Compra" : sinal === "venda" ? "Venda" : "Neutro";
  return (
    <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ color, backgroundColor: `${color}18`, border: `1px solid ${color}40` }}>
      {label}
    </span>
  );
}

function ScoreBar({ score, label }: { score: number; label?: string }) {
  const color = scoreColor(score);
  return (
    <div className="flex items-center gap-2">
      {label && <span className="text-xs text-[var(--text-muted)] w-24 shrink-0">{label}</span>}
      <div className="flex-1 h-1.5 bg-[var(--border)] rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${score}%`, backgroundColor: color }} />
      </div>
      <span className="text-xs font-bold tabular-nums w-8 text-right" style={{ color }}>{score.toFixed(0)}</span>
    </div>
  );
}

function Card({ title, icon, children, className = "" }: { title: string; icon: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden ${className}`}>
      <div className="px-5 py-3 border-b border-[var(--border)]/60 flex items-center gap-2">
        <span className="text-lg">{icon}</span>
        <h3 className="font-bold text-sm text-[var(--text-primary)]">{title}</h3>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function Row({ label, value, color }: { label: string; value: React.ReactNode; color?: string }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-[var(--border)]/30 last:border-0">
      <span className="text-xs text-[var(--text-muted)]">{label}</span>
      <span className="text-xs font-semibold text-[var(--text-primary)]" style={color ? { color } : undefined}>{value}</span>
    </div>
  );
}

function NALabel({ text }: { text?: string }) {
  return <span className="text-xs text-[var(--text-muted)] italic">{text ?? "Não disponível nesta API"}</span>;
}

// ── Página principal ──────────────────────────────────────────────────────────

export default function CriptoPage() {
  const [simbolo, setSimbolo] = useState("BTC");
  const [data, setData]       = useState<CriptoData | null>(null);
  const [loading, setLoading] = useState(false);
  const [erro, setErro]       = useState<string | null>(null);

  const buscar = useCallback(async (s: string) => {
    setLoading(true);
    setErro(null);
    try {
      const res = await fetch(`${BASE}/cripto/${s}`);
      if (!res.ok) throw new Error(`Erro ${res.status}`);
      setData(await res.json());
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : "Erro ao carregar dados");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { buscar(simbolo); }, [simbolo, buscar]);

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">

        {/* ── Seletor de moeda ── */}
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-sm font-semibold text-[var(--text-secondary)]">Criptomoeda:</span>
          {MOEDAS.map((m) => (
            <button
              key={m.simbolo}
              onClick={() => setSimbolo(m.simbolo)}
              className={`px-4 py-2 rounded-xl text-sm font-bold transition-all border ${
                simbolo === m.simbolo
                  ? "bg-emerald-500 text-white border-emerald-500"
                  : "border-[var(--border)] text-[var(--text-secondary)] hover:border-emerald-500/50 hover:text-emerald-500"
              }`}
            >
              {m.simbolo}
            </button>
          ))}
          {loading && (
            <div className="ml-2 w-4 h-4 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          )}
        </div>

        {erro && (
          <div className="p-4 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-500 text-sm">{erro}</div>
        )}

        {data && (
          <>
            {/* ── 1. Cabeçalho ── */}
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
              <div className="flex flex-wrap items-start gap-6">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-1">
                    <h1 className="text-2xl font-black text-[var(--text-primary)]">{data.nome}</h1>
                    <span className="text-sm font-bold text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full">{data.simbolo}</span>
                    <span className="text-xs text-[var(--text-muted)] bg-[var(--border)]/50 px-2 py-0.5 rounded-full">{data.categoria}</span>
                    <span className="text-xs text-[var(--text-muted)] hidden sm:inline">#{data.rank_mktcap}</span>
                  </div>
                  <div className="text-xs text-[var(--text-muted)] mb-4">Blockchain: {data.blockchain}</div>
                  <div className="text-3xl font-black text-[var(--text-primary)]">{fBRL(data.preco_atual)}</div>
                  <div className="flex flex-wrap gap-4 mt-2">
                    <div>
                      <div className="text-xs text-[var(--text-muted)]">24h</div>
                      <div className="text-sm font-bold" style={{ color: varColor(data.variacao_24h) }}>{fPct(data.variacao_24h)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-[var(--text-muted)]">7 dias</div>
                      <div className="text-sm font-bold" style={{ color: varColor(data.variacao_7d) }}>{fPct(data.variacao_7d)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-[var(--text-muted)]">30 dias</div>
                      <div className="text-sm font-bold" style={{ color: varColor(data.variacao_30d) }}>{fPct(data.variacao_30d)}</div>
                    </div>
                    {data.variacao_1a != null && (
                      <div>
                        <div className="text-xs text-[var(--text-muted)]">1 ano</div>
                        <div className="text-sm font-bold" style={{ color: varColor(data.variacao_1a) }}>{fPct(data.variacao_1a)}</div>
                      </div>
                    )}
                    {data.preco_max_24h && (
                      <div>
                        <div className="text-xs text-[var(--text-muted)]">Máx 24h</div>
                        <div className="text-sm font-bold text-emerald-500">{fBRL(data.preco_max_24h)}</div>
                      </div>
                    )}
                    {data.preco_min_24h && (
                      <div>
                        <div className="text-xs text-[var(--text-muted)]">Mín 24h</div>
                        <div className="text-sm font-bold text-rose-500">{fBRL(data.preco_min_24h)}</div>
                      </div>
                    )}
                  </div>
                </div>

                {/* ── 2. Resumo Executivo ── */}
                <div className="flex flex-col items-center gap-3 shrink-0">
                  <ScoreGauge score={data.scores.geral} label="Score Geral" />
                  <div
                    className="text-sm font-black px-4 py-1.5 rounded-xl"
                    style={{ color: classifColor(data.classificacao), backgroundColor: `${classifColor(data.classificacao)}18`, border: `1px solid ${classifColor(data.classificacao)}40` }}
                  >
                    {data.classificacao}
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-center">
                    <div>
                      <div className="text-xs text-[var(--text-muted)]">Compra</div>
                      <div className="text-base font-black" style={{ color: scoreColor(data.scores.compra) }}>{data.scores.compra}</div>
                    </div>
                    <div>
                      <div className="text-xs text-[var(--text-muted)]">Venda</div>
                      <div className="text-base font-black" style={{ color: scoreColor(data.scores.venda) }}>{data.scores.venda}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Gráfico de preço ── */}
            {data.ohlcv.length > 0 && (
              <Card title="Histórico de Preço (90 dias)" icon="📈">
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data.ohlcv}>
                      <defs>
                        <linearGradient id="cg" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="data" tick={{ fontSize: 10, fill: "var(--text-muted)" }} tickLine={false} interval={14} />
                      <YAxis tick={{ fontSize: 10, fill: "var(--text-muted)" }} tickLine={false} tickFormatter={(v) => `R$${(v/1000).toFixed(0)}k`} width={56} />
                      <Tooltip
                        contentStyle={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 11 }}
                        formatter={(v: unknown) => [fBRL(v as number), "Fechamento"]}
                        labelStyle={{ color: "var(--text-secondary)" }}
                      />
                      <Area type="monotone" dataKey="fechamento" stroke="#10b981" strokeWidth={2} fill="url(#cg)" dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            )}

            {/* ── Grid principal ── */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">

              {/* ── 3. Dados Fundamentais ── */}
              <Card title="Dados Fundamentais" icon="📊">
                <Row label="Market Cap"        value={fBRL(data.market_data.market_cap)} />
                <Row label="FDV"               value={fBRL(data.market_data.fdv)} />
                <Row label="Volume 24h"        value={fBRL(data.market_data.volume_24h)} />
                <Row label="Volume Médio"      value={fBRL(data.market_data.volume_medio_30d)} />
                <Row label="Vol / Mkt Cap"     value={data.market_data.volume_market_cap ? fNum(data.market_data.volume_market_cap * 100) + "%" : "—"} />
                <Row label="FDV / Mkt Cap"     value={data.market_data.fdv_market_cap ? fNum(data.market_data.fdv_market_cap, 2) + "x" : "—"} />
                <Row label="Spread"            value={data.market_data.spread ? `${fBRL(data.market_data.spread)} (${data.market_data.spread_pct?.toFixed(3)}%)` : "—"} />
                <Row label="Liquidez"          value={data.market_data.liquidez} color={data.market_data.liquidez === "Alta" ? "#10b981" : data.market_data.liquidez === "Média" ? "#f59e0b" : "#ef4444"} />
              </Card>

              {/* ── 4. Tokenomics ── */}
              <Card title="Tokenomics" icon="🪙">
                <Row label="Supply Circulante" value={data.tokenomics.supply_circulante ? fNum(data.tokenomics.supply_circulante, 0) : "—"} />
                <Row label="Supply Total"      value={data.tokenomics.supply_total ? fNum(data.tokenomics.supply_total, 0) : "—"} />
                <Row label="Supply Máximo"     value={data.tokenomics.supply_maximo ? fNum(data.tokenomics.supply_maximo, 0) : "Ilimitado"} />
                {data.tokenomics.pct_emitido != null && (
                  <Row label="% Emitido"       value={fPct(data.tokenomics.pct_emitido, 1)} color={data.tokenomics.pct_emitido > 90 ? "#10b981" : data.tokenomics.pct_emitido > 60 ? "#f59e0b" : "#ef4444"} />
                )}
                <Row label="Inflação Anual"    value={data.tokenomics.inflacao_anual != null ? fPct(data.tokenomics.inflacao_anual) : "—"} color={data.tokenomics.inflacao_anual != null ? varColor(-(data.tokenomics.inflacao_anual)) : undefined} />
                <Row label="Queima de Tokens"  value={data.tokenomics.queima ? "✓ Sim" : "Não"} color={data.tokenomics.queima ? "#10b981" : undefined} />
                <Row label="Classificação"     value={data.tokenomics.rating} color={data.tokenomics.rating === "Excelente" ? "#10b981" : data.tokenomics.rating === "Boa" ? "#84cc16" : data.tokenomics.rating === "Regular" ? "#f59e0b" : "#ef4444"} />
                <div className="mt-2">
                  <ScoreBar score={data.tokenomics.score} label="Score" />
                </div>
              </Card>

              {/* ── 6. Tendência ── */}
              <Card title="Tendência" icon="📡">
                {(["curto_prazo","medio_prazo","longo_prazo"] as const).map((k) => (
                  <div key={k} className="flex items-center justify-between py-2 border-b border-[var(--border)]/30 last:border-0">
                    <span className="text-xs text-[var(--text-muted)] capitalize">{k.replace("_"," ")}</span>
                    <span className="text-xs font-bold" style={{ color: tendColor(data.tendencia[k]) }}>{tendLabel(data.tendencia[k])}</span>
                  </div>
                ))}
                <div className="mt-3 space-y-1.5">
                  <ScoreBar score={data.scores.compra} label="Compra" />
                  <ScoreBar score={data.scores.venda}  label="Venda"  />
                  <ScoreBar score={data.scores.risco}  label="Risco"  />
                </div>
              </Card>
            </div>

            {/* ── 5. Indicadores Técnicos ── */}
            <Card title="Indicadores Técnicos" icon="⚡">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {/* RSI */}
                <div className="rounded-xl border border-[var(--border)] p-3">
                  <div className="text-xs text-[var(--text-muted)] mb-1">RSI (14)</div>
                  <div className="text-lg font-black" style={{ color: sinaiColor(data.tecnico.rsi.sinal) }}>
                    {data.tecnico.rsi.valor?.toFixed(1) ?? "—"}
                  </div>
                  <SinalBadge sinal={data.tecnico.rsi.sinal} />
                  {data.tecnico.rsi.valor != null && (
                    <div className="mt-2 h-1.5 bg-[var(--border)] rounded-full">
                      <div className="h-full rounded-full" style={{ width: `${data.tecnico.rsi.valor}%`, backgroundColor: sinaiColor(data.tecnico.rsi.sinal) }} />
                    </div>
                  )}
                </div>

                {/* MACD */}
                {data.tecnico.macd && (
                  <div className="rounded-xl border border-[var(--border)] p-3">
                    <div className="text-xs text-[var(--text-muted)] mb-1">MACD</div>
                    <div className="text-lg font-black" style={{ color: sinaiColor(data.tecnico.macd.sinal) }}>
                      {fBRL(data.tecnico.macd.histograma, 0)}
                    </div>
                    <SinalBadge sinal={data.tecnico.macd.sinal} />
                    <div className="mt-1 text-xs text-[var(--text-muted)]">Hist: {fBRL(data.tecnico.macd.histograma, 0)}</div>
                  </div>
                )}

                {/* EMAs */}
                {([["EMA 9", data.tecnico.ema_9], ["EMA 21", data.tecnico.ema_21], ["EMA 50", data.tecnico.ema_50], ["EMA 100", data.tecnico.ema_100], ["EMA 200", data.tecnico.ema_200], ["SMA 200", data.tecnico.sma_200]] as [string, {valor:number|null;sinal:string}][]).map(([label, e]) => (
                  <div key={label} className="rounded-xl border border-[var(--border)] p-3">
                    <div className="text-xs text-[var(--text-muted)] mb-1">{label}</div>
                    <div className="text-sm font-bold text-[var(--text-primary)]">{fBRL(e.valor)}</div>
                    <SinalBadge sinal={e.sinal} />
                  </div>
                ))}

                {/* Bollinger */}
                {data.tecnico.bollinger && (
                  <div className="rounded-xl border border-[var(--border)] p-3">
                    <div className="text-xs text-[var(--text-muted)] mb-1">Bollinger Bands</div>
                    <div className="text-xs space-y-0.5">
                      <div className="flex justify-between"><span className="text-rose-400">Sup:</span><span>{fBRL(data.tecnico.bollinger.upper)}</span></div>
                      <div className="flex justify-between"><span className="text-[var(--text-muted)]">Med:</span><span>{fBRL(data.tecnico.bollinger.middle)}</span></div>
                      <div className="flex justify-between"><span className="text-emerald-400">Inf:</span><span>{fBRL(data.tecnico.bollinger.lower)}</span></div>
                    </div>
                    <div className="mt-1"><SinalBadge sinal={data.tecnico.bollinger.sinal} /></div>
                  </div>
                )}

                {/* ATR */}
                <div className="rounded-xl border border-[var(--border)] p-3">
                  <div className="text-xs text-[var(--text-muted)] mb-1">ATR (14)</div>
                  <div className="text-sm font-bold text-[var(--text-primary)]">{fBRL(data.tecnico.atr.valor)}</div>
                  <div className="text-xs text-[var(--text-muted)]">{data.tecnico.atr.percentual?.toFixed(2)}% do preço</div>
                </div>

                {/* OBV */}
                <div className="rounded-xl border border-[var(--border)] p-3">
                  <div className="text-xs text-[var(--text-muted)] mb-1">OBV</div>
                  <SinalBadge sinal={data.tecnico.obv.sinal} />
                </div>
              </div>
            </Card>

            {/* ── Grid 2ª linha ── */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">

              {/* ── 7. Volume ── */}
              <Card title="Volume" icon="📦">
                <Row label="Volume 24h"       value={fBRL(data.volume_analise.volume_24h)} />
                <Row label="Volume Relativo"  value={data.volume_analise.volume_relativo ? `${fNum(data.volume_analise.volume_relativo)}x` : "—"} color={data.volume_analise.volume_relativo != null ? ((data.volume_analise.volume_relativo > 1.2) ? "#10b981" : (data.volume_analise.volume_relativo < 0.8) ? "#ef4444" : undefined) : undefined} />
                <Row label="Fluxo"            value={data.volume_analise.sinal === "acumulacao" ? "Acumulação ↑" : data.volume_analise.sinal === "distribuicao" ? "Distribuição ↓" : "Neutro"} color={data.volume_analise.sinal === "acumulacao" ? "#10b981" : data.volume_analise.sinal === "distribuicao" ? "#ef4444" : undefined} />
                <Row label="Vol. Institucional" value={<NALabel />} />
              </Card>

              {/* ── 8. Suportes e Resistências ── */}
              <Card title="Suportes & Resistências" icon="🎯">
                <div className="space-y-1 mb-3">
                  {data.resistencias.map((r, i) => (
                    <div key={i} className="flex items-center justify-between py-1">
                      <span className="text-xs text-rose-400 font-semibold">R{i+1} — {fBRL(r.preco)}</span>
                      <span className="text-xs font-bold" style={{ color: "#ef4444" }}>+{r.distancia_pct.toFixed(1)}%</span>
                    </div>
                  ))}
                  <div className="border-y border-[var(--border)] py-1 text-center">
                    <span className="text-xs font-black text-emerald-500">{fBRL(data.preco_atual)} ← ATUAL</span>
                  </div>
                  {data.suportes.map((s, i) => (
                    <div key={i} className="flex items-center justify-between py-1">
                      <span className="text-xs text-emerald-400 font-semibold">S{i+1} — {fBRL(s.preco)}</span>
                      <span className="text-xs font-bold" style={{ color: "#10b981" }}>{s.distancia_pct.toFixed(1)}%</span>
                    </div>
                  ))}
                </div>
              </Card>

              {/* ── 9. Fibonacci ── */}
              <Card title="Fibonacci" icon="🌀">
                {data.fibonacci.niveis && Object.entries(data.fibonacci.niveis).map(([ratio, preco]) => {
                  const isAtual = data.fibonacci.entre?.includes(ratio);
                  return (
                    <div key={ratio} className={`flex items-center justify-between py-1 border-b border-[var(--border)]/30 last:border-0 ${isAtual ? "bg-emerald-500/10 rounded px-1" : ""}`}>
                      <span className="text-xs text-[var(--text-muted)]">{ratio}</span>
                      <span className="text-xs font-semibold text-[var(--text-primary)]">{fBRL(preco)}</span>
                    </div>
                  );
                })}
                {data.fibonacci.entre && (
                  <div className="mt-2 text-xs text-emerald-500 font-semibold">
                    Preço entre {data.fibonacci.entre[0]} e {data.fibonacci.entre[1]}
                  </div>
                )}
              </Card>
            </div>

            {/* ── Grid 3ª linha ── */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">

              {/* ── 10. Histórico ── */}
              <Card title="Histórico" icon="📅">
                <div className="mb-2">
                  <div className="flex items-center justify-between py-1.5 border-b border-[var(--border)]/30">
                    <span className="text-xs text-[var(--text-muted)]">ATH</span>
                    <div className="text-right">
                      <span className="text-xs font-semibold" style={{ color: "#10b981" }}>{fBRL(data.historico.ath)}</span>
                      {data.historico.ath_data && <div className="text-xs text-[var(--text-muted)]">{new Date(data.historico.ath_data).toLocaleDateString("pt-BR")}</div>}
                    </div>
                  </div>
                  <div className="flex items-center justify-between py-1.5 border-b border-[var(--border)]/30">
                    <span className="text-xs text-[var(--text-muted)]">ATL</span>
                    <div className="text-right">
                      <span className="text-xs font-semibold" style={{ color: "#ef4444" }}>{fBRL(data.historico.atl)}</span>
                      {data.historico.atl_data && <div className="text-xs text-[var(--text-muted)]">{new Date(data.historico.atl_data).toLocaleDateString("pt-BR")}</div>}
                    </div>
                  </div>
                  <Row label="Queda desde ATH"   value={fPct(data.historico.queda_desde_ath)} color="#ef4444" />
                  <Row label="Alta desde ATL"    value={fPct(data.historico.alta_desde_atl)} color="#10b981" />
                </div>
                <div className="mt-2 space-y-1">
                  {Object.entries(data.historico.rentabilidade).filter(([,v]) => v != null).map(([p, v]) => (
                    <div key={p} className="flex justify-between py-0.5">
                      <span className="text-xs text-[var(--text-muted)]">{p}</span>
                      <span className="text-xs font-bold" style={{ color: varColor(v) }}>{fPct(v)}</span>
                    </div>
                  ))}
                </div>
              </Card>

              {/* ── 11. Volatilidade ── */}
              <Card title="Volatilidade & Risco" icon="⚠️">
                <Row label="Vol. 30 dias"      value={fPct(data.volatilidade.vol_30d_pct)} />
                <Row label="Vol. Anualizada"   value={fPct(data.volatilidade.vol_anualizada_pct)} />
                <Row label="ATR %"             value={fPct(data.volatilidade.atr_pct)} />
                <Row label="Drawdown Máx."     value={fPct(data.volatilidade.drawdown_maximo_pct)} color="#ef4444" />
                <Row label="Sharpe Ratio"      value={data.volatilidade.sharpe != null ? fNum(data.volatilidade.sharpe) : "—"} color={data.volatilidade.sharpe != null ? (data.volatilidade.sharpe > 1 ? "#10b981" : data.volatilidade.sharpe > 0 ? "#f59e0b" : "#ef4444") : undefined} />
                <Row label="Sortino Ratio"     value={data.volatilidade.sortino != null ? fNum(data.volatilidade.sortino) : "—"} />
                <Row label="Beta vs BTC"       value={data.volatilidade.beta_btc != null ? fNum(data.volatilidade.beta_btc) : "—"} />
                <div className="mt-2"><ScoreBar score={data.scores.risco} label="Risco" /></div>
              </Card>

              {/* ── 12. Sentimento ── */}
              <Card title="Sentimento" icon="💬">
                {data.sentimento.fear_greed ? (
                  <div className="mb-3">
                    <div className="text-xs text-[var(--text-muted)] mb-1">Fear & Greed Index</div>
                    <div className="flex items-center gap-3">
                      <div className="text-3xl font-black" style={{ color: data.sentimento.fear_greed.valor < 25 ? "#ef4444" : data.sentimento.fear_greed.valor < 45 ? "#f97316" : data.sentimento.fear_greed.valor < 55 ? "#f59e0b" : data.sentimento.fear_greed.valor < 75 ? "#84cc16" : "#10b981" }}>
                        {data.sentimento.fear_greed.valor}
                      </div>
                      <div>
                        <div className="text-sm font-bold text-[var(--text-primary)]">{data.sentimento.fear_greed.classificacao}</div>
                        <div className="h-1.5 w-32 bg-[var(--border)] rounded-full mt-1">
                          <div className="h-full rounded-full" style={{ width: `${data.sentimento.fear_greed.valor}%`, background: "linear-gradient(to right, #ef4444, #f59e0b, #10b981)" }} />
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null}
                <Row label="Sentimento Geral" value={data.sentimento.sentimento_geral} color={data.sentimento.sentimento_geral === "positivo" ? "#10b981" : data.sentimento.sentimento_geral === "negativo" ? "#ef4444" : "#f59e0b"} />
                <Row label="Google Trends"    value={<NALabel />} />
                <Row label="Twitter/X"        value={<NALabel />} />
                <Row label="Reddit"           value={<NALabel />} />
              </Card>
            </div>

            {/* ── 13. Desenvolvimento & 14. On-Chain ── */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card title="Desenvolvimento (GitHub via CoinGecko)" icon="💻">
                {data.desenvolvimento ? (
                  <>
                    <Row label="Commits (4 semanas)"  value={data.desenvolvimento.commits_4semanas != null ? String(data.desenvolvimento.commits_4semanas) : "—"} color={data.desenvolvimento.commits_4semanas != null && data.desenvolvimento.commits_4semanas > 100 ? "#10b981" : undefined} />
                    <Row label="Stars"                value={data.desenvolvimento.stars != null ? fNum(data.desenvolvimento.stars, 0) : "—"} />
                    <Row label="Forks"                value={data.desenvolvimento.forks != null ? fNum(data.desenvolvimento.forks, 0) : "—"} />
                    <Row label="Contribuidores"       value={data.desenvolvimento.contribuidores != null ? String(data.desenvolvimento.contribuidores) : "—"} />
                    <Row label="Issues Abertos"       value={data.desenvolvimento.issues_abertos != null ? fNum(data.desenvolvimento.issues_abertos, 0) : "—"} />
                    <Row label="Issues Fechados"      value={data.desenvolvimento.issues_fechados != null ? fNum(data.desenvolvimento.issues_fechados, 0) : "—"} />
                    <Row label="PRs Merged"           value={data.desenvolvimento.pr_merged != null ? fNum(data.desenvolvimento.pr_merged, 0) : "—"} />
                    {data.desenvolvimento.adicoes_codigo != null && (
                      <Row label="Adições de Código (4s)" value={`+${fNum(data.desenvolvimento.adicoes_codigo, 0)} linhas`} color="#10b981" />
                    )}
                  </>
                ) : (
                  <NALabel text="Dados de desenvolvimento não disponíveis para esta moeda" />
                )}
              </Card>
              <Card title="On-Chain Analytics" icon="🔗">
                <div className="text-xs text-[var(--text-muted)] mb-3 italic">Estrutura preparada para Glassnode / Santiment / IntoTheBlock / CryptoQuant</div>
                <div className="grid grid-cols-2 gap-2">
                  {["Endereços Ativos","Whales Comprando","Volume On-Chain","TVL","MVRV","NVT","Exchange Inflow","Exchange Outflow"].map((item) => (
                    <div key={item} className="rounded-lg border border-[var(--border)]/50 p-2">
                      <div className="text-xs text-[var(--text-muted)]">{item}</div>
                      <NALabel />
                    </div>
                  ))}
                </div>
              </Card>
            </div>

            {/* ── 15. Gestão de Risco ── */}
            <Card title="Gestão de Risco" icon="🛡">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-3 text-center">
                  <div className="text-xs text-[var(--text-muted)] mb-1">Stop Sugerido</div>
                  <div className="text-sm font-black text-rose-500">{fBRL(data.gestao_risco.stop_sugerido)}</div>
                  <div className="text-xs text-[var(--text-muted)]">2× ATR abaixo</div>
                </div>
                {[["Alvo 1", data.gestao_risco.alvo_1, "#84cc16"], ["Alvo 2", data.gestao_risco.alvo_2, "#10b981"], ["Alvo 3", data.gestao_risco.alvo_3, "#06b6d4"]].map(([label, v, color]) => (
                  <div key={label as string} className="rounded-xl border border-[var(--border)] p-3 text-center">
                    <div className="text-xs text-[var(--text-muted)] mb-1">{label}</div>
                    <div className="text-sm font-black" style={{ color: color as string }}>{fBRL(v as number)}</div>
                    <div className="text-xs text-[var(--text-muted)]">{v && data.preco_atual ? fPct((v as number - data.preco_atual) / data.preco_atual * 100) : "—"}</div>
                  </div>
                ))}
              </div>
              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
                  <div className="text-xs font-bold text-emerald-500 mb-1">Faixa de Compra</div>
                  <div className="text-sm font-semibold text-[var(--text-primary)]">{fBRL(data.gestao_risco.faixa_compra_min)} — {fBRL(data.gestao_risco.faixa_compra_max)}</div>
                </div>
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
                  <div className="text-xs font-bold text-amber-500 mb-1">Faixa de Realização</div>
                  <div className="text-sm font-semibold text-[var(--text-primary)]">{fBRL(data.gestao_risco.faixa_realizacao_min)} — {fBRL(data.gestao_risco.faixa_realizacao_max)}</div>
                </div>
              </div>
            </Card>

            {/* ── 19. Probabilidades ── */}
            <Card title="Probabilidades (Modelo Log-Normal, 30 dias)" icon="🎲">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <div className="text-xs font-bold text-emerald-500 mb-2">Probabilidade de Alta</div>
                  {[["Subir 10%", data.probabilidades.subir_10], ["Subir 20%", data.probabilidades.subir_20], ["Subir 50%", data.probabilidades.subir_50]].map(([label, v]) => (
                    <div key={label as string} className="flex items-center gap-2 mb-1.5">
                      <span className="text-xs text-[var(--text-muted)] w-20">{label}</span>
                      <div className="flex-1 h-1.5 bg-[var(--border)] rounded-full">
                        <div className="h-full rounded-full bg-emerald-500" style={{ width: `${v}%` }} />
                      </div>
                      <span className="text-xs font-bold text-emerald-500 w-12 text-right">{typeof v === "number" ? v.toFixed(1) : "—"}%</span>
                    </div>
                  ))}
                </div>
                <div>
                  <div className="text-xs font-bold text-rose-500 mb-2">Probabilidade de Queda</div>
                  {[["Cair 10%", data.probabilidades.cair_10], ["Cair 20%", data.probabilidades.cair_20], ["Cair 50%", data.probabilidades.cair_50]].map(([label, v]) => (
                    <div key={label as string} className="flex items-center gap-2 mb-1.5">
                      <span className="text-xs text-[var(--text-muted)] w-20">{label}</span>
                      <div className="flex-1 h-1.5 bg-[var(--border)] rounded-full">
                        <div className="h-full rounded-full bg-rose-500" style={{ width: `${v}%` }} />
                      </div>
                      <span className="text-xs font-bold text-rose-500 w-12 text-right">{typeof v === "number" ? v.toFixed(1) : "—"}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </Card>

            {/* ── 16 + 20 + 21. Inteligência Artificial ── */}
            <Card title="Inteligência Artificial — Análise Completa" icon="🤖">
              {/* Score geral IA */}
              <div className="flex flex-wrap gap-6 mb-5 pb-5 border-b border-[var(--border)]/60">
                <ScoreGauge score={data.scores.geral}   label="Score Geral"   />
                <ScoreGauge score={data.scores.compra}  label="Melhor Compra" cor={scoreColor(data.scores.compra)} />
                <ScoreGauge score={data.scores.venda}   label="Melhor Venda"  cor={scoreColor(data.scores.venda)} />
                <ScoreGauge score={data.scores.risco}   label="Risco"         cor={scoreColor(data.scores.risco)} />
                <div className="flex flex-col justify-center gap-2">
                  <div
                    className="text-base font-black px-5 py-2 rounded-xl"
                    style={{ color: classifColor(data.conclusao_ia.classificacao_final), backgroundColor: `${classifColor(data.conclusao_ia.classificacao_final)}15`, border: `1px solid ${classifColor(data.conclusao_ia.classificacao_final)}40` }}
                  >
                    {data.conclusao_ia.classificacao_final}
                  </div>
                </div>
              </div>

              {/* Resumos */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
                <div className="rounded-xl border border-[var(--border)]/60 p-3">
                  <div className="text-xs font-bold text-blue-400 mb-1">Análise Técnica</div>
                  <p className="text-xs text-[var(--text-secondary)]">{data.conclusao_ia.resumo_tecnico}</p>
                </div>
                <div className="rounded-xl border border-[var(--border)]/60 p-3">
                  <div className="text-xs font-bold text-violet-400 mb-1">Análise Fundamentalista</div>
                  <p className="text-xs text-[var(--text-secondary)]">{data.conclusao_ia.resumo_fundamentalista}</p>
                </div>
              </div>

              {/* Pontos */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <div className="text-xs font-bold text-emerald-500 mb-2 flex items-center gap-1">✓ Pontos Positivos</div>
                  <ul className="space-y-1">
                    {data.conclusao_ia.pontos_positivos.map((p, i) => (
                      <li key={i} className="text-xs text-[var(--text-secondary)] flex items-start gap-1.5">
                        <span className="text-emerald-500 shrink-0 mt-0.5">·</span>{p}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <div className="text-xs font-bold text-rose-500 mb-2 flex items-center gap-1">! Pontos de Atenção</div>
                  <ul className="space-y-1">
                    {data.conclusao_ia.pontos_negativos.map((p, i) => (
                      <li key={i} className="text-xs text-[var(--text-secondary)] flex items-start gap-1.5">
                        <span className="text-rose-500 shrink-0 mt-0.5">·</span>{p}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <div className="text-xs font-bold text-amber-500 mb-2">⚠ Riscos</div>
                  <ul className="space-y-1">
                    {data.conclusao_ia.riscos.map((p, i) => (
                      <li key={i} className="text-xs text-[var(--text-secondary)] flex items-start gap-1.5">
                        <span className="text-amber-500 shrink-0 mt-0.5">·</span>{p}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <div className="text-xs font-bold text-cyan-500 mb-2">◈ Oportunidades</div>
                  <ul className="space-y-1">
                    {data.conclusao_ia.oportunidades.map((p, i) => (
                      <li key={i} className="text-xs text-[var(--text-secondary)] flex items-start gap-1.5">
                        <span className="text-cyan-500 shrink-0 mt-0.5">·</span>{p}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </Card>

            {/* Footer */}
            <div className="text-xs text-[var(--text-muted)] text-center pt-2 pb-6">
              Preço em tempo real via Mercado Bitcoin API • Histórico OHLCV, ATH/ATL e dados de desenvolvimento via CoinGecko API • Fear & Greed via Alternative.me
              <br />Análise algorítmica, não constitui recomendação de investimento. Cache de 5 minutos.
            </div>
          </>
        )}

        {!data && !loading && !erro && (
          <div className="text-center py-20 text-[var(--text-muted)]">Selecione uma moeda para iniciar a análise</div>
        )}

        {loading && (
          <div className="flex flex-col items-center gap-4 py-20">
            <div className="text-5xl animate-bounce">₿</div>
            <p className="text-[var(--text-secondary)] text-sm">Analisando {simbolo}... buscando dados e calculando indicadores</p>
          </div>
        )}
      </div>
    </div>
  );
}
