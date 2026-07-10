"use client";

import { useEffect, useState } from "react";

export interface InfoContent {
  titulo: string;
  descricao: string;
  formula?: string;
  interpretacao?: string;
  aviso?: string;
  fonte?: string;
}

interface BtnProps {
  info: InfoContent;
  className?: string;
}

export function InfoBtn({ info, className = "" }: BtnProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        className={`inline-flex items-center justify-center w-[14px] h-[14px] rounded-full text-[9px] font-bold opacity-30 hover:opacity-90 transition-opacity shrink-0 cursor-pointer ${className}`}
        style={{ background: "var(--border)", color: "var(--text-secondary)" }}
        aria-label={`Saiba mais: ${info.titulo}`}
      >
        ?
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={() => setOpen(false)}
        >
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div
            className="relative rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 max-w-sm w-full shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-3 mb-3">
              <h3 className="text-sm font-bold text-[var(--text-primary)] leading-snug">{info.titulo}</h3>
              <button
                onClick={() => setOpen(false)}
                className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] shrink-0 text-xl leading-none -mt-0.5 transition-colors"
              >
                ×
              </button>
            </div>

            {/* Descrição */}
            <p className="text-[13px] text-[var(--text-primary)] leading-relaxed mb-3">
              {info.descricao}
            </p>

            {/* Fórmula */}
            {info.formula && (
              <div className="rounded-lg bg-[var(--border)]/40 px-3 py-2.5 mb-3 font-mono text-[12px] text-center text-[var(--text-primary)]">
                {info.formula}
              </div>
            )}

            {/* Como interpretar */}
            {info.interpretacao && (
              <div className="mb-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-500 mb-1.5">
                  Como interpretar
                </p>
                <p className="text-[12px] text-[var(--text-secondary)] leading-relaxed">
                  {info.interpretacao}
                </p>
              </div>
            )}

            {/* Aviso */}
            {info.aviso && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 mb-3">
                <p className="text-[12px] text-amber-500 leading-relaxed">
                  {info.aviso}
                </p>
              </div>
            )}

            {/* Fonte */}
            {info.fonte && (
              <div className="pt-3 border-t border-[var(--border)]">
                <p className="text-[10px] text-[var(--text-secondary)] opacity-60">
                  Fonte dos dados: {info.fonte}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
