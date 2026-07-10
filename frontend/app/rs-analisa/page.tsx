"use client";

import { useState, useCallback, useEffect, type FormEvent, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import type { RSAnalisaData } from "@/types";
import { getRSAnalisa } from "@/lib/api";
import { ScorePanel } from "@/components/rs/ScorePanel";
import { CotacaoRS } from "@/components/rs/CotacaoRS";
import { MiniChartRS } from "@/components/rs/MiniChartRS";
import { FundamentosRS } from "@/components/rs/FundamentosRS";
import { ValuacaoRS } from "@/components/rs/ValuacaoRS";
import { IAAnalise } from "@/components/rs/IAAnalise";
import { AlertasRS } from "@/components/rs/AlertasRS";
import { CarteiraBotoes } from "@/components/carteira/CarteiraBotoes";

// ── Aba Preço Justo — Ações ────────────────────────────────────────────────────
function PrecoJustoAcao({ dados }: { dados: RSAnalisaData }) {
  const { cotacao, valuation, score, analise, fundamentos } = dados;
  const R = (v: number | null) =>
    v === null ? "—" : `R$ ${new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v)}`;
  const Pct = (v: number | null) =>
    v === null ? "—" : `${(v * 100) >= 0 ? "+" : ""}${(v * 100).toFixed(1)}%`;

  // Veredito de compra baseado em score + upside
  const upside = valuation?.upside_pct ?? null;
  const scoreTotal = score.score_total;
  const veredicto = (() => {
    if (upside === null) return { texto: "AGUARDAR", cor: "#f59e0b", descricao: "Dados de valuation insuficientes para recomendação precisa." };
    if (scoreTotal >= 600 && upside >= 0.20) return { texto: "COMPRAR", cor: "#10b981", descricao: "Fundamentos sólidos + ativo negociado com desconto significativo ao preço justo." };
    if (scoreTotal >= 600 && upside >= 0) return { texto: "MONITORAR", cor: "#3b82f6", descricao: "Boa qualidade de fundamentos, mas o preço já reflete boa parte dos positivos." };
    if (scoreTotal >= 450 && upside >= 0.25) return { texto: "COMPRAR", cor: "#10b981", descricao: "Desconto expressivo ao preço justo pode compensar a qualidade moderada dos fundamentos." };
    if (upside >= 0.15) return { texto: "AGUARDAR", cor: "#f59e0b", descricao: "Há upside, mas a qualidade dos fundamentos demanda acompanhamento mais próximo." };
    if (upside < -0.20) return { texto: "EVITAR", cor: "#ef4444", descricao: "Ativo acima do preço justo estimado pelos modelos." };
    return { texto: "AGUARDAR", cor: "#f59e0b", descricao: "Relação risco/retorno neutra. Aguarde melhor ponto de entrada." };
  })();

  // Perspectiva 5 anos
  const perspectiva5a = (() => {
    const cagr = fundamentos?.cagr_receita;
    const roe = fundamentos?.historico?.slice(-1)[0]?.roe;
    if (!cagr && !roe) return analise.perspectivas;
    const cagrStr = cagr ? `${((cagr * 100) >= 0 ? "+" : "")}${(cagr * 100).toFixed(1)}%/ano` : null;
    const roe5a = roe ? `ROE de ${(roe * 100).toFixed(1)}%` : null;
    return [
      `Com ${[cagrStr && `CAGR de receita de ${cagrStr}`, roe5a].filter(Boolean).join(" e ")}, projetamos que ${dados.empresa} pode ${roe && roe >= 0.15 ? "continuar criando valor acima do custo de capital" : "apresentar crescimento moderado"} nos próximos 5 anos.`,
      upside && upside >= 0.15
        ? `Se o mercado reconhecer o desconto atual de ${Pct(upside)}, a valorização pode ser expressiva em 2–3 anos.`
        : upside && upside < 0
        ? `O preço atual incorpora expectativas otimistas — revisão das estimativas de crescimento pode pressionar a cotação.`
        : `Nos próximos 5 anos, o desempenho dependerá da capacidade de reinvestimento e expansão de margens.`,
      `Monitorar: crescimento de receita, evolução das margens e nível de endividamento nos relatórios trimestrais.`
    ].join(" ");
  })();

  if (!valuation) {
    return (
      <div className="space-y-4">
        {/* Veredito placeholder */}
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-6 text-center">
          <p className="text-amber-500 font-bold text-lg mb-1">AGUARDAR</p>
          <p className="text-[var(--text-secondary)] text-sm">Dados de valuation não disponíveis — sem demonstrações CVM para calcular o preço justo.</p>
        </div>
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
          <p className="text-sm font-semibold text-[var(--text-secondary)] mb-3">Perspectiva 5 Anos</p>
          <p className="text-sm text-[var(--text-primary)] leading-relaxed">{analise.perspectivas}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Veredito principal */}
      <div
        className="rounded-2xl border p-6"
        style={{ borderColor: veredicto.cor + "44", background: veredicto.cor + "0c" }}
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-widest font-semibold text-[var(--text-secondary)] mb-1">
              Recomendação RS Invest
            </p>
            <p className="text-3xl font-black" style={{ color: veredicto.cor }}>
              {veredicto.texto}
            </p>
            <p className="text-sm text-[var(--text-secondary)] mt-1 max-w-md">
              {veredicto.descricao}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wide">Score RS Invest</p>
            <p className="text-2xl font-bold" style={{ color: veredicto.cor }}>
              {scoreTotal}/1000
            </p>
            <p className="text-xs text-[var(--text-secondary)]">{score.nota_geral}</p>
          </div>
        </div>
      </div>

      {/* Preços comparativos */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 text-center">
          <p className="text-[10px] uppercase tracking-wide text-[var(--text-secondary)] mb-1">Preço Atual</p>
          <p className="text-xl font-bold font-mono">{R(cotacao.preco_atual)}</p>
          <p className="text-[10px] text-[var(--text-secondary)] mt-0.5">mercado hoje</p>
        </div>
        <div className="rounded-xl border p-4 text-center" style={{ borderColor: veredicto.cor + "44", background: veredicto.cor + "0a" }}>
          <p className="text-[10px] uppercase tracking-wide text-[var(--text-secondary)] mb-1">Preço Justo</p>
          <p className="text-xl font-bold font-mono" style={{ color: veredicto.cor }}>{R(valuation.preco_justo_base)}</p>
          <p className="text-[10px] text-[var(--text-secondary)] mt-0.5">média dos modelos</p>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 text-center">
          <p className="text-[10px] uppercase tracking-wide text-[var(--text-secondary)] mb-1">Upside / Downside</p>
          <p className="text-xl font-bold font-mono" style={{ color: veredicto.cor }}>{Pct(upside)}</p>
          <p className="text-[10px] text-[var(--text-secondary)] mt-0.5">potencial vs atual</p>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 text-center">
          <p className="text-[10px] uppercase tracking-wide text-[var(--text-secondary)] mb-1">Margem de Seg.</p>
          <p className="text-xl font-bold font-mono">{Pct(valuation.margem_seguranca)}</p>
          <p className="text-[10px] text-[var(--text-secondary)] mt-0.5">desconto ao justo</p>
        </div>
      </div>

      {/* Por que comprar / evitar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {score.pontos_fortes.length > 0 && (
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
            <p className="text-[11px] font-bold text-emerald-500 uppercase tracking-wide mb-2">
              Por que é atrativo
            </p>
            <ul className="space-y-1.5">
              {score.pontos_fortes.map((p, i) => (
                <li key={i} className="flex gap-2 text-[12px] text-[var(--text-primary)]">
                  <span className="text-emerald-500 shrink-0">+</span>{p}
                </li>
              ))}
              {upside !== null && upside >= 0.10 && (
                <li className="flex gap-2 text-[12px] text-[var(--text-primary)]">
                  <span className="text-emerald-500 shrink-0">+</span>
                  Desconto de {Pct(upside)} ao preço justo estimado
                </li>
              )}
            </ul>
          </div>
        )}
        {score.pontos_fracos.length > 0 && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4">
            <p className="text-[11px] font-bold text-red-400 uppercase tracking-wide mb-2">
              Pontos de risco
            </p>
            <ul className="space-y-1.5">
              {score.pontos_fracos.map((p, i) => (
                <li key={i} className="flex gap-2 text-[12px] text-[var(--text-primary)]">
                  <span className="text-red-400 shrink-0">!</span>{p}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Perspectiva 5 anos */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-5 h-5 rounded-full bg-blue-500/20 flex items-center justify-center shrink-0">
            <span className="text-blue-400 text-[10px] font-bold">5a</span>
          </div>
          <h3 className="text-sm font-semibold text-[var(--text-secondary)]">
            Perspectiva 5 Anos
          </h3>
        </div>
        <p className="text-[13px] text-[var(--text-primary)] leading-relaxed">{perspectiva5a}</p>

        {/* Cenários DCF como proxy de projeção */}
        {valuation.cenarios.length > 0 && (
          <div className="mt-4 pt-4 border-t border-[var(--border)]">
            <p className="text-[11px] text-[var(--text-secondary)] font-semibold uppercase tracking-wide mb-2">
              Cenários de Preço Justo (Modelos DCF)
            </p>
            <div className="grid grid-cols-3 gap-2">
              {valuation.cenarios.map((c) => {
                const cor = c.nome === "Otimista" ? "#10b981" : c.nome === "Pessimista" ? "#ef4444" : "#f59e0b";
                return (
                  <div key={c.nome} className="rounded-lg border p-3 text-center"
                    style={{ borderColor: cor + "44", background: cor + "0a" }}>
                    <p className="text-[10px] font-semibold uppercase" style={{ color: cor }}>{c.nome}</p>
                    <p className="text-base font-bold font-mono mt-0.5">{R(c.preco_justo)}</p>
                    <p className="text-[11px] font-semibold" style={{ color: cor }}>{Pct(c.upside_pct)}</p>
                    <p className="text-[10px] text-[var(--text-secondary)] mt-0.5">
                      g={`${(c.taxa_crescimento * 100).toFixed(0)}%`} · r={`${(c.taxa_desconto * 100).toFixed(0)}%`}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <p className="text-[10px] text-[var(--text-secondary)] opacity-50 text-center">
        Esta análise é baseada em modelos quantitativos e não constitui recomendação formal de investimento.
        Consulte um assessor de investimentos credenciado antes de tomar decisões.
      </p>
    </div>
  );
}

// ── Aba Análise de Cota — FIIs ─────────────────────────────────────────────────
function PrecoCotaFII({ dados }: { dados: RSAnalisaData }) {
  const { cotacao, score, analise, indices } = dados;
  const R = (v: number | null) =>
    v === null ? "—" : `R$ ${new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v)}`;

  const p    = cotacao.preco_atual;
  const pmax = cotacao.cinquenta_dois_semanas_alta ?? p;
  const pmin = cotacao.cinquenta_dois_semanas_baixa ?? p;
  const amplitude = pmax - pmin;
  const posicao = amplitude > 0 ? (p - pmin) / amplitude : 0.5;

  const emIfix = indices.includes("IFIX");

  // Recomendação para FII
  const recomendacao = (() => {
    if (score.score_total >= 650 && posicao <= 0.40)
      return { texto: "COMPRAR COTA", cor: "#10b981", motivo: "FII de qualidade (IFIX) com cota em zona de entrada — abaixo de 40% do range 52S." };
    if (score.score_total >= 600 && posicao <= 0.60)
      return { texto: "MONITORAR", cor: "#3b82f6", motivo: "Bom fundo em preço razoável. Aguarde momento mais favorável ou ingresse gradualmente." };
    if (posicao >= 0.80)
      return { texto: "AGUARDAR", cor: "#f59e0b", motivo: "Cota próxima da máxima de 52 semanas — aguarde correção para melhor relação risco/retorno." };
    if (score.score_total < 400)
      return { texto: "EVITAR", cor: "#ef4444", motivo: "Indicadores de mercado fracos. Verifique os relatórios gerenciais antes de investir." };
    return { texto: "MONITORAR", cor: "#f59e0b", motivo: "Avalie o DY histórico, taxa de vacância e gestora antes de aportar." };
  })();

  return (
    <div className="space-y-4">
      {/* Recomendação */}
      <div
        className="rounded-2xl border p-6"
        style={{ borderColor: recomendacao.cor + "44", background: recomendacao.cor + "0c" }}
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-widest font-semibold text-[var(--text-secondary)] mb-1">
              Análise de Cota RS Invest
            </p>
            <p className="text-3xl font-black" style={{ color: recomendacao.cor }}>
              {recomendacao.texto}
            </p>
            <p className="text-sm text-[var(--text-secondary)] mt-1 max-w-md">
              {recomendacao.motivo}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wide">Score RS Invest</p>
            <p className="text-2xl font-bold" style={{ color: recomendacao.cor }}>{score.score_total}/1000</p>
            <p className="text-xs text-[var(--text-secondary)]">{score.nota_geral}</p>
          </div>
        </div>
      </div>

      {/* Métricas de cota */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 text-center">
          <p className="text-[10px] uppercase tracking-wide text-[var(--text-secondary)] mb-1">Cota Atual</p>
          <p className="text-xl font-bold font-mono">{R(p)}</p>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 text-center">
          <p className="text-[10px] uppercase tracking-wide text-[var(--text-secondary)] mb-1">Mínima 52S</p>
          <p className="text-xl font-bold font-mono text-emerald-500">{R(pmin)}</p>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 text-center">
          <p className="text-[10px] uppercase tracking-wide text-[var(--text-secondary)] mb-1">Máxima 52S</p>
          <p className="text-xl font-bold font-mono text-red-400">{R(pmax)}</p>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 text-center">
          <p className="text-[10px] uppercase tracking-wide text-[var(--text-secondary)] mb-1">Posição no Range</p>
          <p className="text-xl font-bold font-mono">{(posicao * 100).toFixed(0)}%</p>
          <p className="text-[10px] text-[var(--text-secondary)] mt-0.5">
            {posicao <= 0.33 ? "zona de entrada" : posicao >= 0.67 ? "zona de topo" : "zona neutra"}
          </p>
        </div>
      </div>

      {/* Barra visual de posição no range */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
        <p className="text-[11px] font-semibold text-[var(--text-secondary)] uppercase tracking-wide mb-3">
          Posição da Cota no Range 52 Semanas
        </p>
        <div className="relative h-4 rounded-full bg-[var(--border)] overflow-hidden">
          <div
            className="absolute top-0 left-0 h-full rounded-full"
            style={{
              width: `${posicao * 100}%`,
              background: posicao <= 0.33 ? "#10b981" : posicao >= 0.67 ? "#ef4444" : "#f59e0b",
            }}
          />
        </div>
        <div className="flex justify-between mt-1 text-[10px] text-[var(--text-secondary)]">
          <span>{R(pmin)} (mín)</span>
          <span className="font-semibold">{R(p)}</span>
          <span>{R(pmax)} (máx)</span>
        </div>
      </div>

      {/* Sobre FIIs e DY */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
        <p className="text-sm font-semibold text-[var(--text-secondary)] mb-3">
          Como Avaliar a Cota — Métricas Essenciais
        </p>
        <div className="space-y-3 text-[12px] text-[var(--text-primary)]">
          <div className="flex gap-2">
            <span className="font-bold text-amber-500 shrink-0 w-6">DY</span>
            <p>Dividend Yield = (Rendimento 12m / Cota). FIIs acima de 8%–10% a.a. são geralmente atrativos frente ao CDI. Consulte o histórico no site da gestora ou em <span className="text-blue-400">fundosnet.cvm.gov.br</span>.</p>
          </div>
          <div className="flex gap-2">
            <span className="font-bold text-amber-500 shrink-0 w-6">P/VP</span>
            <p>Preço / Valor Patrimonial por cota. P/VP abaixo de 1,0 indica desconto sobre o patrimônio — pode ser oportunidade. Acima de 1,3 tende a ser caro.</p>
          </div>
          <div className="flex gap-2">
            <span className="font-bold text-amber-500 shrink-0 w-6">VAC</span>
            <p>Taxa de vacância: indica o percentual de imóveis desocupados. Fundos com vacância acima de 15% merecem atenção especial.</p>
          </div>
          {emIfix && (
            <div className="flex gap-2">
              <span className="font-bold text-emerald-500 shrink-0 w-6">✓</span>
              <p>{dados.ticker} compõe o IFIX, o que indica liquidez mínima garantida e relevância no mercado.</p>
            </div>
          )}
        </div>
      </div>

      {/* Perspectiva */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-5 h-5 rounded-full bg-blue-500/20 flex items-center justify-center">
            <span className="text-blue-400 text-[10px] font-bold">5a</span>
          </div>
          <h3 className="text-sm font-semibold text-[var(--text-secondary)]">Perspectiva 5 Anos</h3>
        </div>
        <p className="text-[13px] text-[var(--text-primary)] leading-relaxed">{analise.perspectivas}</p>
      </div>

      <p className="text-[10px] text-[var(--text-secondary)] opacity-50 text-center">
        Análise baseada em dados de mercado (preço, 52S, índices). DY e P/VP exatos devem ser consultados nos relatórios gerenciais mensais do fundo.
      </p>
    </div>
  );
}

const SUGESTOES_ACOES = [
  "PETR4", "VALE3", "ITUB4", "WEGE3", "BBAS3",
  "RDOR3", "PRIO3", "LREN3", "SUZB3", "MGLU3",
];
const SUGESTOES_FIIS = [
  "KNRI11", "HGLG11", "MXRF11", "XPLG11",
  "XPML11", "KNCR11", "VISC11", "BTLG11",
];

type Tab = "geral" | "fundamentos" | "valuation" | "preco" | "analise" | "alertas";

const TABS_ACAO: { key: Tab; label: string }[] = [
  { key: "geral",       label: "Visão Geral" },
  { key: "fundamentos", label: "Fundamentos" },
  { key: "valuation",   label: "Valuation" },
  { key: "preco",       label: "Preço Justo" },
  { key: "analise",     label: "IA Análise" },
  { key: "alertas",     label: "Alertas" },
];

const TABS_FII: { key: Tab; label: string }[] = [
  { key: "geral",   label: "Visão Geral" },
  { key: "preco",   label: "Análise de Cota" },
  { key: "analise", label: "IA Análise" },
  { key: "alertas", label: "Alertas" },
];

function RSAnalisaContent() {
  const searchParams = useSearchParams();
  const [ticker, setTicker] = useState("");
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [dados, setDados] = useState<RSAnalisaData | null>(null);
  const [tab, setTab] = useState<Tab>("geral");

  const buscar = useCallback(async (t: string) => {
    const sym = t.trim().toUpperCase();
    if (!sym) return;
    setLoading(true);
    setErro(null);
    setDados(null);
    try {
      const result = await getRSAnalisa(sym);
      setDados(result);
      setTab("geral");
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : "Erro ao buscar dados.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-carrega quando vem com ?t=TICKER na URL (ex: vindo do Ranking)
  useEffect(() => {
    const t = searchParams.get("t");
    if (t) {
      setTicker(t.toUpperCase());
      buscar(t);
    }
  }, [searchParams, buscar]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    buscar(ticker);
  };

  return (
    <main className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      {/* Hero */}
      <div className="text-center space-y-2 pb-2">
        <div className="inline-flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-4 py-1.5 mb-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-xs font-semibold text-emerald-500 tracking-wide uppercase">
            RS Invest Analytics
          </span>
        </div>
        <h1 className="text-3xl font-bold tracking-tight">
          RS Analisa
        </h1>
        <p className="text-[var(--text-secondary)] text-sm max-w-md mx-auto">
          Dossier completo de análise fundamentalista, valuation e inteligência financeira
          para qualquer ativo da B3.
        </p>
      </div>

      {/* Busca */}
      <div className="max-w-lg mx-auto">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            value={ticker}
            onChange={(e) => setTicker(e.target.value.toUpperCase())}
            placeholder="Ex: PETR4, VALE3, WEGE3"
            className="flex-1 rounded-xl border border-[var(--border)] bg-[var(--bg-card)]
                       px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40
                       placeholder:text-[var(--text-secondary)] font-mono uppercase"
          />
          <button
            type="submit"
            disabled={loading || !ticker.trim()}
            className="px-6 py-2.5 rounded-xl bg-emerald-500 text-white text-sm font-semibold
                       hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed
                       transition-colors shrink-0"
          >
            {loading ? "Analisando…" : "Analisar"}
          </button>
        </form>

        {/* Sugestões */}
        <div className="mt-3 space-y-1.5">
          <div className="flex flex-wrap gap-1.5 justify-center">
            <span className="text-[10px] text-[var(--text-secondary)] self-center mr-1">Ações:</span>
            {SUGESTOES_ACOES.map((s) => (
              <button
                key={s}
                onClick={() => { setTicker(s); buscar(s); }}
                className="text-[11px] px-2.5 py-1 rounded-lg border border-[var(--border)]
                           text-[var(--text-secondary)] hover:border-emerald-500/40
                           hover:text-emerald-500 transition-colors font-mono"
              >
                {s}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5 justify-center">
            <span className="text-[10px] text-[var(--text-secondary)] self-center mr-1">FIIs:</span>
            {SUGESTOES_FIIS.map((s) => (
              <button
                key={s}
                onClick={() => { setTicker(s); buscar(s); }}
                className="text-[11px] px-2.5 py-1 rounded-lg border border-[var(--border)]
                           text-[var(--text-secondary)] hover:border-amber-500/40
                           hover:text-amber-500 transition-colors font-mono"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="text-center py-16 space-y-3">
          <div className="w-10 h-10 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-[var(--text-secondary)]">
            Coletando dados de {ticker}…
          </p>
          <p className="text-[11px] text-[var(--text-secondary)] opacity-60">
            CVM · B3 · brapi.dev · Valuation Engine · RS Score
          </p>
        </div>
      )}

      {/* Erro */}
      {erro && !loading && (
        <div className="max-w-md mx-auto rounded-2xl border border-red-500/30 bg-red-500/5 p-6 text-center">
          <p className="text-red-400 font-semibold text-sm mb-1">Não foi possível analisar</p>
          <p className="text-[var(--text-secondary)] text-xs">{erro}</p>
        </div>
      )}

      {/* Resultado */}
      {dados && !loading && (
        <div className="space-y-4">
          {/* Cabeçalho do ativo */}
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-xl font-bold font-mono ${dados.is_fii ? "text-amber-500" : "text-emerald-500"}`}>
                    {dados.ticker}
                  </span>
                  {dados.is_fii && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-500 border border-amber-500/30">
                      FII
                    </span>
                  )}
                  {dados.fii_tipo && (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
                      {dados.fii_tipo}
                    </span>
                  )}
                  {!dados.is_fii && dados.segmento_b3 && (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                      {dados.segmento_b3}
                    </span>
                  )}
                  {!dados.is_fii && dados.governanca && dados.governanca !== dados.segmento_b3 && (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
                      {dados.governanca}
                    </span>
                  )}
                </div>
                <p className="text-[var(--text-secondary)] text-sm mt-0.5">{dados.empresa}</p>
                {(dados.setor || dados.subsetor) && (
                  <p className="text-[11px] text-[var(--text-secondary)] opacity-70 mt-0.5">
                    {[dados.setor, dados.subsetor].filter(Boolean).join(" · ")}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-2 text-[11px] text-[var(--text-secondary)]">
                {dados.cnpj && (
                  <span>CNPJ: <span className="font-mono">{dados.cnpj}</span></span>
                )}
                {dados.website && (
                  <a
                    href={dados.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:underline"
                  >
                    Site oficial
                  </a>
                )}
                {dados.data_listagem && (
                  <span>Listagem: {new Date(dados.data_listagem).toLocaleDateString("pt-BR")}</span>
                )}
              </div>
            </div>
            {/* Ações rápidas */}
            <div className="mt-3 pt-3 border-t border-[var(--border)]/50 flex items-center gap-2">
              <CarteiraBotoes ticker={dados.ticker} nome={dados.empresa} />
            </div>
          </div>

          {/* Tabs */}
          <div className="border-b border-[var(--border)]">
            <div className="flex gap-0.5 overflow-x-auto">
              {(dados.is_fii ? TABS_FII : TABS_ACAO).map((t) => {
                const accentColor = dados.is_fii ? "border-amber-500 text-amber-500" : "border-emerald-500 text-emerald-500";
                const badgeCount =
                  t.key === "alertas"
                    ? dados.alertas.filter((a) => a.tipo === "critico" || a.tipo === "atencao").length
                    : 0;
                return (
                  <button
                    key={t.key}
                    onClick={() => setTab(t.key)}
                    className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 -mb-px
                                transition-colors flex items-center gap-1.5 ${
                      tab === t.key
                        ? accentColor
                        : "border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                    }`}
                  >
                    {t.label}
                    {t.key === "preco" && !dados.is_fii && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-400">
                        novo
                      </span>
                    )}
                    {badgeCount > 0 && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-400">
                        {badgeCount}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── VISÃO GERAL ─────────────────────────────────────────────────── */}
          {tab === "geral" && (
            <div className="space-y-4">
              {/* Score + Cotação lado a lado */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <ScorePanel score={dados.score} />
                <div className="space-y-4">
                  <CotacaoRS
                    cotacao={dados.cotacao}
                    varMes={dados.var_mes}
                    varAno={dados.var_ano}
                    indices={dados.indices}
                  />
                </div>
              </div>

              {/* Mini gráfico */}
              {dados.historico_mensal.length > 0 && (
                <MiniChartRS historico={dados.historico_mensal} ticker={dados.ticker} />
              )}

              {/* Alertas críticos e de atenção resumidos */}
              {dados.alertas.filter((a) => a.tipo === "critico" || a.tipo === "atencao" || a.tipo === "positivo").length > 0 && (
                <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
                  <h3 className="text-sm font-semibold text-[var(--text-secondary)] mb-3">
                    Destaques
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {dados.alertas
                      .filter((a) => a.tipo !== "info")
                      .slice(0, 6)
                      .map((alerta, i) => {
                        const cor =
                          alerta.tipo === "critico" ? "#ef4444"
                          : alerta.tipo === "atencao" ? "#f59e0b"
                          : "#10b981";
                        return (
                          <div
                            key={i}
                            className="flex items-start gap-2 text-[12px] rounded-lg p-2.5"
                            style={{ background: cor + "10", border: `1px solid ${cor}30` }}
                          >
                            <span style={{ color: cor }} className="shrink-0 font-bold mt-0.5">
                              {alerta.tipo === "critico" ? "!" : alerta.tipo === "atencao" ? "△" : "+"}
                            </span>
                            <div>
                              <p className="font-semibold" style={{ color: cor }}>{alerta.titulo}</p>
                              <p className="text-[var(--text-secondary)] text-[11px] mt-0.5">{alerta.descricao}</p>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── FUNDAMENTOS (só ações) ───────────────────────────────────────── */}
          {tab === "fundamentos" && !dados.is_fii && (
            dados.fundamentos
              ? <FundamentosRS fundamentos={dados.fundamentos} />
              : (
                <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-10 text-center">
                  <p className="text-[var(--text-secondary)] text-sm">
                    Dados fundamentalistas não disponíveis para {dados.ticker} no CVM DFP.
                  </p>
                  <p className="text-[var(--text-secondary)] text-xs mt-1 opacity-60">
                    Pode ser um BDR ou empresa sem demonstrações padronizadas disponíveis.
                  </p>
                </div>
              )
          )}

          {/* ── VALUATION (só ações) ─────────────────────────────────────────── */}
          {tab === "valuation" && !dados.is_fii && (
            dados.valuation
              ? <ValuacaoRS valuation={dados.valuation} />
              : (
                <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-10 text-center">
                  <p className="text-[var(--text-secondary)] text-sm">
                    Dados insuficientes para calcular o valuation de {dados.ticker}.
                  </p>
                  <p className="text-[var(--text-secondary)] text-xs mt-1 opacity-60">
                    São necessários dados históricos do CVM para aplicar os modelos de valuation.
                  </p>
                </div>
              )
          )}

          {/* ── PREÇO JUSTO / ANÁLISE DE COTA ───────────────────────────────── */}
          {tab === "preco" && (
            dados.is_fii
              ? <PrecoCotaFII dados={dados} />
              : <PrecoJustoAcao dados={dados} />
          )}

          {/* ── ANÁLISE IA ──────────────────────────────────────────────────── */}
          {tab === "analise" && (
            <IAAnalise analise={dados.analise} empresa={dados.empresa} dadosAtivo={dados} />
          )}

          {/* ── ALERTAS ──────────────────────────────────────────────────────── */}
          {tab === "alertas" && (
            <AlertasRS alertas={dados.alertas} />
          )}

          {/* Footer */}
          <p className="text-[10px] text-[var(--text-secondary)] opacity-50 text-center pb-4">
            Dados: CVM DFP · B3 · brapi.dev · RS Invest Score v1.0 ·{" "}
            {new Date(dados.timestamp).toLocaleString("pt-BR")}
          </p>
        </div>
      )}

      {/* Estado inicial: sem dados */}
      {!dados && !loading && !erro && (
        <div className="text-center py-16 space-y-2">
          <div className="text-4xl opacity-20 mb-4">RS</div>
          <p className="text-[var(--text-secondary)] text-sm">
            Digite um ticker acima para começar a análise
          </p>
          <p className="text-[11px] text-[var(--text-secondary)] opacity-60">
            Exemplos: PETR4, VALE3, WEGE3, BBAS3, ITUB4
          </p>
        </div>
      )}
    </main>
  );
}

export default function RSAnalisaPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-[var(--text-secondary)]">Carregando...</div>}>
      <RSAnalisaContent />
    </Suspense>
  );
}
