"""
Analista Particular — endpoint de chat com streaming (Feature 1).

POST /api/v1/ai/chat/{ticker}
  Body: { "mensagens": [...], "dados_ativo": {...RSAnalisaData...} }
  Response: text/event-stream com tokens SSE

Fallback: quando OPENAI_API_KEY não está configurada,
  retorna HTTP 503 com JSON { "modo": "static" } para o frontend
  exibir a análise estática já existente.
"""
from __future__ import annotations

import json
import logging

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from ..ai.context_builder import build_context, build_system_prompt
from ..ai.provider import get_provider
from ..ai.rate_limiter import get_limiter
from ..config import settings

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/ai", tags=["AI — Analista Particular"])


class MensagemChat(BaseModel):
    papel: str       # "usuario" | "assistente"
    conteudo: str


class ChatRequest(BaseModel):
    mensagens: list[MensagemChat]
    dados_ativo: dict   # RSAnalisaData serializado (o frontend já tem)


@router.post("/chat/{ticker}", summary="Analista Particular — streaming")
async def chat_analista(
    ticker: str,
    body: ChatRequest,
    request: Request,
) -> StreamingResponse:
    """
    Endpoint de chat conversacional sobre os dados do ativo.
    - Recebe o histórico de mensagens e o RSAnalisaData do frontend.
    - Monta contexto estruturado e envia ao LLM com streaming SSE.
    - Rate limit: 15 req/min por IP.
    - Sem OPENAI_API_KEY: retorna 503 para o frontend usar fallback estático.
    """
    # ── Rate limit ────────────────────────────────────────────────────────────
    ip = request.client.host if request.client else "unknown"
    limiter = get_limiter()
    if not limiter.verificar(ip):
        restante = limiter.tempo_restante(ip)
        raise HTTPException(
            429,
            detail=f"Limite de {15} perguntas/minuto atingido. Aguarde {restante}s.",
        )

    # ── Verificar provider ────────────────────────────────────────────────────
    provider = get_provider()
    if provider is None:
        raise HTTPException(
            503,
            detail={
                "modo": "static",
                "mensagem": "OPENAI_API_KEY não configurada. Configure em backend/.env.",
            },
        )

    # ── Validar input básico ──────────────────────────────────────────────────
    ticker_upper = ticker.upper()
    if not body.mensagens:
        raise HTTPException(400, detail="Lista de mensagens está vazia.")
    if len(body.mensagens) > 40:
        raise HTTPException(400, detail="Histórico muito longo (máximo 40 mensagens).")
    ultima = body.mensagens[-1]
    if ultima.papel != "usuario":
        raise HTTPException(400, detail="Última mensagem deve ser do usuário.")
    if len(ultima.conteudo) > 1000:
        raise HTTPException(400, detail="Pergunta muito longa (máximo 1000 caracteres).")

    # ── Montar contexto ───────────────────────────────────────────────────────
    dados = body.dados_ativo
    empresa = dados.get("empresa", ticker_upper)
    try:
        contexto = build_context(dados)
    except Exception as exc:
        logger.error("Erro ao montar contexto para %s: %s", ticker_upper, exc)
        raise HTTPException(500, detail="Erro ao processar dados do ativo.") from exc

    system_prompt = build_system_prompt(empresa, ticker_upper, contexto)
    mensagens = [m.model_dump() for m in body.mensagens]

    # ── Streaming SSE ─────────────────────────────────────────────────────────
    async def gerador():
        try:
            async for token in provider.stream_chat(
                system=system_prompt,
                messages=mensagens,
                max_tokens=900,
                temperature=0.2,
            ):
                payload = json.dumps({"tipo": "token", "conteudo": token}, ensure_ascii=False)
                yield f"data: {payload}\n\n"

            yield "data: [DONE]\n\n"

        except Exception as exc:
            logger.error("Erro no stream de chat para %s: %s", ticker_upper, exc)
            erro = json.dumps({"tipo": "erro", "mensagem": "Erro ao gerar resposta. Tente novamente."})
            yield f"data: {erro}\n\n"
            yield "data: [DONE]\n\n"

    return StreamingResponse(
        gerador(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",   # desativa buffer do nginx em prod
        },
    )


@router.get("/chat/status", summary="Verifica se o Analista Particular está disponível")
async def chat_status() -> dict:
    """Retorna se a chave OpenAI está configurada."""
    provider = get_provider()
    return {
        "disponivel": provider is not None,
        "modo": "openai" if provider is not None else "static",
        "modelo": settings.openai_model if provider else None,
    }
