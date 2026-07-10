"""
Motor de Sinais IA — confluência inteligente de todos os indicadores.
Gera: Score, Decisão, Entrada, Stop, Take Profit, R:R, Justificativa.
"""
from __future__ import annotations
import math
from typing import Optional

from .indicators import (
    rsi, macd, ema, bollinger, atr as calc_atr, obv_signal,
    roc, cci, mfi, stoch_rsi, williams_r, adx, fibonacci,
    volatilidade as calc_vol,
)
from .extended_indicators import (
    supertrend, parabolic_sar, awesome_oscillator,
    keltner_channel, donchian_channel, vwap, ichimoku,
)
from .pattern_engine import (
    detect_candlestick_patterns,
    detect_market_structure,
    detect_chart_patterns,
    fibonacci_avancado,
)


# ── Pesos dinâmicos (ajustados pelo backtest store) ───────────────────────────

DEFAULT_WEIGHTS = {
    "tendencia":    0.30,
    "momentum":     0.25,
    "volume":       0.15,
    "price_action": 0.20,
    "externo":      0.10,
}


def _clamp(v: float, lo=0.0, hi=100.0) -> float:
    return max(lo, min(hi, v))


# ── Score por categoria ────────────────────────────────────────────────────────

def _score_tendencia(
    closes: list[float], highs: list[float], lows: list[float],
    preco: float,
) -> tuple[float, list[dict]]:
    sinais: list[dict] = []
    scores: list[float] = []

    # EMA alignment
    e9   = ema(closes, 9)
    e21  = ema(closes, 21)
    e50  = ema(closes, 50)
    e100 = ema(closes, 100)
    e200 = ema(closes, 200)

    ema_score = 0.0
    if e9  and e21  and preco > e9  > e21:  ema_score += 30
    if e21 and e50  and e21  > e50:          ema_score += 25
    if e50 and e200 and e50  > e200:         ema_score += 25
    if e200 and preco > e200:                ema_score += 20
    sinais.append({"nome": "Alinhamento EMA", "score": round(ema_score), "bullish": ema_score > 50})
    scores.append(ema_score)

    # ADX
    adx_d = adx(highs, lows, closes)
    if adx_d:
        adx_v = adx_d["adx"] or 0
        bull_adx = adx_d["direcao"] == "alta"
        if adx_v >= 40:
            adx_score = 90 if bull_adx else 10
        elif adx_v >= 25:
            adx_score = 70 if bull_adx else 30
        else:
            adx_score = 50
        sinais.append({"nome": f"ADX ({adx_v:.0f})", "score": round(adx_score),
                       "bullish": bull_adx, "valor": round(adx_v, 1)})
        scores.append(adx_score)

    # Supertrend
    st = supertrend(highs, lows, closes)
    if st:
        st_score = 90 if st["direcao"] == "alta" else 10
        sinais.append({"nome": "Supertrend", "score": round(st_score),
                       "bullish": st["direcao"] == "alta", "sinal": st["sinal"]})
        scores.append(st_score)

    # Parabolic SAR
    psar = parabolic_sar(highs, lows, closes)
    if psar:
        psar_score = 85 if psar["direcao"] == "alta" else 15
        sinais.append({"nome": "Parabolic SAR", "score": round(psar_score),
                       "bullish": psar["direcao"] == "alta"})
        scores.append(psar_score)

    # Ichimoku
    ichi = ichimoku(highs, lows, closes)
    if ichi:
        ichi_score = ichi["score_interno"]
        sinais.append({"nome": "Ichimoku", "score": round(ichi_score),
                       "bullish": ichi["sinal"] == "compra",
                       "detalhe": f"Nuvem: {ichi['posicao_nuvem']}"})
        scores.append(ichi_score)

    avg = sum(scores) / len(scores) if scores else 50
    return _clamp(avg), sinais


def _score_momentum(closes: list[float], highs: list[float], lows: list[float]) -> tuple[float, list[dict]]:
    sinais: list[dict] = []
    scores: list[float] = []

    # RSI
    rsi_v = rsi(closes)
    if rsi_v is not None:
        if 50 <= rsi_v <= 65:
            rs = 80
        elif 40 <= rsi_v < 50:
            rs = 60
        elif 65 < rsi_v <= 75:
            rs = 65
        elif rsi_v > 75:
            rs = 30
        elif 30 <= rsi_v < 40:
            rs = 45
        else:
            rs = 70  # oversold = oportunidade
        sinais.append({"nome": f"RSI ({rsi_v:.0f})", "score": rs,
                       "bullish": rsi_v > 50, "valor": round(rsi_v, 1)})
        scores.append(rs)

    # MACD
    m = macd(closes)
    if m:
        hist = m["histograma"]
        if hist > 0 and m["macd"] > 0:
            ms = 90
        elif hist > 0:
            ms = 70
        elif hist < 0 and m["macd"] < 0:
            ms = 15
        else:
            ms = 35
        sinais.append({"nome": f"MACD ({hist:+.2f})", "score": ms,
                       "bullish": hist > 0, "valor": round(hist, 4)})
        scores.append(ms)

    # Stochastic RSI
    sr = stoch_rsi(closes)
    if sr:
        k = sr["k"]
        ss = 90 if k < 20 else 70 if k < 40 else 50 if k < 60 else 25 if k < 80 else 10
        sinais.append({"nome": f"Stoch RSI ({k:.0f})", "score": ss,
                       "bullish": k < 50, "valor": round(k, 1)})
        scores.append(ss)

    # Awesome Oscillator
    ao = awesome_oscillator(highs, lows)
    if ao is not None:
        ao_score = 75 if ao > 0 else 25
        sinais.append({"nome": "Awesome Oscillator", "score": ao_score,
                       "bullish": ao > 0, "valor": round(ao, 2)})
        scores.append(ao_score)

    # CCI
    cci_v = cci(highs, lows, closes)
    if cci_v is not None:
        if cci_v > 150:   cs = 20
        elif cci_v > 100: cs = 40
        elif cci_v > 0:   cs = 65
        elif cci_v > -100:cs = 45
        elif cci_v > -150:cs = 75
        else:             cs = 85
        sinais.append({"nome": f"CCI ({cci_v:.0f})", "score": cs,
                       "bullish": cci_v > 0, "valor": round(cci_v, 1)})
        scores.append(cs)

    # ROC
    roc_v = roc(closes)
    if roc_v is not None:
        rs = 80 if roc_v > 10 else 65 if roc_v > 3 else 50 if roc_v > 0 else 35 if roc_v > -5 else 15
        sinais.append({"nome": f"ROC ({roc_v:.1f}%)", "score": rs,
                       "bullish": roc_v > 0, "valor": round(roc_v, 2)})
        scores.append(rs)

    # Williams %R
    wr = williams_r(highs, lows, closes)
    if wr is not None:
        ws = 90 if wr < -80 else 70 if wr < -60 else 50 if wr < -40 else 30 if wr < -20 else 10
        sinais.append({"nome": f"Williams %R ({wr:.0f})", "score": ws,
                       "bullish": wr < -50, "valor": round(wr, 1)})
        scores.append(ws)

    avg = sum(scores) / len(scores) if scores else 50
    return _clamp(avg), sinais


def _score_volume(
    closes: list[float], highs: list[float], lows: list[float],
    volumes: list[float], oi_change: Optional[float], funding: Optional[float],
    ls_ratio: Optional[float],
) -> tuple[float, list[dict]]:
    sinais: list[dict] = []
    scores: list[float] = []

    # OBV
    if volumes:
        obv = obv_signal(closes, volumes)
        obv_s = 85 if obv == "compra" else 50 if obv == "neutro" else 15
        sinais.append({"nome": "OBV", "score": obv_s, "bullish": obv == "compra", "sinal": obv})
        scores.append(obv_s)

        # Volume vs média
        if len(volumes) >= 20:
            avg_vol = sum(volumes[-20:-1]) / 19 if len(volumes) > 1 else volumes[-1]
            cur_vol = volumes[-1]
            ratio = cur_vol / avg_vol if avg_vol > 0 else 1
            v_bull = closes[-1] > closes[-2] if len(closes) >= 2 else True
            if ratio > 2:
                vs = 90 if v_bull else 10
            elif ratio > 1.5:
                vs = 75 if v_bull else 25
            elif ratio > 1:
                vs = 60 if v_bull else 40
            else:
                vs = 45
            sinais.append({"nome": f"Volume ({ratio:.1f}x média)", "score": vs,
                           "bullish": v_bull, "valor": round(ratio, 2)})
            scores.append(vs)

        # MFI
        mfi_v = mfi(highs, lows, closes, volumes)
        if mfi_v is not None:
            ms = 90 if mfi_v < 20 else 65 if mfi_v < 50 else 40 if mfi_v < 80 else 15
            sinais.append({"nome": f"MFI ({mfi_v:.0f})", "score": ms,
                           "bullish": mfi_v < 50, "valor": round(mfi_v, 1)})
            scores.append(ms)

    # VWAP
    if volumes and len(volumes) >= 5:
        vwap_v = vwap(highs, lows, closes, volumes)
        if vwap_v:
            preco = closes[-1]
            vwap_s = 70 if preco > vwap_v else 30
            sinais.append({"nome": "VWAP", "score": vwap_s,
                           "bullish": preco > vwap_v, "valor": round(vwap_v, 2)})
            scores.append(vwap_s)

    # Open Interest change
    if oi_change is not None:
        if oi_change > 5:
            oi_s = 75  # OI crescendo = tendência confirmada
        elif oi_change > 0:
            oi_s = 60
        elif oi_change > -5:
            oi_s = 45
        else:
            oi_s = 30
        sinais.append({"nome": f"Open Interest ({oi_change:+.1f}%)", "score": oi_s,
                       "bullish": oi_change > 0, "valor": round(oi_change, 2)})
        scores.append(oi_s)

    # Funding Rate
    if funding is not None:
        # Funding negativo = shorters pagando = bullish
        # Funding muito positivo = longers pagando = bearish sinal contrário
        if funding < -0.01:
            fs = 85
        elif funding < 0:
            fs = 70
        elif funding < 0.02:
            fs = 55
        elif funding < 0.05:
            fs = 40
        else:
            fs = 20
        sinais.append({"nome": f"Funding ({funding*100:.3f}%)", "score": fs,
                       "bullish": funding < 0.02, "valor": round(funding * 100, 4)})
        scores.append(fs)

    # Long/Short Ratio
    if ls_ratio is not None:
        if ls_ratio > 2.0:
            lss = 25  # muitos longs = contrário (sobrecomprado)
        elif ls_ratio > 1.2:
            lss = 45
        elif ls_ratio > 0.8:
            lss = 55
        elif ls_ratio > 0.5:
            lss = 70
        else:
            lss = 80  # poucos longs = contrário (sobrevendido)
        sinais.append({"nome": f"L/S Ratio ({ls_ratio:.2f})", "score": lss,
                       "bullish": ls_ratio < 1.2, "valor": round(ls_ratio, 2)})
        scores.append(lss)

    avg = sum(scores) / len(scores) if scores else 50
    return _clamp(avg), sinais


def _score_price_action(
    opens: list[float], highs: list[float], lows: list[float],
    closes: list[float],
) -> tuple[float, list[dict]]:
    sinais: list[dict] = []
    scores: list[float] = []

    # Candlestick patterns
    padrao_candle = detect_candlestick_patterns(opens, highs, lows, closes)
    if padrao_candle:
        bull_scores  = [p["confianca"] for p in padrao_candle if p["bullish"]]
        bear_scores  = [p["confianca"] for p in padrao_candle if not p["bullish"] and p["bullish"] is not None]
        pattern_score = (sum(bull_scores) - sum(bear_scores)) / max(1, len(padrao_candle)) + 50
        sinais.append({"nome": f"Padrões Candle ({len(padrao_candle)} encontrados)",
                       "score": round(_clamp(pattern_score)),
                       "bullish": pattern_score > 50,
                       "detalhe": ", ".join(p["nome"] for p in padrao_candle[:3])})
        scores.append(_clamp(pattern_score))

    # Market structure
    ms = detect_market_structure(highs, lows, closes)
    if ms:
        if ms["tendencia_primaria"] == "alta":
            ms_score = 80
        elif ms["tendencia_primaria"] == "baixa":
            ms_score = 20
        else:
            ms_score = 50
        if ms["bos"] and ms["bos_direcao"] == "alta":
            ms_score = min(100, ms_score + 15)
        elif ms["bos"] and ms["bos_direcao"] == "baixa":
            ms_score = max(0, ms_score - 15)
        if ms["choch"]:
            ms_score = 100 - ms_score  # inversão
        sinais.append({"nome": f"Estrutura ({ms['tendencia_primaria']})",
                       "score": round(ms_score),
                       "bullish": ms["tendencia_primaria"] == "alta",
                       "detalhe": f"BOS: {'Sim' if ms['bos'] else 'Não'} | CHOCH: {'Sim' if ms['choch'] else 'Não'}"})
        scores.append(ms_score)

    # Chart patterns
    padrao_grafico = detect_chart_patterns(highs, lows, closes)
    if padrao_grafico:
        bull_pg = [p for p in padrao_grafico if p.get("bullish")]
        bear_pg = [p for p in padrao_grafico if p.get("bullish") is False]
        pg_score = 65 if bull_pg else 35 if bear_pg else 50
        sinais.append({"nome": f"Padrão Gráfico: {padrao_grafico[0]['nome']}",
                       "score": round(pg_score),
                       "bullish": bool(bull_pg)})
        scores.append(pg_score)

    # Fibonacci posição
    fib = fibonacci(highs, lows, closes)
    if fib:
        pos = fib.get("posicao_pct", 0.5)
        # Preço perto de suporte fib = bom para compra
        fib_score = 80 if pos < 0.3 else 65 if pos < 0.45 else 50 if pos < 0.6 else 35 if pos < 0.8 else 20
        sinais.append({"nome": f"Fibonacci (pos {pos*100:.0f}%)", "score": round(fib_score),
                       "bullish": pos < 0.5, "valor": round(pos, 2)})
        scores.append(fib_score)

    # Bollinger
    bb = bollinger(closes)
    if bb:
        preco = closes[-1]
        bb_range = bb["upper"] - bb["lower"]
        if bb_range > 0:
            bb_pos = (preco - bb["lower"]) / bb_range
            bb_score = 85 if bb_pos < 0.2 else 65 if bb_pos < 0.4 else 50 if bb_pos < 0.6 else 30 if bb_pos < 0.8 else 15
        else:
            bb_score = 50
        sinais.append({"nome": f"Bollinger ({bb['sinal']})", "score": round(bb_score),
                       "bullish": bb["sinal"] == "compra"})
        scores.append(bb_score)

    avg = sum(scores) / len(scores) if scores else 50
    return _clamp(avg), sinais


def _score_externo(
    fear_greed: Optional[int],
    btc_closes: Optional[list[float]],
    rank_mercado: Optional[int],
) -> tuple[float, list[dict]]:
    sinais: list[dict] = []
    scores: list[float] = []

    # Fear & Greed
    if fear_greed is not None:
        fg = int(fear_greed)
        if fg <= 25:    fs = 90
        elif fg <= 40:  fs = 75
        elif fg <= 60:  fs = 60
        elif fg <= 75:  fs = 40
        else:           fs = 20
        sinais.append({"nome": f"Fear & Greed ({fg})", "score": fs,
                       "bullish": fg < 50, "valor": fg})
        scores.append(fs)

    # BTC tendência
    if btc_closes and len(btc_closes) >= 50:
        btc_e21 = ema(btc_closes, 21)
        btc_e50 = ema(btc_closes, 50)
        btc_rsi = rsi(btc_closes)
        btc_p   = btc_closes[-1]
        btc_score = 50.0
        if btc_e21 and btc_e50 and btc_e21 > btc_e50:
            btc_score += 20
        elif btc_e21 and btc_e50:
            btc_score -= 20
        if btc_e21 and btc_p > btc_e21:
            btc_score += 15
        elif btc_e21:
            btc_score -= 15
        if btc_rsi and 40 <= btc_rsi <= 70:
            btc_score += 15
        sinais.append({"nome": "Tendência BTC", "score": round(_clamp(btc_score)),
                       "bullish": btc_score > 50})
        scores.append(_clamp(btc_score))

    # Market cap rank
    if rank_mercado is not None:
        rs = 90 if rank_mercado <= 5 else 75 if rank_mercado <= 10 else 60 if rank_mercado <= 20 else 40 if rank_mercado <= 50 else 20
        sinais.append({"nome": f"Rank Mercado (#{rank_mercado})", "score": rs,
                       "bullish": rank_mercado <= 20, "valor": rank_mercado})
        scores.append(rs)

    avg = sum(scores) / len(scores) if scores else 50
    return _clamp(avg), sinais


# ── Entry / Stop / TP ──────────────────────────────────────────────────────────

def _calcular_niveis(
    preco: float,
    highs: list[float], lows: list[float], closes: list[float],
    score: float,
    estrutura: dict,
    fib: dict,
    bullish: bool,
) -> dict:
    atr_v = calc_atr(highs, lows, closes) or (preco * 0.02)

    # Tipo de entrada
    if score >= 80:
        tipo = "Rompimento" if estrutura.get("bos") else "Tendência"
    elif score >= 65:
        tipo = "Pullback"
    else:
        tipo = "Reversão"

    if bullish:
        # Entry: preço atual ou pullback para EMA21
        e21 = ema(closes, 21)
        entrada = round(e21 * 1.005, 2) if e21 and preco > e21 * 0.99 else round(preco, 2)

        # Stop: abaixo do último suporte ou 1.5×ATR
        sups = estrutura.get("suportes", [])
        stop_struct = sups[0] * 0.995 if sups and sups[0] < entrada else entrada - 2 * atr_v
        stop_atr    = entrada - 1.5 * atr_v
        stop = round(max(stop_struct, stop_atr) if stop_struct > 0 else stop_atr, 2)
        stop = round(min(stop, entrada * 0.97), 2)  # máximo 3% de stop

        risco = entrada - stop

        # TP baseado em R:R e resistências
        ress = estrutura.get("resistencias", [])
        tp1 = round(entrada + risco * 1.5, 2)
        tp2 = round(ress[0], 2) if ress else round(entrada + risco * 2.5, 2)
        tp3 = round(ress[1], 2) if len(ress) > 1 else round(entrada + risco * 4.0, 2)

        # Extensão Fibonacci
        fib_ext = fib.get("extensoes", {})
        if fib_ext.get("1.272") and fib_ext["1.272"] > entrada:
            tp2 = round(fib_ext["1.272"], 2)
        if fib_ext.get("1.618") and fib_ext["1.618"] > tp2:
            tp3 = round(fib_ext["1.618"], 2)

    else:
        # SHORT / VENDA
        e21 = ema(closes, 21)
        entrada = round(e21 * 0.995, 2) if e21 and preco < e21 * 1.01 else round(preco, 2)
        ress = estrutura.get("resistencias", [])
        stop_struct = ress[0] * 1.005 if ress else entrada + 2 * atr_v
        stop = round(max(stop_struct, entrada + 1.5 * atr_v), 2)
        stop = round(max(stop, entrada * 1.03), 2)

        risco = stop - entrada
        sups = estrutura.get("suportes", [])
        tp1 = round(entrada - risco * 1.5, 2)
        tp2 = round(sups[0], 2) if sups else round(entrada - risco * 2.5, 2)
        tp3 = round(sups[1], 2) if len(sups) > 1 else round(entrada - risco * 4.0, 2)

    # R:R
    def rr(tp):
        ret = abs(tp - entrada)
        return round(ret / abs(risco), 2) if risco > 0 else 0.0

    risco_pct  = round(abs(entrada - stop) / entrada * 100, 2)
    ret1_pct   = round(abs(tp1 - entrada) / entrada * 100, 2)
    ret2_pct   = round(abs(tp2 - entrada) / entrada * 100, 2)
    ret3_pct   = round(abs(tp3 - entrada) / entrada * 100, 2)

    # Tempo estimado
    vol = calc_vol(closes)
    vol_d = vol.get("vol_30d_pct") or 3
    dias_tp1 = max(1, round(ret1_pct / (vol_d / math.sqrt(30))))
    tempo = f"{dias_tp1}–{dias_tp1 * 3} dias"

    return {
        "tipo_entrada":  tipo,
        "entrada_ideal": entrada,
        "stop_loss":     stop,
        "take_profit_1": tp1,
        "take_profit_2": tp2,
        "take_profit_3": tp3,
        "risco_pct":     risco_pct,
        "retorno_1_pct": ret1_pct,
        "retorno_2_pct": ret2_pct,
        "retorno_3_pct": ret3_pct,
        "rr_1":          f"1:{rr(tp1)}",
        "rr_2":          f"1:{rr(tp2)}",
        "rr_3":          f"1:{rr(tp3)}",
        "atr":           round(atr_v, 2),
        "tempo_estimado":tempo,
    }


# ── Geração de texto explicativo ──────────────────────────────────────────────

def _gerar_justificativa(
    simbolo: str, score: float, decisao: str, bullish: bool,
    cat: dict, niveis: dict, padroes_candle: list, estrutura: dict,
) -> str:
    linhas = []
    linhas.append(f"**{simbolo} — Score {score:.0f}/100 | {decisao}**\n")

    if bullish:
        linhas.append("**Fatores favoráveis (ALTA):**")
    else:
        linhas.append("**Fatores favoráveis (BAIXA/SAÍDA):**")

    # Top indicadores
    for cat_nome, cat_data in cat.items():
        sinais = cat_data.get("sinais", [])
        bulls  = [s for s in sinais if s.get("bullish") == bullish and s["score"] > 60]
        for s in bulls[:2]:
            linhas.append(f"• {s['nome']} → {s.get('sinal', 'favorável')} (score {s['score']})")

    # Padrões
    if padroes_candle:
        bull_p = [p for p in padroes_candle if p["bullish"] == bullish]
        if bull_p:
            linhas.append(f"• Padrão detectado: **{bull_p[0]['nome']}** — {bull_p[0]['descricao']}")

    # Estrutura
    if estrutura.get("bos"):
        linhas.append(f"• Break of Structure detectado para {estrutura['bos_direcao']} — força confirmada")
    if estrutura.get("choch"):
        linhas.append("• Change of Character — mudança de tendência em curso")

    linhas.append(f"\n**Nível de entrada:** {niveis['entrada_ideal']} | **Stop:** {niveis['stop_loss']}")
    linhas.append(f"**TP1:** {niveis['take_profit_1']} ({niveis['rr_1']}) | **TP2:** {niveis['take_profit_2']} ({niveis['rr_2']}) | **TP3:** {niveis['take_profit_3']} ({niveis['rr_3']})")
    linhas.append(f"**Tipo de entrada:** {niveis['tipo_entrada']} | **Horizonte:** {niveis['tempo_estimado']}")

    if score < 61:
        linhas.append("\n⚠️ **Score insuficiente para entrada segura.** Critérios de confluência não atendidos. Recomendação: NÃO OPERAR.")

    return "\n".join(linhas)


# ── Função principal ──────────────────────────────────────────────────────────

def calcular_sinal_completo(
    simbolo: str,
    opens: list[float],
    highs: list[float],
    lows: list[float],
    closes: list[float],
    volumes: list[float],
    fear_greed: Optional[int],
    btc_closes: Optional[list[float]],
    rank_mercado: Optional[int],
    oi_change: Optional[float] = None,
    funding: Optional[float] = None,
    ls_ratio: Optional[float] = None,
    weights: Optional[dict] = None,
) -> dict:
    if len(closes) < 30:
        return {"erro": "Dados insuficientes"}

    w = weights or DEFAULT_WEIGHTS
    preco = closes[-1]

    # Scores por categoria
    score_tend, sinais_tend   = _score_tendencia(closes, highs, lows, preco)
    score_mom,  sinais_mom    = _score_momentum(closes, highs, lows)
    score_vol,  sinais_vol    = _score_volume(closes, highs, lows, volumes, oi_change, funding, ls_ratio)
    score_pa,   sinais_pa     = _score_price_action(opens, highs, lows, closes)
    score_ext,  sinais_ext    = _score_externo(fear_greed, btc_closes, rank_mercado)

    # Score final ponderado
    score = (
        score_tend * w["tendencia"]    +
        score_mom  * w["momentum"]     +
        score_vol  * w["volume"]       +
        score_pa   * w["price_action"] +
        score_ext  * w["externo"]
    )
    score = round(_clamp(score), 1)

    # Decisão
    bullish = score >= 50
    if score >= 86:
        decisao = "COMPRA MUITO FORTE"
        cor = "#10b981"
    elif score >= 76:
        decisao = "COMPRA FORTE"
        cor = "#34d399"
    elif score >= 61:
        decisao = "BOA OPORTUNIDADE"
        cor = "#84cc16"
    elif score >= 41:
        decisao = "AGUARDAR"
        cor = "#f59e0b"
    elif score >= 25:
        decisao = "ALTO RISCO"
        cor = "#f97316"
    else:
        decisao = "NÃO OPERAR"
        cor = "#ef4444"

    # Padrões
    padroes_candle = detect_candlestick_patterns(opens, highs, lows, closes)
    padroes_graf   = detect_chart_patterns(highs, lows, closes)
    estrutura      = detect_market_structure(highs, lows, closes)
    fib            = fibonacci_avancado(highs, lows, closes)

    # Níveis de entrada/saída
    niveis = _calcular_niveis(preco, highs, lows, closes, score, estrutura, fib, bullish)

    # Categorias
    categorias = {
        "tendencia":    {"score": round(score_tend, 1), "sinais": sinais_tend},
        "momentum":     {"score": round(score_mom,  1), "sinais": sinais_mom},
        "volume":       {"score": round(score_vol,  1), "sinais": sinais_vol},
        "price_action": {"score": round(score_pa,   1), "sinais": sinais_pa},
        "externo":      {"score": round(score_ext,  1), "sinais": sinais_ext},
    }

    # Indicadores desfavoráveis
    contra = []
    for cat_nome, cat_data in categorias.items():
        for s in cat_data["sinais"]:
            if s.get("bullish") != bullish and s["score"] > 55:
                contra.append(s["nome"])

    # Justificativa
    just = _gerar_justificativa(simbolo, score, decisao, bullish,
                                categorias, niveis, padroes_candle, estrutura)

    return {
        "simbolo":      simbolo,
        "preco_atual":  round(preco, 2),
        "score":        score,
        "decisao":      decisao,
        "cor":          cor,
        "bullish":      bullish,
        "confianca":    round((score if bullish else 100 - score), 1),
        "categorias":   categorias,
        "niveis":       niveis,
        "padroes": {
            "candles":  padroes_candle,
            "graficos": padroes_graf,
            "estrutura":estrutura,
        },
        "fibonacci":    fib,
        "indicadores_favoraveis": [
            s["nome"] for cat in categorias.values()
            for s in cat["sinais"] if s.get("bullish") == bullish
        ][:8],
        "indicadores_contrarios": contra[:5],
        "justificativa":just,
        "candles_usados": len(closes),
    }
