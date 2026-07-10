"use client";

import type { ResumoSimulacao } from "@/types";
import { InfoBtn } from "@/components/rs/InfoModal";

interface Props {
  resumo: ResumoSimulacao;
}

const R = (v: number) =>
  `R$ ${new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v)}`;

const Pct = (v: number) =>
  `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;

const Bi = (v: number) => {
  if (Math.abs(v) >= 1e9) return `R$ ${(v / 1e9).toFixed(2)}B`;
  if (Math.abs(v) >= 1e6) return `R$ ${(v / 1e6).toFixed(2)}M`;
  if (Math.abs(v) >= 1e3) return `R$ ${(v / 1e3).toFixed(1)}K`;
  return R(v);
};

function MetricCard({
  label, value, sub, cor, info,
}: {
  label: string;
  value: string;
  sub?: string;
  cor?: string;
  info?: string;
}) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-3.5">
      <p className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wide mb-1 flex items-center gap-1">
        {label}
        {info && (
          <InfoBtn info={{ titulo: label, descricao: info, fonte: "Calculado pelo RS Invest" }} />
        )}
      </p>
      <p className="text-base font-bold font-mono" style={{ color: cor ?? "var(--text-primary)" }}>
        {value}
      </p>
      {sub && <p className="text-[10px] text-[var(--text-secondary)] mt-0.5">{sub}</p>}
    </div>
  );
}

function Divider({ label }: { label: string }) {
  return (
    <div className="col-span-full mt-1">
      <p className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest opacity-60">
        {label}
      </p>
    </div>
  );
}

export function ResumoCard({ resumo }: Props) {
  const isLucro = resumo.resultado_final >= 0;
  const corFinal = isLucro ? "#10b981" : "#ef4444";
  const corRent = resumo.rentabilidade_pct >= 0 ? "#10b981" : "#ef4444";

  const fmt_data = (d: string) =>
    new Date(d + "T00:00:00").toLocaleDateString("pt-BR");

  return (
    <div className="space-y-4">
      {/* Destaque principal */}
      <div
        className="rounded-2xl border p-5"
        style={{ borderColor: corFinal + "44", background: corFinal + "08" }}
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-[11px] text-[var(--text-secondary)] uppercase tracking-wide mb-1">
              Resultado Final (após IR estimado)
            </p>
            <p className="text-3xl font-bold font-mono" style={{ color: corFinal }}>
              {R(resumo.resultado_final)}
            </p>
            <p className="text-sm text-[var(--text-secondary)] mt-1">
              {resumo.empresa} · {resumo.quantidade.toLocaleString("pt-BR")} ações ·{" "}
              {resumo.periodo_anos.toFixed(1)} anos
            </p>
          </div>
          <div className="text-right">
            <p className="text-[11px] text-[var(--text-secondary)] uppercase tracking-wide mb-1">
              Rentabilidade total
            </p>
            <p className="text-2xl font-bold" style={{ color: corRent }}>
              {Pct(resumo.rentabilidade_pct)}
            </p>
            <p className="text-sm" style={{ color: corRent }}>
              {Pct(resumo.rentabilidade_anual_pct)} ao ano
            </p>
          </div>
        </div>
      </div>

      {/* Grid de métricas */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">

        <Divider label="Compra" />
        <MetricCard
          label="Preço de Compra"
          value={R(resumo.preco_compra)}
          sub={`Data: ${fmt_data(resumo.data_compra)}`}
          info="Preço médio informado para a compra das ações."
        />
        <MetricCard
          label="Quantidade"
          value={resumo.quantidade.toLocaleString("pt-BR")}
          sub="ações"
        />
        <MetricCard
          label="Valor Investido"
          value={R(resumo.valor_investido)}
          sub={resumo.corretagem > 0 ? `+ R$ ${resumo.corretagem.toFixed(2)} corretagem` : undefined}
          info="Quantidade × Preço de Compra + Corretagem. É o seu custo total de aquisição (base de cálculo para IR)."
        />
        <MetricCard
          label="Corretagem"
          value={resumo.corretagem > 0 ? R(resumo.corretagem) : "R$ 0,00"}
          sub="custo operacional"
          info="Taxa cobrada pela corretora para executar a ordem de compra. É deduzível do lucro para fins de IR."
        />

        <Divider label="Saída" />
        <MetricCard
          label={resumo.posicao_aberta ? "Preço Atual" : "Preço de Venda"}
          value={R(resumo.preco_saida)}
          sub={resumo.posicao_aberta ? "Posição em aberto" : `Data: ${fmt_data(resumo.data_saida)}`}
          cor={resumo.preco_saida >= resumo.preco_compra ? "#10b981" : "#ef4444"}
          info={resumo.posicao_aberta
            ? "Preço atual da ação em mercado (cotação Brapi)."
            : "Preço de venda informado ou cotação do mês de saída no histórico."
          }
        />
        <MetricCard
          label="Valor Bruto"
          value={R(resumo.valor_bruto)}
          sub="Quantidade × Preço saída"
          info="Valor total recebido com a venda, antes de impostos e custos."
        />
        <MetricCard
          label="Lucro de Capital"
          value={R(resumo.lucro_acao)}
          cor={resumo.lucro_acao >= 0 ? "#10b981" : "#ef4444"}
          sub="Ganho de capital (tributável)"
          info="Valor Bruto − Custo Base (sem corretagem). Este é o ganho de capital sujeito ao IR de 15% (swing trade)."
        />

        {(resumo.dividendos_recebidos > 0 || resumo.jcp_recebido > 0) && (
          <>
            <Divider label="Proventos" />
            <MetricCard
              label="Dividendos"
              value={R(resumo.dividendos_recebidos)}
              cor="#10b981"
              sub="isentos de IR"
              info="Dividendos recebidos durante o período. No Brasil, dividendos de ações são isentos de IR para pessoa física (Lei nº 9.249/95)."
            />
            <MetricCard
              label="JCP"
              value={R(resumo.jcp_recebido)}
              cor="#10b981"
              sub="15% IR na fonte"
              info="Juros sobre Capital Próprio. Tributado a 15% na fonte — o valor informado deve ser já o líquido recebido."
            />
            <MetricCard
              label="Yield Total"
              value={`${resumo.yield_total_pct.toFixed(2)}%`}
              cor="#10b981"
              sub="sobre valor investido"
              info="Total de proventos (dividendos + JCP) como % do valor investido no período. Não anualizado."
            />
          </>
        )}

        <Divider label="Resultado" />
        <MetricCard
          label="Lucro Total"
          value={R(resumo.lucro_total)}
          cor={resumo.lucro_total >= 0 ? "#10b981" : "#ef4444"}
          sub="Ganho capital + proventos"
          info="Lucro de capital + dividendos + JCP. Total gerado pelo investimento antes do IR."
        />
        <MetricCard
          label="IR Estimado (15%)"
          value={R(resumo.imposto_estimado)}
          cor="#f59e0b"
          sub="swing trade — consulte contador"
          info="Estimativa de IR: 15% sobre o lucro de capital (swing trade). Atenção: isenção para vendas até R$20.000/mês para PF. Este cálculo não considera isenção nem day trade (20%). Consulte seu contador."
        />
        <MetricCard
          label="Resultado Final"
          value={Bi(resumo.resultado_final)}
          cor={corFinal}
          sub="após IR + corretagem"
          info="Lucro Total − IR Estimado − Corretagem. Representa o ganho líquido real da operação."
        />
        <MetricCard
          label="CAGR (ao ano)"
          value={Pct(resumo.rentabilidade_anual_pct)}
          cor={resumo.rentabilidade_anual_pct >= 0 ? "#10b981" : "#ef4444"}
          sub={`${resumo.periodo_dias} dias · ${resumo.periodo_anos.toFixed(1)} anos`}
          info="Compound Annual Growth Rate — taxa de crescimento anual composta. Compara a rentabilidade de operações com períodos diferentes numa base anualizada."
        />
      </div>
    </div>
  );
}
