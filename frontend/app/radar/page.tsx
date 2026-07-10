"use client";

import { useState, useCallback } from "react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, ReferenceDot,
} from "recharts";
import type { RSAnalisaData } from "@/types";
import { getRSAnalisa, postRadar, type SinalRadar, type RadarResult } from "@/lib/api";

// ── Helpers ───────────────────────────────────────────────────────────────────

const SEV_CONFIG = {
  critico: { label: "Crítico", bg: "bg-red-500/15",    border: "border-red-500/40",    text: "text-red-400",    dot: "bg-red-500" },
  atencao: { label: "Atenção", bg: "bg-amber-500/10",  border: "border-amber-500/40",  text: "text-amber-400",  dot: "bg-amber-500" },
  info:    { label: "Info",    bg: "bg-blue-500/10",   border: "border-blue-500/40",   text: "text-blue-400",   dot: "bg-blue-500" },
} as const;

function formatarValor(campo: string, v: number | null): string {
  if (v === null) return "N/D";
  const pcts = ["margem_liquida", "roe", "margem_ebitda"];
  const grandes = ["receita_liquida", "ebitda", "lucro_liquido", "fcl"];
  if (pcts.includes(campo)) return `${(v * 100).toFixed(1)}%`;
  if (grandes.includes(campo)) {
    const bi = v / 1e9;
    return Math.abs(bi) >= 1 ? `R$${bi.toFixed(1)}B` : `R$${(v / 1e6).toFixed(0)}M`;
  }
  return v.toFixed(2);
}

// ── Mini chart de histórico ────────────────────────────────────────────────────

function MiniHistoricoChart({ sinal }: { sinal: SinalRadar }) {
  if (!sinal.historico_serie.length) return null;
  const data = sinal.historico_serie;
  const anoAtual = sinal.ano_atual;
  const isNeg = sinal.tipo === "negativo";

  return (
    <ResponsiveContainer width="100%" height={70}>
      <LineChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
        <XAxis
          dataKey="ano"
          tick={{ fontSize: 9, fill: "var(--text-secondary)" }}
          tickLine={false} axisLine={false}
        />
        <YAxis hide domain={["auto", "auto"]} />
        <Tooltip
          contentStyle={{
            background: "var(--bg-card)", border: "1px solid var(--border)",
            borderRadius: 8, fontSize: 11,
          }}
          formatter={(v: unknown) => [formatarValor(sinal.indicador, Number(v)), sinal.nome]}
          labelStyle={{ color: "var(--text-secondary)" }}
        />
        <Line
          type="monotone"
          dataKey="valor"
          stroke={isNeg ? "#ef4444" : "#10b981"}
          strokeWidth={1.5}
          dot={(props) => {
            const { cx, cy, payload } = props as { cx: number; cy: number; payload: { ano: number } };
            const isAnomalo = payload.ano === anoAtual;
            return (
              <circle
                key={payload.ano}
                cx={cx} cy={cy}
                r={isAnomalo ? 4 : 2}
                fill={isAnomalo ? (isNeg ? "#ef4444" : "#10b981") : "var(--bg-card)"}
                stroke={isNeg ? "#ef4444" : "#10b981"}
                strokeWidth={isAnomalo ? 2 : 1}
              />
            );
          }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ── Card de sinal ─────────────────────────────────────────────────────────────

function SinalCard({ sinal }: { sinal: SinalRadar }) {
  const [aberto, setAberto] = useState(false);
  const cfg = SEV_CONFIG[sinal.severidade];
  const seta = sinal.tipo === "negativo" ? "↓" : "↑";
  const corSeta = sinal.tipo === "negativo" ? "text-red-400" : "text-emerald-400";

  return (
    <div className={`rounded-xl border ${cfg.border} ${cfg.bg} overflow-hidden`}>
      <button
        className="w-full px-4 py-3 text-left flex items-center gap-3"
        onClick={() => setAberto(v => !v)}
      >
        {/* Badge severidade */}
        <span className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${cfg.text} bg-[var(--bg-card)] border ${cfg.border}`}>
          {cfg.label}
        </span>

        {/* Nome + seta */}
        <span className="flex-1 text-[13px] font-semibold text-[var(--text-primary)] text-left">
          {sinal.nome}
          <span className={`ml-2 ${corSeta}`}>{seta}</span>
        </span>

        {/* Z-score */}
        {sinal.z_score !== null && (
          <span className={`shrink-0 text-[11px] font-mono font-bold ${cfg.text}`}>
            z={sinal.z_score > 0 ? "+" : ""}{sinal.z_score.toFixed(2)}
          </span>
        )}

        {/* Chevron */}
        <svg
          className={`w-4 h-4 shrink-0 text-[var(--text-secondary)] transition-transform ${aberto ? "rotate-180" : ""}`}
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {aberto && (
        <div className="px-4 pb-4 space-y-3 border-t border-[var(--border)]/50 pt-3">
          {/* Valores */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div>
              <p className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wider mb-0.5">Valor atual</p>
              <p className={`text-[14px] font-bold ${cfg.text}`}>
                {formatarValor(sinal.indicador, sinal.valor_atual)}
                {sinal.ano_atual && <span className="text-[11px] font-normal text-[var(--text-secondary)] ml-1">({sinal.ano_atual})</span>}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wider mb-0.5">Média histórica</p>
              <p className="text-[14px] font-bold text-[var(--text-primary)]">
                {formatarValor(sinal.indicador, sinal.media_historica)}
              </p>
            </div>
            {sinal.z_score !== null && (
              <div>
                <p className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wider mb-0.5">Z-score</p>
                <p className={`text-[14px] font-bold font-mono ${cfg.text}`}>
                  {sinal.z_score > 0 ? "+" : ""}{sinal.z_score.toFixed(3)}
                </p>
              </div>
            )}
          </div>

          {/* Contexto */}
          <p className="text-[12px] text-[var(--text-secondary)] leading-relaxed">{sinal.contexto}</p>

          {/* Mini chart */}
          {sinal.historico_serie.length > 0 && (
            <div className="mt-1">
              <p className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wider mb-1">Evolução histórica</p>
              <MiniHistoricoChart sinal={sinal} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────

export default function RadarPage() {
  const [inputTicker, setInputTicker] = useState("");
  const [loading, setLoading]         = useState(false);
  const [resultado, setResultado]     = useState<RadarResult | null>(null);
  const [dados, setDados]             = useState<RSAnalisaData | null>(null);
  const [erro, setErro]               = useState<string | null>(null);

  const buscar = useCallback(async () => {
    const t = inputTicker.trim().toUpperCase();
    if (!t) return;
    setLoading(true);
    setErro(null);
    setResultado(null);
    try {
      const rsData = await getRSAnalisa(t);
      setDados(rsData);
      const radar = await postRadar(t, rsData);
      setResultado(radar);
    } catch (e: unknown) {
      const err = e as { message?: string };
      setErro(err.message ?? "Erro ao analisar o ativo.");
    } finally {
      setLoading(false);
    }
  }, [inputTicker]);

  const criticos = resultado?.sinais.filter(s => s.severidade === "critico") ?? [];
  const atencao  = resultado?.sinais.filter(s => s.severidade === "atencao")  ?? [];
  const info     = resultado?.sinais.filter(s => s.severidade === "info")     ?? [];

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">Radar de Anomalias</h1>
        <p className="text-sm text-[var(--text-secondary)] mt-1">
          Detecta desvios estatísticos (z-score) nos indicadores financeiros vs. histórico do ativo
        </p>
      </div>

      {/* Busca */}
      <form
        onSubmit={e => { e.preventDefault(); void buscar(); }}
        className="flex gap-2"
      >
        <input
          type="text"
          value={inputTicker}
          onChange={e => setInputTicker(e.target.value.toUpperCase())}
          placeholder="Digite o ticker (ex: WEGE3, RENT3, BBAS3…)"
          maxLength={8}
          className="flex-1 rounded-xl border border-[var(--border)] bg-[var(--bg-card)]
            px-4 py-3 text-[14px] text-[var(--text-primary)] outline-none
            focus:border-red-500/50 transition-colors"
        />
        <button
          type="submit"
          disabled={loading || !inputTicker.trim()}
          className="px-6 py-3 rounded-xl bg-red-500 text-white text-[13px] font-semibold
            hover:bg-red-600 active:scale-95 transition-all
            disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {loading ? (
            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
            </svg>
          )}
          {loading ? "Analisando…" : "Analisar"}
        </button>
      </form>

      {erro && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-[13px] text-red-400">
          {erro}
        </div>
      )}

      {/* Resultado */}
      {resultado && (
        <div className="space-y-6">
          {/* Header do ativo */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h2 className="text-lg font-bold text-[var(--text-primary)]">
                {resultado.ticker} — {resultado.empresa}
              </h2>
              {dados && (
                <p className="text-[11px] text-[var(--text-secondary)]">
                  RS Score: {dados.score?.score_total ?? "N/D"}/1000 · {dados.setor ?? ""}
                </p>
              )}
            </div>
            {!resultado.ia_disponivel && (
              <span className="text-[10px] px-2.5 py-1 rounded-full border border-amber-500/30 bg-amber-500/5 text-amber-400">
                IA indisponível — só z-scores
              </span>
            )}
          </div>

          {/* Contadores */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Críticos",  valor: resultado.total_criticos, cor: "text-red-400",    bg: "bg-red-500/10",    border: "border-red-500/30" },
              { label: "Atenção",   valor: resultado.total_atencao,  cor: "text-amber-400",  bg: "bg-amber-500/10",  border: "border-amber-500/30" },
              { label: "Informativos", valor: resultado.total_info,  cor: "text-blue-400",   bg: "bg-blue-500/10",   border: "border-blue-500/30" },
            ].map(({ label, valor, cor, bg, border }) => (
              <div key={label} className={`rounded-xl border ${border} ${bg} px-4 py-3 text-center`}>
                <p className={`text-2xl font-black ${cor}`}>{valor}</p>
                <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">{label}</p>
              </div>
            ))}
          </div>

          {/* Resumo geral */}
          {resultado.resumo_geral && (
            <div className={`rounded-xl border px-4 py-3 text-[13px] leading-relaxed ${
              resultado.total_criticos > 0
                ? "border-red-500/30 bg-red-500/5 text-red-300"
                : resultado.total_atencao > 0
                ? "border-amber-500/30 bg-amber-500/5 text-amber-300"
                : "border-emerald-500/30 bg-emerald-500/5 text-emerald-300"
            }`}>
              {resultado.resumo_geral}
            </div>
          )}

          {/* Sinais — sem anomalias */}
          {resultado.total_sinais === 0 && (
            <div className="rounded-2xl border border-dashed border-emerald-500/30 p-8 text-center">
              <p className="text-2xl mb-2">✅</p>
              <p className="text-emerald-400 font-semibold text-sm">Sem anomalias detectadas</p>
              <p className="text-[12px] text-[var(--text-secondary)] mt-1">
                Todos os indicadores estão dentro dos parâmetros históricos normais do ativo.
              </p>
            </div>
          )}

          {/* Feed de sinais */}
          {criticos.length > 0 && (
            <div className="space-y-2">
              <p className="text-[11px] font-bold uppercase tracking-wider text-red-400">Críticos</p>
              {criticos.map((s, i) => <SinalCard key={i} sinal={s} />)}
            </div>
          )}
          {atencao.length > 0 && (
            <div className="space-y-2">
              <p className="text-[11px] font-bold uppercase tracking-wider text-amber-400">Atenção</p>
              {atencao.map((s, i) => <SinalCard key={i} sinal={s} />)}
            </div>
          )}
          {info.length > 0 && (
            <div className="space-y-2">
              <p className="text-[11px] font-bold uppercase tracking-wider text-blue-400">Informativos</p>
              {info.map((s, i) => <SinalCard key={i} sinal={s} />)}
            </div>
          )}

          {/* Narrativa detalhada */}
          {resultado.narrativa_detalhada && (
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 space-y-4">
              <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                Análise da IA
              </p>
              <p className="text-[13px] text-[var(--text-primary)] leading-relaxed whitespace-pre-line">
                {resultado.narrativa_detalhada}
              </p>

              {resultado.principais_riscos.length > 0 && (
                <div>
                  <p className="text-[11px] font-bold text-red-400 uppercase tracking-wider mb-2">Principais Riscos</p>
                  <ul className="space-y-1">
                    {resultado.principais_riscos.map((r, i) => (
                      <li key={i} className="flex gap-2 text-[12px] text-[var(--text-primary)]">
                        <span className="text-red-400 shrink-0">▸</span>{r}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {resultado.pontos_positivos.length > 0 && (
                <div>
                  <p className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider mb-2">Pontos Positivos</p>
                  <ul className="space-y-1">
                    {resultado.pontos_positivos.map((p, i) => (
                      <li key={i} className="flex gap-2 text-[12px] text-[var(--text-primary)]">
                        <span className="text-emerald-400 shrink-0">▸</span>{p}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {resultado.recomendacao_acompanhamento && (
                <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 px-4 py-3">
                  <p className="text-[10px] font-bold text-blue-400 uppercase tracking-wider mb-1">O que monitorar</p>
                  <p className="text-[12px] text-[var(--text-primary)]">{resultado.recomendacao_acompanhamento}</p>
                </div>
              )}
            </div>
          )}

          <p className="text-[10px] text-[var(--text-secondary)] opacity-50 text-center">
            {resultado.aviso}
          </p>
        </div>
      )}

      {/* Estado inicial */}
      {!resultado && !loading && !erro && (
        <div className="rounded-2xl border border-dashed border-[var(--border)] p-12 text-center">
          <p className="text-4xl mb-4">📡</p>
          <p className="text-[var(--text-primary)] font-semibold mb-1">Radar de Anomalias</p>
          <p className="text-[13px] text-[var(--text-secondary)]">
            Digite um ticker acima para detectar desvios estatísticos nos indicadores financeiros
          </p>
        </div>
      )}
    </div>
  );
}
