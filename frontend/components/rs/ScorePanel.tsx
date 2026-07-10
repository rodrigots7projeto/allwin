"use client";

import type { RSScore } from "@/types";
import { InfoBtn, type InfoContent } from "./InfoModal";

interface Props {
  score: RSScore;
}

const INFO_CATEGORIAS: Record<string, InfoContent> = {
  lucros: {
    titulo: "Qualidade dos Lucros (0–150 pts)",
    descricao: "Avalia se a empresa gera lucro real, consistente e crescente ao longo dos anos. Considera margem líquida, regularidade dos lucros e tendência de crescimento do resultado líquido.",
    interpretacao: "Pontuação alta: margem líquida > 10% e lucros positivos nos últimos anos. Pontuação zero: empresa com prejuízo recorrente. Lucros que crescem consistentemente recebem bônus adicional.",
    fonte: "CVM — Demonstrações Financeiras Padronizadas (DFP)",
  },
  crescimento: {
    titulo: "Crescimento (0–150 pts)",
    descricao: "Velocidade de expansão da empresa, medida pelo CAGR (taxa de crescimento anual composta) de receita e lucro líquido nos últimos anos disponíveis.",
    formula: "CAGR = (Valor Final / Valor Inicial)^(1/anos) − 1",
    interpretacao: "CAGR > 10% a.a. = crescimento forte (pontuação alta). CAGR 5–10% = crescimento moderado. CAGR 0–5% = estagnada. CAGR negativo = empresa encolhendo = zero pontos nesta categoria.",
    fonte: "CVM — Demonstrações Financeiras Padronizadas (DFP)",
  },
  saude: {
    titulo: "Saúde Financeira (0–150 pts)",
    descricao: "Capacidade da empresa de honrar suas dívidas e sobreviver a momentos de crise. Considera Liquidez Corrente (Ativo Circulante ÷ Passivo Circulante) e o índice DL/EBITDA (Dívida Líquida sobre EBITDA).",
    interpretacao: "Liquidez Corrente > 1,5 = empresa com folga para pagar dívidas de curto prazo. DL/EBITDA < 2x = endividamento confortável. DL/EBITDA > 4x = empresa muito alavancada = risco elevado.",
    fonte: "CVM — Demonstrações Financeiras Padronizadas (DFP)",
  },
  valuation_pts: {
    titulo: "Valuation (0–150 pts)",
    descricao: "Compara o P/L atual da ação com a média histórica de P/L da própria empresa. Quanto mais barata a ação em relação ao seu próprio histórico, maior a pontuação.",
    interpretacao: "P/L atual bem abaixo da média histórica = ação barata = pontuação alta. P/L muito acima da média histórica = ação esticada = pontuação baixa. Não use sozinho: compare sempre com qualidade de lucros e crescimento.",
    fonte: "Cotação Brapi + histórico de P/L calculado pelo RS Invest",
  },
  dividendos: {
    titulo: "Dividendos (0–100 pts)",
    descricao: "Dividend Yield atual da ação — quanto a empresa distribui em dividendos em relação ao preço da ação.",
    formula: "Dividend Yield = Dividendos Anuais por Ação ÷ Preço Atual × 100%",
    interpretacao: "DY > 8% = excelente pagadora. DY 5–8% = boa. DY 3–5% = razoável. DY < 3% = foco em crescimento, não em renda. DY = 0 = empresa reinveste tudo ou está com dificuldades.",
    fonte: "Brapi (dados B3)",
  },
  governanca: {
    titulo: "Governança Corporativa (0–100 pts)",
    descricao: "Nível de governança no qual a empresa está listada na B3. Empresas com melhor governança oferecem mais proteção ao acionista minoritário — auditorias independentes, tag along de 100%, conselho independente.",
    interpretacao: "Novo Mercado = 100 pts (melhor proteção). Nível 2 = 80 pts. Nível 1 = 60 pts. Bovespa Mais = 40 pts. Mercado Básico/Tradicional = 20 pts. Prefira sempre Novo Mercado ou Nível 2.",
    fonte: "B3 — cadastro de empresas listadas",
  },
  momentum: {
    titulo: "Momentum de Preço (0–100 pts)",
    descricao: "Força da tendência recente da ação, calculado pela posição do preço atual dentro da faixa de 52 semanas (mínima–máxima do último ano).",
    formula: "Momentum = (Preço − Mín 52S) ÷ (Máx 52S − Mín 52S)",
    interpretacao: "Próximo de 100% da faixa = preço perto do topo anual = momentum forte. Próximo de 0% = preço perto do fundo anual = momentum fraco (mas pode ser oportunidade de compra se os fundamentos forem sólidos!).",
    fonte: "Brapi (dados B3)",
  },
  eficiencia: {
    titulo: "Eficiência — ROE (0–100 pts)",
    descricao: "Retorno sobre Patrimônio Líquido (Return on Equity). Mede o quanto de lucro a empresa gera para cada R$1 investido pelos acionistas.",
    formula: "ROE = Lucro Líquido ÷ Patrimônio Líquido × 100%",
    interpretacao: "ROE > 20% = empresa muito eficiente (Magalu, TOTVS, Itaú têm ROE alto). ROE 10–20% = bom. ROE 5–10% = mediano. ROE < 5% = capital sendo desperdiçado. ROE negativo = prejuízo.",
    fonte: "CVM — Demonstrações Financeiras Padronizadas (DFP)",
  },
};

const INFO_SCORE_TOTAL: InfoContent = {
  titulo: "Score RS Invest (0–1.000)",
  descricao: "Nota geral calculada pelo RS Invest combinando 8 categorias fundamentalistas. Cada categoria tem um peso máximo definido (Lucros, Crescimento e Saúde valem até 150 pts cada; as demais valem até 100 pts).",
  interpretacao: "≥ 800 = EXCELENTE: empresa de alta qualidade, compra com confiança. 650–799 = MUITO BOM: empresa sólida, boa para carteira. 500–649 = BOM: razoável, monitore de perto. 350–499 = REGULAR: atenção aos riscos. < 350 = FRACO: evite ou faça análise aprofundada antes de comprar.",
  fonte: "Calculado pelo RS Invest com dados CVM + B3 + Brapi",
};

const CATEGORIAS = [
  { key: "lucros",        label: "Qualidade Lucros", max: 150, cor: "#10b981" },
  { key: "crescimento",   label: "Crescimento",      max: 150, cor: "#3b82f6" },
  { key: "saude",         label: "Saúde Financeira", max: 150, cor: "#8b5cf6" },
  { key: "valuation_pts", label: "Valuation",        max: 150, cor: "#f59e0b" },
  { key: "dividendos",    label: "Dividendos",       max: 100, cor: "#ec4899" },
  { key: "governanca",    label: "Governança",       max: 100, cor: "#06b6d4" },
  { key: "momentum",      label: "Momentum",         max: 100, cor: "#f97316" },
  { key: "eficiencia",    label: "Eficiência",       max: 100, cor: "#84cc16" },
] as const;

function ScoreGauge({ score }: { score: number }) {
  const pct = Math.max(0, Math.min(100, (score / 1000) * 100));
  const r = 70;
  const cx = 90;
  const cy = 90;
  const C = 2 * Math.PI * r;
  const half = C / 2;
  const fill = (pct / 100) * half;
  const empty = C - fill;

  const color =
    score >= 800 ? "#10b981"
    : score >= 650 ? "#3b82f6"
    : score >= 500 ? "#f59e0b"
    : score >= 350 ? "#f97316"
    : "#ef4444";

  const nota = score >= 800 ? "Excelente"
    : score >= 650 ? "Muito Bom"
    : score >= 500 ? "Bom"
    : score >= 350 ? "Regular"
    : "Fraco";

  return (
    <div className="flex flex-col items-center gap-2">
      <svg width={180} height={105} viewBox="0 0 180 105">
        {/* Trilha */}
        <circle
          cx={cx} cy={cy} r={r}
          fill="none"
          stroke="var(--border)"
          strokeWidth={14}
          strokeDasharray={`${half} ${C - half}`}
          strokeDashoffset={C * 0.25}
          strokeLinecap="round"
        />
        {/* Preenchimento */}
        <circle
          cx={cx} cy={cy} r={r}
          fill="none"
          stroke={color}
          strokeWidth={14}
          strokeDasharray={`${fill} ${empty}`}
          strokeDashoffset={C * 0.25}
          strokeLinecap="round"
          style={{ transition: "stroke-dasharray 0.8s ease" }}
        />
        <text x={cx} y={cy - 6} textAnchor="middle" fontSize={28} fontWeight={700}
          fill={color} fontFamily="inherit">
          {score}
        </text>
        <text x={cx} y={cy + 14} textAnchor="middle" fontSize={11}
          fill="var(--text-secondary)" fontFamily="inherit">
          de 1000
        </text>
      </svg>
      <span
        className="text-sm font-bold px-3 py-1 rounded-full"
        style={{ background: color + "22", color }}
      >
        {nota}
      </span>
    </div>
  );
}

function BarCategoria({
  label, valor, max, cor, infoKey,
}: {
  label: string; valor: number; max: number; cor: string; infoKey: string;
}) {
  const pct = Math.max(0, Math.min(100, (valor / max) * 100));
  return (
    <div className="flex items-center gap-2">
      <span className="w-32 text-[11px] text-[var(--text-secondary)] shrink-0 text-right flex items-center justify-end gap-1">
        {label}
        <InfoBtn info={INFO_CATEGORIAS[infoKey]} />
      </span>
      <div className="flex-1 h-2 rounded-full bg-[var(--border)] overflow-hidden">
        <div
          className="h-2 rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, background: cor }}
        />
      </div>
      <span className="w-12 text-[11px] font-mono text-right" style={{ color: cor }}>
        {valor}/{max}
      </span>
    </div>
  );
}

export function ScorePanel({ score }: Props) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--text-secondary)]">
            Score RS Invest
          </h2>
          <InfoBtn info={INFO_SCORE_TOTAL} />
        </div>
        <span className="text-[11px] text-[var(--text-secondary)] opacity-60">0 – 1000</span>
      </div>

      <div className="flex flex-col lg:flex-row items-center gap-6">
        {/* Gauge */}
        <div className="shrink-0">
          <ScoreGauge score={score.score_total} />
        </div>

        {/* Barras por categoria */}
        <div className="flex-1 w-full space-y-2">
          {CATEGORIAS.map((cat) => (
            <BarCategoria
              key={cat.key}
              label={cat.label}
              valor={score[cat.key] as number}
              max={cat.max}
              cor={cat.cor}
              infoKey={cat.key}
            />
          ))}
        </div>
      </div>

      {/* Pontos fortes / fracos */}
      {(score.pontos_fortes.length > 0 || score.pontos_fracos.length > 0) && (
        <div className="mt-4 pt-4 border-t border-[var(--border)] grid grid-cols-1 sm:grid-cols-2 gap-3">
          {score.pontos_fortes.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold text-emerald-500 mb-1.5">
                Pontos Fortes
              </p>
              <ul className="space-y-1">
                {score.pontos_fortes.map((p, i) => (
                  <li key={i} className="text-[11px] text-[var(--text-secondary)] flex gap-1.5">
                    <span className="text-emerald-500 shrink-0">+</span>{p}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {score.pontos_fracos.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold text-red-400 mb-1.5">
                Pontos de Atenção
              </p>
              <ul className="space-y-1">
                {score.pontos_fracos.map((p, i) => (
                  <li key={i} className="text-[11px] text-[var(--text-secondary)] flex gap-1.5">
                    <span className="text-red-400 shrink-0">!</span>{p}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
