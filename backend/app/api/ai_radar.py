"""
Radar de Anomalias — Feature 3.

POST /api/v1/ai/radar/{ticker}
  Body: { "dados_ativo": {...RSAnalisaData...} }
  Response: JSON com sinais detectados + narrativa da IA
"""
from __future__ import annotations

import json
import logging

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from ..ai.anomaly_detector import detectar_anomalias
from ..ai.provider import get_provider
from ..ai.radar_builder import (
    build_radar_context,
    build_radar_system_prompt,
    build_radar_user_message,
)
from ..ai.rate_limiter import get_limiter

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/ai", tags=["AI — Radar de Anomalias"])


class RadarRequest(BaseModel):
    dados_ativo: dict   # RSAnalisaData serializado


class SinalRadar(BaseModel):
    indicador:       str
    nome:            str
    valor_atual:     float | None
    ano_atual:       int | None
    media_historica: float | None
    desvio_padrao:   float | None
    z_score:         float | None
    severidade:      str      # critico | atencao | info
    tipo:            str      # positivo | negativo
    contexto:        str
    melhor_quando:   str
    historico_serie: list[dict]   # [{ano, valor}]


class RadarResult(BaseModel):
    ticker:                      str
    empresa:                     str
    total_sinais:                int
    total_criticos:              int
    total_atencao:               int
    total_info:                  int
    sinais:                      list[SinalRadar]
    resumo_geral:                str
    narrativa_detalhada:         str
    principais_riscos:           list[str]
    pontos_positivos:            list[str]
    recomendacao_acompanhamento: str
    aviso:                       str
    ia_disponivel:               bool


@router.post(
    "/radar/{ticker}",
    summary="Radar de Anomalias — z-scores + narrativa IA",
    response_model=RadarResult,
)
async def radar_anomalias(
    ticker: str,
    body: RadarRequest,
    request: Request,
) -> RadarResult:
    """
    Detecta anomalias estatísticas nos indicadores financeiros do ativo.
    - Calcula z-scores vs. série histórica do próprio ativo (sem banco).
    - Rate limit compartilhado (15 req/min por IP).
    - Funciona sem OPENAI_API_KEY: retorna sinais sem narrativa (ia_disponivel=False).
    """
    # ── Rate limit ─────────────────────────────────────────────────────────────
    ip = request.client.host if request.client else "unknown"
    limiter = get_limiter()
    if not limiter.verificar(ip):
        restante = limiter.tempo_restante(ip)
        raise HTTPException(
            429,
            detail=f"Limite de requisições atingido. Aguarde {restante}s.",
        )

    ticker_upper = ticker.upper()
    dados = body.dados_ativo
    empresa = dados.get("empresa", ticker_upper)
    is_fii = dados.get("is_fii", False)

    # FII não tem histórico CVM comparável
    if is_fii:
        return RadarResult(
            ticker=ticker_upper,
            empresa=empresa,
            total_sinais=0,
            total_criticos=0,
            total_atencao=0,
            total_info=0,
            sinais=[],
            resumo_geral="FIIs não possuem histórico de demonstrações CVM equivalente às ações. Análise de anomalias não aplicável.",
            narrativa_detalhada="",
            principais_riscos=[],
            pontos_positivos=[],
            recomendacao_acompanhamento="Acompanhe o relatório mensal de rendimentos e a taxa de vacância.",
            aviso="Esta análise é automática e não constitui recomendação de investimento.",
            ia_disponivel=False,
        )

    # ── Detectar anomalias (puro Python, sem LLM) ─────────────────────────────
    try:
        sinais_raw = detectar_anomalias(dados)
    except Exception as exc:
        logger.error("Erro ao detectar anomalias para %s: %s", ticker_upper, exc)
        raise HTTPException(500, detail="Erro ao processar dados do ativo.") from exc

    sinais = [SinalRadar(**s) for s in sinais_raw]
    criticos = [s for s in sinais if s.severidade == "critico"]
    atencao  = [s for s in sinais if s.severidade == "atencao"]
    info     = [s for s in sinais if s.severidade == "info"]

    # ── Narrativa IA (opcional — se não tiver chave, retorna sem narrativa) ───
    provider = get_provider()
    ia_disponivel = provider is not None

    resumo_geral = ""
    narrativa_detalhada = ""
    principais_riscos: list[str] = []
    pontos_positivos: list[str] = []
    recomendacao = ""
    aviso = "Esta análise é automática e não constitui recomendação de investimento."

    if not sinais:
        resumo_geral = "Nenhuma anomalia detectada. Todos os indicadores dentro dos parâmetros históricos normais."
    elif not ia_disponivel:
        resumo_geral = (
            f"{len(sinais)} sinal(is) detectado(s): "
            f"{len(criticos)} crítico(s), {len(atencao)} atenção. "
            "Configure OPENAI_API_KEY para gerar a narrativa automática."
        )
    else:
        contexto = build_radar_context(ticker_upper, empresa, sinais_raw, dados)
        system_prompt = build_radar_system_prompt()
        user_msg = build_radar_user_message(ticker_upper, contexto)

        try:
            raw_json = await provider.chat_json(
                system=system_prompt,
                user_message=user_msg,
                max_tokens=1200,
                temperature=0.15,
            )
            parsed = json.loads(raw_json)
            resumo_geral            = parsed.get("resumo_geral", "")
            narrativa_detalhada     = parsed.get("narrativa_detalhada", "")
            principais_riscos       = parsed.get("principais_riscos", [])
            pontos_positivos        = parsed.get("pontos_positivos", [])
            recomendacao            = parsed.get("recomendacao_acompanhamento", "")
            aviso                   = parsed.get("aviso", aviso)
        except Exception as exc:
            logger.error("Erro na narrativa IA para radar %s: %s", ticker_upper, exc)
            resumo_geral = (
                f"{len(sinais)} sinal(is) detectado(s). "
                "Narrativa indisponível temporariamente."
            )

    return RadarResult(
        ticker=ticker_upper,
        empresa=empresa,
        total_sinais=len(sinais),
        total_criticos=len(criticos),
        total_atencao=len(atencao),
        total_info=len(info),
        sinais=sinais,
        resumo_geral=resumo_geral,
        narrativa_detalhada=narrativa_detalhada,
        principais_riscos=principais_riscos,
        pontos_positivos=pontos_positivos,
        recomendacao_acompanhamento=recomendacao,
        aviso=aviso,
        ia_disponivel=ia_disponivel,
    )
