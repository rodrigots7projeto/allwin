"""
Testes do montador de contexto (context_builder).

Rodar: cd backend && uv run pytest tests/test_context_builder.py -v
"""
import pytest

from app.ai.context_builder import build_context, build_system_prompt

# ── Fixtures ──────────────────────────────────────────────────────────────────

DADOS_ACAO_COMPLETO = {
    "ticker": "PETR4",
    "empresa": "Petróleo Brasileiro S.A.",
    "setor": "Petróleo, Gás e Biocombustíveis",
    "subsetor": "Exploração, Refino e Distribuição",
    "segmento_b3": "Novo Mercado",
    "governanca": "Novo Mercado",
    "is_fii": False,
    "indices": ["IBOV", "IDIV"],
    "cotacao": {
        "preco_atual": 31.90,
        "variacao_pct": 1.25,
        "lpa": 8.30,
        "preco_lucro": 3.84,
        "cinquenta_dois_semanas_alta": 44.59,
        "cinquenta_dois_semanas_baixa": 28.50,
        "market_cap": 415_000_000_000,
    },
    "var_mes": 0.025,
    "var_ano": -0.12,
    "score": {
        "score_total": 680,
        "nota_geral": "Muito Bom",
        "lucros": 120,
        "crescimento": 100,
        "saude": 125,
        "valuation_pts": 90,
        "dividendos": 80,
        "governanca": 100,
        "momentum": 35,
        "eficiencia": 30,
        "pontos_fortes": ["Alta rentabilidade sobre o patrimônio"],
        "pontos_fracos": ["Momentum fraco"],
    },
    "fundamentos": {
        "historico": [
            {
                "ano": 2022,
                "receita_liquida": 500e9,
                "ebitda": 200e9,
                "lucro_liquido": 100e9,
                "margem_liquida": 0.20,
                "roe": 0.35,
                "dl_ebitda": 0.80,
                "fcl": 50e9,
            },
            {
                "ano": 2023,
                "receita_liquida": 480e9,
                "ebitda": 190e9,
                "lucro_liquido": 90e9,
                "margem_liquida": 0.1875,
                "roe": 0.30,
                "dl_ebitda": 0.70,
                "fcl": 45e9,
            },
        ],
        "sinais": {
            "margem_liquida": {
                "valor": 0.1875,
                "media_historica": 0.15,
                "sinal": "verde",
                "melhor_quando": "maior",
            },
            "roe": {
                "valor": 0.30,
                "media_historica": 0.25,
                "sinal": "verde",
                "melhor_quando": "maior",
            },
        },
        "cagr_receita": 0.05,
        "cagr_lucro": 0.08,
        "cagr_pl": 0.06,
        "dy_atual": 0.12,
        "pl_atual": 3.84,
    },
    "valuation": {
        "preco_atual": 31.90,
        "eps": 8.30,
        "bvs": 25.00,
        "fcl_por_acao": 3.50,
        "metodos": [
            {"nome": "Graham",  "preco_justo": 42.80, "upside_pct": 0.342},
            {"nome": "P/L",     "preco_justo": 37.50, "upside_pct": 0.175},
            {"nome": "DCF",     "preco_justo": 40.10, "upside_pct": 0.257},
        ],
        "cenarios": [
            {"nome": "Pessimista", "taxa_crescimento": 0.03, "taxa_desconto": 0.12, "preco_justo": 28.00, "upside_pct": -0.122},
            {"nome": "Base",       "taxa_crescimento": 0.06, "taxa_desconto": 0.10, "preco_justo": 40.10, "upside_pct":  0.257},
            {"nome": "Otimista",   "taxa_crescimento": 0.09, "taxa_desconto": 0.09, "preco_justo": 58.00, "upside_pct":  0.819},
        ],
        "preco_justo_base": 40.10,
        "upside_pct": 0.257,
        "margem_seguranca": 0.20,
        "veredicto": "SUBAVALIADA",
        "premissas": {
            "g_base_usado": 0.06,
            "n_anos_historico": 5,
            "ultimo_exercicio": 2023,
        },
    },
    "alertas": [
        {"tipo": "positivo", "titulo": "Alto DY", "descricao": "DY de 12% acima da Selic.", "categoria": "dividendos"},
        {"tipo": "atencao",  "titulo": "Momentum fraco", "descricao": "Preço caiu 12% no ano.", "categoria": "tecnico"},
    ],
}

DADOS_FII = {
    "ticker": "MXRF11",
    "empresa": "Maxi Renda",
    "is_fii": True,
    "fii_tipo": "CRI",
    "indices": ["IFIX"],
    "cotacao": {
        "preco_atual": 9.80,
        "variacao_pct": 0.20,
        "cinquenta_dois_semanas_alta": 10.50,
        "cinquenta_dois_semanas_baixa": 9.10,
    },
    "score": {
        "score_total": 530,
        "nota_geral": "Bom",
        "lucros": 0, "crescimento": 0, "saude": 0,
        "valuation_pts": 0, "dividendos": 60, "governanca": 80,
        "momentum": 50, "eficiencia": 0,
        "pontos_fortes": ["Liquidez no IFIX"],
        "pontos_fracos": [],
    },
    "fundamentos": None,
    "valuation": None,
    "alertas": [],
}


# ── Testes ────────────────────────────────────────────────────────────────────

class TestBuildContext:
    def test_campos_obrigatorios_acao(self):
        ctx = build_context(DADOS_ACAO_COMPLETO)
        assert "PETR4" in ctx
        assert "Petróleo Brasileiro" in ctx
        assert "RS SCORE" in ctx
        assert "680/1000" in ctx
        assert "HISTÓRICO FINANCEIRO" in ctx
        assert "VALUATION" in ctx
        assert "SUBAVALIADA" in ctx
        assert "ALERTAS" in ctx

    def test_historico_tabular(self):
        ctx = build_context(DADOS_ACAO_COMPLETO)
        assert "2022" in ctx
        assert "2023" in ctx
        # valores financeiros presentes
        assert "500" in ctx or "480" in ctx

    def test_sinais_presentes(self):
        ctx = build_context(DADOS_ACAO_COMPLETO)
        assert "SINAIS VS. MÉDIA HISTÓRICA" in ctx
        assert "ROE" in ctx
        assert "verde" in ctx.lower() or "VERDE" in ctx

    def test_metodos_valuation(self):
        ctx = build_context(DADOS_ACAO_COMPLETO)
        assert "Graham" in ctx
        assert "DCF" in ctx
        assert "Pessimista" in ctx
        assert "Otimista" in ctx

    def test_fii_sem_fundamentos(self):
        ctx = build_context(DADOS_FII)
        assert "MXRF11" in ctx
        assert "FII" in ctx
        assert "CRI" in ctx
        assert "IFIX" in ctx
        # FII não tem histórico financeiro CVM
        assert "HISTÓRICO FINANCEIRO" not in ctx

    def test_alertas_classificados(self):
        ctx = build_context(DADOS_ACAO_COMPLETO)
        assert "POSITIVO" in ctx
        assert "ATENÇÃO" in ctx
        assert "Alto DY" in ctx
        assert "Momentum fraco" in ctx

    def test_dados_vazios_nao_quebra(self):
        """Context builder deve ser robusto a dicts incompletos."""
        ctx = build_context({})
        assert isinstance(ctx, str)

    def test_sem_valuation_nao_quebra(self):
        dados = {**DADOS_ACAO_COMPLETO, "valuation": None}
        ctx = build_context(dados)
        assert "PETR4" in ctx
        assert "VALUATION" not in ctx


class TestBuildSystemPrompt:
    def test_contem_empresa_e_ticker(self):
        ctx = build_context(DADOS_ACAO_COMPLETO)
        prompt = build_system_prompt("Petrobras", "PETR4", ctx)
        assert "Petrobras" in prompt
        assert "PETR4" in prompt

    def test_contem_regras(self):
        ctx = build_context(DADOS_ACAO_COMPLETO)
        prompt = build_system_prompt("X", "X", ctx)
        assert "CNPI" in prompt
        assert "NUNCA" in prompt
        assert "recomendação de investimento" in prompt

    def test_contem_contexto(self):
        ctx = build_context(DADOS_ACAO_COMPLETO)
        prompt = build_system_prompt("Petrobras", "PETR4", ctx)
        # O contexto completo deve estar no prompt
        assert "RS SCORE" in prompt
        assert "VALUATION" in prompt
