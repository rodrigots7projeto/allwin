"""
Persistência de backtests, candidatos IA e histórico de gerações.
Usa arquivos JSON no diretório data/backtest/.
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

# ── Diretórios ────────────────────────────────────────────────────────────────

_BASE = Path(__file__).parent.parent.parent.parent / "data" / "backtest"
_RESULTS_DIR    = _BASE / "results"
_CANDIDATES_DIR = _BASE / "candidates"
_GENERATIONS_F  = _BASE / "generations.json"
_CUSTOM_PROFILES_F = _BASE / "custom_profiles.json"

for _d in (_RESULTS_DIR, _CANDIDATES_DIR):
    _d.mkdir(parents=True, exist_ok=True)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _read_json(path: Path, default: Any = None) -> Any:
    try:
        return json.loads(path.read_text("utf-8"))
    except Exception:
        return default


def _write_json(path: Path, data: Any) -> None:
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), "utf-8")


# ── Resultados de backtest ────────────────────────────────────────────────────

def save_result(result: dict) -> str:
    rid = result.get("id") or str(uuid.uuid4())
    result["id"] = rid
    _write_json(_RESULTS_DIR / f"{rid}.json", result)
    return rid


def get_result(rid: str) -> dict | None:
    p = _RESULTS_DIR / f"{rid}.json"
    return _read_json(p)


def list_results(limit: int = 50) -> list[dict]:
    files = sorted(_RESULTS_DIR.glob("*.json"), key=lambda f: f.stat().st_mtime, reverse=True)
    out = []
    for f in files[:limit]:
        d = _read_json(f, {})
        out.append({
            "id":          d.get("id"),
            "simbolo":     d.get("simbolo"),
            "perfil_id":   d.get("perfil_id"),
            "perfil_nome": d.get("perfil_nome"),
            "periodo":     d.get("periodo", {}),
            "metricas":    d.get("metricas", {}),
            "gerado_em":   d.get("gerado_em"),
        })
    return out


def delete_result(rid: str) -> bool:
    p = _RESULTS_DIR / f"{rid}.json"
    if p.exists():
        p.unlink()
        return True
    return False


# ── Candidatos IA ─────────────────────────────────────────────────────────────

def save_candidate(candidate: dict) -> str:
    cid = candidate.get("id") or str(uuid.uuid4())
    candidate["id"]       = cid
    candidate["status"]   = candidate.get("status", "pendente")
    candidate["criado_em"] = datetime.now(timezone.utc).isoformat()
    _write_json(_CANDIDATES_DIR / f"{cid}.json", candidate)
    return cid


def get_candidate(cid: str) -> dict | None:
    return _read_json(_CANDIDATES_DIR / f"{cid}.json")


def list_candidates(status: str | None = None) -> list[dict]:
    files = sorted(_CANDIDATES_DIR.glob("*.json"), key=lambda f: f.stat().st_mtime, reverse=True)
    out = []
    for f in files:
        d = _read_json(f, {})
        if status and d.get("status") != status:
            continue
        out.append(d)
    return out


def update_candidate_status(cid: str, status: str, nota: str = "") -> bool:
    p = _CANDIDATES_DIR / f"{cid}.json"
    d = _read_json(p)
    if d is None:
        return False
    d["status"]     = status
    d["nota"]       = nota
    d["atualizado_em"] = datetime.now(timezone.utc).isoformat()
    _write_json(p, d)
    return True


# ── Gerações / evolução ───────────────────────────────────────────────────────

def add_generation(entry: dict) -> None:
    gens = _read_json(_GENERATIONS_F, [])
    entry["id"]       = str(uuid.uuid4())
    entry["gerado_em"] = datetime.now(timezone.utc).isoformat()
    gens.append(entry)
    _write_json(_GENERATIONS_F, gens)


def list_generations(limit: int = 100) -> list[dict]:
    gens = _read_json(_GENERATIONS_F, [])
    return gens[-limit:]


# ── Perfis customizados (aprovados pela IA) ───────────────────────────────────

def save_custom_profile(profile: dict) -> str:
    profiles = _read_json(_CUSTOM_PROFILES_F, [])
    pid = profile.get("id") or f"ia_{str(uuid.uuid4())[:8]}"
    profile["id"] = pid
    profile["criado_em"] = datetime.now(timezone.utc).isoformat()
    profile["origem"] = "ia"
    # Remove se já existe
    profiles = [p for p in profiles if p["id"] != pid]
    profiles.append(profile)
    _write_json(_CUSTOM_PROFILES_F, profiles)
    return pid


def list_custom_profiles() -> list[dict]:
    return _read_json(_CUSTOM_PROFILES_F, [])


def get_custom_profile(pid: str) -> dict | None:
    profiles = _read_json(_CUSTOM_PROFILES_F, [])
    return next((p for p in profiles if p["id"] == pid), None)
