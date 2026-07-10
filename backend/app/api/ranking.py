"""
Ranking Inteligente — scores algorítmicos para ~25 ações B3.

GET /api/v1/ranking          → ranking completo (cache 30 min)
GET /api/v1/ranking/status   → verifica cache
"""
from __future__ import annotations

import asyncio
import logging
import time
from typing import Optional

from fastapi import APIRouter

from ..data.brapi import BrapiProvider
from ..data.cvm import buscar_fundamentos_cvm
from ..data.ranking_engine import (
    TICKERS_RANKING,
    calcular_scores_empresa,
    construir_ranking,
)
from ..financials.indicators import calcular_demonstrativos
from ..valuation.engine import calcular_valuation

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/ranking", tags=["Ranking Inteligente"])

_provider = BrapiProvider()

_cache_data: Optional[dict] = None
_cache_ts: float = 0.0
_CACHE_TTL = 30 * 60.0

_computing = False


async def _fetch_ticker(ticker: str) -> tuple[str, dict]:
    """Busca dados de um ticker para o ranking (fundamentos + cotação + valuation)."""
    try:
        fund_raw, cotacao = await asyncio.gather(
            buscar_fundamentos_cvm(ticker, ticker),
            _provider.get_cotacao(ticker),
            return_exceptions=False,
        )
    except Exception as e:
        logger.warning("[Ranking] fetch %s falhou: %s", ticker, e)
        return ticker, {}

    fund_d: dict = {}
    val_d: Optional[dict] = None

    if fund_raw and isinstance(fund_raw, dict):
        anos_raw = fund_raw.get("anos") or {}
        try:
            historico = calcular_demonstrativos(anos_raw)
            fund_d = {"historico": [h.model_dump() for h in historico]}

            # Tenta valuation
            if cotacao and historico:
                try:
                    # CAGR para o motor de valuation
                    recs = [h.receita_liquida for h in historico if h.receita_liquida]
                    lucs = [h.lucro_liquido  for h in historico if h.lucro_liquido]
                    cagr_rec = None
                    cagr_luc = None
                    if len(recs) >= 2:
                        n = len(recs) - 1
                        cagr_rec = (recs[-1] / recs[0]) ** (1 / n) - 1 if recs[0] > 0 else None
                    if len(lucs) >= 2 and lucs[0] > 0:
                        n = len(lucs) - 1
                        cagr_luc = (lucs[-1] / lucs[0]) ** (1 / n) - 1

                    val = calcular_valuation(
                        ticker=ticker,
                        preco_atual=cotacao.preco_atual,
                        market_cap=cotacao.market_cap,
                        historico=historico,
                        cagr_receita=cagr_rec,
                        cagr_lucro=cagr_luc,
                    )
                    val_d = val.model_dump() if val else None
                except Exception:
                    pass
        except Exception as e:
            logger.warning("[Ranking] indicadores %s: %s", ticker, e)

    cotacao_d = cotacao.model_dump() if cotacao and hasattr(cotacao, "model_dump") else {}

    return ticker, {"fundamentos": fund_d, "cotacao": cotacao_d, "valuation": val_d}


@router.get("/status")
async def ranking_status() -> dict:
    age = int(time.time() - _cache_ts) if _cache_ts else None
    return {
        "cached":     _cache_data is not None,
        "computing":  _computing,
        "age_s":      age,
        "ttl_s":      int(_CACHE_TTL),
        "tickers":    len(TICKERS_RANKING),
    }


@router.get("")
async def ranking(force: bool = False) -> dict:
    """
    Ranking inteligente completo com scores 0-100 por categoria.
    Cache de 30 minutos. Primeira execução pode demorar ~60s.
    """
    global _cache_data, _cache_ts, _computing

    now = time.time()
    if not force and _cache_data and (now - _cache_ts) < _CACHE_TTL:
        return _cache_data

    _computing = True
    try:
        sem = asyncio.Semaphore(5)

        async def _bounded(t: str):
            async with sem:
                return await _fetch_ticker(t)

        resultados = await asyncio.gather(*[_bounded(t) for t in TICKERS_RANKING])

        scores_all: dict[str, dict] = {}
        for ticker, dados in resultados:
            if dados:
                try:
                    scores_all[ticker] = calcular_scores_empresa(ticker, dados)
                except Exception as e:
                    logger.warning("[Ranking] score %s: %s", ticker, e)

        resultado = construir_ranking(scores_all)
        _cache_data = resultado
        _cache_ts = now
        return resultado

    finally:
        _computing = False
