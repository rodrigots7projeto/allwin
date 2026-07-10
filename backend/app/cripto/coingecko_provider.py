"""
CoinGecko API v3 — histórico OHLCV, metadados, ATH/ATL, developer data.
Free tier: ~30 req/min sem chave de API.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional
import httpx

CG_BASE = "https://api.coingecko.com/api/v3"
_CG_CACHE: dict[str, tuple[float, object]] = {}  # key → (ts, data)
_CG_TTL   = 15 * 60  # 15 minutos — respeita free-tier 30 req/min

# Símbolo MB → CoinGecko ID
CG_IDS: dict[str, str] = {
    "BTC":  "bitcoin",
    "ETH":  "ethereum",
    "SOL":  "solana",
    "BNB":  "binancecoin",
    "XRP":  "ripple",
    "DOGE": "dogecoin",
    "ADA":  "cardano",
    "AVAX": "avalanche-2",
    "LINK": "chainlink",
    "LTC":  "litecoin",
    "DOT":  "polkadot",
    "MATIC":"matic-network",
}

_HDR = {"Accept": "application/json", "User-Agent": "AllWin/2.0"}


import time as _time

def _cached(key: str, data):
    _CG_CACHE[key] = (_time.time(), data)
    return data

def _from_cache(key: str):
    entry = _CG_CACHE.get(key)
    if entry:
        ts, data = entry
        if _time.time() - ts < _CG_TTL:
            return data
    return None


def _f(v, d=None):
    try:
        return float(v)
    except (TypeError, ValueError):
        return d


async def get_coin_data(simbolo: str) -> Optional[dict]:
    """
    Metadados completos: variações, ATH/ATL, market cap, supply,
    fully diluted valuation, developer data (GitHub).
    Cache 15 min para respeitar free-tier CoinGecko.
    """
    cache_key = f"coin:{simbolo}"
    hit = _from_cache(cache_key)
    if hit is not None:
        return hit

    cg_id = CG_IDS.get(simbolo)
    if not cg_id:
        return None
    async with httpx.AsyncClient(timeout=15.0, headers=_HDR) as cli:
        try:
            r = await cli.get(
                f"{CG_BASE}/coins/{cg_id}",
                params={
                    "localization":    "false",
                    "tickers":         "false",
                    "market_data":     "true",
                    "community_data":  "false",
                    "developer_data":  "true",
                    "sparkline":       "false",
                },
            )
            if r.status_code == 429:
                return _from_cache(cache_key)  # retorna cache expirado se disponível
            r.raise_for_status()
            return _cached(cache_key, r.json())
        except Exception:
            return _from_cache(cache_key)


async def get_market_chart(simbolo: str, dias: int = 365) -> Optional[dict]:
    """
    Preços de fechamento diários + volumes em BRL.
    Retorna {"prices": [[ts_ms, close], ...], "total_volumes": [...]}
    Cache 15 min.
    """
    cache_key = f"chart:{simbolo}:{dias}"
    hit = _from_cache(cache_key)
    if hit is not None:
        return hit

    cg_id = CG_IDS.get(simbolo)
    if not cg_id:
        return None
    async with httpx.AsyncClient(timeout=20.0, headers=_HDR) as cli:
        try:
            r = await cli.get(
                f"{CG_BASE}/coins/{cg_id}/market_chart",
                params={"vs_currency": "brl", "days": str(dias), "interval": "daily"},
            )
            if r.status_code == 429:
                return _from_cache(cache_key)
            r.raise_for_status()
            return _cached(cache_key, r.json())
        except Exception:
            return _from_cache(cache_key)


async def get_ohlc(simbolo: str, dias: int = 90) -> list[list]:
    """
    Candles OHLC em BRL.
    Para dias=90 → granularidade 4h (agrega para diário no provider).
    Retorna [[ts_ms, open, high, low, close], ...]
    Cache 15 min.
    """
    cache_key = f"ohlc:{simbolo}:{dias}"
    hit = _from_cache(cache_key)
    if hit is not None:
        return hit

    cg_id = CG_IDS.get(simbolo)
    if not cg_id:
        return []
    async with httpx.AsyncClient(timeout=15.0, headers=_HDR) as cli:
        try:
            r = await cli.get(
                f"{CG_BASE}/coins/{cg_id}/ohlc",
                params={"vs_currency": "brl", "days": str(dias)},
            )
            if r.status_code == 429:
                return _from_cache(cache_key) or []
            r.raise_for_status()
            data = r.json()
            result = data if isinstance(data, list) else []
            return _cached(cache_key, result)
        except Exception:
            return _from_cache(cache_key) or []


# ── Helpers de extração ───────────────────────────────────────────────────────

def extrair_market_data(coin: dict) -> dict:
    """Extrai market_data do payload /coins/{id}."""
    md = coin.get("market_data", {})
    brl = lambda key: _f((md.get(key) or {}).get("brl"))
    pct = lambda key: _f(md.get(key))

    return {
        "preco_atual":    brl("current_price"),
        "market_cap":     brl("market_cap"),
        "fdv":            brl("fully_diluted_valuation"),
        "volume_24h":     brl("total_volume"),
        "variacao_24h":   pct("price_change_percentage_24h"),
        "variacao_7d":    pct("price_change_percentage_7d"),
        "variacao_30d":   pct("price_change_percentage_30d"),
        "variacao_1a":    pct("price_change_percentage_1y"),
        "ath":            brl("ath"),
        "atl":            brl("atl"),
        "ath_date":       (md.get("ath_date") or {}).get("brl"),
        "atl_date":       (md.get("atl_date") or {}).get("brl"),
        "ath_change_pct": _f((md.get("ath_change_percentage") or {}).get("brl")),
        "atl_change_pct": _f((md.get("atl_change_percentage") or {}).get("brl")),
        "supply_circ":    _f(md.get("circulating_supply")),
        "supply_max":     _f(md.get("max_supply")),
        "supply_total":   _f(md.get("total_supply")),
    }


def extrair_dev_data(coin: dict) -> Optional[dict]:
    """Extrai developer_data do payload /coins/{id}."""
    dd = coin.get("developer_data")
    if not dd:
        return None
    return {
        "commits_4semanas":   dd.get("commit_count_4_weeks"),
        "stars":              dd.get("stars"),
        "forks":              dd.get("forks"),
        "issues_abertos":     dd.get("total_issues"),
        "issues_fechados":    dd.get("closed_issues"),
        "pr_merged":          dd.get("pull_requests_merged"),
        "contribuidores":     dd.get("pull_request_contributors"),
        "adicoes_codigo":     (dd.get("code_additions_deletions_4_weeks") or {}).get("additions"),
        "delecoes_codigo":    (dd.get("code_additions_deletions_4_weeks") or {}).get("deletions"),
    }


def market_chart_para_candles(chart: dict) -> list[dict]:
    """Converte market_chart (preços+volumes) em lista de candles diários."""
    prices  = chart.get("prices", [])
    volumes = {int(ts): v for ts, v in chart.get("total_volumes", [])}

    candles = []
    for ts_ms, close in prices:
        ts_s = int(ts_ms) // 1000
        dt   = datetime.fromtimestamp(ts_s, tz=timezone.utc)
        vol  = volumes.get(int(ts_ms), 0.0)
        candles.append({
            "data":       dt.strftime("%Y-%m-%d"),
            "timestamp":  ts_s,
            "abertura":   close,   # sem OHLC real, usa close em tudo
            "maxima":     close,
            "minima":     close,
            "fechamento": close,
            "volume":     vol,
        })
    return sorted(candles, key=lambda x: x["timestamp"])


def ohlc_para_candles_diarios(raw: list[list]) -> list[dict]:
    """
    Agrega candles 4h do CoinGecko em candles diários.
    [[ts_ms, open, high, low, close], ...]
    """
    from collections import defaultdict
    dias: dict[str, dict] = defaultdict(lambda: {"o": None, "h": -1e18, "l": 1e18, "c": None, "ts": 0})

    for row in raw:
        if len(row) < 5:
            continue
        ts_ms, o, h, l, c = row
        ts_s = int(ts_ms) // 1000
        dt   = datetime.fromtimestamp(ts_s, tz=timezone.utc).strftime("%Y-%m-%d")
        d    = dias[dt]
        if d["o"] is None:
            d["o"] = float(o)
            d["ts"] = ts_s
        d["h"] = max(d["h"], float(h))
        d["l"] = min(d["l"], float(l))
        d["c"] = float(c)

    result = []
    for data, d in sorted(dias.items()):
        if d["c"] is not None:
            result.append({
                "data":       data,
                "timestamp":  d["ts"],
                "abertura":   d["o"],
                "maxima":     d["h"],
                "minima":     d["l"],
                "fechamento": d["c"],
                "volume":     0.0,
            })
    return result


def mesclar_candles(chart_candles: list[dict], ohlc_candles: list[dict]) -> list[dict]:
    """
    Usa chart_candles como base (tem volume), substitui high/low/open
    pelos valores reais do ohlc_candles quando disponível.
    """
    ohlc_map = {c["data"]: c for c in ohlc_candles}
    result = []
    for c in chart_candles:
        d = c["data"]
        if d in ohlc_map:
            o = ohlc_map[d]
            result.append({**c, "abertura": o["abertura"], "maxima": o["maxima"], "minima": o["minima"]})
        else:
            result.append(c)
    return result
