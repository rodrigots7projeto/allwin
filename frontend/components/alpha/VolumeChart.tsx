"use client";

import type { AlphaDailyPoint } from "@/types";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface Props {
  series: AlphaDailyPoint[];
  volumeMedio: number;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

function fmtVol(v: number) {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
  return String(v);
}

export function VolumeChart({ series, volumeMedio }: Props) {
  if (!series.length) return null;

  const data = series.map((p) => ({
    data: fmtDate(p.data),
    volume: p.volume,
    acima: p.volume > volumeMedio,
  }));

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-[var(--text-secondary)]">
          Volume diário
        </h3>
        <span className="text-xs text-[var(--text-secondary)]">
          Média 20d: <span className="text-amber-400 font-semibold">{fmtVol(volumeMedio)}</span>
        </span>
      </div>

      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 4 }} barCategoryGap="15%">
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="data"
              tick={{ fill: "var(--text-secondary)", fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              interval={Math.ceil(data.length / 7)}
            />
            <YAxis
              tick={{ fill: "var(--text-secondary)", fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={fmtVol}
              width={45}
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
                new Intl.NumberFormat("en-US").format(Number(value)),
                "Volume",
              ]}
            />
            <ReferenceLine
              y={volumeMedio}
              stroke="#f59e0b"
              strokeDasharray="4 4"
              strokeWidth={1.5}
              label={{ value: "Média", fill: "#f59e0b", fontSize: 10, position: "insideTopRight" }}
            />
            <Bar
              dataKey="volume"
              radius={[2, 2, 0, 0]}
              fill="#10b981"
              opacity={0.7}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
