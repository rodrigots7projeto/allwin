"use client";

import type { CenarioValuation, MetodoValuation, ValuationData } from "@/types";

// ── Formatadores ─────────────────────────────────────────────────────────────

function fR(v: number | null, digits = 2): string {
  if (v === null || v === undefined) return "—";
  return `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

function fPct(v: number | null): string {
  if (v === null || v === undefined) return "—";
  const s = v >= 0 ? "+" : "";
  return `${s}${(v * 100).toFixed(1)}%`;
}

function fPctPlain(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}

// ── Cores do veredicto ────────────────────────────────────────────────────────

const VEREDICTO_BG: Record<string, string> = {
  verde:    "bg-emerald-500/10 border-emerald-500/30 text-emerald-400",
  amarelo:  "bg-amber-500/10 border-amber-500/30 text-amber-400",
  vermelho: "bg-red-500/10 border-red-500/30 text-red-400",
  neutro:   "bg-slate-500/10 border-slate-500/30 text-slate-400",
};

const UPSIDE_COR = (v: number | null) => {
  if (v === null) return "text-[var(--text-secondary)]";
  if (v >= 0.05)  return "text-emerald-400";
  if (v <= -0.05) return "text-red-400";
  return "text-amber-400";
};

// ── Barra de preço ────────────────────────────────────────────────────────────

function BarraPreco({ data }: { data: ValuationData }) {
  const { preco_atual, cenarios, preco_justo_base } = data;
  if (!cenarios.length) return null;

  const pess = cenarios.find((c) => c.nome === "Pessimista")?.preco_justo ?? null;
  const otim = cenarios.find((c) => c.nome === "Otimista")?.preco_justo ?? null;

  if (!pess || !otim || !preco_justo_base) return null;

  const min = Math.min(pess, preco_atual) * 0.9;
  const max = Math.max(otim, preco_atual) * 1.1;
  const span = max - min;

  const pos = (v: number) => `${Math.max(0, Math.min(100, ((v - min) / span) * 100)).toFixed(1)}%`;

  return (
    <div className="mt-4">
      <p className="text-xs text-[var(--text-secondary)] mb-3 uppercase tracking-wide font-semibold">
        Escala de Preço (Pessimista → Otimista)
      </p>
      <div className="relative h-3 rounded-full bg-[var(--border)]">
        {/* Faixa colorida entre pessimista e otimista */}
        <div
          className="absolute h-3 rounded-full bg-gradient-to-r from-red-500/40 via-amber-400/40 to-emerald-500/40"
          style={{ left: pos(pess), right: `${100 - parseFloat(pos(otim))}%` }}
        />

        {/* Marcadores */}
        {[
          { v: pess,           label: "Pessimista", color: "bg-red-400",     textColor: "text-red-400" },
          { v: preco_justo_base, label: "Base",     color: "bg-amber-400",   textColor: "text-amber-400" },
          { v: otim,           label: "Otimista",   color: "bg-emerald-400", textColor: "text-emerald-400" },
          { v: preco_atual,    label: "Atual",      color: "bg-white border-2 border-[var(--border)]", textColor: "text-[var(--text-primary)] font-bold" },
        ].map(({ v, label, color, textColor }) => (
          <div key={label} className="absolute -translate-x-1/2" style={{ left: pos(v) }}>
            <div className={`w-3 h-3 rounded-full -mt-0 ${color}`} />
            <div className="absolute top-5 -translate-x-1/2 text-center whitespace-nowrap">
              <p className={`text-[10px] ${textColor}`}>{label}</p>
              <p className={`text-[10px] tabular-nums ${textColor}`}>{fR(v)}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-10" />
    </div>
  );
}

// ── Card de cenário ───────────────────────────────────────────────────────────

function CenarioCard({ c, preco_atual }: { c: CenarioValuation; preco_atual: number }) {
  const cores: Record<string, string> = {
    Pessimista: "border-red-500/30 bg-red-500/5",
    Base:       "border-amber-500/30 bg-amber-500/5",
    Otimista:   "border-emerald-500/30 bg-emerald-500/5",
  };
  const dot: Record<string, string> = {
    Pessimista: "bg-red-400",
    Base:       "bg-amber-400",
    Otimista:   "bg-emerald-400",
  };

  return (
    <div className={`rounded-xl border p-5 ${cores[c.nome] ?? "border-[var(--border)]"}`}>
      <div className="flex items-center gap-2 mb-3">
        <span className={`w-2.5 h-2.5 rounded-full ${dot[c.nome] ?? "bg-slate-400"}`} />
        <span className="text-sm font-bold text-[var(--text-primary)]">{c.nome}</span>
      </div>

      <p className="text-3xl font-bold tabular-nums text-[var(--text-primary)] mb-1">
        {fR(c.preco_justo)}
      </p>

      <p className={`text-sm font-semibold ${UPSIDE_COR(c.upside_pct)}`}>
        {fPct(c.upside_pct)} vs. mercado
      </p>

      <div className="mt-3 pt-3 border-t border-[var(--border)] space-y-1">
        <div className="flex justify-between text-xs text-[var(--text-secondary)]">
          <span>Crescimento</span>
          <span className="tabular-nums">{fPctPlain(c.taxa_crescimento)}/a</span>
        </div>
        <div className="flex justify-between text-xs text-[var(--text-secondary)]">
          <span>Taxa desc. (WACC)</span>
          <span className="tabular-nums">{fPctPlain(c.taxa_desconto)}/a</span>
        </div>
      </div>
    </div>
  );
}

// ── Tabela de métodos ─────────────────────────────────────────────────────────

function TabelaMetodos({ metodos, preco_atual }: { metodos: MetodoValuation[]; preco_atual: number }) {
  if (!metodos.length) return null;

  return (
    <div>
      <h3 className="text-sm font-semibold text-[var(--text-secondary)] mb-3 uppercase tracking-wide">
        Detalhamento por Método (Cenário Base)
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)]">
              <th className="text-left py-2 pr-4 font-semibold text-[var(--text-secondary)]">Método</th>
              <th className="text-left py-2 pr-4 font-semibold text-[var(--text-secondary)] hidden sm:table-cell">Premissa</th>
              <th className="text-right py-2 px-3 font-semibold text-[var(--text-secondary)]">Preço Justo</th>
              <th className="text-right py-2 pl-3 font-semibold text-[var(--text-secondary)]">Upside</th>
            </tr>
          </thead>
          <tbody>
            {metodos.map((m) => (
              <tr key={m.nome} className="border-b border-[var(--border)]">
                <td className="py-3 pr-4 font-bold text-[var(--text-primary)] whitespace-nowrap">
                  {m.nome}
                </td>
                <td className="py-3 pr-4 text-[var(--text-secondary)] text-xs hidden sm:table-cell">
                  {m.descricao}
                </td>
                <td className="py-3 px-3 text-right tabular-nums font-semibold text-[var(--text-primary)] whitespace-nowrap">
                  {fR(m.preco_justo)}
                </td>
                <td className={`py-3 pl-3 text-right tabular-nums font-semibold whitespace-nowrap ${UPSIDE_COR(m.upside_pct)}`}>
                  {fPct(m.upside_pct)}
                </td>
              </tr>
            ))}
            {/* Linha de referência: preço atual */}
            <tr className="bg-[var(--border)]/20">
              <td className="py-3 pr-4 font-semibold text-[var(--text-secondary)]">Mercado</td>
              <td className="py-3 pr-4 text-xs text-[var(--text-secondary)] hidden sm:table-cell">
                Preço atual de negociação
              </td>
              <td className="py-3 px-3 text-right tabular-nums font-bold text-[var(--text-primary)]">
                {fR(preco_atual)}
              </td>
              <td className="py-3 pl-3 text-right text-[var(--text-secondary)]">—</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Métricas por ação ─────────────────────────────────────────────────────────

function MetricasPorAcao({ data }: { data: ValuationData }) {
  const items = [
    { label: "LPA (Lucro/Ação)", value: fR(data.eps), desc: "Base para métodos P/L e Graham" },
    { label: "VPA (Patr./Ação)",  value: fR(data.bvs), desc: "Base para métodos P/VP e Graham" },
    { label: "FCL/Ação",          value: fR(data.fcl_por_acao), desc: "Base para o DCF" },
    {
      label: "Ações em Circulação",
      value: data.shares ? `${(data.shares / 1e9).toFixed(2)}bi` : "—",
      desc: "Market Cap ÷ Preço Atual",
    },
  ];

  return (
    <div>
      <h3 className="text-sm font-semibold text-[var(--text-secondary)] mb-3 uppercase tracking-wide">
        Métricas por Ação Utilizadas
      </h3>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {items.map(({ label, value, desc }) => (
          <div key={label} className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
            <p className="text-xs text-[var(--text-secondary)] font-medium">{label}</p>
            <p className="text-xl font-bold tabular-nums text-[var(--text-primary)] mt-1">{value}</p>
            <p className="text-[10px] text-[var(--text-secondary)] mt-1 opacity-60">{desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Premissas / disclaimer ────────────────────────────────────────────────────

function PremissasBox({ data }: { data: ValuationData }) {
  const p = data.premissas;
  return (
    <details className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
      <summary className="text-xs font-semibold text-[var(--text-secondary)] cursor-pointer select-none uppercase tracking-wide">
        Premissas e Limitações
      </summary>
      <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-1 text-xs text-[var(--text-secondary)]">
        <span>Crescimento base (g): <b>{p.g_base_usado !== null ? fPctPlain(Number(p.g_base_usado)) : "—"}/a</b></span>
        <span>CAGR receita histórico: <b>{p.cagr_receita_historico !== null ? fPctPlain(Number(p.cagr_receita_historico)) : "—"}</b></span>
        <span>CAGR lucro histórico: <b>{p.cagr_lucro_historico !== null ? fPctPlain(Number(p.cagr_lucro_historico)) : "—"}</b></span>
        <span>Anos projetados (DCF): <b>{p.anos_dcf}</b></span>
        <span>Crescimento terminal: <b>{p.crescimento_terminal_pct}%/a</b></span>
        <span>Último exercício: <b>{p.ultimo_exercicio}</b></span>
        <span>Anos de histórico: <b>{p.n_anos_historico}</b></span>
      </div>
      <p className="mt-3 text-[10px] text-[var(--text-secondary)] opacity-60 leading-relaxed">
        Este valuation é uma estimativa educacional baseada em dados públicos do CVM.
        Não constitui recomendação de investimento. Múltiplos-alvo são referências gerais para o
        mercado brasileiro e devem ser ajustados ao setor e ao momento macroeconômico.
        Decisões de investimento devem considerar fatores qualitativos, gestão, governança e o
        contexto econômico mais amplo.
      </p>
    </details>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

export function ValuationSection({ data }: { data: ValuationData }) {
  const verCor = VEREDICTO_BG[data.veredicto_cor] ?? VEREDICTO_BG.neutro;
  const temDados = data.preco_justo_base !== null;

  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6 flex flex-col gap-6">

      {/* ── Cabeçalho com veredicto ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-[var(--text-primary)]">Valuation</h2>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
            Estimativa de preço justo • DCF · Graham · P/L · P/VP
          </p>
        </div>

        <div className={`rounded-xl border px-5 py-3 text-center min-w-[180px] ${verCor}`}>
          <p className="text-xs font-semibold uppercase tracking-widest opacity-70 mb-0.5">Veredicto</p>
          <p className="text-xl font-black tracking-tight">{data.veredicto}</p>
        </div>
      </div>

      {/* ── Resumo numérico ── */}
      {temDados && (
        <div className="grid grid-cols-3 gap-4 rounded-xl border border-[var(--border)] bg-[var(--border)]/10 p-4">
          <div className="text-center">
            <p className="text-xs text-[var(--text-secondary)] font-medium mb-1">Preço Atual</p>
            <p className="text-2xl font-bold tabular-nums text-[var(--text-primary)]">
              {fR(data.preco_atual)}
            </p>
          </div>
          <div className="text-center border-x border-[var(--border)]">
            <p className="text-xs text-[var(--text-secondary)] font-medium mb-1">Preço Justo (Base)</p>
            <p className="text-2xl font-bold tabular-nums text-[var(--text-primary)]">
              {fR(data.preco_justo_base)}
            </p>
          </div>
          <div className="text-center">
            <p className="text-xs text-[var(--text-secondary)] font-medium mb-1">Potencial</p>
            <p className={`text-2xl font-bold tabular-nums ${UPSIDE_COR(data.upside_pct)}`}>
              {fPct(data.upside_pct)}
            </p>
            {data.margem_seguranca !== null && (
              <p className="text-[10px] text-[var(--text-secondary)] mt-0.5">
                Margem de segurança: {fPct(data.margem_seguranca)}
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── Barra visual de preço ── */}
      {temDados && <BarraPreco data={data} />}

      {/* ── Três cenários ── */}
      {data.cenarios.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-[var(--text-secondary)] mb-3 uppercase tracking-wide">
            Cenários
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {data.cenarios.map((c) => (
              <CenarioCard key={c.nome} c={c} preco_atual={data.preco_atual} />
            ))}
          </div>
        </div>
      )}

      {/* ── Métodos ── */}
      <TabelaMetodos metodos={data.metodos} preco_atual={data.preco_atual} />

      {/* ── Métricas por ação ── */}
      <MetricasPorAcao data={data} />

      {/* ── Premissas ── */}
      <PremissasBox data={data} />
    </section>
  );
}
