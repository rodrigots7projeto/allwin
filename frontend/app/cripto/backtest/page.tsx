"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import {
  Play, RotateCcw, ChevronDown, ChevronUp, Check, X, RefreshCw,
  TrendingUp, TrendingDown, AlertTriangle, Sparkles, Clock,
  BarChart3, FlaskConical, History, Brain, Loader2, Zap, LineChart,
} from "lucide-react";

// ── Constantes ────────────────────────────────────────────────────────────────

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

const SIMBOLOS = [
  "BTCUSDT","ETHUSDT","SOLUSDT","BNBUSDT","XRPUSDT",
  "DOGEUSDT","ADAUSDT","AVAXUSDT","LINKUSDT","LTCUSDT",
  "DOTUSDT","MATICUSDT","BCHUSDT","UNIUSDT","AAVEUSDT",
  "NEARUSDT","ARBUSDT","OPUSDT","SUIUSDT",
];

const PERIODOS = [
  { label: "30d",  dias: 30 },
  { label: "60d",  dias: 60 },
  { label: "90d",  dias: 90 },
  { label: "180d", dias: 180 },
  { label: "1 ano", dias: 365 },
];

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function daysAgoStr(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

// Scores rebaixados para gerar MUITO mais entradas (aguardar_ok: true em todos)
const PERFIS_FALLBACK: Perfil[] = [
  { id:"cons_normal",  nome:"Conservador Normal",   score_compra:50, score_venda:32, bull_pct_min:50, sl_pct:1.5, tp_pct:5.0,  aguardar_ok:true, apenas_aguardar:false, capital_inicial:10000, stake_base:1000 },
  { id:"cons_pro",     nome:"Conservador PRO",       score_compra:48, score_venda:30, bull_pct_min:48, sl_pct:2.0, tp_pct:7.0,  aguardar_ok:true, apenas_aguardar:false, capital_inicial:10000, stake_base:1000 },
  { id:"cons_promax",  nome:"Conservador PRO MAX",   score_compra:46, score_venda:28, bull_pct_min:46, sl_pct:2.5, tp_pct:9.0,  aguardar_ok:true, apenas_aguardar:false, capital_inicial:10000, stake_base:1000 },
  { id:"mod_normal",   nome:"Moderado Normal",       score_compra:45, score_venda:28, bull_pct_min:45, sl_pct:3.0, tp_pct:10.0, aguardar_ok:true, apenas_aguardar:false, capital_inicial:10000, stake_base:1000 },
  { id:"mod_pro",      nome:"Moderado PRO",          score_compra:43, score_venda:26, bull_pct_min:43, sl_pct:4.0, tp_pct:12.0, aguardar_ok:true, apenas_aguardar:false, capital_inicial:10000, stake_base:1000 },
  { id:"mod_promax",   nome:"Moderado PRO MAX",      score_compra:41, score_venda:25, bull_pct_min:41, sl_pct:5.0, tp_pct:15.0, aguardar_ok:true, apenas_aguardar:false, capital_inicial:10000, stake_base:1000 },
  { id:"agr_normal",   nome:"Agressivo Normal",      score_compra:38, score_venda:22, bull_pct_min:39, sl_pct:5.0, tp_pct:15.0, aguardar_ok:true, apenas_aguardar:false, capital_inicial:10000, stake_base:1000 },
  { id:"agr_pro",      nome:"Agressivo PRO",         score_compra:35, score_venda:20, bull_pct_min:37, sl_pct:7.0, tp_pct:20.0, aguardar_ok:true, apenas_aguardar:false, capital_inicial:10000, stake_base:1000 },
  { id:"agr_promax",   nome:"Agressivo PRO MAX",     score_compra:32, score_venda:18, bull_pct_min:35, sl_pct:8.0, tp_pct:25.0, aguardar_ok:true, apenas_aguardar:false, capital_inicial:10000, stake_base:1000 },
  { id:"cons_alav",    nome:"Conservador Alavancado",score_compra:55, score_venda:35, bull_pct_min:53, sl_pct:2.0, tp_pct:5.0,  aguardar_ok:true, apenas_aguardar:false, capital_inicial:100000, stake_base:5000, stake_dupla_score:75 },
  { id:"mod_alav",     nome:"Moderado Alavancado",   score_compra:50, score_venda:32, bull_pct_min:49, sl_pct:2.5, tp_pct:6.0,  aguardar_ok:true, apenas_aguardar:false, capital_inicial:100000, stake_base:5000, stake_dupla_score:70 },
  { id:"agr_alav",     nome:"Agressivo Alavancado",  score_compra:45, score_venda:28, bull_pct_min:44, sl_pct:3.0, tp_pct:7.0,  aguardar_ok:true, apenas_aguardar:false, capital_inicial:100000, stake_base:5000, stake_dupla_score:65 },
  { id:"sub_cons",     nome:"Subida Normal",         score_compra:35, score_venda:22, bull_pct_min:45, sl_pct:2.0, tp_pct:18.0, aguardar_ok:true, apenas_aguardar:false, capital_inicial:100000, stake_base:500,  score_max_compra:79 },
  { id:"sub_mod",      nome:"Subida PRO",            score_compra:30, score_venda:18, bull_pct_min:42, sl_pct:2.5, tp_pct:20.0, aguardar_ok:true, apenas_aguardar:false, capital_inicial:100000, stake_base:500,  score_max_compra:79 },
  { id:"sub_agr",      nome:"Subida PRO MAX",        score_compra:25, score_venda:15, bull_pct_min:39, sl_pct:3.0, tp_pct:25.0, aguardar_ok:true, apenas_aguardar:false, capital_inicial:100000, stake_base:500,  score_max_compra:79 },
  { id:"sub_alav",     nome:"Subida Alavancado",     score_compra:32, score_venda:20, bull_pct_min:43, sl_pct:2.0, tp_pct:25.0, aguardar_ok:true, apenas_aguardar:false, capital_inicial:100000, stake_base:500,  score_max_compra:79, stake_dupla_score:60 },
];

// ── Types ─────────────────────────────────────────────────────────────────────

interface Perfil {
  id: string; nome: string;
  score_compra: number; score_venda: number; bull_pct_min: number;
  sl_pct: number; tp_pct: number;
  capital_inicial: number; stake_base: number;
  aguardar_ok: boolean; apenas_aguardar: boolean;
  score_max_compra?: number | null; stake_dupla_score?: number | null;
}

interface Metricas {
  total_trades: number; wins: number; losses: number;
  win_rate: number; profit_factor: number;
  max_drawdown: number; retorno_total: number;
  expectancia: number; payoff: number;
  recovery_factor: number; sharpe: number; sortino: number;
  gross_profit: number; gross_loss: number;
  avg_ganho: number; avg_perda: number;
  capital_inicial: number; capital_final: number; cagr: number;
}

interface Trade {
  simbolo: string;
  entrada_ts: number; saida_ts: number;
  entrada_preco: number; saida_preco: number;
  stake: number; pnl: number; pnl_pct: number;
  motivo: string; resultado: "ganho" | "perda";
  capital_after: number;
}

interface EquityPoint { ts: number; capital: number; }

interface BacktestResult {
  id: string; simbolo: string;
  perfil_id: string; perfil_nome: string;
  periodo: { inicio: string; fim: string; dias: number };
  config: { custo_pct: number; slippage_pct: number };
  metricas: Metricas;
  equity: EquityPoint[];
  trades: Trade[];
  overfitting: {
    score_confianca: number; alertas: string[];
    treino: Metricas; teste: Metricas;
  };
  gerado_em: string;
}

interface Candidate {
  id: string; status: string; criado_em: string;
  perfil_candidato: Perfil; hipotese: string;
  alteracoes: { campo: string; de: number; para: number; motivo?: string }[];
  metricas_esperadas: Record<string, number>;
  confianca: number; riscos: string[];
  geração: number; base_perfil_id: string;
}

// ── Utilitários visuais ───────────────────────────────────────────────────────

function pct(v: number, decimals = 2) {
  return `${v >= 0 ? "+" : ""}${v.toFixed(decimals)}%`;
}
function brl(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtTs(ms: number) {
  return new Date(ms).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}
function scoreColor(v: number) {
  if (v >= 80) return "#22C55E";
  if (v >= 65) return "#3B82F6";
  if (v >= 50) return "#F59E0B";
  if (v >= 35) return "#F97316";
  return "#EF4444";
}
function confiancaLabel(n: number) {
  if (n >= 80) return { label: "Alta", color: "#22C55E" };
  if (n >= 60) return { label: "Média", color: "#F59E0B" };
  return { label: "Baixa", color: "#EF4444" };
}

// ── Gráfico de Equity SVG ─────────────────────────────────────────────────────

function EquityChart({ equity, height = 160 }: { equity: EquityPoint[]; height?: number }) {
  if (equity.length < 2) return null;

  const W = 100; // percentual
  const H = height;
  const pad = { t: 8, r: 4, b: 20, l: 0 };
  const w = W - pad.l - pad.r;
  const h = H - pad.t - pad.b;

  const vals = equity.map(p => p.capital);
  const min  = Math.min(...vals);
  const max  = Math.max(...vals);
  const span = Math.max(max - min, 1);

  const pts = equity.map((p, i) => {
    const x = pad.l + (i / (equity.length - 1)) * w;
    const y = pad.t + h - ((p.capital - min) / span) * h;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });

  const last  = equity[equity.length - 1].capital;
  const first = equity[0].capital;
  const up    = last >= first;
  const color = up ? "#22C55E" : "#EF4444";

  // Polígono para fill
  const fillPts = `${pts[0]} ${pts.join(" ")} ${pad.l + w},${pad.t + h} ${pad.l},${pad.t + h}`;

  return (
    <svg viewBox={`0 0 100 ${H}`} preserveAspectRatio="none" style={{ width: "100%", height: H, display: "block" }}>
      <defs>
        <linearGradient id="eq-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <polygon points={fillPts} fill="url(#eq-grad)" />
      <polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth="0.6" />
      {/* Linha de referência */}
      {(() => {
        const yRef = pad.t + h - ((first - min) / span) * h;
        return <line x1={pad.l} y1={yRef} x2={pad.l + w} y2={yRef}
          stroke="rgba(255,255,255,0.1)" strokeWidth="0.3" strokeDasharray="1,1" />;
      })()}
    </svg>
  );
}

// ── Cartão de Métrica ─────────────────────────────────────────────────────────

function MetricCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div
      className="rounded-xl p-4 flex flex-col gap-1"
      style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
    >
      <span className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>{label}</span>
      <span className="text-xl font-bold tabular-nums" style={{ color: color ?? "var(--text-primary)" }}>
        {value}
      </span>
      {sub && <span className="text-xs" style={{ color: "var(--text-muted)" }}>{sub}</span>}
    </div>
  );
}

// ── Heatmap mensal ────────────────────────────────────────────────────────────

function MonthlyHeatmap({ trades }: { trades: Trade[] }) {
  const byMonth: Record<string, { pnl: number; trades: number }> = {};
  for (const t of trades) {
    const d   = new Date(t.saida_ts);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (!byMonth[key]) byMonth[key] = { pnl: 0, trades: 0 };
    byMonth[key].pnl    += t.pnl;
    byMonth[key].trades += 1;
  }
  const entries = Object.entries(byMonth).sort(([a], [b]) => a.localeCompare(b));
  if (!entries.length) return null;

  const maxAbs = Math.max(...entries.map(([, v]) => Math.abs(v.pnl)), 1);

  return (
    <div>
      <p className="text-xs font-semibold mb-2" style={{ color: "var(--text-muted)" }}>
        DESEMPENHO MENSAL
      </p>
      <div className="flex flex-wrap gap-1.5">
        {entries.map(([key, v]) => {
          const [year, month] = key.split("-");
          const MESES = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
          const label = `${MESES[+month - 1]}/${year.slice(2)}`;
          const intensity = Math.abs(v.pnl) / maxAbs;
          const bg = v.pnl >= 0
            ? `rgba(34,197,94,${0.1 + intensity * 0.55})`
            : `rgba(239,68,68,${0.1 + intensity * 0.55})`;
          return (
            <div
              key={key}
              title={`${label}: ${brl(v.pnl)} em ${v.trades} ops`}
              className="rounded-lg px-2 py-1.5 text-center cursor-default"
              style={{ background: bg, border: "1px solid rgba(255,255,255,0.06)", minWidth: 52 }}
            >
              <p className="text-[10px] font-medium" style={{ color: "var(--text-secondary)" }}>{label}</p>
              <p className="text-[11px] font-bold tabular-nums" style={{ color: v.pnl >= 0 ? "#22C55E" : "#EF4444" }}>
                {pct(v.pnl / (v.trades * 1000) * 100, 1)}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Painel de Resultados ──────────────────────────────────────────────────────

function ResultPanel({ result, onClose }: { result: BacktestResult; onClose?: () => void }) {
  const [showTrades, setShowTrades] = useState(false);
  const m = result.metricas;
  const of = result.overfitting;

  return (
    <div className="fade-in flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>
              {result.simbolo.replace("USDT", "")} — {result.perfil_nome}
            </span>
            <span className="badge badge-muted text-[11px]">
              {result.periodo.inicio} → {result.periodo.fim}
            </span>
            <span className="badge badge-muted text-[11px]">{result.periodo.dias} dias</span>
          </div>
          <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
            Custo: {result.config.custo_pct}% · Slippage: {result.config.slippage_pct}%
          </p>
        </div>
        {onClose && (
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-white/5 transition-colors"
            style={{ color: "var(--text-muted)" }}>
            <X size={16} />
          </button>
        )}
      </div>

      {/* Equity curve */}
      <div className="rounded-xl overflow-hidden" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
        <div className="px-4 pt-3 pb-1 flex items-center justify-between">
          <span className="text-xs font-semibold" style={{ color: "var(--text-muted)" }}>CURVA DE CAPITAL</span>
          <span className="text-sm font-bold tabular-nums" style={{ color: m.retorno_total >= 0 ? "#22C55E" : "#EF4444" }}>
            {brl(m.capital_inicial)} → {brl(m.capital_final)} ({pct(m.retorno_total)})
          </span>
        </div>
        <EquityChart equity={result.equity} height={160} />
      </div>

      {/* Métricas principais */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <MetricCard label="Retorno Total" value={pct(m.retorno_total)}
          color={m.retorno_total >= 0 ? "#22C55E" : "#EF4444"} sub={`CAGR ${pct(m.cagr)}`} />
        <MetricCard label="Win Rate" value={`${m.win_rate}%`}
          color={m.win_rate >= 55 ? "#22C55E" : m.win_rate >= 45 ? "#F59E0B" : "#EF4444"}
          sub={`${m.wins}G / ${m.losses}P`} />
        <MetricCard label="Profit Factor" value={m.profit_factor.toFixed(2)}
          color={m.profit_factor >= 1.5 ? "#22C55E" : m.profit_factor >= 1 ? "#F59E0B" : "#EF4444"} />
        <MetricCard label="Max Drawdown" value={`-${m.max_drawdown.toFixed(2)}%`}
          color={m.max_drawdown <= 10 ? "#22C55E" : m.max_drawdown <= 20 ? "#F59E0B" : "#EF4444"} />
        <MetricCard label="Sharpe" value={m.sharpe.toFixed(2)}
          color={m.sharpe >= 1.5 ? "#22C55E" : m.sharpe >= 0.5 ? "#F59E0B" : "#EF4444"} />
        <MetricCard label="Operações" value={String(m.total_trades)}
          sub={`Exp. ${brl(m.expectancia)}`} />
      </div>

      {/* Métricas secundárias */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetricCard label="Payoff"          value={m.payoff.toFixed(2)} />
        <MetricCard label="Recovery Factor" value={m.recovery_factor.toFixed(2)} />
        <MetricCard label="Sortino"         value={m.sortino.toFixed(2)} />
        <MetricCard label="Média Ganho/Perda" value={`${brl(m.avg_ganho)} / ${brl(m.avg_perda)}`} />
      </div>

      {/* Heatmap mensal */}
      <MonthlyHeatmap trades={result.trades} />

      {/* Overfitting */}
      {of && (
        <div className="rounded-xl p-4" style={{
          background: of.score_confianca >= 70
            ? "rgba(34,197,94,0.05)" : of.score_confianca >= 50
            ? "rgba(245,158,11,0.05)" : "rgba(239,68,68,0.05)",
          border: `1px solid ${of.score_confianca >= 70 ? "rgba(34,197,94,0.2)" : of.score_confianca >= 50 ? "rgba(245,158,11,0.2)" : "rgba(239,68,68,0.2)"}`,
        }}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
              Análise de Overfitting (70/30 split)
            </span>
            <span className="badge" style={{
              background: of.score_confianca >= 70 ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)",
              color: of.score_confianca >= 70 ? "#22C55E" : "#EF4444",
              border: `1px solid ${of.score_confianca >= 70 ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}`,
            }}>
              Confiança {of.score_confianca}/100
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs mb-3">
            {[
              ["Retorno Treino",  pct(of.treino?.retorno_total ?? 0)],
              ["Retorno Teste",   pct(of.teste?.retorno_total  ?? 0)],
              ["Win Rate Treino", `${of.treino?.win_rate ?? 0}%`],
              ["Win Rate Teste",  `${of.teste?.win_rate  ?? 0}%`],
            ].map(([l, v]) => (
              <div key={l} className="text-center">
                <p style={{ color: "var(--text-muted)" }}>{l}</p>
                <p className="font-bold mt-0.5" style={{ color: "var(--text-primary)" }}>{v}</p>
              </div>
            ))}
          </div>
          {of.alertas?.length > 0 && (
            <div className="flex flex-col gap-1">
              {of.alertas.map((a, i) => (
                <div key={i} className="flex items-start gap-2 text-xs">
                  <AlertTriangle size={12} style={{ color: "#F59E0B", flexShrink: 0, marginTop: 1 }} />
                  <span style={{ color: "var(--text-secondary)" }}>{a}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tabela de Trades */}
      <div>
        <button
          onClick={() => setShowTrades(v => !v)}
          className="flex items-center gap-2 text-sm font-semibold mb-3 transition-colors"
          style={{ color: "var(--text-secondary)" }}
        >
          {showTrades ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          {result.trades.length} Operações
        </button>
        {showTrades && (
          <div className="overflow-x-auto rounded-xl" style={{ border: "1px solid var(--border)" }}>
            <table className="w-full text-xs">
              <thead>
                <tr style={{ background: "var(--bg-elevated)", borderBottom: "1px solid var(--border)" }}>
                  {["Entrada", "Saída", "Entrada R$", "Saída R$", "PnL", "PnL%", "Motivo", "Capital"].map(h => (
                    <th key={h} className="px-3 py-2 text-left font-medium" style={{ color: "var(--text-muted)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.trades.slice(0, 200).map((t, i) => (
                  <tr key={i} style={{
                    borderBottom: "1px solid var(--border-subtle)",
                    background: t.resultado === "ganho" ? "rgba(34,197,94,0.03)" : "rgba(239,68,68,0.03)",
                  }}>
                    <td className="px-3 py-1.5 tabular-nums" style={{ color: "var(--text-secondary)" }}>{fmtTs(t.entrada_ts)}</td>
                    <td className="px-3 py-1.5 tabular-nums" style={{ color: "var(--text-secondary)" }}>{fmtTs(t.saida_ts)}</td>
                    <td className="px-3 py-1.5 tabular-nums" style={{ color: "var(--text-primary)" }}>{t.entrada_preco.toFixed(2)}</td>
                    <td className="px-3 py-1.5 tabular-nums" style={{ color: "var(--text-primary)" }}>{t.saida_preco.toFixed(2)}</td>
                    <td className="px-3 py-1.5 tabular-nums font-medium" style={{ color: t.pnl >= 0 ? "#22C55E" : "#EF4444" }}>
                      {brl(t.pnl)}
                    </td>
                    <td className="px-3 py-1.5 tabular-nums" style={{ color: t.pnl >= 0 ? "#22C55E" : "#EF4444" }}>
                      {pct(t.pnl_pct)}
                    </td>
                    <td className="px-3 py-1.5" style={{ color: "var(--text-muted)" }}>{t.motivo}</td>
                    <td className="px-3 py-1.5 tabular-nums" style={{ color: "var(--text-secondary)" }}>{brl(t.capital_after)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Card de Candidato IA ──────────────────────────────────────────────────────

function CandidateCard({
  candidate,
  onApprove, onReject, onRevise,
}: {
  candidate: Candidate;
  onApprove: (id: string) => void;
  onReject:  (id: string) => void;
  onRevise:  (id: string) => void;
}) {
  const { label: confLabel, color: confColor } = confiancaLabel(candidate.confianca);
  const p = candidate.perfil_candidato;

  return (
    <div className="rounded-xl p-5 flex flex-col gap-4 fade-in" style={{ background: "var(--bg-card)", border: "1px solid var(--primary-border)" }}>
      {/* Header candidato */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Brain size={15} style={{ color: "var(--primary)" }} />
            <span className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>
              Geração {candidate.geração} — {p?.nome ?? "Sem nome"}
            </span>
            <span className="badge badge-primary text-[10px]">PENDENTE APROVAÇÃO</span>
          </div>
          <p className="text-xs mt-1.5 leading-relaxed" style={{ color: "var(--text-secondary)" }}>
            {candidate.hipotese}
          </p>
        </div>
        <div className="text-center shrink-0">
          <div className="text-lg font-bold tabular-nums" style={{ color: confColor }}>
            {candidate.confianca}%
          </div>
          <div className="text-[10px] font-medium" style={{ color: confColor }}>{confLabel}</div>
        </div>
      </div>

      {/* Alterações propostas */}
      {candidate.alteracoes?.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold mb-2" style={{ color: "var(--text-muted)" }}>ALTERAÇÕES PROPOSTAS</p>
          <div className="flex flex-col gap-1.5">
            {candidate.alteracoes.map((a, i) => (
              <div key={i} className="flex items-center justify-between text-xs rounded-lg px-3 py-2"
                style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}>
                <span className="font-mono font-medium" style={{ color: "var(--text-primary)" }}>{a.campo}</span>
                <div className="flex items-center gap-2">
                  <span style={{ color: "var(--text-muted)" }}>{a.de}</span>
                  <span style={{ color: "var(--text-muted)" }}>→</span>
                  <span className="font-bold" style={{ color: a.para > a.de ? "#22C55E" : "#EF4444" }}>{a.para}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Parâmetros do novo perfil */}
      {p && (
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
          {[
            ["Score Entrada", p.score_compra],
            ["Score Saída",   p.score_venda],
            ["Bull% Min",     p.bull_pct_min],
            ["SL%",           p.sl_pct],
            ["TP%",           p.tp_pct],
            ["R:R",           (p.tp_pct / p.sl_pct).toFixed(1)],
          ].map(([l, v]) => (
            <div key={l} className="text-center rounded-lg p-2"
              style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}>
              <p className="text-[9px] font-medium mb-1" style={{ color: "var(--text-muted)" }}>{l}</p>
              <p className="text-sm font-bold tabular-nums" style={{ color: "var(--text-primary)" }}>{v}</p>
            </div>
          ))}
        </div>
      )}

      {/* Riscos */}
      {candidate.riscos?.length > 0 && (
        <div className="flex flex-col gap-1">
          {candidate.riscos.map((r, i) => (
            <div key={i} className="flex items-start gap-2 text-xs">
              <AlertTriangle size={11} style={{ color: "#F59E0B", flexShrink: 0, marginTop: 1 }} />
              <span style={{ color: "var(--text-secondary)" }}>{r}</span>
            </div>
          ))}
        </div>
      )}

      {/* Ações */}
      <div className="flex gap-2 pt-1">
        <button onClick={() => onApprove(candidate.id)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all duration-150 flex-1 justify-center"
          style={{ background: "rgba(34,197,94,0.15)", color: "#22C55E", border: "1px solid rgba(34,197,94,0.3)" }}>
          <Check size={13} /> Aprovar
        </button>
        <button onClick={() => onRevise(candidate.id)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all duration-150 flex-1 justify-center"
          style={{ background: "var(--primary-glow)", color: "var(--primary)", border: "1px solid var(--primary-border)" }}>
          <RefreshCw size={13} /> Nova Variação
        </button>
        <button onClick={() => onReject(candidate.id)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all duration-150 flex-1 justify-center"
          style={{ background: "rgba(239,68,68,0.1)", color: "#EF4444", border: "1px solid rgba(239,68,68,0.25)" }}>
          <X size={13} /> Rejeitar
        </button>
      </div>
    </div>
  );
}

// ── Bloco de Análise IA (evita IIFEs com unknown) ────────────────────────────

interface AIData { [key: string]: unknown }

function AiAnalysisBlock({ analysis }: { analysis: AIData }) {
  const ia = analysis?.analise_ia as AIData | null;
  const local = analysis?.analise_local as AIData | null;

  return (
    <>
      {ia && (
        <div className="flex flex-col gap-4">
          {typeof ia.resumo_executivo === "string" && (
            <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              {ia.resumo_executivo}
            </p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {(["pontos_fortes","pontos_fracos","oportunidades","riscos"] as const).map(key => {
              const colors: Record<string, string> = {
                pontos_fortes: "#22C55E", pontos_fracos: "#EF4444",
                oportunidades: "#3B82F6", riscos: "#F59E0B",
              };
              const labels: Record<string, string> = {
                pontos_fortes: "Pontos Fortes", pontos_fracos: "Pontos Fracos",
                oportunidades: "Oportunidades", riscos: "Riscos",
              };
              const items = Array.isArray(ia[key]) ? (ia[key] as string[]) : [];
              if (!items.length) return null;
              const color = colors[key];
              return (
                <div key={key} className="rounded-xl p-4"
                  style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}>
                  <p className="text-xs font-semibold mb-2" style={{ color }}>{labels[key].toUpperCase()}</p>
                  <ul className="flex flex-col gap-1.5">
                    {items.map((item, i) => (
                      <li key={i} className="text-xs flex items-start gap-2" style={{ color: "var(--text-secondary)" }}>
                        <span style={{ color, flexShrink: 0 }}>•</span>{item}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
          {typeof ia.recomendacao === "string" && (
            <div className="flex items-center gap-3 p-4 rounded-xl"
              style={{ background: "var(--primary-glow)", border: "1px solid var(--primary-border)" }}>
              <Sparkles size={16} style={{ color: "var(--primary)", flexShrink: 0 }} />
              <div>
                <p className="text-xs font-bold mb-0.5" style={{ color: "var(--primary)" }}>
                  RECOMENDAÇÃO: {ia.recomendacao}
                </p>
                <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                  {typeof ia.justificativa_recomendacao === "string" ? ia.justificativa_recomendacao : ""}
                </p>
              </div>
            </div>
          )}
        </div>
      )}
      {local && Array.isArray(local.padroes) && local.padroes.length > 0 && (
        <div>
          <p className="text-xs font-semibold mb-2" style={{ color: "var(--text-muted)" }}>PADRÕES ESTATÍSTICOS</p>
          <div className="flex flex-col gap-1.5">
            {(local.padroes as string[]).map((p, i) => (
              <div key={i} className="text-xs flex items-start gap-2">
                <Clock size={11} style={{ color: "var(--accent)", flexShrink: 0, marginTop: 2 }} />
                <span style={{ color: "var(--text-secondary)" }}>{p}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

// ── Página Principal ──────────────────────────────────────────────────────────

export default function BacktestPage() {
  // ── Config ──────────────────────────────────────────────────────────────────
  const [simbolo,    setSimboloS]  = useState("BTCUSDT");
  const [dateInicio, setDateInicio] = useState(() => daysAgoStr(365));
  const [dateFim,    setDateFim]   = useState(() => todayStr());
  const [capital,    setCapital]   = useState(10000);
  const [stakeBase,  setStakeBase] = useState(1000);
  const [custoPct,   setCustoPct]  = useState(0.04);

  // ── Perfis ──────────────────────────────────────────────────────────────────
  const [perfis, setPerfis] = useState<{ builtin: Perfil[]; custom: Perfil[] }>({
    builtin: PERFIS_FALLBACK, custom: [],
  });
  useEffect(() => {
    fetch(`${API}/cripto/backtest/profiles`)
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(d => { if (d?.builtin?.length > 0) setPerfis(d); })
      .catch(() => {});
  }, []);

  // ── Execução ────────────────────────────────────────────────────────────────
  const [running,   setRunning]  = useState(false);
  const [progress,  setProgress] = useState<{ current: number; total: number; nome: string } | null>(null);
  const [allResults, setAllResults] = useState<BacktestResult[]>([]);
  const [expanded,  setExpanded] = useState<string | null>(null);
  const [erro,      setErro]     = useState("");

  // ── Gerador IA ──────────────────────────────────────────────────────────────
  const [gerandoPerfil, setGerandoPerfil] = useState(false);
  const [candidates,    setCandidates]    = useState<Candidate[]>([]);
  const [aiAnalysis,    setAiAnalysis]    = useState<Record<string, unknown> | null>(null);
  const [analyzing,     setAnalyzing]     = useState(false);

  const diasPeriodo = dateInicio && dateFim
    ? Math.round((new Date(dateFim).getTime() - new Date(dateInicio).getTime()) / 86_400_000)
    : 0;

  const allPerfis = [...(perfis.builtin ?? []), ...(perfis.custom ?? [])];

  // Roda backtest para TODOS os perfis sequencialmente
  async function runAllBacktests() {
    if (!dateInicio || !dateFim || dateInicio >= dateFim) {
      setErro("Selecione um período válido");
      return;
    }
    setRunning(true);
    setErro("");
    setAllResults([]);
    setExpanded(null);

    const results: BacktestResult[] = [];
    for (let i = 0; i < allPerfis.length; i++) {
      const p = allPerfis[i];
      setProgress({ current: i + 1, total: allPerfis.length, nome: p.nome });
      try {
        const r = await fetch(`${API}/cripto/backtest/run`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            simbolo,
            perfil_id:    p.id,
            data_inicio:  dateInicio,
            data_fim:     dateFim,
            capital,
            custo_pct:    custoPct,
            slippage_pct: 0.05,
          }),
        });
        if (r.ok) {
          const data: BacktestResult = await r.json();
          results.push(data);
          setAllResults([...results]);
        }
      } catch { /* continua pro próximo */ }
    }
    setRunning(false);
    setProgress(null);
  }

  // Gerar candidato IA a partir dos melhores resultados
  async function gerarPerfilIA() {
    if (allResults.length === 0) return;
    setGerandoPerfil(true);
    try {
      // Usa os 3 melhores resultados por retorno
      const best = [...allResults]
        .sort((a, b) => b.metricas.retorno_total - a.metricas.retorno_total)
        .slice(0, 3);
      const ids = best.map(r => r.id).filter(Boolean);
      const r = await fetch(`${API}/cripto/backtest/ai/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          perfil_id: best[0].perfil_id,
          result_ids: ids,
          geracao: 1,
        }),
      });
      if (!r.ok) throw new Error();
      const d: Candidate = await r.json();
      setCandidates(prev => [d, ...prev]);
    } catch {
      setErro("Erro ao gerar perfil IA");
    } finally {
      setGerandoPerfil(false);
    }
  }

  // Análise IA dos resultados
  async function analisarIA() {
    if (allResults.length === 0) return;
    setAnalyzing(true);
    try {
      const ids = allResults.map(r => r.id).filter(Boolean);
      const r = await fetch(`${API}/cripto/backtest/ai/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ result_ids: ids }),
      });
      const d = await r.json();
      setAiAnalysis(d);
    } catch {
      setErro("Erro na análise IA");
    } finally {
      setAnalyzing(false);
    }
  }

  async function approveCandidate(cid: string) {
    try {
      await fetch(`${API}/cripto/backtest/candidates/${cid}/approve`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nota: "Aprovado pelo usuário" }),
      });
      setCandidates(prev => prev.filter(c => c.id !== cid));
      fetch(`${API}/cripto/backtest/profiles`).then(r => r.json()).then(d => { if (d?.builtin) setPerfis(d); });
    } catch { setErro("Erro ao aprovar"); }
  }
  async function rejectCandidate(cid: string) {
    try {
      await fetch(`${API}/cripto/backtest/candidates/${cid}/reject`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nota: "Rejeitado" }),
      });
      setCandidates(prev => prev.filter(c => c.id !== cid));
    } catch { setErro("Erro ao rejeitar"); }
  }
  async function reviseCandidate(cid: string) {
    try {
      const best = [...allResults].sort((a, b) => b.metricas.retorno_total - a.metricas.retorno_total).slice(0, 2);
      const r = await fetch(`${API}/cripto/backtest/candidates/${cid}/revise`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ perfil_id: best[0]?.perfil_id ?? "cons_normal", result_ids: best.map(x => x.id), geracao: 1 }),
      });
      const d = await r.json();
      setCandidates(prev => [d, ...prev.filter(c => c.id !== cid)]);
    } catch { setErro("Erro ao revisar"); }
  }

  // Ordenação dos resultados
  const [sortBy, setSortBy] = useState<"retorno" | "entradas" | "winrate" | "pf">("entradas");

  const sortedResults = [...allResults].sort((a, b) => {
    const ma = a.metricas, mb = b.metricas;
    if (sortBy === "entradas") return mb.total_trades - ma.total_trades;
    if (sortBy === "winrate")  return mb.win_rate - ma.win_rate;
    if (sortBy === "pf")       return mb.profit_factor - ma.profit_factor;
    return mb.retorno_total - ma.retorno_total;
  });
  const expandedResult = expanded ? allResults.find(r => r.perfil_id === expanded) ?? null : null;
  const maxTrades = Math.max(...allResults.map(r => r.metricas.total_trades), 1);

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 flex flex-col gap-6">

      {/* ── Título ─────────────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-bold" style={{
          fontFamily: "var(--font-sora, system-ui)",
          background: "linear-gradient(135deg, var(--primary), var(--accent))",
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
        }}>
          Backtest Inteligente
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
          Escolha o ativo, período e parâmetros — a IA roda todos os perfis e te mostra qual é o melhor
        </p>
      </div>

      {/* ── Erro ───────────────────────────────────────────────────────────── */}
      {erro && (
        <div className="px-4 py-3 rounded-xl flex items-center gap-2 text-sm"
          style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)", color: "#EF4444" }}>
          <AlertTriangle size={14} />
          {erro}
          <button onClick={() => setErro("")} className="ml-auto"><X size={13} /></button>
        </div>
      )}

      {/* ── Painel de Configuração ─────────────────────────────────────────── */}
      <div className="rounded-2xl p-5 flex flex-col gap-5"
        style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>

        {/* Ativo */}
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider mb-3" style={{ color: "var(--text-muted)" }}>Ativo</p>
          <div className="grid grid-cols-5 sm:grid-cols-10 lg:grid-cols-19 gap-2">
            {SIMBOLOS.map(s => {
              const sym = s.replace("USDT", "");
              const active = simbolo === s;
              return (
                <button key={s} onClick={() => setSimboloS(s)}
                  className="py-2 rounded-xl text-xs font-bold transition-all duration-150"
                  style={{
                    background: active ? "var(--primary-glow)" : "var(--bg-surface)",
                    color: active ? "var(--primary)" : "var(--text-secondary)",
                    border: active ? "1px solid var(--primary-border)" : "1px solid var(--border)",
                  }}>
                  {sym}
                </button>
              );
            })}
          </div>
        </div>

        {/* Período + Parâmetros */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

          {/* Período */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider mb-3" style={{ color: "var(--text-muted)" }}>Período</p>
            <div className="flex gap-2 flex-wrap mb-3">
              {PERIODOS.map(p => (
                <button key={p.dias} onClick={() => { setDateFim(todayStr()); setDateInicio(daysAgoStr(p.dias)); }}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                  style={{
                    background: diasPeriodo === p.dias ? "var(--primary-glow)" : "var(--bg-surface)",
                    color: diasPeriodo === p.dias ? "var(--primary)" : "var(--text-secondary)",
                    border: diasPeriodo === p.dias ? "1px solid var(--primary-border)" : "1px solid var(--border)",
                  }}>
                  {p.label}
                </button>
              ))}
              <button onClick={() => { setDateFim(todayStr()); setDateInicio(daysAgoStr(365 * 5)); }}
                className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                style={{
                  background: diasPeriodo >= 365 * 4 ? "var(--primary-glow)" : "var(--bg-surface)",
                  color: diasPeriodo >= 365 * 4 ? "var(--primary)" : "var(--text-secondary)",
                  border: diasPeriodo >= 365 * 4 ? "1px solid var(--primary-border)" : "1px solid var(--border)",
                }}>
                5 anos
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Início", val: dateInicio, set: setDateInicio, max: dateFim || todayStr(), min: undefined },
                { label: "Fim",    val: dateFim,    set: setDateFim,    max: todayStr(),             min: dateInicio || undefined },
              ].map(({ label, val, set, max, min }) => (
                <div key={label}>
                  <label className="block text-[11px] font-medium mb-1" style={{ color: "var(--text-muted)" }}>{label}</label>
                  <input type="date" value={val} max={max} min={min}
                    onChange={e => set(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg text-sm"
                    style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", color: "var(--text-primary)", colorScheme: "dark" }} />
                </div>
              ))}
            </div>
            {diasPeriodo > 0 && (
              <p className="text-xs mt-2" style={{ color: "var(--text-muted)" }}>
                {diasPeriodo} dias corridos · {dateInicio} → {dateFim}
              </p>
            )}
          </div>

          {/* Parâmetros + Botão */}
          <div className="flex flex-col gap-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider mb-3" style={{ color: "var(--text-muted)" }}>Parâmetros</p>
              <div className="flex flex-col gap-3">
                {[
                  { label: "Banca (R$)",        val: capital,   set: setCapital,   min: 1000,  max: 1_000_000, step: 1000,  fmt: (v: number) => v.toLocaleString("pt-BR") },
                  { label: "Stake por entrada (R$)", val: stakeBase, set: setStakeBase, min: 100, max: 50_000,   step: 100,   fmt: (v: number) => v.toLocaleString("pt-BR") },
                  { label: "Corretagem (%)",     val: custoPct, set: setCustoPct,  min: 0,     max: 0.5,       step: 0.01,  fmt: (v: number) => v.toFixed(2) },
                ].map(({ label, val, set, min, max, step, fmt }) => (
                  <div key={label}>
                    <div className="flex justify-between text-xs mb-1">
                      <span style={{ color: "var(--text-secondary)" }}>{label}</span>
                      <span className="font-bold tabular-nums" style={{ color: "var(--text-primary)" }}>{fmt(val)}</span>
                    </div>
                    <input type="range" min={min} max={max} step={step} value={val}
                      onChange={e => set(+e.target.value)} className="w-full accent-blue-500" />
                  </div>
                ))}
              </div>
            </div>

            <button
              onClick={runAllBacktests}
              disabled={running}
              className="w-full flex items-center justify-center gap-2 py-4 rounded-xl text-sm font-black transition-all"
              style={{
                background: running
                  ? "rgba(59,130,246,0.2)"
                  : "linear-gradient(135deg, #3B82F6, #06B6D4)",
                color: "#ffffff",
                cursor: running ? "not-allowed" : "pointer",
                boxShadow: running ? "none" : "0 0 24px rgba(59,130,246,0.4)",
                opacity: running ? 0.7 : 1,
              }}>
              {running && progress ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Rodando perfil {progress.current}/{progress.total} — {progress.nome}
                </>
              ) : (
                <>
                  <Play size={16} />
                  Rodar para todos os Perfis ({allPerfis.length})
                </>
              )}
            </button>

            {/* Barra de progresso */}
            {running && progress && (
              <div>
                <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: "var(--border)" }}>
                  <div className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${(progress.current / progress.total) * 100}%`,
                      background: "linear-gradient(90deg, #3B82F6, #06B6D4)",
                    }} />
                </div>
                <p className="text-[10px] mt-1 text-center" style={{ color: "var(--text-muted)" }}>
                  {progress.current} de {progress.total} perfis concluídos
                  {allResults.length > 0 && ` · ${allResults.length} resultado(s) disponível(is)`}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Resultados — todos os perfis ──────────────────────────────────── */}
      {allResults.length > 0 && (
        <div className="flex flex-col gap-4">
          {/* Header + Sort */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-base font-bold" style={{ color: "var(--text-primary)" }}>
                Resultados — {simbolo.replace("USDT", "")} · {diasPeriodo}d
              </h2>
              <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                {sortedResults.length} perfis · clique no card para ver detalhes completos
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {running && progress && (
                <span className="text-xs px-3 py-1.5 rounded-full animate-pulse"
                  style={{ background: "rgba(59,130,246,0.15)", color: "#3B82F6", border: "1px solid rgba(59,130,246,0.3)" }}>
                  {progress.current}/{progress.total} perfis...
                </span>
              )}
              <div className="flex items-center gap-1 p-1 rounded-xl" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
                {([
                  { key: "entradas", label: "↑ Entradas" },
                  { key: "retorno",  label: "↑ Retorno" },
                  { key: "winrate",  label: "↑ Win Rate" },
                  { key: "pf",       label: "↑ P.Factor" },
                ] as const).map(({ key, label }) => (
                  <button key={key} onClick={() => setSortBy(key)}
                    className="px-3 py-1 rounded-lg text-[11px] font-semibold transition-all"
                    style={{
                      background: sortBy === key ? "var(--primary-glow)" : "transparent",
                      color: sortBy === key ? "var(--primary)" : "var(--text-muted)",
                      border: sortBy === key ? "1px solid var(--primary-border)" : "1px solid transparent",
                    }}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Grid de perfis */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {sortedResults.map((r, rank) => {
              const m = r.metricas;
              const isExpanded  = expanded === r.perfil_id;
              const retColor    = m.retorno_total >= 0 ? "#22C55E" : "#EF4444";
              const tradesPerDay  = diasPeriodo > 0 ? m.total_trades / diasPeriodo : 0;
              const tradesPerWeek = tradesPerDay * 7;
              const freqColor   = tradesPerDay >= 2 ? "#22C55E" : tradesPerDay >= 0.5 ? "#F59E0B" : "#EF4444";
              const freqPct     = Math.min((m.total_trades / maxTrades) * 100, 100);
              const rankColors  = ["#F59E0B", "#94A3B8", "#CD7F32"];

              return (
                <button
                  key={r.perfil_id}
                  onClick={() => setExpanded(isExpanded ? null : r.perfil_id)}
                  className="rounded-xl p-0 overflow-hidden text-left transition-all duration-150"
                  style={{
                    background: "var(--bg-card)",
                    border: isExpanded
                      ? "2px solid var(--primary)"
                      : rank < 3
                      ? `1px solid ${rankColors[rank]}60`
                      : "1px solid var(--border)",
                    boxShadow: rank === 0 ? `0 0 16px ${rankColors[0]}20` : "none",
                  }}>

                  {/* Mini equity chart */}
                  <div style={{ height: 55, background: "var(--bg-surface)" }}>
                    <EquityChart equity={r.equity} height={55} />
                  </div>

                  <div className="p-3 flex flex-col gap-2.5">

                    {/* Rank + nome */}
                    <div className="flex items-center gap-2">
                      {rank < 3 && (
                        <span className="text-sm shrink-0">
                          {rank === 0 ? "🥇" : rank === 1 ? "🥈" : "🥉"}
                        </span>
                      )}
                      {rank >= 3 && (
                        <span className="text-[10px] font-black w-5 text-center shrink-0"
                          style={{ color: "var(--text-muted)" }}>#{rank + 1}</span>
                      )}
                      <span className="text-[11px] font-semibold leading-tight truncate" style={{ color: "var(--text-primary)" }}>
                        {r.perfil_nome}
                      </span>
                    </div>

                    {/* FREQUÊNCIA — destaque central */}
                    <div className="rounded-xl p-2.5 flex flex-col gap-1.5"
                      style={{ background: `${freqColor}10`, border: `1px solid ${freqColor}30` }}>
                      <div className="flex items-baseline justify-between">
                        <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: freqColor }}>
                          Frequência de Entradas
                        </span>
                        <span className="text-[9px]" style={{ color: "var(--text-muted)" }}>
                          {m.total_trades} total
                        </span>
                      </div>
                      <div className="flex items-end gap-3">
                        <div>
                          <span className="text-xl font-black tabular-nums" style={{ color: freqColor }}>
                            {tradesPerDay >= 1 ? tradesPerDay.toFixed(1) : (tradesPerDay * 7).toFixed(1)}
                          </span>
                          <span className="text-[10px] font-bold ml-1" style={{ color: freqColor }}>
                            /{tradesPerDay >= 1 ? "dia" : "sem"}
                          </span>
                        </div>
                        <span className="text-[10px] pb-0.5" style={{ color: "var(--text-muted)" }}>
                          ≈ {tradesPerWeek.toFixed(1)}/sem · {(tradesPerDay * 30).toFixed(0)}/mês
                        </span>
                      </div>
                      {/* Barra relativa */}
                      <div className="h-1 rounded-full overflow-hidden" style={{ background: "var(--border)" }}>
                        <div className="h-full rounded-full transition-all" style={{ width: `${freqPct}%`, background: freqColor }} />
                      </div>
                    </div>

                    {/* Retorno + métricas */}
                    <div className="grid grid-cols-2 gap-1.5">
                      <div className="rounded-lg p-2 text-center"
                        style={{ background: `${retColor}10`, border: `1px solid ${retColor}25` }}>
                        <div className="text-[8px] font-medium" style={{ color: "var(--text-muted)" }}>Retorno</div>
                        <div className="text-sm font-black tabular-nums" style={{ color: retColor }}>{pct(m.retorno_total)}</div>
                        <div className="text-[8px]" style={{ color: "var(--text-muted)" }}>{brl(m.capital_final)}</div>
                      </div>
                      <div className="rounded-lg p-2 text-center"
                        style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
                        <div className="text-[8px] font-medium" style={{ color: "var(--text-muted)" }}>Win Rate</div>
                        <div className="text-sm font-black" style={{ color: m.win_rate >= 55 ? "#22C55E" : m.win_rate >= 45 ? "#F59E0B" : "#EF4444" }}>{m.win_rate}%</div>
                        <div className="text-[8px]" style={{ color: "var(--text-muted)" }}>PF {m.profit_factor.toFixed(1)}</div>
                      </div>
                    </div>

                    <div className="flex justify-between text-[9px] px-0.5" style={{ color: "var(--text-muted)" }}>
                      <span>DD −{m.max_drawdown.toFixed(1)}%</span>
                      <span>Sharpe {m.sharpe.toFixed(1)}</span>
                      <span>CAGR {pct(m.cagr)}</span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Detalhe expandido */}
          {expandedResult && (
            <div className="rounded-2xl p-5 flex flex-col gap-5"
              style={{ background: "var(--bg-card)", border: "2px solid var(--primary-border)" }}>
              <ResultPanel result={expandedResult} onClose={() => setExpanded(null)} />
            </div>
          )}
        </div>
      )}

      {/* ── Gerador de Perfil IA ──────────────────────────────────────────── */}
      {allResults.length > 0 && (
        <div className="rounded-2xl p-6 flex flex-col gap-5"
          style={{
            background: "linear-gradient(135deg, rgba(139,92,246,0.06), rgba(59,130,246,0.04))",
            border: "1px solid rgba(139,92,246,0.3)",
          }}>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Brain size={18} style={{ color: "#8B5CF6" }} />
                <span className="font-bold text-base" style={{ color: "var(--text-primary)" }}>
                  Gerador de Perfil IA
                </span>
              </div>
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                A IA analisa todos os {allResults.length} resultados, identifica padrões de sucesso
                e cria um novo perfil com <strong style={{ color: "#8B5CF6" }}>mais entradas e mais lucro</strong>
              </p>
            </div>
            <div className="flex gap-2 flex-wrap">
              <button onClick={analisarIA} disabled={analyzing}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all"
                style={{
                  background: analyzing ? "rgba(59,130,246,0.1)" : "var(--primary-glow)",
                  color: "var(--primary)", border: "1px solid var(--primary-border)",
                  cursor: analyzing ? "not-allowed" : "pointer",
                }}>
                {analyzing ? <><Loader2 size={12} className="animate-spin" /> Analisando...</> : <><Sparkles size={12} /> Analisar Resultados</>}
              </button>
              <button onClick={gerarPerfilIA} disabled={gerandoPerfil}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black transition-all"
                style={{
                  background: gerandoPerfil
                    ? "rgba(139,92,246,0.1)"
                    : "linear-gradient(135deg, rgba(139,92,246,0.25), rgba(59,130,246,0.15))",
                  color: "#8B5CF6", border: "1px solid rgba(139,92,246,0.4)",
                  cursor: gerandoPerfil ? "not-allowed" : "pointer",
                }}>
                {gerandoPerfil
                  ? <><Loader2 size={12} className="animate-spin" /> Gerando perfil...</>
                  : <><Brain size={12} /> Gerar Perfil Otimizado</>}
              </button>
            </div>
          </div>

          {/* Resumo dos melhores */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {sortedResults.slice(0, 3).map((r, i) => (
              <div key={r.perfil_id} className="rounded-xl p-3 flex items-center gap-3"
                style={{
                  background: "var(--bg-card)", border: "1px solid var(--border)",
                  borderLeft: `3px solid ${i === 0 ? "#22C55E" : i === 1 ? "#3B82F6" : "#F59E0B"}`,
                }}>
                <span className="text-xs font-black" style={{ color: i === 0 ? "#22C55E" : i === 1 ? "#3B82F6" : "#F59E0B" }}>
                  {i === 0 ? "🥇" : i === 1 ? "🥈" : "🥉"}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] font-semibold truncate" style={{ color: "var(--text-primary)" }}>{r.perfil_nome}</div>
                  <div className="text-[9px]" style={{ color: "var(--text-muted)" }}>
                    {pct(r.metricas.retorno_total)} · WR {r.metricas.win_rate}% · {r.metricas.total_trades} ops
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Análise IA */}
          {aiAnalysis && (
            <div className="rounded-xl p-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
              <AiAnalysisBlock analysis={aiAnalysis} />
            </div>
          )}

          {/* Candidatos gerados */}
          {candidates.length > 0 && (
            <div className="flex flex-col gap-4">
              <p className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                Perfis Gerados pela IA ({candidates.length})
              </p>
              {candidates.map(c => (
                <CandidateCard
                  key={c.id}
                  candidate={c}
                  onApprove={approveCandidate}
                  onReject={rejectCandidate}
                  onRevise={reviseCandidate}
                />
              ))}
            </div>
          )}
        </div>
      )}

    </div>
  );
}
