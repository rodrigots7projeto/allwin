"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import {
  Zap, TrendingUp, TrendingDown, RefreshCw, Brain,
  Target, BarChart3, ChevronUp, ChevronDown, Activity,
  Lightbulb, CheckCircle, ArrowUpRight, ArrowDownRight,
  Clock, Star, Flame,
} from "lucide-react";
import { IAEngineHubNav } from "@/components/IAEngineHubNav";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";
const FUT_WALLET_KEY = "allwin_futures_wallets_v1";
const LEARNED_KEY = "allwin_sinais_learned_v1";

// ── Interfaces da scan ────────────────────────────────────────────────────────
interface FuturesItem {
  simbolo: string; preco: number;
  score_final: number; score_tecnico: number; score_fluxo: number;
  score_contexto: number; score_fundamental: number; ist: number;
  grade: "A+" | "A" | "B" | "C" | "NR";
  direction: "LONG" | "SHORT" | "NEUTRO";
  direction_confidence: number;
  operar: boolean; bullish: boolean;
  var24h?: number;
  oi_change_pct?: number; funding_rate?: number;
  cvd_bullish?: boolean; vwap_above?: boolean;
  bull_pct?: number; squeeze_type?: string | null;
}

interface FuturesScanData {
  geral: FuturesItem[]; top_long: FuturesItem[];
  top_short: FuturesItem[];
  total: number; atualizado: number; btc_dom?: number;
}

// ── Perfil de estratégia ──────────────────────────────────────────────────────
interface SubScoreFilter {
  tec_min?: number; tec_max?: number;
  flx_min?: number; flx_max?: number;
  ctx_min?: number; fnd_min?: number;
}

interface PerfilConfig {
  id: string; nome: string; nivel: string;
  emoji: string; cor: string;
  score_compra: number; score_max_compra?: number;
  bull_pct_min: number;
  sl_pct: number; tp_pct: number;
  direction_allowed: "LONG" | "SHORT" | "BOTH";
  grade_required?: string[];
  require_ist_min?: number;
  require_funding_neg?: boolean;
  require_oi_increase?: boolean;
  require_cvd_bullish?: boolean;
  long_filter?: SubScoreFilter;
  short_filter?: SubScoreFilter;
  descricao: string;
}

// Perfis estratégicos com melhor performance (baseado nos resultados observados)
const PERFIS_ESTRATEGICOS: PerfilConfig[] = [
  { id:"f_agr_promax", nome:"Agressivo", nivel:"PRO MAX", emoji:"⚡", cor:"#b45309",
    score_compra:42, bull_pct_min:37, sl_pct:0.017, tp_pct:0.05,
    direction_allowed:"BOTH",
    long_filter:  { tec_min:34, flx_min:31, ctx_min:31, fnd_min:14 },
    short_filter: { tec_max:73, flx_max:79, ctx_min:23, fnd_min:12 },
    descricao:"Alvo 5% · SL 1.7% · Ultra-agressivo" },
  { id:"f_agr_pro", nome:"Agressivo", nivel:"PRO", emoji:"⚡", cor:"#d97706",
    score_compra:45, bull_pct_min:39, sl_pct:0.015, tp_pct:0.04,
    direction_allowed:"BOTH",
    long_filter:  { tec_min:38, flx_min:35, ctx_min:35, fnd_min:17 },
    short_filter: { tec_max:67, flx_max:73, ctx_min:27, fnd_min:15 },
    descricao:"Alvo 4% · SL 1.5%" },
  { id:"f_agr_normal", nome:"Agressivo", nivel:"Normal", emoji:"⚡", cor:"#f59e0b",
    score_compra:48, bull_pct_min:41, sl_pct:0.013, tp_pct:0.035,
    direction_allowed:"BOTH",
    long_filter:  { tec_min:42, flx_min:38, ctx_min:38, fnd_min:20 },
    short_filter: { tec_max:62, flx_max:68, ctx_min:30, fnd_min:18 },
    descricao:"Alvo 3.5% · SL 1.3%" },
  { id:"f_mod_promax", nome:"Moderado", nivel:"PRO MAX", emoji:"⚖️", cor:"#6d28d9",
    score_compra:52, bull_pct_min:43, sl_pct:0.013, tp_pct:0.035,
    direction_allowed:"BOTH",
    long_filter:  { tec_min:46, flx_min:42, ctx_min:42, fnd_min:25 },
    short_filter: { tec_max:57, flx_max:63, ctx_min:36, fnd_min:22 },
    descricao:"Alvo 3.5% · SL 1.3%" },
  { id:"f_mod_pro", nome:"Moderado", nivel:"PRO", emoji:"⚖️", cor:"#7c3aed",
    score_compra:55, bull_pct_min:45, sl_pct:0.012, tp_pct:0.03,
    direction_allowed:"BOTH",
    long_filter:  { tec_min:50, flx_min:46, ctx_min:46, fnd_min:30 },
    short_filter: { tec_max:52, flx_max:58, ctx_min:40, fnd_min:27 },
    descricao:"Alvo 3% · SL 1.2%" },
  { id:"f_sub_agr", nome:"Subida", nivel:"PRO MAX", emoji:"📈", cor:"#15803d",
    score_compra:35, score_max_compra:79, bull_pct_min:45, sl_pct:0.015, tp_pct:0.05,
    direction_allowed:"LONG",
    long_filter:  { tec_min:22, flx_min:36, ctx_min:26, fnd_min:15 },
    descricao:"Subida antecipada · Alvo 5% · SL 1.5%" },
  { id:"f_short_mod", nome:"Short", nivel:"PRO", emoji:"📉", cor:"#dc2626",
    score_compra:60, bull_pct_min:35, sl_pct:0.010, tp_pct:0.025,
    direction_allowed:"SHORT",
    short_filter: { tec_max:44, flx_max:50, ctx_min:46, fnd_min:36 },
    descricao:"Short Moderado · Alvo 2.5% · SL 1%" },
  { id:"f_cons_promax", nome:"Conservador", nivel:"PRO MAX", emoji:"🛡️", cor:"#1d4ed8",
    score_compra:62, bull_pct_min:49, sl_pct:0.010, tp_pct:0.03,
    direction_allowed:"BOTH",
    grade_required:["A+","A","B"], require_ist_min:45,
    long_filter:  { tec_min:58, flx_min:53, ctx_min:53, fnd_min:40 },
    short_filter: { tec_max:44, flx_max:50, ctx_min:48, fnd_min:38 },
    descricao:"Alvo 3% · SL 1% · Grade A/A+/B" },
];

// ── Lógica de entrada ─────────────────────────────────────────────────────────
function podeEntrar(cfg: PerfilConfig, it: FuturesItem, learnedBoost: number = 0): "LONG" | "SHORT" | null {
  if (cfg.score_max_compra && it.score_final > cfg.score_max_compra) return null;

  let dir: "LONG" | "SHORT";
  if      (it.direction === "LONG")  dir = "LONG";
  else if (it.direction === "SHORT") dir = "SHORT";
  else {
    const bp = it.bull_pct ?? 50;
    if      (bp > 55) dir = "LONG";
    else if (bp < 45) dir = "SHORT";
    else return null;
  }

  if (cfg.direction_allowed !== "BOTH" && cfg.direction_allowed !== dir) return null;

  const bp = it.bull_pct ?? 50;
  if (dir === "LONG"  && bp < cfg.bull_pct_min) return null;
  if (dir === "SHORT" && bp > (100 - cfg.bull_pct_min)) return null;

  // Aplica boost de aprendizado no score mínimo (exige mais se IA detectou padrão ruim)
  const minScore = cfg.score_compra + learnedBoost;
  if (dir === "LONG"  && it.score_final < minScore) return null;
  if (dir === "SHORT" && it.score_final < cfg.score_compra) return null;

  const sf = dir === "LONG" ? cfg.long_filter : cfg.short_filter;
  if (sf) {
    if (sf.tec_min != null && it.score_tecnico     < sf.tec_min) return null;
    if (sf.tec_max != null && it.score_tecnico     > sf.tec_max) return null;
    if (sf.flx_min != null && it.score_fluxo       < sf.flx_min) return null;
    if (sf.flx_max != null && it.score_fluxo       > sf.flx_max) return null;
    if (sf.ctx_min != null && it.score_contexto    < sf.ctx_min) return null;
    if (sf.fnd_min != null && it.score_fundamental < sf.fnd_min) return null;
  }

  if (cfg.grade_required && !cfg.grade_required.includes(it.grade)) return null;
  if (cfg.require_ist_min && it.ist < cfg.require_ist_min) return null;
  if (cfg.require_funding_neg && (it.funding_rate ?? 0) >= 0) return null;
  if (cfg.require_oi_increase && (it.oi_change_pct ?? 0) <= 0) return null;
  if (cfg.require_cvd_bullish && !it.cvd_bullish) return null;

  return dir;
}

// ── Tipos de sinal e análise ──────────────────────────────────────────────────
interface Signal {
  item: FuturesItem;
  perfil: PerfilConfig;
  dir: "LONG" | "SHORT";
  conviction: number; // 0-100
  tp_pct: number; sl_pct: number;
}

interface ConsensoEntry {
  simbolo: string;
  item: FuturesItem;
  longBots: PerfilConfig[];
  shortBots: PerfilConfig[];
  totalBots: number;
  dominantDir: "LONG" | "SHORT";
  score: number;
}

interface PerfilInsight {
  perfilId: string;
  perfilNome: string;
  emoji: string;
  cor: string;
  totalTrades: number;
  wr: number;
  wrAltoScore: number;  // WR quando score >= threshold+10
  wrBaixoScore: number; // WR quando score < threshold+10
  suggestedBoost: number; // pontos a adicionar no score_min
  avgWinScore: number;
  avgLossScore: number;
  insight: string;
}

interface LearnedBoosts {
  [perfilId: string]: number;
}

// ── Análise IA ────────────────────────────────────────────────────────────────
function analisarHistorico(): PerfilInsight[] {
  try {
    const wallets: Record<string, any> = JSON.parse(
      localStorage.getItem(FUT_WALLET_KEY) ?? "{}"
    );
    const insights: PerfilInsight[] = [];

    for (const perfil of PERFIS_ESTRATEGICOS) {
      const w = wallets[perfil.id];
      if (!w) continue;
      const trades: any[] = (w.trades ?? []).filter((t: any) => t.tipo === "V" && t.pnl_brl != null);
      if (trades.length < 5) continue;

      const wins  = trades.filter(t => t.pnl_brl > 0);
      const losses = trades.filter(t => t.pnl_brl <= 0);
      const wr = wins.length / trades.length;

      const threshold = perfil.score_compra + 10;
      const altoScore  = trades.filter(t => (t.score ?? 0) >= threshold);
      const baixoScore = trades.filter(t => (t.score ?? 0) <  threshold);

      const wrAlto  = altoScore.length  > 0 ? altoScore.filter( t => t.pnl_brl > 0).length / altoScore.length  : 0;
      const wrBaixo = baixoScore.length > 0 ? baixoScore.filter(t => t.pnl_brl > 0).length / baixoScore.length : 0;

      const avgWinScore  = wins.length   > 0 ? wins.reduce( (s,t) => s + (t.score ?? 0), 0) / wins.length   : 0;
      const avgLossScore = losses.length > 0 ? losses.reduce((s,t) => s + (t.score ?? 0), 0) / losses.length : 0;

      let suggestedBoost = 0;
      let insight = "";

      if (wrAlto - wrBaixo > 0.12 && altoScore.length >= 3) {
        // Diferença significativa de WR por score → recomendar boost
        suggestedBoost = Math.round((threshold - perfil.score_compra) * 0.6);
        insight = `Score alto (≥${threshold}) entrega ${(wrAlto*100).toFixed(0)}% WR vs ${(wrBaixo*100).toFixed(0)}% em scores menores. Recomendo elevar mínimo +${suggestedBoost}pts.`;
      } else if (avgWinScore - avgLossScore > 5) {
        suggestedBoost = Math.round((avgWinScore - avgLossScore) * 0.3);
        insight = `Ganhos têm score médio ${avgWinScore.toFixed(0)} vs perdas ${avgLossScore.toFixed(0)}. Elevar mínimo +${suggestedBoost}pts filtra mais perdas.`;
      } else if (wr > 0.52) {
        insight = `${(wr*100).toFixed(0)}% WR com ${trades.length} trades. Performance consistente — manter filtros atuais.`;
      } else if (wr < 0.35) {
        suggestedBoost = 5;
        insight = `WR de ${(wr*100).toFixed(0)}% com ${trades.length} trades. Filtros precisam ser mais restritivos.`;
      } else {
        insight = `${(wr*100).toFixed(0)}% WR em ${trades.length} trades. Resultado regular — pequenos ajustes possíveis.`;
      }

      insights.push({
        perfilId: perfil.id,
        perfilNome: `${perfil.nome} ${perfil.nivel}`,
        emoji: perfil.emoji,
        cor: perfil.cor,
        totalTrades: trades.length,
        wr, wrAltoScore: wrAlto, wrBaixoScore: wrBaixo,
        suggestedBoost,
        avgWinScore, avgLossScore,
        insight,
      });
    }
    return insights.sort((a, b) => b.totalTrades - a.totalTrades);
  } catch { return []; }
}

// ── Utilitários de formatação ─────────────────────────────────────────────────
function fmtNum(n: number) {
  if (n >= 1000) return `${(n/1000).toFixed(1)}k`;
  return n.toFixed(1);
}

function scoreBar(val: number, min?: number, max?: number) {
  const pct = Math.min(100, Math.max(0, val));
  const ok = (min != null && val >= min) || (max != null && val <= max);
  return (
    <div className="flex items-center gap-1">
      <div className="flex-1 rounded-full overflow-hidden" style={{ height: 4, background: "var(--bg-hover)" }}>
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, background: ok ? "#10b981" : "#6b7280" }}
        />
      </div>
      <span className="text-[10px] tabular-nums" style={{ color: ok ? "#10b981" : "var(--text-muted)", minWidth: 22 }}>
        {val.toFixed(0)}
      </span>
    </div>
  );
}

// ── Componente SignalCard ─────────────────────────────────────────────────────
function SignalCard({ sig }: { sig: Signal }) {
  const { item: it, perfil, dir, conviction, tp_pct, sl_pct } = sig;
  const isLong = dir === "LONG";
  const dirColor = isLong ? "#10b981" : "#ef4444";
  const rr = (tp_pct / sl_pct).toFixed(1);

  return (
    <div
      className="rounded-xl p-3 flex flex-col gap-2"
      style={{
        background: "var(--bg-card)",
        border: `1px solid ${isLong ? "rgba(16,185,129,0.2)" : "rgba(239,68,68,0.2)"}`,
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span style={{ color: perfil.cor, fontSize: 14 }}>{perfil.emoji}</span>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-sm" style={{ color: "var(--text)" }}>
                {it.simbolo.replace("USDT","")}
              </span>
              <span
                className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                style={{
                  background: isLong ? "rgba(16,185,129,0.15)" : "rgba(239,68,68,0.15)",
                  color: dirColor,
                }}
              >
                {dir}
              </span>
              <span
                className="text-[10px] px-1 py-0.5 rounded"
                style={{ background: "rgba(255,255,255,0.05)", color: "var(--text-muted)" }}
              >
                {it.grade}
              </span>
            </div>
            <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>
              {perfil.nome} {perfil.nivel}
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-[11px] font-bold" style={{ color: dirColor }}>
            {isLong ? <ArrowUpRight size={14} style={{ display:"inline" }} /> : <ArrowDownRight size={14} style={{ display:"inline" }} />}
            {(conviction).toFixed(0)}%
          </div>
          <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>convicção</div>
        </div>
      </div>

      {/* Sub-scores */}
      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
        <div>
          <div className="text-[10px] mb-0.5" style={{ color: "var(--text-muted)" }}>TEC</div>
          {scoreBar(it.score_tecnico,
            isLong ? perfil.long_filter?.tec_min : undefined,
            !isLong ? perfil.short_filter?.tec_max : undefined)}
        </div>
        <div>
          <div className="text-[10px] mb-0.5" style={{ color: "var(--text-muted)" }}>FLX</div>
          {scoreBar(it.score_fluxo,
            isLong ? perfil.long_filter?.flx_min : undefined,
            !isLong ? perfil.short_filter?.flx_max : undefined)}
        </div>
        <div>
          <div className="text-[10px] mb-0.5" style={{ color: "var(--text-muted)" }}>CTX</div>
          {scoreBar(it.score_contexto,
            perfil.long_filter?.ctx_min ?? perfil.short_filter?.ctx_min)}
        </div>
        <div>
          <div className="text-[10px] mb-0.5" style={{ color: "var(--text-muted)" }}>FND</div>
          {scoreBar(it.score_fundamental,
            perfil.long_filter?.fnd_min ?? perfil.short_filter?.fnd_min)}
        </div>
      </div>

      {/* SL / TP / R:R */}
      <div
        className="flex justify-between rounded-lg px-2 py-1.5"
        style={{ background: "rgba(255,255,255,0.03)", border: "1px solid var(--border)" }}
      >
        <div className="text-center">
          <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>TP</div>
          <div className="text-[11px] font-bold" style={{ color: "#10b981" }}>+{(tp_pct*100).toFixed(1)}%</div>
        </div>
        <div className="text-center">
          <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>SL</div>
          <div className="text-[11px] font-bold" style={{ color: "#ef4444" }}>-{(sl_pct*100).toFixed(1)}%</div>
        </div>
        <div className="text-center">
          <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>R:R</div>
          <div className="text-[11px] font-bold" style={{ color: "#f59e0b" }}>1:{rr}</div>
        </div>
        <div className="text-center">
          <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>Score</div>
          <div className="text-[11px] font-bold" style={{ color: "var(--text)" }}>{it.score_final.toFixed(0)}</div>
        </div>
      </div>
    </div>
  );
}

// ── Componente ConsensoCard ───────────────────────────────────────────────────
function ConsensoCard({ entry, rank }: { entry: ConsensoEntry; rank: number }) {
  const { item: it, longBots, shortBots, dominantDir, score } = entry;
  const bots = dominantDir === "LONG" ? longBots : shortBots;
  const isLong = dominantDir === "LONG";
  const dirColor = isLong ? "#10b981" : "#ef4444";

  return (
    <div
      className="rounded-xl p-3 flex flex-col gap-2"
      style={{
        background: "var(--bg-card)",
        border: `1.5px solid ${score >= 5 ? dirColor : "var(--border)"}`,
      }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold"
            style={{ background: score >= 5 ? dirColor : "var(--bg-hover)", color: score >= 5 ? "#000" : "var(--text-muted)" }}
          >
            {rank}
          </span>
          <div>
            <div className="font-bold text-sm" style={{ color: "var(--text)" }}>
              {it.simbolo.replace("USDT","")}
            </div>
            <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>
              Score {it.score_final.toFixed(0)} · {it.grade}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {isLong
            ? <TrendingUp size={14} style={{ color: "#10b981" }} />
            : <TrendingDown size={14} style={{ color: "#ef4444" }} />}
          <span className="font-bold text-sm" style={{ color: dirColor }}>
            {bots.length} {bots.length === 1 ? "bot" : "bots"}
          </span>
        </div>
      </div>

      {/* Bots que concordam */}
      <div className="flex flex-wrap gap-1">
        {bots.map(b => (
          <span
            key={b.id}
            className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
            style={{ background: `${b.cor}20`, color: b.cor, border: `1px solid ${b.cor}40` }}
          >
            {b.emoji} {b.nome} {b.nivel}
          </span>
        ))}
      </div>

      {/* Mini scores */}
      <div className="grid grid-cols-4 gap-1 text-center">
        {[
          { l:"TEC", v:it.score_tecnico },
          { l:"FLX", v:it.score_fluxo },
          { l:"CTX", v:it.score_contexto },
          { l:"FND", v:it.score_fundamental },
        ].map(({ l, v }) => (
          <div key={l} className="rounded-lg py-1" style={{ background: "rgba(255,255,255,0.04)" }}>
            <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>{l}</div>
            <div className="text-[11px] font-bold" style={{ color: v >= 50 ? "#10b981" : v >= 35 ? "#f59e0b" : "#ef4444" }}>
              {v.toFixed(0)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Componente InsightCard ────────────────────────────────────────────────────
function InsightCard({ ins, onApply, applied }: { ins: PerfilInsight; onApply: () => void; applied: boolean }) {
  const hasBoost = ins.suggestedBoost > 0;

  return (
    <div
      className="rounded-xl p-3 flex flex-col gap-2"
      style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span style={{ color: ins.cor, fontSize: 16 }}>{ins.emoji}</span>
          <div>
            <div className="font-semibold text-sm" style={{ color: "var(--text)" }}>{ins.perfilNome}</div>
            <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>{ins.totalTrades} trades analisados</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-right">
            <div className="text-[11px] font-bold" style={{ color: ins.wr >= 0.5 ? "#10b981" : ins.wr >= 0.38 ? "#f59e0b" : "#ef4444" }}>
              {(ins.wr*100).toFixed(0)}% WR
            </div>
          </div>
          {hasBoost && (
            <button
              onClick={onApply}
              className="text-[10px] font-bold px-2 py-1 rounded-lg transition-all"
              style={{
                background: applied ? "rgba(16,185,129,0.2)" : "rgba(99,102,241,0.2)",
                color: applied ? "#10b981" : "#818cf8",
                border: `1px solid ${applied ? "rgba(16,185,129,0.4)" : "rgba(99,102,241,0.4)"}`,
              }}
            >
              {applied ? <CheckCircle size={10} style={{ display:"inline", marginRight:3 }} /> : null}
              {applied ? "Aplicado" : `+${ins.suggestedBoost}pts`}
            </button>
          )}
        </div>
      </div>

      {/* WR comparativo */}
      {ins.totalTrades >= 5 && ins.wrAltoScore > 0 && (
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg px-2 py-1.5 text-center" style={{ background:"rgba(16,185,129,0.06)", border:"1px solid rgba(16,185,129,0.15)" }}>
            <div className="text-[10px]" style={{ color:"var(--text-muted)" }}>Score alto</div>
            <div className="text-[12px] font-bold" style={{ color:"#10b981" }}>{(ins.wrAltoScore*100).toFixed(0)}%</div>
          </div>
          <div className="rounded-lg px-2 py-1.5 text-center" style={{ background:"rgba(239,68,68,0.06)", border:"1px solid rgba(239,68,68,0.15)" }}>
            <div className="text-[10px]" style={{ color:"var(--text-muted)" }}>Score baixo</div>
            <div className="text-[12px] font-bold" style={{ color:"#ef4444" }}>{(ins.wrBaixoScore*100).toFixed(0)}%</div>
          </div>
        </div>
      )}

      {/* Insight text */}
      <div
        className="rounded-lg px-2.5 py-2 text-[11px] leading-relaxed"
        style={{ background: hasBoost ? "rgba(99,102,241,0.06)" : "rgba(255,255,255,0.03)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}
      >
        <Lightbulb size={10} style={{ display:"inline", marginRight:4, color: hasBoost ? "#818cf8" : "#f59e0b" }} />
        {ins.insight}
      </div>
    </div>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────
type TabKey = "sinais" | "consenso" | "ia";

export default function SinaisFuturosPage() {
  const [tab, setTab]             = useState<TabKey>("sinais");
  const [scan, setScan]           = useState<FuturesScanData | null>(null);
  const [loading, setLoading]     = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [filterDir, setFilterDir] = useState<"ALL" | "LONG" | "SHORT">("ALL");
  const [filterTipo, setFilterTipo] = useState<"ALL" | string>("ALL");
  const [insights, setInsights]   = useState<PerfilInsight[]>([]);
  const [learnedBoosts, setLearnedBoosts] = useState<LearnedBoosts>({});
  const [appliedBoosts, setAppliedBoosts] = useState<Set<string>>(new Set());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Carrega boosts aprendidos do localStorage
  useEffect(() => {
    try {
      const saved: LearnedBoosts = JSON.parse(localStorage.getItem(LEARNED_KEY) ?? "{}");
      setLearnedBoosts(saved);
    } catch {}
  }, []);

  const fetchScan = useCallback(async () => {
    setLoading(true);
    try {
      const d: FuturesScanData = await fetch(`${API}/cripto/futures/scan`).then(r => r.json());
      setScan(d);
      setLastUpdate(new Date());
    } catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchScan();
    intervalRef.current = setInterval(fetchScan, 30_000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [fetchScan]);

  // Gera insights quando entra na aba IA
  useEffect(() => {
    if (tab === "ia") setInsights(analisarHistorico());
  }, [tab]);

  // Calcula sinais
  const signals: Signal[] = (() => {
    if (!scan) return [];
    const out: Signal[] = [];
    for (const perfil of PERFIS_ESTRATEGICOS) {
      const boost = learnedBoosts[perfil.id] ?? 0;
      for (const it of scan.geral) {
        const dir = podeEntrar(perfil, it, boost);
        if (!dir) continue;
        const conviction = Math.min(100, Math.round(
          (it.score_final / 100) * 40 +
          (it.direction_confidence ?? 50) * 0.4 +
          (it.bull_pct != null ? (dir === "LONG" ? it.bull_pct : (100 - it.bull_pct)) : 50) * 0.2
        ));
        out.push({ item: it, perfil, dir, conviction, tp_pct: perfil.tp_pct, sl_pct: perfil.sl_pct });
      }
    }
    return out.sort((a, b) => b.conviction - a.conviction);
  })();

  // Filtra sinais
  const filteredSignals = signals.filter(s => {
    if (filterDir !== "ALL" && s.dir !== filterDir) return false;
    if (filterTipo !== "ALL" && s.perfil.nome !== filterTipo) return false;
    return true;
  });

  // Calcula consenso
  const consenso: ConsensoEntry[] = (() => {
    if (!scan) return [];
    const map: Record<string, { item: FuturesItem; long: PerfilConfig[]; short: PerfilConfig[] }> = {};
    for (const sig of signals) {
      if (!map[sig.item.simbolo]) map[sig.item.simbolo] = { item: sig.item, long: [], short: [] };
      if (sig.dir === "LONG")  map[sig.item.simbolo].long.push(sig.perfil);
      if (sig.dir === "SHORT") map[sig.item.simbolo].short.push(sig.perfil);
    }
    return Object.entries(map)
      .map(([simbolo, v]) => {
        const isLong = v.long.length >= v.short.length;
        return {
          simbolo, item: v.item,
          longBots: v.long, shortBots: v.short,
          totalBots: v.long.length + v.short.length,
          dominantDir: isLong ? "LONG" as const : "SHORT" as const,
          score: Math.max(v.long.length, v.short.length),
        };
      })
      .filter(e => e.totalBots >= 2)
      .sort((a, b) => b.score - a.score || b.item.score_final - a.item.score_final);
  })();

  const tiposDisponiveis = [...new Set(PERFIS_ESTRATEGICOS.map(p => p.nome))];

  function applyBoost(ins: PerfilInsight) {
    const newBoosts = { ...learnedBoosts, [ins.perfilId]: ins.suggestedBoost };
    setLearnedBoosts(newBoosts);
    try { localStorage.setItem(LEARNED_KEY, JSON.stringify(newBoosts)); } catch {}
    setAppliedBoosts(prev => new Set(prev).add(ins.perfilId));
  }

  function resetBoosts() {
    setLearnedBoosts({});
    setAppliedBoosts(new Set());
    try { localStorage.removeItem(LEARNED_KEY); } catch {}
  }

  const tabStyle = (key: TabKey) => ({
    background: tab === key ? "rgba(16,185,129,0.15)" : "transparent",
    border: tab === key ? "1px solid rgba(16,185,129,0.3)" : "1px solid transparent",
    color: tab === key ? "#10b981" : "var(--text-muted)",
    fontWeight: tab === key ? 600 : 400,
  });

  const totalApplied = Object.keys(learnedBoosts).length;

  return (
    <main className="min-h-screen" style={{ background: "var(--bg)", color: "var(--text)" }}>
      <div className="max-w-md mx-auto px-4 py-6">
        <IAEngineHubNav />

        {/* Header */}
        <div className="flex items-start justify-between mb-5">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Zap size={18} style={{ color: "#10b981" }} />
              <h1 className="text-xl font-bold" style={{ color: "var(--text)" }}>Sinais Bots Estratégicos</h1>
            </div>
            <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
              {PERFIS_ESTRATEGICOS.length} estratégias · scan a cada 30s
              {lastUpdate && ` · ${lastUpdate.toLocaleTimeString("pt-BR", { hour:"2-digit", minute:"2-digit", second:"2-digit" })}`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {totalApplied > 0 && (
              <div className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-full" style={{ background:"rgba(99,102,241,0.15)", color:"#818cf8", border:"1px solid rgba(99,102,241,0.3)" }}>
                <Brain size={9} />
                {totalApplied} boost{totalApplied>1?"s":""}
              </div>
            )}
            <button
              onClick={fetchScan}
              disabled={loading}
              className="flex items-center gap-1.5 text-[12px] font-medium px-3 py-1.5 rounded-lg transition-all"
              style={{ background:"rgba(16,185,129,0.15)", color:"#10b981", border:"1px solid rgba(16,185,129,0.3)" }}
            >
              <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
              {loading ? "..." : "Atualizar"}
            </button>
          </div>
        </div>

        {/* Resumo rápido */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          <div className="rounded-xl px-3 py-2.5 text-center" style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
            <div className="text-[10px] mb-1" style={{ color:"var(--text-muted)" }}>Sinais ativos</div>
            <div className="text-xl font-bold" style={{ color:"var(--text)" }}>{signals.length}</div>
          </div>
          <div className="rounded-xl px-3 py-2.5 text-center" style={{ background:"var(--bg-card)", border:"1px solid rgba(16,185,129,0.2)" }}>
            <div className="text-[10px] mb-1" style={{ color:"var(--text-muted)" }}>Consenso (2+ bots)</div>
            <div className="text-xl font-bold" style={{ color:"#10b981" }}>{consenso.length}</div>
          </div>
          <div className="rounded-xl px-3 py-2.5 text-center" style={{ background:"var(--bg-card)", border:"1px solid rgba(245,158,11,0.2)" }}>
            <div className="text-[10px] mb-1" style={{ color:"var(--text-muted)" }}>Alta convicção</div>
            <div className="text-xl font-bold" style={{ color:"#f59e0b" }}>
              {consenso.filter(e => e.score >= 4).length}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-1 rounded-xl mb-4" style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
          {([
            ["sinais",   <Zap key="z" size={11} />,          "Sinais"],
            ["consenso", <Star key="s" size={11} />,         "Consenso"],
            ["ia",       <Brain key="b" size={11} />,        "IA Aprende"],
          ] as [TabKey, React.ReactNode, string][]).map(([key, icon, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[12px] font-medium transition-all flex-1 justify-center"
              style={tabStyle(key)}
            >
              {icon}{label}
            </button>
          ))}
        </div>

        {/* ── TAB: SINAIS ── */}
        {tab === "sinais" && (
          <div className="flex flex-col gap-3">
            {/* Filtros */}
            <div className="flex flex-col gap-2">
              <div className="flex gap-1.5 flex-wrap">
                {["ALL","LONG","SHORT"].map(d => (
                  <button
                    key={d}
                    onClick={() => setFilterDir(d as any)}
                    className="text-[11px] font-medium px-2.5 py-1 rounded-lg transition-all"
                    style={{
                      background: filterDir === d ? "rgba(16,185,129,0.15)" : "var(--bg-card)",
                      color: filterDir === d ? "#10b981" : "var(--text-muted)",
                      border: filterDir === d ? "1px solid rgba(16,185,129,0.3)" : "1px solid var(--border)",
                    }}
                  >
                    {d === "ALL" ? "Todos" : d === "LONG"
                      ? <><TrendingUp size={10} style={{ display:"inline", marginRight:3 }} />LONG</>
                      : <><TrendingDown size={10} style={{ display:"inline", marginRight:3 }} />SHORT</>}
                  </button>
                ))}
              </div>
              <div className="flex gap-1.5 flex-wrap">
                <button
                  onClick={() => setFilterTipo("ALL")}
                  className="text-[11px] px-2 py-1 rounded-lg transition-all"
                  style={{
                    background: filterTipo === "ALL" ? "rgba(99,102,241,0.15)" : "var(--bg-card)",
                    color: filterTipo === "ALL" ? "#818cf8" : "var(--text-muted)",
                    border: filterTipo === "ALL" ? "1px solid rgba(99,102,241,0.3)" : "1px solid var(--border)",
                  }}
                >
                  Todas estratégias
                </button>
                {tiposDisponiveis.map(t => {
                  const p = PERFIS_ESTRATEGICOS.find(x => x.nome === t);
                  return (
                    <button
                      key={t}
                      onClick={() => setFilterTipo(t)}
                      className="text-[11px] px-2 py-1 rounded-lg transition-all"
                      style={{
                        background: filterTipo === t ? `${p?.cor}20` : "var(--bg-card)",
                        color: filterTipo === t ? p?.cor : "var(--text-muted)",
                        border: filterTipo === t ? `1px solid ${p?.cor}50` : "1px solid var(--border)",
                      }}
                    >
                      {p?.emoji} {t}
                    </button>
                  );
                })}
              </div>
            </div>

            {loading && !scan && (
              <div className="text-center py-12" style={{ color:"var(--text-muted)" }}>
                <Activity size={24} className="animate-pulse mx-auto mb-2" />
                <div className="text-sm">Carregando scan de mercado...</div>
              </div>
            )}

            {scan && filteredSignals.length === 0 && (
              <div className="text-center py-12 rounded-xl" style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
                <Target size={32} style={{ color:"var(--text-muted)", margin:"0 auto 8px" }} />
                <div className="text-sm font-medium" style={{ color:"var(--text-muted)" }}>
                  Nenhum sinal no filtro atual
                </div>
                <div className="text-[11px] mt-1" style={{ color:"var(--text-muted)" }}>
                  Scan de {scan.total} ativos · {signals.length} sinais totais
                </div>
              </div>
            )}

            {filteredSignals.map((sig, i) => (
              <SignalCard key={`${sig.perfil.id}-${sig.item.simbolo}-${i}`} sig={sig} />
            ))}
          </div>
        )}

        {/* ── TAB: CONSENSO ── */}
        {tab === "consenso" && (
          <div className="flex flex-col gap-3">
            <div className="rounded-xl px-3 py-2.5 flex items-center gap-2" style={{ background:"rgba(245,158,11,0.08)", border:"1px solid rgba(245,158,11,0.2)" }}>
              <Flame size={14} style={{ color:"#f59e0b" }} />
              <div className="text-[12px]" style={{ color:"var(--text-secondary)" }}>
                Moedas onde <strong>2+ estratégias concordam</strong> na mesma direção — maior convicção de sinal.
              </div>
            </div>

            {consenso.length === 0 && scan && (
              <div className="text-center py-12 rounded-xl" style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
                <Star size={32} style={{ color:"var(--text-muted)", margin:"0 auto 8px" }} />
                <div className="text-sm" style={{ color:"var(--text-muted)" }}>Nenhum consenso no momento</div>
              </div>
            )}

            {consenso.map((entry, i) => (
              <ConsensoCard key={entry.simbolo} entry={entry} rank={i + 1} />
            ))}
          </div>
        )}

        {/* ── TAB: IA APRENDE ── */}
        {tab === "ia" && (
          <div className="flex flex-col gap-3">
            <div className="rounded-xl px-3 py-2.5 flex items-center gap-2" style={{ background:"rgba(99,102,241,0.08)", border:"1px solid rgba(99,102,241,0.2)" }}>
              <Brain size={14} style={{ color:"#818cf8" }} />
              <div className="text-[12px]" style={{ color:"var(--text-secondary)" }}>
                A IA analisa o <strong>histórico de trades</strong> de cada estratégia e sugere ajustes no score mínimo para melhorar o WR.
              </div>
            </div>

            {/* Boosts ativos */}
            {totalApplied > 0 && (
              <div className="rounded-xl p-3" style={{ background:"rgba(16,185,129,0.06)", border:"1px solid rgba(16,185,129,0.2)" }}>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-[12px] font-semibold" style={{ color:"#10b981" }}>
                    <CheckCircle size={12} style={{ display:"inline", marginRight:4 }} />
                    {totalApplied} ajuste{totalApplied>1?"s":""} aplicado{totalApplied>1?"s":""}
                  </div>
                  <button
                    onClick={resetBoosts}
                    className="text-[10px] px-2 py-1 rounded-lg"
                    style={{ background:"rgba(239,68,68,0.15)", color:"#ef4444", border:"1px solid rgba(239,68,68,0.3)" }}
                  >
                    Resetar tudo
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(learnedBoosts).map(([id, boost]) => {
                    const p = PERFIS_ESTRATEGICOS.find(x => x.id === id);
                    return p ? (
                      <span key={id} className="text-[10px] px-2 py-0.5 rounded-full" style={{ background:`${p.cor}20`, color:p.cor, border:`1px solid ${p.cor}40` }}>
                        {p.emoji} {p.nivel} +{boost}pts
                      </span>
                    ) : null;
                  })}
                </div>
              </div>
            )}

            {insights.length === 0 && (
              <div className="text-center py-12 rounded-xl" style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
                <Brain size={32} style={{ color:"var(--text-muted)", margin:"0 auto 8px" }} />
                <div className="text-sm font-medium" style={{ color:"var(--text-muted)" }}>
                  Histórico insuficiente
                </div>
                <div className="text-[11px] mt-1 px-4" style={{ color:"var(--text-muted)" }}>
                  Execute as estratégias na página Carteiras para acumular histórico e a IA começar a aprender.
                </div>
              </div>
            )}

            {insights.map(ins => (
              <InsightCard
                key={ins.perfilId}
                ins={ins}
                applied={appliedBoosts.has(ins.perfilId)}
                onApply={() => applyBoost(ins)}
              />
            ))}

            {insights.length > 0 && (
              <div className="rounded-xl px-3 py-2.5 mt-1" style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
                <div className="text-[11px]" style={{ color:"var(--text-muted)" }}>
                  <BarChart3 size={10} style={{ display:"inline", marginRight:4, color:"var(--text-muted)" }} />
                  Boosts aplicados elevam o score mínimo de entrada em X pontos, reduzindo sinais mas aumentando qualidade.
                  Quanto mais histórico acumulado, mais precisa fica a análise.
                </div>
              </div>
            )}
          </div>
        )}

        {/* Footer info */}
        {scan && (
          <div className="mt-4 text-center text-[10px]" style={{ color:"var(--text-muted)" }}>
            {scan.total} ativos escaneados
            {scan.atualizado ? ` · backend ${new Date(scan.atualizado * 1000).toLocaleTimeString("pt-BR")}` : ""}
          </div>
        )}
      </div>
    </main>
  );
}
