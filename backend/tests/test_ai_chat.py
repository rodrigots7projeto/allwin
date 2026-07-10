"""
Testes de integração do endpoint de chat com LLM mockado.

Rodar: cd backend && uv run pytest tests/test_ai_chat.py -v
"""
from __future__ import annotations

from typing import AsyncIterator
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import pytest_asyncio
from fastapi.testclient import TestClient
from httpx import AsyncClient

from app.main import app

# ── Fixtures ──────────────────────────────────────────────────────────────────

DADOS_ATIVO_MINIMAL = {
    "ticker": "PETR4",
    "empresa": "Petrobras",
    "is_fii": False,
    "setor": "Petróleo",
    "cotacao": {"preco_atual": 31.90, "variacao_pct": 1.25},
    "score": {
        "score_total": 680, "nota_geral": "Muito Bom",
        "lucros": 120, "crescimento": 100, "saude": 125,
        "valuation_pts": 90, "dividendos": 80, "governanca": 100,
        "momentum": 35, "eficiencia": 30,
        "pontos_fortes": [], "pontos_fracos": [],
    },
    "fundamentos": None,
    "valuation": None,
    "alertas": [],
}

REQUEST_VALIDO = {
    "mensagens": [
        {"papel": "usuario", "conteudo": "A PETR4 está barata?"}
    ],
    "dados_ativo": DADOS_ATIVO_MINIMAL,
}


class FakeProvider:
    """Provider mock que gera tokens previsíveis."""
    disponivel = True

    async def stream_chat(
        self,
        system: str,
        messages: list[dict],
        max_tokens: int = 800,
        temperature: float = 0.2,
    ) -> AsyncIterator[str]:
        for token in ["Baseado ", "nos ", "dados, ", "sim."]:
            yield token


# ── Helpers ───────────────────────────────────────────────────────────────────

def _payload_com_mensagem(conteudo: str, papel: str = "usuario") -> dict:
    return {
        "mensagens": [{"papel": papel, "conteudo": conteudo}],
        "dados_ativo": DADOS_ATIVO_MINIMAL,
    }


# ── Testes ────────────────────────────────────────────────────────────────────

class TestChatEndpoint:
    """Testes do POST /api/v1/ai/chat/{ticker} com LLM mockado."""

    def test_sem_openai_key_retorna_503(self):
        """Sem chave configurada → 503 com modo static."""
        with patch("app.api.ai_chat.get_provider", return_value=None):
            with TestClient(app) as client:
                resp = client.post("/api/v1/ai/chat/PETR4", json=REQUEST_VALIDO)
        assert resp.status_code == 503
        body = resp.json()
        assert body["detail"]["modo"] == "static"

    def test_mensagens_vazias_retorna_400(self):
        with patch("app.api.ai_chat.get_provider", return_value=FakeProvider()):
            with TestClient(app) as client:
                resp = client.post("/api/v1/ai/chat/PETR4", json={
                    "mensagens": [],
                    "dados_ativo": DADOS_ATIVO_MINIMAL,
                })
        assert resp.status_code == 400

    def test_ultima_mensagem_nao_usuario_retorna_400(self):
        with patch("app.api.ai_chat.get_provider", return_value=FakeProvider()):
            with TestClient(app) as client:
                resp = client.post("/api/v1/ai/chat/PETR4", json=_payload_com_mensagem("Oi", papel="assistente"))
        assert resp.status_code == 400

    def test_pergunta_muito_longa_retorna_400(self):
        with patch("app.api.ai_chat.get_provider", return_value=FakeProvider()):
            with TestClient(app) as client:
                resp = client.post("/api/v1/ai/chat/PETR4", json=_payload_com_mensagem("x" * 1001))
        assert resp.status_code == 400

    def test_streaming_retorna_tokens(self):
        """Verifica que o stream chega ao cliente com os tokens esperados."""
        with patch("app.api.ai_chat.get_provider", return_value=FakeProvider()):
            with TestClient(app) as client:
                with client.stream("POST", "/api/v1/ai/chat/PETR4", json=REQUEST_VALIDO) as resp:
                    assert resp.status_code == 200
                    assert "text/event-stream" in resp.headers["content-type"]
                    raw = b"".join(resp.iter_bytes()).decode()

        # Verifica tokens SSE
        assert "data: " in raw
        assert "[DONE]" in raw
        # Verifica conteúdo dos tokens gerados pelo FakeProvider
        assert "Baseado" in raw

    def test_rate_limit_bloqueia_excesso(self):
        """11ª requisição do mesmo IP deve ser bloqueada (limite = 15 por 60s)."""
        from app.ai.rate_limiter import RateLimiter

        limiter_apertado = RateLimiter(max_requests=3, janela_segundos=60)

        with patch("app.api.ai_chat.get_provider", return_value=FakeProvider()):
            with patch("app.api.ai_chat.get_limiter", return_value=limiter_apertado):
                with TestClient(app) as client:
                    # 3 primeiras: OK
                    for _ in range(3):
                        resp = client.post("/api/v1/ai/chat/PETR4", json=REQUEST_VALIDO)
                        assert resp.status_code in (200, 400, 500)  # qualquer coisa menos 429
                    # 4ª: deve ser bloqueada
                    resp = client.post("/api/v1/ai/chat/PETR4", json=REQUEST_VALIDO)
                    assert resp.status_code == 429

    def test_historico_multi_turno(self):
        """Conversa com múltiplos turnos deve funcionar."""
        payload = {
            "mensagens": [
                {"papel": "usuario",    "conteudo": "Está barata?"},
                {"papel": "assistente", "conteudo": "Sim, tem upside de 34%."},
                {"papel": "usuario",    "conteudo": "E o endividamento?"},
            ],
            "dados_ativo": DADOS_ATIVO_MINIMAL,
        }
        with patch("app.api.ai_chat.get_provider", return_value=FakeProvider()):
            with TestClient(app) as client:
                with client.stream("POST", "/api/v1/ai/chat/PETR4", json=payload) as resp:
                    assert resp.status_code == 200


class TestChatStatus:
    def test_status_sem_key(self):
        with patch("app.api.ai_chat.get_provider", return_value=None):
            with TestClient(app) as client:
                resp = client.get("/api/v1/ai/chat/status")
        assert resp.status_code == 200
        assert resp.json()["disponivel"] is False
        assert resp.json()["modo"] == "static"


class TestRateLimiter:
    """Testes unitários do rate limiter."""

    def test_permite_dentro_do_limite(self):
        from app.ai.rate_limiter import RateLimiter
        rl = RateLimiter(max_requests=5, janela_segundos=60)
        for _ in range(5):
            assert rl.verificar("ip1") is True

    def test_bloqueia_apos_limite(self):
        from app.ai.rate_limiter import RateLimiter
        rl = RateLimiter(max_requests=3, janela_segundos=60)
        rl.verificar("ip2")
        rl.verificar("ip2")
        rl.verificar("ip2")
        assert rl.verificar("ip2") is False

    def test_ips_diferentes_independentes(self):
        from app.ai.rate_limiter import RateLimiter
        rl = RateLimiter(max_requests=1, janela_segundos=60)
        assert rl.verificar("ip_a") is True
        assert rl.verificar("ip_b") is True  # IP diferente não é afetado
        assert rl.verificar("ip_a") is False  # mesmo IP bloqueado
