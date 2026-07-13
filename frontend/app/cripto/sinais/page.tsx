"use client";

import React, { useEffect, useState, useCallback } from "react";
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer,
  Tooltip,
} from "recharts";
import { SinaisHubNav } from "@/components/SinaisHubNav";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

const MOEDAS = [
  { simbolo: "BTC",  icon: "₿" }, { simbolo: "ETH",  icon: "Ξ" },
  { simbolo: "SOL",  icon: "◎" }, { simbolo: "BNB",  icon: "B" },
  { simbolo: "XRP",  icon: "✕" }, { simbolo: "DOGE", icon: "Ð" },
  { simbolo: "ADA",  icon: "₳" }, { simbolo: "AVAX", icon: "A" },
  { simbolo: "LINK", icon: "⬡" }, { simbolo: "LTC",  icon: "Ł" },
  { simbolo: "DOT",  icon: "●" }, { simbolo: "MATIC",icon: "⬟" },
];

// ── Types ─────────────────────────────────────────────────────────────────────

interface Sinal {
  simbolo: string;
  nome: string;
  preco_atual: number;
  variacao_24h: number | null;
  rank_mercado: number | null;
  score: number;
  decisao: string;
  cor: string;
  bullish: boolean;
  confianca: number;
  fear_greed: number | null;
  fear_greed_label: string;
  categorias: Record<string, { score: number; sinais: SinalItem[] }>;
  niveis: Niveis;
  padroes: {
    candles: Padrao[];
    graficos: Padrao[];
    estrutura: Estrutura;
  };
  fibonacci: FibData;
  indicadores_favoraveis: string[];
  indicadores_contrarios: string[];
  justificativa: string;
  binance: {
    open_interest: number | null;
    oi_change_pct: number | null;
    funding_rate: number | null;
    ls_ratio: number | null;
  };
  candles_usados: number;
}

interface SinalItem {
  nome: string;
  score: number;
  bullish: boolean;
  sinal?: string;
  detalhe?: string;
  valor?: number;
}

interface Niveis {
  tipo_entrada: string;
  entrada_ideal: number;
  stop_loss: number;
  take_profit_1: number;
  take_profit_2: number;
  take_profit_3: number;
  risco_pct: number;
  retorno_1_pct: number;
  retorno_2_pct: number;
  retorno_3_pct: number;
  rr_1: string;
  rr_2: string;
  rr_3: string;
  atr: number;
  tempo_estimado: string;
}

interface Padrao {
  nome: string;
  bullish: boolean | null;
  confianca: number;
  descricao: string;
}

interface Estrutura {
  tendencia_primaria: string;
  bos: boolean;
  bos_direcao: string | null;
  choch: boolean;
  suportes: number[];
  resistencias: number[];
  slope_ema20_pct: number;
}

interface FibData {
  alto: number;
  baixo: number;
  posicao_pct: number;
  suporte_fib: number | null;
  resistencia_fib: number | null;
  dist_golden_pct: number;
  confluencias: number;
}

interface RankItem {
  simbolo: string;
  nome: string;
  preco_atual: number;
  score: number;
  decisao: string;
  cor: string;
  bullish: boolean;
  variacao_24h: number | null;
  tendencia: number;
  momentum: number;
  volume: number;
  price_action: number;
  padroes: string[];
  tipo_entrada: string;
  rr: string;
}

// ── Histórico de entradas IA ──────────────────────────────────────────────────

interface HistItem {
  id: string;
  simbolo: string;
  decisao: string;
  score: number;
  preco_entrada: number;
  sl: number;
  tp1: number;
  tp2: number;
  tp3: number;
  rr1: string;
  registrado_em: string;
  preco_atual?: number;
  verificado_em?: string;
  status: "aberto" | "tp1" | "tp2" | "tp3" | "sl" | "expirado";
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const TRADE_HIST_KEY = "allwin_trade_hist";
const SINAIS_LEGACY_KEY = "allwin_sinais_hist";

function loadHist(): HistItem[] {
  if (typeof window === "undefined") return [];
  try {
    const legacy = localStorage.getItem(SINAIS_LEGACY_KEY);
    if (legacy) {
      const items: HistItem[] = JSON.parse(legacy);
      const existing = JSON.parse(localStorage.getItem(TRADE_HIST_KEY) ?? "[]");
      const merged = [...existing.filter((e: HistItem & { source: string }) => e.source !== "sinais"), ...items.map(i => ({ ...i, source: "sinais" }))];
      localStorage.setItem(TRADE_HIST_KEY, JSON.stringify(merged));
      localStorage.removeItem(SINAIS_LEGACY_KEY);
    }
    const all = JSON.parse(localStorage.getItem(TRADE_HIST_KEY) ?? "[]");
    return all.filter((e: HistItem & { source: string }) => e.source === "sinais").map(({ source: _s, ...rest }: HistItem & { source: string }) => rest);
  } catch { return []; }
}
function saveHist(items: HistItem[]) {
  try {
    const all = JSON.parse(localStorage.getItem(TRADE_HIST_KEY) ?? "[]");
    const others = all.filter((e: HistItem & { source: string }) => e.source !== "sinais");
    localStorage.setItem(TRADE_HIST_KEY, JSON.stringify([...others, ...items.map(i => ({ ...i, source: "sinais" }))]));
  } catch {}
}

function calcStatus(h: HistItem): HistItem["status"] {
  const p = h.preco_atual;
  if (!p) return h.status;
  const dias = (Date.now() - new Date(h.registrado_em).getTime()) / 86400000;
  if (dias > 10) return "expirado";
  if (p <= h.sl)  return "sl";
  if (p >= h.tp3) return "tp3";
  if (p >= h.tp2) return "tp2";
  if (p >= h.tp1) return "tp1";
  return "aberto";
}

function fBRL(v: number | null | undefined) {
  if (v == null) return "—";
  if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `R$ ${(v / 1_000).toFixed(2)}K`;
  if (v >= 1) return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  return `R$ ${v.toFixed(6)}`;
}
function fPct(v: number | null | undefined) {
  if (v == null) return "—";
  return `${v > 0 ? "+" : ""}${v.toFixed(2)}%`;
}
function scoreColor(s: number) {
  if (s >= 80) return "#10b981";
  if (s >= 65) return "#84cc16";
  if (s >= 50) return "#f59e0b";
  if (s >= 35) return "#f97316";
  return "#ef4444";
}
function scoreLabel(s: number) {
  if (s >= 80) return "Confluência Muito Forte";
  if (s >= 65) return "Excelente Oportunidade";
  if (s >= 50) return "Boa Oportunidade";
  if (s >= 35) return "Aguardar";
  return "Não Operar";
}

// ── Score Gauge ───────────────────────────────────────────────────────────────

function BigGauge({ score, cor }: { score: number; cor: string }) {
  const fill = (score / 100) * 251;
  return (
    <div className="flex flex-col items-center">
      <svg width="160" height="100" viewBox="0 0 160 100">
        <path d="M 15 90 A 65 65 0 0 1 145 90" fill="none" stroke="var(--border)" strokeWidth="14" strokeLinecap="round" />
        <path d="M 15 90 A 65 65 0 0 1 145 90" fill="none" stroke={cor} strokeWidth="14" strokeLinecap="round"
          strokeDasharray={`${fill} 251`} />
        <text x="80" y="82" textAnchor="middle" fill="var(--text-primary)" fontSize="26" fontWeight="900">{Math.round(score)}</text>
      </svg>
      <span className="text-sm font-bold mt-1" style={{ color: cor }}>{scoreLabel(score)}</span>
    </div>
  );
}

// ── Radar de Categorias ───────────────────────────────────────────────────────

function CategoriaRadar({ categorias }: { categorias: Record<string, { score: number }> }) {
  const data = [
    { cat: "Tendência",    score: categorias.tendencia?.score   ?? 0 },
    { cat: "Momentum",     score: categorias.momentum?.score    ?? 0 },
    { cat: "Volume",       score: categorias.volume?.score      ?? 0 },
    { cat: "Price Action", score: categorias.price_action?.score?? 0 },
    { cat: "Externo",      score: categorias.externo?.score     ?? 0 },
  ];
  return (
    <ResponsiveContainer width="100%" height={200}>
      <RadarChart data={data}>
        <PolarGrid stroke="var(--border)" />
        <PolarAngleAxis dataKey="cat" tick={{ fontSize: 11, fill: "var(--text-secondary)" }} />
        <Radar name="Score" dataKey="score" stroke="#10b981" fill="#10b981" fillOpacity={0.25} strokeWidth={2} />
        <Tooltip formatter={(v: unknown) => [`${Number(v).toFixed(0)}`, "Score"]}
          contentStyle={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
      </RadarChart>
    </ResponsiveContainer>
  );
}

// ── Nível de Entrada Card ─────────────────────────────────────────────────────

function NiveisCard({ niveis, bullish }: { niveis: Niveis; bullish: boolean }) {
  const entColor = "#60a5fa";
  const stopColor = "#ef4444";
  const tp1Color = "#84cc16";
  const tp2Color = "#34d399";
  const tp3Color = "#10b981";

  return (
    <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-[var(--text-primary)]">📍 Níveis de Operação</h3>
        <span className="text-xs px-2 py-0.5 rounded font-semibold bg-[var(--border)] text-[var(--text-secondary)]">
          {niveis.tipo_entrada}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {[
          { label: "Entrada Ideal", val: fBRL(niveis.entrada_ideal), color: entColor },
          { label: "Stop Loss",     val: fBRL(niveis.stop_loss),     color: stopColor },
        ].map((n) => (
          <div key={n.label} className="rounded-lg p-2.5 text-center" style={{ background: `${n.color}15`, border: `1px solid ${n.color}40` }}>
            <div className="text-xs text-[var(--text-muted)] mb-0.5">{n.label}</div>
            <div className="text-sm font-bold" style={{ color: n.color }}>{n.val}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-2">
        {[
          { label: "TP1", val: fBRL(niveis.take_profit_1), ret: niveis.retorno_1_pct, rr: niveis.rr_1, color: tp1Color },
          { label: "TP2", val: fBRL(niveis.take_profit_2), ret: niveis.retorno_2_pct, rr: niveis.rr_2, color: tp2Color },
          { label: "TP3", val: fBRL(niveis.take_profit_3), ret: niveis.retorno_3_pct, rr: niveis.rr_3, color: tp3Color },
        ].map((tp) => (
          <div key={tp.label} className="rounded-lg p-2.5 text-center" style={{ background: `${tp.color}10`, border: `1px solid ${tp.color}30` }}>
            <div className="text-xs font-semibold mb-0.5" style={{ color: tp.color }}>{tp.label}</div>
            <div className="text-xs font-bold text-[var(--text-primary)]">{tp.val}</div>
            <div className="text-xs text-[var(--text-muted)]">+{tp.ret?.toFixed(1)}%</div>
            <div className="text-xs font-semibold" style={{ color: tp.color }}>{tp.rr}</div>
          </div>
        ))}
      </div>

      <div className="flex justify-between text-xs text-[var(--text-muted)] border-t border-[var(--border)] pt-2">
        <span>Risco: <strong className="text-red-500">{niveis.risco_pct?.toFixed(2)}%</strong></span>
        <span>ATR: {fBRL(niveis.atr)}</span>
        <span>Horizonte: <strong className="text-[var(--text-primary)]">{niveis.tempo_estimado}</strong></span>
      </div>
    </div>
  );
}

// ── Indicadores Section ───────────────────────────────────────────────────────

function CatSection({ nome, data }: { nome: string; data: { score: number; sinais: SinalItem[] } }) {
  const [open, setOpen] = useState(false);
  const cor = scoreColor(data.score);
  return (
    <div className="bg-[var(--bg-card)] rounded-xl border overflow-hidden" style={{ borderColor: `${cor}60` }}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3"
      >
        <span className="text-xs font-bold text-[var(--text-secondary)]">{nome}</span>
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-20 bg-[var(--border)] rounded-full overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${data.score}%`, backgroundColor: cor }} />
          </div>
          <span className="text-xs font-bold w-8" style={{ color: cor }}>{Math.round(data.score)}</span>
          <span className="text-[var(--text-muted)] text-xs">{open ? "▲" : "▼"}</span>
        </div>
      </button>
      {open && (
        <div className="px-4 pb-3 border-t border-[var(--border)]/40 pt-2 space-y-1.5">
          {data.sinais.map((s, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${s.bullish ? "bg-emerald-500" : "bg-red-500"}`} />
              <span className="text-xs text-[var(--text-secondary)] flex-1 truncate">{s.nome}</span>
              {s.detalhe && <span className="text-xs text-[var(--text-muted)] hidden sm:block">{s.detalhe}</span>}
              <div className="h-1 w-12 bg-[var(--border)] rounded-full overflow-hidden shrink-0">
                <div className="h-full rounded-full" style={{ width: `${s.score}%`, backgroundColor: scoreColor(s.score) }} />
              </div>
              <span className="text-xs font-mono w-6 text-right" style={{ color: scoreColor(s.score) }}>{s.score}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Padrões detectados ────────────────────────────────────────────────────────

function PadroesSection({ padroes }: { padroes: Sinal["padroes"] }) {
  const [open, setOpen] = useState(false);
  const total = padroes.candles.length + padroes.graficos.length;
  return (
    <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] overflow-hidden">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between px-4 py-3">
        <span className="text-xs font-bold text-[var(--text-secondary)]">
          🕯 Padrões Detectados ({total})
        </span>
        <div className="flex items-center gap-3">
          {padroes.estrutura.bos && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-500 font-semibold">BOS</span>
          )}
          {padroes.estrutura.choch && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-500 font-semibold">CHOCH</span>
          )}
          <span className="text-[var(--text-muted)] text-xs">{open ? "▲" : "▼"}</span>
        </div>
      </button>
      {open && (
        <div className="px-4 pb-4 border-t border-[var(--border)]/40 pt-3 space-y-3">
          {/* Estrutura */}
          <div>
            <div className="text-xs font-semibold text-[var(--text-muted)] mb-1.5">Estrutura de Mercado</div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">Tendência:</span>
                <span className={`font-semibold ${padroes.estrutura.tendencia_primaria === "alta" ? "text-emerald-500" : padroes.estrutura.tendencia_primaria === "baixa" ? "text-red-500" : "text-[var(--text-muted)]"}`}>
                  {padroes.estrutura.tendencia_primaria}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">Slope EMA20:</span>
                <span className={padroes.estrutura.slope_ema20_pct > 0 ? "text-emerald-500" : "text-red-500"}>
                  {fPct(padroes.estrutura.slope_ema20_pct)}
                </span>
              </div>
            </div>
            {padroes.estrutura.suportes.length > 0 && (
              <div className="mt-1.5 text-xs text-[var(--text-muted)]">
                Suportes: {padroes.estrutura.suportes.slice(0, 3).map(fBRL).join(" | ")}
              </div>
            )}
            {padroes.estrutura.resistencias.length > 0 && (
              <div className="text-xs text-[var(--text-muted)]">
                Resistências: {padroes.estrutura.resistencias.slice(0, 3).map(fBRL).join(" | ")}
              </div>
            )}
          </div>

          {/* Candle patterns */}
          {padroes.candles.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-[var(--text-muted)] mb-1.5">Padrões de Candle</div>
              <div className="space-y-1">
                {padroes.candles.map((p, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className={`mt-0.5 shrink-0 ${p.bullish ? "text-emerald-500" : p.bullish === false ? "text-red-500" : "text-yellow-500"}`}>
                      {p.bullish ? "▲" : p.bullish === false ? "▼" : "◆"}
                    </span>
                    <div>
                      <span className="text-xs font-semibold text-[var(--text-primary)]">{p.nome}</span>
                      <span className="text-xs text-[var(--text-muted)] ml-2">{p.descricao}</span>
                    </div>
                    <span className="ml-auto text-xs font-mono" style={{ color: scoreColor(p.confianca) }}>
                      {p.confianca?.toFixed(0)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Chart patterns */}
          {padroes.graficos.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-[var(--text-muted)] mb-1.5">Padrões Gráficos</div>
              {padroes.graficos.map((p, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className={`shrink-0 ${p.bullish ? "text-emerald-500" : p.bullish === false ? "text-red-500" : "text-yellow-500"}`}>
                    {p.bullish ? "▲" : p.bullish === false ? "▼" : "◆"}
                  </span>
                  <div>
                    <span className="text-xs font-semibold text-[var(--text-primary)]">{p.nome}</span>
                    <span className="text-xs text-[var(--text-muted)] ml-2">{p.descricao}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Ranking Table ─────────────────────────────────────────────────────────────

function RankingTable({ items, titulo }: { items: RankItem[]; titulo: string }) {
  return (
    <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] overflow-hidden">
      <div className="px-4 py-3 border-b border-[var(--border)]">
        <h3 className="text-xs font-bold text-[var(--text-primary)]">{titulo}</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[var(--text-muted)] border-b border-[var(--border)]">
              <th className="px-3 py-2 text-left">#</th>
              <th className="px-3 py-2 text-left">Moeda</th>
              <th className="px-3 py-2 text-right">Score</th>
              <th className="px-3 py-2 text-left">Decisão</th>
              <th className="px-3 py-2 text-right">24h</th>
              <th className="px-3 py-2 text-left">Padrão</th>
              <th className="px-3 py-2 text-right">R:R</th>
            </tr>
          </thead>
          <tbody>
            {items.map((r, i) => (
              <tr key={r.simbolo} className="border-b border-[var(--border)]/30 hover:bg-[var(--border)]/10 transition-colors">
                <td className="px-3 py-2 text-[var(--text-muted)]">{i + 1}</td>
                <td className="px-3 py-2 font-bold text-[var(--text-primary)]">{r.simbolo}</td>
                <td className="px-3 py-2 text-right">
                  <span className="font-bold" style={{ color: r.cor }}>{Math.round(r.score)}</span>
                </td>
                <td className="px-3 py-2">
                  <span className="px-1.5 py-0.5 rounded text-xs font-semibold" style={{ background: `${r.cor}20`, color: r.cor }}>
                    {r.decisao.split(" ")[0]}
                  </span>
                </td>
                <td className={`px-3 py-2 text-right font-mono ${r.variacao_24h != null && r.variacao_24h >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                  {fPct(r.variacao_24h)}
                </td>
                <td className="px-3 py-2 text-[var(--text-muted)]">{r.padroes?.[0] ?? "—"}</td>
                <td className="px-3 py-2 text-right text-[var(--text-secondary)] font-mono">{r.rr}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Histórico View ────────────────────────────────────────────────────────────

function statusInfo(s: HistItem["status"]) {
  if (s === "tp3") return { label: "TP3 ✅", color: "#10b981", bg: "rgba(16,185,129,0.12)" };
  if (s === "tp2") return { label: "TP2 ✅", color: "#34d399", bg: "rgba(52,211,153,0.12)" };
  if (s === "tp1") return { label: "TP1 ✅", color: "#84cc16", bg: "rgba(132,204,22,0.12)"  };
  if (s === "sl")  return { label: "SL ❌",  color: "#ef4444", bg: "rgba(239,68,68,0.12)"   };
  if (s === "expirado") return { label: "Expirado ⏱", color: "#94a3b8", bg: "rgba(148,163,184,0.1)" };
  return               { label: "Em aberto ⏳", color: "#f59e0b", bg: "rgba(245,158,11,0.1)" };
}

function HistoricoView({
  historico, setHistorico,
}: {
  historico: HistItem[];
  setHistorico: React.Dispatch<React.SetStateAction<HistItem[]>>;
}) {
  const [verificando, setVerificando] = useState<string | null>(null);

  async function verificar(id: string, simbolo: string) {
    setVerificando(id);
    try {
      const r = await fetch(`${API}/cripto/sinais/${simbolo}`);
      if (!r.ok) return;
      const d = await r.json();
      const preco: number = d.preco_atual;
      setHistorico(prev => {
        const next = prev.map(h => {
          if (h.id !== id) return h;
          const atualizado = { ...h, preco_atual: preco, verificado_em: new Date().toISOString() };
          atualizado.status = calcStatus(atualizado);
          return atualizado;
        });
        saveHist(next);
        return next;
      });
    } catch {} finally { setVerificando(null); }
  }

  function remover(id: string) {
    setHistorico(prev => { const n = prev.filter(h => h.id !== id); saveHist(n); return n; });
  }

  function limpar() {
    if (confirm("Apagar todo o histórico de entradas?")) {
      setHistorico([]); saveHist([]);
    }
  }

  // Stats
  const total = historico.length;
  const finalizadas = historico.filter(h => h.status !== "aberto");
  const wins = historico.filter(h => h.status === "tp1" || h.status === "tp2" || h.status === "tp3").length;
  const losses = historico.filter(h => h.status === "sl").length;
  const wr = finalizadas.length ? Math.round(wins / finalizadas.length * 100) : null;
  const pnlMedio = (() => {
    const com = historico.filter(h => h.preco_atual);
    if (!com.length) return null;
    return com.reduce((s, h) => s + (h.preco_atual! - h.preco_entrada) / h.preco_entrada * 100, 0) / com.length;
  })();

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { l: "Total entradas", v: String(total),                                c: "var(--text-primary)"                                       },
          { l: "Win Rate",       v: wr !== null ? `${wr}%` : "—",                c: wr !== null ? (wr >= 50 ? "#10b981" : "#ef4444") : undefined },
          { l: "Wins / Losses",  v: `${wins} / ${losses}`,                       c: wins > losses ? "#10b981" : "#ef4444"                       },
          { l: "P&L médio",      v: pnlMedio !== null ? `${pnlMedio >= 0 ? "+" : ""}${pnlMedio.toFixed(2)}%` : "—",
            c: pnlMedio !== null ? (pnlMedio >= 0 ? "#10b981" : "#ef4444") : undefined },
        ].map(({ l, v, c }) => (
          <div key={l} className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-3">
            <div className="text-[10px] text-[var(--text-muted)] mb-1">{l}</div>
            <div className="text-lg font-black" style={{ color: c }}>{v}</div>
          </div>
        ))}
      </div>

      {/* Header + limpar */}
      {historico.length > 0 && (
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold text-[var(--text-primary)]">📋 {historico.length} entrada{historico.length !== 1 ? "s" : ""} registrada{historico.length !== 1 ? "s" : ""}</span>
          <button onClick={limpar} className="text-[11px] text-[var(--text-muted)] hover:text-red-400 transition-colors">🗑 Limpar tudo</button>
        </div>
      )}

      {/* Empty state */}
      {historico.length === 0 && (
        <div className="text-center py-16 text-[var(--text-muted)]">
          <div className="text-5xl mb-3">📋</div>
          <p className="font-semibold">Nenhuma entrada registrada</p>
          <p className="text-sm mt-1">Vá em <b>Sinal Individual</b>, analise uma moeda e clique em <b>📌 Registrar Entrada</b></p>
        </div>
      )}

      {/* Lista */}
      <div className="flex flex-col gap-3">
        {[...historico].reverse().map(h => {
          const { label, color, bg } = statusInfo(h.status);
          const pnlPct = h.preco_atual ? (h.preco_atual - h.preco_entrada) / h.preco_entrada * 100 : null;
          const dias   = Math.floor((Date.now() - new Date(h.registrado_em).getTime()) / 86400000);

          return (
            <div key={h.id} style={{ borderRadius: 14, border: `1px solid ${color}40`, background: "var(--bg-card)", overflow: "hidden" }}>
              {/* Top bar */}
              <div style={{ background: bg, padding: "10px 16px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <span style={{ fontSize: 15, fontWeight: 900, color: "var(--text-primary)" }}>{h.simbolo}</span>
                <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 8, background: `${color}20`, color }}>{label}</span>
                <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 8, background: "rgba(0,0,0,0.2)", color: scoreColor(h.score), fontWeight: 700 }}>Score {h.score}</span>
                <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{h.decisao.split(" ").slice(0, 1).join("")}</span>
                <span style={{ marginLeft: "auto", fontSize: 10, color: "var(--text-muted)" }}>
                  {dias === 0 ? "hoje" : `${dias}d atrás`} · {new Date(h.registrado_em).toLocaleDateString("pt-BR")}
                </span>
              </div>

              {/* Body */}
              <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
                {/* Preços */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, fontSize: 11 }}>
                  {[
                    { l: "Entrada", v: fBRL(h.preco_entrada), c: "#60a5fa" },
                    { l: "Stop Loss", v: fBRL(h.sl), c: "#ef4444" },
                    { l: "TP1", v: fBRL(h.tp1), c: "#84cc16" },
                    { l: "TP2", v: fBRL(h.tp2), c: "#34d399" },
                    { l: "TP3", v: fBRL(h.tp3), c: "#10b981" },
                    h.preco_atual
                      ? { l: "Preço Atual", v: fBRL(h.preco_atual), c: pnlPct! >= 0 ? "#10b981" : "#ef4444" }
                      : { l: "Preço Atual", v: "—", c: "var(--text-muted)" as string },
                  ].map(({ l, v, c }) => (
                    <div key={l} style={{ background: "var(--bg)", borderRadius: 8, padding: "6px 8px" }}>
                      <div style={{ fontSize: 9, color: "var(--text-muted)", fontWeight: 600, marginBottom: 3 }}>{l}</div>
                      <div style={{ fontWeight: 800, color: c }}>{v}</div>
                    </div>
                  ))}
                </div>

                {/* P&L + R:R + ações */}
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  {pnlPct !== null && (
                    <span style={{ fontSize: 13, fontWeight: 900, color: pnlPct >= 0 ? "#10b981" : "#ef4444" }}>
                      {pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(2)}% P&L
                    </span>
                  )}
                  {h.rr1 && <span style={{ fontSize: 11, color: "var(--text-muted)" }}>R:R {h.rr1}</span>}
                  {h.verificado_em && (
                    <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
                      Verificado {new Date(h.verificado_em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  )}
                  <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                    <button
                      onClick={() => verificar(h.id, h.simbolo)}
                      disabled={verificando === h.id}
                      style={{ padding: "5px 12px", borderRadius: 8, fontSize: 11, fontWeight: 700,
                        background: "rgba(59,130,246,0.1)", border: "1px solid rgba(59,130,246,0.3)",
                        color: "#60a5fa", cursor: verificando === h.id ? "not-allowed" : "pointer", opacity: verificando === h.id ? 0.6 : 1 }}>
                      {verificando === h.id ? "⟳ Buscando..." : "🔄 Verificar"}
                    </button>
                    <button
                      onClick={() => remover(h.id)}
                      style={{ padding: "5px 10px", borderRadius: 8, fontSize: 11, fontWeight: 700,
                        background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)",
                        color: "#ef4444", cursor: "pointer" }}>
                      ✕
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function SinaisPage() {
  const [simbolo,   setSimbol]  = useState("BTC");
  const [modo,      setModo]    = useState<"sinal" | "ranking" | "historico">("sinal");
  const [sinal,     setSinal]   = useState<Sinal | null>(null);
  const [ranking,   setRanking] = useState<Record<string, RankItem[]> | null>(null);
  const [loading,   setLoading] = useState(false);
  const [loadRank,  setLoadRank]= useState(false);
  const [error,     setError]   = useState<string | null>(null);
  const [historico, setHistorico] = useState<HistItem[]>([]);
  const [registrado, setRegistrado] = useState(false);

  useEffect(() => { setHistorico(loadHist()); }, []);

  function registrar() {
    if (!sinal) return;
    const item: HistItem = {
      id: Math.random().toString(36).slice(2),
      simbolo: sinal.simbolo.replace("USDT",""),
      decisao: sinal.decisao,
      score: Math.round(sinal.score),
      preco_entrada: sinal.niveis.entrada_ideal || sinal.preco_atual,
      sl:  sinal.niveis.stop_loss,
      tp1: sinal.niveis.take_profit_1,
      tp2: sinal.niveis.take_profit_2,
      tp3: sinal.niveis.take_profit_3,
      rr1: sinal.niveis.rr_1,
      registrado_em: new Date().toISOString(),
      status: "aberto",
    };
    const nova = [...historico, item];
    saveHist(nova);
    setHistorico(nova);
    setRegistrado(true);
    setTimeout(() => setRegistrado(false), 2500);
  }

  const fetchSinal = useCallback((sym: string) => {
    setLoading(true);
    setError(null);
    fetch(`${API}/cripto/sinais/${sym}`)
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((d) => { setSinal(d); setLoading(false); })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, []);

  const fetchRanking = useCallback(() => {
    setLoadRank(true);
    fetch(`${API}/cripto/sinais/ranking`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { setRanking(d); setLoadRank(false); })
      .catch(() => setLoadRank(false));
  }, []);

  useEffect(() => {
    if (modo === "sinal") fetchSinal(simbolo);
    else                  fetchRanking();
  }, [modo, simbolo, fetchSinal, fetchRanking]);

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-4">
      <SinaisHubNav />

      {/* ── Controles ── */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Modo */}
        <div className="flex rounded-lg border border-[var(--border)] overflow-hidden">
          <button onClick={() => setModo("sinal")}
            className={`px-4 py-2 text-xs font-bold transition-all ${modo === "sinal" ? "bg-emerald-600 text-white" : "bg-[var(--bg-card)] text-[var(--text-secondary)] hover:bg-[var(--border)]/40"}`}>
            🤖 Sinal Individual
          </button>
          <button onClick={() => setModo("ranking")}
            className={`px-4 py-2 text-xs font-bold transition-all ${modo === "ranking" ? "bg-emerald-600 text-white" : "bg-[var(--bg-card)] text-[var(--text-secondary)] hover:bg-[var(--border)]/40"}`}>
            🏆 Ranking Geral
          </button>
          <button onClick={() => setModo("historico")}
            className={`px-4 py-2 text-xs font-bold transition-all relative ${modo === "historico" ? "bg-blue-600 text-white" : "bg-[var(--bg-card)] text-[var(--text-secondary)] hover:bg-[var(--border)]/40"}`}>
            📋 Histórico
            {historico.length > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-blue-500 text-white text-[9px] flex items-center justify-center font-black">
                {historico.length}
              </span>
            )}
          </button>
        </div>

        {/* Seletor de moeda (só no modo sinal) */}
        {modo === "sinal" && (
          <div className="flex flex-wrap gap-1.5">
            {MOEDAS.map((m) => (
              <button key={m.simbolo} onClick={() => setSimbol(m.simbolo)}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold border transition-all ${
                  simbolo === m.simbolo
                    ? "bg-emerald-500 text-white border-emerald-500"
                    : "bg-[var(--bg-card)] text-[var(--text-secondary)] border-[var(--border)] hover:border-emerald-400"
                }`}>
                <span className="font-mono">{m.icon}</span>{m.simbolo}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Loading ── */}
      {(loading || loadRank) && (
        <div className="flex items-center justify-center h-60">
          <div className="text-center">
            <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-[var(--text-secondary)]">
              {loadRank ? "Analisando todas as moedas… (pode levar ~30s)" : `Calculando sinal para ${simbolo}…`}
            </p>
          </div>
        </div>
      )}

      {/* ── Erro ── */}
      {error && !loading && (
        <div className="text-center text-red-500 py-10">
          <div className="text-3xl mb-2">⚠️</div>
          <p>{error}</p>
          <button onClick={() => fetchSinal(simbolo)} className="mt-3 text-xs underline">Tentar novamente</button>
        </div>
      )}

      {/* ── Sinal Individual ── */}
      {!loading && !error && modo === "sinal" && sinal && (
        <div className="space-y-4">

          {/* Header */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-xl font-bold text-[var(--text-primary)]">🤖 Sinal IA — {sinal.simbolo}</h1>
              <p className="text-xs text-[var(--text-muted)]">{sinal.nome} • {sinal.candles_usados} candles • Cache 1h</p>
            </div>
            <div className="flex gap-2 flex-wrap">
              {/* Botão registrar entrada */}
              <button
                onClick={registrar}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all"
                style={{
                  background: registrado ? "rgba(16,185,129,0.2)" : "rgba(59,130,246,0.1)",
                  border: `1px solid ${registrado ? "rgba(16,185,129,0.5)" : "rgba(59,130,246,0.4)"}`,
                  color: registrado ? "#10b981" : "#60a5fa",
                }}>
                {registrado ? "✅ Registrada!" : "📌 Registrar Entrada"}
              </button>
              {sinal.preco_atual && (
                <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg px-3 py-2 text-center">
                  <div className="text-xs text-[var(--text-muted)]">Preço</div>
                  <div className="text-sm font-bold text-[var(--text-primary)]">{fBRL(sinal.preco_atual)}</div>
                </div>
              )}
              {sinal.variacao_24h != null && (
                <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg px-3 py-2 text-center">
                  <div className="text-xs text-[var(--text-muted)]">24h</div>
                  <div className={`text-sm font-bold ${sinal.variacao_24h >= 0 ? "text-emerald-500" : "text-red-500"}`}>{fPct(sinal.variacao_24h)}</div>
                </div>
              )}
              {sinal.fear_greed != null && (
                <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg px-3 py-2 text-center">
                  <div className="text-xs text-[var(--text-muted)]">Fear & Greed</div>
                  <div className="text-sm font-bold text-[var(--text-primary)]">{sinal.fear_greed}</div>
                  <div className="text-xs text-[var(--text-muted)]">{sinal.fear_greed_label}</div>
                </div>
              )}
            </div>
          </div>

          {/* Score + Radar + Níveis */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

            {/* Gauge de Score */}
            <div className="bg-[var(--bg-card)] rounded-xl border-2 p-5 text-center flex flex-col items-center justify-center gap-3"
              style={{ borderColor: sinal.cor }}>
              <BigGauge score={sinal.score} cor={sinal.cor} />
              <div className="text-xl font-black" style={{ color: sinal.cor }}>{sinal.decisao}</div>
              <div className="w-full">
                <div className="flex justify-between text-xs text-[var(--text-muted)] mb-1">
                  <span>Confiança</span><span>{sinal.confianca.toFixed(0)}%</span>
                </div>
                <div className="h-2 bg-[var(--border)] rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${sinal.confianca}%`, backgroundColor: sinal.cor }} />
                </div>
              </div>
              {/* Binance data */}
              {(sinal.binance.funding_rate != null || sinal.binance.ls_ratio != null) && (
                <div className="grid grid-cols-2 gap-2 w-full text-xs">
                  {sinal.binance.funding_rate != null && (
                    <div className="text-center">
                      <div className="text-[var(--text-muted)]">Funding</div>
                      <div className={`font-bold ${sinal.binance.funding_rate < 0 ? "text-emerald-500" : "text-red-500"}`}>
                        {(sinal.binance.funding_rate * 100).toFixed(3)}%
                      </div>
                    </div>
                  )}
                  {sinal.binance.ls_ratio != null && (
                    <div className="text-center">
                      <div className="text-[var(--text-muted)]">L/S Ratio</div>
                      <div className="font-bold text-[var(--text-primary)]">{sinal.binance.ls_ratio.toFixed(2)}</div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Radar */}
            <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] p-4">
              <h3 className="text-xs font-bold text-[var(--text-muted)] mb-1 text-center">Radar de Confluência</h3>
              <CategoriaRadar categorias={sinal.categorias} />
            </div>

            {/* Níveis */}
            <NiveisCard niveis={sinal.niveis} bullish={sinal.bullish} />
          </div>

          {/* Indicadores por categoria */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {Object.entries(sinal.categorias).map(([k, v]) => (
              <CatSection key={k} nome={{
                tendencia: "📈 Tendência",
                momentum:  "⚡ Momentum",
                volume:    "📊 Volume",
                price_action: "🕯 Price Action",
                externo:   "🌐 Contexto Externo",
              }[k] ?? k} data={v} />
            ))}
          </div>

          {/* Padrões */}
          <PadroesSection padroes={sinal.padroes} />

          {/* Favoráveis / Contrários */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-[var(--bg-card)] rounded-xl border border-emerald-500/30 p-4">
              <div className="text-xs font-bold text-emerald-500 mb-2">✅ Indicadores Favoráveis</div>
              <div className="space-y-1">
                {sinal.indicadores_favoraveis.map((s, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                    <span className="text-emerald-500">▲</span>{s}
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-[var(--bg-card)] rounded-xl border border-red-500/30 p-4">
              <div className="text-xs font-bold text-red-500 mb-2">⚠️ Indicadores Contrários</div>
              {sinal.indicadores_contrarios.length > 0 ? (
                <div className="space-y-1">
                  {sinal.indicadores_contrarios.map((s, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                      <span className="text-red-500">▼</span>{s}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-[var(--text-muted)]">Nenhum indicador contrário relevante</p>
              )}
            </div>
          </div>

          {/* Justificativa */}
          <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] p-5">
            <h3 className="text-xs font-bold text-[var(--text-muted)] mb-3">📝 Justificativa Completa</h3>
            <div className="space-y-1.5">
              {sinal.justificativa.split("\n").map((line, i) => {
                if (!line.trim()) return <div key={i} className="h-1" />;
                const parts = line.split(/(\*\*[^*]+\*\*)/g);
                return (
                  <p key={i} className="text-xs text-[var(--text-secondary)] leading-relaxed">
                    {parts.map((p, j) =>
                      p.startsWith("**") && p.endsWith("**")
                        ? <strong key={j} className="text-[var(--text-primary)] font-semibold">{p.slice(2, -2)}</strong>
                        : p
                    )}
                  </p>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Ranking ── */}
      {!loadRank && modo === "ranking" && ranking && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <RankingTable items={(ranking.geral ?? []).slice(0, 6)} titulo="🏆 Ranking Geral por Score" />
            <RankingTable items={ranking.top_compras ?? []} titulo="🟢 Top Compras" />
            <RankingTable items={ranking.top_momento ?? []} titulo="⚡ Maior Momentum" />
            <RankingTable items={ranking.top_tendencia ?? []} titulo="📈 Maior Tendência" />
          </div>
        </div>
      )}

      {/* ── Histórico ── */}
      {modo === "historico" && (
        <HistoricoView historico={historico} setHistorico={setHistorico} />
      )}

      <p className="text-xs text-center text-[var(--text-muted)] pb-4">
        Análise baseada em confluência de indicadores técnicos • Não constitui conselho financeiro • Cache 1h
      </p>
    </div>
  );
}
