"use client";

import type { AlphaOverview } from "@/types";

interface Props { overview: AlphaOverview; symbol: string; }

function fmtBrl(v: number | null, decimals = 2) {
  if (v === null || v === undefined) return "—";
  return `R$ ${new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(v)}`;
}

function fmtBi(v: number | null) {
  if (!v) return "—";
  if (v >= 1e12) return `R$ ${(v / 1e12).toFixed(2)} tri`;
  if (v >= 1e9)  return `R$ ${(v / 1e9).toFixed(1)} bi`;
  if (v >= 1e6)  return `R$ ${(v / 1e6).toFixed(0)} mi`;
  return fmtBrl(v);
}

function fmtPct(v: number | null) {
  if (v === null || v === undefined) return "—";
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}

const PAIS_FLAG: Record<string, string> = {
  "United States": "🇺🇸",
  "Brazil": "🇧🇷",
  "United Kingdom": "🇬🇧",
  "Germany": "🇩🇪",
  "Japan": "🇯🇵",
  "China": "🇨🇳",
};

export function CompanyOverviewCard({ overview: o, symbol }: Props) {
  const flag = PAIS_FLAG[o.pais] ?? "🌐";
  const totalAnalistas = (o.analistas_compra_forte ?? 0) + (o.analistas_compra ?? 0)
    + (o.analistas_neutro ?? 0) + (o.analistas_venda ?? 0) + (o.analistas_venda_forte ?? 0);
  const compras = (o.analistas_compra_forte ?? 0) + (o.analistas_compra ?? 0);
  const vendas  = (o.analistas_venda ?? 0) + (o.analistas_venda_forte ?? 0);
  const pctCompra = totalAnalistas > 0 ? (compras / totalAnalistas) * 100 : 0;
  const pctVenda  = totalAnalistas > 0 ? (vendas  / totalAnalistas) * 100 : 0;
  const pctHold   = 100 - pctCompra - pctVenda;

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 flex flex-col gap-4">
      {/* Cabeçalho */}
      <div className="flex items-start gap-3">
        <div className="w-12 h-12 rounded-xl bg-blue-500/15 flex items-center justify-center shrink-0">
          <span className="text-blue-400 font-bold text-lg">{symbol.slice(0, 2)}</span>
        </div>
        <div className="min-w-0">
          <h2 className="text-base font-bold text-[var(--text-primary)] leading-tight">{o.nome}</h2>
          <div className="flex flex-wrap items-center gap-2 mt-1">
            <span className="text-xs text-[var(--text-secondary)]">{flag} {o.pais}</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 font-medium">{o.exchange}</span>
            {o.setor && <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--border)]/60 text-[var(--text-secondary)]">{o.setor}</span>}
            {o.industria && <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--border)]/40 text-[var(--text-secondary)]">{o.industria}</span>}
          </div>
        </div>
      </div>

      {/* Descrição */}
      {o.descricao && (
        <details className="group">
          <summary className="cursor-pointer text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors list-none flex items-center gap-1">
            <span className="group-open:hidden">▶ Ver descrição da empresa</span>
            <span className="hidden group-open:inline">▼ Ocultar descrição</span>
          </summary>
          <p className="mt-2 text-xs text-[var(--text-secondary)] leading-relaxed line-clamp-6">
            {o.descricao}
          </p>
        </details>
      )}

      {/* Dados principais */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[
          { label: "Market Cap",     value: fmtBi(o.market_cap_brl) },
          { label: "Receita TTM",    value: fmtBi(o.receita_ttm_brl) },
          { label: "EBITDA",         value: fmtBi(o.ebitda_brl) },
          { label: "Faixa 52 semanas", value: o.alta_52s_brl && o.baixa_52s_brl
              ? `${fmtBrl(o.baixa_52s_brl)} — ${fmtBrl(o.alta_52s_brl)}`
              : "—" },
          { label: "Alvo analistas", value: fmtBrl(o.preco_alvo_brl) },
          { label: "Ações em circ.", value: o.shares_outstanding
              ? `${(o.shares_outstanding / 1e9).toFixed(2)}B`
              : "—" },
        ].map(({ label, value }) => (
          <div key={label} className="bg-[var(--border)]/20 rounded-xl p-3">
            <p className="text-[10px] text-[var(--text-secondary)] mb-0.5">{label}</p>
            <p className="text-sm font-semibold text-[var(--text-primary)] leading-tight">{value}</p>
          </div>
        ))}
      </div>

      {/* Consenso de analistas */}
      {totalAnalistas > 0 && (
        <div>
          <div className="flex items-center justify-between text-xs text-[var(--text-secondary)] mb-1.5">
            <span>Consenso de {totalAnalistas} analistas</span>
            <div className="flex gap-3">
              <span className="text-emerald-500">Compra {compras}</span>
              <span className="text-amber-400">Neutro {o.analistas_neutro ?? 0}</span>
              <span className="text-red-500">Venda {vendas}</span>
            </div>
          </div>
          <div className="flex h-2 rounded-full overflow-hidden">
            <div className="bg-emerald-500 transition-all" style={{ width: `${pctCompra}%` }} />
            <div className="bg-amber-400 transition-all" style={{ width: `${pctHold}%` }} />
            <div className="bg-red-500 transition-all"   style={{ width: `${pctVenda}%` }} />
          </div>
          {o.preco_alvo_brl && (
            <p className="text-[11px] text-[var(--text-secondary)] mt-1 text-right">
              Preço-alvo médio: <span className="text-[var(--text-primary)] font-semibold">{fmtBrl(o.preco_alvo_brl)}</span>
            </p>
          )}
        </div>
      )}

      {/* Dividendos */}
      {(o.dividend_yield_pct || o.dividendo_por_acao_brl) && (
        <div className="flex items-center gap-2 pt-2 border-t border-[var(--border)]">
          <span className="text-amber-400 text-sm">💰</span>
          <span className="text-xs text-[var(--text-secondary)]">
            Dividendos:{" "}
            <span className="text-[var(--text-primary)] font-semibold">
              {fmtBrl(o.dividendo_por_acao_brl)} por ação
            </span>
            {o.dividend_yield_pct !== null && (
              <span className="ml-2 text-amber-400">({o.dividend_yield_pct?.toFixed(2)}% yield)</span>
            )}
          </span>
          {o.data_ex_dividendo && (
            <span className="ml-auto text-[10px] text-[var(--text-secondary)]">
              Ex-div: {o.data_ex_dividendo}
            </span>
          )}
        </div>
      )}

      {/* Website */}
      {o.website && (
        <a
          href={o.website}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-blue-400 hover:underline self-start"
        >
          {o.website.replace(/^https?:\/\//, "")} ↗
        </a>
      )}
    </div>
  );
}
