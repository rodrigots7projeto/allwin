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

// ── Perfis Futures ────────────────────────────────────────────────────────────

// Objetivo futuros: capturar 1-5% no ativo. Com alavancagem, isso vira 10-50%+ de retorno na margem.
// SL sempre < TP para manter R:R ≥ 1:2. Entradas frequentes > ganhos grandes por trade.
const PERFIS_FUTURES: FuturesPerfilConfig[] = [
  // ── Conservador ─────────────────────────────── SL/TP no ativo (não alavancado)
  // aguardar_ok: true em TODOS os perfis — futuros entra em OPERAR e AGUARDAR (mais entradas)
  { id: "f_cons_normal", nome: "Conservador", nivel: "Normal", emoji: "🛡️", cor: "#3b82f6",
    score_compra: 68, score_venda: 45, bull_pct_min: 53, sl_pct: 0.008, tp_pct: 0.02,
    aguardar_ok: true, capital_inicial: 100000, stake_base: 1000, direction_allowed: "BOTH",
    descricao: "Alvo 2% no ativo (SL 0.8%). Com 10x = +20% retorno. Score ≥ 68." },
  { id: "f_cons_pro", nome: "Conservador", nivel: "PRO", emoji: "🛡️", cor: "#2563eb",
    score_compra: 65, score_venda: 42, bull_pct_min: 51, sl_pct: 0.009, tp_pct: 0.025,
    aguardar_ok: true, capital_inicial: 100000, stake_base: 1000, direction_allowed: "BOTH",
    descricao: "Alvo 2.5% no ativo (SL 0.9%). Com 10x = +25% retorno. Score ≥ 65." },
  { id: "f_cons_promax", nome: "Conservador", nivel: "PRO MAX", emoji: "🛡️", cor: "#1d4ed8",
    score_compra: 62, score_venda: 40, bull_pct_min: 49, sl_pct: 0.010, tp_pct: 0.03,
    aguardar_ok: true, capital_inicial: 100000, stake_base: 1000, direction_allowed: "BOTH",
    descricao: "Alvo 3% no ativo (SL 1%). Com 10x = +30% retorno. Score ≥ 62." },
  // ── Moderado ─────────────────────────────────
  { id: "f_mod_normal", nome: "Moderado", nivel: "Normal", emoji: "⚖️", cor: "#8b5cf6",
    score_compra: 60, score_venda: 38, bull_pct_min: 47, sl_pct: 0.010, tp_pct: 0.025,
    aguardar_ok: true, capital_inicial: 100000, stake_base: 1000, direction_allowed: "BOTH",
    descricao: "Alvo 2.5% no ativo (SL 1%). Com 10x = +25% retorno. Score ≥ 60." },
  { id: "f_mod_pro", nome: "Moderado", nivel: "PRO", emoji: "⚖️", cor: "#7c3aed",
    score_compra: 55, score_venda: 37, bull_pct_min: 45, sl_pct: 0.012, tp_pct: 0.03,
    aguardar_ok: true, capital_inicial: 100000, stake_base: 1000, direction_allowed: "BOTH",
    descricao: "Alvo 3% no ativo (SL 1.2%). Com 10x = +30% retorno. Score ≥ 55." },
  { id: "f_mod_promax", nome: "Moderado", nivel: "PRO MAX", emoji: "⚖️", cor: "#6d28d9",
    score_compra: 52, score_venda: 35, bull_pct_min: 43, sl_pct: 0.013, tp_pct: 0.035,
    aguardar_ok: true, capital_inicial: 100000, stake_base: 1000, direction_allowed: "BOTH",
    descricao: "Alvo 3.5% no ativo (SL 1.3%). Com 10x = +35% retorno. Score ≥ 52." },
  // ── Agressivo ─────────────────────────────────
  { id: "f_agr_normal", nome: "Agressivo", nivel: "Normal", emoji: "⚡", cor: "#f59e0b",
    score_compra: 48, score_venda: 33, bull_pct_min: 41, sl_pct: 0.013, tp_pct: 0.035,
    aguardar_ok: true, capital_inicial: 100000, stake_base: 1000, direction_allowed: "BOTH",
    descricao: "Alvo 3.5% no ativo (SL 1.3%). Com 5x = +17.5% retorno. Score ≥ 48." },
  { id: "f_agr_pro", nome: "Agressivo", nivel: "PRO", emoji: "⚡", cor: "#d97706",
    score_compra: 45, score_venda: 32, bull_pct_min: 39, sl_pct: 0.015, tp_pct: 0.04,
    aguardar_ok: true, capital_inicial: 100000, stake_base: 1000, direction_allowed: "BOTH",
    descricao: "Alvo 4% no ativo (SL 1.5%). Com 5x = +20% retorno. Score ≥ 45." },
  { id: "f_agr_promax", nome: "Agressivo", nivel: "PRO MAX", emoji: "⚡", cor: "#b45309",
    score_compra: 42, score_venda: 30, bull_pct_min: 37, sl_pct: 0.017, tp_pct: 0.05,
    aguardar_ok: true, capital_inicial: 100000, stake_base: 1000, direction_allowed: "BOTH",
    descricao: "Alvo 5% no ativo (SL 1.7%). Com 5x = +25% retorno. Score ≥ 42." },
  // ── Alavancado (stake maior, alvos menores para girar mais) ──────────────────
  { id: "f_cons_alav", nome: "Conservador", nivel: "Alavancado", emoji: "🔱", cor: "#06b6d4",
    score_compra: 72, score_venda: 50, bull_pct_min: 55, sl_pct: 0.006, tp_pct: 0.015,
    aguardar_ok: true, capital_inicial: 100000, stake_base: 5000, stake_dupla_score: 87,
    direction_allowed: "BOTH",
    descricao: "Alvo 1.5% no ativo (SL 0.6%). Com 20x = +30% retorno. R$ 5k stake. Score ≥ 72." },
  { id: "f_mod_alav", nome: "Moderado", nivel: "Alavancado", emoji: "🔱", cor: "#0ea5e9",
    score_compra: 68, score_venda: 47, bull_pct_min: 52, sl_pct: 0.007, tp_pct: 0.018,
    aguardar_ok: true, capital_inicial: 100000, stake_base: 5000, stake_dupla_score: 83,
    direction_allowed: "BOTH",
    descricao: "Alvo 1.8% no ativo (SL 0.7%). Com 20x = +36% retorno. Score ≥ 68." },
  { id: "f_agr_alav", nome: "Agressivo", nivel: "Alavancado", emoji: "🔱", cor: "#f97316",
    score_compra: 63, score_venda: 43, bull_pct_min: 48, sl_pct: 0.008, tp_pct: 0.02,
    aguardar_ok: true, capital_inicial: 100000, stake_base: 5000, stake_dupla_score: 80,
    direction_allowed: "BOTH",
    descricao: "Alvo 2% no ativo (SL 0.8%). Com 20x = +40% retorno. Score ≥ 63." },
  // ── Subida (captura tendência inicial — TP maior pois entra antes do sinal) ──
  { id: "f_sub_cons", nome: "Subida", nivel: "Normal" as "Normal", emoji: "📈", cor: "#22c55e",
    score_compra: 48, score_max_compra: 79, score_venda: 33, bull_pct_min: 51, sl_pct: 0.010, tp_pct: 0.035,
    aguardar_ok: false, apenas_aguardar: true, capital_inicial: 100000, stake_base: 500,
    direction_allowed: "LONG",
    descricao: "Entra antes do sinal pleno. Alvo 3.5% (SL 1%). Com 5x = +17.5%. Score 48-59." },
  { id: "f_sub_mod", nome: "Subida", nivel: "PRO" as "PRO", emoji: "📈", cor: "#16a34a",
    score_compra: 40, score_max_compra: 79, score_venda: 30, bull_pct_min: 48, sl_pct: 0.012, tp_pct: 0.04,
    aguardar_ok: false, apenas_aguardar: true, capital_inicial: 100000, stake_base: 500,
    direction_allowed: "LONG",
    descricao: "Entrada antecipada. Alvo 4% (SL 1.2%). Com 5x = +20%. Score 40-59." },
  { id: "f_sub_agr", nome: "Subida", nivel: "PRO MAX" as "PRO MAX", emoji: "📈", cor: "#15803d",
    score_compra: 35, score_max_compra: 79, score_venda: 28, bull_pct_min: 45, sl_pct: 0.015, tp_pct: 0.05,
    aguardar_ok: false, apenas_aguardar: true, capital_inicial: 100000, stake_base: 500,
    direction_allowed: "LONG",
    descricao: "Entrada muito antecipada. Alvo 5% (SL 1.5%). Com 5x = +25%. Score 35-59." },
  { id: "f_sub_alav", nome: "Subida", nivel: "Alavancado" as "Alavancado", emoji: "📈🔱", cor: "#84cc16",
    score_compra: 44, score_max_compra: 79, score_venda: 30, bull_pct_min: 49, sl_pct: 0.010, tp_pct: 0.03,
    aguardar_ok: false, apenas_aguardar: true, capital_inicial: 100000, stake_base: 500, stake_dupla_score: 72,
    direction_allowed: "LONG",
    descricao: "Subida alavancada. Alvo 3% (SL 1%). Com 10x = +30%. Score 44-59." },
  // ── Scalp (muitas entradas, alvos pequenos, surfa qualquer movimento direcional) ──
  { id: "f_scalp_cons", nome: "Scalp", nivel: "Conservador" as "Normal", emoji: "⚡🛡️", cor: "#22d3ee",
    score_compra: 45, score_venda: 30, bull_pct_min: 0, sl_pct: 0.003, tp_pct: 0.007,
    aguardar_ok: true, capital_inicial: 100000, stake_base: 2000,
    direction_allowed: "BOTH",
    descricao: "Scalp: alvo 0.7% no ativo (SL 0.3%). Com 20x = +14% por trade. Score ≥ 45." },
  { id: "f_scalp_mod", nome: "Scalp", nivel: "Moderado" as "PRO", emoji: "⚡⚖️", cor: "#a78bfa",
    score_compra: 38, score_venda: 24, bull_pct_min: 0, sl_pct: 0.004, tp_pct: 0.010,
    aguardar_ok: true, capital_inicial: 100000, stake_base: 2000,
    direction_allowed: "BOTH",
    descricao: "Scalp: alvo 1% no ativo (SL 0.4%). Com 20x = +20% por trade. Score ≥ 38." },
  { id: "f_scalp_arj", nome: "Scalp", nivel: "Arrojado" as "PRO MAX", emoji: "⚡🔥", cor: "#fb923c",
    score_compra: 30, score_venda: 18, bull_pct_min: 0, sl_pct: 0.005, tp_pct: 0.013,
    aguardar_ok: true, capital_inicial: 100000, stake_base: 2000,
    direction_allowed: "BOTH",
    descricao: "Scalp: alvo 1.3% no ativo (SL 0.5%). Com 20x = +26% por trade. Score ≥ 30. Máximas entradas." },
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

function useFuturesWallet() {
  const [wallets, setWallets] = useState<Record<string, FuturesWallet>>(() => {
    try {
      const s = localStorage.getItem(FUT_WALLET_KEY);
      if (s) { const p = JSON.parse(s); return { ...emptyMultiFutures(), ...p }; }
    } catch {}
    return emptyMultiFutures();
  });

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
      // SL/TP depend on direction
      const sl_price = direction === "LONG"
        ? price_brl * (1 - cfg.sl_pct)
        : price_brl * (1 + cfg.sl_pct);
      const tp_price = direction === "LONG"
        ? price_brl * (1 + cfg.tp_pct)
        : price_brl * (1 - cfg.tp_pct);
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
      return { ...prev, [perfilId]: { ...w, saldo_livre: w.saldo_livre - amount, positions: { ...w.positions, [simbolo]: pos }, trades: [...w.trades, trade] } };
    });
  }, []);

  const fecharFutures = useCallback((perfilId: string, simbolo: string, price_brl: number, usd_brl: number, score: number, auto = false, motivo_saida?: string) => {
    upd(prev => {
      const w = prev[perfilId];
      if (!w) return prev;
      const pos = w.positions[simbolo];
      if (!pos) return prev;
      // P&L depends on direction
      const sell_value = pos.units * price_brl;
      const pnl_brl = pos.direction === "LONG"
        ? sell_value - pos.amount_brl
        : pos.amount_brl - sell_value;
      const trade: FuturesTrade = {
        id: `${Date.now()}-${perfilId}-${simbolo}-V`, simbolo, tipo: "V", direction: pos.direction,
        price_brl, amount_brl: sell_value, pnl_brl, pct: (pnl_brl / pos.amount_brl) * 100,
        time: Date.now(), score, auto, motivo_saida,
      };
      const { [simbolo]: _r, ...rest } = w.positions;
      const devolver = pos.amount_brl + pnl_brl; // return original stake ± P&L
      return { ...prev, [perfilId]: { ...w, saldo_livre: w.saldo_livre + devolver, positions: rest, trades: [...w.trades, trade] } };
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
    upd(prev => ({ ...prev, [perfilId]: emptyFuturesWallet(cfg?.capital_inicial ?? 100000) }));
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
    // scoreOk já filtra por threshold do perfil — grade não bloqueia entrada (scalp opera em qualquer grade)
    const scoreOk = it.score_final >= cfg.score_compra && it.score_final <= (cfg.score_max_compra ?? 100);
    const dirOk   = it.direction !== "NEUTRO" && (cfg.direction_allowed === "BOTH" || cfg.direction_allowed === it.direction);
    if (scoreOk && dirOk) n++;
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
      // Futuros: LONG → entra LONG, SHORT → entra SHORT. Só score + direção.
      const scoreOk = it.score_final >= cfg.score_compra && it.score_final <= (cfg.score_max_compra ?? 100);
      const dirOk   = cfg.direction_allowed === "BOTH" || cfg.direction_allowed === it.direction;
      if (scoreOk && dirOk) { matched.push(`${cfg.nome} ${cfg.nivel}`); matchedCfgs.push(cfg); }
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
                      {cfg.direction_allowed} · sc≥{cfg.score_compra} · SL{(cfg.sl_pct*100).toFixed(0)}%/TP{(cfg.tp_pct*100).toFixed(0)}%
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

              {/* Expanded stats */}
              {isExpanded && (
                <div className="border-t px-4 py-3 flex flex-col gap-2" style={{ borderColor: "var(--border)", background: "var(--bg)" }}>
                  <div className="grid grid-cols-3 gap-2 text-[10px]">
                    {[
                      { l: "Saldo livre", v: `R$ ${stats.capital.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`, c: "var(--text-primary)" },
                      { l: "Win Rate", v: stats.ops > 0 ? `${stats.win_rate.toFixed(0)}%` : "—", c: stats.win_rate >= 50 ? "#10b981" : "#ef4444" },
                      { l: "P. Factor", v: stats.ops > 0 ? (stats.profit_factor === 999 ? "∞" : stats.profit_factor.toFixed(2)) : "—", c: stats.profit_factor >= 1.2 ? "#10b981" : "#ef4444" },
                    ].map(({ l, v, c }) => (
                      <div key={l} className="rounded-lg p-2" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
                        <div style={{ color: "var(--text-muted)" }}>{l}</div>
                        <div className="font-bold mt-0.5" style={{ color: c }}>{v}</div>
                      </div>
                    ))}
                  </div>
                  <button onClick={() => onReset(cfg.id)}
                    className="text-[9px] px-2 py-1 rounded border self-start transition-colors"
                    style={{ borderColor: "rgba(239,68,68,0.3)", color: "#ef4444" }}>
                    Zerar carteira
                  </button>
                </div>
              )}
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
                  Score ≥{cfg.score_compra} · SL {(cfg.sl_pct * 100).toFixed(1)}% · TP {(cfg.tp_pct * 100).toFixed(1)}%
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
  const [view, setView]             = useState<"ranking" | "carteiras" | "comparativo" | "banco" | "ia" | "scalp">("ranking");
  const [autoTrade, setAutoTrade]   = useState(true);
  const [activePerfilId, setActivePerfilId] = useState("f_mod_normal");
  const [scan, setScan]             = useState<FuturesScanData | null>(null);
  const [btcDom, setBtcDom]         = useState<number | undefined>();
  const [loadingScan, setLoadingScan] = useState(false);

  const { wallets, abrirFutures, fecharFutures, atualizarTodos, resetPerfil, resetAll } = useFuturesWallet();
  const { banco, salvar: salvarBanco, removerData }                                      = useFuturesBanco();

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

        // Novas entradas
        for (const it of itens) {
          let dir: "LONG" | "SHORT";
          if      (it.direction === "LONG")  dir = "LONG";
          else if (it.direction === "SHORT") dir = "SHORT";
          else {
            const bp = it.bull_pct ?? 50;
            if      (bp > 55) dir = "LONG";
            else if (bp < 45) dir = "SHORT";
            else continue;
          }
          const scoreOk = it.score_final >= cfg.score_compra && it.score_final <= (cfg.score_max_compra ?? 100);
          const dirOk   = cfg.direction_allowed === "BOTH" || cfg.direction_allowed === dir;
          if (!scoreOk || !dirOk) continue;
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
        <TabBtn v="ia"          label="IA Análise"  icon="🧠" />
        <TabBtn v="comparativo" label="Comparativo" icon="⚖️" />
        <TabBtn v="banco"       label="Banco"       icon="🗄️" />
      </div>

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
