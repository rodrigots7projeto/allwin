"""
Futures IA — endpoints REST para contratos futuros perpétuos.
GET /api/v1/cripto/futures/scan       → scan + ranking de todas as moedas
GET /api/v1/cripto/futures/{simbolo}  → análise profunda de uma moeda
"""
from __future__ import annotations
import asyncio
import json
import time
from typing import Optional

import httpx
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from ..cripto.futures_engine import calcular_futures

router = APIRouter(tags=["cripto — futures"])

_CACHE: dict[str, tuple[float, dict]] = {}
_TTL_COIN = 3 * 60     # 3 min (futures muda rápido)
_TTL_SCAN = 10 * 60    # 10 min para o scan completo (50 moedas)
_TTL_USDRL = 30        # 30s para cotação USD/BRL

_USD_BRL_CACHE: Optional[tuple[float, float]] = None   # (timestamp, rate)
_BTC_DOM_CACHE: Optional[tuple[float, float, str]] = None  # (timestamp, pct, trend)

BINANCE_SPOT_API    = "https://api.binance.com/api/v3"
BINANCE_FUTURES_API = "https://fapi.binance.com"

# Moedas suportadas (USDT perp futures — top 50 por liquidez)
FT_COINS: dict[str, str] = {
    "BTC":   "BTCUSDT",
    "ETH":   "ETHUSDT",
    "SOL":   "SOLUSDT",
    "BNB":   "BNBUSDT",
    "XRP":   "XRPUSDT",
    "DOGE":  "DOGEUSDT",
    "ADA":   "ADAUSDT",
    "TRX":   "TRXUSDT",
    "AVAX":  "AVAXUSDT",
    "TON":   "TONUSDT",
    "SHIB":  "SHIBUSDT",
    "LINK":  "LINKUSDT",
    "DOT":   "DOTUSDT",
    "LTC":   "LTCUSDT",
    "ATOM":  "ATOMUSDT",
    "NEAR":  "NEARUSDT",
    "MATIC": "MATICUSDT",
    "PEPE":  "PEPEUSDT",
    "BCH":   "BCHUSDT",
    "APT":   "APTUSDT",
    "UNI":   "UNIUSDT",
    "INJ":   "INJUSDT",
    "AAVE":  "AAVEUSDT",
    "ARB":   "ARBUSDT",
    "OP":    "OPUSDT",
    "SUI":   "SUIUSDT",
    "STX":   "STXUSDT",
    "IMX":   "IMXUSDT",
    "FTM":   "FTMUSDT",
    "GRT":   "GRTUSDT",
    "LDO":   "LDOUSDT",
    "FIL":   "FILUSDT",
    "MKR":   "MKRUSDT",
    "SAND":  "SANDUSDT",
    "MANA":  "MANAUSDT",
    "CRV":   "CRVUSDT",
    "BLUR":  "BLURUSDT",
    "WLD":   "WLDUSDT",
    "SEI":   "SEIUSDT",
    "TIA":   "TIAUSDT",
    "WIF":   "WIFUSDT",
    "JUP":   "JUPUSDT",
    "BONK":  "BONKUSDT",
    "FLOKI": "FLOKIUSDT",
    "NOT":   "NOTUSDT",
    "PYTH":  "PYTHUSDT",
    "APE":   "APEUSDT",
    "GMX":   "GMXUSDT",
    "DYDX":  "DYDXUSDT",
    "GMT":   "GMTUSDT",
}

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


# ── Binance Spot ──────────────────────────────────────────────────────────────

async def _fetch_usd_brl() -> Optional[float]:
    """Cotação USDT/BRL via Binance Spot; fallback AwesomeAPI."""
    global _USD_BRL_CACHE
    if _USD_BRL_CACHE and time.time() - _USD_BRL_CACHE[0] < _TTL_USDRL:
        return _USD_BRL_CACHE[1]
    try:
        async with httpx.AsyncClient(timeout=6.0) as cli:
            r = await cli.get(f"{BINANCE_SPOT_API}/ticker/price", params={"symbol": "USDTBRL"})
            r.raise_for_status()
            rate = float(r.json()["price"])
            _USD_BRL_CACHE = (time.time(), rate)
            return rate
    except Exception:
        try:
            async with httpx.AsyncClient(timeout=6.0) as cli:
                r = await cli.get("https://economia.awesomeapi.com.br/json/last/USD-BRL")
                r.raise_for_status()
                rate = float(r.json()["USDBRL"]["bid"])
                _USD_BRL_CACHE = (time.time(), rate)
                return rate
        except Exception:
            return _USD_BRL_CACHE[1] if _USD_BRL_CACHE else None


async def _fetch_fg() -> Optional[int]:
    try:
        async with httpx.AsyncClient(timeout=6.0) as cli:
            r = await cli.get("https://api.alternative.me/fng/?limit=1")
            r.raise_for_status()
            return int(r.json()["data"][0]["value"])
    except Exception:
        return None


# ── Binance Futures Klines ────────────────────────────────────────────────────

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


async def _fetch_futures_klines(
    cli: httpx.AsyncClient,
    symbol: str,
    interval: str,
    limit: int,
) -> list[dict]:
    # 1. Tenta Binance Futures
    try:
        r = await cli.get(
            f"{BINANCE_FUTURES_API}/fapi/v1/klines",
            params={"symbol": symbol, "interval": interval, "limit": limit},
        )
        if r.status_code == 200:
            parsed = _parse_klines(r.json())
            if parsed:
                return parsed
    except Exception:
        pass
    # 2. Fallback: Binance Spot (mesmos dados OHLCV para análise técnica)
    try:
        r = await cli.get(
            f"{BINANCE_SPOT_API}/klines",
            params={"symbol": symbol, "interval": interval, "limit": limit},
        )
        if r.status_code == 200:
            return _parse_klines(r.json())
    except Exception:
        pass
    return []


# ── Binance Futures Ticker ────────────────────────────────────────────────────

async def _fetch_futures_ticker(cli: httpx.AsyncClient, symbol: str) -> dict:
    try:
        r = await cli.get(
            f"{BINANCE_FUTURES_API}/fapi/v1/ticker/24hr",
            params={"symbol": symbol},
        )
        if r.status_code == 200:
            d = r.json()
            return {
                "preco":     float(d.get("lastPrice", 0)),
                "var24h":    float(d.get("priceChangePercent", 0)),
                "volume24h": float(d.get("quoteVolume", 0)),
                "high24h":   float(d.get("highPrice", 0)),
                "low24h":    float(d.get("lowPrice", 0)),
                "trades24h": int(d.get("count", 0)),
            }
    except Exception:
        pass
    return {}


# ── Open Interest ─────────────────────────────────────────────────────────────

async def _fetch_open_interest(cli: httpx.AsyncClient, symbol: str) -> float:
    """Retorna OI em USDT (aproximado: openInterest em contratos × markPrice)."""
    try:
        r = await cli.get(
            f"{BINANCE_FUTURES_API}/fapi/v1/openInterest",
            params={"symbol": symbol},
        )
        if r.status_code == 200:
            d = r.json()
            oi_contracts = float(d.get("openInterest", 0))
            # openInterest é em contratos (BTC base asset) — tenta calcular USD
            # Se não há markPrice aqui, usa o valor bruto
            return oi_contracts
    except Exception:
        pass
    return 0.0


async def _fetch_oi_history(
    cli: httpx.AsyncClient,
    symbol: str,
    period: str = "5m",
    limit: int = 5,
) -> list[dict]:
    """Histórico de Open Interest para calcular variação."""
    try:
        r = await cli.get(
            f"{BINANCE_FUTURES_API}/futures/data/openInterestHist",
            params={"symbol": symbol, "period": period, "limit": limit},
        )
        if r.status_code == 200:
            data = r.json()
            return [
                {
                    "sumOpenInterest": float(item.get("sumOpenInterest", 0)),
                    "timestamp": int(item.get("timestamp", 0)),
                }
                for item in data
            ]
    except Exception:
        pass
    return []


# ── Funding Rate ──────────────────────────────────────────────────────────────

async def _fetch_funding_rate(cli: httpx.AsyncClient, symbol: str) -> float:
    """Último funding rate (tipicamente entre -0.001 e 0.001)."""
    try:
        r = await cli.get(
            f"{BINANCE_FUTURES_API}/fapi/v1/fundingRate",
            params={"symbol": symbol, "limit": 1},
        )
        if r.status_code == 200:
            data = r.json()
            if data:
                return float(data[0].get("fundingRate", 0.0))
    except Exception:
        pass
    return 0.0


# ── Long/Short Ratio ──────────────────────────────────────────────────────────

async def _fetch_ls_ratio(
    cli: httpx.AsyncClient,
    symbol: str,
    period: str = "5m",
) -> tuple[float, float]:
    """Retorna (long_pct, short_pct) como percentual."""
    try:
        r = await cli.get(
            f"{BINANCE_FUTURES_API}/futures/data/globalLongShortAccountRatio",
            params={"symbol": symbol, "period": period, "limit": 1},
        )
        if r.status_code == 200:
            data = r.json()
            if data:
                item = data[0]
                long_account = float(item.get("longAccount", 0.5))
                short_account = float(item.get("shortAccount", 0.5))
                total = long_account + short_account
                if total > 0:
                    long_pct = long_account / total * 100
                    short_pct = short_account / total * 100
                else:
                    long_pct, short_pct = 50.0, 50.0
                return round(long_pct, 1), round(short_pct, 1)
    except Exception:
        pass
    return 50.0, 50.0


# ── Taker Buy/Sell Ratio ──────────────────────────────────────────────────────

async def _fetch_taker_ratio(
    cli: httpx.AsyncClient,
    symbol: str,
    period: str = "5m",
) -> float:
    """Retorna taker_buy_pct como percentual (0-100)."""
    try:
        r = await cli.get(
            f"{BINANCE_FUTURES_API}/futures/data/takerlongshortRatio",
            params={"symbol": symbol, "period": period, "limit": 1},
        )
        if r.status_code == 200:
            data = r.json()
            if data:
                buy_sell_ratio = float(data[0].get("buySellRatio", 1.0))
                # buySellRatio = buy_vol / sell_vol — converter para %
                taker_buy_pct = buy_sell_ratio / (1 + buy_sell_ratio) * 100
                return round(taker_buy_pct, 1)
    except Exception:
        pass
    return 50.0


# ── CVD e VWAP ───────────────────────────────────────────────────────────────

def _compute_cvd(klines: list[dict], lookback: int = 20) -> bool:
    """
    Cumulative Volume Delta dos últimos N candles.
    buy_vol = taker buy; sell_vol = total_vol - buy_vol.
    Retorna True se CVD positivo (bullish).
    """
    if not klines:
        return False
    recent = klines[-lookback:] if len(klines) >= lookback else klines
    cvd = 0.0
    for c in recent:
        buy_vol = c.get("buy_vol", 0.0)
        total_vol = c.get("v", 0.0)
        sell_vol = total_vol - buy_vol
        cvd += buy_vol - sell_vol
    return cvd > 0


def _compute_vwap(klines: list[dict], lookback: int = 20) -> Optional[float]:
    """VWAP dos últimos N candles: sum(typical_price × volume) / sum(volume)."""
    if not klines:
        return None
    recent = klines[-lookback:] if len(klines) >= lookback else klines
    numerator = 0.0
    denominator = 0.0
    for c in recent:
        h, l, cl, v = c.get("h", 0), c.get("l", 0), c.get("c", 0), c.get("v", 0)
        typical = (h + l + cl) / 3
        numerator += typical * v
        denominator += v
    if denominator == 0:
        return None
    return round(numerator / denominator, 8)


# ── BTC Dominance ─────────────────────────────────────────────────────────────

_BTC_DOM_TTL = 5 * 60  # 5 minutos


async def _fetch_btc_dominance() -> tuple[Optional[float], str]:
    """
    Retorna (btc_dom_pct, trend) via CoinGecko Global.
    trend: "subindo" / "caindo" / "neutro" com base na variação 24h.
    """
    global _BTC_DOM_CACHE
    if _BTC_DOM_CACHE and time.time() - _BTC_DOM_CACHE[0] < _BTC_DOM_TTL:
        return _BTC_DOM_CACHE[1], _BTC_DOM_CACHE[2]
    try:
        async with httpx.AsyncClient(timeout=8.0) as cli:
            r = await cli.get("https://api.coingecko.com/api/v3/global")
            r.raise_for_status()
            d = r.json().get("data", {})
            pct = d.get("market_cap_percentage", {}).get("btc")
            if pct is None:
                return None, "neutro"
            btc_pct = float(pct)
            # market_cap_change_percentage_24h_usd serve como proxy de dominância
            change = d.get("market_cap_change_percentage_24h_usd", 0.0) or 0.0
            # Heurística: se BTC subiu mais que mercado geral → dominância subindo
            btc_vol_pct_change = d.get("total_volume", {})
            if change > 1:
                trend = "subindo"
            elif change < -1:
                trend = "caindo"
            else:
                trend = "neutro"
            _BTC_DOM_CACHE = (time.time(), btc_pct, trend)
            return btc_pct, trend
    except Exception:
        cached_val = _BTC_DOM_CACHE
        if cached_val:
            return cached_val[1], cached_val[2]
        return None, "neutro"


# ── Análise completa de uma moeda ─────────────────────────────────────────────

async def _analisar_futures_moeda(
    simbolo: str,
    bn_sym: str,
    fg: Optional[int],
    usd_brl: Optional[float],
    btc_dom: Optional[float],
    btc_dom_trend: str,
) -> dict:
    """Busca todos os dados em paralelo e executa o futures engine."""
    async with httpx.AsyncClient(timeout=20.0) as cli:
        # Klines para 7 timeframes
        tf_tasks = {
            tf: _fetch_futures_klines(cli, bn_sym, interval, TF_LIMITS[tf])
            for tf, interval in TF_INTERVALS.items()
        }
        tf_names = list(tf_tasks.keys())

        # Executar tudo em paralelo
        all_results = await asyncio.gather(
            *tf_tasks.values(),
            _fetch_futures_ticker(cli, bn_sym),
            _fetch_open_interest(cli, bn_sym),
            _fetch_oi_history(cli, bn_sym, period="5m", limit=5),
            _fetch_funding_rate(cli, bn_sym),
            _fetch_ls_ratio(cli, bn_sym, period="5m"),
            _fetch_taker_ratio(cli, bn_sym, period="5m"),
            return_exceptions=True,
        )

    n_tfs = len(tf_names)
    candles_por_tf: dict[str, list] = {}
    for i, tf in enumerate(tf_names):
        r = all_results[i]
        candles_por_tf[tf] = r if isinstance(r, list) else []

    ticker      = all_results[n_tfs]      if not isinstance(all_results[n_tfs], Exception)      else {}
    oi_raw      = all_results[n_tfs + 1]  if not isinstance(all_results[n_tfs + 1], Exception)  else 0.0
    oi_hist     = all_results[n_tfs + 2]  if not isinstance(all_results[n_tfs + 2], Exception)  else []
    funding     = all_results[n_tfs + 3]  if not isinstance(all_results[n_tfs + 3], Exception)  else 0.0
    ls_result   = all_results[n_tfs + 4]  if not isinstance(all_results[n_tfs + 4], Exception)  else (50.0, 50.0)
    taker_buy   = all_results[n_tfs + 5]  if not isinstance(all_results[n_tfs + 5], Exception)  else 50.0

    # Calcular variação de OI (latest vs 5 períodos atrás)
    oi_change_pct = 0.0
    if oi_hist and len(oi_hist) >= 2:
        oi_first = oi_hist[0].get("sumOpenInterest", 0)
        oi_last  = oi_hist[-1].get("sumOpenInterest", 0)
        if oi_first > 0:
            oi_change_pct = (oi_last - oi_first) / oi_first * 100

    # Preço atual do ticker
    preco_atual = (ticker or {}).get("preco", 0.0)
    volume24h = (ticker or {}).get("volume24h", 0.0)
    var24h_pct = (ticker or {}).get("var24h", 0.0)

    # OI em USDT (contracts × price)
    oi_usdt = oi_raw * preco_atual if preco_atual > 0 else oi_raw

    # Long/Short Ratio
    long_pct, short_pct = ls_result if isinstance(ls_result, tuple) else (50.0, 50.0)

    # CVD e VWAP do 15m
    klines_15m = candles_por_tf.get("15m", [])
    cvd_bullish = _compute_cvd(klines_15m, lookback=20)
    vwap = _compute_vwap(klines_15m, lookback=20)

    futures_data = {
        "oi_usdt":        oi_usdt,
        "oi_change_pct":  round(oi_change_pct, 2),
        "funding_rate":   funding if isinstance(funding, float) else 0.0,
        "long_pct":       long_pct,
        "short_pct":      short_pct,
        "taker_buy_pct":  taker_buy if isinstance(taker_buy, float) else 50.0,
        "cvd_bullish":    cvd_bullish,
        "volume24h_usdt": volume24h,
        "vwap":           vwap,
        "preco_atual":    preco_atual,
        "var24h_pct":     var24h_pct,
        "usd_brl":        usd_brl,
    }

    resultado = calcular_futures(
        simbolo=simbolo,
        candles_por_tf=candles_por_tf,
        futures_data=futures_data,
        fg=fg,
        btc_dom=btc_dom,
        btc_dom_trend=btc_dom_trend,
    )

    # Enriquecer com ticker 24h
    if ticker:
        resultado["high24h"]   = ticker.get("high24h")
        resultado["low24h"]    = ticker.get("low24h")
        resultado["trades24h"] = ticker.get("trades24h")

    resultado["usd_brl"] = usd_brl
    return resultado


# ── Resumo para ranking ───────────────────────────────────────────────────────

def _resumo(r: dict) -> dict:
    return {
        "simbolo":              r.get("simbolo"),
        "preco":                r.get("preco_atual"),
        "score_final":          r.get("score_final", 50),
        "grade":                r.get("grade", "NR"),
        "direction":            r.get("direction", "NEUTRO"),
        "direction_confidence": r.get("direction_confidence", 0),
        "ist":                  r.get("ist", 0),
        "operar":               r.get("operar", False),
        "bullish":              r.get("bullish", False),
        "var24h":               r.get("var24h"),
        "volume24h":            r.get("volume24h"),
        "oi_change_pct":        r.get("oi_change_pct"),
        "funding_rate":         r.get("funding_rate"),
        "funding_class":        r.get("funding_class"),
        "long_pct":             r.get("long_pct"),
        "short_pct":            r.get("short_pct"),
        "bull_pct":             r.get("bull_pct", 50),
        "leverage_suggested":   r.get("leverage_suggested", "1x"),
        "usd_brl":              r.get("usd_brl"),
        "squeeze_type":         r.get("squeeze_type"),
        "score_tecnico":        r.get("score_tecnico"),
        "score_fluxo":          r.get("score_fluxo"),
        "score_contexto":       r.get("score_contexto"),
        "score_fundamental":    r.get("score_fundamental"),
        # Níveis de entrada/saída/stop (para sinal de trade)
        "niveis":               r.get("niveis", {}),
        "justificativa":        r.get("justificativa", ""),
    }


# ── Endpoints ─────────────────────────────────────────────────────────────────

# IMPORTANTE: rota /scan ANTES de /{simbolo}
@router.get("/cripto/futures/scan")
async def get_futures_scan():
    """Scan de todas as moedas futuros — ranking por score, direção e IST."""
    cached = _from_cache("ft:scan", _TTL_SCAN)
    if cached:
        return cached

    # Buscar dados globais em paralelo
    fg, usd_brl, dom_result = await asyncio.gather(
        _fetch_fg(),
        _fetch_usd_brl(),
        _fetch_btc_dominance(),
    )
    btc_dom, btc_dom_trend = dom_result if isinstance(dom_result, tuple) else (None, "neutro")

    resultados: list[dict] = []

    # Coins com cache → adiciona direto; sem cache → lista para buscar em batch
    coins_to_fetch: list[tuple[str, str]] = []
    for simbolo, bn_sym in FT_COINS.items():
        cached_coin = _from_cache(f"ft:{simbolo}", _TTL_COIN)
        if cached_coin:
            resultados.append(_resumo(cached_coin))
        else:
            coins_to_fetch.append((simbolo, bn_sym))

    # Processa em batches de 8 para não sobrecarregar a Binance API
    BATCH = 8
    for i in range(0, len(coins_to_fetch), BATCH):
        batch = coins_to_fetch[i : i + BATCH]
        tasks = [
            _analisar_futures_moeda(s, b, fg, usd_brl, btc_dom, btc_dom_trend)
            for s, b in batch
        ]
        batch_results = await asyncio.gather(*tasks, return_exceptions=True)
        for (simbolo, _), res in zip(batch, batch_results):
            if isinstance(res, Exception) or not isinstance(res, dict):
                continue
            _set_cache(f"ft:{simbolo}", res)
            resultados.append(_resumo(res))

    resultados.sort(key=lambda x: x["score_final"], reverse=True)

    top_long  = sorted(
        [r for r in resultados if r.get("direction") == "LONG" and r.get("operar")],
        key=lambda x: x["score_final"],
        reverse=True,
    )[:10]

    top_short = sorted(
        [r for r in resultados if r.get("direction") == "SHORT" and r.get("operar")],
        key=lambda x: x["score_final"],
        reverse=True,
    )[:10]

    top_ist = sorted(
        [r for r in resultados if r.get("ist") is not None],
        key=lambda x: x.get("ist", 0),
        reverse=True,
    )[:10]

    response = {
        "geral":     resultados,
        "top_long":  top_long,
        "top_short": top_short,
        "top_ist":   top_ist,
        "total":     len(resultados),
        "atualizado": time.time(),
        "usd_brl":   usd_brl,
        "btc_dom":   btc_dom,
    }

    _set_cache("ft:scan", response)
    # Persiste no MySQL em background (não bloqueia a resposta)
    try:
        from ..db.mysql import salvar_scan
        asyncio.create_task(salvar_scan(response))
    except Exception:
        pass
    return response


@router.get("/cripto/futures/stream")
async def stream_futures_scan(interval: int = 30):
    """
    SSE — stream em tempo real do scan de futuros.
    Envia um evento a cada `interval` segundos (mín 15s, máx 300s).
    O cliente permanece conectado e recebe dados continuamente sem polling.
    """
    interval = max(15, min(300, interval))

    async def _gerar_scan() -> dict:
        fg, usd_brl, dom_result = await asyncio.gather(
            _fetch_fg(),
            _fetch_usd_brl(),
            _fetch_btc_dominance(),
        )
        btc_dom, btc_dom_trend = dom_result if isinstance(dom_result, tuple) else (None, "neutro")

        resultados: list[dict] = []
        coins_list = list(FT_COINS.items())
        BATCH = 8
        for i in range(0, len(coins_list), BATCH):
            batch = coins_list[i : i + BATCH]
            tasks = [
                _analisar_futures_moeda(s, b, fg, usd_brl, btc_dom, btc_dom_trend)
                for s, b in batch
            ]
            batch_results = await asyncio.gather(*tasks, return_exceptions=True)
            for (simbolo, _), res in zip(batch, batch_results):
                if isinstance(res, Exception) or not isinstance(res, dict):
                    continue
                _set_cache(f"ft:{simbolo}", res)
                resultados.append(_resumo(res))

        resultados.sort(key=lambda x: x["score_final"], reverse=True)
        top_long  = sorted([r for r in resultados if r.get("direction") == "LONG"  and r.get("operar")], key=lambda x: x["score_final"], reverse=True)[:10]
        top_short = sorted([r for r in resultados if r.get("direction") == "SHORT" and r.get("operar")], key=lambda x: x["score_final"], reverse=True)[:10]
        top_ist   = sorted([r for r in resultados if r.get("ist") is not None], key=lambda x: x.get("ist", 0), reverse=True)[:10]

        payload = {
            "geral":      resultados,
            "top_long":   top_long,
            "top_short":  top_short,
            "top_ist":    top_ist,
            "total":      len(resultados),
            "atualizado": time.time(),
            "usd_brl":    usd_brl,
            "btc_dom":    btc_dom,
        }
        _set_cache("ft:scan", payload)
        try:
            from ..db.mysql import salvar_scan
            asyncio.create_task(salvar_scan(payload))
        except Exception:
            pass
        return payload

    async def _event_generator():
        try:
            while True:
                try:
                    payload = await _gerar_scan()
                    yield f"data: {json.dumps(payload)}\n\n"
                except asyncio.CancelledError:
                    raise
                except Exception as e:
                    yield f"data: {json.dumps({'erro': str(e)})}\n\n"
                await asyncio.sleep(interval)
        except asyncio.CancelledError:
            pass

    return StreamingResponse(
        _event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection":    "keep-alive",
            "X-Accel-Buffering": "no",   # Desativa buffer do nginx
        },
    )


@router.get("/cripto/futures/{simbolo}")
async def get_futures(simbolo: str):
    """Análise Futures completa — scores multi-dimensionais + dados de mercado."""
    simbolo = simbolo.upper()
    bn_sym = FT_COINS.get(simbolo)
    if not bn_sym:
        raise HTTPException(
            404,
            f"Símbolo '{simbolo}' não suportado. Moedas disponíveis: {', '.join(FT_COINS)}",
        )

    cached = _from_cache(f"ft:{simbolo}", _TTL_COIN)
    if cached:
        return cached

    fg, usd_brl, dom_result = await asyncio.gather(
        _fetch_fg(),
        _fetch_usd_brl(),
        _fetch_btc_dominance(),
    )
    btc_dom, btc_dom_trend = dom_result if isinstance(dom_result, tuple) else (None, "neutro")

    resultado = await _analisar_futures_moeda(simbolo, bn_sym, fg, usd_brl, btc_dom, btc_dom_trend)
    return _set_cache(f"ft:{simbolo}", resultado)
