"""
Motor de comparação BTC × Altcoin.
Todas as métricas são calculadas em Python puro (sem numpy/pandas).
"""
from __future__ import annotations
import math
from typing import Optional

from . import indicators as ind


# ── Retornos ──────────────────────────────────────────────────────────────────

def _returns(closes: list[float]) -> list[float]:
    return [(closes[i] - closes[i-1]) / closes[i-1] for i in range(1, len(closes)) if closes[i-1] > 0]


# ── Correlação de Pearson ─────────────────────────────────────────────────────

def correlacao(closes_a: list[float], closes_b: list[float], periodo: int) -> Optional[float]:
    ra = _returns(closes_a)
    rb = _returns(closes_b)
    n  = min(len(ra), len(rb), periodo)
    if n < 5:
        return None
    ra, rb = ra[-n:], rb[-n:]
    ma = sum(ra) / n
    mb = sum(rb) / n
    num  = sum((ra[i] - ma) * (rb[i] - mb) for i in range(n))
    da   = math.sqrt(sum((x - ma)**2 for x in ra))
    db   = math.sqrt(sum((x - mb)**2 for x in rb))
    return round(num / (da * db), 4) if da and db else None


# ── Beta ─────────────────────────────────────────────────────────────────────

def beta(closes_a: list[float], closes_b: list[float], periodo: int = 90) -> Optional[float]:
    """Beta da altcoin (a) relativo ao BTC (b). Beta = Cov(ra,rb) / Var(rb)."""
    ra = _returns(closes_a)
    rb = _returns(closes_b)
    n  = min(len(ra), len(rb), periodo)
    if n < 5:
        return None
    ra, rb = ra[-n:], rb[-n:]
    ma = sum(ra) / n
    mb = sum(rb) / n
    cov   = sum((ra[i] - ma) * (rb[i] - mb) for i in range(n)) / n
    var_b = sum((x - mb)**2 for x in rb) / n
    return round(cov / var_b, 3) if var_b else None


# ── Força Relativa ────────────────────────────────────────────────────────────

def forca_relativa(closes_a: list[float], closes_b: list[float], periodo: int) -> Optional[float]:
    """FR = retorno_alt / retorno_btc. FR>1 = outperformance."""
    if len(closes_a) < periodo + 1 or len(closes_b) < periodo + 1:
        return None
    ret_a = (closes_a[-1] - closes_a[-periodo-1]) / closes_a[-periodo-1]
    ret_b = (closes_b[-1] - closes_b[-periodo-1]) / closes_b[-periodo-1]
    if abs(ret_b) < 1e-10:
        return None
    return round(ret_a / ret_b, 3)


def retorno_periodo(closes: list[float], periodo: int) -> Optional[float]:
    if len(closes) < periodo + 1:
        return None
    b = closes[-periodo-1]
    return round((closes[-1] - b) / b * 100, 2) if b else None


# ── Probabilidade de acompanhar o BTC ────────────────────────────────────────

def prob_acompanhar(closes_a: list[float], closes_b: list[float], periodo: int = 90) -> dict:
    """
    Probabilidade histórica de a altcoin (a) mover na mesma direção do BTC (b).
    Retorna prob_alta e prob_queda separadamente.
    """
    ra = _returns(closes_a)
    rb = _returns(closes_b)
    n  = min(len(ra), len(rb), periodo)
    if n < 5:
        return {"prob_alta": None, "prob_queda": None, "intensidade_alta": None, "intensidade_queda": None, "n": 0}
    ra, rb = ra[-n:], rb[-n:]

    btc_up   = [(ra[i], rb[i]) for i in range(n) if rb[i] > 0]
    btc_down = [(ra[i], rb[i]) for i in range(n) if rb[i] < 0]

    prob_alta  = sum(1 for a, _ in btc_up   if a > 0) / len(btc_up)   if btc_up   else None
    prob_queda = sum(1 for a, _ in btc_down if a < 0) / len(btc_down) if btc_down else None

    # Intensidade = razão média de retornos quando movem juntos
    int_alta  = None
    int_queda = None
    if btc_up:
        ratios = [a / b for a, b in btc_up if b != 0]
        int_alta = round(sum(ratios) / len(ratios), 2) if ratios else None
    if btc_down:
        ratios = [a / b for a, b in btc_down if b != 0]
        int_queda = round(sum(ratios) / len(ratios), 2) if ratios else None

    return {
        "prob_alta":       round(prob_alta  * 100, 1) if prob_alta  is not None else None,
        "prob_queda":      round(prob_queda * 100, 1) if prob_queda is not None else None,
        "intensidade_alta":  int_alta,
        "intensidade_queda": int_queda,
        "n": n,
    }


# ── Índice de Sincronia ───────────────────────────────────────────────────────

def indice_sincronia(
    corr_30: Optional[float],
    corr_90: Optional[float],
    corr_365: Optional[float],
    beta_val: Optional[float],
    prob_alta: Optional[float],
    prob_queda: Optional[float],
) -> float:
    """Índice de Sincronia com o BTC (0-100)."""
    s = 0.0
    # Correlações (peso maior para prazos mais longos)
    if corr_365 is not None:
        s += max(corr_365, 0) * 30
    if corr_90 is not None:
        s += max(corr_90, 0) * 20
    if corr_30 is not None:
        s += max(corr_30, 0) * 15
    # Probabilidade de acompanhar
    if prob_alta is not None:
        s += (prob_alta - 50) * 0.25
    if prob_queda is not None:
        s += (prob_queda - 50) * 0.25
    # Beta: quanto mais próximo de 1, mais sincronizado sem ser errático
    if beta_val is not None:
        beta_bonus = max(0, 15 - abs(beta_val - 1.0) * 5)
        s += beta_bonus
    return round(min(100, max(0, s)), 1)


# ── Score Comparativo ─────────────────────────────────────────────────────────

def score_comparativo(
    btc_tend: dict,
    corr_30: Optional[float],
    corr_90: Optional[float],
    fr_7: Optional[float],
    fr_30: Optional[float],
    beta_val: Optional[float],
    vol_rel: Optional[float],
    rsi_alt: Optional[float],
    rank: int,
    vol_anualizada: Optional[float],
) -> float:
    """Score comparativo altcoin vs BTC (0-100)."""
    s = 0.0

    # 20% — Tendência do BTC
    tp_map = {"muito_alta": 100, "alta": 75, "neutra": 50, "baixa": 25, "muito_baixa": 0}
    tp_score = tp_map.get(btc_tend.get("longo_prazo", "neutra"), 50)
    s += tp_score * 0.20

    # 20% — Correlação (média 30 + 90)
    corr = ((corr_30 or 0) * 0.4 + (corr_90 or 0) * 0.6)
    s += max(0, corr) * 100 * 0.20

    # 15% — Força Relativa (FR > 1 = outperformance)
    fr = fr_7 if fr_7 is not None else fr_30
    if fr is not None:
        fr_score = min(100, max(0, 50 + (fr - 1.0) * 20))
    else:
        fr_score = 50
    s += fr_score * 0.15

    # 10% — Beta (ideal 1-2 para capturar altas com leverage moderada)
    if beta_val is not None:
        b_score = max(0, 100 - abs(beta_val - 1.5) * 25)
    else:
        b_score = 50
    s += b_score * 0.10

    # 10% — Volume relativo
    if vol_rel is not None:
        v_score = min(100, max(0, vol_rel * 50))
    else:
        v_score = 50
    s += v_score * 0.10

    # 10% — Momentum RSI
    if rsi_alt is not None:
        if 40 <= rsi_alt <= 65:
            rsi_score = 80
        elif rsi_alt < 40:
            rsi_score = 65
        else:
            rsi_score = max(0, 100 - (rsi_alt - 65) * 2)
    else:
        rsi_score = 50
    s += rsi_score * 0.10

    # 10% — Market Cap rank
    mktcap_score = max(0, 100 - (rank - 1) * 5)
    s += mktcap_score * 0.10

    # 5% — Volatilidade (menor = mais estável, melhor)
    if vol_anualizada is not None:
        vol_score = max(0, 100 - vol_anualizada * 0.5)
    else:
        vol_score = 50
    s += vol_score * 0.05

    return round(min(100, max(0, s)), 1)


# ── Interpretações ────────────────────────────────────────────────────────────

def interpretar_correlacao(c: Optional[float]) -> str:
    if c is None:    return "Sem dados"
    if c >= 0.85:    return "Forte Positiva"
    if c >= 0.6:     return "Moderada Positiva"
    if c >= 0.3:     return "Fraca Positiva"
    if c >= -0.3:    return "Neutra / Independente"
    if c >= -0.6:    return "Fraca Negativa"
    return                   "Forte Negativa"


def interpretar_beta(b: Optional[float]) -> str:
    if b is None:   return "Sem dados"
    if b < -0.5:    return "Movimento inverso ao BTC"
    if b < 0:       return "Levemente inverso"
    if b < 0.5:     return "Muito menos volátil que o BTC"
    if b < 0.9:     return "Menos volátil que o BTC"
    if b < 1.1:     return "Movimento similar ao BTC"
    if b < 2.0:     return "Mais volátil que o BTC"
    if b < 3.0:     return "Muito mais volátil"
    return                  "Extremamente volátil"


def interpretar_forca_relativa(fr: Optional[float], periodo: int = 30) -> str:
    if fr is None:  return "Sem dados"
    if fr >= 3.0:   return f"Performance {fr:.1f}× superior ao BTC em {periodo}d"
    if fr >= 2.0:   return f"Supera o BTC por {fr:.1f}× em {periodo}d"
    if fr >= 1.1:   return f"Levemente superior ao BTC em {periodo}d"
    if fr >= 0.9:   return f"Em linha com o BTC em {periodo}d"
    if fr >= 0:     return f"Abaixo do BTC em {periodo}d ({fr:.2f}×)"
    return                  f"Divergência: BTC e altcoin em direções opostas"


def intensidade_label(intens: Optional[float]) -> str:
    if intens is None: return "—"
    if intens >= 3.0:  return f"Sobe {intens:.1f}× mais que o BTC"
    if intens >= 1.5:  return f"Sobe mais que o BTC ({intens:.1f}×)"
    if intens >= 0.8:  return "Sobe similar ao BTC"
    if intens >= 0.4:  return "Sobe menos que o BTC"
    if intens > 0:     return "Sobe muito menos que o BTC"
    if intens <= -1.5: return "Cai mais que o BTC"
    if intens < 0:     return "Cai enquanto BTC sobe"
    return "—"


def interpretar_queda(intens: Optional[float]) -> str:
    if intens is None: return "—"
    if intens >= 1.5:  return "Cai mais que o BTC"
    if intens >= 0.8:  return "Cai similar ao BTC"
    if intens >= 0.4:  return "Cai menos que o BTC (mais resiliente)"
    if intens > 0:     return "Cai muito menos que o BTC"
    if intens < 0:     return "Sobe enquanto BTC cai"
    return "—"


# ── Explicação IA ─────────────────────────────────────────────────────────────

def explicacao_ia(
    nome: str,
    corr_30: Optional[float],
    corr_90: Optional[float],
    beta_val: Optional[float],
    fr_30: Optional[float],
    prob_a: Optional[float],
    prob_q: Optional[float],
    tend_btc: dict,
    tend_alt: dict,
    score: float,
    indice_sinc: float,
) -> str:
    partes = []

    # Tendência BTC
    lp_btc = tend_btc.get("longo_prazo", "neutra")
    lp_labels = {"muito_alta": "muito forte de alta", "alta": "de alta", "neutra": "neutra", "baixa": "de baixa", "muito_baixa": "muito forte de baixa"}
    partes.append(f"O Bitcoin apresenta tendência de longo prazo {lp_labels.get(lp_btc, lp_btc)}.")

    # Correlação
    if corr_90 is not None:
        partes.append(f"A {nome} possui correlação de {corr_90:.2f} com o BTC nos últimos 90 dias ({interpretar_correlacao(corr_90).lower()}).")

    # Beta
    if beta_val is not None:
        partes.append(f"Beta de {beta_val:.2f} — {interpretar_beta(beta_val).lower()}.")

    # Força relativa
    if fr_30 is not None:
        partes.append(interpretar_forca_relativa(fr_30, 30) + ".")

    # Probabilidades
    if prob_a is not None:
        partes.append(f"Quando o BTC sobe, a {nome} acompanha {prob_a:.0f}% das vezes.")
    if prob_q is not None:
        partes.append(f"Quando o BTC cai, a {nome} cai junto em {prob_q:.0f}% das vezes.")

    # Tendência da altcoin
    lp_alt = tend_alt.get("longo_prazo", "neutra")
    partes.append(f"A própria tendência de longo prazo da {nome} é {lp_labels.get(lp_alt, lp_alt)}.")

    # Conclusão
    if score >= 75:
        partes.append(f"Score comparativo {score:.0f}/100 e índice de sincronia {indice_sinc:.0f}/100 — forte sinergia com o BTC; boa oportunidade quando o mercado estiver em alta.")
    elif score >= 55:
        partes.append(f"Score comparativo {score:.0f}/100 — correlação moderada; acompanha o BTC com alguma independência.")
    else:
        partes.append(f"Score comparativo {score:.0f}/100 — baixa sincronia; comportamento mais independente do BTC.")

    return " ".join(partes)


# ── Ranking simplificado ──────────────────────────────────────────────────────

def _fr_label(fr: Optional[float]) -> str:
    if fr is None: return "—"
    return f"{fr:+.2f}×"

def _corr_cor(c: Optional[float]) -> str:
    if c is None or c < 0.3: return "#ef4444"
    if c < 0.6: return "#f59e0b"
    return "#10b981"

def _score_cor(s: float) -> str:
    if s >= 75: return "#10b981"
    if s >= 55: return "#f59e0b"
    return "#ef4444"
