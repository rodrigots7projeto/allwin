"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CartesianGrid, Legend, Line, LineChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { AnaliseHubNav } from "@/components/AnaliseHubNav";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface IndicadorTecnico {
  rsi:        { valor: number | null; sinal: string };
  macd:       { macd: number; signal: number; histograma: number; sinal: string } | null;
  ema_9:      { valor: number | null; sinal: string };
  ema_21:     { valor: number | null; sinal: string };
  ema_50:     { valor: number | null; sinal: string };
  ema_200:    { valor: number | null; sinal: string };
  bollinger:  { upper: number; middle: number; lower: number; sinal: string } | null;
  atr:        { valor: number | null; percentual: number | null };
  adx:        { adx: number | null; plus_di: number; minus_di: number; sinal: string; direcao: string } | null;
  roc:        number | null;
  cci:        number | null;
  mfi:        number | null;
  stoch_rsi:  { k: number; d: number; sinal: string } | null;
  williams_r: number | null;
  obv:        { sinal: string };
  tendencia:  { curto_prazo: string; medio_prazo: string; longo_prazo: string };
  volatilidade: { vol_30d_pct: number | null; vol_anualizada_pct: number | null; sharpe: number | null; drawdown_maximo_pct: number | null };
}

interface MoedaDados {
  preco: number;
  variacao_24h: number | null;
  variacao_7d:  number | null;
  variacao_30d: number | null;
  market_cap:   number | null;
  volume_24h:   number | null;
  retorno_7d:   number | null;
  retorno_30d:  number | null;
  retorno_90d:  number | null;
  indicadores:  IndicadorTecnico;
  fear_greed?:  { valor: number; classificacao: string } | null;
}

interface CompData {
  simbolo_alt: string;
  nome_alt:    string;
  btc:         MoedaDados;
  alt:         MoedaDados;
  comparativo: {
    correlacao:     Record<string, { valor: number | null; label: string }>;
    beta:           Record<string, { valor: number | null; label: string }>;
    forca_relativa: Record<string, { valor: number | null; label: string }>;
    retornos:       Record<string, { btc: number | null; alt: number | null; vencedor: string }>;
    market_cap:     { btc: number | null; alt: number | null; ratio: number | null };
    volume_relativo: number | null;
  };
  indice_sincronia:       number;
  indice_sincronia_label: string;
  probabilidades: {
    se_btc_subir: { probabilidade: number | null; intensidade: number | null; label_intens: string };
    se_btc_cair:  { probabilidade: number | null; intensidade: number | null; label_intens: string };
    periodo_dias: number;
  };
  score_comparativo: number;
  score_label:       string;
  grafico:           { data: string; btc: number; alt: number }[];
  explicacao_ia:     string;
}

interface RankItem {
  simbolo: string; nome: string; score: number;
  indice_sincronia: number; correlacao_90: number | null;
  beta: number | null; fr_30: number | null; fr_7: number | null;
  prob_alta: number | null; prob_queda: number | null;
  retorno_alt_30: number | null; retorno_btc_30: number | null;
  variacao_24h: number | null; variacao_7d: number | null;
}

interface RankData {
  btc_preco: number; btc_var_24h: number | null;
  total_altcoins: number;
  altcoins: RankItem[];
  rankings: Record<string, RankItem[]>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const ALTCOINS = [
  { s: "ETH",  n: "Ethereum"  },
  { s: "SOL",  n: "Solana"    },
  { s: "BNB",  n: "BNB"       },
  { s: "XRP",  n: "XRP"       },
  { s: "DOGE", n: "Dogecoin"  },
  { s: "ADA",  n: "Cardano"   },
  { s: "AVAX", n: "Avalanche" },
  { s: "LINK", n: "Chainlink" },
  { s: "LTC",  n: "Litecoin"  },
];

function fBRL(v: number | null | undefined, d = 2): string {
  if (v == null) return "—";
  if (v >= 1e9)  return `R$ ${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6)  return `R$ ${(v / 1e6).toFixed(2)}M`;
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: d, maximumFractionDigits: d }).format(v);
}
function fPct(v: number | null | undefined, d = 2): string {
  if (v == null) return "—";
  return `${v >= 0 ? "+" : ""}${v.toFixed(d)}%`;
}
function fNum(v: number | null | undefined, d = 2): string {
  if (v == null) return "—";
  return v.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
}
function varColor(v: number | null | undefined): string {
  if (v == null) return "var(--text-muted)";
  return v >= 0 ? "#10b981" : "#ef4444";
}
function scoreColor(s: number): string {
  if (s >= 80) return "#10b981";
  if (s >= 65) return "#84cc16";
  if (s >= 50) return "#f59e0b";
  if (s >= 35) return "#f97316";
  return "#ef4444";
}
function corrColor(c: number | null): string {
  if (c == null || c < 0.3) return "#ef4444";
  if (c < 0.6) return "#f59e0b";
  return "#10b981";
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
function sinaiColor(s: string): string {
  if (s === "compra") return "#10b981";
  if (s === "venda")  return "#ef4444";
  return "#f59e0b";
}

// ── Sub-componentes ───────────────────────────────────────────────────────────

function ScoreGauge({ score, label, cor }: { score: number; label?: string; cor?: string }) {
  const color = cor ?? scoreColor(score);
  const deg   = (score / 100) * 180;
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative w-24 h-12 overflow-hidden">
        <div className="absolute inset-0 rounded-t-full border-4 border-[var(--border)]" style={{ borderBottomColor: "transparent" }} />
        <div className="absolute bottom-0 left-1/2 w-1 h-10 origin-bottom rounded-full transition-all duration-700" style={{ backgroundColor: color, transform: `translateX(-50%) rotate(${deg - 90}deg)` }} />
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

function CorrelacaoBar({ valor, label, periodo }: { valor: number | null; label: string; periodo: string }) {
  const color  = corrColor(valor);
  const width  = valor != null ? Math.abs(valor) * 100 : 0;
  const isNeg  = (valor ?? 0) < 0;
  return (
    <div className="mb-2">
      <div className="flex justify-between mb-0.5">
        <span className="text-xs text-[var(--text-muted)]">{periodo}</span>
        <span className="text-xs font-bold" style={{ color }}>{valor != null ? valor.toFixed(3) : "—"}</span>
      </div>
      <div className="h-2 bg-[var(--border)] rounded-full overflow-hidden relative">
        {isNeg ? (
          <div className="h-full absolute right-1/2 rounded-l-full" style={{ width: `${width / 2}%`, backgroundColor: "#ef4444" }} />
        ) : (
          <div className="h-full absolute left-1/2 rounded-r-full" style={{ width: `${width / 2}%`, backgroundColor: color }} />
        )}
        <div className="absolute top-0 bottom-0 left-1/2 w-px bg-[var(--text-muted)]/40" />
      </div>
      <div className="text-xs text-[var(--text-muted)]/70 mt-0.5">{label}</div>
    </div>
  );
}

function ColIndic({ dados, nome, preco, isAlt = false }: { dados: IndicadorTecnico; nome: string; preco: number; isAlt?: boolean }) {
  const accent = isAlt ? "#f59e0b" : "#f7931a";
  return (
    <div>
      <h4 className="text-xs font-black mb-3 uppercase tracking-wider" style={{ color: accent }}>{nome}</h4>
      <Row label="RSI (14)"     value={dados.rsi.valor?.toFixed(1) ?? "—"} color={sinaiColor(dados.rsi.sinal)} />
      <Row label="MACD"         value={dados.macd ? <SinalBadge sinal={dados.macd.sinal} /> : "—"} />
      <Row label="EMA 9"        value={fBRL(dados.ema_9.valor)}   color={sinaiColor(dados.ema_9.sinal)} />
      <Row label="EMA 21"       value={fBRL(dados.ema_21.valor)}  color={sinaiColor(dados.ema_21.sinal)} />
      <Row label="EMA 50"       value={fBRL(dados.ema_50.valor)}  color={sinaiColor(dados.ema_50.sinal)} />
      <Row label="EMA 200"      value={fBRL(dados.ema_200.valor)} color={sinaiColor(dados.ema_200.sinal)} />
      {dados.adx && (
        <Row label={`ADX (${dados.adx.adx?.toFixed(0) ?? "—"})`} value={dados.adx.sinal === "forte" ? `↑ Forte ${dados.adx.direcao}` : "Fraco"} color={dados.adx.sinal === "forte" ? "#10b981" : "#f59e0b"} />
      )}
      <Row label="ROC"          value={dados.roc != null ? fPct(dados.roc) : "—"} color={dados.roc != null ? varColor(dados.roc) : undefined} />
      <Row label="CCI"          value={dados.cci?.toFixed(1) ?? "—"} color={dados.cci != null ? (dados.cci > 100 ? "#ef4444" : dados.cci < -100 ? "#10b981" : "#f59e0b") : undefined} />
      <Row label="MFI (14)"     value={dados.mfi?.toFixed(1) ?? "—"} color={dados.mfi != null ? sinaiColor(dados.mfi > 80 ? "venda" : dados.mfi < 20 ? "compra" : "neutro") : undefined} />
      {dados.stoch_rsi && (
        <Row label="Stoch RSI"  value={`K ${dados.stoch_rsi.k.toFixed(0)} / D ${dados.stoch_rsi.d.toFixed(0)}`} color={sinaiColor(dados.stoch_rsi.sinal)} />
      )}
      <Row label="Williams %R"  value={dados.williams_r?.toFixed(1) ?? "—"} color={dados.williams_r != null ? sinaiColor(dados.williams_r < -80 ? "compra" : dados.williams_r > -20 ? "venda" : "neutro") : undefined} />
      <Row label="OBV"          value={<SinalBadge sinal={dados.obv.sinal} />} />
      <div className="mt-3 border-t border-[var(--border)]/40 pt-3">
        <div className="text-xs text-[var(--text-muted)] mb-1 font-semibold">Tendência</div>
        {(["curto_prazo", "medio_prazo", "longo_prazo"] as const).map((k) => (
          <div key={k} className="flex justify-between py-0.5">
            <span className="text-xs text-[var(--text-muted)] capitalize">{k.replace("_", " ")}</span>
            <span className="text-xs font-bold" style={{ color: tendColor(dados.tendencia[k]) }}>{tendLabel(dados.tendencia[k])}</span>
          </div>
        ))}
      </div>
      <div className="mt-2 border-t border-[var(--border)]/40 pt-2 space-y-0.5">
        <Row label="Vol 30d"    value={fPct(dados.volatilidade.vol_30d_pct)} />
        <Row label="Vol Anual"  value={fPct(dados.volatilidade.vol_anualizada_pct)} />
        <Row label="Drawdown"   value={fPct(dados.volatilidade.drawdown_maximo_pct)} color="#ef4444" />
        <Row label="Sharpe"     value={dados.volatilidade.sharpe?.toFixed(2) ?? "—"} color={dados.volatilidade.sharpe != null ? (dados.volatilidade.sharpe > 1 ? "#10b981" : dados.volatilidade.sharpe > 0 ? "#f59e0b" : "#ef4444") : undefined} />
      </div>
    </div>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────

export default function ComparativoBTCPage() {
  const [simbolo, setSimbolo]     = useState("ETH");
  const [data, setData]           = useState<CompData | null>(null);
  const [rankData, setRankData]   = useState<RankData | null>(null);
  const [loading, setLoading]     = useState(false);
  const [loadingRank, setLoadingRank] = useState(false);
  const [erro, setErro]           = useState<string | null>(null);
  const [viewMode, setViewMode]   = useState<"comparativo" | "ranking">("comparativo");

  const buscar = useCallback(async (s: string) => {
    setLoading(true); setErro(null);
    try {
      const r = await fetch(`${BASE}/cripto/comparativo/${s}`);
      if (!r.ok) throw new Error(`Erro ${r.status}`);
      setData(await r.json());
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : "Erro ao carregar dados");
    } finally {
      setLoading(false);
    }
  }, []);

  const buscarRanking = useCallback(async () => {
    setLoadingRank(true);
    try {
      const r = await fetch(`${BASE}/cripto/ranking-btc`);
      if (!r.ok) throw new Error(`Erro ${r.status}`);
      setRankData(await r.json());
    } catch {
      /* silencia */
    } finally {
      setLoadingRank(false);
    }
  }, []);

  useEffect(() => { buscar(simbolo); }, [simbolo, buscar]);

  useEffect(() => {
    if (viewMode === "ranking" && !rankData) buscarRanking();
  }, [viewMode, rankData, buscarRanking]);

  const d = data;

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        <AnaliseHubNav />

        {/* ── View toggle ── */}
        <div className="flex flex-wrap gap-3 items-center justify-between">
          <div className="flex gap-2">
            {(["comparativo", "ranking"] as const).map((v) => (
              <button key={v} onClick={() => setViewMode(v)} className={`px-4 py-2 rounded-xl text-sm font-bold border transition-all ${viewMode === v ? "bg-emerald-500 text-white border-emerald-500" : "border-[var(--border)] text-[var(--text-secondary)] hover:border-emerald-400"}`}>
                {v === "comparativo" ? "⚖ Comparativo" : "🏆 Ranking"}
              </button>
            ))}
          </div>
          {viewMode === "comparativo" && (
            <div className="flex flex-wrap gap-2 items-center">
              <span className="text-sm font-bold text-[var(--text-muted)]">BTC ×</span>
              {ALTCOINS.map((m) => (
                <button key={m.s} onClick={() => setSimbolo(m.s)} className={`px-3 py-1.5 rounded-xl text-sm font-bold border transition-all ${simbolo === m.s ? "bg-amber-500 text-white border-amber-500" : "border-[var(--border)] text-[var(--text-secondary)] hover:border-amber-400"}`}>
                  {m.s}
                </button>
              ))}
              {loading && <div className="w-4 h-4 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />}
            </div>
          )}
        </div>

        {erro && <div className="p-4 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-500 text-sm">{erro}</div>}

        {/* ══════════════ COMPARATIVO ══════════════ */}
        {viewMode === "comparativo" && d && (
          <>
            {/* ── 1. Score Principal ── */}
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
              <div className="flex flex-wrap gap-6 items-start justify-between">
                {/* BTC info */}
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-2xl">₿</span>
                    <h2 className="text-xl font-black text-[var(--text-primary)]">Bitcoin</h2>
                    <span className="text-emerald-500 font-bold text-sm">BTC</span>
                  </div>
                  <div className="text-2xl font-black text-[var(--text-primary)]">{fBRL(d.btc.preco)}</div>
                  <div className="flex gap-3 mt-1">
                    <div className="text-xs"><span className="text-[var(--text-muted)]">24h </span><span style={{ color: varColor(d.btc.variacao_24h) }}>{fPct(d.btc.variacao_24h)}</span></div>
                    <div className="text-xs"><span className="text-[var(--text-muted)]">7d </span><span style={{ color: varColor(d.btc.variacao_7d) }}>{fPct(d.btc.variacao_7d)}</span></div>
                    <div className="text-xs"><span className="text-[var(--text-muted)]">30d </span><span style={{ color: varColor(d.btc.variacao_30d) }}>{fPct(d.btc.variacao_30d)}</span></div>
                  </div>
                </div>

                {/* VS */}
                <div className="flex flex-col items-center justify-center">
                  <div className="text-4xl font-black text-[var(--text-muted)]/30">VS</div>
                  <ScoreGauge score={d.score_comparativo} label="Score Comparativo" cor={scoreColor(d.score_comparativo)} />
                  <div className="mt-1 text-xs font-bold px-3 py-1 rounded-full" style={{ color: scoreColor(d.score_comparativo), backgroundColor: `${scoreColor(d.score_comparativo)}15`, border: `1px solid ${scoreColor(d.score_comparativo)}30` }}>
                    {d.score_label}
                  </div>
                </div>

                {/* Alt info */}
                <div className="text-right">
                  <div className="flex items-center gap-2 justify-end mb-1">
                    <span className="text-amber-500 font-bold text-sm">{d.simbolo_alt}</span>
                    <h2 className="text-xl font-black text-[var(--text-primary)]">{d.nome_alt}</h2>
                  </div>
                  <div className="text-2xl font-black text-[var(--text-primary)]">{fBRL(d.alt.preco)}</div>
                  <div className="flex gap-3 mt-1 justify-end">
                    <div className="text-xs"><span className="text-[var(--text-muted)]">24h </span><span style={{ color: varColor(d.alt.variacao_24h) }}>{fPct(d.alt.variacao_24h)}</span></div>
                    <div className="text-xs"><span className="text-[var(--text-muted)]">7d </span><span style={{ color: varColor(d.alt.variacao_7d) }}>{fPct(d.alt.variacao_7d)}</span></div>
                    <div className="text-xs"><span className="text-[var(--text-muted)]">30d </span><span style={{ color: varColor(d.alt.variacao_30d) }}>{fPct(d.alt.variacao_30d)}</span></div>
                  </div>
                </div>
              </div>
            </div>

            {/* ── 2. Índice de Sincronia + Probabilidades ── */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Sincronia */}
              <Card title="Índice de Sincronia com o BTC" icon="🔄">
                <div className="flex items-center gap-4 mb-3">
                  <ScoreGauge score={d.indice_sincronia} cor="#06b6d4" />
                  <div>
                    <div className="text-base font-black" style={{ color: "#06b6d4" }}>{d.indice_sincronia_label}</div>
                    <div className="text-xs text-[var(--text-muted)] mt-0.5">Escala 0–100</div>
                  </div>
                </div>
                <div className="text-xs text-[var(--text-muted)]">Combina correlação histórica, beta, força relativa e probabilidades.</div>
              </Card>

              {/* Se BTC Subir */}
              <Card title={`Se o BTC SUBIR → ${d.nome_alt}…`} icon="📈">
                <div className="text-center mb-3">
                  <div className="text-5xl font-black" style={{ color: "#10b981" }}>
                    {d.probabilidades.se_btc_subir.probabilidade?.toFixed(0) ?? "—"}%
                  </div>
                  <div className="text-xs text-[var(--text-muted)] mt-1">prob. de subir junto ({d.probabilidades.periodo_dias}d histórico)</div>
                </div>
                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                  <div className="text-xs font-semibold text-emerald-400 text-center">{d.probabilidades.se_btc_subir.label_intens}</div>
                  {d.probabilidades.se_btc_subir.intensidade != null && (
                    <div className="text-xs text-center text-[var(--text-muted)] mt-1">Beta médio: {d.probabilidades.se_btc_subir.intensidade.toFixed(2)}×</div>
                  )}
                </div>
              </Card>

              {/* Se BTC Cair */}
              <Card title={`Se o BTC CAIR → ${d.nome_alt}…`} icon="📉">
                <div className="text-center mb-3">
                  <div className="text-5xl font-black" style={{ color: "#ef4444" }}>
                    {d.probabilidades.se_btc_cair.probabilidade?.toFixed(0) ?? "—"}%
                  </div>
                  <div className="text-xs text-[var(--text-muted)] mt-1">prob. de cair junto ({d.probabilidades.periodo_dias}d histórico)</div>
                </div>
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20">
                  <div className="text-xs font-semibold text-rose-400 text-center">{d.probabilidades.se_btc_cair.label_intens}</div>
                  {d.probabilidades.se_btc_cair.intensidade != null && (
                    <div className="text-xs text-center text-[var(--text-muted)] mt-1">Intensidade: {d.probabilidades.se_btc_cair.intensidade.toFixed(2)}×</div>
                  )}
                </div>
              </Card>
            </div>

            {/* ── 3. Gráfico sincronizado ── */}
            {d.grafico.length > 0 && (
              <Card title={`Performance Relativa — BTC × ${d.nome_alt} (base 100)`} icon="📊">
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={d.grafico}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="data" tick={{ fontSize: 9, fill: "var(--text-muted)" }} tickLine={false} interval={Math.floor(d.grafico.length / 8)} />
                      <YAxis tick={{ fontSize: 9, fill: "var(--text-muted)" }} tickLine={false} width={40} />
                      <Tooltip
                        contentStyle={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 11 }}
                        formatter={(v: unknown, name: unknown) => [`${Number(v).toFixed(1)}`, name === "btc" ? "BTC" : d.nome_alt]}
                      />
                      <Legend formatter={(v) => v === "btc" ? "Bitcoin" : d.nome_alt} />
                      <Line type="monotone" dataKey="btc" stroke="#f7931a" strokeWidth={2} dot={false} name="btc" />
                      <Line type="monotone" dataKey="alt" stroke="#f59e0b" strokeWidth={2} dot={false} name="alt" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <div className="text-xs text-[var(--text-muted)] mt-1 text-center">Ambas as séries normalizadas a 100 no início do período — mostra quem performou melhor relativamente.</div>
              </Card>
            )}

            {/* ── 4. Correlação e Beta ── */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card title="Correlação Histórica" icon="🔗">
                <div className="text-xs text-[var(--text-muted)] mb-3">Pearson r — varia de -1 a +1. Acima de 0,7 = forte sincronia.</div>
                {Object.entries(d.comparativo.correlacao).map(([p, c]) => (
                  <CorrelacaoBar key={p} valor={c.valor} label={c.label} periodo={p} />
                ))}
              </Card>

              <Card title="Beta e Força Relativa" icon="⚡">
                <div className="mb-4">
                  <div className="text-xs font-bold text-[var(--text-muted)] mb-2 uppercase">Beta</div>
                  {Object.entries(d.comparativo.beta).map(([p, b]) => (
                    <Row key={p} label={`Beta ${p}`} value={b.valor?.toFixed(3) ?? "—"} color={b.valor != null ? (Math.abs(b.valor - 1) < 0.3 ? "#10b981" : b.valor > 2 ? "#f97316" : "#f59e0b") : undefined} />
                  ))}
                  {d.comparativo.beta["90d"].valor && (
                    <div className="mt-1 text-xs text-[var(--text-muted)] italic">{d.comparativo.beta["90d"].label}</div>
                  )}
                </div>
                <div>
                  <div className="text-xs font-bold text-[var(--text-muted)] mb-2 uppercase">Força Relativa (retorno alt ÷ retorno BTC)</div>
                  {Object.entries(d.comparativo.forca_relativa).map(([p, fr]) => (
                    <Row key={p} label={`FR ${p}`} value={fr.valor != null ? `${fr.valor.toFixed(3)}×` : "—"} color={fr.valor != null ? (fr.valor >= 1 ? "#10b981" : "#ef4444") : undefined} />
                  ))}
                </div>
              </Card>
            </div>

            {/* ── 5. Retornos lado a lado ── */}
            <Card title="Comparativo de Retornos" icon="🏁">
              <div className="grid grid-cols-3 gap-4">
                {Object.entries(d.comparativo.retornos).map(([p, r]) => (
                  <div key={p} className="rounded-xl border border-[var(--border)] p-3">
                    <div className="text-xs text-[var(--text-muted)] font-bold mb-2 text-center">{p}</div>
                    <div className="flex gap-2">
                      <div className={`flex-1 text-center p-2 rounded-lg ${r.vencedor === "btc" ? "bg-[#f7931a]/15 border border-[#f7931a]/30" : "opacity-60"}`}>
                        <div className="text-xs text-[var(--text-muted)]">BTC</div>
                        <div className="text-sm font-black" style={{ color: varColor(r.btc) }}>{fPct(r.btc)}</div>
                      </div>
                      <div className={`flex-1 text-center p-2 rounded-lg ${r.vencedor === "alt" ? "bg-amber-500/15 border border-amber-500/30" : "opacity-60"}`}>
                        <div className="text-xs text-[var(--text-muted)]">{d.simbolo_alt}</div>
                        <div className="text-sm font-black" style={{ color: varColor(r.alt) }}>{fPct(r.alt)}</div>
                      </div>
                    </div>
                    {r.vencedor === "alt" ? (
                      <div className="text-xs text-center text-amber-500 font-bold mt-1">↑ {d.simbolo_alt} venceu</div>
                    ) : (
                      <div className="text-xs text-center text-[#f7931a] font-bold mt-1">₿ BTC venceu</div>
                    )}
                  </div>
                ))}
              </div>
            </Card>

            {/* ── 6. Indicadores Técnicos ── */}
            <Card title="Indicadores Técnicos Comparados" icon="⚙">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* BTC */}
                <div>
                  <ColIndic dados={d.btc.indicadores} nome="₿ Bitcoin (BTC)" preco={d.btc.preco} />
                </div>
                {/* Divisor */}
                <div className="hidden md:block absolute left-1/2 top-0 bottom-0 w-px bg-[var(--border)] pointer-events-none" />
                {/* Alt */}
                <div>
                  <ColIndic dados={d.alt.indicadores} nome={`${d.simbolo_alt} — ${d.nome_alt}`} preco={d.alt.preco} isAlt />
                </div>
              </div>
            </Card>

            {/* ── 7. Market Cap + Volume ── */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card title="Market Cap e Dominância" icon="💎">
                <Row label="Market Cap BTC"  value={fBRL(d.comparativo.market_cap.btc)} color="#f7931a" />
                <Row label={`Market Cap ${d.simbolo_alt}`} value={fBRL(d.comparativo.market_cap.alt)} color="#f59e0b" />
                <Row label="Ratio (Alt / BTC)" value={d.comparativo.market_cap.ratio != null ? `${(d.comparativo.market_cap.ratio * 100).toFixed(4)}%` : "—"} />
                <div className="mt-3">
                  <div className="text-xs text-[var(--text-muted)] mb-1">Cap. Relativa</div>
                  <div className="h-3 bg-[var(--border)] rounded-full overflow-hidden">
                    {d.comparativo.market_cap.ratio != null && (
                      <div className="h-full rounded-full bg-amber-500" style={{ width: `${Math.min(100, d.comparativo.market_cap.ratio * 100 * 5)}%` }} />
                    )}
                  </div>
                </div>
              </Card>
              <Card title="Volume Relativo" icon="📦">
                <Row label="Volume BTC 24h"  value={fBRL(d.btc.volume_24h)} color="#f7931a" />
                <Row label={`Volume ${d.simbolo_alt} 24h`} value={fBRL(d.alt.volume_24h)} color="#f59e0b" />
                {d.comparativo.volume_relativo != null && (
                  <Row label="Ratio de Volume" value={`${d.comparativo.volume_relativo.toFixed(3)}×`} color={d.comparativo.volume_relativo > 0.5 ? "#10b981" : "#ef4444"} />
                )}
                {d.btc.fear_greed && (
                  <div className="mt-3 p-3 rounded-xl bg-[var(--border)]/20">
                    <div className="text-xs text-[var(--text-muted)] mb-0.5">Fear & Greed</div>
                    <div className="text-lg font-black" style={{ color: d.btc.fear_greed.valor < 30 ? "#ef4444" : d.btc.fear_greed.valor > 70 ? "#10b981" : "#f59e0b" }}>
                      {d.btc.fear_greed.valor} — {d.btc.fear_greed.classificacao}
                    </div>
                  </div>
                )}
              </Card>
            </div>

            {/* ── 8. Explicação IA ── */}
            <Card title="Análise Inteligente" icon="🤖">
              <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{d.explicacao_ia}</p>
              <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
                <ScoreGauge score={d.score_comparativo} label="Score Comp." cor={scoreColor(d.score_comparativo)} />
                <ScoreGauge score={d.indice_sincronia}  label="Sincronia"   cor="#06b6d4" />
                <ScoreGauge score={d.probabilidades.se_btc_subir.probabilidade ?? 50} label="P(Alta)" cor="#10b981" />
                <ScoreGauge score={d.probabilidades.se_btc_cair.probabilidade ?? 50}  label="P(Queda)" cor="#ef4444" />
              </div>
            </Card>
          </>
        )}

        {/* ══════════════ RANKING ══════════════ */}
        {viewMode === "ranking" && (
          <>
            {loadingRank ? (
              <div className="flex flex-col items-center gap-4 py-20">
                <div className="text-5xl animate-bounce">₿</div>
                <p className="text-[var(--text-secondary)] text-sm">Calculando ranking de todas as altcoins vs BTC…</p>
                <p className="text-xs text-[var(--text-muted)]">Isso pode levar alguns segundos (múltiplas APIs).</p>
              </div>
            ) : rankData ? (
              <>
                {/* BTC header */}
                <div className="rounded-2xl border border-[#f7931a]/30 bg-[#f7931a]/5 p-4 flex flex-wrap gap-6 items-center">
                  <div>
                    <div className="text-xs text-[var(--text-muted)]">Bitcoin (BTC)</div>
                    <div className="text-2xl font-black text-[var(--text-primary)]">{fBRL(rankData.btc_preco)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-[var(--text-muted)]">24h</div>
                    <div className="text-sm font-bold" style={{ color: varColor(rankData.btc_var_24h) }}>{fPct(rankData.btc_var_24h)}</div>
                  </div>
                  <div className="ml-auto text-xs text-[var(--text-muted)]">{rankData.total_altcoins} altcoins analisadas</div>
                </div>

                {/* Rankings temáticos */}
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {[
                    { key: "maior_score",           title: "Maior Score Comparativo",           icon: "🥇", field: "score",             suffix: "/100" },
                    { key: "mais_sincronizadas",     title: "Mais Sincronizadas com BTC",         icon: "🔄", field: "indice_sincronia",   suffix: "/100" },
                    { key: "superam_btc_nas_altas",  title: "Superam BTC nas Altas (FR 30d)",     icon: "🚀", field: "fr_30",              suffix: "×" },
                    { key: "mais_resilientes",       title: "Mais Resilientes nas Quedas",        icon: "🛡", field: "prob_queda",         suffix: "%" },
                    { key: "maior_fr_7d",            title: "Maior Força Relativa (7 dias)",      icon: "⚡", field: "fr_7",               suffix: "×" },
                    { key: "mais_independentes",     title: "Mais Independentes do BTC",          icon: "🌐", field: "indice_sincronia",   suffix: "/100" },
                  ].map(({ key, title, icon, field, suffix }) => (
                    <Card key={key} title={title} icon={icon}>
                      {(rankData.rankings[key] ?? []).map((item, i) => (
                        <div key={item.simbolo} className="flex items-center gap-3 py-2 border-b border-[var(--border)]/30 last:border-0">
                          <span className="text-sm font-black text-[var(--text-muted)] w-5">{i + 1}</span>
                          <div className="flex-1">
                            <div className="text-xs font-bold text-[var(--text-primary)]">{item.simbolo}</div>
                            <div className="text-xs text-[var(--text-muted)]">{item.nome}</div>
                          </div>
                          <div className="text-right">
                            <div className="text-sm font-black" style={{ color: scoreColor(((item as unknown as Record<string,number>)[field]) ?? 0) }}>
                              {fNum(((item as unknown as Record<string,number>)[field]), field === "score" || field === "indice_sincronia" || field === "prob_alta" || field === "prob_queda" ? 1 : 2)}{suffix}
                            </div>
                            <div className="text-xs" style={{ color: varColor(item.variacao_24h) }}>{fPct(item.variacao_24h, 1)}</div>
                          </div>
                        </div>
                      ))}
                    </Card>
                  ))}
                </div>

                {/* Tabela completa */}
                <Card title="Todas as Altcoins — Tabela Completa" icon="📋">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-[var(--border)]">
                          {["#","Coin","Score","Sincronia","Corr 90d","Beta","FR 30d","Ret 30d Alt","Ret 30d BTC","P(Alta)","P(Queda)"].map((h) => (
                            <th key={h} className="text-left py-2 pr-3 text-[var(--text-muted)] font-semibold">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rankData.altcoins.map((item, i) => (
                          <tr key={item.simbolo} className="border-b border-[var(--border)]/20 hover:bg-[var(--border)]/10 transition-colors cursor-pointer" onClick={() => { setSimbolo(item.simbolo); setViewMode("comparativo"); }}>
                            <td className="py-2 pr-3 text-[var(--text-muted)]">{i + 1}</td>
                            <td className="py-2 pr-3">
                              <div className="font-bold text-[var(--text-primary)]">{item.simbolo}</div>
                              <div className="text-[var(--text-muted)]">{item.nome}</div>
                            </td>
                            <td className="py-2 pr-3 font-black" style={{ color: scoreColor(item.score) }}>{item.score.toFixed(0)}</td>
                            <td className="py-2 pr-3 font-bold" style={{ color: scoreColor(item.indice_sincronia) }}>{item.indice_sincronia.toFixed(0)}</td>
                            <td className="py-2 pr-3" style={{ color: corrColor(item.correlacao_90) }}>{item.correlacao_90?.toFixed(3) ?? "—"}</td>
                            <td className="py-2 pr-3" style={{ color: item.beta != null ? (item.beta > 2 ? "#f97316" : item.beta > 0.5 ? "#10b981" : "#ef4444") : undefined }}>{item.beta?.toFixed(2) ?? "—"}</td>
                            <td className="py-2 pr-3" style={{ color: item.fr_30 != null ? (item.fr_30 >= 1 ? "#10b981" : "#ef4444") : undefined }}>{item.fr_30 != null ? `${item.fr_30.toFixed(2)}×` : "—"}</td>
                            <td className="py-2 pr-3" style={{ color: varColor(item.retorno_alt_30) }}>{fPct(item.retorno_alt_30, 1)}</td>
                            <td className="py-2 pr-3" style={{ color: varColor(item.retorno_btc_30) }}>{fPct(item.retorno_btc_30, 1)}</td>
                            <td className="py-2 pr-3 text-emerald-500">{item.prob_alta?.toFixed(0) ?? "—"}%</td>
                            <td className="py-2 pr-3 text-rose-500">{item.prob_queda?.toFixed(0) ?? "—"}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div className="text-xs text-[var(--text-muted)] mt-2">Clique em uma linha para ver o comparativo completo.</div>
                  </div>
                </Card>
              </>
            ) : null}
          </>
        )}

        {loading && viewMode === "comparativo" && (
          <div className="flex flex-col items-center gap-4 py-20">
            <div className="text-5xl animate-bounce">⚖</div>
            <p className="text-[var(--text-secondary)] text-sm">Comparando BTC × {simbolo}…</p>
          </div>
        )}

        {/* Footer */}
        <div className="text-xs text-[var(--text-muted)] text-center pb-6">
          Dados históricos via CoinGecko API • Correlação, Beta e Força Relativa calculados internamente • Cache 5 min
        </div>
      </div>
    </div>
  );
}
