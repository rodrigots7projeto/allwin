"use client";

import type { DemonstrativoAnual, FundamentosData, IndicadorComSinal } from "@/types";

// ── Formatadores ─────────────────────────────────────────────────────────────

function fBi(v: number | null): string {
  if (v === null || v === undefined) return "—";
  const bi = v / 1e9;
  if (Math.abs(bi) >= 1) return `R$ ${bi.toFixed(1)}bi`;
  const mi = v / 1e6;
  return `R$ ${mi.toFixed(0)}mi`;
}

function fPct(v: number | null): string {
  if (v === null || v === undefined) return "—";
  return `${(v * 100).toFixed(1)}%`;
}

function fX(v: number | null): string {
  if (v === null || v === undefined) return "—";
  return `${v.toFixed(1)}x`;
}

// ── Sinal colorido ───────────────────────────────────────────────────────────

const SINAL_STYLE: Record<string, string> = {
  verde:     "bg-emerald-500/15 border-emerald-500/30 text-emerald-400",
  amarelo:   "bg-amber-500/15 border-amber-500/30 text-amber-400",
  vermelho:  "bg-red-500/15 border-red-500/30 text-red-400",
  neutro:    "bg-[var(--bg-card)] border-[var(--border)] text-[var(--text-secondary)]",
};

const SINAL_DOT: Record<string, string> = {
  verde:    "bg-emerald-500",
  amarelo:  "bg-amber-500",
  vermelho: "bg-red-500",
  neutro:   "bg-slate-500",
};

const SINAL_LABEL: Record<string, string> = {
  margem_liquida:    "Margem Líquida",
  margem_ebitda:     "Margem EBITDA",
  margem_bruta:      "Margem Bruta",
  margem_ebit:       "Margem EBIT",
  roe:               "ROE",
  liquidez_corrente: "Liquidez Corrente",
  dl_ebitda:         "Dívida Líq. / EBITDA",
};

function SinalCard({ nome, ind }: { nome: string; ind: IndicadorComSinal }) {
  const style = SINAL_STYLE[ind.sinal] ?? SINAL_STYLE.neutro;
  const dot   = SINAL_DOT[ind.sinal]  ?? SINAL_DOT.neutro;
  const label = SINAL_LABEL[nome] ?? nome;
  const isPct = nome.startsWith("margem") || nome === "roe";
  const fmt   = isPct ? fPct : (v: number | null) => fX(v);

  return (
    <div className={`rounded-xl border p-4 ${style}`}>
      <div className="flex items-center gap-2 mb-3">
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dot}`} />
        <span className="text-xs font-semibold uppercase tracking-wide opacity-75">
          {label}
        </span>
      </div>
      <p className="text-2xl font-bold tabular-nums">{fmt(ind.valor)}</p>
      {ind.media_historica !== null && (
        <p className="text-xs mt-1 opacity-60">
          Média hist.: {fmt(ind.media_historica)}
        </p>
      )}
    </div>
  );
}

// ── Tabela histórica ─────────────────────────────────────────────────────────

const COLS: { key: keyof DemonstrativoAnual; label: string; fmt: (v: number | null) => string }[] = [
  { key: "receita_liquida",  label: "Receita Líq.",   fmt: fBi },
  { key: "ebitda",           label: "EBITDA",         fmt: fBi },
  { key: "lucro_liquido",    label: "Lucro Líq.",     fmt: fBi },
  { key: "patrimonio_liquido", label: "PL",           fmt: fBi },
  { key: "margem_ebitda",    label: "M.EBITDA",       fmt: fPct },
  { key: "margem_liquida",   label: "M.Líq.",         fmt: fPct },
  { key: "roe",              label: "ROE",             fmt: fPct },
  { key: "liquidez_corrente",label: "Liq.Corr.",      fmt: fX },
  { key: "dl_ebitda",        label: "DL/EBITDA",      fmt: fX },
];

function TabelaHistorica({ historico }: { historico: DemonstrativoAnual[] }) {
  const sorted = [...historico].sort((a, b) => b.ano - a.ano);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--border)]">
            <th className="text-left py-2 pr-4 font-semibold text-[var(--text-secondary)] whitespace-nowrap">
              Ano
            </th>
            {COLS.map((c) => (
              <th
                key={c.key as string}
                className="text-right py-2 px-3 font-semibold text-[var(--text-secondary)] whitespace-nowrap"
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((d, i) => (
            <tr
              key={d.ano}
              className={`border-b border-[var(--border)] ${i === 0 ? "font-semibold text-[var(--text-primary)]" : "text-[var(--text-secondary)]"}`}
            >
              <td className="py-2.5 pr-4 whitespace-nowrap">{d.ano}</td>
              {COLS.map((c) => (
                <td key={c.key as string} className="text-right py-2.5 px-3 tabular-nums whitespace-nowrap">
                  {c.fmt(d[c.key] as number | null)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── CAGR + múltiplos ─────────────────────────────────────────────────────────

function MetricaCard({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
      <p className="text-xs text-[var(--text-secondary)] font-medium mb-1">{label}</p>
      <p className="text-xl font-bold tabular-nums text-[var(--text-primary)]">{valor}</p>
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

export function FundamentosSection({ data }: { data: FundamentosData }) {
  const anos = data.historico.length;
  const temSinais = Object.keys(data.sinais).length > 0;
  const nAnos = anos >= 2 ? anos - 1 : 0;

  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6 flex flex-col gap-6">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-bold text-[var(--text-primary)]">
            Indicadores Fundamentalistas
          </h2>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
            Fonte: {data.fonte}
            {data.cd_cvm && <span className="ml-2 opacity-60">CD_CVM {data.cd_cvm}</span>}
          </p>
        </div>
        <span className="text-xs bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 rounded-full px-3 py-1 font-medium">
          {anos} anos de dados
        </span>
      </div>

      {/* CAGRs + P/L */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetricaCard
          label={`CAGR Receita (${nAnos}a)`}
          valor={fPct(data.cagr_receita)}
        />
        <MetricaCard
          label={`CAGR Lucro (${nAnos}a)`}
          valor={fPct(data.cagr_lucro)}
        />
        <MetricaCard
          label={`CAGR PL (${nAnos}a)`}
          valor={fPct(data.cagr_pl)}
        />
        <MetricaCard
          label="P/L Atual"
          valor={data.pl_atual !== null ? `${data.pl_atual.toFixed(1)}x` : "—"}
        />
      </div>

      {/* Sinais */}
      {temSinais && (
        <div>
          <h3 className="text-sm font-semibold text-[var(--text-secondary)] mb-3 uppercase tracking-wide">
            Sinais vs. Média Histórica
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {Object.entries(data.sinais).map(([nome, ind]) => (
              <SinalCard key={nome} nome={nome} ind={ind} />
            ))}
          </div>
        </div>
      )}

      {/* Tabela histórica */}
      <div>
        <h3 className="text-sm font-semibold text-[var(--text-secondary)] mb-3 uppercase tracking-wide">
          Histórico Financeiro
        </h3>
        <TabelaHistorica historico={data.historico} />
      </div>
    </section>
  );
}
