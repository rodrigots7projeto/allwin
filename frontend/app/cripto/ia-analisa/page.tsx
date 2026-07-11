"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BrainCircuit, CheckCircle2, XCircle, RotateCcw, Sparkles, TrendingUp, TrendingDown, Minus, Clock, AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "https://allwin-backend.up.railway.app/api/v1";

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface Sugestao {
  campo: string;
  valor_atual: number;
  valor_sugerido: number;
  motivo: string;
  confianca: number;
  status?: "pendente" | "aprovado" | "rejeitado";
}

interface Analise {
  perfil_id: string;
  status: "otimo" | "bom" | "atencao" | "critico";
  resumo: string;
  sugestoes: Sugestao[];
  _criado_em?: string;
}

interface Metrica {
  perfil_id: string;
  total_compras: number;
  total_vendas: number;
  win_rate: number | null;
  total_pnl_brl: number;
  avg_pnl_brl: number;
  avg_win_brl: number;
  avg_loss_brl: number;
  roi_pct: number;
  saldo_livre: number;
  top_simbolos: { simbolo: string; pnl: number }[];
  bot_simbolos: { simbolo: string; pnl: number }[];
  dados_suficientes: boolean;
  config?: Record<string, unknown>;
}

interface Override {
  [campo: string]: number | string | undefined;
  _aprovado_em?: string;
}

// ── Perfis config do frontend (enviados ao backend para análise) ───────────────

const PERFIS_CONFIG = [
  { id: "f_cons_normal",  nome: "Conservador Normal",     score_compra: 68, score_venda: 45, bull_pct_min: 53, sl_pct: 0.008, tp_pct: 0.020, stake_base: 1000, direction_allowed: "BOTH" },
  { id: "f_cons_pro",     nome: "Conservador PRO",        score_compra: 65, score_venda: 42, bull_pct_min: 51, sl_pct: 0.009, tp_pct: 0.025, stake_base: 1000, direction_allowed: "BOTH" },
  { id: "f_cons_promax",  nome: "Conservador PRO MAX",    score_compra: 62, score_venda: 40, bull_pct_min: 49, sl_pct: 0.010, tp_pct: 0.030, stake_base: 1000, direction_allowed: "BOTH" },
  { id: "f_mod_normal",   nome: "Moderado Normal",        score_compra: 60, score_venda: 38, bull_pct_min: 47, sl_pct: 0.010, tp_pct: 0.025, stake_base: 1000, direction_allowed: "BOTH" },
  { id: "f_mod_pro",      nome: "Moderado PRO",           score_compra: 55, score_venda: 37, bull_pct_min: 45, sl_pct: 0.012, tp_pct: 0.030, stake_base: 1000, direction_allowed: "BOTH" },
  { id: "f_mod_promax",   nome: "Moderado PRO MAX",       score_compra: 52, score_venda: 35, bull_pct_min: 43, sl_pct: 0.013, tp_pct: 0.035, stake_base: 1000, direction_allowed: "BOTH" },
  { id: "f_agr_normal",   nome: "Agressivo Normal",       score_compra: 48, score_venda: 33, bull_pct_min: 41, sl_pct: 0.013, tp_pct: 0.035, stake_base: 1000, direction_allowed: "BOTH" },
  { id: "f_agr_pro",      nome: "Agressivo PRO",          score_compra: 45, score_venda: 32, bull_pct_min: 39, sl_pct: 0.015, tp_pct: 0.040, stake_base: 1000, direction_allowed: "BOTH" },
  { id: "f_agr_promax",   nome: "Agressivo PRO MAX",      score_compra: 42, score_venda: 30, bull_pct_min: 37, sl_pct: 0.017, tp_pct: 0.050, stake_base: 1000, direction_allowed: "BOTH" },
  { id: "f_cons_alav",    nome: "Conservador Alavancado", score_compra: 72, score_venda: 50, bull_pct_min: 54, sl_pct: 0.006, tp_pct: 0.015, stake_base: 5000, direction_allowed: "BOTH" },
  { id: "f_mod_alav",     nome: "Moderado Alavancado",    score_compra: 68, score_venda: 47, bull_pct_min: 52, sl_pct: 0.007, tp_pct: 0.018, stake_base: 5000, direction_allowed: "BOTH" },
  { id: "f_agr_alav",     nome: "Agressivo Alavancado",   score_compra: 63, score_venda: 43, bull_pct_min: 48, sl_pct: 0.008, tp_pct: 0.020, stake_base: 5000, direction_allowed: "BOTH" },
  { id: "f_sub_cons",     nome: "Subida Normal",          score_compra: 48, score_venda: 33, bull_pct_min: 51, sl_pct: 0.010, tp_pct: 0.035, stake_base: 500,  direction_allowed: "LONG" },
  { id: "f_sub_mod",      nome: "Subida PRO",             score_compra: 40, score_venda: 30, bull_pct_min: 48, sl_pct: 0.012, tp_pct: 0.040, stake_base: 500,  direction_allowed: "LONG" },
  { id: "f_sub_agr",      nome: "Subida PRO MAX",         score_compra: 35, score_venda: 28, bull_pct_min: 45, sl_pct: 0.015, tp_pct: 0.050, stake_base: 500,  direction_allowed: "LONG" },
  { id: "f_short_cons",   nome: "Short Conservador",      score_compra: 68, score_venda: 45, bull_pct_min: 40, sl_pct: 0.008, tp_pct: 0.020, stake_base: 500,  direction_allowed: "SHORT" },
  { id: "f_short_mod",    nome: "Short Moderado",         score_compra: 60, score_venda: 40, bull_pct_min: 35, sl_pct: 0.010, tp_pct: 0.025, stake_base: 500,  direction_allowed: "SHORT" },
] as const;

type PerfilId = typeof PERFIS_CONFIG[number]["id"];

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number, dec = 2) { return n.toLocaleString("pt-BR", { minimumFractionDigits: dec, maximumFractionDigits: dec }); }
function fmtPct(v: number | null) { if (v === null) return "—"; return `${v >= 0 ? "+" : ""}${fmt(v, 1)}%`; }
function fmtCampo(campo: string) {
  const map: Record<string, string> = {
    score_compra: "Score Entrada", score_venda: "Score Saída", bull_pct_min: "Bull% Mín",
    sl_pct: "Stop Loss %", tp_pct: "Take Profit %", stake_base: "Stake (R$)",
    score_min: "Score Mín", stake: "Stake (R$)", max_positions: "Max Posições",
  };
  return map[campo] || campo;
}
function fmtValor(campo: string, val: number) {
  if (campo.includes("_pct")) return `${(val * 100).toFixed(2)}%`;
  if (campo.includes("stake") || campo.includes("capital")) return `R$ ${fmt(val, 0)}`;
  return String(val);
}
function statusCor(s: string) {
  if (s === "otimo")   return { bg: "rgba(16,185,129,0.12)", border: "#10b981", text: "#10b981", label: "Ótimo" };
  if (s === "bom")     return { bg: "rgba(59,130,246,0.12)", border: "#3b82f6", text: "#3b82f6", label: "Bom" };
  if (s === "atencao") return { bg: "rgba(245,158,11,0.12)", border: "#f59e0b", text: "#f59e0b", label: "Atenção" };
  return                      { bg: "rgba(239,68,68,0.12)",  border: "#ef4444", text: "#ef4444", label: "Crítico" };
}
function confiancaCor(c: number) {
  if (c >= 80) return "#10b981";
  if (c >= 60) return "#f59e0b";
  return "#ef4444";
}
function tempoAtras(iso?: string) {
  if (!iso) return null;
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  if (h > 0) return `há ${h}h${m > 0 ? ` ${m}min` : ""}`;
  if (m > 0) return `há ${m}min`;
  return "agora";
}

// ── Componentes ───────────────────────────────────────────────────────────────

function StatBox({ label, value, sub, cor }: { label: string; value: string; sub?: string; cor?: string }) {
  return (
    <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--bg-card)]">
      <div className="text-[11px] text-[var(--text-secondary)] mb-1">{label}</div>
      <div className="font-black text-lg leading-tight" style={{ color: cor ?? "var(--text-primary)" }}>{value}</div>
      {sub && <div className="text-[11px] mt-0.5" style={{ color: cor ?? "var(--text-secondary)" }}>{sub}</div>}
    </div>
  );
}

function SugestaoCard({
  s, index, perfil_id, tipo, onAprovar, onRejeitar,
}: {
  s: Sugestao; index: number; perfil_id: string; tipo: string;
  onAprovar: (pid: string, campo: string, valor: number) => void;
  onRejeitar: (pid: string, campo: string, idx: number) => void;
}) {
  const aprovado  = s.status === "aprovado";
  const rejeitado = s.status === "rejeitado";
  const pendente  = !aprovado && !rejeitado;

  return (
    <div className="rounded-lg border p-3 text-sm transition-all"
      style={{
        borderColor: aprovado ? "#10b981" : rejeitado ? "#374151" : "#f59e0b",
        background:  aprovado ? "rgba(16,185,129,0.06)" : rejeitado ? "rgba(255,255,255,0.02)" : "rgba(245,158,11,0.06)",
        opacity:     rejeitado ? 0.5 : 1,
      }}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div>
          <span className="font-semibold text-[var(--text-primary)]">{fmtCampo(s.campo)}</span>
          <span className="mx-2 text-[var(--text-muted)]">→</span>
          <span className="text-[var(--text-secondary)]">
            <span style={{ textDecoration: "line-through", opacity: 0.6 }}>{fmtValor(s.campo, s.valor_atual)}</span>
            <span className="mx-1 text-[var(--text-muted)]">→</span>
            <span className="font-bold text-white">{fmtValor(s.campo, s.valor_sugerido)}</span>
          </span>
        </div>
        <div className="text-[10px] font-bold shrink-0 px-2 py-0.5 rounded-full" style={{ background: "rgba(0,0,0,0.3)", color: confiancaCor(s.confianca) }}>
          {s.confianca}% conf.
        </div>
      </div>
      <p className="text-[12px] text-[var(--text-secondary)] mb-3 leading-relaxed">{s.motivo}</p>

      {pendente && (
        <div className="flex gap-2">
          <button onClick={() => onAprovar(perfil_id, s.campo, s.valor_sugerido)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-all hover:brightness-110"
            style={{ background: "rgba(16,185,129,0.15)", border: "1px solid rgba(16,185,129,0.4)", color: "#10b981" }}>
            <CheckCircle2 size={12} /> Aprovar
          </button>
          <button onClick={() => onRejeitar(perfil_id, s.campo, index)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-all hover:brightness-110"
            style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", color: "#ef4444" }}>
            <XCircle size={12} /> Rejeitar
          </button>
        </div>
      )}
      {aprovado  && <div className="flex items-center gap-1.5 text-[12px] text-emerald-400 font-semibold"><CheckCircle2 size={12}/> Aprovado e aplicado</div>}
      {rejeitado && <div className="flex items-center gap-1.5 text-[12px] text-red-400"><XCircle size={12}/> Rejeitado</div>}
    </div>
  );
}

function PerfilAnaliseCard({
  analise, metrica, overrides, tipo, onAprovar, onRejeitar, onReverterOverride,
}: {
  analise?: Analise;
  metrica?: Metrica;
  overrides?: Override;
  tipo: string;
  onAprovar: (pid: string, campo: string, valor: number) => void;
  onRejeitar: (pid: string, campo: string, idx: number) => void;
  onReverterOverride: (pid: string) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const pid    = analise?.perfil_id ?? metrica?.perfil_id ?? "";
  const cfg    = PERFIS_CONFIG.find(p => p.id === pid);
  const nome   = cfg?.nome ?? pid;
  const sc     = analise ? statusCor(analise.status) : null;
  const wr     = metrica?.win_rate;
  const roi    = metrica?.roi_pct ?? 0;
  const trades = metrica?.total_vendas ?? 0;

  const temOverride = overrides && Object.keys(overrides).filter(k => k !== "_aprovado_em").length > 0;

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden">
      {/* Header */}
      <div className="p-4 cursor-pointer" onClick={() => setAberto(a => !a)}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="font-bold text-[var(--text-primary)] text-sm">{nome}</span>
              {sc && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                  style={{ background: sc.bg, border: `1px solid ${sc.border}`, color: sc.text }}>
                  {sc.label}
                </span>
              )}
              {temOverride && (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                  style={{ background: "rgba(139,92,246,0.15)", border: "1px solid rgba(139,92,246,0.4)", color: "#a78bfa" }}>
                  ✦ Override ativo
                </span>
              )}
            </div>
            {analise?.resumo && <p className="text-[12px] text-[var(--text-secondary)] leading-relaxed">{analise.resumo}</p>}
            {!analise && !metrica?.dados_suficientes && (
              <p className="text-[12px] text-[var(--text-muted)]">Aguardando histórico de trades para análise...</p>
            )}
          </div>
          <div className="flex items-center gap-4 shrink-0">
            {/* Mini métricas */}
            <div className="hidden sm:flex gap-4 text-center">
              <div>
                <div className="text-[10px] text-[var(--text-muted)]">WR</div>
                <div className="text-[13px] font-bold" style={{ color: wr == null ? "var(--text-muted)" : wr >= 50 ? "#10b981" : "#ef4444" }}>
                  {wr !== null ? `${wr}%` : "—"}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-[var(--text-muted)]">ROI</div>
                <div className="text-[13px] font-bold" style={{ color: roi >= 0 ? "#10b981" : "#ef4444" }}>{fmtPct(roi)}</div>
              </div>
              <div>
                <div className="text-[10px] text-[var(--text-muted)]">Trades</div>
                <div className="text-[13px] font-bold text-[var(--text-primary)]">{trades}</div>
              </div>
            </div>
            {aberto ? <ChevronUp size={16} className="text-[var(--text-muted)]"/> : <ChevronDown size={16} className="text-[var(--text-muted)]"/>}
          </div>
        </div>
      </div>

      {/* Conteúdo expandido */}
      {aberto && (
        <div className="border-t border-[var(--border)] p-4 space-y-4">
          {/* Métricas detalhadas */}
          {metrica && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <StatBox label="Win Rate"     value={wr != null ? `${wr}%` : "—"} cor={wr != null ? (wr >= 50 ? "#10b981" : "#ef4444") : undefined} />
              <StatBox label="ROI"          value={fmtPct(roi)} cor={roi >= 0 ? "#10b981" : "#ef4444"} />
              <StatBox label="Total P&L"    value={`R$ ${fmt(metrica.total_pnl_brl, 0)}`} cor={metrica.total_pnl_brl >= 0 ? "#10b981" : "#ef4444"} />
              <StatBox label="Trades"       value={String(trades)} sub={`${metrica.total_compras} entradas`} />
              {metrica.avg_win_brl !== 0 && <StatBox label="Média Ganho"  value={`R$ ${fmt(metrica.avg_win_brl, 0)}`}  cor="#10b981" />}
              {metrica.avg_loss_brl !== 0 && <StatBox label="Média Perda"  value={`R$ ${fmt(Math.abs(metrica.avg_loss_brl), 0)}`} cor="#ef4444" />}
              {metrica.top_simbolos.length > 0 && (
                <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] col-span-2">
                  <div className="text-[11px] text-[var(--text-secondary)] mb-1">Melhores moedas</div>
                  {metrica.top_simbolos.map(s => (
                    <div key={s.simbolo} className="flex justify-between text-[12px]">
                      <span className="text-[var(--text-primary)]">{s.simbolo}</span>
                      <span className="text-emerald-400 font-semibold">+R$ {fmt(s.pnl, 0)}</span>
                    </div>
                  ))}
                </div>
              )}
              {metrica.bot_simbolos.length > 0 && (
                <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] col-span-2">
                  <div className="text-[11px] text-[var(--text-secondary)] mb-1">Piores moedas</div>
                  {metrica.bot_simbolos.map(s => (
                    <div key={s.simbolo} className="flex justify-between text-[12px]">
                      <span className="text-[var(--text-primary)]">{s.simbolo}</span>
                      <span className="text-red-400 font-semibold">R$ {fmt(s.pnl, 0)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Overrides ativos */}
          {temOverride && overrides && (
            <div className="rounded-xl border p-3" style={{ borderColor: "rgba(139,92,246,0.35)", background: "rgba(139,92,246,0.08)" }}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[12px] font-bold text-purple-400">Overrides ativos (aplicados)</span>
                <button onClick={() => onReverterOverride(pid)}
                  className="flex items-center gap-1 text-[11px] text-red-400 hover:text-red-300 transition-colors">
                  <RotateCcw size={11}/> Reverter tudo
                </button>
              </div>
              <div className="space-y-1">
                {Object.entries(overrides)
                  .filter(([k]) => k !== "_aprovado_em")
                  .map(([campo, val]) => (
                    <div key={campo} className="flex justify-between text-[12px]">
                      <span className="text-[var(--text-secondary)]">{fmtCampo(campo)}</span>
                      <span className="font-semibold text-purple-300">{fmtValor(campo, Number(val))}</span>
                    </div>
                  ))}
              </div>
              {overrides._aprovado_em && (
                <div className="mt-2 text-[10px] text-[var(--text-muted)]">Aprovado {tempoAtras(overrides._aprovado_em)}</div>
              )}
            </div>
          )}

          {/* Sugestões IA */}
          {analise && analise.sugestoes.length > 0 && (
            <div>
              <div className="text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-2">
                Sugestões da IA
              </div>
              <div className="space-y-2">
                {analise.sugestoes.map((s, idx) => (
                  <SugestaoCard
                    key={`${s.campo}-${idx}`}
                    s={s} index={idx} perfil_id={pid} tipo={tipo}
                    onAprovar={onAprovar} onRejeitar={onRejeitar}
                  />
                ))}
              </div>
            </div>
          )}
          {analise && analise.sugestoes.length === 0 && (
            <div className="text-center py-4 text-[var(--text-muted)] text-sm">
              Nenhuma sugestão — perfil está bem configurado para o histórico atual.
            </div>
          )}
          {!analise && metrica?.dados_suficientes && (
            <div className="text-center py-4 text-[var(--text-muted)] text-sm">
              Clique em "Analisar com IA" para gerar sugestões para este perfil.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────

export default function IAAnalisaPage() {
  const [tipo, setTipo] = useState<"futures" | "bot">("futures");
  const [analisando, setAnalisando] = useState(false);
  const [analises, setAnalises]     = useState<Record<string, Analise>>({});
  const [metricas, setMetricas]     = useState<Record<string, Metrica>>({});
  const [overrides, setOverrides]   = useState<Record<string, Override>>({});
  const [erroMsg, setErroMsg]       = useState<string | null>(null);
  const [ultimaAnalise, setUltimaAnalise] = useState<string | null>(null);

  // Carrega cache + overrides ao montar e quando muda tipo
  useEffect(() => {
    setAnalises({});
    setMetricas({});
    setOverrides({});
    setErroMsg(null);

    // Métricas
    fetch(`${API}/cripto/ia/metricas?tipo=${tipo}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d) return;
        const map: Record<string, Metrica> = {};
        for (const m of d.metricas) map[m.perfil_id] = m;
        setMetricas(map);
      }).catch(() => {});

    // Cache de análises
    fetch(`${API}/cripto/ia/analises?tipo=${tipo}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d || !d.analises?.length) return;
        const map: Record<string, Analise> = {};
        let maxTs: string | null = null;
        for (const a of d.analises) {
          map[a.perfil_id] = a;
          if (a._criado_em && (!maxTs || a._criado_em > maxTs)) maxTs = a._criado_em;
        }
        setAnalises(map);
        setUltimaAnalise(maxTs);
      }).catch(() => {});

    // Overrides
    fetch(`${API}/cripto/ia/overrides?tipo=${tipo}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d) return;
        setOverrides(d.overrides ?? {});
      }).catch(() => {});
  }, [tipo]);

  const analisar = useCallback(async () => {
    setAnalisando(true);
    setErroMsg(null);
    try {
      const perfis_config = tipo === "futures" ? PERFIS_CONFIG.map(p => ({ ...p })) : [];
      const r = await fetch(`${API}/cripto/ia/analisar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo, perfis_config }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err?.detail ?? `Erro ${r.status}`);
      }
      const data = await r.json();
      const map: Record<string, Analise> = { ...analises };
      let maxTs = ultimaAnalise;
      for (const a of (data.analises ?? [])) {
        map[a.perfil_id] = { ...a, sugestoes: a.sugestoes.map((s: Sugestao) => ({ ...s, status: "pendente" })) };
        const ts = new Date().toISOString();
        if (!maxTs || ts > maxTs) maxTs = ts;
      }
      setAnalises(map);
      setUltimaAnalise(maxTs);
    } catch (e: unknown) {
      setErroMsg(e instanceof Error ? e.message : "Erro desconhecido");
    } finally {
      setAnalisando(false);
    }
  }, [tipo, analises, ultimaAnalise]);

  const aprovar = useCallback(async (perfil_id: string, campo: string, valor_novo: number) => {
    // Atualiza estado local da sugestão
    setAnalises(prev => {
      const a = prev[perfil_id];
      if (!a) return prev;
      return {
        ...prev,
        [perfil_id]: {
          ...a,
          sugestoes: a.sugestoes.map(s =>
            s.campo === campo ? { ...s, status: "aprovado" } : s
          ),
        },
      };
    });

    // Salva override no backend
    try {
      await fetch(`${API}/cripto/ia/overrides`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ perfil_id, wallet_tipo: tipo, overrides: { [campo]: valor_novo } }),
      });
      // Atualiza overrides local
      setOverrides(prev => ({
        ...prev,
        [perfil_id]: { ...(prev[perfil_id] ?? {}), [campo]: valor_novo, _aprovado_em: new Date().toISOString() },
      }));
    } catch { /* silencioso */ }
  }, [tipo]);

  const rejeitar = useCallback((perfil_id: string, campo: string, idx: number) => {
    setAnalises(prev => {
      const a = prev[perfil_id];
      if (!a) return prev;
      return {
        ...prev,
        [perfil_id]: {
          ...a,
          sugestoes: a.sugestoes.map((s, i) =>
            i === idx ? { ...s, status: "rejeitado" } : s
          ),
        },
      };
    });
  }, []);

  const reverterOverride = useCallback(async (perfil_id: string) => {
    try {
      await fetch(`${API}/cripto/ia/overrides/${perfil_id}?tipo=${tipo}`, { method: "DELETE" });
      setOverrides(prev => {
        const next = { ...prev };
        delete next[perfil_id];
        return next;
      });
    } catch { /* silencioso */ }
  }, [tipo]);

  // ── Sumário global ────────────────────────────────────────────────────────

  const totalTrades   = Object.values(metricas).reduce((s, m) => s + (m.total_vendas ?? 0), 0);
  const totalPnl      = Object.values(metricas).reduce((s, m) => s + (m.total_pnl_brl ?? 0), 0);
  const mediaWR       = (() => {
    const com = Object.values(metricas).filter(m => m.win_rate !== null);
    return com.length ? com.reduce((s, m) => s + (m.win_rate ?? 0), 0) / com.length : null;
  })();
  const totalSugestoes = Object.values(analises).reduce((s, a) =>
    s + a.sugestoes.filter(sg => sg.status === "pendente" || sg.status === undefined).length, 0);
  const totalOverrides = Object.keys(overrides).length;

  const perfisIds = tipo === "futures"
    ? PERFIS_CONFIG.map(p => p.id)
    : Object.keys(metricas);

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <BrainCircuit size={20} className="text-purple-400" />
            <h1 className="text-xl font-black text-[var(--text-primary)]">IA Analisa</h1>
          </div>
          <p className="text-sm text-[var(--text-secondary)]">
            A IA analisa o histórico de cada perfil e sugere melhorias. Você decide o que aplicar.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Tipo */}
          <div className="flex rounded-lg overflow-hidden border border-[var(--border)]">
            {(["futures", "bot"] as const).map(t => (
              <button key={t} onClick={() => setTipo(t)}
                className="px-3 py-1.5 text-[12px] font-semibold transition-all"
                style={{
                  background: tipo === t ? "rgba(139,92,246,0.25)" : "transparent",
                  color: tipo === t ? "#a78bfa" : "var(--text-muted)",
                }}>
                {t === "futures" ? "Futures IA" : "Bots"}
              </button>
            ))}
          </div>

          {/* Botão analisar */}
          <button onClick={analisar} disabled={analisando}
            className="flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm transition-all hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: "linear-gradient(135deg, #7c3aed, #4f46e5)", color: "white", boxShadow: "0 4px 15px rgba(124,58,237,0.3)" }}>
            {analisando
              ? <><span className="animate-spin">⟳</span> Analisando...</>
              : <><Sparkles size={14}/> Analisar com IA</>}
          </button>
        </div>
      </div>

      {/* Última análise */}
      {ultimaAnalise && (
        <div className="flex items-center gap-1.5 text-[12px] text-[var(--text-muted)]">
          <Clock size={12}/> Última análise {tempoAtras(ultimaAnalise)}
        </div>
      )}

      {/* Erro */}
      {erroMsg && (
        <div className="flex items-center gap-2 p-3 rounded-xl text-sm"
          style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", color: "#fca5a5" }}>
          <AlertTriangle size={14}/> {erroMsg}
        </div>
      )}

      {/* Sumário */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatBox label="Total Trades"    value={String(totalTrades)}            cor="var(--text-primary)" />
        <StatBox label="P&L Global"      value={`R$ ${fmt(totalPnl, 0)}`}      cor={totalPnl >= 0 ? "#10b981" : "#ef4444"} />
        <StatBox label="Win Rate Médio"  value={mediaWR !== null ? `${mediaWR.toFixed(1)}%` : "—"} cor={mediaWR !== null ? (mediaWR >= 50 ? "#10b981" : "#ef4444") : undefined} />
        <StatBox label="Pendentes / Overrides" value={`${totalSugestoes} / ${totalOverrides}`} cor="#a78bfa" />
      </div>

      {/* Lista de perfis */}
      <div className="space-y-3">
        {perfisIds.map(pid => (
          <PerfilAnaliseCard
            key={pid}
            analise={analises[pid]}
            metrica={metricas[pid]}
            overrides={overrides[pid]}
            tipo={tipo}
            onAprovar={aprovar}
            onRejeitar={rejeitar}
            onReverterOverride={reverterOverride}
          />
        ))}
        {perfisIds.length === 0 && (
          <div className="text-center py-16 text-[var(--text-muted)]">
            <BrainCircuit size={40} className="mx-auto mb-3 opacity-30" />
            <p>Nenhum perfil com histórico ainda.</p>
            <p className="text-sm mt-1">Os bots e perfis precisam de trades registrados para análise.</p>
          </div>
        )}
      </div>

      {/* Nota explicativa */}
      <div className="rounded-xl border border-[var(--border)] p-4 text-[12px] text-[var(--text-secondary)] leading-relaxed"
        style={{ background: "rgba(139,92,246,0.05)" }}>
        <strong className="text-purple-400">Como funciona:</strong> A IA lê o histórico completo de trades de cada perfil (win rate, P&amp;L médio, melhores/piores moedas) e sugere ajustes precisos nos parâmetros. As sugestões ficam pendentes até você aprovar. Ao aprovar, o override é salvo no servidor e aplicado automaticamente na próxima vez que acessar os perfis. Você pode reverter qualquer override a qualquer momento.
      </div>
    </div>
  );
}
