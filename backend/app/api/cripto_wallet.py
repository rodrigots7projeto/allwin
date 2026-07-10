"""
Wallet API — carteiras simuladas (futures + daytrade) persistidas no MySQL.
GET  /cripto/wallets/{tipo}                → todas as carteiras
GET  /cripto/wallets/{tipo}/trades         → histórico de trades
POST /cripto/wallets/{tipo}/sync           → frontend envia estado atual para salvar
POST /cripto/wallets/{tipo}/trade          → registra um trade individual
DELETE /cripto/wallets/{tipo}/{perfil_id}  → zera uma carteira
"""
from __future__ import annotations

import time
from typing import Any, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..db.mysql import (
    trade_insert,
    trades_list,
    wallet_load_all,
    wallet_reset,
    wallet_upsert,
)

router = APIRouter(tags=["wallet — simuladas"])

VALID_TIPOS = {"futures", "daytrade"}


def _check_tipo(tipo: str) -> None:
    if tipo not in VALID_TIPOS:
        raise HTTPException(400, f"tipo deve ser 'futures' ou 'daytrade'")


# ── Models ────────────────────────────────────────────────────────────────────

class TradeIn(BaseModel):
    id:              str
    perfil_id:       str
    simbolo:         str
    tipo:            str       # "C" ou "V"
    direction:       str
    price_brl:       float
    amount_brl:      float
    fee:             Optional[float] = 0
    pnl_brl:         Optional[float] = None
    pct:             Optional[float] = None
    score:           Optional[float] = None
    auto:            bool = True
    grade:           Optional[str]   = None
    motivo_entrada:  Optional[str]   = None
    motivo_saida:    Optional[str]   = None
    time:            Optional[int]   = None


class WalletSyncIn(BaseModel):
    perfil_id:    str
    saldo_inicial: float
    saldo_livre:  float
    positions:    dict[str, Any] = {}
    trades:       list[dict[str, Any]] = []


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/cripto/wallets/{tipo}")
async def get_wallets(tipo: str):
    """Retorna todas as carteiras do tipo, com trades."""
    _check_tipo(tipo)
    wallets = await wallet_load_all(tipo)
    all_trades = await trades_list(tipo=tipo, limit=2000)

    # Agrupar trades por perfil_id
    trades_by_perfil: dict[str, list] = {}
    for t in all_trades:
        pid = t.get("perfil_id", "")
        trades_by_perfil.setdefault(pid, []).append(t)

    # Montar resposta no formato que o frontend espera
    result: dict[str, dict] = {}
    for pid, w in wallets.items():
        result[pid] = {
            "saldo_inicial": w["saldo_inicial"],
            "saldo_livre":   w["saldo_livre"],
            "positions":     w["positions"],
            "trades":        trades_by_perfil.get(pid, []),
            "criado":        "",
        }
    return result


@router.get("/cripto/wallets/{tipo}/trades")
async def get_trades(tipo: str, perfil_id: Optional[str] = None, limit: int = 500):
    """Lista trades salvos, opcionalmente filtrado por perfil_id."""
    _check_tipo(tipo)
    return await trades_list(perfil_id=perfil_id, tipo=tipo, limit=limit)


@router.post("/cripto/wallets/{tipo}/trade")
async def post_trade(tipo: str, trade: TradeIn):
    """Registra um único trade vindo do frontend."""
    _check_tipo(tipo)
    d = trade.dict()
    if not d.get("time"):
        d["time"] = int(time.time() * 1000)
    await trade_insert(d, tipo)
    return {"ok": True}


@router.post("/cripto/wallets/{tipo}/sync")
async def sync_wallet(tipo: str, payload: WalletSyncIn):
    """
    Sincroniza o estado completo de uma carteira vindo do frontend.
    Salva saldo + positions no MySQL e insere trades que ainda não existam.
    """
    _check_tipo(tipo)
    await wallet_upsert(
        payload.perfil_id,
        tipo,
        payload.saldo_inicial,
        payload.saldo_livre,
        payload.positions,
    )
    for t in payload.trades:
        t["perfil_id"] = payload.perfil_id
        if not t.get("time"):
            t["time"] = int(time.time() * 1000)
        await trade_insert(t, tipo)
    return {"ok": True, "trades_synced": len(payload.trades)}


@router.post("/cripto/wallets/{tipo}/sync_all")
async def sync_all_wallets(tipo: str, payload: dict):
    """
    Sincroniza TODAS as carteiras de uma vez.
    payload = { perfil_id: { saldo_inicial, saldo_livre, positions, trades[] } }
    """
    _check_tipo(tipo)
    saved = 0
    for pid, w in payload.items():
        await wallet_upsert(pid, tipo, w.get("saldo_inicial", 100000), w.get("saldo_livre", 100000), w.get("positions", {}))
        for t in w.get("trades", []):
            t["perfil_id"] = pid
            await trade_insert(t, tipo)
            saved += 1
    return {"ok": True, "wallets": len(payload), "trades": saved}


@router.delete("/cripto/wallets/{tipo}/{perfil_id}")
async def reset_wallet(tipo: str, perfil_id: str, saldo_inicial: float = 100000):
    """Zera uma carteira — volta ao saldo inicial, positions vazias."""
    _check_tipo(tipo)
    await wallet_reset(perfil_id, tipo, saldo_inicial)
    return {"ok": True, "perfil_id": perfil_id}


@router.get("/cripto/wallets/{tipo}/summary")
async def wallet_summary(tipo: str):
    """Resumo agregado de todas as carteiras."""
    _check_tipo(tipo)
    wallets = await wallet_load_all(tipo)
    all_trades = await trades_list(tipo=tipo, limit=5000)

    total_capital = sum(w["saldo_livre"] for w in wallets.values())
    total_inicial = sum(w["saldo_inicial"] for w in wallets.values())
    vendas = [t for t in all_trades if t.get("tipo") == "V"]
    wins   = [t for t in vendas if (t.get("pnl_brl") or 0) > 0]
    total_pnl = sum((t.get("pnl_brl") or 0) for t in vendas)

    return {
        "total_capital":   total_capital,
        "total_inicial":   total_inicial,
        "total_pnl":       total_pnl,
        "total_ops":       len(vendas),
        "wins":            len(wins),
        "win_rate":        (len(wins) / len(vendas) * 100) if vendas else 0,
        "carteiras":       len(wallets),
        "tipo":            tipo,
    }
