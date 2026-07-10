"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { getRanking, type CategoriaRanking, type EmpresaRanking, type RankingData } from "@/lib/api";

// ── Constantes ────────────────────────────────────────────────────────────────

const GRUPOS: Record<string, string> = {
  geral:        "Gerais",
  fundamentais: "Fundamentais",
  indicadores:  "Indicadores",
  crescimento:  "Crescimento",
  potencial:    "Potencial",
  seguranca:    "Segurança",
  tamanho:      "Por Tamanho",
  setor:        "Por Setor",
};

const MEDALHA_LABEL: Record<string, string> = {
  ouro:   "🥇",
  prata:  "🥈",
  bronze: "🥉",
};

const CRITERIOS: Record<string, string> = {
  // Gerais
  geral:         "Qualidade 25% · Valuation 25% · Crescimento 20% · Dividendos 15% · Saúde 15%",
  qualidade:     "ROE · Margem Líquida · Margem EBITDA",
  buy_hold:      "Qualidade 40% · Saúde Financeira 35% · Dividendos 25%",
  seguranca:     "DL/EBITDA · Liquidez Corrente · FCO consistente · Governança B3",
  value:         "Valuation 50% · Qualidade 30% · Saúde Financeira 20%",
  longo_prazo:      "Consistência histórica 35% · Crescimento 30% · Rentabilidade 20% · Dividendos 15% — premia empresas com lucro e FCO positivos nos últimos 5 anos",
  // Potencial
  potencial_puro:   "Upside DCF 70% · Proximidade da mínima de 52 semanas 30% — mostra as mais descontadas independente de fundamentos",
  potencial_qual:   "Upside 50% · Qualidade dos fundamentos 30% · Proximidade da mínima 20% — desconto aliado a bons fundamentos",
  potencial_seguro: "Upside 45% · Saúde financeira 35% · Proximidade da mínima 20% — desconto em empresas sólidas e com baixo risco",
  upside_positivo:  "Apenas empresas com upside DCF positivo (preço atual < preço justo), ordenadas do maior para o menor desconto — máximo 10 empresas",
  // Fundamentais
  dividendos:    "DY estimado · FCL positivo · Crescimento do lucro · Margem líquida",
  crescimento:   "CAGR Receita · CAGR Lucro · CAGR EBITDA (5 anos)",
  rentabilidade: "ROE · Margem Líquida · Margem EBITDA",
  valuation:     "Upside DCF/Graham · P/L · Posição no range de 52 semanas",
  // Indicadores
  roe:           "Média do ROE dos últimos 3 anos",
  margem_liq:    "Média da Margem Líquida dos últimos 3 anos",
  margem_ebt:    "Média da Margem EBITDA dos últimos 3 anos",
  endividamento: "DL/EBITDA mais recente (quanto menor, melhor)",
  liquidez:      "Liquidez Corrente mais recente (Ativo Circ. / Passivo Circ.)",
  fcl:           "Consistência do Fluxo de Caixa Livre nos últimos 3 anos",
  // Crescimento
  cresc_receita: "CAGR da Receita Líquida (5 anos)",
  cresc_lucro:   "CAGR do Lucro Líquido (5 anos)",
  cresc_ebitda:  "CAGR do EBITDA (5 anos)",
  // Tamanho
  small_cap:     "Score geral entre empresas de menor capitalização",
  mid_cap:       "Score geral entre empresas de capitalização média",
  large_cap:     "Score geral entre as maiores empresas da B3",
  // Setores
  setor_bancos:      "Score geral entre os bancos analisados",
  setor_energia:     "Score geral entre as elétricas analisadas",
  setor_saude:       "Score geral entre as empresas de saúde",
  setor_petroleo:    "Score geral entre as empresas de petróleo e gás",
  setor_tech:        "Score geral entre as empresas de tecnologia",
  setor_agro:        "Score geral entre as empresas do agronegócio",
  setor_construcao:  "Score geral entre as construtoras e incorporadoras",
  setor_varejo:      "Score geral entre as varejistas analisadas",
};

// ── Funções auxiliares ────────────────────────────────────────────────────────

function formatBRL(v: number | null | undefined): string {
  if (v == null) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
}

function formatPct(v: number | null | undefined, casas = 1): string {
  if (v == null) return "—";
  return `${v >= 0 ? "+" : ""}${v.toFixed(casas)}%`;
}

function scoreColor(score: number): string {
  if (score >= 80) return "#10b981";  // Excelente
  if (score >= 65) return "#84cc16";  // Bom
  if (score >= 50) return "#f59e0b";  // Regular
  if (score >= 35) return "#f97316";  // Fraco
  return "#ef4444";                   // Crítico
}

function scoreLabel(score: number): string {
  if (score >= 80) return "Excelente";
  if (score >= 65) return "Bom";
  if (score >= 50) return "Regular";
  if (score >= 35) return "Fraco";
  return "Crítico";
}

// ── Componentes ───────────────────────────────────────────────────────────────

function ScoreBar({ score, cor }: { score: number; cor?: string }) {
  const color = cor ?? scoreColor(score);
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-[var(--border)] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${score}%`, backgroundColor: color }}
        />
      </div>
      <span className="text-xs font-bold tabular-nums" style={{ color }}>
        {score.toFixed(0)}
      </span>
    </div>
  );
}

function IndicadorPill({ label, value }: { label: string; value: string | null }) {
  if (!value || value === "—") return null;
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[var(--border)]/50 text-xs text-[var(--text-secondary)]">
      <span className="text-[var(--text-muted)] font-normal">{label}:</span>
      <span className="font-semibold text-[var(--text-primary)]">{value}</span>
    </span>
  );
}

function EmpresaRow({
  empresa,
  categoriaId,
}: {
  empresa: EmpresaRanking;
  categoriaId: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const ind = empresa.indicadores ?? {};

  const posColor =
    empresa.posicao === 1 ? "#f59e0b" :
    empresa.posicao === 2 ? "#94a3b8" :
    empresa.posicao === 3 ? "#cd7f32" : "var(--text-muted)";

  return (
    <div
      className={`rounded-xl border border-[var(--border)] transition-all overflow-hidden ${expanded ? "bg-[var(--border)]/10" : "hover:bg-[var(--border)]/20"}`}
    >
      {/* Linha principal */}
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left"
      >
        {/* Posição */}
        <div className="w-8 shrink-0 text-center">
          {empresa.medalha ? (
            <span className="text-lg leading-none">{MEDALHA_LABEL[empresa.medalha]}</span>
          ) : (
            <span className="text-sm font-bold tabular-nums" style={{ color: posColor }}>
              #{empresa.posicao}
            </span>
          )}
        </div>

        {/* Ticker + empresa */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Link
              href={`/rs-analisa?t=${empresa.ticker}`}
              onClick={(e) => e.stopPropagation()}
              className="font-bold text-sm text-[var(--text-primary)] hover:text-emerald-500 transition-colors"
            >
              {empresa.ticker}
            </Link>
            <span className="text-xs text-[var(--text-muted)] truncate hidden xs:block">
              {empresa.empresa}
            </span>
          </div>
          <div className="text-xs text-[var(--text-muted)] truncate">{empresa.setor}</div>
        </div>

        {/* Preço + upside */}
        <div className="hidden sm:flex flex-col items-end shrink-0 mr-2">
          <span className="text-sm font-semibold tabular-nums text-[var(--text-primary)]">
            {formatBRL(empresa.cotacao)}
          </span>
          <span
            className="text-xs font-medium tabular-nums"
            style={{
              color: empresa.upside == null
                ? "var(--text-muted)"
                : empresa.upside >= 0 ? "#10b981" : "#ef4444",
            }}
          >
            {empresa.upside != null ? formatPct(empresa.upside * 100) : "—"}
          </span>
        </div>

        {/* Score */}
        <div className="w-24 shrink-0">
          <ScoreBar score={empresa.score} />
          <div className="text-xs text-center text-[var(--text-muted)] mt-0.5">
            {scoreLabel(empresa.score)}
          </div>
        </div>

        {/* Expandir */}
        <div className="shrink-0 text-[var(--text-muted)]">
          <svg
            width="14" height="14" viewBox="0 0 14 14" fill="none"
            className={`transition-transform ${expanded ? "rotate-180" : ""}`}
          >
            <path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      </button>

      {/* Detalhes expandidos */}
      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-[var(--border)]/50 pt-3">
          {/* Indicadores rápidos */}
          <div className="flex flex-wrap gap-1.5">
            <IndicadorPill label="ROE" value={ind.roe != null ? `${ind.roe.toFixed(1)}%` : null} />
            <IndicadorPill label="Margem Líq." value={ind.margem_liquida != null ? `${ind.margem_liquida.toFixed(1)}%` : null} />
            <IndicadorPill label="Margem EBIT" value={ind.margem_ebitda != null ? `${ind.margem_ebitda.toFixed(1)}%` : null} />
            <IndicadorPill label="DL/EBITDA" value={ind.dl_ebitda != null ? `${ind.dl_ebitda.toFixed(1)}x` : null} />
            <IndicadorPill label="Liq. Corr." value={ind.liquidez_corrente != null ? `${ind.liquidez_corrente.toFixed(1)}x` : null} />
            <IndicadorPill label="CAGR Rec." value={ind.cagr_receita != null ? `${ind.cagr_receita.toFixed(1)}%` : null} />
            <IndicadorPill label="CAGR Luc." value={ind.cagr_lucro != null ? `${ind.cagr_lucro.toFixed(1)}%` : null} />
            {empresa.upside != null && (
              <IndicadorPill label="Upside" value={formatPct(empresa.upside * 100)} />
            )}
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            {/* Pontos positivos */}
            {empresa.bullets_positivos.length > 0 && (
              <div>
                <div className="text-xs font-semibold text-emerald-500 mb-1.5 flex items-center gap-1">
                  <span>✓</span> Pontos positivos
                </div>
                <ul className="space-y-1">
                  {empresa.bullets_positivos.map((b, i) => (
                    <li key={i} className="text-xs text-[var(--text-secondary)] flex items-start gap-1.5">
                      <span className="text-emerald-500 mt-0.5 shrink-0">·</span>
                      {b}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Riscos */}
            {empresa.bullets_negativos.length > 0 && (
              <div>
                <div className="text-xs font-semibold text-rose-500 mb-1.5 flex items-center gap-1">
                  <span>!</span> Pontos de atenção
                </div>
                <ul className="space-y-1">
                  {empresa.bullets_negativos.map((b, i) => (
                    <li key={i} className="text-xs text-[var(--text-secondary)] flex items-start gap-1.5">
                      <span className="text-rose-500 mt-0.5 shrink-0">·</span>
                      {b}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div className="flex gap-2 pt-1">
            <Link
              href={`/rs-analisa?t=${empresa.ticker}`}
              className="text-xs px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 font-medium transition-colors"
            >
              Ver análise completa →
            </Link>
            <Link
              href={`/comparar?tickers=${empresa.ticker}`}
              className="text-xs px-3 py-1.5 rounded-lg bg-[var(--border)]/50 text-[var(--text-secondary)] hover:bg-[var(--border)] font-medium transition-colors"
            >
              Comparar
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function RankingCard({ categoria }: { categoria: CategoriaRanking }) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden">
      {/* Header do card */}
      <div
        className="px-5 py-4 flex items-center gap-3"
        style={{ borderBottom: `2px solid ${categoria.cor}20`, background: `${categoria.cor}08` }}
      >
        <span className="text-2xl">{categoria.icone}</span>
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-base text-[var(--text-primary)] truncate">{categoria.nome}</h3>
          {CRITERIOS[categoria.id] && (
            <div className="text-xs text-[var(--text-muted)] mt-0.5 leading-relaxed">
              Considera: {CRITERIOS[categoria.id]}
            </div>
          )}
        </div>
        <div
          className="text-xs font-bold px-2 py-1 rounded-full shrink-0 self-start mt-0.5"
          style={{ color: categoria.cor, background: `${categoria.cor}15` }}
        >
          Score IA
        </div>
      </div>

      {/* Lista Top 5 */}
      <div className="p-3 space-y-2">
        {categoria.empresas.map((emp) => (
          <EmpresaRow key={emp.ticker} empresa={emp} categoriaId={categoria.id} />
        ))}
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 p-8">
      <div className="text-6xl animate-bounce">🏆</div>
      <div className="text-center space-y-2">
        <h2 className="text-xl font-bold text-[var(--text-primary)]">Calculando Rankings</h2>
        <p className="text-[var(--text-secondary)] max-w-sm text-sm">
          Buscando dados de {25} empresas B3, calculando scores e montando os rankings.
          <br />
          <span className="text-[var(--text-muted)]">Pode demorar até 60s na primeira carga.</span>
        </p>
      </div>
      <div className="flex gap-1.5">
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="w-2 h-2 rounded-full bg-emerald-500 animate-bounce"
            style={{ animationDelay: `${i * 0.1}s` }}
          />
        ))}
      </div>
    </div>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────

export default function RankingPage() {
  const [data, setData] = useState<RankingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [grupoAtivo, setGrupoAtivo] = useState<string>("geral");
  const [busca, setBusca] = useState("");
  const [ultimaAtualizacao, setUltimaAtualizacao] = useState<Date | null>(null);
  const carregando = useRef(false);

  const carregar = useCallback(async (force = false) => {
    if (carregando.current) return;
    carregando.current = true;
    setLoading(true);
    setErro(null);
    try {
      const res = await getRanking(force);
      setData(res);
      setUltimaAtualizacao(new Date());
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : "Erro ao carregar ranking");
    } finally {
      setLoading(false);
      carregando.current = false;
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  // Grupos disponíveis no resultado
  const gruposDisponiveis = data
    ? [...new Set(data.categorias.map((c) => c.grupo))]
    : [];

  // Filtra categorias pelo grupo ativo + busca
  const categoriasFiltradas = data?.categorias.filter((cat) => {
    const grupoOk = cat.grupo === grupoAtivo;
    const buscaOk =
      !busca ||
      cat.nome.toLowerCase().includes(busca.toLowerCase()) ||
      cat.empresas.some(
        (e) =>
          e.ticker.includes(busca.toUpperCase()) ||
          e.empresa.toLowerCase().includes(busca.toLowerCase())
      );
    return grupoOk && buscaOk;
  }) ?? [];

  const ultimaAtualizacaoFormatada = ultimaAtualizacao
    ? ultimaAtualizacao.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <div className="min-h-screen bg-[var(--bg)] pt-16">
      <div className="max-w-7xl mx-auto px-4 py-8">

        {/* Header da página */}
        <div className="mb-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold text-[var(--text-primary)] flex items-center gap-3">
                <span>🏆</span>
                <span>Ranking Inteligente B3</span>
              </h1>
              <p className="text-[var(--text-secondary)] mt-1 text-sm">
                Score IA 0–100 para as principais ações da B3, calculado a partir de 15+ indicadores financeiros.
                {data && (
                  <span className="ml-2 text-[var(--text-muted)]">
                    {data.total_empresas} empresas analisadas
                    {ultimaAtualizacaoFormatada && ` · atualizado às ${ultimaAtualizacaoFormatada}`}
                  </span>
                )}
              </p>
            </div>
            {data && (
              <button
                type="button"
                onClick={() => carregar(true)}
                disabled={loading}
                className="flex items-center gap-2 px-4 py-2 rounded-xl border border-[var(--border)] text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-emerald-500/40 hover:bg-emerald-500/5 transition-all disabled:opacity-50"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className={loading ? "animate-spin" : ""}>
                  <path d="M2 7A5 5 0 1 0 7 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                {loading ? "Calculando..." : "Recalcular"}
              </button>
            )}
          </div>
        </div>

        {/* Erro */}
        {erro && (
          <div className="mb-6 p-4 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-500 text-sm">
            {erro}
          </div>
        )}

        {/* Loading */}
        {loading && !data && <LoadingState />}

        {/* Conteúdo */}
        {data && (
          <>
            {/* Filtros */}
            <div className="mb-6 flex flex-wrap items-center gap-3">
              {/* Busca */}
              <div className="relative">
                <svg
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
                  width="14" height="14" viewBox="0 0 14 14" fill="none"
                >
                  <circle cx="6" cy="6" r="4" stroke="currentColor" strokeWidth="1.5"/>
                  <path d="M9.5 9.5l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                <input
                  type="text"
                  placeholder="Buscar empresa ou ticker..."
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  className="pl-8 pr-4 py-2 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-emerald-500/50 w-64"
                />
              </div>

              {/* Grupos */}
              <div className="flex flex-wrap gap-1.5">
                {gruposDisponiveis.map((grupo) => (
                  <button
                    key={grupo}
                    type="button"
                    onClick={() => setGrupoAtivo(grupo)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                      grupoAtivo === grupo
                        ? "bg-emerald-500 text-white"
                        : "bg-[var(--border)]/50 text-[var(--text-secondary)] hover:bg-[var(--border)]"
                    }`}
                  >
                    {GRUPOS[grupo] ?? grupo}
                  </button>
                ))}
              </div>
            </div>

            {/* Legenda de Score */}
            <div className="mb-6 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden">
              {/* Linha 1 — escala de classificação */}
              <div className="px-4 py-3 flex flex-wrap items-center gap-4 border-b border-[var(--border)]/60">
                <span className="text-xs font-bold text-[var(--text-primary)]">Score IA 0–100 &nbsp;·&nbsp; quanto maior, melhor</span>
                <div className="flex flex-wrap gap-3">
                  {[
                    { label: "Excelente", cor: "#10b981", range: "80–100" },
                    { label: "Bom",       cor: "#84cc16", range: "65–79"  },
                    { label: "Regular",   cor: "#f59e0b", range: "50–64"  },
                    { label: "Fraco",     cor: "#f97316", range: "35–49"  },
                    { label: "Crítico",   cor: "#ef4444", range: "< 35"   },
                  ].map((s) => (
                    <div key={s.label} className="flex items-center gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: s.cor }} />
                      <span className="text-xs text-[var(--text-secondary)]">
                        {s.label} <span className="text-[var(--text-muted)]">({s.range})</span>
                      </span>
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-1.5 ml-auto">
                  <span className="text-sm">🥇🥈🥉</span>
                  <span className="text-xs text-[var(--text-muted)]">Top 3 de cada ranking</span>
                </div>
              </div>

              {/* Linha 2 — dimensões e pesos */}
              <div className="px-4 py-3 flex flex-wrap items-center gap-2">
                <span className="text-xs text-[var(--text-muted)] shrink-0">Composição do score geral:</span>
                {[
                  { label: "Qualidade",        peso: "25%", cor: "#6366f1", tip: "ROE · Margem Líquida · Margem EBITDA" },
                  { label: "Valuation",         peso: "25%", cor: "#f59e0b", tip: "Upside DCF/Graham · P/L · Range 52 semanas" },
                  { label: "Crescimento",       peso: "20%", cor: "#8b5cf6", tip: "CAGR Receita · CAGR Lucro · CAGR EBITDA (5 anos)" },
                  { label: "Dividendos",        peso: "15%", cor: "#10b981", tip: "DY estimado · FCL positivo · Crescimento do lucro" },
                  { label: "Saúde Financeira",  peso: "15%", cor: "#14b8a6", tip: "DL/EBITDA · Liquidez Corrente · FCO · Governança B3" },
                ].map((d) => (
                  <div
                    key={d.label}
                    title={d.tip}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-[var(--border)] cursor-help"
                    style={{ borderColor: `${d.cor}40`, background: `${d.cor}08` }}
                  >
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: d.cor }} />
                    <span className="text-xs font-medium" style={{ color: d.cor }}>{d.label}</span>
                    <span className="text-xs text-[var(--text-muted)]">{d.peso}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Grid de rankings */}
            {categoriasFiltradas.length === 0 ? (
              <div className="text-center py-16 text-[var(--text-muted)]">
                {busca ? `Nenhum resultado para "${busca}"` : "Sem categorias neste grupo."}
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
                {categoriasFiltradas.map((cat) => (
                  <RankingCard key={cat.id} categoria={cat} />
                ))}
              </div>
            )}

            {/* Footer info */}
            <div className="mt-8 pt-6 border-t border-[var(--border)] text-xs text-[var(--text-muted)] text-center">
              Scores calculados algoritmicamente com base em indicadores financeiros fundamentalistas (CVM DFP + BRAPI).
              Não constitui recomendação de investimento. Dados com defasagem e sujeitos a erros de coleta.
            </div>
          </>
        )}
      </div>
    </div>
  );
}
