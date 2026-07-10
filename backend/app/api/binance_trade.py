"""
Binance Trade — spot + convert direto pelo AllWin.
Chaves enviadas pelo frontend via headers (X-Binance-Key / X-Binance-Secret).
Todo o signing HMAC-SHA256 ocorre aqui, nunca no cliente.
"""
from __future__ import annotations
import hashlib
import hmac
import time
from typing import Optional
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Header, HTTPException, Query
from pydantic import BaseModel

router = APIRouter(tags=["binance — trade"])

BAPI = "https://api.binance.com"
FAPI = "https://fapi.binance.com"

PAIRS = {
    "BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT", "XRPUSDT",
    "DOGEUSDT", "ADAUSDT", "AVAXUSDT", "LINKUSDT", "LTCUSDT",
    "DOTUSDT", "UNIUSDT", "AAVEUSDT", "NEARUSDT", "ARBUSDT",
    "OPUSDT", "SUIUSDT", "MATICUSDT", "BCHUSDT",
    "ATOMUSDT", "APTUSDT", "FILUSDT", "INJUSDT", "TIAUSDT",
    "WIFUSDT", "PEPEUSDT", "SHIBUSDT", "TONUSDT", "TRXUSDT",
    "MKRUSDT", "SANDUSDT", "MANAUSDT", "GRTUSDT", "LDOUSDT",
    "IMXUSDT", "FTMUSDT", "STXUSDT", "WLDUSDT", "SEIUSDT",
    "JUPUSDT", "FLOKIUSDT", "BONKUSDT", "PYTHUSDT", "BLURUSDT",
    "APEUSDT", "CRVUSDT", "GMXUSDT", "DYDXUSDT", "NOTUSDT",
}


# ── Signing ───────────────────────────────────────────────────────────────────

def _sign(params: dict, secret: str) -> str:
    qs = urlencode(sorted(params.items()))
    return hmac.new(secret.encode(), qs.encode(), hashlib.sha256).hexdigest()


def _ts() -> int:
    return int(time.time() * 1000)


def _keys(k: Optional[str], s: Optional[str]) -> tuple[str, str]:
    if not k or not s:
        raise HTTPException(401, "Configure sua API Key e Secret na aba Trade → ⚙️ Configurar.")
    return k.strip(), s.strip()


async def _get(cli: httpx.AsyncClient, url: str, key: str, secret: str, extra: dict | None = None) -> dict | list:
    p = dict(extra or {})
    p["timestamp"] = _ts()
    p["recvWindow"] = 5000
    p["signature"] = _sign(p, secret)
    r = await cli.get(url, params=p, headers={"X-MBX-APIKEY": key})
    d = r.json()
    if isinstance(d, dict) and d.get("code", 0) < 0:
        raise HTTPException(400, f"Binance {d['code']}: {d.get('msg', 'Erro desconhecido')}")
    return d


async def _post(cli: httpx.AsyncClient, url: str, key: str, secret: str, params: dict) -> dict:
    params["timestamp"] = _ts()
    params["recvWindow"] = 5000
    params["signature"] = _sign(params, secret)
    r = await cli.post(url, data=params, headers={"X-MBX-APIKEY": key,
                                                   "Content-Type": "application/x-www-form-urlencoded"})
    d = r.json()
    if isinstance(d, dict) and d.get("code", 0) < 0:
        raise HTTPException(400, f"Binance {d['code']}: {d.get('msg', 'Erro desconhecido')}")
    return d


async def _delete(cli: httpx.AsyncClient, url: str, key: str, secret: str, params: dict) -> dict:
    params["timestamp"] = _ts()
    params["recvWindow"] = 5000
    params["signature"] = _sign(params, secret)
    r = await cli.delete(url, params=params, headers={"X-MBX-APIKEY": key})
    d = r.json()
    if isinstance(d, dict) and d.get("code", 0) < 0:
        raise HTTPException(400, f"Binance {d['code']}: {d.get('msg', 'Erro desconhecido')}")
    return d


# ── Públicos (sem auth) ───────────────────────────────────────────────────────

@router.get("/trade/prices")
async def trade_prices():
    """Preços + variação 24h de todos os pares suportados."""
    async with httpx.AsyncClient(timeout=10.0) as cli:
        r = await cli.get(f"{BAPI}/api/v3/ticker/24hr")
        all_t = r.json()
    if not isinstance(all_t, list):
        raise HTTPException(502, f"Binance API error: {all_t}")
    return {
        t["symbol"]: {
            "price":    float(t["lastPrice"]),
            "change":   float(t["priceChangePercent"]),
            "high":     float(t["highPrice"]),
            "low":      float(t["lowPrice"]),
            "volume":   float(t["quoteVolume"]),
            "bid":      float(t["bidPrice"]),
            "ask":      float(t["askPrice"]),
        }
        for t in all_t
        if isinstance(t, dict) and t.get("symbol") in PAIRS
    }


@router.get("/trade/orderbook/{symbol}")
async def trade_orderbook(symbol: str, limit: int = Query(15, le=100)):
    """Order book do par (bids e asks)."""
    async with httpx.AsyncClient(timeout=8.0) as cli:
        r = await cli.get(f"{BAPI}/api/v3/depth",
                          params={"symbol": symbol.upper(), "limit": limit})
        d = r.json()
    return {
        "bids": [[float(p), float(q)] for p, q in (d.get("bids") or [])],
        "asks": [[float(p), float(q)] for p, q in (d.get("asks") or [])],
    }


@router.get("/trade/klines/{symbol}")
async def trade_klines(symbol: str, interval: str = "5m", limit: int = 100):
    """Candles para o mini-chart."""
    async with httpx.AsyncClient(timeout=10.0) as cli:
        r = await cli.get(f"{BAPI}/api/v3/klines",
                          params={"symbol": symbol.upper(), "interval": interval, "limit": limit})
        raw = r.json()
    return [{"t": int(k[0]), "o": float(k[1]), "h": float(k[2]),
             "l": float(k[3]), "c": float(k[4]), "v": float(k[5])} for k in raw]


@router.get("/trade/exchange-info/{symbol}")
async def trade_exchange_info(symbol: str):
    """Regras de filtro (LOT_SIZE, PRICE_FILTER) para o par."""
    async with httpx.AsyncClient(timeout=8.0) as cli:
        r = await cli.get(f"{BAPI}/api/v3/exchangeInfo", params={"symbol": symbol.upper()})
        d = r.json()
    syms = d.get("symbols", [])
    if not syms:
        raise HTTPException(404, f"Par {symbol} não encontrado")
    s = syms[0]
    filters = {f["filterType"]: f for f in s.get("filters", [])}
    lot = filters.get("LOT_SIZE", {})
    price_f = filters.get("PRICE_FILTER", {})
    notional = filters.get("MIN_NOTIONAL", {})
    return {
        "baseAsset":       s["baseAsset"],
        "quoteAsset":      s["quoteAsset"],
        "baseAssetPrecision": s.get("baseAssetPrecision", 8),
        "quotePrecision":  s.get("quotePrecision", 8),
        "minQty":          float(lot.get("minQty", 0)),
        "maxQty":          float(lot.get("maxQty", 9999999)),
        "stepSize":        float(lot.get("stepSize", 0.00001)),
        "minPrice":        float(price_f.get("minPrice", 0)),
        "tickSize":        float(price_f.get("tickSize", 0.01)),
        "minNotional":     float(notional.get("minNotional", 10)),
    }


# ── Autenticados ──────────────────────────────────────────────────────────────

@router.get("/trade/account")
async def trade_account(
    x_binance_key:    Optional[str] = Header(None),
    x_binance_secret: Optional[str] = Header(None),
):
    """Saldos da conta Spot."""
    key, secret = _keys(x_binance_key, x_binance_secret)
    async with httpx.AsyncClient(timeout=15.0) as cli:
        data = await _get(cli, f"{BAPI}/api/v3/account", key, secret)
    bals = [
        {"asset": b["asset"], "free": float(b["free"]), "locked": float(b["locked"])}
        for b in data.get("balances", [])
        if float(b["free"]) + float(b["locked"]) > 0
    ]
    bals.sort(key=lambda x: x["free"] + x["locked"], reverse=True)
    return {
        "balances":        bals,
        "makerCommission": data.get("makerCommission"),
        "takerCommission": data.get("takerCommission"),
        "canTrade":        data.get("canTrade"),
        "canDeposit":      data.get("canDeposit"),
        "canWithdraw":     data.get("canWithdraw"),
    }


class OrderReq(BaseModel):
    symbol:          str
    side:            str    # BUY | SELL
    order_type:      str    # MARKET | LIMIT
    quantity:        Optional[float] = None
    quote_order_qty: Optional[float] = None
    price:           Optional[float] = None


@router.post("/trade/order")
async def trade_place_order(
    req: OrderReq,
    x_binance_key:    Optional[str] = Header(None),
    x_binance_secret: Optional[str] = Header(None),
):
    """Coloca ordem Spot (MARKET ou LIMIT)."""
    key, secret = _keys(x_binance_key, x_binance_secret)

    p: dict = {
        "symbol": req.symbol.upper(),
        "side":   req.side.upper(),
        "type":   req.order_type.upper(),
    }

    otype = req.order_type.upper()
    if otype == "MARKET":
        if req.quote_order_qty:
            p["quoteOrderQty"] = f"{req.quote_order_qty:.8f}".rstrip("0").rstrip(".")
        elif req.quantity:
            p["quantity"] = f"{req.quantity:.8f}".rstrip("0").rstrip(".")
        else:
            raise HTTPException(400, "MARKET: informe quantity (base) ou quote_order_qty (USDT)")
    elif otype == "LIMIT":
        if not req.quantity or not req.price:
            raise HTTPException(400, "LIMIT: quantity e price são obrigatórios")
        p["quantity"]    = f"{req.quantity:.8f}".rstrip("0").rstrip(".")
        p["price"]       = f"{req.price:.8f}".rstrip("0").rstrip(".")
        p["timeInForce"] = "GTC"
    else:
        raise HTTPException(400, f"Tipo de ordem inválido: {req.order_type}")

    async with httpx.AsyncClient(timeout=20.0) as cli:
        data = await _post(cli, f"{BAPI}/api/v3/order", key, secret, p)
    return data


@router.get("/trade/open-orders")
async def trade_open_orders(
    symbol:           Optional[str] = None,
    x_binance_key:    Optional[str] = Header(None),
    x_binance_secret: Optional[str] = Header(None),
):
    """Ordens abertas (todas ou de um par específico)."""
    key, secret = _keys(x_binance_key, x_binance_secret)
    extra = {"symbol": symbol.upper()} if symbol else {}
    async with httpx.AsyncClient(timeout=10.0) as cli:
        data = await _get(cli, f"{BAPI}/api/v3/openOrders", key, secret, extra)
    return data


@router.delete("/trade/order")
async def trade_cancel_order(
    symbol:           str,
    order_id:         int,
    x_binance_key:    Optional[str] = Header(None),
    x_binance_secret: Optional[str] = Header(None),
):
    """Cancela uma ordem aberta."""
    key, secret = _keys(x_binance_key, x_binance_secret)
    async with httpx.AsyncClient(timeout=10.0) as cli:
        data = await _delete(cli, f"{BAPI}/api/v3/order", key, secret,
                             {"symbol": symbol.upper(), "orderId": order_id})
    return data


@router.get("/trade/my-trades")
async def trade_my_trades(
    symbol:           str,
    limit:            int = Query(30, le=500),
    x_binance_key:    Optional[str] = Header(None),
    x_binance_secret: Optional[str] = Header(None),
):
    """Histórico de trades do usuário para um par."""
    key, secret = _keys(x_binance_key, x_binance_secret)
    async with httpx.AsyncClient(timeout=10.0) as cli:
        data = await _get(cli, f"{BAPI}/api/v3/myTrades", key, secret,
                         {"symbol": symbol.upper(), "limit": limit})
    return data


# ── Convert ───────────────────────────────────────────────────────────────────

class ConvertQuoteReq(BaseModel):
    from_asset:   str
    to_asset:     str
    from_amount:  Optional[float] = None
    to_amount:    Optional[float] = None


@router.post("/trade/convert/quote")
async def trade_convert_quote(
    req: ConvertQuoteReq,
    x_binance_key:    Optional[str] = Header(None),
    x_binance_secret: Optional[str] = Header(None),
):
    """Solicita cotação de conversão (Convert API)."""
    key, secret = _keys(x_binance_key, x_binance_secret)
    p: dict = {
        "fromAsset":  req.from_asset.upper(),
        "toAsset":    req.to_asset.upper(),
        "walletType": "SPOT",
    }
    if req.from_amount:
        p["fromAmount"] = req.from_amount
    elif req.to_amount:
        p["toAmount"] = req.to_amount
    else:
        raise HTTPException(400, "Informe from_amount ou to_amount")

    async with httpx.AsyncClient(timeout=15.0) as cli:
        data = await _post(cli, f"{BAPI}/sapi/v1/convert/getQuote", key, secret, p)
    return data


@router.post("/trade/convert/accept")
async def trade_convert_accept(
    quote_id: str,
    x_binance_key:    Optional[str] = Header(None),
    x_binance_secret: Optional[str] = Header(None),
):
    """Aceita uma cotação de conversão."""
    key, secret = _keys(x_binance_key, x_binance_secret)
    async with httpx.AsyncClient(timeout=15.0) as cli:
        data = await _post(cli, f"{BAPI}/sapi/v1/convert/acceptQuote", key, secret,
                           {"quoteId": quote_id})
    return data


# ── Futures (fapi.binance.com) ───────────────────────────────────────────────

@router.get("/trade/futures/prices")
async def futures_prices():
    """Preços + variação 24h dos pares Futures."""
    async with httpx.AsyncClient(timeout=10.0) as cli:
        r = await cli.get(f"{FAPI}/fapi/v1/ticker/24hr")
        all_t = r.json()
    return {
        t["symbol"]: {
            "price":  float(t["lastPrice"]),
            "change": float(t["priceChangePercent"]),
            "high":   float(t["highPrice"]),
            "low":    float(t["lowPrice"]),
            "volume": float(t["quoteVolume"]),
        }
        for t in all_t if t["symbol"] in PAIRS
    }


@router.get("/trade/futures/orderbook/{symbol}")
async def futures_orderbook(symbol: str, limit: int = Query(15, le=100)):
    """Order book Futures."""
    async with httpx.AsyncClient(timeout=8.0) as cli:
        r = await cli.get(f"{FAPI}/fapi/v1/depth",
                          params={"symbol": symbol.upper(), "limit": limit})
        d = r.json()
    return {
        "bids": [[float(p), float(q)] for p, q in (d.get("bids") or [])],
        "asks": [[float(p), float(q)] for p, q in (d.get("asks") or [])],
    }


@router.get("/trade/futures/account")
async def futures_account(
    x_binance_key:    Optional[str] = Header(None),
    x_binance_secret: Optional[str] = Header(None),
):
    """Saldo e info da conta Futures USDT-M."""
    key, secret = _keys(x_binance_key, x_binance_secret)
    async with httpx.AsyncClient(timeout=15.0) as cli:
        data = await _get(cli, f"{FAPI}/fapi/v2/account", key, secret)
    assets = [
        {
            "asset":            a["asset"],
            "walletBalance":    float(a["walletBalance"]),
            "availableBalance": float(a["availableBalance"]),
            "unrealizedProfit": float(a["unrealizedProfit"]),
            "marginBalance":    float(a["marginBalance"]),
        }
        for a in data.get("assets", [])
        if float(a.get("walletBalance", 0)) > 0
    ]
    return {
        "assets":               assets,
        "totalWalletBalance":   float(data.get("totalWalletBalance", 0)),
        "totalMarginBalance":   float(data.get("totalMarginBalance", 0)),
        "totalUnrealizedProfit": float(data.get("totalUnrealizedProfit", 0)),
        "availableBalance":     float(data.get("availableBalance", 0)),
        "totalPositionInitialMargin": float(data.get("totalPositionInitialMargin", 0)),
        "canDeposit":  data.get("canDeposit"),
        "canTrade":    data.get("canTrade"),
        "canWithdraw": data.get("canWithdraw"),
    }


@router.get("/trade/futures/positions")
async def futures_positions(
    x_binance_key:    Optional[str] = Header(None),
    x_binance_secret: Optional[str] = Header(None),
):
    """Posições abertas Futures (risco por posição)."""
    key, secret = _keys(x_binance_key, x_binance_secret)
    async with httpx.AsyncClient(timeout=15.0) as cli:
        data = await _get(cli, f"{FAPI}/fapi/v2/positionRisk", key, secret)
    positions = [
        {
            "symbol":           p["symbol"],
            "positionAmt":      float(p["positionAmt"]),
            "entryPrice":       float(p["entryPrice"]),
            "markPrice":        float(p["markPrice"]),
            "unrealizedProfit": float(p["unRealizedProfit"]),
            "liquidationPrice": float(p["liquidationPrice"]),
            "leverage":         int(p["leverage"]),
            "marginType":       p["marginType"],
            "positionSide":     p["positionSide"],
            "initialMargin":    float(p.get("initialMargin", 0)),
            "isolatedWallet":   float(p.get("isolatedWallet", 0)),
            "notional":         float(p.get("notional", 0)),
        }
        for p in (data if isinstance(data, list) else [])
        if float(p.get("positionAmt", 0)) != 0
    ]
    return positions


class LeverageReq(BaseModel):
    symbol:   str
    leverage: int


@router.post("/trade/futures/leverage")
async def futures_set_leverage(
    req: LeverageReq,
    x_binance_key:    Optional[str] = Header(None),
    x_binance_secret: Optional[str] = Header(None),
):
    """Define alavancagem para um par Futures."""
    key, secret = _keys(x_binance_key, x_binance_secret)
    async with httpx.AsyncClient(timeout=10.0) as cli:
        data = await _post(cli, f"{FAPI}/fapi/v1/leverage", key, secret,
                           {"symbol": req.symbol.upper(), "leverage": req.leverage})
    return data


class MarginTypeReq(BaseModel):
    symbol:     str
    marginType: str   # ISOLATED | CROSSED


@router.post("/trade/futures/margin-type")
async def futures_set_margin_type(
    req: MarginTypeReq,
    x_binance_key:    Optional[str] = Header(None),
    x_binance_secret: Optional[str] = Header(None),
):
    """Define tipo de margem (ISOLATED ou CROSSED)."""
    key, secret = _keys(x_binance_key, x_binance_secret)
    try:
        async with httpx.AsyncClient(timeout=10.0) as cli:
            data = await _post(cli, f"{FAPI}/fapi/v1/marginType", key, secret,
                               {"symbol": req.symbol.upper(), "marginType": req.marginType.upper()})
        return data
    except HTTPException as e:
        # -4046 = already that margin type — not a real error
        if "-4046" in str(e.detail):
            return {"msg": "Já neste tipo de margem"}
        raise


class FuturesOrderReq(BaseModel):
    symbol:         str
    side:           str                # BUY | SELL
    order_type:     str                # MARKET | LIMIT | STOP_MARKET | TAKE_PROFIT_MARKET
    quantity:       Optional[float] = None
    price:          Optional[float] = None
    stop_price:     Optional[float] = None
    reduce_only:    bool = False
    close_position: bool = False       # usa closePosition=true (sem quantity)
    position_side:  str = "BOTH"
    time_in_force:  str = "GTC"


@router.post("/trade/futures/order")
async def futures_place_order(
    req: FuturesOrderReq,
    x_binance_key:    Optional[str] = Header(None),
    x_binance_secret: Optional[str] = Header(None),
):
    """Abre ou fecha posição Futures (suporta bracket: TP + SL)."""
    key, secret = _keys(x_binance_key, x_binance_secret)

    p: dict = {
        "symbol":       req.symbol.upper(),
        "side":         req.side.upper(),
        "type":         req.order_type.upper(),
        "positionSide": req.position_side.upper(),
    }

    otype = req.order_type.upper()

    if req.close_position:
        p["closePosition"] = "true"
    elif req.quantity:
        p["quantity"] = f"{req.quantity:.8f}".rstrip("0").rstrip(".")
    else:
        raise HTTPException(400, "quantity é obrigatório (ou close_position=true)")

    if otype == "LIMIT":
        if not req.price:
            raise HTTPException(400, "LIMIT requer price")
        p["price"]       = f"{req.price:.8f}".rstrip("0").rstrip(".")
        p["timeInForce"] = req.time_in_force
    elif otype in ("STOP_MARKET", "TAKE_PROFIT_MARKET"):
        if not req.stop_price:
            raise HTTPException(400, f"{otype} requer stop_price")
        p["stopPrice"] = f"{req.stop_price:.8f}".rstrip("0").rstrip(".")

    if req.reduce_only and not req.close_position and otype in ("MARKET", "LIMIT"):
        p["reduceOnly"] = "true"

    async with httpx.AsyncClient(timeout=20.0) as cli:
        data = await _post(cli, f"{FAPI}/fapi/v1/order", key, secret, p)
    return data


# Cache de exchange info (atualiza a cada hora)
_ft_exinfo_cache: dict = {}
_ft_exinfo_ts: float = 0


@router.get("/trade/futures/exchange-info/{symbol}")
async def futures_exchange_info(symbol: str):
    """Regras de tamanho (minQty, stepSize, minNotional) para um par Futures."""
    global _ft_exinfo_cache, _ft_exinfo_ts
    now = time.time()
    if not _ft_exinfo_cache or now - _ft_exinfo_ts > 3600:
        async with httpx.AsyncClient(timeout=15.0) as cli:
            r = await cli.get(f"{FAPI}/fapi/v1/exchangeInfo")
            _ft_exinfo_cache = r.json()
            _ft_exinfo_ts = now

    sym_up = symbol.upper()
    sym_info = next(
        (s for s in _ft_exinfo_cache.get("symbols", []) if s["symbol"] == sym_up), None
    )
    if not sym_info:
        raise HTTPException(404, f"Par {sym_up} não encontrado nos Futures")

    filters = {f["filterType"]: f for f in sym_info.get("filters", [])}
    lot     = filters.get("LOT_SIZE", {})
    mkt_lot = filters.get("MARKET_LOT_SIZE", {})
    price_f = filters.get("PRICE_FILTER", {})
    notional = filters.get("MIN_NOTIONAL", {})

    step    = float(lot.get("stepSize") or mkt_lot.get("stepSize") or 0.001)
    min_qty = float(lot.get("minQty")   or mkt_lot.get("minQty")   or 0.001)

    return {
        "symbol":             sym_up,
        "pricePrecision":     sym_info.get("pricePrecision", 2),
        "quantityPrecision":  sym_info.get("quantityPrecision", 3),
        "minQty":             min_qty,
        "stepSize":           step,
        "tickSize":           float(price_f.get("tickSize", 0.1)),
        "minNotional":        float(notional.get("notional", 5)),
        "contractType":       sym_info.get("contractType", "PERPETUAL"),
    }


@router.delete("/trade/futures/order")
async def futures_cancel_order(
    symbol:           str,
    order_id:         int,
    x_binance_key:    Optional[str] = Header(None),
    x_binance_secret: Optional[str] = Header(None),
):
    """Cancela ordem Futures aberta."""
    key, secret = _keys(x_binance_key, x_binance_secret)
    async with httpx.AsyncClient(timeout=10.0) as cli:
        data = await _delete(cli, f"{FAPI}/fapi/v1/order", key, secret,
                             {"symbol": symbol.upper(), "orderId": order_id})
    return data


@router.get("/trade/futures/open-orders")
async def futures_open_orders(
    symbol:           Optional[str] = None,
    x_binance_key:    Optional[str] = Header(None),
    x_binance_secret: Optional[str] = Header(None),
):
    """Ordens Futures abertas."""
    key, secret = _keys(x_binance_key, x_binance_secret)
    extra = {"symbol": symbol.upper()} if symbol else {}
    async with httpx.AsyncClient(timeout=10.0) as cli:
        data = await _get(cli, f"{FAPI}/fapi/v1/openOrders", key, secret, extra)
    return data


@router.get("/trade/futures/my-trades")
async def futures_my_trades(
    symbol:           str,
    limit:            int = Query(30, le=500),
    x_binance_key:    Optional[str] = Header(None),
    x_binance_secret: Optional[str] = Header(None),
):
    """Histórico de trades Futures."""
    key, secret = _keys(x_binance_key, x_binance_secret)
    async with httpx.AsyncClient(timeout=10.0) as cli:
        data = await _get(cli, f"{FAPI}/fapi/v1/userTrades", key, secret,
                          {"symbol": symbol.upper(), "limit": limit})
    return data


# ── Binance Web Market APIs (públicos) ────────────────────────────────────────

BWEB = "https://www.binance.com"
_WEB_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "application/json",
}


@router.get("/trade/market/hot-coins")
async def trade_hot_coins():
    """Moedas em alta (trending) da Binance."""
    async with httpx.AsyncClient(timeout=10.0) as cli:
        r = await cli.get(
            f"{BWEB}/bapi/apex/v1/friendly/apex/market/hot-coins",
            params={"currency": "USD"},
            headers=_WEB_HEADERS,
        )
        d = r.json()
    return d.get("data", [])


@router.get("/trade/market/symbols")
async def trade_symbols():
    """Lista completa de símbolos com tags, market cap e volume."""
    async with httpx.AsyncClient(timeout=15.0) as cli:
        r = await cli.get(
            f"{BWEB}/bapi/apex/v1/friendly/apex/marketing/simplifiedSymbolListWeb",
            headers=_WEB_HEADERS,
        )
        d = r.json()
    raw = d if isinstance(d, list) else d.get("data", [])
    # Filter only USDT pairs and enrich field names
    result = []
    for x in raw:
        if not isinstance(x, dict):
            continue
        sb = x.get("sb", "")
        if not sb.endswith("USDT"):
            continue
        result.append({
            "symbol":    sb,
            "base":      x.get("b", ""),
            "fullName":  x.get("fn", ""),
            "marketCap": x.get("marketCap") or x.get("cs", 0),
            "volume":    x.get("v", 0),
            "tags":      [t.get("display", t.get("tag", "")) for t in (x.get("ti") or [])],
        })
    result.sort(key=lambda x: x["volume"] or 0, reverse=True)
    return result


@router.get("/trade/market/dynamic")
async def trade_dynamic():
    """Dados dinâmicos (OHLCV) de pares USDT."""
    async with httpx.AsyncClient(timeout=15.0) as cli:
        r = await cli.get(
            f"{BWEB}/bapi/asset/v2/friendly/asset-service/product/get-product-dynamic",
            params={"includeEtf": "true"},
            headers=_WEB_HEADERS,
        )
        d = r.json()
    items = d.get("data", [])
    usdt = [x for x in items if isinstance(x, dict) and str(x.get("s", "")).endswith("USDT")]
    usdt.sort(key=lambda x: float(x.get("qv", 0) or 0), reverse=True)
    return usdt


@router.get("/trade/market/static")
async def trade_static():
    """Dados estáticos (nome, tags) indexados por símbolo."""
    async with httpx.AsyncClient(timeout=15.0) as cli:
        r = await cli.get(
            f"{BWEB}/bapi/asset/v2/friendly/asset-service/product/get-product-static",
            params={"includeEtf": "true"},
            headers=_WEB_HEADERS,
        )
        d = r.json()
    items = d.get("data", [])
    return {
        x["s"]: {
            "name": x.get("an", ""),
            "base": x.get("b", ""),
            "tags": x.get("tags", []),
        }
        for x in items
        if isinstance(x, dict) and "s" in x
    }
