"""
Motor de Decisão Inteligente — endpoint REST.
GET /api/v1/cripto/motor/{simbolo}
"""
from __future__ import annotations

import asyncio
import time
from typing import Optional

import httpx
from fastapi import APIRouter, HTTPException

from ..cripto.coingecko_provider import (
    CG_IDS,
    get_coin_data,
    get_market_chart,
    get_ohlc,
    market_chart_para_candles,
    mesclar_candles,
    ohlc_para_candles_diarios,
)
from ..cripto.motor_decisao import calcular_motor_completo

router = APIRouter(tags=["cripto — motor"])

_CACHE: dict[str, tuple[float, dict]] = {}
_TTL = 60 * 60  # 1 hora


def _from_cache(key: str) -> Optional[dict]:
    entry = _CACHE.get(key)
    if entry:
        ts, data = entry
        if time.time() - ts < _TTL:
            return data
    return None


def _set_cache(key: str, data: dict) -> dict:
    _CACHE[key] = (time.time(), data)
    return data


async def _fetch_fear_greed() -> Optional[int]:
    try:
        async with httpx.AsyncClient(timeout=8.0) as cli:
            r = await cli.get("https://api.alternative.me/fng/?limit=1")
            r.raise_for_status()
            data = r.json()
            return int(data["data"][0]["value"])
    except Exception:
        return None


def _closes_volumes(candles: list[dict]) -> tuple[list[float], list[float]]:
    cl = [c["fechamento"] for c in candles if c.get("fechamento")]
    vo = [c.get("volume", 0.0) or 0.0 for c in candles]
    return cl, vo


def _highs_lows(candles: list[dict]) -> tuple[list[float], list[float]]:
    hi = [c.get("maxima") or c["fechamento"] for c in candles]
    lo = [c.get("minima") or c["fechamento"] for c in candles]
    return hi, lo


@router.get("/cripto/motor/{simbolo}")
async def motor_decisao(simbolo: str):
    simbolo = simbolo.upper()

    if simbolo not in CG_IDS and simbolo != "BTC":
        raise HTTPException(404, f"Símbolo {simbolo} não suportado no Motor de Decisão")

    cache_key = f"motor:{simbolo}"
    cached = _from_cache(cache_key)
    if cached:
        return cached

    # Busca paralela: alt + BTC + Fear&Greed
    tasks = [
        get_market_chart(simbolo, 365),
        get_ohlc(simbolo, 90),
        get_coin_data(simbolo),
        get_market_chart("BTC", 365),
        get_ohlc("BTC", 90),
        _fetch_fear_greed(),
    ]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    chart_alt, ohlc_alt, coin_alt, chart_btc, ohlc_btc, fear_greed = [
        r if not isinstance(r, Exception) else None for r in results
    ]

    # Processa candles alt
    chart_c = market_chart_para_candles(chart_alt) if chart_alt else []
    ohlc_c  = ohlc_para_candles_diarios(ohlc_alt) if ohlc_alt else []
    candles = mesclar_candles(chart_c, ohlc_c) if chart_c else ohlc_c

    if not candles:
        raise HTTPException(503, "Dados históricos indisponíveis para este símbolo")

    closes, volumes = _closes_volumes(candles)
    highs, lows     = _highs_lows(candles)

    # BTC closes para ICE
    btc_chart_c = market_chart_para_candles(chart_btc) if chart_btc else []
    btc_ohlc_c  = ohlc_para_candles_diarios(ohlc_btc) if ohlc_btc else []
    btc_candles = mesclar_candles(btc_chart_c, btc_ohlc_c) if btc_chart_c else btc_ohlc_c
    btc_closes  = [c["fechamento"] for c in btc_candles] if btc_candles else None

    # Market cap rank
    rank_mercado = None
    if coin_alt:
        rank_mercado = (coin_alt.get("market_cap_rank") or None)

    # Correlação 90d e Força Relativa vs BTC (simplificado)
    corr_90 = None
    fr_30   = None
    if btc_closes and len(closes) >= 90 and len(btc_closes) >= 90:
        try:
            from ..cripto.comparativo_engine import correlacao, forca_relativa
            corr_90 = correlacao(closes, btc_closes, 90)
            fr_30   = forca_relativa(closes, btc_closes, 30)
        except Exception:
            pass

    resultado = calcular_motor_completo(
        simbolo=simbolo,
        closes=closes,
        highs=highs,
        lows=lows,
        volumes=volumes,
        fear_greed=fear_greed,
        btc_closes=btc_closes,
        rank_mercado=rank_mercado,
        corr_90=corr_90,
        fr_30=fr_30,
    )

    # Adiciona metadados do coin
    if coin_alt:
        md = coin_alt.get("market_data", {})
        resultado["nome"] = coin_alt.get("name", simbolo)
        resultado["market_cap_rank"] = coin_alt.get("market_cap_rank")
        resultado["variacao_24h"] = (md.get("price_change_percentage_24h") or None)
        resultado["variacao_7d"] = (md.get("price_change_percentage_7d") or None)
    else:
        resultado["nome"] = simbolo
        resultado["market_cap_rank"] = None
        resultado["variacao_24h"] = None
        resultado["variacao_7d"] = None

    resultado["fear_greed"] = fear_greed
    resultado["fear_greed_label"] = _fg_label(fear_greed)

    return _set_cache(cache_key, resultado)


def _fg_label(v: Optional[int]) -> str:
    if v is None:
        return "—"
    if v <= 25:   return "Medo Extremo"
    if v <= 45:   return "Medo"
    if v <= 55:   return "Neutro"
    if v <= 75:   return "Ganância"
    return "Ganância Extrema"
