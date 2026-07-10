"""
Day Trade IA — endpoints REST.
GET /api/v1/cripto/daytrade/scan       → scan + ranking de todas as moedas
GET /api/v1/cripto/daytrade/{simbolo}  → análise profunda de uma moeda
"""
from __future__ import annotations
import asyncio
import time
from typing import Optional

import httpx
from fastapi import APIRouter, HTTPException

from ..cripto.daytrade_engine import calcular_daytrade

router = APIRouter(tags=["cripto — day trade"])

_CACHE: dict[str, tuple[float, dict]] = {}
_TTL_COIN = 5 * 60     # 5 min (day trade precisa de dados frescos)
_TTL_SCAN = 10 * 60    # 10 min para o scan completo
_TTL_USDRL = 30        # 30s para cotação USD/BRL (cotação da hora)

_USD_BRL_CACHE: Optional[tuple[float, float]] = None  # (timestamp, rate)

BINANCE_API = "https://api.binance.com/api/v3"

# Moedas suportadas (Binance USDT spot)
DT_COINS: dict[str, str] = {
    "BTC":   "BTCUSDT",
    "ETH":   "ETHUSDT",
    "SOL":   "SOLUSDT",
    "BNB":   "BNBUSDT",
    "XRP":   "XRPUSDT",
    "DOGE":  "DOGEUSDT",
    "ADA":   "ADAUSDT",
    "AVAX":  "AVAXUSDT",
    "LINK":  "LINKUSDT",
    "LTC":   "LTCUSDT",
    "DOT":   "DOTUSDT",
    "MATIC": "MATICUSDT",
    "BCH":   "BCHUSDT",
    "UNI":   "UNIUSDT",
    "AAVE":  "AAVEUSDT",
    "NEAR":  "NEARUSDT",
    "ARB":   "ARBUSDT",
    "OP":    "OPUSDT",
    "SUI":   "SUIUSDT",
}

# Timeframes → interval Binance
TF_INTERVALS: dict[str, str] = {
    "1d":  "1d",
    "4h":  "4h",
    "1h":  "1h",
    "30m": "30m",
    "15m": "15m",
    "5m":  "5m",
    "1m":  "1m",
}

TF_LIMITS: dict[str, int] = {
    "1d": 200, "4h": 200, "1h": 200,
    "30m": 200, "15m": 200, "5m": 200, "1m": 200,
}


# ── Cache ─────────────────────────────────────────────────────────────────────

def _from_cache(key: str, ttl: int) -> Optional[dict]:
    e = _CACHE.get(key)
    return e[1] if e and time.time() - e[0] < ttl else None


def _set_cache(key: str, data: dict) -> dict:
    _CACHE[key] = (time.time(), data)
    return data


# ── Binance Fetchers ──────────────────────────────────────────────────────────

def _parse_klines(raw: list) -> list[dict]:
    candles = []
    for k in raw:
        try:
            candles.append({
                "t":       int(k[0]),
                "o":       float(k[1]),
                "h":       float(k[2]),
                "l":       float(k[3]),
                "c":       float(k[4]),
                "v":       float(k[5]),
                "buy_vol": float(k[9]),   # Taker buy base asset volume
                "trades":  int(k[8]),
            })
        except (IndexError, ValueError, TypeError):
            continue
    return candles


async def _fetch_klines(cli: httpx.AsyncClient, symbol: str, interval: str, limit: int) -> list[dict]:
    try:
        r = await cli.get(
            f"{BINANCE_API}/klines",
            params={"symbol": symbol, "interval": interval, "limit": limit},
        )
        if r.status_code == 200:
            return _parse_klines(r.json())
    except Exception:
        pass
    return []


async def _fetch_ticker(cli: httpx.AsyncClient, symbol: str) -> dict:
    try:
        r = await cli.get(f"{BINANCE_API}/ticker/24hr", params={"symbol": symbol})
        if r.status_code == 200:
            d = r.json()
            return {
                "preco":    float(d.get("lastPrice", 0)),
                "var24h":   float(d.get("priceChangePercent", 0)),
                "volume24h": float(d.get("quoteVolume", 0)),
                "high24h":  float(d.get("highPrice", 0)),
                "low24h":   float(d.get("lowPrice", 0)),
                "trades24h": int(d.get("count", 0)),
            }
    except Exception:
        pass
    return {}


async def _fetch_fg() -> Optional[int]:
    try:
        async with httpx.AsyncClient(timeout=6.0) as cli:
            r = await cli.get("https://api.alternative.me/fng/?limit=1")
            r.raise_for_status()
            return int(r.json()["data"][0]["value"])
    except Exception:
        return None


async def _fetch_usd_brl() -> Optional[float]:
    """Cotação USDT/BRL em tempo real via Binance (mesmo feed dos preços cripto)."""
    global _USD_BRL_CACHE
    if _USD_BRL_CACHE and time.time() - _USD_BRL_CACHE[0] < _TTL_USDRL:
        return _USD_BRL_CACHE[1]
    try:
        async with httpx.AsyncClient(timeout=6.0) as cli:
            r = await cli.get(f"{BINANCE_API}/ticker/price", params={"symbol": "USDTBRL"})
            r.raise_for_status()
            rate = float(r.json()["price"])
            _USD_BRL_CACHE = (time.time(), rate)
            return rate
    except Exception:
        # Fallback: AwesomeAPI
        try:
            async with httpx.AsyncClient(timeout=6.0) as cli:
                r = await cli.get("https://economia.awesomeapi.com.br/json/last/USD-BRL")
                r.raise_for_status()
                rate = float(r.json()["USDBRL"]["bid"])
                _USD_BRL_CACHE = (time.time(), rate)
                return rate
        except Exception:
            return _USD_BRL_CACHE[1] if _USD_BRL_CACHE else None


# ── Análise completa de uma moeda ─────────────────────────────────────────────

async def _analisar_moeda(simbolo: str, bn_sym: str, fg: Optional[int], usd_brl: Optional[float] = None) -> dict:
    """Busca todos os TFs em paralelo e executa o engine."""
    async with httpx.AsyncClient(timeout=15.0) as cli:
        tf_tasks = {
            tf: _fetch_klines(cli, bn_sym, interval, TF_LIMITS[tf])
            for tf, interval in TF_INTERVALS.items()
        }
        tf_names = list(tf_tasks.keys())
        all_results = await asyncio.gather(
            *tf_tasks.values(),
            _fetch_ticker(cli, bn_sym),
            return_exceptions=True,
        )

    candles_por_tf: dict[str, list] = {}
    for i, tf in enumerate(tf_names):
        r = all_results[i]
        candles_por_tf[tf] = r if isinstance(r, list) else []

    ticker = all_results[-1] if not isinstance(all_results[-1], Exception) else {}

    resultado = calcular_daytrade(simbolo, candles_por_tf, fg=fg)

    # Enriquece com dados do ticker 24h
    if ticker:
        resultado["var24h"]    = ticker.get("var24h")
        resultado["volume24h"] = ticker.get("volume24h")
        resultado["high24h"]   = ticker.get("high24h")
        resultado["low24h"]    = ticker.get("low24h")
        resultado["trades24h"] = ticker.get("trades24h")
        if not resultado.get("preco_atual") and ticker.get("preco"):
            resultado["preco_atual"] = ticker["preco"]

    resultado["usd_brl"] = usd_brl
    return resultado


# ── Resumo para ranking ───────────────────────────────────────────────────────

def _resumo(r: dict) -> dict:
    tfs = r.get("timeframes", {})
    tf15 = tfs.get("15m", {}) if tfs.get("15m", {}).get("valido") else {}
    tf1h = tfs.get("1h",  {}) if tfs.get("1h",  {}).get("valido") else {}
    inds15 = tf15.get("indicadores", {})
    inds1h = tf1h.get("indicadores", {})

    return {
        "simbolo":    r.get("simbolo"),
        "preco":      r.get("preco_atual"),
        "score":      r.get("score", 50),
        "cor":        r.get("cor", "#f59e0b"),
        "decisao":    r.get("decisao", "AGUARDAR"),
        "estrelas":   r.get("estrelas", 1),
        "operar":     r.get("operar", False),
        "bullish":    r.get("bullish", False),
        "var24h":     r.get("var24h"),
        "volume24h":  r.get("volume24h"),
        "high24h":    r.get("high24h"),
        "low24h":     r.get("low24h"),
        "buy_pct":    (r.get("compradores") or {}).get("buy_pct", 50),
        "dominant":   (r.get("compradores") or {}).get("dominant", "neutro"),
        "rsi":        inds15.get("rsi") or inds1h.get("rsi"),
        "atr_pct":    inds15.get("atr_pct") or inds1h.get("atr_pct"),
        "rr1":        (r.get("niveis") or {}).get("rr1"),
        "stop_pct":   (r.get("niveis") or {}).get("stop_pct"),
        "tendencia":  (tf1h.get("tendencia") or tf15.get("tendencia") or {}).get("tipo"),
        "score_15m":  tf15.get("score", 50),
        "score_1h":   tf1h.get("score", 50),
        "padroes":    [p.get("nome", "") for p in tf15.get("padroes", [])[:2]],
        "bull_pct":   (r.get("consenso") or {}).get("bull_pct", 50),
        "usd_brl":    r.get("usd_brl"),
    }


# ── Endpoints ─────────────────────────────────────────────────────────────────

# IMPORTANTE: rota /scan ANTES de /{simbolo} para FastAPI não confundir
@router.get("/cripto/daytrade/scan")
async def get_scan():
    """Scan de todas as moedas suportadas — ranking de oportunidades."""
    cached = _from_cache("dt:scan", _TTL_SCAN)
    if cached:
        return cached

    fg, usd_brl = await asyncio.gather(_fetch_fg(), _fetch_usd_brl())
    resultados: list[dict] = []

    for simbolo, bn_sym in DT_COINS.items():
        cached_coin = _from_cache(f"dt:{simbolo}", _TTL_COIN)
        if cached_coin:
            resultados.append(_resumo(cached_coin))
            continue
        try:
            res = await _analisar_moeda(simbolo, bn_sym, fg, usd_brl)
            _set_cache(f"dt:{simbolo}", res)
            resultados.append(_resumo(res))
            await asyncio.sleep(0.08)
        except Exception:
            continue

    resultados.sort(key=lambda x: x["score"], reverse=True)

    top_compras  = sorted([r for r in resultados if r.get("bullish")  and r.get("operar")],  key=lambda x: x["score"], reverse=True)[:10]
    top_vendas   = sorted([r for r in resultados if not r.get("bullish") and r.get("operar")], key=lambda x: x["score"], reverse=True)[:10]
    top_rr       = sorted([r for r in resultados if r.get("rr1")], key=lambda x: x.get("rr1", 0), reverse=True)[:10]
    top_vol      = sorted([r for r in resultados if r.get("volume24h")], key=lambda x: x.get("volume24h", 0), reverse=True)[:10]
    top_momentum = sorted(resultados, key=lambda x: x.get("score_15m", 0), reverse=True)[:10]

    rankings = {
        "geral":        resultados,
        "top_compras":  top_compras,
        "top_vendas":   top_vendas,
        "top_prob":     resultados[:10],
        "top_rr":       top_rr,
        "top_volume":   top_vol,
        "top_momentum": top_momentum,
        "total":        len(resultados),
        "atualizado":   time.time(),
        "usd_brl":      usd_brl,
    }

    return _set_cache("dt:scan", rankings)


@router.get("/cripto/daytrade/{simbolo}")
async def get_daytrade(simbolo: str):
    """Análise Day Trade completa — todos os indicadores e timeframes."""
    simbolo = simbolo.upper()
    bn_sym = DT_COINS.get(simbolo)
    if not bn_sym:
        raise HTTPException(404, f"Símbolo '{simbolo}' não suportado. Moedas disponíveis: {', '.join(DT_COINS)}")

    cached = _from_cache(f"dt:{simbolo}", _TTL_COIN)
    if cached:
        return cached

    fg, usd_brl = await asyncio.gather(_fetch_fg(), _fetch_usd_brl())
    resultado = await _analisar_moeda(simbolo, bn_sym, fg, usd_brl)
    return _set_cache(f"dt:{simbolo}", resultado)
