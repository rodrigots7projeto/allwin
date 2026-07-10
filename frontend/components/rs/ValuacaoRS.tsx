"use client";

import type { ValuationData } from "@/types";
import { InfoBtn, type InfoContent } from "./InfoModal";

interface Props {
  valuation: ValuationData;
}

const R2 = (v: number | null) =>
  v === null ? "—"
  : `R$ ${new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v)}`;

const Pct = (v: number | null) =>
  v === null ? "—" : `${(v * 100) >= 0 ? "+" : ""}${(v * 100).toFixed(1)}%`;

const COR_VEREDICTO: Record<string, string> = {
  verde: "#10b981",
  amarelo: "#f59e0b",
  vermelho: "#ef4444",
  neutro: "var(--text-secondary)",
};

const INFO_METODOS: Record<string, InfoContent> = {
  Graham: {
    titulo: "Método Graham — Valor Intrínseco",
    descricao: "Fórmula criada por Benjamin Graham (pai do value investing, mentor de Warren Buffett). Estima o preço justo de ações de empresas lucrativas e com patrimônio positivo.",
    formula: "Preço Justo = √(22,5 × LPA × VPA)",
    interpretacao: "Se Preço Atual < Preço Graham → ação subavaliada pelo método. O número 22,5 representa P/L de 15 × P/VP de 1,5 (critério clássico de Graham). Método mais conservador — ignora crescimento futuro.",
    aviso: "Inválido quando LPA (lucro por ação) ou VPA (valor patrimonial por ação) for negativo. Funciona melhor para empresas maduras e estáveis, não para startups ou empresas de alto crescimento.",
    fonte: "LPA e VPA calculados com dados CVM DFP + Market Cap Brapi",
  },
  "P/L": {
    titulo: "Método P/L — Múltiplo de Lucro",
    descricao: "Estima o preço justo multiplicando o Lucro Por Ação (LPA) por um múltiplo P/L alvo razoável para a B3. No cenário base é usada a referência de 12x, histórica para empresas brasileiras sólidas.",
    formula: "Preço Justo = LPA × P/L Alvo (12x no cenário base)",
    interpretacao: "Se o P/L atual for menor que 12x, a ação pode estar barata. Cenários Pessimista (8x), Base (12x) e Otimista (17x) mostram a faixa de preços razoáveis.",
    aviso: "Não funciona para empresas com prejuízo (LPA negativo). Empresas de alto crescimento podem justificar P/L muito acima de 12x.",
    fonte: "LPA calculado com Lucro Líquido (CVM DFP) ÷ Total de Ações (Market Cap ÷ Preço, Brapi)",
  },
  "P/VP": {
    titulo: "Método P/VP — Múltiplo Patrimonial",
    descricao: "Compara o preço da ação com o Valor Patrimonial Por Ação (VPA = Patrimônio Líquido ÷ Ações). Muito usado para bancos, seguradoras e empresas com ativos pesados.",
    formula: "Preço Justo = VPA × P/VP Alvo (1,4x no cenário base)",
    interpretacao: "P/VP < 1 = você compra a empresa por menos do que o valor contábil dos seus ativos (liquidação). P/VP entre 1–2 = razoável. P/VP > 3 = ação cara em relação ao patrimônio.",
    aviso: "Menos relevante para empresas de tecnologia ou serviços (ativos intangíveis não estão no patrimônio contábil).",
    fonte: "Patrimônio Líquido via CVM DFP + Total de Ações via Brapi",
  },
  DCF: {
    titulo: "Método DCF — Fluxo de Caixa Descontado",
    descricao: "O modelo mais sofisticado de valuation. Projeta o Fluxo de Caixa Livre (FCL) por 5 anos com base no histórico da empresa, depois calcula o Valor Terminal (quanto a empresa vale em perpetuidade), e desconta tudo ao valor presente usando o WACC (custo médio de capital).",
    formula: "VP = Σ [FCL × (1+g)^t ÷ (1+WACC)^t] + Valor Terminal",
    interpretacao: "WACC Pessimista: 15%. WACC Base: 12%. WACC Otimista: 10%. Crescimento terminal: 4% (PIB nominal Brasil). Resultado maior que o preço atual = subavaliada pelo DCF.",
    aviso: "⚠️ Se o resultado do DCF for R$ 0,01, significa que o valor presente dos fluxos de caixa descontados menos a dívida líquida por ação ficou próximo de zero. Causas: (1) FCL histórico negativo ou muito baixo — empresa consumindo mais caixa do que gera; (2) Dívida líquida elevada que consome o valor do negócio no modelo. Isso NÃO significa que a empresa vale zero — use os outros métodos (Graham, P/L, P/VP) para complementar a análise.",
    fonte: "FCL médio dos últimos 3 anos via CVM DFP + Market Cap Brapi para calcular FCL/ação",
  },
};

const INFO_RESUMO: Record<string, InfoContent> = {
  preco_atual: {
    titulo: "Preço Atual",
    descricao: "Último preço negociado da ação na B3. É o preço de referência para todos os cálculos de valuation.",
    fonte: "Brapi (dados B3 em tempo real)",
  },
  preco_justo: {
    titulo: "Preço Justo (Cenário Base)",
    descricao: "Média ponderada dos resultados dos métodos Graham, P/L, P/VP e DCF no cenário base. Representa a estimativa central do RS Invest para o valor intrínseco da ação.",
    interpretacao: "Preço Justo > Preço Atual = ação subavaliada (possível compra). Preço Justo < Preço Atual = ação superavaliada (possível venda ou espera). Nunca tome decisões baseado só neste número — analise os fundamentos.",
    fonte: "Calculado pelo RS Invest com dados CVM DFP + Brapi",
  },
  upside: {
    titulo: "Upside / Downside",
    descricao: "Potencial de valorização (upside positivo) ou desvalorização (downside negativo) da ação em relação ao Preço Justo estimado.",
    formula: "Upside = (Preço Justo − Preço Atual) ÷ Preço Atual × 100%",
    interpretacao: "Upside > +20% = significativamente subavaliada. +5% a +20% = levemente subavaliada. ±5% = preço justo. −5% a −20% = levemente superavaliada. < −20% = significativamente superavaliada.",
    fonte: "Calculado pelo RS Invest",
  },
  margem: {
    titulo: "Margem de Segurança",
    descricao: "Desconto do preço atual em relação ao Preço Justo. Conceito de Graham: compre com margem de segurança para se proteger de erros de estimativa.",
    formula: "Margem de Segurança = (Preço Justo − Preço Atual) ÷ Preço Justo × 100%",
    interpretacao: "Graham recomendava pelo menos 33% de margem. Margem negativa = ação acima do preço justo. Margem de 50%+ = oportunidade rara — mas verifique se não é uma armadilha (empresa com problemas reais).",
    fonte: "Calculado pelo RS Invest",
  },
  eps: {
    titulo: "LPA — Lucro Por Ação",
    descricao: "Lucro Líquido do último exercício disponível dividido pelo número estimado de ações em circulação.",
    formula: "LPA = Lucro Líquido ÷ Total de Ações",
    fonte: "Lucro Líquido via CVM DFP + Total de Ações = Market Cap ÷ Preço (Brapi)",
  },
  bvs: {
    titulo: "VPA — Valor Patrimonial Por Ação",
    descricao: "Patrimônio Líquido da empresa dividido pelo número estimado de ações. Representa quanto cada ação vale contabilmente (valor de liquidação teórico).",
    formula: "VPA = Patrimônio Líquido ÷ Total de Ações",
    fonte: "Patrimônio Líquido via CVM DFP + Total de Ações via Brapi",
  },
  fcl: {
    titulo: "FCL/ação — Fluxo de Caixa Livre Por Ação",
    descricao: "Média do Fluxo de Caixa Livre (FCL) dos últimos 3 anos dividida pelo número de ações. É o principal insumo do modelo DCF. FCL = caixa gerado pelas operações menos investimentos em ativos fixos (capex).",
    formula: "FCL/ação = FCL médio 3 anos ÷ Total de Ações",
    interpretacao: "FCL positivo = empresa gerando caixa real. FCL negativo = empresa consumindo caixa (fase de crescimento ou dificuldade). FCL negativo torna o DCF inaplicável.",
    aviso: "Se FCL/ação estiver negativo ou muito baixo, o DCF retornará R$ 0,01 (inaplicável). Isso é esperado para empresas em expansão que investem mais do que geram.",
    fonte: "FCL via CVM DFP (Demonstração do Fluxo de Caixa)",
  },
  shares: {
    titulo: "Ações em Circulação (estimativa)",
    descricao: "Número estimado de ações ordinárias e preferenciais emitidas pela empresa, calculado dividindo o Market Cap pelo preço atual.",
    formula: "Ações = Market Cap ÷ Preço Atual",
    aviso: "Estimativa baseada no Market Cap informado pela Brapi. O número exato de ações por tipo (ON/PN) está nas demonstrações financeiras da empresa no site da CVM.",
    fonte: "Market Cap e Preço via Brapi",
  },
};

const INFO_CENARIOS: InfoContent = {
  titulo: "Cenários DCF (Pessimista, Base, Otimista)",
  descricao: "Cada cenário combina três fatores: (1) taxa de crescimento g (CAGR histórico ± ajuste); (2) WACC — custo de capital usado para descontar os fluxos; (3) múltiplos P/L e P/VP alvo. O preço justo de cada cenário é a média dos métodos válidos naquele cenário.",
  interpretacao: "Pessimista: g −4 p.p., WACC 15%. Base: g sem ajuste, WACC 12%. Otimista: g +5 p.p., WACC 10%. A faixa Pessimista–Otimista mostra o intervalo razoável de preços justos. Ações cujo preço está abaixo do Pessimista são raramente baratas — geralmente há algum risco oculto.",
  aviso: "O crescimento terminal (g terminal) fixado em 4% representa o PIB nominal de longo prazo do Brasil. Empresas exportadoras ou dolarizadas podem justificar g terminal diferente.",
  fonte: "Calculado pelo RS Invest com FCL histórico (CVM DFP) e taxas de mercado",
};

export function ValuacaoRS({ valuation }: Props) {
  const cor = COR_VEREDICTO[valuation.veredicto_cor] ?? "var(--text-secondary)";

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-[var(--text-secondary)]">
          Modelos de Valuation
        </h3>
        <div className="flex items-center gap-2">
          <span
            className="text-xs font-bold px-3 py-1 rounded-full"
            style={{ background: cor + "22", color: cor }}
          >
            {valuation.veredicto}
          </span>
        </div>
      </div>

      {/* Preço atual + preço justo + upside */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { key: "preco_atual", label: "Preço Atual",       value: R2(valuation.preco_atual),       cor: undefined },
          { key: "preco_justo", label: "Preço Justo (Base)", value: R2(valuation.preco_justo_base),  cor },
          { key: "upside",      label: "Upside / Downside", value: Pct(valuation.upside_pct),        cor },
          { key: "margem",      label: "Margem de Seg.",    value: Pct(valuation.margem_seguranca),  cor: undefined },
        ].map((item) => (
          <div key={item.key} className="rounded-xl border border-[var(--border)] p-3 text-center">
            <p className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wide mb-1 flex items-center justify-center gap-1">
              {item.label}
              <InfoBtn info={INFO_RESUMO[item.key]} />
            </p>
            <p className="text-lg font-bold font-mono" style={{ color: item.cor }}>
              {item.value}
            </p>
          </div>
        ))}
      </div>

      {/* Métodos individuais */}
      <div>
        <p className="text-[11px] font-semibold text-[var(--text-secondary)] uppercase tracking-wide mb-2">
          Métodos de Valuation
        </p>
        <div className="space-y-2">
          {valuation.metodos.map((m) => {
            const up = m.upside_pct ?? 0;
            const corM = up >= 0.15 ? "#10b981" : up >= 0 ? "#f59e0b" : "#ef4444";
            const barW = Math.min(100, Math.max(0, 50 + up * 100));
            const isDCFZero = m.nome === "DCF" && m.preco_justo !== null && m.preco_justo <= 0.05;
            const infoMetodo = INFO_METODOS[m.nome] ?? INFO_METODOS["Graham"];

            return (
              <div key={m.nome} className="flex items-center gap-3">
                <div className="w-28 shrink-0">
                  <p className="text-[11px] font-semibold flex items-center gap-1">
                    {m.nome}
                    <InfoBtn info={infoMetodo} />
                    {isDCFZero && (
                      <span
                        className="text-[9px] font-bold px-1 rounded"
                        style={{ background: "#f59e0b22", color: "#f59e0b" }}
                        title="DCF inaplicável — clique no ? para entender"
                      >
                        !
                      </span>
                    )}
                  </p>
                  <p className="text-[10px] text-[var(--text-secondary)] truncate">{m.descricao}</p>
                </div>
                {/* Barra visual */}
                <div className="flex-1 h-6 rounded-lg bg-[var(--border)] overflow-hidden relative">
                  <div className="absolute left-1/2 top-0 bottom-0 w-px bg-[var(--text-secondary)] opacity-40" />
                  {!isDCFZero && (
                    <div
                      className="absolute top-1 bottom-1 rounded"
                      style={{
                        left: up >= 0 ? "50%" : `${barW}%`,
                        right: up >= 0 ? `${100 - barW}%` : "50%",
                        background: corM,
                        opacity: 0.7,
                      }}
                    />
                  )}
                </div>
                <div className="w-24 shrink-0 text-right">
                  {isDCFZero ? (
                    <>
                      <p className="text-xs font-mono font-semibold text-amber-500">Inaplicável</p>
                      <p className="text-[10px] text-[var(--text-secondary)] opacity-60">FCL insuf.</p>
                    </>
                  ) : (
                    <>
                      <p className="text-xs font-mono font-semibold">{R2(m.preco_justo)}</p>
                      <p className="text-[10px] font-semibold" style={{ color: corM }}>
                        {Pct(m.upside_pct)}
                      </p>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Cenários DCF */}
      {valuation.cenarios.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold text-[var(--text-secondary)] uppercase tracking-wide mb-2 flex items-center gap-1">
            Cenários DCF
            <InfoBtn info={INFO_CENARIOS} />
          </p>
          <div className="grid grid-cols-3 gap-2">
            {valuation.cenarios.map((c) => {
              const corC =
                c.nome === "Otimista" ? "#10b981"
                : c.nome === "Pessimista" ? "#ef4444"
                : "#f59e0b";
              return (
                <div
                  key={c.nome}
                  className="rounded-xl border p-3 text-center"
                  style={{ borderColor: corC + "44", background: corC + "0a" }}
                >
                  <p className="text-[10px] font-semibold uppercase tracking-wide mb-1" style={{ color: corC }}>
                    {c.nome}
                  </p>
                  <p className="text-base font-bold font-mono">
                    {c.preco_justo ? R2(c.preco_justo) : "—"}
                  </p>
                  <p className="text-[11px] font-semibold mt-0.5" style={{ color: corC }}>
                    {Pct(c.upside_pct)}
                  </p>
                  <p className="text-[10px] text-[var(--text-secondary)] mt-1">
                    g={`${(c.taxa_crescimento * 100).toFixed(1)}%`} · WACC={`${(c.taxa_desconto * 100).toFixed(1)}%`}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Premissas usadas */}
      {valuation.premissas && Object.keys(valuation.premissas).length > 0 && (
        <details className="group">
          <summary className="text-[11px] text-[var(--text-secondary)] opacity-60 hover:opacity-100 cursor-pointer transition-opacity select-none">
            Ver premissas utilizadas ▾
          </summary>
          <div className="mt-2 rounded-xl bg-[var(--border)]/20 p-3 grid grid-cols-2 gap-x-4 gap-y-1">
            {Object.entries(valuation.premissas).map(([k, v]) => (
              <div key={k} className="flex items-center justify-between text-[11px]">
                <span className="text-[var(--text-secondary)]">{k.replace(/_/g, " ")}</span>
                <span className="font-mono font-semibold">{v !== null ? String(v) : "—"}</span>
              </div>
            ))}
          </div>
        </details>
      )}

      {/* Métricas por ação */}
      {(valuation.eps || valuation.bvs || valuation.fcl_por_acao) && (
        <div className="pt-3 border-t border-[var(--border)] grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
          {[
            { key: "eps",    label: "LPA (EPS)",    value: R2(valuation.eps) },
            { key: "bvs",    label: "VPA (BVPS)",   value: R2(valuation.bvs) },
            { key: "fcl",    label: "FCL/ação",      value: R2(valuation.fcl_por_acao) },
            { key: "shares", label: "Ações (est.)",  value: valuation.shares
              ? valuation.shares >= 1e9
                ? `${(valuation.shares / 1e9).toFixed(2)}B`
                : `${(valuation.shares / 1e6).toFixed(0)}M`
              : "—" },
          ].map((item) => (
            <div key={item.key}>
              <p className="text-[var(--text-secondary)] flex items-center gap-1">
                {item.label}
                <InfoBtn info={INFO_RESUMO[item.key]} />
              </p>
              <p className="font-semibold font-mono mt-0.5">{item.value}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
