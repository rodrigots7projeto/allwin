"""
CEREBRO API — Central Intelligence para seleção e rastreamento de entradas.
POST /cerebro/signal          → salva decisão do CEREBRO
GET  /cerebro/signals         → histórico
PATCH /cerebro/signal/{id}    → atualiza resultado (outcome)
POST /cerebro/telegram        → proxy para enviar mensagem no Telegram
"""
from __future__ import annotations

from typing import Any, Optional
import httpx

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..db.mysql import cerebro_upsert, cerebro_update_outcome, cerebro_list, purge_scan_history

router = APIRouter(tags=["cerebro"])


class CerebroSignalIn(BaseModel):
    id: str
    simbolo: str
    direction: str
    source: str
    source_perfil: Optional[str] = None
    score_final: Optional[float] = None
    score_tecnico: Optional[float] = None
    score_fluxo: Optional[float] = None
    score_contexto: Optional[float] = None
    score_fundamental: Optional[float] = None
    price_entrada: Optional[float] = None
    tp_pct: Optional[float] = None
    sl_pct: Optional[float] = None
    confianca: float
    aprovado: bool
    motivo: Optional[str] = None
    status: str = "aprovado"
    pnl_pct: Optional[float] = None
    telegram_entry: bool = False
    telegram_exit: bool = False
    registrado_em: Optional[str] = None
    fechado_em: Optional[str] = None


class OutcomeIn(BaseModel):
    status: str           # "tp" | "sl"
    pnl_pct: Optional[float] = None
    fechado_em: str
    telegram_exit: bool = False


class TelegramIn(BaseModel):
    bot_token: str
    chat_id: str
    text: str
    parse_mode: str = "HTML"


@router.post("/cerebro/signal")
async def save_signal(data: CerebroSignalIn):
    await cerebro_upsert(data.dict())
    return {"ok": True}


@router.patch("/cerebro/signal/{signal_id}")
async def update_outcome(signal_id: str, data: OutcomeIn):
    await cerebro_update_outcome(
        signal_id=signal_id,
        status=data.status,
        pnl_pct=data.pnl_pct,
        fechado_em=data.fechado_em,
        telegram_exit=data.telegram_exit,
    )
    return {"ok": True}


@router.get("/cerebro/signals")
async def get_signals(limit: int = 300, status: Optional[str] = None):
    return await cerebro_list(limit=limit, status=status)


@router.post("/cerebro/telegram")
async def send_telegram(data: TelegramIn):
    """Proxy seguro para envio de mensagem no Telegram.
    O bot token fica no frontend (localStorage) e é enviado por request —
    nunca fica hardcoded no servidor.
    """
    url = f"https://api.telegram.org/bot{data.bot_token}/sendMessage"
    payload = {
        "chat_id": data.chat_id,
        "text": data.text,
        "parse_mode": data.parse_mode,
    }
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.post(url, json=payload)
            resp = r.json()
            if not resp.get("ok"):
                raise HTTPException(400, f"Telegram erro: {resp.get('description', 'unknown')}")
            return {"ok": True, "message_id": resp["result"]["message_id"]}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Falha ao enviar Telegram: {e}")


@router.post("/cerebro/maintenance/purge-scan-history")
async def purge_history(days: int = 7):
    """Remove registros antigos de ft_scan_history (mantém N dias)."""
    deleted = await purge_scan_history(days_to_keep=days)
    return {"ok": True, "deleted": deleted, "kept_days": days}
