"""
Testes do Radar de Anomalias (Feature 3).

Rodar: cd backend && uv run pytest tests/test_ai_radar.py -v
"""
from __future__ import annotations

import json
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.main import app

# ── Fixtures ──────────────────────────────────────────────────────────────────

def _historico(receita_fator: float = 1.0):
    """Gera 5 anos de histórico com opção de anomalia no último ano."""
    base = [
        {"ano": 2019, "receita_liquida": 400e9, "ebitda": 150e9, "lucro_liquido": 80e9,
         "margem_liquida": 0.20, "roe": 0.30, "dl_ebitda": 0.80, "fcl": 40e9},
        {"ano": 2020, "receita_liquida": 380e9, "ebitda": 140e9, "lucro_liquido": 70e9,
         "margem_liquida": 0.184, "roe": 0.28, "dl_ebitda": 0.90, "fcl": 35e9},
        {"ano": 2021, "receita_liquida": 450e9, "ebitda": 170e9, "lucro_liquido": 90e9,
         "margem_liquida": 0.20, "roe": 0.32, "dl_ebitda": 0.75, "fcl": 45e9},
        {"ano": 2022, "receita_liquida": 500e9, "ebitda": 200e9, "lucro_liquido": 100e9,
         "margem_liquida": 0.20, "roe": 0.35, "dl_ebitda": 0.70, "fcl": 50e9},
        # Último ano — pode ter anomalia
        {"ano": 2023,
         "receita_liquida": 500e9 * receita_fator,
         "ebitda": 200e9, "lucro_liquido": 100e9,
         "margem_liquida": 0.20, "roe": 0.35, "dl_ebitda": 0.70, "fcl": 50e9},
    ]
    return base


DADOS_NORMAL = {
    "ticker": "PETR4",
    "empresa": "Petrobras",
    "is_fii": False,
    "cotacao": {"preco_atual": 31.90},
    "score": {"score_total": 680, "nota_geral": "Muito Bom"},
    "fundamentos": {
        "historico": _historico(),   # sem anomalia
        "sinais": {},
    },
    "valuation": None,
    "alertas": [],
}

DADOS_COM_ANOMALIA = {
    **DADOS_NORMAL,
    "fundamentos": {
        "historico": _historico(receita_fator=0.4),  # queda brusca de receita
        "sinais": {
            "margem_liquida": {
                "valor": 0.08, "media_historica": 0.20,
                "sinal": "vermelho", "melhor_quando": "maior"
            }
        },
    },
}

DADOS_FII = {
    "ticker": "MXRF11",
    "empresa": "Maxi Renda",
    "is_fii": True,
    "fundamentos": None,
    "cotacao": {},
    "score": {},
    "alertas": [],
}

FAKE_NARRATIVA = json.dumps({
    "resumo_geral": "Receita caiu abruptamente em 2023.",
    "narrativa_detalhada": "A receita líquida registrou queda histórica de 60% vs. média.",
    "principais_riscos": ["Queda de demanda", "Compressão de margens"],
    "pontos_positivos": [],
    "recomendacao_acompanhamento": "Monitorar resultados do Q1 2024.",
    "aviso": "Não constitui recomendação de investimento.",
})


class FakeProvider:
    disponivel = True

    async def chat_json(self, system: str, user_message: str, **_) -> str:
        return FAKE_NARRATIVA

    async def stream_chat(self, *_, **__):
        return
        yield


# ── Testes do endpoint ────────────────────────────────────────────────────────

class TestRadarEndpoint:
    def test_fii_retorna_sem_sinais(self):
        with TestClient(app) as client:
            resp = client.post(
                "/api/v1/ai/radar/MXRF11",
                json={"dados_ativo": DADOS_FII},
            )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_sinais"] == 0
        assert "FII" in data["resumo_geral"] or "fii" in data["resumo_geral"].lower()

    def test_sem_anomalia_retorna_lista_vazia(self):
        with patch("app.api.ai_radar.get_provider", return_value=None):
            with TestClient(app) as client:
                resp = client.post(
                    "/api/v1/ai/radar/PETR4",
                    json={"dados_ativo": DADOS_NORMAL},
                )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_sinais"] == 0

    def test_anomalia_detectada_sem_ia(self):
        """Sem chave de IA: retorna sinais mas sem narrativa."""
        with patch("app.api.ai_radar.get_provider", return_value=None):
            with TestClient(app) as client:
                resp = client.post(
                    "/api/v1/ai/radar/PETR4",
                    json={"dados_ativo": DADOS_COM_ANOMALIA},
                )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_sinais"] > 0
        assert data["ia_disponivel"] is False
        assert data["resumo_geral"] != ""

    def test_anomalia_detectada_com_ia(self):
        """Com IA: retorna sinais + narrativa."""
        with patch("app.api.ai_radar.get_provider", return_value=FakeProvider()):
            with TestClient(app) as client:
                resp = client.post(
                    "/api/v1/ai/radar/PETR4",
                    json={"dados_ativo": DADOS_COM_ANOMALIA},
                )
        assert resp.status_code == 200
        data = resp.json()
        assert data["ia_disponivel"] is True
        assert "caiu" in data["resumo_geral"].lower() or "receita" in data["narrativa_detalhada"].lower()
        assert isinstance(data["principais_riscos"], list)

    def test_response_estrutura_completa(self):
        with patch("app.api.ai_radar.get_provider", return_value=FakeProvider()):
            with TestClient(app) as client:
                resp = client.post(
                    "/api/v1/ai/radar/PETR4",
                    json={"dados_ativo": DADOS_COM_ANOMALIA},
                )
        data = resp.json()
        campos = [
            "ticker", "empresa", "total_sinais", "total_criticos", "total_atencao",
            "total_info", "sinais", "resumo_geral", "narrativa_detalhada",
            "principais_riscos", "pontos_positivos", "recomendacao_acompanhamento",
            "aviso", "ia_disponivel",
        ]
        for campo in campos:
            assert campo in data, f"Campo '{campo}' ausente na resposta"

    def test_sinal_tem_campos_obrigatorios(self):
        with patch("app.api.ai_radar.get_provider", return_value=None):
            with TestClient(app) as client:
                resp = client.post(
                    "/api/v1/ai/radar/PETR4",
                    json={"dados_ativo": DADOS_COM_ANOMALIA},
                )
        sinais = resp.json()["sinais"]
        assert len(sinais) > 0
        sinal = sinais[0]
        for campo in ["indicador", "nome", "severidade", "tipo", "contexto"]:
            assert campo in sinal

    def test_rate_limit(self):
        from app.ai.rate_limiter import RateLimiter
        limiter = RateLimiter(max_requests=1, janela_segundos=60)
        with patch("app.api.ai_radar.get_provider", return_value=None):
            with patch("app.api.ai_radar.get_limiter", return_value=limiter):
                with TestClient(app) as client:
                    r1 = client.post("/api/v1/ai/radar/PETR4", json={"dados_ativo": DADOS_NORMAL})
                    r2 = client.post("/api/v1/ai/radar/PETR4", json={"dados_ativo": DADOS_NORMAL})
        assert r1.status_code == 200
        assert r2.status_code == 429


# ── Testes do detector ────────────────────────────────────────────────────────

class TestAnomalyDetector:
    def test_sem_historico_retorna_vazio(self):
        from app.ai.anomaly_detector import detectar_anomalias
        assert detectar_anomalias({}) == []
        assert detectar_anomalias({"fundamentos": {}}) == []

    def test_historico_insuficiente_retorna_vazio(self):
        from app.ai.anomaly_detector import detectar_anomalias
        dados = {"fundamentos": {"historico": [
            {"ano": 2022, "receita_liquida": 100e9},
            {"ano": 2023, "receita_liquida": 120e9},
        ]}}
        assert detectar_anomalias(dados) == []

    def test_detecta_queda_brusca_receita(self):
        from app.ai.anomaly_detector import detectar_anomalias
        dados = {"fundamentos": {"historico": _historico(receita_fator=0.3), "sinais": {}}}
        sinais = detectar_anomalias(dados)
        indicadores = [s["indicador"] for s in sinais]
        assert "receita_liquida" in indicadores

    def test_z_score_negativo_para_queda(self):
        from app.ai.anomaly_detector import detectar_anomalias
        dados = {"fundamentos": {"historico": _historico(receita_fator=0.3), "sinais": {}}}
        sinais = detectar_anomalias(dados)
        rec = next(s for s in sinais if s["indicador"] == "receita_liquida")
        assert rec["z_score"] < 0   # queda = z negativo
        assert rec["tipo"] == "negativo"

    def test_severidade_critico_para_z_alto(self):
        from app.ai.anomaly_detector import detectar_anomalias
        dados = {"fundamentos": {"historico": _historico(receita_fator=0.2), "sinais": {}}}
        sinais = detectar_anomalias(dados)
        rec = next((s for s in sinais if s["indicador"] == "receita_liquida"), None)
        assert rec is not None
        assert rec["severidade"] == "critico"

    def test_histograma_serie_presente(self):
        from app.ai.anomaly_detector import detectar_anomalias
        dados = {"fundamentos": {"historico": _historico(receita_fator=0.3), "sinais": {}}}
        sinais = detectar_anomalias(dados)
        rec = next(s for s in sinais if s["indicador"] == "receita_liquida")
        assert len(rec["historico_serie"]) == 5
        assert "ano" in rec["historico_serie"][0]

    def test_sem_anomalia_retorna_lista_vazia(self):
        from app.ai.anomaly_detector import detectar_anomalias
        dados = {"fundamentos": {"historico": _historico(), "sinais": {}}}
        sinais = detectar_anomalias(dados)
        assert sinais == []

    def test_sinal_rs_vermelho_incluido(self):
        from app.ai.anomaly_detector import detectar_anomalias
        dados = {
            "fundamentos": {
                "historico": _historico(),
                "sinais": {
                    "roe": {"valor": 0.05, "media_historica": 0.30, "sinal": "vermelho", "melhor_quando": "maior"}
                },
            }
        }
        sinais = detectar_anomalias(dados)
        indicadores = [s["indicador"] for s in sinais]
        assert "roe" in indicadores
