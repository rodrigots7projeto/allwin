"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import {
  Brain, TrendingUp, TrendingDown, CheckCircle, XCircle,
  RefreshCw, Send, Settings, History, Lightbulb,
  MessageCircle, ChevronDown, ChevronUp, Clock,
  BarChart2, ArrowUpRight, ArrowDownRight,
  Wifi, WifiOff, Trophy, AlertCircle, Target,
  Copy, ExternalLink, Bot, Search, User, Users,
  CheckCheck, Loader2,
} from "lucide-react";
import { IAEngineHubNav } from "@/components/IAEngineHubNav";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

const CEREBRO_KEY   = "allwin_cerebro_v1";
const CEREBRO_LEARN = "allwin_cerebro_learn_v1";
const TG_CONFIG_KEY = "allwin_tg_config_v1";

type Direction   = "LONG" | "SHORT";
type SignalStatus = "aprovado" | "tp" | "sl" | "expirado";
type SourceType  = "futures" | "scalp" | "bot" | "srd_bot" | "daytrade" | "sinais_ia";
type TabKey      = "indica" | "historico" | "aprendizado" | "config";
type StatFilter  = "all" | "open" | "tp" | "sl";

interface CerebroSignal {
  id: string;
  simbolo: string;
  direction: Direction;
  source: SourceType;
  source_perfil: string;
  score_final: number;
  price_entrada: number;
  tp_pct: number;
  sl_pct: number;
  confianca: number;
  aprovado: boolean;
  motivo: string;
  breakdown?: Record<string, number>;
  status: SignalStatus;
  pnl_pct?: number;
  telegram_entry: boolean;
  telegram_exit: boolean;
  registrado_em: string;
  fechado_em?: string;
}

interface CerebroLearning {
  bySymbol: Record<string, { w: number; l: number }>;
  bySource: Record<string, { w: number; l: number }>;
  byDirection: Record<Direction, { w: number; l: number }>;
  byScoreRange: Record<string, { w: number; l: number }>;
  byHour: Record<string, { w: number; l: number }>;
  totalApproved: number;
  totalTrades: number;
  threshold: number;
  lastUpdate: string;
}

interface TelegramConfig {
  botToken: string; chatId: string; enabled: boolean;
  notifyEntry: boolean;   // alertas de entrada aprovada
  notifyExit: boolean;    // alertas de resultado (TP/SL)
  reportHourly: boolean;  // relatório de hora em hora
  reportDaily: boolean;   // relatório diário (08:00)
}
interface IncomingSignal {
  id: string; simbolo: string; direction: Direction; source: SourceType;
  source_perfil: string; score_final: number; price_entrada: number;
  tp_pct: number; sl_pct: number;
}

const SOURCE_LABELS: Record<SourceType, string> = {
  futures: "Futures Bot", scalp: "Scalp Bot", bot: "Bot Grego",
  srd_bot: "BOT SRD", daytrade: "Day Trade", sinais_ia: "Sinais IA",
};
const SOURCE_COLORS: Record<SourceType, string> = {
  futures: "#f59e0b", scalp: "#22d3ee", bot: "#a855f7",
  srd_bot: "#10b981", daytrade: "#3b82f6", sinais_ia: "#8b5cf6",
};
const DEFAULT_LEARNING: CerebroLearning = {
  bySymbol: {}, bySource: {}, byDirection: { LONG:{w:0,l:0}, SHORT:{w:0,l:0} },
  byScoreRange: { "40-50":{w:0,l:0},"50-60":{w:0,l:0},"60-70":{w:0,l:0},"70+":{w:0,l:0} },
  byHour: {}, totalApproved: 0, totalTrades: 0, threshold: 60, lastUpdate: "",
};

function wr(d?: { w: number; l: number }): number | null {
  if (!d || d.w + d.l === 0) return null;
  return (d.w / (d.w + d.l)) * 100;
}
function scoreRange(s: number) {
  return s >= 70 ? "70+" : s >= 60 ? "60-70" : s >= 50 ? "50-60" : "40-50";
}
function fPct(v?: number, fb = "—") {
  if (v == null) return fb;
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}
function fTime(iso: string) {
  try { return new Date(iso).toLocaleString("pt-BR", { day:"2-digit", month:"2-digit", hour:"2-digit", minute:"2-digit" }); }
  catch { return "—"; }
}
function elapsed(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 60) return `${m}min`;
  return `${Math.floor(m/60)}h${m%60 > 0 ? `${m%60}m` : ""}`;
}
function brainScore(c: number): { color: string; label: string; emoji: string; bg: string; border: string } {
  if (c >= 85) return { color: "#fbbf24", label: "PREMIUM",      emoji: "🏆", bg: "rgba(251,191,36,0.12)",  border: "rgba(251,191,36,0.35)"  };
  if (c >= 70) return { color: "#60a5fa", label: "FORTE",        emoji: "🚀", bg: "rgba(96,165,250,0.12)",  border: "rgba(96,165,250,0.35)"  };
  if (c >= 55) return { color: "#10b981", label: "MODERADA",     emoji: "📊", bg: "rgba(16,185,129,0.12)",  border: "rgba(16,185,129,0.35)"  };
  return        { color: "#a855f7", label: "EXPERIMENTAL", emoji: "🧪", bg: "rgba(168,85,247,0.12)", border: "rgba(168,85,247,0.35)" };
}
function confColor(c: number) { return brainScore(c).color; }
function confLabel(c: number) { return brainScore(c).label; }

function calcConfianca(sig: IncomingSignal, learn: CerebroLearning, all: IncomingSignal[]) {
  let score = 50;
  const bd: Record<string, number> = {};
  const add = (k: string, v: number) => { score += v; bd[k] = v; };

  add("Força do sinal",    Math.max(0, Math.min(25, (sig.score_final - 40) * 0.6)));
  const sw = wr(learn.bySymbol[sig.simbolo]);
  if (sw != null) add("WR moeda",       (sw - 50) * 0.4);
  const srcw = wr(learn.bySource[sig.source]);
  if (srcw != null) add("WR fonte",     (srcw - 50) * 0.3);
  const rw = wr(learn.byScoreRange[scoreRange(sig.score_final)]);
  if (rw != null) add("WR faixa score", (rw - 50) * 0.2);
  const confirms = all.filter(s => s.simbolo === sig.simbolo && s.direction === sig.direction && s.id !== sig.id).length;
  add("Multi-bot conf.",  Math.min(15, confirms * 7));
  const dw = wr(learn.byDirection[sig.direction]);
  if (dw != null) add("WR direção",     (dw - 50) * 0.1);
  const rr = sig.tp_pct / sig.sl_pct;
  add("R:R ratio",        rr >= 2.5 ? 5 : rr >= 2 ? 3 : rr >= 1.5 ? 1 : -3);

  const confianca = Math.max(0, Math.min(100, Math.round(score)));
  const aprovado  = confianca >= learn.threshold;
  const sorted    = Object.entries(bd).sort((a, b) => b[1] - a[1]);
  const motivo    = aprovado
    ? `${sorted[0]?.[0] ?? "multi-fator"} foi decisivo`
    : `${learn.threshold - confianca}pts abaixo do threshold`;
  return { confianca, motivo, aprovado, breakdown: bd };
}

function aggregateAllSignals(): IncomingSignal[] {
  const sigs: IncomingSignal[] = [];
  const cutoff = Date.now() - 2 * 60 * 60 * 1000;
  try {
    const fw: Record<string, any> = JSON.parse(localStorage.getItem("allwin_futures_wallets_v1") ?? "{}");
    for (const [pid, w] of Object.entries(fw)) {
      const src: SourceType = pid.startsWith("f_scalp") ? "scalp" : "futures";
      for (const t of (w.trades ?? []) as any[]) {
        if (t.tipo !== "C" || (t.time ?? 0) < cutoff) continue;
        sigs.push({ id: t.id, simbolo: t.simbolo, direction: t.direction ?? "LONG", source: src, source_perfil: pid, score_final: t.score ?? 50, price_entrada: t.price_brl ?? 0, tp_pct: 0.03, sl_pct: 0.012 });
      }
    }
  } catch {}
  try {
    const bw: Record<string, any> = JSON.parse(localStorage.getItem("allwin_bot_wallets_v1") ?? "{}");
    for (const [bid, w] of Object.entries(bw)) {
      for (const t of (w.trades ?? []) as any[]) {
        if (t.tipo !== "C" || (t.time ?? 0) < cutoff) continue;
        sigs.push({ id: t.id, simbolo: t.simbolo, direction: t.direction ?? "LONG", source: "bot", source_perfil: bid, score_final: t.score ?? 50, price_entrada: t.price_brl ?? 0, tp_pct: 0.025, sl_pct: 0.010 });
      }
    }
  } catch {}
  try {
    const sw: Record<string, any> = JSON.parse(localStorage.getItem("allwin_srd_wallets_v1") ?? "{}");
    for (const [, w] of Object.entries(sw)) {
      for (const t of (w.trades ?? []) as any[]) {
        if (t.status !== "aberto") continue;
        const ts = t.registrado_em ? new Date(t.registrado_em).getTime() : 0;
        if (ts < cutoff) continue;
        sigs.push({ id: t.id, simbolo: t.simbolo, direction: t.direction ?? "LONG", source: "srd_bot", source_perfil: w.botId ?? "srd", score_final: t.score ?? 50, price_entrada: t.preco_entrada ?? 0, tp_pct: t.tp_pct ?? 0.03, sl_pct: t.sl_pct ?? 0.015 });
      }
    }
  } catch {}
  try {
    const dw: Record<string, any> = JSON.parse(localStorage.getItem("allwin_dt_wallets_v2") ?? "{}");
    for (const [pid, w] of Object.entries(dw)) {
      for (const t of (w.trades ?? []) as any[]) {
        if (t.tipo !== "C" || (t.time ?? 0) < cutoff) continue;
        sigs.push({ id: t.id, simbolo: t.simbolo, direction: t.direction ?? "LONG", source: "daytrade", source_perfil: pid, score_final: t.score ?? 50, price_entrada: t.price_brl ?? 0, tp_pct: 0.02, sl_pct: 0.008 });
      }
    }
  } catch {}
  return sigs;
}

function applyLearning(learn: CerebroLearning, sig: CerebroSignal): CerebroLearning {
  const isWin = sig.status === "tp";
  const upd = (d: { w: number; l: number }) => isWin ? { w: d.w+1, l: d.l } : { w: d.w, l: d.l+1 };
  const bySymbol    = { ...learn.bySymbol,    [sig.simbolo]:               upd(learn.bySymbol[sig.simbolo]   ?? {w:0,l:0}) };
  const bySource    = { ...learn.bySource,    [sig.source]:                upd(learn.bySource[sig.source]    ?? {w:0,l:0}) };
  const byDirection = { ...learn.byDirection, [sig.direction]:             upd(learn.byDirection[sig.direction]) };
  const range       = scoreRange(sig.score_final);
  const byScoreRange= { ...learn.byScoreRange,[range]:                     upd(learn.byScoreRange[range]     ?? {w:0,l:0}) };
  const hour        = new Date(sig.registrado_em).getHours().toString();
  const byHour      = { ...learn.byHour,      [hour]:                      upd(learn.byHour[hour]            ?? {w:0,l:0}) };
  const totalTrades = learn.totalTrades + 1;
  let threshold     = learn.threshold;
  if (totalTrades >= 20 && totalTrades % 10 === 0) {
    const globalWr = wr(byDirection.LONG) ?? 50;
    if (globalWr < 45 && threshold < 75) threshold = Math.min(75, threshold + 2);
    if (globalWr > 62 && threshold > 50) threshold = Math.max(50, threshold - 1);
  }
  return { bySymbol, bySource, byDirection, byScoreRange, byHour, totalApproved: learn.totalApproved + (sig.aprovado?1:0), totalTrades, threshold, lastUpdate: new Date().toISOString() };
}

// POST com JSON dispara CORS preflight — browser bloqueia chamada direta ao Telegram.
// Usa backend proxy (servidor→Telegram, sem CORS). Fallback direto se backend offline.
async function sendTelegram(cfg: TelegramConfig, text: string, force = false): Promise<boolean> {
  if (!force && !cfg.enabled) return false;
  if (!cfg.botToken || !cfg.chatId) return false;
  try {
    const r = await fetch(`${API}/cerebro/telegram`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bot_token: cfg.botToken, chat_id: cfg.chatId, text }),
    });
    if (r.ok) return true;
  } catch {}
  // Fallback direto ao Telegram (pode falhar por CORS em alguns browsers)
  try {
    const r = await fetch(`https://api.telegram.org/bot${cfg.botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: cfg.chatId, text, parse_mode: "HTML" }),
    });
    const data = await r.json();
    return data.ok === true;
  } catch { return false; }
}

// Versão detalhada para o botão Testar — retorna null=sucesso ou mensagem de erro real
async function testTgFull(cfg: TelegramConfig, text: string): Promise<string | null> {
  if (!cfg.botToken || !cfg.chatId) return "Token ou Chat ID vazio";
  try {
    const r = await fetch(`${API}/cerebro/telegram`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bot_token: cfg.botToken, chat_id: cfg.chatId, text }),
    });
    if (r.ok) return null;
    const d = await r.json().catch(() => ({}));
    return d.detail ?? `Backend retornou HTTP ${r.status}`;
  } catch {}
  // Backend offline — tenta direto
  try {
    const r = await fetch(`https://api.telegram.org/bot${cfg.botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: cfg.chatId, text, parse_mode: "HTML" }),
    });
    const d = await r.json().catch(() => ({ ok: false, description: "Resposta inválida" }));
    if (d.ok) return null;
    return `Telegram: ${d.description ?? "token ou chat inválido"}`;
  } catch {
    return "Backend offline e CORS bloqueou a chamada direta — verifique o Railway";
  }
}
function buildEntryMsg(s: CerebroSignal) {
  const dir = s.direction === "LONG" ? "📈 LONG" : "📉 SHORT";
  const ce = calcCerebroEntry(s.confianca);
  const f = (v: number) => (v * 100).toFixed(1);
  return `🧠 <b>CEREBRO INDICA</b>\n\n${dir} <b>${s.simbolo.replace("USDT","")}</b>\n\nConfiança: <b>${s.confianca.toFixed(0)}%</b> · Score: ${s.score_final.toFixed(0)}\nFonte: ${SOURCE_LABELS[s.source]}\n\n<b>📊 Entrada rápida CEREBRO:</b>\n<code>` +
    `SPOT  TP+${f(ce.tp)}%  SL-${f(ce.sl)}%  R:R ${ce.rr.toFixed(1)}\n` +
    `2×    TP+${f(ce.tp*2)}%  SL-${f(ce.sl*2)}%  R:R ${ce.rr.toFixed(1)}\n` +
    `5×    TP+${f(ce.tp*5)}%  SL-${f(ce.sl*5)}%  R:R ${ce.rr.toFixed(1)}` +
    `</code>\n\n<i>${s.motivo}</i>`;
}
function buildExitMsg(s: CerebroSignal) {
  const ok = s.status === "tp";
  return `${ok?"✅":"❌"} <b>CEREBRO — ${ok?"GREEN":"RED"}</b>\n\n${s.direction} <b>${s.simbolo.replace("USDT","")}</b>\n\nResultado: <b>${fPct(s.pnl_pct)}</b>\nConfiança inicial: ${s.confianca.toFixed(0)}%\n\n<i>Aprendizado atualizado.</i>`;
}

// ── Entrada rápida do CEREBRO — TP/SL dinâmicos por confiança ───────────────
// Sempre mais rápido que os bots (TP 1-2.5%, SL 0.5-1%), R:R ≥ 2.0
function calcCerebroEntry(confianca: number): { tp: number; sl: number; rr: number } {
  if (confianca >= 85) return { tp: 0.025, sl: 0.010, rr: 2.5 };
  if (confianca >= 75) return { tp: 0.020, sl: 0.009, rr: 2.2 };
  if (confianca >= 65) return { tp: 0.015, sl: 0.007, rr: 2.1 };
  return                      { tp: 0.010, sl: 0.005, rr: 2.0 };
}

// ── Mini progress bar ─────────────────────────────────────────────────────────
function MiniBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

// ── Chip clicável de filtro ───────────────────────────────────────────────────
function Chip({ label, active, color, onClick }: { label: string; active: boolean; color?: string; onClick: () => void }) {
  const c = color ?? "#818cf8";
  return (
    <button
      onClick={onClick}
      className="text-[11px] font-semibold px-2.5 py-1 rounded-full transition-all active:scale-95"
      style={{
        background: active ? `${c}22` : "rgba(255,255,255,0.04)",
        border: `1px solid ${active ? c : "rgba(255,255,255,0.08)"}`,
        color: active ? c : "var(--text-muted)",
      }}
    >
      {label}
    </button>
  );
}

// ── Card de sinal ─────────────────────────────────────────────────────────────
function SignalCard({
  sig, onClose, defaultExpanded = false,
}: { sig: CerebroSignal; onClose?: (id: string, status: "tp"|"sl") => void; defaultExpanded?: boolean }) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [confirming, setConfirming] = useState<"tp"|"sl"|null>(null);
  const isOpen = sig.status === "aprovado";
  const isLong = sig.direction === "LONG";
  const bs      = brainScore(sig.confianca);
  const cc      = bs.color;
  const rr      = (sig.tp_pct / sig.sl_pct).toFixed(1);
  const ce      = calcCerebroEntry(sig.confianca);
  const bd      = sig.breakdown ?? {};
  const bdMax   = Math.max(25, ...Object.values(bd).map(Math.abs));

  const handleClose = (status: "tp"|"sl") => {
    if (confirming === status) { onClose?.(sig.id, status); setConfirming(null); }
    else { setConfirming(status); setTimeout(() => setConfirming(null), 3000); }
  };

  return (
    <div
      className="rounded-2xl overflow-hidden transition-all duration-200"
      style={{
        background: "var(--bg-card)",
        border: `1px solid ${isOpen ? (isLong ? "rgba(16,185,129,0.3)" : "rgba(239,68,68,0.3)") : "var(--border)"}`,
        boxShadow: isOpen ? `0 0 0 1px ${isLong ? "rgba(16,185,129,0.06)" : "rgba(239,68,68,0.06)"} inset` : undefined,
      }}
    >
      {/* ── Tap-area principal ─────────────────────────────────────────────── */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full text-left px-4 pt-3.5 pb-3 flex gap-3 items-start active:opacity-80 transition-opacity cursor-pointer"
      >
        {/* Brain Score circle */}
        <div
          className="flex flex-col items-center justify-center rounded-2xl shrink-0"
          style={{ width: 60, height: 60, background: bs.bg, border: `2px solid ${bs.border}`, boxShadow: `0 0 12px ${cc}25` }}
        >
          <span className="text-[8px] leading-none mb-0.5">{bs.emoji}</span>
          <span className="text-[16px] font-black leading-none" style={{ color: cc }}>{sig.confianca.toFixed(0)}</span>
          <span className="text-[7px] font-black tracking-wider mt-0.5" style={{ color: cc }}>{bs.label}</span>
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-[11px] font-black px-2 py-0.5 rounded-full ${isLong ? "text-emerald-400 bg-emerald-400/10" : "text-red-400 bg-red-400/10"}`}>
              {isLong ? "▲" : "▼"} {sig.direction}
            </span>
            <span className="font-black text-base" style={{ color: "var(--text)" }}>{sig.simbolo.replace("USDT","")}</span>
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md" style={{ background: `${SOURCE_COLORS[sig.source]}15`, color: SOURCE_COLORS[sig.source] }}>
              {SOURCE_LABELS[sig.source]}
            </span>
          </div>
          <div className="flex items-center gap-2 text-[10px]" style={{ color: "var(--text-muted)" }}>
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md shrink-0" style={{ background: bs.bg, color: cc, border: `1px solid ${bs.border}` }}>
              {bs.emoji} {bs.label}
            </span>
            <span>TP <b style={{ color:"#10b981" }}>+{(ce.tp*100).toFixed(1)}%</b></span>
            <span>SL <b style={{ color:"#ef4444" }}>-{(ce.sl*100).toFixed(1)}%</b></span>
            <span>R:R <b style={{ color:"#84cc16" }}>{ce.rr.toFixed(1)}</b></span>
            <span className="text-[9px] font-bold shrink-0" style={{ color:"#fbbf24" }}>2× 5×</span>
          </div>
          <div className="flex items-center gap-2 mt-1">
            {isOpen
              ? <span className="text-[9px] flex items-center gap-1 font-medium" style={{ color:"#f59e0b" }}><Clock size={8}/>{elapsed(sig.registrado_em)} aberto</span>
              : sig.status === "tp"
                ? <span className="text-[9px] font-bold px-2 py-0.5 rounded-full" style={{ background:"rgba(16,185,129,0.12)",color:"#10b981" }}>✅ TP {fPct(sig.pnl_pct)}</span>
                : sig.status === "sl"
                  ? <span className="text-[9px] font-bold px-2 py-0.5 rounded-full" style={{ background:"rgba(239,68,68,0.12)",color:"#ef4444" }}>❌ SL {fPct(sig.pnl_pct)}</span>
                  : <span className="text-[9px] font-bold px-2 py-0.5 rounded-full" style={{ background:"rgba(107,114,128,0.12)",color:"#6b7280" }}>⏱ Expirado</span>
            }
            {sig.telegram_entry && <span className="text-[9px]" style={{ color:"#3b82f6" }}>📨 Telegram</span>}
            <span className="ml-auto" style={{ color:"var(--text-muted)" }}>{expanded ? <ChevronUp size={13}/> : <ChevronDown size={13}/>}</span>
          </div>
        </div>
      </button>

      {/* ── Expanded: breakdown + TP/SL ────────────────────────────────────── */}
      {expanded && (
        <div className="border-t px-4 pb-4 pt-3 flex flex-col gap-3" style={{ borderColor:"var(--border)" }}>
          {/* ── Tabela entrada rápida CEREBRO ────────────────────────── */}
          <div className="rounded-2xl overflow-hidden" style={{ border:"1px solid rgba(99,102,241,0.25)" }}>
            <div className="px-3 py-2 flex items-center gap-2" style={{ background:"rgba(99,102,241,0.1)" }}>
              <Target size={11} style={{ color:"#818cf8" }} />
              <span className="text-[11px] font-bold" style={{ color:"#818cf8" }}>Entrada rápida CEREBRO</span>
              <span className="ml-auto text-[9px]" style={{ color:"var(--text-muted)" }}>R:R mín 2.0 · todos os níveis</span>
            </div>
            <div className="grid" style={{ gridTemplateColumns:"3rem 1fr 1fr 1fr" }}>
              {/* Header */}
              {["", "SPOT", "2×", "5×"].map((h, i) => (
                <div key={i} className="text-center text-[10px] font-bold py-1.5 px-1"
                  style={{ color: i===0?"var(--text-muted)": i===1?"var(--text)": i===2?"#f59e0b":"#ef4444", background: i>1 ? "rgba(251,191,36,0.05)" : "transparent", borderBottom:"1px solid var(--border)" }}>
                  {h}
                </div>
              ))}
              {/* TP row */}
              {["TP", ce.tp, ce.tp*2, ce.tp*5].map((v, i) => (
                <div key={i} className="text-center text-[11px] font-bold py-2 px-1 tabular-nums"
                  style={{ color: i===0?"var(--text-muted)":"#10b981", background: i>1 ? "rgba(251,191,36,0.03)" : "transparent", borderBottom:"1px solid var(--border)" }}>
                  {i===0 ? "TP" : `+${((v as number)*100).toFixed(1)}%`}
                </div>
              ))}
              {/* SL row */}
              {["SL", ce.sl, ce.sl*2, ce.sl*5].map((v, i) => (
                <div key={i} className="text-center text-[11px] font-bold py-2 px-1 tabular-nums"
                  style={{ color: i===0?"var(--text-muted)":"#ef4444", background: i>1 ? "rgba(251,191,36,0.03)" : "transparent", borderBottom:"1px solid var(--border)" }}>
                  {i===0 ? "SL" : `-${((v as number)*100).toFixed(1)}%`}
                </div>
              ))}
              {/* R:R row */}
              {["R:R", ce.rr, ce.rr, ce.rr].map((v, i) => (
                <div key={i} className="text-center text-[11px] font-bold py-2 px-1 tabular-nums"
                  style={{ color: i===0?"var(--text-muted)":"#84cc16", background: i>1 ? "rgba(251,191,36,0.03)" : "transparent" }}>
                  {i===0 ? "R:R" : `${(v as number).toFixed(1)}x`}
                </div>
              ))}
            </div>
          </div>

          {/* Motivo */}
          <p className="text-[11px] rounded-xl px-3 py-2" style={{ background:"rgba(99,102,241,0.07)", color:"var(--text-muted)", border:"1px solid rgba(99,102,241,0.15)" }}>
            🧠 {sig.motivo}
          </p>

          {/* Breakdown dos fatores */}
          {Object.keys(bd).length > 0 && (
            <div className="flex flex-col gap-1.5">
              <span className="text-[10px] font-semibold tracking-wider uppercase" style={{ color:"var(--text-muted)" }}>Fatores de confiança</span>
              {Object.entries(bd).sort((a,b)=>b[1]-a[1]).map(([k,v]) => (
                <div key={k} className="flex items-center gap-2">
                  <span className="text-[10px] w-32 shrink-0" style={{ color:"var(--text-muted)" }}>{k}</span>
                  <MiniBar value={Math.abs(v)} max={bdMax} color={v >= 0 ? "#10b981" : "#ef4444"} />
                  <span className="text-[10px] tabular-nums w-10 text-right font-semibold" style={{ color: v >= 0 ? "#10b981" : "#ef4444" }}>
                    {v >= 0 ? "+" : ""}{v.toFixed(1)}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Detalhes extras */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { l:"Entrada", v: sig.price_entrada > 0 ? `R$${sig.price_entrada.toFixed(2)}` : "—", c:"var(--text)" },
              { l:"Data",    v: fTime(sig.registrado_em).split(" ")[0],                             c:"var(--text-muted)" },
              { l:"Hora",    v: fTime(sig.registrado_em).split(" ")[1],                             c:"var(--text-muted)" },
            ].map(x => (
              <div key={x.l} className="rounded-xl px-2 py-2 text-center" style={{ background:"rgba(255,255,255,0.03)", border:"1px solid var(--border)" }}>
                <div className="text-[9px] mb-0.5" style={{ color:"var(--text-muted)" }}>{x.l}</div>
                <div className="text-[11px] font-bold" style={{ color:x.c }}>{x.v}</div>
              </div>
            ))}
          </div>

          {/* Botões TP/SL */}
          {isOpen && onClose && (
            <div className="flex gap-2 mt-1">
              <button
                onClick={() => handleClose("tp")}
                className="flex-1 flex flex-col items-center justify-center py-3 rounded-2xl font-bold text-[13px] transition-all active:scale-95"
                style={{
                  background: confirming === "tp" ? "rgba(16,185,129,0.35)" : "rgba(16,185,129,0.12)",
                  border: `2px solid ${confirming === "tp" ? "#10b981" : "rgba(16,185,129,0.3)"}`,
                  color: "#10b981",
                }}
              >
                <CheckCircle size={18} className="mb-1" />
                {confirming === "tp" ? "CONFIRMAR TP ✓" : "GREEN TP"}
              </button>
              <button
                onClick={() => handleClose("sl")}
                className="flex-1 flex flex-col items-center justify-center py-3 rounded-2xl font-bold text-[13px] transition-all active:scale-95"
                style={{
                  background: confirming === "sl" ? "rgba(239,68,68,0.35)" : "rgba(239,68,68,0.12)",
                  border: `2px solid ${confirming === "sl" ? "#ef4444" : "rgba(239,68,68,0.3)"}`,
                  color: "#ef4444",
                }}
              >
                <XCircle size={18} className="mb-1" />
                {confirming === "sl" ? "CONFIRMAR SL ✗" : "RED SL"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Stat card clicável ────────────────────────────────────────────────────────
function StatCard({ label, value, color, active, onClick }: { label: string; value: string|number; color: string; active?: boolean; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className="rounded-2xl px-3 py-2.5 text-center flex flex-col items-center transition-all active:scale-95"
      style={{
        background: active ? `${color}18` : "var(--bg-card)",
        border: `1.5px solid ${active ? color : "var(--border)"}`,
        cursor: onClick ? "pointer" : "default",
        flex: 1,
      }}
    >
      <span className="text-[9px] mb-0.5 font-medium" style={{ color:"var(--text-muted)" }}>{label}</span>
      <span className="text-[16px] font-black leading-none" style={{ color }}>{value}</span>
    </button>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────
export default function CerebroPage() {
  const [tab, setTab]           = useState<TabKey>("indica");
  const [signals, setSignals]   = useState<CerebroSignal[]>([]);
  const [learning, setLearning] = useState<CerebroLearning>(DEFAULT_LEARNING);
  const [tgConfig, setTgConfig] = useState<TelegramConfig>({ botToken:"", chatId:"", enabled:false, notifyEntry:true, notifyExit:true, reportHourly:false, reportDaily:false });
  const [scanning, setScanning] = useState(false);
  const [lastScan, setLastScan] = useState<Date|null>(null);
  const [tgStatus, setTgStatus] = useState<string|null>(null);
  const [statFilter, setStatFilter] = useState<StatFilter>("all");
  const [srcFilter, setSrcFilter]   = useState<SourceType|null>(null);
  const [dirFilter, setDirFilter]   = useState<Direction|null>(null);
  const [resFilter, setResFilter]   = useState<"tp"|"sl"|null>(null);
  const [thresholdDraft, setThresholdDraft] = useState<number>(60);
  const [loadingChatId, setLoadingChatId]   = useState(false);
  const [foundChats, setFoundChats]         = useState<{ id: string; name: string; type: string }[]>([]);
  const [chatIdStatus, setChatIdStatus]     = useState<string | null>(null);
  const [guideStep, setGuideStep]           = useState<number>(0);
  const [copied, setCopied]                 = useState<string | null>(null);
  const processedIds = useRef<Set<string>>(new Set());

  const copyText = (text: string, key: string) => {
    navigator.clipboard.writeText(text).then(() => { setCopied(key); setTimeout(() => setCopied(null), 2000); });
  };

  const fetchUpdates = useCallback(async () => {
    if (!tgConfig.botToken) { setChatIdStatus("⚠️ Cole o Bot Token primeiro"); return; }
    setLoadingChatId(true); setFoundChats([]); setChatIdStatus(null);
    try {
      const r = await fetch(`https://api.telegram.org/bot${tgConfig.botToken}/getUpdates?limit=50&offset=-50`);
      const data = await r.json();
      if (!data.ok) { setChatIdStatus(`❌ Token inválido: ${data.description}`); return; }
      const seen = new Set<string>();
      const chats: { id: string; name: string; type: string }[] = [];
      for (const u of data.result ?? []) {
        const chat = u.message?.chat ?? u.channel_post?.chat;
        if (!chat) continue;
        const key = String(chat.id);
        if (seen.has(key)) continue;
        seen.add(key);
        const name = chat.title ?? (`${chat.first_name ?? ""} ${chat.last_name ?? ""}`.trim() || "Você");
        chats.push({ id: key, name, type: chat.type });
      }
      if (chats.length === 0) { setChatIdStatus("⚠️ Nenhuma mensagem encontrada. Envie uma msg pro bot primeiro!"); }
      else setFoundChats(chats);
    } catch { setChatIdStatus("❌ Erro de rede. Tente novamente."); }
    finally { setLoadingChatId(false); }
  }, [tgConfig.botToken]);

  // ── Persistência ───────────────────────────────────────────────────────────
  useEffect(() => {
    try { const s: CerebroSignal[] = JSON.parse(localStorage.getItem(CEREBRO_KEY) ?? "[]"); setSignals(s); s.forEach(x => processedIds.current.add(x.id)); } catch {}
    try { const l: CerebroLearning = JSON.parse(localStorage.getItem(CEREBRO_LEARN) ?? "null") ?? DEFAULT_LEARNING; setLearning(l); setThresholdDraft(l.threshold); } catch {}
    try { const raw = JSON.parse(localStorage.getItem(TG_CONFIG_KEY) ?? "null") ?? {}; const t: TelegramConfig = { botToken:"", chatId:"", enabled:false, notifyEntry:true, notifyExit:true, reportHourly:false, reportDaily:false, ...raw }; if (t.botToken && t.chatId) t.enabled = true; setTgConfig(t); } catch {}
  }, []);

  const saveSignals  = useCallback((s: CerebroSignal[]) => { setSignals(s); try { localStorage.setItem(CEREBRO_KEY, JSON.stringify(s.slice(0,1000))); } catch {} }, []);
  const saveLearning = useCallback((l: CerebroLearning) => { setLearning(l); try { localStorage.setItem(CEREBRO_LEARN, JSON.stringify(l)); } catch {} }, []);
  const saveTg       = useCallback((t: TelegramConfig) => { setTgConfig(t); try { localStorage.setItem(TG_CONFIG_KEY, JSON.stringify(t)); } catch {} }, []);

  // ── Fechar posição ─────────────────────────────────────────────────────────
  const closeSignal = useCallback(async (id: string, status: "tp"|"sl") => {
    const fechado_em = new Date().toISOString();
    const updated = signals.map(s => s.id === id ? { ...s, status, fechado_em } : s);
    saveSignals(updated);
    const sig = updated.find(s => s.id === id);
    if (!sig) return;
    saveLearning(applyLearning(learning, { ...sig, status }));
    try {
      await fetch(`${API}/cerebro/signal/${id}`, { method:"PATCH", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ status, pnl_pct: null, fechado_em, telegram_exit: tgConfig.enabled }) });
    } catch {}
    if (tgConfig.enabled && tgConfig.notifyExit) await sendTelegram(tgConfig, buildExitMsg({ ...sig, status }));
  }, [signals, learning, tgConfig, saveSignals, saveLearning]);

  // ── Auto-detecta posições fechadas pelo bot ────────────────────────────────
  const detectClosedPositions = useCallback((openSigs: CerebroSignal[]) => {
    if (openSigs.length === 0) return [];
    const now = Date.now();
    const EXPIRE_MS = 4 * 60 * 60 * 1000; // 4h sem fechar → expirado

    let fw: Record<string, any> = {}, bw: Record<string, any> = {}, sw: Record<string, any> = {}, dw: Record<string, any> = {};
    try { fw = JSON.parse(localStorage.getItem("allwin_futures_wallets_v1") ?? "{}"); } catch {}
    try { bw = JSON.parse(localStorage.getItem("allwin_bot_wallets_v1") ?? "{}"); } catch {}
    try { sw = JSON.parse(localStorage.getItem("allwin_srd_wallets_v1") ?? "{}"); } catch {}
    try { dw = JSON.parse(localStorage.getItem("allwin_dt_wallets_v2") ?? "{}"); } catch {}

    const updates: { id: string; status: "tp"|"sl"|"expirado"; pnl_pct?: number; fechado_em: string }[] = [];

    for (const sig of openSigs) {
      const sigTime = new Date(sig.registrado_em).getTime();

      // Auto-expire após 4h
      if (now - sigTime > EXPIRE_MS) {
        updates.push({ id: sig.id, status: "expirado", fechado_em: new Date().toISOString() });
        continue;
      }

      // SRD Bot: o próprio trade muda de status
      if (sig.source === "srd_bot") {
        for (const [, w] of Object.entries(sw)) {
          const t = (w as any).trades?.find((x: any) => x.id === sig.id);
          if (t && t.status !== "aberto") {
            const pnl = t.pnl_pct ?? t.pnl ?? null;
            updates.push({ id: sig.id, status: pnl != null ? (pnl >= 0 ? "tp" : "sl") : "expirado", pnl_pct: pnl, fechado_em: t.fechado_em ?? new Date().toISOString() });
          }
        }
        continue;
      }

      // Futures / Scalp / Bot / Daytrade: verificar positions + trade de saída "V"
      const wallet = sig.source === "futures" || sig.source === "scalp" ? fw[sig.source_perfil]
        : sig.source === "bot" ? bw[sig.source_perfil]
        : sig.source === "daytrade" ? dw[sig.source_perfil]
        : null;
      if (!wallet) continue;

      // Se a posição ainda está aberta no wallet, ignorar
      if (wallet.positions?.[sig.simbolo]) continue;

      // Posição fechada — buscar trade de saída
      const exitTrade = (wallet.trades ?? []).find((t: any) =>
        t.simbolo === sig.simbolo && (t.tipo === "V" || t.tipo === "F") && (t.time ?? 0) > sigTime
      );
      if (!exitTrade) continue;

      const pnl = exitTrade.pnl_pct ?? exitTrade.pnl ?? null;
      updates.push({
        id: sig.id,
        status: pnl != null ? (pnl >= 0 ? "tp" : "sl") : "expirado",
        pnl_pct: pnl,
        fechado_em: new Date(exitTrade.time ?? Date.now()).toISOString(),
      });
    }
    return updates;
  }, []);

  // ── Scan ───────────────────────────────────────────────────────────────────
  const runScan = useCallback(async () => {
    setScanning(true);
    try {
      // 1. Detectar posições que o bot fechou desde o último scan
      const openNow = signals.filter(s => s.status === "aprovado");
      const autoCloses = detectClosedPositions(openNow);
      let currentSignals = signals;

      if (autoCloses.length > 0) {
        const fechado_em = new Date().toISOString();
        let updated = [...currentSignals];
        let newLearn = learning;
        for (const ac of autoCloses) {
          updated = updated.map(s => s.id === ac.id ? { ...s, ...ac } : s);
          const sig = updated.find(s => s.id === ac.id);
          if (sig && (ac.status === "tp" || ac.status === "sl")) {
            newLearn = applyLearning(newLearn, { ...sig, status: ac.status });
            if (tgConfig.enabled && tgConfig.notifyExit) sendTelegram(tgConfig, buildExitMsg({ ...sig, status: ac.status }));
          }
        }
        saveLearning(newLearn);
        saveSignals(updated);
        currentSignals = updated;
      }

      // 2. Processar novos sinais de entrada
      const incoming = aggregateAllSignals();
      const newSigs: CerebroSignal[] = [];
      for (const sig of incoming) {
        if (processedIds.current.has(sig.id)) continue;
        processedIds.current.add(sig.id);
        const { confianca, motivo, aprovado, breakdown } = calcConfianca(sig, learning, incoming);
        if (!aprovado) continue;
        const cs: CerebroSignal = { ...sig, confianca, aprovado:true, motivo, breakdown, status:"aprovado", telegram_entry:false, telegram_exit:false, registrado_em: new Date().toISOString() };
        let tgSent = false;
        if (tgConfig.enabled && tgConfig.notifyEntry) tgSent = await sendTelegram(tgConfig, buildEntryMsg(cs));
        const final = { ...cs, telegram_entry: tgSent };
        newSigs.push(final);
        try { await fetch(`${API}/cerebro/signal`, { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify(final) }); } catch {}
      }
      if (newSigs.length > 0) saveSignals([...newSigs, ...currentSignals]);

      setLastScan(new Date());
    } finally { setScanning(false); }
  }, [learning, signals, tgConfig, saveSignals, saveLearning, detectClosedPositions]);

  useEffect(() => {
    runScan();
    const iv = setInterval(runScan, 30_000);
    window.addEventListener("focus", runScan);
    return () => { clearInterval(iv); window.removeEventListener("focus", runScan); };
  }, [runScan]);

  // ── Relatórios agendados (hourly / daily) ──────────────────────────────────
  const lastHourlyRef = useRef<number>(0);
  const lastDailyRef  = useRef<number>(0);
  useEffect(() => {
    if (!tgConfig.enabled || (!tgConfig.reportHourly && !tgConfig.reportDaily)) return;
    const tick = async () => {
      const now = new Date();
      const min = now.getMinutes();
      const hour = now.getHours();
      if (tgConfig.reportHourly && min === 0 && Date.now() - lastHourlyRef.current > 50 * 60 * 1000) {
        lastHourlyRef.current = Date.now();
        const oneHAgo = Date.now() - 3_600_000;
        const recent = signals.filter(s => (s.status==="tp"||s.status==="sl") && s.fechado_em && new Date(s.fechado_em).getTime() >= oneHAgo);
        const tps = recent.filter(s=>s.status==="tp").length;
        const sls = recent.filter(s=>s.status==="sl").length;
        const pnl = recent.reduce((acc,s)=>acc+(s.pnl_pct??0),0);
        const emoji = tps > sls ? "✅" : tps < sls ? "❌" : "➖";
        await sendTelegram(tgConfig, `🧠 <b>CEREBRO — Relatório Última Hora</b>\n\n${emoji} ${tps > sls ? "GREEN" : tps < sls ? "RED" : "NEUTRO"}\n\n✅ GREEN: <b>${tps}</b>\n❌ RED: <b>${sls}</b>\nTotal: ${recent.length} trades\nP&amp;L acumulado: <b>${pnl>=0?"+":""}${pnl.toFixed(2)}%</b>\n\n<i>${now.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})}</i>`, true);
      }
      if (tgConfig.reportDaily && hour === 8 && min === 0 && Date.now() - lastDailyRef.current > 23 * 60 * 60 * 1000) {
        lastDailyRef.current = Date.now();
        const startDay = new Date(); startDay.setHours(0,0,0,0);
        const today = signals.filter(s => (s.status==="tp"||s.status==="sl") && s.fechado_em && new Date(s.fechado_em).getTime() >= startDay.getTime());
        const tps = today.filter(s=>s.status==="tp").length;
        const sls = today.filter(s=>s.status==="sl").length;
        const pnl = today.reduce((acc,s)=>acc+(s.pnl_pct??0),0);
        const wrPct = today.length > 0 ? (tps/today.length*100) : 0;
        const emoji = wrPct >= 55 ? "✅" : wrPct >= 45 ? "➖" : "❌";
        await sendTelegram(tgConfig, `🧠 <b>CEREBRO — Relatório Diário</b>\n\n${emoji} ${today.length === 0 ? "Sem trades ontem" : wrPct >= 55 ? "DIA GREEN!" : wrPct >= 45 ? "DIA NEUTRO" : "DIA RED"}\n\n✅ GREEN: <b>${tps}</b>\n❌ RED: <b>${sls}</b>\nWin Rate: <b>${wrPct.toFixed(0)}%</b>\nP&amp;L: <b>${pnl>=0?"+":""}${pnl.toFixed(2)}%</b>\n\n<i>${startDay.toLocaleDateString("pt-BR")}</i>`, true);
      }
    };
    const iv = setInterval(tick, 60_000);
    return () => clearInterval(iv);
  }, [tgConfig, signals]);

  useEffect(() => {
    fetch(`${API}/cerebro/signals?limit=500`).then(r => r.ok ? r.json() : []).then((data: CerebroSignal[]) => {
      if (data.length > 0) {
        const ids = new Set(signals.map(s => s.id));
        const onlyNew = data.filter(d => !ids.has(d.id));
        if (onlyNew.length > 0) saveSignals([...signals, ...onlyNew].sort((a,b) => new Date(b.registrado_em).getTime() - new Date(a.registrado_em).getTime()));
      }
    }).catch(() => {});
  }, []); // eslint-disable-line

  // ── Computed ───────────────────────────────────────────────────────────────
  const openSigs    = signals.filter(s => s.status === "aprovado");
  const closedSigs  = signals.filter(s => s.status === "tp" || s.status === "sl" || s.status === "expirado");
  const wins        = signals.filter(s => s.status === "tp");
  const losses      = signals.filter(s => s.status === "sl");
  const expired     = signals.filter(s => s.status === "expirado");
  const decidedSigs = signals.filter(s => s.status === "tp" || s.status === "sl"); // para WR
  const globalWR    = decidedSigs.length > 0 ? (wins.length / decidedSigs.length) * 100 : null;
  const avgConf     = signals.length > 0 ? signals.reduce((a,s) => a + s.confianca, 0) / signals.length : 0;

  const filteredByTab = statFilter === "open" ? openSigs : statFilter === "tp" ? wins : statFilter === "sl" ? losses : signals;
  const filteredSigs = filteredByTab
    .filter(s => !srcFilter || s.source === srcFilter)
    .filter(s => !dirFilter || s.direction === dirFilter)
    .filter(s => !resFilter || s.status === resFilter);

  const topSymbols = Object.entries(learning.bySymbol)
    .map(([sym, d]) => ({ sym, wr: wr(d), total: d.w + d.l }))
    .filter(x => x.total >= 2 && x.wr != null)
    .sort((a,b) => (b.wr??0) - (a.wr??0)).slice(0, 6);

  const srcStats = (Object.entries(SOURCE_LABELS) as [SourceType, string][]).map(([src]) => ({
    src, wr: wr(learning.bySource[src]), d: learning.bySource[src] ?? {w:0,l:0},
  }));

  const bestHour = Object.entries(learning.byHour)
    .map(([h, d]) => ({ h, wr: wr(d), total: d.w + d.l }))
    .filter(x => x.total >= 2 && x.wr != null)
    .sort((a,b) => (b.wr??0) - (a.wr??0))[0];

  const tabStyle = (k: TabKey) => ({
    background: tab === k ? "rgba(99,102,241,0.15)" : "transparent",
    border: `1px solid ${tab === k ? "rgba(99,102,241,0.4)" : "transparent"}`,
    color: tab === k ? "#818cf8" : "var(--text-muted)",
    fontWeight: tab === k ? 700 : 400,
  });

  const tgUpd = (patch: Partial<TelegramConfig>) => saveTg({ ...tgConfig, ...patch });

  return (
    <main className="min-h-screen" style={{ background:"var(--bg)", color:"var(--text)" }}>
      <div className="max-w-lg mx-auto px-4 py-6">

        <IAEngineHubNav />

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-2xl flex items-center justify-center" style={{ background:"rgba(99,102,241,0.15)", border:"1px solid rgba(99,102,241,0.3)" }}>
                <Brain size={18} style={{ color:"#818cf8" }} />
              </div>
              <div>
                <h1 className="text-xl font-black leading-none" style={{ color:"var(--text)", letterSpacing:"-0.03em" }}>CEREBRO</h1>
                <p className="text-[10px] mt-0.5 flex items-center gap-1.5" style={{ color:"var(--text-muted)" }}>
                  {scanning
                    ? <><RefreshCw size={9} className="animate-spin text-indigo-400" /> analisando sinais…</>
                    : <><Wifi size={9} className="text-emerald-400" /> scan a cada 30s{lastScan && ` · ${lastScan.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})}`}</>
                  }
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={runScan} disabled={scanning}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-semibold transition-all active:scale-95"
              style={{ background:"rgba(99,102,241,0.12)", color:"#818cf8", border:"1px solid rgba(99,102,241,0.25)" }}
            >
              <RefreshCw size={12} className={scanning ? "animate-spin" : ""} />
              Scan
            </button>
            <button
              onClick={() => setTab("config")}
              className="w-9 h-9 flex items-center justify-center rounded-xl transition-all active:scale-95"
              style={{ background: tab==="config" ? "rgba(99,102,241,0.15)" : "var(--bg-card)", border:"1px solid var(--border)" }}
            >
              <Settings size={15} style={{ color: tab==="config" ? "#818cf8" : "var(--text-muted)" }} />
            </button>
          </div>
        </div>

        {/* ── Stats clicáveis ──────────────────────────────────────────────── */}
        <div className="flex gap-2 mb-4">
          <StatCard label="Total" value={signals.length} color="#818cf8" active={statFilter==="all"} onClick={() => setStatFilter("all")} />
          <StatCard label="Abertos" value={openSigs.length} color="#f59e0b" active={statFilter==="open"} onClick={() => { setStatFilter("open"); setTab("indica"); }} />
          <StatCard label="Win Rate" value={globalWR != null ? `${globalWR.toFixed(0)}%` : "—"} color={globalWR != null ? (globalWR>=55?"#10b981":"#ef4444") : "#6b7280"} active={statFilter==="tp"} onClick={() => { setStatFilter("tp"); setTab("historico"); }} />
          <StatCard label="Confiança" value={avgConf > 0 ? `${avgConf.toFixed(0)}%` : "—"} color="#818cf8" />
        </div>

        {/* ── Tabs ─────────────────────────────────────────────────────────── */}
        <div className="flex gap-1 p-1 rounded-2xl mb-4" style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
          {([
            ["indica",      <Brain key="b" size={11}/>,       "Indica"],
            ["historico",   <History key="h" size={11}/>,     "Histórico"],
            ["aprendizado", <Lightbulb key="l" size={11}/>,   "Aprende"],
            ["config",      <Settings key="s" size={11}/>,    "Config"],
          ] as [TabKey, React.ReactNode, string][]).map(([k, icon, lbl]) => (
            <button key={k} onClick={() => setTab(k)}
              className="flex items-center justify-center gap-1 flex-1 py-2 rounded-xl text-[11px] transition-all active:scale-95"
              style={tabStyle(k)}>
              {icon}{lbl}
            </button>
          ))}
        </div>

        {/* ══ TAB: INDICA ══════════════════════════════════════════════════════ */}
        {tab === "indica" && (
          <div className="flex flex-col gap-3">
            {/* Filtros */}
            <div className="flex gap-1.5 flex-wrap">
              <Chip label="Todos" active={!srcFilter && !dirFilter} onClick={() => { setSrcFilter(null); setDirFilter(null); }} />
              <Chip label="▲ LONG"  active={dirFilter==="LONG"}  color="#10b981" onClick={() => setDirFilter(dirFilter==="LONG"?null:"LONG")} />
              <Chip label="▼ SHORT" active={dirFilter==="SHORT"} color="#ef4444" onClick={() => setDirFilter(dirFilter==="SHORT"?null:"SHORT")} />
              {openSigs.length === 0 && !srcFilter && !dirFilter && (
                <span className="ml-auto text-[10px] flex items-center gap-1" style={{ color:"var(--text-muted)" }}>
                  <Clock size={10}/> threshold {learning.threshold}%
                </span>
              )}
            </div>

            {/* Fonte chips */}
            <div className="flex gap-1.5 flex-wrap">
              {(Object.keys(SOURCE_LABELS) as SourceType[]).map(src => {
                const cnt = openSigs.filter(s => s.source === src).length;
                if (cnt === 0 && srcFilter !== src) return null;
                return <Chip key={src} label={`${SOURCE_LABELS[src]} (${cnt})`} active={srcFilter===src} color={SOURCE_COLORS[src]} onClick={() => setSrcFilter(srcFilter===src?null:src)} />;
              })}
            </div>

            {/* Sinais */}
            {filteredSigs.filter(s=>s.status==="aprovado").length === 0 && (
              <div className="text-center py-16 rounded-2xl flex flex-col items-center gap-3" style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
                <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ background:"rgba(99,102,241,0.1)" }}>
                  <Brain size={28} style={{ color:"rgba(99,102,241,0.5)" }} />
                </div>
                <div>
                  <div className="font-semibold text-sm" style={{ color:"var(--text-muted)" }}>Nenhum sinal aprovado agora</div>
                  <div className="text-[11px] mt-0.5" style={{ color:"var(--text-muted)" }}>Threshold: {learning.threshold}% · Scan: 30s</div>
                </div>
              </div>
            )}
            {filteredSigs.filter(s=>s.status==="aprovado").map(s =>
              <SignalCard key={s.id} sig={s} onClose={closeSignal} defaultExpanded={openSigs.length === 1} />
            )}
          </div>
        )}

        {/* ══ TAB: HISTÓRICO ═══════════════════════════════════════════════════ */}
        {tab === "historico" && (
          <div className="flex flex-col gap-3">
            {/* Explicação se histórico vazio */}
            {closedSigs.length === 0 && openSigs.length > 0 && (
              <div className="rounded-2xl p-4 flex gap-3" style={{ background:"rgba(251,191,36,0.07)", border:"1px solid rgba(251,191,36,0.2)" }}>
                <div className="text-[20px]">💡</div>
                <div>
                  <div className="font-semibold text-[12px] mb-1" style={{ color:"#fbbf24" }}>Por que o histórico está vazio?</div>
                  <div className="text-[11px] leading-relaxed" style={{ color:"var(--text-muted)" }}>
                    Você tem <b style={{color:"var(--text)"}}>{openSigs.length} sinais abertos</b>. O histórico mostra apenas posições <b>fechadas</b>.<br/><br/>
                    O CEREBRO detecta automaticamente quando o bot fecha uma posição. Sinais sem fechamento após <b>4 horas</b> são marcados como <b>Expirado</b> e aparecem aqui.
                  </div>
                </div>
              </div>
            )}

            {/* Mini stats */}
            <div className="grid grid-cols-4 gap-2">
              {[
                { label:"Total",    value: closedSigs.length, color:"var(--text)" },
                { label:"✅ TP",    value: wins.length,       color:"#10b981"     },
                { label:"❌ SL",    value: losses.length,     color:"#ef4444"     },
                { label:"⏱ Expir.", value: expired.length,   color:"#6b7280"     },
              ].map(x => (
                <div key={x.label} className="rounded-2xl p-2 text-center" style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
                  <div className="text-[8px] mb-1" style={{ color:"var(--text-muted)" }}>{x.label}</div>
                  <div className="text-[16px] font-black" style={{ color:x.color }}>{x.value}</div>
                </div>
              ))}
            </div>

            {/* WR banner se houver dados */}
            {decidedSigs.length > 0 && (
              <div className="rounded-2xl px-4 py-3 flex items-center justify-between" style={{ background: globalWR! >= 55 ? "rgba(16,185,129,0.08)" : "rgba(239,68,68,0.08)", border:`1px solid ${globalWR! >= 55 ? "rgba(16,185,129,0.2)" : "rgba(239,68,68,0.2)"}` }}>
                <div className="text-[12px]" style={{ color:"var(--text-muted)" }}>Win Rate (TP vs SL)</div>
                <div className="text-[22px] font-black" style={{ color: globalWR! >= 55 ? "#10b981" : "#ef4444" }}>{globalWR!.toFixed(1)}%</div>
              </div>
            )}

            {/* Filtros resultado */}
            <div className="flex gap-1.5 flex-wrap">
              <Chip label="Todos"    active={!resFilter && !dirFilter} onClick={() => { setResFilter(null); setDirFilter(null); }} />
              <Chip label="✅ TP"   active={resFilter==="tp"}    color="#10b981" onClick={() => setResFilter(resFilter==="tp"?null:"tp")} />
              <Chip label="❌ SL"   active={resFilter==="sl"}    color="#ef4444" onClick={() => setResFilter(resFilter==="sl"?null:"sl")} />
              <Chip label="⏱ Expir" active={resFilter==="expirado" as any} color="#6b7280" onClick={() => setResFilter((resFilter as any)==="expirado"?null:"expirado" as any)} />
              <Chip label="▲ LONG"  active={dirFilter==="LONG"}  color="#10b981" onClick={() => setDirFilter(dirFilter==="LONG"?null:"LONG")} />
              <Chip label="▼ SHORT" active={dirFilter==="SHORT"} color="#ef4444" onClick={() => setDirFilter(dirFilter==="SHORT"?null:"SHORT")} />
            </div>

            {/* Fonte chips */}
            <div className="flex gap-1.5 flex-wrap">
              {(Object.keys(SOURCE_LABELS) as SourceType[]).map(src => (
                <Chip key={src} label={SOURCE_LABELS[src]} active={srcFilter===src} color={SOURCE_COLORS[src]} onClick={() => setSrcFilter(srcFilter===src?null:src)} />
              ))}
            </div>

            {filteredSigs.filter(s => s.status !== "aprovado").length === 0
              ? (
                <div className="text-center py-12 rounded-2xl" style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
                  <History size={28} style={{ color:"var(--text-muted)", display:"block", margin:"0 auto 8px" }} />
                  <div className="text-sm font-medium" style={{ color:"var(--text-muted)" }}>
                    {openSigs.length > 0 ? `${openSigs.length} sinais abertos aguardando fechamento` : "Nenhum registro ainda"}
                  </div>
                  {openSigs.length > 0 && (
                    <div className="text-[11px] mt-1" style={{ color:"var(--text-muted)" }}>
                      Sinais com mais de 4h são movidos aqui automaticamente
                    </div>
                  )}
                </div>
              )
              : filteredSigs.filter(s => s.status !== "aprovado").slice(0, 80).map(s =>
                  <SignalCard key={s.id} sig={s} />
                )
            }
          </div>
        )}

        {/* ══ TAB: APRENDIZADO ═════════════════════════════════════════════════ */}
        {tab === "aprendizado" && (
          <div className="flex flex-col gap-3">
            {/* Threshold card interativo */}
            <div className="rounded-2xl p-4" style={{ background:"rgba(99,102,241,0.08)", border:"1px solid rgba(99,102,241,0.2)" }}>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="text-[12px] font-bold flex items-center gap-1.5" style={{ color:"#818cf8" }}>
                    <Target size={12}/> Threshold de aprovação
                  </div>
                  <div className="text-[10px] mt-0.5" style={{ color:"var(--text-muted)" }}>Auto-ajusta a cada 10 trades fechados</div>
                </div>
                <div className="text-[26px] font-black" style={{ color:"#818cf8" }}>{learning.threshold}%</div>
              </div>
              {/* Barra visual do threshold */}
              <div className="relative h-2 rounded-full mb-2" style={{ background:"rgba(255,255,255,0.06)" }}>
                <div className="absolute h-full rounded-full transition-all" style={{ width:`${learning.threshold}%`, background:"linear-gradient(90deg,#6366f1,#818cf8)" }} />
              </div>
              <div className="flex items-center justify-between text-[9px]" style={{ color:"var(--text-muted)" }}>
                <span>50% (mínimo)</span>
                <span>{learning.totalTrades} trades · {learning.totalApproved} aprovados</span>
                <span>75% (máximo)</span>
              </div>
              {learning.lastUpdate && (
                <div className="text-[9px] mt-2 text-center" style={{ color:"var(--text-muted)" }}>
                  Última atualização: {fTime(learning.lastUpdate)}
                </div>
              )}
            </div>

            {/* Por direção */}
            <div className="grid grid-cols-2 gap-2">
              {(["LONG","SHORT"] as Direction[]).map(d => {
                const dwr = wr(learning.byDirection[d]);
                const dd  = learning.byDirection[d];
                return (
                  <div key={d} className="rounded-2xl p-4" style={{ background:"var(--bg-card)", border:`1px solid ${d==="LONG"?"rgba(16,185,129,0.2)":"rgba(239,68,68,0.2)"}` }}>
                    <div className="flex items-center gap-1.5 mb-2">
                      {d==="LONG" ? <ArrowUpRight size={14} style={{color:"#10b981"}}/> : <ArrowDownRight size={14} style={{color:"#ef4444"}}/>}
                      <span className="font-bold text-[13px]" style={{ color:d==="LONG"?"#10b981":"#ef4444" }}>{d}</span>
                    </div>
                    <div className="text-[24px] font-black mb-1" style={{ color: dwr!=null?(dwr>=55?"#10b981":"#ef4444"):"#6b7280" }}>
                      {dwr!=null?`${dwr.toFixed(0)}%`:"—"}
                    </div>
                    <div className="text-[10px]" style={{ color:"var(--text-muted)" }}>{dd?.w??0}W / {dd?.l??0}L</div>
                    {dwr != null && (
                      <div className="mt-2 h-1 rounded-full overflow-hidden" style={{ background:"rgba(255,255,255,0.06)" }}>
                        <div className="h-full rounded-full" style={{ width:`${dwr}%`, background: dwr>=55?"#10b981":"#ef4444" }} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Por fonte */}
            <div className="rounded-2xl p-4" style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
              <div className="font-semibold text-[13px] mb-3" style={{ color:"var(--text)" }}>
                <BarChart2 size={12} style={{display:"inline",marginRight:5}}/>Performance por fonte
              </div>
              <div className="flex flex-col gap-2.5">
                {srcStats.map(({ src, wr: w, d }) => (
                  <button key={src} onClick={() => setSrcFilter(srcFilter===src?null:src)}
                    className="flex items-center gap-3 w-full rounded-xl px-2 py-1.5 transition-all active:scale-95"
                    style={{ background: srcFilter===src ? `${SOURCE_COLORS[src]}10` : "transparent", border:`1px solid ${srcFilter===src ? SOURCE_COLORS[src]+"30":"transparent"}` }}>
                    <span className="text-[11px] w-20 text-left font-medium" style={{ color:SOURCE_COLORS[src] }}>{SOURCE_LABELS[src]}</span>
                    <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background:"rgba(255,255,255,0.06)" }}>
                      <div className="h-full rounded-full transition-all duration-500" style={{ width:`${w??0}%`, background:(w??0)>=55?"#10b981":"#ef4444" }} />
                    </div>
                    <span className="text-[11px] tabular-nums w-8 font-bold" style={{ color:(w??0)>=55?"#10b981":"#ef4444" }}>{w!=null?`${w.toFixed(0)}%`:"—"}</span>
                    <span className="text-[9px] w-8" style={{ color:"var(--text-muted)" }}>{d.w+d.l}t</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Melhores moedas */}
            {topSymbols.length > 0 && (
              <div className="rounded-2xl p-4" style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
                <div className="font-semibold text-[13px] mb-3" style={{ color:"var(--text)" }}>
                  <Trophy size={12} style={{display:"inline",marginRight:5,color:"#f59e0b"}}/>Melhores moedas
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {topSymbols.map(({ sym, wr: w, total }) => {
                    const symData = learning.bySymbol[sym];
                    return (
                      <button key={sym} onClick={() => setDirFilter(null)}
                        className="rounded-xl p-3 text-left transition-all active:scale-95"
                        style={{ background:"rgba(255,255,255,0.03)", border:"1px solid var(--border)" }}>
                        <div className="font-black text-[14px]" style={{ color:"var(--text)" }}>{sym.replace("USDT","")}</div>
                        <div className="text-[11px] font-bold mt-0.5" style={{ color:(w??0)>=55?"#10b981":"#ef4444" }}>{(w??0).toFixed(0)}% WR</div>
                        <div className="text-[9px] mt-0.5" style={{ color:"var(--text-muted)" }}>{symData?.w??0}W · {symData?.l??0}L · {total}t</div>
                        <div className="mt-1.5 h-1 rounded-full overflow-hidden" style={{ background:"rgba(255,255,255,0.06)" }}>
                          <div className="h-full rounded-full" style={{ width:`${w??0}%`, background:(w??0)>=55?"#10b981":"#ef4444" }} />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Melhor hora */}
            {bestHour && (
              <div className="rounded-2xl p-4 flex items-center gap-4" style={{ background:"rgba(251,191,36,0.07)", border:"1px solid rgba(251,191,36,0.2)" }}>
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0" style={{ background:"rgba(251,191,36,0.15)" }}>
                  <Clock size={20} style={{ color:"#fbbf24" }} />
                </div>
                <div>
                  <div className="text-[11px]" style={{ color:"var(--text-muted)" }}>Melhor horário</div>
                  <div className="text-[22px] font-black" style={{ color:"#fbbf24" }}>{bestHour.h}:00</div>
                  <div className="text-[10px]" style={{ color:"var(--text-muted)" }}>WR {bestHour.wr?.toFixed(0)}% · {bestHour.total} trades</div>
                </div>
              </div>
            )}

            {/* Faixas de score */}
            <div className="rounded-2xl p-4" style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
              <div className="font-semibold text-[13px] mb-3" style={{ color:"var(--text)" }}>WR por faixa de score</div>
              <div className="flex flex-col gap-2">
                {Object.entries(learning.byScoreRange).map(([range, d]) => {
                  const w = wr(d);
                  return (
                    <div key={range} className="flex items-center gap-3">
                      <span className="text-[10px] w-14 font-medium" style={{ color:"var(--text-muted)" }}>Score {range}</span>
                      <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background:"rgba(255,255,255,0.06)" }}>
                        <div className="h-full rounded-full" style={{ width:`${w??0}%`, background:(w??0)>=55?"#10b981":"#ef4444" }} />
                      </div>
                      <span className="text-[10px] tabular-nums w-8 text-right font-bold" style={{ color:(w??0)>=55?"#10b981":"#ef4444" }}>{w!=null?`${w.toFixed(0)}%`:"—"}</span>
                      <span className="text-[9px] w-6" style={{ color:"var(--text-muted)" }}>{d.w+d.l}t</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {learning.totalTrades === 0 && (
              <>
                {/* Banner aguardando dados */}
                <div className="rounded-2xl p-4 flex items-start gap-3" style={{ background:"rgba(99,102,241,0.08)", border:"1px solid rgba(99,102,241,0.25)" }}>
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background:"rgba(99,102,241,0.2)" }}>
                    <Lightbulb size={18} style={{ color:"#818cf8" }} />
                  </div>
                  <div>
                    <div className="font-bold text-[13px] mb-1" style={{ color:"#818cf8" }}>Aprendizado em progresso</div>
                    <div className="text-[11px] leading-relaxed" style={{ color:"var(--text-muted)" }}>
                      O CEREBRO aprende com cada trade fechado (TP ou SL). Com <b style={{color:"var(--text)"}}>{openSigs.length}</b> sinais abertos monitorados, os dados aparecem conforme as posições forem encerradas pelo bot ou expirarem (4h).
                    </div>
                  </div>
                </div>

                {openSigs.length > 0 && (
                  <>
                    {/* Distribuição por fonte dos sinais abertos */}
                    <div className="rounded-2xl p-4" style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
                      <div className="font-semibold text-[12px] mb-3 flex items-center gap-2" style={{ color:"var(--text)" }}>
                        <BarChart2 size={12} style={{color:"#818cf8"}}/> Sinais monitorados por fonte
                      </div>
                      {(Object.entries(SOURCE_LABELS) as [SourceType, string][]).map(([src, label]) => {
                        const count = openSigs.filter(s => s.source === src).length;
                        const pct = openSigs.length > 0 ? (count / openSigs.length * 100) : 0;
                        return (
                          <div key={src} className="flex items-center gap-3 mb-2">
                            <span className="text-[10px] w-20 shrink-0" style={{ color:SOURCE_COLORS[src] }}>{label}</span>
                            <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background:"rgba(255,255,255,0.06)" }}>
                              <div className="h-full rounded-full transition-all" style={{ width:`${pct}%`, background:SOURCE_COLORS[src] }} />
                            </div>
                            <span className="text-[10px] tabular-nums w-5 text-right font-bold" style={{ color:"var(--text-muted)" }}>{count}</span>
                          </div>
                        );
                      })}
                    </div>

                    {/* LONG vs SHORT + confiança média */}
                    <div className="grid grid-cols-3 gap-2">
                      <div className="rounded-2xl p-3 text-center" style={{ background:"rgba(16,185,129,0.08)", border:"1px solid rgba(16,185,129,0.2)" }}>
                        <div className="text-[24px] font-black" style={{ color:"#10b981" }}>{openSigs.filter(s=>s.direction==="LONG").length}</div>
                        <div className="text-[9px] mt-0.5" style={{ color:"var(--text-muted)" }}>LONG abertos</div>
                      </div>
                      <div className="rounded-2xl p-3 text-center" style={{ background:"rgba(99,102,241,0.08)", border:"1px solid rgba(99,102,241,0.2)" }}>
                        <div className="text-[24px] font-black" style={{ color:"#818cf8" }}>
                          {openSigs.length > 0 ? (openSigs.reduce((a,s)=>a+s.confianca,0)/openSigs.length).toFixed(0) : "—"}%
                        </div>
                        <div className="text-[9px] mt-0.5" style={{ color:"var(--text-muted)" }}>Conf. média</div>
                      </div>
                      <div className="rounded-2xl p-3 text-center" style={{ background:"rgba(239,68,68,0.08)", border:"1px solid rgba(239,68,68,0.2)" }}>
                        <div className="text-[24px] font-black" style={{ color:"#ef4444" }}>{openSigs.filter(s=>s.direction==="SHORT").length}</div>
                        <div className="text-[9px] mt-0.5" style={{ color:"var(--text-muted)" }}>SHORT abertos</div>
                      </div>
                    </div>

                    {/* Sinal mais antigo / próxima expiração */}
                    {(() => {
                      const oldest = [...openSigs].sort((a,b)=>new Date(a.registrado_em).getTime()-new Date(b.registrado_em).getTime())[0];
                      if (!oldest) return null;
                      const age = Date.now() - new Date(oldest.registrado_em).getTime();
                      const expireIn = 4*3600000 - age;
                      const mins = Math.max(0, Math.floor(expireIn / 60000));
                      const hrs = Math.floor(mins / 60);
                      const rmins = mins % 60;
                      return (
                        <div className="rounded-2xl p-3 flex items-center gap-3" style={{ background:"rgba(251,191,36,0.07)", border:"1px solid rgba(251,191,36,0.2)" }}>
                          <Clock size={16} style={{ color:"#fbbf24", flexShrink:0 }} />
                          <div>
                            <div className="text-[11px] font-semibold" style={{ color:"var(--text)" }}>
                              Mais antigo: <b>{oldest.simbolo.replace("USDT","")}</b> · {elapsed(oldest.registrado_em)} de vida
                            </div>
                            <div className="text-[10px] mt-0.5" style={{ color:"var(--text-muted)" }}>
                              {expireIn > 0
                                ? `Expira em ${hrs > 0 ? `${hrs}h ` : ""}${rmins}min se bot não fechar antes`
                                : "Pronto para expirar — aguardando próximo scan (30s)"}
                            </div>
                          </div>
                        </div>
                      );
                    })()}

                    {/* O que o CEREBRO aprenderá */}
                    <div className="rounded-2xl p-4" style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
                      <div className="font-semibold text-[12px] mb-3 flex items-center gap-1.5" style={{ color:"var(--text)" }}>
                        <Brain size={12} style={{color:"#818cf8"}}/> O que o CEREBRO aprenderá
                      </div>
                      {[
                        { label:"Win Rate por moeda",      desc:"BTC, ETH, SOL... qual ganha mais com os bots" },
                        { label:"Win Rate por fonte",      desc:"Futures vs Scalp vs SRD — qual bot acerta mais" },
                        { label:"LONG vs SHORT",           desc:"Qual direção está funcionando no mercado atual" },
                        { label:"Faixa de score ideal",    desc:"Score 60-70 vs 70+ — mais alto realmente é melhor?" },
                        { label:"Melhor horário do dia",   desc:"Em qual hora o mercado respeita mais os sinais" },
                        { label:"Threshold automático",    desc:"A cada 10 trades o mínimo de confiança se auto-ajusta" },
                      ].map(({ label, desc }) => (
                        <div key={label} className="flex items-start gap-2 mb-2.5">
                          <CheckCircle size={11} style={{ color:"#10b981", flexShrink:0, marginTop:1 }} />
                          <div>
                            <div className="text-[11px] font-semibold" style={{ color:"var(--text)" }}>{label}</div>
                            <div className="text-[10px]" style={{ color:"var(--text-muted)" }}>{desc}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {openSigs.length === 0 && (
                  <div className="text-center py-10 rounded-2xl" style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
                    <Brain size={28} style={{ color:"var(--text-muted)", display:"block", margin:"0 auto 8px" }} />
                    <div className="text-[13px] font-semibold" style={{ color:"var(--text-muted)" }}>Sem sinais ainda</div>
                    <div className="text-[11px] mt-1" style={{ color:"var(--text-muted)" }}>Aguardando o CEREBRO aprovar entradas…</div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ══ TAB: CONFIG ══════════════════════════════════════════════════════ */}
        {tab === "config" && (
          <div className="flex flex-col gap-3">

            {/* ── Status atual ─────────────────────────────────────────────── */}
            <div
              className="rounded-2xl p-4 flex items-center gap-4"
              style={{ background: tgConfig.enabled && tgConfig.botToken && tgConfig.chatId ? "rgba(16,185,129,0.07)" : "rgba(251,191,36,0.07)", border: `1px solid ${tgConfig.enabled && tgConfig.botToken && tgConfig.chatId ? "rgba(16,185,129,0.25)" : "rgba(251,191,36,0.25)"}` }}
            >
              <div
                className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
                style={{ background: tgConfig.enabled && tgConfig.botToken && tgConfig.chatId ? "rgba(16,185,129,0.15)" : "rgba(251,191,36,0.15)" }}
              >
                <Bot size={22} style={{ color: tgConfig.enabled && tgConfig.botToken && tgConfig.chatId ? "#10b981" : "#fbbf24" }} />
              </div>
              <div className="flex-1">
                <div className="font-bold text-[14px]" style={{ color:"var(--text)" }}>
                  {tgConfig.enabled && tgConfig.botToken && tgConfig.chatId ? "Telegram conectado" : "Telegram não configurado"}
                </div>
                <div className="text-[11px] mt-0.5" style={{ color:"var(--text-muted)" }}>
                  {tgConfig.enabled && tgConfig.botToken && tgConfig.chatId
                    ? `Mensagens indo para chat ${tgConfig.chatId}`
                    : "Siga o guia abaixo para receber sinais no Telegram"}
                </div>
              </div>
              <button
                onClick={() => tgUpd({ enabled: !tgConfig.enabled })}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl font-bold text-[11px] transition-all active:scale-95 shrink-0"
                style={{ background: tgConfig.enabled ? "rgba(16,185,129,0.15)" : "rgba(255,255,255,0.06)", border:`1px solid ${tgConfig.enabled ? "rgba(16,185,129,0.4)" : "var(--border)"}`, color: tgConfig.enabled ? "#10b981" : "var(--text-muted)" }}
              >
                {tgConfig.enabled ? <Wifi size={11}/> : <WifiOff size={11}/>}
                {tgConfig.enabled ? "ON" : "OFF"}
              </button>
            </div>

            {/* ── Opções de notificação ───────────────────────────────────── */}
            <div className="rounded-2xl p-4 flex flex-col gap-3" style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
              <div className="font-bold text-[13px] flex items-center gap-2" style={{ color:"var(--text)" }}>
                <MessageCircle size={13} style={{color:"#3b82f6"}}/> O que enviar no Telegram
              </div>
              {([
                { key:"notifyEntry",  label:"Entradas aprovadas",       desc:"Alerta quando o CEREBRO aprovar uma entrada LONG/SHORT",  color:"#10b981" },
                { key:"notifyExit",   label:"Resultados (TP/SL)",        desc:"Avisa GREEN ou RED quando a posição fechar",              color:"#f59e0b" },
                { key:"reportHourly", label:"Relatório de hora em hora", desc:"Resumo GREEN/RED/P&L a cada hora cheia (ex: 14:00, 15:00)", color:"#3b82f6" },
                { key:"reportDaily",  label:"Relatório diário (08:00)",  desc:"Balanço diário com WR% e P&L acumulado do dia anterior",  color:"#a855f7" },
              ] as { key: keyof TelegramConfig; label: string; desc: string; color: string }[]).map(({ key, label, desc, color }) => {
                const on = !!tgConfig[key];
                return (
                  <button
                    key={key}
                    onClick={() => tgUpd({ [key]: !on })}
                    className="flex items-center gap-3 rounded-xl px-3 py-3 transition-all active:scale-[0.98] text-left"
                    style={{ background: on ? `${color}12` : "rgba(255,255,255,0.03)", border:`1px solid ${on ? `${color}40` : "var(--border)"}` }}
                  >
                    <div className="w-5 h-5 rounded-md flex items-center justify-center shrink-0 transition-all" style={{ background: on ? color : "rgba(255,255,255,0.08)" }}>
                      {on && <CheckCheck size={11} style={{color:"#fff"}}/>}
                    </div>
                    <div className="flex-1">
                      <div className="text-[12px] font-semibold" style={{ color: on ? "var(--text)" : "var(--text-muted)" }}>{label}</div>
                      <div className="text-[10px] mt-0.5" style={{ color:"var(--text-muted)" }}>{desc}</div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* ── Guia passo a passo ───────────────────────────────────────── */}
            <div className="rounded-2xl overflow-hidden" style={{ border:"1px solid var(--border)" }}>
              <button
                onClick={() => setGuideStep(guideStep > 0 ? 0 : 1)}
                className="w-full flex items-center justify-between px-4 py-3 transition-all active:opacity-70"
                style={{ background:"var(--bg-card)" }}
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-xl flex items-center justify-center text-[11px] font-black" style={{ background:"rgba(59,130,246,0.15)", color:"#3b82f6" }}>?</div>
                  <span className="font-semibold text-[13px]" style={{ color:"var(--text)" }}>Como criar seu bot no BotFather</span>
                </div>
                {guideStep > 0 ? <ChevronUp size={14} style={{color:"var(--text-muted)"}}/> : <ChevronDown size={14} style={{color:"var(--text-muted)"}}/>}
              </button>

              {guideStep > 0 && (
                <div className="px-4 pb-4 pt-2 flex flex-col gap-3" style={{ background:"var(--bg-card)", borderTop:"1px solid var(--border)" }}>
                  {[
                    {
                      n: 1, icon: <ExternalLink size={13}/>, color: "#3b82f6",
                      title: "Abrir o BotFather",
                      desc: "No Telegram, pesquise @BotFather e clique para abrir. É o bot oficial do Telegram para criar bots.",
                      action: { label:"Abrir @BotFather", href:"https://t.me/BotFather" },
                    },
                    {
                      n: 2, icon: <Send size={13}/>, color: "#8b5cf6",
                      title: "Criar o bot",
                      desc: 'Digite /newbot no BotFather. Escolha um nome (ex: "AllWin CEREBRO") e um username terminando em "bot" (ex: allwin_cerebro_bot).',
                      code: "/newbot",
                    },
                    {
                      n: 3, icon: <Copy size={13}/>, color: "#f59e0b",
                      title: "Copiar o Token",
                      desc: 'O BotFather vai enviar uma mensagem com o token. Copie e cole no campo "Bot Token" abaixo. Parece com: 123456789:AABcde...',
                    },
                    {
                      n: 4, icon: <MessageCircle size={13}/>, color: "#10b981",
                      title: "Mandar mensagem para o bot",
                      desc: 'Pesquise seu bot pelo username que criou e envie qualquer mensagem (ex: "oi"). Isso é necessário para descobrir seu Chat ID.',
                    },
                    {
                      n: 5, icon: <Search size={13}/>, color: "#ec4899",
                      title: "Descobrir seu Chat ID",
                      desc: 'Cole o token abaixo e clique em "Descobrir Chat ID". O CEREBRO vai buscar automaticamente.',
                    },
                  ].map(step => (
                    <div
                      key={step.n}
                      className="flex gap-3 p-3 rounded-xl cursor-pointer transition-all active:scale-98"
                      style={{ background: guideStep === step.n ? `${step.color}10` : "rgba(255,255,255,0.02)", border:`1px solid ${guideStep === step.n ? step.color+"30" : "rgba(255,255,255,0.05)"}` }}
                      onClick={() => setGuideStep(guideStep === step.n ? step.n - 1 : step.n)}
                    >
                      <div className="w-7 h-7 rounded-xl flex items-center justify-center font-black text-[12px] shrink-0" style={{ background:`${step.color}20`, color: step.color }}>
                        {step.n}
                      </div>
                      <div className="flex-1">
                        <div className="font-semibold text-[12px] flex items-center gap-2" style={{ color:"var(--text)" }}>
                          <span style={{color:step.color}}>{step.icon}</span>{step.title}
                        </div>
                        <p className="text-[11px] mt-1 leading-relaxed" style={{ color:"var(--text-muted)" }}>{step.desc}</p>
                        {step.code && (
                          <button
                            onClick={e => { e.stopPropagation(); copyText(step.code!, `code-${step.n}`); }}
                            className="mt-2 flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-mono text-[11px] font-bold transition-all active:scale-95"
                            style={{ background:"rgba(255,255,255,0.06)", color:"#f59e0b", border:"1px solid rgba(255,255,255,0.1)" }}
                          >
                            {copied === `code-${step.n}` ? <CheckCheck size={10}/> : <Copy size={10}/>}
                            {step.code}
                          </button>
                        )}
                        {step.action && (
                          <a
                            href={step.action.href} target="_blank" rel="noopener noreferrer"
                            onClick={e => e.stopPropagation()}
                            className="mt-2 flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-semibold text-[11px] transition-all active:scale-95 inline-flex w-fit"
                            style={{ background:"rgba(59,130,246,0.15)", color:"#3b82f6", border:"1px solid rgba(59,130,246,0.3)" }}
                          >
                            <ExternalLink size={11}/> {step.action.label}
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── Bot Token ────────────────────────────────────────────────── */}
            <div className="rounded-2xl p-4" style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
              <label className="text-[10px] font-bold tracking-wider mb-2 block" style={{ color:"var(--text-muted)" }}>BOT TOKEN</label>
              <div className="flex gap-2">
                <input
                  value={tgConfig.botToken}
                  onChange={e => { const v = e.target.value.trim(); saveTg({ ...tgConfig, botToken: v, enabled: !!(v && tgConfig.chatId) }); }}
                  placeholder="123456789:AABcdefGHIjklMNOpqrSTUVwxyz..."
                  className="flex-1 rounded-xl px-3 py-3 text-[12px] outline-none font-mono"
                  style={{ background:"var(--bg)", border:`1px solid ${tgConfig.botToken ? "rgba(99,102,241,0.4)" : "var(--border)"}`, color:"var(--text)" }}
                />
                {tgConfig.botToken && (
                  <button
                    onClick={() => copyText(tgConfig.botToken, "token")}
                    className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 transition-all active:scale-95"
                    style={{ background:"rgba(255,255,255,0.05)", border:"1px solid var(--border)", color:"var(--text-muted)" }}
                  >
                    {copied === "token" ? <CheckCheck size={14} style={{color:"#10b981"}}/> : <Copy size={14}/>}
                  </button>
                )}
              </div>
              {tgConfig.botToken && (
                <div className="mt-2 flex items-center gap-1.5 text-[10px]" style={{ color:"#10b981" }}>
                  <CheckCircle size={10}/> Token preenchido
                </div>
              )}
            </div>

            {/* ── Descobrir Chat ID ────────────────────────────────────────── */}
            <div className="rounded-2xl p-4" style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <label className="text-[10px] font-bold tracking-wider block" style={{ color:"var(--text-muted)" }}>CHAT ID</label>
                  <div className="text-[10px] mt-0.5" style={{ color:"var(--text-muted)" }}>Clique em "Buscar" para descobrir automaticamente</div>
                </div>
                <button
                  onClick={fetchUpdates}
                  disabled={loadingChatId || !tgConfig.botToken}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl font-semibold text-[11px] transition-all active:scale-95"
                  style={{ background: tgConfig.botToken ? "rgba(236,72,153,0.12)" : "rgba(255,255,255,0.03)", color: tgConfig.botToken ? "#ec4899" : "var(--text-muted)", border:`1px solid ${tgConfig.botToken ? "rgba(236,72,153,0.3)" : "var(--border)"}` }}
                >
                  {loadingChatId ? <Loader2 size={11} className="animate-spin"/> : <Search size={11}/>}
                  {loadingChatId ? "Buscando..." : "Buscar"}
                </button>
              </div>

              <div className="flex gap-2 mb-2">
                <input
                  value={tgConfig.chatId}
                  onChange={e => { const v = e.target.value.trim(); saveTg({ ...tgConfig, chatId: v, enabled: !!(tgConfig.botToken && v) }); }}
                  placeholder="-1001234567890"
                  className="flex-1 rounded-xl px-3 py-3 text-[12px] outline-none font-mono"
                  style={{ background:"var(--bg)", border:`1px solid ${tgConfig.chatId ? "rgba(99,102,241,0.4)" : "var(--border)"}`, color:"var(--text)" }}
                />
                {tgConfig.chatId && (
                  <button
                    onClick={() => copyText(tgConfig.chatId, "chatid")}
                    className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 transition-all active:scale-95"
                    style={{ background:"rgba(255,255,255,0.05)", border:"1px solid var(--border)", color:"var(--text-muted)" }}
                  >
                    {copied === "chatid" ? <CheckCheck size={14} style={{color:"#10b981"}}/> : <Copy size={14}/>}
                  </button>
                )}
              </div>

              {/* Chats encontrados */}
              {foundChats.length > 0 && (
                <div className="flex flex-col gap-1.5 mt-2">
                  <div className="text-[10px] font-semibold mb-1" style={{ color:"var(--text-muted)" }}>Selecione onde receber as mensagens:</div>
                  {foundChats.map(c => (
                    <button
                      key={c.id}
                      onClick={() => { tgUpd({ chatId: c.id, enabled: true }); setFoundChats([]); setChatIdStatus(null); }}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all active:scale-95"
                      style={{ background: tgConfig.chatId === c.id ? "rgba(99,102,241,0.12)" : "rgba(255,255,255,0.03)", border:`1px solid ${tgConfig.chatId === c.id ? "rgba(99,102,241,0.4)" : "rgba(255,255,255,0.06)"}` }}
                    >
                      <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ background:"rgba(99,102,241,0.12)" }}>
                        {c.type === "group" || c.type === "supergroup" ? <Users size={14} style={{color:"#818cf8"}}/> : <User size={14} style={{color:"#818cf8"}}/>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-[12px] truncate" style={{ color:"var(--text)" }}>{c.name}</div>
                        <div className="text-[10px] font-mono" style={{ color:"var(--text-muted)" }}>{c.id} · {c.type}</div>
                      </div>
                      {tgConfig.chatId === c.id && <CheckCheck size={14} style={{color:"#10b981"}}/>}
                    </button>
                  ))}
                </div>
              )}
              {chatIdStatus && (
                <div className="mt-2 text-[11px] px-3 py-2 rounded-xl" style={{ background: chatIdStatus.startsWith("❌") ? "rgba(239,68,68,0.08)" : "rgba(251,191,36,0.08)", color: chatIdStatus.startsWith("❌") ? "#ef4444" : "#fbbf24", border:`1px solid ${chatIdStatus.startsWith("❌") ? "rgba(239,68,68,0.2)" : "rgba(251,191,36,0.2)"}` }}>
                  {chatIdStatus}
                </div>
              )}
            </div>

            {/* ── Testar + Ativar ──────────────────────────────────────────── */}
            <div className="flex gap-2">
              <button
                onClick={async () => {
                  if (!tgConfig.botToken || !tgConfig.chatId) { setTgStatus("⚠️ Preencha token e selecione um chat primeiro"); setTimeout(()=>setTgStatus(null),4000); return; }
                  setTgStatus("📤 Enviando...");
                  const err = await testTgFull(tgConfig, "🧠 <b>CEREBRO — Teste de conexão</b>\n\n✅ Telegram configurado!\n\nVocê receberá mensagens aqui quando o CEREBRO:\n• 📈 Aprovar entrada LONG/SHORT\n• ✅ Fechar com GREEN (TP)\n• ❌ Fechar com RED (SL)");
                  if (!err) {
                    setTgStatus("✅ Mensagem enviada! Verifique o Telegram.");
                    tgUpd({ enabled: true });
                  } else {
                    setTgStatus(`❌ ${err}`);
                  }
                  setTimeout(() => setTgStatus(null), 10000);
                }}
                disabled={!tgConfig.botToken || !tgConfig.chatId}
                className="flex-1 py-3 rounded-2xl font-bold text-[13px] flex items-center justify-center gap-2 transition-all active:scale-95"
                style={{ background: tgConfig.botToken && tgConfig.chatId ? "rgba(59,130,246,0.15)" : "rgba(255,255,255,0.03)", color: tgConfig.botToken && tgConfig.chatId ? "#3b82f6" : "var(--text-muted)", border:`1px solid ${tgConfig.botToken && tgConfig.chatId ? "rgba(59,130,246,0.4)" : "var(--border)"}` }}
              >
                <Send size={14}/> Testar
              </button>
              <button
                onClick={() => tgUpd({ enabled: !tgConfig.enabled })}
                disabled={!tgConfig.botToken || !tgConfig.chatId}
                className="flex-1 py-3 rounded-2xl font-bold text-[13px] flex items-center justify-center gap-2 transition-all active:scale-95"
                style={{ background: tgConfig.enabled ? "rgba(16,185,129,0.2)" : tgConfig.botToken && tgConfig.chatId ? "rgba(16,185,129,0.08)" : "rgba(255,255,255,0.03)", color: tgConfig.enabled ? "#10b981" : tgConfig.botToken && tgConfig.chatId ? "#10b981" : "var(--text-muted)", border:`1px solid ${tgConfig.enabled ? "rgba(16,185,129,0.5)" : tgConfig.botToken && tgConfig.chatId ? "rgba(16,185,129,0.25)" : "var(--border)"}` }}
              >
                {tgConfig.enabled ? <Wifi size={14}/> : <WifiOff size={14}/>}
                {tgConfig.enabled ? "Desativar" : "Ativar"}
              </button>
            </div>
            {tgStatus && (
              <div className="text-[12px] text-center py-3 rounded-2xl font-semibold leading-relaxed" style={{ color: tgStatus.startsWith("✅") ? "#10b981" : tgStatus.startsWith("⚠️") ? "#fbbf24" : "#ef4444", background: tgStatus.startsWith("✅") ? "rgba(16,185,129,0.1)" : tgStatus.startsWith("⚠️") ? "rgba(251,191,36,0.1)" : "rgba(239,68,68,0.1)", border:`1px solid ${tgStatus.startsWith("✅") ? "rgba(16,185,129,0.25)" : tgStatus.startsWith("⚠️") ? "rgba(251,191,36,0.25)" : "rgba(239,68,68,0.25)"}` }}>
                {tgStatus}
              </div>
            )}

            {/* ── Preview das mensagens ────────────────────────────────────── */}
            <div className="rounded-2xl p-4" style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
              <div className="font-bold text-[13px] mb-3 flex items-center gap-2" style={{ color:"var(--text)" }}>
                <MessageCircle size={13} style={{color:"#3b82f6"}}/> Exemplos de mensagens
              </div>
              <div className="flex flex-col gap-2">
                <div className="rounded-xl px-3 py-2.5 text-[11px] font-mono leading-relaxed" style={{ background:"rgba(59,130,246,0.06)", border:"1px solid rgba(59,130,246,0.15)", color:"var(--text-muted)" }}>
                  🧠 <b style={{color:"var(--text)"}}>CEREBRO INDICA</b><br/>
                  <br/>
                  📈 LONG <b style={{color:"var(--text)"}}>BTC</b><br/>
                  <br/>
                  • Confiança: <b style={{color:"#10b981"}}>78%</b><br/>
                  • Score: 72 · Fonte: Futures Bot<br/>
                  • TP: +3.0%  SL: -1.2%<br/>
                  <br/>
                  <i>WR moeda foi decisivo</i>
                </div>
                <div className="rounded-xl px-3 py-2.5 text-[11px] font-mono leading-relaxed" style={{ background:"rgba(16,185,129,0.06)", border:"1px solid rgba(16,185,129,0.15)", color:"var(--text-muted)" }}>
                  ✅ <b style={{color:"var(--text)"}}>CEREBRO — GREEN</b><br/>
                  <br/>
                  LONG <b style={{color:"var(--text)"}}>BTC</b><br/>
                  <br/>
                  Resultado: <b style={{color:"#10b981"}}>+2.87%</b><br/>
                  Confiança inicial: 78%<br/>
                  <br/>
                  <i>Aprendizado atualizado.</i>
                </div>
              </div>
            </div>

            {/* ── Threshold manual ─────────────────────────────────────────── */}
            <div className="rounded-2xl p-4" style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="font-bold text-[13px]" style={{ color:"var(--text)" }}>Threshold de aprovação</div>
                  <div className="text-[10px]" style={{ color:"var(--text-muted)" }}>Nota mínima para o CEREBRO aprovar um sinal</div>
                </div>
                <span className="text-[22px] font-black" style={{ color:"#818cf8" }}>{thresholdDraft}%</span>
              </div>
              <input
                type="range" min={40} max={85} value={thresholdDraft}
                onChange={e => setThresholdDraft(Number(e.target.value))}
                className="w-full mb-3"
                style={{ accentColor:"#818cf8" }}
              />
              <div className="flex justify-between text-[9px] mb-3" style={{ color:"var(--text-muted)" }}>
                <span>40% — mais sinais</span>
                <span style={{color:"#818cf8"}}>Atual: {learning.threshold}%</span>
                <span>85% — mais seletivo</span>
              </div>
              <button
                onClick={() => saveLearning({ ...learning, threshold: thresholdDraft })}
                className="w-full py-2.5 rounded-xl font-semibold text-[12px] transition-all active:scale-95"
                style={{ background:"rgba(99,102,241,0.15)", color:"#818cf8", border:"1px solid rgba(99,102,241,0.35)" }}
              >
                Aplicar {thresholdDraft}%
              </button>
            </div>

            {/* ── Stats + reset ────────────────────────────────────────────── */}
            <div className="rounded-2xl p-4" style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
              <div className="font-bold text-[13px] mb-3" style={{ color:"var(--text)" }}>Dados do CEREBRO</div>
              <div className="grid grid-cols-3 gap-2 mb-4">
                {[
                  { l:"Sinais", v: signals.length },
                  { l:"Trades", v: learning.totalTrades },
                  { l:"Aprovados", v: learning.totalApproved },
                ].map(x => (
                  <div key={x.l} className="rounded-xl p-2 text-center" style={{ background:"rgba(255,255,255,0.03)", border:"1px solid var(--border)" }}>
                    <div className="text-[9px]" style={{ color:"var(--text-muted)" }}>{x.l}</div>
                    <div className="text-[15px] font-black" style={{ color:"var(--text)" }}>{x.v}</div>
                  </div>
                ))}
              </div>
              <button
                onClick={() => {
                  if (!confirm("Resetar TUDO do CEREBRO? (sinais + aprendizado)")) return;
                  saveLearning(DEFAULT_LEARNING); setThresholdDraft(60);
                  processedIds.current.clear(); saveSignals([]);
                }}
                className="w-full py-2.5 rounded-xl font-semibold text-[12px] transition-all active:scale-95"
                style={{ background:"rgba(239,68,68,0.08)", color:"#ef4444", border:"1px solid rgba(239,68,68,0.25)" }}
              >
                <AlertCircle size={12} style={{ display:"inline", marginRight:5 }} />
                Resetar tudo
              </button>
            </div>
          </div>
        )}

        <div className="h-8" />
      </div>
    </main>
  );
}
