"""
Indicadores técnicos em Python puro (sem pandas/numpy).
Recebe listas OHLCV e retorna valores + sinais.
"""
from __future__ import annotations
import math
from typing import Optional


def _safe(v) -> Optional[float]:
    if v is None:
        return None
    try:
        f = float(v)
        return None if (math.isnan(f) or math.isinf(f)) else f
    except (TypeError, ValueError):
        return None


# ── Médias ───────────────────────────────────────────────────────────────────

def sma(prices: list[float], period: int) -> Optional[float]:
    vals = [p for p in prices[-period:] if p is not None]
    if len(vals) < period:
        return None
    return sum(vals) / period


def _ema_series(prices: list[float], period: int) -> list[Optional[float]]:
    clean = [p for p in prices if p is not None]
    if len(clean) < period:
        return [None] * len(prices)
    k = 2.0 / (period + 1)
    result: list[Optional[float]] = [None] * (period - 1)
    seed = sum(clean[:period]) / period
    result.append(seed)
    for p in clean[period:]:
        result.append(p * k + result[-1] * (1 - k))
    return result


def ema(prices: list[float], period: int) -> Optional[float]:
    s = _ema_series(prices, period)
    vals = [v for v in s if v is not None]
    return round(vals[-1], 2) if vals else None


def _sinal_ema(preco: float, ema_val: Optional[float]) -> str:
    if ema_val is None:
        return "neutro"
    if preco > ema_val:
        return "compra"
    if preco < ema_val:
        return "venda"
    return "neutro"


# ── RSI ──────────────────────────────────────────────────────────────────────

def rsi(closes: list[float], period: int = 14) -> Optional[float]:
    clean = [p for p in closes if p is not None]
    if len(clean) < period + 1:
        return None
    deltas = [clean[i] - clean[i - 1] for i in range(1, len(clean))]
    gains  = [max(0.0, d) for d in deltas[:period]]
    losses = [max(0.0, -d) for d in deltas[:period]]
    ag = sum(gains) / period
    al = sum(losses) / period
    for d in deltas[period:]:
        ag = (ag * (period - 1) + max(0.0, d)) / period
        al = (al * (period - 1) + max(0.0, -d)) / period
    if al == 0:
        return 100.0
    rs = ag / al
    return round(100 - 100 / (1 + rs), 2)


def rsi_sinal(v: Optional[float]) -> str:
    if v is None:
        return "neutro"
    if v < 30:
        return "compra"
    if v > 70:
        return "venda"
    return "neutro"


# ── MACD ─────────────────────────────────────────────────────────────────────

def macd(closes: list[float], fast=12, slow=26, signal=9) -> Optional[dict]:
    clean = [p for p in closes if p is not None]
    if len(clean) < slow + signal:
        return None
    ema_f = _ema_series(clean, fast)
    ema_s = _ema_series(clean, slow)
    line = [
        (f - s) if f is not None and s is not None else None
        for f, s in zip(ema_f, ema_s)
    ]
    valid_line = [v for v in line if v is not None]
    if len(valid_line) < signal:
        return None
    sig_series = _ema_series(valid_line, signal)
    valid_sig  = [v for v in sig_series if v is not None]
    if not valid_sig:
        return None

    m_val  = round(valid_line[-1], 2)
    s_val  = round(valid_sig[-1], 2)
    hist   = round(m_val - s_val, 2)
    p_hist = round(valid_line[-2] - valid_sig[-2], 2) if len(valid_line) >= 2 and len(valid_sig) >= 2 else None

    if hist > 0:
        sinal = "compra" if (p_hist is None or hist > p_hist) else "compra"
    else:
        sinal = "venda"

    return {"macd": m_val, "signal": s_val, "histograma": hist, "sinal": sinal}


# ── Bollinger Bands ───────────────────────────────────────────────────────────

def bollinger(closes: list[float], period=20, mult=2.0) -> Optional[dict]:
    clean = [p for p in closes[-period:] if p is not None]
    if len(clean) < period:
        return None
    mid  = sum(clean) / period
    std  = math.sqrt(sum((p - mid) ** 2 for p in clean) / period)
    up   = round(mid + mult * std, 2)
    lo   = round(mid - mult * std, 2)
    mid  = round(mid, 2)
    preco = clean[-1]
    if preco <= lo:
        sinal = "compra"
    elif preco >= up:
        sinal = "venda"
    else:
        sinal = "neutro"
    return {"upper": up, "middle": mid, "lower": lo, "sinal": sinal}


# ── ATR ──────────────────────────────────────────────────────────────────────

def atr(highs: list[float], lows: list[float], closes: list[float], period=14) -> Optional[float]:
    if len(closes) < period + 1:
        return None
    trs = []
    for i in range(1, len(closes)):
        h = highs[i] or closes[i]
        l = lows[i] or closes[i]
        pc = closes[i - 1]
        trs.append(max(h - l, abs(h - pc), abs(l - pc)))
    if len(trs) < period:
        return None
    # Wilder smoothing
    atr_val = sum(trs[:period]) / period
    for tr in trs[period:]:
        atr_val = (atr_val * (period - 1) + tr) / period
    return round(atr_val, 2)


# ── OBV ──────────────────────────────────────────────────────────────────────

def obv_signal(closes: list[float], volumes: list[float]) -> str:
    if len(closes) < 10:
        return "neutro"
    obvs = [0.0]
    for i in range(1, len(closes)):
        if closes[i] > closes[i - 1]:
            obvs.append(obvs[-1] + volumes[i])
        elif closes[i] < closes[i - 1]:
            obvs.append(obvs[-1] - volumes[i])
        else:
            obvs.append(obvs[-1])
    recent = obvs[-10:]
    trend = recent[-1] - recent[0]
    if trend > 0:
        return "compra"
    if trend < 0:
        return "venda"
    return "neutro"


# ── Suportes e Resistências ──────────────────────────────────────────────────

def suportes_resistencias(highs: list[float], lows: list[float], closes: list[float]) -> dict:
    preco = closes[-1]
    # Pivot points dos últimos 90 dias (aprox)
    n = min(90, len(closes))
    sub_h = highs[-n:]
    sub_l = lows[-n:]

    pivots_up   = []
    pivots_down = []
    for i in range(2, len(sub_h) - 2):
        if sub_h[i] > sub_h[i-1] and sub_h[i] > sub_h[i-2] and sub_h[i] > sub_h[i+1] and sub_h[i] > sub_h[i+2]:
            pivots_up.append(sub_h[i])
        if sub_l[i] < sub_l[i-1] and sub_l[i] < sub_l[i-2] and sub_l[i] < sub_l[i+1] and sub_l[i] < sub_l[i+2]:
            pivots_down.append(sub_l[i])

    resist_raw = sorted([p for p in pivots_up if p > preco], reverse=False)[:3]
    suport_raw = sorted([p for p in pivots_down if p < preco], reverse=True)[:3]

    # Fallback com percentuais se não houver pivots suficientes
    while len(resist_raw) < 3:
        base = resist_raw[-1] if resist_raw else preco
        resist_raw.append(round(base * 1.05, 2))
    while len(suport_raw) < 3:
        base = suport_raw[-1] if suport_raw else preco
        suport_raw.append(round(base * 0.95, 2))

    def _dist(p):
        return round((p - preco) / preco * 100, 2)

    return {
        "suportes":    [{"preco": round(p,2), "distancia_pct": _dist(p)} for p in suport_raw[:3]],
        "resistencias":[{"preco": round(p,2), "distancia_pct": _dist(p)} for p in resist_raw[:3]],
    }


# ── Fibonacci ─────────────────────────────────────────────────────────────────

def fibonacci(highs: list[float], lows: list[float], closes: list[float]) -> dict:
    n = min(90, len(closes))
    alto  = max(highs[-n:])
    baixo = min(lows[-n:])
    diff  = alto - baixo
    preco = closes[-1]

    niveis = {
        "0.0":   round(alto, 2),
        "0.236": round(alto - 0.236 * diff, 2),
        "0.382": round(alto - 0.382 * diff, 2),
        "0.5":   round(alto - 0.500 * diff, 2),
        "0.618": round(alto - 0.618 * diff, 2),
        "0.786": round(alto - 0.786 * diff, 2),
        "1.0":   round(baixo, 2),
    }

    pos_pct = (preco - baixo) / diff if diff > 0 else 0.5
    ratios = [0.0, 0.236, 0.382, 0.5, 0.618, 0.786, 1.0]
    levels = [1.0 - r for r in ratios]  # % from low
    entre = ["—", "—"]
    for i in range(len(levels) - 1):
        if levels[i] <= pos_pct <= levels[i + 1]:
            entre = [str(ratios[i+1]), str(ratios[i])]
            break

    return {
        "baixo": round(baixo, 2),
        "alto":  round(alto, 2),
        "niveis": niveis,
        "posicao_pct": round(pos_pct, 4),
        "entre": entre,
    }


# ── Volatilidade ─────────────────────────────────────────────────────────────

def volatilidade(closes: list[float], period=30) -> dict:
    clean = [p for p in closes if p is not None]
    if len(clean) < period + 1:
        return {"vol_30d_pct": None, "vol_anualizada_pct": None, "drawdown_maximo_pct": None}

    returns = [math.log(clean[i] / clean[i-1]) for i in range(1, len(clean))]
    ret30   = returns[-period:]
    mean30  = sum(ret30) / len(ret30)
    vol30   = math.sqrt(sum((r - mean30)**2 for r in ret30) / len(ret30))  # daily
    vol_anual = vol30 * math.sqrt(252)

    # Max drawdown (janela completa)
    peak = clean[0]
    max_dd = 0.0
    for p in clean:
        if p > peak:
            peak = p
        dd = (p - peak) / peak
        if dd < max_dd:
            max_dd = dd

    # Sharpe e Sortino (simplificado, taxa livre de risco = 0)
    if vol30 > 0:
        sharpe  = (mean30 * 252) / (vol30 * math.sqrt(252))
        neg_rets = [r for r in returns[-period:] if r < 0]
        downside = math.sqrt(sum(r**2 for r in neg_rets) / len(neg_rets)) * math.sqrt(252) if neg_rets else 0.001
        sortino  = (mean30 * 252) / downside
    else:
        sharpe = sortino = 0.0

    return {
        "vol_30d_pct":       round(vol30 * 100, 2),
        "vol_anualizada_pct":round(vol_anual * 100, 2),
        "drawdown_maximo_pct":round(max_dd * 100, 2),
        "sharpe":  round(sharpe, 2),
        "sortino": round(sortino, 2),
    }


# ── Rentabilidade histórica ───────────────────────────────────────────────────

def rentabilidade(candles: list[dict]) -> dict:
    if not candles:
        return {}
    closes = {c["data"]: c["fechamento"] for c in candles}
    ultimo_close = candles[-1]["fechamento"]
    ultimo_data  = candles[-1]["data"]

    def _ret(dias: int) -> Optional[float]:
        from datetime import datetime, timedelta
        alvo = (datetime.strptime(ultimo_data, "%Y-%m-%d") - timedelta(days=dias)).strftime("%Y-%m-%d")
        # busca data mais próxima
        for offset in range(5):
            from datetime import datetime as dt2
            d = (dt2.strptime(alvo, "%Y-%m-%d") + timedelta(days=offset)).strftime("%Y-%m-%d")
            if d in closes:
                ref = closes[d]
                if ref and ref > 0:
                    return round((ultimo_close - ref) / ref * 100, 2)
        return None

    return {
        "7d":  _ret(7),
        "30d": _ret(30),
        "90d": _ret(90),
        "180d":_ret(180),
        "1a":  _ret(365),
    }


# ── Tendência ─────────────────────────────────────────────────────────────────

def tendencia(closes: list[float]) -> dict:
    p = closes[-1]
    e9   = ema(closes, 9)
    e21  = ema(closes, 21)
    e50  = ema(closes, 50)
    e200 = ema(closes, 200)

    def _trend(fast, slow):
        if fast is None or slow is None:
            return "neutra"
        ratio = (fast - slow) / slow * 100
        if ratio > 3:   return "muito_alta"
        if ratio > 0.5: return "alta"
        if ratio < -3:  return "muito_baixa"
        if ratio < -0.5:return "baixa"
        return "neutra"

    return {
        "curto_prazo":  _trend(e9,  e21),
        "medio_prazo":  _trend(e21, e50),
        "longo_prazo":  _trend(e50, e200),
    }


# ── Probabilidades (log-normal) ───────────────────────────────────────────────

def _ncdf(x: float) -> float:
    """CDF da Normal padrão (aprox. Abramowitz & Stegun)."""
    t = 1.0 / (1.0 + 0.2316419 * abs(x))
    d = 0.3989423 * math.exp(-x * x / 2)
    p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.7814779 + t * (-1.8212560 + t * 1.3302744))))
    return 1.0 - p if x > 0 else p


def probabilidades(closes: list[float], vol_30d_pct: Optional[float]) -> dict:
    if not closes or vol_30d_pct is None or vol_30d_pct <= 0:
        return {}
    sigma_d = vol_30d_pct / 100
    preco   = closes[-1]
    T       = 30  # horizonte em dias

    def _p_acima(pct: float) -> float:
        target  = preco * (1 + pct)
        ln_r    = math.log(target / preco)
        sigma_T = sigma_d * math.sqrt(T)
        z       = ln_r / sigma_T
        return round(_ncdf(-z) * 100, 1)

    def _p_abaixo(pct: float) -> float:
        target  = preco * (1 - pct)
        ln_r    = math.log(target / preco)
        sigma_T = sigma_d * math.sqrt(T)
        z       = ln_r / sigma_T
        return round(_ncdf(z) * 100, 1)

    return {
        "subir_10":  _p_acima(0.10),
        "subir_20":  _p_acima(0.20),
        "subir_50":  _p_acima(0.50),
        "cair_10":   _p_abaixo(0.10),
        "cair_20":   _p_abaixo(0.20),
        "cair_50":   _p_abaixo(0.50),
    }


# ── ADX (Average Directional Index) ─────────────────────────────────────────

def adx(highs: list[float], lows: list[float], closes: list[float], period: int = 14) -> Optional[dict]:
    """ADX + DI±. ADX > 25 = tendência forte."""
    if len(highs) < period * 2 + 1:
        return None

    trs, pdms, mdms = [], [], []
    for i in range(1, len(closes)):
        h, l, pc = highs[i], lows[i], closes[i-1]
        tr   = max(h - l, abs(h - pc), abs(l - pc))
        pdm  = max(h - highs[i-1], 0) if h - highs[i-1] > lows[i-1] - l else 0
        mdm  = max(lows[i-1] - l, 0) if lows[i-1] - l > h - highs[i-1] else 0
        trs.append(tr); pdms.append(pdm); mdms.append(mdm)

    def _wilder(data: list, p: int) -> list:
        s = [sum(data[:p])]
        for v in data[p:]:
            s.append(s[-1] - s[-1] / p + v)
        return s

    atr_s = _wilder(trs, period)
    pdm_s = _wilder(pdms, period)
    mdm_s = _wilder(mdms, period)

    pdi = [100 * pdm_s[i] / atr_s[i] for i in range(len(atr_s)) if atr_s[i] > 0]
    mdi = [100 * mdm_s[i] / atr_s[i] for i in range(len(atr_s)) if atr_s[i] > 0]
    n   = min(len(pdi), len(mdi))
    if n == 0:
        return None

    dx_list = [
        abs(pdi[i] - mdi[i]) / (pdi[i] + mdi[i]) * 100
        for i in range(n) if pdi[i] + mdi[i] > 0
    ]
    if len(dx_list) < period:
        return None

    adx_s = _wilder(dx_list, period)
    adx_v = adx_s[-1] if adx_s else None

    sinal   = "forte" if adx_v and adx_v >= 25 else "fraco"
    direcao = "alta"  if pdi[-1] > mdi[-1]     else "baixa"

    return {
        "adx":      round(adx_v, 2) if adx_v else None,
        "plus_di":  round(pdi[-1], 2),
        "minus_di": round(mdi[-1], 2),
        "sinal":    sinal,
        "direcao":  direcao,
    }


# ── ROC (Rate of Change) ─────────────────────────────────────────────────────

def roc(closes: list[float], period: int = 10) -> Optional[float]:
    if len(closes) < period + 1:
        return None
    base = closes[-period - 1]
    return round((closes[-1] - base) / base * 100, 2) if base else None


# ── CCI (Commodity Channel Index) ───────────────────────────────────────────

def cci(highs: list[float], lows: list[float], closes: list[float], period: int = 20) -> Optional[float]:
    if len(closes) < period:
        return None
    tp  = [(highs[i] + lows[i] + closes[i]) / 3 for i in range(len(closes))]
    win = tp[-period:]
    m   = sum(win) / period
    md  = sum(abs(x - m) for x in win) / period
    return round((tp[-1] - m) / (0.015 * md), 2) if md else None


# ── MFI (Money Flow Index) ───────────────────────────────────────────────────

def mfi(highs: list[float], lows: list[float], closes: list[float],
        volumes: list[float], period: int = 14) -> Optional[float]:
    if len(closes) < period + 1 or not volumes:
        return None
    tp = [(highs[i] + lows[i] + closes[i]) / 3 for i in range(len(closes))]
    pos, neg = 0.0, 0.0
    for i in range(-period, 0):
        raw = tp[i] * (volumes[i] or 0)
        if tp[i] > tp[i - 1]:
            pos += raw
        else:
            neg += raw
    return round(100 - 100 / (1 + pos / neg), 2) if neg else 100.0


# ── Stochastic RSI ───────────────────────────────────────────────────────────

def stoch_rsi(closes: list[float], rsi_per: int = 14, k: int = 3, d: int = 3) -> Optional[dict]:
    if len(closes) < rsi_per * 2 + k + d + 5:
        return None

    def _rsi_at(data, idx, p):
        if idx < p:
            return None
        w = data[idx - p: idx + 1]
        gains  = [max(0, w[i] - w[i-1]) for i in range(1, len(w))]
        losses = [max(0, w[i-1] - w[i]) for i in range(1, len(w))]
        ag = sum(gains)  / p
        al = sum(losses) / p
        return 100.0 if al == 0 else round(100 - 100 / (1 + ag / al), 2)

    rsi_s = [_rsi_at(closes, i, rsi_per) for i in range(rsi_per, len(closes))]
    rsi_s = [r for r in rsi_s if r is not None]
    if len(rsi_s) < rsi_per + k:
        return None

    raw_k = []
    for i in range(rsi_per, len(rsi_s)):
        win = rsi_s[i - rsi_per: i + 1]
        lo, hi = min(win), max(win)
        raw_k.append(50.0 if hi == lo else (rsi_s[i] - lo) / (hi - lo) * 100)

    k_vals = [sum(raw_k[max(0, i - k + 1): i + 1]) / min(k, i + 1) for i in range(len(raw_k))]
    if len(k_vals) < d:
        return None

    k_val = k_vals[-1]
    d_val = sum(k_vals[-d:]) / d
    sinal = "compra" if k_val < 20 else "venda" if k_val > 80 else "neutro"
    return {"k": round(k_val, 2), "d": round(d_val, 2), "sinal": sinal}


# ── Williams %R ──────────────────────────────────────────────────────────────

def williams_r(highs: list[float], lows: list[float], closes: list[float], period: int = 14) -> Optional[float]:
    if len(closes) < period:
        return None
    h = max(highs[-period:])
    l = min(lows[-period:])
    return round((h - closes[-1]) / (h - l) * -100, 2) if h != l else -50.0


# ── Retornos para comparativo ─────────────────────────────────────────────────

def retornos_simples(closes: list[float]) -> list[float]:
    """Retornos percentuais diários simples."""
    return [
        (closes[i] - closes[i-1]) / closes[i-1]
        for i in range(1, len(closes))
        if closes[i-1] > 0
    ]
