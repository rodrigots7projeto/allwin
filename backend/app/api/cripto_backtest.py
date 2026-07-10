"""
API de Backtest Inteligente — AllWin
Endpoints para executar backtests, gerenciar candidatos IA e consultar histórico.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel, Field

from ..cripto.backtest_engine import run_backtest, optimize_scores
from ..cripto.backtest_profiles import get_all_profiles, get_profile, PERFIS
from ..cripto.backtest_store import (
    add_generation,
    delete_result,
    get_candidate,
    get_result,
    list_candidates,
    list_custom_profiles,
    list_generations,
    list_results,
    save_candidate,
    save_custom_profile,
    save_result,
    update_candidate_status,
)
from ..cripto.backtest_ai import analyze_results, generate_candidate

router = APIRouter(prefix="/cripto/backtest", tags=["backtest"])

# ── Modelos ───────────────────────────────────────────────────────────────────

class RunRequest(BaseModel):
    simbolo:       str   = Field(..., example="BTCUSDT")
    perfil_id:     str   = Field(..., example="cons_normal")
    data_inicio:   str   = Field(..., example="2024-01-01", description="YYYY-MM-DD")
    data_fim:      str   = Field(..., example="2024-12-31", description="YYYY-MM-DD")
    capital:       Optional[float] = None
    custo_pct:     float = Field(0.04, ge=0, le=1)
    slippage_pct:  float = Field(0.05, ge=0, le=1)
    fear_greed:    int   = Field(50, ge=0, le=100)


class AnalyzeRequest(BaseModel):
    result_ids: list[str]


class GenerateRequest(BaseModel):
    perfil_id:   str
    result_ids:  list[str]
    geracao:     int = Field(1, ge=1, le=10)


class OptimizeRequest(BaseModel):
    simbolo:      str   = Field("BTCUSDT", example="BTCUSDT")
    perfil_id:    str   = Field(..., example="cons_normal")
    data_inicio:  str   = Field(..., example="2020-01-01")
    data_fim:     str   = Field(..., example="2025-01-01")
    custo_pct:    float = Field(0.04, ge=0, le=1)
    slippage_pct: float = Field(0.05, ge=0, le=1)
    fear_greed:   int   = Field(50, ge=0, le=100)


class ApproveRequest(BaseModel):
    nota: str = ""


class CandidateStatus(BaseModel):
    status: str  # pendente|aprovado|rejeitado
    nota:   str = ""


# ── Helpers ───────────────────────────────────────────────────────────────────

def _parse_date(s: str) -> datetime:
    try:
        return datetime.strptime(s, "%Y-%m-%d").replace(tzinfo=timezone.utc)
    except ValueError:
        raise HTTPException(400, f"Data inválida: {s}. Use YYYY-MM-DD")


# ── Perfis ────────────────────────────────────────────────────────────────────

@router.get("/profiles")
async def list_profiles():
    """Lista todos os perfis disponíveis (builtin + aprovados pela IA)."""
    builtin  = get_all_profiles()
    custom   = list_custom_profiles()
    return {
        "builtin": builtin,
        "custom":  custom,
        "total":   len(builtin) + len(custom),
    }


# ── Backtest ──────────────────────────────────────────────────────────────────

@router.post("/run")
async def run(req: RunRequest):
    """
    Executa um backtest completo para um perfil e período.
    Pode levar 15-60 segundos dependendo do período.
    """
    perfil = get_profile(req.perfil_id)
    if not perfil:
        # Tentar perfis customizados
        from ..cripto.backtest_store import get_custom_profile
        perfil = get_custom_profile(req.perfil_id)
    if not perfil:
        raise HTTPException(404, f"Perfil '{req.perfil_id}' não encontrado")

    # Override capital se fornecido
    if req.capital:
        perfil = {**perfil, "capital_inicial": req.capital, "stake_base": req.capital * 0.1}

    inicio = _parse_date(req.data_inicio)
    fim    = _parse_date(req.data_fim)

    if fim <= inicio:
        raise HTTPException(400, "data_fim deve ser posterior a data_inicio")

    dias = (fim - inicio).days
    if dias < 7:
        raise HTTPException(400, "Período mínimo de 7 dias")
    if dias > 730:
        raise HTTPException(400, "Período máximo de 2 anos")

    resultado = await run_backtest(
        simbolo=req.simbolo.upper(),
        perfil=perfil,
        data_inicio=inicio,
        data_fim=fim,
        custo_pct=req.custo_pct,
        slippage_pct=req.slippage_pct,
        fear_greed=req.fear_greed,
    )

    if "erro" in resultado:
        raise HTTPException(422, resultado["erro"])

    rid = save_result(resultado)
    resultado["id"] = rid
    return resultado


@router.get("/results")
async def get_results(limit: int = 50):
    """Lista os últimos backtests realizados."""
    return list_results(limit=limit)


@router.get("/results/{rid}")
async def get_result_by_id(rid: str):
    """Retorna um backtest completo (com trades e equity curve)."""
    r = get_result(rid)
    if r is None:
        raise HTTPException(404, "Backtest não encontrado")
    return r


@router.delete("/results/{rid}")
async def delete_result_endpoint(rid: str):
    ok = delete_result(rid)
    if not ok:
        raise HTTPException(404, "Backtest não encontrado")
    return {"ok": True}


# ── Otimização de score ───────────────────────────────────────────────────────

@router.post("/optimize-scores")
async def optimize_scores_endpoint(req: OptimizeRequest):
    """
    Testa múltiplos valores de score_compra sobre dados históricos e retorna
    o score ótimo para o perfil informado.
    Pode levar 1-3 minutos dependendo do período (usa dados reais da Binance).
    """
    perfil = get_profile(req.perfil_id)
    if not perfil:
        from ..cripto.backtest_store import get_custom_profile
        perfil = get_custom_profile(req.perfil_id)
    if not perfil:
        raise HTTPException(404, f"Perfil '{req.perfil_id}' não encontrado")

    inicio = _parse_date(req.data_inicio)
    fim    = _parse_date(req.data_fim)

    if fim <= inicio:
        raise HTTPException(400, "data_fim deve ser posterior a data_inicio")
    if (fim - inicio).days < 30:
        raise HTTPException(400, "Período mínimo de 30 dias para otimização")

    resultado = await optimize_scores(
        simbolo=req.simbolo.upper(),
        data_inicio=inicio,
        data_fim=fim,
        perfil_base=perfil,
        custo_pct=req.custo_pct,
        slippage_pct=req.slippage_pct,
        fear_greed=req.fear_greed,
    )

    if "erro" in resultado:
        raise HTTPException(422, resultado["erro"])

    return resultado


# ── IA Pesquisadora ───────────────────────────────────────────────────────────

@router.post("/ai/analyze")
async def ai_analyze(req: AnalyzeRequest):
    """
    Analisa múltiplos backtests com IA e estatísticas.
    Identifica padrões, pontos fracos e oportunidades.
    """
    results = []
    for rid in req.result_ids:
        r = get_result(rid)
        if r:
            results.append(r)

    if not results:
        raise HTTPException(404, "Nenhum backtest válido encontrado")

    analysis = await analyze_results(results)
    return analysis


@router.post("/ai/generate")
async def ai_generate(req: GenerateRequest):
    """
    Gera um perfil candidato otimizado com base nos resultados de backtest.
    O candidato NÃO é salvo como perfil — precisa de aprovação.
    """
    perfil = get_profile(req.perfil_id)
    if not perfil:
        from ..cripto.backtest_store import get_custom_profile
        perfil = get_custom_profile(req.perfil_id)
    if not perfil:
        raise HTTPException(404, f"Perfil '{req.perfil_id}' não encontrado")

    results = [r for rid in req.result_ids if (r := get_result(rid))]

    candidate = await generate_candidate(
        base_perfil=perfil,
        backtest_results=results,
        geracao=req.geracao,
    )

    # Salvar como candidato pendente
    cid = save_candidate(candidate)
    candidate["id"] = cid

    # Registrar na linha de gerações
    add_generation({
        "tipo":        "candidato_gerado",
        "candidate_id": cid,
        "base_perfil":  req.perfil_id,
        "geracao":      req.geracao,
        "confianca":    candidate.get("confianca", 0),
        "hipotese":     candidate.get("hipotese", ""),
    })

    return candidate


# ── Candidatos ────────────────────────────────────────────────────────────────

@router.get("/candidates")
async def list_candidates_endpoint(status: Optional[str] = None):
    """Lista candidatos de perfis gerados pela IA."""
    return list_candidates(status=status)


@router.get("/candidates/{cid}")
async def get_candidate_endpoint(cid: str):
    c = get_candidate(cid)
    if not c:
        raise HTTPException(404, "Candidato não encontrado")
    return c


@router.post("/candidates/{cid}/approve")
async def approve_candidate(cid: str, req: ApproveRequest):
    """
    Aprova um candidato e o promove a perfil definitivo.
    SÓ cria o perfil após esta ação explícita do usuário.
    """
    candidate = get_candidate(cid)
    if not candidate:
        raise HTTPException(404, "Candidato não encontrado")
    if candidate.get("status") != "pendente":
        raise HTTPException(400, f"Candidato já está '{candidate['status']}'")

    perfil_novo = candidate.get("perfil_candidato", {})
    if not perfil_novo:
        raise HTTPException(422, "Candidato sem perfil definido")

    pid = save_custom_profile(perfil_novo)
    update_candidate_status(cid, "aprovado", req.nota)

    add_generation({
        "tipo":          "aprovacao",
        "candidate_id":  cid,
        "perfil_novo_id": pid,
        "nota":          req.nota,
    })

    return {
        "ok":            True,
        "perfil_novo_id": pid,
        "mensagem":      f"Perfil '{perfil_novo.get('nome')}' criado com sucesso",
    }


@router.post("/candidates/{cid}/reject")
async def reject_candidate(cid: str, req: ApproveRequest):
    """Rejeita um candidato. Nenhum perfil é criado."""
    ok = update_candidate_status(cid, "rejeitado", req.nota)
    if not ok:
        raise HTTPException(404, "Candidato não encontrado")
    add_generation({"tipo": "rejeicao", "candidate_id": cid, "nota": req.nota})
    return {"ok": True, "mensagem": "Candidato rejeitado"}


@router.post("/candidates/{cid}/revise")
async def revise_candidate(cid: str, req: GenerateRequest):
    """Solicita nova variação do candidato (nova geração)."""
    candidate = get_candidate(cid)
    if not candidate:
        raise HTTPException(404, "Candidato não encontrado")

    perfil_base_id = candidate.get("base_perfil_id", req.perfil_id)
    perfil = get_profile(perfil_base_id) or get_profile(req.perfil_id)
    if not perfil:
        raise HTTPException(404, "Perfil base não encontrado")

    results = [r for rid in req.result_ids if (r := get_result(rid))]
    next_gen = candidate.get("geração", 1) + 1

    new_candidate = await generate_candidate(
        base_perfil=perfil,
        backtest_results=results,
        geracao=next_gen,
    )
    cid_new = save_candidate(new_candidate)
    new_candidate["id"] = cid_new

    # Marcar anterior como revisado
    update_candidate_status(cid, "revisado", f"Substituído por {cid_new}")

    return new_candidate


# ── Gerações ──────────────────────────────────────────────────────────────────

@router.get("/generations")
async def get_generations(limit: int = 100):
    """Histórico completo de gerações e decisões da IA."""
    return list_generations(limit=limit)
