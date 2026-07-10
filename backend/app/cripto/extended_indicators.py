"""
Indicadores técnicos avançados (extensão de indicators.py).
Supertrend, Parabolic SAR, Ichimoku, Awesome Oscillator, Keltner, Donchian, VWAP.
"""
from __future__ import annotations
import math
from typing import Optional
from .indicators import _ema_series, atr as calc_atr


# ── Supertrend ────────────────────────────────────────────────────────────────

def supertrend(
    highs: list[float], lows: list[float], closes: list[float],
    period: int = 10, factor: float = 3.0,
) -> Optional[dict]:
    if len(closes) < period + 1:
        return None

    trs = []
    for i in range(1, len(closes)):
        h, l, pc = highs[i], lows[i], closes[i - 1]
        trs.append(max(h - l, abs(h - pc), abs(l - pc)))

    atr_s: list[Optional[float]] = [None] * period
    atr_val = sum(trs[:period]) / period
    atr_s.append(atr_val)
    for tr in trs[period:]:
        atr_val = (atr_val * (period - 1) + tr) / period
        atr_s.append(atr_val)

    direction = 1  # 1=bullish, -1=bearish
    st_val = None

    for i in range(period, len(closes)):
        if atr_s[i] is None:
            continue
        mid = (highs[i] + lows[i]) / 2
        upper = mid + factor * atr_s[i]
        lower = mid - factor * atr_s[i]

        if st_val is None:
            st_val = lower if direction == 1 else upper
            continue

        if direction == 1:
            new_st = lower
            if closes[i] < new_st:
                direction = -1
                st_val = upper
            else:
                st_val = max(new_st, st_val)
        else:
            new_st = upper
            if closes[i] > new_st:
                direction = 1
                st_val = lower
            else:
                st_val = min(new_st, st_val)

    if st_val is None:
        return None

    return {
        "valor":   round(st_val, 2),
        "direcao": "alta" if direction == 1 else "baixa",
        "sinal":   "compra" if direction == 1 else "venda",
    }


# ── Parabolic SAR ─────────────────────────────────────────────────────────────

def parabolic_sar(
    highs: list[float], lows: list[float], closes: list[float],
    af_start: float = 0.02, af_max: float = 0.2,
) -> Optional[dict]:
    if len(closes) < 5:
        return None

    bull = closes[1] > closes[0]
    sar  = lows[0] if bull else highs[0]
    ep   = highs[0] if bull else lows[0]
    af   = af_start

    for i in range(1, len(closes)):
        prev_sar = sar
        sar = prev_sar + af * (ep - prev_sar)

        if bull:
            sar = min(sar, lows[i - 1], lows[max(0, i - 2)])
            if highs[i] > ep:
                ep = highs[i]
                af = min(af + af_start, af_max)
            if closes[i] < sar:
                bull = False
                sar  = ep
                ep   = lows[i]
                af   = af_start
        else:
            sar = max(sar, highs[i - 1], highs[max(0, i - 2)])
            if lows[i] < ep:
                ep = lows[i]
                af = min(af + af_start, af_max)
            if closes[i] > sar:
                bull = True
                sar  = ep
                ep   = highs[i]
                af   = af_start

    return {
        "valor":   round(sar, 2),
        "direcao": "alta" if bull else "baixa",
        "sinal":   "compra" if bull else "venda",
    }


# ── Awesome Oscillator ────────────────────────────────────────────────────────

def awesome_oscillator(highs: list[float], lows: list[float]) -> Optional[float]:
    if len(highs) < 34:
        return None
    mids = [(highs[i] + lows[i]) / 2 for i in range(len(highs))]

    sma5  = sum(mids[-5:])  / 5
    sma34 = sum(mids[-34:]) / 34
    return round(sma5 - sma34, 2)


# ── Keltner Channel ───────────────────────────────────────────────────────────

def keltner_channel(
    highs: list[float], lows: list[float], closes: list[float],
    ema_period: int = 20, atr_period: int = 10, mult: float = 2.0,
) -> Optional[dict]:
    if len(closes) < max(ema_period, atr_period) + 1:
        return None
    ema_s = _ema_series(closes, ema_period)
    mid   = next((v for v in reversed(ema_s) if v is not None), None)
    atr_v = calc_atr(highs, lows, closes, atr_period)
    if mid is None or atr_v is None:
        return None

    preco = closes[-1]
    upper = round(mid + mult * atr_v, 2)
    lower = round(mid - mult * atr_v, 2)
    mid   = round(mid, 2)

    if preco > upper:
        sinal = "venda"
    elif preco < lower:
        sinal = "compra"
    else:
        pos = (preco - lower) / (upper - lower) if upper != lower else 0.5
        sinal = "compra" if pos < 0.4 else "venda" if pos > 0.6 else "neutro"

    return {"upper": upper, "middle": mid, "lower": lower, "sinal": sinal}


# ── Donchian Channel ──────────────────────────────────────────────────────────

def donchian_channel(
    highs: list[float], lows: list[float], period: int = 20,
) -> Optional[dict]:
    if len(highs) < period:
        return None
    upper = max(highs[-period:])
    lower = min(lows[-period:])
    mid   = (upper + lower) / 2
    return {
        "upper":  round(upper, 2),
        "middle": round(mid,   2),
        "lower":  round(lower, 2),
    }


# ── VWAP ─────────────────────────────────────────────────────────────────────

def vwap(
    highs: list[float], lows: list[float],
    closes: list[float], volumes: list[float],
    period: int = 20,
) -> Optional[float]:
    n = min(period, len(closes))
    if n < 2:
        return None
    tp_sum = sum(
        (highs[i] + lows[i] + closes[i]) / 3 * (volumes[i] or 0)
        for i in range(-n, 0)
    )
    vol_sum = sum(volumes[i] or 0 for i in range(-n, 0))
    return round(tp_sum / vol_sum, 2) if vol_sum > 0 else None


# ── Ichimoku (simplificado) ───────────────────────────────────────────────────

def _minmax(highs: list[float], lows: list[float], start: int, end: int):
    h = max(highs[start:end])
    l = min(lows[start:end])
    return (h + l) / 2


def ichimoku(
    highs: list[float], lows: list[float], closes: list[float],
    t: int = 9, k: int = 26, s: int = 52,
) -> Optional[dict]:
    if len(closes) < s + k:
        return None

    tenkan = _minmax(highs, lows, -t, len(highs))
    kijun  = _minmax(highs, lows, -k, len(highs))

    # Span A (shift k back = current lagged cloud)
    span_a = (tenkan + kijun) / 2

    # Span B
    span_b = _minmax(highs, lows, -(s + k), -k) if len(highs) > s + k else None

    preco = closes[-1]
    chikou_ref = closes[-k - 1] if len(closes) > k else None

    above_cloud = None
    if span_b is not None:
        cloud_top = max(span_a, span_b)
        cloud_bot = min(span_a, span_b)
        if preco > cloud_top:
            above_cloud = "acima"
        elif preco < cloud_bot:
            above_cloud = "abaixo"
        else:
            above_cloud = "dentro"

    tk_cross = "compra" if tenkan > kijun else "venda" if tenkan < kijun else "neutro"
    chikou_sinal = "compra" if (chikou_ref and preco > chikou_ref) else "venda" if chikou_ref else "neutro"

    score = 0.0
    if above_cloud == "acima":      score += 40
    elif above_cloud == "dentro":   score += 20
    if tk_cross == "compra":        score += 35
    if chikou_sinal == "compra":    score += 25

    return {
        "tenkan":        round(tenkan, 2),
        "kijun":         round(kijun,  2),
        "span_a":        round(span_a, 2),
        "span_b":        round(span_b, 2) if span_b else None,
        "posicao_nuvem": above_cloud,
        "tk_cross":      tk_cross,
        "chikou":        chikou_sinal,
        "sinal":         "compra" if score >= 60 else "venda" if score <= 25 else "neutro",
        "score_interno": round(score, 1),
    }
