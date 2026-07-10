"use client";

import type { RSAlerta } from "@/types";

interface Props {
  alertas: RSAlerta[];
}

const CONFIG = {
  critico:  { label: "Crítico",   bg: "#ef444418", border: "#ef4444", text: "#ef4444", icon: "!" },
  atencao:  { label: "Atenção",   bg: "#f59e0b18", border: "#f59e0b", text: "#f59e0b", icon: "△" },
  positivo: { label: "Positivo",  bg: "#10b98118", border: "#10b981", text: "#10b981", icon: "+" },
  info:     { label: "Info",      bg: "#3b82f618", border: "#3b82f6", text: "#3b82f6", icon: "i" },
};

const ORDEM: (keyof typeof CONFIG)[] = ["critico", "atencao", "positivo", "info"];

export function AlertasRS({ alertas }: Props) {
  const sorted = [...alertas].sort(
    (a, b) =>
      ORDEM.indexOf(a.tipo as keyof typeof CONFIG) -
      ORDEM.indexOf(b.tipo as keyof typeof CONFIG)
  );

  const counts = Object.fromEntries(
    ORDEM.map((t) => [t, sorted.filter((a) => a.tipo === t).length])
  );

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-[var(--text-secondary)]">
          Alertas Automáticos
        </h3>
        <div className="flex gap-2">
          {ORDEM.filter((t) => counts[t] > 0).map((t) => {
            const c = CONFIG[t];
            return (
              <span
                key={t}
                className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                style={{ background: c.bg, color: c.text, border: `1px solid ${c.border}44` }}
              >
                {counts[t]} {c.label}{counts[t] > 1 ? "s" : ""}
              </span>
            );
          })}
        </div>
      </div>

      <div className="space-y-2">
        {sorted.map((alerta, i) => {
          const c = CONFIG[alerta.tipo as keyof typeof CONFIG] ?? CONFIG.info;
          return (
            <div
              key={i}
              className="rounded-xl p-3 flex gap-3"
              style={{ background: c.bg, border: `1px solid ${c.border}33` }}
            >
              {/* Ícone */}
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-xs font-bold mt-0.5"
                style={{ background: c.border + "33", color: c.text }}
              >
                {c.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[12px] font-semibold" style={{ color: c.text }}>
                    {alerta.titulo}
                  </p>
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded shrink-0"
                    style={{ background: c.border + "22", color: c.text }}
                  >
                    {alerta.categoria}
                  </span>
                </div>
                <p className="text-[11px] text-[var(--text-secondary)] mt-0.5 leading-snug">
                  {alerta.descricao}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
