"use client";

import { useState } from "react";
import type { PontoTimeline } from "@/types";

interface Props {
  timeline: PontoTimeline[];
  precoCompra: number;
}

const R = (v: number) =>
  `R$ ${new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v)}`;

const Bi = (v: number) => {
  if (Math.abs(v) >= 1e6) return `R$ ${(v / 1e6).toFixed(2)}M`;
  if (Math.abs(v) >= 1e3) return `R$ ${(v / 1e3).toFixed(1)}K`;
  return R(v);
};

function fmtMes(mes: string) {
  const [y, m] = mes.split("-");
  const meses = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
  return `${meses[parseInt(m) - 1]}/${y}`;
}

export function TimelineTable({ timeline, precoCompra }: Props) {
  const [aberta, setAberta] = useState(false);
  const visivel = aberta ? timeline : timeline.slice(0, 6);

  if (timeline.length === 0) {
    return (
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
        <p className="text-sm text-[var(--text-secondary)] text-center">
          Sem dados de histórico mensal para exibir a linha do tempo.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-[var(--text-secondary)]">
          Linha do Tempo — Mês a Mês
        </h3>
        <span className="text-[11px] text-[var(--text-secondary)] opacity-60">
          {timeline.length} meses
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-[12px] min-w-[560px]">
          <thead>
            <tr className="text-[10px] uppercase tracking-wide text-[var(--text-secondary)]">
              <th className="text-left pb-2 pr-3">Mês</th>
              <th className="text-right pb-2 px-2">Preço</th>
              <th className="text-right pb-2 px-2">Variação Entrada</th>
              <th className="text-right pb-2 px-2">Patrimônio</th>
              <th className="text-right pb-2 pl-2">Lucro Acum.</th>
              <th className="text-right pb-2 pl-2">Rentabilidade</th>
            </tr>
          </thead>
          <tbody>
            {visivel.map((p, i) => {
              const varEntrada = ((p.preco - precoCompra) / precoCompra) * 100;
              const corLucro = p.lucro_acumulado >= 0 ? "#10b981" : "#ef4444";
              const corVar = varEntrada >= 0 ? "#10b981" : "#ef4444";
              const isLast = i === visivel.length - 1;
              return (
                <tr
                  key={p.mes}
                  className={`border-t border-[var(--border)]/50 hover:bg-[var(--border)]/10 transition-colors ${isLast ? "font-semibold" : ""}`}
                >
                  <td className="py-2 pr-3 text-[var(--text-secondary)]">
                    {fmtMes(p.mes)}
                  </td>
                  <td className="py-2 text-right font-mono px-2">
                    {R(p.preco)}
                  </td>
                  <td className="py-2 text-right font-mono px-2" style={{ color: corVar }}>
                    {varEntrada >= 0 ? "+" : ""}{varEntrada.toFixed(2)}%
                  </td>
                  <td className="py-2 text-right font-mono px-2">
                    {Bi(p.patrimonio)}
                  </td>
                  <td className="py-2 text-right font-mono pl-2" style={{ color: corLucro }}>
                    {p.lucro_acumulado >= 0 ? "+" : ""}{Bi(p.lucro_acumulado)}
                  </td>
                  <td className="py-2 text-right font-mono pl-2" style={{ color: corLucro }}>
                    {p.rentabilidade_pct >= 0 ? "+" : ""}{p.rentabilidade_pct.toFixed(2)}%
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {timeline.length > 6 && (
        <button
          onClick={() => setAberta((v) => !v)}
          className="mt-3 w-full text-[11px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors py-2 rounded-lg border border-[var(--border)] hover:border-emerald-500/40"
        >
          {aberta
            ? "Recolher ▲"
            : `Ver todos os ${timeline.length} meses ▼`}
        </button>
      )}
    </div>
  );
}
