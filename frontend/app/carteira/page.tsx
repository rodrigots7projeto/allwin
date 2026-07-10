"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend,
  Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { useCarteira } from "@/contexts/CarteiraContext";
import { CarteiraBotoes } from "@/components/carteira/CarteiraBotoes";
import { AddCarteiraModal } from "@/components/carteira/AddCarteiraModal";
import type { OperacaoCarteira, PosicaoEnriquecida, QuoteData } from "@/types";
import { getMercado } from "@/lib/api";

// ── Formatadores ──────────────────────────────────────────────────────────────

const Ri = (v: number, dec = 2) =>
  `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: dec, maximumFractionDigits: dec })}`;
const Pct = (v: number, showSign = true) =>
  `${showSign && v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
const Bi = (v: number) => {
  const abs = Math.abs(v);
  if (abs >= 1e9) return `R$ ${(v / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `R$ ${(v / 1e6).toFixed(2)}M`;
  return Ri(v);
};

// ── Cores para gráficos ───────────────────────────────────────────────────────

const PALETTE = [
  "#10b981", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6",
  "#ec4899", "#06b6d4", "#84cc16", "#f97316", "#64748b",
  "#a78bfa", "#34d399", "#fb923c", "#60a5fa", "#fbbf24",
];

// ── Tipos de aba ──────────────────────────────────────────────────────────────

type Tab = "resumo" | "ativos" | "composicao" | "historico" | "simulacoes";

const TABS: { key: Tab; label: string; emoji: string }[] = [
  { key: "resumo",     label: "Resumo",      emoji: "📊" },
  { key: "ativos",     label: "Ativos",      emoji: "📋" },
  { key: "composicao", label: "Composição",  emoji: "🥧" },
  { key: "historico",  label: "Histórico",   emoji: "📜" },
  { key: "simulacoes", label: "Simulações",  emoji: "🔮" },
];

// ── Componente principal ──────────────────────────────────────────────────────

export default function CarteiraPage() {
  const { posicoes, operacoes, favoritos, deleteOp } = useCarteira();
  const [cotacoes, setCotacoes] = useState<QuoteData[]>([]);
  const [loadingCotas, setLoadingCotas] = useState(false);
  const [tab, setTab] = useState<Tab>("resumo");
  const [editOp, setEditOp] = useState<OperacaoCarteira | null>(null);

  // Busca preços em lote para todos os tickers na carteira
  const carregarCotacoes = useCallback(async () => {
    if (posicoes.length === 0) { setCotacoes([]); return; }
    setLoadingCotas(true);
    try {
      const tickers = posicoes.map((p) => p.ticker);
      const result = await getMercado(undefined, tickers);
      setCotacoes(result);
    } catch {
      setCotacoes([]);
    } finally {
      setLoadingCotas(false);
    }
  }, [posicoes]);

  useEffect(() => { carregarCotacoes(); }, [carregarCotacoes]);

  // Enriquece posições com cotações ao vivo
  const posEnriq = useMemo((): PosicaoEnriquecida[] => {
    const total_atual = posicoes.reduce((acc, p) => {
      const q = cotacoes.find((c) => c.ticker === p.ticker);
      return acc + (q ? q.preco_atual * p.quantidade_total : p.custo_total);
    }, 0);

    return posicoes.map((p) => {
      const q = cotacoes.find((c) => c.ticker === p.ticker);
      const preco_atual = q?.preco_atual;
      const valor_atual = preco_atual != null ? preco_atual * p.quantidade_total : undefined;
      const lucro = valor_atual != null ? valor_atual - p.custo_total : undefined;
      const lucro_pct = lucro != null && p.custo_total > 0 ? (lucro / p.custo_total) * 100 : undefined;
      const participacao_pct = valor_atual != null && total_atual > 0 ? (valor_atual / total_atual) * 100 : undefined;

      return {
        ...p,
        nome_curto: q?.nome_curto,
        setor: q?.setor ?? undefined,
        subsetor: q?.subsetor ?? undefined,
        preco_atual,
        variacao_pct: q?.variacao_pct,
        valor_atual,
        lucro,
        lucro_pct,
        dy: q?.preco_lucro != null && q.preco_lucro > 0 ? undefined : undefined, // DY não disponível em QuoteData
        participacao_pct,
      };
    });
  }, [posicoes, cotacoes]);

  // Métricas resumo
  const resumo = useMemo(() => {
    const valor_investido = posEnriq.reduce((s, p) => s + p.custo_total, 0);
    const valor_atual = posEnriq.reduce((s, p) => s + (p.valor_atual ?? p.custo_total), 0);
    const lucro_total = valor_atual - valor_investido;
    const rentabilidade = valor_investido > 0 ? (lucro_total / valor_investido) * 100 : 0;
    const proventos = posEnriq.reduce((s, p) => s + p.proventos_recebidos, 0);
    const var_dia = posEnriq.reduce((s, p) => {
      const q = cotacoes.find((c) => c.ticker === p.ticker);
      if (!q || !p.valor_atual) return s;
      return s + (q.variacao_pct / 100) * p.valor_atual;
    }, 0);

    const comValor = posEnriq.filter((p) => p.valor_atual != null);
    const maior_posicao = [...comValor].sort((a, b) => (b.valor_atual ?? 0) - (a.valor_atual ?? 0))[0];
    const maior_ganho = [...comValor].filter((p) => p.lucro_pct != null).sort((a, b) => (b.lucro_pct ?? 0) - (a.lucro_pct ?? 0))[0];
    const maior_perda = [...comValor].filter((p) => p.lucro_pct != null).sort((a, b) => (a.lucro_pct ?? 0) - (b.lucro_pct ?? 0))[0];

    return { valor_investido, valor_atual, lucro_total, rentabilidade, proventos, var_dia, maior_posicao, maior_ganho, maior_perda };
  }, [posEnriq, cotacoes]);

  // Estado vazio
  if (posicoes.length === 0 && favoritos.length === 0 && operacoes.length === 0) {
    return <CarteiraVazia />;
  }

  return (
    <main className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">Minha Carteira</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-0.5">
            {posicoes.length} {posicoes.length === 1 ? "ativo" : "ativos"} · {favoritos.length} {favoritos.length === 1 ? "favorito" : "favoritos"}
          </p>
        </div>
        <button
          onClick={carregarCotacoes}
          disabled={loadingCotas}
          title="Atualizar cotações"
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[var(--border)] text-sm text-[var(--text-secondary)] hover:border-emerald-500/40 hover:text-emerald-500 disabled:opacity-40 transition-all"
        >
          <svg className={`w-3.5 h-3.5 ${loadingCotas ? "animate-spin" : ""}`} viewBox="0 0 16 16" fill="none">
            <path d="M14 8A6 6 0 1 1 2 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            <path d="M14 4v4h-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span className="hidden sm:inline">{loadingCotas ? "Atualizando…" : "Atualizar"}</span>
        </button>
      </div>

      {/* Cards de resumo topo */}
      {posicoes.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <ResumoCard
            label="Valor Investido"
            valor={Bi(resumo.valor_investido)}
            sub="custo total"
            cor="text-[var(--text-primary)]"
          />
          <ResumoCard
            label="Valor Atual"
            valor={Bi(resumo.valor_atual)}
            sub={loadingCotas ? "atualizando…" : "cotação ao vivo"}
            cor="text-emerald-500"
          />
          <ResumoCard
            label="Lucro / Prejuízo"
            valor={Bi(resumo.lucro_total)}
            sub={Pct(resumo.rentabilidade)}
            cor={resumo.lucro_total >= 0 ? "text-emerald-500" : "text-red-400"}
            destaque
          />
          <ResumoCard
            label="Variação no Dia"
            valor={Ri(Math.abs(resumo.var_dia))}
            sub={`${resumo.var_dia >= 0 ? "+" : "-"}${Math.abs(resumo.var_dia).toLocaleString("pt-BR", { minimumFractionDigits: 2 })} R$`}
            cor={resumo.var_dia >= 0 ? "text-emerald-500" : "text-red-400"}
          />
          <ResumoCard
            label="Proventos"
            valor={Bi(resumo.proventos)}
            sub="dividendos + JCP"
            cor="text-blue-400"
          />
        </div>
      )}

      {/* Segunda linha de cards */}
      {posicoes.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <ResumoCard label="Ativos" valor={String(posicoes.length)} sub="posições abertas" cor="text-[var(--text-primary)]" />
          <ResumoCard
            label="Maior Posição"
            valor={resumo.maior_posicao?.ticker ?? "—"}
            sub={resumo.maior_posicao ? Bi(resumo.maior_posicao.valor_atual ?? resumo.maior_posicao.custo_total) : "—"}
            cor="text-violet-400"
          />
          <ResumoCard
            label="Maior Ganho"
            valor={resumo.maior_ganho?.ticker ?? "—"}
            sub={resumo.maior_ganho?.lucro_pct != null ? Pct(resumo.maior_ganho.lucro_pct) : "—"}
            cor="text-emerald-500"
          />
          <ResumoCard
            label="Maior Perda"
            valor={resumo.maior_perda?.ticker ?? "—"}
            sub={resumo.maior_perda?.lucro_pct != null ? Pct(resumo.maior_perda.lucro_pct) : "—"}
            cor={resumo.maior_perda && (resumo.maior_perda.lucro_pct ?? 0) < 0 ? "text-red-400" : "text-[var(--text-secondary)]"}
          />
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-[var(--border)]">
        <div className="flex gap-0.5 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors flex items-center gap-1.5 ${
                tab === t.key
                  ? "border-pink-500 text-pink-500"
                  : "border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              <span className="hidden sm:inline">{t.emoji}</span> {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── ABA RESUMO ─────────────────────────────────────────────────────── */}
      {tab === "resumo" && (
        <div className="space-y-6">
          {posicoes.length === 0 ? (
            <EmptySection
              emoji="📊"
              texto="Sem ativos na carteira ainda."
              sub='Clique em "➕ Add Carteira" em qualquer ativo para começar.'
            />
          ) : (
            <>
              {/* Gráfico: barras de valor investido vs atual */}
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
                <h3 className="text-sm font-semibold text-[var(--text-secondary)] mb-4 uppercase tracking-wider">
                  Valor Investido vs. Valor Atual por Ativo
                </h3>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={posEnriq.slice(0, 10).map((p) => ({
                    ticker: p.ticker,
                    Investido: parseFloat(p.custo_total.toFixed(2)),
                    Atual: parseFloat((p.valor_atual ?? p.custo_total).toFixed(2)),
                  }))} barCategoryGap="30%">
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="ticker" tick={{ fontSize: 11, fill: "var(--text-secondary)" }} />
                    <YAxis tick={{ fontSize: 11, fill: "var(--text-secondary)" }} tickFormatter={(v) => `R$${(v/1000).toFixed(0)}k`} />
                    <Tooltip
                      contentStyle={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "12px", fontSize: 12 }}
                      formatter={(v: unknown) => [Ri(Number(v)), ""]}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="Investido" fill="#64748b" radius={[4,4,0,0]} />
                    <Bar dataKey="Atual" radius={[4,4,0,0]}>
                      {posEnriq.slice(0, 10).map((p) => (
                        <Cell key={p.ticker} fill={(p.lucro ?? 0) >= 0 ? "#10b981" : "#ef4444"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Gráfico: pizza composição rápida */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
                  <h3 className="text-sm font-semibold text-[var(--text-secondary)] mb-4 uppercase tracking-wider">
                    Composição da Carteira
                  </h3>
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie
                        data={posEnriq.map((p, i) => ({
                          name: p.ticker,
                          value: parseFloat((p.valor_atual ?? p.custo_total).toFixed(2)),
                          fill: PALETTE[i % PALETTE.length],
                        }))}
                        dataKey="value"
                        nameKey="name"
                        cx="50%" cy="50%"
                        outerRadius={90}
                        innerRadius={50}
                        paddingAngle={2}
                      >
                        {posEnriq.map((p, i) => (
                          <Cell key={p.ticker} fill={PALETTE[i % PALETTE.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "12px", fontSize: 12 }}
                        formatter={(v: unknown) => [Ri(Number(v)), ""]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex flex-wrap gap-2 justify-center mt-2">
                    {posEnriq.slice(0, 8).map((p, i) => (
                      <span key={p.ticker} className="flex items-center gap-1 text-[11px] text-[var(--text-secondary)]">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: PALETTE[i % PALETTE.length] }} />
                        {p.ticker} {p.participacao_pct != null ? `(${p.participacao_pct.toFixed(1)}%)` : ""}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Tabela top 5 */}
                <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
                  <h3 className="text-sm font-semibold text-[var(--text-secondary)] mb-4 uppercase tracking-wider">
                    Top Posições
                  </h3>
                  <div className="space-y-2.5">
                    {posEnriq.slice(0, 7).map((p, i) => {
                      const pct = p.participacao_pct ?? 0;
                      const ganho = p.lucro_pct;
                      return (
                        <div key={p.ticker} className="flex items-center gap-3">
                          <span className="text-[11px] font-bold text-[var(--text-secondary)] w-4">{i + 1}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex justify-between items-baseline mb-1">
                              <span className="text-sm font-semibold font-mono text-[var(--text-primary)]">{p.ticker}</span>
                              <span className={`text-xs font-semibold ${ganho != null && ganho >= 0 ? "text-emerald-500" : "text-red-400"}`}>
                                {ganho != null ? Pct(ganho) : "—"}
                              </span>
                            </div>
                            <div className="h-1.5 rounded-full bg-[var(--border)] overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all"
                                style={{ width: `${pct}%`, background: PALETTE[i % PALETTE.length] }}
                              />
                            </div>
                            <div className="flex justify-between mt-0.5 text-[10px] text-[var(--text-secondary)]">
                              <span>{p.nome_curto ?? "—"}</span>
                              <span>{pct.toFixed(1)}%</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Favoritos */}
          {favoritos.length > 0 && (
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
              <h3 className="text-sm font-semibold text-[var(--text-secondary)] mb-3 uppercase tracking-wider">
                ❤️ Favoritos ({favoritos.length})
              </h3>
              <div className="flex flex-wrap gap-2">
                {favoritos.map((f) => (
                  <Link
                    key={f.ticker}
                    href={`/ativo/${f.ticker}`}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[var(--border)] text-sm font-mono hover:border-pink-500/50 hover:text-pink-400 transition-all"
                  >
                    ❤️ {f.ticker}
                    {f.nome && <span className="text-[11px] text-[var(--text-secondary)] font-sans">{f.nome}</span>}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── ABA ATIVOS ─────────────────────────────────────────────────────── */}
      {tab === "ativos" && (
        <div className="space-y-4">
          {posicoes.length === 0 ? (
            <EmptySection emoji="📋" texto="Nenhum ativo na carteira." sub='Use o botão "➕ Add Carteira" em qualquer ativo.' />
          ) : (
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[900px]">
                  <thead>
                    <tr className="border-b border-[var(--border)] bg-[var(--border)]/10">
                      {["Ativo","Qtd","Preço Médio","Preço Atual","Vl. Investido","Vl. Atual","Lucro R$","Lucro %","Var. Dia","Setor","Part. %"].map((h) => (
                        <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider whitespace-nowrap">{h}</th>
                      ))}
                      <th className="px-4 py-3 w-16" />
                    </tr>
                  </thead>
                  <tbody>
                    {posEnriq.map((p) => {
                      const lucroPos = (p.lucro ?? 0) >= 0;
                      const varPos = (p.variacao_pct ?? 0) >= 0;
                      return (
                        <tr key={p.ticker} className="border-b border-[var(--border)]/50 hover:bg-[var(--border)]/8 transition-colors group">
                          <td className="px-4 py-3">
                            <div className="flex flex-col">
                              <span className="font-bold font-mono text-[var(--text-primary)] text-base leading-tight">{p.ticker}</span>
                              <span className="text-[11px] text-[var(--text-secondary)] mt-0.5 truncate max-w-[130px]">{p.nome_curto ?? "—"}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 font-mono text-[var(--text-primary)]">
                            {p.quantidade_total.toLocaleString("pt-BR")}
                          </td>
                          <td className="px-4 py-3 font-mono text-[var(--text-secondary)]">
                            {Ri(p.preco_medio)}
                          </td>
                          <td className="px-4 py-3 font-mono font-semibold text-[var(--text-primary)]">
                            {p.preco_atual != null ? Ri(p.preco_atual) : <span className="opacity-40">—</span>}
                          </td>
                          <td className="px-4 py-3 font-mono text-[var(--text-secondary)]">
                            {Ri(p.custo_total)}
                          </td>
                          <td className="px-4 py-3 font-mono font-semibold text-[var(--text-primary)]">
                            {p.valor_atual != null ? Ri(p.valor_atual) : <span className="opacity-40">—</span>}
                          </td>
                          <td className={`px-4 py-3 font-mono font-semibold ${p.lucro != null ? (lucroPos ? "text-emerald-500" : "text-red-400") : "opacity-40"}`}>
                            {p.lucro != null ? (lucroPos ? "+" : "") + Ri(p.lucro) : "—"}
                          </td>
                          <td className={`px-4 py-3 font-mono font-semibold ${p.lucro_pct != null ? (lucroPos ? "text-emerald-500" : "text-red-400") : "opacity-40"}`}>
                            {p.lucro_pct != null ? Pct(p.lucro_pct) : "—"}
                          </td>
                          <td className={`px-4 py-3 font-mono text-sm ${p.variacao_pct != null ? (varPos ? "text-emerald-500" : "text-red-400") : "opacity-40"}`}>
                            {p.variacao_pct != null ? Pct(p.variacao_pct) : "—"}
                          </td>
                          <td className="px-4 py-3 text-xs text-[var(--text-secondary)] max-w-[120px]">
                            <span className="truncate block">{p.setor ?? "—"}</span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5">
                              <div className="h-1.5 w-16 rounded-full bg-[var(--border)] overflow-hidden">
                                <div className="h-full rounded-full bg-pink-500" style={{ width: `${p.participacao_pct ?? 0}%` }} />
                              </div>
                              <span className="text-[11px] font-mono text-[var(--text-secondary)]">
                                {p.participacao_pct?.toFixed(1) ?? "—"}%
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Link
                                href={`/ativo/${p.ticker}`}
                                className="px-2 py-1 rounded-lg border border-[var(--border)] text-[11px] text-[var(--text-secondary)] hover:text-emerald-500 hover:border-emerald-500/40 transition-colors"
                                title="Ver ativo"
                              >
                                →
                              </Link>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-[var(--border)]/10 border-t border-[var(--border)]">
                      <td className="px-4 py-3 text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider" colSpan={4}>Total</td>
                      <td className="px-4 py-3 font-mono font-bold text-[var(--text-primary)]">{Ri(resumo.valor_investido)}</td>
                      <td className="px-4 py-3 font-mono font-bold text-emerald-500">{Ri(resumo.valor_atual)}</td>
                      <td className={`px-4 py-3 font-mono font-bold ${resumo.lucro_total >= 0 ? "text-emerald-500" : "text-red-400"}`}>
                        {(resumo.lucro_total >= 0 ? "+" : "") + Ri(resumo.lucro_total)}
                      </td>
                      <td className={`px-4 py-3 font-mono font-bold ${resumo.rentabilidade >= 0 ? "text-emerald-500" : "text-red-400"}`}>
                        {Pct(resumo.rentabilidade)}
                      </td>
                      <td colSpan={4} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── ABA COMPOSIÇÃO ─────────────────────────────────────────────────── */}
      {tab === "composicao" && (
        <div className="space-y-6">
          {posicoes.length === 0 ? (
            <EmptySection emoji="🥧" texto="Sem posições para exibir composição." />
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Por ativo */}
              <GraficoPizza
                titulo="Por Ativo"
                dados={posEnriq.map((p, i) => ({
                  name: p.ticker,
                  value: parseFloat((p.valor_atual ?? p.custo_total).toFixed(2)),
                  cor: PALETTE[i % PALETTE.length],
                }))}
              />

              {/* Por setor */}
              <GraficoPizza
                titulo="Por Setor"
                dados={(() => {
                  const map = new Map<string, number>();
                  posEnriq.forEach((p) => {
                    const k = p.setor ?? "Outros";
                    map.set(k, (map.get(k) ?? 0) + (p.valor_atual ?? p.custo_total));
                  });
                  return Array.from(map.entries())
                    .sort((a, b) => b[1] - a[1])
                    .map(([name, value], i) => ({ name, value: parseFloat(value.toFixed(2)), cor: PALETTE[i % PALETTE.length] }));
                })()}
              />

              {/* Concentração */}
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 lg:col-span-2">
                <h3 className="text-sm font-semibold text-[var(--text-secondary)] mb-4 uppercase tracking-wider">
                  Concentração de Risco
                </h3>
                <div className="space-y-3">
                  {posEnriq.map((p, i) => {
                    const pct = p.participacao_pct ?? 0;
                    const risco = pct > 30 ? "alta" : pct > 15 ? "media" : "baixa";
                    return (
                      <div key={p.ticker} className="flex items-center gap-3">
                        <span className="text-xs font-mono font-semibold text-[var(--text-primary)] w-14 shrink-0">{p.ticker}</span>
                        <div className="flex-1 h-4 rounded-full bg-[var(--border)] overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${pct}%`,
                              background: risco === "alta" ? "#ef4444" : risco === "media" ? "#f59e0b" : PALETTE[i % PALETTE.length],
                            }}
                          />
                        </div>
                        <span className="text-xs font-mono w-12 text-right text-[var(--text-secondary)]">{pct.toFixed(1)}%</span>
                        {risco === "alta" && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-500/15 text-red-400 font-semibold shrink-0">Alta</span>
                        )}
                      </div>
                    );
                  })}
                </div>
                {posEnriq.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-[var(--border)] grid grid-cols-3 gap-4 text-center">
                    <div>
                      <p className="text-[10px] uppercase text-[var(--text-secondary)] tracking-wider">Top 1</p>
                      <p className="font-bold text-[var(--text-primary)]">{(posEnriq[0]?.participacao_pct ?? 0).toFixed(1)}%</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase text-[var(--text-secondary)] tracking-wider">Top 3</p>
                      <p className="font-bold text-[var(--text-primary)]">
                        {posEnriq.slice(0, 3).reduce((s, p) => s + (p.participacao_pct ?? 0), 0).toFixed(1)}%
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase text-[var(--text-secondary)] tracking-wider">Nº Ativos</p>
                      <p className="font-bold text-[var(--text-primary)]">{posicoes.length}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── ABA HISTÓRICO ──────────────────────────────────────────────────── */}
      {tab === "historico" && (
        <div className="space-y-4">
          {operacoes.length === 0 ? (
            <EmptySection emoji="📜" texto="Nenhuma operação registrada ainda." />
          ) : (
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden">
              <div className="px-5 py-3 border-b border-[var(--border)] flex items-center justify-between">
                <span className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
                  {operacoes.length} {operacoes.length === 1 ? "operação" : "operações"}
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[700px]">
                  <thead>
                    <tr className="border-b border-[var(--border)] bg-[var(--border)]/10">
                      {["Data","Tipo","Ticker","Qtd","Preço","Total","Corretagem","Obs","Ações"].map((h) => (
                        <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[...operacoes]
                      .sort((a, b) => b.data.localeCompare(a.data) || b.timestamp - a.timestamp)
                      .map((op) => (
                        <tr key={op.id} className="border-b border-[var(--border)]/50 hover:bg-[var(--border)]/8 transition-colors group">
                          <td className="px-4 py-3 font-mono text-xs text-[var(--text-secondary)]">
                            {new Date(op.data + "T12:00:00").toLocaleDateString("pt-BR")}
                          </td>
                          <td className="px-4 py-3">
                            <TipoBadge tipo={op.tipo} />
                          </td>
                          <td className="px-4 py-3 font-bold font-mono text-[var(--text-primary)]">{op.ticker}</td>
                          <td className="px-4 py-3 font-mono text-[var(--text-secondary)]">
                            {op.quantidade.toLocaleString("pt-BR")}
                          </td>
                          <td className="px-4 py-3 font-mono text-[var(--text-secondary)]">{Ri(op.preco_unitario)}</td>
                          <td className="px-4 py-3 font-mono font-semibold text-[var(--text-primary)]">
                            {Ri(op.quantidade * op.preco_unitario)}
                          </td>
                          <td className="px-4 py-3 font-mono text-[var(--text-secondary)] text-xs">
                            {op.corretagem > 0 ? Ri(op.corretagem) : <span className="opacity-30">—</span>}
                          </td>
                          <td className="px-4 py-3 text-xs text-[var(--text-secondary)] max-w-[120px]">
                            <span className="truncate block">{op.observacao || <span className="opacity-30">—</span>}</span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={() => setEditOp(op)}
                                className="px-2 py-1 rounded-lg border border-[var(--border)] text-[11px] text-[var(--text-secondary)] hover:text-blue-400 hover:border-blue-400/40 transition-colors"
                                title="Editar"
                              >
                                ✏️
                              </button>
                              <button
                                onClick={() => { if (confirm(`Excluir esta operação de ${op.ticker}?`)) deleteOp(op.id); }}
                                className="px-2 py-1 rounded-lg border border-[var(--border)] text-[11px] text-[var(--text-secondary)] hover:text-red-400 hover:border-red-400/40 transition-colors"
                                title="Excluir"
                              >
                                🗑️
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── ABA SIMULAÇÕES ─────────────────────────────────────────────────── */}
      {tab === "simulacoes" && (
        <SimulacoesTab posicoes={posEnriq} />
      )}

      {/* Modal editar operação */}
      {editOp && (
        <EditarOperacaoModal op={editOp} onClose={() => setEditOp(null)} />
      )}
    </main>
  );
}

// ── Componentes auxiliares ────────────────────────────────────────────────────

function ResumoCard({ label, valor, sub, cor, destaque }: { label: string; valor: string; sub?: string; cor: string; destaque?: boolean }) {
  return (
    <div className={`rounded-2xl border p-4 transition-colors ${destaque ? "border-pink-500/30 bg-pink-500/5" : "border-[var(--border)] bg-[var(--bg-card)]"}`}>
      <p className="text-[10px] uppercase tracking-wider font-semibold text-[var(--text-secondary)] mb-1">{label}</p>
      <p className={`text-xl font-bold font-mono leading-tight ${cor}`}>{valor}</p>
      {sub && <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">{sub}</p>}
    </div>
  );
}

function TipoBadge({ tipo }: { tipo: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    compra:    { label: "Compra",    cls: "bg-emerald-500/15 text-emerald-500" },
    venda:     { label: "Venda",     cls: "bg-red-500/15 text-red-400" },
    dividendo: { label: "Dividendo", cls: "bg-blue-500/15 text-blue-400" },
    jcp:       { label: "JCP",       cls: "bg-violet-500/15 text-violet-400" },
    bonificacao: { label: "Bonif.",  cls: "bg-amber-500/15 text-amber-400" },
  };
  const cfg = map[tipo] ?? { label: tipo, cls: "bg-[var(--border)]/30 text-[var(--text-secondary)]" };
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${cfg.cls}`}>{cfg.label}</span>
  );
}

function EmptySection({ emoji, texto, sub }: { emoji: string; texto: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-[var(--border)] p-12 text-center">
      <div className="text-4xl mb-3">{emoji}</div>
      <p className="text-[var(--text-secondary)] text-sm">{texto}</p>
      {sub && <p className="text-[var(--text-secondary)] text-xs mt-1 opacity-70">{sub}</p>}
    </div>
  );
}

function GraficoPizza({ titulo, dados }: { titulo: string; dados: { name: string; value: number; cor: string }[] }) {
  const total = dados.reduce((s, d) => s + d.value, 0);
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
      <h3 className="text-sm font-semibold text-[var(--text-secondary)] mb-4 uppercase tracking-wider">{titulo}</h3>
      <ResponsiveContainer width="100%" height={200}>
        <PieChart>
          <Pie data={dados} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={85} innerRadius={45} paddingAngle={2}>
            {dados.map((d) => <Cell key={d.name} fill={d.cor} />)}
          </Pie>
          <Tooltip
            contentStyle={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "12px", fontSize: 12 }}
            formatter={(v: unknown, name: unknown) => { const n = Number(v); return [`${Ri(n)} (${((n / total) * 100).toFixed(1)}%)`, String(name)]; }}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="flex flex-wrap gap-x-3 gap-y-1.5 mt-2 justify-center">
        {dados.slice(0, 6).map((d) => (
          <span key={d.name} className="flex items-center gap-1 text-[11px] text-[var(--text-secondary)]">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: d.cor }} />
            <span className="font-mono">{d.name}</span>
            <span className="opacity-70">({((d.value / total) * 100).toFixed(1)}%)</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function CarteiraVazia() {
  return (
    <main className="max-w-2xl mx-auto px-4 py-20 text-center space-y-8">
      <div>
        <div className="text-6xl mb-4">💼</div>
        <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-2">Sua carteira está vazia</h1>
        <p className="text-[var(--text-secondary)] text-sm leading-relaxed max-w-md mx-auto">
          Adicione ativos à sua carteira virtual para acompanhar valorização, dividendos e composição da sua carteira em tempo real.
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-left">
        {[
          { emoji: "🔍", titulo: "1. Pesquise", desc: "Busque qualquer ação, FII ou ETF da B3 no RS Analisa ou na busca principal." },
          { emoji: "➕", titulo: "2. Adicione", desc: 'Clique em "Add Carteira", informe quantidade, preço médio e data da compra.' },
          { emoji: "📊", titulo: "3. Acompanhe", desc: "Visualize rentabilidade, composição, dividendos e muito mais nesta tela." },
        ].map((s) => (
          <div key={s.titulo} className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
            <div className="text-2xl mb-2">{s.emoji}</div>
            <p className="font-semibold text-[var(--text-primary)] text-sm mb-1">{s.titulo}</p>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">{s.desc}</p>
          </div>
        ))}
      </div>
      <div className="flex justify-center gap-3">
        <Link href="/rs-analisa" className="px-6 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-semibold text-sm transition-colors">
          Ir para RS Analisa
        </Link>
        <Link href="/" className="px-6 py-3 rounded-xl border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] font-semibold text-sm transition-colors">
          Buscar Ativo
        </Link>
      </div>
    </main>
  );
}

// ── Simulações ────────────────────────────────────────────────────────────────

function SimulacoesTab({ posicoes }: { posicoes: PosicaoEnriquecida[] }) {
  const { addOp } = useCarteira();
  const [ticker, setTicker] = useState(posicoes[0]?.ticker ?? "");
  const [qtdExtra, setQtdExtra] = useState("");
  const [precoSim, setPrecoSim] = useState("");
  const [resultado, setResultado] = useState<null | {
    novo_pm: number; nova_qtd: number; novo_custo: number;
    novo_valor: number; novo_lucro: number; novo_lucro_pct: number;
    nova_part: number;
  }>(null);
  const totalCarteira = posicoes.reduce((s, p) => s + (p.valor_atual ?? p.custo_total), 0);

  const pos = posicoes.find((p) => p.ticker === ticker);

  function simular() {
    if (!pos || !qtdExtra || !precoSim) return;
    const qtdN = parseFloat(qtdExtra);
    const prN = parseFloat(precoSim);
    const novo_custo = pos.custo_total + qtdN * prN;
    const nova_qtd = pos.quantidade_total + qtdN;
    const novo_pm = novo_custo / nova_qtd;
    const preco_atual = pos.preco_atual ?? prN;
    const novo_valor = nova_qtd * preco_atual;
    const novo_lucro = novo_valor - novo_custo;
    const novo_lucro_pct = novo_custo > 0 ? (novo_lucro / novo_custo) * 100 : 0;
    const nova_part = totalCarteira > 0 ? (novo_valor / (totalCarteira + qtdN * prN)) * 100 : 0;
    setResultado({ novo_pm, nova_qtd, novo_custo, novo_valor, novo_lucro, novo_lucro_pct, nova_part });
  }

  return (
    <div className="max-w-xl space-y-6">
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6 space-y-4">
        <h3 className="font-semibold text-[var(--text-primary)]">🔮 Simular: e se eu comprar mais?</h3>

        <div>
          <label className="text-xs font-medium text-[var(--text-secondary)] mb-1.5 block">Ativo</label>
          <select
            value={ticker}
            onChange={(e) => { setTicker(e.target.value); setResultado(null); }}
            className="w-full px-3 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)] text-sm focus:outline-none focus:border-emerald-500/60"
          >
            {posicoes.map((p) => (
              <option key={p.ticker} value={p.ticker}>{p.ticker} — PM atual: {Ri(p.preco_medio)}</option>
            ))}
            {posicoes.length === 0 && <option value="">Nenhum ativo na carteira</option>}
          </select>
        </div>

        {pos && (
          <div className="bg-[var(--border)]/15 rounded-xl p-3 text-xs space-y-1">
            <div className="flex justify-between"><span className="text-[var(--text-secondary)]">Posição atual</span><span className="font-mono">{pos.quantidade_total} ações</span></div>
            <div className="flex justify-between"><span className="text-[var(--text-secondary)]">Preço médio atual</span><span className="font-mono">{Ri(pos.preco_medio)}</span></div>
            <div className="flex justify-between"><span className="text-[var(--text-secondary)]">Custo total atual</span><span className="font-mono">{Ri(pos.custo_total)}</span></div>
            {pos.preco_atual && <div className="flex justify-between"><span className="text-[var(--text-secondary)]">Cotação atual</span><span className="font-mono">{Ri(pos.preco_atual)}</span></div>}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-[var(--text-secondary)] mb-1.5 block">Qtd. adicional</label>
            <input
              type="number" min="1" step="1" value={qtdExtra} onChange={(e) => { setQtdExtra(e.target.value); setResultado(null); }}
              placeholder="100"
              className="w-full px-3 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)] text-sm focus:outline-none focus:border-emerald-500/60"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-[var(--text-secondary)] mb-1.5 block">Preço de compra (R$)</label>
            <input
              type="number" min="0.01" step="any" value={precoSim} onChange={(e) => { setPrecoSim(e.target.value); setResultado(null); }}
              placeholder={pos?.preco_atual?.toFixed(2) ?? "25,00"}
              className="w-full px-3 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)] text-sm focus:outline-none focus:border-emerald-500/60"
            />
          </div>
        </div>

        <button
          onClick={simular}
          disabled={!pos || !qtdExtra || !precoSim}
          className="w-full py-2.5 rounded-xl bg-violet-500 hover:bg-violet-600 disabled:opacity-40 text-white text-sm font-semibold transition-colors"
        >
          Simular
        </button>
      </div>

      {resultado && pos && (
        <div className="rounded-2xl border border-violet-500/30 bg-violet-500/5 p-6 space-y-4">
          <h3 className="font-semibold text-violet-400">Resultado da Simulação</h3>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "Novo Preço Médio", val: Ri(resultado.novo_pm), change: resultado.novo_pm < pos.preco_medio ? "▼ reduziu" : "▲ aumentou", changePos: resultado.novo_pm < pos.preco_medio },
              { label: "Nova Quantidade",  val: resultado.nova_qtd.toLocaleString("pt-BR"), change: `+${parseFloat(qtdExtra).toLocaleString("pt-BR")} ações`, changePos: true },
              { label: "Novo Custo Total", val: Ri(resultado.novo_custo), change: `+${Ri(parseFloat(qtdExtra) * parseFloat(precoSim))}`, changePos: false },
              { label: "Novo Lucro/Prej.", val: Ri(resultado.novo_lucro), change: Pct(resultado.novo_lucro_pct), changePos: resultado.novo_lucro >= 0 },
              { label: "Nova Participação", val: `${resultado.nova_part.toFixed(1)}%`, change: `era ${pos.participacao_pct?.toFixed(1) ?? "—"}%`, changePos: false },
              { label: "Valor de Mercado", val: Ri(resultado.novo_valor), change: pos.preco_atual ? `a R$ ${pos.preco_atual.toFixed(2)}/ação` : "—", changePos: resultado.novo_lucro >= 0 },
            ].map((m) => (
              <div key={m.label} className="rounded-xl border border-[var(--border)] p-3">
                <p className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)] mb-1">{m.label}</p>
                <p className="font-bold text-[var(--text-primary)] font-mono">{m.val}</p>
                <p className={`text-[11px] mt-0.5 ${m.changePos ? "text-emerald-500" : "text-[var(--text-secondary)]"}`}>{m.change}</p>
              </div>
            ))}
          </div>

          {resultado.nova_part > 30 && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/8 p-3 text-xs text-amber-400">
              ⚠️ Esta compra elevaria a concentração de {pos.ticker} para {resultado.nova_part.toFixed(1)}% da carteira — acima de 30% pode representar risco de concentração.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Modal de edição de operação ───────────────────────────────────────────────

function EditarOperacaoModal({ op, onClose }: { op: OperacaoCarteira; onClose: () => void }) {
  const { editOp } = useCarteira();
  const [quantidade, setQuantidade] = useState(String(op.quantidade));
  const [preco, setPreco] = useState(String(op.preco_unitario));
  const [data, setData] = useState(op.data);
  const [corretagem, setCorretagem] = useState(String(op.corretagem));
  const [obs, setObs] = useState(op.observacao);

  function salvar(e: React.FormEvent) {
    e.preventDefault();
    editOp(op.id, {
      quantidade: parseFloat(quantidade) || op.quantidade,
      preco_unitario: parseFloat(preco) || op.preco_unitario,
      data,
      corretagem: parseFloat(corretagem) || 0,
      observacao: obs,
    });
    onClose();
  }

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
          <div>
            <h2 className="font-bold text-[var(--text-primary)]">Editar Operação</h2>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
              <span className="font-mono text-emerald-500">{op.ticker}</span> · <TipoBadge tipo={op.tipo} />
            </p>
          </div>
          <button onClick={onClose} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] p-1.5 rounded-lg hover:bg-[var(--border)]/30 transition-colors">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
          </button>
        </div>
        <form onSubmit={salvar} className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-[var(--text-secondary)] mb-1.5 block">Quantidade</label>
              <input type="number" min="0.001" step="any" value={quantidade} onChange={(e) => setQuantidade(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)] text-sm focus:outline-none focus:border-emerald-500/60" />
            </div>
            <div>
              <label className="text-xs font-medium text-[var(--text-secondary)] mb-1.5 block">Preço (R$)</label>
              <input type="number" min="0.001" step="any" value={preco} onChange={(e) => setPreco(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)] text-sm focus:outline-none focus:border-emerald-500/60" />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-[var(--text-secondary)] mb-1.5 block">Data</label>
            <input type="date" value={data} onChange={(e) => setData(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)] text-sm focus:outline-none focus:border-emerald-500/60" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-[var(--text-secondary)] mb-1.5 block">Corretagem (R$)</label>
              <input type="number" min="0" step="any" value={corretagem} onChange={(e) => setCorretagem(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)] text-sm focus:outline-none focus:border-emerald-500/60" />
            </div>
            <div>
              <label className="text-xs font-medium text-[var(--text-secondary)] mb-1.5 block">Observação</label>
              <input type="text" value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Opcional"
                className="w-full px-3 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)] text-sm focus:outline-none focus:border-emerald-500/60" />
            </div>
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl border border-[var(--border)] text-[var(--text-secondary)] text-sm hover:bg-[var(--border)]/30 transition-colors">Cancelar</button>
            <button type="submit" className="flex-1 px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold transition-colors">Salvar</button>
          </div>
        </form>
      </div>
    </div>
  );
}
