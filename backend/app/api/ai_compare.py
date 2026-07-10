"""
Comparador Automático por IA — Feature 2.

POST /api/v1/ai/compare
  Body: {
    "ativos": [
      { "ticker": "PETR4", "dados": {...RSAnalisaData...} },
      { "ticker": "VALE3", "dados": {...RSAnalisaData...} }
    ],
    "perfil": "equilibrio"   // dividendos | crescimento | equilibrio
  }
  Response: JSON com veredicto estruturado (vencedor geral, por dimensão, narrativa, etc.)
"""
from __future__ import annotations

import json
import logging

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, field_validator

from ..ai.compare_builder import (
    build_compare_context,
    build_compare_system_prompt,
    build_compare_user_message,
)
from ..ai.provider import get_provider
from ..ai.rate_limiter import get_limiter

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/ai", tags=["AI — Comparador"])

PERFIS_VALIDOS = {"dividendos", "crescimento", "equilibrio"}


class AtivoCompare(BaseModel):
    ticker: str
    dados: dict   # RSAnalisaData serializado


class CompareRequest(BaseModel):
    ativos: list[AtivoCompare]
    perfil: str = "equilibrio"

    @field_validator("ativos")
    @classmethod
    def validar_ativos(cls, v: list[AtivoCompare]) -> list[AtivoCompare]:
        if len(v) < 2:
            raise ValueError("Informe pelo menos 2 ativos para comparar.")
        if len(v) > 4:
            raise ValueError("Máximo de 4 ativos por comparação.")
        return v

    @field_validator("perfil")
    @classmethod
    def validar_perfil(cls, v: str) -> str:
        if v not in PERFIS_VALIDOS:
            raise ValueError(f"Perfil inválido. Use: {', '.join(PERFIS_VALIDOS)}")
        return v


class VencedoresDimensoes(BaseModel):
    lucros:       str
    crescimento:  str
    saude:        str
    valuation:    str
    dividendos:   str
    governanca:   str
    momentum:     str
    eficiencia:   str


class ComparativoResult(BaseModel):
    tickers:                    list[str]
    perfil:                     str
    vencedor_geral:             str
    vencedores_dimensoes:       VencedoresDimensoes
    narrativa:                  str
    recomendacao_dividendos:    str
    recomendacao_crescimento:   str
    recomendacao_equilibrio:    str
    scores_por_ticker:          dict[str, dict]   # {ticker: {score_total, lucros, ...}}
    aviso:                      str


def _extrair_scores(ativos: list[AtivoCompare]) -> dict[str, dict]:
    """Extrai os RS Scores de cada ativo para exibição no frontend."""
    result: dict[str, dict] = {}
    for ativo in ativos:
        score = ativo.dados.get("score") or {}
        result[ativo.ticker] = {
            "score_total":  score.get("score_total"),
            "nota_geral":   score.get("nota_geral"),
            "lucros":       score.get("lucros"),
            "crescimento":  score.get("crescimento"),
            "saude":        score.get("saude"),
            "valuation_pts": score.get("valuation_pts"),
            "dividendos":   score.get("dividendos"),
            "governanca":   score.get("governanca"),
            "momentum":     score.get("momentum"),
            "eficiencia":   score.get("eficiencia"),
        }
    return result


@router.post("/compare", summary="Comparador Automático por IA", response_model=ComparativoResult)
async def comparar_ativos(body: CompareRequest, request: Request) -> ComparativoResult:
    """
    Compara 2–4 ativos usando RS Score + valuation e gera veredicto com LLM.
    - Recebe RSAnalisaData de cada ativo (o frontend já os buscou).
    - Monta contexto comparativo e chama LLM com JSON mode.
    - Rate limit compartilhado com o chat (15 req/min por IP).
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

    # ── Provider ───────────────────────────────────────────────────────────────
    provider = get_provider()
    if provider is None:
        raise HTTPException(
            503,
            detail={
                "modo": "static",
                "mensagem": "OPENAI_API_KEY não configurada. Configure em backend/.env.",
            },
        )

    tickers = [a.ticker.upper() for a in body.ativos]
    ativos_data = [a.dados for a in body.ativos]

    # ── Montar contexto ────────────────────────────────────────────────────────
    try:
        contexto = build_compare_context(ativos_data)
    except Exception as exc:
        logger.error("Erro ao montar contexto de comparação %s: %s", tickers, exc)
        raise HTTPException(500, detail="Erro ao processar dados dos ativos.") from exc

    system_prompt = build_compare_system_prompt(body.perfil)
    user_msg = build_compare_user_message(tickers, body.perfil)
    full_user = f"{contexto}\n\n{user_msg}"

    # ── Chamar LLM (JSON mode, não-streaming) ─────────────────────────────────
    try:
        raw_json = await provider.chat_json(
            system=system_prompt,
            user_message=full_user,
            max_tokens=1800,
            temperature=0.1,
        )
    except Exception as exc:
        logger.error("Erro na chamada LLM para comparação %s: %s", tickers, exc)
        raise HTTPException(502, detail="Erro ao comunicar com o modelo de IA.") from exc

    # ── Parsear resposta ───────────────────────────────────────────────────────
    try:
        parsed = json.loads(raw_json)
    except json.JSONDecodeError as exc:
        logger.error("LLM retornou JSON inválido para %s: %s", tickers, raw_json[:200])
        raise HTTPException(502, detail="Modelo retornou resposta inválida.") from exc

    dimensoes_raw = parsed.get("vencedores_dimensoes") or {}
    dimensoes = VencedoresDimensoes(
        lucros=       dimensoes_raw.get("lucros",      "N/D"),
        crescimento=  dimensoes_raw.get("crescimento", "N/D"),
        saude=        dimensoes_raw.get("saude",       "N/D"),
        valuation=    dimensoes_raw.get("valuation",   "N/D"),
        dividendos=   dimensoes_raw.get("dividendos",  "N/D"),
        governanca=   dimensoes_raw.get("governanca",  "N/D"),
        momentum=     dimensoes_raw.get("momentum",    "N/D"),
        eficiencia=   dimensoes_raw.get("eficiencia",  "N/D"),
    )

    return ComparativoResult(
        tickers=tickers,
        perfil=body.perfil,
        vencedor_geral=            parsed.get("vencedor_geral",            tickers[0]),
        vencedores_dimensoes=      dimensoes,
        narrativa=                 parsed.get("narrativa",                 "Análise indisponível."),
        recomendacao_dividendos=   parsed.get("recomendacao_dividendos",   ""),
        recomendacao_crescimento=  parsed.get("recomendacao_crescimento",  ""),
        recomendacao_equilibrio=   parsed.get("recomendacao_equilibrio",   ""),
        scores_por_ticker=         _extrair_scores(body.ativos),
        aviso=                     parsed.get("aviso", "Não constitui recomendação de investimento."),
    )
