"""
Day Trade Engine — análise multi-timeframe inteligente.
Usa Binance klines (1m→1d) com todos os indicadores técnicos.
"""
from __future__ import annotations
import math
from typing import Optional

from .indicators import (
    rsi as calc_rsi, macd as calc_macd, ema as calc_ema,
    bollinger as calc_bollinger, atr as calc_atr, obv_signal,
    roc as calc_roc, cci as calc_cci, mfi as calc_mfi,
    williams_r as calc_wr, adx as calc_adx,
    fibonacci as calc_fib,
)
from .extended_indicators import supertrend as calc_supertrend, vwap as calc_vwap
from .pattern_engine import detect_candlestick_patterns, detect_market_structure


# ── Helpers ───────────────────────────────────────────────────────────────────

def _stoch(highs: list[float], lows: list[float], closes: list[float],
           k_period: int = 14, d_period: int = 3) -> Optional[dict]:
    """Stochastic Oscillator (K/D)."""
    if len(closes) < k_period + d_period:
        return None
    k_vals = []
    for i in range(k_period - 1, len(closes)):
        hh = max(highs[i - k_period + 1: i + 1])
        ll = min(lows[i - k_period + 1: i + 1])
        k_vals.append(100 * (closes[i] - ll) / (hh - ll) if hh != ll else 50.0)
    d_vals = [sum(k_vals[i: i + d_period]) / d_period for i in range(len(k_vals) - d_period + 1)]
    k, d = k_vals[-1], d_vals[-1]
    bull_cross = len(d_vals) >= 2 and k_vals[-2] < d_vals[-2] and k > d
    bear_cross = len(d_vals) >= 2 and k_vals[-2] > d_vals[-2] and k < d
    return {
        "k": round(k, 1), "d": round(d, 1),
        "overbought": k > 80, "oversold": k < 20,
        "bull_cross": bull_cross, "bear_cross": bear_cross,
    }


def _buying_pressure(buy_vols: list[float], total_vols: list[float],
                     lookback: int = 20) -> dict:
    """Comprador vs Vendedor via taker buy volumes da Binance."""
    n = min(lookback, len(buy_vols))
    if n == 0 or not total_vols:
        return {"buy_pct": 50.0, "sell_pct": 50.0, "delta": 0.0, "dominant": "neutro"}
    bv = sum(buy_vols[-n:])
    tv = sum(total_vols[-n:])
    if tv == 0:
        return {"buy_pct": 50.0, "sell_pct": 50.0, "delta": 0.0, "dominant": "neutro"}
    buy_pct = bv / tv * 100
    sell_pct = 100 - buy_pct
    delta = bv - (tv - bv)
    dominant = "compradores" if buy_pct > 55 else "vendedores" if sell_pct > 55 else "neutro"
    return {
        "buy_pct": round(buy_pct, 1),
        "sell_pct": round(sell_pct, 1),
        "delta": round(delta, 2),
        "dominant": dominant,
    }


def _pivot_points(high: float, low: float, close: float) -> dict:
    p = (high + low + close) / 3
    return {
        "pivot": round(p, 6),
        "r1": round(2 * p - low, 6),
        "r2": round(p + (high - low), 6),
        "r3": round(high + 2 * (p - low), 6),
        "s1": round(2 * p - high, 6),
        "s2": round(p - (high - low), 6),
        "s3": round(low - 2 * (high - p), 6),
    }


def _ema_multi(closes: list[float]) -> dict:
    """Calcula EMA 9/21/50/100/200 de uma vez."""
    return {
        "e9":   calc_ema(closes, 9),
        "e21":  calc_ema(closes, 21),
        "e50":  calc_ema(closes, 50),
        "e100": calc_ema(closes, 100),
        "e200": calc_ema(closes, 200),
    }


# ── Tendência por TF ─────────────────────────────────────────────────────────

def _identificar_tendencia(preco: float, closes: list[float],
                            emas: dict, adx_d: Optional[dict]) -> dict:
    e9, e21, e50, e200 = emas.get("e9"), emas.get("e21"), emas.get("e50"), emas.get("e200")

    bull = bear = total = 0
    if e9 and e21:
        total += 1
        if e9 > e21: bull += 1
        else: bear += 1
    if e21 and e50:
        total += 1
        if e21 > e50: bull += 1
        else: bear += 1
    if e200:
        total += 1
        if preco > e200: bull += 1
        else: bear += 1
    if len(closes) >= 10:
        total += 1
        if closes[-1] > closes[-10]: bull += 1
        else: bear += 1

    ratio = bull / total if total else 0.5
    adx_v = (adx_d or {}).get("adx", 0) or 0
    adx_bull = (adx_d or {}).get("direcao") == "alta"

    if adx_v >= 40:
        forca, conf_base = "Forte", 80
    elif adx_v >= 25:
        forca, conf_base = "Moderada", 65
    else:
        forca, conf_base = "Fraca", 40

    if ratio >= 0.75:
        tipo, direcao = "Alta" + (" Forte" if adx_v >= 40 else ""), "bullish"
    elif ratio >= 0.6:
        tipo, direcao = "Alta Moderada", "bullish"
    elif ratio <= 0.25:
        tipo, direcao = "Baixa" + (" Forte" if adx_v >= 40 else ""), "bearish"
    elif ratio <= 0.4:
        tipo, direcao = "Baixa Moderada", "bearish"
    else:
        tipo, direcao, forca, conf_base = "Lateral", "neutral", "Indefinida", 30

    confianca = min(95, conf_base + ratio * 20 if direcao == "bullish" else conf_base + (1 - ratio) * 20)
    return {
        "tipo": tipo.strip(), "forca": forca, "direcao": direcao,
        "confianca": round(confianca), "bull_pct": round(ratio * 100),
    }


# ── Score por TF ─────────────────────────────────────────────────────────────

def _score_tf(
    preco: float, emas: dict,
    rsi_v: Optional[float],
    macd_d: Optional[dict],
    boll_d: Optional[dict],
    adx_d: Optional[dict],
    stoch_d: Optional[dict],
    vwap_v: Optional[float],
    buy_p: dict,
    mfi_v: Optional[float],
    vol_ratio: float,
    obv_sig: str,
    supertrend_d: Optional[dict],
    wr_v: Optional[float],
    cci_v: Optional[float],
    patterns: list[dict],
) -> tuple[float, list[dict]]:

    pts = max_pts = 0.0
    fatores: list[dict] = []

    def add(p: float, mx: float, nome: str, desc: str):
        nonlocal pts, max_pts
        pts += p; max_pts += mx
        fatores.append({"nome": nome, "desc": desc, "pts": round(p, 1), "max": mx})

    e9, e21, e50, e100, e200 = emas.get("e9"), emas.get("e21"), emas.get("e50"), emas.get("e100"), emas.get("e200")

    # EMA Alignment (20 pts)
    if e9 and e21 and e50:
        if e9 > e21 > e50:
            add(16, 20, "EMA Alinhada Alta", f"EMA9({e9:.2f})>EMA21({e21:.2f})>EMA50({e50:.2f})")
        elif e9 > e21:
            add(10, 20, "EMA Parcial Alta", f"EMA9>EMA21 — tendência curta bullish")
        else:
            add(2, 20, "EMA Baixa", f"EMA9<EMA21 — tendência bearish")
    elif e9 and e21:
        add(10 if e9 > e21 else 2, 20, "EMA Curto Prazo", "")

    # EMA200 (10 pts)
    if e200:
        add(10 if preco > e200 else 0, 10, "EMA200", f"Preço {'acima' if preco > e200 else 'abaixo'} da EMA200")

    # RSI (15 pts)
    if rsi_v is not None:
        if 55 < rsi_v <= 70:
            add(13, 15, f"RSI Alta {rsi_v:.0f}", "RSI em zona de força compradora")
        elif 40 <= rsi_v <= 55:
            add(8, 15, f"RSI Neutro {rsi_v:.0f}", "RSI neutro — sem viés claro")
        elif rsi_v > 70:
            add(5, 15, f"RSI Sobrecomprado {rsi_v:.0f}", "Atenção: sobrecomprado")
        elif 30 <= rsi_v < 40:
            add(5, 15, f"RSI Fraqueza {rsi_v:.0f}", "RSI em fraqueza")
        else:
            add(7, 15, f"RSI Sobrevendido {rsi_v:.0f}", "Sobrevendido — potencial bounce")

    # MACD (10 pts)
    if macd_d:
        hist = macd_d.get("histograma", 0) or 0
        sig = macd_d.get("sinal", "neutro")
        if sig == "compra" and hist > 0:
            add(10, 10, "MACD Positivo", f"Histograma positivo ({hist:.4f})")
        elif sig == "compra":
            add(7, 10, "MACD Alta", "MACD cruzou para cima")
        else:
            add(2, 10, "MACD Negativo", f"Histograma negativo ({hist:.4f})")

    # ADX (8 pts)
    if adx_d and adx_d.get("adx") is not None:
        adx_v = adx_d["adx"]
        bull_dir = adx_d.get("direcao") == "alta"
        if adx_v >= 40:
            add(8 if bull_dir else 1, 8, f"ADX Forte {adx_v:.0f}", f"Tendência {'alta' if bull_dir else 'baixa'} muito forte")
        elif adx_v >= 25:
            add(6 if bull_dir else 2, 8, f"ADX Moderado {adx_v:.0f}", f"Tendência {'alta' if bull_dir else 'baixa'} estabelecida")
        else:
            add(4, 8, f"ADX Lateral {adx_v:.0f}", "Mercado sem tendência")

    # Stochastic (8 pts)
    if stoch_d:
        k, oversold, bull_cross = stoch_d["k"], stoch_d["oversold"], stoch_d["bull_cross"]
        if bull_cross and oversold:
            add(8, 8, f"Stoch Cruzamento Sobrevendido K={k:.0f}", "Sinal de compra forte!")
        elif bull_cross:
            add(6, 8, f"Stoch Cruzamento Alta K={k:.0f}", "Cruzamento bullish")
        elif oversold:
            add(5, 8, f"Stoch Sobrevendido K={k:.0f}", "Potencial entrada")
        elif stoch_d["overbought"]:
            add(2, 8, f"Stoch Sobrecomprado K={k:.0f}", "Zona de sobrecomprado")
        else:
            add(4, 8, f"Stoch Neutro K={k:.0f}", "Sem sinal claro")

    # VWAP (8 pts)
    if vwap_v:
        dist = (preco - vwap_v) / vwap_v * 100
        if dist > 1:
            add(8, 8, f"Acima VWAP +{dist:.1f}%", "Força compradora acima do VWAP")
        elif dist > 0:
            add(6, 8, f"Levemente Acima VWAP +{dist:.1f}%", "Acima do VWAP — favorável")
        elif dist > -1:
            add(3, 8, f"Próximo VWAP {dist:.1f}%", "Testando o VWAP")
        else:
            add(1, 8, f"Abaixo VWAP {dist:.1f}%", "Fraqueza abaixo do VWAP")

    # Compradores (10 pts)
    bp = buy_p.get("buy_pct", 50)
    if bp > 65:
        add(10, 10, f"Compradores {bp:.0f}%", "Forte domínio comprador")
    elif bp > 55:
        add(7, 10, f"Compradores {bp:.0f}%", "Maioria compradora")
    elif bp < 35:
        add(1, 10, f"Vendedores {100-bp:.0f}%", "Forte domínio vendedor")
    elif bp < 45:
        add(3, 10, f"Vendedores {100-bp:.0f}%", "Maioria vendedora")
    else:
        add(5, 10, f"Equilibrio {bp:.0f}%/{100-bp:.0f}%", "Compras e vendas equilibradas")

    # MFI (5 pts)
    if mfi_v is not None:
        if mfi_v > 60:
            add(4, 5, f"MFI Alta {mfi_v:.0f}", "Fluxo de dinheiro positivo")
        elif mfi_v < 30:
            add(3, 5, f"MFI Sobrevendido {mfi_v:.0f}", "Dinheiro saindo — atenção")
        else:
            add(2, 5, f"MFI Neutro {mfi_v:.0f}", "Fluxo neutro")

    # Volume ratio (5 pts)
    if vol_ratio > 2:
        add(5, 5, f"Volume Explosivo {vol_ratio:.1f}x", "Volume muito acima da média — confirmação")
    elif vol_ratio > 1.3:
        add(4, 5, f"Volume Alto {vol_ratio:.1f}x", "Volume acima da média")
    elif vol_ratio < 0.5:
        add(1, 5, f"Volume Baixo {vol_ratio:.1f}x", "Volume insuficiente — cuidado")
    else:
        add(3, 5, f"Volume Médio {vol_ratio:.1f}x", "Volume dentro da média")

    # OBV (4 pts)
    add(4 if obv_sig == "compra" else 1, 4, f"OBV {obv_sig.capitalize()}", "On-Balance Volume")

    # Supertrend (6 pts)
    if supertrend_d:
        bull_st = supertrend_d.get("bullish", False)
        add(6 if bull_st else 0, 6, f"Supertrend {'Alta' if bull_st else 'Baixa'}", "Supertrend direction")

    # Williams %R (4 pts)
    if wr_v is not None:
        if wr_v < -80:
            add(4, 4, f"Williams Sobrevendido {wr_v:.0f}", "Potencial reversão alta")
        elif wr_v > -20:
            add(1, 4, f"Williams Sobrecomprado {wr_v:.0f}", "Potencial reversão baixa")
        else:
            add(2, 4, f"Williams Neutro {wr_v:.0f}", "Williams %R neutro")

    # CCI (4 pts)
    if cci_v is not None:
        if cci_v > 100:
            add(3, 4, f"CCI Alta {cci_v:.0f}", "Tendência de alta confirmada")
        elif cci_v < -100:
            add(1, 4, f"CCI Baixa {cci_v:.0f}", "Tendência de baixa")
        else:
            add(2, 4, f"CCI Neutro {cci_v:.0f}", "CCI em zona neutra")

    # Bollinger (4 pts)
    if boll_d:
        sig = boll_d.get("sinal", "neutro")
        if sig == "compra":
            add(4, 4, "Bollinger Inferior", "Preço tocou banda inferior — potencial bounce")
        elif sig == "venda":
            add(1, 4, "Bollinger Superior", "Preço na banda superior — cuidado")
        else:
            add(2, 4, "Bollinger Médio", "Preço dentro das bandas")

    # Candlestick patterns (6 pts)
    BULL_PAT = {"Hammer", "Bullish Engulfing", "Piercing Line", "Morning Star",
                "Three White Soldiers", "Bullish Harami", "Dragonfly Doji", "Pin Bar"}
    BEAR_PAT = {"Shooting Star", "Bearish Engulfing", "Dark Cloud Cover",
                "Evening Star", "Three Black Crows", "Bearish Harami", "Gravestone Doji"}
    if patterns:
        psc = 0
        for p in patterns[:2]:
            nome = p.get("nome", "")
            if any(b in nome for b in BULL_PAT): psc += 3
            elif any(b in nome for b in BEAR_PAT): psc -= 3
        add(max(0, min(6, 3 + psc)), 6, "Padrões Candle", f"{len(patterns)} padrão(ões)")

    score = (pts / max_pts * 100) if max_pts > 0 else 50.0
    return min(100.0, max(0.0, score)), fatores


# ── Análise por TF ────────────────────────────────────────────────────────────

def _analisar_tf(candles: list[dict], tf_name: str) -> dict:
    if len(candles) < 30:
        return {"tf": tf_name, "valido": False}

    opens   = [c["o"] for c in candles]
    highs   = [c["h"] for c in candles]
    lows    = [c["l"] for c in candles]
    closes  = [c["c"] for c in candles]
    volumes = [c["v"] for c in candles]
    buy_vols = [c.get("buy_vol", c["v"] * 0.5) for c in candles]

    preco = closes[-1]
    emas = _ema_multi(closes)

    rsi_v  = calc_rsi(closes)
    macd_d = calc_macd(closes)
    boll_d = calc_bollinger(closes)
    atr_v  = calc_atr(highs, lows, closes)
    adx_d  = calc_adx(highs, lows, closes)
    stoch_d = _stoch(highs, lows, closes)
    wr_v   = calc_wr(highs, lows, closes)
    cci_v  = calc_cci(highs, lows, closes)
    mfi_v  = calc_mfi(highs, lows, closes, volumes)
    roc_v  = calc_roc(closes)
    obv_sig = obv_signal(closes, volumes)
    vwap_v = calc_vwap(highs, lows, closes, volumes)

    buy_p = _buying_pressure(buy_vols, volumes)

    # Supertrend
    st_d = None
    try:
        st_d = calc_supertrend(highs, lows, closes)
    except Exception:
        pass

    # Candlestick patterns
    patterns: list[dict] = []
    try:
        patterns = detect_candlestick_patterns(opens, highs, lows, closes, lookback=3)
    except Exception:
        pass

    # Volume ratio
    vol_med = sum(volumes[-20:]) / 20 if len(volumes) >= 20 else (volumes[-1] if volumes else 1)
    vol_ratio = volumes[-1] / vol_med if vol_med > 0 else 1.0

    score, fatores = _score_tf(
        preco=preco, emas=emas,
        rsi_v=rsi_v, macd_d=macd_d, boll_d=boll_d, adx_d=adx_d,
        stoch_d=stoch_d, vwap_v=vwap_v, buy_p=buy_p,
        mfi_v=mfi_v, vol_ratio=vol_ratio, obv_sig=obv_sig,
        supertrend_d=st_d, wr_v=wr_v, cci_v=cci_v, patterns=patterns,
    )

    tendencia = _identificar_tendencia(preco, closes, emas, adx_d)
    fib = calc_fib(highs, lows, closes)
    pivots = _pivot_points(highs[-2], lows[-2], closes[-2]) if len(candles) >= 2 else {}

    return {
        "tf": tf_name,
        "valido": True,
        "preco": preco,
        "score": round(score, 1),
        "bullish": score >= 50,
        "tendencia": tendencia,
        "fatores": fatores[:8],
        "indicadores": {
            "ema9":   emas.get("e9"),
            "ema21":  emas.get("e21"),
            "ema50":  emas.get("e50"),
            "ema100": emas.get("e100"),
            "ema200": emas.get("e200"),
            "rsi":    rsi_v,
            "macd":   macd_d,
            "bollinger": boll_d,
            "atr":    atr_v,
            "atr_pct": round(atr_v / preco * 100, 3) if atr_v and preco else None,
            "adx":    adx_d,
            "stoch":  stoch_d,
            "cci":    cci_v,
            "mfi":    mfi_v,
            "roc":    roc_v,
            "williams_r": wr_v,
            "vwap":   vwap_v,
            "supertrend": st_d,
        },
        "compradores": buy_p,
        "padroes": patterns[:3],
        "fibonacci": fib,
        "pivots": pivots,
        "volume": {
            "atual": volumes[-1],
            "media_20": round(vol_med, 2),
            "ratio": round(vol_ratio, 2),
        },
    }


# ── Consenso Multi-TF ─────────────────────────────────────────────────────────

_TF_WEIGHTS = {"1d": 3.0, "4h": 2.5, "1h": 2.0, "30m": 1.5, "15m": 1.2, "5m": 1.0, "3m": 0.8, "1m": 0.6}


def _calcular_consenso(tf_results: dict[str, dict]) -> dict:
    valid = {k: v for k, v in tf_results.items() if v.get("valido")}
    if not valid:
        return {"score": 50.0, "direcao": "neutral", "desc": "Dados insuficientes", "bull_pct": 50}

    ws = wt = 0.0
    bull_count = 0
    for tf, v in valid.items():
        w = _TF_WEIGHTS.get(tf, 1.0)
        ws += v["score"] * w
        wt += w
        if v.get("bullish"):
            bull_count += 1

    weighted_score = ws / wt if wt > 0 else 50.0
    bull_pct = bull_count / len(valid) * 100

    if bull_pct >= 75:
        direcao = "bullish"
        desc = f"Alta confluência bullish ({bull_count}/{len(valid)} TFs)"
    elif bull_pct >= 55:
        direcao = "bullish"
        desc = f"Maioria bullish ({bull_count}/{len(valid)} TFs)"
    elif bull_pct <= 25:
        direcao = "bearish"
        desc = f"Alta confluência bearish ({len(valid)-bull_count}/{len(valid)} TFs)"
    elif bull_pct <= 45:
        direcao = "bearish"
        desc = f"Maioria bearish ({len(valid)-bull_count}/{len(valid)} TFs)"
    else:
        direcao = "neutral"
        desc = f"Mercado indefinido ({bull_count}/{len(valid)} TFs bullish)"

    return {
        "score": round(weighted_score, 1),
        "direcao": direcao,
        "desc": desc,
        "bull_pct": round(bull_pct),
        "tfs_validos": len(valid),
        "tfs_bullish": bull_count,
    }


# ── Níveis de entrada/stop/alvo ───────────────────────────────────────────────

def _calcular_niveis(preco: float, atr_v: Optional[float], bullish: bool,
                     highs: list[float], lows: list[float]) -> dict:
    atr_v = atr_v or preco * 0.01
    lookback = min(50, len(highs))
    resistencia = max(highs[-lookback:]) if highs else preco * 1.05
    suporte     = min(lows[-lookback:])  if lows  else preco * 0.95

    if bullish:
        stop     = max(preco - atr_v * 1.5, suporte * 0.998)
        risco    = preco - stop
        entrada  = preco
        alvo1    = preco + risco * 1.5
        alvo2    = preco + risco * 2.5
        alvo3    = preco + risco * 4.0
        tipo     = "COMPRA"
    else:
        stop     = min(preco + atr_v * 1.5, resistencia * 1.002)
        risco    = stop - preco
        entrada  = preco
        alvo1    = preco - risco * 1.5
        alvo2    = preco - risco * 2.5
        alvo3    = preco - risco * 4.0
        tipo     = "VENDA"

    if risco <= 0:
        risco = atr_v

    def pct(a, b): return round(abs(a - b) / b * 100, 2) if b else 0
    def rr(alvo): return round(abs(alvo - entrada) / risco, 2) if risco else 0

    return {
        "tipo": tipo, "entrada": entrada, "stop": round(stop, 6),
        "stop_pct": pct(stop, entrada),
        "alvo1": round(alvo1, 6), "alvo1_pct": pct(alvo1, entrada), "rr1": rr(alvo1),
        "alvo2": round(alvo2, 6), "alvo2_pct": pct(alvo2, entrada), "rr2": rr(alvo2),
        "alvo3": round(alvo3, 6), "alvo3_pct": pct(alvo3, entrada), "rr3": rr(alvo3),
        "atr": round(atr_v, 6), "atr_pct": round(atr_v / preco * 100, 3) if preco else 0,
        "suporte": round(suporte, 6), "resistencia": round(resistencia, 6),
    }


# ── Decisão final ─────────────────────────────────────────────────────────────

def _decisao(score: float, direcao: str) -> dict:
    bullish = direcao == "bullish"
    if score >= 80 and bullish:
        dec, cor, stars = "COMPRA MUITO FORTE", "#10b981", 5
    elif score >= 70 and bullish:
        dec, cor, stars = "COMPRA FORTE", "#84cc16", 4
    elif score >= 60 and bullish:
        dec, cor, stars = "COMPRAR", "#84cc16", 3
    elif score >= 70 and direcao == "bearish":
        dec, cor, stars = "VENDA FORTE", "#ef4444", 4
    elif score >= 60 and direcao == "bearish":
        dec, cor, stars = "VENDER", "#f97316", 3
    elif score < 35:
        dec, cor, stars = "NÃO OPERAR", "#ef4444", 0
    else:
        dec, cor, stars = "AGUARDAR", "#f59e0b", 1

    operar = dec not in ("AGUARDAR", "NÃO OPERAR")
    return {"decisao": dec, "cor": cor, "estrelas": stars, "operar": operar, "bullish": bullish}


def _justificativa(simbolo: str, dec: str, score: float, consenso: dict,
                    tf_results: dict, buy_p: dict) -> str:
    bull_tfs = [tf for tf, v in tf_results.items() if v.get("valido") and v.get("bullish")]
    bear_tfs = [tf for tf, v in tf_results.items() if v.get("valido") and not v.get("bullish")]
    bp = (buy_p or {}).get("buy_pct", 50)
    lines = [f"{simbolo} — {consenso.get('desc', '')}. Score: {score:.0f}/100."]
    if bull_tfs:
        lines.append(f"TFs bullish: {', '.join(bull_tfs)}.")
    if bear_tfs:
        lines.append(f"TFs bearish: {', '.join(bear_tfs)}.")
    lines.append(f"Força compradora: {bp:.0f}% dos negócios recentes foram compras.")
    if dec in ("COMPRAR", "COMPRA FORTE", "COMPRA MUITO FORTE"):
        lines.append("Confluência de múltiplos indicadores e timeframes favorece posição comprada. Respeite o stop e realize parcial no Alvo 1.")
    elif "VEND" in dec:
        lines.append("Confluência bearish. Operação vendida com stop acima da resistência mais próxima.")
    elif dec == "AGUARDAR":
        lines.append("Sem confluência clara entre timeframes. Aguardar definição de direção antes de entrar.")
    else:
        lines.append("Condições técnicas desfavoráveis. Não há confluência suficiente para operar com segurança.")
    return " ".join(lines)


# ── Score color ───────────────────────────────────────────────────────────────

def _cor_score(score: float) -> str:
    if score >= 80: return "#10b981"
    if score >= 65: return "#84cc16"
    if score >= 50: return "#f59e0b"
    if score >= 35: return "#f97316"
    return "#ef4444"


# ── Entry point ───────────────────────────────────────────────────────────────

def calcular_daytrade(
    simbolo: str,
    candles_por_tf: dict[str, list[dict]],
    fg: Optional[int] = None,
) -> dict:
    """
    Análise Day Trade completa com múltiplos timeframes.

    candles_por_tf: {"1d":[...], "4h":[...], "1h":[...], "30m":[...], "15m":[...], "5m":[...], "1m":[...]}
    Cada candle: {"o":open, "h":high, "l":low, "c":close, "v":volume, "buy_vol":taker_buy}
    """
    tf_results: dict[str, dict] = {}
    for tf, candles in candles_por_tf.items():
        tf_results[tf] = _analisar_tf(candles, tf) if candles else {"tf": tf, "valido": False}

    consenso = _calcular_consenso(tf_results)
    score    = consenso["score"]
    bullish  = consenso["direcao"] == "bullish"

    # Pega preço do TF mais curto válido
    preco = None
    for preferred in ["1m", "5m", "15m", "30m", "1h", "4h", "1d"]:
        r = tf_results.get(preferred, {})
        if r.get("valido"):
            preco = r["preco"]
            break
    if not preco:
        return {"simbolo": simbolo, "erro": "Dados insuficientes"}

    # ATR do 15m ou 1h para stops intraday
    atr_v = None
    for preferred in ["15m", "1h", "5m", "30m"]:
        r = tf_results.get(preferred, {})
        if r.get("valido") and r.get("indicadores", {}).get("atr"):
            atr_v = r["indicadores"]["atr"]
            break

    # Buying pressure do 5m
    buy_p: dict = {"buy_pct": 50.0, "sell_pct": 50.0, "delta": 0.0, "dominant": "neutro"}
    for preferred in ["5m", "15m", "1m", "30m"]:
        r = tf_results.get(preferred, {})
        if r.get("valido") and r.get("compradores"):
            buy_p = r["compradores"]
            break

    # Níveis — usa candles do 1h ou 4h para S/R mais confiáveis
    niveis: dict = {"tipo": "COMPRA" if bullish else "VENDA", "entrada": preco}
    for preferred in ["1h", "4h", "30m", "15m"]:
        cands = candles_por_tf.get(preferred, [])
        if len(cands) >= 20:
            hh = [c["h"] for c in cands]
            ll = [c["l"] for c in cands]
            niveis = _calcular_niveis(preco, atr_v, bullish, hh, ll)
            break

    dec_data     = _decisao(score, consenso["direcao"])
    justificativa = _justificativa(simbolo, dec_data["decisao"], score, consenso, tf_results, buy_p)

    # Market structure do 1h (opcional)
    estrutura: dict = {}
    try:
        cands1h = candles_por_tf.get("1h", [])
        if len(cands1h) >= 30:
            hh = [c["h"] for c in cands1h]
            ll = [c["l"] for c in cands1h]
            cl = [c["c"] for c in cands1h]
            estrutura = detect_market_structure(hh, ll, cl)
    except Exception:
        pass

    return {
        "simbolo":    simbolo,
        "preco_atual": preco,
        "score":      round(score, 1),
        "cor":        _cor_score(score),
        "decisao":    dec_data["decisao"],
        "estrelas":   dec_data["estrelas"],
        "operar":     dec_data["operar"],
        "bullish":    dec_data["bullish"],
        "consenso":   consenso,
        "niveis":     niveis,
        "compradores": buy_p,
        "timeframes": tf_results,
        "estrutura":  estrutura,
        "justificativa": justificativa,
        "fear_greed": fg,
    }
