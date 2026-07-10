"""
IA Pesquisadora Quantitativa — AllWin Backtest
Analisa resultados de backtest, identifica padrões e gera candidatos de perfis.
"""

from __future__ import annotations

import json
import math
from typing import Any

from ..config import settings

# Lazy import do openai para não quebrar se não instalado
_openai_client = None


def _get_client():
    global _openai_client
    if _openai_client is None:
        from openai import AsyncOpenAI
        _openai_client = AsyncOpenAI(api_key=settings.openai_api_key)
    return _openai_client


# ── Análise de padrões (sem IA — baseado em dados) ───────────────────────────

def _analyze_by_hour(trades: list[dict]) -> dict[str, dict]:
    """Analisa performance por hora de entrada."""
    by_hour: dict[int, list[float]] = {}
    for t in trades:
        h = (t["entrada_ts"] // 3_600_000) % 24
        by_hour.setdefault(h, []).append(t["pnl"])
    return {
        str(h): {
            "trades":   len(pnls),
            "pnl_medio": round(sum(pnls) / len(pnls), 2),
            "win_rate":  round(sum(1 for p in pnls if p > 0) / len(pnls) * 100, 1),
        }
        for h, pnls in sorted(by_hour.items())
    }


def _analyze_by_weekday(trades: list[dict]) -> dict[str, dict]:
    """Performance por dia da semana."""
    DIAS = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"]
    by_day: dict[int, list[float]] = {}
    for t in trades:
        # timestamp ms → dias desde epoch → dia da semana (0=segunda)
        day = (t["entrada_ts"] // 86_400_000 + 3) % 7
        by_day.setdefault(day, []).append(t["pnl"])
    return {
        DIAS[d]: {
            "trades":    len(pnls),
            "pnl_total": round(sum(pnls), 2),
            "win_rate":  round(sum(1 for p in pnls if p > 0) / len(pnls) * 100, 1),
        }
        for d, pnls in sorted(by_day.items())
        if pnls
    }


def _best_worst_hours(by_hour: dict) -> tuple[list, list]:
    ranked = sorted(by_hour.items(), key=lambda x: x[1]["pnl_medio"], reverse=True)
    return (
        [{"hora": f"{h}h", **v} for h, v in ranked[:3]],
        [{"hora": f"{h}h", **v} for h, v in ranked[-3:]],
    )


def _statistical_patterns(trades: list[dict], metricas: dict) -> list[str]:
    """Extrai padrões estatísticos relevantes."""
    insights: list[str] = []

    if not trades:
        return insights

    # Horário
    by_hour = _analyze_by_hour(trades)
    best_h, worst_h = _best_worst_hours(by_hour)
    if best_h:
        h = best_h[0]
        insights.append(
            f"Melhor horário: {h['hora']} — Win Rate {h['win_rate']}%, PnL médio R${h['pnl_medio']}"
        )
    if worst_h and worst_h[0]["pnl_medio"] < 0:
        h = worst_h[0]
        insights.append(
            f"Pior horário: {h['hora']} — PnL médio negativo R${h['pnl_medio']}"
        )

    # Sequências
    max_seq_win = max_seq_loss = cur = 0
    prev = None
    for t in trades:
        ok = t["resultado"] == "ganho"
        if ok == prev:
            cur += 1
        else:
            cur  = 1
            prev = ok
        if ok and cur > max_seq_win:
            max_seq_win = cur
        elif not ok and cur > max_seq_loss:
            max_seq_loss = cur
    insights.append(f"Maior sequência de ganhos: {max_seq_win} operações")
    insights.append(f"Maior sequência de perdas: {max_seq_loss} operações")

    # Concentração
    ganhos = sorted([t["pnl"] for t in trades if t["pnl"] > 0], reverse=True)
    if len(ganhos) >= 5:
        top3   = sum(ganhos[:3])
        total  = sum(ganhos) or 1
        pct    = top3 / total * 100
        insights.append(f"Top 3 operações vencedoras = {pct:.0f}% do lucro total")
        if pct > 60:
            insights.append("⚠️ Alta concentração — lucro depende de poucas operações excepcionais")

    return insights


# ── Análise por IA (OpenAI) ───────────────────────────────────────────────────

async def analyze_results(results: list[dict]) -> dict[str, Any]:
    """
    Analisa múltiplos backtests com GPT e estatísticas locais.
    Retorna insights, padrões, pontos fracos e oportunidades.
    """
    if not results:
        return {"erro": "Nenhum resultado fornecido"}

    # Análise local primeiro
    all_trades = []
    for r in results:
        all_trades.extend(r.get("trades", []))

    by_hour    = _analyze_by_hour(all_trades)
    by_weekday = _analyze_by_weekday(all_trades)
    patterns   = _statistical_patterns(all_trades, results[0].get("metricas", {}))

    local_analysis = {
        "por_hora":       by_hour,
        "por_dia_semana": by_weekday,
        "padroes":        patterns,
    }

    # Análise IA
    if not settings.openai_api_key:
        return {
            "analise_local":  local_analysis,
            "analise_ia":     None,
            "aviso":          "OpenAI não configurado — apenas análise estatística disponível",
        }

    # Resumo compacto para o prompt
    resumo = []
    for r in results[:5]:  # limitar para não estourar context
        m = r.get("metricas", {})
        resumo.append({
            "simbolo":       r.get("simbolo"),
            "perfil":        r.get("perfil_nome"),
            "periodo":       r.get("periodo", {}),
            "retorno":       m.get("retorno_total"),
            "win_rate":      m.get("win_rate"),
            "profit_factor": m.get("profit_factor"),
            "max_drawdown":  m.get("max_drawdown"),
            "total_trades":  m.get("total_trades"),
            "sharpe":        m.get("sharpe"),
            "expectancia":   m.get("expectancia"),
        })

    prompt = f"""Você é um analista quantitativo sênior. Analise estes resultados de backtest de estratégias Day Trade em crypto:

{json.dumps(resumo, ensure_ascii=False, indent=2)}

Padrões estatísticos detectados:
{chr(10).join(f'- {p}' for p in patterns)}

Por dia da semana: {json.dumps(by_weekday, ensure_ascii=False)}

Com base nos dados, responda em JSON com este formato exato:
{{
  "resumo_executivo": "2-3 frases sobre a qualidade geral das estratégias",
  "pontos_fortes": ["lista de pontos positivos com evidências numéricas"],
  "pontos_fracos": ["lista de fraquezas identificadas com dados"],
  "oportunidades": ["sugestões concretas de melhoria com justificativa estatística"],
  "riscos": ["riscos identificados que precisam atenção"],
  "confianca_geral": 75,
  "recomendacao": "CONTINUAR|OTIMIZAR|REVISAR|DESCONTINUAR",
  "justificativa_recomendacao": "Explicação objetiva"
}}"""

    client = _get_client()
    try:
        resp = await client.chat.completions.create(
            model=settings.openai_model,
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
            temperature=0.3,
            max_tokens=1500,
        )
        ia_analysis = json.loads(resp.choices[0].message.content)
    except Exception as e:
        ia_analysis = {"erro": str(e)}

    return {
        "analise_local": local_analysis,
        "analise_ia":    ia_analysis,
    }


# ── Geração de candidato ──────────────────────────────────────────────────────

async def generate_candidate(
    base_perfil: dict,
    backtest_results: list[dict],
    geracao: int = 1,
) -> dict[str, Any]:
    """
    Gera um perfil candidato otimizado com base nos resultados de backtest.
    Nunca salva diretamente — retorna candidato para aprovação do usuário.
    """
    metricas = backtest_results[0].get("metricas", {}) if backtest_results else {}
    all_trades = []
    for r in backtest_results:
        all_trades.extend(r.get("trades", []))

    # Análise de horários para filtros temporais
    by_hour = _analyze_by_hour(all_trades)
    bad_hours = [
        int(h) for h, v in by_hour.items()
        if v["pnl_medio"] < 0 and v["trades"] >= 3
    ]

    # Fallback local (se sem OpenAI): variação sistemática de parâmetros
    if not settings.openai_api_key:
        return _generate_local_candidate(base_perfil, metricas, geracao, bad_hours)

    prompt = f"""Você é um quant developer. Crie um perfil candidato otimizado.

Perfil base:
{json.dumps(base_perfil, ensure_ascii=False, indent=2)}

Métricas do backtest atual:
- Retorno total: {metricas.get("retorno_total", 0):.2f}%
- Win Rate: {metricas.get("win_rate", 0):.2f}%
- Profit Factor: {metricas.get("profit_factor", 0):.3f}
- Max Drawdown: {metricas.get("max_drawdown", 0):.2f}%
- Sharpe Ratio: {metricas.get("sharpe", 0):.3f}
- Total operações: {metricas.get("total_trades", 0)}
- Expectância: R${metricas.get("expectancia", 0):.2f}

Horários problemáticos (PnL médio negativo): {bad_hours}

Geração: {geracao}

REGRAS OBRIGATÓRIAS para o candidato:
- score_compra: entre 35 e 85
- score_venda: entre 25 e 60
- bull_pct_min: entre 40 e 70
- sl_pct: entre 0.5 e 10.0
- tp_pct: entre 2.0 e 30.0
- tp_pct deve ser pelo menos 1.5× sl_pct (mínimo R:R de 1.5)
- Não altere: id, nome, capital_inicial, stake_base
- Variações por geração: Geração 1 = pequenas (±10%); Geração 2 = médias (±25%); Geração 3+ = maiores (±40%)

Responda em JSON:
{{
  "perfil_candidato": {{
    "id": "{base_perfil['id']}_v{geracao}",
    "nome": "Nome descritivo",
    "score_compra": 70,
    "score_venda": 45,
    "bull_pct_min": 55,
    "sl_pct": 2.0,
    "tp_pct": 6.0,
    "aguardar_ok": false,
    "apenas_aguardar": false,
    "score_max_compra": null,
    "stake_dupla_score": null,
    "capital_inicial": {base_perfil.get("capital_inicial", 10000)},
    "stake_base": {base_perfil.get("stake_base", 1000)}
  }},
  "hipotese": "O que a IA está tentando melhorar e por quê",
  "alteracoes": [
    {{"campo": "sl_pct", "de": 1.5, "para": 2.0, "motivo": "Reduzir stops prematuros observados nos dados"}}
  ],
  "metricas_esperadas": {{
    "win_rate_estimado": 60,
    "profit_factor_estimado": 1.8,
    "max_drawdown_estimado": 8.0
  }},
  "confianca": 72,
  "riscos": ["risco 1", "risco 2"],
  "geração": {geracao}
}}"""

    client = _get_client()
    try:
        resp = await client.chat.completions.create(
            model=settings.openai_model,
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
            temperature=0.4,
            max_tokens=2000,
        )
        candidate_data = json.loads(resp.choices[0].message.content)
        candidate_data["base_perfil_id"] = base_perfil["id"]
        candidate_data["backtest_ref_ids"] = [r.get("id") for r in backtest_results]
        candidate_data["status"] = "pendente"
        return candidate_data
    except Exception as e:
        return _generate_local_candidate(base_perfil, metricas, geracao, bad_hours, erro=str(e))


def _generate_local_candidate(
    base: dict,
    metricas: dict,
    geracao: int,
    bad_hours: list[int],
    erro: str = "",
) -> dict:
    """Variação sistemática de parâmetros sem IA."""
    fator = {1: 0.10, 2: 0.20, 3: 0.35}.get(geracao, 0.10)

    sc = base["score_compra"]
    sv = base["score_venda"]
    sl = base["sl_pct"]
    tp = base["tp_pct"]
    bp = base["bull_pct_min"]

    # Se drawdown alto → aumentar SL; se win_rate baixo → aumentar score_compra
    dd  = metricas.get("max_drawdown", 0)
    wr  = metricas.get("win_rate",     0)
    pf  = metricas.get("profit_factor", 1)

    if dd > 15:
        sl = max(0.5, sl * (1 - fator))   # apertar SL
        tp = max(2.0, tp * (1 - fator * 0.5))
    if wr < 45:
        sc = min(85, sc + fator * 10)     # threshold mais conservador
    if pf < 1.2:
        tp = min(30, tp * (1 + fator))    # aumentar alvo

    # Garantir R:R mínimo 1.5
    if tp < sl * 1.5:
        tp = round(sl * 1.8, 1)

    perfil_cand = {**base}
    perfil_cand["id"]          = f"{base['id']}_v{geracao}"
    perfil_cand["nome"]        = f"{base['nome']} Gen.{geracao}"
    perfil_cand["score_compra"]  = round(max(35, min(85, sc)), 1)
    perfil_cand["score_venda"]   = round(max(25, min(60, sv)), 1)
    perfil_cand["bull_pct_min"]  = round(max(40, min(70, bp)), 1)
    perfil_cand["sl_pct"]        = round(max(0.5, min(10, sl)), 2)
    perfil_cand["tp_pct"]        = round(max(2.0, min(30, tp)), 2)

    alteracoes = [
        {"campo": k, "de": base[k], "para": perfil_cand[k]}
        for k in ("score_compra", "score_venda", "sl_pct", "tp_pct", "bull_pct_min")
        if base.get(k) != perfil_cand[k]
    ]

    return {
        "perfil_candidato":    perfil_cand,
        "hipotese":            f"Variação sistemática geração {geracao} baseada em métricas (sem OpenAI{' — ' + erro if erro else ''})",
        "alteracoes":          alteracoes,
        "metricas_esperadas":  {},
        "confianca":           55,
        "riscos":              ["Sem validação por IA — resultado baseado em heurísticas"],
        "geração":             geracao,
        "base_perfil_id":      base["id"],
        "status":              "pendente",
    }
