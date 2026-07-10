"use client";

interface Props {
  score: number;
  insights: string[];
  tendencia: "alta" | "baixa" | "lateral";
  sma7: number;
  sma21: number;
  precoAtual: number;
  maximo30d: number;
  minimo30d: number;
}

function ScoreGauge({ score }: { score: number }) {
  const s = Math.max(0, Math.min(100, score));
  const r = 62;
  const cx = 100;
  const cy = 80;
  const C = 2 * Math.PI * r;
  const semiC = C / 2;
  const fillLen = (s / 100) * semiC;

  // Track: top semi-circle usando dasharray + dashoffset
  // rotate(-90): start at top (12 o'clock)
  // dashoffset = C*3/4: move start to 9 o'clock (left)
  const trackDashArray = `${semiC} ${semiC}`;
  const trackOffset = (C * 3) / 4;
  const fillDashArray = `${fillLen} ${C - fillLen}`;

  const color = s >= 70 ? "#10b981" : s >= 40 ? "#f59e0b" : "#ef4444";
  const label = s >= 70 ? "Forte" : s >= 40 ? "Neutro" : "Fraco";

  return (
    <svg viewBox="0 0 200 100" className="w-44 mx-auto">
      {/* Track */}
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke="var(--border)"
        strokeWidth="14"
        strokeLinecap="round"
        strokeDasharray={trackDashArray}
        strokeDashoffset={trackOffset}
        transform={`rotate(-90, ${cx}, ${cy})`}
      />
      {/* Fill */}
      {s > 0 && (
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="14"
          strokeLinecap="round"
          strokeDasharray={fillDashArray}
          strokeDashoffset={trackOffset}
          transform={`rotate(-90, ${cx}, ${cy})`}
        />
      )}
      <text x={cx} y={cy + 8} textAnchor="middle" fontSize="30" fontWeight="700" fill="var(--text-primary)">
        {s}
      </text>
      <text x={cx} y={cy + 22} textAnchor="middle" fontSize="11" fill={color} fontWeight="600">
        {label}
      </text>
    </svg>
  );
}

const TEND_COR: Record<string, string> = {
  alta: "text-emerald-500 bg-emerald-500/10",
  baixa: "text-red-500 bg-red-500/10",
  lateral: "text-amber-500 bg-amber-500/10",
};

const TEND_ICON: Record<string, string> = { alta: "▲", baixa: "▼", lateral: "→" };

export function AnalyticsPanel({ score, insights, tendencia, sma7, sma21, precoAtual, maximo30d, minimo30d }: Props) {
  const fmtUsd = (v: number) =>
    `$${new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v)}`;

  // Posição dentro da faixa 30d
  const range30 = maximo30d - minimo30d;
  const pos30 = range30 > 0 ? Math.min(100, Math.max(0, ((precoAtual - minimo30d) / range30) * 100)) : 50;

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 flex flex-col gap-5">
      <h3 className="text-sm font-semibold text-[var(--text-secondary)]">Análise de força</h3>

      {/* Score gauge */}
      <div className="flex flex-col items-center gap-1">
        <ScoreGauge score={score} />
        <p className="text-xs text-[var(--text-secondary)]">Score de força do ativo</p>
      </div>

      {/* Tendência badge */}
      <div className="flex justify-center">
        <span className={`px-3 py-1 rounded-full text-sm font-semibold ${TEND_COR[tendencia]}`}>
          {TEND_ICON[tendencia]} Tendência de {tendencia}
        </span>
      </div>

      {/* SMA comparison */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-[var(--border)]/20 rounded-xl p-3 text-center">
          <p className="text-[11px] text-[var(--text-secondary)]">SMA 7</p>
          <p className="text-sm font-bold text-blue-400">{fmtUsd(sma7)}</p>
          <p className="text-[10px] text-[var(--text-secondary)] mt-0.5">
            {precoAtual > sma7 ? "▲ Acima" : "▼ Abaixo"}
          </p>
        </div>
        <div className="bg-[var(--border)]/20 rounded-xl p-3 text-center">
          <p className="text-[11px] text-[var(--text-secondary)]">SMA 21</p>
          <p className="text-sm font-bold text-amber-400">{fmtUsd(sma21)}</p>
          <p className="text-[10px] text-[var(--text-secondary)] mt-0.5">
            {precoAtual > sma21 ? "▲ Acima" : "▼ Abaixo"}
          </p>
        </div>
      </div>

      {/* Faixa 30d */}
      <div>
        <div className="flex justify-between text-[11px] text-[var(--text-secondary)] mb-1">
          <span>Mín 30d: {fmtUsd(minimo30d)}</span>
          <span>Máx 30d: {fmtUsd(maximo30d)}</span>
        </div>
        <div className="relative h-2 rounded-full bg-[var(--border)]">
          <div className="absolute h-full rounded-full bg-gradient-to-r from-red-500 via-amber-400 to-emerald-500 w-full opacity-60" />
          <div
            className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white border-2 border-emerald-500 shadow"
            style={{ left: `calc(${pos30}% - 6px)` }}
          />
        </div>
        <p className="text-center text-[11px] text-[var(--text-secondary)] mt-1">
          Posição na faixa de 30 dias
        </p>
      </div>

      {/* Insights */}
      <div className="border-t border-[var(--border)] pt-4">
        <p className="text-xs font-semibold text-[var(--text-secondary)] mb-2">Insights automáticos</p>
        <ul className="flex flex-col gap-2">
          {insights.map((ins, i) => (
            <li key={i} className="flex items-start gap-2 text-xs text-[var(--text-primary)]">
              <span className="shrink-0 mt-0.5 w-1.5 h-1.5 rounded-full bg-emerald-500" />
              {ins}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
