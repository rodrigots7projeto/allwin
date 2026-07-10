"use client";

import { useState, useCallback, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import type { RSAnalisaData } from "@/types";
import {
  getRSAnalisa,
  postCompare,
  type PerfilComparacao,
  type ComparativoResult,
  type ScoreTicker,
} from "@/lib/api";

// ── Constantes ────────────────────────────────────────────────────────────────

const PERFIS: { id: PerfilComparacao; label: string; desc: string }[] = [
  { id: "equilibrio",  label: "Equilibrado",   desc: "Pondera todas as dimensões igualmente" },
  { id: "dividendos",  label: "Renda",          desc: "Prioriza DY e qualidade de dividendos" },
  { id: "crescimento", label: "Crescimento",    desc: "Prioriza receita, EBITDA e momentum" },
];

const DIMENSOES: { campo: keyof ScoreTicker; label: string }[] = [
  { campo: "lucros",        label: "Qualidade de Lucros" },
  { campo: "crescimento",   label: "Crescimento" },
  { campo: "saude",         label: "Saúde Financeira" },
  { campo: "valuation_pts", label: "Valuation" },
  { campo: "dividendos",    label: "Dividendos" },
  { campo: "governanca",    label: "Governança" },
  { campo: "momentum",      label: "Momentum" },
  { campo: "eficiencia",    label: "Eficiência" },
];

const DIM_MAP: Record<keyof ScoreTicker, keyof ComparativoResult["vencedores_dimensoes"]> = {
  lucros:        "lucros",
  crescimento:   "crescimento",
  saude:         "saude",
  valuation_pts: "valuation",
  dividendos:    "dividendos",
  governanca:    "governanca",
  momentum:      "momentum",
  eficiencia:    "eficiencia",
  score_total:   "lucros",   // não usado
  nota_geral:    "lucros",   // não usado
};

const MAX_SCORE: Record<keyof ScoreTicker, number> = {
  lucros: 150, crescimento: 150, saude: 150,
  valuation_pts: 125, dividendos: 100, governanca: 100,
  momentum: 75, eficiencia: 75,
  score_total: 1000, nota_geral: 1,
};

const COR_NOTA: Record<string, string> = {
  "Excelente":  "#10b981",
  "Muito Bom":  "#22c55e",
  "Bom":        "#84cc16",
  "Regular":    "#f59e0b",
  "Fraco":      "#ef4444",
  "Muito Fraco":"#b91c1c",
};

function corScore(v: number | null, max: number): string {
  if (v === null) return "var(--text-secondary)";
  const pct = v / max;
  if (pct >= 0.75) return "#10b981";
  if (pct >= 0.5)  return "#f59e0b";
  return "#ef4444";
}

// ── Subcomponentes ────────────────────────────────────────────────────────────

function TickerChip({
  ticker,
  onRemove,
}: {
  ticker: string;
  onRemove: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl
      bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[13px] font-medium">
      {ticker}
      <button
        onClick={onRemove}
        className="w-4 h-4 rounded-full bg-emerald-500/20 flex items-center justify-center
          hover:bg-emerald-500/40 transition-colors text-[10px] font-bold"
      >
        ×
      </button>
    </span>
  );
}

function HeatCell({
  valor, max, vencedor, ticker,
}: {
  valor: number | null;
  max: number;
  vencedor: string;
  ticker: string;
}) {
  const isWinner = vencedor.toLowerCase() === ticker.toLowerCase();
  const isTie = vencedor.toLowerCase() === "empate";
  const cor = corScore(valor, max);
  return (
    <td className={`px-4 py-3 text-center text-[13px] font-semibold transition-colors ${
      isWinner ? "bg-emerald-500/10" : isTie ? "bg-yellow-500/5" : ""
    }`}>
      <span style={{ color: cor }}>
        {valor !== null ? valor : "N/D"}
      </span>
      {isWinner && <span className="ml-1 text-emerald-400 text-[10px]">★</span>}
    </td>
  );
}

function ScoreBar({ valor, max }: { valor: number | null; max: number }) {
  const pct = valor !== null ? Math.round((valor / max) * 100) : 0;
  const cor = corScore(valor, max);
  return (
    <div className="h-1.5 rounded-full bg-[var(--bg-secondary)] overflow-hidden mt-1">
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${pct}%`, backgroundColor: cor }}
      />
    </div>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────

function CompararContent() {
  const searchParams = useSearchParams();
  const [inputTicker, setInputTicker] = useState("");
  const [tickers, setTickers] = useState<string[]>([]);
  const [perfil, setPerfil] = useState<PerfilComparacao>("equilibrio");
  const [loading, setLoading] = useState(false);
  const [fetchingTicker, setFetchingTicker] = useState<string | null>(null);
  const [dadosAtivos, setDadosAtivos] = useState<Record<string, RSAnalisaData>>({});
  const [resultado, setResultado] = useState<ComparativoResult | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [erroStaticFallback, setErroStaticFallback] = useState(false);

  const adicionarTicker = useCallback(async () => {
    const t = inputTicker.trim().toUpperCase();
    if (!t || tickers.includes(t) || tickers.length >= 4) return;
    setFetchingTicker(t);
    setErro(null);
    try {
      const dados = await getRSAnalisa(t);
      setDadosAtivos(prev => ({ ...prev, [t]: dados }));
      setTickers(prev => [...prev, t]);
      setInputTicker("");
      setResultado(null);
    } catch {
      setErro(`Ticker "${t}" não encontrado ou indisponível.`);
    } finally {
      setFetchingTicker(null);
    }
  }, [inputTicker, tickers]);

  // Auto-adiciona tickers vindos da URL (?tickers=ITUB4,VALE3)
  useEffect(() => {
    const param = searchParams.get("tickers");
    if (!param) return;
    const lista = param.split(",").map(t => t.trim().toUpperCase()).filter(Boolean).slice(0, 4);
    lista.forEach(async (t) => {
      try {
        const dados = await getRSAnalisa(t);
        setDadosAtivos(prev => ({ ...prev, [t]: dados }));
        setTickers(prev => prev.includes(t) ? prev : [...prev, t]);
      } catch { /* ignora tickers inválidos */ }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const removerTicker = useCallback((t: string) => {
    setTickers(prev => prev.filter(x => x !== t));
    setDadosAtivos(prev => {
      const next = { ...prev };
      delete next[t];
      return next;
    });
    setResultado(null);
  }, []);

  const comparar = useCallback(async () => {
    if (tickers.length < 2) return;
    setLoading(true);
    setErro(null);
    setErroStaticFallback(false);
    setResultado(null);
    try {
      const ativos = tickers.map(t => ({ ticker: t, dados: dadosAtivos[t] }));
      const res = await postCompare(ativos, perfil);
      setResultado(res);
    } catch (e: unknown) {
      const err = e as { isStaticFallback?: boolean; message?: string };
      if (err.isStaticFallback) {
        setErroStaticFallback(true);
      } else {
        setErro(err.message ?? "Erro ao comparar ativos.");
      }
    } finally {
      setLoading(false);
    }
  }, [tickers, dadosAtivos, perfil]);

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">Comparador de Ativos</h1>
        <p className="text-sm text-[var(--text-secondary)] mt-1">
          Compare até 4 ativos lado a lado — RS Score por dimensão + veredicto por IA
        </p>
      </div>

      {/* Seletor de tickers */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 space-y-4">
        <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">
          Selecionar Ativos (2–4)
        </p>

        <div className="flex gap-2 flex-wrap">
          {tickers.map(t => (
            <TickerChip key={t} ticker={t} onRemove={() => removerTicker(t)} />
          ))}
        </div>

        {tickers.length < 4 && (
          <form
            onSubmit={e => { e.preventDefault(); void adicionarTicker(); }}
            className="flex gap-2"
          >
            <input
              type="text"
              value={inputTicker}
              onChange={e => setInputTicker(e.target.value.toUpperCase())}
              placeholder="Ex: PETR4, VALE3, WEGE3…"
              maxLength={8}
              className="flex-1 rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)]
                px-4 py-2.5 text-[13px] text-[var(--text-primary)] outline-none
                focus:border-emerald-500/50 transition-colors"
            />
            <button
              type="submit"
              disabled={!!fetchingTicker || !inputTicker.trim()}
              className="px-5 py-2.5 rounded-xl bg-emerald-500 text-white text-[13px] font-medium
                hover:bg-emerald-600 active:scale-95 transition-all
                disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {fetchingTicker ? "Buscando…" : "Adicionar"}
            </button>
          </form>
        )}

        {erro && !resultado && (
          <p className="text-[12px] text-red-400">{erro}</p>
        )}
        {erroStaticFallback && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-[12px] text-amber-400">
            O Comparador por IA requer OPENAI_API_KEY configurada no backend.
            A tabela de scores acima ainda está disponível para comparação manual.
          </div>
        )}
      </div>

      {/* Seletor de perfil */}
      {tickers.length >= 2 && (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 space-y-3">
          <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">
            Perfil de Investidor
          </p>
          <div className="grid grid-cols-3 gap-3">
            {PERFIS.map(p => (
              <button
                key={p.id}
                onClick={() => { setPerfil(p.id); setResultado(null); }}
                className={`rounded-xl border p-3 text-left transition-all ${
                  perfil === p.id
                    ? "border-emerald-500/60 bg-emerald-500/10"
                    : "border-[var(--border)] hover:border-emerald-500/30"
                }`}
              >
                <p className={`text-[13px] font-semibold ${perfil === p.id ? "text-emerald-400" : "text-[var(--text-primary)]"}`}>
                  {p.label}
                </p>
                <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">{p.desc}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Tabela heatmap de scores — sempre visível ao ter ≥2 tickers */}
      {tickers.length >= 2 && (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden">
          <div className="px-5 py-4 border-b border-[var(--border)]">
            <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">
              RS Score por Dimensão
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                    Dimensão
                  </th>
                  {tickers.map(t => (
                    <th key={t} className="px-4 py-3 text-center text-[11px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                      {t}
                      <div className="text-[10px] font-normal text-[var(--text-secondary)] opacity-70 truncate max-w-[80px] mx-auto">
                        {dadosAtivos[t]?.empresa}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {DIMENSOES.map(({ campo, label }, i) => {
                  const vencedorDim = resultado
                    ? resultado.vencedores_dimensoes[DIM_MAP[campo]] ?? ""
                    : "";
                  return (
                    <tr
                      key={campo}
                      className={`border-b border-[var(--border)]/50 ${i % 2 === 0 ? "bg-[var(--bg-secondary)]/30" : ""}`}
                    >
                      <td className="px-4 py-3 text-[var(--text-secondary)] font-medium">{label}</td>
                      {tickers.map(t => {
                        const score = dadosAtivos[t]?.score;
                        const v = score ? ((score as unknown) as Record<string, number>)[campo] ?? null : null;
                        const max = MAX_SCORE[campo] as number;
                        return resultado ? (
                          <HeatCell key={t} valor={v} max={max} vencedor={vencedorDim} ticker={t} />
                        ) : (
                          <td key={t} className="px-4 py-3 text-center">
                            <span style={{ color: corScore(v, max) }} className="font-semibold">
                              {v !== null ? v : "N/D"}
                            </span>
                            {v !== null && <ScoreBar valor={v} max={max} />}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
                {/* Totais */}
                <tr className="bg-[var(--bg-secondary)]/60 border-t-2 border-[var(--border)]">
                  <td className="px-4 py-3 font-bold text-[var(--text-primary)]">Score Total</td>
                  {tickers.map(t => {
                    const total = dadosAtivos[t]?.score?.score_total ?? null;
                    const nota = dadosAtivos[t]?.score?.nota_geral;
                    return (
                      <td key={t} className="px-4 py-3 text-center">
                        <div className="font-bold text-[15px]" style={{ color: corScore(total, 1000) }}>
                          {total ?? "N/D"}
                        </div>
                        {nota && (
                          <div className="text-[10px] font-medium mt-0.5" style={{ color: COR_NOTA[nota] ?? "var(--text-secondary)" }}>
                            {nota}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>

          {/* Botão comparar */}
          <div className="px-5 py-4 border-t border-[var(--border)] flex items-center gap-3">
            <button
              onClick={() => void comparar()}
              disabled={loading || tickers.length < 2}
              className="px-6 py-2.5 rounded-xl bg-emerald-500 text-white text-[13px] font-semibold
                hover:bg-emerald-600 active:scale-95 transition-all
                disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {loading ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Analisando…
                </>
              ) : (
                <>
                  <span className="w-4 h-4 rounded-full bg-white/20 flex items-center justify-center text-[9px] font-bold">IA</span>
                  Gerar Veredicto por IA
                </>
              )}
            </button>
            {tickers.length < 2 && (
              <p className="text-[11px] text-[var(--text-secondary)]">Adicione pelo menos 2 ativos</p>
            )}
          </div>
        </div>
      )}

      {/* Resultado da IA */}
      {resultado && (
        <div className="space-y-5">
          {/* Vencedor geral */}
          <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/5 p-6">
            <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-500 mb-2">
              Veredicto — Perfil {PERFIS.find(p => p.id === resultado.perfil)?.label}
            </p>
            <div className="flex flex-wrap items-center gap-4">
              <div>
                <p className="text-[11px] text-[var(--text-secondary)]">Melhor opção geral</p>
                <p className="text-3xl font-black text-emerald-400 mt-0.5">{resultado.vencedor_geral}</p>
                <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                  {dadosAtivos[resultado.vencedor_geral]?.empresa}
                </p>
              </div>
            </div>
          </div>

          {/* Recomendações por perfil */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              { key: "recomendacao_dividendos",  label: "Perfil Renda",        cor: "#f59e0b" },
              { key: "recomendacao_crescimento", label: "Perfil Crescimento",  cor: "#3b82f6" },
              { key: "recomendacao_equilibrio",  label: "Perfil Equilibrado",  cor: "#10b981" },
            ].map(({ key, label, cor }) => (
              <div key={key} className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
                <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: cor }}>
                  {label}
                </p>
                <p className="text-[12px] text-[var(--text-primary)] leading-relaxed">
                  {resultado[key as keyof ComparativoResult] as string || "—"}
                </p>
              </div>
            ))}
          </div>

          {/* Narrativa */}
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
            <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-secondary)] mb-3">
              Análise do Trade-off
            </p>
            <p className="text-[13px] text-[var(--text-primary)] leading-relaxed whitespace-pre-line">
              {resultado.narrativa}
            </p>
          </div>

          {/* Aviso */}
          <p className="text-[10px] text-[var(--text-secondary)] opacity-50 text-center">
            {resultado.aviso}
          </p>
        </div>
      )}

      {/* Estado vazio */}
      {tickers.length === 0 && (
        <div className="rounded-2xl border border-dashed border-[var(--border)] p-12 text-center">
          <p className="text-4xl mb-4">⚖️</p>
          <p className="text-[var(--text-primary)] font-semibold mb-1">Compare ativos da B3</p>
          <p className="text-[13px] text-[var(--text-secondary)]">
            Adicione de 2 a 4 tickers acima para ver o comparativo de RS Score e o veredicto por IA
          </p>
        </div>
      )}
    </div>
  );
}

export default function CompararPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-[var(--text-secondary)]">Carregando...</div>}>
      <CompararContent />
    </Suspense>
  );
}
