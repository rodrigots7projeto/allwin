"""
Motor de cálculo de indicadores fundamentalistas — Python puro, sem IA.

Regras de sinalização (baseadas no histórico do próprio ativo):
  Verde    → atual >10 % melhor que a média histórica
  Amarelo  → dentro de ±10 % da média histórica
  Vermelho → atual >10 % pior que a média histórica
  Neutro   → histórico insuficiente (< 2 pontos)
"""
from typing import Optional

import numpy as np

from .models import DemonstrativoAnual, FundamentosData, IndicadorComSinal


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _div(a: Optional[float], b: Optional[float]) -> Optional[float]:
    if a is None or b is None or b == 0:
        return None
    return a / b


def _sinal(
    atual: Optional[float],
    historico: list[Optional[float]],
    maior_e_melhor: bool,
) -> str:
    """Gera sinal comparando o valor atual com a média dos valores anteriores."""
    if atual is None:
        return "neutro"
    # Usa apenas os valores anteriores ao mais recente para a média
    anteriores = [v for v in historico[:-1] if v is not None]
    if len(anteriores) < 2:
        return "neutro"
    media = float(np.mean(anteriores))
    if media == 0:
        return "neutro"
    diff = (atual - media) / abs(media)
    LIMIAR = 0.10
    if maior_e_melhor:
        if diff > LIMIAR:    return "verde"
        if diff < -LIMIAR:   return "vermelho"
        return "amarelo"
    else:
        if diff < -LIMIAR:   return "verde"   # menor é melhor
        if diff > LIMIAR:    return "vermelho"
        return "amarelo"


def _cagr(inicial: Optional[float], final: Optional[float], n: int) -> Optional[float]:
    """Taxa de crescimento anual composta."""
    if inicial is None or final is None or n <= 0 or inicial <= 0:
        return None
    try:
        return (final / inicial) ** (1 / n) - 1
    except (ValueError, ZeroDivisionError):
        return None


# ---------------------------------------------------------------------------
# Cálculo dos demonstrativos históricos
# ---------------------------------------------------------------------------

def calcular_demonstrativos(anos_raw: dict[int, dict]) -> list[DemonstrativoAnual]:
    """
    Recebe o dict bruto do CVM e retorna lista ordenada de DemonstrativoAnual
    com todos os campos calculados.
    """
    resultado: list[DemonstrativoAnual] = []
    pl_anterior: Optional[float] = None

    for ano in sorted(anos_raw):
        d = anos_raw[ano]

        rec   = d.get("receita_liquida")
        lb    = d.get("lucro_bruto")
        ebit  = d.get("ebit")
        ebitda = d.get("ebitda")
        ll    = d.get("lucro_liquido")
        pl    = d.get("patrimonio_liquido")
        caixa = d.get("caixa")
        ativo_circ  = d.get("ativo_circulante")
        pass_circ   = d.get("passivo_circulante")
        pass_nc     = d.get("passivo_nao_circulante")
        fco   = d.get("fco")
        fci   = d.get("fci")

        # ROE: usa PL médio (atual + ano anterior) se disponível
        pl_medio = (
            pl if pl_anterior is None
            else (((pl or 0) + pl_anterior) / 2) if pl is not None
            else None
        )
        roe = _div(ll, pl_medio)

        # Dívida Líquida estimada: Passivo NC − Caixa
        dl_est = (pass_nc - caixa) if (pass_nc is not None and caixa is not None) else None

        resultado.append(
            DemonstrativoAnual(
                ano=ano,
                receita_liquida=rec,
                lucro_bruto=lb,
                ebit=ebit,
                ebitda=ebitda,
                lucro_liquido=ll,
                ativo_total=d.get("ativo_total"),
                ativo_circulante=ativo_circ,
                caixa=caixa,
                passivo_circulante=pass_circ,
                passivo_nao_circulante=pass_nc,
                patrimonio_liquido=pl,
                fco=fco,
                fci=fci,
                fcl=d.get("fcl"),
                margem_bruta=_div(lb, rec),
                margem_ebit=_div(ebit, rec),
                margem_ebitda=_div(ebitda, rec),
                margem_liquida=_div(ll, rec),
                roe=roe,
                liquidez_corrente=_div(ativo_circ, pass_circ),
                divida_liquida_estimada=dl_est,
                dl_ebitda=_div(dl_est, ebitda),
            )
        )
        pl_anterior = pl

    return resultado


# ---------------------------------------------------------------------------
# Sinais
# ---------------------------------------------------------------------------

def calcular_sinais(hist: list[DemonstrativoAnual]) -> dict[str, IndicadorComSinal]:
    """Gera sinais para os principais indicadores versus a média histórica."""
    if len(hist) < 3:
        return {}

    def serie(attr: str) -> list[Optional[float]]:
        return [getattr(h, attr) for h in hist]

    configuracoes: dict[str, tuple[list, bool, str]] = {
        "margem_liquida":      (serie("margem_liquida"),      True,  "maior"),
        "margem_ebitda":       (serie("margem_ebitda"),       True,  "maior"),
        "margem_bruta":        (serie("margem_bruta"),        True,  "maior"),
        "roe":                 (serie("roe"),                 True,  "maior"),
        "liquidez_corrente":   (serie("liquidez_corrente"),   True,  "maior"),
        "dl_ebitda":           (serie("dl_ebitda"),           False, "menor"),
        "margem_ebit":         (serie("margem_ebit"),         True,  "maior"),
    }

    sinais: dict[str, IndicadorComSinal] = {}
    for nome, (vals, maior_melhor, label) in configuracoes.items():
        atual = vals[-1]
        anteriores = [v for v in vals[:-1] if v is not None]
        media = float(np.mean(anteriores)) if anteriores else None
        sinais[nome] = IndicadorComSinal(
            valor=atual,
            media_historica=media,
            sinal=_sinal(atual, vals, maior_melhor),
            melhor_quando=label,
        )

    return sinais


# ---------------------------------------------------------------------------
# CAGRs
# ---------------------------------------------------------------------------

def calcular_cagrs(hist: list[DemonstrativoAnual]) -> dict[str, Optional[float]]:
    """Calcula CAGR de receita, lucro e patrimônio líquido."""
    if len(hist) < 2:
        return {}
    n = len(hist) - 1
    return {
        "cagr_receita": _cagr(hist[0].receita_liquida, hist[-1].receita_liquida, n),
        "cagr_lucro":   _cagr(hist[0].lucro_liquido,   hist[-1].lucro_liquido,   n),
        "cagr_pl":      _cagr(hist[0].patrimonio_liquido, hist[-1].patrimonio_liquido, n),
    }


# ---------------------------------------------------------------------------
# Indicadores de mercado (vindos do brapi)
# ---------------------------------------------------------------------------

def extrair_indicadores_brapi(stats: dict, financial: dict) -> dict:
    """Extrai P/L, P/VP, EV/EBITDA, DY do payload do brapi."""
    def _f(d: dict, key: str) -> Optional[float]:
        v = d.get(key)
        return float(v) if v is not None else None

    return {
        "pl_atual":        _f(stats,    "priceEarnings"),      # brapi /quote
        "pvp_atual":       _f(stats,    "priceToBook"),
        "ev_ebitda_atual": _f(stats,    "enterpriseToEbitda"),
        "dy_atual":        _f(financial, "dividendYield"),
    }
