"""
Motor de Score para Criptomoedas.
Gera Score Geral (0-100), Score de Compra, Score de Venda,
análise de risco e conclusão da IA.
"""
from __future__ import annotations
from typing import Optional


def _clamp(v: float, lo=0.0, hi=100.0) -> float:
    return max(lo, min(hi, v))


def _norm(v: Optional[float], lo: float, hi: float, inverse=False) -> float:
    if v is None:
        return 50.0
    ratio = (v - lo) / (hi - lo) if hi != lo else 0.5
    ratio = max(0.0, min(1.0, ratio))
    return round((1 - ratio if inverse else ratio) * 100, 1)


def _sinal_score(sinal: str) -> float:
    return {"compra": 75.0, "neutro": 50.0, "venda": 25.0}.get(sinal, 50.0)


# ── Score de Compra (0–100) ───────────────────────────────────────────────────

def score_compra(
    rsi_val: Optional[float],
    macd_d: Optional[dict],
    ema_9: Optional[float],
    ema_21: Optional[float],
    ema_50: Optional[float],
    ema_200: Optional[float],
    boll: Optional[dict],
    preco: float,
    vol_relativo: Optional[float],
    tendencia_d: Optional[dict],
    atr_pct: Optional[float],
) -> float:
    scores = []

    # RSI: < 30 → excelente compra, 30-50 → bom, 50-70 → neutro, > 70 → ruim
    if rsi_val is not None:
        if rsi_val < 30:
            scores.append((90.0, 0.20))
        elif rsi_val < 50:
            scores.append((70.0, 0.20))
        elif rsi_val < 70:
            scores.append((45.0, 0.20))
        else:
            scores.append((15.0, 0.20))

    # MACD
    if macd_d:
        s = _sinal_score(macd_d.get("sinal", "neutro"))
        hist = macd_d.get("histograma", 0) or 0
        bonus = 10 if hist > 0 else -10
        scores.append((_clamp(s + bonus), 0.18))

    # Alinhamento EMA (preço acima de EMAs = bullish)
    above = sum(1 for e in [ema_9, ema_21, ema_50, ema_200] if e and preco > e)
    ema_score = above / 4 * 100
    scores.append((ema_score, 0.18))

    # Bollinger
    if boll:
        scores.append((_sinal_score(boll.get("sinal", "neutro")), 0.12))

    # Tendência
    if tendencia_d:
        mapa = {"muito_alta": 90, "alta": 70, "neutra": 50, "baixa": 30, "muito_baixa": 10}
        cp = mapa.get(tendencia_d.get("curto_prazo", "neutra"), 50)
        mp = mapa.get(tendencia_d.get("medio_prazo", "neutra"), 50)
        scores.append(((cp * 0.6 + mp * 0.4), 0.15))

    # Volume relativo: alto = mais confiança
    if vol_relativo is not None:
        scores.append((_norm(vol_relativo, 0.5, 2.0), 0.10))

    # Volatilidade: alta vol = menor score de compra (risco)
    if atr_pct is not None:
        scores.append((_norm(atr_pct, 0.5, 5.0, inverse=True), 0.07))

    if not scores:
        return 50.0

    total_w = sum(w for _, w in scores)
    total   = sum(s * w for s, w in scores)
    return round(_clamp(total / total_w), 1)


# ── Score Geral (0–100) ───────────────────────────────────────────────────────

def score_geral(
    compra_score: float,
    tokenomics_score: float,
    mkt_cap_rank: int,
    vol_relativo: Optional[float],
    vol_anualizada: Optional[float],
    sharpe: Optional[float],
    fng_valor: Optional[int],
    tendencia_d: Optional[dict],
) -> float:
    scores = []

    # Score de compra como base técnica
    scores.append((compra_score, 0.30))

    # Tokenomics
    scores.append((tokenomics_score, 0.15))

    # Market Cap rank (menor rank = maior cap = mais estabelecida)
    mc_score = _norm(mkt_cap_rank, 1, 100, inverse=True)
    scores.append((mc_score, 0.10))

    # Volume relativo
    if vol_relativo is not None:
        scores.append((_norm(vol_relativo, 0.3, 2.5), 0.10))

    # Volatilidade anualizada (menor = mais estável = melhor score geral)
    if vol_anualizada is not None:
        scores.append((_norm(vol_anualizada, 20, 150, inverse=True), 0.10))

    # Sharpe
    if sharpe is not None:
        scores.append((_norm(sharpe, -1, 3), 0.10))

    # Fear & Greed (extremo ganância = cuidado, extremo medo = oportunidade)
    if fng_valor is not None:
        # Neutro (40-60) é bom, extremos são ruins para o score
        dist_mid = abs(fng_valor - 50)
        fng_score = _norm(dist_mid, 0, 50, inverse=True)
        scores.append((fng_score, 0.08))

    # Tendência longo prazo
    if tendencia_d:
        mapa = {"muito_alta": 85, "alta": 70, "neutra": 50, "baixa": 30, "muito_baixa": 15}
        lp = mapa.get(tendencia_d.get("longo_prazo", "neutra"), 50)
        scores.append((lp, 0.07))

    if not scores:
        return 50.0

    total_w = sum(w for _, w in scores)
    total   = sum(s * w for s, w in scores)
    return round(_clamp(total / total_w), 1)


# ── Tokenomics Score ──────────────────────────────────────────────────────────

def tokenomics_score(rating: str, inflacao: Optional[float], queima: bool) -> float:
    base = {"Excelente": 90, "Boa": 72, "Regular": 50, "Ruim": 28}.get(rating, 50)
    if inflacao is not None:
        if inflacao < 0:
            base = min(100, base + 8)
        elif inflacao > 5:
            base = max(0, base - 10)
    if queima:
        base = min(100, base + 5)
    return float(base)


# ── Classificação ─────────────────────────────────────────────────────────────

def classificacao(score_compra: float, score_geral: float) -> str:
    combined = score_compra * 0.6 + score_geral * 0.4
    if combined >= 80: return "Compra Forte"
    if combined >= 65: return "Compra"
    if combined >= 50: return "Neutro"
    if combined >= 35: return "Realização Parcial"
    if combined >= 20: return "Venda"
    return "Venda Forte"


# ── Gestão de Risco ───────────────────────────────────────────────────────────

def gestao_risco(
    preco: float,
    atr_val: Optional[float],
    suportes: list[dict],
    resistencias: list[dict],
) -> dict:
    atr = atr_val or preco * 0.02
    stop = round(preco - 2 * atr, 2)

    alvos = []
    for r in resistencias[:3]:
        alvos.append(r["preco"])
    while len(alvos) < 3:
        last = alvos[-1] if alvos else preco
        alvos.append(round(last * 1.05, 2))

    faixa_compra_max = round(preco * 1.005, 2)
    faixa_compra_min = suportes[0]["preco"] if suportes else round(preco * 0.97, 2)
    faixa_real_min   = resistencias[0]["preco"] if resistencias else round(preco * 1.05, 2)
    faixa_real_max   = resistencias[1]["preco"] if len(resistencias) > 1 else round(preco * 1.10, 2)

    return {
        "stop_sugerido":     stop,
        "alvo_1":            alvos[0] if len(alvos) > 0 else None,
        "alvo_2":            alvos[1] if len(alvos) > 1 else None,
        "alvo_3":            alvos[2] if len(alvos) > 2 else None,
        "faixa_compra_min":  faixa_compra_min,
        "faixa_compra_max":  faixa_compra_max,
        "faixa_realizacao_min": faixa_real_min,
        "faixa_realizacao_max": faixa_real_max,
    }


# ── Risco Geral ───────────────────────────────────────────────────────────────

def score_risco(
    vol_anualizada: Optional[float],
    drawdown_max: Optional[float],
    mkt_cap_rank: int,
    atr_pct: Optional[float],
) -> float:
    scores = []
    if vol_anualizada is not None:
        scores.append((_norm(vol_anualizada, 20, 200), 0.35))
    if drawdown_max is not None:
        scores.append((_norm(abs(drawdown_max), 0, 100), 0.30))
    scores.append((_norm(mkt_cap_rank, 1, 50), 0.20))
    if atr_pct is not None:
        scores.append((_norm(atr_pct, 0.5, 10), 0.15))
    if not scores:
        return 50.0
    total_w = sum(w for _, w in scores)
    return round(_clamp(sum(s * w for s, w in scores) / total_w), 1)


# ── Conclusão da IA ───────────────────────────────────────────────────────────

def conclusao_ia(
    nome: str,
    preco: float,
    rsi_val: Optional[float],
    macd_d: Optional[dict],
    tendencia_d: Optional[dict],
    boll: Optional[dict],
    vol_30d: Optional[float],
    fng: Optional[dict],
    score_compra_v: float,
    score_geral_v: float,
    classif: str,
    suportes: list[dict],
    resistencias: list[dict],
    rent: dict,
) -> dict:
    positivos = []
    negativos = []
    riscos    = []
    oportunidades = []

    rent7 = rent.get("7d")
    rent30 = rent.get("30d")

    # RSI
    if rsi_val is not None:
        if rsi_val < 30:
            positivos.append(f"RSI em zona de sobrevenda ({rsi_val:.1f}) — potencial reversão de alta")
            oportunidades.append("RSI abaixo de 30 historicamente gera boas entradas de compra")
        elif rsi_val > 70:
            negativos.append(f"RSI em zona de sobrecompra ({rsi_val:.1f}) — atenção para possível correção")
            riscos.append("RSI elevado pode indicar realização de lucros a qualquer momento")
        else:
            positivos.append(f"RSI em zona neutra ({rsi_val:.1f}) — mercado equilibrado")

    # MACD
    if macd_d:
        hist = macd_d.get("histograma", 0) or 0
        if macd_d["sinal"] == "compra":
            positivos.append("MACD com histograma positivo — momentum comprador")
        else:
            negativos.append("MACD com histograma negativo — momentum vendedor")

    # Tendência
    if tendencia_d:
        mapa_txt = {"muito_alta": "muito forte de alta", "alta": "de alta", "neutra": "lateral", "baixa": "de baixa", "muito_baixa": "muito forte de baixa"}
        lp_txt = mapa_txt.get(tendencia_d.get("longo_prazo", "neutra"), "indefinida")
        positivos.append(f"Tendência de longo prazo {lp_txt} conforme médias móveis")

    # Bollinger
    if boll:
        if boll["sinal"] == "compra":
            oportunidades.append("Preço tocando a banda inferior de Bollinger — possível zona de suporte técnico")
        elif boll["sinal"] == "venda":
            riscos.append("Preço na banda superior de Bollinger — possível zona de resistência")

    # Fear & Greed
    if fng:
        v = fng.get("valor", 50)
        if v < 25:
            oportunidades.append(f"Fear & Greed em {v} (Medo Extremo) — historicamente boas entradas")
        elif v > 75:
            riscos.append(f"Fear & Greed em {v} (Ganância Extrema) — mercado eufórico, cautela")

    # Rentabilidade
    if rent7 is not None:
        if rent7 > 5:
            positivos.append(f"Valorização de +{rent7:.1f}% nos últimos 7 dias")
        elif rent7 < -10:
            negativos.append(f"Queda de {rent7:.1f}% nos últimos 7 dias — monitorar suportes")

    if rent30 is not None:
        if rent30 > 15:
            oportunidades.append(f"Alta de +{rent30:.1f}% no mês indica força compradora")
        elif rent30 < -20:
            riscos.append(f"Queda de {rent30:.1f}% nos últimos 30 dias — tendência de baixa persistente")

    # Volatilidade
    if vol_30d and vol_30d > 5:
        riscos.append(f"Volatilidade diária elevada de {vol_30d:.1f}% — adequado para perfil arrojado")

    # Suportes/Resistências
    if suportes:
        positivos.append(f"Suporte próximo em R$ {suportes[0]['preco']:,.2f} ({suportes[0]['distancia_pct']:.1f}%)")
    if resistencias:
        negativos.append(f"Resistência em R$ {resistencias[0]['preco']:,.2f} (+{resistencias[0]['distancia_pct']:.1f}%)")

    resumo_tecnico = (
        f"{nome} apresenta RSI de {rsi_val:.1f}" if rsi_val else f"{nome}"
    )
    resumo_tecnico += f", com tendência de {tendencia_d.get('longo_prazo','—') if tendencia_d else '—'} no longo prazo."

    resumo_fund = (
        f"Ativo ranqueado entre os top {20 if score_geral_v >= 60 else 50} do mercado. "
        f"Score geral de {score_geral_v:.0f}/100."
    )

    return {
        "resumo_tecnico":       resumo_tecnico,
        "resumo_fundamentalista": resumo_fund,
        "pontos_positivos":     positivos[:5],
        "pontos_negativos":     negativos[:4],
        "riscos":               riscos[:4],
        "oportunidades":        oportunidades[:4],
        "classificacao_final":  classif,
    }
