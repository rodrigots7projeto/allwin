"use client";

import type { PontoHistorico } from "@/types";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface Props {
  dados: PontoHistorico[];
  ticker: string;
}

function formatarData(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", {
    month: "short",
    year: "2-digit",
  });
}

function formatarPreco(v: number) {
  return `R$ ${new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(v)}`;
}

export function PriceChart({ dados, ticker }: Props) {
  if (dados.length === 0) {
    return (
      <div className="flex items-center justify-center h-72 text-[var(--text-secondary)] text-sm">
        Histórico não disponível para {ticker}
      </div>
    );
  }

  const chartData = dados.map((p) => ({
    data: formatarData(p.data),
    preco: p.fechamento_ajustado,
  }));

  /* Calcula min/max para o domínio do eixo Y com margem de 5% */
  const precos = chartData.map((d) => d.preco);
  const minPreco = Math.min(...precos);
  const maxPreco = Math.max(...precos);
  const margem = (maxPreco - minPreco) * 0.05;
  const dominio: [number, number] = [minPreco - margem, maxPreco + margem];

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6">
      <h2 className="text-sm font-semibold text-[var(--text-secondary)] mb-4">
        Histórico de preços — {ticker}
      </h2>
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis
              dataKey="data"
              tick={{ fill: "var(--text-secondary)", fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              /* Exibe 1 em cada 6 pontos para não poluir */
              interval={Math.ceil(chartData.length / 8)}
            />
            <YAxis
              domain={dominio}
              tick={{ fill: "var(--text-secondary)", fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) =>
                `R$${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(v)}`
              }
              width={70}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "var(--bg-card)",
                border: "1px solid var(--border)",
                borderRadius: "8px",
                fontSize: 13,
              }}
              labelStyle={{ color: "var(--text-secondary)", marginBottom: 4 }}
              itemStyle={{ color: "#10b981" }}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={(value: any) => [formatarPreco(Number(value)), "Preço"]}
            />
            <Line
              type="monotone"
              dataKey="preco"
              stroke="#10b981"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: "#10b981" }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="text-xs text-[var(--text-secondary)] mt-3 text-right">
        Preço ajustado por splits e dividendos · {dados.length} pontos mensais
      </p>
    </div>
  );
}
