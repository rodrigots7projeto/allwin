"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";

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

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Motor {
  score: number;
  nivel: string;
  componentes: Record<string, number>;
}

interface Decisao {
  decisao: string;
  emoji: string;
  cor: string;
  descricao: string;
}

interface Confidence {
  score: number;
  nivel: string;
  alta: number;
  baixa: number;
  neutro: number;
  total: number;
}

interface MotorData {
  simbolo: string;
  nome: string;
  preco_atual: number | null;
  variacao_24h: number | null;
  variacao_7d: number | null;
  market_cap_rank: number | null;
  icp: Motor;
  ice: Motor;
  icep: Motor;
  iee: Motor;
  decisao: Decisao;
  confidence: Confidence;
  relatorio: string;
  indicadores: Record<string, unknown>;
  volatilidade: Record<string, number | null>;
  candles_usados: number;
}

interface CompData {
  correlacoes: Record<string, { r: number; interpretacao: string }>;
  beta: Record<string, number>;
  forca_relativa: Record<string, number>;
  retornos: { alt: Record<string, number>; btc: Record<string, number> };
  grafico: { data: string; btc: number; alt: number }[];
  probabilidades: {
    prob_alta: { pct_btc_subiu: number; pct_alt_subiu_tb: number };
    prob_queda: { pct_btc_caiu: number; pct_alt_caiu_tb: number };
  };
  indice_sincronia: number;
  score_comparativo: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fBRL(v: number | null | undefined): string {
  if (v == null) return "—";
  if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `R$ ${(v / 1_000).toFixed(2)}K`;
  if (v >= 1) return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  return `R$ ${v.toFixed(6)}`;
}

function fPct(v: number | null | undefined, decimals = 1): string {
  if (v == null) return "—";
  return `${v > 0 ? "+" : ""}${v.toFixed(decimals)}%`;
}

function scoreColor(score: number): string {
  if (score >= 80) return "#10b981";
  if (score >= 65) return "#84cc16";
  if (score >= 50) return "#f59e0b";
  if (score >= 35) return "#f97316";
  return "#ef4444";
}

// ── Score Gauge (arco) ────────────────────────────────────────────────────────

function ScoreGauge({ score, label, color, size = "md" }: {
  score: number; label: string; color: string; size?: "sm" | "md";
}) {
  const w = size === "sm" ? 90 : 120;
  const h = size === "sm" ? 54 : 72;
  const fs = size === "sm" ? 15 : 20;
  const fill = (score / 100) * 157;

  return (
    <div className="flex flex-col items-center gap-0.5 shrink-0">
      <svg width={w} height={h} viewBox="0 0 120 72">
        <path d="M 10 66 A 50 50 0 0 1 110 66" fill="none" stroke="var(--border)" strokeWidth="10" strokeLinecap="round" />
        <path d="M 10 66 A 50 50 0 0 1 110 66" fill="none" stroke={color} strokeWidth="10" strokeLinecap="round"
          strokeDasharray={`${fill} 157`} />
        <text x="60" y="62" textAnchor="middle" fill="var(--text-primary)" fontSize={fs} fontWeight="bold">
          {Math.round(score)}
        </text>
      </svg>
      <span className="text-xs font-semibold" style={{ color }}>{label}</span>
    </div>
  );
}

// ── Motor Card (clicável) ─────────────────────────────────────────────────────

function MotorCard({ name, pergunta, motor, compLabels, accent }: {
  name: string;
  pergunta: string;
  motor: Motor;
  compLabels: Record<string, string>;
  accent?: string;
}) {
  const color = scoreColor(motor.score);
  const [open, setOpen] = useState(false);
  const entries = Object.entries(motor.componentes);

  return (
    <div
      className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] overflow-hidden transition-shadow hover:shadow-md"
      style={{ borderLeftWidth: 3, borderLeftColor: color }}
    >
      {/* Header clicável */}
      <button
        className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left"
        onClick={() => setOpen(!open)}
      >
        <div className="flex-1 min-w-0">
          <div className="text-xs font-bold uppercase tracking-wider mb-0.5" style={{ color }}>
            {name}
          </div>
          <div className="text-xs text-[var(--text-muted)] italic truncate">{pergunta}</div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <ScoreGauge score={motor.score} label={motor.nivel} color={color} size="sm" />
          <span className="text-[var(--text-muted)] text-sm">{open ? "▲" : "▼"}</span>
        </div>
      </button>

      {/* Conteúdo expansível */}
      {open && (
        <div className="px-5 pb-5 border-t border-[var(--border)]/50 pt-3 space-y-2">
          {entries.map(([k, v]) => (
            <div key={k} className="flex items-center gap-2">
              <span className="text-xs text-[var(--text-muted)] w-40 shrink-0">{compLabels[k] ?? k}</span>
              <div className="flex-1 h-2 bg-[var(--border)] rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${Math.max(0, Math.min(100, v))}%`, backgroundColor: scoreColor(v) }}
                />
              </div>
              <span className="text-xs font-mono w-8 text-right" style={{ color: scoreColor(v) }}>
                {v.toFixed(0)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Indicador Row ─────────────────────────────────────────────────────────────

function IndRow({ label, value, sinal }: { label: string; value: string; sinal?: string }) {
  const corSinal =
    sinal === "compra" || sinal === "alta" || sinal === "forte" ? "text-emerald-500"
    : sinal === "venda" || sinal === "baixa" ? "text-red-500"
    : "text-[var(--text-muted)]";
  return (
    <div className="flex justify-between items-center py-1.5 border-b border-[var(--border)]/40 last:border-0">
      <span className="text-xs text-[var(--text-secondary)]">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-xs font-mono text-[var(--text-primary)]">{value}</span>
        {sinal && <span className={`text-xs font-semibold ${corSinal}`}>{sinal}</span>}
      </div>
    </div>
  );
}

// ── Seção colapsável de indicadores ──────────────────────────────────────────

function IndSection({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-[var(--border)]/20 transition-colors"
        onClick={() => setOpen(!open)}
      >
        <span className="text-sm font-bold text-[var(--text-primary)]">{title}</span>
        <span className="text-[var(--text-muted)] text-sm">{open ? "▲" : "▼"}</span>
      </button>
      {open && <div className="px-5 pb-4">{children}</div>}
    </div>
  );
}

// ── Painel Comparativo BTC ────────────────────────────────────────────────────

function ComparativoBTC({ simbolo }: { simbolo: string }) {
  const [comp, setComp] = useState<CompData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`${API}/cripto/comparativo/${simbolo}`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { setComp(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [simbolo]);

  if (loading)
    return (
      <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] p-6 flex items-center justify-center gap-3">
        <div className="w-5 h-5 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" />
        <span className="text-sm text-[var(--text-secondary)]">Carregando comparativo BTC…</span>
      </div>
    );

  if (!comp)
    return (
      <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] p-5 text-center text-xs text-[var(--text-muted)]">
        Comparativo indisponível
      </div>
    );

  const corr30 = comp.correlacoes?.["30d"]?.r;
  const corr90 = comp.correlacoes?.["90d"]?.r;
  const beta90 = comp.beta?.["90d"];
  const fr7    = comp.forca_relativa?.["7d"];
  const fr30   = comp.forca_relativa?.["30d"];
  const sinc   = comp.indice_sincronia;
  const score  = comp.score_comparativo;

  const probAlta  = comp.probabilidades?.prob_alta;
  const probQueda = comp.probabilidades?.prob_queda;

  // Últimos 90 dias do gráfico
  const grafico = (comp.grafico ?? []).slice(-90);

  return (
    <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] overflow-hidden">
      {/* Cabeçalho */}
      <div className="px-5 py-4 border-b border-[var(--border)] flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="text-sm font-bold text-[var(--text-primary)]">
            ⚖ Comportamento vs BTC — últimos 90 dias
          </h3>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            Como {simbolo} se move em relação ao Bitcoin
          </p>
        </div>
        {score != null && (
          <div className="text-center">
            <div className="text-xs text-[var(--text-muted)] mb-0.5">Score Comparativo</div>
            <div className="text-2xl font-black" style={{ color: scoreColor(score) }}>{Math.round(score)}</div>
          </div>
        )}
      </div>

      <div className="p-5 space-y-5">

        {/* Métricas em grade */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Correlação 30d", val: corr30 != null ? corr30.toFixed(2) : "—",
              sub: corr30 != null ? (corr30 >= 0.7 ? "Alta" : corr30 >= 0.4 ? "Moderada" : "Baixa") : "" },
            { label: "Correlação 90d", val: corr90 != null ? corr90.toFixed(2) : "—",
              sub: comp.correlacoes?.["90d"]?.interpretacao ?? "" },
            { label: "Beta (90d)",     val: beta90 != null ? beta90.toFixed(2) : "—",
              sub: beta90 != null ? (beta90 > 1.5 ? "Muito volátil" : beta90 > 1 ? "Mais volátil" : beta90 > 0.5 ? "Menos volátil" : "Baixo") : "" },
            { label: "Sincronia",      val: sinc != null ? `${Math.round(sinc)}` : "—",
              sub: sinc != null ? (sinc >= 70 ? "Alta" : sinc >= 40 ? "Média" : "Baixa") : "" },
          ].map((m) => (
            <div key={m.label} className="bg-[var(--bg)] rounded-lg border border-[var(--border)] px-3 py-2.5 text-center">
              <div className="text-xs text-[var(--text-muted)] mb-1">{m.label}</div>
              <div className="text-lg font-bold text-[var(--text-primary)]">{m.val}</div>
              {m.sub && <div className="text-xs text-[var(--text-muted)] mt-0.5">{m.sub}</div>}
            </div>
          ))}
        </div>

        {/* Força Relativa */}
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: `FR 7d — ${simbolo} vs BTC`, val: fr7 },
            { label: `FR 30d — ${simbolo} vs BTC`, val: fr30 },
          ].map((m) => (
            <div key={m.label} className="bg-[var(--bg)] rounded-lg border border-[var(--border)] px-3 py-2.5">
              <div className="text-xs text-[var(--text-muted)] mb-1">{m.label}</div>
              <div className="flex items-center gap-2">
                <div className={`text-lg font-bold ${m.val == null ? "text-[var(--text-muted)]" : m.val >= 1 ? "text-emerald-500" : "text-red-500"}`}>
                  {m.val != null ? m.val.toFixed(2) : "—"}
                </div>
                {m.val != null && (
                  <span className="text-xs text-[var(--text-muted)]">
                    {m.val >= 1.1 ? "⬆ Supera BTC" : m.val >= 0.9 ? "≈ Em linha" : "⬇ Abaixo do BTC"}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Probabilidades */}
        {(probAlta || probQueda) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {probAlta && (
              <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-4 py-3">
                <div className="text-xs font-semibold text-emerald-500 mb-2">🟢 Se BTC subir</div>
                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-[var(--text-muted)]">BTC subiu em:</span>
                    <span className="font-semibold text-[var(--text-primary)]">{probAlta.pct_btc_subiu?.toFixed(0)}% dos dias</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-[var(--text-muted)]">{simbolo} também subiu:</span>
                    <span className="font-bold text-emerald-500">{probAlta.pct_alt_subiu_tb?.toFixed(0)}% das vezes</span>
                  </div>
                </div>
              </div>
            )}
            {probQueda && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3">
                <div className="text-xs font-semibold text-red-500 mb-2">🔴 Se BTC cair</div>
                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-[var(--text-muted)]">BTC caiu em:</span>
                    <span className="font-semibold text-[var(--text-primary)]">{probQueda.pct_btc_caiu?.toFixed(0)}% dos dias</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-[var(--text-muted)]">{simbolo} também caiu:</span>
                    <span className="font-bold text-red-500">{probQueda.pct_alt_caiu_tb?.toFixed(0)}% das vezes</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Gráfico normalizado */}
        {grafico.length > 0 && (
          <div>
            <div className="flex items-center gap-4 mb-2">
              <span className="text-xs text-[var(--text-muted)]">Desempenho normalizado (base 100)</span>
              <div className="flex items-center gap-3 ml-auto">
                <span className="flex items-center gap-1 text-xs"><span className="inline-block w-3 h-0.5 bg-orange-400" /> BTC</span>
                <span className="flex items-center gap-1 text-xs"><span className="inline-block w-3 h-0.5 bg-emerald-400" /> {simbolo}</span>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={grafico} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                <XAxis dataKey="data" hide />
                <YAxis domain={["auto", "auto"]} tickFormatter={(v: unknown) => `${Number(v).toFixed(0)}`}
                  tick={{ fontSize: 10, fill: "var(--text-muted)" }} />
                <Tooltip
                  formatter={(v: unknown, name: unknown) => [`${Number(v).toFixed(1)}`, String(name)]}
                  labelFormatter={(l: unknown) => String(l)}
                  contentStyle={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                />
                <ReferenceLine y={100} stroke="var(--border)" strokeDasharray="3 3" />
                <Line dataKey="btc" stroke="#fb923c" dot={false} strokeWidth={1.5} name="BTC" />
                <Line dataKey="alt" stroke="#34d399" dot={false} strokeWidth={1.5} name={simbolo} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Retornos side-by-side */}
        {comp.retornos && (
          <div>
            <div className="text-xs text-[var(--text-muted)] mb-2">Retornos comparados</div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[var(--text-muted)] border-b border-[var(--border)]">
                    <th className="py-1.5 text-left font-medium">Período</th>
                    <th className="py-1.5 text-right font-medium">BTC</th>
                    <th className="py-1.5 text-right font-medium">{simbolo}</th>
                    <th className="py-1.5 text-right font-medium">Vencedor</th>
                  </tr>
                </thead>
                <tbody>
                  {(["7d", "30d", "90d", "365d"] as const).map((p) => {
                    const b = comp.retornos.btc?.[p];
                    const a = comp.retornos.alt?.[p];
                    if (b == null || a == null) return null;
                    const venc = a > b ? simbolo : "BTC";
                    return (
                      <tr key={p} className="border-b border-[var(--border)]/40 hover:bg-[var(--border)]/10">
                        <td className="py-1.5 font-medium text-[var(--text-secondary)]">{p}</td>
                        <td className={`py-1.5 text-right font-mono ${b >= 0 ? "text-emerald-500" : "text-red-500"}`}>{fPct(b)}</td>
                        <td className={`py-1.5 text-right font-mono ${a >= 0 ? "text-emerald-500" : "text-red-500"}`}>{fPct(a)}</td>
                        <td className="py-1.5 text-right">
                          <span className={`px-1.5 py-0.5 rounded text-xs font-bold ${venc === simbolo ? "bg-emerald-500/20 text-emerald-500" : "bg-orange-500/20 text-orange-400"}`}>
                            {venc}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function MotorPage() {
  const params = useParams();
  const router = useRouter();
  const simbolo = (params.simbolo as string ?? "BTC").toUpperCase();

  const [data, setData] = useState<MotorData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`${API}/cripto/motor/${simbolo}`)
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((d) => { setData(d); setLoading(false); })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, [simbolo]);

  if (loading)
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-[var(--text-secondary)]">Calculando motores para {simbolo}…</p>
        </div>
      </div>
    );

  if (error || !data)
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center text-red-500">
          <div className="text-4xl mb-3">⚠️</div>
          <p>{error ?? "Dados indisponíveis"}</p>
        </div>
      </div>
    );

  const { icp, ice, icep, iee, decisao, confidence, indicadores, volatilidade: vol } = data;

  const rsiVal   = indicadores.rsi as number | null;
  const macdData = indicadores.macd as { macd: number; signal: number; histograma: number; sinal: string } | null;
  const adxData  = indicadores.adx as { adx: number | null; plus_di: number; minus_di: number; sinal: string; direcao: string } | null;
  const bbData   = indicadores.bollinger as { upper: number; middle: number; lower: number; sinal: string } | null;
  const srsiData = indicadores.stoch_rsi as { k: number; d: number; sinal: string } | null;
  const wrVal    = indicadores.williams_r as number | null;
  const mfiVal   = indicadores.mfi as number | null;
  const rocVal   = indicadores.roc as number | null;
  const cciVal   = indicadores.cci as number | null;
  const e9       = indicadores.ema_9  as number | null;
  const e21      = indicadores.ema_21 as number | null;
  const e50      = indicadores.ema_50 as number | null;
  const e200     = indicadores.ema_200 as number | null;
  const fibData  = indicadores.fibonacci as { posicao_pct: number; entre: string[]; alto: number; baixo: number } | null;
  const preco    = data.preco_atual;

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-5">

      {/* ── Seletor de moeda ── */}
      <div className="flex flex-wrap gap-1.5">
        {MOEDAS.map((m) => (
          <button
            key={m.simbolo}
            onClick={() => router.push(`/cripto/motor/${m.simbolo}`)}
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

      {/* ── Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">⚡ Motor — {simbolo}</h1>
          <p className="text-sm text-[var(--text-secondary)]">{data.nome}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {preco != null && (
            <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg px-3 py-2 text-center">
              <div className="text-xs text-[var(--text-muted)]">Preço</div>
              <div className="text-base font-bold text-[var(--text-primary)]">{fBRL(preco)}</div>
            </div>
          )}
          {data.variacao_24h != null && (
            <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg px-3 py-2 text-center">
              <div className="text-xs text-[var(--text-muted)]">24h</div>
              <div className={`text-sm font-semibold ${data.variacao_24h >= 0 ? "text-emerald-500" : "text-red-500"}`}>{fPct(data.variacao_24h)}</div>
            </div>
          )}
          {data.variacao_7d != null && (
            <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg px-3 py-2 text-center">
              <div className="text-xs text-[var(--text-muted)]">7d</div>
              <div className={`text-sm font-semibold ${data.variacao_7d >= 0 ? "text-emerald-500" : "text-red-500"}`}>{fPct(data.variacao_7d)}</div>
            </div>
          )}
          {data.market_cap_rank != null && (
            <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg px-3 py-2 text-center">
              <div className="text-xs text-[var(--text-muted)]">Rank</div>
              <div className="text-sm font-bold text-[var(--text-primary)]">#{data.market_cap_rank}</div>
            </div>
          )}
        </div>
      </div>

      {/* ── Decisão Final ── */}
      <div
        className="rounded-2xl border-2 p-5 text-center"
        style={{ borderColor: decisao.cor, backgroundColor: `${decisao.cor}12` }}
      >
        <div className="text-4xl mb-1.5">{decisao.emoji}</div>
        <div className="text-2xl font-black mb-1.5" style={{ color: decisao.cor }}>{decisao.decisao}</div>
        <p className="text-[var(--text-secondary)] text-sm max-w-xl mx-auto">{decisao.descricao}</p>
        <div className="mt-4 max-w-xs mx-auto">
          <div className="flex justify-between text-xs text-[var(--text-muted)] mb-1">
            <span>Confiança dos indicadores</span>
            <span>{confidence.score.toFixed(0)}% — {confidence.nivel}</span>
          </div>
          <div className="h-2 bg-[var(--border)] rounded-full overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${confidence.score}%`, backgroundColor: scoreColor(confidence.score) }} />
          </div>
          <div className="flex justify-between text-xs mt-1">
            <span className="text-emerald-500">▲ {confidence.alta} alta</span>
            <span className="text-[var(--text-muted)]">● {confidence.neutro}</span>
            <span className="text-red-500">▼ {confidence.baixa} baixa</span>
          </div>
        </div>
      </div>

      {/* ── 4 Motores (clicáveis) ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <MotorCard name="ICP — Confirmação Preditiva" pergunta='"A tendência desta criptomoeda realmente é forte?"'
          motor={icp} compLabels={{ rsi: "RSI (14)", macd: "MACD", adx: "ADX", ema_align: "Alinhamento EMA",
            obv: "OBV / Volume", roc: "Momentum (ROC)", correlacao_btc: "Correlação BTC", fr_btc: "Força Relativa BTC" }} />
        <MotorCard name="ICE — Cenário Externo" pergunta='"O mercado favorece compras?"'
          motor={ice} compLabels={{ fear_greed: "Fear & Greed", tendencia_btc: "Tendência BTC", rank: "Rank Market Cap" }} />
        <MotorCard name="ICEP — Cansaço do Preço" pergunta='"O preço já subiu demais?"'
          motor={icep} compLabels={{ dist_ema21: "Dist. EMA 21", rsi_sobrecompra: "RSI Sobrecompra",
            mfi_cansaco: "MFI Cansaço", bollinger_pos: "Posição Bollinger", fibonacci_pos: "Posição Fibonacci" }} />
        <MotorCard name="IEE — Entrada Estratégica" pergunta='"Este é um bom momento para comprar?"'
          motor={iee} compLabels={{ icp: "ICP (Tendência)", ice: "ICE (Mercado)", icep_inv: "Preço não esticado",
            stoch_rsi: "Stoch RSI", williams_r: "Williams %R" }} />
      </div>

      {/* ── Comparativo BTC (apenas para altcoins) ── */}
      {simbolo !== "BTC" && <ComparativoBTC simbolo={simbolo} />}

      {/* ── Indicadores Técnicos (colapsáveis) ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <IndSection title="📈 Indicadores de Momentum">
          {rsiVal != null && <IndRow label="RSI (14)" value={rsiVal.toFixed(1)} sinal={rsiVal > 70 ? "venda" : rsiVal < 30 ? "compra" : "neutro"} />}
          {macdData && <>
            <IndRow label="MACD" value={macdData.macd.toFixed(2)} sinal={macdData.sinal} />
            <IndRow label="MACD Signal" value={macdData.signal.toFixed(2)} />
            <IndRow label="MACD Histograma" value={macdData.histograma.toFixed(2)} />
          </>}
          {rocVal != null && <IndRow label="ROC (10)" value={`${rocVal.toFixed(2)}%`} sinal={rocVal > 0 ? "alta" : "baixa"} />}
          {cciVal != null && <IndRow label="CCI (20)" value={cciVal.toFixed(1)} sinal={cciVal > 100 ? "venda" : cciVal < -100 ? "compra" : "neutro"} />}
          {srsiData && <>
            <IndRow label="Stoch RSI %K" value={srsiData.k.toFixed(1)} sinal={srsiData.sinal} />
            <IndRow label="Stoch RSI %D" value={srsiData.d.toFixed(1)} />
          </>}
          {wrVal != null && <IndRow label="Williams %R" value={wrVal.toFixed(1)} sinal={wrVal < -80 ? "compra" : wrVal > -20 ? "venda" : "neutro"} />}
          {mfiVal != null && <IndRow label="MFI (14)" value={mfiVal.toFixed(1)} sinal={mfiVal > 80 ? "venda" : mfiVal < 20 ? "compra" : "neutro"} />}
        </IndSection>

        <IndSection title="📐 Tendência e Estrutura">
          {adxData && <>
            {adxData.adx != null && <IndRow label="ADX" value={adxData.adx.toFixed(1)} sinal={adxData.sinal} />}
            <IndRow label="+DI" value={adxData.plus_di.toFixed(1)} sinal={adxData.direcao === "alta" ? "alta" : undefined} />
            <IndRow label="-DI" value={adxData.minus_di.toFixed(1)} sinal={adxData.direcao === "baixa" ? "baixa" : undefined} />
          </>}
          {bbData && <>
            <IndRow label="Bollinger Upper" value={fBRL(bbData.upper)} />
            <IndRow label="Bollinger Middle" value={fBRL(bbData.middle)} />
            <IndRow label="Bollinger Lower" value={fBRL(bbData.lower)} sinal={bbData.sinal} />
          </>}
          {e9   != null && <IndRow label="EMA 9"   value={fBRL(e9)}   sinal={preco != null && preco > e9   ? "alta" : "baixa"} />}
          {e21  != null && <IndRow label="EMA 21"  value={fBRL(e21)}  sinal={preco != null && preco > e21  ? "alta" : "baixa"} />}
          {e50  != null && <IndRow label="EMA 50"  value={fBRL(e50)}  sinal={preco != null && preco > e50  ? "alta" : "baixa"} />}
          {e200 != null && <IndRow label="EMA 200" value={fBRL(e200)} sinal={preco != null && preco > e200 ? "alta" : "baixa"} />}
          {fibData && <>
            <IndRow label="Fibonacci Posição" value={`${(fibData.posicao_pct * 100).toFixed(1)}%`} />
            <IndRow label="Entre níveis" value={fibData.entre.join(" — ")} />
          </>}
          {vol?.vol_30d_pct != null && <IndRow label="Volatilidade 30d" value={`${vol.vol_30d_pct.toFixed(2)}%`} />}
          {vol?.sharpe      != null && <IndRow label="Sharpe Ratio" value={(vol.sharpe as number).toFixed(2)} sinal={vol.sharpe > 1 ? "alta" : vol.sharpe < 0 ? "baixa" : "neutro"} />}
        </IndSection>
      </div>

      {/* ── Relatório IA (colapsável) ── */}
      <IndSection title="📝 Relatório Analítico">
        <div className="space-y-2 mt-1">
          {data.relatorio.split("\n").map((line, i) => {
            if (!line.trim()) return <div key={i} className="h-1.5" />;
            const parts = line.split(/(\*\*[^*]+\*\*)/g);
            return (
              <p key={i} className="text-sm text-[var(--text-secondary)] leading-relaxed">
                {parts.map((p, j) =>
                  p.startsWith("**") && p.endsWith("**")
                    ? <strong key={j} className="text-[var(--text-primary)] font-semibold">{p.slice(2, -2)}</strong>
                    : p
                )}
              </p>
            );
          })}
        </div>
      </IndSection>

      <p className="text-xs text-center text-[var(--text-muted)] pb-4">
        {data.candles_usados} candles diários • CoinGecko API • Cache 1h
      </p>
    </div>
  );
}
