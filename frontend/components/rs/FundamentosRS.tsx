"use client";

import type { DemonstrativoAnual, FundamentosData } from "@/types";
import { useState } from "react";
import { InfoBtn, type InfoContent } from "./InfoModal";

interface Props {
  fundamentos: FundamentosData;
}

const Bi = (v: number | null) => {
  if (v === null) return "—";
  if (Math.abs(v) >= 1e9) return `R$ ${(v / 1e9).toFixed(1)}B`;
  if (Math.abs(v) >= 1e6) return `R$ ${(v / 1e6).toFixed(0)}M`;
  return `R$ ${v.toFixed(0)}`;
};

const Pct = (v: number | null) =>
  v === null ? "—" : `${(v * 100).toFixed(1)}%`;

const Fx = (v: number | null, dec = 2) =>
  v === null ? "—" : v.toFixed(dec) + "x";

type TabKey = "dre" | "balanco" | "indicadores";

const TABS: { key: TabKey; label: string }[] = [
  { key: "dre",         label: "DRE" },
  { key: "balanco",     label: "Balanço" },
  { key: "indicadores", label: "Indicadores" },
];

type RowDef = {
  label: string;
  info: InfoContent;
  get: (d: DemonstrativoAnual) => string;
  highlight?: (d: DemonstrativoAnual) => "verde" | "vermelho" | null;
};

const DRE_ROWS: RowDef[] = [
  {
    label: "Receita Líquida",
    info: {
      titulo: "Receita Líquida",
      descricao: "Total das vendas da empresa no exercício, depois de descontar devoluções, abatimentos e impostos sobre vendas (PIS, COFINS, ICMS). É a linha de partida da DRE.",
      interpretacao: "Receita crescendo ano a ano = empresa em expansão. Queda de receita por 2+ anos seguidos = sinal de alerta estrutural.",
      fonte: "CVM — Demonstrações Financeiras Padronizadas (DFP), código 3.01",
    },
    get: (d) => Bi(d.receita_liquida),
  },
  {
    label: "Lucro Bruto",
    info: {
      titulo: "Lucro Bruto",
      descricao: "Receita Líquida menos o Custo dos Produtos Vendidos (CPV) ou Custo dos Serviços Prestados (CSP). Mostra quanto sobra antes das despesas operacionais.",
      formula: "Lucro Bruto = Receita Líquida − CPV/CSP",
      interpretacao: "Margem Bruta alta = empresa tem poder de precificação (ex.: luxo, tecnologia, farmacêuticas). Margem Bruta baixa = negócio mais commodity, margens pressionadas.",
      fonte: "CVM — DFP, código 3.03",
    },
    get: (d) => Bi(d.lucro_bruto),
  },
  {
    label: "EBIT",
    info: {
      titulo: "EBIT — Lucro Operacional",
      descricao: "Earnings Before Interest and Taxes — Lucro antes dos juros (receitas/despesas financeiras) e imposto de renda. Mede a eficiência operacional da empresa, ignorando a estrutura de capital (dívida).",
      formula: "EBIT = Lucro Bruto − Despesas Operacionais",
      interpretacao: "EBIT positivo = o negócio em si é lucrativo. EBIT negativo mas com resultado positivo = empresa com ganhos financeiros mascarando operação fraca (cuidado!). Compare a Margem EBIT com concorrentes do mesmo setor.",
      fonte: "CVM — DFP, calculado a partir das linhas 3.05 e 3.06",
    },
    get: (d) => Bi(d.ebit),
    highlight: (d) => d.ebit === null ? null : d.ebit >= 0 ? "verde" : "vermelho",
  },
  {
    label: "EBITDA",
    info: {
      titulo: "EBITDA — Geração de Caixa Operacional",
      descricao: "Earnings Before Interest, Taxes, Depreciation and Amortization. Lucro operacional antes da depreciação e amortização. Proxy do caixa gerado pelas operações — muito usado para comparar empresas de setores diferentes.",
      formula: "EBITDA = EBIT + Depreciação + Amortização",
      interpretacao: "EBITDA positivo = empresa gera caixa operacional. Muito usado no índice DL/EBITDA para medir capacidade de pagamento de dívida. EBITDA alto não significa lucro — a empresa pode ter dívida cara consumindo o resultado.",
      aviso: "Empresas com ativo fixo intenso (siderurgia, energia, telecoms) têm EBITDA muito maior que o lucro líquido devido à alta depreciação. Não ignore o lucro líquido.",
      fonte: "CVM — DFP, estimado adicionando depreciação ao EBIT",
    },
    get: (d) => Bi(d.ebitda),
  },
  {
    label: "Lucro Líquido",
    info: {
      titulo: "Lucro Líquido",
      descricao: "O que sobrou para os acionistas depois de pagar todos os custos, despesas, juros e impostos. É o resultado final da DRE.",
      formula: "Lucro Líquido = EBIT − Despesas Financeiras Líquidas − IR/CSLL",
      interpretacao: "Lucro positivo e crescente = empresa saudável e com capacidade de reinvestir ou distribuir dividendos. Prejuízo em um ano pode ser pontual. Prejuízo em 3+ anos consecutivos = crise estrutural ou ciclo muito longo.",
      fonte: "CVM — DFP, código 3.11",
    },
    get: (d) => Bi(d.lucro_liquido),
    highlight: (d) => d.lucro_liquido === null ? null : d.lucro_liquido >= 0 ? "verde" : "vermelho",
  },
  {
    label: "FCO",
    info: {
      titulo: "FCO — Fluxo de Caixa Operacional",
      descricao: "Fluxo de Caixa das Operações: quanto de caixa as atividades-fim da empresa geraram no período. Mais confiável que o lucro líquido porque não inclui itens não-caixa (depreciação, equivalência patrimonial).",
      interpretacao: "FCO positivo e maior que o Lucro Líquido = lucro de alta qualidade, real em caixa. FCO negativo = empresa queimando caixa nas operações — requer financiamento externo. Comparar FCO com Lucro Líquido detecta manipulação contábil.",
      fonte: "CVM — DFP, Demonstração do Fluxo de Caixa (DFC), atividades operacionais",
    },
    get: (d) => Bi(d.fco),
    highlight: (d) => d.fco === null ? null : d.fco >= 0 ? "verde" : "vermelho",
  },
  {
    label: "FCL",
    info: {
      titulo: "FCL — Fluxo de Caixa Livre",
      descricao: "Fluxo de Caixa Livre para a firma: o que sobra após a empresa pagar por todos seus investimentos em ativos fixos (capex). É o caixa disponível para pagar dividendos, recomprar ações ou reduzir dívida.",
      formula: "FCL = FCO − CAPEX (Investimentos em Ativo Imobilizado)",
      interpretacao: "FCL positivo e crescente = empresa excelente gerando caixa livre. FCL negativo = fase de expansão (investe mais do que gera) — aceito se a empresa cresce receita/lucro aceleradamente. FCL negativo por anos com estagnação de receita = armadilha.",
      fonte: "CVM — DFP, Demonstração do Fluxo de Caixa (DFC)",
    },
    get: (d) => Bi(d.fcl),
    highlight: (d) => d.fcl === null ? null : d.fcl >= 0 ? "verde" : "vermelho",
  },
  {
    label: "Margem Bruta",
    info: {
      titulo: "Margem Bruta",
      descricao: "Percentual da Receita Líquida que sobra após pagar os custos diretos de produção/serviço.",
      formula: "Margem Bruta = Lucro Bruto ÷ Receita Líquida × 100%",
      interpretacao: "Varejo: 20–40%. Tecnologia/SaaS: 50–80%. Commodities: 5–20%. Saúde: 40–60%. Margem bruta caindo ao longo dos anos = pressão de custos ou perda de poder de precificação.",
      fonte: "CVM — DFP, calculado pelo RS Invest",
    },
    get: (d) => Pct(d.margem_bruta),
  },
  {
    label: "Margem EBIT",
    info: {
      titulo: "Margem EBIT (Margem Operacional)",
      descricao: "Percentual da receita que se torna lucro operacional, antes de juros e impostos.",
      formula: "Margem EBIT = EBIT ÷ Receita Líquida × 100%",
      interpretacao: "Margem EBIT > 20% = operação muito eficiente. 10–20% = razoável. < 5% = negócio de baixa margem (varejo, commodities) — requer escala enorme. Negativa = operação deficitária.",
      fonte: "CVM — DFP, calculado pelo RS Invest",
    },
    get: (d) => Pct(d.margem_ebit),
  },
  {
    label: "Margem EBITDA",
    info: {
      titulo: "Margem EBITDA",
      descricao: "EBITDA como percentual da Receita Líquida. Indica a eficiência operacional desconsiderando depreciação (relevante para empresas capital-intensivas).",
      formula: "Margem EBITDA = EBITDA ÷ Receita Líquida × 100%",
      interpretacao: "Telecoms, energia e siderurgia têm EBITDA alto mas lucro baixo (depreciação elevada). Compare sempre com empresas do mesmo setor — não entre setores diferentes.",
      fonte: "CVM — DFP, calculado pelo RS Invest",
    },
    get: (d) => Pct(d.margem_ebitda),
  },
  {
    label: "Margem Líquida",
    info: {
      titulo: "Margem Líquida",
      descricao: "Percentual da receita que vira lucro final para o acionista, após todos os custos, despesas, juros e impostos.",
      formula: "Margem Líquida = Lucro Líquido ÷ Receita Líquida × 100%",
      interpretacao: "Acima de 15% = empresa muito lucrativa. 5–15% = razoável. Abaixo de 5% = negócio de margens finas (risco alto). Negativa = prejuízo.",
      fonte: "CVM — DFP, calculado pelo RS Invest",
    },
    get: (d) => Pct(d.margem_liquida),
    highlight: (d) => d.margem_liquida === null ? null : d.margem_liquida >= 0.05 ? "verde" : "vermelho",
  },
];

const BALANCO_ROWS: RowDef[] = [
  {
    label: "Ativo Total",
    info: {
      titulo: "Ativo Total",
      descricao: "Soma de todos os bens e direitos da empresa: caixa, estoques, contas a receber, imóveis, máquinas, participações etc.",
      interpretacao: "Ativo Total crescendo = empresa em expansão ou acumulando caixa. Mas atenção: ativo inflado por ágio de aquisições pode mascarar problemas (ver goodwill).",
      fonte: "CVM — Balanço Patrimonial (DFP), código 1.01 e 1.02",
    },
    get: (d) => Bi(d.ativo_total),
  },
  {
    label: "Ativo Circulante",
    info: {
      titulo: "Ativo Circulante",
      descricao: "Bens e direitos que a empresa espera converter em caixa em até 12 meses: caixa, aplicações financeiras, estoques, contas a receber de curto prazo.",
      interpretacao: "Ativo Circulante > Passivo Circulante = empresa tem folga financeira de curto prazo (Liquidez Corrente > 1). Essencial para saúde do capital de giro.",
      fonte: "CVM — Balanço Patrimonial (DFP), código 1.01",
    },
    get: (d) => Bi(d.ativo_circulante),
  },
  {
    label: "Caixa",
    info: {
      titulo: "Caixa e Equivalentes",
      descricao: "Dinheiro disponível imediatamente: saldo bancário, aplicações com liquidez diária e títulos de curtíssimo prazo.",
      interpretacao: "Caixa alto = segurança para crises, mas pode indicar falta de oportunidades de reinvestimento. Caixa muito baixo com dívida alta = risco de solvência. Compare caixa com dívida de curto prazo.",
      fonte: "CVM — Balanço Patrimonial (DFP), código 1.01.01",
    },
    get: (d) => Bi(d.caixa),
  },
  {
    label: "Passivo Circulante",
    info: {
      titulo: "Passivo Circulante",
      descricao: "Dívidas e obrigações que vencem em até 12 meses: fornecedores, empréstimos de curto prazo, salários a pagar, impostos a recolher.",
      interpretacao: "Passivo Circulante elevado versus Ativo Circulante baixo = risco de inadimplência. Acompanhar ao longo dos anos para ver se a empresa está aumentando dívidas curtas (sinal de alerta).",
      fonte: "CVM — Balanço Patrimonial (DFP), código 2.01",
    },
    get: (d) => Bi(d.passivo_circulante),
  },
  {
    label: "Passivo NC",
    info: {
      titulo: "Passivo Não Circulante (Dívida Longa)",
      descricao: "Dívidas e obrigações com prazo superior a 12 meses: debêntures, empréstimos de longo prazo, provisões para contingências etc.",
      interpretacao: "Dívida longa bem gerenciada pode ser estratégica (expansão). Dívida longa crescendo sem expansão de receita ou lucro = alavancagem preocupante. Fique de olho no DL/EBITDA.",
      fonte: "CVM — Balanço Patrimonial (DFP), código 2.02",
    },
    get: (d) => Bi(d.passivo_nao_circulante),
  },
  {
    label: "Patrimônio Líquido",
    info: {
      titulo: "Patrimônio Líquido (PL)",
      descricao: "O valor contábil da empresa para os acionistas: o que sobra se subtrairmos todas as dívidas dos ativos totais.",
      formula: "PL = Ativo Total − Passivo Total",
      interpretacao: "PL positivo e crescente = empresa acumulando riqueza para acionistas. PL negativo = empresa com patrimônio negativo (passivo maior que ativo) — situação de insolvência técnica, mas possível em empresas muito alavancadas (ex.: Gol, Oi).",
      fonte: "CVM — Balanço Patrimonial (DFP), código 2.03",
    },
    get: (d) => Bi(d.patrimonio_liquido),
  },
  {
    label: "Dívida Líq. (est.)",
    info: {
      titulo: "Dívida Líquida (estimativa)",
      descricao: "Estimativa da dívida real da empresa: dívida financeira bruta de longo prazo menos o caixa disponível.",
      formula: "Dívida Líquida ≈ Passivo Não Circulante − Caixa",
      interpretacao: "Dívida Líquida negativa = empresa tem mais caixa do que dívidas (caixa líquido) — muito saudável. Dívida Líquida alta versus EBITDA = empresa alavancada. Atenção: esta é uma estimativa simplificada — a dívida real inclui também empréstimos de curto prazo.",
      aviso: "Estimativa simplificada usando apenas Passivo NC e Caixa. A dívida bruta real pode incluir empréstimos de curto prazo não capturados aqui. Consulte as Notas Explicativas para a dívida exata.",
      fonte: "CVM — Balanço Patrimonial (DFP), estimado pelo RS Invest",
    },
    get: (d) => Bi(d.divida_liquida_estimada),
  },
];

const INDICADORES_ROWS: RowDef[] = [
  {
    label: "ROE",
    info: {
      titulo: "ROE — Retorno sobre Patrimônio",
      descricao: "Return on Equity. Mede quanto de lucro a empresa gera para cada R$1 do capital dos acionistas (Patrimônio Líquido).",
      formula: "ROE = Lucro Líquido ÷ Patrimônio Líquido × 100%",
      interpretacao: "ROE > 20% = empresa muito eficiente (WEGE3, RENT3, ITUB4 têm ROE alto). ROE 10–20% = bom. ROE 5–10% = mediano. < 5% = capital mal empregado. Cuidado: ROE alto com PL negativo é enganoso (a fórmula não faz sentido com denominador negativo).",
      fonte: "CVM — DFP, calculado pelo RS Invest com dados da empresa",
    },
    get: (d) => Pct(d.roe),
    highlight: (d) => d.roe === null ? null : d.roe >= 0.10 ? "verde" : "vermelho",
  },
  {
    label: "Liquidez Corrente",
    info: {
      titulo: "Liquidez Corrente",
      descricao: "Capacidade da empresa de pagar suas dívidas de curto prazo (até 12 meses) usando seus ativos circulantes.",
      formula: "Liquidez Corrente = Ativo Circulante ÷ Passivo Circulante",
      interpretacao: "LC > 2,0 = empresa com excelente folga de curto prazo. LC 1,5–2,0 = confortável. LC 1,0–1,5 = ok, mas limite. LC < 1,0 = passivo supera ativo circulante (risco de calote de curto prazo). Setores com ciclo de caixa positivo (varejo de alimentação) podem operar com LC < 1 normalmente.",
      fonte: "CVM — Balanço Patrimonial (DFP), calculado pelo RS Invest",
    },
    get: (d) => Fx(d.liquidez_corrente),
    highlight: (d) => d.liquidez_corrente === null ? null : d.liquidez_corrente >= 1 ? "verde" : "vermelho",
  },
  {
    label: "DL / EBITDA",
    info: {
      titulo: "DL/EBITDA — Alavancagem Financeira",
      descricao: "Indica em quantos anos de geração de caixa operacional (EBITDA) a empresa conseguiria quitar toda sua dívida líquida. É o principal indicador de risco de alavancagem.",
      formula: "DL/EBITDA = Dívida Líquida ÷ EBITDA",
      interpretacao: "< 1x = caixa líquido ou dívida muito baixa — empresa excelente. 1–2x = confortável. 2–3x = aceitável para setores estáveis. 3–4x = atenção. > 4x = alavancagem elevada, risco de refinanciamento. Bancos, elétricas e saneamento naturalmente operam com DL/EBITDA alto (concessões de longo prazo).",
      aviso: "Valores mostrados em módulo (valor absoluto). DL/EBITDA negativo = empresa com caixa líquido (mais caixa do que dívida) — situação ótima.",
      fonte: "CVM — DFP, calculado pelo RS Invest com estimativa de DL e EBITDA",
    },
    get: (d) => d.dl_ebitda !== null ? `${Math.abs(d.dl_ebitda).toFixed(1)}x` : "—",
    highlight: (d) => d.dl_ebitda === null ? null : Math.abs(d.dl_ebitda) <= 3 ? "verde" : "vermelho",
  },
];

function TableView({
  anos,
  rows,
}: {
  anos: DemonstrativoAnual[];
  rows: RowDef[];
}) {
  const sorted = [...anos].sort((a, b) => b.ano - a.ano).slice(0, 6);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[12px] min-w-[500px]">
        <thead>
          <tr>
            <th className="text-left pb-2 font-medium text-[var(--text-secondary)] w-40">
              Indicador
            </th>
            {sorted.map((d) => (
              <th key={d.ano} className="text-right pb-2 font-semibold px-2">
                {d.ano}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className="border-t border-[var(--border)]/50 group hover:bg-[var(--border)]/10 transition-colors">
              <td className="py-1.5 text-[var(--text-secondary)]">
                <span className="flex items-center gap-1">
                  {row.label}
                  <InfoBtn info={row.info} />
                </span>
              </td>
              {sorted.map((d) => {
                const sinal = row.highlight?.(d) ?? null;
                return (
                  <td
                    key={d.ano}
                    className="py-1.5 text-right font-mono px-2"
                    style={{
                      color:
                        sinal === "verde" ? "#10b981"
                        : sinal === "vermelho" ? "#ef4444"
                        : "var(--text-primary)",
                    }}
                  >
                    {row.get(d)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const INFO_CAGR: Record<string, InfoContent> = {
  receita: {
    titulo: "CAGR Receita — Taxa de Crescimento Anual Composta",
    descricao: "Compound Annual Growth Rate da Receita Líquida. Mede a velocidade média de crescimento da receita por ano no período histórico disponível.",
    formula: "CAGR = (Receita Atual / Receita Inicial)^(1/anos) − 1",
    interpretacao: "CAGR > 15% = crescimento acelerado. 8–15% = crescimento forte. 3–8% = crescimento moderado. 0–3% = estagnação. Negativo = empresa encolhendo.",
    fonte: "CVM — DFP, calculado pelo RS Invest sobre os dados históricos disponíveis",
  },
  lucro: {
    titulo: "CAGR Lucro — Crescimento do Lucro",
    descricao: "Taxa de crescimento anual composta do Lucro Líquido. Crescimento de lucro sustentável superior ao de receita indica ganho de margem.",
    interpretacao: "CAGR Lucro > CAGR Receita = empresa ganhando margem ao longo do tempo (excelente). CAGR Lucro < CAGR Receita = margens sendo pressionadas. CAGR Lucro negativo = lucros encolhendo.",
    fonte: "CVM — DFP, calculado pelo RS Invest",
  },
  pl: {
    titulo: "CAGR PL — Crescimento do Patrimônio",
    descricao: "Taxa de crescimento anual composta do Patrimônio Líquido. Indica a velocidade de acumulação de riqueza contábil para os acionistas.",
    interpretacao: "PL crescendo > 10% a.a. = empresa acumulando valor. PL estável = empresa distribui tudo via dividendos ou buyback. PL caindo = empresa com prejuízo ou pagando dividendos além do lucro.",
    fonte: "CVM — DFP, calculado pelo RS Invest",
  },
};

const INFO_SINAL: InfoContent = {
  titulo: "Comparativo vs Média Histórica",
  descricao: "Compara o valor atual de cada indicador com a média histórica da própria empresa (todos os anos disponíveis no DFP). Verde = melhor que a própria média. Vermelho = pior que a própria média.",
  interpretacao: "Este comparativo é relativo à história da própria empresa, não ao setor. Uma margem de 8% pode ser verde (melhor que a média da empresa) mas ainda ser baixa para o setor. Use em conjunto com a análise da IA para contexto setorial.",
  fonte: "Calculado pelo RS Invest com dados CVM DFP",
};

export function FundamentosRS({ fundamentos }: Props) {
  const [tab, setTab] = useState<TabKey>("dre");

  const cagrs = [
    { label: "CAGR Receita", val: fundamentos.cagr_receita, infoKey: "receita" },
    { label: "CAGR Lucro",   val: fundamentos.cagr_lucro,   infoKey: "lucro" },
    { label: "CAGR PL",      val: fundamentos.cagr_pl,      infoKey: "pl" },
  ].filter((c) => c.val !== null);

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <h3 className="text-sm font-semibold text-[var(--text-secondary)]">
          Demonstrativos Históricos
          <span className="text-[11px] opacity-60 ml-1">· Fonte: CVM DFP</span>
        </h3>

        {/* CAGRs */}
        {cagrs.length > 0 && (
          <div className="flex flex-wrap gap-3">
            {cagrs.map((c) => (
              <span key={c.label} className="text-[11px] text-[var(--text-secondary)] flex items-center gap-1">
                {c.label}:
                <span
                  className="font-semibold"
                  style={{ color: (c.val ?? 0) >= 0 ? "#10b981" : "#ef4444" }}
                >
                  {c.val !== null ? `${(c.val * 100) >= 0 ? "+" : ""}${(c.val * 100).toFixed(1)}%/a` : "—"}
                </span>
                <InfoBtn info={INFO_CAGR[c.infoKey]} />
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-[var(--border)]">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`pb-2 px-3 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === t.key
                ? "border-emerald-500 text-emerald-500"
                : "border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "dre"         && <TableView anos={fundamentos.historico} rows={DRE_ROWS} />}
      {tab === "balanco"     && <TableView anos={fundamentos.historico} rows={BALANCO_ROWS} />}
      {tab === "indicadores" && <TableView anos={fundamentos.historico} rows={INDICADORES_ROWS} />}

      {/* Sinais */}
      {tab === "indicadores" && Object.keys(fundamentos.sinais).length > 0 && (
        <div className="mt-4 pt-4 border-t border-[var(--border)]">
          <p className="text-[11px] font-semibold text-[var(--text-secondary)] mb-2 uppercase tracking-wide flex items-center gap-1">
            Comparativo vs Média Histórica
            <InfoBtn info={INFO_SINAL} />
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {Object.entries(fundamentos.sinais).map(([key, s]) => (
              <div
                key={key}
                className="rounded-lg border border-[var(--border)] p-2 text-[11px]"
              >
                <span className="text-[var(--text-secondary)] block capitalize">
                  {key.replace(/_/g, " ")}
                </span>
                <div className="flex items-center justify-between mt-0.5">
                  <span className="font-semibold font-mono">
                    {s.valor !== null ? (s.valor * 100).toFixed(1) + "%" : "—"}
                  </span>
                  <span
                    className="px-1.5 rounded-full text-[10px] font-semibold"
                    style={{
                      background:
                        s.sinal === "verde" ? "#10b98122"
                        : s.sinal === "vermelho" ? "#ef444422"
                        : "#f59e0b22",
                      color:
                        s.sinal === "verde" ? "#10b981"
                        : s.sinal === "vermelho" ? "#ef4444"
                        : "#f59e0b",
                    }}
                  >
                    {s.sinal}
                  </span>
                </div>
                {s.media_historica !== null && (
                  <p className="text-[10px] text-[var(--text-secondary)] opacity-60 mt-0.5">
                    média: {(s.media_historica * 100).toFixed(1)}%
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
