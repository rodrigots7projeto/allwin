"""
Testes do Resumo Inteligente de Documentos (Feature 4).

Rodar: cd backend && uv run pytest tests/test_ai_documentos.py -v
"""
from __future__ import annotations

import json
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.main import app

# ── Fixtures ──────────────────────────────────────────────────────────────────

DOCS_FAKE = [
    {
        "id_doc": "DOC001",
        "ticker": "PETR4",
        "cd_cvm": "009512",
        "categoria": "Fato Relevante",
        "tipo": "Comunicado",
        "descricao": "Aprovação de dividendos extraordinários",
        "data_recebimento": "2024-03-15",
        "data_referencia": "2024-03-15",
        "link": None,
        "empresa": "PETRÓLEO BRASILEIRO S.A. PETROBRAS",
    },
    {
        "id_doc": "DOC002",
        "ticker": "PETR4",
        "cd_cvm": "009512",
        "categoria": "ITR",
        "tipo": "Trimestral",
        "descricao": "Informações Trimestrais 4T23",
        "data_recebimento": "2024-02-01",
        "data_referencia": "2023-12-31",
        "link": None,
        "empresa": "PETRÓLEO BRASILEIRO S.A. PETROBRAS",
    },
]

BODY_VALIDO = {
    "empresa": "Petrobras",
    "dados_ativo": None,
    "limite": 5,
    "anos": 1,
    "com_resumo": True,
}

FAKE_IA_RESP = json.dumps({
    "resumos": [
        {
            "id_doc": "DOC001",
            "resumo_executivo": "Petrobras anunciou dividendos extraordinários no valor de R$ 1,50/ação.",
            "sentimento": "positivo",
            "topicos": ["dividendos", "proventos"],
            "impacto_esperado": "Positivo para cotação no curto prazo.",
        },
        {
            "id_doc": "DOC002",
            "resumo_executivo": "Resultado trimestral sólido com margem estável.",
            "sentimento": "neutro",
            "topicos": ["resultado", "ITR"],
            "impacto_esperado": "Neutro — dentro das expectativas.",
        },
    ]
})


class FakeProvider:
    disponivel = True

    async def chat_json(self, system: str, user_message: str, **_) -> str:
        return FAKE_IA_RESP

    async def stream_chat(self, *_, **__):
        return
        yield


# ── Testes ────────────────────────────────────────────────────────────────────

class TestDocumentosEndpoint:
    def test_sem_docs_retorna_vazio(self):
        with patch("app.api.ai_documentos.buscar_documentos_ipe", return_value=[]):
            with TestClient(app) as client:
                resp = client.post("/api/v1/ai/documentos/PETR4", json=BODY_VALIDO)
        assert resp.status_code == 200
        assert resp.json()["total"] == 0

    def test_docs_sem_ia_retorna_lista(self):
        with patch("app.api.ai_documentos.buscar_documentos_ipe", return_value=DOCS_FAKE):
            with patch("app.api.ai_documentos.get_provider", return_value=None):
                with patch("app.api.ai_documentos._enriquecer_com_conteudo", return_value=None):
                    with TestClient(app) as client:
                        resp = client.post("/api/v1/ai/documentos/PETR4", json=BODY_VALIDO)
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 2
        assert data["ia_disponivel"] is False
        # Sem IA: sem resumo
        assert data["documentos"][0]["resumo_executivo"] is None

    def test_docs_com_ia_retorna_resumos(self):
        with patch("app.api.ai_documentos.buscar_documentos_ipe", return_value=DOCS_FAKE):
            with patch("app.api.ai_documentos.get_provider", return_value=FakeProvider()):
                with patch("app.api.ai_documentos._enriquecer_com_conteudo", return_value=None):
                    with TestClient(app) as client:
                        resp = client.post("/api/v1/ai/documentos/PETR4", json=BODY_VALIDO)
        assert resp.status_code == 200
        data = resp.json()
        assert data["ia_disponivel"] is True
        doc1 = data["documentos"][0]
        assert doc1["resumo_executivo"] is not None
        assert doc1["sentimento"] == "positivo"
        assert "dividendos" in doc1["topicos"]

    def test_estrutura_documento(self):
        with patch("app.api.ai_documentos.buscar_documentos_ipe", return_value=DOCS_FAKE):
            with patch("app.api.ai_documentos.get_provider", return_value=None):
                with patch("app.api.ai_documentos._enriquecer_com_conteudo", return_value=None):
                    with TestClient(app) as client:
                        resp = client.post("/api/v1/ai/documentos/PETR4", json=BODY_VALIDO)
        doc = resp.json()["documentos"][0]
        for campo in ["id_doc", "ticker", "categoria", "descricao", "data_recebimento"]:
            assert campo in doc

    def test_rate_limit(self):
        from app.ai.rate_limiter import RateLimiter
        limiter = RateLimiter(max_requests=1, janela_segundos=60)
        with patch("app.api.ai_documentos.buscar_documentos_ipe", return_value=[]):
            with patch("app.api.ai_documentos.get_limiter", return_value=limiter):
                with TestClient(app) as client:
                    r1 = client.post("/api/v1/ai/documentos/PETR4", json=BODY_VALIDO)
                    r2 = client.post("/api/v1/ai/documentos/PETR4", json=BODY_VALIDO)
        assert r1.status_code == 200
        assert r2.status_code == 429

    def test_com_resumo_false_nao_chama_ia(self):
        chamou_ia = []

        class SpyProvider:
            disponivel = True

            async def chat_json(self, *_, **__) -> str:
                chamou_ia.append(True)
                return "{}"

            async def stream_chat(self, *_, **__):
                return
                yield

        payload = {**BODY_VALIDO, "com_resumo": False}
        with patch("app.api.ai_documentos.buscar_documentos_ipe", return_value=DOCS_FAKE):
            with patch("app.api.ai_documentos.get_provider", return_value=SpyProvider()):
                with patch("app.api.ai_documentos._enriquecer_com_conteudo", return_value=None):
                    with TestClient(app) as client:
                        client.post("/api/v1/ai/documentos/PETR4", json=payload)
        assert chamou_ia == []   # IA não foi chamada

    def test_listar_sem_resumo(self):
        with patch("app.api.ai_documentos.buscar_documentos_ipe", return_value=DOCS_FAKE):
            with TestClient(app) as client:
                resp = client.get(
                    "/api/v1/ai/documentos/PETR4/listar",
                    params={"empresa": "Petrobras"},
                )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 2
        assert "resumo_executivo" not in data["documentos"][0]


class TestDocumentSummarizer:
    def test_context_contem_empresa(self):
        from app.ai.document_summarizer import build_docs_context
        ctx = build_docs_context(DOCS_FAKE, {"empresa": "Petrobras", "ticker": "PETR4"})
        assert "Petrobras" in ctx or "PETR4" in ctx

    def test_context_contem_documento(self):
        from app.ai.document_summarizer import build_docs_context
        ctx = build_docs_context(DOCS_FAKE, None)
        assert "Fato Relevante" in ctx
        assert "dividendos" in ctx.lower() or "DOC001" in ctx

    def test_system_prompt_contem_empresa(self):
        from app.ai.document_summarizer import build_docs_system_prompt
        prompt = build_docs_system_prompt("Petrobras")
        assert "Petrobras" in prompt

    def test_parsear_resumos_por_id(self):
        from app.api.ai_documentos import _parsear_resumos_ia
        resumos = _parsear_resumos_ia(FAKE_IA_RESP, DOCS_FAKE)
        assert "DOC001" in resumos
        assert resumos["DOC001"]["sentimento"] == "positivo"

    def test_parsear_json_invalido_retorna_vazio(self):
        from app.api.ai_documentos import _parsear_resumos_ia
        resumos = _parsear_resumos_ia("isso nao e json", DOCS_FAKE)
        assert resumos == {}
