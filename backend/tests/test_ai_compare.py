"""
Testes do Comparador Automático por IA (Feature 2).

Rodar: cd backend && uv run pytest tests/test_ai_compare.py -v
"""
from __future__ import annotations

import json
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.main import app

# ── Fixtures ──────────────────────────────────────────────────────────────────

ATIVO_PETR4 = {
    "ticker": "PETR4",
    "empresa": "Petrobras",
    "setor": "Petróleo",
    "governanca": "Novo Mercado",
    "is_fii": False,
    "cotacao": {"preco_atual": 31.90, "variacao_pct": 1.25, "preco_lucro": 3.8},
    "score": {
        "score_total": 680, "nota_geral": "Muito Bom",
        "lucros": 120, "crescimento": 100, "saude": 125,
        "valuation_pts": 90, "dividendos": 80, "governanca": 100,
        "momentum": 35, "eficiencia": 30,
    },
    "fundamentos": {"dy_atual": 0.12},
    "valuation": {"preco_justo_base": 42.0, "upside_pct": 0.32, "veredicto": "SUBAVALIADA"},
    "alertas": [],
}

ATIVO_VALE3 = {
    "ticker": "VALE3",
    "empresa": "Vale",
    "setor": "Mineração",
    "governanca": "Nível 1",
    "is_fii": False,
    "cotacao": {"preco_atual": 60.50, "variacao_pct": -0.50, "preco_lucro": 5.2},
    "score": {
        "score_total": 610, "nota_geral": "Bom",
        "lucros": 110, "crescimento": 80, "saude": 115,
        "valuation_pts": 75, "dividendos": 90, "governanca": 85,
        "momentum": 25, "eficiencia": 30,
    },
    "fundamentos": {"dy_atual": 0.08},
    "valuation": {"preco_justo_base": 72.0, "upside_pct": 0.19, "veredicto": "SUBAVALIADA"},
    "alertas": [],
}

PAYLOAD_VALIDO = {
    "ativos": [
        {"ticker": "PETR4", "dados": ATIVO_PETR4},
        {"ticker": "VALE3", "dados": ATIVO_VALE3},
    ],
    "perfil": "equilibrio",
}

FAKE_LLM_RESPONSE = json.dumps({
    "vencedor_geral": "PETR4",
    "vencedores_dimensoes": {
        "lucros":      "PETR4",
        "crescimento": "PETR4",
        "saude":       "PETR4",
        "valuation":   "PETR4",
        "dividendos":  "VALE3",
        "governanca":  "PETR4",
        "momentum":    "PETR4",
        "eficiencia":  "empate",
    },
    "narrativa": "PETR4 supera VALE3 em score total (680 vs 610). Para renda, VALE3 tem DY maior.",
    "recomendacao_dividendos": "VALE3 com DY de 8%.",
    "recomendacao_crescimento": "PETR4 com upside de 32%.",
    "recomendacao_equilibrio": "PETR4 por pontuação global superior.",
    "aviso": "Não constitui recomendação de investimento.",
})


class FakeProvider:
    """Provider mock com chat_json pré-definido."""
    disponivel = True

    async def chat_json(self, system: str, user_message: str, **_) -> str:
        return FAKE_LLM_RESPONSE

    async def stream_chat(self, *args, **kwargs):
        return
        yield  # faz um generator válido


# ── Testes ────────────────────────────────────────────────────────────────────

class TestCompareEndpoint:
    def test_sem_openai_key_retorna_503(self):
        with patch("app.api.ai_compare.get_provider", return_value=None):
            with TestClient(app) as client:
                resp = client.post("/api/v1/ai/compare", json=PAYLOAD_VALIDO)
        assert resp.status_code == 503
        assert resp.json()["detail"]["modo"] == "static"

    def test_apenas_1_ativo_retorna_422(self):
        payload = {
            "ativos": [{"ticker": "PETR4", "dados": ATIVO_PETR4}],
            "perfil": "equilibrio",
        }
        with patch("app.api.ai_compare.get_provider", return_value=FakeProvider()):
            with TestClient(app) as client:
                resp = client.post("/api/v1/ai/compare", json=payload)
        assert resp.status_code == 422

    def test_mais_de_4_ativos_retorna_422(self):
        payload = {
            "ativos": [{"ticker": "T", "dados": {}} for _ in range(5)],
            "perfil": "equilibrio",
        }
        with patch("app.api.ai_compare.get_provider", return_value=FakeProvider()):
            with TestClient(app) as client:
                resp = client.post("/api/v1/ai/compare", json=payload)
        assert resp.status_code == 422

    def test_perfil_invalido_retorna_422(self):
        payload = {**PAYLOAD_VALIDO, "perfil": "nenhum"}
        with patch("app.api.ai_compare.get_provider", return_value=FakeProvider()):
            with TestClient(app) as client:
                resp = client.post("/api/v1/ai/compare", json=payload)
        assert resp.status_code == 422

    def test_comparacao_valida_retorna_200(self):
        with patch("app.api.ai_compare.get_provider", return_value=FakeProvider()):
            with TestClient(app) as client:
                resp = client.post("/api/v1/ai/compare", json=PAYLOAD_VALIDO)
        assert resp.status_code == 200
        data = resp.json()
        assert data["vencedor_geral"] == "PETR4"
        assert "PETR4" in data["tickers"]
        assert "VALE3" in data["tickers"]
        assert data["perfil"] == "equilibrio"

    def test_resposta_contem_vencedores_por_dimensao(self):
        with patch("app.api.ai_compare.get_provider", return_value=FakeProvider()):
            with TestClient(app) as client:
                resp = client.post("/api/v1/ai/compare", json=PAYLOAD_VALIDO)
        data = resp.json()
        dims = data["vencedores_dimensoes"]
        assert "lucros" in dims
        assert "dividendos" in dims
        assert "governanca" in dims

    def test_resposta_contem_scores(self):
        with patch("app.api.ai_compare.get_provider", return_value=FakeProvider()):
            with TestClient(app) as client:
                resp = client.post("/api/v1/ai/compare", json=PAYLOAD_VALIDO)
        data = resp.json()
        scores = data["scores_por_ticker"]
        assert "PETR4" in scores
        assert scores["PETR4"]["score_total"] == 680
        assert scores["VALE3"]["score_total"] == 610

    def test_resposta_contem_narrativa(self):
        with patch("app.api.ai_compare.get_provider", return_value=FakeProvider()):
            with TestClient(app) as client:
                resp = client.post("/api/v1/ai/compare", json=PAYLOAD_VALIDO)
        data = resp.json()
        assert len(data["narrativa"]) > 10

    def test_perfis_diferentes(self):
        for perfil in ("dividendos", "crescimento", "equilibrio"):
            payload = {**PAYLOAD_VALIDO, "perfil": perfil}
            with patch("app.api.ai_compare.get_provider", return_value=FakeProvider()):
                with TestClient(app) as client:
                    resp = client.post("/api/v1/ai/compare", json=payload)
            assert resp.status_code == 200
            assert resp.json()["perfil"] == perfil

    def test_rate_limit_bloqueia_excesso(self):
        from app.ai.rate_limiter import RateLimiter
        limiter_apertado = RateLimiter(max_requests=2, janela_segundos=60)
        with patch("app.api.ai_compare.get_provider", return_value=FakeProvider()):
            with patch("app.api.ai_compare.get_limiter", return_value=limiter_apertado):
                with TestClient(app) as client:
                    for _ in range(2):
                        resp = client.post("/api/v1/ai/compare", json=PAYLOAD_VALIDO)
                        assert resp.status_code == 200
                    resp = client.post("/api/v1/ai/compare", json=PAYLOAD_VALIDO)
                    assert resp.status_code == 429


class TestCompareBuilder:
    def test_contexto_contem_tickers(self):
        from app.ai.compare_builder import build_compare_context
        ctx = build_compare_context([ATIVO_PETR4, ATIVO_VALE3])
        assert "PETR4" in ctx
        assert "VALE3" in ctx

    def test_contexto_contem_scores(self):
        from app.ai.compare_builder import build_compare_context
        ctx = build_compare_context([ATIVO_PETR4, ATIVO_VALE3])
        assert "680" in ctx
        assert "610" in ctx

    def test_contexto_sem_valuation_nao_quebra(self):
        from app.ai.compare_builder import build_compare_context
        ativo_sem_val = {**ATIVO_PETR4, "valuation": None}
        ctx = build_compare_context([ativo_sem_val, ATIVO_VALE3])
        assert isinstance(ctx, str)

    def test_system_prompt_contem_perfil(self):
        from app.ai.compare_builder import build_compare_system_prompt
        prompt = build_compare_system_prompt("dividendos")
        assert "dividendos" in prompt.lower() or "renda" in prompt.lower()

    def test_user_message_contem_tickers(self):
        from app.ai.compare_builder import build_compare_user_message
        msg = build_compare_user_message(["PETR4", "VALE3"], "equilibrio")
        assert "PETR4" in msg
        assert "VALE3" in msg
