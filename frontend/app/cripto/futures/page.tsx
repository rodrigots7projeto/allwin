"use client";
import { useState, useEffect, useCallback, useRef, Fragment } from "react";

const API             = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";
const FUT_WALLET_KEY  = "allwin_futures_wallets_v1";
const FUT_BANCO_KEY   = "allwin_futures_banco_v1";
const FEE_RATE        = 0.0004;  // 0.04% futures fee
const TRADE_SIZE      = 1000;

// ── Interfaces ────────────────────────────────────────────────────────────────

interface FuturesItem {
  simbolo: string; preco: number;
  score_final: number; score_tecnico: number; score_fluxo: number;
  score_contexto: number; score_fundamental: number; ist: number;
  grade: "A+" | "A" | "B" | "C" | "NR";
  direction: "LONG" | "SHORT" | "NEUTRO";
  direction_confidence: number;
  operar: boolean; bullish: boolean; decisao: string;
  var24h?: number; volume24h?: number;
  oi_change_pct?: number; funding_rate?: number; funding_class?: string;
  long_pct?: number; short_pct?: number; taker_buy_pct?: number;
  cvd_bullish?: boolean; vwap?: number; vwap_above?: boolean;
  squeeze_type?: string | null; leverage_suggested?: number;
  bull_pct?: number; usd_brl?: number;
}

interface FuturesScanData {
  geral: FuturesItem[]; top_long: FuturesItem[];
  top_short: FuturesItem[]; top_ist: FuturesItem[];
  total: number; atualizado: number; usd_brl?: number; btc_dom?: number;
}

interface FuturesPos {
  simbolo: string; direction: "LONG" | "SHORT";
  units: number; amount_brl: number;
  entry_price_brl: number; last_price_brl: number; last_usd_brl: number;
  time: number; score_entry: number;
  stop_loss_price?: number; take_profit_price?: number;
  sl_pct?: number; tp_pct?: number;
}

interface FuturesTrade {
  id: string; simbolo: string; tipo: "C" | "V";
  direction: "LONG" | "SHORT";
  price_brl: number; amount_brl: number;
  fee?: number; pnl_brl?: number; pct?: number;
  time: number; score: number; auto: boolean;
  motivo_entrada?: string; motivo_saida?: string; grade?: string;
}

interface FuturesWallet {
  saldo_inicial: number; saldo_livre: number;
  positions: Record<string, FuturesPos>;
  trades: FuturesTrade[]; criado: string;
}

interface FuturesSubScoreFilter {
  tec_min?: number;   // score_tecnico >= tec_min (bullish chart)
  tec_max?: number;   // score_tecnico <= tec_max (bearish chart — para SHORT)
  flx_min?: number;   // score_fluxo >= flx_min (bullish flow)
  flx_max?: number;   // score_fluxo <= flx_max (bearish flow — para SHORT)
  ctx_min?: number;   // score_contexto >= ctx_min
  fnd_min?: number;   // score_fundamental >= fnd_min
}

interface FuturesPerfilConfig {
  id: string; nome: string;
  nivel: "Normal" | "PRO" | "PRO MAX" | "Alavancado";
  emoji: string; cor: string;
  score_compra: number; score_venda: number; bull_pct_min: number;
  sl_pct: number; tp_pct: number;
  aguardar_ok: boolean; apenas_aguardar?: boolean;
  score_max_compra?: number;
  capital_inicial?: number; stake_base?: number; stake_dupla_score?: number;
  direction_allowed: "LONG" | "SHORT" | "BOTH";
  descricao: string;
  // ── Filtros por indicadores de cada cripto ────────────────────────────────
  grade_required?: string[];
  require_ist_min?: number;
  require_funding_neg?: boolean;
  require_oi_increase?: boolean;
  require_cvd_bullish?: boolean;
  require_cvd_bearish?: boolean;
  // ── Filtros por sub-scores (v2 — porta de entrada principal) ─────────────
  long_filter?: FuturesSubScoreFilter;   // condições para entrar LONG
  short_filter?: FuturesSubScoreFilter;  // condições para entrar SHORT
}

interface FuturesBancoEntry {
  id: string; ts: number; data: string; hora: string;
  perfil_id: string; perfil_nome: string; perfil_nivel: string;
  perfil_emoji: string; perfil_cor: string;
  capital: number; saldo_livre: number; pnl: number; roi: number;
  ops_fechadas: number; win_rate: number; profit_factor: number;
  drawdown: number; total_taxas: number; n_posicoes: number;
  trades: FuturesTrade[];
}

// ── Bot Interfaces ────────────────────────────────────────────────────────────

interface BotStrategy {
  score_min: number; score_max?: number; grade_required?: string[];
  direction: "LONG" | "SHORT" | "BOTH";
  sl_pct: number; tp_pct: number; stake: number; max_positions: number;
  require_ist_min?: number; require_funding_neg?: boolean;
  require_oi_increase?: boolean; require_cvd_bullish?: boolean;
  bull_pct_min?: number; bull_pct_max?: number; altcoin_only?: boolean;
}
interface BotProfile {
  id: string; name: string; emoji: string; color: string;
  tagline: string; strategy: BotStrategy; adaptive: boolean; capital: number;
}
interface BotLearned {
  score_min_adj: number; stake_mult: number; generation: number; log: string[];
}
interface BotWallet {
  saldo_inicial: number; saldo_livre: number;
  positions: Record<string, FuturesPos>; trades: FuturesTrade[];
  learned: BotLearned;
}

// ── Perfis Futures ────────────────────────────────────────────────────────────

// Objetivo futuros: capturar 1-5% no ativo. Com alavancagem, isso vira 10-50%+ de retorno na margem.
// SL sempre < TP para manter R:R ≥ 1:2. Entradas frequentes > ganhos grandes por trade.
const PERFIS_FUTURES: FuturesPerfilConfig[] = [
  // ── Conservador ── TEC/FLX/CTX/FND altos exigidos para confirmar sinal ───────
  { id: "f_cons_normal", nome: "Conservador", nivel: "Normal", emoji: "🛡️", cor: "#3b82f6",
    score_compra: 68, score_venda: 45, bull_pct_min: 53, sl_pct: 0.008, tp_pct: 0.02,
    aguardar_ok: true, capital_inicial: 100000, stake_base: 1000, direction_allowed: "BOTH",
    grade_required: ["A+","A"], require_ist_min: 55,
    long_filter:  { tec_min: 65, flx_min: 60, ctx_min: 60, fnd_min: 48 },
    short_filter: { tec_max: 38, flx_max: 42, ctx_min: 55, fnd_min: 45 },
    descricao: "Alvo 2% (SL 0.8%). LONG: TEC≥65/FLX≥60/CTX≥60/FND≥48. SHORT: TEC≤38/FLX≤42." },
  { id: "f_cons_pro", nome: "Conservador", nivel: "PRO", emoji: "🛡️", cor: "#2563eb",
    score_compra: 65, score_venda: 42, bull_pct_min: 51, sl_pct: 0.009, tp_pct: 0.025,
    aguardar_ok: true, capital_inicial: 100000, stake_base: 1000, direction_allowed: "BOTH",
    grade_required: ["A+","A"], require_ist_min: 50,
    long_filter:  { tec_min: 62, flx_min: 57, ctx_min: 57, fnd_min: 45 },
    short_filter: { tec_max: 40, flx_max: 45, ctx_min: 52, fnd_min: 42 },
    descricao: "Alvo 2.5% (SL 0.9%). LONG: TEC≥62/FLX≥57/CTX≥57/FND≥45." },
  { id: "f_cons_promax", nome: "Conservador", nivel: "PRO MAX", emoji: "🛡️", cor: "#1d4ed8",
    score_compra: 62, score_venda: 40, bull_pct_min: 49, sl_pct: 0.010, tp_pct: 0.03,
    aguardar_ok: true, capital_inicial: 100000, stake_base: 1000, direction_allowed: "BOTH",
    grade_required: ["A+","A","B"], require_ist_min: 45,
    long_filter:  { tec_min: 58, flx_min: 53, ctx_min: 53, fnd_min: 40 },
    short_filter: { tec_max: 44, flx_max: 50, ctx_min: 48, fnd_min: 38 },
    descricao: "Alvo 3% (SL 1%). LONG: TEC≥58/FLX≥53/CTX≥53/FND≥40." },
  // ── Moderado ── Filtros progressivamente mais permissivos ────────────────────
  { id: "f_mod_normal", nome: "Moderado", nivel: "Normal", emoji: "⚖️", cor: "#8b5cf6",
    score_compra: 60, score_venda: 38, bull_pct_min: 47, sl_pct: 0.010, tp_pct: 0.025,
    aguardar_ok: true, capital_inicial: 100000, stake_base: 1000, direction_allowed: "BOTH",
    grade_required: ["A+","A","B"],
    long_filter:  { tec_min: 55, flx_min: 50, ctx_min: 50, fnd_min: 35 },
    short_filter: { tec_max: 48, flx_max: 54, ctx_min: 44, fnd_min: 32 },
    descricao: "Alvo 2.5% (SL 1%). LONG: TEC≥55/FLX≥50/CTX≥50/FND≥35." },
  { id: "f_mod_pro", nome: "Moderado", nivel: "PRO", emoji: "⚖️", cor: "#7c3aed",
    score_compra: 55, score_venda: 37, bull_pct_min: 45, sl_pct: 0.012, tp_pct: 0.03,
    aguardar_ok: true, capital_inicial: 100000, stake_base: 1000, direction_allowed: "BOTH",
    grade_required: ["A+","A","B","C"],
    long_filter:  { tec_min: 50, flx_min: 46, ctx_min: 46, fnd_min: 30 },
    short_filter: { tec_max: 52, flx_max: 58, ctx_min: 40, fnd_min: 27 },
    descricao: "Alvo 3% (SL 1.2%). LONG: TEC≥50/FLX≥46/CTX≥46/FND≥30." },
  { id: "f_mod_promax", nome: "Moderado", nivel: "PRO MAX", emoji: "⚖️", cor: "#6d28d9",
    score_compra: 52, score_venda: 35, bull_pct_min: 43, sl_pct: 0.013, tp_pct: 0.035,
    aguardar_ok: true, capital_inicial: 100000, stake_base: 1000, direction_allowed: "BOTH",
    long_filter:  { tec_min: 46, flx_min: 42, ctx_min: 42, fnd_min: 25 },
    short_filter: { tec_max: 57, flx_max: 63, ctx_min: 36, fnd_min: 22 },
    descricao: "Alvo 3.5% (SL 1.3%). LONG: TEC≥46/FLX≥42/CTX≥42/FND≥25." },
  // ── Agressivo ── Thresholds permissivos, máxima frequência de entradas ────────
  { id: "f_agr_normal", nome: "Agressivo", nivel: "Normal", emoji: "⚡", cor: "#f59e0b",
    score_compra: 48, score_venda: 33, bull_pct_min: 41, sl_pct: 0.013, tp_pct: 0.035,
    aguardar_ok: true, capital_inicial: 100000, stake_base: 1000, direction_allowed: "BOTH",
    long_filter:  { tec_min: 42, flx_min: 38, ctx_min: 38, fnd_min: 20 },
    short_filter: { tec_max: 62, flx_max: 68, ctx_min: 30, fnd_min: 18 },
    descricao: "Alvo 3.5% (SL 1.3%). LONG: TEC≥42/FLX≥38/CTX≥38/FND≥20." },
  { id: "f_agr_pro", nome: "Agressivo", nivel: "PRO", emoji: "⚡", cor: "#d97706",
    score_compra: 45, score_venda: 32, bull_pct_min: 39, sl_pct: 0.015, tp_pct: 0.04,
    aguardar_ok: true, capital_inicial: 100000, stake_base: 1000, direction_allowed: "BOTH",
    long_filter:  { tec_min: 38, flx_min: 35, ctx_min: 35, fnd_min: 17 },
    short_filter: { tec_max: 67, flx_max: 73, ctx_min: 27, fnd_min: 15 },
    descricao: "Alvo 4% (SL 1.5%). LONG: TEC≥38/FLX≥35/CTX≥35/FND≥17." },
  { id: "f_agr_promax", nome: "Agressivo", nivel: "PRO MAX", emoji: "⚡", cor: "#b45309",
    score_compra: 42, score_venda: 30, bull_pct_min: 37, sl_pct: 0.017, tp_pct: 0.05,
    aguardar_ok: true, capital_inicial: 100000, stake_base: 1000, direction_allowed: "BOTH",
    long_filter:  { tec_min: 34, flx_min: 31, ctx_min: 31, fnd_min: 14 },
    short_filter: { tec_max: 73, flx_max: 79, ctx_min: 23, fnd_min: 12 },
    descricao: "Alvo 5% (SL 1.7%). LONG: TEC≥34/FLX≥31/CTX≥31/FND≥14. Ultra-agressivo." },
  // ── Alavancado ── Exige confirmação robusta: todos sub-scores alinhados ────────
  { id: "f_cons_alav", nome: "Conservador", nivel: "Alavancado", emoji: "🔱", cor: "#06b6d4",
    score_compra: 72, score_venda: 50, bull_pct_min: 55, sl_pct: 0.006, tp_pct: 0.015,
    aguardar_ok: true, capital_inicial: 100000, stake_base: 5000, stake_dupla_score: 87,
    direction_allowed: "BOTH",
    grade_required: ["A+"], require_ist_min: 65, require_funding_neg: true, require_oi_increase: true,
    long_filter:  { tec_min: 70, flx_min: 65, ctx_min: 65, fnd_min: 53 },
    short_filter: { tec_max: 32, flx_max: 36, ctx_min: 60, fnd_min: 50 },
    descricao: "Alav. LONG: TEC≥70/FLX≥65/CTX≥65/FND≥53 + Grade A+ + IST≥65 + Funding neg." },
  { id: "f_mod_alav", nome: "Moderado", nivel: "Alavancado", emoji: "🔱", cor: "#0ea5e9",
    score_compra: 68, score_venda: 47, bull_pct_min: 52, sl_pct: 0.007, tp_pct: 0.018,
    aguardar_ok: true, capital_inicial: 100000, stake_base: 5000, stake_dupla_score: 83,
    direction_allowed: "BOTH",
    grade_required: ["A+","A"], require_ist_min: 58, require_oi_increase: true,
    long_filter:  { tec_min: 66, flx_min: 60, ctx_min: 60, fnd_min: 48 },
    short_filter: { tec_max: 36, flx_max: 42, ctx_min: 55, fnd_min: 45 },
    descricao: "Alav. LONG: TEC≥66/FLX≥60/CTX≥60/FND≥48 + Grade A/A+ + IST≥58." },
  { id: "f_agr_alav", nome: "Agressivo", nivel: "Alavancado", emoji: "🔱", cor: "#f97316",
    score_compra: 63, score_venda: 43, bull_pct_min: 48, sl_pct: 0.008, tp_pct: 0.02,
    aguardar_ok: true, capital_inicial: 100000, stake_base: 5000, stake_dupla_score: 80,
    direction_allowed: "BOTH",
    grade_required: ["A+","A","B"], require_ist_min: 50,
    long_filter:  { tec_min: 60, flx_min: 55, ctx_min: 55, fnd_min: 43 },
    short_filter: { tec_max: 42, flx_max: 48, ctx_min: 48, fnd_min: 40 },
    descricao: "Alav. LONG: TEC≥60/FLX≥55/CTX≥55/FND≥43 + Grade≥B + IST≥50." },
  // ── Subida ── Entra antes do sinal pleno: FLX bullish mas TEC ainda moderado ──
  { id: "f_sub_cons", nome: "Subida", nivel: "Normal" as "Normal", emoji: "📈", cor: "#22c55e",
    score_compra: 48, score_max_compra: 79, score_venda: 33, bull_pct_min: 51, sl_pct: 0.010, tp_pct: 0.035,
    aguardar_ok: false, apenas_aguardar: true, capital_inicial: 100000, stake_base: 500,
    direction_allowed: "LONG",
    require_cvd_bullish: true,
    long_filter: { tec_min: 38, flx_min: 52, ctx_min: 40, fnd_min: 25 },
    descricao: "Subida: FLX≥52 já bullish, TEC≥38 começando a girar. CVD bullish obrigatório." },
  { id: "f_sub_mod", nome: "Subida", nivel: "PRO" as "PRO", emoji: "📈", cor: "#16a34a",
    score_compra: 40, score_max_compra: 79, score_venda: 30, bull_pct_min: 48, sl_pct: 0.012, tp_pct: 0.04,
    aguardar_ok: false, apenas_aguardar: true, capital_inicial: 100000, stake_base: 500,
    direction_allowed: "LONG",
    require_cvd_bullish: true,
    long_filter: { tec_min: 30, flx_min: 44, ctx_min: 33, fnd_min: 20 },
    descricao: "Subida PRO: FLX≥44/TEC≥30. Entrada antecipada. CVD bullish." },
  { id: "f_sub_agr", nome: "Subida", nivel: "PRO MAX" as "PRO MAX", emoji: "📈", cor: "#15803d",
    score_compra: 35, score_max_compra: 79, score_venda: 28, bull_pct_min: 45, sl_pct: 0.015, tp_pct: 0.05,
    aguardar_ok: false, apenas_aguardar: true, capital_inicial: 100000, stake_base: 500,
    direction_allowed: "LONG",
    long_filter: { tec_min: 22, flx_min: 36, ctx_min: 26, fnd_min: 15 },
    descricao: "Subida ultra-agressiva. FLX≥36/TEC≥22. Entrada muito antecipada." },
  { id: "f_sub_alav", nome: "Subida", nivel: "Alavancado" as "Alavancado", emoji: "📈🔱", cor: "#84cc16",
    score_compra: 44, score_max_compra: 79, score_venda: 30, bull_pct_min: 49, sl_pct: 0.010, tp_pct: 0.03,
    aguardar_ok: false, apenas_aguardar: true, capital_inicial: 100000, stake_base: 500, stake_dupla_score: 72,
    direction_allowed: "LONG",
    require_cvd_bullish: true, require_oi_increase: true,
    long_filter: { tec_min: 34, flx_min: 48, ctx_min: 36, fnd_min: 22 },
    descricao: "Subida alavancada. FLX≥48/TEC≥34 + CVD bullish + OI crescendo." },
  // ── Short ── Exige condições bearish: TEC e FLX baixos ───────────────────────
  { id: "f_short_cons", nome: "Short", nivel: "Normal" as "Normal", emoji: "📉", cor: "#ef4444",
    score_compra: 68, score_venda: 45, bull_pct_min: 40, sl_pct: 0.008, tp_pct: 0.020,
    aguardar_ok: true, capital_inicial: 100000, stake_base: 500,
    direction_allowed: "SHORT",
    grade_required: ["A+","A"],
    short_filter: { tec_max: 36, flx_max: 40, ctx_min: 55, fnd_min: 42 },
    descricao: "Short Conservador: TEC≤36/FLX≤40 (bearish) + CTX≥55/FND≥42 + Grade A/A+." },
  { id: "f_short_mod", nome: "Short", nivel: "PRO" as "PRO", emoji: "📉", cor: "#dc2626",
    score_compra: 60, score_venda: 40, bull_pct_min: 35, sl_pct: 0.010, tp_pct: 0.025,
    aguardar_ok: true, capital_inicial: 100000, stake_base: 500,
    direction_allowed: "SHORT",
    short_filter: { tec_max: 44, flx_max: 50, ctx_min: 46, fnd_min: 36 },
    descricao: "Short Moderado: TEC≤44/FLX≤50 (bearish) + CTX≥46/FND≥36." },
  // ── Scalp ── Alta frequência, thresholds permissivos, ambas direções ──────────
  { id: "f_scalp_cons", nome: "Scalp", nivel: "Conservador" as "Normal", emoji: "⚡🛡️", cor: "#22d3ee",
    score_compra: 45, score_venda: 30, bull_pct_min: 0, sl_pct: 0.003, tp_pct: 0.007,
    aguardar_ok: true, capital_inicial: 100000, stake_base: 2000,
    direction_allowed: "BOTH",
    long_filter:  { tec_min: 38, flx_min: 35, ctx_min: 30, fnd_min: 18 },
    short_filter: { tec_max: 62, flx_max: 67, ctx_min: 27, fnd_min: 15 },
    descricao: "Scalp 0.7% (SL 0.3%). LONG: TEC≥38/FLX≥35. SHORT: TEC≤62/FLX≤67." },
  { id: "f_scalp_mod", nome: "Scalp", nivel: "Moderado" as "PRO", emoji: "⚡⚖️", cor: "#a78bfa",
    score_compra: 38, score_venda: 24, bull_pct_min: 0, sl_pct: 0.004, tp_pct: 0.010,
    aguardar_ok: true, capital_inicial: 100000, stake_base: 2000,
    direction_allowed: "BOTH",
    long_filter:  { tec_min: 30, flx_min: 27, ctx_min: 22, fnd_min: 12 },
    short_filter: { tec_max: 70, flx_max: 75, ctx_min: 20, fnd_min: 10 },
    descricao: "Scalp 1% (SL 0.4%). LONG: TEC≥30/FLX≥27. SHORT: TEC≤70/FLX≤75." },
  { id: "f_scalp_arj", nome: "Scalp", nivel: "Arrojado" as "PRO MAX", emoji: "⚡🔥", cor: "#fb923c",
    score_compra: 30, score_venda: 18, bull_pct_min: 0, sl_pct: 0.005, tp_pct: 0.013,
    aguardar_ok: true, capital_inicial: 100000, stake_base: 2000,
    direction_allowed: "BOTH",
    long_filter:  { tec_min: 22, flx_min: 19, ctx_min: 15, fnd_min: 7 },
    short_filter: { tec_max: 78, flx_max: 83, ctx_min: 13, fnd_min: 5 },
    descricao: "Scalp 1.3% (SL 0.5%). LONG: TEC≥22/FLX≥19. Máximas entradas." },
];

// ── Lógica de entrada por sub-scores individuais (v2) ────────────────────────
// Porta de entrada: cada perfil define thresholds mínimos para TEC/FLX/CTX/FND
// separadamente para LONG e SHORT. Isso evita que um sub-score alto compense outro
// fraco (problema do score_final composto).

function podeEntrarFutures(cfg: FuturesPerfilConfig, it: FuturesItem): "LONG" | "SHORT" | null {
  // Teto para perfis Subida (evita entrar quando sinal já está pleno)
  if (cfg.score_max_compra && it.score_final > cfg.score_max_compra) return null;

  // Determina direction do ativo
  let dir: "LONG" | "SHORT";
  if      (it.direction === "LONG")  dir = "LONG";
  else if (it.direction === "SHORT") dir = "SHORT";
  else {
    const bp = it.bull_pct ?? 50;
    if      (bp > 55) dir = "LONG";
    else if (bp < 45) dir = "SHORT";
    else return null;
  }

  // Direção permitida pelo perfil
  if (cfg.direction_allowed !== "BOTH" && cfg.direction_allowed !== dir) return null;

  // Bull_pct mínimo
  const bp = it.bull_pct ?? 50;
  if (dir === "LONG"  && bp < cfg.bull_pct_min) return null;
  if (dir === "SHORT" && bp > (100 - cfg.bull_pct_min)) return null;

  // ── Filtros por sub-scores (porta principal de entrada) ───────────────────
  const sf = dir === "LONG" ? cfg.long_filter : cfg.short_filter;
  if (sf) {
    if (sf.tec_min != null && it.score_tecnico    < sf.tec_min) return null;
    if (sf.tec_max != null && it.score_tecnico    > sf.tec_max) return null;
    if (sf.flx_min != null && it.score_fluxo      < sf.flx_min) return null;
    if (sf.flx_max != null && it.score_fluxo      > sf.flx_max) return null;
    if (sf.ctx_min != null && it.score_contexto   < sf.ctx_min) return null;
    if (sf.fnd_min != null && it.score_fundamental < sf.fnd_min) return null;
  }

  // ── Filtros complementares por indicadores do ativo ───────────────────────
  if (cfg.grade_required && !cfg.grade_required.includes(it.grade)) return null;
  if (cfg.require_ist_min && it.ist < cfg.require_ist_min) return null;
  if (cfg.require_funding_neg && (it.funding_rate ?? 0) >= 0) return null;
  if (cfg.require_oi_increase && (it.oi_change_pct ?? 0) <= 0) return null;
  if (cfg.require_cvd_bullish && !it.cvd_bullish) return null;
  if (cfg.require_cvd_bearish && it.cvd_bullish !== false) return null;

  return dir;
}

// ── Bot Profiles (20 bots) ────────────────────────────────────────────────────

const BOT_WALLET_KEY = "allwin_bot_wallets_v1";

const BOT_PROFILES: BotProfile[] = [
  { id:"bot_atlas",      name:"ATLAS",      emoji:"🏛️", color:"#3b82f6",
    tagline:"Score alto · Grade A/A+ obrigatória",
    strategy:{ score_min:72, grade_required:["A+","A"], direction:"BOTH", sl_pct:0.006, tp_pct:0.015, stake:2000, max_positions:3 },
    adaptive:true, capital:100000 },
  { id:"bot_zeus",       name:"ZEUS",       emoji:"⚡", color:"#f59e0b",
    tagline:"Máxima agressividade · Qualquer grade",
    strategy:{ score_min:40, direction:"BOTH", sl_pct:0.017, tp_pct:0.05, stake:1000, max_positions:5 },
    adaptive:true, capital:100000 },
  { id:"bot_orion",      name:"ORION",      emoji:"🎯", color:"#a855f7",
    tagline:"Caçador Grade A+ · Score 55-85",
    strategy:{ score_min:55, score_max:85, grade_required:["A+"], direction:"BOTH", sl_pct:0.010, tp_pct:0.030, stake:3000, max_positions:3 },
    adaptive:true, capital:100000 },
  { id:"bot_hermes",     name:"HERMES",     emoji:"💨", color:"#22d3ee",
    tagline:"Scalp ultra-rápido · Muitos trades pequenos",
    strategy:{ score_min:44, direction:"BOTH", sl_pct:0.003, tp_pct:0.008, stake:2000, max_positions:6 },
    adaptive:true, capital:100000 },
  { id:"bot_apollo",     name:"APOLLO",     emoji:"🌟", color:"#fbbf24",
    tagline:"Momentum puro · IST mínimo 65",
    strategy:{ score_min:55, require_ist_min:65, direction:"BOTH", sl_pct:0.009, tp_pct:0.025, stake:1500, max_positions:3 },
    adaptive:true, capital:100000 },
  { id:"bot_ares",       name:"ARES",       emoji:"⚔️", color:"#ef4444",
    tagline:"Especialista SHORT · Caça quedas",
    strategy:{ score_min:50, direction:"SHORT", sl_pct:0.010, tp_pct:0.025, stake:1500, max_positions:4 },
    adaptive:true, capital:100000 },
  { id:"bot_poseidon",   name:"POSEIDON",   emoji:"🌊", color:"#0ea5e9",
    tagline:"Open Interest crescente · Segue o dinheiro",
    strategy:{ score_min:50, require_oi_increase:true, direction:"BOTH", sl_pct:0.010, tp_pct:0.028, stake:2000, max_positions:3 },
    adaptive:true, capital:100000 },
  { id:"bot_hades",      name:"HADES",      emoji:"🔮", color:"#7c3aed",
    tagline:"Contrário · Compra quando bull_pct < 35%",
    strategy:{ score_min:45, bull_pct_max:35, direction:"LONG", sl_pct:0.012, tp_pct:0.030, stake:1000, max_positions:3 },
    adaptive:true, capital:100000 },
  { id:"bot_athena",     name:"ATHENA",     emoji:"🦉", color:"#10b981",
    tagline:"Multi-fator · IST + Funding negativo",
    strategy:{ score_min:58, require_ist_min:55, require_funding_neg:true, direction:"BOTH", sl_pct:0.008, tp_pct:0.022, stake:2000, max_positions:3 },
    adaptive:true, capital:100000 },
  { id:"bot_titan",      name:"TITAN",      emoji:"🪨", color:"#6b7280",
    tagline:"Swing longo prazo · SL 2% / TP 6%",
    strategy:{ score_min:65, direction:"BOTH", sl_pct:0.020, tp_pct:0.060, stake:5000, max_positions:2 },
    adaptive:true, capital:100000 },
  { id:"bot_kronos",     name:"KRONOS",     emoji:"⏰", color:"#84cc16",
    tagline:"Timing perfeito · Score ≥ 72 fixo",
    strategy:{ score_min:72, grade_required:["A+","A"], direction:"BOTH", sl_pct:0.007, tp_pct:0.020, stake:3000, max_positions:2 },
    adaptive:false, capital:100000 },
  { id:"bot_helios",     name:"HELIOS",     emoji:"🌅", color:"#f97316",
    tagline:"LONG only · bull_pct ≥ 55%",
    strategy:{ score_min:54, direction:"LONG", bull_pct_min:55, sl_pct:0.009, tp_pct:0.022, stake:1500, max_positions:4 },
    adaptive:true, capital:100000 },
  { id:"bot_artemis",    name:"ARTEMIS",    emoji:"🏹", color:"#22c55e",
    tagline:"Altcoins only · Ignora BTC e ETH",
    strategy:{ score_min:52, altcoin_only:true, direction:"BOTH", sl_pct:0.012, tp_pct:0.035, stake:1000, max_positions:4 },
    adaptive:true, capital:100000 },
  { id:"bot_hephaestus", name:"HEPHAESTUS",emoji:"🔨", color:"#d97706",
    tagline:"Grade B+ · IST ≥ 60 · Fundamentos sólidos",
    strategy:{ score_min:58, grade_required:["A+","A","B"], require_ist_min:60, direction:"BOTH", sl_pct:0.008, tp_pct:0.022, stake:2000, max_positions:3 },
    adaptive:true, capital:100000 },
  { id:"bot_dionysus",   name:"DIONYSUS",   emoji:"🍇", color:"#c084fc",
    tagline:"Funding negativo · Taxas a favor",
    strategy:{ score_min:48, require_funding_neg:true, direction:"LONG", sl_pct:0.008, tp_pct:0.020, stake:2000, max_positions:4 },
    adaptive:true, capital:100000 },
  { id:"bot_eros",       name:"EROS",       emoji:"💫", color:"#f472b6",
    tagline:"CVD bullish · Compradores dominando",
    strategy:{ score_min:50, require_cvd_bullish:true, direction:"LONG", sl_pct:0.009, tp_pct:0.024, stake:1500, max_positions:3 },
    adaptive:true, capital:100000 },
  { id:"bot_nike",       name:"NIKE",       emoji:"🏆", color:"#d97706",
    tagline:"Alta probabilidade · Stake concentrado",
    strategy:{ score_min:68, grade_required:["A+","A","B"], direction:"BOTH", sl_pct:0.006, tp_pct:0.018, stake:4000, max_positions:2 },
    adaptive:false, capital:100000 },
  { id:"bot_proteus",    name:"PROTEUS",    emoji:"🔄", color:"#06b6d4",
    tagline:"Shapeshifter · Adapta tudo pelos resultados",
    strategy:{ score_min:55, direction:"BOTH", sl_pct:0.010, tp_pct:0.025, stake:1500, max_positions:3 },
    adaptive:true, capital:100000 },
  { id:"bot_prometheus", name:"PROMETHEUS", emoji:"🔥", color:"#dc2626",
    tagline:"Aprendiz veloz · Começa conservador e escala",
    strategy:{ score_min:70, grade_required:["A+","A"], direction:"BOTH", sl_pct:0.008, tp_pct:0.020, stake:1000, max_positions:2 },
    adaptive:true, capital:100000 },
  { id:"bot_nemesis",    name:"NEMESIS",    emoji:"⚖️", color:"#78716c",
    tagline:"Reversão · SHORT quando todos são bullish",
    strategy:{ score_min:38, bull_pct_max:20, direction:"SHORT", sl_pct:0.013, tp_pct:0.040, stake:1000, max_positions:3 },
    adaptive:true, capital:100000 },

  // ── 10 Novos Bots Conservadores ───────────────────────────────────────────
  { id:"bot_minerva",    name:"MINERVA",    emoji:"🦚", color:"#6366f1",
    tagline:"Sabedoria total · Score + Grade A+ + IST alto",
    strategy:{ score_min:76, grade_required:["A+"], require_ist_min:68, direction:"BOTH", sl_pct:0.005, tp_pct:0.013, stake:800, max_positions:2 },
    adaptive:true, capital:100000 },
  { id:"bot_jupiter",    name:"JUPITER",    emoji:"🔱", color:"#fbbf24",
    tagline:"Rei absoluto · Score ≥ 80 · Setup perfeito ou nada",
    strategy:{ score_min:80, grade_required:["A+"], require_ist_min:65, direction:"BOTH", sl_pct:0.004, tp_pct:0.010, stake:3000, max_positions:1 },
    adaptive:false, capital:100000 },
  { id:"bot_caesar",     name:"CAESAR",     emoji:"👑", color:"#dc2626",
    tagline:"Imperador LONG · Alta dominância compradora",
    strategy:{ score_min:75, grade_required:["A+","A"], direction:"LONG", bull_pct_min:58, sl_pct:0.005, tp_pct:0.013, stake:1000, max_positions:2 },
    adaptive:true, capital:100000 },
  { id:"bot_diana",      name:"DIANA",      emoji:"🌙", color:"#818cf8",
    tagline:"Caçadora precisa · Grade A+ + IST elevado · só LONG",
    strategy:{ score_min:74, grade_required:["A+"], require_ist_min:65, direction:"LONG", sl_pct:0.005, tp_pct:0.012, stake:600, max_positions:2 },
    adaptive:true, capital:100000 },
  { id:"bot_mercurio",   name:"MERCURIO",   emoji:"☿️", color:"#34d399",
    tagline:"Scalp refinado · Rápido mas exige Grade A+/A",
    strategy:{ score_min:65, grade_required:["A+","A"], direction:"BOTH", sl_pct:0.004, tp_pct:0.009, stake:1500, max_positions:3 },
    adaptive:true, capital:100000 },
  { id:"bot_vesta",      name:"VESTA",      emoji:"🕯️", color:"#f472b6",
    tagline:"Chama sagrada · Funding negativo + bull_pct favorável",
    strategy:{ score_min:72, require_funding_neg:true, bull_pct_min:52, direction:"LONG", sl_pct:0.006, tp_pct:0.015, stake:700, max_positions:2 },
    adaptive:true, capital:100000 },
  { id:"bot_marco",      name:"MARCO",      emoji:"📖", color:"#94a3b8",
    tagline:"Estoicismo puro · Score + IST + Grade balanceados",
    strategy:{ score_min:70, grade_required:["A+","A","B"], require_ist_min:62, direction:"BOTH", sl_pct:0.007, tp_pct:0.016, stake:500, max_positions:2 },
    adaptive:true, capital:100000 },
  { id:"bot_brutus",     name:"BRUTUS",     emoji:"🗡️", color:"#f87171",
    tagline:"SHORT conservador · Só Grade A+ em quedas",
    strategy:{ score_min:68, grade_required:["A+","A"], direction:"SHORT", sl_pct:0.005, tp_pct:0.014, stake:600, max_positions:2 },
    adaptive:true, capital:100000 },
  { id:"bot_seneca",     name:"SENECA",     emoji:"🎭", color:"#a78bfa",
    tagline:"Filósofo conservador · Muitos filtros · Poucas entradas",
    strategy:{ score_min:74, grade_required:["A+","A"], require_ist_min:62, require_funding_neg:true, direction:"BOTH", sl_pct:0.005, tp_pct:0.013, stake:600, max_positions:2 },
    adaptive:true, capital:100000 },
  { id:"bot_cicero",     name:"CICERO",     emoji:"🗣️", color:"#fb923c",
    tagline:"Setup perfeito · Grade A+ + IST 70 + OI crescente",
    strategy:{ score_min:77, grade_required:["A+"], require_ist_min:70, require_oi_increase:true, direction:"BOTH", sl_pct:0.004, tp_pct:0.010, stake:1000, max_positions:1 },
    adaptive:true, capital:100000 },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function emptyFuturesWallet(capital = 100000): FuturesWallet {
  return { saldo_inicial: capital, saldo_livre: capital, positions: {}, trades: [], criado: new Date().toISOString() };
}

function emptyMultiFutures(): Record<string, FuturesWallet> {
  return Object.fromEntries(PERFIS_FUTURES.map(p => [p.id, emptyFuturesWallet(p.capital_inicial ?? 100000)]));
}

function fmt(n: number, d = 2) { return n.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d }); }

function calcFuturesStats(w: FuturesWallet) {
  const capital   = w.saldo_livre + Object.values(w.positions).reduce((a, p) => a + p.amount_brl, 0);
  const pnl       = capital - w.saldo_inicial;
  const roi       = w.saldo_inicial > 0 ? (pnl / w.saldo_inicial) * 100 : 0;
  const posicoes  = Object.keys(w.positions).length;
  const vendas    = w.trades.filter(t => t.tipo === "V");
  const wins      = vendas.filter(t => (t.pnl_brl ?? 0) > 0);
  const losses    = vendas.filter(t => (t.pnl_brl ?? 0) < 0);
  const win_rate  = vendas.length > 0 ? (wins.length / vendas.length) * 100 : 0;
  const soma_g    = wins.reduce((a, t) => a + (t.pnl_brl ?? 0), 0);
  const soma_p    = Math.abs(losses.reduce((a, t) => a + (t.pnl_brl ?? 0), 0));
  const profit_factor = soma_p > 0 ? soma_g / soma_p : wins.length > 0 ? 999 : 0;
  // Drawdown simples
  let peak = w.saldo_inicial; let dd = 0; let running = w.saldo_inicial;
  for (const t of w.trades) {
    if (t.tipo === "V") { running += (t.pnl_brl ?? 0); if (running > peak) peak = running; const d2 = peak > 0 ? (peak - running) / peak * 100 : 0; if (d2 > dd) dd = d2; }
  }
  return { capital, pnl, roi, posicoes, ops: vendas.length, win_rate, profit_factor, drawdown: dd };
}

function gradeColor(g: string) {
  if (g === "A+") return "#a855f7";
  if (g === "A")  return "#10b981";
  if (g === "B")  return "#3b82f6";
  if (g === "C")  return "#f59e0b";
  return "#ef4444";
}

function directionColor(d: string) {
  if (d === "LONG")  return "#10b981";
  if (d === "SHORT") return "#ef4444";
  return "#6b7280";
}

function fundingColor(fc?: string) {
  if (!fc) return "#6b7280";
  if (fc.includes("Extremamente Negativo")) return "#10b981";
  if (fc.includes("Negativo")) return "#6ee7b7";
  if (fc.includes("Neutro")) return "#6b7280";
  if (fc.includes("Extremamente Positivo")) return "#ef4444";
  return "#f59e0b";
}

const COIN_EMOJI: Record<string, string> = {
  BTC:"₿", ETH:"Ξ", SOL:"◎", BNB:"⬡", XRP:"✕", DOGE:"Ð", ADA:"₳",
  AVAX:"△", LINK:"⬡", LTC:"Ł", DOT:"●", MATIC:"⬡", BCH:"₿",
  UNI:"🦄", AAVE:"Ⓐ", NEAR:"Ⓝ", ARB:"Ⓐ", OP:"Ⓞ", SUI:"S",
};

// ── Score mini bar ─────────────────────────────────────────────────────────

function ScoreBar({ val, label, color }: { val: number; label: string; color: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[8px] text-[var(--text-secondary)] mb-0.5 truncate">{label}</div>
      <div className="h-1 rounded-full bg-[var(--border)]">
        <div className="h-1 rounded-full transition-all" style={{ width: `${Math.max(2, val)}%`, background: color }} />
      </div>
      <div className="text-[8px] font-bold mt-0.5" style={{ color }}>{val.toFixed(0)}</div>
    </div>
  );
}

function GradeBadge({ grade }: { grade: string }) {
  const c = gradeColor(grade);
  return (
    <span className="px-2 py-0.5 rounded-full text-[9px] font-black" style={{ background: c + "20", color: c, border: `1px solid ${c}50` }}>
      {grade}
    </span>
  );
}

function DirectionBadge({ dir, confidence }: { dir: string; confidence?: number }) {
  const c = directionColor(dir);
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black" style={{ background: c + "20", color: c, border: `1px solid ${c}50` }}>
      {dir === "LONG" ? "▲" : dir === "SHORT" ? "▼" : "—"} {dir}
      {confidence != null && confidence > 0 && <span className="opacity-70">{confidence.toFixed(0)}%</span>}
    </span>
  );
}

// ── Hooks ─────────────────────────────────────────────────────────────────────

// Sync trade para backend sem bloquear UI
async function _syncTrade(trade: FuturesTrade & { perfil_id?: string }, perfilId: string) {
  try {
    await fetch(`${API}/cripto/wallets/futures/trade`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...trade, perfil_id: perfilId }),
    });
  } catch { /* silencioso — localStorage é o fallback */ }
}

async function _syncWallet(perfilId: string, w: FuturesWallet) {
  try {
    await fetch(`${API}/cripto/wallets/futures/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        perfil_id:     perfilId,
        saldo_inicial: w.saldo_inicial,
        saldo_livre:   w.saldo_livre,
        positions:     w.positions,
        trades:        [],   // trades são salvos individualmente via _syncTrade
      }),
    });
  } catch { /* silencioso */ }
}

// Migra localStorage → backend quando MySQL está vazio ou só tem carteiras padrão
async function _pushFuturesLocalToBackend(localWallets: Record<string, FuturesWallet>) {
  const temDados = Object.values(localWallets).some(
    w => w.trades.length > 0 || Object.keys(w.positions).length > 0
  );
  if (!temDados) return;
  try {
    const payload = Object.fromEntries(
      Object.entries(localWallets).map(([pid, w]) => [
        pid, { saldo_inicial: w.saldo_inicial, saldo_livre: w.saldo_livre, positions: w.positions, trades: w.trades },
      ])
    );
    await fetch(`${API}/cripto/wallets/futures/sync_all`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch { /* silencioso */ }
}

// ── Bot Engine ────────────────────────────────────────────────────────────────

async function _syncBotTrade(trade: FuturesTrade, botId: string) {
  try {
    await fetch(`${API}/cripto/wallets/bot/trade`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...trade, perfil_id: botId }),
    });
  } catch {}
}
async function _syncBotWallet(botId: string, w: BotWallet) {
  try {
    await fetch(`${API}/cripto/wallets/bot/sync`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ perfil_id: botId, saldo_inicial: w.saldo_inicial, saldo_livre: w.saldo_livre, positions: w.positions, trades: [] }),
    });
  } catch {}
}

function emptyBotLearned(): BotLearned { return { score_min_adj: 0, stake_mult: 1, generation: 0, log: [] }; }
function emptyBotWallet(cap: number): BotWallet {
  return { saldo_inicial: cap, saldo_livre: cap, positions: {}, trades: [], learned: emptyBotLearned() };
}
function emptyAllBotWallets(): Record<string, BotWallet> {
  return Object.fromEntries(BOT_PROFILES.map(b => [b.id, emptyBotWallet(b.capital)]));
}

function botCanEnter(bot: BotProfile, wallet: BotWallet, item: FuturesItem): "LONG" | "SHORT" | null {
  const effMin = bot.strategy.score_min + (wallet.learned?.score_min_adj ?? 0);
  if (item.score_final < effMin) return null;
  if (bot.strategy.score_max && item.score_final > bot.strategy.score_max) return null;
  if (item.direction === "NEUTRO") return null;
  if (bot.strategy.grade_required && !bot.strategy.grade_required.includes(item.grade)) return null;
  const dir = item.direction as "LONG" | "SHORT";
  if (bot.strategy.direction !== "BOTH" && bot.strategy.direction !== dir) return null;
  const effStake = bot.strategy.stake * (wallet.learned?.stake_mult ?? 1);
  if (wallet.saldo_livre < Math.min(effStake, 50)) return null;
  if (Object.keys(wallet.positions).length >= bot.strategy.max_positions) return null;
  if (wallet.positions[item.simbolo]) return null;
  if (bot.strategy.require_ist_min    && (item.ist          ?? 0)   < bot.strategy.require_ist_min) return null;
  if (bot.strategy.require_funding_neg && (item.funding_rate  ?? 0)  >= 0) return null;
  if (bot.strategy.require_oi_increase && (item.oi_change_pct ?? 0) <= 0) return null;
  if (bot.strategy.require_cvd_bullish && !item.cvd_bullish) return null;
  if (bot.strategy.bull_pct_min && (item.bull_pct ?? 50) < bot.strategy.bull_pct_min) return null;
  if (bot.strategy.bull_pct_max && (item.bull_pct ?? 50) > bot.strategy.bull_pct_max) return null;
  if (bot.strategy.altcoin_only && (item.simbolo === "BTC" || item.simbolo === "ETH")) return null;
  return dir;
}

function applyBotLearning(bot: BotProfile, wallet: BotWallet): BotLearned {
  if (!bot.adaptive) return wallet.learned ?? emptyBotLearned();
  const vendas = wallet.trades.filter(t => t.tipo === "V");
  if (vendas.length < 10) return wallet.learned ?? emptyBotLearned();
  const newGen = Math.floor(vendas.length / 10);
  if (newGen <= (wallet.learned?.generation ?? 0)) return wallet.learned;
  const last10 = vendas.slice(-10);
  const wr = last10.filter(t => (t.pnl_brl ?? 0) > 0).length / 10;
  let adj  = wallet.learned?.score_min_adj ?? 0;
  let mult = wallet.learned?.stake_mult    ?? 1;
  const log = [...(wallet.learned?.log ?? [])];
  if (wr < 0.40) {
    adj = Math.min(adj + 2, 20); mult = Math.max(0.5, +(mult * 0.95).toFixed(3));
    log.push(`Gen ${newGen}: WR ${(wr*100).toFixed(0)}% → score +2, stake -5%`);
  } else if (wr >= 0.65) {
    adj = Math.max(adj - 1, -10); mult = Math.min(2.0, +(mult * 1.05).toFixed(3));
    log.push(`Gen ${newGen}: WR ${(wr*100).toFixed(0)}% → score -1, stake +5%`);
  } else {
    log.push(`Gen ${newGen}: WR ${(wr*100).toFixed(0)}% → sem ajuste`);
  }
  if (log.length > 12) log.splice(0, log.length - 12);
  return { score_min_adj: adj, stake_mult: mult, generation: newGen, log };
}

function runBotCycle(bot: BotProfile, wallet: BotWallet, scan: FuturesScanData): { wallet: BotWallet; newTrades: FuturesTrade[] } {
  const usdBrl = scan.usd_brl ?? 5.2;
  const items  = scan.geral  ?? [];
  let w: BotWallet = { ...wallet, positions: { ...wallet.positions }, trades: [...wallet.trades], learned: wallet.learned ?? emptyBotLearned() };
  const newTrades: FuturesTrade[] = [];

  // 1) SL / TP check on open positions
  for (const sym of Object.keys(w.positions)) {
    const pos  = w.positions[sym];
    const item = items.find(i => i.simbolo === sym);
    if (!item?.preco) continue;
    const curr = item.preco * usdBrl;
    let motivo: string | null = null;
    if (pos.direction === "LONG") {
      if (pos.stop_loss_price   && curr <= pos.stop_loss_price)  motivo = `Stop Loss ${(bot.strategy.sl_pct*100).toFixed(1)}%`;
      else if (pos.take_profit_price && curr >= pos.take_profit_price) motivo = `Take Profit ${(bot.strategy.tp_pct*100).toFixed(1)}%`;
      else if (item.direction === "SHORT" && item.score_final > 65) motivo = "Reversão SHORT";
    } else {
      if (pos.stop_loss_price   && curr >= pos.stop_loss_price)  motivo = `Stop Loss ${(bot.strategy.sl_pct*100).toFixed(1)}%`;
      else if (pos.take_profit_price && curr <= pos.take_profit_price) motivo = `Take Profit ${(bot.strategy.tp_pct*100).toFixed(1)}%`;
      else if (item.direction === "LONG" && item.score_final > 65) motivo = "Reversão LONG";
    }
    if (motivo) {
      const sv  = pos.units * curr;
      const pnl = pos.direction === "LONG" ? sv - pos.amount_brl : pos.amount_brl - sv;
      const trade: FuturesTrade = {
        id: `${Date.now()}-${bot.id}-${sym}-V`, simbolo: sym, tipo: "V",
        direction: pos.direction, price_brl: curr, amount_brl: sv,
        pnl_brl: pnl, pct: (pnl / pos.amount_brl) * 100,
        time: Date.now(), score: item.score_final, auto: true, motivo_saida: motivo,
      };
      const { [sym]: _r, ...rest } = w.positions;
      w = { ...w, saldo_livre: w.saldo_livre + pos.amount_brl + pnl, positions: rest, trades: [...w.trades, trade] };
      newTrades.push(trade);
    }
  }

  // 2) New entries — limit 1 new position per cycle
  let newEntriesThisCycle = 0;
  for (const item of items) {
    if (!item.preco || newEntriesThisCycle >= 1) break;
    const dir = botCanEnter(bot, w, item);
    if (!dir) continue;
    const effStake = bot.strategy.stake * (w.learned?.stake_mult ?? 1);
    const amount   = Math.min(effStake, w.saldo_livre);
    if (amount < 50) continue;
    const pBrl  = item.preco * usdBrl;
    const fee   = amount * 0.0004;
    const units = (amount - fee) / pBrl;
    const sl = dir === "LONG" ? pBrl * (1 - bot.strategy.sl_pct) : pBrl * (1 + bot.strategy.sl_pct);
    const tp = dir === "LONG" ? pBrl * (1 + bot.strategy.tp_pct) : pBrl * (1 - bot.strategy.tp_pct);
    const pos: FuturesPos = {
      simbolo: item.simbolo, direction: dir, units, amount_brl: amount,
      entry_price_brl: pBrl, last_price_brl: pBrl, last_usd_brl: usdBrl,
      time: Date.now(), score_entry: item.score_final,
      stop_loss_price: sl, take_profit_price: tp, sl_pct: bot.strategy.sl_pct, tp_pct: bot.strategy.tp_pct,
    };
    const trade: FuturesTrade = {
      id: `${Date.now()}-${bot.id}-${item.simbolo}-C`, simbolo: item.simbolo, tipo: "C",
      direction: dir, price_brl: pBrl, amount_brl: amount, fee,
      time: Date.now(), score: item.score_final, auto: true, grade: item.grade,
      motivo_entrada: `${bot.name}: Score ${item.score_final.toFixed(0)} | ${dir} | ${bot.tagline}`,
    };
    w = { ...w, saldo_livre: w.saldo_livre - amount, positions: { ...w.positions, [item.simbolo]: pos }, trades: [...w.trades, trade] };
    newTrades.push(trade);
    newEntriesThisCycle++;
  }

  // 3) Apply learning
  const learned = applyBotLearning(bot, w);
  return { wallet: { ...w, learned }, newTrades };
}

function useBotWallets(scan: FuturesScanData | null) {
  const [botWallets, setBotWallets] = useState<Record<string, BotWallet>>(() => {
    try {
      const s = localStorage.getItem(BOT_WALLET_KEY);
      if (s) { const p = JSON.parse(s); return { ...emptyAllBotWallets(), ...p }; }
    } catch {}
    return emptyAllBotWallets();
  });

  // Carrega wallets do MySQL no mount — backend opera 24/7 mesmo com browser fechado
  useEffect(() => {
    fetch(`${API}/cripto/wallets/bot`)
      .then(r => r.ok ? r.json() : null)
      .then((data) => {
        if (!data || Object.keys(data).length === 0) return;
        const temDadosReais = Object.values(data).some(
          (w: any) => (Array.isArray(w.trades) && w.trades.length > 0) ||
            Object.keys((w.positions as Record<string, unknown>) ?? {}).filter(k => k !== "_learned").length > 0
        );
        if (!temDadosReais) return;
        const merged = emptyAllBotWallets();
        for (const [bid, w] of Object.entries(data as Record<string, any>)) {
          if (!merged[bid]) continue;
          const learnedRaw = (w.positions as any)?._learned;
          const learned: BotLearned = learnedRaw
            ? { score_min_adj: learnedRaw.score_min_adj ?? 0, stake_mult: learnedRaw.stake_mult ?? 1, generation: learnedRaw.trades_avaliados ? Math.floor(learnedRaw.trades_avaliados / 10) : 0, log: [] }
            : emptyBotLearned();
          const positions = Object.fromEntries(Object.entries(w.positions ?? {}).filter(([k]) => k !== "_learned")) as Record<string, FuturesPos>;
          merged[bid] = {
            ...merged[bid],
            saldo_livre: w.saldo_livre ?? merged[bid].saldo_livre,
            positions,
            trades: Array.isArray(w.trades) ? w.trades : [],
            learned,
          };
        }
        setBotWallets(merged);
        try { localStorage.setItem(BOT_WALLET_KEY, JSON.stringify(merged)); } catch {}
      }).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const lastScanTs = useRef<number>(0);

  useEffect(() => {
    if (!scan?.geral?.length) return;
    const ts = scan.atualizado ?? 0;
    if (ts && ts <= lastScanTs.current) return;
    lastScanTs.current = ts || Date.now();

    setBotWallets(prev => {
      const next = { ...prev };
      for (const bot of BOT_PROFILES) {
        const wallet = next[bot.id] ?? emptyBotWallet(bot.capital);
        const { wallet: newW, newTrades } = runBotCycle(bot, wallet, scan);
        // Update last_price on existing positions
        const updPos = { ...newW.positions };
        for (const item of scan.geral) {
          if (updPos[item.simbolo] && item.preco) {
            updPos[item.simbolo] = { ...updPos[item.simbolo], last_price_brl: item.preco * (scan.usd_brl ?? 5.2), last_usd_brl: scan.usd_brl ?? 5.2 };
          }
        }
        const finalW = { ...newW, positions: updPos };
        next[bot.id] = finalW;
        if (newTrades.length > 0) {
          newTrades.forEach(t => _syncBotTrade(t, bot.id));
          _syncBotWallet(bot.id, finalW);
        }
      }
      try { localStorage.setItem(BOT_WALLET_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, [scan]); // eslint-disable-line react-hooks/exhaustive-deps

  const resetBot = useCallback((botId: string) => {
    const bot = BOT_PROFILES.find(b => b.id === botId);
    if (!bot) return;
    setBotWallets(prev => {
      const next = { ...prev, [botId]: emptyBotWallet(bot.capital) };
      try { localStorage.setItem(BOT_WALLET_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
    fetch(`${API}/cripto/wallets/bot/${botId}?saldo_inicial=${bot.capital}`, { method: "DELETE" }).catch(() => {});
  }, []);

  const resetAllBots = useCallback(() => {
    const w = emptyAllBotWallets();
    setBotWallets(w);
    try { localStorage.setItem(BOT_WALLET_KEY, JSON.stringify(w)); } catch {}
  }, []);

  return { botWallets, resetBot, resetAllBots };
}

function useFuturesWallet() {
  const [wallets, setWallets] = useState<Record<string, FuturesWallet>>(() => {
    try {
      const s = localStorage.getItem(FUT_WALLET_KEY);
      if (s) { const p = JSON.parse(s); return { ...emptyMultiFutures(), ...p }; }
    } catch {}
    return emptyMultiFutures();
  });

  // Carrega do backend na montagem
  // Se backend tem dados reais → usa backend (source of truth)
  // Se backend vazio ou só padrão → mantém localStorage e migra para backend
  useEffect(() => {
    const localSnapshot = wallets; // snapshot do localStorage capturado no useState
    fetch(`${API}/cripto/wallets/futures`)
      .then(r => r.ok ? r.json() : null)
      .then((data: Record<string, FuturesWallet> | null) => {
        if (!data || Object.keys(data).length === 0) {
          // Backend vazio → migrar localStorage para backend
          _pushFuturesLocalToBackend(localSnapshot);
          return;
        }
        // Verificar se backend tem dados reais (trades ou posições abertas)
        const temDadosReais = Object.values(data).some(
          (w: FuturesWallet) => (Array.isArray(w.trades) && w.trades.length > 0) ||
            Object.keys((w.positions as Record<string, unknown>) ?? {}).length > 0
        );
        if (!temDadosReais) {
          // Backend só tem carteiras padrão zeradas (worker inicializou sem trades)
          // → manter localStorage e migrar dados reais para backend
          _pushFuturesLocalToBackend(localSnapshot);
          return;
        }
        // Backend tem trades/posições reais → usar como source of truth
        const merged = { ...emptyMultiFutures() };
        for (const [pid, w] of Object.entries(data)) {
          if (merged[pid]) {
            merged[pid] = {
              ...merged[pid],
              saldo_livre: w.saldo_livre ?? merged[pid].saldo_livre,
              positions:   w.positions   ?? {},
              trades:      Array.isArray(w.trades) ? w.trades : [],
            };
          }
        }
        setWallets(merged);
        try { localStorage.setItem(FUT_WALLET_KEY, JSON.stringify(merged)); } catch {}
      })
      .catch(() => { /* usa localStorage */ });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const persist = (next: Record<string, FuturesWallet>) => {
    try { localStorage.setItem(FUT_WALLET_KEY, JSON.stringify(next)); } catch {}
    return next;
  };
  const upd = (fn: (p: Record<string, FuturesWallet>) => Record<string, FuturesWallet>) =>
    setWallets(prev => persist(fn(prev)));

  const abrirFutures = useCallback((perfilId: string, simbolo: string, price_brl: number, usd_brl: number, score: number, direction: "LONG" | "SHORT", auto = false, grade = "") => {
    const cfg = PERFIS_FUTURES.find(p => p.id === perfilId);
    if (!cfg) return;
    upd(prev => {
      const w = prev[perfilId];
      if (!w || w.positions[simbolo]) return prev;
      const stakeBase = cfg.stake_base ?? TRADE_SIZE;
      const stakeAlvo = (cfg.stake_dupla_score != null && score >= cfg.stake_dupla_score) ? stakeBase * 2 : stakeBase;
      const amount = Math.min(stakeAlvo, w.saldo_livre);
      if (amount < 50) return prev;
      const fee = amount * FEE_RATE;
      const units = (amount - fee) / price_brl;
      const sl_price = direction === "LONG" ? price_brl * (1 - cfg.sl_pct) : price_brl * (1 + cfg.sl_pct);
      const tp_price = direction === "LONG" ? price_brl * (1 + cfg.tp_pct) : price_brl * (1 - cfg.tp_pct);
      const pos: FuturesPos = {
        simbolo, direction, units, amount_brl: amount,
        entry_price_brl: price_brl, last_price_brl: price_brl, last_usd_brl: usd_brl,
        time: Date.now(), score_entry: score,
        stop_loss_price: sl_price, take_profit_price: tp_price,
        sl_pct: cfg.sl_pct, tp_pct: cfg.tp_pct,
      };
      const trade: FuturesTrade = {
        id: `${Date.now()}-${perfilId}-${simbolo}-C`, simbolo, tipo: "C", direction,
        price_brl, amount_brl: amount, fee, time: Date.now(), score, auto, grade,
        motivo_entrada: `Score ${score} | ${cfg.nome} ${cfg.nivel} | ${direction}${cfg.stake_dupla_score != null && score >= cfg.stake_dupla_score ? " | STAKE DOBRADA" : ""}`,
      };
      const next = { ...prev, [perfilId]: { ...w, saldo_livre: w.saldo_livre - amount, positions: { ...w.positions, [simbolo]: pos }, trades: [...w.trades, trade] } };
      // Sync assíncrono sem bloquear UI
      _syncTrade(trade, perfilId);
      _syncWallet(perfilId, next[perfilId]);
      return next;
    });
  }, []);

  const fecharFutures = useCallback((perfilId: string, simbolo: string, price_brl: number, usd_brl: number, score: number, auto = false, motivo_saida?: string) => {
    upd(prev => {
      const w = prev[perfilId];
      if (!w) return prev;
      const pos = w.positions[simbolo];
      if (!pos) return prev;
      const sell_value = pos.units * price_brl;
      const pnl_brl = pos.direction === "LONG" ? sell_value - pos.amount_brl : pos.amount_brl - sell_value;
      const trade: FuturesTrade = {
        id: `${Date.now()}-${perfilId}-${simbolo}-V`, simbolo, tipo: "V", direction: pos.direction,
        price_brl, amount_brl: sell_value, pnl_brl, pct: (pnl_brl / pos.amount_brl) * 100,
        time: Date.now(), score, auto, motivo_saida,
      };
      const { [simbolo]: _r, ...rest } = w.positions;
      const devolver = pos.amount_brl + pnl_brl;
      const next = { ...prev, [perfilId]: { ...w, saldo_livre: w.saldo_livre + devolver, positions: rest, trades: [...w.trades, trade] } };
      _syncTrade(trade, perfilId);
      _syncWallet(perfilId, next[perfilId]);
      return next;
    });
  }, []);

  const atualizarTodos = useCallback((items: FuturesItem[] | undefined) => {
    if (!Array.isArray(items)) return;
    upd(prev => {
      const next = { ...prev };
      for (const [pid, w] of Object.entries(next)) {
        const np = { ...w.positions }; let ch = false;
        for (const it of items) {
          if (np[it.simbolo]) {
            const usd = it.usd_brl ?? np[it.simbolo].last_usd_brl;
            np[it.simbolo] = { ...np[it.simbolo], last_price_brl: it.preco * usd, last_usd_brl: usd };
            ch = true;
          }
        }
        if (ch) next[pid] = { ...w, positions: np };
      }
      return next;
    });
  }, []);

  const resetPerfil = useCallback((perfilId: string) => {
    const cfg = PERFIS_FUTURES.find(p => p.id === perfilId);
    const cap = cfg?.capital_inicial ?? 100000;
    upd(prev => ({ ...prev, [perfilId]: emptyFuturesWallet(cap) }));
    // Reset no backend
    fetch(`${API}/cripto/wallets/futures/${perfilId}?saldo_inicial=${cap}`, { method: "DELETE" }).catch(() => {});
  }, []);

  const resetAll = useCallback(() => {
    const w = emptyMultiFutures();
    setWallets(w);
    try { localStorage.setItem(FUT_WALLET_KEY, JSON.stringify(w)); } catch {}
  }, []);

  return { wallets, abrirFutures, fecharFutures, atualizarTodos, resetPerfil, resetAll };
}

function useFuturesBanco() {
  const [banco, setBanco] = useState<FuturesBancoEntry[]>(() => {
    try { const s = localStorage.getItem(FUT_BANCO_KEY); return s ? JSON.parse(s) : []; } catch { return []; }
  });
  const salvar = useCallback((entries: FuturesBancoEntry[]) => {
    setBanco(prev => { const next = [...entries, ...prev]; try { localStorage.setItem(FUT_BANCO_KEY, JSON.stringify(next)); } catch {} return next; });
  }, []);
  const removerData = useCallback((data: string) => {
    setBanco(prev => { const next = prev.filter(e => e.data !== data); try { localStorage.setItem(FUT_BANCO_KEY, JSON.stringify(next)); } catch {} return next; });
  }, []);
  return { banco, salvar, removerData };
}

// ── IA helpers ────────────────────────────────────────────────────────────────

function contarSinaisAtivos(cfg: FuturesPerfilConfig, items: FuturesItem[]): number {
  let n = 0;
  for (const it of items) {
    if (podeEntrarFutures(cfg, it)) n++;
  }
  return n;
}

function calcIAScore(stats: ReturnType<typeof calcFuturesStats>): number | null {
  if (stats.ops === 0) return null;
  const roiScore = Math.min(100, Math.max(0, stats.roi + 50));
  const pfScore  = Math.min(100, stats.profit_factor * 33);
  const ddPen    = Math.min(50, stats.drawdown);
  return roiScore * 0.35 + stats.win_rate * 0.30 + pfScore * 0.20 - ddPen * 0.15;
}

function walletToFuturesBancoEntry(cfg: FuturesPerfilConfig, w: FuturesWallet): FuturesBancoEntry {
  const s     = calcFuturesStats(w);
  const taxas = w.trades.filter(t => t.tipo === "C").reduce((a, t) => a + (t.fee ?? 0), 0);
  const now   = new Date();
  return {
    id: `${cfg.id}-${Date.now()}`, ts: Date.now(),
    data: now.toLocaleDateString("pt-BR"), hora: now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
    perfil_id: cfg.id, perfil_nome: cfg.nome, perfil_nivel: cfg.nivel,
    perfil_emoji: cfg.emoji, perfil_cor: cfg.cor,
    capital: s.capital, saldo_livre: w.saldo_livre,
    pnl: s.pnl, roi: s.roi, ops_fechadas: s.ops, win_rate: s.win_rate,
    profit_factor: s.profit_factor, drawdown: s.drawdown, total_taxas: taxas,
    n_posicoes: s.posicoes, trades: w.trades,
  };
}

// ── Ranking View ──────────────────────────────────────────────────────────────

function FuturesRankingView({ scan, btcDom }: { scan: FuturesScanData | null; btcDom?: number }) {
  const [tab, setTab]     = useState<"geral" | "long" | "short" | "ist">("geral");
  const [expanded, setExpanded] = useState<string | null>(null);

  const items: FuturesItem[] = !scan ? [] :
    tab === "long"  ? (scan.top_long  ?? []) :
    tab === "short" ? (scan.top_short ?? []) :
    tab === "ist"   ? (scan.top_ist   ?? []) : (scan.geral ?? []);

  const longCount  = scan?.geral?.filter(i => i.direction === "LONG"  && i.operar).length ?? 0;
  const shortCount = scan?.geral?.filter(i => i.direction === "SHORT" && i.operar).length ?? 0;

  return (
    <div className="space-y-4">
      {/* Market overview strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "BTC Dominância", val: btcDom != null ? `${btcDom.toFixed(1)}%` : "—", cor: "#f59e0b" },
          { label: "Sinais LONG", val: String(longCount), cor: "#10b981" },
          { label: "Sinais SHORT", val: String(shortCount), cor: "#ef4444" },
          { label: "Total Analisados", val: String(scan?.total ?? 0), cor: "#6b7280" },
        ].map(({ label, val, cor }) => (
          <div key={label} className="p-3 rounded-xl border border-[var(--border)] bg-[var(--bg-card)]">
            <div className="text-[10px] text-[var(--text-secondary)]">{label}</div>
            <div className="text-xl font-black mt-1" style={{ color: cor }}>{val}</div>
          </div>
        ))}
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-2 flex-wrap">
        {([["geral", "Geral"], ["long", `LONG (${longCount})`], ["short", `SHORT (${shortCount})`], ["ist", "Top IST"]] as const).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${tab === k
              ? k === "long" ? "bg-emerald-500 text-white" : k === "short" ? "bg-red-500 text-white" : "bg-[var(--text-primary)] text-[var(--bg)]"
              : "bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text-secondary)]"}`}>
            {label}
          </button>
        ))}
      </div>

      {!scan && <div className="text-center py-16 text-[var(--text-secondary)] text-sm">Carregando análise de futuros...</div>}

      {scan && items.length === 0 && (
        <div className="text-center py-12 text-[var(--text-secondary)] text-sm">Nenhum sinal nesta categoria</div>
      )}

      {/* Table */}
      {items.length > 0 && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full" style={{ fontSize: "11px" }}>
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--bg)] text-[var(--text-secondary)] text-[10px] uppercase">
                  <th className="px-3 py-2.5 text-left">Ativo</th>
                  <th className="px-3 py-2.5 text-center">Grade</th>
                  <th className="px-3 py-2.5 text-center">Direção</th>
                  <th className="px-3 py-2.5 text-right">Score Final</th>
                  <th className="px-3 py-2.5 text-left" style={{ minWidth: "160px" }}>Scores (T/F/C/Fund)</th>
                  <th className="px-3 py-2.5 text-right">IST</th>
                  <th className="px-3 py-2.5 text-right">OI Δ%</th>
                  <th className="px-3 py-2.5 text-right">Funding</th>
                  <th className="px-3 py-2.5 text-left">L/S</th>
                  <th className="px-3 py-2.5 text-right">Var 24h</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, i) => {
                  const isOpen = expanded === it.simbolo;
                  return (
                    <Fragment key={it.simbolo}>
                      <tr
                        onClick={() => setExpanded(isOpen ? null : it.simbolo)}
                        className={`border-b border-[var(--border)]/40 hover:bg-[var(--bg)] transition-colors cursor-pointer ${i % 2 === 0 ? "" : "bg-[var(--bg)]/30"}`}>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-2">
                            <span className="text-base">{COIN_EMOJI[it.simbolo] ?? it.simbolo[0]}</span>
                            <div>
                              <div className="font-bold text-[var(--text-primary)]">{it.simbolo}</div>
                              <div className="text-[9px] text-[var(--text-secondary)]">R$ {it.preco && it.usd_brl ? fmt(it.preco * it.usd_brl, 2) : "—"}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-center"><GradeBadge grade={it.grade} /></td>
                        <td className="px-3 py-2.5 text-center"><DirectionBadge dir={it.direction} confidence={it.direction_confidence} /></td>
                        <td className="px-3 py-2.5 text-right">
                          <span className="font-black text-sm" style={{ color: gradeColor(it.grade) }}>{it.score_final.toFixed(0)}</span>
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="grid grid-cols-4 gap-1" style={{ minWidth: "160px" }}>
                            <ScoreBar val={it.score_tecnico}    label="TEC" color="#3b82f6" />
                            <ScoreBar val={it.score_fluxo}      label="FLX" color="#a855f7" />
                            <ScoreBar val={it.score_contexto}   label="CTX" color="#f59e0b" />
                            <ScoreBar val={it.score_fundamental} label="FND" color="#10b981" />
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <span className="font-bold" style={{ color: it.ist >= 70 ? "#10b981" : it.ist >= 50 ? "#f59e0b" : "#ef4444" }}>
                            {it.ist.toFixed(0)}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-right font-bold" style={{ color: (it.oi_change_pct ?? 0) >= 0 ? "#10b981" : "#ef4444" }}>
                          {it.oi_change_pct != null ? `${it.oi_change_pct >= 0 ? "+" : ""}${it.oi_change_pct.toFixed(2)}%` : "—"}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <span style={{ color: fundingColor(it.funding_class) }}>
                            {it.funding_rate != null ? `${(it.funding_rate * 100).toFixed(4)}%` : "—"}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          {it.long_pct != null ? (
                            <div className="flex items-center gap-1">
                              <div className="h-2 rounded-full overflow-hidden flex" style={{ width: "60px" }}>
                                <div style={{ width: `${it.long_pct}%`, background: "#10b981" }} />
                                <div style={{ width: `${it.short_pct ?? (100 - it.long_pct)}%`, background: "#ef4444" }} />
                              </div>
                              <span className="text-[9px] text-emerald-400">{it.long_pct.toFixed(0)}%</span>
                            </div>
                          ) : "—"}
                        </td>
                        <td className="px-3 py-2.5 text-right font-bold" style={{ color: (it.var24h ?? 0) >= 0 ? "#10b981" : "#ef4444" }}>
                          {it.var24h != null ? `${it.var24h >= 0 ? "+" : ""}${it.var24h.toFixed(2)}%` : "—"}
                        </td>
                      </tr>
                      {isOpen && (
                        <tr key={`${it.simbolo}-exp`} className="bg-[var(--bg)]/80">
                          <td colSpan={10} className="px-4 py-3">
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[10px]">
                              {[
                                { label: "Score Técnico",       val: it.score_tecnico.toFixed(0),    cor: "#3b82f6" },
                                { label: "Score Fluxo",         val: it.score_fluxo.toFixed(0),      cor: "#a855f7" },
                                { label: "Score Contexto",      val: it.score_contexto.toFixed(0),   cor: "#f59e0b" },
                                { label: "Score Fundamental",   val: it.score_fundamental.toFixed(0),cor: "#10b981" },
                                { label: "IST",                 val: it.ist.toFixed(0),              cor: it.ist >= 70 ? "#10b981" : "#f59e0b" },
                                { label: "Confiança Direção",   val: `${it.direction_confidence.toFixed(0)}%`, cor: directionColor(it.direction) },
                                { label: "Alavancagem sugerida",val: `${it.leverage_suggested ?? 1}x`, cor: "#6b7280" },
                                { label: "Funding Class",       val: it.funding_class ?? "—",        cor: fundingColor(it.funding_class) },
                              ].map(({ label, val, cor }) => (
                                <div key={label} className="p-2 rounded-lg border border-[var(--border)] bg-[var(--bg-card)]">
                                  <div className="text-[var(--text-secondary)] mb-1">{label}</div>
                                  <div className="font-black text-sm" style={{ color: cor }}>{val}</div>
                                </div>
                              ))}
                            </div>
                            {it.squeeze_type && (
                              <div className="mt-2 px-3 py-1.5 rounded-lg inline-block text-xs font-bold" style={{ background: "#f59e0b20", color: "#f59e0b", border: "1px solid #f59e0b40" }}>
                                ⚡ {it.squeeze_type} detectado
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Carteira View ─────────────────────────────────────────────────────────────

function FuturesCarteiraView({ wallet, cfg, onFechar, onReset, onAtualizar, onSalvarBanco, autoTrade, setAutoTrade }:
  { wallet: FuturesWallet; cfg?: FuturesPerfilConfig; onFechar: (s: string) => void; onReset: () => void; onAtualizar: () => Promise<void>; onSalvarBanco?: () => void; autoTrade: boolean; setAutoTrade: (v: boolean) => void }) {

  const [atualizando, setAtualizando] = useState(false);
  const handleAtualizar = async () => { setAtualizando(true); try { await onAtualizar(); } finally { setAtualizando(false); } };

  const stats    = calcFuturesStats(wallet);
  const positions = Object.values(wallet.positions);
  const ops       = wallet.trades;
  const vendas    = ops.filter(t => t.tipo === "V");

  const saldo_total = wallet.saldo_livre + positions.reduce((a, p) => {
    const curr = p.last_price_brl;
    const pnl  = p.direction === "LONG" ? (curr - p.entry_price_brl) * p.units : (p.entry_price_brl - curr) * p.units;
    return a + p.amount_brl + pnl;
  }, 0);
  const pnl_total = saldo_total - wallet.saldo_inicial;
  const pct_total = wallet.saldo_inicial > 0 ? (pnl_total / wallet.saldo_inicial) * 100 : 0;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          {cfg && <span className="text-xl">{cfg.emoji}</span>}
          <div>
            <h2 className="text-lg font-black text-[var(--text-primary)]">
              {cfg ? `${cfg.nome} ${cfg.nivel}` : "Futures"} — <span className="text-base font-semibold" style={{ color: cfg?.direction_allowed === "LONG" ? "#10b981" : "#a855f7" }}>{cfg?.direction_allowed ?? "LONG/SHORT"}</span>
            </h2>
            <p className="text-xs text-[var(--text-secondary)]">
              {ops.length} operações • Stake R$ {(cfg?.stake_base ?? 1000).toLocaleString("pt-BR")} • SL {((cfg?.sl_pct ?? 0.02) * 100).toFixed(1)}% / TP {((cfg?.tp_pct ?? 0.05) * 100).toFixed(1)}%
            </p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={handleAtualizar} disabled={atualizando}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] text-xs font-semibold text-[var(--text-secondary)] hover:text-blue-400 transition-all disabled:opacity-50">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={atualizando ? "animate-spin" : ""}>
              <path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
            </svg>
            {atualizando ? "Atualizando..." : "Atualizar"}
          </button>
          <button onClick={() => setAutoTrade(!autoTrade)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-semibold transition-all ${
              autoTrade ? "bg-emerald-500/20 border-emerald-500 text-emerald-400" : "bg-[var(--bg-card)] border-[var(--border)] text-[var(--text-secondary)]"
            }`}>
            <span className={`w-2 h-2 rounded-full ${autoTrade ? "bg-emerald-400 animate-pulse" : "bg-gray-500"}`} />
            Auto Trade {autoTrade ? "ON" : "OFF"}
          </button>
          {onSalvarBanco && (
            <button onClick={onSalvarBanco} className="px-3 py-2 rounded-lg border border-blue-500/40 text-blue-400 text-xs font-semibold hover:bg-blue-500/10 transition-colors">
              Salvar Banco
            </button>
          )}
          <button onClick={onReset} className="px-3 py-2 rounded-lg border border-red-500/30 text-red-400 text-xs hover:bg-red-500/10 transition-colors">Zerar</button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Saldo Total", val: `R$ ${fmt(saldo_total, 2)}`, cor: "var(--text-primary)" },
          { label: "P&L Total", val: `${pnl_total >= 0 ? "+" : ""}R$ ${fmt(Math.abs(pnl_total), 2)}`, cor: pnl_total >= 0 ? "#10b981" : "#ef4444", sub: `${pct_total >= 0 ? "+" : ""}${pct_total.toFixed(2)}%` },
          { label: "Disponível", val: `R$ ${fmt(wallet.saldo_livre, 2)}`, cor: "var(--text-primary)" },
          { label: "Win Rate", val: stats.win_rate > 0 ? `${stats.win_rate.toFixed(0)}%` : "—", cor: stats.win_rate >= 50 ? "#10b981" : "#ef4444", sub: `${vendas.length} fechadas` },
        ].map(({ label, val, cor, sub }) => (
          <div key={label} className="p-3 rounded-xl border border-[var(--border)] bg-[var(--bg-card)]">
            <div className="text-[10px] text-[var(--text-secondary)] mb-1">{label}</div>
            <div className="font-black text-base leading-tight" style={{ color: cor }}>{val}</div>
            {sub && <div className="text-[10px] font-semibold mt-0.5" style={{ color: cor }}>{sub}</div>}
          </div>
        ))}
      </div>

      {/* Posições abertas */}
      {positions.length > 0 && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--border)] font-semibold text-sm">Posições Abertas ({positions.length})</div>
          <div className="divide-y divide-[var(--border)]">
            {positions.map(p => {
              const curr = p.last_price_brl;
              const pnl  = p.direction === "LONG" ? (curr - p.entry_price_brl) * p.units : (p.entry_price_brl - curr) * p.units;
              const pct  = (pnl / p.amount_brl) * 100;
              const dir_c = directionColor(p.direction);
              const dur   = Math.floor((Date.now() - p.time) / 60000);
              return (
                <div key={p.simbolo} className="flex items-center gap-3 px-4 py-3">
                  <span className="text-xl">{COIN_EMOJI[p.simbolo] ?? p.simbolo[0]}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-[var(--text-primary)]">{p.simbolo}</span>
                      <span className="text-[8px] font-black px-1.5 py-0.5 rounded" style={{ background: dir_c + "20", color: dir_c }}>{p.direction}</span>
                    </div>
                    <div className="text-[10px] text-[var(--text-secondary)]">
                      Entrada R$ {fmt(p.entry_price_brl, 2)} • {dur < 60 ? `${dur}min` : `${Math.floor(dur/60)}h`} atrás
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`font-bold text-sm ${pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>{pnl >= 0 ? "+" : ""}R$ {fmt(Math.abs(pnl), 2)}</div>
                    <div className={`text-[10px] ${pct >= 0 ? "text-emerald-400" : "text-red-400"}`}>{pct >= 0 ? "+" : ""}{pct.toFixed(2)}%</div>
                  </div>
                  <div className="text-right text-[9px] text-[var(--text-secondary)]">
                    <div>SL R$ {fmt(p.stop_loss_price ?? 0, 2)}</div>
                    <div>TP R$ {fmt(p.take_profit_price ?? 0, 2)}</div>
                  </div>
                  <button onClick={() => onFechar(p.simbolo)}
                    className="px-3 py-1.5 rounded-lg border border-red-500/30 text-red-400 text-xs hover:bg-red-500/10 transition-colors ml-2">
                    Fechar
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Histórico de trades */}
      {vendas.length > 0 && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--border)] font-semibold text-sm">Histórico ({vendas.length} operações)</div>
          <div className="overflow-x-auto">
            <table className="w-full" style={{ fontSize: "11px" }}>
              <thead>
                <tr className="bg-[var(--bg)] border-b border-[var(--border)] text-[var(--text-secondary)] text-[9px] uppercase">
                  <th className="px-3 py-2 text-left">Ativo</th>
                  <th className="px-3 py-2 text-center">Dir</th>
                  <th className="px-3 py-2 text-right">Entrada</th>
                  <th className="px-3 py-2 text-right">Saída</th>
                  <th className="px-3 py-2 text-right">P&L</th>
                  <th className="px-3 py-2 text-right">%</th>
                  <th className="px-3 py-2 text-right">Status</th>
                </tr>
              </thead>
              <tbody>
                {[...vendas].reverse().map((t, i) => {
                  const buy = ops.find(b => b.tipo === "C" && b.simbolo === t.simbolo && b.time < t.time);
                  const pnl = t.pnl_brl ?? 0;
                  return (
                    <tr key={t.id} className={`border-b border-[var(--border)]/30 ${i % 2 === 0 ? "" : "bg-[var(--bg)]/40"}`}>
                      <td className="px-3 py-2 font-bold">{t.simbolo}</td>
                      <td className="px-3 py-2 text-center">
                        <DirectionBadge dir={t.direction} />
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-blue-400">R$ {buy ? fmt(buy.price_brl, 2) : "—"}</td>
                      <td className="px-3 py-2 text-right font-mono text-amber-400">R$ {fmt(t.price_brl, 2)}</td>
                      <td className="px-3 py-2 text-right font-bold" style={{ color: pnl >= 0 ? "#10b981" : "#ef4444" }}>
                        {pnl >= 0 ? "+" : ""}R$ {fmt(Math.abs(pnl), 2)}
                      </td>
                      <td className="px-3 py-2 text-right font-bold" style={{ color: (t.pct ?? 0) >= 0 ? "#10b981" : "#ef4444" }}>
                        {(t.pct ?? 0) >= 0 ? "+" : ""}{(t.pct ?? 0).toFixed(2)}%
                      </td>
                      <td className="px-3 py-2 text-right">
                        {pnl >= 0
                          ? <span className="text-[8px] font-bold text-emerald-400 bg-emerald-400/10 px-1.5 py-0.5 rounded">WIN</span>
                          : <span className="text-[8px] font-bold text-red-400 bg-red-400/10 px-1.5 py-0.5 rounded">LOSS</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {ops.length === 0 && (
        <div className="text-center py-12 text-[var(--text-secondary)] text-sm">
          Nenhuma operação ainda. {autoTrade ? "Auto trade ativo — aguardando sinais." : "Ative o Auto Trade."}
        </div>
      )}
    </div>
  );
}

// ── Comparativo View ──────────────────────────────────────────────────────────

function FuturesComparativoView({ wallets, onSelect, onResetAll }: { wallets: Record<string, FuturesWallet>; onSelect: (id: string) => void; onResetAll: () => void }) {
  const rows = PERFIS_FUTURES.map(cfg => ({ cfg, stats: calcFuturesStats(wallets[cfg.id] ?? emptyFuturesWallet(cfg.capital_inicial)) }));
  rows.sort((a, b) => b.stats.roi - a.stats.roi);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-black text-[var(--text-primary)]">Comparativo Futures</h2>
          <p className="text-[11px] text-[var(--text-secondary)]">16 carteiras independentes • LONG & SHORT • Capital R$ 100.000</p>
        </div>
        <button onClick={onResetAll} className="px-3 py-1.5 rounded-lg border border-red-500/30 text-red-400 text-xs hover:bg-red-500/10 transition-colors">Zerar Todas</button>
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full" style={{ fontSize: "11px" }}>
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--bg)] text-[var(--text-secondary)] text-[10px] uppercase">
                <th className="px-3 py-2.5 text-left">Perfil</th>
                <th className="px-3 py-2.5 text-center">Dir</th>
                <th className="px-3 py-2.5 text-right">Capital</th>
                <th className="px-3 py-2.5 text-right">ROI%</th>
                <th className="px-3 py-2.5 text-right">P&L</th>
                <th className="px-3 py-2.5 text-right">Win Rate</th>
                <th className="px-3 py-2.5 text-right">P. Factor</th>
                <th className="px-3 py-2.5 text-right">Drawdown</th>
                <th className="px-3 py-2.5 text-right">Ops</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ cfg, stats }, i) => (
                <tr key={cfg.id} onClick={() => onSelect(cfg.id)}
                  className={`border-b border-[var(--border)]/40 hover:bg-[var(--bg)] cursor-pointer transition-colors ${i === 0 ? "bg-emerald-500/3" : ""}`}>
                  <td className="px-3 py-2.5">
                    <span className="mr-1">{cfg.emoji}</span>
                    <span className="font-bold">{cfg.nome}</span>
                    <span className="ml-1 text-[9px] font-semibold" style={{ color: cfg.cor }}>{cfg.nivel}</span>
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <span className="text-[9px] font-bold" style={{ color: cfg.direction_allowed === "LONG" ? "#10b981" : "#a855f7" }}>
                      {cfg.direction_allowed}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono">R$ {fmt(stats.capital, 2)}</td>
                  <td className="px-3 py-2.5 text-right font-bold" style={{ color: stats.roi >= 0 ? "#10b981" : "#ef4444" }}>
                    {stats.roi >= 0 ? "+" : ""}{stats.roi.toFixed(2)}%
                  </td>
                  <td className="px-3 py-2.5 text-right" style={{ color: stats.pnl >= 0 ? "#10b981" : "#ef4444" }}>
                    {stats.pnl >= 0 ? "+" : ""}R$ {fmt(Math.abs(stats.pnl), 2)}
                  </td>
                  <td className="px-3 py-2.5 text-right" style={{ color: stats.win_rate >= 50 ? "#10b981" : "#ef4444" }}>
                    {stats.ops > 0 ? `${stats.win_rate.toFixed(0)}%` : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-right" style={{ color: stats.profit_factor >= 1 ? "#10b981" : "#ef4444" }}>
                    {stats.ops > 0 ? (stats.profit_factor === 999 ? "∞" : stats.profit_factor.toFixed(2)) : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-right text-red-400">{stats.drawdown > 0 ? `${stats.drawdown.toFixed(1)}%` : "—"}</td>
                  <td className="px-3 py-2.5 text-right text-[var(--text-secondary)]">{stats.ops}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Banco View ────────────────────────────────────────────────────────────────

function FuturesBancoView({ banco, onSalvarTodos, onRemoverData }: { banco: FuturesBancoEntry[]; onSalvarTodos: () => void; onRemoverData: (d: string) => void }) {
  const [expandData, setExpandData] = useState<string | null>(null);

  const porData = banco.reduce<Record<string, FuturesBancoEntry[]>>((acc, e) => {
    if (!acc[e.data]) acc[e.data] = [];
    acc[e.data].push(e);
    return acc;
  }, {});
  const datas = Object.keys(porData).sort((a, b) => {
    const pa = a.split("/").reverse().join("-"); const pb = b.split("/").reverse().join("-");
    return pb.localeCompare(pa);
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-black text-[var(--text-primary)]">Banco Futures</h2>
          <p className="text-xs text-[var(--text-secondary)]">{datas.length} dias • {banco.length} registros</p>
        </div>
        <button onClick={onSalvarTodos} className="px-4 py-2 rounded-lg bg-blue-500 text-white text-sm font-bold hover:bg-blue-600 transition-colors">
          Salvar Todos Agora
        </button>
      </div>

      {banco.length === 0 && (
        <div className="text-center py-16 text-[var(--text-secondary)]">
          <div className="text-4xl mb-3">📊</div>
          <div className="font-semibold">Banco vazio</div>
          <div className="text-xs mt-1">Salve um registro pelo botão na Carteira</div>
        </div>
      )}

      {datas.map(data => {
        const entries  = porData[data];
        const totalPnl = entries.reduce((a, e) => a + e.pnl, 0);
        const aberto   = expandData === data;
        return (
          <div key={data} className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-[var(--bg)] transition-colors"
              onClick={() => setExpandData(aberto ? null : data)}>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-blue-500/15 text-blue-400 flex items-center justify-center font-black">{data.split("/")[0]}</div>
                <div>
                  <div className="font-bold text-sm">{data}</div>
                  <div className="text-[10px] text-[var(--text-secondary)]">{entries.length} perfis</div>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className={`font-black text-base ${totalPnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {totalPnl >= 0 ? "+" : ""}R$ {fmt(Math.abs(totalPnl), 2)}
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={e => { e.stopPropagation(); if (confirm(`Remover ${data}?`)) onRemoverData(data); }}
                    className="px-2 py-1 rounded border border-red-500/20 text-red-400 text-[10px] hover:bg-red-500/10">✕</button>
                  <span className="text-[var(--text-secondary)] text-sm">{aberto ? "▲" : "▼"}</span>
                </div>
              </div>
            </div>
            {aberto && (
              <div className="border-t border-[var(--border)] p-4 overflow-x-auto">
                <table className="w-full" style={{ fontSize: "11px" }}>
                  <thead>
                    <tr className="bg-[var(--bg)] border-b border-[var(--border)] text-[var(--text-secondary)] text-[9px] uppercase">
                      <th className="px-3 py-2 text-left">Perfil</th>
                      <th className="px-3 py-2 text-right">Capital</th>
                      <th className="px-3 py-2 text-right">P&L</th>
                      <th className="px-3 py-2 text-right">ROI</th>
                      <th className="px-3 py-2 text-right">Win Rate</th>
                      <th className="px-3 py-2 text-right">Ops</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.sort((a, b) => b.roi - a.roi).map((e, i) => (
                      <tr key={e.id} className={`border-b border-[var(--border)]/30 ${i % 2 === 0 ? "" : "bg-[var(--bg)]/40"}`}>
                        <td className="px-3 py-2"><span className="mr-1">{e.perfil_emoji}</span><span className="font-semibold">{e.perfil_nome}</span><span className="ml-1 text-[9px]" style={{ color: e.perfil_cor }}>{e.perfil_nivel}</span></td>
                        <td className="px-3 py-2 text-right font-mono">R$ {fmt(e.capital, 2)}</td>
                        <td className="px-3 py-2 text-right font-bold" style={{ color: e.pnl >= 0 ? "#10b981" : "#ef4444" }}>{e.pnl >= 0 ? "+" : ""}R$ {fmt(Math.abs(e.pnl), 2)}</td>
                        <td className="px-3 py-2 text-right font-bold" style={{ color: e.roi >= 0 ? "#10b981" : "#ef4444" }}>{e.roi >= 0 ? "+" : ""}{e.roi.toFixed(2)}%</td>
                        <td className="px-3 py-2 text-right" style={{ color: e.win_rate >= 50 ? "#10b981" : "#ef4444" }}>{e.ops_fechadas > 0 ? `${e.win_rate.toFixed(0)}%` : "—"}</td>
                        <td className="px-3 py-2 text-right text-[var(--text-secondary)]">{e.ops_fechadas}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Bot UI ────────────────────────────────────────────────────────────────────

function calcBotStats(w: BotWallet) { return calcFuturesStats(w as unknown as FuturesWallet); }

function BotCard({ bot, wallet, rank, onSelect }: {
  bot: BotProfile; wallet: BotWallet; rank: number; onSelect: () => void;
}) {
  const stats    = calcBotStats(wallet);
  const nPos     = Object.keys(wallet.positions).length;
  const effMin   = bot.strategy.score_min + (wallet.learned?.score_min_adj ?? 0);
  const stakeEff = Math.round(bot.strategy.stake * (wallet.learned?.stake_mult ?? 1));
  const gen      = wallet.learned?.generation ?? 0;

  return (
    <div onClick={onSelect} className="relative rounded-xl border bg-[var(--bg-card)] p-4 cursor-pointer hover:shadow-lg transition-all"
      style={{ borderColor: nPos > 0 ? bot.color + "60" : "var(--border)" }}>
      {rank === 1 && stats.ops > 0 && (
        <div className="absolute -top-2.5 -right-2.5 z-10 px-2 py-0.5 rounded-full text-[9px] font-black bg-amber-400 text-black">
          #1
        </div>
      )}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-2xl">{bot.emoji}</span>
          <div>
            <div className="font-black text-sm leading-none" style={{ color: bot.color }}>{bot.name}</div>
            <div className="text-[10px] text-[var(--text-secondary)] mt-0.5 max-w-[130px] line-clamp-1">{bot.tagline}</div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {nPos > 0 && <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: bot.color }} />}
          <span className="text-[9px] font-bold" style={{ color: nPos > 0 ? bot.color : "#6b7280" }}>
            {nPos > 0 ? `${nPos}POS` : "WAIT"}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 mb-3">
        <div>
          <div className="text-[9px] text-[var(--text-secondary)]">ROI</div>
          <div className="font-black text-sm leading-none" style={{ color: stats.roi >= 0 ? "#10b981" : "#ef4444" }}>
            {stats.roi >= 0 ? "+" : ""}{stats.roi.toFixed(2)}%
          </div>
        </div>
        <div>
          <div className="text-[9px] text-[var(--text-secondary)]">Win Rate</div>
          <div className="font-bold text-sm leading-none" style={{ color: stats.win_rate >= 50 ? "#10b981" : "#ef4444" }}>
            {stats.ops > 0 ? `${stats.win_rate.toFixed(0)}%` : "—"}
          </div>
        </div>
        <div>
          <div className="text-[9px] text-[var(--text-secondary)]">P&L</div>
          <div className="font-semibold text-xs leading-none" style={{ color: stats.pnl >= 0 ? "#10b981" : "#ef4444" }}>
            {stats.pnl >= 0 ? "+" : ""}R${fmt(Math.abs(stats.pnl), 0)}
          </div>
        </div>
        <div>
          <div className="text-[9px] text-[var(--text-secondary)]">Trades</div>
          <div className="font-bold text-xs leading-none">{stats.ops}</div>
        </div>
      </div>

      {gen > 0 && (
        <div className="px-2 py-1 rounded-lg mb-2 text-[9px] font-semibold" style={{ background: bot.color + "18", color: bot.color }}>
          Gen {gen} · Score ≥{effMin} · R${stakeEff.toLocaleString("pt-BR")} stake
        </div>
      )}

      <div className="flex items-center justify-between text-[9px] text-[var(--text-secondary)]">
        <span>SL {(bot.strategy.sl_pct*100).toFixed(1)}% / TP {(bot.strategy.tp_pct*100).toFixed(1)}%</span>
        <span className="font-bold" style={{ color: bot.strategy.direction === "LONG" ? "#10b981" : bot.strategy.direction === "SHORT" ? "#ef4444" : "#a855f7" }}>
          {bot.strategy.direction}
        </span>
      </div>
    </div>
  );
}

function BotDetailView({ bot, wallet, onBack, onReset }: {
  bot: BotProfile; wallet: BotWallet; onBack: () => void; onReset: () => void;
}) {
  const stats     = calcBotStats(wallet);
  const positions = Object.values(wallet.positions);
  const vendas    = wallet.trades.filter(t => t.tipo === "V");
  const effMin    = bot.strategy.score_min + (wallet.learned?.score_min_adj ?? 0);
  const stakeEff  = Math.round(bot.strategy.stake * (wallet.learned?.stake_mult ?? 1));
  const totalBrl  = wallet.saldo_livre + positions.reduce((a, p) => a + p.amount_brl, 0);
  const pnlTotal  = totalBrl - wallet.saldo_inicial;
  const pctTotal  = wallet.saldo_inicial > 0 ? (pnlTotal / wallet.saldo_inicial) * 100 : 0;
  const gen       = wallet.learned?.generation ?? 0;

  const filters: { label: string; color: string }[] = [
    { label: bot.strategy.direction, color: bot.strategy.direction === "LONG" ? "#10b981" : bot.strategy.direction === "SHORT" ? "#ef4444" : "#a855f7" },
    { label: `Score ≥ ${effMin}`, color: bot.color },
    ...(bot.strategy.score_max ? [{ label: `Score ≤ ${bot.strategy.score_max}`, color: bot.color }] : []),
    { label: `SL ${(bot.strategy.sl_pct*100).toFixed(1)}% / TP ${(bot.strategy.tp_pct*100).toFixed(1)}%`, color: "#6b7280" },
    { label: `Stake R$${stakeEff.toLocaleString("pt-BR")}`, color: "#6b7280" },
    { label: `Max ${bot.strategy.max_positions} pos`, color: "#6b7280" },
    ...(bot.adaptive ? [{ label: "ADAPTATIVO 🧠", color: "#a855f7" }] : []),
    ...(bot.strategy.grade_required ? [{ label: `Grade: ${bot.strategy.grade_required.join("/")}`, color: "#f59e0b" }] : []),
    ...(bot.strategy.require_ist_min ? [{ label: `IST ≥ ${bot.strategy.require_ist_min}`, color: "#3b82f6" }] : []),
    ...(bot.strategy.require_funding_neg ? [{ label: "Funding NEG", color: "#10b981" }] : []),
    ...(bot.strategy.require_oi_increase ? [{ label: "OI ↑", color: "#f97316" }] : []),
    ...(bot.strategy.require_cvd_bullish ? [{ label: "CVD Bullish", color: "#22c55e" }] : []),
    ...(bot.strategy.bull_pct_min ? [{ label: `Bull ≥ ${bot.strategy.bull_pct_min}%`, color: "#10b981" }] : []),
    ...(bot.strategy.bull_pct_max ? [{ label: `Bull ≤ ${bot.strategy.bull_pct_max}%`, color: "#ef4444" }] : []),
    ...(bot.strategy.altcoin_only ? [{ label: "Altcoin only", color: "#8b5cf6" }] : []),
  ];

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">
        ← Todos os Bots
      </button>

      <div className="flex items-start justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-4xl shrink-0"
            style={{ background: bot.color + "15", border: `2px solid ${bot.color}40` }}>
            {bot.emoji}
          </div>
          <div>
            <div className="text-2xl font-black" style={{ color: bot.color }}>{bot.name}</div>
            <div className="text-sm text-[var(--text-secondary)]">{bot.tagline}</div>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {filters.map(({ label, color }, i) => (
                <span key={i} className="px-2 py-0.5 rounded-full text-[9px] font-semibold" style={{ background: color + "18", color }}>
                  {label}
                </span>
              ))}
            </div>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap items-start">
          {gen > 0 && (
            <div className="px-3 py-1.5 rounded-lg text-xs font-bold" style={{ background: bot.color + "20", color: bot.color }}>
              Geração {gen}
            </div>
          )}
          <button onClick={onReset} className="px-3 py-1.5 rounded-lg border border-red-500/30 text-red-400 text-xs hover:bg-red-500/10 transition-colors">
            Resetar Bot
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Capital Total", val: `R$ ${fmt(totalBrl, 0)}`, cor: "var(--text-primary)" },
          { label: "P&L", val: `${pnlTotal >= 0 ? "+" : ""}R$ ${fmt(Math.abs(pnlTotal), 0)}`, cor: pnlTotal >= 0 ? "#10b981" : "#ef4444", sub: `${pctTotal >= 0 ? "+" : ""}${pctTotal.toFixed(2)}%` },
          { label: "Win Rate", val: stats.ops > 0 ? `${stats.win_rate.toFixed(0)}%` : "—", cor: stats.win_rate >= 50 ? "#10b981" : "#ef4444", sub: `${vendas.length} fechadas` },
          { label: "Profit Factor", val: stats.ops > 0 ? (stats.profit_factor === 999 ? "∞" : stats.profit_factor.toFixed(2)) : "—", cor: stats.profit_factor >= 1 ? "#10b981" : "#ef4444" },
        ].map(({ label, val, cor, sub }) => (
          <div key={label} className="p-3 rounded-xl border border-[var(--border)] bg-[var(--bg-card)]">
            <div className="text-[10px] text-[var(--text-secondary)] mb-1">{label}</div>
            <div className="font-black text-base leading-tight" style={{ color: cor }}>{val}</div>
            {sub && <div className="text-[10px] font-semibold mt-0.5" style={{ color: cor }}>{sub}</div>}
          </div>
        ))}
      </div>

      {wallet.learned?.log?.length > 0 && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
          <div className="font-semibold text-sm mb-3 flex items-center gap-2">
            🧠 Log de Aprendizado
            <span className="text-[10px] font-normal text-[var(--text-secondary)]">
              Score min atual: {effMin} · Stake mult: {(wallet.learned.stake_mult ?? 1).toFixed(2)}x
            </span>
          </div>
          <div className="space-y-1">
            {[...wallet.learned.log].reverse().map((entry, i) => (
              <div key={i} className="text-[11px] text-[var(--text-secondary)] flex items-center gap-2">
                <span style={{ color: bot.color }}>▸</span>{entry}
              </div>
            ))}
          </div>
        </div>
      )}

      {positions.length > 0 && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--border)] font-semibold text-sm">
            Posições Abertas ({positions.length})
          </div>
          <div className="divide-y divide-[var(--border)]">
            {positions.map(p => {
              const curr = p.last_price_brl;
              const pnl  = p.direction === "LONG" ? (curr - p.entry_price_brl) * p.units : (p.entry_price_brl - curr) * p.units;
              const pct  = (pnl / p.amount_brl) * 100;
              const dc   = directionColor(p.direction);
              return (
                <div key={p.simbolo} className="flex items-center gap-3 px-4 py-3">
                  <span className="text-xl">{COIN_EMOJI[p.simbolo] ?? p.simbolo[0]}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold">{p.simbolo}</span>
                      <span className="text-[8px] font-black px-1.5 py-0.5 rounded" style={{ background: dc + "20", color: dc }}>{p.direction}</span>
                    </div>
                    <div className="text-[10px] text-[var(--text-secondary)]">
                      Entrada R$ {fmt(p.entry_price_brl, 2)} · SL {fmt(p.stop_loss_price ?? 0, 2)} · TP {fmt(p.take_profit_price ?? 0, 2)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`font-bold text-sm ${pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                      {pnl >= 0 ? "+" : ""}R${fmt(Math.abs(pnl), 0)}
                    </div>
                    <div className={`text-[10px] ${pct >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                      {pct >= 0 ? "+" : ""}{pct.toFixed(2)}%
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {vendas.length > 0 && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--border)] font-semibold text-sm">
            Histórico ({vendas.length} operações)
          </div>
          <div className="overflow-x-auto">
            <table className="w-full" style={{ fontSize: "11px" }}>
              <thead>
                <tr className="bg-[var(--bg)] border-b border-[var(--border)] text-[var(--text-secondary)] text-[9px] uppercase">
                  <th className="px-3 py-2 text-left">Ativo</th>
                  <th className="px-3 py-2 text-center">Dir</th>
                  <th className="px-3 py-2 text-right">P&L</th>
                  <th className="px-3 py-2 text-right">%</th>
                  <th className="px-3 py-2 text-right">Status</th>
                  <th className="px-3 py-2 text-left">Motivo saída</th>
                </tr>
              </thead>
              <tbody>
                {[...vendas].reverse().slice(0, 60).map((t, i) => {
                  const pnl = t.pnl_brl ?? 0;
                  return (
                    <tr key={t.id} className={`border-b border-[var(--border)]/30 ${i % 2 === 0 ? "" : "bg-[var(--bg)]/40"}`}>
                      <td className="px-3 py-2 font-bold">{t.simbolo}</td>
                      <td className="px-3 py-2 text-center"><DirectionBadge dir={t.direction} /></td>
                      <td className="px-3 py-2 text-right font-bold" style={{ color: pnl >= 0 ? "#10b981" : "#ef4444" }}>
                        {pnl >= 0 ? "+" : ""}R${fmt(Math.abs(pnl), 0)}
                      </td>
                      <td className="px-3 py-2 text-right font-bold" style={{ color: (t.pct ?? 0) >= 0 ? "#10b981" : "#ef4444" }}>
                        {(t.pct ?? 0) >= 0 ? "+" : ""}{(t.pct ?? 0).toFixed(2)}%
                      </td>
                      <td className="px-3 py-2 text-right">
                        {pnl >= 0
                          ? <span className="text-[8px] font-bold text-emerald-400 bg-emerald-400/10 px-1.5 py-0.5 rounded">WIN</span>
                          : <span className="text-[8px] font-bold text-red-400 bg-red-400/10 px-1.5 py-0.5 rounded">LOSS</span>}
                      </td>
                      <td className="px-3 py-2 text-[9px] text-[var(--text-secondary)] max-w-[120px] truncate">{t.motivo_saida}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {vendas.length === 0 && positions.length === 0 && (
        <div className="text-center py-12 text-[var(--text-secondary)] text-sm">
          {bot.name} aguardando sinais que correspondam à sua estratégia...
        </div>
      )}
    </div>
  );
}

function BotTabView({ botWallets, scan, onResetBot, onResetAll }: {
  botWallets: Record<string, BotWallet>;
  scan: FuturesScanData | null;
  onResetBot: (id: string) => void;
  onResetAll: () => void;
}) {
  const [selectedBot, setSelectedBot] = useState<string | null>(null);

  const totalInicial = BOT_PROFILES.reduce((a, b) => a + b.capital, 0);
  const totalCapital = BOT_PROFILES.reduce((a, b) => {
    const w = botWallets[b.id];
    return a + (w ? w.saldo_livre + Object.values(w.positions).reduce((s, p) => s + p.amount_brl, 0) : b.capital);
  }, 0);
  const totalPnl   = totalCapital - totalInicial;
  const totalRoi   = (totalPnl / totalInicial) * 100;
  const totalOps   = BOT_PROFILES.reduce((a, b) => a + (botWallets[b.id]?.trades.filter(t => t.tipo === "V").length ?? 0), 0);
  const totalAtivos = BOT_PROFILES.filter(b => Object.keys(botWallets[b.id]?.positions ?? {}).length > 0).length;
  const totalWins  = BOT_PROFILES.reduce((a, b) => a + (botWallets[b.id]?.trades.filter(t => t.tipo === "V" && (t.pnl_brl ?? 0) > 0).length ?? 0), 0);
  const globalWR   = totalOps > 0 ? totalWins / totalOps * 100 : 0;

  if (selectedBot) {
    const bot    = BOT_PROFILES.find(b => b.id === selectedBot);
    const wallet = botWallets[selectedBot];
    if (bot && wallet) {
      return (
        <BotDetailView
          bot={bot} wallet={wallet}
          onBack={() => setSelectedBot(null)}
          onReset={() => { onResetBot(selectedBot); setSelectedBot(null); }}
        />
      );
    }
  }

  // Rank bots by ROI (highest first)
  const ranked = [...BOT_PROFILES].sort((a, b) => {
    const ra = botWallets[a.id] ? calcBotStats(botWallets[a.id]).roi : 0;
    const rb = botWallets[b.id] ? calcBotStats(botWallets[b.id]).roi : 0;
    return rb - ra;
  });

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-black text-[var(--text-primary)]">🤖 Bots Futuros</h2>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
            {BOT_PROFILES.length} bots independentes · Estratégias únicas · Aprendem com resultados · Clique para detalhes
          </p>
        </div>
        <button onClick={onResetAll} className="px-3 py-1.5 rounded-lg border border-red-500/30 text-red-400 text-xs hover:bg-red-500/10 transition-colors">
          Resetar Todos
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: "Capital Total",  val: `R$ ${fmt(totalCapital,0)}`,                             cor: "var(--text-primary)" },
          { label: "P&L Portfolio",  val: `${totalPnl>=0?"+":""}R$ ${fmt(Math.abs(totalPnl),0)}`, cor: totalPnl>=0?"#10b981":"#ef4444", sub: `${totalRoi>=0?"+":""}${totalRoi.toFixed(2)}%` },
          { label: "Bots Ativos",    val: `${totalAtivos}/${BOT_PROFILES.length}`,                  cor: "#f59e0b" },
          { label: "Total Trades",   val: String(totalOps),                                        cor: "#6b7280" },
          { label: "Win Rate Global",val: totalOps>0 ? `${globalWR.toFixed(0)}%` : "—",           cor: globalWR>=50?"#10b981":"#ef4444" },
          { label: "Último Scan",    val: scan ? new Date((scan.atualizado??0)*1000).toLocaleTimeString("pt-BR") : "—", cor: "#6b7280" },
        ].map(({ label, val, cor, sub }) => (
          <div key={label} className="p-3 rounded-xl border border-[var(--border)] bg-[var(--bg-card)]">
            <div className="text-[10px] text-[var(--text-secondary)] mb-1">{label}</div>
            <div className="font-black text-sm leading-tight" style={{ color: cor }}>{val}</div>
            {sub && <div className="text-[10px] font-semibold mt-0.5" style={{ color: cor }}>{sub}</div>}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {ranked.map((bot, idx) => (
          <BotCard
            key={bot.id}
            bot={bot}
            wallet={botWallets[bot.id] ?? emptyBotWallet(bot.capital)}
            rank={idx + 1}
            onSelect={() => setSelectedBot(bot.id)}
          />
        ))}
      </div>

      {!scan && (
        <div className="text-center py-12 text-[var(--text-secondary)] text-sm">
          Aguardando scan de futuros para os bots avaliarem o mercado...
        </div>
      )}
    </div>
  );
}

// ── Signal System ─────────────────────────────────────────────────────────────

interface FuturesSignal {
  simbolo: string; direction: "LONG" | "SHORT";
  score: number; grade: string; preco_brl: number;
  dir_conf: number; n_perfis: number; perfis_nomes: string[];
  ia_conf: number; funding_class?: string; oi_change_pct?: number; var24h?: number;
  leverage: 2 | 5 | 10 | 20; leverage_reason: string;
  timing: "AGORA" | "EM BREVE" | "AGUARDAR"; timing_reason: string;
  sl_pct: number; tp_pct: number;
}

function computeLearnStats(wallets: Record<string, FuturesWallet>) {
  type WL = { w: number; l: number };
  const byScore: Record<string, WL> = { "35-50":{w:0,l:0}, "50-65":{w:0,l:0}, "65-80":{w:0,l:0}, "80+":{w:0,l:0} };
  const byDir:   Record<string, WL> = { LONG:{w:0,l:0}, SHORT:{w:0,l:0} };
  const byGrade: Record<string, WL> = { "A+":{w:0,l:0}, A:{w:0,l:0}, B:{w:0,l:0}, C:{w:0,l:0} };
  let totalTrades = 0, totalWins = 0, totalPnl = 0;
  for (const w of Object.values(wallets)) {
    const buys  = w.trades.filter(t => t.tipo === "C" && t.auto);
    const sells = w.trades.filter(t => t.tipo === "V" && t.auto);
    for (const sell of sells) {
      const buy = buys.filter(b => b.simbolo === sell.simbolo && b.time < sell.time).sort((a,b) => b.time - a.time)[0];
      if (!buy) continue;
      totalTrades++; totalPnl += sell.pnl_brl ?? 0;
      const win = (sell.pnl_brl ?? 0) > 0;
      if (win) totalWins++;
      const score = buy.score;
      const range = score >= 80 ? "80+" : score >= 65 ? "65-80" : score >= 50 ? "50-65" : "35-50";
      win ? byScore[range].w++ : byScore[range].l++;
      win ? byDir[sell.direction].w++ : byDir[sell.direction].l++;
      const gr = buy.grade ?? "";
      if (byGrade[gr]) { win ? byGrade[gr].w++ : byGrade[gr].l++; }
    }
  }
  const wr = (o: WL): number | null => o.w + o.l > 0 ? o.w / (o.w + o.l) * 100 : null;
  return { byScore, byDir, byGrade, totalTrades, totalWins, totalPnl, wr };
}

function gerarSinaisIA(scan: FuturesScanData, wallets: Record<string, FuturesWallet>): FuturesSignal[] {
  const usd   = scan.usd_brl ?? 5.2;
  const learn = computeLearnStats(wallets);
  const sinais: FuturesSignal[] = [];
  for (const it of (scan.geral ?? [])) {
    if (it.direction === "NEUTRO" || it.score_final < 28) continue;
    const matched: string[] = [];
    const matchedCfgs: FuturesPerfilConfig[] = [];
    for (const cfg of PERFIS_FUTURES) {
      if (podeEntrarFutures(cfg, it)) { matched.push(`${cfg.nome} ${cfg.nivel}`); matchedCfgs.push(cfg); }
    }
    if (matched.length === 0) continue;
    // Average SL/TP from matching profiles
    const sl_pct = matchedCfgs.reduce((a, c) => a + c.sl_pct, 0) / matchedCfgs.length;
    const tp_pct = matchedCfgs.reduce((a, c) => a + c.tp_pct, 0) / matchedCfgs.length;
    const range      = it.score_final >= 80 ? "80+" : it.score_final >= 65 ? "65-80" : it.score_final >= 50 ? "50-65" : "35-50";
    const learnScore = learn.wr(learn.byScore[range]);
    const learnDir   = learn.wr(learn.byDir[it.direction as "LONG" | "SHORT"]);
    const learnGrade = it.grade in learn.byGrade ? learn.wr(learn.byGrade[it.grade]) : null;
    let ia_conf = it.score_final * 0.5 + (it.direction_confidence ?? 50) * 0.5;
    if (learnScore !== null) ia_conf = ia_conf * 0.4 + learnScore * 0.6;
    else if (learnDir !== null) ia_conf = ia_conf * 0.6 + learnDir * 0.4;
    if (learnGrade !== null) ia_conf = ia_conf * 0.7 + learnGrade * 0.3;
    if (it.grade === "A+") ia_conf = Math.min(100, ia_conf * 1.08);
    if (it.grade === "C")  ia_conf = Math.max(0,   ia_conf * 0.90);
    const finalConf = Math.min(100, Math.max(0, ia_conf));

    // ── Leverage recommendation ──────────────────────────────────────────────
    const histWR = learnScore ?? learnDir ?? null;
    let leverage: 2 | 5 | 10 | 20 = 2;
    let leverage_reason = "Score moderado — alavancagem conservadora";
    if (finalConf >= 82 && it.score_final >= 75 && it.grade === "A+" && (histWR === null || histWR >= 65)) {
      leverage = 20; leverage_reason = `Score ${it.score_final.toFixed(0)} + Conf IA ${finalConf.toFixed(0)}% + Grade A+${histWR ? ` + Win ${histWR.toFixed(0)}%` : " (sem histórico)"} → máxima oportunidade`;
    } else if (finalConf >= 72 && it.score_final >= 65 && (it.grade === "A+" || it.grade === "A") && (histWR === null || histWR >= 60)) {
      leverage = 10; leverage_reason = `Score ${it.score_final.toFixed(0)} + Conf IA ${finalConf.toFixed(0)}% + Grade ${it.grade}${histWR ? ` + Win ${histWR.toFixed(0)}%` : ""} → alta oportunidade`;
    } else if (finalConf >= 62 && it.score_final >= 55 && it.grade !== "C" && (histWR === null || histWR >= 52)) {
      leverage = 5; leverage_reason = `Score ${it.score_final.toFixed(0)} + Conf IA ${finalConf.toFixed(0)}% → boa oportunidade`;
    } else {
      leverage_reason = `Score ${it.score_final.toFixed(0)} ou conf IA ${finalConf.toFixed(0)}% ainda moderados`;
    }

    // ── Timing ─────────────────────────────────────────────────────────────
    const oiGood    = (it.oi_change_pct ?? 0) > 0.5;
    const fundGood  = it.direction === "LONG"
      ? (it.funding_rate ?? 0) <= 0.0002  // not overbought longs
      : (it.funding_rate ?? 0) >= -0.0002; // not overbought shorts
    const momentOk  = it.direction === "LONG"
      ? (it.var24h ?? 0) > -2
      : (it.var24h ?? 0) < 2;
    let timing: "AGORA" | "EM BREVE" | "AGUARDAR" = "AGUARDAR";
    let timing_reason = "Aguardar confirmação adicional";
    if (finalConf >= 65 && it.grade !== "C") {
      if (oiGood && fundGood && momentOk) {
        timing = "AGORA"; timing_reason = "OI crescendo + Funding favorável + Momento alinhado";
      } else if (oiGood || fundGood) {
        timing = "EM BREVE"; timing_reason = `${oiGood ? "OI crescendo" : "Funding favorável"} — aguardar mais ${fundGood && !oiGood ? "confirmação de volume" : "alinhamento de momentum"}`;
      } else {
        timing = "EM BREVE"; timing_reason = "Score e confiança bons, aguardar OI e funding alinharem";
      }
    } else if (finalConf >= 55) {
      timing = "EM BREVE"; timing_reason = "Confiança em formação — monitorar próximas candles";
    }

    sinais.push({
      simbolo: it.simbolo, direction: it.direction as "LONG" | "SHORT",
      score: it.score_final, grade: it.grade,
      preco_brl: it.preco * usd, dir_conf: it.direction_confidence ?? 0,
      n_perfis: matched.length, perfis_nomes: matched,
      ia_conf: finalConf,
      funding_class: it.funding_class, oi_change_pct: it.oi_change_pct, var24h: it.var24h,
      leverage, leverage_reason, timing, timing_reason,
      sl_pct, tp_pct,
    });
  }
  return sinais.sort((a, b) => {
    // AGORA first, then EM BREVE, then by ia_conf
    const tOrder = { "AGORA": 0, "EM BREVE": 1, "AGUARDAR": 2 };
    const td = tOrder[a.timing] - tOrder[b.timing];
    return td !== 0 ? td : b.ia_conf - a.ia_conf;
  });
}

// ── Signal Card ───────────────────────────────────────────────────────────────

function SignalCard({ s, learn }: { s: FuturesSignal; learn: ReturnType<typeof computeLearnStats> }) {
  const isLong     = s.direction === "LONG";
  const accentColor = isLong ? "#10b981" : "#ef4444";
  const bgColor     = isLong ? "rgba(16,185,129,0.06)" : "rgba(239,68,68,0.06)";
  const borderColor = isLong ? "rgba(16,185,129,0.35)" : "rgba(239,68,68,0.35)";
  const timingColor = s.timing === "AGORA" ? "#10b981" : s.timing === "EM BREVE" ? "#f59e0b" : "#6b7280";
  const leverageColor = s.leverage >= 20 ? "#a855f7" : s.leverage >= 10 ? "#f59e0b" : s.leverage >= 5 ? "#3b82f6" : "#6b7280";

  // Historical win rate for this asset's score range
  const range   = s.score >= 80 ? "80+" : s.score >= 65 ? "65-80" : s.score >= 50 ? "50-65" : "35-50";
  const histWR  = learn.wr(learn.byScore[range]);
  const dirWR   = learn.wr(learn.byDir[s.direction]);

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${borderColor}`, background: bgColor }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3" style={{ background: isLong ? "rgba(16,185,129,0.12)" : "rgba(239,68,68,0.12)", borderBottom: `1px solid ${borderColor}` }}>
        <div className="flex items-center gap-2">
          <span className="text-2xl">{COIN_EMOJI[s.simbolo] ?? s.simbolo[0]}</span>
          <div>
            <div className="font-black text-base" style={{ color: "var(--text-primary)" }}>{s.simbolo}</div>
            <GradeBadge grade={s.grade} />
          </div>
        </div>
        {/* Timing badge */}
        <div className="text-right">
          <div className="text-[9px] font-black px-2 py-0.5 rounded-full"
            style={{ background: `${timingColor}25`, color: timingColor, border: `1px solid ${timingColor}60` }}>
            ⏱ {s.timing}
          </div>
          <div className="text-[8px] mt-0.5" style={{ color: "var(--text-muted)" }}>
            {s.var24h != null ? `${s.var24h >= 0 ? "+" : ""}${s.var24h.toFixed(2)}% 24h` : ""}
          </div>
        </div>
      </div>

      {/* Main action + leverage */}
      <div className="px-4 pt-3 pb-2 flex items-center justify-between gap-2">
        <div>
          <div className="text-[9px] font-bold uppercase tracking-wider" style={{ color: accentColor }}>Posição Recomendada</div>
          <div className="font-black" style={{ color: accentColor, fontSize: "18px", lineHeight: 1.2 }}>
            {isLong ? "▲ ENTRAR LONG" : "▼ ENTRAR SHORT"}
          </div>
        </div>
        <div className="text-center shrink-0">
          <div className="text-[8px] font-bold" style={{ color: leverageColor }}>ALAVANCAGEM</div>
          <div className="font-black" style={{ color: leverageColor, fontSize: "26px", lineHeight: 1 }}>{s.leverage}x</div>
        </div>
      </div>

      {/* ── PONTO DE ENTRADA ── */}
      {(() => {
        const entry = s.preco_brl;
        const sl    = isLong ? entry * (1 - s.sl_pct) : entry * (1 + s.sl_pct);
        const tp    = isLong ? entry * (1 + s.tp_pct) : entry * (1 - s.tp_pct);
        const fmtP  = (v: number) => v >= 1000
          ? v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
          : v.toLocaleString("pt-BR", { minimumFractionDigits: 4, maximumFractionDigits: 4 });
        return (
          <div className="mx-4 mb-3 rounded-xl overflow-hidden" style={{ border: `1px solid ${accentColor}40` }}>
            {/* Entry */}
            <div className="flex items-center justify-between px-3 py-2.5"
              style={{ background: `${accentColor}15`, borderBottom: `1px solid ${accentColor}25` }}>
              <div>
                <div className="text-[8px] font-black uppercase tracking-wider" style={{ color: accentColor }}>
                  📍 Ponto de Entrada
                </div>
                <div className="font-black text-base tabular-nums" style={{ color: accentColor }}>
                  R$ {fmtP(entry)}
                </div>
              </div>
              <div className="text-right text-[9px]" style={{ color: accentColor }}>
                <div>Entrar {isLong ? "comprado" : "vendido"}</div>
                <div className="font-bold">{isLong ? "AGORA ou próx. candle" : "AGORA ou próx. candle"}</div>
              </div>
            </div>
            {/* SL + TP */}
            <div className="grid grid-cols-2">
              <div className="px-3 py-2" style={{ borderRight: "1px solid var(--border)" }}>
                <div className="text-[8px] font-bold text-red-400">🛑 Stop Loss</div>
                <div className="font-black text-sm tabular-nums text-red-400">R$ {fmtP(sl)}</div>
                <div className="text-[8px] text-red-400/70">−{(s.sl_pct * 100).toFixed(1)}%</div>
              </div>
              <div className="px-3 py-2">
                <div className="text-[8px] font-bold text-emerald-400">🎯 Take Profit</div>
                <div className="font-black text-sm tabular-nums text-emerald-400">R$ {fmtP(tp)}</div>
                <div className="text-[8px] text-emerald-400/70">+{(s.tp_pct * 100).toFixed(1)}%</div>
              </div>
            </div>
            {/* Leveraged return strip */}
            <div className="px-3 py-2 flex items-center justify-between"
              style={{ background: "var(--bg-card)", borderTop: "1px solid var(--border)" }}>
              <span className="text-[9px] font-bold" style={{ color: "var(--text-muted)" }}>
                ⚡ Com {s.leverage}x alavancagem
              </span>
              <div className="flex items-center gap-3">
                <span className="text-[9px] font-black text-emerald-400">
                  +{(s.tp_pct * s.leverage * 100).toFixed(0)}% retorno
                </span>
                <span className="text-[9px] font-bold text-red-400">
                  −{(s.sl_pct * s.leverage * 100).toFixed(0)}% risco
                </span>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Metrics */}
      <div className="grid grid-cols-3 gap-2 px-4 pb-3">
        <div className="rounded-lg p-2 text-center" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <div className="text-[8px]" style={{ color: "var(--text-muted)" }}>Score</div>
          <div className="font-black text-sm" style={{ color: s.score >= 70 ? "#10b981" : s.score >= 55 ? "#f59e0b" : "#ef4444" }}>{s.score.toFixed(0)}</div>
        </div>
        <div className="rounded-lg p-2 text-center" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <div className="text-[8px]" style={{ color: "var(--text-muted)" }}>Conf. IA</div>
          <div className="font-black text-sm" style={{ color: s.ia_conf >= 70 ? "#10b981" : s.ia_conf >= 55 ? "#f59e0b" : "#ef4444" }}>{s.ia_conf.toFixed(0)}%</div>
        </div>
        <div className="rounded-lg p-2 text-center" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <div className="text-[8px]" style={{ color: "var(--text-muted)" }}>Win Hist.</div>
          <div className="font-black text-sm" style={{ color: histWR !== null && histWR >= 50 ? "#10b981" : histWR !== null ? "#ef4444" : "var(--text-muted)" }}>
            {histWR !== null ? `${histWR.toFixed(0)}%` : dirWR !== null ? `${dirWR.toFixed(0)}%` : "—"}
          </div>
        </div>
      </div>

      {/* Extras + timing */}
      <div className="px-4 pb-3 text-[9px]" style={{ color: "var(--text-muted)" }}>
        {(s.oi_change_pct != null || s.funding_class) && (
          <div className="mb-0.5">
            {s.oi_change_pct != null && <span className={s.oi_change_pct > 0 ? "text-emerald-400" : "text-red-400"}>OI {s.oi_change_pct >= 0 ? "+" : ""}{s.oi_change_pct.toFixed(2)}% </span>}
            {s.funding_class && <span>{s.funding_class}</span>}
          </div>
        )}
        <div className="italic">{s.timing_reason}</div>
        <div className="mt-0.5" style={{ color: leverageColor }}>{s.leverage_reason}</div>
      </div>

      {/* Perfis */}
      {s.perfis_nomes.length > 0 && (
        <div className="px-4 pb-3 flex flex-wrap gap-1">
          {s.perfis_nomes.slice(0, 4).map(p => (
            <span key={p} className="text-[8px] px-1.5 py-0.5 rounded-full"
              style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-muted)" }}>
              {p}
            </span>
          ))}
          {s.perfis_nomes.length > 4 && (
            <span className="text-[8px] px-1.5 py-0.5 rounded-full" style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-muted)" }}>
              +{s.perfis_nomes.length - 4}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ── IA Sinais View (3 painéis) ────────────────────────────────────────────────

function FuturesIASinaisView({ scan, wallets, autoTrade, setAutoTrade }:
  { scan: FuturesScanData | null; wallets: Record<string, FuturesWallet>; autoTrade: boolean; setAutoTrade: (v: boolean) => void }) {
  const sinais   = scan ? gerarSinaisIA(scan, wallets) : [];
  const learn    = computeLearnStats(wallets);
  const longS    = sinais.filter(s => s.direction === "LONG");
  const shortS   = sinais.filter(s => s.direction === "SHORT");
  const globalWR = learn.totalTrades > 0 ? learn.totalWins / learn.totalTrades * 100 : null;

  // Neutral = items in scan that didn't generate a signal
  const sigSymbols  = new Set(sinais.map(s => s.simbolo + s.direction));
  const neutroItems = (scan?.geral ?? []).filter(i => i.direction === "NEUTRO" || i.score_final < 40 || !sigSymbols.has(i.simbolo + i.direction)).slice(0, 8);

  // Aprendizado compacto
  const learnRows = [
    ...Object.entries(learn.byScore).map(([r, d]) => ({ label: `Score ${r}`, wr: learn.wr(d), ops: d.w + d.l })),
    ...( ["LONG","SHORT"] as const).map(dir => ({ label: dir, wr: learn.wr(learn.byDir[dir]), ops: learn.byDir[dir].w + learn.byDir[dir].l })),
  ].filter(r => r.ops > 0);

  return (
    <div className="flex flex-col gap-4">

      {/* Auto trade banner */}
      {!autoTrade && (
        <div className="flex items-center justify-between gap-3 p-3 rounded-xl"
          style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)" }}>
          <span className="text-xs font-bold" style={{ color: "#ef4444" }}>⚠️ Auto Trade DESLIGADO — sinais não serão executados automaticamente</span>
          <button onClick={() => setAutoTrade(true)} className="px-3 py-1.5 rounded-xl text-xs font-bold shrink-0"
            style={{ background: "rgba(16,185,129,0.2)", color: "#10b981", border: "1px solid rgba(16,185,129,0.4)" }}>
            Ligar Auto Trade
          </button>
        </div>
      )}

      {/* Resumo + Aprendizado */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3 rounded-xl" style={{ background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.3)" }}>
          <div className="text-[9px] font-bold text-emerald-400">▲ LONG</div>
          <div className="text-2xl font-black text-emerald-400">{longS.length}</div>
          <div className="text-[9px] text-emerald-400/70">{longS.filter(s => s.timing === "AGORA").length} AGORA · {longS.filter(s => s.leverage >= 10).length} ≥10x</div>
        </div>
        <div className="p-3 rounded-xl" style={{ background: "rgba(107,114,128,0.08)", border: "1px solid rgba(107,114,128,0.25)" }}>
          <div className="text-[9px] font-bold" style={{ color: "var(--text-muted)" }}>— NEUTRO</div>
          <div className="text-2xl font-black" style={{ color: "var(--text-muted)" }}>{neutroItems.length}</div>
          <div className="text-[9px]" style={{ color: "var(--text-muted)" }}>aguardar sinal</div>
        </div>
        <div className="p-3 rounded-xl" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)" }}>
          <div className="text-[9px] font-bold text-red-400">▼ SHORT</div>
          <div className="text-2xl font-black text-red-400">{shortS.length}</div>
          <div className="text-[9px] text-red-400/70">{shortS.filter(s => s.timing === "AGORA").length} AGORA · {shortS.filter(s => s.leverage >= 10).length} ≥10x</div>
        </div>
        <div className="p-3 rounded-xl" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <div className="text-[9px]" style={{ color: "var(--text-muted)" }}>🎓 IA Aprendeu</div>
          <div className="text-xl font-black" style={{ color: globalWR !== null && globalWR >= 50 ? "#10b981" : globalWR !== null ? "#ef4444" : "var(--text-muted)" }}>
            {globalWR !== null ? `${globalWR.toFixed(0)}%` : "—"}
          </div>
          <div className="text-[9px]" style={{ color: "var(--text-muted)" }}>{learn.totalTrades} ops analisadas</div>
        </div>
      </div>

      {/* Aprendizado IA compacto */}
      {learnRows.length > 0 && (
        <div className="rounded-xl p-3 flex flex-wrap gap-2" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <span className="text-[9px] font-bold w-full" style={{ color: "var(--text-muted)" }}>🎓 Histórico de acerto IA</span>
          {learnRows.map(r => (
            <div key={r.label} className="flex items-center gap-1 px-2 py-1 rounded-lg text-[9px]"
              style={{ background: "var(--bg)", border: "1px solid var(--border)" }}>
              <span style={{ color: "var(--text-secondary)" }}>{r.label}</span>
              <span className="font-black" style={{ color: r.wr !== null && r.wr >= 55 ? "#10b981" : "#ef4444" }}>
                {r.wr !== null ? `${r.wr.toFixed(0)}%` : "—"}
              </span>
              <span style={{ color: "var(--text-muted)" }}>({r.ops})</span>
            </div>
          ))}
        </div>
      )}

      {/* ── 3 PAINÉIS ── */}
      {!scan && <div className="text-center py-12 text-sm" style={{ color: "var(--text-muted)" }}>Carregando análise de mercado...</div>}

      {scan && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">

          {/* ── PAINEL LONG (verde) ── */}
          <div className="rounded-xl overflow-hidden" style={{ border: "2px solid rgba(16,185,129,0.5)" }}>
            <div className="px-4 py-3 flex items-center justify-between"
              style={{ background: "rgba(16,185,129,0.15)", borderBottom: "1px solid rgba(16,185,129,0.3)" }}>
              <div>
                <div className="font-black text-base text-emerald-400">▲ LONG</div>
                <div className="text-[10px] text-emerald-400/70">Entrar comprado — mercado subindo</div>
              </div>
              <div className="text-2xl font-black text-emerald-400">{longS.length}</div>
            </div>
            {longS.length === 0 ? (
              <div className="p-6 text-center text-xs" style={{ color: "var(--text-muted)" }}>
                Sem sinais LONG no momento<br />IA aguarda oportunidade
              </div>
            ) : (
              <div className="flex flex-col gap-3 p-3">
                {longS.map(s => <SignalCard key={s.simbolo} s={s} learn={learn} />)}
              </div>
            )}
          </div>

          {/* ── PAINEL NEUTRO (cinza) ── */}
          <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)" }}>
            <div className="px-4 py-3 flex items-center justify-between"
              style={{ background: "var(--bg-card)", borderBottom: "1px solid var(--border)" }}>
              <div>
                <div className="font-black text-base" style={{ color: "var(--text-secondary)" }}>— NEUTRO</div>
                <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>Aguardar — sem direção clara</div>
              </div>
              <div className="text-2xl font-black" style={{ color: "var(--text-muted)" }}>{neutroItems.length}</div>
            </div>
            {neutroItems.length === 0 ? (
              <div className="p-6 text-center text-xs" style={{ color: "var(--text-muted)" }}>Todos os ativos com sinal direcional</div>
            ) : (
              <div className="flex flex-col gap-1 p-3">
                {neutroItems.map(it => (
                  <div key={it.simbolo} className="flex items-center justify-between px-3 py-2 rounded-lg"
                    style={{ background: "var(--bg)", border: "1px solid var(--border)" }}>
                    <div className="flex items-center gap-2">
                      <span className="text-base">{COIN_EMOJI[it.simbolo] ?? it.simbolo[0]}</span>
                      <div>
                        <div className="font-bold text-xs" style={{ color: "var(--text-primary)" }}>{it.simbolo}</div>
                        <div className="text-[8px]" style={{ color: "var(--text-muted)" }}>
                          {it.direction === "NEUTRO" ? "Direção indefinida" : `Score ${it.score_final.toFixed(0)} — abaixo do mínimo`}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <GradeBadge grade={it.grade} />
                      <div className="text-[8px] mt-0.5" style={{ color: "var(--text-muted)" }}>
                        Score {it.score_final.toFixed(0)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── PAINEL SHORT (vermelho) ── */}
          <div className="rounded-xl overflow-hidden" style={{ border: "2px solid rgba(239,68,68,0.5)" }}>
            <div className="px-4 py-3 flex items-center justify-between"
              style={{ background: "rgba(239,68,68,0.15)", borderBottom: "1px solid rgba(239,68,68,0.3)" }}>
              <div>
                <div className="font-black text-base text-red-400">▼ SHORT</div>
                <div className="text-[10px] text-red-400/70">Entrar vendido — mercado caindo</div>
              </div>
              <div className="text-2xl font-black text-red-400">{shortS.length}</div>
            </div>
            {shortS.length === 0 ? (
              <div className="p-6 text-center text-xs" style={{ color: "var(--text-muted)" }}>
                Sem sinais SHORT no momento<br />IA aguarda oportunidade
              </div>
            ) : (
              <div className="flex flex-col gap-3 p-3" style={{ background: "rgba(239,68,68,0.02)" }}>
                {shortS.map(s => <SignalCard key={s.simbolo} s={s} learn={learn} />)}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Todas as Carteiras View ───────────────────────────────────────────────────

function FuturesAllWalletsView({ wallets, scan, autoTrade, setAutoTrade, onFechar, onReset, onAtualizar, onSalvarTodos }:
  { wallets: Record<string, FuturesWallet>; scan: FuturesScanData | null; autoTrade: boolean; setAutoTrade: (v: boolean) => void;
    onFechar: (perfilId: string, sym: string) => void; onReset: (perfilId: string) => void;
    onAtualizar: () => Promise<void>; onSalvarTodos: () => void }) {

  const [atualizando, setAtualizando] = useState(false);
  const [expandido, setExpandido]     = useState<string | null>(null);
  const usd = scan?.usd_brl ?? 5.2;

  const allW = PERFIS_FUTURES.map(cfg => ({
    cfg, w: wallets[cfg.id] ?? emptyFuturesWallet(cfg.capital_inicial),
    stats: calcFuturesStats(wallets[cfg.id] ?? emptyFuturesWallet(cfg.capital_inicial)),
  }));

  // Aggregates
  const totalCapital  = allW.reduce((a, { stats }) => a + stats.capital, 0);
  const totalInicial  = PERFIS_FUTURES.reduce((a, c) => a + (c.capital_inicial ?? 100000), 0);
  const totalPnl      = totalCapital - totalInicial;
  const totalPos      = allW.reduce((a, { stats }) => a + stats.posicoes, 0);
  const totalOps      = allW.reduce((a, { stats }) => a + stats.ops, 0);
  const totalWins     = allW.reduce((a, { w }) => a + w.trades.filter(t => t.tipo === "V" && (t.pnl_brl ?? 0) > 0).length, 0);
  const globalWR      = totalOps > 0 ? (totalWins / totalOps * 100) : 0;

  const handleAtualizar = async () => { setAtualizando(true); try { await onAtualizar(); } finally { setAtualizando(false); } };

  return (
    <div className="flex flex-col gap-5">
      {/* Global stats */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 flex-1">
          {[
            { label: "Capital Total", val: `R$ ${totalCapital.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`, cor: "var(--text-primary)" },
            { label: "P&L Total", val: `${totalPnl >= 0 ? "+" : ""}R$ ${Math.abs(totalPnl).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`, sub: `${(totalPnl/totalInicial*100).toFixed(2)}%`, cor: totalPnl >= 0 ? "#10b981" : "#ef4444" },
            { label: "Posições Abertas", val: String(totalPos), sub: `${allW.filter(x => Object.keys(x.w.positions).length > 0).length} carteiras ativas`, cor: totalPos > 0 ? "#3b82f6" : "var(--text-muted)" },
            { label: "Win Rate Global", val: totalOps > 0 ? `${globalWR.toFixed(0)}%` : "—", sub: `${totalOps} operações`, cor: globalWR >= 50 ? "#10b981" : "#ef4444" },
          ].map(({ label, val, sub, cor }) => (
            <div key={label} className="p-3 rounded-xl" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
              <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>{label}</div>
              <div className="text-lg font-black leading-tight mt-0.5" style={{ color: cor }}>{val}</div>
              {sub && <div className="text-[9px] mt-0.5" style={{ color: cor }}>{sub}</div>}
            </div>
          ))}
        </div>
        <div className="flex gap-2 shrink-0">
          <button onClick={() => setAutoTrade(!autoTrade)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-semibold transition-all ${autoTrade ? "bg-emerald-500/20 border-emerald-500 text-emerald-400" : "bg-[var(--bg-card)] border-[var(--border)] text-[var(--text-secondary)]"}`}>
            <span className={`w-2 h-2 rounded-full ${autoTrade ? "bg-emerald-400 animate-pulse" : "bg-gray-500"}`} />
            Auto {autoTrade ? "ON" : "OFF"}
          </button>
          <button onClick={handleAtualizar} disabled={atualizando}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] text-xs font-semibold text-[var(--text-secondary)] hover:text-blue-400 transition-all disabled:opacity-50">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={atualizando ? "animate-spin" : ""}>
              <path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
            </svg>
            {atualizando ? "..." : "Atualizar"}
          </button>
          <button onClick={onSalvarTodos} className="px-3 py-2 rounded-lg border border-blue-500/40 text-blue-400 text-xs font-semibold hover:bg-blue-500/10 transition-colors">
            Salvar Banco
          </button>
        </div>
      </div>

      {/* Todas as carteiras em grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {allW.map(({ cfg, w, stats }) => {
          const positions  = Object.values(w.positions);
          const isExpanded = expandido === cfg.id;
          const pnlTotal   = stats.capital - w.saldo_inicial;
          const hasPos     = positions.length > 0;

          return (
            <div key={cfg.id} className="rounded-xl overflow-hidden transition-all"
              style={{ border: `1px solid ${hasPos ? cfg.cor + "50" : "var(--border)"}`, background: "var(--bg-card)" }}>

              {/* Card header */}
              <div className="flex items-center justify-between px-4 py-3 cursor-pointer"
                style={{ background: hasPos ? `${cfg.cor}08` : "transparent" }}
                onClick={() => setExpandido(isExpanded ? null : cfg.id)}>
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-lg shrink-0">{cfg.emoji}</span>
                  <div className="min-w-0">
                    <div className="font-bold text-sm truncate" style={{ color: "var(--text-primary)" }}>
                      {cfg.nome} <span style={{ color: cfg.cor }}>{cfg.nivel}</span>
                    </div>
                    <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                      {cfg.direction_allowed} · {cfg.long_filter ? `TEC≥${cfg.long_filter.tec_min}/FLX≥${cfg.long_filter.flx_min}` : cfg.short_filter ? `TEC≤${cfg.short_filter.tec_max}/FLX≤${cfg.short_filter.flx_max}` : `sc≥${cfg.score_compra}`} · SL{(cfg.sl_pct*100).toFixed(0)}%/TP{(cfg.tp_pct*100).toFixed(0)}%
                    </div>
                  </div>
                </div>
                <div className="text-right shrink-0 ml-2">
                  <div className="font-black text-sm" style={{ color: pnlTotal >= 0 ? "#10b981" : "#ef4444" }}>
                    {pnlTotal >= 0 ? "+" : ""}R$ {Math.abs(pnlTotal).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}
                  </div>
                  <div className="text-[9px]" style={{ color: stats.roi >= 0 ? "#10b981" : "#ef4444" }}>
                    {stats.roi >= 0 ? "+" : ""}{stats.roi.toFixed(2)}% · {stats.ops} ops
                  </div>
                </div>
              </div>

              {/* Positions mini list */}
              {hasPos && (
                <div className="border-t" style={{ borderColor: "var(--border)" }}>
                  {positions.map(pos => {
                    const curr = pos.last_price_brl;
                    const pnl  = pos.direction === "LONG" ? (curr - pos.entry_price_brl) * pos.units : (pos.entry_price_brl - curr) * pos.units;
                    const pct  = (pnl / pos.amount_brl) * 100;
                    return (
                      <div key={pos.simbolo} className="flex items-center gap-2 px-4 py-2"
                        style={{ borderBottom: "1px solid var(--border)" }}>
                        <span className="text-sm">{COIN_EMOJI[pos.simbolo] ?? pos.simbolo[0]}</span>
                        <span className="font-bold text-xs" style={{ color: "var(--text-primary)" }}>{pos.simbolo}</span>
                        <DirectionBadge dir={pos.direction} />
                        <div className="flex-1" />
                        <span className="font-bold text-xs tabular-nums" style={{ color: pct >= 0 ? "#10b981" : "#ef4444" }}>
                          {pct >= 0 ? "+" : ""}{pct.toFixed(2)}%
                        </span>
                        <button onClick={e => { e.stopPropagation(); onFechar(cfg.id, pos.simbolo); }}
                          className="text-[9px] px-2 py-0.5 rounded border transition-colors ml-1"
                          style={{ borderColor: "rgba(239,68,68,0.3)", color: "#ef4444" }}>✕</button>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* No positions */}
              {!hasPos && (
                <div className="px-4 py-2 text-[10px]" style={{ color: "var(--text-muted)" }}>
                  {autoTrade ? "Aguardando sinal..." : "Auto trade OFF"}
                </div>
              )}

              {/* Expanded — trade log */}
              {isExpanded && (() => {
                const allTrades  = [...w.trades].sort((a, b) => b.time - a.time);
                const vendas     = allTrades.filter(t => t.tipo === "V");
                const longs      = vendas.filter(t => t.direction === "LONG").length;
                const shorts     = vendas.filter(t => t.direction === "SHORT").length;
                const pnlFechado = vendas.reduce((a, t) => a + (t.pnl_brl ?? 0), 0);
                const wins       = vendas.filter(t => (t.pnl_brl ?? 0) > 0).length;
                return (
                  <div className="border-t flex flex-col" style={{ borderColor: "var(--border)", background: "var(--bg)" }}>
                    {/* Summary chips */}
                    <div className="grid grid-cols-4 gap-1.5 px-3 pt-3">
                      {[
                        { l: "Operações", v: String(vendas.length), c: "var(--text-primary)" },
                        { l: "LONG", v: String(longs), c: "#10b981" },
                        { l: "SHORT", v: String(shorts), c: "#ef4444" },
                        { l: "P&L Fechado", v: `${pnlFechado >= 0 ? "+" : ""}R$ ${Math.abs(pnlFechado).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`, c: pnlFechado >= 0 ? "#10b981" : "#ef4444" },
                      ].map(({ l, v, c }) => (
                        <div key={l} className="rounded-lg p-2 text-[10px]" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
                          <div style={{ color: "var(--text-muted)" }}>{l}</div>
                          <div className="font-bold mt-0.5 tabular-nums" style={{ color: c }}>{v}</div>
                        </div>
                      ))}
                    </div>
                    {/* Win rate + extra */}
                    <div className="flex gap-2 px-3 pt-1.5 pb-2 text-[9px]" style={{ color: "var(--text-muted)" }}>
                      <span>Win Rate: <b style={{ color: stats.win_rate >= 50 ? "#10b981" : "#ef4444" }}>{vendas.length > 0 ? `${stats.win_rate.toFixed(0)}%` : "—"}</b></span>
                      <span>·</span>
                      <span>Wins: <b style={{ color: "#10b981" }}>{wins}</b></span>
                      <span>·</span>
                      <span>P.Factor: <b style={{ color: stats.profit_factor >= 1.2 ? "#10b981" : "#ef4444" }}>{vendas.length > 0 ? (stats.profit_factor === 999 ? "∞" : stats.profit_factor.toFixed(2)) : "—"}</b></span>
                      <span>·</span>
                      <span>DD: <b style={{ color: stats.drawdown > 10 ? "#ef4444" : "var(--text-primary)" }}>{stats.drawdown.toFixed(1)}%</b></span>
                    </div>

                    {/* Trade log */}
                    {allTrades.length === 0 ? (
                      <div className="px-3 pb-3 text-[10px]" style={{ color: "var(--text-muted)" }}>Nenhuma operação registrada ainda.</div>
                    ) : (
                      <div className="overflow-y-auto" style={{ maxHeight: 280 }}>
                        <table className="w-full text-[10px]" style={{ borderCollapse: "collapse" }}>
                          <thead>
                            <tr style={{ background: "var(--bg-card)", borderBottom: "1px solid var(--border)" }}>
                              {["#", "Moeda", "Tipo", "Dir", "Preço", "R$", "P&L", "Score", "Motivo"].map(h => (
                                <th key={h} className="px-2 py-1 text-left font-semibold" style={{ color: "var(--text-muted)" }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {allTrades.map((t, i) => {
                              const isOpen  = t.tipo === "C";
                              const pnl     = t.pnl_brl ?? 0;
                              const motivo  = isOpen ? (t.motivo_entrada ?? "—") : (t.motivo_saida ?? "—");
                              const dt      = new Date(t.time);
                              const hora    = `${dt.getDate().toString().padStart(2,"0")}/${(dt.getMonth()+1).toString().padStart(2,"0")} ${dt.getHours().toString().padStart(2,"0")}:${dt.getMinutes().toString().padStart(2,"0")}`;
                              return (
                                <tr key={t.id} style={{ borderBottom: "1px solid var(--border)", background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.015)" }}>
                                  <td className="px-2 py-1.5 tabular-nums" style={{ color: "var(--text-muted)" }}>{hora}</td>
                                  <td className="px-2 py-1.5 font-bold" style={{ color: "var(--text-primary)" }}>
                                    {(COIN_EMOJI[t.simbolo] ?? "○")} {t.simbolo}
                                  </td>
                                  <td className="px-2 py-1.5">
                                    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold" style={{
                                      background: isOpen ? "rgba(59,130,246,0.15)" : "rgba(107,114,128,0.15)",
                                      color: isOpen ? "#60a5fa" : "#9ca3af",
                                    }}>
                                      {isOpen ? "ABRE" : "FECHA"}
                                    </span>
                                  </td>
                                  <td className="px-2 py-1.5">
                                    <span className="font-bold" style={{ color: t.direction === "LONG" ? "#10b981" : "#ef4444" }}>
                                      {t.direction}
                                    </span>
                                  </td>
                                  <td className="px-2 py-1.5 tabular-nums" style={{ color: "var(--text-secondary)" }}>
                                    R$ {t.price_brl.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}
                                  </td>
                                  <td className="px-2 py-1.5 tabular-nums" style={{ color: "var(--text-secondary)" }}>
                                    {t.amount_brl.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}
                                  </td>
                                  <td className="px-2 py-1.5 tabular-nums font-bold" style={{ color: isOpen ? "var(--text-muted)" : pnl >= 0 ? "#10b981" : "#ef4444" }}>
                                    {isOpen ? "—" : `${pnl >= 0 ? "+" : ""}R$ ${Math.abs(pnl).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}`}
                                  </td>
                                  <td className="px-2 py-1.5 tabular-nums" style={{ color: "var(--text-secondary)" }}>
                                    {t.score?.toFixed(0) ?? "—"}
                                  </td>
                                  <td className="px-2 py-1.5" style={{ color: "var(--text-muted)", maxWidth: 120 }}>
                                    <span className="truncate block" title={motivo}>{motivo.slice(0, 30)}{motivo.length > 30 ? "…" : ""}</span>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}

                    <div className="px-3 py-2 flex justify-end border-t" style={{ borderColor: "var(--border)" }}>
                      <button onClick={() => onReset(cfg.id)}
                        className="text-[9px] px-2 py-1 rounded border transition-colors"
                        style={{ borderColor: "rgba(239,68,68,0.3)", color: "#ef4444" }}>
                        Zerar carteira
                      </button>
                    </div>
                  </div>
                );
              })()}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Fake old FuturesIAView (removed — replaced by FuturesIASinaisView + FuturesAllWalletsView) ──

function FuturesIAView({ wallets, scan, activePerfilId, onSelectPerfil, autoTrade, setAutoTrade }:
  { wallets: Record<string, FuturesWallet>; scan: FuturesScanData | null; activePerfilId: string; onSelectPerfil: (id: string) => void; autoTrade: boolean; setAutoTrade: (v: boolean) => void }) {

  const items = scan?.geral ?? [];
  const usd   = scan?.usd_brl ?? 5.2;

  const rows = PERFIS_FUTURES.map(cfg => {
    const w       = wallets[cfg.id] ?? emptyFuturesWallet(cfg.capital_inicial);
    const stats   = calcFuturesStats(w);
    const sinais  = contarSinaisAtivos(cfg, items);
    const iaScore = calcIAScore(stats);
    return { cfg, stats, sinais, iaScore, w };
  }).sort((a, b) => {
    if (a.iaScore !== null && b.iaScore !== null) return b.iaScore - a.iaScore;
    if (a.iaScore !== null) return -1;
    if (b.iaScore !== null) return 1;
    return b.sinais - a.sinais;
  });

  const semDados  = rows.every(r => r.iaScore === null);
  const melhor    = rows[0];
  const isActive  = (id: string) => id === activePerfilId;

  // Context summary
  const longCount  = items.filter(i => i.direction === "LONG"  && i.score_final >= 55).length;
  const shortCount = items.filter(i => i.direction === "SHORT" && i.score_final >= 55).length;
  const viés       = longCount > shortCount * 1.5 ? "altista" : shortCount > longCount * 1.5 ? "baixista" : "neutro";

  return (
    <div className="flex flex-col gap-5">
      {/* Recomendação IA */}
      <div className="rounded-xl p-5 flex flex-col gap-4"
        style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-base">🧠</span>
          <span className="font-black text-base" style={{ color: "var(--text-primary)" }}>Análise IA das Carteiras</span>
        </div>

        {/* Mercado */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Viés de Mercado", val: viés.toUpperCase(), cor: viés === "altista" ? "#10b981" : viés === "baixista" ? "#ef4444" : "#f59e0b" },
            { label: "Sinais LONG", val: String(longCount), cor: "#10b981" },
            { label: "Sinais SHORT", val: String(shortCount), cor: "#ef4444" },
          ].map(({ label, val, cor }) => (
            <div key={label} className="rounded-lg p-3 text-center" style={{ background: "var(--bg)", border: "1px solid var(--border)" }}>
              <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>{label}</div>
              <div className="text-lg font-black mt-0.5" style={{ color: cor }}>{val}</div>
            </div>
          ))}
        </div>

        {/* Perfil recomendado */}
        <div className="rounded-xl p-4 flex items-center gap-4"
          style={{ background: `${melhor.cfg.cor}12`, border: `1px solid ${melhor.cfg.cor}40` }}>
          <div className="text-3xl">{melhor.cfg.emoji}</div>
          <div className="flex-1 min-w-0">
            <div className="font-black text-sm" style={{ color: "var(--text-primary)" }}>
              {semDados ? "⭐ Melhor potencial agora" : "⭐ Melhor performance histórica"}
            </div>
            <div className="font-bold" style={{ color: melhor.cfg.cor }}>
              {melhor.cfg.nome} {melhor.cfg.nivel}
            </div>
            {semDados ? (
              <div className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                {melhor.sinais} sinais ativos no mercado atual · {melhor.cfg.descricao}
              </div>
            ) : (
              <div className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                ROI {melhor.stats.roi >= 0 ? "+" : ""}{melhor.stats.roi.toFixed(2)}% · Win {melhor.stats.win_rate.toFixed(0)}% · {melhor.stats.ops} ops · Score IA {(melhor.iaScore ?? 0).toFixed(1)}
              </div>
            )}
          </div>
          <div className="flex flex-col gap-2 shrink-0">
            <button onClick={() => { onSelectPerfil(melhor.cfg.id); }}
              disabled={isActive(melhor.cfg.id)}
              className="px-4 py-2 rounded-xl text-xs font-bold transition-all"
              style={{
                background: isActive(melhor.cfg.id) ? `${melhor.cfg.cor}20` : melhor.cfg.cor,
                color: isActive(melhor.cfg.id) ? melhor.cfg.cor : "#fff",
                border: `1px solid ${melhor.cfg.cor}60`,
              }}>
              {isActive(melhor.cfg.id) ? "✓ Ativo" : "Ativar Perfil"}
            </button>
            <button onClick={() => setAutoTrade(true)}
              disabled={autoTrade}
              className="px-4 py-2 rounded-xl text-xs font-bold transition-all"
              style={{
                background: autoTrade ? "rgba(16,185,129,0.1)" : "rgba(16,185,129,0.2)",
                color: "#10b981",
                border: "1px solid rgba(16,185,129,0.4)",
              }}>
              {autoTrade ? "✓ Auto Trade ON" : "Ligar Auto Trade"}
            </button>
          </div>
        </div>
      </div>

      {/* Ranking completo */}
      <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)" }}>
        <div className="px-4 py-3 font-semibold text-sm flex items-center justify-between"
          style={{ background: "var(--bg-card)", borderBottom: "1px solid var(--border)" }}>
          <span>Ranking de Perfis — {semDados ? "Por Sinais Ativos" : "Por Score IA"}</span>
          <span className="text-xs font-normal" style={{ color: "var(--text-muted)" }}>
            {semDados ? "Sem histórico — mostrando potencial de entrada" : `${rows.filter(r => r.iaScore !== null).length} com dados`}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr style={{ background: "var(--bg)", borderBottom: "1px solid var(--border)" }}>
                {["#", "Perfil", "Dir", "Sinais", "Ops", "ROI%", "Win%", "P.Factor", "DD%", "Score IA", ""].map(h => (
                  <th key={h} className="px-3 py-2 text-left font-semibold text-[10px] uppercase"
                    style={{ color: "var(--text-muted)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ cfg, stats, sinais, iaScore }, i) => {
                const active = isActive(cfg.id);
                return (
                  <tr key={cfg.id}
                    onClick={() => onSelectPerfil(cfg.id)}
                    className="cursor-pointer transition-colors hover:bg-[var(--bg)]"
                    style={{
                      borderBottom: "1px solid var(--border)",
                      background: active ? `${cfg.cor}08` : i === 0 ? "rgba(139,92,246,0.04)" : "transparent",
                    }}>
                    <td className="px-3 py-2.5 font-black" style={{ color: i === 0 ? "#f59e0b" : "var(--text-muted)" }}>
                      {i === 0 ? "★" : i + 1}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="mr-1">{cfg.emoji}</span>
                      <span className="font-bold" style={{ color: active ? cfg.cor : "var(--text-primary)" }}>{cfg.nome}</span>
                      <span className="ml-1 text-[9px] font-semibold" style={{ color: cfg.cor }}>{cfg.nivel}</span>
                      {active && <span className="ml-1 text-[8px] font-black text-emerald-400 bg-emerald-400/10 px-1 rounded">ATIVO</span>}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="text-[9px] font-bold" style={{ color: cfg.direction_allowed === "LONG" ? "#10b981" : cfg.direction_allowed === "SHORT" ? "#ef4444" : "#a855f7" }}>
                        {cfg.direction_allowed}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="font-bold tabular-nums" style={{ color: sinais > 0 ? "#10b981" : "var(--text-muted)" }}>
                        {sinais}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 tabular-nums" style={{ color: "var(--text-secondary)" }}>{stats.ops || "—"}</td>
                    <td className="px-3 py-2.5 tabular-nums font-bold" style={{ color: stats.roi >= 0 ? "#10b981" : "#ef4444" }}>
                      {stats.ops > 0 ? `${stats.roi >= 0 ? "+" : ""}${stats.roi.toFixed(2)}%` : "—"}
                    </td>
                    <td className="px-3 py-2.5 tabular-nums" style={{ color: stats.win_rate >= 50 ? "#10b981" : "#ef4444" }}>
                      {stats.ops > 0 ? `${stats.win_rate.toFixed(0)}%` : "—"}
                    </td>
                    <td className="px-3 py-2.5 tabular-nums" style={{ color: stats.profit_factor >= 1.2 ? "#10b981" : "#ef4444" }}>
                      {stats.ops > 0 ? (stats.profit_factor === 999 ? "∞" : stats.profit_factor.toFixed(2)) : "—"}
                    </td>
                    <td className="px-3 py-2.5 tabular-nums text-amber-400">
                      {stats.ops > 0 ? `${stats.drawdown.toFixed(1)}%` : "—"}
                    </td>
                    <td className="px-3 py-2.5 tabular-nums font-black" style={{ color: iaScore !== null ? (iaScore >= 60 ? "#10b981" : iaScore >= 40 ? "#f59e0b" : "#ef4444") : "var(--text-muted)" }}>
                      {iaScore !== null ? iaScore.toFixed(1) : sinais > 0 ? <span style={{ color: "#3b82f6" }}>{sinais} sinais</span> : "—"}
                    </td>
                    <td className="px-3 py-2.5">
                      <button onClick={e => { e.stopPropagation(); onSelectPerfil(cfg.id); }}
                        className="px-2 py-1 rounded-lg text-[9px] font-bold transition-all"
                        style={{
                          background: active ? `${cfg.cor}20` : `${cfg.cor}15`,
                          color: cfg.cor,
                          border: `1px solid ${cfg.cor}40`,
                        }}>
                        {active ? "✓" : "Usar"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Legenda do Score IA */}
      <div className="text-[10px] p-3 rounded-xl" style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-muted)" }}>
        <span className="font-bold" style={{ color: "var(--text-secondary)" }}>Score IA = </span>
        ROI×35% + Win Rate×30% + Profit Factor×20% − Drawdown×15% · Sinais = entradas potenciais no mercado atual com a lógica do perfil
      </div>
    </div>
  );
}

// ── Scalp View ────────────────────────────────────────────────────────────────

const SCALP_PERFIS = ["f_scalp_cons", "f_scalp_mod", "f_scalp_arj"] as const;

function calcScalpForce(it: FuturesItem, dir: "LONG" | "SHORT"): {
  tendencia: number; fluxo: number; volume: number; direcao: number; total: number;
} {
  // Tendência: score_tecnico + var24h alinhado com direção
  const varOk  = dir === "LONG" ? (it.var24h ?? 0) > 0 : (it.var24h ?? 0) < 0;
  const tendencia = Math.min(100, (it.score_tecnico ?? 50) * (varOk ? 1.1 : 0.7));

  // Fluxo: score_fluxo + oi_change_pct (mais OI = mais dinheiro entrando)
  const oiOk  = (it.oi_change_pct ?? 0) > 0.3;
  const fluxo = Math.min(100, (it.score_fluxo ?? 50) * (oiOk ? 1.15 : 0.8));

  // Volume: taker_buy_pct alinhado com direção + cvd_bullish
  const takerOk = dir === "LONG"
    ? (it.taker_buy_pct ?? 50) > 52
    : (it.taker_buy_pct ?? 50) < 48;
  const cvdOk  = dir === "LONG" ? (it.cvd_bullish ?? false) : !(it.cvd_bullish ?? false);
  const volume = Math.min(100, 50 + (takerOk ? 25 : -15) + (cvdOk ? 25 : -10));

  // Direção: direction_confidence
  const direcao = it.direction_confidence ?? 50;

  const total = tendencia * 0.3 + fluxo * 0.25 + volume * 0.2 + direcao * 0.25;
  return { tendencia, fluxo, volume, direcao, total };
}

function ScalpSignalCard({ it, wallets }: { it: FuturesItem; wallets: Record<string, FuturesWallet> }) {
  const dir   = it.direction as "LONG" | "SHORT";
  const isL   = dir === "LONG";
  const force = calcScalpForce(it, dir);
  const accentColor = isL ? "#10b981" : "#ef4444";
  const preco = it.preco * (it.usd_brl ?? 5.2);

  // Verificar se algum perfil scalp já tem posição
  const posAberta = SCALP_PERFIS.some(pid => wallets[pid]?.positions[it.simbolo]);

  const fmtP = (v: number) => v < 1 ? v.toFixed(5) : v < 100 ? v.toFixed(3) : v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const indicators = [
    { label: "Tendência", value: force.tendencia, icon: isL ? "📈" : "📉" },
    { label: "Fluxo",     value: force.fluxo,     icon: "💧" },
    { label: "Volume",    value: force.volume,     icon: "📊" },
    { label: "Direção",   value: force.direcao,    icon: "🎯" },
  ];

  const forceColor = force.total >= 70 ? "#22c55e" : force.total >= 55 ? "#f59e0b" : "#ef4444";
  const forceLabel = force.total >= 70 ? "FORTE" : force.total >= 55 ? "MODERADO" : "FRACO";

  // SL/TP para os 3 perfis
  const cfgs = SCALP_PERFIS.map(pid => PERFIS_FUTURES.find(p => p.id === pid)!).filter(Boolean);
  const avgSl = cfgs.reduce((a, c) => a + c.sl_pct, 0) / cfgs.length;
  const avgTp = cfgs.reduce((a, c) => a + c.tp_pct, 0) / cfgs.length;
  const slPrice = isL ? preco * (1 - avgSl) : preco * (1 + avgSl);
  const tpPrice = isL ? preco * (1 + avgTp) : preco * (1 - avgTp);

  return (
    <div className="rounded-xl overflow-hidden transition-all"
      style={{ background: "var(--bg-card)", border: `1px solid ${accentColor}35` }}>

      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2"
        style={{ background: `${accentColor}10`, borderBottom: `1px solid ${accentColor}20` }}>
        <div className="flex items-center gap-2">
          <span className="font-black text-sm" style={{ color: accentColor }}>
            {isL ? "▲" : "▼"} {it.simbolo.replace("USDT", "")}
          </span>
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded"
            style={{ background: `${accentColor}20`, color: accentColor }}>
            {dir}
          </span>
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded"
            style={{ background: "var(--bg-surface)", color: "var(--text-muted)" }}>
            {it.grade}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {posAberta && (
            <span className="text-[9px] font-black px-2 py-0.5 rounded-full animate-pulse"
              style={{ background: "rgba(245,158,11,0.2)", color: "#f59e0b" }}>
              EM POSIÇÃO
            </span>
          )}
          <div className="text-right">
            <div className="text-[10px] font-black tabular-nums" style={{ color: forceColor }}>{forceLabel}</div>
            <div className="text-[10px] font-black tabular-nums" style={{ color: forceColor }}>{force.total.toFixed(0)}%</div>
          </div>
        </div>
      </div>

      <div className="p-3 flex flex-col gap-2.5">
        {/* 4 indicadores */}
        <div className="grid grid-cols-4 gap-1.5">
          {indicators.map(ind => {
            const c = ind.value >= 65 ? "#22c55e" : ind.value >= 50 ? "#f59e0b" : "#ef4444";
            return (
              <div key={ind.label} className="rounded-lg p-2 text-center"
                style={{ background: "var(--bg-surface)", border: `1px solid ${c}30` }}>
                <div className="text-base leading-none mb-1">{ind.icon}</div>
                <div className="text-[8px] font-medium" style={{ color: "var(--text-muted)" }}>{ind.label}</div>
                <div className="text-[11px] font-black" style={{ color: c }}>{ind.value.toFixed(0)}</div>
                {/* mini bar */}
                <div className="mt-1 h-0.5 rounded-full overflow-hidden" style={{ background: "var(--border)" }}>
                  <div style={{ width: `${ind.value}%`, background: c, height: "100%" }} />
                </div>
              </div>
            );
          })}
        </div>

        {/* Entrada / SL / TP + leverage */}
        <div className="grid grid-cols-3 gap-1.5">
          <div className="rounded-lg p-2 text-center"
            style={{ background: `${accentColor}12`, border: `1px solid ${accentColor}30` }}>
            <div className="text-[8px] font-bold" style={{ color: accentColor }}>📍 Entrada</div>
            <div className="text-[10px] font-black tabular-nums" style={{ color: accentColor }}>R$ {fmtP(preco)}</div>
          </div>
          <div className="rounded-lg p-2 text-center"
            style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)" }}>
            <div className="text-[8px] font-bold text-red-400">🛑 SL</div>
            <div className="text-[10px] font-black tabular-nums text-red-400">R$ {fmtP(slPrice)}</div>
            <div className="text-[8px] text-red-400/70">−{(avgSl * 100).toFixed(1)}%</div>
          </div>
          <div className="rounded-lg p-2 text-center"
            style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.25)" }}>
            <div className="text-[8px] font-bold text-emerald-400">🎯 TP</div>
            <div className="text-[10px] font-black tabular-nums text-emerald-400">R$ {fmtP(tpPrice)}</div>
            <div className="text-[8px] text-emerald-400/70">+{(avgTp * 100).toFixed(1)}%</div>
          </div>
        </div>

        {/* Retorno alavancado */}
        <div className="rounded-lg px-3 py-1.5 flex items-center justify-between"
          style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
          <span className="text-[9px] font-semibold" style={{ color: "var(--text-muted)" }}>
            Score {it.score_final.toFixed(0)} · Conf {(it.direction_confidence ?? 0).toFixed(0)}%
          </span>
          <span className="text-[9px] font-black text-emerald-400">
            ⚡ Com 20x: +{(avgTp * 20 * 100).toFixed(0)}% / −{(avgSl * 20 * 100).toFixed(0)}%
          </span>
        </div>
      </div>
    </div>
  );
}

function FuturesScalpView({
  scan, wallets, autoTrade, setAutoTrade,
}: {
  scan: FuturesScanData | null;
  wallets: Record<string, FuturesWallet>;
  autoTrade: boolean;
  setAutoTrade: (v: boolean) => void;
}) {
  const [filterDir, setFilterDir] = useState<"ALL" | "LONG" | "SHORT">("ALL");
  const [sortBy,    setSortBy]    = useState<"forca" | "score">("forca");

  if (!scan) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3" style={{ color: "var(--text-muted)" }}>
        <span className="text-4xl">⚡</span>
        <p className="text-sm">Aguardando dados do mercado...</p>
      </div>
    );
  }

  // Sinal scalp: qualquer ativo com direção definida e score ≥ 30
  const candidatos = (scan.geral ?? [])
    .filter(it => it.direction !== "NEUTRO" && it.score_final >= 30)
    .map(it => ({ it, force: calcScalpForce(it, it.direction as "LONG" | "SHORT") }))
    .filter(({ force }) => force.total >= 40);

  const filtered = candidatos
    .filter(({ it }) => filterDir === "ALL" || it.direction === filterDir)
    .sort((a, b) => sortBy === "forca" ? b.force.total - a.force.total : b.it.score_final - a.it.score_final);

  const longs  = candidatos.filter(({ it }) => it.direction === "LONG");
  const shorts = candidatos.filter(({ it }) => it.direction === "SHORT");
  const forteCount = candidatos.filter(({ force }) => force.total >= 70).length;

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="rounded-2xl p-5 flex flex-col gap-4"
        style={{ background: "linear-gradient(135deg, rgba(34,197,94,0.06), rgba(239,68,68,0.04))", border: "1px solid var(--border)" }}>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xl">⚡</span>
              <h2 className="text-lg font-black" style={{ color: "var(--text-primary)" }}>Scalp IA — Futuros</h2>
            </div>
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              Surfa movimentos curtos com alvos de <strong>0.7-1.3%</strong> no ativo.
              Com 20x de alavancagem → <strong style={{ color: "#22c55e" }}>+14-26% por operação</strong>.
              Análise de Tendência · Fluxo · Volume · Direção.
            </p>
          </div>
          {/* Auto Trade toggle */}
          <button
            onClick={() => setAutoTrade(!autoTrade)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all shrink-0"
            style={{
              background: autoTrade ? "rgba(34,197,94,0.15)" : "var(--bg-surface)",
              color: autoTrade ? "#22c55e" : "var(--text-muted)",
              border: autoTrade ? "1px solid rgba(34,197,94,0.4)" : "1px solid var(--border)",
            }}>
            <span className={`w-2 h-2 rounded-full ${autoTrade ? "bg-emerald-400 animate-pulse" : "bg-gray-500"}`} />
            Auto Trade {autoTrade ? "ON" : "OFF"}
          </button>
        </div>

        {/* Resumo dos 3 perfis */}
        <div className="grid grid-cols-3 gap-3">
          {SCALP_PERFIS.map(pid => {
            const cfg = PERFIS_FUTURES.find(p => p.id === pid)!;
            if (!cfg) return null;
            const w   = wallets[pid];
            const posCount = w ? Object.keys(w.positions).length : 0;
            const pnl = w ? (Object.values(w.positions).reduce((a, p) => {
              const curr = p.last_price_brl;
              const v = p.direction === "LONG" ? (curr - p.entry_price_brl) * p.units : (p.entry_price_brl - curr) * p.units;
              return a + v;
            }, 0)) : 0;
            const cor = cfg.cor;
            return (
              <div key={pid} className="rounded-xl p-3 flex flex-col gap-1"
                style={{ background: "var(--bg-card)", border: `1px solid ${cor}40` }}>
                <div className="flex items-center gap-1.5">
                  <span className="text-sm">{cfg.emoji}</span>
                  <span className="text-[11px] font-bold" style={{ color: cor }}>{cfg.nome} {cfg.nivel}</span>
                </div>
                <div className="text-[9px]" style={{ color: "var(--text-muted)" }}>
                  {cfg.long_filter ? `LONG: TEC≥${cfg.long_filter.tec_min}/FLX≥${cfg.long_filter.flx_min}/CTX≥${cfg.long_filter.ctx_min}/FND≥${cfg.long_filter.fnd_min}` : cfg.short_filter ? `SHORT: TEC≤${cfg.short_filter.tec_max}/FLX≤${cfg.short_filter.flx_max}` : `sc≥${cfg.score_compra}`} · SL {(cfg.sl_pct * 100).toFixed(1)}% · TP {(cfg.tp_pct * 100).toFixed(1)}%
                </div>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-[10px]" style={{ color: "var(--text-secondary)" }}>
                    {posCount} posição{posCount !== 1 ? "ões" : ""}
                  </span>
                  <span className="text-[10px] font-black" style={{ color: pnl >= 0 ? "#22c55e" : "#ef4444" }}>
                    {pnl >= 0 ? "+" : ""}R$ {Math.abs(pnl).toFixed(0)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Stats rápidos */}
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: "Total Sinais",  value: String(candidatos.length),      color: "var(--text-primary)" },
            { label: "LONG",          value: String(longs.length),            color: "#22c55e" },
            { label: "SHORT",         value: String(shorts.length),           color: "#ef4444" },
            { label: "Força Alta",    value: String(forteCount),              color: "#f59e0b" },
          ].map(({ label, value, color }) => (
            <div key={label} className="rounded-xl p-3 text-center"
              style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
              <div className="text-[9px] font-medium mb-1" style={{ color: "var(--text-muted)" }}>{label}</div>
              <div className="text-xl font-black" style={{ color }}>{value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Filtros */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1 p-1 rounded-xl" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          {(["ALL", "LONG", "SHORT"] as const).map(d => (
            <button key={d} onClick={() => setFilterDir(d)}
              className="px-3 py-1 rounded-lg text-xs font-bold transition-all"
              style={{
                background: filterDir === d ? (d === "LONG" ? "rgba(34,197,94,0.2)" : d === "SHORT" ? "rgba(239,68,68,0.2)" : "var(--primary-glow)") : "transparent",
                color: filterDir === d ? (d === "LONG" ? "#22c55e" : d === "SHORT" ? "#ef4444" : "var(--primary)") : "var(--text-muted)",
                border: filterDir === d ? `1px solid ${d === "LONG" ? "rgba(34,197,94,0.4)" : d === "SHORT" ? "rgba(239,68,68,0.4)" : "var(--primary-border)"}` : "1px solid transparent",
              }}>
              {d === "ALL" ? "Todos" : d === "LONG" ? "▲ Long" : "▼ Short"}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 p-1 rounded-xl" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          {([["forca", "↑ Força"], ["score", "↑ Score"]] as const).map(([k, l]) => (
            <button key={k} onClick={() => setSortBy(k)}
              className="px-3 py-1 rounded-lg text-xs font-bold transition-all"
              style={{
                background: sortBy === k ? "var(--primary-glow)" : "transparent",
                color: sortBy === k ? "var(--primary)" : "var(--text-muted)",
                border: sortBy === k ? "1px solid var(--primary-border)" : "1px solid transparent",
              }}>
              {l}
            </button>
          ))}
        </div>
        <span className="text-xs ml-auto" style={{ color: "var(--text-muted)" }}>
          {filtered.length} ativo{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Grid de sinais */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center py-16 gap-3" style={{ color: "var(--text-muted)" }}>
          <span className="text-3xl">⚡</span>
          <p className="text-sm">Nenhum sinal de scalp com força suficiente no momento.</p>
          <p className="text-xs">O mercado pode estar sem direção clara. Aguarde um movimento.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {filtered.map(({ it }) => (
            <ScalpSignalCard key={it.simbolo} it={it} wallets={wallets} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function FuturesPage() {
  const [view, setView]             = useState<"ranking" | "carteiras" | "comparativo" | "banco" | "ia" | "scalp" | "bots">("ranking");
  const [autoTrade, setAutoTrade]   = useState(true);
  const [activePerfilId, setActivePerfilId] = useState("f_mod_normal");
  const [scan, setScan]             = useState<FuturesScanData | null>(null);
  const [btcDom, setBtcDom]         = useState<number | undefined>();
  const [loadingScan, setLoadingScan] = useState(false);

  const { wallets, abrirFutures, fecharFutures, atualizarTodos, resetPerfil, resetAll } = useFuturesWallet();
  const { banco, salvar: salvarBanco, removerData }                                      = useFuturesBanco();
  const { botWallets, resetBot, resetAllBots }                                           = useBotWallets(scan);

  const walletsRef       = useRef(wallets);
  const abrirRef         = useRef(abrirFutures);
  const fecharRef        = useRef(fecharFutures);
  const atualizarRef     = useRef(atualizarTodos);
  useEffect(() => { walletsRef.current   = wallets;       }, [wallets]);
  useEffect(() => { abrirRef.current     = abrirFutures;  }, [abrirFutures]);
  useEffect(() => { fecharRef.current    = fecharFutures; }, [fecharFutures]);
  useEffect(() => { atualizarRef.current = atualizarTodos;}, [atualizarTodos]);

  // Diagnóstico do auto-trade (visibilidade total do que está acontecendo)
  const [diag, setDiag] = useState<{
    ts: number; totalItens: number; totalLong: number; totalShort: number; totalNeutro: number;
    totalNR: number; tentativas: number; bloqueadas: number; erro: string;
  } | null>(null);

  const activeCfg    = PERFIS_FUTURES.find(p => p.id === activePerfilId)!;
  const activeWallet = wallets[activePerfilId] ?? emptyFuturesWallet();

  // Fetch scan
  const fetchScan = useCallback(async () => {
    setLoadingScan(true);
    try {
      const d: FuturesScanData = await fetch(`${API}/cripto/futures/scan`).then(r => r.json());
      setScan(d);
      setBtcDom(d.btc_dom);
    } catch {}
    finally { setLoadingScan(false); }
  }, []);

  useEffect(() => { fetchScan(); }, [fetchScan]);

  // Auto-trade — SSE em tempo real (reconexão automática, sem polling manual)
  useEffect(() => {
    if (!autoTrade) return;

    const processarScan = (d: FuturesScanData) => {
      setScan(d);
      setBtcDom(d.btc_dom);
      const usd_brl = d.usd_brl ?? 5.2;
      const itens   = d.geral ?? [];
      let totalItens = itens.length, totalLong = 0, totalShort = 0, totalNeutro = 0, totalNR = 0;
      let tentativas = 0, bloqueadas = 0;

      for (const it of itens) {
        if      (it.direction === "LONG")  totalLong++;
        else if (it.direction === "SHORT") totalShort++;
        else                               totalNeutro++;
        if (it.grade === "NR")             totalNR++;
      }

      atualizarRef.current(itens);
      const snap = walletsRef.current;

      for (const cfg of PERFIS_FUTURES) {
        const w = snap[cfg.id];
        if (!w) continue;

        // SL / TP / reversão em posições abertas
        for (const [sym, pos] of Object.entries(w.positions)) {
          const it = itens.find(i => i.simbolo === sym);
          if (!it) continue;
          const curr_brl = it.preco * usd_brl;
          if (pos.direction === "LONG") {
            if (pos.stop_loss_price   && curr_brl <= pos.stop_loss_price)
              fecharRef.current(cfg.id, sym, curr_brl, usd_brl, it.score_final, true, `Stop Loss ${(cfg.sl_pct*100).toFixed(1)}%`);
            else if (pos.take_profit_price && curr_brl >= pos.take_profit_price)
              fecharRef.current(cfg.id, sym, curr_brl, usd_brl, it.score_final, true, `Take Profit ${(cfg.tp_pct*100).toFixed(1)}%`);
            else if (it.direction === "SHORT" && it.score_final > 65)
              fecharRef.current(cfg.id, sym, curr_brl, usd_brl, it.score_final, true, "Reversão SHORT");
          } else {
            if (pos.stop_loss_price   && curr_brl >= pos.stop_loss_price)
              fecharRef.current(cfg.id, sym, curr_brl, usd_brl, it.score_final, true, `Stop Loss SHORT ${(cfg.sl_pct*100).toFixed(1)}%`);
            else if (pos.take_profit_price && curr_brl <= pos.take_profit_price)
              fecharRef.current(cfg.id, sym, curr_brl, usd_brl, it.score_final, true, `Take Profit SHORT ${(cfg.tp_pct*100).toFixed(1)}%`);
            else if (it.direction === "LONG" && it.score_final > 65)
              fecharRef.current(cfg.id, sym, curr_brl, usd_brl, it.score_final, true, "Reversão LONG");
          }
        }

        // Novas entradas — usa podeEntrarFutures() que verifica score + indicadores do ativo
        for (const it of itens) {
          const dir = podeEntrarFutures(cfg, it);
          if (!dir) continue;
          if (snap[cfg.id]?.positions[it.simbolo]) { bloqueadas++; continue; }
          tentativas++;
          abrirRef.current(cfg.id, it.simbolo, it.preco * usd_brl, usd_brl, it.score_final, dir, true, it.grade ?? "B");
        }
      }

      setDiag({ ts: Date.now(), totalItens, totalLong, totalShort, totalNeutro, totalNR, tentativas, bloqueadas, erro: "" });
    };

    // EventSource — reconexão automática nativa do browser
    const es = new EventSource(`${API}/cripto/futures/stream?interval=30`);

    es.onmessage = (event) => {
      try {
        const d = JSON.parse(event.data) as FuturesScanData & { erro?: string };
        if (d.erro) {
          setDiag(prev => prev
            ? { ...prev, erro: d.erro! }
            : { ts: Date.now(), totalItens: 0, totalLong: 0, totalShort: 0, totalNeutro: 0, totalNR: 0, tentativas: 0, bloqueadas: 0, erro: d.erro! }
          );
          return;
        }
        processarScan(d);
      } catch {}
    };

    es.onerror = () => {
      setDiag(prev => prev ? { ...prev, erro: "SSE reconectando..." } : null);
    };

    return () => es.close();
  }, [autoTrade]);

  const handleAtualizar = useCallback(async () => { await fetchScan(); }, [fetchScan]);

  const handleFecharCarteira = useCallback((perfilId: string, sym: string) => {
    const w = walletsRef.current[perfilId];
    const pos = w?.positions[sym];
    if (!pos) return;
    fecharFutures(perfilId, sym, pos.last_price_brl, pos.last_usd_brl, 0, false, "Fechamento manual");
  }, [fecharFutures]);

  const handleSalvarAtivo = useCallback(() => {
    salvarBanco([walletToFuturesBancoEntry(activeCfg, activeWallet)]);
  }, [activeCfg, activeWallet, salvarBanco]);

  const handleSalvarTodos = useCallback(() => {
    salvarBanco(PERFIS_FUTURES.map(cfg => walletToFuturesBancoEntry(cfg, wallets[cfg.id] ?? emptyFuturesWallet(cfg.capital_inicial))));
  }, [wallets, salvarBanco]);

  // Tab button
  const TabBtn = ({ v, label, icon }: { v: typeof view; label: string; icon: string }) => (
    <button onClick={() => setView(v)}
      className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
        view === v ? "bg-[var(--text-primary)] text-[var(--bg)]" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--border)]/30"}`}>
      <span>{icon}</span>{label}
      {(v === "carteiras" || v === "ia") && autoTrade && <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />}
    </button>
  );

  // Profile groups for the selector
  const GRUPOS = [
    { label: "Conservador", ids: ["f_cons_normal", "f_cons_pro", "f_cons_promax", "f_cons_alav"] },
    { label: "Moderado",    ids: ["f_mod_normal",  "f_mod_pro",  "f_mod_promax",  "f_mod_alav"]  },
    { label: "Agressivo",   ids: ["f_agr_normal",  "f_agr_pro",  "f_agr_promax",  "f_agr_alav"]  },
    { label: "Subida",      ids: ["f_sub_cons",    "f_sub_mod",  "f_sub_agr",     "f_sub_alav"]  },
    { label: "Scalp",       ids: ["f_scalp_cons",  "f_scalp_mod","f_scalp_arj"]                  },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 pb-12 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3 pt-4">
        <div>
          <h1 className="text-2xl font-black text-[var(--text-primary)]">Futures IA</h1>
          <p className="text-sm text-[var(--text-secondary)]">Contratos Futuros · LONG & SHORT · Score Multidimensional</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {loadingScan && (
            <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
              <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
              Analisando...
            </div>
          )}
          <button onClick={handleAtualizar}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
            style={{ background: "var(--bg-card)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}>
            ↻ Forçar scan
          </button>
        </div>
      </div>

      {/* Diagnóstico auto-trade */}
      {diag && (
        <div className="rounded-xl px-4 py-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[11px]"
          style={{
            background: diag.erro ? "rgba(239,68,68,0.08)" : diag.tentativas > 0 ? "rgba(34,197,94,0.06)" : "rgba(245,158,11,0.06)",
            border: `1px solid ${diag.erro ? "rgba(239,68,68,0.3)" : diag.tentativas > 0 ? "rgba(34,197,94,0.25)" : "rgba(245,158,11,0.25)"}`,
          }}>
          <span style={{ color: "var(--text-muted)" }}>
            🕐 {new Date(diag.ts).toLocaleTimeString("pt-BR")}
          </span>
          <span style={{ color: "var(--text-secondary)" }}>
            📡 {diag.totalItens} ativos escaneados
          </span>
          <span style={{ color: "#22c55e" }}>▲ {diag.totalLong} LONG</span>
          <span style={{ color: "#ef4444" }}>▼ {diag.totalShort} SHORT</span>
          <span style={{ color: "var(--text-muted)" }}>— {diag.totalNeutro} neutro · {diag.totalNR} NR</span>
          <span style={{ color: diag.tentativas > 0 ? "#22c55e" : "#f59e0b", fontWeight: 700 }}>
            ✅ {diag.tentativas} entrada{diag.tentativas !== 1 ? "s" : ""} abertas
          </span>
          {diag.bloqueadas > 0 && (
            <span style={{ color: "#f59e0b" }}>🔒 {diag.bloqueadas} bloqueadas (posição existente)</span>
          )}
          {diag.erro && (
            <span style={{ color: "#ef4444", fontWeight: 700 }}>⚠️ ERRO: {diag.erro}</span>
          )}
        </div>
      )}

      {/* Tab bar */}
      <div className="flex gap-2 border-b border-[var(--border)] pb-2 flex-wrap">
        <TabBtn v="ranking"     label="Ranking"     icon="📊" />
        <TabBtn v="carteiras"   label="Carteiras"   icon="💼" />
        <TabBtn v="scalp"       label="Scalp"       icon="⚡" />
        <TabBtn v="bots"        label="Bots"        icon="🤖" />
        <TabBtn v="ia"          label="IA Análise"  icon="🧠" />
        <TabBtn v="comparativo" label="Comparativo" icon="⚖️" />
        <TabBtn v="banco"       label="Banco"       icon="🗄️" />
      </div>

      {/* Bots */}
      {view === "bots" && (
        <BotTabView
          botWallets={botWallets}
          scan={scan}
          onResetBot={resetBot}
          onResetAll={resetAllBots}
        />
      )}

      {/* Ranking */}
      {view === "ranking" && <FuturesRankingView scan={scan} btcDom={btcDom} />}

      {/* Carteiras — todas as 16 simultâneas */}
      {view === "carteiras" && (
        <FuturesAllWalletsView
          wallets={wallets}
          scan={scan}
          autoTrade={autoTrade}
          setAutoTrade={setAutoTrade}
          onFechar={handleFecharCarteira}
          onReset={resetPerfil}
          onAtualizar={handleAtualizar}
          onSalvarTodos={handleSalvarTodos}
        />
      )}

      {/* Scalp */}
      {view === "scalp" && <FuturesScalpView scan={scan} wallets={wallets} autoTrade={autoTrade} setAutoTrade={setAutoTrade} />}

      {/* IA Sinais + Aprendizado */}
      {view === "ia" && (
        <FuturesIASinaisView
          scan={scan}
          wallets={wallets}
          autoTrade={autoTrade}
          setAutoTrade={setAutoTrade}
        />
      )}

      {/* Comparativo */}
      {view === "comparativo" && (
        <FuturesComparativoView
          wallets={wallets}
          onSelect={id => { setActivePerfilId(id); setView("carteiras"); }}
          onResetAll={resetAll}
        />
      )}

      {/* Banco */}
      {view === "banco" && (
        <FuturesBancoView
          banco={banco}
          onSalvarTodos={handleSalvarTodos}
          onRemoverData={removerData}
        />
      )}
    </div>
  );
}
