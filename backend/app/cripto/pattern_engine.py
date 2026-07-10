"""
Reconhecimento de padrões de candlestick, price action e estrutura de mercado.
Implementação em Python puro, sem dependências externas.
"""
from __future__ import annotations
import math
from typing import Optional


# ── Helpers ───────────────────────────────────────────────────────────────────

def _body(o: float, c: float) -> float:
    return abs(c - o)

def _upper(o: float, h: float, c: float) -> float:
    return h - max(o, c)

def _lower(o: float, l: float, c: float) -> float:
    return min(o, c) - l

def _avg_range(highs: list[float], lows: list[float], n: int = 14) -> float:
    vals = [highs[i] - lows[i] for i in range(max(0, len(highs) - n), len(highs))]
    return sum(vals) / len(vals) if vals else 1.0

def _is_bull(o: float, c: float) -> bool:
    return c > o

def _trend(closes: list[float], n: int = 10) -> str:
    if len(closes) < n:
        return "neutro"
    sma_old = sum(closes[-n:-n//2]) / (n // 2)
    sma_new = sum(closes[-n//2:]) / (n // 2)
    if sma_new > sma_old * 1.01:
        return "alta"
    if sma_new < sma_old * 0.99:
        return "baixa"
    return "neutro"


# ── Candlestick Patterns ──────────────────────────────────────────────────────

def detect_candlestick_patterns(
    opens: list[float],
    highs: list[float],
    lows: list[float],
    closes: list[float],
    lookback: int = 3,
) -> list[dict]:
    if len(closes) < 5:
        return []

    padroes: list[dict] = []
    avg_r = _avg_range(highs, lows)

    o1, h1, l1, c1 = opens[-1], highs[-1], lows[-1], closes[-1]
    o2, h2, l2, c2 = opens[-2], highs[-2], lows[-2], closes[-2]
    o3, h3, l3, c3 = opens[-3], highs[-3], lows[-3], closes[-3]

    body1   = _body(o1, c1)
    upper1  = _upper(o1, h1, c1)
    lower1  = _lower(o1, l1, c1)
    range1  = h1 - l1 or 0.001

    body2   = _body(o2, c2)
    upper2  = _upper(o2, h2, c2)
    lower2  = _lower(o2, l2, c2)

    trend_curto = _trend(closes, 10)

    def _add(nome: str, bullish: bool, confianca: float, desc: str = ""):
        padroes.append({
            "nome": nome,
            "bullish": bullish,
            "confianca": round(min(100, max(0, confianca)), 1),
            "descricao": desc,
        })

    # ── Doji ──
    if body1 < 0.1 * avg_r and range1 > 0.3 * avg_r:
        if lower1 > 0.4 * range1 and upper1 < 0.1 * range1:
            _add("Dragonfly Doji", True, 65, "Doji com sombra inferior longa — possível reversão de alta")
        elif upper1 > 0.4 * range1 and lower1 < 0.1 * range1:
            _add("Gravestone Doji", False, 65, "Doji com sombra superior longa — possível reversão de baixa")
        else:
            _add("Doji", _is_bull(o1, c1), 50, "Indecisão no mercado")

    # ── Spinning Top ──
    elif body1 < 0.25 * avg_r and upper1 > body1 and lower1 > body1:
        _add("Spinning Top", _is_bull(o1, c1), 45, "Indecisão com sombras equilibradas")

    # ── Hammer / Shooting Star ──
    elif lower1 >= 2 * body1 and upper1 <= 0.5 * body1 and body1 > 0:
        if trend_curto == "baixa":
            _add("Martelo", True, 75, "Sombra inferior longa em tendência de baixa — reversão possível")
        else:
            _add("Hanging Man", False, 60, "Martelo em topo — sinal de alerta")

    elif upper1 >= 2 * body1 and lower1 <= 0.5 * body1 and body1 > 0:
        if trend_curto == "alta":
            _add("Shooting Star", False, 75, "Sombra superior longa em topo — reversão de baixa")
        else:
            _add("Martelo Invertido", True, 60, "Possível reversão de alta")

    # ── Pin Bar ──
    elif lower1 >= 2.5 * body1 and upper1 < 0.3 * range1:
        _add("Pin Bar Bullish", True, 70, "Rejeição forte de preços baixos")
    elif upper1 >= 2.5 * body1 and lower1 < 0.3 * range1:
        _add("Pin Bar Bearish", False, 70, "Rejeição forte de preços altos")

    # ── Engulfing ──
    if body1 > avg_r * 0.5 and body2 > 0:
        if _is_bull(o1, c1) and not _is_bull(o2, c2):
            if c1 > o2 and o1 < c2:
                conf = 80 if trend_curto == "baixa" else 60
                _add("Engolfo de Alta", True, conf, "Candle bullish engole o bearish anterior")
        if not _is_bull(o1, c1) and _is_bull(o2, c2):
            if c1 < o2 and o1 > c2:
                conf = 80 if trend_curto == "alta" else 60
                _add("Engolfo de Baixa", False, conf, "Candle bearish engole o bullish anterior")

    # ── Inside Bar ──
    if h1 <= h2 and l1 >= l2 and range1 < 0.7 * (h2 - l2):
        _add("Inside Bar", _is_bull(o1, c1), 60, "Contração — rompimento provável")

    # ── Outside Bar ──
    if h1 > h2 and l1 < l2:
        _add("Outside Bar", _is_bull(o1, c1), 55, "Engolfo total do candle anterior")

    # ── Harami ──
    if body2 > avg_r * 0.5 and body1 < 0.5 * body2:
        if max(o1, c1) < max(o2, c2) and min(o1, c1) > min(o2, c2):
            bullish = _is_bull(o1, c1) and not _is_bull(o2, c2)
            _add("Harami " + ("Alta" if bullish else "Baixa"), bullish, 65,
                 "Pequeno candle dentro do corpo do anterior")

    # ── Piercing Line / Dark Cloud ──
    if not _is_bull(o2, c2) and _is_bull(o1, c1) and o1 < c2:
        mid2 = (o2 + c2) / 2
        if c1 > mid2:
            _add("Piercing Line", True, 72, "Recuperação acima do meio do candle bearish")
    if _is_bull(o2, c2) and not _is_bull(o1, c1) and o1 > c2:
        mid2 = (o2 + c2) / 2
        if c1 < mid2:
            _add("Dark Cloud Cover", False, 72, "Reversão acima do meio do candle bullish")

    # ── Morning Star / Evening Star (3 candles) ──
    if len(closes) >= 3:
        if not _is_bull(o3, c3) and _body(o3, c3) > avg_r * 0.4:
            if _body(o2, c2) < 0.3 * avg_r:
                if _is_bull(o1, c1) and c1 > (o3 + c3) / 2:
                    _add("Morning Star", True, 82, "Reversão de 3 velas — sinal forte de alta")
        if _is_bull(o3, c3) and _body(o3, c3) > avg_r * 0.4:
            if _body(o2, c2) < 0.3 * avg_r:
                if not _is_bull(o1, c1) and c1 < (o3 + c3) / 2:
                    _add("Evening Star", False, 82, "Reversão de 3 velas — sinal forte de baixa")

    # ── Three White Soldiers / Three Black Crows ──
    if len(closes) >= 3:
        if all(_is_bull(opens[-i], closes[-i]) for i in range(1, 4)):
            if all(_body(opens[-i], closes[-i]) > avg_r * 0.4 for i in range(1, 4)):
                _add("Three White Soldiers", True, 85, "3 velas bullish consecutivas — tendência forte")
        if all(not _is_bull(opens[-i], closes[-i]) for i in range(1, 4)):
            if all(_body(opens[-i], closes[-i]) > avg_r * 0.4 for i in range(1, 4)):
                _add("Three Black Crows", False, 85, "3 velas bearish consecutivas — pressão vendedora")

    return padroes


# ── Estrutura de Mercado ──────────────────────────────────────────────────────

def _swing_points(highs: list[float], lows: list[float], n: int = 3) -> dict:
    swing_h: list[tuple[int, float]] = []
    swing_l: list[tuple[int, float]] = []

    for i in range(n, len(highs) - n):
        if all(highs[i] >= highs[i + j] and highs[i] >= highs[i - j] for j in range(1, n + 1)):
            swing_h.append((i, highs[i]))
        if all(lows[i] <= lows[i + j] and lows[i] <= lows[i - j] for j in range(1, n + 1)):
            swing_l.append((i, lows[i]))

    return {"highs": swing_h[-10:], "lows": swing_l[-10:]}


def detect_market_structure(
    highs: list[float], lows: list[float], closes: list[float],
    lookback: int = 60,
) -> dict:
    n = min(lookback, len(closes))
    h = highs[-n:]
    l = lows[-n:]
    c = closes[-n:]

    swings = _swing_points(h, l)
    sh = swings["highs"]
    sl = swings["lows"]

    # Tendência primária (últimos topos/fundos)
    trend = "lateral"
    if len(sh) >= 2 and len(sl) >= 2:
        hh = sh[-1][1] > sh[-2][1]  # Higher High
        hl = sl[-1][1] > sl[-2][1]  # Higher Low
        lh = sh[-1][1] < sh[-2][1]  # Lower High
        ll = sl[-1][1] < sl[-2][1]  # Lower Low
        if hh and hl:
            trend = "alta"
        elif lh and ll:
            trend = "baixa"
        elif hh and ll:
            trend = "lateral"

    # BOS (Break of Structure)
    bos = False
    bos_direcao = None
    if sh and sl and len(c) >= 2:
        ultimo_topo = sh[-1][1]
        ultimo_fundo = sl[-1][1]
        if c[-1] > ultimo_topo and c[-2] <= ultimo_topo:
            bos = True
            bos_direcao = "alta"
        elif c[-1] < ultimo_fundo and c[-2] >= ultimo_fundo:
            bos = True
            bos_direcao = "baixa"

    # CHOCH (Change of Character)
    choch = False
    if trend == "alta" and len(sl) >= 2:
        if sl[-1][1] < sl[-2][1]:  # HL se torna LL
            choch = True
    elif trend == "baixa" and len(sh) >= 2:
        if sh[-1][1] > sh[-2][1]:  # LH se torna HH
            choch = True

    # Suportes e resistências (dos swing points)
    preco = c[-1]
    suportes = sorted(
        [p for _, p in sl if p < preco], reverse=True
    )[:4]
    resistencias = sorted(
        [p for _, p in sh if p > preco]
    )[:4]

    # Força da tendência (EMA slope)
    if len(c) >= 20:
        from .indicators import ema as calc_ema
        e20_rec = calc_ema(list(c[-20:]), 20)
        e20_old = calc_ema(list(c[-40:-20]), 20) if len(c) >= 40 else e20_rec
        slope = (e20_rec - e20_old) / e20_old * 100 if e20_old and e20_rec else 0
    else:
        slope = 0

    return {
        "tendencia_primaria": trend,
        "swing_highs":        [round(p, 2) for _, p in sh[-5:]],
        "swing_lows":         [round(p, 2) for _, p in sl[-5:]],
        "bos":                bos,
        "bos_direcao":        bos_direcao,
        "choch":              choch,
        "suportes":           [round(p, 2) for p in suportes],
        "resistencias":       [round(p, 2) for p in resistencias],
        "slope_ema20_pct":    round(slope, 2),
    }


# ── Padrões Gráficos ──────────────────────────────────────────────────────────

def detect_chart_patterns(
    highs: list[float], lows: list[float], closes: list[float],
    lookback: int = 60,
) -> list[dict]:
    n = min(lookback, len(closes))
    h = highs[-n:]
    l = lows[-n:]
    c = closes[-n:]
    padroes: list[dict] = []

    if len(c) < 20:
        return padroes

    preco = c[-1]
    alto  = max(h)
    baixo = min(l)
    rng   = alto - baixo or 0.001

    # ── Double Top ──
    swings = _swing_points(h, l, n=2)
    sh = swings["highs"]
    if len(sh) >= 2:
        t1, t2 = sh[-2][1], sh[-1][1]
        if abs(t1 - t2) / t1 < 0.03 and preco < min(t1, t2) * 0.98:
            padroes.append({
                "nome": "Topo Duplo",
                "bullish": False,
                "confianca": 72.0,
                "descricao": f"Dois topos em {round(t1,2)} e {round(t2,2)} — reversão de baixa provável",
            })

    # ── Double Bottom ──
    sl = swings["lows"]
    if len(sl) >= 2:
        f1, f2 = sl[-2][1], sl[-1][1]
        if abs(f1 - f2) / f1 < 0.03 and preco > max(f1, f2) * 1.02:
            padroes.append({
                "nome": "Fundo Duplo",
                "bullish": True,
                "confianca": 72.0,
                "descricao": f"Dois fundos em {round(f1,2)} e {round(f2,2)} — reversão de alta provável",
            })

    # ── Head & Shoulders ──
    if len(sh) >= 3:
        l_sh, h_sh, r_sh = sh[-3][1], sh[-2][1], sh[-1][1]
        if h_sh > l_sh and h_sh > r_sh and abs(l_sh - r_sh) / l_sh < 0.05:
            neckline = min(lows[sh[-3][0]:sh[-2][0]] + lows[sh[-2][0]:sh[-1][0]])
            if preco < neckline * 1.01:
                padroes.append({
                    "nome": "Ombro-Cabeça-Ombro",
                    "bullish": False,
                    "confianca": 78.0,
                    "descricao": "Padrão clássico de reversão de baixa",
                })

    # ── Inverse H&S ──
    if len(sl) >= 3:
        l_sl, h_sl, r_sl = sl[-3][1], sl[-2][1], sl[-1][1]
        if h_sl < l_sl and h_sl < r_sl and abs(l_sl - r_sl) / l_sl < 0.05:
            padroes.append({
                "nome": "OCO Invertido",
                "bullish": True,
                "confianca": 78.0,
                "descricao": "Padrão clássico de reversão de alta",
            })

    # ── Triangle (ascending / descending / symmetric) ──
    if len(c) >= 20:
        highs_last = max(h[-20:])
        lows_last  = min(l[-20:])
        highs_q1   = max(h[-20:-10])
        highs_q2   = max(h[-10:])
        lows_q1    = min(l[-20:-10])
        lows_q2    = min(l[-10:])

        flat_top  = abs(highs_q1 - highs_q2) / highs_q1 < 0.02
        flat_bot  = abs(lows_q1  - lows_q2)  / lows_q1  < 0.02
        rise_bot  = lows_q2 > lows_q1 * 1.01
        fall_top  = highs_q2 < highs_q1 * 0.99

        if flat_top and rise_bot:
            padroes.append({"nome": "Triângulo Ascendente", "bullish": True,  "confianca": 70.0,
                            "descricao": "Resistência plana + fundos subindo — rompimento provável de alta"})
        elif flat_bot and fall_top:
            padroes.append({"nome": "Triângulo Descendente", "bullish": False, "confianca": 70.0,
                            "descricao": "Suporte plano + topos caindo — rompimento provável de baixa"})
        elif fall_top and rise_bot:
            padroes.append({"nome": "Triângulo Simétrico", "bullish": None, "confianca": 60.0,
                            "descricao": "Compressão de volatilidade — rompimento iminente"})

    # ── Flag / Pennant ──
    if len(c) >= 15:
        move_5  = (c[-11] - c[-15]) / c[-15] if c[-15] else 0
        consol  = (max(h[-10:]) - min(l[-10:])) / c[-10] if c[-10] else 1
        if abs(move_5) > 0.08 and consol < 0.05:
            bullish_flag = move_5 > 0
            padroes.append({
                "nome": "Bandeira " + ("de Alta" if bullish_flag else "de Baixa"),
                "bullish": bullish_flag,
                "confianca": 68.0,
                "descricao": "Consolidação após movimento forte — continuação esperada",
            })

    return padroes


# ── Fibonacci Avançado ────────────────────────────────────────────────────────

def fibonacci_avancado(
    highs: list[float], lows: list[float], closes: list[float],
    lookback: int = 90,
) -> dict:
    n  = min(lookback, len(closes))
    h  = highs[-n:]
    l  = lows[-n:]
    c  = closes[-n:]

    alto  = max(h)
    baixo = min(l)
    diff  = alto - baixo or 0.001
    preco = c[-1]

    niveis_ret = {
        "0.0":   round(alto,              2),
        "0.236": round(alto - 0.236*diff, 2),
        "0.382": round(alto - 0.382*diff, 2),
        "0.5":   round(alto - 0.5  *diff, 2),
        "0.618": round(alto - 0.618*diff, 2),
        "0.786": round(alto - 0.786*diff, 2),
        "1.0":   round(baixo,             2),
    }

    niveis_ext = {
        "1.272": round(alto + 0.272*diff, 2),
        "1.414": round(alto + 0.414*diff, 2),
        "1.618": round(alto + 0.618*diff, 2),
        "2.0":   round(alto + 1.0  *diff, 2),
        "2.618": round(alto + 1.618*diff, 2),
    }

    pos_pct = (preco - baixo) / diff

    # Nível de suporte mais próximo abaixo
    sup_fib = max((v for v in niveis_ret.values() if v < preco), default=None)
    res_fib = min((v for v in niveis_ret.values() if v > preco), default=None)

    # Proximidade ao Golden Ratio
    golden = niveis_ret["0.618"]
    dist_golden_pct = abs(preco - golden) / golden * 100

    # Força do nível (quantas confluências Fib próximas)
    confluencias = sum(1 for v in list(niveis_ret.values()) + list(niveis_ext.values())
                       if abs(v - preco) / preco < 0.015)

    return {
        "alto":          round(alto, 2),
        "baixo":         round(baixo, 2),
        "retracoes":     niveis_ret,
        "extensoes":     niveis_ext,
        "posicao_pct":   round(pos_pct, 4),
        "suporte_fib":   sup_fib,
        "resistencia_fib": res_fib,
        "dist_golden_pct": round(dist_golden_pct, 2),
        "confluencias":  confluencias,
    }
