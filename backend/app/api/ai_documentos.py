"""
Resumo Inteligente de Documentos CVM/B3 — Feature 4.

POST /api/v1/ai/documentos/{ticker}
  Body: { "empresa": "Petrobras", "dados_ativo": {...RSAnalisaData...} (opcional) }
  Response: lista de documentos recentes com resumo IA + sentimento + tópicos

GET /api/v1/ai/documentos/{ticker}/listar
  Query params: empresa (obrigatório), anos (default 2), limite (default 10)
  Response: lista de DocumentoCVM sem resumo IA (mais rápido)
"""
from __future__ import annotations

import asyncio
import json
import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel

from ..ai.document_summarizer import (
    build_docs_context,
    build_docs_system_prompt,
    build_docs_user_message,
)
from ..ai.provider import get_provider
from ..ai.rate_limiter import get_limiter
from ..data.cvm_ipe import buscar_documentos_ipe, tentar_extrair_conteudo

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/ai", tags=["AI — Documentos CVM"])


# ── Modelos ────────────────────────────────────────────────────────────────────

class DocumentosRequest(BaseModel):
    empresa:     str
    dados_ativo: Optional[dict] = None   # RSAnalisaData completo (opcional)
    limite:      int = 10
    anos:        int = 2
    com_resumo:  bool = True   # False = só lista, sem chamar LLM


class DocumentoCVM(BaseModel):
    id_doc:           str
    ticker:           str
    categoria:        str
    tipo:             str
    descricao:        str
    data_recebimento: str
    data_referencia:  str
    link:             Optional[str] = None
    empresa:          str
    # Preenchido pela IA (None se ia_disponivel=False ou com_resumo=False)
    resumo_executivo: Optional[str] = None
    sentimento:       Optional[str] = None   # positivo | neutro | negativo
    topicos:          list[str] = []
    impacto_esperado: Optional[str] = None


class DocumentosResult(BaseModel):
    ticker:         str
    empresa:        str
    total:          int
    documentos:     list[DocumentoCVM]
    ia_disponivel:  bool
    aviso:          str


# ── Helpers ────────────────────────────────────────────────────────────────────

async def _enriquecer_com_conteudo(docs: list[dict], max_conc: int = 3) -> None:
    """Tenta extrair conteúdo HTML dos primeiros max_conc docs (em paralelo)."""
    alvos = [d for d in docs if d.get("link")][:max_conc]
    if not alvos:
        return
    resultados = await asyncio.gather(
        *[tentar_extrair_conteudo(d["link"]) for d in alvos],
        return_exceptions=True,
    )
    for doc, res in zip(alvos, resultados):
        if isinstance(res, str) and res:
            doc["conteudo_extraido"] = res


def _parsear_resumos_ia(raw_json: str, docs: list[dict]) -> dict[str, dict]:
    """
    Parseia resposta JSON do LLM e retorna um dict { id_doc → campos IA }.
    Robusto a IDs numéricos na resposta.
    """
    try:
        parsed = json.loads(raw_json)
        resumos_list = parsed.get("resumos") or []
    except json.JSONDecodeError:
        return {}

    resultado: dict[str, dict] = {}
    for i, item in enumerate(resumos_list):
        # Tenta casar pelo id_doc ou por posição
        id_doc = str(item.get("id_doc", ""))
        if not id_doc and i < len(docs):
            id_doc = docs[i].get("id_doc", "")
        resultado[id_doc] = {
            "resumo_executivo": item.get("resumo_executivo", ""),
            "sentimento":       item.get("sentimento", "neutro"),
            "topicos":          item.get("topicos", []),
            "impacto_esperado": item.get("impacto_esperado", ""),
        }
    return resultado


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post(
    "/documentos/{ticker}",
    summary="Documentos CVM recentes + resumo por IA",
    response_model=DocumentosResult,
)
async def documentos_com_resumo(
    ticker: str,
    body: DocumentosRequest,
    request: Request,
) -> DocumentosResult:
    """
    Busca os N documentos IPE mais recentes de um ativo e gera resumo executivo
    com sentimento via LLM.

    - Sem OPENAI_API_KEY: retorna os documentos sem resumo IA.
    - Tenta extrair conteúdo HTML dos primeiros 3 documentos para enriquecer o resumo.
    """
    # ── Rate limit ─────────────────────────────────────────────────────────────
    ip = request.client.host if request.client else "unknown"
    if not get_limiter().verificar(ip):
        restante = get_limiter().tempo_restante(ip)
        raise HTTPException(429, detail=f"Limite de requisições. Aguarde {restante}s.")

    ticker_upper = ticker.upper()
    aviso = "Esta análise é automática e não constitui recomendação de investimento."

    # ── Buscar documentos da CVM ───────────────────────────────────────────────
    try:
        docs_raw = await buscar_documentos_ipe(
            nome_empresa=body.empresa,
            ticker=ticker_upper,
            anos=min(body.anos, 3),
            limite=min(body.limite, 20),
        )
    except Exception as exc:
        logger.error("Erro ao buscar IPE para %s: %s", ticker_upper, exc)
        raise HTTPException(502, detail="Erro ao acessar dados CVM.") from exc

    if not docs_raw:
        return DocumentosResult(
            ticker=ticker_upper,
            empresa=body.empresa,
            total=0,
            documentos=[],
            ia_disponivel=False,
            aviso="Nenhum documento encontrado para este ticker nos últimos 2 anos.",
        )

    # ── Tentar extrair conteúdo HTML (melhora o resumo) ───────────────────────
    await _enriquecer_com_conteudo(docs_raw, max_conc=3)

    # ── Gerar resumo com IA ────────────────────────────────────────────────────
    provider = get_provider()
    ia_disponivel = provider is not None
    resumos_ia: dict[str, dict] = {}

    if ia_disponivel and body.com_resumo:
        try:
            contexto = build_docs_context(docs_raw, body.dados_ativo)
            system   = build_docs_system_prompt(body.empresa)
            user_msg = build_docs_user_message(contexto)

            raw_json = await provider.chat_json(
                system=system,
                user_message=user_msg,
                max_tokens=2000,
                temperature=0.1,
            )
            resumos_ia = _parsear_resumos_ia(raw_json, docs_raw)
        except Exception as exc:
            logger.error("Erro na IA para documentos %s: %s", ticker_upper, exc)
            ia_disponivel = False

    # ── Montar resposta ────────────────────────────────────────────────────────
    docs_out: list[DocumentoCVM] = []
    for doc in docs_raw:
        id_doc = doc.get("id_doc", "")
        ia = resumos_ia.get(id_doc, {})
        docs_out.append(DocumentoCVM(
            id_doc=           id_doc,
            ticker=           ticker_upper,
            categoria=        doc.get("categoria", ""),
            tipo=             doc.get("tipo", ""),
            descricao=        doc.get("descricao", ""),
            data_recebimento= doc.get("data_recebimento", ""),
            data_referencia=  doc.get("data_referencia", ""),
            link=             doc.get("link"),
            empresa=          doc.get("empresa", body.empresa),
            resumo_executivo= ia.get("resumo_executivo"),
            sentimento=       ia.get("sentimento"),
            topicos=          ia.get("topicos", []),
            impacto_esperado= ia.get("impacto_esperado"),
        ))

    return DocumentosResult(
        ticker=ticker_upper,
        empresa=body.empresa,
        total=len(docs_out),
        documentos=docs_out,
        ia_disponivel=ia_disponivel,
        aviso=aviso,
    )


@router.get(
    "/documentos/{ticker}/listar",
    summary="Lista documentos CVM sem resumo IA (rápido)",
)
async def listar_documentos(
    ticker: str,
    empresa: str = Query(..., description="Nome da empresa para busca na CVM"),
    anos:    int = Query(2, ge=1, le=3),
    limite:  int = Query(10, ge=1, le=30),
) -> dict:
    """Versão rápida: só busca a lista de documentos sem chamar LLM."""
    ticker_upper = ticker.upper()
    try:
        docs = await buscar_documentos_ipe(
            nome_empresa=empresa,
            ticker=ticker_upper,
            anos=anos,
            limite=limite,
        )
    except Exception as exc:
        logger.error("Erro ao listar docs IPE para %s: %s", ticker_upper, exc)
        raise HTTPException(502, detail="Erro ao acessar dados CVM.") from exc

    return {
        "ticker":      ticker_upper,
        "empresa":     empresa,
        "total":       len(docs),
        "documentos":  docs,
    }
