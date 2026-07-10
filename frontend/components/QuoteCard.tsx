import type { QuoteData } from "@/types";
import Image from "next/image";

function fmt(n: number, decimais = 2) {
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: decimais,
    maximumFractionDigits: decimais,
  }).format(n);
}

function fmtVolume(n: number) {
  if (n >= 1_000_000_000) return `${fmt(n / 1_000_000_000)}B`;
  if (n >= 1_000_000) return `${fmt(n / 1_000_000)}M`;
  if (n >= 1_000) return `${fmt(n / 1_000)}K`;
  return fmt(n, 0);
}

function fmtMktCap(n: number | null) {
  if (!n) return "—";
  if (n >= 1_000_000_000) return `R$ ${fmt(n / 1_000_000_000)} bi`;
  if (n >= 1_000_000) return `R$ ${fmt(n / 1_000_000)} mi`;
  return `R$ ${fmt(n)}`;
}

function Stat({ label, value, destaque }: { label: string; value: string; destaque?: boolean }) {
  return (
    <div>
      <p className="text-xs text-[var(--text-secondary)] mb-0.5">{label}</p>
      <p className={`text-sm font-semibold ${destaque ? "text-emerald-500" : "text-[var(--text-primary)]"}`}>
        {value}
      </p>
    </div>
  );
}

const INDICE_COR: Record<string, string> = {
  IBOV: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  SMLL: "bg-violet-500/15 text-violet-400 border-violet-500/30",
  IDIV: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  IFIX: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  MIDL: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
  IBRA: "bg-orange-500/15 text-orange-400 border-orange-500/30",
};

interface Props {
  data: QuoteData;
  indices?: string[];
}

export function QuoteCard({ data, indices = [] }: Props) {
  const positivo = data.variacao_pct >= 0;
  const cor = positivo ? "text-emerald-500" : "text-red-500";
  const bgCor = positivo ? "bg-emerald-500/10" : "bg-red-500/10";

  // Posição do preço atual na faixa 52 semanas (0% = mínima, 100% = máxima)
  const pct52w =
    data.cinquenta_dois_semanas_alta && data.cinquenta_dois_semanas_baixa
      ? Math.min(
          100,
          Math.max(
            0,
            ((data.preco_atual - data.cinquenta_dois_semanas_baixa) /
              (data.cinquenta_dois_semanas_alta - data.cinquenta_dois_semanas_baixa)) *
              100
          )
        )
      : null;

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6">
      {/* Cabeçalho: logo + nome + setor */}
      <div className="flex items-start gap-3 mb-5">
        {data.logo_url && (
          <Image
            src={data.logo_url}
            alt={data.ticker}
            width={44}
            height={44}
            className="rounded-xl object-contain bg-white p-1 shrink-0"
            unoptimized
          />
        )}
        <div className="min-w-0">
          <h1 className="text-2xl font-bold font-mono text-[var(--text-primary)]">
            {data.ticker}
          </h1>
          <p className="text-sm text-[var(--text-secondary)] leading-tight truncate">
            {data.nome_longo || data.nome_curto}
          </p>
          {data.setor && (
            <p className="text-xs text-[var(--text-secondary)] mt-0.5 opacity-70">
              {data.setor}{data.subsetor ? ` · ${data.subsetor}` : ""}
            </p>
          )}
          {/* Badges de índice */}
          {indices.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {indices.map((idx) => (
                <span
                  key={idx}
                  className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                    INDICE_COR[idx] ?? "bg-[var(--border)] text-[var(--text-secondary)] border-[var(--border)]"
                  }`}
                >
                  {idx}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Preço principal + variação */}
      <div className="flex items-baseline gap-3 mb-6">
        <span className="text-4xl font-bold text-[var(--text-primary)]">
          R$ {fmt(data.preco_atual)}
        </span>
        <span className={`text-lg font-semibold px-2 py-0.5 rounded-lg ${cor} ${bgCor}`}>
          {positivo ? "+" : ""}
          {fmt(data.variacao_pct)}%
          <span className="text-sm font-normal ml-1">
            ({positivo ? "+" : ""}R$ {fmt(data.variacao)})
          </span>
        </span>
      </div>

      {/* Faixa 52 semanas */}
      {pct52w !== null && (
        <div className="mb-6">
          <div className="flex justify-between text-xs text-[var(--text-secondary)] mb-1.5">
            <span>Mín 52S: R$ {fmt(data.cinquenta_dois_semanas_baixa!)}</span>
            <span>Máx 52S: R$ {fmt(data.cinquenta_dois_semanas_alta!)}</span>
          </div>
          <div className="relative h-2 rounded-full bg-[var(--border)]">
            <div
              className="absolute h-full rounded-full bg-gradient-to-r from-red-500 via-amber-400 to-emerald-500"
              style={{ width: "100%" }}
            />
            <div
              className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white border-2 border-emerald-500 shadow"
              style={{ left: `calc(${pct52w}% - 6px)` }}
            />
          </div>
          <p className="text-xs text-center text-[var(--text-secondary)] mt-1">
            Posição na faixa de 52 semanas: <strong>{fmt(pct52w, 1)}%</strong>
          </p>
        </div>
      )}

      {/* Grid de indicadores — linha 1: intraday */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pb-4 border-b border-[var(--border)]">
        <Stat label="Abertura" value={`R$ ${fmt(data.preco_abertura)}`} />
        <Stat label="Máxima do dia" value={`R$ ${fmt(data.preco_max)}`} />
        <Stat label="Mínima do dia" value={`R$ ${fmt(data.preco_min)}`} />
        <Stat label="Fech. anterior" value={`R$ ${fmt(data.preco_fechamento_anterior)}`} />
      </div>

      {/* Grid de indicadores — linha 2: mercado + fundamentals */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4">
        <Stat label="Volume" value={fmtVolume(data.volume)} />
        <Stat label="Market Cap" value={fmtMktCap(data.market_cap)} />
        <Stat
          label="P/L"
          value={data.preco_lucro != null ? fmt(data.preco_lucro) + "x" : "—"}
          destaque={data.preco_lucro != null && data.preco_lucro > 0 && data.preco_lucro < 15}
        />
        <Stat
          label="LPA (EPS)"
          value={data.lpa != null ? `R$ ${fmt(data.lpa)}` : "—"}
        />
      </div>
    </div>
  );
}
