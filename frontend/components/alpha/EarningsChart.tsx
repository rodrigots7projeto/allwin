"use client";

import type { AlphaEarnings } from "@/types";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface Props { earnings: AlphaEarnings[]; }

function fmtBrl(v: number) {
  return `R$ ${Math.abs(v).toFixed(2)}`;
}

export function EarningsChart({ earnings }: Props) {
  if (!earnings.length) return null;

  // Mostrar em ordem cronológica (mais antigo primeiro)
  const data = [...earnings].reverse().map((e) => ({
    trimestre: e.data_fiscal.slice(0, 7),
    reportado: e.eps_reportado_brl,
    estimado:  e.eps_estimado_brl,
    bateu:     e.bateu_estimativa,
    surpresa_pct: e.surpresa_pct,
  }));

  const hasEstimate = data.some((d) => d.estimado !== null);

  // Estatísticas
  const bateCount = earnings.filter((e) => e.bateu_estimativa === true).length;
  const totalWithEst = earnings.filter((e) => e.bateu_estimativa !== null).length;

  const avgSurprise = earnings
    .filter((e) => e.surpresa_pct !== null)
    .reduce((acc, e, _, arr) => acc + (e.surpresa_pct ?? 0) / arr.length, 0);

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-semibold text-[var(--text-secondary)]">
          EPS Trimestral — Reportado vs Estimativa
        </h3>
        {totalWithEst > 0 && (
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full
            ${bateCount / totalWithEst >= 0.75 ? "bg-emerald-500/10 text-emerald-500"
              : "bg-amber-500/10 text-amber-400"}`}>
            Bateu: {bateCount}/{totalWithEst}
          </span>
        )}
      </div>

      {totalWithEst > 0 && (
        <p className="text-[11px] text-[var(--text-secondary)] mb-3">
          Surpresa média: <span className={avgSurprise > 0 ? "text-emerald-500 font-semibold" : "text-red-500 font-semibold"}>
            {avgSurprise >= 0 ? "+" : ""}{avgSurprise.toFixed(1)}%
          </span>
        </p>
      )}

      <div className="h-52">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 4 }} barCategoryGap="20%">
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="trimestre"
              tick={{ fill: "var(--text-secondary)", fontSize: 10 }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tick={{ fill: "var(--text-secondary)", fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) => `R$${v.toFixed(2)}`}
              width={60}
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
                `R$ ${Number(value).toFixed(4)}`,
                name === "reportado" ? "EPS Reportado" : "EPS Estimado",
              ]}
            />
            <ReferenceLine y={0} stroke="var(--border)" />
            {hasEstimate && (
              <Bar dataKey="estimado" name="estimado" fill="#f59e0b" opacity={0.4} radius={[3, 3, 0, 0]} />
            )}
            <Bar dataKey="reportado" name="reportado" radius={[3, 3, 0, 0]}>
              {data.map((d, i) => (
                <Cell
                  key={i}
                  fill={d.reportado === null ? "#6b7280"
                    : d.bateu === true  ? "#10b981"
                    : d.bateu === false ? "#ef4444"
                    : "#60a5fa"}
                />
              ))}
            </Bar>
            <Legend
              iconType="rect"
              iconSize={10}
              formatter={(v) => v === "reportado" ? "EPS Reportado" : "EPS Estimado"}
              wrapperStyle={{ fontSize: 11, color: "var(--text-secondary)" }}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Tabela compacta */}
      <div className="mt-3 pt-3 border-t border-[var(--border)] overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="text-[var(--text-secondary)]">
              <th className="text-left pb-1 font-medium">Trimestre</th>
              <th className="text-right pb-1 font-medium">EPS Real</th>
              <th className="text-right pb-1 font-medium">EPS Est.</th>
              <th className="text-right pb-1 font-medium">Surpresa</th>
            </tr>
          </thead>
          <tbody>
            {[...earnings].slice(0, 6).map((e, i) => (
              <tr key={i} className="border-t border-[var(--border)]/40">
                <td className="py-1 text-[var(--text-secondary)]">{e.data_fiscal.slice(0, 7)}</td>
                <td className={`py-1 text-right font-mono font-semibold ${
                  e.eps_reportado_brl !== null && e.eps_reportado_brl > 0 ? "text-emerald-500" : "text-red-500"}`}>
                  {e.eps_reportado_brl !== null ? `R$ ${e.eps_reportado_brl.toFixed(4)}` : "—"}
                </td>
                <td className="py-1 text-right font-mono text-[var(--text-secondary)]">
                  {e.eps_estimado_brl !== null ? `R$ ${e.eps_estimado_brl.toFixed(4)}` : "—"}
                </td>
                <td className={`py-1 text-right font-semibold ${
                  e.surpresa_pct === null ? "text-[var(--text-secondary)]"
                  : e.surpresa_pct > 0 ? "text-emerald-500"
                  : "text-red-500"}`}>
                  {e.surpresa_pct !== null
                    ? `${e.surpresa_pct >= 0 ? "+" : ""}${e.surpresa_pct.toFixed(1)}%`
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
