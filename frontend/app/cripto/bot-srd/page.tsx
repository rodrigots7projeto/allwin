"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Play, Square, RefreshCw, Trash2, ChevronDown, ChevronUp,
  TrendingUp, TrendingDown, Activity, Zap, BarChart2,
} from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";
const SRD_KEY = "allwin_srd_wallets_v1";
const TRADE_HIST_KEY = "allwin_trade_hist";

// ── Moedas disponíveis ────────────────────────────────────────────────────────

const COINS = ["BTCUSDT","ETHUSDT","SOLUSDT","BNBUSDT","XRPUSDT","ADAUSDT","AVAXUSDT","LINKUSDT","DOGEUSDT","LTCUSDT"];

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface SRDBotDef {
  id: string; name: string; perfil: string; emoji: string; color: string;
  directions: ("LONG"|"SHORT")[];
  direcao_min: number;   // 0-100
  volume_min: number;    // multiplicador (1.0 = média)
  suporte_min: number;   // 0-100
  resistencia_min: number; // 0-100
  sl_pct: number; tp_pct: number; leverage: number;
  capital_per_trade: number;
  motivo_long: string; motivo_short: string;
}

interface SRDTrade {
  id: string; botId: string; botName: string;
  simbolo: string; direction: "LONG"|"SHORT";
  tipo: "V"; // só vendas (fechamentos)
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

interface SRDWallet {
  botId: string; saldo: number;
  positions: Record<string, SRDPosition>;
  trades: SRDTrade[];
}

interface MarketSnapshot {
  simbolo: string; preco: number;
  suporte_score: number;   // 0-100 (100 = em cima do suporte)
  resistencia_score: number; // 0-100 (100 = em cima da resistência)
  volume_score: number;    // multiplicador real (1.0 = média)
  direcao_long: number;    // 0-100
  direcao_short: number;   // 0-100
}

// ── 20 Bots SRD ──────────────────────────────────────────────────────────────

const SRD_BOTS: SRDBotDef[] = [
  {
    id:"srd_severino", name:"SEVERINO", perfil:"Ultra Conservador", emoji:"👴", color:"#6b7280",
    directions:["LONG","SHORT"], direcao_min:85, volume_min:3.0, suporte_min:80, resistencia_min:80,
    sl_pct:0.5, tp_pct:1.5, leverage:3, capital_per_trade:500,
    motivo_long:"Direção muito forte + volume muito acima + suporte sólido",
    motivo_short:"Direção de baixa muito forte + volume muito acima + resistência sólida",
  },
  {
    id:"srd_lampiao", name:"LAMPIÃO", perfil:"Conservador · Menor Volume", emoji:"🔦", color:"#f97316",
    directions:["LONG","SHORT"], direcao_min:75, volume_min:1.8, suporte_min:80, resistencia_min:80,
    sl_pct:0.7, tp_pct:2.0, leverage:5, capital_per_trade:500,
    motivo_long:"Direção forte + suporte confirmado (volume moderado aceito)",
    motivo_short:"Direção de queda + resistência confirmada (volume moderado aceito)",
  },
  {
    id:"srd_gonzagao", name:"GONZAGÃO", perfil:"Seguidor de Tendência", emoji:"🎸", color:"#a855f7",
    directions:["LONG","SHORT"], direcao_min:90, volume_min:1.2, suporte_min:50, resistencia_min:50,
    sl_pct:1.0, tp_pct:3.0, leverage:5, capital_per_trade:500,
    motivo_long:"Direção dominante — segue a tendência de alta sem exigir S/R preciso",
    motivo_short:"Direção dominante de baixa — segue a tendência sem exigir S/R preciso",
  },
  {
    id:"srd_ariano", name:"ARIANO", perfil:"Caçador de Reversões S/R", emoji:"🎭", color:"#ec4899",
    directions:["LONG","SHORT"], direcao_min:50, volume_min:1.0, suporte_min:90, resistencia_min:90,
    sl_pct:0.8, tp_pct:2.5, leverage:5, capital_per_trade:500,
    motivo_long:"Preço em suporte extremamente próximo — reversão esperada",
    motivo_short:"Preço em resistência extremamente próxima — reversão esperada",
  },
  {
    id:"srd_patativa", name:"PATATIVA", perfil:"Volume Dominante", emoji:"🦅", color:"#0ea5e9",
    directions:["LONG","SHORT"], direcao_min:55, volume_min:4.0, suporte_min:55, resistencia_min:55,
    sl_pct:0.6, tp_pct:2.0, leverage:5, capital_per_trade:500,
    motivo_long:"Volume explosivo como fator principal — compra no impulso de alta",
    motivo_short:"Volume explosivo — venda no impulso de baixa",
  },
  {
    id:"srd_corone", name:"CORONÉ", perfil:"Resistência Forte · Só Short", emoji:"👑", color:"#ef4444",
    directions:["SHORT"], direcao_min:65, volume_min:1.5, suporte_min:40, resistencia_min:95,
    sl_pct:0.7, tp_pct:2.0, leverage:5, capital_per_trade:500,
    motivo_long:"—",
    motivo_short:"Resistência forte confirmada — short preciso na zona de venda",
  },
  {
    id:"srd_cabra", name:"CABRA DA PESTE", perfil:"Agressivo", emoji:"🐐", color:"#dc2626",
    directions:["LONG","SHORT"], direcao_min:55, volume_min:1.2, suporte_min:55, resistencia_min:55,
    sl_pct:1.5, tp_pct:4.5, leverage:10, capital_per_trade:300,
    motivo_long:"Entrada agressiva — qualquer convergência moderada com alvos largos",
    motivo_short:"Entrada agressiva de short — convergência moderada com alvos largos",
  },
  {
    id:"srd_vitalino", name:"MESTRE VITALINO", perfil:"Scalp Ultra-Rápido", emoji:"⚡", color:"#fbbf24",
    directions:["LONG","SHORT"], direcao_min:70, volume_min:2.0, suporte_min:75, resistencia_min:75,
    sl_pct:0.3, tp_pct:0.8, leverage:10, capital_per_trade:400,
    motivo_long:"Scalp curto — entrada rápida próxima ao suporte com alvo pequeno",
    motivo_short:"Scalp curto — entrada rápida próxima à resistência com alvo pequeno",
  },
  {
    id:"srd_ze", name:"ZÉ DO SERTÃO", perfil:"Equilibrado", emoji:"🤠", color:"#10b981",
    directions:["LONG","SHORT"], direcao_min:70, volume_min:1.8, suporte_min:72, resistencia_min:72,
    sl_pct:1.0, tp_pct:2.5, leverage:5, capital_per_trade:500,
    motivo_long:"Convergência equilibrada dos 4 pilares para LONG",
    motivo_short:"Convergência equilibrada dos 4 pilares para SHORT",
  },
  {
    id:"srd_chico", name:"CHICO DE ASSIS", perfil:"Confirmação Dupla", emoji:"✌️", color:"#84cc16",
    directions:["LONG","SHORT"], direcao_min:80, volume_min:2.5, suporte_min:80, resistencia_min:80,
    sl_pct:0.8, tp_pct:2.0, leverage:5, capital_per_trade:500,
    motivo_long:"Dois pilares fortíssimos confirmados — LONG de alta convicção",
    motivo_short:"Dois pilares fortíssimos confirmados — SHORT de alta convicção",
  },
  {
    id:"srd_bodinho", name:"BODINHO", perfil:"Micro Movimentos", emoji:"🔬", color:"#06b6d4",
    directions:["LONG","SHORT"], direcao_min:60, volume_min:1.5, suporte_min:68, resistencia_min:68,
    sl_pct:0.2, tp_pct:0.5, leverage:15, capital_per_trade:300,
    motivo_long:"Micro-scalp em suporte — alvo mínimo, risco mínimo",
    motivo_short:"Micro-scalp em resistência — alvo mínimo, risco mínimo",
  },
  {
    id:"srd_jatoba", name:"JATOBÁ", perfil:"Rompimentos", emoji:"💥", color:"#f59e0b",
    directions:["LONG","SHORT"], direcao_min:85, volume_min:3.5, suporte_min:35, resistencia_min:35,
    sl_pct:1.0, tp_pct:3.0, leverage:7, capital_per_trade:400,
    motivo_long:"Rompimento com volume explosivo e direção forte — S/R não necessário",
    motivo_short:"Rompimento de baixa com volume explosivo e direção forte",
  },
  {
    id:"srd_xiquexique", name:"XIQUE-XIQUE", perfil:"Reteste de Suporte · Só Long", emoji:"🌵", color:"#22d3ee",
    directions:["LONG"], direcao_min:55, volume_min:1.2, suporte_min:95, resistencia_min:30,
    sl_pct:0.5, tp_pct:1.8, leverage:5, capital_per_trade:500,
    motivo_long:"Preço retestando suporte preciso — LONG conservador",
    motivo_short:"—",
  },
  {
    id:"srd_mandacaru", name:"MANDACARU", perfil:"Reteste de Resistência · Só Short", emoji:"🌿", color:"#a78bfa",
    directions:["SHORT"], direcao_min:55, volume_min:1.2, suporte_min:30, resistencia_min:95,
    sl_pct:0.5, tp_pct:1.8, leverage:5, capital_per_trade:500,
    motivo_long:"—",
    motivo_short:"Preço retestando resistência precisa — SHORT conservador",
  },
  {
    id:"srd_lua", name:"LUA DO SERTÃO", perfil:"Tendência Lenta", emoji:"🌙", color:"#818cf8",
    directions:["LONG","SHORT"], direcao_min:92, volume_min:1.0, suporte_min:35, resistencia_min:35,
    sl_pct:2.0, tp_pct:6.0, leverage:3, capital_per_trade:500,
    motivo_long:"Tendência de alta muito forte — alvo largo, opera swing no scalp",
    motivo_short:"Tendência de baixa muito forte — alvo largo, opera swing no scalp",
  },
  {
    id:"srd_cacto", name:"CACTO", perfil:"Volume Extremo", emoji:"🎋", color:"#4ade80",
    directions:["LONG","SHORT"], direcao_min:60, volume_min:5.0, suporte_min:60, resistencia_min:60,
    sl_pct:0.8, tp_pct:2.5, leverage:5, capital_per_trade:400,
    motivo_long:"Volume 5x acima da média — pressão compradora extrema",
    motivo_short:"Volume 5x acima da média — pressão vendedora extrema",
  },
  {
    id:"srd_baiao", name:"BAIÃO", perfil:"Movimentos Rápidos", emoji:"🎵", color:"#fb923c",
    directions:["LONG","SHORT"], direcao_min:68, volume_min:2.0, suporte_min:62, resistencia_min:62,
    sl_pct:0.4, tp_pct:1.2, leverage:10, capital_per_trade:400,
    motivo_long:"Movimento rápido de alta — scalp com velocidade",
    motivo_short:"Movimento rápido de queda — scalp com velocidade",
  },
  {
    id:"srd_asabranca", name:"ASA BRANCA", perfil:"Entradas Premium", emoji:"🕊️", color:"#e2e8f0",
    directions:["LONG","SHORT"], direcao_min:90, volume_min:3.0, suporte_min:90, resistencia_min:90,
    sl_pct:0.6, tp_pct:2.0, leverage:7, capital_per_trade:600,
    motivo_long:"Todos os 4 pilares em nível premium — entrada de altíssima qualidade",
    motivo_short:"Todos os 4 pilares em nível premium de baixa — short de alta qualidade",
  },
  {
    id:"srd_cajueiro", name:"CAJUEIRO", perfil:"Entradas Moderadas", emoji:"🌳", color:"#d97706",
    directions:["LONG","SHORT"], direcao_min:65, volume_min:1.5, suporte_min:65, resistencia_min:65,
    sl_pct:0.9, tp_pct:2.5, leverage:5, capital_per_trade:500,
    motivo_long:"Convergência moderada equilibrada — bom custo-benefício para LONG",
    motivo_short:"Convergência moderada equilibrada — bom custo-benefício para SHORT",
  },
  {
    id:"srd_sertanejo", name:"SERTANEJO", perfil:"Híbrido Adaptativo", emoji:"🎻", color:"#c084fc",
    directions:["LONG","SHORT"], direcao_min:72, volume_min:2.2, suporte_min:68, resistencia_min:68,
    sl_pct:0.8, tp_pct:2.2, leverage:5, capital_per_trade:500,
    motivo_long:"Híbrido: aceita volume alto compensando direção moderada (e vice-versa)",
    motivo_short:"Híbrido: aceita direção alta compensando volume moderado (e vice-versa)",
  },
];

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

function scoreVolume(volume_relativo: number | null): number {
  return volume_relativo ?? 0;
}

function scoreDirecao(data: {
  tendencia: { curto_prazo: string };
  tecnico: {
    macd: { sinal: string } | null;
    obv: { sinal: string };
    ema_9: { sinal: string };
  };
}, dir: "LONG"|"SHORT"): number {
  const buy = dir === "LONG";
  let score = 0;
  const t = data.tendencia.curto_prazo;
  if (buy && t === "alta") score += 30;
  if (!buy && t === "baixa") score += 30;
  if (data.tecnico.macd) {
    const m = data.tecnico.macd.sinal;
    if (buy && m === "compra") score += 25;
    if (!buy && m === "venda") score += 25;
  }
  const obv = data.tecnico.obv.sinal;
  if (buy && obv === "compra") score += 25;
  if (!buy && obv === "venda") score += 25;
  const e9 = data.tecnico.ema_9.sinal;
  if (buy && e9 === "compra") score += 20;
  if (!buy && e9 === "venda") score += 20;
  return score;
}

// Para SERTANEJO: score híbrido (volume alto pode compensar direção menor e vice-versa)
function shouldEnterHybrid(bot: SRDBotDef, srd: MarketSnapshot, dir: "LONG"|"SHORT"): boolean {
  const d = dir === "LONG" ? srd.direcao_long : srd.direcao_short;
  const s = dir === "LONG" ? srd.suporte_score : srd.resistencia_score;
  // Aceita se volume for 30% acima do mínimo E direção for 20 abaixo do mínimo (compensa)
  const volBonus = srd.volume_score >= bot.volume_min * 1.3;
  const dirBonus = d >= bot.direcao_min * 1.2;
  const standard = d >= bot.direcao_min && srd.volume_score >= bot.volume_min && s >= (dir==="LONG"?bot.suporte_min:bot.resistencia_min);
  const hybrid1  = volBonus && d >= bot.direcao_min * 0.8 && s >= (dir==="LONG"?bot.suporte_min:bot.resistencia_min);
  const hybrid2  = dirBonus && srd.volume_score >= bot.volume_min * 0.75 && s >= (dir==="LONG"?bot.suporte_min:bot.resistencia_min);
  return standard || hybrid1 || hybrid2;
}

function shouldEnter(bot: SRDBotDef, srd: MarketSnapshot, dir: "LONG"|"SHORT"): boolean {
  if (!bot.directions.includes(dir)) return false;
  if (bot.id === "srd_sertanejo") return shouldEnterHybrid(bot, srd, dir);
  const d = dir === "LONG" ? srd.direcao_long : srd.direcao_short;
  const s = dir === "LONG" ? srd.suporte_score : srd.resistencia_score;
  return d >= bot.direcao_min && srd.volume_score >= bot.volume_min && s >= (dir==="LONG"?bot.suporte_min:bot.resistencia_min);
}

// ── localStorage helpers ──────────────────────────────────────────────────────

function loadWallets(): Record<string, SRDWallet> {
  try { return JSON.parse(localStorage.getItem(SRD_KEY) ?? "{}"); } catch { return {}; }
}
function saveWallets(w: Record<string, SRDWallet>) {
  try { localStorage.setItem(SRD_KEY, JSON.stringify(w)); } catch {}
}
function emptyWallet(botId: string): SRDWallet {
  return { botId, saldo: 10000, positions: {}, trades: [] };
}
function pushToTradeHist(trade: SRDTrade) {
  try {
    const all = JSON.parse(localStorage.getItem(TRADE_HIST_KEY) ?? "[]");
    all.unshift({
      id: trade.id, simbolo: trade.simbolo, source: "srd_bot",
      subcategory: trade.botName,
      direction: trade.direction,
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
  const totalPnl  = sells.reduce((a,t)=>a+t.pnl_brl,0);
  const winRate   = sells.length ? wins.length/sells.length*100 : 0;
  const roi       = sells.reduce((a,t)=>a+t.pct,0);
  const yield_    = sells.reduce((a,t)=>a+(t.pnl_brl/(t.amount_brl||1)*100),0);

  let running=0, peak=0, maxDD=0;
  for (const t of [...sells].sort((a,b)=>a.time-b.time)) {
    running+=t.pnl_brl; if(running>peak)peak=running;
    const dd=peak>0?(peak-running)/peak*100:0; if(dd>maxDD)maxDD=dd;
  }
  return { ops:sells.length, wins:wins.length, winRate, totalPnl, roi, yield:yield_, maxDD };
}

// ── Helpers UI ────────────────────────────────────────────────────────────────

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
  bot, wallet, active, onToggle, onReset, lastSignal,
}: {
  bot: SRDBotDef;
  wallet: SRDWallet | null;
  active: boolean;
  onToggle: () => void;
  onReset: () => void;
  lastSignal?: { simbolo:string; dir:"LONG"|"SHORT"; scores: MarketSnapshot } | null;
}) {
  const [open, setOpen] = useState(false);
  const stats = wallet ? calcWalletStats(wallet) : null;
  const openPositions = wallet ? Object.values(wallet.positions) : [];

  return (
    <div className="rounded-xl overflow-hidden transition-all"
      style={{ border:`1.5px solid ${active ? bot.color+"66":"var(--border)"}`, background:"var(--bg-card)" }}>
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5"
        style={{ borderBottom:"1px solid var(--border)", background: active?`${bot.color}11`:"transparent" }}>
        <span className="text-base">{bot.emoji}</span>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-black leading-none" style={{color:bot.color}}>{bot.name}</p>
          <p className="text-[9px] mt-0.5 truncate" style={{color:"var(--text-muted)"}}>{bot.perfil}</p>
        </div>
        {/* Direções */}
        <div className="flex gap-0.5">
          {bot.directions.map(d=>(
            <span key={d} className="text-[8px] font-bold px-1 py-0.5 rounded"
              style={{background:d==="LONG"?"#10b98122":"#ef444422",color:d==="LONG"?"#10b981":"#ef4444"}}>
              {d}
            </span>
          ))}
        </div>
        {/* Toggle */}
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
          { label:"WR",    val: stats ? `${stats.winRate.toFixed(0)}%` : "—",
            color: !stats||!stats.ops?"var(--text-muted)":stats.winRate>=55?"#10b981":stats.winRate>=45?"#f59e0b":"#ef4444" },
          { label:"Ops",   val: stats ? `${stats.ops}` : "0",     color:"var(--text-primary)" },
          { label:"P&L",   val: stats&&stats.ops ? fBRL(stats.totalPnl) : "—",
            color: !stats||!stats.ops?"var(--text-muted)":stats.totalPnl>=0?"#10b981":"#ef4444" },
          { label:"ROI",   val: stats&&stats.ops ? fPct(stats.roi) : "—",
            color: !stats||!stats.ops?"var(--text-muted)":stats.roi>=0?"#10b981":"#ef4444" },
          { label:"MaxDD", val: stats&&stats.ops ? `${stats.maxDD.toFixed(1)}%` : "—",
            color: !stats||!stats.ops?"var(--text-muted)":stats.maxDD<=10?"#10b981":stats.maxDD<=25?"#f59e0b":"#ef4444" },
          { label:"Pos",   val: `${openPositions.length}`,
            color: openPositions.length>0?bot.color:"var(--text-muted)" },
        ].map(s=>(
          <div key={s.label} className="flex flex-col items-center py-1.5 px-1"
            style={{background:"var(--bg-card)"}}>
            <span className="text-[8px] uppercase" style={{color:"var(--text-muted)"}}>{s.label}</span>
            <span className="text-xs font-bold tabular-nums" style={{color:s.color}}>{s.val}</span>
          </div>
        ))}
      </div>

      {/* Expanded */}
      {open && (
        <div className="px-3 pb-3 pt-2 space-y-3">
          {/* Parâmetros */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
            <IntensityBar label="Suporte" value={bot.suporte_min} max={100} color="#10b981"/>
            <IntensityBar label="Resistência" value={bot.resistencia_min} max={100} color="#ef4444"/>
            <IntensityBar label="Volume" value={bot.volume_min} max={6} color="#3b82f6"/>
            <IntensityBar label="Direção" value={bot.direcao_min} max={100} color="#a855f7"/>
          </div>
          <div className="grid grid-cols-3 gap-2 text-[10px]">
            {[
              ["SL", `${bot.sl_pct}%`, "#ef4444"],
              ["TP", `${bot.tp_pct}%`, "#10b981"],
              ["Alavancagem", `${bot.leverage}x`, "#f59e0b"],
            ].map(([l,v,c])=>(
              <div key={l} className="rounded-lg p-1.5 text-center" style={{background:"var(--bg)"}}>
                <p className="text-[8px] uppercase" style={{color:"var(--text-muted)"}}>{l}</p>
                <p className="font-bold" style={{color:c as string}}>{v}</p>
              </div>
            ))}
          </div>
          {/* Último sinal */}
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
          {/* Posições abertas */}
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
          {/* Histórico recente */}
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
  const [wallets, setWallets]     = useState<Record<string,SRDWallet>>({});
  const [activeBots, setActive]   = useState<Set<string>>(new Set());
  const [scanning, setScanning]   = useState(false);
  const [log, setLog]             = useState<string[]>([]);
  const [lastScan, setLastScan]   = useState<Date|null>(null);
  const [selectedCoins, setCoins] = useState<string[]>(["BTCUSDT","ETHUSDT","SOLUSDT","BNBUSDT","XRPUSDT"]);
  const [lastSignals, setSignals] = useState<Record<string,{simbolo:string;dir:"LONG"|"SHORT";scores:MarketSnapshot}>>({});
  const scanRef = useRef(false);

  useEffect(() => { setWallets(loadWallets()); }, []);

  const addLog = useCallback((msg: string) => {
    setLog(prev => [`${new Date().toLocaleTimeString("pt-BR")} — ${msg}`, ...prev].slice(0,50));
  }, []);

  // ── Core scan ──────────────────────────────────────────────────────────────

  const runScan = useCallback(async () => {
    if (scanRef.current) return;
    scanRef.current = true;
    setScanning(true);
    addLog("🔍 Iniciando scan dos 4 pilares...");

    const botsToRun = SRD_BOTS.filter(b => activeBots.has(b.id));
    if (!botsToRun.length) { addLog("⚠️  Nenhum bot ativo."); setScanning(false); scanRef.current=false; return; }

    const current = loadWallets();

    // 1. Checar fechamentos de posições abertas
    for (const bot of botsToRun) {
      const w = current[bot.id] ?? emptyWallet(bot.id);
      for (const [posKey, pos] of Object.entries(w.positions)) {
        try {
          // Busca preço atual via ticker Binance
          const r = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${pos.simbolo}`);
          const d = await r.json();
          const preco = parseFloat(d.price);
          const isLong = pos.direction === "LONG";
          const hitTP = isLong ? preco >= pos.tp : preco <= pos.tp;
          const hitSL = isLong ? preco <= pos.sl : preco >= pos.sl;

          if (hitTP || hitSL) {
            const status: "tp"|"sl" = hitTP ? "tp" : "sl";
            const pnl_brl = hitTP
              ? pos.amount_brl * (pos.tp_pct/100) * pos.leverage
              : -pos.amount_brl * (pos.sl_pct/100) * pos.leverage;
            const pct = hitTP ? pos.tp_pct * pos.leverage : -pos.sl_pct * pos.leverage;
            const trade: SRDTrade = {
              id: `${pos.id}_close`, botId: bot.id, botName: bot.name,
              simbolo: pos.simbolo, direction: pos.direction, tipo:"V",
              preco_entrada: pos.preco_entrada, preco_saida: preco,
              sl: pos.sl, tp: pos.tp, sl_pct: pos.sl_pct, tp_pct: pos.tp_pct,
              leverage: pos.leverage, amount_brl: pos.amount_brl,
              pnl_brl, pct,
              suporte_score: pos.suporte_score, resistencia_score: pos.resistencia_score,
              volume_score: pos.volume_score, direcao_score: pos.direcao_score,
              motivo_entrada: pos.motivo_entrada,
              status, abertura: pos.abertura, time: Date.now(),
            };
            w.trades = [trade, ...w.trades];
            w.saldo += pnl_brl;
            delete w.positions[posKey];
            pushToTradeHist(trade);
            addLog(`${status==="tp"?"✅":"❌"} ${bot.name} ${pos.direction} ${pos.simbolo.replace("USDT","")} ${status.toUpperCase()} ${fPct(pct)}`);
          }
        } catch { /* preço não obtido */ }
      }
      current[bot.id] = w;
    }

    // 2. Buscar dados de mercado e checar entradas
    for (const coin of selectedCoins) {
      let data: any = null;
      try {
        const r = await fetch(`${API}/cripto/analysis/${coin.replace("USDT","")}`);
        if (!r.ok) continue;
        data = await r.json();
      } catch { continue; }

      const srd: MarketSnapshot = {
        simbolo: coin,
        preco: data.preco_atual,
        suporte_score: scoreSuporte(data.suportes ?? []),
        resistencia_score: scoreResistencia(data.resistencias ?? []),
        volume_score: scoreVolume(data.volume_analise?.volume_relativo ?? null),
        direcao_long: scoreDirecao(data, "LONG"),
        direcao_short: scoreDirecao(data, "SHORT"),
      };

      for (const bot of botsToRun) {
        const w = current[bot.id] ?? emptyWallet(bot.id);
        // Não abre nova posição se já tem uma no mesmo ativo
        if (w.positions[coin]) continue;
        // Não abre se capital insuficiente
        if (w.saldo < bot.capital_per_trade) continue;

        for (const dir of ["LONG","SHORT"] as const) {
          if (!bot.directions.includes(dir)) continue;
          if (!shouldEnter(bot, srd, dir)) continue;

          const preco = srd.preco;
          const isLong = dir === "LONG";
          const tp = isLong ? preco * (1 + bot.tp_pct/100) : preco * (1 - bot.tp_pct/100);
          const sl = isLong ? preco * (1 - bot.sl_pct/100) : preco * (1 + bot.sl_pct/100);

          const pos: SRDPosition = {
            id: `${bot.id}_${coin}_${Date.now()}`,
            botId: bot.id, botName: bot.name,
            simbolo: coin, direction: dir,
            preco_entrada: preco, sl, tp,
            sl_pct: bot.sl_pct, tp_pct: bot.tp_pct, leverage: bot.leverage,
            amount_brl: bot.capital_per_trade,
            suporte_score: srd.suporte_score,
            resistencia_score: srd.resistencia_score,
            volume_score: srd.volume_score,
            direcao_score: dir==="LONG" ? srd.direcao_long : srd.direcao_short,
            motivo_entrada: dir==="LONG" ? bot.motivo_long : bot.motivo_short,
            abertura: new Date().toISOString(),
          };
          w.positions[coin] = pos;
          w.saldo -= bot.capital_per_trade;
          current[bot.id] = w;
          addLog(`📈 ${bot.name} ${dir} ${coin.replace("USDT","")} @ ${preco.toFixed(2)} TP:${tp.toFixed(2)} SL:${sl.toFixed(2)}`);
          setSignals(prev => ({...prev, [bot.id]:{simbolo:coin,dir,scores:srd}}));
          break; // um sinal por moeda por bot
        }
        current[bot.id] = w;
      }
    }

    saveWallets(current);
    setWallets({...current});
    setLastScan(new Date());
    setScanning(false);
    scanRef.current = false;
    addLog(`✓ Scan concluído — ${new Date().toLocaleTimeString("pt-BR")}`);
  }, [activeBots, selectedCoins, addLog]);

  // Auto-scan a cada 60s quando houver bot ativo
  useEffect(() => {
    if (!activeBots.size) return;
    const iv = setInterval(runScan, 60_000);
    return () => clearInterval(iv);
  }, [activeBots, runScan]);

  const toggleBot = (id: string) => setActive(prev => {
    const n = new Set(prev);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });

  const resetBot = (id: string) => {
    if (!confirm(`Zerar o bot ${id}? Todas as operações serão perdidas.`)) return;
    const w = {...wallets}; delete w[id];
    saveWallets(w); setWallets(w);
  };

  const toggleCoin = (c: string) =>
    setCoins(prev => prev.includes(c) ? prev.filter(x=>x!==c) : [...prev,c]);

  const totalStats = (() => {
    let ops=0,wins=0,pnl=0;
    for (const w of Object.values(wallets)) {
      ops += w.trades.length;
      wins += w.trades.filter(t=>t.status==="tp").length;
      pnl  += w.trades.reduce((a,t)=>a+t.pnl_brl,0);
    }
    return { ops, winRate: ops ? wins/ops*100 : 0, pnl };
  })();

  return (
    <div className="min-h-screen" style={{background:"var(--bg)"}}>
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-5">

        {/* ── Header ── */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
          <div>
            <h1 className="text-xl font-black" style={{color:"var(--text-primary)"}}>
              BOT SRD
            </h1>
            <p className="text-xs mt-0.5" style={{color:"var(--text-muted)"}}>
              Suporte · Resistência · Volume · Direção &nbsp;—&nbsp; 20 perfis de scalp
            </p>
          </div>
          <div className="flex gap-2 items-center">
            <span className="text-[10px] px-2 py-1 rounded-lg font-bold"
              style={{background:"#8b5cf622",color:"#8b5cf6",border:"1px solid #8b5cf633"}}>
              {activeBots.size} ativos
            </span>
            {lastScan && (
              <span className="text-[10px]" style={{color:"var(--text-muted)"}}>
                Scan: {lastScan.toLocaleTimeString("pt-BR")}
              </span>
            )}
            <button onClick={runScan} disabled={scanning}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all disabled:opacity-50"
              style={{background:scanning?"var(--bg-card)":"#3b82f6",color:"white"}}>
              {scanning ? <><Activity size={12}/> Escaneando...</> : <><Zap size={12}/> Escanear</>}
            </button>
          </div>
        </div>

        {/* ── Totais ── */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label:"Total Ops",  val:`${totalStats.ops}`,            color:"var(--text-primary)" },
            { label:"Win Rate",   val:totalStats.ops?`${totalStats.winRate.toFixed(1)}%`:"—",
              color:totalStats.winRate>=55?"#10b981":totalStats.winRate>=45?"#f59e0b":"#ef4444" },
            { label:"P&L Total",  val:totalStats.ops?fBRL(totalStats.pnl):"—",
              color:totalStats.pnl>=0?"#10b981":"#ef4444" },
          ].map(s=>(
            <div key={s.label} className="rounded-xl px-4 py-3 text-center"
              style={{background:"var(--bg-card)",border:"1px solid var(--border)"}}>
              <p className="text-[10px] uppercase font-bold" style={{color:"var(--text-muted)"}}>{s.label}</p>
              <p className="text-lg font-black tabular-nums" style={{color:s.color}}>{s.val}</p>
            </div>
          ))}
        </div>

        {/* ── Seletor de moedas ── */}
        <div className="flex flex-wrap gap-1.5 items-center">
          <span className="text-[10px] font-bold uppercase" style={{color:"var(--text-muted)"}}>
            Moedas para scan:
          </span>
          {COINS.map(c => {
            const on = selectedCoins.includes(c);
            return (
              <button key={c} onClick={()=>toggleCoin(c)}
                className="px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all"
                style={{
                  background: on?"#f59e0b22":"var(--bg-card)",
                  border:`1px solid ${on?"#f59e0b55":"var(--border)"}`,
                  color: on?"#f59e0b":"var(--text-muted)",
                }}>
                {c.replace("USDT","")}
              </button>
            );
          })}
        </div>

        {/* ── Grid de bots ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {SRD_BOTS.map(bot => (
            <BotCard
              key={bot.id} bot={bot}
              wallet={wallets[bot.id] ?? null}
              active={activeBots.has(bot.id)}
              onToggle={() => toggleBot(bot.id)}
              onReset={() => resetBot(bot.id)}
              lastSignal={lastSignals[bot.id] ?? null}
            />
          ))}
        </div>

        {/* ── Log ── */}
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
