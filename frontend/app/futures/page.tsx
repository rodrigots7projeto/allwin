"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Brain, Activity, ChevronRight, TrendingUp, TrendingDown,
  Bot, Zap, BookOpen, Target, Clock, Send,
  ArrowRight, CheckCircle, XCircle, RefreshCw,
  BarChart2, Cpu, Shield, Flame,
} from "lucide-react";

const API = "https://allwin-backend-production.up.railway.app/api/v1";

const C = {
  brain:   "#6366f1",
  emerald: "#10b981",
  amber:   "#f59e0b",
  cyan:    "#22d3ee",
  purple:  "#a855f7",
  gold:    "#fbbf24",
  red:     "#ef4444",
  border:  "rgba(99,102,241,0.2)",
  bg:      "rgba(99,102,241,0.05)",
};

function brainTier(score: number) {
  if (score >= 85) return { label: "PREMIUM",      emoji: "🟢", color: C.gold,    bg: "rgba(251,191,36,0.08)",  border: "rgba(251,191,36,0.28)"  };
  if (score >= 70) return { label: "FORTE",         emoji: "🔵", color: "#60a5fa", bg: "rgba(96,165,250,0.08)",  border: "rgba(96,165,250,0.28)"  };
  if (score >= 55) return { label: "MODERADA",      emoji: "🟡", color: C.amber,   bg: "rgba(245,158,11,0.08)",  border: "rgba(245,158,11,0.28)"  };
  return              { label: "EXPERIMENTAL", emoji: "⚪", color: C.purple,  bg: "rgba(168,85,247,0.08)",  border: "rgba(168,85,247,0.28)"  };
}

interface CerebroSignal {
  id: string;
  simbolo: string;
  direction: string;
  source: string;
  confianca: number;
  score_tecnico?: number;
  score_fluxo?: number;
  score_contexto?: number;
  score_fundamental?: number;
  price_entrada?: number;
  tp_pct?: number;
  sl_pct?: number;
  status: string;
  aprovado: boolean;
  pnl_pct?: number;
  telegram_entry: boolean;
}

interface BotWallet {
  ativo?: boolean;
  trades?: { tipo?: string; pnl_brl?: number; status?: string }[];
}

interface TgConfig { bot_token?: string; chat_id?: string; }

function getCerebroSignals(): CerebroSignal[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem("allwin_cerebro_v1") || "[]"); } catch { return []; }
}

function getBotStats() {
  if (typeof window === "undefined") return { activeBots: 0, totalBotOps: 0, botWinRate: null as number | null };
  try {
    const bots: BotWallet[] = JSON.parse(localStorage.getItem("allwin_bot_wallets_v1") || "[]");
    const srd: BotWallet[]  = JSON.parse(localStorage.getItem("allwin_srd_wallets_v1")  || "[]");
    const activeBots = bots.filter(b => b.ativo).length + srd.filter(b => b.ativo).length;
    let wins = 0, losses = 0, totalBotOps = 0;
    for (const w of [...bots, ...srd]) for (const t of w.trades || []) {
      if (t.tipo !== "V" && t.status !== "tp" && t.status !== "sl") continue;
      totalBotOps++;
      if ((t.pnl_brl ?? 0) > 0 || t.status === "tp") wins++; else losses++;
    }
    const total = wins + losses;
    return { activeBots, totalBotOps, botWinRate: total > 0 ? (wins / total) * 100 : null };
  } catch { return { activeBots: 0, totalBotOps: 0, botWinRate: null }; }
}

function getMemoryStats(signals: CerebroSignal[]) {
  const closed = signals.filter(s => s.status === "tp" || s.status === "sl");
  const wins   = closed.filter(s => s.status === "tp").length;
  let patterns = 0;
  try { patterns = JSON.parse(localStorage.getItem("allwin_cerebro_learn_v1") || "[]").length; } catch { /* */ }
  return { total: signals.length, wins, patterns };
}

function getTgConfig(): TgConfig {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(localStorage.getItem("allwin_tg_config_v1") || "{}"); } catch { return {}; }
}

// ────────────────────────────────────────────────────────
export default function FuturesCommandCenter() {
  const [signals,  setSignals]  = useState<CerebroSignal[]>([]);
  const [botStats, setBotStats] = useState({ activeBots: 0, totalBotOps: 0, botWinRate: null as number | null });
  const [tgConfig, setTgConfig] = useState<TgConfig>({});
  const [mounted,  setMounted]  = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [lastSync, setLastSync] = useState<Date | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/cerebro/signals?limit=200`);
      if (res.ok) {
        const data: CerebroSignal[] = await res.json();
        localStorage.setItem("allwin_cerebro_v1", JSON.stringify(data));
        setSignals(data);
      } else { setSignals(getCerebroSignals()); }
    } catch { setSignals(getCerebroSignals()); }
    setBotStats(getBotStats());
    setTgConfig(getTgConfig());
    setLastSync(new Date());
    setLoading(false);
  }, []);

  useEffect(() => {
    setMounted(true);
    const cached = getCerebroSignals();
    setSignals(cached);
    setBotStats(getBotStats());
    setTgConfig(getTgConfig());
    setLastSync(new Date());
    refresh();
  }, [refresh]);

  const approved = signals.filter(s => s.status === "aprovado");
  const closed   = signals.filter(s => s.status === "tp" || s.status === "sl");
  const winRate  = closed.length > 0 ? (closed.filter(s => s.status === "tp").length / closed.length * 100) : null;
  const memory   = getMemoryStats(signals);

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-page)" }}>

      {/* ── HEADER ──────────────────────────────────────── */}
      <div style={{ background: "linear-gradient(135deg, rgba(99,102,241,0.07) 0%, rgba(79,82,204,0.03) 100%)", borderBottom: `1px solid ${C.border}`, padding: "20px 0" }}>
        <div className="max-w-7xl mx-auto px-5">

          <div className="flex items-center gap-2 mb-3" style={{ fontSize: 11, color: "var(--text-muted)" }}>
            <Link href="/" style={{ color: "var(--text-muted)", textDecoration: "none" }}
              onMouseEnter={e => e.currentTarget.style.color = "#818cf8"}
              onMouseLeave={e => e.currentTarget.style.color = "var(--text-muted)"}>Home</Link>
            <ChevronRight size={11} />
            <span style={{ color: C.brain, fontWeight: 700 }}>Futures · Mesa Quant</span>
          </div>

          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-3">
              <div style={{ width: 42, height: 42, borderRadius: 12, background: "rgba(99,102,241,0.15)", border: "1.5px solid rgba(99,102,241,0.35)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 0 20px rgba(99,102,241,0.25)" }}>
                <Brain size={20} style={{ color: C.brain }} />
              </div>
              <div>
                <div style={{ fontSize: 22, fontWeight: 900, color: "var(--text-primary)", letterSpacing: "-0.03em", lineHeight: 1 }}>Mesa Quant</div>
                <div style={{ fontSize: 11, color: C.brain, fontWeight: 700, letterSpacing: "1.2px", textTransform: "uppercase" }}>Cérebro IA · Filtros · Execução · Telegram</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {lastSync && (
                <span style={{ fontSize: 10, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 4 }}>
                  <Clock size={10} />{lastSync.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                </span>
              )}
              <button onClick={refresh} disabled={loading} style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 14px", borderRadius: 9, fontSize: 11.5, fontWeight: 600, cursor: "pointer", border: `1px solid ${C.border}`, background: C.bg, color: C.brain, transition: "all 0.15s" }}
                onMouseEnter={e => e.currentTarget.style.background = "rgba(99,102,241,0.1)"}
                onMouseLeave={e => e.currentTarget.style.background = C.bg}>
                <RefreshCw size={11} style={{ animation: loading ? "spin 1s linear infinite" : "none" }} />
                Sincronizar
              </button>
            </div>
          </div>

          {/* Pipeline flow indicator */}
          <div className="flex items-center gap-1.5 mt-5 overflow-x-auto no-scrollbar pb-1">
            {[
              { label: "MERCADO",   color: "#94a3b8",  active: true },
              { label: "CÉREBRO",   color: C.brain,    active: true },
              { label: "FILTROS",   color: C.purple,   active: true },
              { label: "APROVAÇÃO", color: C.emerald,  active: approved.length > 0 },
              { label: "EXECUÇÃO",  color: C.amber,    active: botStats.activeBots > 0 },
              { label: "TELEGRAM",  color: "#22c55e",  active: !!tgConfig.bot_token },
            ].map((step, i) => (
              <div key={step.label} className="flex items-center gap-1.5 shrink-0">
                {i > 0 && <ArrowRight size={11} style={{ color: "rgba(255,255,255,0.15)" }} />}
                <div style={{ padding: "5px 12px", borderRadius: 99, fontSize: 9.5, fontWeight: 800, letterSpacing: "0.8px", textTransform: "uppercase", background: step.active ? `${step.color}15` : "rgba(255,255,255,0.03)", border: `1px solid ${step.active ? `${step.color}35` : "rgba(255,255,255,0.06)"}`, color: step.active ? step.color : "rgba(255,255,255,0.2)" }}>
                  {step.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── METRICS STRIP ───────────────────────────────── */}
      {mounted && (
        <div style={{ borderBottom: `1px solid ${C.border}`, background: C.bg }}>
          <div className="max-w-7xl mx-auto px-5">
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-0" style={{ borderLeft: `1px solid ${C.border}` }}>
              {[
                { label: "Sinais Aprovados",  value: `${approved.length}`,                                    color: C.brain   },
                { label: "No Histórico",       value: `${signals.length}`,                                     color: "var(--text-muted)" },
                { label: "Win Rate Cérebro",   value: winRate != null ? `${winRate.toFixed(0)}%` : "—",        color: winRate != null && winRate >= 50 ? C.emerald : C.red },
                { label: "Bots Ativos",        value: `${botStats.activeBots}`,                                color: C.amber   },
                { label: "Memória IA",         value: `${memory.total} ops`,                                   color: C.purple  },
              ].map(({ label, value, color }) => (
                <div key={label} className="flex flex-col justify-center px-4 py-3" style={{ borderRight: `1px solid ${C.border}` }}>
                  <div style={{ fontSize: 9, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 2 }}>{label}</div>
                  <div style={{ fontSize: 18, fontWeight: 900, color, fontVariantNumeric: "tabular-nums", lineHeight: 1.1 }}>{value}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── 3-COLUMN LAYOUT ─────────────────────────────── */}
      <div className="max-w-7xl mx-auto px-5 py-7">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

          {/* ── COL 1 (4/12): CÉREBRO + MEMÓRIA + FILTROS ── */}
          <div className="lg:col-span-4 flex flex-col gap-5">

            <Panel title="Cérebro IA" Icon={Brain} color={C.brain} extra={
              <PulseDot color={C.brain} />
            }>
              <div className="flex flex-col gap-3">
                <SRow label="Estado"           value="Analisando"          color={C.emerald} pulse />
                <SRow label="Sinais abertos"   value={`${approved.length}`} color={C.brain} />
                <SRow label="Ops no histórico" value={`${signals.length}`}  color="var(--text-muted)" />
                {winRate != null && <SRow label="Acerto Cérebro" value={`${winRate.toFixed(1)}%`} color={winRate >= 60 ? C.emerald : C.amber} />}
              </div>
              <div className="mt-4 pt-4" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                <NavLink href="/cripto/cerebro" Icon={Brain} color={C.brain} label="Painel completo do Cérebro" />
              </div>
            </Panel>

            <Panel title="Memória do Cérebro" Icon={Activity} color={C.purple} extra={
              <Chip label="BANCO DE DADOS" color={C.purple} />
            }>
              <div className="grid grid-cols-3 gap-2 mb-3">
                {[
                  { label: "Total",    value: memory.total,    color: "var(--text-muted)" },
                  { label: "Vitórias", value: memory.wins,     color: C.emerald },
                  { label: "Padrões",  value: memory.patterns, color: C.purple  },
                ].map(({ label, value, color }) => (
                  <div key={label} style={{ textAlign: "center", padding: "10px 6px", borderRadius: 10, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                    <div style={{ fontSize: 18, fontWeight: 900, color, fontVariantNumeric: "tabular-nums" }}>{value}</div>
                    <div style={{ fontSize: 9.5, color: "var(--text-muted)", marginTop: 2 }}>{label}</div>
                  </div>
                ))}
              </div>
              <p style={{ fontSize: 11.5, color: "var(--text-muted)", lineHeight: 1.65 }}>
                O Cérebro consulta este banco antes de cada entrada — ajusta a confiança com base em padrões históricos do mesmo ativo.
              </p>
            </Panel>

            <Panel title="Filtros Internos" Icon={Shield} color={C.amber} extra={<Chip label="4 ESPECIALISTAS" color={C.amber} />}>
              <p style={{ fontSize: 11.5, color: "var(--text-muted)", lineHeight: 1.6, marginBottom: 12 }}>
                Cada especialista avalia e entrega sua nota. O Cérebro agrega tudo para a decisão final.
              </p>
              <div className="flex flex-col gap-2">
                {[
                  { label: "RS Score",    desc: "Força e direção",       Icon: BarChart2, color: C.amber   },
                  { label: "Sinais IA",   desc: "Probabilidade técnica", Icon: Zap,       color: C.purple  },
                  { label: "IA Analista", desc: "Cenário completo",      Icon: BookOpen,  color: C.cyan    },
                  { label: "Tiro Curto",  desc: "Oportunidades rápidas", Icon: Target,    color: C.emerald },
                ].map(({ label, desc, Icon, color }) => (
                  <div key={label} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 10, background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.06)" }}>
                    <div style={{ width: 28, height: 28, borderRadius: 8, background: `${color}15`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <Icon size={12} style={{ color }} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)" }}>{label}</div>
                      <div style={{ fontSize: 10.5, color: "var(--text-muted)" }}>{desc}</div>
                    </div>
                    <span style={{ fontSize: 10, color, fontWeight: 800 }}>ativo</span>
                  </div>
                ))}
              </div>
            </Panel>
          </div>

          {/* ── COL 2 (5/12): APROVAÇÃO DE ENTRADAS ───────── */}
          <div className="lg:col-span-5 flex flex-col gap-5">
            <Panel title="Entradas Aprovadas" Icon={CheckCircle} color={C.emerald} extra={
              <div className="flex items-center gap-2">
                {approved.length > 0 && <Chip label={`${approved.length} ATIVAS`} color={C.emerald} />}
                <Link href="/futures/historico" style={{ fontSize: 10.5, padding: "3px 9px", borderRadius: 99, background: C.bg, border: `1px solid ${C.border}`, color: C.brain, fontWeight: 700, textDecoration: "none", display: "flex", alignItems: "center", gap: 4 }}
                  onMouseEnter={e => e.currentTarget.style.background = "rgba(99,102,241,0.1)"}
                  onMouseLeave={e => e.currentTarget.style.background = C.bg}>
                  Ver histórico completo →
                </Link>
              </div>
            }>
              {approved.length === 0 ? (
                <Empty icon="🧠" text="Nenhum sinal aprovado no momento. O Cérebro está avaliando o mercado." />
              ) : (
                <div className="flex flex-col gap-3" style={{ maxHeight: 480, overflowY: "auto", paddingRight: 4 }}>
                  {approved.slice().reverse().map(sig => <SignalCard key={sig.id} sig={sig} />)}
                </div>
              )}

              <div className="mt-4 pt-4" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 700, letterSpacing: "0.5px", textTransform: "uppercase", marginBottom: 8 }}>
                  Últimas fechadas
                </div>
                {closed.length === 0
                  ? <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Nenhuma finalizada ainda.</span>
                  : <div className="flex flex-col gap-2">{closed.slice(-6).reverse().map(sig => <ClosedRow key={sig.id} sig={sig} />)}</div>
                }
              </div>
            </Panel>
          </div>

          {/* ── COL 3 (3/12): EXECUÇÃO + TELEGRAM ─────────── */}
          <div className="lg:col-span-3 flex flex-col gap-5">

            <Panel title="Auto Trade" Icon={Bot} color={C.amber} extra={<Chip label="EXECUÇÃO" color={C.amber} />}>
              <div className="grid grid-cols-2 gap-2 mb-3">
                <MiniStat label="Bots ativos" value={botStats.activeBots > 0 ? `${botStats.activeBots}` : "—"} color={C.emerald} />
                <MiniStat label="Ops totais"  value={`${botStats.totalBotOps}`}                               color={C.amber}   />
              </div>
              {botStats.botWinRate != null && (
                <div style={{ padding: "8px 12px", borderRadius: 10, marginBottom: 12, background: botStats.botWinRate >= 50 ? "rgba(16,185,129,0.06)" : "rgba(239,68,68,0.06)", border: `1px solid ${botStats.botWinRate >= 50 ? "rgba(16,185,129,0.2)" : "rgba(239,68,68,0.2)"}` }}>
                  <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 1 }}>Win Rate dos Bots</div>
                  <div style={{ fontSize: 22, fontWeight: 900, color: botStats.botWinRate >= 50 ? C.emerald : C.red }}>{botStats.botWinRate.toFixed(1)}%</div>
                </div>
              )}
              <div className="flex flex-col gap-2">
                <NavLink href="/cripto/futures" Icon={Brain} color={C.brain} label="IA Engine (perfis)" />
                <NavLink href="/cripto/bot-srd" Icon={Cpu}   color={C.cyan}  label="BOT SRD (scalp)" />
              </div>
            </Panel>

            <Panel title="Scalp / SRD" Icon={Flame} color={C.cyan} extra={<Chip label="CURTO PRAZO" color={C.cyan} />}>
              <p style={{ fontSize: 11.5, color: "var(--text-muted)", lineHeight: 1.65, marginBottom: 10 }}>
                O Cérebro gera o sinal, o BOT SRD executa com gestão automática de Stop/TP.
              </p>
              <NavLink href="/cripto/bot-srd" Icon={Cpu} color={C.cyan} label="Gerenciar BOT SRD" center />
            </Panel>

            <Panel title="Telegram" Icon={Send} color="#22c55e" extra={
              tgConfig.bot_token
                ? <Chip label="CONECTADO"    color="#22c55e" />
                : <Chip label="DESCONECTADO" color={C.red}  />
            }>
              {tgConfig.bot_token ? (
                <>
                  <p style={{ fontSize: 11.5, color: "var(--text-muted)", lineHeight: 1.65, marginBottom: 10 }}>
                    Configurado. O Cérebro envia somente o resultado final aprovado.
                  </p>
                  <div style={{ padding: "10px 12px", borderRadius: 10, background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.15)", fontFamily: "monospace", fontSize: 10.5, color: "#86efac", lineHeight: 1.7 }}>
                    🧠 <strong>CÉREBRO APROVOU</strong><br/>
                    BTCUSDT · LONG<br/>
                    🟢 PREMIUM · 87%<br/>
                    Entrada / Alvo / Stop
                  </div>
                </>
              ) : (
                <>
                  <p style={{ fontSize: 11.5, color: "var(--text-muted)", lineHeight: 1.65, marginBottom: 10 }}>
                    Configure o bot token para receber sinais aprovados no seu Telegram.
                  </p>
                  <NavLink href="/cripto/cerebro" Icon={Send} color="#22c55e" label="Configurar no Cérebro" center />
                </>
              )}
            </Panel>

          </div>
        </div>
      </div>

      <style>{`
        @keyframes spin      { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes pulseDot  { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
      `}</style>
    </div>
  );
}

// ── Shared primitives ────────────────────────────────────

function Panel({ title, Icon, color, extra, children }: {
  title: string; Icon: React.ElementType; color: string;
  extra?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 18, overflow: "hidden" }}>
      <div style={{ padding: "13px 15px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 8, background: `${color}04` }}>
        <Icon size={13} style={{ color }} />
        <span style={{ fontSize: 11.5, fontWeight: 800, color, letterSpacing: "0.5px", flex: 1, textTransform: "uppercase" }}>{title}</span>
        {extra}
      </div>
      <div style={{ padding: "15px" }}>{children}</div>
    </div>
  );
}

function Chip({ label, color }: { label: string; color: string }) {
  return (
    <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 99, background: `${color}15`, border: `1px solid ${color}30`, color, fontWeight: 700, letterSpacing: "0.3px" }}>
      {label}
    </span>
  );
}

function PulseDot({ color }: { color: string }) {
  return <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, boxShadow: `0 0 8px ${color}`, display: "inline-block", animation: "pulseDot 1.8s ease-in-out infinite" }} />;
}

function SRow({ label, value, color, pulse }: { label: string; value: string; color: string; pulse?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{label}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
        {pulse && <span style={{ width: 6, height: 6, borderRadius: "50%", background: color, display: "inline-block", animation: "pulseDot 1.5s ease-in-out infinite" }} />}
        <span style={{ fontSize: 12.5, fontWeight: 700, color }}>{value}</span>
      </div>
    </div>
  );
}

function MiniStat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ textAlign: "center", padding: "9px 6px", borderRadius: 10, background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.06)" }}>
      <div style={{ fontSize: 18, fontWeight: 900, color, fontVariantNumeric: "tabular-nums" }}>{value}</div>
      <div style={{ fontSize: 9.5, color: "var(--text-muted)", marginTop: 2 }}>{label}</div>
    </div>
  );
}

function NavLink({ href, Icon, color, label, center }: { href: string; Icon: React.ElementType; color: string; label: string; center?: boolean }) {
  return (
    <Link href={href} style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 11px", borderRadius: 9, background: `${color}07`, border: `1px solid ${color}20`, textDecoration: "none", fontSize: 12, color, fontWeight: 600, justifyContent: center ? "center" : "flex-start" }}
      onMouseEnter={e => e.currentTarget.style.background = `${color}14`}
      onMouseLeave={e => e.currentTarget.style.background = `${color}07`}>
      <Icon size={12} />{label}
    </Link>
  );
}

function Empty({ icon, text }: { icon: string; text: string }) {
  return (
    <div style={{ textAlign: "center", padding: "28px 16px", color: "var(--text-muted)" }}>
      <div style={{ fontSize: 32, marginBottom: 10 }}>{icon}</div>
      <div style={{ fontSize: 12.5, lineHeight: 1.6, maxWidth: 280, margin: "0 auto" }}>{text}</div>
    </div>
  );
}

function SignalCard({ sig }: { sig: CerebroSignal }) {
  const [expanded, setExpanded] = useState(false);
  const tier    = brainTier(sig.confianca);
  const isLong  = sig.direction.toUpperCase() === "LONG";
  const dirCol  = isLong ? C.emerald : C.red;
  const DirIcon = isLong ? TrendingUp : TrendingDown;

  const specialists = [
    { label: "RS Score",    Icon: BarChart2, score: sig.score_tecnico    ?? null, color: C.amber   },
    { label: "Sinais IA",   Icon: Zap,       score: sig.score_fluxo      ?? null, color: C.purple  },
    { label: "IA Analista", Icon: BookOpen,  score: sig.score_contexto   ?? null, color: C.cyan    },
    { label: "Tiro Curto",  Icon: Target,    score: sig.score_fundamental ?? null, color: C.emerald },
  ];

  return (
    <div style={{ borderRadius: 14, border: `1px solid ${tier.border}`, background: tier.bg, overflow: "hidden", transition: "box-shadow 0.15s" }}
      onMouseEnter={e => e.currentTarget.style.boxShadow = `0 0 18px ${tier.color}12`}
      onMouseLeave={e => e.currentTarget.style.boxShadow = "none"}>

      <button type="button" onClick={() => setExpanded(p => !p)}
        style={{ width: "100%", padding: "12px 13px", background: "transparent", border: "none", cursor: "pointer", textAlign: "left" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 30, height: 30, borderRadius: 9, background: `${dirCol}15`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <DirIcon size={14} style={{ color: dirCol }} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 14, fontWeight: 900, color: "var(--text-primary)" }}>{sig.simbolo.replace("USDT","")}</span>
              <span style={{ fontSize: 9.5, fontWeight: 800, padding: "2px 6px", borderRadius: 99, background: `${dirCol}15`, color: dirCol, border: `1px solid ${dirCol}25` }}>{sig.direction.toUpperCase()}</span>
            </div>
            <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 1 }}>{sig.source}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: tier.color }}>{tier.emoji} {tier.label}</div>
            <div style={{ fontSize: 14, fontWeight: 900, color: tier.color, fontVariantNumeric: "tabular-nums" }}>{sig.confianca.toFixed(0)}%</div>
          </div>
        </div>
      </button>

      {expanded && (
        <div style={{ padding: "0 13px 13px", borderTop: `1px solid ${tier.border}` }}>
          <div className="grid grid-cols-2 gap-1.5 mt-3 mb-3">
            {specialists.map(({ label, Icon, score, color }) => (
              <div key={label} style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 8px", borderRadius: 8, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <Icon size={10} style={{ color, flexShrink: 0 }} />
                <span style={{ fontSize: 10, color: "var(--text-muted)", flex: 1 }}>{label}</span>
                <span style={{ fontSize: 11, fontWeight: 800, color: score != null ? color : "var(--text-muted)" }}>
                  {score != null ? `${score.toFixed(0)}%` : "—"}
                </span>
              </div>
            ))}
          </div>

          {sig.price_entrada && (
            <div className="grid grid-cols-3 gap-1.5">
              {[
                { label: "Entrada", value: sig.price_entrada,                                       color: "var(--text-primary)" },
                { label: "Alvo",    value: sig.price_entrada * (1 + (sig.tp_pct ?? 2) / 100),       color: C.emerald             },
                { label: "Stop",    value: sig.price_entrada * (1 - (sig.sl_pct ?? 1) / 100),       color: C.red                 },
              ].map(({ label, value, color }) => (
                <div key={label} style={{ textAlign: "center", padding: "6px 4px", borderRadius: 8, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                  <div style={{ fontSize: 9.5, color: "var(--text-muted)" }}>{label}</div>
                  <div style={{ fontSize: 11.5, fontWeight: 800, color, fontVariantNumeric: "tabular-nums" }}>
                    {value.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {sig.telegram_entry && (
            <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 4, fontSize: 10.5, color: "#22c55e" }}>
              <Send size={9} /> Enviado no Telegram
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ClosedRow({ sig }: { sig: CerebroSignal }) {
  const isWin    = sig.status === "tp";
  const StatusIcon = isWin ? CheckCircle : XCircle;
  const color    = isWin ? C.emerald : C.red;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", borderRadius: 10, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
      <StatusIcon size={12} style={{ color, flexShrink: 0 }} />
      <span style={{ fontSize: 12, color: "var(--text-secondary)", flex: 1 }}>{sig.simbolo.replace("USDT","")}</span>
      <span style={{ fontSize: 11, fontWeight: 700, color, fontVariantNumeric: "tabular-nums" }}>
        {sig.pnl_pct != null ? `${sig.pnl_pct > 0 ? "+" : ""}${sig.pnl_pct.toFixed(2)}%` : (isWin ? "TP" : "SL")}
      </span>
      <span style={{ fontSize: 9.5, padding: "2px 6px", borderRadius: 99, background: `${color}12`, color, fontWeight: 700 }}>{sig.direction}</span>
    </div>
  );
}
