"""
Futures Engine — análise multi-dimensional para contratos futuros.
Scores: Técnico (25%) + Fluxo (30%) + Contexto (25%) + Fundamentalista (20%)
"""
from __future__ import annotations
import math
from typing import Optional
from .daytrade_engine import calcular_daytrade

MARKET_CAP_RANKS = {
    "BTC": 1, "ETH": 2, "BNB": 3, "XRP": 4, "SOL": 5,
    "ADA": 6, "DOGE": 7, "AVAX": 8, "LINK": 9, "DOT": 10,
    "LTC": 11, "BCH": 12, "UNI": 13, "AAVE": 14, "NEAR": 15,
    "ARB": 30, "OP": 35, "SUI": 45, "MATIC": 20,
}

_HIGH_QUALITY = {"BTC", "ETH", "SOL", "BNB", "LINK", "AAVE"}


# ── Fluxo (Open Interest, Funding, L/S ratio, CVD, VWAP) ─────────────────────

def _score_fluxo(
    oi_change_pct: float,
    funding_rate: float,
    long_pct: float,
    taker_buy_pct: float,
    cvd_bullish: bool,
    vwap_above: bool,
) -> tuple[float, dict]:
    """
    Score de fluxo de capitais para futuros (0-100).
    Positivo = favorável a LONG, negativo = favorável a SHORT.
    """
    pts = 50.0  # base neutra
    details: dict = {}

    # Open Interest Change
    if oi_change_pct > 3:
        # OI crescendo — confirma ou diverge da tendência de preço
        oi_pts = 15
        details["oi"] = f"OI +{oi_change_pct:.1f}% — confirma tendência"
    elif oi_change_pct < -3:
        oi_pts = -10
        details["oi"] = f"OI {oi_change_pct:.1f}% — divergência / liquidação"
    else:
        oi_pts = 0
        details["oi"] = f"OI {oi_change_pct:+.1f}% — neutro"
    pts += oi_pts

    # Funding Rate (% por 8h)
    fr_pct = funding_rate * 100  # converter para %
    if fr_pct < -0.05:
        fr_pts = 20
        details["funding"] = f"Funding extremamente negativo ({fr_pct:.4f}%) — squeeze potencial"
    elif fr_pct < 0:
        fr_pts = 10
        details["funding"] = f"Funding negativo ({fr_pct:.4f}%) — leve pressão short"
    elif fr_pct <= 0.1:
        fr_pts = 0
        details["funding"] = f"Funding neutro ({fr_pct:.4f}%)"
    elif fr_pct <= 0.5:
        fr_pts = -15
        details["funding"] = f"Funding positivo ({fr_pct:.4f}%) — longs pagando caro"
    else:
        fr_pts = -20
        details["funding"] = f"Funding extremo ({fr_pct:.4f}%) — perigo para longs"
    pts += fr_pts

    # Long/Short Ratio
    if long_pct < 40:
        ls_pts = 15
        details["ls_ratio"] = f"Longs {long_pct:.1f}% — maioria short, squeeze potencial"
    elif long_pct > 60:
        ls_pts = -10
        details["ls_ratio"] = f"Longs {long_pct:.1f}% — posição lotada, risco de liquidação"
    else:
        ls_pts = 0
        details["ls_ratio"] = f"Longs {long_pct:.1f}% — posicionamento equilibrado"
    pts += ls_pts

    # Taker Buy Ratio
    if taker_buy_pct > 55:
        tb_pts = 10
        details["taker"] = f"Taker buy {taker_buy_pct:.1f}% — pressão compradora"
    elif taker_buy_pct < 45:
        tb_pts = -10
        details["taker"] = f"Taker buy {taker_buy_pct:.1f}% — pressão vendedora"
    else:
        tb_pts = 0
        details["taker"] = f"Taker buy {taker_buy_pct:.1f}% — equilibrado"
    pts += tb_pts

    # CVD (Cumulative Volume Delta)
    cvd_pts = 8 if cvd_bullish else -8
    details["cvd"] = "CVD bullish — delta cumulativo positivo" if cvd_bullish else "CVD bearish — delta cumulativo negativo"
    pts += cvd_pts

    # VWAP position
    vwap_pts = 7 if vwap_above else -7
    details["vwap"] = "Preço acima do VWAP — força compradora" if vwap_above else "Preço abaixo do VWAP — fraqueza"
    pts += vwap_pts

    score = max(0.0, min(100.0, pts))

    # direction_bias: positivo = long favorável, negativo = short favorável
    direction_bias = pts - 50.0
    details["direction_bias"] = round(direction_bias, 1)

    return round(score, 1), details


# ── Contexto (Fear & Greed, BTC Dominance, Tendência BTC) ────────────────────

def _score_contexto(
    fg: Optional[int],
    btc_dominance: Optional[float],
    btc_dom_trend: str,
    btc_trend_tipo: str,
    symbol: str,
) -> tuple[float, dict]:
    """Score de contexto de mercado (0-100)."""
    pts = 50.0
    details: dict = {}
    is_btc = symbol.upper() == "BTC"

    # Fear & Greed
    if fg is not None:
        if fg < 20:
            fg_pts = 20
            details["fear_greed"] = f"Medo extremo ({fg}) — sinal contrário de alta"
        elif fg < 35:
            fg_pts = 10
            details["fear_greed"] = f"Medo ({fg}) — oportunidade potencial"
        elif fg <= 65:
            fg_pts = 0
            details["fear_greed"] = f"Neutro ({fg})"
        elif fg <= 80:
            fg_pts = -5
            details["fear_greed"] = f"Ganância ({fg}) — cautela"
        else:
            fg_pts = -15
            details["fear_greed"] = f"Ganância extrema ({fg}) — perigo, topo próximo?"
        pts += fg_pts
    else:
        details["fear_greed"] = "Fear & Greed indisponível"

    # BTC Dominance
    if btc_dominance is not None and not is_btc:
        if 40 <= btc_dominance <= 55:
            dom_pts = 10
            details["btc_dom"] = f"Dominância BTC saudável ({btc_dominance:.1f}%)"
        elif btc_dominance > 60:
            dom_pts = -10
            details["btc_dom"] = f"Alta dominância BTC ({btc_dominance:.1f}%) — altcoins sofrendo"
        elif btc_dominance < 35:
            dom_pts = 10
            details["btc_dom"] = f"Baixa dominância BTC ({btc_dominance:.1f}%) — altseason"
        else:
            dom_pts = 0
            details["btc_dom"] = f"Dominância BTC {btc_dominance:.1f}% — neutra"
        pts += dom_pts

        # BTC Dominance Trend
        if btc_dom_trend == "subindo":
            pts -= 5
            details["btc_dom_trend"] = "Dominância subindo — fluxo saindo de altcoins"
        elif btc_dom_trend == "caindo":
            pts += 5
            details["btc_dom_trend"] = "Dominância caindo — altseason em curso"
        else:
            details["btc_dom_trend"] = "Dominância estável"
    elif is_btc and btc_dominance is not None:
        details["btc_dom"] = f"BTC Dominância {btc_dominance:.1f}% (N/A para BTC)"

    # BTC Market Trend
    btc_trend_lower = btc_trend_tipo.lower() if btc_trend_tipo else ""
    if "alta" in btc_trend_lower:
        pts += 10
        details["btc_trend"] = f"BTC em tendência de alta ({btc_trend_tipo})"
    elif "baixa" in btc_trend_lower:
        pts -= 10
        details["btc_trend"] = f"BTC em tendência de baixa ({btc_trend_tipo})"
    else:
        details["btc_trend"] = f"BTC tendência indefinida ({btc_trend_tipo})"

    score = max(0.0, min(100.0, pts))
    return round(score, 1), details


# ── Fundamental (Cap rank, Volume, OI/Volume ratio) ──────────────────────────

def _score_fundamental(
    simbolo: str,
    volume24h_usdt: float,
    oi_usdt: float,
) -> tuple[float, dict]:
    """Score fundamentalista baseado em rank, liquidez e open interest (0-100)."""
    pts = 0.0
    details: dict = {}
    sym = simbolo.upper()

    # Market Cap Rank
    rank = MARKET_CAP_RANKS.get(sym, 99)
    if rank <= 2:
        rank_pts = 30
    elif rank <= 5:
        rank_pts = 25
    elif rank <= 10:
        rank_pts = 20
    elif rank <= 20:
        rank_pts = 15
    else:
        rank_pts = 10
    pts += rank_pts
    details["cap_rank"] = f"Rank #{rank} — {rank_pts} pts"

    # Volume 24h (USD)
    if volume24h_usdt > 1_000_000_000:
        vol_pts = 20
        details["volume"] = f"Volume ${volume24h_usdt/1e9:.1f}B — liquidez excelente"
    elif volume24h_usdt > 500_000_000:
        vol_pts = 15
        details["volume"] = f"Volume ${volume24h_usdt/1e6:.0f}M — liquidez boa"
    elif volume24h_usdt > 100_000_000:
        vol_pts = 10
        details["volume"] = f"Volume ${volume24h_usdt/1e6:.0f}M — liquidez adequada"
    elif volume24h_usdt > 10_000_000:
        vol_pts = 5
        details["volume"] = f"Volume ${volume24h_usdt/1e6:.1f}M — liquidez baixa"
    else:
        vol_pts = 0
        details["volume"] = f"Volume ${volume24h_usdt/1e6:.2f}M — liquidez insuficiente"
    pts += vol_pts

    # OI / Volume ratio (saudável: 0.1–0.5)
    oi_vol_ratio = (oi_usdt / volume24h_usdt) if volume24h_usdt > 0 else 0
    if 0.1 <= oi_vol_ratio <= 0.5:
        oi_pts = 10
        details["oi_ratio"] = f"OI/Volume {oi_vol_ratio:.2f} — alavancagem saudável"
    elif oi_vol_ratio < 0.1:
        oi_pts = 5
        details["oi_ratio"] = f"OI/Volume {oi_vol_ratio:.2f} — baixa alavancagem"
    else:
        oi_pts = -5
        details["oi_ratio"] = f"OI/Volume {oi_vol_ratio:.2f} — alavancagem excessiva"
    pts += oi_pts

    # Quality bonus
    if sym in _HIGH_QUALITY:
        pts += 10
        details["quality"] = f"{sym} — projeto de alta qualidade (+10)"
    else:
        details["quality"] = "Sem bônus de qualidade"

    score = max(0.0, min(100.0, pts))
    return round(score, 1), details


# ── IST — Índice de Sustentabilidade da Tendência ────────────────────────────

def _calcular_ist(
    score_tecnico: float,
    score_fluxo: float,
    score_contexto: float,
    oi_change_pct: float,
    funding_rate: float,
    long_pct: float,
    btc_trend_tipo: str,
) -> float:
    """
    IST — Índice de Sustentabilidade da Tendência (0-100).
    Mede se a tendência atual tem condições para se sustentar.
    """
    base = score_tecnico * 0.25 + score_fluxo * 0.30 + score_contexto * 0.25
    bonus = 0.0

    # OI crescendo confirma tendência
    if oi_change_pct > 2:
        bonus += 5

    # Funding não extremo (entre -0.05% e 0.1%)
    fr_pct = funding_rate * 100
    if -0.05 <= fr_pct <= 0.1:
        bonus += 3

    # Posicionamento não lotado
    if 40 <= long_pct <= 60:
        bonus += 5

    # Penalidades
    if abs(fr_pct) > 0.5:
        bonus -= 10  # funding extremo em qualquer direção = instável

    if long_pct > 70 or long_pct < 30:
        bonus -= 8  # posicionamento muito unilateral = risco de squeeze

    ist = base + bonus
    return round(max(0.0, min(100.0, ist)), 1)


# ── Funding Rate Classifier ───────────────────────────────────────────────────

def _classify_funding(rate: float) -> str:
    """Classifica o funding rate em categorias legíveis."""
    fr_pct = rate * 100
    if fr_pct < -0.05:
        return "Extremamente Negativo"
    elif fr_pct < 0:
        return "Negativo"
    elif fr_pct <= 0.02:
        return "Neutro"
    elif fr_pct <= 0.1:
        return "Positivo"
    else:
        return "Extremamente Positivo"


# ── Squeeze Detector ──────────────────────────────────────────────────────────

def _detect_squeeze(
    long_pct: float,
    oi_change_pct: float,
    price_change_pct: float,
) -> Optional[str]:
    """Detecta padrões de squeeze baseado em posicionamento e movimento de preço."""
    if long_pct > 65 and price_change_pct < -2 and oi_change_pct < -3:
        return "Long Squeeze"
    if long_pct < 35 and price_change_pct > 2 and oi_change_pct < -3:
        return "Short Squeeze"
    return None


# ── Direction Determination ───────────────────────────────────────────────────

def _determine_direction(
    score_tecnico: float,
    fluxo_details: dict,
    base_bullish: bool,
    funding_rate: float,
    long_pct: float,
) -> tuple[str, float]:
    """
    Determina direção preferencial (LONG/SHORT/NEUTRO) e confiança (0-100).
    """
    fr_pct = funding_rate * 100
    direction_bias = fluxo_details.get("direction_bias", 0.0)

    # Contadores de sinal
    long_signals = 0
    short_signals = 0
    total_signals = 4

    # Sinal 1: base técnica
    if base_bullish:
        long_signals += 1
    else:
        short_signals += 1

    # Sinal 2: score técnico
    if score_tecnico >= 55:
        long_signals += 1
    elif score_tecnico < 45:
        short_signals += 1
    else:
        total_signals -= 1  # neutro não conta

    # Sinal 3: funding (funding muito positivo = bearish para novos longs)
    if fr_pct > 0.1:
        short_signals += 1
    elif fr_pct < -0.05:
        long_signals += 1
    else:
        total_signals -= 1

    # Sinal 4: posicionamento (contrário — crowded longs = short opp)
    if long_pct > 60:
        short_signals += 1
    elif long_pct < 40:
        long_signals += 1
    else:
        total_signals -= 1

    if total_signals <= 0:
        return "NEUTRO", 30.0

    long_ratio = long_signals / total_signals
    short_ratio = short_signals / total_signals

    # Direção pelo bias de fluxo + sinais
    if long_ratio >= 0.6 and direction_bias >= 0:
        direction = "LONG"
        confidence = min(95.0, 50.0 + long_ratio * 40 + direction_bias * 0.3)
    elif short_ratio >= 0.6 and direction_bias <= 0:
        direction = "SHORT"
        confidence = min(95.0, 50.0 + short_ratio * 40 + abs(direction_bias) * 0.3)
    elif long_ratio > short_ratio and direction_bias > 5:
        direction = "LONG"
        confidence = min(80.0, 40.0 + long_ratio * 30)
    elif short_ratio > long_ratio and direction_bias < -5:
        direction = "SHORT"
        confidence = min(80.0, 40.0 + short_ratio * 30)
    else:
        direction = "NEUTRO"
        confidence = 30.0

    return direction, round(confidence, 1)


# ── Leverage Suggestion ───────────────────────────────────────────────────────

def _suggest_leverage(grade: str, direction_confidence: float) -> str:
    """Sugere alavancagem com base no grade e confiança direcional."""
    if grade == "A+":
        return "10-20x" if direction_confidence >= 80 else "5-10x"
    elif grade == "A":
        return "5-10x"  if direction_confidence >= 75 else "3-5x"
    elif grade == "B":
        return "3-5x"
    elif grade == "C":
        return "2-3x"
    else:
        return "1-2x"


# ── Main Entry Point ──────────────────────────────────────────────────────────

def calcular_futures(
    simbolo: str,
    candles_por_tf: dict[str, list[dict]],
    futures_data: dict,
    fg: Optional[int] = None,
    btc_dom: Optional[float] = None,
    btc_dom_trend: str = "neutro",
) -> dict:
    """
    Análise completa para contratos futuros.

    candles_por_tf: {"1d":[...], "4h":[...], "1h":[...], "30m":[...], "15m":[...], "5m":[...], "1m":[...]}
    futures_data: {
        oi_usdt, oi_change_pct, funding_rate, long_pct, short_pct,
        taker_buy_pct, cvd_bullish, volume24h_usdt, vwap, preco_atual, var24h_pct
    }
    """
    # 1. Base técnica via daytrade engine
    base = calcular_daytrade(simbolo, candles_por_tf, fg=fg)

    if base.get("erro"):
        return {"simbolo": simbolo, "erro": base["erro"]}

    score_tecnico = base.get("score", 50.0)
    base_bullish = base.get("bullish", False)

    # 2. Extrair dados de futures
    oi_usdt = futures_data.get("oi_usdt", 0.0)
    oi_change_pct = futures_data.get("oi_change_pct", 0.0)
    funding_rate = futures_data.get("funding_rate", 0.0)
    long_pct = futures_data.get("long_pct", 50.0)
    short_pct = futures_data.get("short_pct", 50.0)
    taker_buy_pct = futures_data.get("taker_buy_pct", 50.0)
    cvd_bullish = futures_data.get("cvd_bullish", False)
    volume24h_usdt = futures_data.get("volume24h_usdt", 0.0)
    vwap = futures_data.get("vwap")
    preco_atual = futures_data.get("preco_atual") or base.get("preco_atual", 0.0)
    var24h_pct = futures_data.get("var24h_pct", 0.0)

    # 3. VWAP position
    vwap_above = (vwap is not None) and (preco_atual > vwap)

    # 4. Score Fluxo
    score_fluxo, fluxo_details = _score_fluxo(
        oi_change_pct=oi_change_pct,
        funding_rate=funding_rate,
        long_pct=long_pct,
        taker_buy_pct=taker_buy_pct,
        cvd_bullish=cvd_bullish,
        vwap_above=vwap_above,
    )

    # 5. Extrair tendência do BTC do base (usa 1h ou 4h)
    btc_trend_tipo = "neutro"
    tf_results = base.get("timeframes", {})
    for preferred_tf in ["1h", "4h", "1d"]:
        tf_data = tf_results.get(preferred_tf, {})
        if tf_data.get("valido") and tf_data.get("tendencia"):
            btc_trend_tipo = tf_data["tendencia"].get("tipo", "neutro")
            break

    # 6. Score Contexto
    score_contexto, contexto_details = _score_contexto(
        fg=fg,
        btc_dominance=btc_dom,
        btc_dom_trend=btc_dom_trend,
        btc_trend_tipo=btc_trend_tipo,
        symbol=simbolo,
    )

    # 7. Score Fundamental
    score_fundamental, fundamental_details = _score_fundamental(
        simbolo=simbolo,
        volume24h_usdt=volume24h_usdt,
        oi_usdt=oi_usdt,
    )

    # 8. Score Final ponderado
    score_final = (
        score_tecnico     * 0.25 +
        score_fluxo       * 0.30 +
        score_contexto    * 0.25 +
        score_fundamental * 0.20
    )
    score_final = round(max(0.0, min(100.0, score_final)), 1)

    # 9. IST
    ist = _calcular_ist(
        score_tecnico=score_tecnico,
        score_fluxo=score_fluxo,
        score_contexto=score_contexto,
        oi_change_pct=oi_change_pct,
        funding_rate=funding_rate,
        long_pct=long_pct,
        btc_trend_tipo=btc_trend_tipo,
    )

    # 10. Direção
    direction, direction_confidence = _determine_direction(
        score_tecnico=score_tecnico,
        fluxo_details=fluxo_details,
        base_bullish=base_bullish,
        funding_rate=funding_rate,
        long_pct=long_pct,
    )

    # 11. Grade — thresholds calibrados para futuros (scores 50-70 são normais)
    if score_final >= 80:
        grade = "A+"
    elif score_final >= 70:
        grade = "A"
    elif score_final >= 58:
        grade = "B"
    elif score_final >= 45:
        grade = "C"
    else:
        grade = "NR"

    # 12. Funding classification
    funding_class = _classify_funding(funding_rate)

    # 13. Squeeze detection
    squeeze_type = _detect_squeeze(long_pct, oi_change_pct, var24h_pct)

    # 14. Leverage suggestion
    leverage_suggested = _suggest_leverage(grade, direction_confidence)

    # 15. Decisão
    operar = grade != "NR"
    if direction == "LONG" and operar:
        decisao = "LONG"
    elif direction == "SHORT" and operar:
        decisao = "SHORT"
    else:
        decisao = "AGUARDAR"

    # 16. bull_pct — preferencia taker ou consenso base
    bull_pct = base.get("consenso", {}).get("bull_pct", round(taker_buy_pct))

    return {
        # Identificação
        "simbolo":             simbolo,
        "preco_atual":         preco_atual,

        # Scores
        "score_final":         score_final,
        "score_tecnico":       round(score_tecnico, 1),
        "score_fluxo":         score_fluxo,
        "score_contexto":      score_contexto,
        "score_fundamental":   score_fundamental,

        # Qualidade e direção
        "ist":                 ist,
        "grade":               grade,
        "direction":           direction,
        "direction_confidence": direction_confidence,
        "operar":              operar,

        # Herdados da base
        "bullish":             base_bullish,
        "decisao":             decisao,

        # Dados de mercado 24h
        "var24h":              var24h_pct,
        "volume24h":           volume24h_usdt,

        # Dados de Futuros
        "oi_usdt":             oi_usdt,
        "oi_change_pct":       round(oi_change_pct, 2),
        "funding_rate":        funding_rate,
        "funding_class":       funding_class,
        "long_pct":            round(long_pct, 1),
        "short_pct":           round(short_pct, 1),
        "taker_buy_pct":       round(taker_buy_pct, 1),

        # Fluxo
        "cvd_bullish":         cvd_bullish,
        "vwap":                vwap,
        "vwap_above":          vwap_above,

        # Squeeze e alavancagem
        "squeeze_type":        squeeze_type,
        "leverage_suggested":  leverage_suggested,

        # Detalhes dos scores
        "fluxo_details":       fluxo_details,
        "contexto_details":    contexto_details,
        "fundamental_details": fundamental_details,

        # Análise técnica herdada
        "niveis":              base.get("niveis", {}),
        "timeframes":          tf_results,

        # Extras
        "usd_brl":             futures_data.get("usd_brl"),
        "bull_pct":            bull_pct,
        "fear_greed":          fg,
        "btc_dom":             btc_dom,
        "btc_dom_trend":       btc_dom_trend,
        "cor":                 base.get("cor", "#f59e0b"),
        "justificativa":       base.get("justificativa", ""),
        "consenso":            base.get("consenso", {}),
    }
