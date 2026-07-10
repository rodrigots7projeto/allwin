"use client";

import type { QuoteData } from "@/types";
import { InfoBtn, type InfoContent } from "./InfoModal";

interface Props {
  cotacao: QuoteData;
  varMes: number | null;
  varAno: number | null;
  indices: string[];
}

const R = (v: number | null) =>
  v === null ? "—"
  : `R$ ${new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v)}`;

const Pct = (v: number | null, mult = 1) =>
  v === null ? "—" : `${(v * mult) >= 0 ? "+" : ""}${(v * mult).toFixed(2)}%`;

const M = (v: number | null) => {
  if (v === null) return "—";
  if (Math.abs(v) >= 1e12) return `R$ ${(v / 1e12).toFixed(2)}T`;
  if (Math.abs(v) >= 1e9) return `R$ ${(v / 1e9).toFixed(2)}B`;
  if (Math.abs(v) >= 1e6) return `R$ ${(v / 1e6).toFixed(0)}M`;
  return R(v);
};

const INFO: Record<string, InfoContent> = {
  abertura: {
    titulo: "Preço de Abertura",
    descricao: "Primeiro preço registrado da ação no início do pregão de hoje na B3.",
    interpretacao: "Comparar abertura com o fechamento anterior ajuda a ver se há gap de alta ou baixa. Gap de alta = demanda maior que oferta na abertura.",
    fonte: "B3 em tempo real via Brapi",
  },
  max_dia: {
    titulo: "Máxima do Dia",
    descricao: "Preço mais alto atingido pela ação durante o pregão de hoje.",
    interpretacao: "Resistência intraday. Se a ação fechar próxima à máxima, indica força compradora no dia.",
    fonte: "B3 em tempo real via Brapi",
  },
  min_dia: {
    titulo: "Mínima do Dia",
    descricao: "Preço mais baixo atingido pela ação durante o pregão de hoje.",
    interpretacao: "Suporte intraday. Se a ação fechar longe da mínima, vendedores perderam força ao longo do dia.",
    fonte: "B3 em tempo real via Brapi",
  },
  var_mes: {
    titulo: "Variação no Mês",
    descricao: "Variação percentual do preço comparando hoje com o fechamento de aproximadamente 21 pregões atrás (≈ 1 mês).",
    interpretacao: "Indica a tendência de curto/médio prazo. Positivo = ação valorizando no mês. Negativo = desvalorização mensal.",
    fonte: "Calculado pelo RS Invest com base no histórico mensal da Brapi",
  },
  var_12m: {
    titulo: "Variação 12 Meses",
    descricao: "Variação percentual do preço ao longo dos últimos 12 meses (1 ano).",
    interpretacao: "Indica a performance anual. Compare com o IBOVESPA: se a ação rendeu mais, bateu o índice. Abaixo de zero por 12 meses é sinal de fraqueza estrutural.",
    fonte: "Calculado pelo RS Invest com base no histórico mensal da Brapi",
  },
  market_cap: {
    titulo: "Market Cap (Capitalização de Mercado)",
    descricao: "Valor total de mercado da empresa. Calculado como: Preço Atual × Número Total de Ações.",
    formula: "Market Cap = Preço × Ações em circulação",
    interpretacao: "Large Cap (>R$10B): empresas grandes e estáveis. Mid Cap (R$2B–R$10B): potencial de crescimento. Small Cap (<R$2B): maior risco, maior potencial.",
    fonte: "Brapi (dados B3)",
  },
  max_52s: {
    titulo: "Máxima das 52 Semanas",
    descricao: "Maior preço atingido pela ação nos últimos 12 meses (52 semanas).",
    interpretacao: "Topos anuais funcionam como resistências. Ação próxima à máxima 52S indica força — rompimento pode abrir nova perna de alta. Muito abaixo da máxima pode indicar ação deprimida.",
    fonte: "Brapi (dados B3)",
  },
  min_52s: {
    titulo: "Mínima das 52 Semanas",
    descricao: "Menor preço atingido pela ação nos últimos 12 meses (52 semanas).",
    interpretacao: "Fundos anuais são suportes importantes. Ação próxima à mínima pode estar em crise, mas também pode ser oportunidade de compra se os fundamentos estiverem sólidos.",
    fonte: "Brapi (dados B3)",
  },
  pl: {
    titulo: "P/L — Preço sobre Lucro",
    descricao: "Quanto os investidores pagam por cada R$1 de lucro anual da empresa. Se P/L = 15, o mercado paga R$15 para receber R$1 de lucro.",
    formula: "P/L = Preço Atual ÷ LPA (Lucro Por Ação)",
    interpretacao: "P/L < 8 = pode estar barato (mas verifique se não é cilada!). P/L 8–15 = razoável para empresas maduras. P/L 15–25 = aceito para crescimento moderado. P/L > 25 = caro, o mercado espera crescimento acelerado. P/L negativo = empresa com prejuízo.",
    fonte: "Brapi (dados B3)",
  },
  lpa: {
    titulo: "LPA — Lucro Por Ação",
    descricao: "Lucro líquido anual dividido pelo número total de ações. É a base de vários modelos de valuation (Graham, P/L histórico).",
    formula: "LPA = Lucro Líquido Anual ÷ Total de Ações",
    interpretacao: "LPA positivo e crescente = empresa saudável e em expansão. LPA negativo = prejuízo. LPA caindo ao longo dos anos = sinal de alerta. Use o LPA junto com o histórico de lucros no DFP (aba Fundamentos).",
    fonte: "Brapi (dados B3)",
  },
  volume: {
    titulo: "Volume Negociado",
    descricao: "Quantidade de ações negociadas durante o pregão de hoje na B3.",
    interpretacao: "Volume alto junto com alta de preço = compra genuína (alta de qualidade). Volume alto junto com queda = venda em massa (cuidado!). Volume muito baixo = ação pouco líquida, difícil de comprar/vender sem impactar o preço.",
    fonte: "B3 em tempo real via Brapi",
  },
};

function StatCell({
  label, value, cor, infoKey,
}: {
  label: string; value: string; cor?: string; infoKey: string;
}) {
  const info = INFO[infoKey];
  return (
    <div className="flex flex-col gap-0.5">
      <span className="flex items-center gap-1 text-[10px] text-[var(--text-secondary)] uppercase tracking-wide">
        {label}
        {info && <InfoBtn info={info} />}
      </span>
      <span
        className="text-sm font-semibold font-mono"
        style={{ color: cor ?? "var(--text-primary)" }}
      >
        {value}
      </span>
    </div>
  );
}

export function CotacaoRS({ cotacao, varMes, varAno, indices }: Props) {
  const varDia = cotacao.variacao_pct;
  const corDia = varDia >= 0 ? "#10b981" : "#ef4444";
  const corMes = varMes !== null ? (varMes >= 0 ? "#10b981" : "#ef4444") : "inherit";
  const corAno = varAno !== null ? (varAno >= 0 ? "#10b981" : "#ef4444") : "inherit";

  const pl = cotacao.preco_lucro;
  const lpa = cotacao.lpa;

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-end justify-between gap-2 mb-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-2xl font-bold font-mono">{R(cotacao.preco_atual)}</span>
            <span
              className="text-sm font-semibold px-2 py-0.5 rounded-full"
              style={{ background: corDia + "22", color: corDia }}
            >
              {Pct(varDia / 100)}
            </span>
          </div>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
            {cotacao.moeda} · Pregão anterior: {R(cotacao.preco_fechamento_anterior)}
          </p>
        </div>

        {/* Índices B3 */}
        {indices.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {indices.slice(0, 6).map((idx) => (
              <span
                key={idx}
                className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 cursor-default"
                title={`Esta ação faz parte do índice ${idx} da B3`}
              >
                {idx}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Grid de métricas */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 pt-3 border-t border-[var(--border)]">
        <StatCell label="Abertura"   value={R(cotacao.preco_abertura)}  infoKey="abertura" />
        <StatCell label="Máx dia"    value={R(cotacao.preco_max)}        infoKey="max_dia" />
        <StatCell label="Mín dia"    value={R(cotacao.preco_min)}        infoKey="min_dia" />
        <StatCell label="Var. mês"   value={Pct(varMes)}  cor={corMes}   infoKey="var_mes" />
        <StatCell label="Var. 12m"   value={Pct(varAno)}  cor={corAno}   infoKey="var_12m" />
        <StatCell label="Market cap" value={M(cotacao.market_cap)}       infoKey="market_cap" />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 pt-3 mt-3 border-t border-[var(--border)]">
        <StatCell label="52S máx" value={R(cotacao.cinquenta_dois_semanas_alta)}  infoKey="max_52s" />
        <StatCell label="52S mín" value={R(cotacao.cinquenta_dois_semanas_baixa)} infoKey="min_52s" />
        <StatCell label="P/L"     value={pl ? `${pl.toFixed(1)}x` : "—"}          infoKey="pl" />
        <StatCell label="LPA"     value={lpa ? R(lpa) : "—"}                      infoKey="lpa" />
        <StatCell
          label="Volume"
          value={
            cotacao.volume >= 1e6
              ? `${(cotacao.volume / 1e6).toFixed(1)}M`
              : cotacao.volume >= 1e3
              ? `${(cotacao.volume / 1e3).toFixed(0)}K`
              : String(cotacao.volume)
          }
          infoKey="volume"
        />
        <StatCell label="Moeda" value={cotacao.moeda} infoKey="volume" />
      </div>
    </div>
  );
}
