"use client";

import type { QuoteData } from "@/types";
import Image from "next/image";
import Link from "next/link";

function fmt(n: number, d = 2) {
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  }).format(n);
}

function fmtMktCap(n: number | null) {
  if (!n) return "—";
  if (n >= 1_000_000_000) return `R$ ${fmt(n / 1_000_000_000, 1)} bi`;
  if (n >= 1_000_000) return `R$ ${fmt(n / 1_000_000, 0)} mi`;
  return `R$ ${fmt(n, 0)}`;
}

function TickerCard({ d }: { d: QuoteData }) {
  const up = d.variacao_pct >= 0;
  const cor = up ? "text-emerald-500" : "text-red-500";
  const bgCor = up ? "bg-emerald-500/10" : "bg-red-500/10";

  // Posição 52 semanas
  const pct52w =
    d.cinquenta_dois_semanas_alta && d.cinquenta_dois_semanas_baixa && d.cinquenta_dois_semanas_alta !== d.cinquenta_dois_semanas_baixa
      ? Math.min(100, Math.max(0,
          ((d.preco_atual - d.cinquenta_dois_semanas_baixa) /
            (d.cinquenta_dois_semanas_alta - d.cinquenta_dois_semanas_baixa)) * 100
        ))
      : null;

  return (
    <Link
      href={`/ativo/${d.ticker}`}
      className="group rounded-2xl border border-[var(--border)] bg-[var(--bg-card)]
                 p-4 flex flex-col gap-3 hover:border-emerald-500/50 hover:bg-emerald-500/5
                 transition-all duration-200"
    >
      {/* Cabeçalho */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {d.logo_url ? (
            <Image
              src={d.logo_url}
              alt={d.ticker}
              width={28}
              height={28}
              className="rounded-lg bg-white p-0.5 shrink-0"
              unoptimized
            />
          ) : (
            <div className="w-7 h-7 rounded-lg bg-[var(--border)] flex items-center justify-center shrink-0">
              <span className="text-xs font-bold text-[var(--text-secondary)]">
                {d.ticker.slice(0, 2)}
              </span>
            </div>
          )}
          <div className="min-w-0">
            <p className="text-sm font-bold font-mono text-[var(--text-primary)] group-hover:text-emerald-500 transition-colors">
              {d.ticker}
            </p>
            <p className="text-xs text-[var(--text-secondary)] truncate leading-tight">
              {d.nome_curto}
            </p>
          </div>
        </div>
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-lg shrink-0 ${cor} ${bgCor}`}>
          {up ? "+" : ""}{fmt(d.variacao_pct)}%
        </span>
      </div>

      {/* Preço */}
      <div>
        <p className="text-xl font-bold text-[var(--text-primary)]">
          R$ {fmt(d.preco_atual)}
        </p>
        <p className={`text-xs ${cor}`}>
          {up ? "+" : ""}R$ {fmt(d.variacao)} hoje
        </p>
      </div>

      {/* Barra 52 semanas */}
      {pct52w !== null && (
        <div>
          <div className="relative h-1.5 rounded-full bg-[var(--border)] overflow-hidden">
            <div className="absolute h-full rounded-full bg-gradient-to-r from-red-500 via-amber-400 to-emerald-500 w-full" />
            <div
              className="absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-white border border-emerald-500 shadow-sm"
              style={{ left: `calc(${pct52w}% - 4px)` }}
            />
          </div>
          <div className="flex justify-between text-[10px] text-[var(--text-secondary)] mt-0.5">
            <span>{fmt(d.cinquenta_dois_semanas_baixa!)}</span>
            <span>52S</span>
            <span>{fmt(d.cinquenta_dois_semanas_alta!)}</span>
          </div>
        </div>
      )}

      {/* Rodapé: P/L + Market Cap */}
      <div className="flex justify-between text-xs pt-1 border-t border-[var(--border)]">
        <span className="text-[var(--text-secondary)]">
          P/L:{" "}
          <span className="font-semibold text-[var(--text-primary)]">
            {d.preco_lucro != null ? fmt(d.preco_lucro) + "x" : "—"}
          </span>
        </span>
        <span className="text-[var(--text-secondary)]">
          {fmtMktCap(d.market_cap)}
        </span>
      </div>
    </Link>
  );
}

interface Props {
  ativos: QuoteData[];
  titulo?: string;
}

export function MarketPanel({ ativos, titulo = "Mercado agora" }: Props) {
  if (!ativos.length) return null;

  const altas = ativos.filter((a) => a.variacao_pct >= 0).length;
  const baixas = ativos.length - altas;

  return (
    <section className="w-full">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h2 className="text-base font-semibold text-[var(--text-primary)]">{titulo}</h2>
          <span className="text-xs text-[var(--text-secondary)] px-2 py-0.5 rounded-full border border-[var(--border)]">
            {ativos.length} ativos
          </span>
        </div>
        <div className="flex gap-2 text-xs">
          <span className="text-emerald-500">▲ {altas}</span>
          <span className="text-red-500">▼ {baixas}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {ativos.map((d) => (
          <TickerCard key={d.ticker} d={d} />
        ))}
      </div>
    </section>
  );
}
