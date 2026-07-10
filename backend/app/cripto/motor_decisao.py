"""
Motor de Decisão Inteligente para Criptomoedas.

4 motores independentes → Decisão Final + Confidence Score.
Tudo em Python puro, sem pandas/numpy.
"""
from __future__ import annotations
import math
from typing import Optional

from .indicators import (
    rsi, macd, adx, ema, bollinger, atr, obv_signal,
    roc, cci, mfi, stoch_rsi, williams_r, fibonacci,
    volatilidade as calc_vol,
)


# ─────────────────────────────────────────────────────────────────────────────
# ICP — Índice de Confirmação Preditiva (0-100)
# "A tendência desta criptomoeda realmente é forte?"
# ─────────────────────────────────────────────────────────────────────────────

def calcular_icp(
    closes: list[float],
    highs: list[float],
    lows: list[float],
    volumes: list[float],
    corr_90: Optional[float] = None,
    fr_30: Optional[float] = None,
    beta_90: Optional[float] = None,
) -> dict:
    componentes: dict[str, float] = {}
    detalhes: dict[str, object] = {}

    # 1. RSI (peso 15) — ideal: 50-65 (tendência alta sem sobrecompra)
    rsi_val = rsi(closes, 14)
    detalhes["rsi"] = rsi_val
    if rsi_val is not None:
        if 50 <= rsi_val <= 65:
            componentes["rsi"] = 100.0
        elif 40 <= rsi_val < 50:
            componentes["rsi"] = 70.0
        elif 65 < rsi_val <= 75:
            componentes["rsi"] = 75.0
        elif 75 < rsi_val <= 85:
            componentes["rsi"] = 40.0
        elif rsi_val > 85:
            componentes["rsi"] = 10.0
        elif 30 <= rsi_val < 40:
            componentes["rsi"] = 50.0
        else:
            componentes["rsi"] = 20.0  # < 30 oversold, momentum fraco
    else:
        componentes["rsi"] = 50.0

    # 2. MACD (peso 20) — histograma positivo e crescendo = máx
    macd_data = macd(closes)
    detalhes["macd"] = macd_data
    if macd_data:
        hist = macd_data["histograma"]
        macd_line = macd_data["macd"]
        sig_line = macd_data["signal"]
        if hist > 0 and macd_line > 0:
            componentes["macd"] = 100.0
        elif hist > 0 and macd_line <= 0:
            componentes["macd"] = 75.0  # cruzamento positivo mas ainda negativo
        elif hist < 0 and macd_line > sig_line:
            componentes["macd"] = 40.0  # deteriorando
        else:
            componentes["macd"] = 10.0
    else:
        componentes["macd"] = 50.0

    # 3. ADX (peso 15) — > 25 forte, direção alta = máx
    adx_data = adx(highs, lows, closes)
    detalhes["adx"] = adx_data
    if adx_data:
        adx_v = adx_data["adx"] or 0
        plus_di = adx_data["plus_di"]
        minus_di = adx_data["minus_di"]
        if adx_v >= 40 and plus_di > minus_di:
            componentes["adx"] = 100.0
        elif adx_v >= 25 and plus_di > minus_di:
            componentes["adx"] = 80.0
        elif adx_v >= 25 and plus_di <= minus_di:
            componentes["adx"] = 30.0  # tendência forte de baixa
        elif adx_v < 25 and plus_di > minus_di:
            componentes["adx"] = 55.0  # tendência fraca mas positiva
        else:
            componentes["adx"] = 25.0
    else:
        componentes["adx"] = 50.0

    # 4. EMA Alignment (peso 20) — 9 > 21 > 50 = tendência confirmada
    e9  = ema(closes, 9)
    e21 = ema(closes, 21)
    e50 = ema(closes, 50)
    e200 = ema(closes, 200)
    preco = closes[-1] if closes else 0
    detalhes["emas"] = {"e9": e9, "e21": e21, "e50": e50, "e200": e200}

    ema_score = 0.0
    if e9 and e21 and preco > e9 > e21:
        ema_score += 40.0
    elif e9 and e21 and preco > e21:
        ema_score += 20.0

    if e21 and e50 and e21 > e50:
        ema_score += 30.0

    if e50 and e200 and e50 > e200:
        ema_score += 30.0

    componentes["ema_align"] = ema_score

    # 5. Volume / OBV (peso 10)
    obv_sig = obv_signal(closes, volumes) if volumes else "neutro"
    detalhes["obv"] = obv_sig
    if obv_sig == "compra":
        componentes["obv"] = 100.0
    elif obv_sig == "neutro":
        componentes["obv"] = 50.0
    else:
        componentes["obv"] = 0.0

    # 6. ROC Momentum (peso 10)
    roc_val = roc(closes, 10)
    detalhes["roc"] = roc_val
    if roc_val is not None:
        if roc_val > 15:
            componentes["roc"] = 90.0
        elif roc_val > 5:
            componentes["roc"] = 75.0
        elif roc_val > 0:
            componentes["roc"] = 55.0
        elif roc_val > -5:
            componentes["roc"] = 35.0
        else:
            componentes["roc"] = 10.0
    else:
        componentes["roc"] = 50.0

    # 7. Correlação BTC (peso 5) — alta correlação em tendência de alta = bom
    if corr_90 is not None:
        componentes["correlacao_btc"] = max(0, min(100, corr_90 * 100))
    else:
        componentes["correlacao_btc"] = 50.0

    # 8. Força Relativa vs BTC (peso 5)
    if fr_30 is not None:
        if fr_30 > 1.2:
            componentes["fr_btc"] = 100.0
        elif fr_30 > 1.0:
            componentes["fr_btc"] = 70.0
        elif fr_30 > 0.8:
            componentes["fr_btc"] = 40.0
        else:
            componentes["fr_btc"] = 10.0
    else:
        componentes["fr_btc"] = 50.0

    # Pesos
    pesos = {
        "rsi": 0.15,
        "macd": 0.20,
        "adx": 0.15,
        "ema_align": 0.20,
        "obv": 0.10,
        "roc": 0.10,
        "correlacao_btc": 0.05,
        "fr_btc": 0.05,
    }

    score = sum(componentes.get(k, 50) * v for k, v in pesos.items())
    score = max(0.0, min(100.0, score))

    nivel = _nivel_icp(score)

    return {
        "score": round(score, 1),
        "nivel": nivel,
        "componentes": {k: round(v, 1) for k, v in componentes.items()},
        "detalhes": detalhes,
    }


def _nivel_icp(score: float) -> str:
    if score >= 95:  return "Compra Muito Forte"
    if score >= 85:  return "Compra Forte"
    if score >= 75:  return "Compra Moderada"
    if score >= 65:  return "Aguardar"
    if score >= 50:  return "Fraco"
    return "Muito Fraco"


# ─────────────────────────────────────────────────────────────────────────────
# ICE — Índice de Cenário Externo (0-100)
# "O mercado favorece compras?"
# ─────────────────────────────────────────────────────────────────────────────

def calcular_ice(
    fear_greed: Optional[int],
    btc_closes: Optional[list[float]],
    rank_mercado: Optional[int] = None,
) -> dict:
    componentes: dict[str, float] = {}

    # 1. Fear & Greed Index (peso 35)
    if fear_greed is not None:
        fg = int(fear_greed)
        if 40 <= fg <= 60:
            componentes["fear_greed"] = 70.0  # neutro — bom para entrada
        elif 25 <= fg < 40:
            componentes["fear_greed"] = 90.0  # medo = oportunidade
        elif fg < 25:
            componentes["fear_greed"] = 100.0  # medo extremo = melhor momento
        elif 60 < fg <= 75:
            componentes["fear_greed"] = 50.0  # ganância
        else:
            componentes["fear_greed"] = 20.0  # ganância extrema = risco
    else:
        componentes["fear_greed"] = 50.0

    # 2. Tendência BTC (proxy mercado) (peso 40)
    if btc_closes and len(btc_closes) >= 50:
        btc_e21 = ema(btc_closes, 21)
        btc_e50 = ema(btc_closes, 50)
        btc_rsi = rsi(btc_closes, 14)
        btc_preco = btc_closes[-1]

        btc_score = 50.0
        if btc_e21 and btc_e50 and btc_e21 > btc_e50:
            btc_score += 20.0
        elif btc_e21 and btc_e50 and btc_e21 < btc_e50:
            btc_score -= 20.0
        if btc_e21 and btc_preco > btc_e21:
            btc_score += 15.0
        elif btc_e21 and btc_preco < btc_e21:
            btc_score -= 15.0
        if btc_rsi and 40 <= btc_rsi <= 70:
            btc_score += 15.0
        elif btc_rsi and btc_rsi > 75:
            btc_score -= 10.0
        elif btc_rsi and btc_rsi < 35:
            btc_score += 5.0  # oversold BTC = possível recuperação

        componentes["tendencia_btc"] = max(0.0, min(100.0, btc_score))
    else:
        componentes["tendencia_btc"] = 50.0

    # 3. Market Cap Rank (peso 25) — top 20 = mais seguro
    if rank_mercado is not None:
        if rank_mercado <= 5:
            componentes["rank"] = 100.0
        elif rank_mercado <= 10:
            componentes["rank"] = 85.0
        elif rank_mercado <= 20:
            componentes["rank"] = 70.0
        elif rank_mercado <= 50:
            componentes["rank"] = 50.0
        elif rank_mercado <= 100:
            componentes["rank"] = 30.0
        else:
            componentes["rank"] = 15.0
    else:
        componentes["rank"] = 50.0

    pesos = {
        "fear_greed":    0.35,
        "tendencia_btc": 0.40,
        "rank":          0.25,
    }

    score = sum(componentes.get(k, 50) * v for k, v in pesos.items())
    score = max(0.0, min(100.0, score))

    return {
        "score": round(score, 1),
        "nivel": _nivel_ice(score),
        "componentes": {k: round(v, 1) for k, v in componentes.items()},
        "fear_greed_valor": fear_greed,
        "fear_greed_label": _fg_label(fear_greed),
    }


def _nivel_ice(score: float) -> str:
    if score >= 80:  return "Favorável"
    if score >= 65:  return "Levemente Favorável"
    if score >= 45:  return "Neutro"
    if score >= 30:  return "Desfavorável"
    return "Muito Desfavorável"


def _fg_label(v: Optional[int]) -> str:
    if v is None:
        return "—"
    if v <= 25:   return "Medo Extremo"
    if v <= 45:   return "Medo"
    if v <= 55:   return "Neutro"
    if v <= 75:   return "Ganância"
    return "Ganância Extrema"


# ─────────────────────────────────────────────────────────────────────────────
# ICEP — Índice de Cansaço do Preço (0-100)
# "O preço já subiu demais?" — maior = mais esticado/cansado
# ─────────────────────────────────────────────────────────────────────────────

def calcular_icep(
    closes: list[float],
    highs: list[float],
    lows: list[float],
    volumes: list[float],
) -> dict:
    componentes: dict[str, float] = {}
    detalhes: dict[str, object] = {}

    preco = closes[-1]

    # 1. Distância das EMAs (peso 25) — muito acima = esticado
    e21 = ema(closes, 21)
    e50 = ema(closes, 50)
    detalhes["ema_21"] = e21
    detalhes["ema_50"] = e50

    if e21:
        dist21_pct = (preco - e21) / e21 * 100
        if dist21_pct > 30:
            componentes["dist_ema21"] = 100.0
        elif dist21_pct > 20:
            componentes["dist_ema21"] = 85.0
        elif dist21_pct > 10:
            componentes["dist_ema21"] = 65.0
        elif dist21_pct > 5:
            componentes["dist_ema21"] = 45.0
        elif dist21_pct > 0:
            componentes["dist_ema21"] = 30.0
        else:
            componentes["dist_ema21"] = 10.0  # abaixo da EMA21 = não esticado
    else:
        componentes["dist_ema21"] = 50.0

    # 2. RSI sobrecomprado (peso 20)
    rsi_val = rsi(closes, 14)
    detalhes["rsi"] = rsi_val
    if rsi_val is not None:
        if rsi_val > 80:
            componentes["rsi_sobrecompra"] = 100.0
        elif rsi_val > 70:
            componentes["rsi_sobrecompra"] = 80.0
        elif rsi_val > 60:
            componentes["rsi_sobrecompra"] = 50.0
        elif rsi_val > 50:
            componentes["rsi_sobrecompra"] = 25.0
        elif rsi_val > 30:
            componentes["rsi_sobrecompra"] = 10.0
        else:
            componentes["rsi_sobrecompra"] = 0.0  # sobrevendido = não esticado
    else:
        componentes["rsi_sobrecompra"] = 50.0

    # 3. MFI — dinheiro saindo (peso 15)
    mfi_val = mfi(highs, lows, closes, volumes)
    detalhes["mfi"] = mfi_val
    if mfi_val is not None:
        if mfi_val > 80:
            componentes["mfi_cansaco"] = 100.0
        elif mfi_val > 70:
            componentes["mfi_cansaco"] = 70.0
        elif mfi_val > 50:
            componentes["mfi_cansaco"] = 40.0
        else:
            componentes["mfi_cansaco"] = 10.0
    else:
        componentes["mfi_cansaco"] = 50.0

    # 4. Bollinger — posição (peso 20)
    bb = bollinger(closes)
    detalhes["bollinger"] = bb
    if bb:
        upper = bb["upper"]
        middle = bb["middle"]
        lower = bb["lower"]
        rng = upper - lower
        if rng > 0:
            bb_pos = (preco - lower) / rng  # 0=lower, 1=upper
            componentes["bollinger_pos"] = min(100.0, bb_pos * 100)
        else:
            componentes["bollinger_pos"] = 50.0
    else:
        componentes["bollinger_pos"] = 50.0

    # 5. Fibonacci posição (peso 20)
    fib = fibonacci(highs, lows, closes)
    detalhes["fibonacci"] = fib
    fib_pos = fib.get("posicao_pct", 0.5)  # 0=low, 1=high
    componentes["fibonacci_pos"] = min(100.0, fib_pos * 100)

    pesos = {
        "dist_ema21":      0.25,
        "rsi_sobrecompra": 0.20,
        "mfi_cansaco":     0.15,
        "bollinger_pos":   0.20,
        "fibonacci_pos":   0.20,
    }

    score = sum(componentes.get(k, 50) * v for k, v in pesos.items())
    score = max(0.0, min(100.0, score))

    return {
        "score": round(score, 1),
        "nivel": _nivel_icep(score),
        "componentes": {k: round(v, 1) for k, v in componentes.items()},
        "detalhes": detalhes,
    }


def _nivel_icep(score: float) -> str:
    if score >= 80:  return "Muito Esticado"
    if score >= 65:  return "Esticado"
    if score >= 45:  return "Neutro"
    if score >= 30:  return "Saudável"
    return "Descontado"


# ─────────────────────────────────────────────────────────────────────────────
# IEE — Índice de Entrada Estratégica (0-100)
# "Este é um bom momento para comprar?"
# ─────────────────────────────────────────────────────────────────────────────

def calcular_iee(
    icp: float,
    ice: float,
    icep: float,
    closes: list[float],
    highs: list[float],
    lows: list[float],
    volumes: list[float],
) -> dict:
    componentes: dict[str, float] = {}

    # 1. ICP contribuição (peso 30) — tendência forte = bom
    componentes["icp"] = icp

    # 2. ICE contribuição (peso 25) — mercado favorável = bom
    componentes["ice"] = ice

    # 3. ICEP invertido (peso 25) — preço NÃO esticado = bom
    componentes["icep_inv"] = max(0.0, 100.0 - icep)

    # 4. Stochastic RSI (peso 10) — sobrevenda = oportunidade
    srsi = stoch_rsi(closes)
    if srsi:
        k_val = srsi["k"]
        if k_val < 20:
            componentes["stoch_rsi"] = 100.0
        elif k_val < 40:
            componentes["stoch_rsi"] = 70.0
        elif k_val < 60:
            componentes["stoch_rsi"] = 50.0
        elif k_val < 80:
            componentes["stoch_rsi"] = 25.0
        else:
            componentes["stoch_rsi"] = 5.0
    else:
        componentes["stoch_rsi"] = 50.0

    # 5. Williams %R (peso 10) — sobrevenda = entrada
    wr = williams_r(highs, lows, closes)
    if wr is not None:
        if wr < -80:
            componentes["williams_r"] = 100.0
        elif wr < -60:
            componentes["williams_r"] = 70.0
        elif wr < -40:
            componentes["williams_r"] = 50.0
        elif wr < -20:
            componentes["williams_r"] = 25.0
        else:
            componentes["williams_r"] = 5.0
    else:
        componentes["williams_r"] = 50.0

    pesos = {
        "icp":       0.30,
        "ice":       0.25,
        "icep_inv":  0.25,
        "stoch_rsi": 0.10,
        "williams_r":0.10,
    }

    score = sum(componentes.get(k, 50) * v for k, v in pesos.items())
    score = max(0.0, min(100.0, score))

    return {
        "score": round(score, 1),
        "nivel": _nivel_iee(score),
        "componentes": {k: round(v, 1) for k, v in componentes.items()},
    }


def _nivel_iee(score: float) -> str:
    if score >= 90:  return "Excelente"
    if score >= 80:  return "Muito Boa"
    if score >= 70:  return "Boa"
    if score >= 60:  return "Neutra"
    if score >= 40:  return "Ruim"
    return "Evitar"


# ─────────────────────────────────────────────────────────────────────────────
# Decisão Final
# ─────────────────────────────────────────────────────────────────────────────

def decisao_final(icp: float, ice: float, icep: float, iee: float) -> dict:
    """
    Regras baseadas nos 4 motores.
    Retorna decisao, emoji, cor, descricao.
    """
    if icp >= 90 and ice >= 80 and icep <= 35 and iee >= 85:
        return {
            "decisao": "COMPRA FORTE",
            "emoji": "🟢",
            "cor": "#10b981",
            "descricao": "Todos os motores apontam para compra. Tendência forte, mercado favorável e preço não esticado.",
        }
    if icp >= 75 and ice >= 65 and icep <= 50 and iee >= 70:
        return {
            "decisao": "COMPRA",
            "emoji": "🟢",
            "cor": "#34d399",
            "descricao": "Condições favoráveis para entrada. ICP e ICE positivos, preço em zona razoável.",
        }
    if icp >= 65 and ice >= 50 and icep <= 60 and iee >= 60:
        return {
            "decisao": "COMPRA PARCIAL",
            "emoji": "🟡",
            "cor": "#84cc16",
            "descricao": "Cenário levemente favorável. Considere entrada parcial e aguarde confirmação.",
        }
    if icep >= 75 and icp >= 70:
        return {
            "decisao": "AGUARDAR CORREÇÃO",
            "emoji": "🟡",
            "cor": "#f59e0b",
            "descricao": "Tendência positiva mas preço muito esticado. Aguarde correção antes de entrar.",
        }
    if ice <= 35 or icp <= 35:
        return {
            "decisao": "EVITAR",
            "emoji": "🔴",
            "cor": "#ef4444",
            "descricao": "Mercado desfavorável ou tendência muito fraca. Alto risco de perda.",
        }
    if icp <= 50 and icep >= 60:
        return {
            "decisao": "VENDA / REDUÇÃO",
            "emoji": "🔴",
            "cor": "#f97316",
            "descricao": "Preço esticado e tendência enfraquecendo. Considere reduzir posição.",
        }
    return {
        "decisao": "NEUTRO",
        "emoji": "⚪",
        "cor": "#6b7280",
        "descricao": "Sinais mistos. Sem tendência clara — aguarde maior definição.",
    }


# ─────────────────────────────────────────────────────────────────────────────
# Confidence Score (0-100)
# Quanto os indicadores concordam entre si
# ─────────────────────────────────────────────────────────────────────────────

def confidence_score(
    closes: list[float],
    highs: list[float],
    lows: list[float],
    volumes: list[float],
) -> dict:
    """
    Calcula consenso entre múltiplos indicadores.
    Conta quantos apontam para 'alta' vs 'baixa'.
    """
    sinais: list[str] = []

    # RSI
    rsi_v = rsi(closes)
    if rsi_v is not None:
        if rsi_v > 50:
            sinais.append("alta")
        elif rsi_v < 50:
            sinais.append("baixa")
        else:
            sinais.append("neutro")

    # MACD
    m = macd(closes)
    if m:
        sinais.append("alta" if m["histograma"] > 0 else "baixa")

    # EMA 9/21
    e9 = ema(closes, 9)
    e21 = ema(closes, 21)
    preco = closes[-1]
    if e9 and e21:
        sinais.append("alta" if e9 > e21 else "baixa")

    # EMA 21/50
    e50 = ema(closes, 50)
    if e21 and e50:
        sinais.append("alta" if e21 > e50 else "baixa")

    # OBV
    obv = obv_signal(closes, volumes)
    if obv != "neutro":
        sinais.append("alta" if obv == "compra" else "baixa")

    # ADX direção
    adx_d = adx(highs, lows, closes)
    if adx_d:
        sinais.append("alta" if adx_d["direcao"] == "alta" else "baixa")

    # Bollinger
    bb = bollinger(closes)
    if bb:
        if bb["sinal"] == "compra":
            sinais.append("alta")
        elif bb["sinal"] == "venda":
            sinais.append("baixa")

    # Stoch RSI
    sr = stoch_rsi(closes)
    if sr:
        if sr["sinal"] == "compra":
            sinais.append("alta")
        elif sr["sinal"] == "venda":
            sinais.append("baixa")

    # Williams %R
    wr = williams_r(highs, lows, closes)
    if wr is not None:
        sinais.append("alta" if wr < -50 else "baixa")

    # MFI
    mf = mfi(highs, lows, closes, volumes)
    if mf is not None:
        sinais.append("alta" if mf < 50 else "baixa")

    if not sinais:
        return {"score": 50.0, "nivel": "Indefinido", "alta": 0, "baixa": 0, "neutro": 0}

    n_alta  = sinais.count("alta")
    n_baixa = sinais.count("baixa")
    n_neutro = sinais.count("neutro")
    total = len(sinais)

    # Score = dominância do lado vencedor
    dominant = max(n_alta, n_baixa)
    score = (dominant / total) * 100.0

    # Penaliza discordância
    discordancia = min(n_alta, n_baixa) / total
    score = score * (1.0 - discordancia * 0.5)

    nivel_conf = _nivel_confidence(score)

    return {
        "score": round(score, 1),
        "nivel": nivel_conf,
        "alta": n_alta,
        "baixa": n_baixa,
        "neutro": n_neutro,
        "total": total,
        "tendencia_dominante": "alta" if n_alta > n_baixa else "baixa" if n_baixa > n_alta else "neutra",
    }


def _nivel_confidence(score: float) -> str:
    if score >= 85:  return "Muito Alto"
    if score >= 70:  return "Alto"
    if score >= 55:  return "Moderado"
    if score >= 40:  return "Baixo"
    return "Muito Baixo"


# ─────────────────────────────────────────────────────────────────────────────
# Relatório IA (texto gerado automaticamente)
# ─────────────────────────────────────────────────────────────────────────────

def gerar_relatorio(
    simbolo: str,
    icp: dict,
    ice: dict,
    icep: dict,
    iee: dict,
    decisao: dict,
    confidence: dict,
) -> str:
    linhas = []
    linhas.append(f"**Análise Motor de Decisão — {simbolo}**")
    linhas.append("")

    # Decisão
    d = decisao["decisao"]
    linhas.append(f"**Decisão:** {decisao['emoji']} {d}")
    linhas.append(f"{decisao['descricao']}")
    linhas.append("")

    # Motores
    linhas.append(f"**ICP** ({icp['score']:.0f}/100 — {icp['nivel']}): ", )
    if icp['score'] >= 75:
        linhas[-1] += "Tendência técnica confirmada com múltiplos indicadores em consenso de alta."
    elif icp['score'] >= 50:
        linhas[-1] += "Tendência parcialmente confirmada. Aguarde alinhamento de mais indicadores."
    else:
        linhas[-1] += "Tendência fraca ou ausente. RSI, MACD e EMAs não confirmam movimento direcional."

    linhas.append(f"**ICE** ({ice['score']:.0f}/100 — {ice['nivel']}): ", )
    fg_label = ice.get("fear_greed_label", "—")
    fg_val = ice.get("fear_greed_valor")
    if ice['score'] >= 65:
        linhas[-1] += f"Cenário externo favorável. Fear & Greed em {fg_val} ({fg_label})."
    else:
        linhas[-1] += f"Cenário externo desfavorável. Fear & Greed em {fg_val} ({fg_label})."

    linhas.append(f"**ICEP** ({icep['score']:.0f}/100 — {icep['nivel']}): ", )
    if icep['score'] >= 70:
        linhas[-1] += "Preço muito esticado em relação às médias. Risco elevado de correção."
    elif icep['score'] >= 45:
        linhas[-1] += "Preço em zona neutra. Não há sinais fortes de sobrecompra ou sobrevenda."
    else:
        linhas[-1] += "Preço descontado ou próximo de suporte. Potencial ponto de entrada."

    linhas.append(f"**IEE** ({iee['score']:.0f}/100 — {iee['nivel']}): ", )
    if iee['score'] >= 70:
        linhas[-1] += "Ponto estratégico favorável para entrada."
    elif iee['score'] >= 50:
        linhas[-1] += "Entrada possível mas não ideal. Aguarde melhor alinhamento."
    else:
        linhas[-1] += "Momento desfavorável para entrada. Preserve capital."

    linhas.append("")
    linhas.append(f"**Confiança:** {confidence['score']:.0f}% ({confidence['nivel']}) — "
                  f"{confidence['alta']} de {confidence['total']} indicadores apontam para alta.")

    return "\n".join(linhas)


# ─────────────────────────────────────────────────────────────────────────────
# Função principal
# ─────────────────────────────────────────────────────────────────────────────

def calcular_motor_completo(
    simbolo: str,
    closes: list[float],
    highs: list[float],
    lows: list[float],
    volumes: list[float],
    fear_greed: Optional[int],
    btc_closes: Optional[list[float]],
    rank_mercado: Optional[int],
    corr_90: Optional[float] = None,
    fr_30: Optional[float] = None,
    beta_90: Optional[float] = None,
) -> dict:
    if len(closes) < 30:
        return {"erro": "Dados insuficientes para análise (mínimo 30 candles)"}

    icp = calcular_icp(closes, highs, lows, volumes, corr_90, fr_30, beta_90)
    ice = calcular_ice(fear_greed, btc_closes, rank_mercado)
    icep = calcular_icep(closes, highs, lows, volumes)
    iee = calcular_iee(icp["score"], ice["score"], icep["score"], closes, highs, lows, volumes)
    decisao = decisao_final(icp["score"], ice["score"], icep["score"], iee["score"])
    confidence = confidence_score(closes, highs, lows, volumes)
    relatorio = gerar_relatorio(simbolo, icp, ice, icep, iee, decisao, confidence)

    # Indicadores adicionais para exibir na UI
    indicadores_extra = {
        "rsi": rsi(closes),
        "macd": macd(closes),
        "adx": adx(highs, lows, closes),
        "bollinger": bollinger(closes),
        "stoch_rsi": stoch_rsi(closes),
        "williams_r": williams_r(highs, lows, closes),
        "mfi": mfi(highs, lows, closes, volumes),
        "roc": roc(closes),
        "cci": cci(highs, lows, closes),
        "ema_9":  ema(closes, 9),
        "ema_21": ema(closes, 21),
        "ema_50": ema(closes, 50),
        "ema_200": ema(closes, 200),
        "fibonacci": fibonacci(highs, lows, closes),
    }

    vol = calc_vol(closes)

    return {
        "simbolo":    simbolo,
        "icp":        icp,
        "ice":        ice,
        "icep":       icep,
        "iee":        iee,
        "decisao":    decisao,
        "confidence": confidence,
        "relatorio":  relatorio,
        "indicadores":indicadores_extra,
        "volatilidade": vol,
        "preco_atual": closes[-1] if closes else None,
        "candles_usados": len(closes),
    }
