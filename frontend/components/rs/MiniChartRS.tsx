"use client";

import type { RSHistoricoPonto } from "@/types";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface Props {
  historico: RSHistoricoPonto[];
  ticker: string;
}

export function MiniChartRS({ historico, ticker }: Props) {
  if (!historico.length) return null;

  const data = historico.map((p) => ({
    data: new Date(p.data).toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }),
    fechamento: p.fechamento,
  }));

  const precos = data.map((d) => d.fechamento);
  const mn = Math.min(...precos);
  const mx = Math.max(...precos);
  const pad = (mx - mn) * 0.08;

  const primero = precos[0];
  const ultimo = precos[precos.length - 1];
  const subindo = ultimo >= primero;
  const cor = subindo ? "#10b981" : "#ef4444";

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-[var(--text-secondary)]">
          Histórico 12 meses — {ticker}
        </h3>
        <span
          className="text-xs font-semibold px-2 py-0.5 rounded-full"
          style={{ background: cor + "22", color: cor }}
        >
          {primero > 0 ? `${(((ultimo - primero) / primero) * 100) >= 0 ? "+" : ""}${(((ultimo - primero) / primero) * 100).toFixed(1)}%` : "—"}
        </span>
      </div>

      <div className="h-44">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 4 }}>
            <defs>
              <linearGradient id="rsGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={cor} stopOpacity={0.3} />
                <stop offset="100%" stopColor={cor} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="data"
              tick={{ fill: "var(--text-secondary)", fontSize: 10 }}
              tickLine={false} axisLine={false}
              interval={Math.ceil(data.length / 5)}
            />
            <YAxis
              domain={[mn - pad, mx + pad]}
              tick={{ fill: "var(--text-secondary)", fontSize: 10 }}
              tickLine={false} axisLine={false}
              tickFormatter={(v: number) => `R$${v.toFixed(0)}`}
              width={56}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "var(--bg-card)",
                border: "1px solid var(--border)",
                borderRadius: "10px",
                fontSize: 12,
              }}
              labelStyle={{ color: "var(--text-secondary)", marginBottom: 4 }}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={(value: any) => [
                `R$ ${Number(value).toFixed(2)}`,
                "Fechamento",
              ]}
            />
            <Area
              type="monotone"
              dataKey="fechamento"
              stroke={cor}
              strokeWidth={2}
              fill="url(#rsGrad)"
              dot={false}
              activeDot={{ r: 4, fill: cor }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
