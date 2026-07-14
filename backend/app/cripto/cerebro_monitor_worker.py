"""
Cerebro Monitor Worker — verifica preço atual de todos os sinais abertos
e fecha automaticamente quando TP ou SL é atingido.
Roda a cada 60s em background (asyncio task).
"""
from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import Any

import httpx

from ..db.mysql import cerebro_list, cerebro_update_outcome


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


async def _fetch_prices(symbols: list[str]) -> dict[str, float]:
    """Busca preços atuais no Binance para múltiplos símbolos."""
    prices: dict[str, float] = {}
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            if len(symbols) == 1:
                r = await client.get(
                    "https://api.binance.com/api/v3/ticker/price",
                    params={"symbol": symbols[0]},
                )
                if r.status_code == 200:
                    prices[symbols[0]] = float(r.json()["price"])
            else:
                import json
                r = await client.get(
                    "https://api.binance.com/api/v3/ticker/price",
                    params={"symbols": json.dumps(symbols)},
                )
                if r.status_code == 200:
                    for item in r.json():
                        prices[item["symbol"]] = float(item["price"])
    except Exception as e:
        print(f"[cerebro monitor] erro ao buscar preços: {e}")
    return prices


def _check_outcome(
    sig: dict[str, Any],
    current_price: float,
) -> tuple[str, float] | None:
    """
    Retorna ("tp", pnl_pct) ou ("sl", pnl_pct) se atingiu o nível.
    Retorna None se ainda está em aberto.
    """
    entry = sig.get("price_entrada")
    if not entry or entry <= 0:
        return None

    tp_pct = sig.get("tp_pct") or 2.0
    sl_pct = sig.get("sl_pct") or 1.0
    is_long = str(sig.get("direction", "LONG")).upper() == "LONG"

    tp_price = entry * (1 + tp_pct / 100)
    sl_price = entry * (1 - sl_pct / 100)

    if is_long:
        if current_price >= tp_price:
            return ("tp", +tp_pct)
        if current_price <= sl_price:
            return ("sl", -sl_pct)
    else:  # SHORT
        if current_price <= tp_price:
            return ("tp", +tp_pct)
        if current_price >= sl_price:
            return ("sl", -sl_pct)

    return None


async def _check_and_close(signals: list[dict[str, Any]]) -> int:
    """Processa lista de sinais abertos e fecha os que atingiram TP/SL."""
    # filtra só os que têm preço de entrada
    active = [s for s in signals if s.get("price_entrada") and s.get("status") == "aprovado"]
    if not active:
        return 0

    # busca preços únicos
    symbols = list({s["simbolo"] for s in active})
    prices  = await _fetch_prices(symbols)

    closed = 0
    for sig in active:
        price = prices.get(sig["simbolo"])
        if price is None:
            continue

        result = _check_outcome(sig, price)
        if result is None:
            continue

        status, pnl_pct = result
        try:
            await cerebro_update_outcome(
                signal_id=sig["id"],
                status=status,
                pnl_pct=round(pnl_pct, 4),
                fechado_em=_now_iso(),
            )
            closed += 1
            sym = sig["simbolo"].replace("USDT", "")
            direction = sig.get("direction", "?").upper()
            label = "🟢 TP" if status == "tp" else "🔴 SL"
            print(f"[cerebro monitor] {sym} {direction} → {label} ({pnl_pct:+.2f}%) @ {price:.4f}")
        except Exception as e:
            print(f"[cerebro monitor] erro ao fechar {sig.get('id')}: {e}")

    return closed


async def cerebro_monitor_loop() -> None:
    """Loop principal — roda indefinidamente, verificando a cada 60s."""
    print("[cerebro monitor] worker iniciado")
    # Aguarda 10s para o sistema inicializar
    await asyncio.sleep(10)

    while True:
        try:
            signals = await cerebro_list(limit=500, status="aprovado")
            if signals:
                closed = await _check_and_close(signals)
                if closed:
                    print(f"[cerebro monitor] {closed} sinal(is) fechado(s) nesta rodada")
        except Exception as e:
            print(f"[cerebro monitor] erro no loop: {e}")

        await asyncio.sleep(60)  # verifica a cada 60 segundos
