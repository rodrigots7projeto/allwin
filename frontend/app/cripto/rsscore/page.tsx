"use client";
import { useState, useEffect, useCallback, useRef, memo } from "react";

const FAPI      = "https://fapi.binance.com";
const CACHE_TTL = 30_000;
const CACHE_MAX = 120;

// ── Thresholds alinhados com o padrão AllWin (80/65/50/35) ───────────────────
const T = { EXCELENTE: 80, BOM: 65, REGULAR: 50, FRACO: 35 } as const;

// ── Types ─────────────────────────────────────────────────────────────────────

interface Candle { t: number; o: number; h: number; l: number; c: number; v: number; }
interface AggTrade { p: number; q: number; isBuyerMaker: boolean; }

interface AssetMarketData {
  symbol: string; price: number;
  candles4h: Candle[]; candles1h: Candle[];
  ema20_4h: number[]; ema50_4h: number[];
  ema20_1h: number[]; ema50_1h: number[];
  rsi4h: number; rsi1h: number; atr: number;
  volumeAvg: number; volumeCurrent: number;
  openInterest: number; openInterestPrev: number;
  fundingRate: number; cvd: number;
  support: number[]; resistance: number[];
}

interface PBBKResult { type: "pullback" | "breakout"; score: number; details: string[]; }

interface RSScoreResult {
  symbol: string; direction: "long" | "short"; totalScore: number; rrRatio: number;
  breakdown: {
    trend: number; location: number;
    pullbackOrBreakout: PBBKResult;
    flow: number; riskReward: number;
  };
  gatesFailed: string[];
  antiTopPenaltyApplied: boolean; btcPenaltyApplied: boolean;
  decision: "favoravel" | "aguardar_pullback" | "aguardar_confirmacao" | "nao_entrar";
}

interface AssetConfig { symbol: string; direction: "long" | "short"; }
type AssetState = { loading: boolean; data?: AssetMarketData; score?: RSScoreResult; error?: string; ts?: number; };

// ── Math ──────────────────────────────────────────────────────────────────────

function calcEMA(values: number[], period: number): number[] {
  if (!values.length) return [];
  const k = 2 / (period + 1);
  const out: number[] = [values[0]];
  for (let i = 1; i < values.length; i++) out.push(values[i] * k + out[i - 1] * (1 - k));
  return out;
}

function calcRSI(candles: Candle[], period = 14): number {
  if (candles.length < period + 1) return 50;
  const cl = candles.map(c => c.c);
  let g = 0, l = 0;
  for (let i = 1; i <= period; i++) { const d = cl[i] - cl[i - 1]; d > 0 ? (g += d) : (l -= d); }
  let ag = g / period, al = l / period;
  for (let i = period + 1; i < cl.length; i++) {
    const d = cl[i] - cl[i - 1];
    ag = (ag * (period - 1) + Math.max(0, d)) / period;
    al = (al * (period - 1) + Math.max(0, -d)) / period;
  }
  return al === 0 ? 100 : 100 - 100 / (1 + ag / al);
}

function calcATR(candles: Candle[], period = 14): number {
  if (candles.length < 2) return 0;
  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++)
    trs.push(Math.max(candles[i].h - candles[i].l, Math.abs(candles[i].h - candles[i-1].c), Math.abs(candles[i].l - candles[i-1].c)));
  return trs.slice(-period).reduce((a, b) => a + b, 0) / Math.min(trs.length, period);
}

function detectSR(candles: Candle[], price: number, atr: number) {
  const sup: number[] = [], res: number[] = [];
  for (let i = 2; i < candles.length - 2; i++) {
    const c = candles[i];
    if (c.l < candles[i-1].l && c.l < candles[i-2].l && c.l < candles[i+1].l && c.l < candles[i+2].l
      && c.l < price && sup.every(s => Math.abs(s - c.l) > atr * 0.4)) sup.push(c.l);
    if (c.h > candles[i-1].h && c.h > candles[i-2].h && c.h > candles[i+1].h && c.h > candles[i+2].h
      && c.h > price && res.every(r => Math.abs(r - c.h) > atr * 0.4)) res.push(c.h);
  }
  return { support: sup.sort((a,b)=>b-a).slice(0,3), resistance: res.sort((a,b)=>a-b).slice(0,3) };
}

function parseCandles(raw: unknown[]): Candle[] {
  return (raw as unknown[][]).map(k => ({
    t:Number(k[0]), o:Number(k[1]), h:Number(k[2]), l:Number(k[3]), c:Number(k[4]), v:Number(k[5]),
  }));
}

/**
 * CVD via Binance aggTrades.
 * isBuyerMaker=false → comprador agressor → delta +qty (pressão compradora)
 * isBuyerMaker=true  → vendedor agressor  → delta -qty (pressão vendedora)
 * CVD > 0 = fluxo comprador dominante.
 */
function calculateCVD(trades: AggTrade[]): number {
  return trades.reduce((acc, t) => acc + (t.isBuyerMaker ? -t.q : t.q), 0);
}

// ── Score engine ──────────────────────────────────────────────────────────────

function scoreTrend(
  c4h: Candle[], c1h: Candle[],
  e20_4h: number[], e50_4h: number[],
  e20_1h: number[], e50_1h: number[],
  dir: "long" | "short",
): number {
  const LAG = 5;
  const n4 = e20_4h.length, n1 = e20_1h.length;
  const up4  = n4 > LAG && e20_4h[n4-1] > e20_4h[n4-1-LAG] && e50_4h[n4-1] > e50_4h[n4-1-LAG];
  const up1  = n1 > LAG && e20_1h[n1-1] > e20_1h[n1-1-LAG] && e50_1h[n1-1] > e50_1h[n1-1-LAG];
  const r4   = c4h.slice(-10);
  let strPts = 0;
  for (let i = 1; i < r4.length; i++) {
    if (r4[i].h > r4[i-1].h) strPts++; else strPts--;
    if (r4[i].l > r4[i-1].l) strPts++; else strPts--;
  }
  const strUp = strPts > 4;
  const aligned = dir === "long"
    ? [up4, up1, strUp].filter(Boolean).length
    : [!up4, !up1, !strUp].filter(Boolean).length;
  return aligned === 3 ? 20 : aligned === 2 ? 15 : aligned === 1 ? 8 : 0;
}

function scorePBBK(
  c1h: Candle[], price: number, e20: number, e50: number,
  support: number[], resistance: number[],
  volAvg: number, volCurr: number,
  cvd: number, oi: number, oiPrev: number,
  atr: number, dir: "long" | "short",
): PBBKResult {
  const details: string[] = [];
  const lastC = c1h[c1h.length - 1];
  const nearestRes = resistance[0];
  const nearestSup = support[0];
  const isBreakout = dir === "long"
    ? nearestRes != null && lastC?.c > nearestRes
    : nearestSup != null && lastC?.c < nearestSup;

  if (isBreakout) {
    let s = 0;
    s += 8; details.push(dir === "long" ? "Fechou acima da resistência +8" : "Fechou abaixo do suporte +8");
    if (volCurr > volAvg * 1.3) { s += 6; details.push("Volume acima da média ×1.3 +6"); }
    if (oi > oiPrev)            { s += 6; details.push("Open Interest subindo +6"); }
    return { type: "breakout", score: Math.min(s, 20), details };
  }

  let s = 0;
  const nearEMA  = Math.min(Math.abs(price - e20), Math.abs(price - e50)) < atr * 0.8;
  const nearSup  = nearestSup  != null && Math.abs(price - nearestSup)  < atr;
  if (nearEMA || nearSup) { s += 8; details.push("Preço em zona de EMA/suporte +8"); }
  if (volCurr < volAvg * 0.8) { s += 6; details.push("Volume baixo na correção +6"); }
  if (dir === "long" ? cvd > 0 : cvd < 0) { s += 6; details.push("CVD favorável à entrada +6"); }
  return { type: "pullback", score: Math.min(s, 20), details };
}

function calculateRSScore(
  data: AssetMarketData,
  dir: "long" | "short",
  btcData?: AssetMarketData | null,
): RSScoreResult {
  const { price, atr, support, resistance, fundingRate, openInterest, openInterestPrev, volumeAvg, volumeCurrent, cvd } = data;
  const gatesFailed: string[] = [];
  const e20 = data.ema20_4h[data.ema20_4h.length - 1] ?? price;
  const e50 = data.ema50_4h[data.ema50_4h.length - 1] ?? price;

  const stopDist = Math.max(atr * 1.5, price * 0.001);
  const stopP  = dir === "long" ? price - stopDist : price + stopDist;
  const targetP = dir === "long" ? (resistance[0] ?? price + stopDist * 2.5) : (support[0] ?? price - stopDist * 2.5);
  const rrRatio = Math.abs(targetP - price) / Math.abs(price - stopP);

  if (rrRatio < 1.5) gatesFailed.push(`R:R insuficiente: 1:${rrRatio.toFixed(1)} (mín. 1:1.5)`);

  const trend = scoreTrend(data.candles4h, data.candles1h, data.ema20_4h, data.ema50_4h, data.ema20_1h, data.ema50_1h, dir);

  let btcPenaltyApplied = false;
  if (btcData && data.symbol !== "BTCUSDT" && btcData.ema20_4h.length > 5) {
    const btcSame = scoreTrend(btcData.candles4h, btcData.candles1h, btcData.ema20_4h, btcData.ema50_4h, btcData.ema20_1h, btcData.ema50_1h, dir);
    const btcOpp  = scoreTrend(btcData.candles4h, btcData.candles1h, btcData.ema20_4h, btcData.ema50_4h, btcData.ema20_1h, btcData.ema50_1h, dir === "long" ? "short" : "long");
    if (btcOpp > btcSame && btcOpp >= 15) {
      btcPenaltyApplied = true;
      gatesFailed.push("Contra tendência do BTC 4H — penalidade −30%");
    }
  }

  const minDist  = Math.min(Math.abs(price - e20), Math.abs(price - e50));
  const distATR  = atr > 0 ? minDist / atr : 2;
  let location   = distATR <= 0.5 ? 20 : distATR <= 1.5 ? 12 : Math.max(0, 5 - Math.floor(distATR - 1.5));
  if (dir === "long" && support[0]    && Math.abs(price - support[0])    < atr * 0.5) location = Math.min(20, location + 4);
  if (dir === "short" && resistance[0] && Math.abs(price - resistance[0]) < atr * 0.5) location = Math.min(20, location + 4);

  const pbbk = scorePBBK(data.candles1h, price, e20, e50, support, resistance, volumeAvg, volumeCurrent, cvd, openInterest, openInterestPrev, atr, dir);

  let flow = 0;
  const lastC = data.candles1h[data.candles1h.length - 1];
  const prevC = data.candles1h[data.candles1h.length - 2];
  const oiWithDir = dir === "long"
    ? openInterest > openInterestPrev && (lastC?.c ?? 0) > (prevC?.c ?? 0)
    : openInterest > openInterestPrev && (lastC?.c ?? 0) < (prevC?.c ?? 0);
  if (oiWithDir) flow += 6;
  if (dir === "long" ? cvd > 0 : cvd < 0) flow += 6;
  const frOk = dir === "long" ? fundingRate >= -0.0003 && fundingRate <= 0.0005 : fundingRate <= 0.0003 && fundingRate >= -0.0005;
  if (frOk) flow += 4;
  if (Math.abs(fundingRate) > 0.0008) flow += 4;

  const riskReward = rrRatio >= 3 ? 20 : rrRatio >= 2 ? 15 : rrRatio >= 1.5 ? 10 : 0;

  let total = trend + location + pbbk.score + flow + riskReward;
  if (btcPenaltyApplied) total = Math.round(total * 0.7);

  let antiTopPenaltyApplied = false;
  if (pbbk.type === "pullback") {
    const rsi = data.rsi4h;
    const recent6 = data.candles1h.slice(-6);
    const consec  = recent6.length >= 5 && (recent6.every(c => c.c > c.o) || recent6.every(c => c.c < c.o));
    const frEx    = dir === "long" && fundingRate > 0.001;
    const nearR   = dir === "long" && resistance[0] != null && (resistance[0] - price) < atr;
    const rsiEx   = dir === "long" ? rsi > 75 : rsi < 25;
    if ([rsiEx, consec, frEx, nearR].filter(Boolean).length >= 2) { total -= 15; antiTopPenaltyApplied = true; }
  }

  const hardGate   = gatesFailed.some(g => !g.includes("penalidade"));
  const finalScore = Math.max(0, Math.min(100, hardGate ? Math.min(total, 20) : total));

  let decision: RSScoreResult["decision"];
  if (finalScore < T.REGULAR || hardGate) decision = "nao_entrar";
  else if (finalScore >= T.EXCELENTE)     decision = "favoravel";
  else if (pbbk.type === "pullback" && location < 12) decision = "aguardar_pullback";
  else decision = "aguardar_confirmacao";

  return {
    symbol: data.symbol, direction: dir, totalScore: finalScore, rrRatio,
    breakdown: { trend, location, pullbackOrBreakout: pbbk, flow, riskReward },
    gatesFailed, antiTopPenaltyApplied, btcPenaltyApplied, decision,
  };
}

// ── Cache ─────────────────────────────────────────────────────────────────────

const _cache = new Map<string, { ts: number; data: unknown }>();

function fromCache<T>(key: string): T | null {
  const e = _cache.get(key);
  return e && Date.now() - e.ts < CACHE_TTL ? (e.data as T) : null;
}

function setCache<T>(key: string, d: T): T {
  if (_cache.size >= CACHE_MAX) { const first = _cache.keys().next().value; if (first) _cache.delete(first); }
  _cache.set(key, { ts: Date.now(), data: d });
  return d;
}

function invalidateAsset(symbol: string) {
  for (const k of _cache.keys()) { if (k.includes(symbol)) _cache.delete(k); }
}

// ── API (Binance fapi — públic, sem auth) ─────────────────────────────────────

async function fetchCandles(symbol: string, interval: string, limit = 60): Promise<Candle[]> {
  const key = `k-${symbol}-${interval}`;
  const cached = fromCache<Candle[]>(key); if (cached) return cached;
  try {
    const r = await fetch(`${FAPI}/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`);
    if (!r.ok) return [];
    return setCache(key, parseCandles(await r.json()));
  } catch { return []; }
}

async function fetchOI(symbol: string): Promise<{ current: number; prev: number }> {
  const key = `oi-${symbol}`;
  const cached = fromCache<{ current: number; prev: number }>(key); if (cached) return cached;
  try {
    const [curr, hist] = await Promise.all([
      fetch(`${FAPI}/fapi/v1/openInterest?symbol=${symbol}`).then(r => r.json()),
      fetch(`${FAPI}/futures/data/openInterestHist?symbol=${symbol}&period=5m&limit=2`).then(r => r.json()).catch(() => []),
    ]);
    const current = Number(curr?.openInterest ?? 0);
    const prev    = hist?.[0]?.sumOpenInterest ? Number(hist[0].sumOpenInterest) : current * 0.995;
    return setCache(key, { current, prev });
  } catch { return { current: 0, prev: 0 }; }
}

async function fetchFR(symbol: string): Promise<number> {
  const key = `fr-${symbol}`;
  const cached = fromCache<number>(key); if (cached !== null) return cached;
  try {
    const d = await fetch(`${FAPI}/fapi/v1/fundingRate?symbol=${symbol}&limit=1`).then(r => r.json());
    return setCache(key, Number(d?.[0]?.fundingRate ?? 0));
  } catch { return 0; }
}

async function fetchAggTrades(symbol: string): Promise<AggTrade[]> {
  const key = `agg-${symbol}`;
  const cached = fromCache<AggTrade[]>(key); if (cached) return cached;
  try {
    const d = await fetch(`${FAPI}/fapi/v1/aggTrades?symbol=${symbol}&limit=300`).then(r => r.json());
    return setCache(key, (d as { p: string; q: string; m: boolean }[]).map(t => ({ p: +t.p, q: +t.q, isBuyerMaker: t.m })));
  } catch { return []; }
}

async function fetchAssetData(symbol: string): Promise<AssetMarketData> {
  const key = `asset-${symbol}`;
  const cached = fromCache<AssetMarketData>(key); if (cached) return cached;

  const [c4h, c1h, oi, fr, agg] = await Promise.all([
    fetchCandles(symbol, "4h", 60),
    fetchCandles(symbol, "1h", 60),
    fetchOI(symbol),
    fetchFR(symbol),
    fetchAggTrades(symbol),
  ]);

  const price  = c1h[c1h.length - 1]?.c ?? 0;
  const atr    = calcATR(c4h);
  const cl4    = c4h.map(c => c.c);
  const cl1    = c1h.map(c => c.c);
  const e20_4h = calcEMA(cl4, 20);
  const e50_4h = calcEMA(cl4, 50);
  const e20_1h = calcEMA(cl1, 20);
  const e50_1h = calcEMA(cl1, 50);
  const { support, resistance } = detectSR(c4h, price, atr);
  const vols     = c1h.slice(-20).map(c => c.v);
  const volAvg   = vols.reduce((a, b) => a + b, 0) / (vols.length || 1);
  const cvd      = calculateCVD(agg);

  return setCache(key, {
    symbol, price, candles4h: c4h, candles1h: c1h,
    ema20_4h: e20_4h, ema50_4h: e50_4h, ema20_1h: e20_1h, ema50_1h: e50_1h,
    rsi4h: calcRSI(c4h), rsi1h: calcRSI(c1h), atr,
    volumeAvg: volAvg, volumeCurrent: c1h[c1h.length - 1]?.v ?? 0,
    openInterest: oi.current, openInterestPrev: oi.prev,
    fundingRate: fr, cvd, support, resistance,
  });
}

// ── Hook (parallel fetch, sem travar a UI) ────────────────────────────────────

function useRSScore(configs: AssetConfig[]) {
  const [states, setStates] = useState<Record<string, AssetState>>({});
  const btcRef  = useRef<AssetMarketData | null>(null);
  const cfgRef  = useRef(configs);
  useEffect(() => { cfgRef.current = configs; }, [configs]);

  const setOne = useCallback((symbol: string, patch: Partial<AssetState>) =>
    setStates(p => ({ ...p, [symbol]: { ...p[symbol], ...patch } })), []);

  const refresh = useCallback(async (onlySymbol?: string) => {
    const cfgs = onlySymbol
      ? cfgRef.current.filter(c => c.symbol === onlySymbol)
      : cfgRef.current;

    // Pré-fetch BTC para gate de regime (sem bloquear os outros)
    const needsBTC = cfgs.some(c => c.symbol !== "BTCUSDT");
    const btcPromise = needsBTC && !btcRef.current
      ? fetchAssetData("BTCUSDT").then(d => { btcRef.current = d; }).catch(() => {})
      : Promise.resolve();

    // Marcar loading
    cfgs.forEach(c => setOne(c.symbol, { loading: true }));

    // Fetch de todos em paralelo
    await Promise.all([
      btcPromise,
      ...cfgs.map(async cfg => {
        try {
          const data  = await fetchAssetData(cfg.symbol);
          if (cfg.symbol === "BTCUSDT") btcRef.current = data;
          const score = calculateRSScore(data, cfg.direction, btcRef.current);
          setOne(cfg.symbol, { loading: false, data, score, error: undefined, ts: Date.now() });
        } catch (e) {
          setOne(cfg.symbol, { loading: false, error: `Erro: ${e instanceof Error ? e.message : "API indisponível"}` });
        }
      }),
    ]);
  }, [setOne]);

  // Auto-refresh 30s
  useEffect(() => {
    refresh();
    const id = setInterval(() => refresh(), 30_000);
    return () => clearInterval(id);
  }, [refresh]);

  // Re-score imediato ao trocar direção sem re-fetch
  useEffect(() => {
    for (const cfg of cfgRef.current) {
      const st = states[cfg.symbol];
      if (st?.data && st.score?.direction !== cfg.direction) {
        const score = calculateRSScore(st.data, cfg.direction, btcRef.current);
        setOne(cfg.symbol, { score });
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configs]);

  const refreshOne = useCallback((symbol: string) => {
    invalidateAsset(symbol);
    refresh(symbol);
  }, [refresh]);

  return { states, refresh: () => refresh(), refreshOne };
}

// ── Helpers visuais ───────────────────────────────────────────────────────────

function fmtPrice(n: number) {
  return n >= 1000 ? n.toLocaleString("pt-BR", { maximumFractionDigits: 0 })
       : n >= 1    ? n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 })
       : n.toLocaleString("pt-BR", { minimumFractionDigits: 4, maximumFractionDigits: 6 });
}

function scoreColor(s: number) {
  if (s >= T.EXCELENTE) return "#10b981";
  if (s >= T.BOM)       return "#3b82f6";
  if (s >= T.REGULAR)   return "#f59e0b";
  if (s >= T.FRACO)     return "#f97316";
  return "#ef4444";
}

function scoreBg(s: number) { return scoreColor(s) + "18"; }

const DECISION_META = {
  favoravel:             { label: "Entrada Favorável",    dot: "🟢", color: "#10b981" },
  aguardar_pullback:     { label: "Aguardar Pullback",    dot: "🟡", color: "#eab308" },
  aguardar_confirmacao:  { label: "Aguardar Confirmação", dot: "🟠", color: "#f97316" },
  nao_entrar:            { label: "Não Entrar",           dot: "🔴", color: "#ef4444" },
} as const;

const CAT_META = [
  { key: "trend",              label: "Tendência",    max: 20, color: "#3b82f6" },
  { key: "location",           label: "Localização",  max: 20, color: "#a855f7" },
  { key: "pullbackOrBreakout", label: "PB / BK",      max: 20, color: "#f59e0b" },
  { key: "flow",               label: "Fluxo",        max: 20, color: "#10b981" },
  { key: "riskReward",         label: "R:R",          max: 20, color: "#ef4444" },
] as const;

// ── UI Components ─────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 animate-pulse">
      <div className="flex justify-between items-start mb-4">
        <div className="space-y-2">
          <div className="h-5 w-28 bg-[var(--border)] rounded-lg" />
          <div className="h-3 w-20 bg-[var(--border)] rounded" />
          <div className="h-3 w-16 bg-[var(--border)] rounded" />
        </div>
        <div className="w-16 h-16 rounded-full bg-[var(--border)]" />
      </div>
      <div className="h-8 w-full bg-[var(--border)] rounded-xl mb-3" />
      <div className="h-3 w-3/4 bg-[var(--border)] rounded mb-2" />
      <div className="h-3 w-1/2 bg-[var(--border)] rounded" />
    </div>
  );
}

function ScoreRing({ score, size = 64 }: { score: number; size?: number }) {
  const r = size / 2 - 5;
  const circ   = 2 * Math.PI * r;
  const offset = circ * (1 - score / 100);
  const color  = scoreColor(score);
  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color + "20"} strokeWidth="5" />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth="5"
          strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.6s cubic-bezier(0.4,0,0.2,1)" }} />
      </svg>
      <span className="absolute font-black text-sm" style={{ color }}>{score}</span>
    </div>
  );
}

function MiniBar({ score, max, color }: { score: number; max: number; color: string }) {
  return (
    <div className="h-1.5 rounded-full overflow-hidden bg-[var(--border)]">
      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${(score / max) * 100}%`, background: color }} />
    </div>
  );
}

const AssetCard = memo(function AssetCard({
  cfg, state, onRemove, onToggleDir, onRefresh,
}: { cfg: AssetConfig; state: AssetState; onRemove: () => void; onToggleDir: () => void; onRefresh: () => void; }) {
  const [expanded, setExpanded] = useState(false);
  const { score, data, loading, error } = state;

  // Esqueleto inicial
  if (!score && !error && (loading || !data)) return <SkeletonCard />;

  // Erro
  if (error) return (
    <div className="rounded-2xl border border-red-500/30 bg-[var(--bg-card)] p-5">
      <div className="flex justify-between">
        <span className="font-bold text-[var(--text-primary)]">{cfg.symbol.replace("USDT","")}</span>
        <button onClick={onRemove} className="text-xs text-red-400 hover:text-red-300 transition-colors">✕ Remover</button>
      </div>
      <div className="mt-3 text-xs text-red-400 bg-red-500/8 rounded-lg px-3 py-2 border border-red-500/20">
        ❌ {error}
      </div>
    </div>
  );

  if (!score || !data) return <SkeletonCard />;

  const meta    = DECISION_META[score.decision];
  const sc      = score.totalScore;
  const dir_c   = cfg.direction === "long" ? "#10b981" : "#ef4444";
  const fr      = data.fundingRate;
  const frColor = Math.abs(fr) > 0.001 ? "#ef4444" : Math.abs(fr) > 0.0005 ? "#f59e0b" : "#10b981";

  return (
    <div className={`rounded-2xl border bg-[var(--bg-card)] overflow-hidden transition-all duration-200 ${loading ? "opacity-60" : ""}`}
      style={{ borderColor: scoreColor(sc) + "35" }}>
      {/* Faixa de cor superior */}
      <div className="h-0.5 w-full" style={{ background: `linear-gradient(to right, ${scoreColor(sc)}, ${scoreColor(sc)}80)` }} />

      <div className="p-4 space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-black text-xl text-[var(--text-primary)] leading-none">{cfg.symbol.replace("USDT","")}</span>
              <button onClick={onToggleDir}
                className="px-2 py-0.5 rounded-full text-[10px] font-black transition-all border"
                style={{ background: dir_c + "15", color: dir_c, borderColor: dir_c + "40" }}>
                {cfg.direction === "long" ? "▲ LONG" : "▼ SHORT"}
              </button>
              {loading && <span className="text-[9px] text-[var(--text-secondary)] animate-pulse">atualizando…</span>}
            </div>
            <div className="font-mono font-bold text-[var(--text-primary)] mt-1">${fmtPrice(data.price)}</div>
            {/* Métricas rápidas */}
            <div className="flex gap-3 mt-1.5 text-[10px] flex-wrap">
              <span className="text-[var(--text-secondary)]">FR: <span style={{ color: frColor }}>{(fr * 100).toFixed(4)}%</span></span>
              <span className="text-[var(--text-secondary)]">RSI: <span className="font-semibold" style={{ color: data.rsi4h > 70 ? "#ef4444" : data.rsi4h < 30 ? "#10b981" : "var(--text-primary)" }}>{data.rsi4h.toFixed(0)}</span></span>
              <span className="text-[var(--text-secondary)]">RR: <span className="font-semibold" style={{ color: score.rrRatio >= 2 ? "#10b981" : "#f59e0b" }}>1:{score.rrRatio.toFixed(1)}</span></span>
              <span className="text-[var(--text-secondary)]">CVD: <span className={`font-semibold ${data.cvd > 0 ? "text-emerald-400" : "text-red-400"}`}>{data.cvd > 0 ? "+" : ""}{(data.cvd / 1000).toFixed(1)}k</span></span>
            </div>
          </div>
          {/* Score ring */}
          <div className="flex flex-col items-center gap-0.5 shrink-0">
            <ScoreRing score={sc} />
            <span className="text-[8px] uppercase font-bold" style={{ color: scoreColor(sc) }}>
              {sc >= T.EXCELENTE ? "Excelente" : sc >= T.BOM ? "Bom" : sc >= T.REGULAR ? "Regular" : "Fraco"}
            </span>
          </div>
        </div>

        {/* Decision badge */}
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl border"
          style={{ background: meta.color + "10", borderColor: meta.color + "30" }}>
          <span>{meta.dot}</span>
          <span className="text-xs font-bold" style={{ color: meta.color }}>{meta.label}</span>
          <span className="ml-auto text-[10px]" style={{ color: meta.color + "90" }}>
            {score.breakdown.pullbackOrBreakout.type === "breakout" ? "Rompimento" : "Pullback"}
          </span>
        </div>

        {/* Gates */}
        {score.gatesFailed.length > 0 && (
          <div className="space-y-1">
            {score.gatesFailed.map(g => (
              <div key={g} className="flex items-start gap-1.5 text-[10px] text-red-400 bg-red-500/8 border border-red-500/20 rounded-lg px-2.5 py-1.5">
                <span className="shrink-0">❌</span><span>{g}</span>
              </div>
            ))}
          </div>
        )}
        {score.antiTopPenaltyApplied && (
          <div className="flex items-center gap-1.5 text-[10px] text-amber-400 bg-amber-500/8 border border-amber-500/20 rounded-lg px-2.5 py-1.5">
            <span>⚠️</span><span>Filtro anti-topo aplicado (−15 pts)</span>
          </div>
        )}
        {score.btcPenaltyApplied && (
          <div className="flex items-center gap-1.5 text-[10px] text-orange-400 bg-orange-500/8 border border-orange-500/20 rounded-lg px-2.5 py-1.5">
            <span>₿</span><span>Penalidade regime BTC (−30%)</span>
          </div>
        )}

        {/* Mini score bars sempre visíveis */}
        <div className="grid grid-cols-5 gap-2">
          {CAT_META.map(cat => {
            const val = cat.key === "pullbackOrBreakout"
              ? score.breakdown.pullbackOrBreakout.score
              : (score.breakdown as unknown as Record<string, number>)[cat.key] ?? 0;
            return (
              <div key={cat.key} className="text-center">
                <div className="text-[8px] text-[var(--text-secondary)] mb-1 truncate">{cat.label}</div>
                <MiniBar score={val} max={cat.max} color={cat.color} />
                <div className="text-[9px] font-bold mt-0.5" style={{ color: cat.color }}>{val}</div>
              </div>
            );
          })}
        </div>

        {/* Botões */}
        <div className="flex gap-2">
          <button onClick={() => setExpanded(e => !e)}
            className="flex-1 py-2 rounded-xl border border-[var(--border)] text-[11px] font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-hover)] transition-all">
            {expanded ? "▲ Fechar detalhes" : "▼ Detalhar análise"}
          </button>
          <button onClick={onRefresh} title="Atualizar" className="px-3 py-2 rounded-xl border border-[var(--border)] text-[var(--text-secondary)] hover:text-blue-400 hover:border-blue-500/40 transition-all text-sm">
            ↻
          </button>
          <button onClick={onRemove} title="Remover" className="px-3 py-2 rounded-xl border border-red-500/20 text-red-400 hover:bg-red-500/10 transition-all text-sm">
            ✕
          </button>
        </div>
      </div>

      {/* Painel expandido */}
      {expanded && (
        <div className="border-t border-[var(--border)] px-4 py-4 space-y-4 bg-[var(--bg)]/50">
          {/* Breakdown completo */}
          <div>
            <div className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-3">Score por categoria</div>
            <div className="space-y-3">
              {CAT_META.map(cat => {
                const val = cat.key === "pullbackOrBreakout"
                  ? score.breakdown.pullbackOrBreakout.score
                  : (score.breakdown as unknown as Record<string, number>)[cat.key] ?? 0;
                return (
                  <div key={cat.key}>
                    <div className="flex justify-between text-[10px] mb-1">
                      <span className="text-[var(--text-secondary)]">{cat.label}</span>
                      <span className="font-bold tabular-nums" style={{ color: cat.color }}>{val} / {cat.max}</span>
                    </div>
                    <div className="h-2 rounded-full bg-[var(--border)]">
                      <div className="h-2 rounded-full transition-all duration-500" style={{ width: `${(val / cat.max) * 100}%`, background: cat.color }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Pontos detectados */}
          {score.breakdown.pullbackOrBreakout.details.length > 0 && (
            <div>
              <div className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-2">Pontos detectados</div>
              <div className="space-y-1">
                {score.breakdown.pullbackOrBreakout.details.map(d => (
                  <div key={d} className="flex items-center gap-2 text-[10px] text-emerald-400">
                    <span className="shrink-0">✓</span><span>{d}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Dados de mercado */}
          <div>
            <div className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-2">Contexto de mercado</div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2">
              {[
                { k: "ATR (4H)",           v: fmtPrice(data.atr),                                             c: "var(--text-primary)" },
                { k: "RSI (4H)",           v: data.rsi4h.toFixed(1),                                         c: data.rsi4h > 70 ? "#ef4444" : data.rsi4h < 30 ? "#10b981" : "var(--text-primary)" },
                { k: "RSI (1H)",           v: data.rsi1h.toFixed(1),                                         c: "var(--text-primary)" },
                { k: "Vol / Média",        v: `${(data.volumeCurrent / Math.max(data.volumeAvg, 1)).toFixed(2)}×`, c: data.volumeCurrent > data.volumeAvg * 1.3 ? "#10b981" : "var(--text-primary)" },
                { k: "Suporte",            v: data.support[0]    ? `$${fmtPrice(data.support[0])}`    : "—", c: "#10b981" },
                { k: "Resistência",        v: data.resistance[0] ? `$${fmtPrice(data.resistance[0])}` : "—", c: "#ef4444" },
                { k: "Funding Rate",       v: `${(fr * 100).toFixed(4)}%`,                                   c: frColor },
                { k: "Open Interest",      v: data.openInterest > 0 ? `${(data.openInterest / 1e6).toFixed(2)}M` : "—", c: "var(--text-primary)" },
              ].map(({ k, v, c }) => (
                <div key={k} className="flex justify-between text-[10px]">
                  <span className="text-[var(--text-secondary)]">{k}</span>
                  <span className="font-semibold tabular-nums" style={{ color: c }}>{v}</span>
                </div>
              ))}
            </div>
          </div>

          {state.ts && (
            <div className="text-[9px] text-[var(--text-secondary)] text-right">
              Atualizado {new Date(state.ts).toLocaleTimeString("pt-BR")}
            </div>
          )}
        </div>
      )}
    </div>
  );
});

function AddModal({ existing, onAdd, onClose }: { existing: string[]; onAdd: (s: string, d: "long" | "short") => void; onClose: () => void; }) {
  const [sym, setSym] = useState("");
  const [dir, setDir] = useState<"long" | "short">("long");
  const SUGGESTIONS = ["BTCUSDT","ETHUSDT","SOLUSDT","BNBUSDT","XRPUSDT","DOGEUSDT","ADAUSDT","AVAXUSDT","LINKUSDT","ARBUSDT","OPUSDT","SUIUSDT","NEARUSDT"];
  const avail = SUGGESTIONS.filter(s => !existing.includes(s));

  const submit = () => {
    let s = sym.trim().toUpperCase();
    if (!s) return;
    if (!s.endsWith("USDT")) s += "USDT";
    onAdd(s, dir); onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}
      onClick={onClose}>
      <div className="w-full max-w-sm bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-6 space-y-4 shadow-2xl"
        onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center">
          <h3 className="font-black text-[var(--text-primary)]">Adicionar ativo</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-[var(--border)]/50 text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center justify-center transition-colors">✕</button>
        </div>
        <input value={sym} onChange={e => setSym(e.target.value)} placeholder="Ex: BTCUSDT, ETH, SOL…"
          autoFocus
          className="w-full px-4 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg)] text-[var(--text-primary)] text-sm outline-none focus:border-blue-500 transition-colors"
          onKeyDown={e => e.key === "Enter" && submit()} />
        <div className="flex gap-2">
          {(["long","short"] as const).map(d => (
            <button key={d} onClick={() => setDir(d)}
              className={`flex-1 py-2 rounded-xl text-sm font-bold transition-all ${dir === d
                ? d === "long" ? "bg-emerald-500 text-white" : "bg-red-500 text-white"
                : "border border-[var(--border)] text-[var(--text-secondary)]"}`}>
              {d === "long" ? "▲ LONG" : "▼ SHORT"}
            </button>
          ))}
        </div>
        {avail.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {avail.slice(0, 8).map(s => (
              <button key={s} onClick={() => setSym(s)}
                className="px-2.5 py-1 rounded-lg bg-[var(--bg)] border border-[var(--border)] text-[10px] font-semibold text-[var(--text-secondary)] hover:border-blue-500/50 hover:text-blue-400 transition-colors">
                {s.replace("USDT","")}
              </button>
            ))}
          </div>
        )}
        <button onClick={submit}
          className="w-full py-3 rounded-xl font-bold text-sm transition-all"
          style={{ background: dir === "long" ? "#10b981" : "#ef4444", color: "#fff" }}>
          Adicionar {dir.toUpperCase()}
        </button>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

const DEFAULT_CONFIGS: AssetConfig[] = [
  { symbol: "BTCUSDT", direction: "long" },
  { symbol: "ETHUSDT", direction: "long" },
  { symbol: "SOLUSDT", direction: "long" },
];

const LS_KEY = "allwin_rsscore_v2";

export default function RSScorePage() {
  const [configs, setConfigs] = useState<AssetConfig[]>(() => {
    try { const s = localStorage.getItem(LS_KEY); return s ? JSON.parse(s) : DEFAULT_CONFIGS; } catch { return DEFAULT_CONFIGS; }
  });
  const [showAdd, setShowAdd]   = useState(false);
  const [sortBy, setSortBy]     = useState<"score" | "symbol">("score");
  const [filterDir, setFilterDir] = useState<"all" | "long" | "short">("all");
  const [countdown, setCountdown] = useState(30);

  const save = (cfgs: AssetConfig[]) => { try { localStorage.setItem(LS_KEY, JSON.stringify(cfgs)); } catch {} };

  const { states, refresh, refreshOne } = useRSScore(configs);

  // Countdown 30s
  useEffect(() => {
    const id = setInterval(() => setCountdown(c => c <= 1 ? 30 : c - 1), 1_000);
    return () => clearInterval(id);
  }, []);

  const addSymbol    = useCallback((symbol: string, direction: "long" | "short") =>
    setConfigs(p => { const n = [...p, { symbol, direction }]; save(n); return n; }), []);
  const removeSymbol = useCallback((symbol: string) =>
    setConfigs(p => { const n = p.filter(c => c.symbol !== symbol); save(n); return n; }), []);
  const toggleDir    = useCallback((symbol: string) =>
    setConfigs(p => { const n = p.map(c => c.symbol === symbol ? { ...c, direction: (c.direction === "long" ? "short" : "long") as "long" | "short" } : c); save(n); return n; }), []);

  // Sorted + filtered list
  const visible = configs
    .filter(c => filterDir === "all" || c.direction === filterDir)
    .sort((a, b) => {
      if (sortBy === "score") return (states[b.symbol]?.score?.totalScore ?? 0) - (states[a.symbol]?.score?.totalScore ?? 0);
      return a.symbol.localeCompare(b.symbol);
    });

  const nFavoravel = configs.filter(c => states[c.symbol]?.score?.decision === "favoravel").length;
  const bestScore  = Math.max(0, ...configs.map(c => states[c.symbol]?.score?.totalScore ?? 0));
  const loading    = configs.some(c => states[c.symbol]?.loading);

  return (
    <div className="max-w-5xl mx-auto px-4 pb-16 space-y-5">
      {/* Header */}
      <div className="pt-4 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-black text-[var(--text-primary)]">RS Score</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-0.5">Probabilidade de entrada · Futuros Binance · Público</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 text-[10px] text-[var(--text-secondary)]">
            {loading
              ? <><span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />Atualizando…</>
              : <><span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />Próx. {countdown}s</>}
          </div>
          <button onClick={() => { refresh(); setCountdown(30); }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[var(--border)] text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-hover)] transition-all">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={loading ? "animate-spin" : ""}>
              <path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
            </svg>
            Atualizar
          </button>
          <button onClick={() => setShowAdd(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-500 text-white text-xs font-bold hover:bg-blue-600 transition-all">
            + Ativo
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Monitorando",       val: String(configs.length),   cor: "var(--text-primary)" },
          { label: "Entradas favoráveis", val: String(nFavoravel),       cor: "#10b981"              },
          { label: "Melhor score",       val: String(bestScore),        cor: scoreColor(bestScore)  },
        ].map(({ label, val, cor }) => (
          <div key={label} className="p-3 rounded-xl border border-[var(--border)] bg-[var(--bg-card)]">
            <div className="text-[10px] text-[var(--text-secondary)]">{label}</div>
            <div className="text-2xl font-black mt-0.5 leading-none" style={{ color: cor }}>{val}</div>
          </div>
        ))}
      </div>

      {/* Filtros + ordenação */}
      <div className="flex gap-2 flex-wrap items-center">
        <div className="flex rounded-lg border border-[var(--border)] overflow-hidden text-xs font-semibold">
          {(["all","long","short"] as const).map(f => (
            <button key={f} onClick={() => setFilterDir(f)}
              className={`px-3 py-1.5 transition-colors ${filterDir === f ? "bg-[var(--text-primary)] text-[var(--bg)]" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}>
              {f === "all" ? "Todos" : f === "long" ? "▲ LONG" : "▼ SHORT"}
            </button>
          ))}
        </div>
        <div className="flex rounded-lg border border-[var(--border)] overflow-hidden text-xs font-semibold ml-auto">
          {(["score","symbol"] as const).map(s => (
            <button key={s} onClick={() => setSortBy(s)}
              className={`px-3 py-1.5 transition-colors ${sortBy === s ? "bg-[var(--text-primary)] text-[var(--bg)]" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}>
              {s === "score" ? "↓ Score" : "A→Z"}
            </button>
          ))}
        </div>
      </div>

      {/* Legenda */}
      <div className="flex gap-4 text-[10px] flex-wrap">
        {Object.entries(DECISION_META).map(([, m]) => (
          <span key={m.label} style={{ color: m.color }}>{m.dot} {m.label}</span>
        ))}
        <span className="text-[var(--text-secondary)] ml-auto">Thresholds: ≥{T.EXCELENTE} Excelente · ≥{T.BOM} Bom · ≥{T.REGULAR} Regular · &lt;{T.FRACO} Crítico</span>
      </div>

      {/* Cards */}
      {visible.length === 0 ? (
        <div className="text-center py-20 text-[var(--text-secondary)]">
          <div className="text-5xl mb-4">📐</div>
          <div className="font-semibold text-lg text-[var(--text-primary)]">Nenhum ativo monitorado</div>
          <div className="text-sm mt-1 mb-6">Adicione pares de futuros para análise em tempo real</div>
          <button onClick={() => setShowAdd(true)}
            className="px-6 py-3 rounded-xl bg-blue-500 text-white font-bold hover:bg-blue-600 transition-all">
            + Adicionar ativo
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {visible.map(cfg => (
            <AssetCard
              key={cfg.symbol}
              cfg={cfg}
              state={states[cfg.symbol] ?? { loading: true }}
              onRemove={() => removeSymbol(cfg.symbol)}
              onToggleDir={() => toggleDir(cfg.symbol)}
              onRefresh={() => refreshOne(cfg.symbol)}
            />
          ))}
        </div>
      )}

      {showAdd && <AddModal existing={configs.map(c => c.symbol)} onAdd={addSymbol} onClose={() => setShowAdd(false)} />}
    </div>
  );
}
