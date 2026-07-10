"use client";

import { useState } from "react";
import {
  AreaChart, Area, Line, BarChart, Bar, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine,
} from "recharts";
import type { SimuladorData } from "@/types";

interface Props {
  dados: SimuladorData;
}

type ChartTab = "patrimonio" | "preco" | "lucro";

const TABS: { key: ChartTab; label: string }[] = [
  { key: "patrimonio", label: "Evolução do Patrimônio" },
  { key: "preco",      label: "Preço da Ação" },
  { key: "lucro",      label: "Lucro Acumulado" },
];

const R = (v: number) =>
  `R$ ${new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v)}`;

const Bi = (v: number) => {
  if (Math.abs(v) >= 1e6) return `R$ ${(v / 1e6).toFixed(1)}M`;
  if (Math.abs(v) >= 1e3) return `R$ ${(v / 1e3).toFixed(1)}K`;
  return R(v);
};

function fmtData(d: string) {
  const [y, m] = d.split("-");
  const meses = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
  return `${meses[parseInt(m) - 1]}/${y?.slice(2)}`;
}

const CustomTooltip = ({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-3 shadow-lg text-[12px] min-w-[160px]">
      <p className="text-[var(--text-secondary)] mb-2 font-semibold">{label}</p>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center justify-between gap-3">
          <span style={{ color: p.color }}>{p.name}</span>
          <span className="font-mono font-semibold">{Bi(p.value)}</span>
        </div>
      ))}
    </div>
  );
};

export function GraficosSimulador({ dados }: Props) {
  const [tab, setTab] = useState<ChartTab>("patrimonio");
  const { resumo, serie_patrimonio, serie_preco, timeline } = dados;

  const fmtPat = serie_patrimonio.map((p) => ({
    ...p,
    dataFmt: fmtData(p.data),
  }));

  const fmtPreco = serie_preco.map((p) => ({
    ...p,
    dataFmt: fmtData(p.data),
  }));

  const fmtLucro = timeline.map((p) => ({
    ...p,
    dataFmt: fmtData(p.data),
    lucro_color: p.lucro_acumulado >= 0 ? "#10b981" : "#ef4444",
  }));

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
      <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
        <h3 className="text-sm font-semibold text-[var(--text-secondary)]">Gráficos da Operação</h3>
        <div className="flex gap-1 border-b border-transparent">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`pb-1.5 px-3 text-xs font-medium transition-colors border-b-2 ${
                tab === t.key
                  ? "border-emerald-500 text-emerald-500"
                  : "border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="h-[280px] w-full">
        {tab === "patrimonio" && (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={fmtPat} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
              <defs>
                <linearGradient id="gradPat" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#10b981" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.5} />
              <XAxis dataKey="dataFmt" tick={{ fontSize: 10, fill: "var(--text-secondary)" }} tickLine={false} />
              <YAxis tickFormatter={Bi} tick={{ fontSize: 10, fill: "var(--text-secondary)" }} tickLine={false} axisLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Area
                type="monotone"
                dataKey="patrimonio"
                name="Patrimônio"
                stroke="#10b981"
                fill="url(#gradPat)"
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="investido"
                name="Investido"
                stroke="#94a3b8"
                strokeDasharray="4 2"
                strokeWidth={1.5}
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}

        {tab === "preco" && (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={fmtPreco} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
              <defs>
                <linearGradient id="gradPreco" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.5} />
              <XAxis dataKey="dataFmt" tick={{ fontSize: 10, fill: "var(--text-secondary)" }} tickLine={false} />
              <YAxis
                tickFormatter={(v) => `R$ ${v.toFixed(0)}`}
                tick={{ fontSize: 10, fill: "var(--text-secondary)" }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                formatter={(v) => [R(Number(v)), "Preço"]}
                labelStyle={{ fontSize: 11 }}
                contentStyle={{
                  background: "var(--bg-card)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />
              <ReferenceLine
                y={resumo.preco_compra}
                stroke="#f59e0b"
                strokeDasharray="4 2"
                label={{ value: "Compra", position: "right", fontSize: 10, fill: "#f59e0b" }}
              />
              <Area
                type="monotone"
                dataKey="preco"
                name="Preço"
                stroke="#3b82f6"
                fill="url(#gradPreco)"
                strokeWidth={2}
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}

        {tab === "lucro" && (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={fmtLucro} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.5} />
              <XAxis dataKey="dataFmt" tick={{ fontSize: 10, fill: "var(--text-secondary)" }} tickLine={false} />
              <YAxis tickFormatter={Bi} tick={{ fontSize: 10, fill: "var(--text-secondary)" }} tickLine={false} axisLine={false} />
              <Tooltip
                formatter={(v) => [R(Number(v)), "Lucro acumulado"]}
                labelStyle={{ fontSize: 11 }}
                contentStyle={{
                  background: "var(--bg-card)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />
              <ReferenceLine y={0} stroke="var(--text-secondary)" opacity={0.4} />
              <Bar
                dataKey="lucro_acumulado"
                name="Lucro"
                radius={[3, 3, 0, 0]}
                fill="#10b981"
                label={false}
              >
                {fmtLucro.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={entry.lucro_acumulado >= 0 ? "#10b981" : "#ef4444"}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {serie_patrimonio.length <= 2 && (
        <p className="text-[11px] text-amber-500 text-center mt-3 opacity-80">
          Poucos pontos de dados disponíveis. O plano gratuito da Brapi cobre até 1 ano de histórico. Com o token ativo, até 5 anos estão disponíveis.
        </p>
      )}
    </div>
  );
}
