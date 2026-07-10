"""
Sinais IA — endpoints REST.
GET /api/v1/cripto/sinais/{simbolo}
GET /api/v1/cripto/sinais/ranking
"""
from __future__ import annotations
import asyncio
import time
from typing import Optional

import httpx
from fastapi import APIRouter, HTTPException

from ..cripto.coingecko_provider import (
    CG_IDS, get_coin_data, get_market_chart, get_ohlc,
    market_chart_para_candles, ohlc_para_candles_diarios, mesclar_candles,
)
from ..cripto.signal_engine import calcular_sinal_completo

router = APIRouter(tags=["cripto — sinais IA"])

_CACHE:     dict[str, tuple[float, dict]] = {}
_TTL        = 60 * 60        # 1 hora
_RANK_TTL   = 60 * 30        # 30 min para ranking


def _from_cache(key: str, ttl: int = _TTL) -> Optional[dict]:
    e = _CACHE.get(key)
    if e and time.time() - e[0] < ttl:
        return e[1]
    return None

def _set_cache(key: str, data: dict) -> dict:
    _CACHE[key] = (time.time(), data)
    return data


# Binance Futures API (público, sem autenticação)
BINANCE_F = "https://fapi.binance.com/fapi/v1"
BN_SYMS: dict[str, str] = {
    "BTC": "BTCUSDT", "ETH": "ETHUSDT", "SOL": "SOLUSDT",
    "BNB": "BNBUSDT", "XRP": "XRPUSDT", "DOGE": "DOGEUSDT",
    "ADA": "ADAUSDT", "AVAX": "AVAXUSDT", "LINK": "LINKUSDT",
    "LTC": "LTCUSDT", "DOT": "DOTUSDT", "MATIC": "MATICUSDT",
}


async def _fetch_binance_data(simbolo: str) -> dict:
    """Busca OI, Funding Rate e Long/Short Ratio da Binance Futures (gratuito)."""
    sym = BN_SYMS.get(simbolo)
    if not sym:
        return {}

    result: dict = {}
    try:
        async with httpx.AsyncClient(timeout=8.0) as cli:
            oi_r, fr_r, ls_r = await asyncio.gather(
                cli.get(f"{BINANCE_F}/openInterest", params={"symbol": sym}),
                cli.get(f"{BINANCE_F}/fundingRate",  params={"symbol": sym, "limit": 1}),
                cli.get(f"{BINANCE_F}/globalLongShortAccountRatio",
                        params={"symbol": sym, "period": "1h", "limit": 1}),
                return_exceptions=True,
            )
            if not isinstance(oi_r, Exception) and oi_r.status_code == 200:
                d = oi_r.json()
                result["open_interest"] = float(d.get("openInterest", 0))

            # OI change (comparar com cache anterior)
            prev = _from_cache(f"oi:{simbolo}", ttl=3700)
            if prev and result.get("open_interest"):
                prev_oi = prev.get("open_interest")
                if prev_oi and prev_oi > 0:
                    result["oi_change_pct"] = (result["open_interest"] - prev_oi) / prev_oi * 100

            if not isinstance(fr_r, Exception) and fr_r.status_code == 200:
                d = fr_r.json()
                if d:
                    result["funding_rate"] = float(d[0].get("fundingRate", 0))

            if not isinstance(ls_r, Exception) and ls_r.status_code == 200:
                d = ls_r.json()
                if d:
                    result["ls_ratio"] = float(d[0].get("longShortRatio", 1))
    except Exception:
        pass

    return result


async def _fetch_fg() -> Optional[int]:
    try:
        async with httpx.AsyncClient(timeout=6.0) as cli:
            r = await cli.get("https://api.alternative.me/fng/?limit=1")
            r.raise_for_status()
            return int(r.json()["data"][0]["value"])
    except Exception:
        return None


def _candles(chart, ohlc):
    chart_c = market_chart_para_candles(chart) if chart else []
    ohlc_c  = ohlc_para_candles_diarios(ohlc)  if ohlc  else []
    return mesclar_candles(chart_c, ohlc_c) if chart_c else ohlc_c


def _hlcv(candles):
    opens   = [c.get("abertura")  or c["fechamento"] for c in candles]
    highs   = [c.get("maxima")    or c["fechamento"] for c in candles]
    lows    = [c.get("minima")    or c["fechamento"] for c in candles]
    closes  = [c["fechamento"] for c in candles]
    volumes = [c.get("volume", 0) or 0 for c in candles]
    return opens, highs, lows, closes, volumes


@router.get("/cripto/sinais/{simbolo}")
async def get_sinais(simbolo: str):
    simbolo = simbolo.upper()
    if simbolo not in CG_IDS:
        raise HTTPException(404, f"Símbolo {simbolo} não suportado")

    cached = _from_cache(f"sinais:{simbolo}")
    if cached:
        return cached

    # Busca paralela
    chart_alt, ohlc_alt, coin_alt, chart_btc, ohlc_btc, fg, bn = await asyncio.gather(
        get_market_chart(simbolo, 365),
        get_ohlc(simbolo, 90),
        get_coin_data(simbolo),
        get_market_chart("BTC", 365),
        get_ohlc("BTC", 90),
        _fetch_fg(),
        _fetch_binance_data(simbolo),
        return_exceptions=True,
    )
    # Limpa exceções
    chart_alt, ohlc_alt, coin_alt, chart_btc, ohlc_btc = [
        None if isinstance(x, Exception) else x
        for x in [chart_alt, ohlc_alt, coin_alt, chart_btc, ohlc_btc]
    ]
    fg = None if isinstance(fg, Exception) else fg
    bn = {} if isinstance(bn, Exception) else bn

    candles_alt = _candles(chart_alt, ohlc_alt)
    if not candles_alt:
        raise HTTPException(503, "Dados históricos indisponíveis")

    opens, highs, lows, closes, volumes = _hlcv(candles_alt)

    candles_btc = _candles(chart_btc, ohlc_btc)
    btc_closes  = [c["fechamento"] for c in candles_btc] if candles_btc else None

    rank = coin_alt.get("market_cap_rank") if coin_alt else None
    md   = (coin_alt or {}).get("market_data", {})
    var24 = md.get("price_change_percentage_24h")
    var7  = md.get("price_change_percentage_7d")

    sinal = calcular_sinal_completo(
        simbolo    = simbolo,
        opens      = opens,
        highs      = highs,
        lows       = lows,
        closes     = closes,
        volumes    = volumes,
        fear_greed = fg,
        btc_closes = btc_closes,
        rank_mercado = rank,
        oi_change  = bn.get("oi_change_pct"),
        funding    = bn.get("funding_rate"),
        ls_ratio   = bn.get("ls_ratio"),
    )

    # Enriquece resposta
    sinal["nome"]          = (coin_alt or {}).get("name", simbolo)
    sinal["variacao_24h"]  = var24
    sinal["variacao_7d"]   = var7
    sinal["rank_mercado"]  = rank
    sinal["fear_greed"]    = fg
    sinal["fear_greed_label"] = _fg_label(fg)
    sinal["binance"]       = {
        "open_interest": bn.get("open_interest"),
        "oi_change_pct": bn.get("oi_change_pct"),
        "funding_rate":  bn.get("funding_rate"),
        "ls_ratio":      bn.get("ls_ratio"),
    }

    return _set_cache(f"sinais:{simbolo}", sinal)


@router.get("/cripto/sinais/ranking")
async def get_ranking():
    cached = _from_cache("ranking:sinais", ttl=_RANK_TTL)
    if cached:
        return cached

    moedas = list(CG_IDS.keys())
    resultados = []

    for sim in moedas:
        try:
            # Usa cache individual se existir
            c = _from_cache(f"sinais:{sim}")
            if not c:
                chart, ohlc, coin, fg = await asyncio.gather(
                    get_market_chart(sim, 365),
                    get_ohlc(sim, 90),
                    get_coin_data(sim),
                    _fetch_fg(),
                    return_exceptions=True,
                )
                chart = None if isinstance(chart, Exception) else chart
                ohlc  = None if isinstance(ohlc,  Exception) else ohlc
                coin  = None if isinstance(coin,  Exception) else coin
                fg    = None if isinstance(fg,    Exception) else fg

                cands = _candles(chart, ohlc)
                if not cands or len(cands) < 30:
                    await asyncio.sleep(0.3)
                    continue

                opens, highs, lows, closes, volumes = _hlcv(cands)
                rank = (coin or {}).get("market_cap_rank")

                c = calcular_sinal_completo(
                    simbolo=sim, opens=opens, highs=highs, lows=lows,
                    closes=closes, volumes=volumes, fear_greed=fg,
                    btc_closes=None, rank_mercado=rank,
                )
                c["nome"] = (coin or {}).get("name", sim)
                md = (coin or {}).get("market_data", {})
                c["variacao_24h"] = md.get("price_change_percentage_24h")
                _set_cache(f"sinais:{sim}", c)

            resultados.append({
                "simbolo":     c["simbolo"],
                "nome":        c.get("nome", c["simbolo"]),
                "preco_atual": c["preco_atual"],
                "score":       c["score"],
                "decisao":     c["decisao"],
                "cor":         c["cor"],
                "bullish":     c["bullish"],
                "variacao_24h":c.get("variacao_24h"),
                "tendencia":   c["categorias"]["tendencia"]["score"],
                "momentum":    c["categorias"]["momentum"]["score"],
                "volume":      c["categorias"]["volume"]["score"],
                "price_action":c["categorias"]["price_action"]["score"],
                "padroes":     [p["nome"] for p in c["padroes"]["candles"][:2]],
                "tipo_entrada":c["niveis"]["tipo_entrada"],
                "rr":          c["niveis"]["rr_1"],
            })
            await asyncio.sleep(0.2)
        except Exception:
            continue

    resultados.sort(key=lambda x: x["score"], reverse=True)

    rankings = {
        "geral":         resultados,
        "top_compras":   [r for r in resultados if r["bullish"]][:5],
        "top_vendas":    [r for r in resultados if not r["bullish"]][:5],
        "top_momento":   sorted(resultados, key=lambda x: x["momentum"], reverse=True)[:5],
        "top_tendencia": sorted(resultados, key=lambda x: x["tendencia"], reverse=True)[:5],
        "top_volume":    sorted(resultados, key=lambda x: x["volume"],    reverse=True)[:5],
    }

    return _set_cache("ranking:sinais", rankings)


def _fg_label(v: Optional[int]) -> str:
    if v is None: return "—"
    if v <= 25:   return "Medo Extremo"
    if v <= 45:   return "Medo"
    if v <= 55:   return "Neutro"
    if v <= 75:   return "Ganância"
    return "Ganância Extrema"
