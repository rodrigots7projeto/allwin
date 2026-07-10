"""
ETL B3 — Composição de Índices.

Fonte: cotacao.b3.com.br/mds/api/v1/IndexComposition/{codigo}
       (API pública que alimenta o site oficial da B3)

Índices suportados:
  IBOV   → Ibovespa (principal, ~78 ativos)
  SMLL   → Small Cap
  MIDL   → Mid Large Cap
  IDIV   → Dividendos
  IFIX   → FIIs
  MLCX   → Mid-Large Cap Extended
  ITAG   → Tag Along Diferenciado
  IGCT   → Governança Corporativa Trade
  IMAT   → Materiais Básicos
  ICON   → Consumo
  IFNC   → Financeiro
  UTIL   → Utilidade Pública
  IMOB   → Imobiliário
  INDX   → Industriais
  IBRA   → Brasil Amplo

Frequência recomendada: mensal (rebalanceamento quadrimestral da B3)
"""
import logging
from typing import Any

import httpx

logger = logging.getLogger(__name__)

B3_COTACAO_BASE = "https://cotacao.b3.com.br/mds/api/v1"

INDICES_B3 = [
    ("IBOV",  "Ibovespa"),
    ("SMLL",  "Small Cap"),
    ("MIDL",  "Mid Large Cap"),
    ("IDIV",  "Dividendos"),
    ("IFIX",  "FIIs"),
    ("MLCX",  "Mid-Large Cap Extended"),
    ("ITAG",  "Tag Along Diferenciado"),
    ("IGCT",  "Governança Corp. Trade"),
    ("IMAT",  "Materiais Básicos"),
    ("ICON",  "Consumo"),
    ("IFNC",  "Financeiro"),
    ("UTIL",  "Utilidade Pública"),
    ("IMOB",  "Imobiliário"),
    ("INDX",  "Industriais"),
    ("IBRA",  "Brasil Amplo"),
]


async def buscar_composicao_indice(codigo: str) -> list[dict]:
    """
    Retorna a composição de um índice B3.

    Retorno: lista de dicts com:
      • symb          → ticker (ex: 'PETR4')
      • desc          → descrição curta ('PETROBRAS   PN      N2')
      • weight_pct    → peso percentual no índice (ex: 5.23)
      • theoretical_qty → quantidade teórica
    """
    url = f"{B3_COTACAO_BASE}/IndexComposition/{codigo.upper()}"

    async with httpx.AsyncClient(timeout=20.0, follow_redirects=True) as client:
        try:
            resp = await client.get(url, headers={"Accept": "application/json"})
            resp.raise_for_status()
            data = resp.json()
        except Exception as e:
            logger.error("[B3-Index] %s falhou: %s", codigo, e)
            return []

    if data.get("BizSts", {}).get("cd") != "OK":
        logger.warning("[B3-Index] %s status não-OK: %s", codigo, data.get("BizSts"))
        return []

    itens = data.get("UnderlyingList", [])
    resultado = []
    for item in itens:
        ticker = item.get("symb")
        if not ticker:
            continue
        resultado.append({
            "ticker":          ticker,
            "descricao":       item.get("desc", "").strip(),
            "peso_pct":        round(float(item.get("indxCmpnPctg") or 0), 4),
            "qtd_teorica":     item.get("indexTheoreticalQty"),
        })

    logger.info("[B3-Index] %s: %d ativos", codigo, len(resultado))
    return resultado


# Cache em memória dos índices (renovado a cada 6 horas)
_indices_cache: dict[str, list[dict]] = {}
_indices_ts: float = 0.0
_INDICES_TTL = 6 * 3600.0


async def buscar_todos_indices() -> dict[str, list[dict]]:
    """Baixa a composição de todos os índices B3 em paralelo, com cache em memória."""
    import asyncio
    import time
    global _indices_cache, _indices_ts

    if _indices_cache and (time.time() - _indices_ts) < _INDICES_TTL:
        return _indices_cache

    async def _fetch(codigo: str, nome: str):
        comps = await buscar_composicao_indice(codigo)
        return codigo, nome, comps

    tarefas = [_fetch(cod, nom) for cod, nom in INDICES_B3]
    resultados_raw = await asyncio.gather(*tarefas, return_exceptions=True)

    resultado: dict[str, list[dict]] = {}
    for r in resultados_raw:
        if isinstance(r, Exception):
            logger.error("[B3-Index] Erro em tarefa: %s", r)
            continue
        codigo, nome, comps = r
        resultado[codigo] = comps

    _indices_cache = resultado
    _indices_ts = time.time()
    logger.info("[B3-Index] Cache atualizado: %d índices", len(resultado))
    return resultado


async def pertence_a_indices(ticker: str) -> list[str]:
    """
    Retorna quais índices B3 um determinado ticker compõe.
    Útil para exibir badges IBOV/IDIV/IFIX no card de ativo.
    """
    ticker = ticker.upper()
    todos = await buscar_todos_indices()
    indices = []
    for codigo, composicao in todos.items():
        if any(c["ticker"] == ticker for c in composicao):
            indices.append(codigo)
    return indices
