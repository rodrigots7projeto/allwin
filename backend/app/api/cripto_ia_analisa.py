"""
IA Analisa — analisa histórico de trades por perfil e sugere melhorias de parâmetros.
GET  /cripto/ia/metricas?tipo=futures    → métricas calculadas do MySQL
POST /cripto/ia/analisar                → chama OpenAI com métricas + configs → sugestões
GET  /cripto/ia/analises?tipo=futures   → cache das últimas análises salvas
GET  /cripto/ia/overrides?tipo=futures  → overrides aprovados ativos
POST /cripto/ia/overrides               → salva override aprovado
DELETE /cripto/ia/overrides/{perfil_id} → remove override
"""
from __future__ import annotations

import json
from typing import Any, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..config import settings
from ..db.mysql import (
    ia_analise_load_all,
    ia_analise_save,
    overrides_delete,
    overrides_load_all,
    overrides_save,
    trades_list,
    wallet_load_all,
)

router = APIRouter(tags=["ia — analise de perfis"])

# ── Perfis Futures (espelho do frontend) ─────────────────────────────────────
# Campos usados na análise IA: id, nome, e os parâmetros sujeitos a override.

PERFIS_FUTURES_META: list[dict] = [
    {"id": "f_cons_normal",  "nome": "Conservador Normal",     "score_compra": 68, "score_venda": 45, "bull_pct_min": 53, "sl_pct": 0.008, "tp_pct": 0.020, "stake_base": 1000, "direction_allowed": "BOTH"},
    {"id": "f_cons_pro",     "nome": "Conservador PRO",        "score_compra": 65, "score_venda": 42, "bull_pct_min": 51, "sl_pct": 0.009, "tp_pct": 0.025, "stake_base": 1000, "direction_allowed": "BOTH"},
    {"id": "f_cons_promax",  "nome": "Conservador PRO MAX",    "score_compra": 62, "score_venda": 40, "bull_pct_min": 49, "sl_pct": 0.010, "tp_pct": 0.030, "stake_base": 1000, "direction_allowed": "BOTH"},
    {"id": "f_mod_normal",   "nome": "Moderado Normal",        "score_compra": 60, "score_venda": 38, "bull_pct_min": 47, "sl_pct": 0.010, "tp_pct": 0.025, "stake_base": 1000, "direction_allowed": "BOTH"},
    {"id": "f_mod_pro",      "nome": "Moderado PRO",           "score_compra": 55, "score_venda": 37, "bull_pct_min": 45, "sl_pct": 0.012, "tp_pct": 0.030, "stake_base": 1000, "direction_allowed": "BOTH"},
    {"id": "f_mod_promax",   "nome": "Moderado PRO MAX",       "score_compra": 52, "score_venda": 35, "bull_pct_min": 43, "sl_pct": 0.013, "tp_pct": 0.035, "stake_base": 1000, "direction_allowed": "BOTH"},
    {"id": "f_agr_normal",   "nome": "Agressivo Normal",       "score_compra": 48, "score_venda": 33, "bull_pct_min": 41, "sl_pct": 0.013, "tp_pct": 0.035, "stake_base": 1000, "direction_allowed": "BOTH"},
    {"id": "f_agr_pro",      "nome": "Agressivo PRO",          "score_compra": 45, "score_venda": 32, "bull_pct_min": 39, "sl_pct": 0.015, "tp_pct": 0.040, "stake_base": 1000, "direction_allowed": "BOTH"},
    {"id": "f_agr_promax",   "nome": "Agressivo PRO MAX",      "score_compra": 42, "score_venda": 30, "bull_pct_min": 37, "sl_pct": 0.017, "tp_pct": 0.050, "stake_base": 1000, "direction_allowed": "BOTH"},
    {"id": "f_cons_alav",    "nome": "Conservador Alavancado", "score_compra": 72, "score_venda": 50, "bull_pct_min": 54, "sl_pct": 0.006, "tp_pct": 0.015, "stake_base": 5000, "direction_allowed": "BOTH"},
    {"id": "f_mod_alav",     "nome": "Moderado Alavancado",    "score_compra": 68, "score_venda": 47, "bull_pct_min": 52, "sl_pct": 0.007, "tp_pct": 0.018, "stake_base": 5000, "direction_allowed": "BOTH"},
    {"id": "f_agr_alav",     "nome": "Agressivo Alavancado",   "score_compra": 63, "score_venda": 43, "bull_pct_min": 48, "sl_pct": 0.008, "tp_pct": 0.020, "stake_base": 5000, "direction_allowed": "BOTH"},
    {"id": "f_sub_cons",     "nome": "Subida Normal",          "score_compra": 48, "score_venda": 33, "bull_pct_min": 51, "sl_pct": 0.010, "tp_pct": 0.035, "stake_base": 500,  "direction_allowed": "LONG"},
    {"id": "f_sub_mod",      "nome": "Subida PRO",             "score_compra": 40, "score_venda": 30, "bull_pct_min": 48, "sl_pct": 0.012, "tp_pct": 0.040, "stake_base": 500,  "direction_allowed": "LONG"},
    {"id": "f_sub_agr",      "nome": "Subida PRO MAX",         "score_compra": 35, "score_venda": 28, "bull_pct_min": 45, "sl_pct": 0.015, "tp_pct": 0.050, "stake_base": 500,  "direction_allowed": "LONG"},
    {"id": "f_short_cons",   "nome": "Short Conservador",      "score_compra": 68, "score_venda": 45, "bull_pct_min": 40, "sl_pct": 0.008, "tp_pct": 0.020, "stake_base": 500,  "direction_allowed": "SHORT"},
    {"id": "f_short_mod",    "nome": "Short Moderado",         "score_compra": 60, "score_venda": 40, "bull_pct_min": 35, "sl_pct": 0.010, "tp_pct": 0.025, "stake_base": 500,  "direction_allowed": "SHORT"},
]

PERFIS_META_BY_ID = {p["id"]: p for p in PERFIS_FUTURES_META}

VALID_TIPOS = {"futures", "bot"}
CAMPOS_EDITAVEIS = {
    "futures": ["score_compra", "score_venda", "bull_pct_min", "sl_pct", "tp_pct", "stake_base"],
    "bot":     ["score_min", "sl_pct", "tp_pct", "stake", "max_positions"],
}


# ── Pydantic models ───────────────────────────────────────────────────────────

class AnalisarIn(BaseModel):
    tipo: str = "futures"
    perfis_config: list[dict]   # configs vindas do frontend (inclui parâmetros atuais)


class OverrideIn(BaseModel):
    perfil_id:  str
    wallet_tipo: str = "futures"
    campo:      str
    valor_novo: Any
    motivo:     str = ""


class OverridePatch(BaseModel):
    perfil_id:  str
    wallet_tipo: str = "futures"
    overrides:  dict[str, Any]   # { campo: valor_novo, ... }


# ── Helpers de métricas ───────────────────────────────────────────────────────

def _calcular_metricas(perfil_id: str, trades: list[dict], wallet: Optional[dict]) -> dict:
    vendas  = [t for t in trades if t.get("tipo") == "V"]
    compras = [t for t in trades if t.get("tipo") == "C"]

    if not vendas:
        return {
            "perfil_id": perfil_id,
            "total_compras": len(compras),
            "total_vendas": 0,
            "win_rate": None,
            "total_pnl_brl": 0.0,
            "avg_pnl_brl": 0.0,
            "avg_win_brl": 0.0,
            "avg_loss_brl": 0.0,
            "roi_pct": 0.0,
            "top_simbolos": [],
            "bot_simbolos": [],
            "dados_suficientes": False,
        }

    wins   = [t for t in vendas if (t.get("pnl_brl") or 0) > 0]
    losses = [t for t in vendas if (t.get("pnl_brl") or 0) <= 0]

    total_pnl = sum((t.get("pnl_brl") or 0) for t in vendas)
    avg_win   = sum((t.get("pnl_brl") or 0) for t in wins)   / len(wins)   if wins   else 0
    avg_loss  = sum((t.get("pnl_brl") or 0) for t in losses) / len(losses) if losses else 0

    # PnL por símbolo
    sym_pnl: dict[str, float] = {}
    for t in vendas:
        s = t.get("simbolo", "")
        sym_pnl[s] = sym_pnl.get(s, 0) + (t.get("pnl_brl") or 0)

    sorted_syms = sorted(sym_pnl.items(), key=lambda x: x[1], reverse=True)
    top3 = [{"simbolo": s, "pnl": round(p, 2)} for s, p in sorted_syms[:3]]
    bot3 = [{"simbolo": s, "pnl": round(p, 2)} for s, p in sorted_syms[-3:] if p < 0]

    saldo_inicial = (wallet or {}).get("saldo_inicial", 100000)
    saldo_livre   = (wallet or {}).get("saldo_livre",   saldo_inicial)
    roi_pct = ((saldo_livre - saldo_inicial) / saldo_inicial) * 100 if saldo_inicial else 0

    return {
        "perfil_id":       perfil_id,
        "total_compras":   len(compras),
        "total_vendas":    len(vendas),
        "win_rate":        round(len(wins) / len(vendas) * 100, 1),
        "total_pnl_brl":   round(total_pnl, 2),
        "avg_pnl_brl":     round(total_pnl / len(vendas), 2),
        "avg_win_brl":     round(avg_win, 2),
        "avg_loss_brl":    round(avg_loss, 2),
        "roi_pct":         round(roi_pct, 2),
        "saldo_livre":     round(saldo_livre, 2),
        "top_simbolos":    top3,
        "bot_simbolos":    bot3,
        "dados_suficientes": len(vendas) >= 5,
    }


# ── OpenAI call ───────────────────────────────────────────────────────────────

async def _chamar_openai(perfis_com_metricas: list[dict]) -> dict:
    """Envia métricas + configs ao OpenAI e retorna sugestões estruturadas."""
    if not settings.openai_api_key:
        raise HTTPException(503, "OPENAI_API_KEY não configurada no backend")

    from openai import AsyncOpenAI
    client = AsyncOpenAI(api_key=settings.openai_api_key)

    dados_txt = json.dumps(perfis_com_metricas, ensure_ascii=False, indent=2)

    system = """Você é um especialista em trading algorítmico de criptomoedas com futuros.
Analise as métricas de performance de cada perfil de trading e sugira ajustes precisos nos parâmetros.

Regras obrigatórias:
- Só sugira mudanças para perfis com dados_suficientes=true (≥5 trades fechados)
- Máximo 2 sugestões por perfil
- Cada sugestão altera UM campo com valor numérico específico
- Campos futuros: score_compra, score_venda, bull_pct_min, sl_pct, tp_pct, stake_base
- Campos bots: score_min, sl_pct, tp_pct, stake, max_positions
- sl_pct e tp_pct são decimais (ex: 0.008 = 0.8%)
- Se win_rate < 40%: sugerir filtros mais rígidos (score mais alto, bull_pct_min maior)
- Se win_rate > 60% mas roi_pct < 5%: sugerir aumentar stake ou tp_pct
- Se roi_pct < -10%: sugerir redução de risco (sl_pct menor, stake menor)
- Se avg_loss_brl é muito maior que avg_win_brl: ajustar proporção SL/TP
- Seja preciso: "score_compra de 60 → 65" não "aumentar um pouco"

Responda SOMENTE JSON válido com esta estrutura exata:
{
  "analises": [
    {
      "perfil_id": "string",
      "status": "otimo|bom|atencao|critico",
      "resumo": "frase curta sobre o desempenho",
      "sugestoes": [
        {
          "campo": "nome_do_campo",
          "valor_atual": 0.0,
          "valor_sugerido": 0.0,
          "motivo": "explicação clara e direta",
          "confianca": 85
        }
      ]
    }
  ]
}"""

    user_msg = f"""Analise estes perfis de trading com suas métricas e parâmetros atuais:

{dados_txt}

Retorne sugestões de melhoria em JSON conforme o formato solicitado."""

    resp = await client.chat.completions.create(
        model=settings.openai_model,
        messages=[
            {"role": "system", "content": system},
            {"role": "user",   "content": user_msg},
        ],
        response_format={"type": "json_object"},
        max_tokens=3000,
        temperature=0.1,
    )
    raw = resp.choices[0].message.content or "{}"
    return json.loads(raw)


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/cripto/ia/metricas")
async def get_metricas(tipo: str = "futures"):
    """Calcula e retorna métricas de performance de cada perfil a partir do MySQL."""
    if tipo not in VALID_TIPOS:
        raise HTTPException(400, f"tipo deve ser um de: {VALID_TIPOS}")

    all_trades = await trades_list(tipo=tipo, limit=10000)
    wallets    = await wallet_load_all(tipo)

    # Agrupar trades por perfil_id
    by_perfil: dict[str, list] = {}
    for t in all_trades:
        pid = t.get("perfil_id", "")
        by_perfil.setdefault(pid, []).append(t)

    # Coletar todos os perfil_ids conhecidos (trades + wallets)
    todos_ids = set(by_perfil.keys()) | set(wallets.keys())

    metricas = []
    for pid in sorted(todos_ids):
        m = _calcular_metricas(pid, by_perfil.get(pid, []), wallets.get(pid))
        # Enriquecer com config do perfil (futures)
        if tipo == "futures" and pid in PERFIS_META_BY_ID:
            m["config"] = PERFIS_META_BY_ID[pid]
        metricas.append(m)

    return {"tipo": tipo, "total": len(metricas), "metricas": metricas}


@router.post("/cripto/ia/analisar")
async def analisar(body: AnalisarIn):
    """
    Recebe configs + métricas do frontend, chama OpenAI e retorna sugestões.
    Salva resultado no MySQL (cache).
    """
    tipo = body.tipo
    if tipo not in VALID_TIPOS:
        raise HTTPException(400, f"tipo deve ser um de: {VALID_TIPOS}")

    # Busca métricas do MySQL para enriquecer os dados enviados pelo frontend
    all_trades = await trades_list(tipo=tipo, limit=10000)
    wallets    = await wallet_load_all(tipo)

    by_perfil: dict[str, list] = {}
    for t in all_trades:
        pid = t.get("perfil_id", "")
        by_perfil.setdefault(pid, []).append(t)

    # Monta lista: config do frontend + métricas do MySQL
    perfis_enriquecidos = []
    for cfg in body.perfis_config:
        pid = cfg.get("id") or cfg.get("perfil_id")
        if not pid:
            continue
        m = _calcular_metricas(pid, by_perfil.get(pid, []), wallets.get(pid))
        perfis_enriquecidos.append({**cfg, "metricas": m})

    if not perfis_enriquecidos:
        raise HTTPException(400, "Nenhum perfil válido enviado")

    # Chama OpenAI
    resultado = await _chamar_openai(perfis_enriquecidos)

    # Salva cache por perfil no MySQL
    analises: list[dict] = resultado.get("analises", [])
    for a in analises:
        pid = a.get("perfil_id")
        if pid:
            await ia_analise_save(pid, tipo, a)

    return {"tipo": tipo, "analises": analises, "total": len(analises)}


@router.get("/cripto/ia/analises")
async def get_analises(tipo: str = "futures"):
    """Retorna análises IA salvas (cache) sem chamar OpenAI novamente."""
    if tipo not in VALID_TIPOS:
        raise HTTPException(400, f"tipo deve ser um de: {VALID_TIPOS}")
    cache = await ia_analise_load_all(tipo)
    return {"tipo": tipo, "analises": list(cache.values()), "total": len(cache)}


@router.get("/cripto/ia/overrides")
async def get_overrides(tipo: str = "futures"):
    """Retorna todos os overrides de parâmetros aprovados."""
    if tipo not in VALID_TIPOS:
        raise HTTPException(400, f"tipo deve ser um de: {VALID_TIPOS}")
    ov = await overrides_load_all(tipo)
    return {"tipo": tipo, "overrides": ov}


@router.post("/cripto/ia/overrides")
async def save_override(body: OverridePatch):
    """Salva (ou mescla) um conjunto de overrides aprovados para um perfil."""
    tipo = body.wallet_tipo
    if tipo not in VALID_TIPOS:
        raise HTTPException(400, f"tipo deve ser um de: {VALID_TIPOS}")

    # Carrega overrides existentes e mescla
    existentes = await overrides_load_all(tipo)
    atual = existentes.get(body.perfil_id, {})
    merged = {**atual, **body.overrides}
    # Remove campos de metadados internos
    merged.pop("_aprovado_em", None)

    await overrides_save(body.perfil_id, tipo, merged)
    return {"ok": True, "perfil_id": body.perfil_id, "overrides": merged}


@router.delete("/cripto/ia/overrides/{perfil_id}")
async def delete_override(perfil_id: str, tipo: str = "futures"):
    """Remove todos os overrides de um perfil (reverte ao padrão)."""
    if tipo not in VALID_TIPOS:
        raise HTTPException(400, f"tipo deve ser um de: {VALID_TIPOS}")
    await overrides_delete(perfil_id, tipo)
    return {"ok": True, "perfil_id": perfil_id}
