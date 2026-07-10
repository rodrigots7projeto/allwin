"use client";

import type { AlphaOverview } from "@/types";

interface Props { overview: AlphaOverview; precoAtual: number; }

function fmtBrl(v: number | null, d = 2) {
  if (v === null || v === undefined) return "—";
  return `R$ ${new Intl.NumberFormat("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d }).format(v)}`;
}

function fmtN(v: number | null, d = 2, suffix = "") {
  if (v === null || v === undefined) return "—";
  return `${v.toFixed(d)}${suffix}`;
}

function fmtPct(v: number | null) {
  if (v === null || v === undefined) return "—";
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}

interface Metric {
  label: string;
  value: string;
  sub?: string;
  cor?: string;
  tooltip?: string;
}

function MetricRow({ label, value, sub, cor, tooltip }: Metric) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-[var(--border)] last:border-0" title={tooltip}>
      <span className="text-xs text-[var(--text-secondary)]">{label}</span>
      <div className="text-right">
        <span className={`text-sm font-semibold ${cor ?? "text-[var(--text-primary)]"}`}>{value}</span>
        {sub && <p className="text-[10px] text-[var(--text-secondary)]">{sub}</p>}
      </div>
    </div>
  );
}

export function FundamentaisAlphaCard({ overview: o, precoAtual }: Props) {
  const upside = o.preco_alvo_brl && precoAtual
    ? ((o.preco_alvo_brl / precoAtual) - 1) * 100
    : null;

  const sma50Dist = o.sma50_brl && precoAtual
    ? ((precoAtual / o.sma50_brl) - 1) * 100
    : null;

  const sma200Dist = o.sma200_brl && precoAtual
    ? ((precoAtual / o.sma200_brl) - 1) * 100
    : null;

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
      <h3 className="text-sm font-semibold text-[var(--text-secondary)] mb-3">Fundamentos</h3>

      {/* Valuation */}
      <p className="text-[10px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-1">Valuation</p>
      <div className="mb-4">
        <MetricRow label="P/L (Trailing)" value={fmtN(o.pe_trailing, 1, "×")} tooltip="Preço / Lucro dos últimos 12 meses" />
        <MetricRow label="P/L (Forward)" value={fmtN(o.pe_forward, 1, "×")} tooltip="Preço / Lucro estimado próx. 12 meses" />
        <MetricRow label="PEG Ratio" value={fmtN(o.peg_ratio, 2, "×")} tooltip="P/L ajustado pelo crescimento" />
        <MetricRow label="P/VP" value={fmtN(o.price_to_book, 2, "×")} tooltip="Preço / Valor Patrimonial" />
        <MetricRow label="P/Vendas" value={fmtN(o.price_to_sales, 2, "×")} tooltip="Preço / Receita TTM" />
        <MetricRow label="EV/EBITDA" value={fmtN(o.ev_to_ebitda, 1, "×")} />
        <MetricRow label="EV/Receita" value={fmtN(o.ev_to_revenue, 2, "×")} />
      </div>

      {/* Por ação */}
      <p className="text-[10px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-1">Por ação (BRL)</p>
      <div className="mb-4">
        <MetricRow label="LPA (EPS)" value={fmtBrl(o.eps_brl)} />
        <MetricRow label="LPA Diluído TTM" value={fmtBrl(o.eps_diluido_brl)} />
        <MetricRow label="VPA (Book Value)" value={fmtBrl(o.book_value_brl)} />
        <MetricRow label="Receita por ação" value={fmtBrl(o.receita_por_acao_brl)} />
      </div>

      {/* Margens e retornos */}
      <p className="text-[10px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-1">Margens e Retornos</p>
      <div className="mb-4">
        <MetricRow
          label="Margem Líquida"
          value={fmtPct(o.margem_lucro)}
          cor={o.margem_lucro !== null ? (o.margem_lucro > 0 ? "text-emerald-500" : "text-red-500") : undefined}
        />
        <MetricRow
          label="Margem Operacional"
          value={fmtPct(o.margem_operacional)}
          cor={o.margem_operacional !== null ? (o.margem_operacional > 0 ? "text-emerald-500" : "text-red-500") : undefined}
        />
        <MetricRow
          label="ROE"
          value={fmtPct(o.roe)}
          cor={o.roe !== null ? (o.roe > 15 ? "text-emerald-500" : o.roe > 0 ? "text-amber-400" : "text-red-500") : undefined}
          tooltip="Retorno sobre Patrimônio Líquido"
        />
        <MetricRow
          label="ROA"
          value={fmtPct(o.roa)}
          cor={o.roa !== null ? (o.roa > 5 ? "text-emerald-500" : o.roa > 0 ? "text-amber-400" : "text-red-500") : undefined}
          tooltip="Retorno sobre Ativos"
        />
        <MetricRow label="Cresc. Lucro (YoY)" value={fmtPct(o.crescimento_lucro_tri)}
          cor={o.crescimento_lucro_tri !== null ? (o.crescimento_lucro_tri > 0 ? "text-emerald-500" : "text-red-500") : undefined}
        />
        <MetricRow label="Cresc. Receita (YoY)" value={fmtPct(o.crescimento_receita_tri)}
          cor={o.crescimento_receita_tri !== null ? (o.crescimento_receita_tri > 0 ? "text-emerald-500" : "text-red-500") : undefined}
        />
      </div>

      {/* Técnico */}
      <p className="text-[10px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-1">Técnico</p>
      <div className="mb-2">
        <MetricRow label="Beta" value={fmtN(o.beta, 2)}
          cor={o.beta !== null ? (o.beta > 1.3 ? "text-red-400" : o.beta < 0.7 ? "text-blue-400" : "text-amber-400") : undefined}
          tooltip="Volatilidade vs índice de mercado (1 = mercado)"
        />
        <MetricRow
          label="SMA 50 dias"
          value={fmtBrl(o.sma50_brl)}
          sub={sma50Dist !== null ? `Preço ${sma50Dist >= 0 ? "+" : ""}${sma50Dist.toFixed(1)}% vs média` : undefined}
          cor={sma50Dist !== null ? (sma50Dist > 0 ? "text-emerald-500" : "text-red-500") : undefined}
        />
        <MetricRow
          label="SMA 200 dias"
          value={fmtBrl(o.sma200_brl)}
          sub={sma200Dist !== null ? `Preço ${sma200Dist >= 0 ? "+" : ""}${sma200Dist.toFixed(1)}% vs média` : undefined}
          cor={sma200Dist !== null ? (sma200Dist > 0 ? "text-emerald-500" : "text-red-500") : undefined}
        />
        {upside !== null && (
          <MetricRow
            label="Upside (alvo analistas)"
            value={`${upside >= 0 ? "+" : ""}${upside.toFixed(1)}%`}
            cor={upside > 10 ? "text-emerald-500" : upside < -10 ? "text-red-500" : "text-amber-400"}
          />
        )}
      </div>
    </div>
  );
}
