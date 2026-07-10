"""
Mercado Bitcoin API v4 + Fear & Greed Index.

Endpoints usados:
  GET https://api.mercadobitcoin.net/api/v4/tickers?symbols={symbol}-BRL
  GET https://api.mercadobitcoin.net/api/v4/{symbol}-BRL/candle?from={ts}&to={ts}&precision=1d
  GET https://api.alternative.me/fng/?limit=1
"""
from __future__ import annotations

import time
from typing import Optional
import httpx

MB_V4 = "https://api.mercadobitcoin.net/api/v4"
FNG_URL = "https://api.alternative.me/fng/?limit=1"

# ── Metadados estáticos por moeda ────────────────────────────────────────────

MOEDAS: dict[str, dict] = {
    "BTC":  dict(nome="Bitcoin",       blockchain="Bitcoin Network",  categoria="Store of Value",    rank=1,  supply_max=21_000_000,          supply_circ=19_700_000,    inflacao_anual=1.7,  tokenomics="Excelente", queima=False),
    "ETH":  dict(nome="Ethereum",      blockchain="Ethereum",         categoria="Smart Contract",    rank=2,  supply_max=None,                supply_circ=120_000_000,   inflacao_anual=0.4,  tokenomics="Boa",       queima=True),
    "SOL":  dict(nome="Solana",        blockchain="Solana",           categoria="Smart Contract",    rank=5,  supply_max=None,                supply_circ=470_000_000,   inflacao_anual=5.0,  tokenomics="Regular",   queima=False),
    "BNB":  dict(nome="BNB",           blockchain="BNB Chain",        categoria="Exchange Token",    rank=4,  supply_max=200_000_000,         supply_circ=145_000_000,   inflacao_anual=-2.0, tokenomics="Boa",       queima=True),
    "XRP":  dict(nome="XRP",           blockchain="XRP Ledger",       categoria="Pagamentos",        rank=3,  supply_max=100_000_000_000,     supply_circ=57_000_000_000,inflacao_anual=0.5,  tokenomics="Regular",   queima=False),
    "DOGE": dict(nome="Dogecoin",      blockchain="Dogecoin",         categoria="Meme",              rank=9,  supply_max=None,                supply_circ=146_000_000_000,inflacao_anual=4.1, tokenomics="Ruim",      queima=False),
    "ADA":  dict(nome="Cardano",       blockchain="Cardano",          categoria="Smart Contract",    rank=10, supply_max=45_000_000_000,      supply_circ=35_000_000_000,inflacao_anual=2.0,  tokenomics="Regular",   queima=False),
    "AVAX": dict(nome="Avalanche",     blockchain="Avalanche",        categoria="Smart Contract",    rank=11, supply_max=720_000_000,         supply_circ=410_000_000,   inflacao_anual=3.5,  tokenomics="Regular",   queima=True),
    "LINK": dict(nome="Chainlink",     blockchain="Ethereum",         categoria="Oracle",            rank=16, supply_max=1_000_000_000,       supply_circ=587_000_000,   inflacao_anual=1.5,  tokenomics="Boa",       queima=False),
    "LTC":  dict(nome="Litecoin",      blockchain="Litecoin",         categoria="Pagamentos",        rank=20, supply_max=84_000_000,          supply_circ=74_000_000,    inflacao_anual=1.0,  tokenomics="Boa",       queima=False),
    "DOT":  dict(nome="Polkadot",      blockchain="Polkadot",         categoria="Interoperabilidade",rank=22, supply_max=None,                supply_circ=1_400_000_000, inflacao_anual=8.0,  tokenomics="Ruim",      queima=False),
    "MATIC":dict(nome="Polygon",       blockchain="Polygon",          categoria="L2 Scaling",        rank=25, supply_max=10_000_000_000,      supply_circ=9_300_000_000, inflacao_anual=0.5,  tokenomics="Regular",   queima=True),
}


def _f(v, default=None):
    try:
        return float(v)
    except (TypeError, ValueError):
        return default


async def get_ticker(simbolo: str) -> Optional[dict]:
    """Busca ticker atual do Mercado Bitcoin."""
    symbol_brl = f"{simbolo}-BRL"
    async with httpx.AsyncClient(timeout=10.0) as cli:
        try:
            r = await cli.get(f"{MB_V4}/tickers", params={"symbols": symbol_brl})
            r.raise_for_status()
            data = r.json()
            if isinstance(data, list) and data:
                t = data[0]
                return {
                    "preco_atual":   _f(t.get("last")),
                    "preco_compra":  _f(t.get("buy")),
                    "preco_venda":   _f(t.get("sell")),
                    "preco_abertura":_f(t.get("open")),
                    "preco_max_24h": _f(t.get("high")),
                    "preco_min_24h": _f(t.get("low")),
                    "volume_24h":    _f(t.get("vol")),
                    "timestamp":     t.get("date"),
                }
        except Exception:
            pass
    return None


async def get_candles(simbolo: str, dias: int = 365) -> list[dict]:
    """Busca OHLCV diário dos últimos `dias` dias."""
    symbol_brl = f"{simbolo}-BRL"
    ts_to   = int(time.time())
    ts_from = ts_to - dias * 86400

    async with httpx.AsyncClient(timeout=20.0) as cli:
        try:
            r = await cli.get(
                f"{MB_V4}/{symbol_brl}/candle",
                params={"from": ts_from, "to": ts_to, "precision": "1d"},
            )
            r.raise_for_status()
            data = r.json()
            candles = []
            for c in (data if isinstance(data, list) else data.get("candles", [])):
                ts = c.get("timestamp") or c.get("time") or c.get("t")
                o  = _f(c.get("open")  or c.get("o"))
                h  = _f(c.get("high")  or c.get("h"))
                l  = _f(c.get("low")   or c.get("l"))
                cl = _f(c.get("close") or c.get("c"))
                v  = _f(c.get("volume") or c.get("vol") or c.get("v"))
                if ts and cl:
                    from datetime import datetime, timezone
                    dt = datetime.fromtimestamp(int(ts), tz=timezone.utc)
                    candles.append({
                        "data":        dt.strftime("%Y-%m-%d"),
                        "timestamp":   int(ts),
                        "abertura":    o or cl,
                        "maxima":      h or cl,
                        "minima":      l or cl,
                        "fechamento":  cl,
                        "volume":      v or 0.0,
                    })
            return sorted(candles, key=lambda x: x["timestamp"])
        except Exception:
            pass
    return []


async def get_fear_greed() -> Optional[dict]:
    """Busca Fear & Greed Index (alternative.me, gratuito)."""
    async with httpx.AsyncClient(timeout=8.0) as cli:
        try:
            r = await cli.get(FNG_URL)
            r.raise_for_status()
            d = r.json()
            entry = d.get("data", [{}])[0]
            valor = int(entry.get("value", 50))
            return {
                "valor":         valor,
                "classificacao": entry.get("value_classification", "Neutro"),
            }
        except Exception:
            return None
