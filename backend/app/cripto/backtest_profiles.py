"""
Perfis de backtest — espelho dos PERFIS definidos no frontend (daytrade/page.tsx).
Scores calibrados para gerar entradas realistas (baseado na distribuição do engine).

Referência engine (daytrade_engine._decisao):
  score >= 60 AND bullish → operar=True  (COMPRAR/FORTE/MUITO FORTE)
  score 35-59             → AGUARDAR     (operar=False)
  score < 35              → NÃO OPERAR

Thresholds padrão AllWin: Excelente ≥80 · Bom ≥65 · Regular ≥50 · Fraco ≥35 · Crítico <35
"""

from __future__ import annotations

PERFIS: list[dict] = [
    # ── Conservadores (aguardar_ok=False → precisa operar=True → score efetivo ≥60) ──
    {
        "id": "cons_normal",    "nome": "Conservador Normal",
        "score_compra": 65,     "score_venda": 40,  "bull_pct_min": 55,
        "sl_pct": 1.5,          "tp_pct": 5.0,
        "aguardar_ok": False,   "apenas_aguardar": False,
        "score_max_compra": None,"stake_dupla_score": None,
        "capital_inicial": 10_000, "stake_base": 1_000,
    },
    {
        "id": "cons_pro",       "nome": "Conservador PRO",
        "score_compra": 63,     "score_venda": 38,  "bull_pct_min": 53,
        "sl_pct": 2.0,          "tp_pct": 7.0,
        "aguardar_ok": False,   "apenas_aguardar": False,
        "score_max_compra": None,"stake_dupla_score": None,
        "capital_inicial": 10_000, "stake_base": 1_000,
    },
    {
        "id": "cons_promax",    "nome": "Conservador PRO MAX",
        "score_compra": 62,     "score_venda": 37,  "bull_pct_min": 52,
        "sl_pct": 2.5,          "tp_pct": 9.0,
        "aguardar_ok": False,   "apenas_aguardar": False,
        "score_max_compra": None,"stake_dupla_score": None,
        "capital_inicial": 10_000, "stake_base": 1_000,
    },
    # ── Moderados ──
    {
        "id": "mod_normal",     "nome": "Moderado Normal",
        "score_compra": 62,     "score_venda": 37,  "bull_pct_min": 50,
        "sl_pct": 3.0,          "tp_pct": 10.0,
        "aguardar_ok": False,   "apenas_aguardar": False,
        "score_max_compra": None,"stake_dupla_score": None,
        "capital_inicial": 10_000, "stake_base": 1_000,
    },
    {
        "id": "mod_pro",        "nome": "Moderado PRO",
        "score_compra": 55,     "score_venda": 35,  "bull_pct_min": 48,
        "sl_pct": 4.0,          "tp_pct": 12.0,
        "aguardar_ok": True,    "apenas_aguardar": False,
        "score_max_compra": None,"stake_dupla_score": None,
        "capital_inicial": 10_000, "stake_base": 1_000,
    },
    {
        "id": "mod_promax",     "nome": "Moderado PRO MAX",
        "score_compra": 52,     "score_venda": 33,  "bull_pct_min": 47,
        "sl_pct": 5.0,          "tp_pct": 15.0,
        "aguardar_ok": True,    "apenas_aguardar": False,
        "score_max_compra": None,"stake_dupla_score": None,
        "capital_inicial": 10_000, "stake_base": 1_000,
    },
    # ── Agressivos (aguardar_ok=True → pode entrar em AGUARDAR) ──
    {
        "id": "agr_normal",     "nome": "Agressivo Normal",
        "score_compra": 50,     "score_venda": 32,  "bull_pct_min": 46,
        "sl_pct": 5.0,          "tp_pct": 15.0,
        "aguardar_ok": True,    "apenas_aguardar": False,
        "score_max_compra": None,"stake_dupla_score": None,
        "capital_inicial": 10_000, "stake_base": 1_000,
    },
    {
        "id": "agr_pro",        "nome": "Agressivo PRO",
        "score_compra": 48,     "score_venda": 30,  "bull_pct_min": 44,
        "sl_pct": 7.0,          "tp_pct": 20.0,
        "aguardar_ok": True,    "apenas_aguardar": False,
        "score_max_compra": None,"stake_dupla_score": None,
        "capital_inicial": 10_000, "stake_base": 1_000,
    },
    {
        "id": "agr_promax",     "nome": "Agressivo PRO MAX",
        "score_compra": 45,     "score_venda": 28,  "bull_pct_min": 42,
        "sl_pct": 8.0,          "tp_pct": 25.0,
        "aguardar_ok": True,    "apenas_aguardar": False,
        "score_max_compra": None,"stake_dupla_score": None,
        "capital_inicial": 10_000, "stake_base": 1_000,
    },
    # ── Alavancados (capital alto, critério ligeiramente mais exigente) ──
    {
        "id": "cons_alav",      "nome": "Conservador Alavancado",
        "score_compra": 70,     "score_venda": 45,  "bull_pct_min": 58,
        "sl_pct": 2.0,          "tp_pct": 5.0,
        "aguardar_ok": False,   "apenas_aguardar": False,
        "score_max_compra": None,"stake_dupla_score": 85,
        "capital_inicial": 100_000, "stake_base": 5_000,
    },
    {
        "id": "mod_alav",       "nome": "Moderado Alavancado",
        "score_compra": 67,     "score_venda": 42,  "bull_pct_min": 55,
        "sl_pct": 2.5,          "tp_pct": 6.0,
        "aguardar_ok": False,   "apenas_aguardar": False,
        "score_max_compra": None,"stake_dupla_score": 82,
        "capital_inicial": 100_000, "stake_base": 5_000,
    },
    {
        "id": "agr_alav",       "nome": "Agressivo Alavancado",
        "score_compra": 63,     "score_venda": 38,  "bull_pct_min": 52,
        "sl_pct": 3.0,          "tp_pct": 7.0,
        "aguardar_ok": False,   "apenas_aguardar": False,
        "score_max_compra": None,"stake_dupla_score": 80,
        "capital_inicial": 100_000, "stake_base": 5_000,
    },
    # ── Subida (apenas_aguardar=True → entra só em AGUARDAR, score < 60 quando bullish) ──
    {
        "id": "sub_cons",       "nome": "Subida Normal",
        "score_compra": 48,     "score_venda": 33,  "bull_pct_min": 51,
        "sl_pct": 2.0,          "tp_pct": 18.0,
        "aguardar_ok": False,   "apenas_aguardar": True,
        "score_max_compra": 79, "stake_dupla_score": None,
        "capital_inicial": 100_000, "stake_base": 500,
    },
    {
        "id": "sub_mod",        "nome": "Subida PRO",
        "score_compra": 40,     "score_venda": 30,  "bull_pct_min": 48,
        "sl_pct": 2.5,          "tp_pct": 20.0,
        "aguardar_ok": False,   "apenas_aguardar": True,
        "score_max_compra": 79, "stake_dupla_score": None,
        "capital_inicial": 100_000, "stake_base": 500,
    },
    {
        "id": "sub_agr",        "nome": "Subida PRO MAX",
        "score_compra": 32,     "score_venda": 28,  "bull_pct_min": 45,
        "sl_pct": 3.0,          "tp_pct": 25.0,
        "aguardar_ok": False,   "apenas_aguardar": True,
        "score_max_compra": 79, "stake_dupla_score": None,
        "capital_inicial": 100_000, "stake_base": 500,
    },
    {
        "id": "sub_alav",       "nome": "Subida Alavancado",
        "score_compra": 44,     "score_venda": 30,  "bull_pct_min": 49,
        "sl_pct": 2.0,          "tp_pct": 25.0,
        "aguardar_ok": False,   "apenas_aguardar": True,
        "score_max_compra": 79, "stake_dupla_score": 73,
        "capital_inicial": 100_000, "stake_base": 500,
    },
]

_INDEX = {p["id"]: p for p in PERFIS}


def get_profile(perfil_id: str) -> dict | None:
    return _INDEX.get(perfil_id)


def get_all_profiles() -> list[dict]:
    return list(PERFIS)
