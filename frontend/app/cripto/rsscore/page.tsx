"use client";
import { useState, useEffect, useCallback, useMemo, memo } from "react";
import Link from "next/link";
import { SinaisHubNav } from "@/components/SinaisHubNav";
import {
  TrendingUp, TrendingDown, Minus, RefreshCw, ExternalLink,
  ChevronDown, ChevronUp, Zap, BarChart2, Layers, Activity,
} from "lucide-react";

const API   = process.env.NEXT_PUBLIC_API_URL ?? "https://allwin-backend-production.up.railway.app/api/v1";
const T     = { EXCELENTE: 80, BOM: 65, REGULAR: 50, FRACO: 35 } as const;
const TIMER = 30;

// ── Types ─────────────────────────────────────────────────────────────────────

interface NiveisTrade {
  tipo: "COMPRA" | "VENDA";
  entrada: number; stop: number; stop_pct: number;
  alvo1: number; alvo1_pct: number; rr1: number;
  alvo2: number; alvo2_pct: number; rr2: number;
  alvo3: number; alvo3_pct: number; rr3: number;
  atr: number; atr_pct: number;
  suporte: number; resistencia: number;
}

interface ScanItem {
  simbolo: string; preco: number;
  score_final: number; grade: string;
  direction: "LONG" | "SHORT" | "NEUTRO";
  direction_confidence: number;
  ist: number; operar: boolean; bullish: boolean;
  var24h: number; volume24h: number;
  oi_change_pct: number; funding_rate: number; funding_class: string;
  long_pct: number; short_pct: number; bull_pct: number;
  leverage_suggested: string; squeeze_type: string | null;
  score_tecnico: number; score_fluxo: number;
  score_contexto: number; score_fundamental: number;
  niveis: NiveisTrade | null;
  justificativa: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function scoreColor(s: number) {
  if (s >= T.EXCELENTE) return "#10b981";
  if (s >= T.BOM)       return "#3b82f6";
  if (s >= T.REGULAR)   return "#f59e0b";
  if (s >= T.FRACO)     return "#f97316";
  return "#ef4444";
}

function scoreLabel(s: number) {
  if (s >= T.EXCELENTE) return "Excelente";
  if (s >= T.BOM)       return "Bom";
  if (s >= T.REGULAR)   return "Regular";
  if (s >= T.FRACO)     return "Fraco";
  return "Crítico";
}

function gradeColor(g: string) {
  const m: Record<string, string> = { A:"#10b981", "A+":'#10b981', B:"#3b82f6", C:"#f59e0b", D:"#f97316", F:"#ef4444" };
  return m[g] ?? "#6b7280";
}

function dirColor(d: string) {
  if (d === "LONG")  return "#10b981";
  if (d === "SHORT") return "#ef4444";
  return "#f59e0b";
}

function fV(v: number) {
  if (v >= 1_000_000_000) return `$${(v/1_000_000_000).toFixed(1)}B`;
  if (v >= 1_000_000)     return `$${(v/1_000_000).toFixed(0)}M`;
  return `$${v.toFixed(0)}`;
}

function fP(v: number, d = 2) {
  if (v >= 10000) return v.toLocaleString("pt-BR",{maximumFractionDigits:0});
  if (v >= 1)     return v.toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:d});
  return v.toLocaleString("pt-BR",{minimumFractionDigits:4,maximumFractionDigits:6});
}

// ── Score Ring ────────────────────────────────────────────────────────────────

function ScoreRing({ score, size = 72 }: { score: number; size?: number }) {
  const r      = (size - 8) / 2;
  const circ   = 2 * Math.PI * r;
  const offset = circ * (1 - Math.min(score, 100) / 100);
  const color  = scoreColor(score);
  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--border)" strokeWidth={5}/>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={5}
          strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.6s ease" }}/>
      </svg>
      <div className="absolute flex flex-col items-center leading-none">
        <span className="text-lg font-black tabular-nums" style={{ color }}>{Math.round(score)}</span>
        <span className="text-[8px] uppercase font-bold mt-0.5" style={{ color }}>{scoreLabel(score)}</span>
      </div>
    </div>
  );
}

// ── Sub Score Bar ─────────────────────────────────────────────────────────────

function SubBar({ label, value, icon: Icon, color }: { label: string; value: number; icon: React.FC<any>; color: string }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <Icon size={9} style={{ color }} />
          <span className="text-[9px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>{label}</span>
        </div>
        <span className="text-[10px] font-bold tabular-nums" style={{ color: scoreColor(value) }}>{Math.round(value)}</span>
      </div>
      <div className="h-1 rounded-full overflow-hidden" style={{ background: "var(--border)" }}>
        <div className="h-full rounded-full transition-all duration-500"
          style={{ width: `${Math.min(value, 100)}%`, background: scoreColor(value) }}/>
      </div>
    </div>
  );
}

// ── Asset Card ────────────────────────────────────────────────────────────────

const AssetCard = memo(function AssetCard({ item }: { item: ScanItem }) {
  const [open, setOpen] = useState(false);
  const sc     = item.score_final;
  const dir    = item.direction;
  const n      = item.niveis;
  const isBuy  = n?.tipo === "COMPRA";
  const color  = scoreColor(sc);
  const dColor = dirColor(dir);

  const DirIcon = dir === "LONG" ? TrendingUp : dir === "SHORT" ? TrendingDown : Minus;

  return (
    <div className="rounded-2xl border overflow-hidden transition-all duration-200 hover:scale-[1.005] hover:shadow-lg"
      style={{ background: "var(--bg-card)", borderColor: color + "40", boxShadow: `0 0 0 0 ${color}` }}>

      {/* Color stripe */}
      <div className="h-0.5 w-full" style={{ background: `linear-gradient(to right, ${color}, ${color}55)` }}/>

      <div className="p-4 space-y-3">

        {/* ── Row 1: symbol + badges + score ── */}
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              {/* Symbol */}
              <Link href={`/cripto/motor/${item.simbolo}`}
                className="text-lg font-black no-underline hover:underline"
                style={{ color: "var(--text-primary)" }}>
                {item.simbolo}
              </Link>

              {/* Grade badge */}
              <span className="text-[10px] font-black px-1.5 py-0.5 rounded-md"
                style={{ background: gradeColor(item.grade) + "25", color: gradeColor(item.grade), border: `1px solid ${gradeColor(item.grade)}44` }}>
                {item.grade}
              </span>

              {/* Direction badge */}
              <span className="flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-md"
                style={{ background: dColor + "18", color: dColor, border: `1px solid ${dColor}40` }}>
                <DirIcon size={9}/> {dir} {item.direction_confidence.toFixed(0)}%
              </span>

              {/* Operar badge */}
              {item.operar && (
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md"
                  style={{ background: "#10b98122", color: "#10b981", border: "1px solid #10b98140" }}>
                  ✓ Operar
                </span>
              )}

              {/* Squeeze */}
              {item.squeeze_type && (
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md"
                  style={{ background: "#a855f722", color: "#a855f7", border: "1px solid #a855f740" }}>
                  ⚡ {item.squeeze_type}
                </span>
              )}
            </div>

            {/* Price row */}
            <div className="flex items-center gap-3 mt-1.5 flex-wrap">
              <span className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>
                ${fP(item.preco)}
              </span>
              <span className="text-[11px] font-semibold tabular-nums"
                style={{ color: item.var24h >= 0 ? "#10b981" : "#ef4444" }}>
                {item.var24h >= 0 ? "+" : ""}{item.var24h.toFixed(2)}%
              </span>
              <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                FR: <span style={{ color: item.funding_rate > 0.0005 ? "#ef4444" : item.funding_rate < -0.0005 ? "#10b981" : "var(--text-muted)" }}>
                  {(item.funding_rate * 100).toFixed(4)}%
                </span>
              </span>
              <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                Vol: {fV(item.volume24h)}
              </span>
              {item.oi_change_pct != null && item.oi_change_pct !== 0 && (
                <span className="text-[10px]" style={{ color: item.oi_change_pct > 0 ? "#10b981" : "#ef4444" }}>
                  OI: {item.oi_change_pct > 0 ? "+" : ""}{item.oi_change_pct.toFixed(1)}%
                </span>
              )}
            </div>
          </div>

          {/* Score ring */}
          <div className="shrink-0">
            <ScoreRing score={sc} size={72}/>
          </div>
        </div>

        {/* ── Row 2: Sub-scores ── */}
        <div className="grid grid-cols-2 gap-2 p-2.5 rounded-xl" style={{ background: "var(--bg)" }}>
          <SubBar label="Técnico"    value={item.score_tecnico}    icon={BarChart2} color="#3b82f6"/>
          <SubBar label="Fluxo"      value={item.score_fluxo}      icon={Activity}  color="#10b981"/>
          <SubBar label="Contexto"   value={item.score_contexto}   icon={Layers}    color="#a855f7"/>
          <SubBar label="Fundamental" value={item.score_fundamental} icon={Zap}      color="#f59e0b"/>
        </div>

        {/* ── Row 3: Níveis de entrada ── */}
        {n && (
          <div className="rounded-xl p-2.5 space-y-2" style={{ background: "var(--bg)", border: `1px solid ${isBuy ? "#10b98130" : "#ef444430"}` }}>
            {/* Header */}
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wide"
                style={{ color: isBuy ? "#10b981" : "#ef4444" }}>
                {isBuy ? "▲ COMPRA" : "▼ VENDA"} · Stop {n.stop_pct.toFixed(2)}%
              </span>
              <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                Leverage: <span className="font-bold" style={{ color: "#f59e0b" }}>{item.leverage_suggested}</span>
              </span>
            </div>

            {/* Entrada */}
            <div className="flex items-center gap-2 text-[10px]">
              <span style={{ color: "var(--text-muted)" }}>Entrada:</span>
              <span className="font-bold" style={{ color: "var(--text-primary)" }}>${fP(n.entrada)}</span>
              <span style={{ color: "var(--text-muted)" }}>
                S/R: ${fP(n.suporte)} / ${fP(n.resistencia)}
              </span>
            </div>

            {/* Alvos */}
            <div className="grid grid-cols-3 gap-1">
              {[
                { label: "Alvo 1", pct: n.alvo1_pct, rr: n.rr1, price: n.alvo1 },
                { label: "Alvo 2", pct: n.alvo2_pct, rr: n.rr2, price: n.alvo2 },
                { label: "Alvo 3", pct: n.alvo3_pct, rr: n.rr3, price: n.alvo3 },
              ].map(a => (
                <div key={a.label} className="rounded-lg p-1.5 text-center"
                  style={{ background: isBuy ? "#10b98112" : "#ef444412", border: `1px solid ${isBuy?"#10b98130":"#ef444430"}` }}>
                  <p className="text-[8px] font-semibold uppercase" style={{ color: "var(--text-muted)" }}>{a.label}</p>
                  <p className="text-[10px] font-bold tabular-nums" style={{ color: isBuy ? "#10b981" : "#ef4444" }}>
                    +{a.pct.toFixed(2)}%
                  </p>
                  <p className="text-[9px]" style={{ color: "var(--text-muted)" }}>R:R {a.rr.toFixed(1)}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Row 4: Sentimento ── */}
        <div className="flex items-center gap-3 text-[10px]">
          <div className="flex items-center gap-1">
            <span style={{ color: "#10b981" }}>▲ {item.long_pct.toFixed(0)}%</span>
            <span style={{ color: "var(--text-muted)" }}>Long</span>
          </div>
          <div className="h-2.5 flex-1 rounded-full overflow-hidden" style={{ background: "#ef444420" }}>
            <div className="h-full rounded-full" style={{ width: `${item.long_pct}%`, background: "linear-gradient(to right, #10b981, #3b82f6)" }}/>
          </div>
          <div className="flex items-center gap-1">
            <span style={{ color: "var(--text-muted)" }}>Short</span>
            <span style={{ color: "#ef4444" }}>{item.short_pct.toFixed(0)}% ▼</span>
          </div>
        </div>

        {/* ── Row 5: Justificativa (expandível) ── */}
        <div>
          <button onClick={() => setOpen(v => !v)}
            className="w-full flex items-center justify-between text-[10px] transition-colors rounded-lg px-2 py-1.5"
            style={{ color: "var(--text-muted)", background: "var(--bg)" }}>
            <span className="font-semibold">💬 Análise da IA</span>
            {open ? <ChevronUp size={11}/> : <ChevronDown size={11}/>}
          </button>
          {open && (
            <p className="text-[10px] leading-relaxed mt-1.5 px-2 py-2 rounded-lg"
              style={{ color: "var(--text-secondary)", background: "var(--bg)", border: "1px solid var(--border)" }}>
              {item.justificativa}
            </p>
          )}
        </div>

        {/* ── Row 6: Link para análise completa ── */}
        <Link href={`/cripto/motor/${item.simbolo}`}
          className="flex items-center justify-center gap-1.5 w-full py-2 rounded-xl text-[11px] font-semibold no-underline transition-all hover:opacity-80"
          style={{ background: color + "15", color, border: `1px solid ${color}35` }}>
          <ExternalLink size={11}/>
          Ver análise completa
        </Link>

      </div>
    </div>
  );
});

// ── Page ─────────────────────────────────────────────────────────────────────

type DirFilter = "ALL" | "LONG" | "SHORT" | "NEUTRO";
type SortBy    = "score" | "symbol" | "confidence" | "volume";

export default function RSScorePage() {
  const [data,       setData]    = useState<ScanItem[]>([]);
  const [loading,    setLoading] = useState(true);
  const [error,      setError]   = useState<string | null>(null);
  const [lastUpdate, setLast]    = useState<Date | null>(null);
  const [countdown,  setCount]   = useState(TIMER);
  const [dirFilter,  setDir]     = useState<DirFilter>("ALL");
  const [sortBy,     setSort]    = useState<SortBy>("score");
  const [minScore,   setMin]     = useState(0);
  const [search,     setSearch]  = useState("");

  const fetchScan = useCallback(async () => {
    try {
      const r = await fetch(`${API}/cripto/futures/scan`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      setData(d.geral ?? []);
      setLast(new Date());
      setError(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
      setCount(TIMER);
    }
  }, []);

  useEffect(() => {
    fetchScan();
    const iv = setInterval(fetchScan, TIMER * 1_000);
    return () => clearInterval(iv);
  }, [fetchScan]);

  // Countdown
  useEffect(() => {
    const tick = setInterval(() => setCount(c => c > 0 ? c - 1 : 0), 1000);
    return () => clearInterval(tick);
  }, [lastUpdate]);

  // Filter + sort (memoized to avoid recomputing on every countdown tick)
  const filtered = useMemo(() => data
    .filter(i => dirFilter === "ALL" || i.direction === dirFilter)
    .filter(i => i.score_final >= minScore)
    .filter(i => !search || i.simbolo.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      if (sortBy === "score")      return b.score_final - a.score_final;
      if (sortBy === "confidence") return b.direction_confidence - a.direction_confidence;
      if (sortBy === "volume")     return b.volume24h - a.volume24h;
      return a.simbolo.localeCompare(b.simbolo);
    }), [data, dirFilter, minScore, search, sortBy]);

  const nFavoravel = data.filter(i => i.operar && i.direction !== "NEUTRO" && i.score_final >= T.BOM).length;
  const nOperar    = data.filter(i => i.operar).length;
  const bestScore  = data.length ? Math.max(...data.map(i => i.score_final)) : 0;
  const bestItem   = data.find(i => i.score_final === bestScore);

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <SinaisHubNav />

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-5">

        {/* ── Header ── */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-black" style={{ color: "var(--text-primary)" }}>RS Score</h1>
            <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
              Score integrado do backend · 50 ativos Binance Futuros · dados consolidados de todas as análises
            </p>
          </div>
          <div className="flex items-center gap-2">
            {lastUpdate && (
              <span className="text-[10px] flex items-center gap-1" style={{ color: "var(--text-muted)" }}>
                <span className={`w-1.5 h-1.5 rounded-full ${countdown > 5 ? "bg-emerald-400" : "bg-yellow-400 animate-pulse"}`}/>
                Próx. {countdown}s
              </span>
            )}
            <button onClick={fetchScan}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
              style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-muted)" }}>
              <RefreshCw size={12}/> Atualizar
            </button>
          </div>
        </div>

        {/* ── Stats cards ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Monitorando",       val: String(data.length),       color: "var(--text-primary)", sub: "ativos" },
            { label: "Operar",            val: String(nOperar),            color: "#10b981",             sub: "sinalizados" },
            { label: "Entradas ≥65",      val: String(nFavoravel),        color: nFavoravel>0?"#10b981":"#6b7280", sub: "favoráveis" },
            { label: "Melhor Score",      val: bestScore.toFixed(1),      color: scoreColor(bestScore),  sub: bestItem?.simbolo ?? "—" },
          ].map(s => (
            <div key={s.label} className="p-3 rounded-xl" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
              <p className="text-[10px] uppercase tracking-wide font-semibold" style={{ color: "var(--text-muted)" }}>{s.label}</p>
              <p className="text-2xl font-black tabular-nums mt-0.5" style={{ color: s.color }}>{s.val}</p>
              <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>{s.sub}</p>
            </div>
          ))}
        </div>

        {/* ── Threshold legend ── */}
        <div className="text-[10px] flex flex-wrap gap-3 items-center px-1">
          {[
            { label: "Excelente ≥80", color: "#10b981" },
            { label: "Bom ≥65",       color: "#3b82f6" },
            { label: "Regular ≥50",   color: "#f59e0b" },
            { label: "Fraco ≥35",     color: "#f97316" },
            { label: "Crítico <35",   color: "#ef4444" },
          ].map(t => (
            <span key={t.label} className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full inline-block" style={{ background: t.color }}/>
              <span style={{ color: "var(--text-muted)" }}>{t.label}</span>
            </span>
          ))}
        </div>

        {/* ── Filters ── */}
        <div className="flex flex-wrap gap-2 items-center">
          {/* Direction */}
          <div className="flex gap-0.5 p-0.5 rounded-xl" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
            {(["ALL","LONG","SHORT","NEUTRO"] as const).map(d => (
              <button key={d} onClick={() => setDir(d)}
                className="px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all"
                style={{
                  background: dirFilter===d ? (d==="LONG"?"#10b98122":d==="SHORT"?"#ef444422":d==="NEUTRO"?"#f59e0b22":"var(--bg)") : "transparent",
                  color: dirFilter===d ? (d==="LONG"?"#10b981":d==="SHORT"?"#ef4444":d==="NEUTRO"?"#f59e0b":"var(--text-primary)") : "var(--text-muted)",
                }}>
                {d === "ALL" ? "Todos" : d}
                <span className="ml-1 text-[9px] opacity-60">
                  ({d === "ALL" ? data.length : data.filter(i=>i.direction===d).length})
                </span>
              </button>
            ))}
          </div>

          {/* Score min */}
          <div className="flex gap-0.5 p-0.5 rounded-xl" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
            {[
              { val: 0,          label: "Todos" },
              { val: T.REGULAR,  label: "≥50 Regular" },
              { val: T.BOM,      label: "≥65 Bom" },
              { val: T.EXCELENTE,label: "≥80 Exc" },
            ].map(f => (
              <button key={f.val} onClick={() => setMin(f.val)}
                className="px-2.5 py-1.5 rounded-lg text-[10px] font-semibold transition-all"
                style={{
                  background: minScore===f.val ? scoreColor(f.val)+"22" : "transparent",
                  color: minScore===f.val ? scoreColor(f.val) : "var(--text-muted)",
                }}>
                {f.label}
              </button>
            ))}
          </div>

          {/* Sort */}
          <div className="flex gap-0.5 p-0.5 rounded-xl" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
            {([
              { val:"score",      label:"↓ Score" },
              { val:"confidence", label:"Confiança" },
              { val:"volume",     label:"Volume" },
              { val:"symbol",     label:"A→Z" },
            ] as const).map(s => (
              <button key={s.val} onClick={() => setSort(s.val)}
                className="px-2.5 py-1.5 rounded-lg text-[10px] font-semibold transition-all"
                style={{
                  background: sortBy===s.val ? "#3b82f622" : "transparent",
                  color: sortBy===s.val ? "#3b82f6" : "var(--text-muted)",
                }}>
                {s.label}
              </button>
            ))}
          </div>

          {/* Search */}
          <input type="text" placeholder="Buscar…" value={search} onChange={e => setSearch(e.target.value)}
            className="px-3 py-1.5 rounded-xl text-[11px] outline-none"
            style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-primary)", width: 100 }}/>

          <span className="ml-auto text-[11px]" style={{ color: "var(--text-muted)" }}>
            {filtered.length} de {data.length} ativos
          </span>
        </div>

        {/* ── Error ── */}
        {error && (
          <div className="p-3 rounded-xl text-sm" style={{ background: "#ef444415", border: "1px solid #ef444440", color: "#ef4444" }}>
            Erro ao buscar scan: {error}
          </div>
        )}

        {/* ── Loading skeleton ── */}
        {loading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array(6).fill(0).map((_,i) => (
              <div key={i} className="rounded-2xl p-5 animate-pulse" style={{ background: "var(--bg-card)", border: "1px solid var(--border)", height: 280 }}/>
            ))}
          </div>
        )}

        {/* ── Cards ── */}
        {!loading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(item => <AssetCard key={item.simbolo} item={item}/>)}
            {filtered.length === 0 && (
              <div className="col-span-full text-center py-16" style={{ color: "var(--text-muted)" }}>
                Nenhum ativo encontrado com os filtros aplicados.
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
