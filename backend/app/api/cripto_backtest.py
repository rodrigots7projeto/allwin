"""
API de Backtest Inteligente — AllWin
Endpoints para executar backtests, gerenciar candidatos IA e consultar histórico.
"""

from __future__ import annotations

import uuid as _uuid
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


# ── Loop de Otimização IA (background task com polling) ───────────────────────

# Store em memória: task_id → estado da tarefa
_opt_tasks: dict[str, dict] = {}


class OptimizeLoopRequest(BaseModel):
    simbolo:       str   = Field("BTCUSDT")
    data_inicio:   str   = Field(..., example="2024-01-01")
    data_fim:      str   = Field(..., example="2025-01-01")
    custo_pct:     float = Field(0.04, ge=0, le=1)
    slippage_pct:  float = Field(0.05, ge=0, le=1)
    fear_greed:    int   = Field(50, ge=0, le=100)
    target_wr:     float = Field(50.0, ge=0, le=100)
    target_pf:     float = Field(1.3, ge=0)
    target_ops:    int   = Field(30, ge=5)
    target_return: float = Field(0.0)
    max_geracoes:  int   = Field(8, ge=1, le=15)


def _calc_dss(m: dict) -> float:
    if m.get("total_trades", 0) < 3:
        return 0.0
    wr  = m.get("win_rate", 0) * 0.40
    pf  = min(1.0, m.get("profit_factor", 0) / 3) * 25
    ret = min(20.0, max(-10.0, m.get("retorno_total", 0) * 0.15))
    dd  = -min(15.0, m.get("max_drawdown", 0) * 0.5)
    sh  = min(5.0, max(-5.0, m.get("sharpe", 0) * 2.5))
    return max(0.0, min(100.0, wr + pf + ret + dd + sh))


def _champion_dict(perfil: dict, result: dict, dss: float) -> dict:
    m = result.get("metricas", {})
    return {
        "perfil_id":     result.get("perfil_id", perfil.get("id")),
        "perfil_nome":   result.get("perfil_nome", perfil.get("nome")),
        "perfil_config": perfil,
        "dss":           round(dss, 1),
        "metricas":      m,
        "resultado_id":  result.get("id"),
    }


async def _run_optimize_bg(task_id: str, req: OptimizeLoopRequest, inicio: datetime, fim: datetime):
    task = _opt_tasks[task_id]

    def meets(m: dict) -> bool:
        return (
            m.get("win_rate", 0)      >= req.target_wr
            and m.get("profit_factor", 0) >= req.target_pf
            and m.get("total_trades", 0)  >= req.target_ops
            and m.get("retorno_total", 0) >= req.target_return
        )

    import logging as _logging
    _log = _logging.getLogger(__name__)

    try:
        # ── Fase 0: Baseline ─────────────────────────────────────────────────
        task["progresso"] = {"fase": "Testando perfis padrão…", "geracao_atual": 0, "total_geracoes": req.max_geracoes}
        baseline: list[dict] = []
        _baseline_erros: list[str] = []

        for p in PERFIS[:6]:
            try:
                r = await run_backtest(
                    simbolo=req.simbolo.upper(), perfil=p,
                    data_inicio=inicio, data_fim=fim,
                    custo_pct=req.custo_pct, slippage_pct=req.slippage_pct,
                    fear_greed=req.fear_greed,
                )
                if "erro" not in r:
                    dss = _calc_dss(r.get("metricas", {}))
                    _log.info(f"[backtest] {p['nome']} DSS={dss:.1f} trades={r.get('metricas',{}).get('total_trades',0)}")
                    baseline.append({"perfil": p, "result": r, "dss": dss})
                else:
                    _log.warning(f"[backtest] {p['nome']} erro={r['erro']}")
                    _baseline_erros.append(f"{p['nome']}: {r['erro']}")
            except Exception as exc:
                _log.error(f"[backtest] {p['nome']} exception={exc}")
                _baseline_erros.append(f"{p['nome']}: {exc}")

        if not baseline:
            detalhe = "; ".join(_baseline_erros[:2]) if _baseline_erros else "sem detalhe"
            task["status"] = "error"
            task["erro"] = f"Nenhum perfil padrão rodou com sucesso. Detalhe: {detalhe}"
            return

        baseline.sort(key=lambda x: x["dss"], reverse=True)
        best = baseline[0]

        task["geracoes"].append({
            "numero": 0, "tipo": "baseline",
            "descricao": f"Testados {len(baseline)} perfis padrão",
            "resultados_baseline": [
                {"perfil_nome": b["perfil"].get("nome"), "dss": round(b["dss"], 1),
                 "win_rate": b["result"]["metricas"].get("win_rate"),
                 "profit_factor": round(b["result"]["metricas"].get("profit_factor", 0), 2),
                 "retorno_total": round(b["result"]["metricas"].get("retorno_total", 0), 1),
                 "max_drawdown": round(b["result"]["metricas"].get("max_drawdown", 0), 1),
                 "total_trades": b["result"]["metricas"].get("total_trades")}
                for b in baseline
            ],
            "campeao_nome": best["perfil"].get("nome"),
            "campeao_dss":  round(best["dss"], 1),
            "converged": meets(best["result"]["metricas"]),
        })

        campeao_perfil = best["perfil"]
        campeao_result = best["result"]
        campeao_dss    = best["dss"]
        task["campeao"] = _champion_dict(campeao_perfil, campeao_result, campeao_dss)

        if meets(campeao_result["metricas"]):
            task["status"] = "done"; task["converged"] = True; return

        # ── Fases 1..N: Otimização iterativa ─────────────────────────────────
        for gen in range(1, req.max_geracoes + 1):
            task["progresso"] = {
                "fase": f"Geração {gen}/{req.max_geracoes} — otimizando parâmetros…",
                "geracao_atual": gen, "total_geracoes": req.max_geracoes,
            }

            try:
                candidate = await generate_candidate(
                    base_perfil=campeao_perfil,
                    backtest_results=[campeao_result],
                    geracao=gen,
                )
                perfil_cand = candidate.get("perfil_candidato", {})
                if not perfil_cand:
                    task["geracoes"].append({"numero": gen, "tipo": "erro", "erro": "Candidato vazio"}); continue

                r_cand = await run_backtest(
                    simbolo=req.simbolo.upper(), perfil=perfil_cand,
                    data_inicio=inicio, data_fim=fim,
                    custo_pct=req.custo_pct, slippage_pct=req.slippage_pct,
                    fear_greed=req.fear_greed,
                )
                if "erro" in r_cand:
                    task["geracoes"].append({"numero": gen, "tipo": "erro", "erro": r_cand["erro"]}); continue

                m_cand    = r_cand.get("metricas", {})
                dss_cand  = _calc_dss(m_cand)
                melhorou  = dss_cand > campeao_dss
                converged = meets(m_cand)

                task["geracoes"].append({
                    "numero": gen, "tipo": "otimizacao",
                    "hipotese":    candidate.get("hipotese", ""),
                    "alteracoes":  candidate.get("alteracoes", []),
                    "confianca":   candidate.get("confianca", 0),
                    "perfil_nome": perfil_cand.get("nome"),
                    "dss_anterior": round(campeao_dss, 1),
                    "dss_novo":     round(dss_cand, 1),
                    "melhorou":    melhorou,
                    "converged":   converged,
                    "perfil_config": perfil_cand,
                    "metricas": {
                        "win_rate":      m_cand.get("win_rate"),
                        "profit_factor": round(m_cand.get("profit_factor", 0), 2),
                        "retorno_total": round(m_cand.get("retorno_total", 0), 1),
                        "max_drawdown":  round(m_cand.get("max_drawdown", 0), 1),
                        "total_trades":  m_cand.get("total_trades"),
                        "sharpe":        round(m_cand.get("sharpe", 0), 2),
                    },
                })

                if melhorou:
                    campeao_perfil = perfil_cand
                    campeao_result = r_cand
                    campeao_dss    = dss_cand
                    task["campeao"] = _champion_dict(campeao_perfil, campeao_result, campeao_dss)

                if converged:
                    break

            except Exception as exc:
                task["geracoes"].append({"numero": gen, "tipo": "erro", "erro": str(exc)[:200]})

        task["status"]    = "done"
        task["converged"] = meets(campeao_result.get("metricas", {}))
        task["campeao"]   = _champion_dict(campeao_perfil, campeao_result, campeao_dss)

    except Exception as exc:
        task["status"] = "error"; task["erro"] = str(exc)[:500]


@router.post("/ai/optimize-loop/start")
async def start_optimize_loop(req: OptimizeLoopRequest, background_tasks: BackgroundTasks):
    """Inicia o loop de otimização IA em background. Retorna task_id para polling."""
    inicio = _parse_date(req.data_inicio)
    fim    = _parse_date(req.data_fim)
    if fim <= inicio:
        raise HTTPException(400, "data_fim deve ser posterior a data_inicio")
    if (fim - inicio).days < 30:
        raise HTTPException(400, "Período mínimo 30 dias para otimização")

    task_id = str(_uuid.uuid4())
    _opt_tasks[task_id] = {
        "status": "running",
        "geracoes": [],
        "progresso": {"fase": "Aguardando início…", "geracao_atual": 0, "total_geracoes": req.max_geracoes},
        "campeao": None,
        "converged": False,
        "criado_em": datetime.now(timezone.utc).isoformat(),
        "config": req.model_dump(),
    }
    background_tasks.add_task(_run_optimize_bg, task_id, req, inicio, fim)
    return {"task_id": task_id, "status": "running"}


@router.get("/ai/optimize-loop/{task_id}")
async def get_optimize_loop(task_id: str):
    """Retorna o estado atual do loop de otimização (use para polling)."""
    task = _opt_tasks.get(task_id)
    if task is None:
        raise HTTPException(404, "Task não encontrada")
    return task


# ── Deploy de perfil IA → Futures ─────────────────────────────────────────────

class DeployFuturesRequest(BaseModel):
    campeao: dict
    simbolo: str = "BTCUSDT"
    periodo: str = "1 ano"


@router.post("/ia-futures-profiles")
async def deploy_to_futures(req: DeployFuturesRequest):
    """Converte o campeão IA e salva como perfil disponível no Futures."""
    from ..cripto.backtest_store import save_ia_futures_profile

    campeao = req.campeao
    cfg     = campeao.get("perfil_config", {})
    m       = campeao.get("metricas", {})

    sc  = float(cfg.get("score_compra", 55))
    sl  = float(cfg.get("sl_pct", 2.0))
    tp  = float(cfg.get("tp_pct", 6.0))

    # Derivar sub-score thresholds do score_compra (escala linear)
    tec_l = round(max(30, min(75, sc)))
    flx_l = round(max(27, min(68, sc * 0.92)))
    ctx_l = round(max(27, min(68, sc * 0.92)))
    fnd_l = round(max(12, min(55, sc * 0.70)))
    tec_s = round(max(20, min(60, (100 - sc) * 0.58)))
    flx_s = round(max(22, min(65, (100 - sc) * 0.63)))
    ctx_s = round(max(20, min(65, sc * 0.85)))
    fnd_s = round(max(10, min(52, sc * 0.67)))

    futures_profile = {
        "id":            f"ia_{cfg.get('id', 'custom')}",
        "nome":          f"[IA] {cfg.get('nome', 'Perfil IA')}",
        "nivel":         "Normal",
        "emoji":         "🤖",
        "cor":           "#8b5cf6",
        "score_compra":  sc,
        "score_venda":   float(cfg.get("score_venda", 35)),
        "bull_pct_min":  float(cfg.get("bull_pct_min", 50)),
        "sl_pct":        round(sl / 100, 5),
        "tp_pct":        round(tp / 100, 5),
        "aguardar_ok":   bool(cfg.get("aguardar_ok", True)),
        "apenas_aguardar": bool(cfg.get("apenas_aguardar", False)),
        "capital_inicial": float(cfg.get("capital_inicial", 100_000)),
        "stake_base":    float(cfg.get("stake_base", 1000)),
        "direction_allowed": "BOTH",
        "long_filter":   {"tec_min": tec_l, "flx_min": flx_l, "ctx_min": ctx_l, "fnd_min": fnd_l},
        "short_filter":  {"tec_max": tec_s, "flx_max": flx_s, "ctx_min": ctx_s, "fnd_min": fnd_s},
        "descricao": (
            f"[IA] Gerado por otimização automática em {req.simbolo} ({req.periodo}). "
            f"WR {m.get('win_rate', 0)}% / PF {m.get('profit_factor', 0):.2f} / "
            f"Retorno {m.get('retorno_total', 0):.1f}% / DD -{m.get('max_drawdown', 0):.1f}% / DSS {campeao.get('dss', 0)}"
        ),
        "origem": "ia_backtest",
        "dss": campeao.get("dss", 0),
        "metricas_backtest": {
            "win_rate":      m.get("win_rate"),
            "profit_factor": m.get("profit_factor"),
            "retorno_total": m.get("retorno_total"),
            "max_drawdown":  m.get("max_drawdown"),
            "total_trades":  m.get("total_trades"),
            "sharpe":        m.get("sharpe"),
            "dss":           campeao.get("dss"),
        },
        "simbolo_backtest": req.simbolo,
        "periodo_backtest": req.periodo,
    }

    pid = save_ia_futures_profile(futures_profile)
    futures_profile["id"] = pid
    return {
        "ok": True,
        "perfil_id": pid,
        "mensagem":  f"Perfil '{futures_profile['nome']}' disponível no Futures",
        "perfil":    futures_profile,
    }


@router.get("/ia-futures-profiles")
async def list_ia_futures():
    from ..cripto.backtest_store import list_ia_futures_profiles
    return list_ia_futures_profiles()


@router.delete("/ia-futures-profiles/{pid}")
async def delete_ia_futures(pid: str):
    from ..cripto.backtest_store import remove_ia_futures_profile
    ok = remove_ia_futures_profile(pid)
    if not ok:
        raise HTTPException(404, "Perfil IA não encontrado")
    return {"ok": True}
