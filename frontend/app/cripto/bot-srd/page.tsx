"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Play, Square, RefreshCw, Trash2, ChevronDown, ChevronUp,
  TrendingUp, TrendingDown, Activity, Zap, BarChart2, PauseCircle,
} from "lucide-react";

const API            = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";
const SRD_KEY         = "allwin_srd_wallets_v1";
const TRADE_HIST_KEY  = "allwin_trade_hist";
const LEARNED_KEY     = "allwin_srd_learned_v1";
const ACTIVE_BOTS_KEY = "allwin_srd_active_bots_v1";
const LEARN_CYCLE     = 100;
const PAUSE_MS        = 60_000; // 1 minuto após 5 reds consecutivos
const RED_STREAK_MAX  = 5;
const MAX_TRADES_PER_BOT = 500; // limita localStorage para evitar quota overflow

const TIRO_CURTO_IDS = new Set([
  "srd_forro","srd_cangaceiro","srd_sanfoneiro","srd_beato","srd_pajeu",
  "srd_angico","srd_jurema","srd_caatinga","srd_galo","srd_cipo",
]);

const FUTURES_COINS_DEFAULT = [
  "BTCUSDT","ETHUSDT","SOLUSDT","BNBUSDT","XRPUSDT","ADAUSDT","AVAXUSDT",
  "LINKUSDT","DOGEUSDT","LTCUSDT","DOTUSDT","MATICUSDT","UNIUSDT","ATOMUSDT",
  "AAVEUSDT","TRXUSDT","NEARUSDT","FTMUSDT","SANDUSDT","MANAUSDT","AXSUSDT",
  "LDOUSDT","APTUSDT","ARBUSDT","OPUSDT","INJUSDT","SUIUSDT","TIAUSDT",
  "SEIUSDT","STXUSDT","WLDUSDT","FETUSDT","PEPEUSDT","FLOKIUSDT","WIFUSDT",
  "MEMEUSDT","JUPUSDT","PYTHUSDT","JTOOUSDT","BONKUSDT","RENDERUSDT","GRTUSDT",
  "FILUSDT","CRVUSDT","MKRUSDT","COMPUSDT","YFIUSDT","SNXUSDT","STMXUSDT",
];

// ── Types ─────────────────────────────────────────────────────────────────────

interface SRDBotDef {
  id: string; name: string; perfil: string; emoji: string; color: string;
  directions: ("LONG"|"SHORT")[];
  direcao_min: number;
  volume_min: number;
  suporte_min: number;
  resistencia_min: number;
  sl_pct: number; tp_pct: number; leverage: number;
  capital_per_trade: number;
  motivo_long: string; motivo_short: string;
}

interface SRDTrade {
  id: string; botId: string; botName: string;
  simbolo: string; direction: "LONG"|"SHORT";
  tipo: "V";
  preco_entrada: number; preco_saida: number;
  sl: number; tp: number; sl_pct: number; tp_pct: number; leverage: number;
  amount_brl: number; pnl_brl: number; pct: number;
  suporte_score: number; resistencia_score: number;
  volume_score: number; direcao_score: number;
  motivo_entrada: string;
  status: "tp"|"sl"|"expirado";
  abertura: string; time: number;
}

interface SRDPosition {
  id: string; botId: string; botName: string;
  simbolo: string; direction: "LONG"|"SHORT";
  preco_entrada: number; sl: number; tp: number;
  sl_pct: number; tp_pct: number; leverage: number;
  amount_brl: number;
  suporte_score: number; resistencia_score: number;
  volume_score: number; direcao_score: number;
  motivo_entrada: string; abertura: string;
}

interface StreakCalibration {
  scalp_boost: number;       // pontos adicionados ao threshold scalp (ex: +10 → requer 62 em vez de 52)
  cycles_remaining: number;  // quantos ciclos de scan ainda fica ativo
  triggered_at: string;      // ISO timestamp
  reason: string;            // log descritivo
}

interface SRDWallet {
  botId: string; saldo: number;
  positions: Record<string, SRDPosition>;
  trades: SRDTrade[];
  consecutiveReds: number;   // reds seguidos (SL hits)
  consecutiveWins: number;   // wins seguidos (para desativar recalibre cedo)
  pausedUntil: number;       // ms timestamp — 0 = livre
  streakCalibration?: StreakCalibration; // recalibre pós-streak ativo
}

interface MarketSnapshot {
  simbolo: string; preco: number;
  suporte_score: number;
  resistencia_score: number;
  volume_score: number;
  direcao_long: number;
  direcao_short: number;
  // Score scalp primário (0-100) — mesmo sinal do Sinais IA / Scalp
  // >52 = tendência de compra, <48 = tendência de venda, 48-52 = NEUTRO
  score_compra: number;
}

// ── 30 Bots SRD — Calibrados no padrão Scalp ─────────────────────────────────
// Regra de alavancagem:
//   - Alavancado 5x  (bots principais) → sl_pct = tp_pct = 0.6%  → conta ±3%
//   - Alavancado 10x (bots principais) → sl_pct = tp_pct = 0.5%  → conta ±5%
//   - Sem alavancagem (1x-3x)          → TP assimétrico (base scalp: SL 0.4%, TP 1.5-2%)
//   - Tiro Curto (bots rápidos)        → % menores para saída rápida (0.3-0.4%)

const SRD_BOTS: SRDBotDef[] = [

  // ── 20 BOTS PRINCIPAIS ───────────────────────────────────────────────────
  {
    id:"srd_severino", name:"SEVERINO", perfil:"Ultra Conservador · 1x", emoji:"👴", color:"#6b7280",
    directions:["LONG","SHORT"], direcao_min:82, volume_min:1.8, suporte_min:78, resistencia_min:78,
    sl_pct:0.4, tp_pct:2.0, leverage:1, capital_per_trade:500,
    motivo_long:"Entrada sem alavancagem — 4 pilares fortíssimos · R:R 5:1",
    motivo_short:"Short sem alavancagem — 4 pilares fortíssimos · R:R 5:1",
  },
  {
    id:"srd_lampiao", name:"LAMPIÃO", perfil:"Conservador · 2x", emoji:"🔦", color:"#f97316",
    directions:["LONG","SHORT"], direcao_min:72, volume_min:1.4, suporte_min:70, resistencia_min:70,
    sl_pct:0.4, tp_pct:1.5, leverage:2, capital_per_trade:500,
    motivo_long:"Baixa alavancagem — suporte confirmado + direção forte · R:R 3.75:1",
    motivo_short:"Baixa alavancagem — resistência confirmada + direção forte · R:R 3.75:1",
  },
  {
    id:"srd_gonzagao", name:"GONZAGÃO", perfil:"Tendência · 5x · R:R 1:1", emoji:"🎸", color:"#a855f7",
    directions:["LONG","SHORT"], direcao_min:75, volume_min:1.0, suporte_min:35, resistencia_min:35,
    sl_pct:0.6, tp_pct:0.6, leverage:5, capital_per_trade:500,
    motivo_long:"Tendência dominante LONG — 5x · SL/TP 0.6% · conta ±3%",
    motivo_short:"Tendência dominante SHORT — 5x · SL/TP 0.6% · conta ±3%",
  },
  {
    id:"srd_ariano", name:"ARIANO", perfil:"Reversão S/R · 5x · R:R 1:1", emoji:"🎭", color:"#ec4899",
    directions:["LONG","SHORT"], direcao_min:42, volume_min:0.8, suporte_min:85, resistencia_min:85,
    sl_pct:0.6, tp_pct:0.6, leverage:5, capital_per_trade:500,
    motivo_long:"Reversão no suporte extremo — 5x · SL/TP 0.6% · conta ±3%",
    motivo_short:"Reversão na resistência extrema — 5x · SL/TP 0.6% · conta ±3%",
  },
  {
    id:"srd_patativa", name:"PATATIVA", perfil:"Volume Alto · 5x · R:R 1:1", emoji:"🦅", color:"#0ea5e9",
    directions:["LONG","SHORT"], direcao_min:52, volume_min:2.0, suporte_min:40, resistencia_min:40,
    sl_pct:0.6, tp_pct:0.6, leverage:5, capital_per_trade:500,
    motivo_long:"Volume 2x+ · pressão compradora — 5x · SL/TP 0.6% · conta ±3%",
    motivo_short:"Volume 2x+ · pressão vendedora — 5x · SL/TP 0.6% · conta ±3%",
  },
  {
    id:"srd_corone", name:"CORONÉ", perfil:"Short Especialista · 5x · R:R 1:1", emoji:"👑", color:"#ef4444",
    directions:["SHORT"], direcao_min:62, volume_min:1.2, suporte_min:35, resistencia_min:80,
    sl_pct:0.6, tp_pct:0.6, leverage:5, capital_per_trade:500,
    motivo_long:"—",
    motivo_short:"Resistência forte — só SHORT 5x · SL/TP 0.6% · conta ±3%",
  },
  {
    id:"srd_cabra", name:"CABRA DA PESTE", perfil:"Agressivo · 10x · R:R 1:1", emoji:"🐐", color:"#dc2626",
    directions:["LONG","SHORT"], direcao_min:65, volume_min:1.3, suporte_min:55, resistencia_min:55,
    sl_pct:0.5, tp_pct:0.5, leverage:10, capital_per_trade:300,
    motivo_long:"Entrada agressiva LONG — 10x · SL/TP 0.5% · conta ±5%",
    motivo_short:"Entrada agressiva SHORT — 10x · SL/TP 0.5% · conta ±5%",
  },
  {
    id:"srd_vitalino", name:"MESTRE VITALINO", perfil:"Scalp Rápido · 10x · R:R 1:1", emoji:"⚡", color:"#fbbf24",
    directions:["LONG","SHORT"], direcao_min:68, volume_min:1.3, suporte_min:60, resistencia_min:60,
    sl_pct:0.5, tp_pct:0.5, leverage:10, capital_per_trade:400,
    motivo_long:"Scalp veloz LONG — 10x · SL/TP 0.5% · conta ±5%",
    motivo_short:"Scalp veloz SHORT — 10x · SL/TP 0.5% · conta ±5%",
  },
  {
    id:"srd_ze", name:"ZÉ DO SERTÃO", perfil:"Equilibrado · 5x · R:R 1:1", emoji:"🤠", color:"#10b981",
    directions:["LONG","SHORT"], direcao_min:65, volume_min:1.2, suporte_min:55, resistencia_min:55,
    sl_pct:0.6, tp_pct:0.6, leverage:5, capital_per_trade:500,
    motivo_long:"4 pilares equilibrados LONG — 5x · SL/TP 0.6% · conta ±3%",
    motivo_short:"4 pilares equilibrados SHORT — 5x · SL/TP 0.6% · conta ±3%",
  },
  {
    id:"srd_chico", name:"CHICO DE ASSIS", perfil:"Confirmação Dupla · 5x · R:R 1:1", emoji:"✌️", color:"#84cc16",
    directions:["LONG","SHORT"], direcao_min:76, volume_min:1.6, suporte_min:65, resistencia_min:65,
    sl_pct:0.6, tp_pct:0.6, leverage:5, capital_per_trade:500,
    motivo_long:"2 pilares fortíssimos LONG — 5x · SL/TP 0.6% · conta ±3%",
    motivo_short:"2 pilares fortíssimos SHORT — 5x · SL/TP 0.6% · conta ±3%",
  },
  {
    id:"srd_bodinho", name:"BODINHO", perfil:"Scalp · 10x · R:R 1:1", emoji:"🔬", color:"#06b6d4",
    directions:["LONG","SHORT"], direcao_min:55, volume_min:0.9, suporte_min:52, resistencia_min:52,
    sl_pct:0.5, tp_pct:0.5, leverage:10, capital_per_trade:300,
    motivo_long:"Scalp LONG — 10x · SL/TP 0.5% · conta ±5%",
    motivo_short:"Scalp SHORT — 10x · SL/TP 0.5% · conta ±5%",
  },
  {
    id:"srd_jatoba", name:"JATOBÁ", perfil:"Rompimento · 10x · R:R 1:1", emoji:"💥", color:"#f59e0b",
    directions:["LONG","SHORT"], direcao_min:78, volume_min:1.8, suporte_min:25, resistencia_min:25,
    sl_pct:0.5, tp_pct:0.5, leverage:10, capital_per_trade:400,
    motivo_long:"Rompimento com volume e direção forte LONG — 10x · SL/TP 0.5% · conta ±5%",
    motivo_short:"Rompimento de baixa com volume — 10x · SL/TP 0.5% · conta ±5%",
  },
  {
    id:"srd_xiquexique", name:"XIQUE-XIQUE", perfil:"Suporte Extremo · Só Long · 5x", emoji:"🌵", color:"#22d3ee",
    directions:["LONG"], direcao_min:45, volume_min:0.8, suporte_min:88, resistencia_min:25,
    sl_pct:0.6, tp_pct:0.6, leverage:5, capital_per_trade:500,
    motivo_long:"Suporte extremamente preciso — só LONG 5x · SL/TP 0.6% · conta ±3%",
    motivo_short:"—",
  },
  {
    id:"srd_mandacaru", name:"MANDACARU", perfil:"Resistência Extrema · Só Short · 5x", emoji:"🌿", color:"#a78bfa",
    directions:["SHORT"], direcao_min:45, volume_min:0.8, suporte_min:25, resistencia_min:88,
    sl_pct:0.6, tp_pct:0.6, leverage:5, capital_per_trade:500,
    motivo_long:"—",
    motivo_short:"Resistência extremamente precisa — só SHORT 5x · SL/TP 0.6% · conta ±3%",
  },
  {
    id:"srd_lua", name:"LUA DO SERTÃO", perfil:"Tendência Forte · 3x", emoji:"🌙", color:"#818cf8",
    directions:["LONG","SHORT"], direcao_min:80, volume_min:0.8, suporte_min:25, resistencia_min:25,
    sl_pct:0.4, tp_pct:1.5, leverage:3, capital_per_trade:500,
    motivo_long:"Tendência clara — 3x · TP 1.5% / SL 0.4% · conta TP+4.5% / SL-1.2%",
    motivo_short:"Tendência de queda clara — 3x · TP 1.5% / SL 0.4%",
  },
  {
    id:"srd_cacto", name:"CACTO", perfil:"Volume 2.5x · 5x · R:R 1:1", emoji:"🎋", color:"#4ade80",
    directions:["LONG","SHORT"], direcao_min:55, volume_min:2.5, suporte_min:45, resistencia_min:45,
    sl_pct:0.6, tp_pct:0.6, leverage:5, capital_per_trade:400,
    motivo_long:"Volume 2.5x acima da média — pressão compradora 5x · SL/TP 0.6% · conta ±3%",
    motivo_short:"Volume 2.5x acima da média — pressão vendedora 5x · SL/TP 0.6% · conta ±3%",
  },
  {
    id:"srd_baiao", name:"BAIÃO", perfil:"Movimentos Rápidos · 10x · R:R 1:1", emoji:"🎵", color:"#fb923c",
    directions:["LONG","SHORT"], direcao_min:65, volume_min:1.3, suporte_min:48, resistencia_min:48,
    sl_pct:0.5, tp_pct:0.5, leverage:10, capital_per_trade:400,
    motivo_long:"Movimento rápido alta — 10x · SL/TP 0.5% · conta ±5%",
    motivo_short:"Movimento rápido queda — 10x · SL/TP 0.5% · conta ±5%",
  },
  {
    id:"srd_asabranca", name:"ASA BRANCA", perfil:"Premium · 5x · R:R 1:1", emoji:"🕊️", color:"#e2e8f0",
    directions:["LONG","SHORT"], direcao_min:78, volume_min:1.8, suporte_min:75, resistencia_min:75,
    sl_pct:0.6, tp_pct:0.6, leverage:5, capital_per_trade:600,
    motivo_long:"Entrada premium — 4 pilares altos LONG · 5x · SL/TP 0.6% · conta ±3%",
    motivo_short:"Entrada premium — 4 pilares altos SHORT · 5x · SL/TP 0.6% · conta ±3%",
  },
  {
    id:"srd_cajueiro", name:"CAJUEIRO", perfil:"Moderado · 5x · R:R 1:1", emoji:"🌳", color:"#d97706",
    directions:["LONG","SHORT"], direcao_min:60, volume_min:1.0, suporte_min:50, resistencia_min:50,
    sl_pct:0.6, tp_pct:0.6, leverage:5, capital_per_trade:500,
    motivo_long:"Convergência moderada LONG — 5x · SL/TP 0.6% · conta ±3%",
    motivo_short:"Convergência moderada SHORT — 5x · SL/TP 0.6% · conta ±3%",
  },
  {
    id:"srd_sertanejo", name:"SERTANEJO", perfil:"Híbrido Adaptativo · 5x · R:R 1:1", emoji:"🎻", color:"#c084fc",
    directions:["LONG","SHORT"], direcao_min:62, volume_min:1.4, suporte_min:50, resistencia_min:50,
    sl_pct:0.6, tp_pct:0.6, leverage:5, capital_per_trade:500,
    motivo_long:"Híbrido: volume alto compensa direção — 5x · SL/TP 0.6% · conta ±3%",
    motivo_short:"Híbrido: direção alta compensa volume — 5x · SL/TP 0.6% · conta ±3%",
  },

  // ── 10 BOTS TIRO CURTO — Scalp Ultra-Rápido (% menores para saída rápida) ──
  {
    id:"srd_forro", name:"FORRÓ", perfil:"Tiro Curto · 10x · R:R 1:1", emoji:"🎺", color:"#f43f5e",
    directions:["LONG","SHORT"], direcao_min:55, volume_min:1.2, suporte_min:48, resistencia_min:48,
    sl_pct:0.3, tp_pct:0.3, leverage:10, capital_per_trade:300,
    motivo_long:"Tiro curto LONG — 10x · SL/TP 0.3% · conta ±3%",
    motivo_short:"Tiro curto SHORT — 10x · SL/TP 0.3% · conta ±3%",
  },
  {
    id:"srd_cangaceiro", name:"CANGACEIRO", perfil:"Tiro Curto Agressivo · 10x · R:R 1:1", emoji:"🗡️", color:"#dc2626",
    directions:["LONG","SHORT"], direcao_min:68, volume_min:1.5, suporte_min:58, resistencia_min:58,
    sl_pct:0.3, tp_pct:0.3, leverage:10, capital_per_trade:300,
    motivo_long:"Tiro curto agressivo LONG — 10x · suporte + direção forte · conta ±3%",
    motivo_short:"Tiro curto agressivo SHORT — 10x · resistência + direção forte · conta ±3%",
  },
  {
    id:"srd_sanfoneiro", name:"SANFONEIRO", perfil:"Tiro Curto Reverso S/R · 5x · R:R 1:1", emoji:"🪗", color:"#fb923c",
    directions:["LONG","SHORT"], direcao_min:40, volume_min:1.0, suporte_min:78, resistencia_min:78,
    sl_pct:0.4, tp_pct:0.4, leverage:5, capital_per_trade:300,
    motivo_long:"Tiro curto reverso LONG — suporte colado · 5x · conta ±2%",
    motivo_short:"Tiro curto reverso SHORT — resistência colada · 5x · conta ±2%",
  },
  {
    id:"srd_beato", name:"BEATO CIÇO", perfil:"Tiro Curto Volume · 10x · R:R 1:1", emoji:"✝️", color:"#a78bfa",
    directions:["LONG","SHORT"], direcao_min:48, volume_min:2.0, suporte_min:35, resistencia_min:35,
    sl_pct:0.3, tp_pct:0.3, leverage:10, capital_per_trade:300,
    motivo_long:"Tiro no impulso de volume 2x+ LONG — 10x · conta ±3%",
    motivo_short:"Tiro no impulso de volume 2x+ SHORT — 10x · conta ±3%",
  },
  {
    id:"srd_pajeu", name:"PAJEÚ", perfil:"Tiro Curto Tendência · 10x · R:R 1:1", emoji:"💨", color:"#38bdf8",
    directions:["LONG","SHORT"], direcao_min:75, volume_min:0.9, suporte_min:25, resistencia_min:25,
    sl_pct:0.3, tp_pct:0.3, leverage:10, capital_per_trade:300,
    motivo_long:"Tiro na tendência LONG 75+ — 10x · puro momentum · conta ±3%",
    motivo_short:"Tiro na tendência SHORT 75+ — 10x · puro momentum · conta ±3%",
  },
  {
    id:"srd_angico", name:"ANGICO", perfil:"Tiro Ultra-Rápido · 10x · R:R 1:1", emoji:"🏹", color:"#4ade80",
    directions:["LONG","SHORT"], direcao_min:58, volume_min:1.0, suporte_min:52, resistencia_min:52,
    sl_pct:0.25, tp_pct:0.25, leverage:10, capital_per_trade:200,
    motivo_long:"Ultra micro-tiro LONG — 10x · SL/TP 0.25% · conta ±2.5%",
    motivo_short:"Ultra micro-tiro SHORT — 10x · SL/TP 0.25% · conta ±2.5%",
  },
  {
    id:"srd_jurema", name:"JUREMA", perfil:"Tiro Curto Só Long · 5x · R:R 1:1", emoji:"🌸", color:"#f0abfc",
    directions:["LONG"], direcao_min:62, volume_min:1.2, suporte_min:65, resistencia_min:28,
    sl_pct:0.4, tp_pct:0.4, leverage:5, capital_per_trade:300,
    motivo_long:"Tiro LONG — suporte forte + direção favorável · 5x · conta ±2%",
    motivo_short:"—",
  },
  {
    id:"srd_caatinga", name:"CAATINGA", perfil:"Tiro Curto Só Short · 5x · R:R 1:1", emoji:"🏜️", color:"#f87171",
    directions:["SHORT"], direcao_min:62, volume_min:1.2, suporte_min:28, resistencia_min:65,
    sl_pct:0.4, tp_pct:0.4, leverage:5, capital_per_trade:300,
    motivo_long:"—",
    motivo_short:"Tiro SHORT — resistência forte + direção favorável · 5x · conta ±2%",
  },
  {
    id:"srd_galo", name:"GALO DO SERTÃO", perfil:"Tiro Amplo · 5x · R:R 1:1", emoji:"🐓", color:"#fde68a",
    directions:["LONG","SHORT"], direcao_min:52, volume_min:0.9, suporte_min:42, resistencia_min:42,
    sl_pct:0.4, tp_pct:0.4, leverage:5, capital_per_trade:350,
    motivo_long:"Tiro amplo LONG — critérios moderados · 5x · conta ±2%",
    motivo_short:"Tiro amplo SHORT — critérios moderados · 5x · conta ±2%",
  },
  {
    id:"srd_cipo", name:"CIPÓ", perfil:"Swing Relâmpago · 10x · R:R 1:1", emoji:"⚡", color:"#fbbf24",
    directions:["LONG","SHORT"], direcao_min:70, volume_min:1.6, suporte_min:60, resistencia_min:60,
    sl_pct:0.3, tp_pct:0.3, leverage:10, capital_per_trade:400,
    motivo_long:"Swing relâmpago LONG — 3 pilares altos · 10x · conta ±3%",
    motivo_short:"Swing relâmpago SHORT — 3 pilares altos · 10x · conta ±3%",
  },
];

// ── Auto Aprendizado ──────────────────────────────────────────────────────────

interface SRDLearnedParams {
  botId: string;
  direcao_min: number; volume_min: number;
  suporte_min: number; resistencia_min: number;
  learnCycle: number; lastLearnOps: number;
  lastLearnWR: number; lastLearnAt: string; motivo: string;
}

function loadLearnedParams(): Record<string, SRDLearnedParams> {
  try { return JSON.parse(localStorage.getItem(LEARNED_KEY) ?? "{}"); } catch { return {}; }
}
function saveLearnedParams(p: Record<string, SRDLearnedParams>) {
  try { localStorage.setItem(LEARNED_KEY, JSON.stringify(p)); } catch {}
}

function learnFromHistory(bot: SRDBotDef, trades: SRDTrade[], current: SRDLearnedParams | null): SRDLearnedParams {
  const base = current ?? {
    botId: bot.id,
    direcao_min: bot.direcao_min, volume_min: bot.volume_min,
    suporte_min: bot.suporte_min, resistencia_min: bot.resistencia_min,
    learnCycle: 0, lastLearnOps: 0, lastLearnWR: 0, lastLearnAt: "", motivo: "Inicial",
  };
  if (trades.length === 0) return base;

  const wins   = trades.filter(t => t.status === "tp");
  const losses = trades.filter(t => t.status === "sl");
  const wr     = wins.length / trades.length;
  const isTiro = TIRO_CURTO_IDS.has(bot.id);
  // Com R:R 1:1 (leverage) a meta de WR precisa ser > 52% para ser lucrativo
  const META_ESTAVEL = isTiro ? 0.52 : 0.52;
  const META_BOM     = isTiro ? 0.55 : 0.60;

  const avg = (arr: SRDTrade[], fn: (t: SRDTrade) => number) =>
    arr.length ? arr.reduce((s,t) => s + fn(t), 0) / arr.length : 0;

  const winDir  = avg(wins,  t => t.direcao_score);
  const lossDir = avg(losses, t => t.direcao_score);
  const winVol  = avg(wins,  t => t.volume_score);
  const lossVol = avg(losses, t => t.volume_score);
  const winSup  = avg(wins,  t => t.suporte_score);
  const lossSup = avg(losses, t => t.suporte_score);
  const winRes  = avg(wins,  t => t.resistencia_score);
  const lossRes = avg(losses, t => t.resistencia_score);

  let { direcao_min, volume_min, suporte_min, resistencia_min } = base;
  let motivo = "";

  if (wr < 0.45) {
    if (winDir > lossDir + 8)   { direcao_min    = Math.min(95, direcao_min + 5);     motivo += "↑Dir "; }
    if (winVol > lossVol + 0.4) { volume_min      = Math.min(6,  volume_min + 0.3);    motivo += "↑Vol "; }
    if (winSup > lossSup + 8)   { suporte_min     = Math.min(95, suporte_min + 5);     motivo += "↑Sup "; }
    if (winRes > lossRes + 8)   { resistencia_min = Math.min(95, resistencia_min + 5); motivo += "↑Res "; }
    if (!motivo) motivo = "WR<45%: sem padrão claro";
    else motivo = `WR ${(wr*100).toFixed(0)}%: ${motivo.trim()}`;
  } else if (wr >= META_BOM) {
    direcao_min    = Math.max(bot.direcao_min * 0.85, direcao_min - 3);
    volume_min     = Math.max(bot.volume_min  * 0.85, volume_min  - 0.2);
    suporte_min    = Math.max(bot.suporte_min * 0.85, suporte_min - 3);
    resistencia_min= Math.max(bot.resistencia_min * 0.85, resistencia_min - 3);
    motivo = `WR ${(wr*100).toFixed(0)}%: filtros afrouxados`;
  } else if (wr >= META_ESTAVEL) {
    motivo = `WR ${(wr*100).toFixed(0)}%: estável`;
  } else {
    direcao_min = Math.min(95, direcao_min + 2);
    volume_min  = Math.min(6,  volume_min  + 0.15);
    motivo = `WR ${(wr*100).toFixed(0)}%: ↑Dir ↑Vol leve`;
  }

  return {
    ...base,
    direcao_min: Math.round(direcao_min),
    volume_min:  Math.round(volume_min * 10) / 10,
    suporte_min: Math.round(suporte_min),
    resistencia_min: Math.round(resistencia_min),
    learnCycle: base.learnCycle + 1,
    lastLearnOps: trades.length,
    lastLearnWR:  Math.round(wr * 1000) / 10,
    lastLearnAt: new Date().toISOString(),
    motivo,
  };
}

function effectiveParams(bot: SRDBotDef, learned: SRDLearnedParams | null): SRDBotDef {
  if (!learned) return bot;
  return { ...bot, direcao_min: learned.direcao_min, volume_min: learned.volume_min,
    suporte_min: learned.suporte_min, resistencia_min: learned.resistencia_min };
}

// ── Regime de Mercado ─────────────────────────────────────────────────────────
// Detecta quando o mercado está mudando de direção e ajusta os filtros globalmente.
// Usa: score BTC (líder de mercado) + breadth (% moedas bullish) + WR recente global.

interface MarketRegime {
  btcScore: number;              // score scalp do BTC (0-100)
  trend: "BULL"|"BEAR"|"NEUTRO"|"CRISE";
  breadthBull: number;           // % moedas com score > 52 (0-1)
  globalWR: number;              // WR das últimas 20 ops globais (0-1)
  regimeBoost: number;           // boost adicional no threshold scalp por regime
  blockLong: boolean;            // bloqueia todas entradas LONG (ex: crise/crash)
  blockShort: boolean;           // bloqueia todas entradas SHORT (ex: forte alta)
  descricao: string;             // texto explicativo para o log/UI
}

function computeRegime(
  btcScore: number,
  breadthBull: number,
  globalWR: number,
): MarketRegime {
  // Filosofia: regime é proteção contra MOVIMENTOS EXTREMOS, não filtro constante.
  // O streak calibration (+8~12 após 5 reds) já protege o dia a dia.
  // Regime só age em situações excepcionais para não cortar as entradas normais.

  let trend: MarketRegime["trend"] = "NEUTRO";
  let regimeBoost = 0;
  let blockLong = false, blockShort = false;
  let descricao = "";

  // ── Crise/crash real: BTC < 25 + quase tudo caindo ──────────────────────
  // (ex: CPI horrível, hack, evento sistêmico — moves de -10%+)
  if (btcScore < 25 && breadthBull < 0.15) {
    trend = "CRISE";
    regimeBoost = 8; // boost moderado — não bloqueia, só filtra mais
    descricao = `🚨 CRISE: BTC${btcScore.toFixed(0)} · ${(breadthBull*100).toFixed(0)}% bullish → +${regimeBoost}pts`;
  }
  // ── Bear severo: BTC bem bearish + mercado amplo caindo ─────────────────
  else if (btcScore < 32 && breadthBull < 0.25) {
    trend = "BEAR";
    regimeBoost = 5;
    descricao = `🐻 BEAR: BTC${btcScore.toFixed(0)} · ${(breadthBull*100).toFixed(0)}% bullish → +${regimeBoost}pts`;
  }
  // ── BULL forte: filtros normais, sem interferência ───────────────────────
  else if (btcScore > 65) {
    trend = "BULL";
    regimeBoost = 0;
    descricao = `🐂 BULL: BTC${btcScore.toFixed(0)} — sem alteração`;
  }
  // ── Tudo mais (NEUTRO, BEAR leve, BULL leve): sem boost ─────────────────
  // O bot opera normalmente. Proteção vem do scalp filter e do streak calibration.
  else {
    trend = "NEUTRO";
    regimeBoost = 0;
    descricao = `NEUTRO: BTC${btcScore.toFixed(0)} — operação normal`;
  }

  // ── WR global muito baixo nas últimas 20 ops (< 35%): +3pts leve ────────
  // Só aciona se o resultado geral estiver ruim, não em normalidade
  if (globalWR > 0 && globalWR < 0.35 && regimeBoost < 8) {
    regimeBoost += 3;
    descricao += ` · WR${(globalWR*100).toFixed(0)}%→+3`;
  }

  // Boost máximo do regime: 8pts (o streak já adiciona mais se necessário)
  regimeBoost = Math.min(regimeBoost, 8);

  return { btcScore, trend, breadthBull, globalWR, regimeBoost, blockLong, blockShort, descricao };
}

// ── Recalibre pós-streak ──────────────────────────────────────────────────────
// Analisa os últimos trades perdedores e calcula o boost necessário no threshold scalp.
// Quanto mais fracos foram os sinais das perdas, mais agressivo é o recalibre.

function calibrateAfterStreak(wallet: SRDWallet): StreakCalibration {
  const losses = wallet.trades.filter(t => t.status === "sl").slice(0, RED_STREAK_MAX);

  // Analisa força média dos sinais nas perdas recentes
  const avgDirScore = losses.length
    ? losses.reduce((s, t) => s + (t.direcao_score ?? 0), 0) / losses.length
    : 50;
  const avgVolScore = losses.length
    ? losses.reduce((s, t) => s + (t.volume_score ?? 1), 0) / losses.length
    : 1;

  // Sinais fracos nas perdas → recalibre mais agressivo
  let boost = 8; // padrão: +8 pts no threshold scalp
  if (avgDirScore < 55) boost = 12; // direção muito fraca nas perdas → exige muito mais
  else if (avgDirScore < 65) boost = 10;

  // Volume baixo nas perdas → também reforça o boost
  if (avgVolScore < 1.2) boost = Math.min(15, boost + 3);

  return {
    scalp_boost: boost,
    cycles_remaining: 10, // ativo por 10 ciclos de scan (~10 min com scan a cada 60s)
    triggered_at: new Date().toISOString(),
    reason: `${RED_STREAK_MAX} reds · dir${avgDirScore.toFixed(0)} vol${avgVolScore.toFixed(1)} → +${boost} scalp · 10 ciclos`,
  };
}

// ── Lateral market detector ───────────────────────────────────────────────────

function isLateralMarket(srd: MarketSnapshot): boolean {
  const maxDir = Math.max(srd.direcao_long, srd.direcao_short);
  const spread = Math.abs(srd.direcao_long - srd.direcao_short);
  // Lateral = nenhuma direção dominante OU spread muito pequeno
  return maxDir < 55 || spread < 20;
}

// ── Scoring ───────────────────────────────────────────────────────────────────

function scoreSuporte(suportes: {preco:number;distancia_pct:number}[]): number {
  const nearest = suportes[0];
  if (!nearest) return 0;
  return Math.max(0, Math.min(100, 100 - nearest.distancia_pct * 20));
}
function scoreResistencia(resistencias: {preco:number;distancia_pct:number}[]): number {
  const nearest = resistencias[0];
  if (!nearest) return 0;
  return Math.max(0, Math.min(100, 100 - nearest.distancia_pct * 20));
}
function scoreVolume(volume_relativo: number | null): number { return volume_relativo ?? 0; }
function scoreDirecao(data: {
  tendencia: { curto_prazo: string };
  tecnico: { macd: { sinal: string } | null; obv: { sinal: string }; ema_9: { sinal: string } };
}, dir: "LONG"|"SHORT"): number {
  const buy = dir === "LONG";
  let score = 0;
  const t = data.tendencia.curto_prazo;
  if (buy && t === "alta") score += 30; if (!buy && t === "baixa") score += 30;
  if (data.tecnico.macd) {
    const m = data.tecnico.macd.sinal;
    if (buy && m === "compra") score += 25; if (!buy && m === "venda") score += 25;
  }
  const obv = data.tecnico.obv.sinal;
  if (buy && obv === "compra") score += 25; if (!buy && obv === "venda") score += 25;
  const e9 = data.tecnico.ema_9.sinal;
  if (buy && e9 === "compra") score += 20; if (!buy && e9 === "venda") score += 20;
  return score;
}

function shouldEnterHybrid(bot: SRDBotDef, srd: MarketSnapshot, dir: "LONG"|"SHORT"): boolean {
  const d    = dir === "LONG" ? srd.direcao_long : srd.direcao_short;
  const dOpp = dir === "LONG" ? srd.direcao_short : srd.direcao_long;
  if (dOpp >= 68 && dOpp > d + 18) return false;
  const s = dir === "LONG" ? srd.suporte_score : srd.resistencia_score;
  const volBonus = srd.volume_score >= bot.volume_min * 1.3;
  const dirBonus = d >= bot.direcao_min * 1.2;
  const standard = d >= bot.direcao_min && srd.volume_score >= bot.volume_min && s >= (dir==="LONG"?bot.suporte_min:bot.resistencia_min);
  const hybrid1  = volBonus && d >= bot.direcao_min * 0.8 && s >= (dir==="LONG"?bot.suporte_min:bot.resistencia_min);
  const hybrid2  = dirBonus && srd.volume_score >= bot.volume_min * 0.75 && s >= (dir==="LONG"?bot.suporte_min:bot.resistencia_min);
  return standard || hybrid1 || hybrid2;
}

function shouldEnter(bot: SRDBotDef, srd: MarketSnapshot, dir: "LONG"|"SHORT", scalpBoost=0): boolean {
  if (!bot.directions.includes(dir)) return false;

  // ── Filtro primário: score scalp (mesmo sinal do Sinais IA) ──────────────
  const isReversal = ["srd_ariano","srd_xiquexique","srd_mandacaru","srd_sanfoneiro"].includes(bot.id);
  const sc = srd.score_compra;
  if (isReversal) {
    if (dir === "LONG"  && sc > 60) return false;
    if (dir === "SHORT" && sc < 40) return false;
  } else {
    // Threshold base + boost do recalibre pós-streak
    const longMin  = 52 + scalpBoost;  // ex: recalibre +10 → exige score_compra >= 62
    const shortMax = 48 - scalpBoost;  // ex: recalibre +10 → exige score_compra <= 38
    if (dir === "LONG"  && sc < longMin)  return false;
    if (dir === "SHORT" && sc > shortMax) return false;
  }

  if (bot.id === "srd_sertanejo") return shouldEnterHybrid(bot, srd, dir);
  const d    = dir === "LONG" ? srd.direcao_long : srd.direcao_short;
  const dOpp = dir === "LONG" ? srd.direcao_short : srd.direcao_long;
  const s    = dir === "LONG" ? srd.suporte_score : srd.resistencia_score;
  const oppLimit = isReversal ? 82 : 68;
  if (dOpp >= oppLimit && dOpp > d + 18) return false;
  return d >= bot.direcao_min && srd.volume_score >= bot.volume_min && s >= (dir==="LONG"?bot.suporte_min:bot.resistencia_min);
}

// ── localStorage helpers ──────────────────────────────────────────────────────

function loadWallets(): Record<string, SRDWallet> {
  try {
    const data: Record<string, SRDWallet> = JSON.parse(localStorage.getItem(SRD_KEY) ?? "{}");
    // Garante novos campos em wallets antigas
    for (const k of Object.keys(data)) {
      data[k].consecutiveReds ??= 0;
      data[k].consecutiveWins ??= 0;
      data[k].pausedUntil     ??= 0;
    }
    return data;
  } catch { return {}; }
}
function saveWallets(w: Record<string, SRDWallet>) {
  // Trim trades para evitar quota overflow do localStorage (max 500 por bot)
  const trimmed: Record<string, SRDWallet> = {};
  for (const [k, wallet] of Object.entries(w)) {
    trimmed[k] = { ...wallet, trades: wallet.trades.slice(0, MAX_TRADES_PER_BOT) };
  }
  try {
    localStorage.setItem(SRD_KEY, JSON.stringify(trimmed));
  } catch {
    // Quota excedida — reduz mais agressivamente e tenta novamente
    for (const k of Object.keys(trimmed)) {
      trimmed[k] = { ...trimmed[k], trades: trimmed[k].trades.slice(0, 100) };
    }
    try { localStorage.setItem(SRD_KEY, JSON.stringify(trimmed)); } catch {}
  }
}
function emptyWallet(botId: string): SRDWallet {
  return { botId, saldo: 10000, positions: {}, trades: [], consecutiveReds: 0, consecutiveWins: 0, pausedUntil: 0 };
}
function pushToTradeHist(trade: SRDTrade) {
  try {
    const all = JSON.parse(localStorage.getItem(TRADE_HIST_KEY) ?? "[]");
    all.unshift({
      id: trade.id, simbolo: trade.simbolo, source: "srd_bot",
      subcategory: trade.botName, direction: trade.direction,
      preco_entrada: trade.preco_entrada,
      sl_pct: trade.sl_pct, tp_pct: trade.tp_pct, leverage: trade.leverage,
      pnl_pct: trade.pct, pnl_brl: trade.pnl_brl,
      status: trade.status, registrado_em: trade.abertura, verificado_em: new Date().toISOString(),
    });
    localStorage.setItem(TRADE_HIST_KEY, JSON.stringify(all));
  } catch {}
}

// ── Stats ─────────────────────────────────────────────────────────────────────

function calcWalletStats(w: SRDWallet) {
  const sells = w.trades;
  const wins  = sells.filter(t => t.status === "tp");
  const totalPnl = sells.reduce((a,t)=>a+t.pnl_brl,0);
  const winRate  = sells.length ? wins.length/sells.length*100 : 0;
  const roi      = sells.reduce((a,t)=>a+t.pct,0);
  let running=0, peak=0, maxDD=0;
  for (const t of [...sells].sort((a,b)=>a.time-b.time)) {
    running+=t.pnl_brl; if(running>peak)peak=running;
    const dd=peak>0?(peak-running)/peak*100:0; if(dd>maxDD)maxDD=dd;
  }
  return { ops:sells.length, wins:wins.length, winRate, totalPnl, roi, maxDD };
}

// ── UI Helpers ────────────────────────────────────────────────────────────────

function fPct(v: number) { return `${v>=0?"+":""}${v.toFixed(2)}%`; }
function fBRL(v: number) {
  if(Math.abs(v)>=1000) return `R$ ${(v/1000).toFixed(1)}k`;
  return `R$ ${v.toFixed(2)}`;
}
function fDate(iso: string) {
  try { return new Date(iso).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})+" "+new Date(iso).toLocaleDateString("pt-BR"); }
  catch { return iso; }
}

function IntensityBar({ label, value, max, color }: { label:string; value:number; max:number; color:string }) {
  const pct = Math.min(100, (value/max)*100);
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex justify-between">
        <span className="text-[9px] uppercase font-bold" style={{color:"var(--text-muted)"}}>{label}</span>
        <span className="text-[9px] font-bold tabular-nums" style={{color}}>{value.toFixed(1)}</span>
      </div>
      <div className="h-1.5 rounded-full" style={{background:"var(--bg)"}}>
        <div className="h-1.5 rounded-full transition-all" style={{width:`${pct}%`,background:color}}/>
      </div>
    </div>
  );
}

// ── Bot Card ─────────────────────────────────────────────────────────────────

function BotCard({
  bot, wallet, active, onToggle, onReset, lastSignal, learned,
}: {
  bot: SRDBotDef; wallet: SRDWallet | null; active: boolean;
  onToggle: () => void; onReset: () => void;
  lastSignal?: { simbolo:string; dir:"LONG"|"SHORT"; scores: MarketSnapshot } | null;
  learned?: SRDLearnedParams | null;
}) {
  const [open, setOpen] = useState(false);
  const stats = wallet ? calcWalletStats(wallet) : null;
  const openPositions = wallet ? Object.values(wallet.positions) : [];
  const isTiroCurto   = TIRO_CURTO_IDS.has(bot.id);
  const WR_BOM  = 55;
  const WR_META = 50;
  const isLeveraged = bot.leverage >= 5;
  const is1to1 = bot.sl_pct === bot.tp_pct;

  const now = Date.now();
  const isPaused = (wallet?.pausedUntil ?? 0) > now;
  const pauseSecsLeft = isPaused ? Math.ceil(((wallet?.pausedUntil ?? 0) - now) / 1000) : 0;
  const calibActive = (wallet?.streakCalibration?.cycles_remaining ?? 0) > 0;
  const calibBoost  = wallet?.streakCalibration?.scalp_boost ?? 0;
  const calibCycles = wallet?.streakCalibration?.cycles_remaining ?? 0;

  return (
    <div className="rounded-xl overflow-hidden transition-all"
      style={{ border:`1.5px solid ${isPaused?"#f59e0b66":active?bot.color+"66":"var(--border)"}`, background:"var(--bg-card)" }}>

      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5"
        style={{ borderBottom:"1px solid var(--border)", background: isPaused?"#f59e0b0a":active?`${bot.color}11`:"transparent" }}>
        <span className="text-base">{bot.emoji}</span>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-black leading-none" style={{color:bot.color}}>{bot.name}</p>
          <p className="text-[9px] mt-0.5 truncate" style={{color:"var(--text-muted)"}}>{bot.perfil}</p>
        </div>
        {isPaused && (
          <span className="flex items-center gap-0.5 text-[8px] font-bold px-1.5 py-0.5 rounded-lg"
            style={{background:"#f59e0b22",color:"#f59e0b",border:"1px solid #f59e0b44"}}>
            <PauseCircle size={8}/> {pauseSecsLeft}s
          </span>
        )}
        {calibActive && !isPaused && (
          <span className="flex items-center gap-0.5 text-[8px] font-bold px-1.5 py-0.5 rounded-lg"
            style={{background:"rgba(139,92,246,0.15)",color:"#a78bfa",border:"1px solid rgba(139,92,246,0.3)"}}>
            🔧 +{calibBoost} ({calibCycles})
          </span>
        )}
        <div className="flex gap-0.5">
          {bot.directions.map(d=>(
            <span key={d} className="text-[8px] font-bold px-1 py-0.5 rounded"
              style={{background:d==="LONG"?"#10b98122":"#ef444422",color:d==="LONG"?"#10b981":"#ef4444"}}>
              {d}
            </span>
          ))}
        </div>
        <button onClick={onToggle}
          className="px-2 py-1 rounded-lg text-[10px] font-bold transition-all"
          style={{
            background: active?`${bot.color}22`:"var(--bg)",
            color: active?bot.color:"var(--text-muted)",
            border:`1px solid ${active?bot.color+"55":"var(--border)"}`,
          }}>
          {active?"ON":"OFF"}
        </button>
        <button onClick={()=>setOpen(v=>!v)} className="p-1" style={{color:"var(--text-muted)"}}>
          {open?<ChevronUp size={12}/>:<ChevronDown size={12}/>}
        </button>
      </div>

      {/* Stats rápidos */}
      <div className="grid grid-cols-3 gap-px" style={{background:"var(--border)"}}>
        {[
          { label:"WR",  val:stats?`${stats.winRate.toFixed(0)}%`:"—",
            color:!stats||!stats.ops?"var(--text-muted)":stats.winRate>=WR_BOM?"#10b981":stats.winRate>=WR_META?"#f59e0b":"#ef4444" },
          { label:"Ops",  val:stats?`${stats.ops}`:"0",  color:"var(--text-primary)" },
          { label:"P&L",  val:stats&&stats.ops?fBRL(stats.totalPnl):"—",
            color:!stats||!stats.ops?"var(--text-muted)":stats.totalPnl>=0?"#10b981":"#ef4444" },
          { label:"ROI",  val:stats&&stats.ops?fPct(stats.roi):"—",
            color:!stats||!stats.ops?"var(--text-muted)":stats.roi>=0?"#10b981":"#ef4444" },
          { label:"MaxDD",val:stats&&stats.ops?`${stats.maxDD.toFixed(1)}%`:"—",
            color:!stats||!stats.ops?"var(--text-muted)":stats.maxDD<=10?"#10b981":stats.maxDD<=25?"#f59e0b":"#ef4444" },
          { label:"Pos",  val:`${openPositions.length}`,
            color:openPositions.length>0?bot.color:"var(--text-muted)" },
        ].map(s=>(
          <div key={s.label} className="flex flex-col items-center py-1.5 px-1" style={{background:"var(--bg-card)"}}>
            <span className="text-[8px] uppercase" style={{color:"var(--text-muted)"}}>{s.label}</span>
            <span className="text-xs font-bold tabular-nums" style={{color:s.color}}>{s.val}</span>
          </div>
        ))}
      </div>

      {/* Expanded */}
      {open && (
        <div className="px-3 pb-3 pt-2 space-y-3">
          {learned && learned.learnCycle > 0 && (
            <div className="rounded-lg px-2.5 py-2 text-[9px]"
              style={{background:"rgba(139,92,246,0.1)",border:"1px solid rgba(139,92,246,0.3)"}}>
              <span style={{color:"#a78bfa"}} className="font-bold">🧠 Ciclo #{learned.learnCycle} · WR {learned.lastLearnWR}%</span>
              <div style={{color:"var(--text-muted)"}} className="mt-0.5">{learned.motivo}</div>
            </div>
          )}
          {wallet && wallet.consecutiveReds > 0 && (
            <div className="rounded-lg px-2 py-1.5 text-[9px] flex items-center gap-1.5"
              style={{background:"#ef444411",border:"1px solid #ef444430"}}>
              <span style={{color:"#ef4444"}} className="font-bold">🔴 {wallet.consecutiveReds}/{RED_STREAK_MAX} reds seguidos</span>
            </div>
          )}
          {calibActive && (
            <div className="rounded-lg px-2.5 py-2 text-[9px]"
              style={{background:"rgba(139,92,246,0.1)",border:"1px solid rgba(139,92,246,0.3)"}}>
              <div style={{color:"#a78bfa"}} className="font-bold">
                🔧 Recalibre ativo — +{calibBoost}pts scalp · {calibCycles} ciclos restantes
              </div>
              <div style={{color:"var(--text-muted)"}} className="mt-0.5">
                LONG exige scalp ≥{52+calibBoost} · SHORT exige scalp ≤{48-calibBoost}
              </div>
              {wallet?.streakCalibration?.reason && (
                <div style={{color:"var(--text-muted)"}} className="mt-0.5 truncate">{wallet.streakCalibration.reason}</div>
              )}
              <div style={{color:"var(--text-muted)"}} className="mt-0.5">
                Desativa em: 3 wins seguidos ou {calibCycles} ciclos de scan
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
            <IntensityBar label="Suporte"    value={learned?.suporte_min??bot.suporte_min}    max={100} color="#10b981"/>
            <IntensityBar label="Resistência" value={learned?.resistencia_min??bot.resistencia_min} max={100} color="#ef4444"/>
            <IntensityBar label="Volume"     value={learned?.volume_min??bot.volume_min}     max={6}   color="#3b82f6"/>
            <IntensityBar label="Direção"    value={learned?.direcao_min??bot.direcao_min}   max={100} color="#a855f7"/>
          </div>
          <div className="grid grid-cols-4 gap-1.5 text-[10px]">
            {[
              ["SL",    `${bot.sl_pct}%`,   "#ef4444"],
              ["TP",    `${bot.tp_pct}%`,   "#10b981"],
              ["Lev",   `${bot.leverage}x`, "#f59e0b"],
              ["R:R",   is1to1 ? "1:1" : `${(bot.tp_pct/bot.sl_pct).toFixed(1)}:1`,
                isLeveraged && is1to1 ? "#10b981" : "#3b82f6"],
            ].map(([l,v,c])=>(
              <div key={l} className="rounded-lg p-1.5 text-center" style={{background:"var(--bg)"}}>
                <p className="text-[8px] uppercase" style={{color:"var(--text-muted)"}}>{l}</p>
                <p className="font-bold" style={{color:c as string}}>{v}</p>
              </div>
            ))}
          </div>
          {isLeveraged && (
            <div className="text-[9px] rounded px-2 py-1"
              style={{background:"#3b82f611",border:"1px solid #3b82f630",color:"#3b82f6"}}>
              {is1to1
                ? `⚖️ R:R 1:1 — conta ±${(bot.sl_pct*bot.leverage).toFixed(1)}% por trade · evita mercado lateral`
                : `📊 ${bot.leverage}x — conta TP +${(bot.tp_pct*bot.leverage).toFixed(1)}% / SL -${(bot.sl_pct*bot.leverage).toFixed(1)}%`
              }
            </div>
          )}
          {lastSignal && (
            <div className="rounded-lg p-2 text-[10px]"
              style={{background:`${lastSignal.dir==="LONG"?"#10b981":"#ef4444"}11`,
                border:`1px solid ${lastSignal.dir==="LONG"?"#10b98133":"#ef444433"}`}}>
              <p className="font-bold" style={{color:lastSignal.dir==="LONG"?"#10b981":"#ef4444"}}>
                {lastSignal.dir} {lastSignal.simbolo.replace("USDT","")}
              </p>
              <p style={{color:"var(--text-muted)"}}>
                Sup:{lastSignal.scores.suporte_score.toFixed(0)} Res:{lastSignal.scores.resistencia_score.toFixed(0)} Vol:{lastSignal.scores.volume_score.toFixed(1)}x Dir:{(lastSignal.dir==="LONG"?lastSignal.scores.direcao_long:lastSignal.scores.direcao_short).toFixed(0)}
              </p>
            </div>
          )}
          {openPositions.length>0 && (
            <div className="space-y-1">
              <p className="text-[9px] font-bold uppercase" style={{color:"var(--text-muted)"}}>Posições abertas</p>
              {openPositions.map(pos=>(
                <div key={pos.id} className="flex justify-between text-[10px] px-2 py-1 rounded"
                  style={{background:"var(--bg)"}}>
                  <span style={{color:pos.direction==="LONG"?"#10b981":"#ef4444"}}>
                    {pos.direction} {pos.simbolo.replace("USDT","")}
                  </span>
                  <span style={{color:"var(--text-muted)"}}>{fDate(pos.abertura)}</span>
                  <span style={{color:"var(--text-muted)"}}>TP:{pos.tp.toFixed(2)} SL:{pos.sl.toFixed(2)}</span>
                </div>
              ))}
            </div>
          )}
          {wallet && wallet.trades.length>0 && (
            <div className="space-y-1">
              <p className="text-[9px] font-bold uppercase" style={{color:"var(--text-muted)"}}>Últimas ops</p>
              {wallet.trades.slice(0,5).map(t=>(
                <div key={t.id} className="flex justify-between text-[10px] px-2 py-1 rounded"
                  style={{background:"var(--bg)"}}>
                  <span style={{color:t.direction==="LONG"?"#10b981":"#ef4444"}}>
                    {t.direction} {t.simbolo.replace("USDT","")}
                  </span>
                  <span style={{color:t.pnl_brl>=0?"#10b981":"#ef4444"}} className="font-bold tabular-nums">
                    {fPct(t.pct)}
                  </span>
                  <span className="font-bold uppercase" style={{
                    color:t.status==="tp"?"#10b981":t.status==="sl"?"#ef4444":"#6b7280"}}>
                    {t.status.toUpperCase()}
                  </span>
                </div>
              ))}
            </div>
          )}
          <button onClick={onReset}
            className="flex items-center gap-1 text-[10px] px-2 py-1 rounded"
            style={{color:"#ef4444",background:"#ef444411",border:"1px solid #ef444422"}}>
            <Trash2 size={10}/> Zerar bot
          </button>
        </div>
      )}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function BotSRDPage() {
  const [wallets, setWallets]       = useState<Record<string,SRDWallet>>({});
  // activeBots inicializa vazio — useEffect carrega do localStorage
  const [activeBots, setActive]     = useState<Set<string>>(new Set<string>());
  const [autoTrade, setAutoTrade]   = useState(true);
  const [scanning, setScanning]     = useState(false);
  const [log, setLog]               = useState<string[]>([]);
  const [lastScan, setLastScan]     = useState<Date|null>(null);
  const [availableCoins, setAvailableCoins] = useState<string[]>(FUTURES_COINS_DEFAULT);
  const [selectedCoins, setCoins]   = useState<string[]>(FUTURES_COINS_DEFAULT);
  const [lastSignals, setSignals]   = useState<Record<string,{simbolo:string;dir:"LONG"|"SHORT";scores:MarketSnapshot}>>({});
  const [learnedParams, setLearned] = useState<Record<string, SRDLearnedParams>>({});
  const [regime, setRegime]         = useState<MarketRegime|null>(null);
  const scanRef       = useRef(false);
  const scanScoresRef = useRef<Record<string, number>>({});

  // Persiste activeBots no localStorage sempre que mudar
  useEffect(() => {
    if (activeBots.size === 0) return; // evita salvar estado vazio antes do carregamento
    try { localStorage.setItem(ACTIVE_BOTS_KEY, JSON.stringify([...activeBots])); } catch {}
  }, [activeBots]);

  useEffect(() => {
    setWallets(loadWallets());
    setLearned(loadLearnedParams());
    // Carrega bots ativos salvos (ou ativa todos como padrão)
    try {
      const saved = localStorage.getItem(ACTIVE_BOTS_KEY);
      if (saved) {
        const ids: string[] = JSON.parse(saved);
        const validIds = ids.filter(id => SRD_BOTS.some(b => b.id === id));
        setActive(new Set(validIds));
      } else {
        // Primeiro uso — ativa todos por padrão
        setActive(new Set(SRD_BOTS.map(b => b.id)));
      }
    } catch {
      setActive(new Set(SRD_BOTS.map(b => b.id)));
    }
    fetch(`${API}/cripto/futures/scan`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.geral?.length) {
          const items = d.geral as Array<{simbolo:string; score_final?:number}>;
          const coins = items.map(i => i.simbolo.endsWith("USDT")?i.simbolo:i.simbolo+"USDT").filter((v,i,a)=>a.indexOf(v)===i);
          const scores: Record<string,number> = {};
          for (const item of items) {
            const sym = item.simbolo.endsWith("USDT")?item.simbolo:item.simbolo+"USDT";
            if (typeof item.score_final==="number") scores[sym] = item.score_final;
          }
          scanScoresRef.current = scores;
          if (coins.length>0) { setAvailableCoins(coins); setCoins(coins); }
        }
      }).catch(()=>{});
  }, []);

  const addLog = useCallback((msg: string) => {
    setLog(prev => [`${new Date().toLocaleTimeString("pt-BR")} — ${msg}`, ...prev].slice(0,50));
  }, []);

  const runScan = useCallback(async () => {
    if (scanRef.current) return;
    scanRef.current = true;
    setScanning(true);
    addLog("🔍 Scan iniciado...");

    const botsToRun = SRD_BOTS.filter(b => activeBots.has(b.id));
    if (!botsToRun.length) { addLog("⚠️ Nenhum bot ativo."); setScanning(false); scanRef.current=false; return; }

    // Atualiza scores do scan
    try {
      const sr = await fetch(`${API}/cripto/futures/scan`);
      if (sr.ok) {
        const sd = await sr.json();
        if (sd?.geral?.length) {
          const ns: Record<string,number> = {};
          for (const item of sd.geral as Array<{simbolo:string;score_final?:number}>) {
            const sym = item.simbolo.endsWith("USDT")?item.simbolo:item.simbolo+"USDT";
            if (typeof item.score_final==="number") ns[sym] = item.score_final;
          }
          scanScoresRef.current = ns;
        }
      }
    } catch {}

    // ── Calcula Regime de Mercado ───────────────────────────────────────────
    const current      = loadWallets();
    const currentLearn = loadLearnedParams();

    // Breadth: % moedas bullish a partir dos scan scores
    const allScanScores = Object.values(scanScoresRef.current);
    const breadthBull = allScanScores.length > 0
      ? allScanScores.filter(s => s > 52).length / allScanScores.length
      : 0.5;

    // BTC score: usa scanScoresRef (vem do futures scan) ou faz fetch direto
    let btcScore = scanScoresRef.current["BTCUSDT"] ?? scanScoresRef.current["BTC"] ?? 50;
    try {
      const btcR = await fetch(`${API}/cripto/BTC`);
      if (btcR.ok) {
        const btcD = await btcR.json();
        if (typeof btcD.scores?.compra === "number") btcScore = btcD.scores.compra;
      }
    } catch {}

    // WR global das últimas 20 ops de todos os bots
    const allRecentTrades = Object.values(current)
      .flatMap(w => w.trades)
      .sort((a,b) => b.time - a.time)
      .slice(0, 20);
    const globalWR = allRecentTrades.length > 0
      ? allRecentTrades.filter(t => t.status === "tp").length / allRecentTrades.length
      : 0.5;

    const currentRegime = computeRegime(btcScore, breadthBull, globalWR);
    setRegime(currentRegime);
    if (currentRegime.trend === "CRISE" || currentRegime.trend === "BEAR") {
      addLog(`🌡️ Regime: ${currentRegime.descricao}`);
    }

    // 1. Checa fechamentos
    for (const bot of botsToRun) {
      const w = current[bot.id] ?? emptyWallet(bot.id);
      for (const [posKey, pos] of Object.entries(w.positions)) {
        try {
          const r = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${pos.simbolo}`);
          const d = await r.json();
          const preco  = parseFloat(d.price);
          const isLong = pos.direction === "LONG";
          const hitTP  = isLong ? preco >= pos.tp : preco <= pos.tp;
          const hitSL  = isLong ? preco <= pos.sl : preco >= pos.sl;

          if (hitTP || hitSL) {
            const status: "tp"|"sl" = hitTP ? "tp" : "sl";
            const pnl_brl = hitTP
              ? pos.amount_brl * (pos.tp_pct/100) * pos.leverage
              : -pos.amount_brl * (pos.sl_pct/100) * pos.leverage;
            const pct = hitTP ? pos.tp_pct * pos.leverage : -pos.sl_pct * pos.leverage;
            const trade: SRDTrade = {
              id:`${pos.id}_close`, botId:bot.id, botName:bot.name,
              simbolo:pos.simbolo, direction:pos.direction, tipo:"V",
              preco_entrada:pos.preco_entrada, preco_saida:preco,
              sl:pos.sl, tp:pos.tp, sl_pct:pos.sl_pct, tp_pct:pos.tp_pct,
              leverage:pos.leverage, amount_brl:pos.amount_brl,
              pnl_brl, pct,
              suporte_score:pos.suporte_score, resistencia_score:pos.resistencia_score,
              volume_score:pos.volume_score, direcao_score:pos.direcao_score,
              motivo_entrada:pos.motivo_entrada, status,
              abertura:pos.abertura, time:Date.now(),
            };
            w.trades = [trade, ...w.trades];
            w.saldo += pnl_brl;
            delete w.positions[posKey];
            pushToTradeHist(trade);
            addLog(`${status==="tp"?"✅":"❌"} ${bot.name} ${pos.direction} ${pos.simbolo.replace("USDT","")} ${status.toUpperCase()} ${fPct(pct)}`);

            // ── Streak de reds + recalibre ────────────────────────────────
            if (status === "sl") {
              w.consecutiveReds  = (w.consecutiveReds  || 0) + 1;
              w.consecutiveWins  = 0;
              if (w.consecutiveReds >= RED_STREAK_MAX) {
                // Pausa 1 minuto e calibra com base no histórico
                const calib = calibrateAfterStreak(w);
                w.pausedUntil       = Date.now() + PAUSE_MS;
                w.streakCalibration = calib;
                w.consecutiveReds   = 0;
                addLog(`⏸🔧 ${bot.name} PAUSADO 1min + RECALIBRE +${calib.scalp_boost}pts scalp por ${calib.cycles_remaining} ciclos — ${calib.reason}`);
              }
            } else {
              // Win → avança consecutive wins; se atingir 3, encerra recalibre cedo
              w.consecutiveReds = 0;
              w.consecutiveWins = (w.consecutiveWins || 0) + 1;
              if (w.consecutiveWins >= 3 && w.streakCalibration && w.streakCalibration.cycles_remaining > 0) {
                w.streakCalibration.cycles_remaining = 0;
                addLog(`✅ ${bot.name} 3 wins seguidos — recalibre desativado antecipadamente`);
              }
            }

            // ── Auto Aprendizado ────────────────────────────────────────
            const totalOps   = w.trades.length;
            const prevLearn  = currentLearn[bot.id];
            const lastLearned = prevLearn?.lastLearnOps ?? 0;
            if (totalOps >= lastLearned + LEARN_CYCLE && totalOps % LEARN_CYCLE === 0) {
              const newLearn = learnFromHistory(bot, w.trades, prevLearn ?? null);
              currentLearn[bot.id] = newLearn;
              saveLearnedParams(currentLearn);
              addLog(`🧠 ${bot.name} aprendeu! Ciclo #${newLearn.learnCycle} · WR ${newLearn.lastLearnWR}%`);
            }
          }
        } catch { /* sem preço */ }
      }
      current[bot.id] = w;
    }

    // 1.5. Decrementa ciclos de recalibre (1 ciclo por scan)
    for (const bot of botsToRun) {
      const w = current[bot.id];
      if (!w) continue;
      if (w.streakCalibration && w.streakCalibration.cycles_remaining > 0) {
        w.streakCalibration.cycles_remaining--;
        if (w.streakCalibration.cycles_remaining === 0) {
          addLog(`📈 ${bot.name} recalibre expirado — filtros voltando ao normal`);
        }
        current[bot.id] = w;
      }
    }

    // 2. Busca mercado e verifica entradas
    for (const coin of selectedCoins) {
      let data: any = null;
      try {
        const r = await fetch(`${API}/cripto/${coin.replace("USDT","")}`);
        if (!r.ok) continue;
        data = await r.json();
      } catch { continue; }

      const scoreCompra = typeof data.scores?.compra === "number" ? data.scores.compra : 50;
      const srd: MarketSnapshot = {
        simbolo: coin, preco: data.preco_atual,
        suporte_score:    scoreSuporte(data.suportes ?? []),
        resistencia_score: scoreResistencia(data.resistencias ?? []),
        volume_score:     scoreVolume(data.volume_analise?.volume_relativo ?? null),
        direcao_long:     scoreDirecao(data, "LONG"),
        direcao_short:    scoreDirecao(data, "SHORT"),
        score_compra:     scoreCompra,
      };
      // Log informativo quando a moeda está em zona NEUTRO
      if (scoreCompra >= 44 && scoreCompra <= 56) {
        addLog(`⚪ ${coin.replace("USDT","")} NEUTRO scalp:${scoreCompra.toFixed(0)} — alavancados bloqueados`);
      }

      for (const bot of botsToRun) {
        const w = current[bot.id] ?? emptyWallet(bot.id);

        // ── Pausa por streak de reds ──────────────────────────────────
        if ((w.pausedUntil || 0) > Date.now()) continue;

        // ── Filtro anti-mercado lateral (alavancados) ─────────────────
        if (bot.leverage >= 5 && isLateralMarket(srd)) continue;
        // ── Filtro NEUTRO global (score scalp 48-52) — alavancados bloqueados ──
        const scalpScore = srd.score_compra;
        if (scalpScore >= 48 && scalpScore <= 52 && bot.leverage >= 5) continue;

        if (w.saldo < bot.capital_per_trade) continue;
        const eff = effectiveParams(bot, currentLearn[bot.id] ?? null);

        // Boost total: regime de mercado + recalibre pós-streak (stackam)
        const streakBoost  = (w.streakCalibration?.cycles_remaining ?? 0) > 0
          ? w.streakCalibration!.scalp_boost : 0;
        const scalpBoost = streakBoost + (currentRegime.regimeBoost ?? 0);

        for (const dir of ["LONG","SHORT"] as const) {
          if (!bot.directions.includes(dir)) continue;

          // ── Bloqueios globais por regime ──────────────────────────────
          const isReversalBot = ["srd_ariano","srd_xiquexique","srd_mandacaru","srd_sanfoneiro"].includes(bot.id);
          if (currentRegime.blockLong  && dir === "LONG"  && !isReversalBot) continue;
          if (currentRegime.blockShort && dir === "SHORT" && !isReversalBot) continue;

          // Filtros Tiro Curto
          if (TIRO_CURTO_IDS.has(bot.id)) {
            const dirScore = dir === "LONG" ? srd.direcao_long : srd.direcao_short;
            if (dirScore <= 70) continue;
            const scanScore = scanScoresRef.current[coin];
            if (typeof scanScore === "number") {
              if (dir === "LONG"  && scanScore <= 50) continue;
              if (dir === "SHORT" && scanScore >= 50) continue;
            } else {
              if (dir === "LONG"  && srd.direcao_long  <= srd.direcao_short) continue;
              if (dir === "SHORT" && srd.direcao_short <= srd.direcao_long)  continue;
            }
          }

          if (!shouldEnter(eff, srd, dir, scalpBoost)) continue;

          const posKey = `${coin}_${dir}_${Date.now()}_${Math.random().toString(36).slice(2,6)}`;
          const preco  = srd.preco;
          const isLong = dir === "LONG";
          const tp = isLong ? preco*(1+bot.tp_pct/100) : preco*(1-bot.tp_pct/100);
          const sl = isLong ? preco*(1-bot.sl_pct/100) : preco*(1+bot.sl_pct/100);

          const pos: SRDPosition = {
            id:posKey, botId:bot.id, botName:bot.name,
            simbolo:coin, direction:dir,
            preco_entrada:preco, sl, tp,
            sl_pct:bot.sl_pct, tp_pct:bot.tp_pct, leverage:bot.leverage,
            amount_brl:bot.capital_per_trade,
            suporte_score:srd.suporte_score, resistencia_score:srd.resistencia_score,
            volume_score:srd.volume_score,
            direcao_score:dir==="LONG"?srd.direcao_long:srd.direcao_short,
            motivo_entrada:dir==="LONG"?bot.motivo_long:bot.motivo_short,
            abertura:new Date().toISOString(),
          };
          w.positions[posKey] = pos;
          w.saldo -= bot.capital_per_trade;
          current[bot.id] = w;
          addLog(`📈 ${bot.name} ${dir} ${coin.replace("USDT","")} @ ${preco.toFixed(2)} TP:${tp.toFixed(2)} SL:${sl.toFixed(2)} · scalp:${srd.score_compra.toFixed(0)}`);
          setSignals(prev => ({...prev, [bot.id]:{simbolo:coin,dir,scores:srd}}));
        }
        current[bot.id] = w;
      }
    }

    saveWallets(current);
    setWallets({...current});
    setLearned({...currentLearn});
    setLastScan(new Date());
    setScanning(false);
    scanRef.current = false;
    addLog(`✓ Scan concluído — ${new Date().toLocaleTimeString("pt-BR")}`);
  }, [activeBots, selectedCoins, addLog]);

  // Auto-scan a cada 60s
  useEffect(() => {
    if (!autoTrade || !activeBots.size) return;
    const iv = setInterval(runScan, 60_000);
    return () => clearInterval(iv);
  }, [autoTrade, activeBots, runScan]);

  const toggleBot = (id: string) => setActive(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
  });
  const ativarTodos = () => {
    if (activeBots.size === SRD_BOTS.length) setActive(new Set());
    else setActive(new Set(SRD_BOTS.map(b => b.id)));
  };
  const resetBot = (id: string) => {
    if (!confirm(`Zerar o bot ${id}?`)) return;
    const w = {...wallets}; delete w[id];
    saveWallets(w); setWallets(w);
  };
  const toggleCoin = (c: string) =>
    setCoins(prev => prev.includes(c) ? prev.filter(x=>x!==c) : [...prev,c]);

  const totalStats = (() => {
    let ops=0,wins=0,pnl=0;
    for (const w of Object.values(wallets)) {
      ops+=w.trades.length; wins+=w.trades.filter(t=>t.status==="tp").length;
      pnl+=w.trades.reduce((a,t)=>a+t.pnl_brl,0);
    }
    return { ops, winRate:ops?wins/ops*100:0, pnl };
  })();

  const mainBots  = SRD_BOTS.filter(b => !TIRO_CURTO_IDS.has(b.id));
  const shortBots = SRD_BOTS.filter(b => TIRO_CURTO_IDS.has(b.id));

  return (
    <div className="min-h-screen" style={{background:"var(--bg)"}}>
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-5">

        {/* Regime Banner — só aparece quando há alerta */}
        {regime && (regime.trend === "CRISE" || regime.trend === "BEAR" || regime.regimeBoost > 0) && (() => {
          const colors: Record<string, {bg:string;border:string;text:string}> = {
            CRISE:  {bg:"rgba(239,68,68,0.1)",  border:"rgba(239,68,68,0.35)",  text:"#ef4444"},
            BEAR:   {bg:"rgba(249,115,22,0.09)", border:"rgba(249,115,22,0.3)",  text:"#f97316"},
            NEUTRO: {bg:"rgba(245,158,11,0.08)", border:"rgba(245,158,11,0.25)", text:"#f59e0b"},
            BULL:   {bg:"rgba(16,185,129,0.08)", border:"rgba(16,185,129,0.25)", text:"#10b981"},
          };
          const c = colors[regime.trend] ?? colors.NEUTRO;
          const icon = regime.trend==="CRISE"?"🚨":regime.trend==="BEAR"?"🐻":regime.trend==="NEUTRO"?"⚠️":"🐂";
          return (
            <div className="rounded-xl px-4 py-3 flex flex-wrap items-center gap-3"
              style={{background:c.bg, border:`1px solid ${c.border}`}}>
              <span style={{color:c.text}} className="text-sm font-black">{icon} Regime: {regime.trend}</span>
              <span style={{color:"var(--text-secondary)"}} className="text-[11px] flex-1">{regime.descricao}</span>
              <div className="flex gap-3 text-[10px]" style={{color:"var(--text-muted)"}}>
                <span>BTC <b style={{color:c.text}}>{regime.btcScore.toFixed(0)}</b></span>
                <span>Breadth <b style={{color:c.text}}>{(regime.breadthBull*100).toFixed(0)}%</b> bullish</span>
                <span>WR global <b style={{color:c.text}}>{(regime.globalWR*100).toFixed(0)}%</b></span>
                {regime.regimeBoost > 0 && <span>+<b style={{color:c.text}}>{regime.regimeBoost}</b>pts scalp</span>}
                {regime.blockLong  && <span style={{color:"#ef4444",fontWeight:700}}>🚫 LONGs bloqueados</span>}
                {regime.blockShort && <span style={{color:"#ef4444",fontWeight:700}}>🚫 SHORTs bloqueados</span>}
              </div>
            </div>
          );
        })()}

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
          <div>
            <h1 className="text-xl font-black" style={{color:"var(--text-primary)"}}>BOT SRD</h1>
            <p className="text-xs mt-0.5" style={{color:"var(--text-muted)"}}>
              Suporte · Resistência · Volume · Direção &nbsp;—&nbsp; 30 bots calibrados · {availableCoins.length} moedas futuros
            </p>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <button onClick={ativarTodos}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
              style={{
                background:activeBots.size===SRD_BOTS.length?"#10b98122":"var(--bg-card)",
                color:activeBots.size===SRD_BOTS.length?"#10b981":"var(--text-secondary)",
                border:`1px solid ${activeBots.size===SRD_BOTS.length?"#10b98155":"var(--border)"}`,
              }}>
              {activeBots.size===SRD_BOTS.length?<><Square size={11}/> Desativar Todos</>:<><Play size={11}/> Ativar Todos</>}
            </button>
            <button onClick={() => setAutoTrade(v => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
              style={{
                background:autoTrade?"#10b98122":"var(--bg-card)",
                color:autoTrade?"#10b981":"var(--text-muted)",
                border:`1px solid ${autoTrade?"#10b98155":"var(--border)"}`,
              }}>
              <span className={`w-1.5 h-1.5 rounded-full ${autoTrade?"bg-emerald-400 animate-pulse":"bg-gray-500"}`}/>
              Auto Trade {autoTrade?"ON":"OFF"}
            </button>
            <span className="text-[10px] px-2 py-1 rounded-lg font-bold"
              style={{background:"#8b5cf622",color:"#8b5cf6",border:"1px solid #8b5cf633"}}>
              {activeBots.size}/{SRD_BOTS.length} ativos
            </span>
            {lastScan && (
              <span className="text-[10px]" style={{color:"var(--text-muted)"}}>
                {lastScan.toLocaleTimeString("pt-BR")}
              </span>
            )}
            <button onClick={runScan} disabled={scanning}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all disabled:opacity-50"
              style={{background:scanning?"var(--bg-card)":"#3b82f6",color:"white"}}>
              {scanning?<><Activity size={12}/> Escaneando...</>:<><Zap size={12}/> Escanear</>}
            </button>
          </div>
        </div>

        {/* Totais */}
        <div className="grid grid-cols-3 gap-3">
          {[
            {label:"Total Ops", val:`${totalStats.ops}`, color:"var(--text-primary)"},
            {label:"Win Rate",  val:totalStats.ops?`${totalStats.winRate.toFixed(1)}%`:"—",
              color:totalStats.winRate>=55?"#10b981":totalStats.winRate>=50?"#f59e0b":"#ef4444"},
            {label:"P&L Total", val:totalStats.ops?fBRL(totalStats.pnl):"—",
              color:totalStats.pnl>=0?"#10b981":"#ef4444"},
          ].map(s=>(
            <div key={s.label} className="rounded-xl px-4 py-3 text-center"
              style={{background:"var(--bg-card)",border:"1px solid var(--border)"}}>
              <p className="text-[10px] uppercase font-bold" style={{color:"var(--text-muted)"}}>{s.label}</p>
              <p className="text-lg font-black tabular-nums" style={{color:s.color}}>{s.val}</p>
            </div>
          ))}
        </div>

        {/* Info de calibração */}
        <div className="rounded-xl px-4 py-3 text-[10px] space-y-1"
          style={{background:"var(--bg-card)",border:"1px solid var(--border)"}}>
          <p className="font-bold" style={{color:"var(--text-primary)"}}>📐 Calibração — base Scalp (WR 48.7% · gain +1.56% · loss -0.88%)</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1" style={{color:"var(--text-muted)"}}>
            <span>⚖️ <strong style={{color:"#10b981"}}>5x Principais</strong> → SL/TP 0.6% · conta ±3% · R:R 1:1</span>
            <span>⚖️ <strong style={{color:"#f59e0b"}}>10x Principais</strong> → SL/TP 0.5% · conta ±5% · R:R 1:1</span>
            <span>⚡ <strong style={{color:"#f43f5e"}}>Tiro Curto</strong> → SL/TP 0.25-0.4% (% menores, saída rápida)</span>
            <span>📊 <strong style={{color:"#3b82f6"}}>1x-3x</strong> → R:R assimétrico (TP &gt; SL) · base scalp</span>
            <span>🚫 <strong style={{color:"#a855f7"}}>Anti-lateral</strong> → alavancados bloqueados sem direção &gt;55 ou spread &lt;20</span>
            <span>⏸ <strong style={{color:"#f97316"}}>Stop streak</strong> → {RED_STREAK_MAX} reds seguidos = 1 min pausa</span>
          </div>
        </div>

        {/* Seletor de moedas */}
        <div className="rounded-xl p-3 space-y-2" style={{background:"var(--bg-card)",border:"1px solid var(--border)"}}>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-bold uppercase" style={{color:"var(--text-muted)"}}>
              Moedas para scan ({selectedCoins.length}/{availableCoins.length})
            </span>
            <div className="flex gap-1.5">
              <button onClick={() => setCoins([...availableCoins])}
                className="px-2 py-0.5 rounded text-[10px] font-bold"
                style={{background:"#10b98122",color:"#10b981",border:"1px solid #10b98133"}}>Todas</button>
              <button onClick={() => setCoins([])}
                className="px-2 py-0.5 rounded text-[10px] font-bold"
                style={{background:"#ef444422",color:"#ef4444",border:"1px solid #ef444433"}}>Limpar</button>
            </div>
          </div>
          <div className="flex flex-wrap gap-1">
            {availableCoins.map(c => {
              const on = selectedCoins.includes(c);
              return (
                <button key={c} onClick={()=>toggleCoin(c)}
                  className="px-2 py-0.5 rounded text-[9px] font-bold transition-all"
                  style={{
                    background:on?"#f59e0b22":"var(--bg)",
                    border:`1px solid ${on?"#f59e0b55":"var(--border)"}`,
                    color:on?"#f59e0b":"var(--text-muted)",
                  }}>
                  {c.replace("USDT","")}
                </button>
              );
            })}
          </div>
        </div>

        {/* Grid Bots Principais */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs font-black" style={{color:"var(--text-primary)"}}>🤖 Bots SRD</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full font-bold"
              style={{background:"#8b5cf622",color:"#8b5cf6",border:"1px solid #8b5cf633"}}>
              20 bots · 4 pilares · 5x e 10x
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {mainBots.map(bot => (
              <BotCard key={bot.id} bot={bot}
                wallet={wallets[bot.id] ?? null}
                active={activeBots.has(bot.id)}
                onToggle={() => toggleBot(bot.id)}
                onReset={() => resetBot(bot.id)}
                lastSignal={lastSignals[bot.id] ?? null}
                learned={learnedParams[bot.id] ?? null}
              />
            ))}
          </div>
        </div>

        {/* Grid Tiro Curto */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs font-black" style={{color:"var(--text-primary)"}}>⚡ Tiro Curto</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full font-bold"
              style={{background:"#f43f5e22",color:"#f43f5e",border:"1px solid #f43f5e33"}}>
              10 bots · scalp · 5x e 10x
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {shortBots.map(bot => (
              <BotCard key={bot.id} bot={bot}
                wallet={wallets[bot.id] ?? null}
                active={activeBots.has(bot.id)}
                onToggle={() => toggleBot(bot.id)}
                onReset={() => resetBot(bot.id)}
                lastSignal={lastSignals[bot.id] ?? null}
                learned={learnedParams[bot.id] ?? null}
              />
            ))}
          </div>
        </div>

        {/* Log */}
        {log.length > 0 && (
          <div className="rounded-xl p-3 space-y-1 max-h-48 overflow-y-auto"
            style={{background:"var(--bg-card)",border:"1px solid var(--border)"}}>
            <p className="text-[10px] font-bold uppercase mb-2" style={{color:"var(--text-muted)"}}>Log de sinais</p>
            {log.map((l,i)=>(
              <p key={i} className="text-[10px] font-mono" style={{color:"var(--text-secondary)"}}>{l}</p>
            ))}
          </div>
        )}

      </div>
    </div>
  );
}
