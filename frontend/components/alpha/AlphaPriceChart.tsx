"use client";

import type { AlphaDailyPoint } from "@/types";
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
  series: AlphaDailyPoint[];
  symbol: string;
  sma7: number;
  sma21: number;
}

const R = (v: number) =>
  `R$ ${new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v)}`;

export function AlphaPriceChart({ series, symbol, sma7, sma21 }: Props) {
  if (!series.length) return null;

  const data = series.map((p) => ({
    data: new Date(p.data).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }),
    fechamento:  p.fechamento_ajustado,
    sma7:  p.sma7  ?? undefined,
    sma21: p.sma21 ?? undefined,
    sma50: p.sma50 ?? undefined,
  }));

  const allVals = [
    ...series.map((p) => p.fechamento_ajustado),
    ...series.map((p) => p.sma7).filter((v): v is number => v !== null),
    ...series.map((p) => p.sma21).filter((v): v is number => v !== null),
    ...series.map((p) => p.sma50).filter((v): v is number => v !== null),
  ];
  const mn = Math.min(...allVals);
  const mx = Math.max(...allVals);
  const pad = (mx - mn) * 0.05;

  const hasSma50 = series.some((p) => p.sma50 !== null);

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <h3 className="text-sm font-semibold text-[var(--text-secondary)]">
          Preço ajustado · {symbol}
          <span className="text-xs ml-1 opacity-60">(últimos 90 dias · BRL)</span>
        </h3>
        <div className="flex flex-wrap gap-3 text-[11px] text-[var(--text-secondary)]">
          <span className="flex items-center gap-1">
            <span className="inline-block w-4 h-0.5 bg-emerald-500" />Fechamento
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-4 border-t-2 border-dashed border-blue-400" />SMA7
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-4 border-t-2 border-dashed border-amber-400" />SMA21
          </span>
          {hasSma50 && (
            <span className="flex items-center gap-1">
              <span className="inline-block w-4 border-t-2 border-dashed border-purple-400" />SMA50
            </span>
          )}
        </div>
      </div>

      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis
              dataKey="data"
              tick={{ fill: "var(--text-secondary)", fontSize: 10 }}
              tickLine={false} axisLine={false}
              interval={Math.ceil(data.length / 7)}
            />
            <YAxis
              domain={[mn - pad, mx + pad]}
              tick={{ fill: "var(--text-secondary)", fontSize: 10 }}
              tickLine={false} axisLine={false}
              tickFormatter={(v: number) => `R$${v.toFixed(0)}`}
              width={62}
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
              formatter={(value: any, name: any) => [
                R(Number(value)),
                name === "fechamento" ? "Fechamento Adj."
                  : name === "sma7"  ? "SMA 7"
                  : name === "sma21" ? "SMA 21"
                  : "SMA 50",
              ]}
            />
            {hasSma50 && (
              <Line type="monotone" dataKey="sma50" stroke="#a78bfa"
                strokeWidth={1.5} strokeDasharray="4 4" dot={false} connectNulls />
            )}
            <Line type="monotone" dataKey="sma21" stroke="#f59e0b"
              strokeWidth={1.5} strokeDasharray="4 4" dot={false} connectNulls />
            <Line type="monotone" dataKey="sma7" stroke="#60a5fa"
              strokeWidth={1.5} strokeDasharray="4 4" dot={false} connectNulls />
            <Line type="monotone" dataKey="fechamento" stroke="#10b981"
              strokeWidth={2} dot={false} activeDot={{ r: 4, fill: "#10b981" }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="flex flex-wrap gap-4 mt-3 pt-3 border-t border-[var(--border)] text-xs text-[var(--text-secondary)]">
        <span>SMA7: <span className="text-blue-400 font-semibold">{R(sma7)}</span></span>
        <span>SMA21: <span className="text-amber-400 font-semibold">{R(sma21)}</span></span>
        <span className="ml-auto">{series.length} pregões</span>
      </div>
    </div>
  );
}
