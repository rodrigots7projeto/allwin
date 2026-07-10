"""
ETL B3 — Catálogo de Empresas Listadas.

Fonte: API pública do site sistemaswebb3-listados.b3.com.br
       (mesma API que alimenta a busca em b3.com.br/pt_br/produtos-e-servicos/negociacao/renda-variavel/empresas-listadas)

Dados coletados:
  • 3.400+ empresas com CNPJ, codeCVM, segmento, mercado (NM, N2, etc.)
  • Todos os tickers de cada empresa (PN, ON, Units, etc.)
  • Classificação setorial (petróleo, bancos, etc.)
  • Nível de governança corporativa
  • Website corporativo

Frequência recomendada: semanal (poucas mudanças)
"""
import base64
import json
import logging
from typing import Any

import httpx

logger = logging.getLogger(__name__)

B3_LISTED_BASE = "https://sistemaswebb3-listados.b3.com.br/listedCompaniesProxy/CompanyCall"

# Índices de governança corporativa disponíveis via B3
INDICES_GOVERNANCA = {
    "NM":  "Novo Mercado",
    "N2":  "Nível 2",
    "N1":  "Nível 1",
    "MA":  "Bovespa Mais",
    "MB":  "Bovespa Mais Nível 2",
    "DR1": "BDR Nível 1",
    "DR2": "BDR Nível 2",
    "DR3": "BDR Nível 3",
    "DRE": "BDR de ETF",
    "DRN": "BDR não-patrocinado",
}


def _b64(obj: dict) -> str:
    return base64.b64encode(json.dumps(obj).encode()).decode()


# Cache em memória do catálogo completo (evita redownload por 1 hora)
_catalog_cache: list[dict] = []
_catalog_ts: float = 0.0
_CATALOG_TTL = 3600.0  # 1 hora


async def _get_catalog() -> list[dict]:
    """Retorna o catálogo completo de empresas, usando cache em memória."""
    import time
    global _catalog_cache, _catalog_ts
    if _catalog_cache and (time.time() - _catalog_ts) < _CATALOG_TTL:
        return _catalog_cache
    _catalog_cache = await listar_todas_empresas()
    _catalog_ts = time.time()
    return _catalog_cache


async def listar_todas_empresas() -> list[dict]:
    """
    Baixa o catálogo completo de empresas listadas na B3.
    Retorna lista de dicts com: codeCVM, companyName, tradingName, cnpj,
    marketIndicator, typeBDR, dateListing, status, segment, market.
    """
    params = {"language": "pt-br", "pageNumber": 1, "pageSize": 120}
    todas: list[dict] = []
    pagina = 1

    async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
        while True:
            params["pageNumber"] = pagina
            url = f"{B3_LISTED_BASE}/GetInitialCompanies/{_b64(params)}"
            try:
                resp = await client.get(url, headers={"Accept": "application/json"})
                resp.raise_for_status()
                data = resp.json()
            except Exception as e:
                logger.error("[B3-Catalog] Erro na página %d: %s", pagina, e)
                break

            resultados = data.get("results", [])
            todas.extend(resultados)

            pag_info = data.get("page", {})
            total = pag_info.get("totalRecords", 0)
            logger.info("[B3-Catalog] Página %d: %d empresas (total: %d)", pagina, len(resultados), total)

            if not resultados or len(todas) >= total:
                break
            pagina += 1

    logger.info("[B3-Catalog] Total baixado: %d empresas", len(todas))
    return todas


async def detalhar_empresa(code_cvm: str, issuing_company: str) -> dict | None:
    """
    Busca detalhes de uma empresa: setor, tickers (ON/PN/Units), ISIN, governança, site.
    A B3 retorna o JSON do detalhe como uma string JSON aninhada — fazemos double-parse.
    """
    params = {"codeCVM": code_cvm, "language": "pt-br"}
    url = f"{B3_LISTED_BASE}/GetDetail/{_b64(params)}"

    async with httpx.AsyncClient(timeout=20.0, follow_redirects=True) as client:
        try:
            resp = await client.get(url, headers={"Accept": "application/json"})
            if resp.status_code != 200:
                return None
            raw = resp.json()
            # A B3 às vezes retorna a string JSON como valor string (double-encoded)
            if isinstance(raw, str):
                raw = json.loads(raw)
            return raw if isinstance(raw, dict) else None
        except Exception as e:
            logger.warning("[B3-Catalog] Detalhe falhou para %s: %s", code_cvm, e)
    return None


async def buscar_empresa_por_ticker(ticker: str) -> dict | None:
    """
    Busca o registro completo de uma empresa pelo ticker (ex: PETR4).
    Estratégia:
      1. Carrega catálogo completo (~3.400 empresas) com cache em memória por 1 hora
      2. Busca match exato de issuingCompany (ex: 'PETR' para PETR4 / PETR3)
      3. Enriquece com GetDetail: setor, todos os tickers, ISIN, website, governança
    """
    ticker = ticker.upper().strip()
    codigo = ticker.rstrip("0123456789")  # PETR4 → PETR, KLBN11 → KLBN

    catalogo = await _get_catalog()
    empresa = next(
        (r for r in catalogo if r.get("issuingCompany", "").upper() == codigo),
        None,
    )

    if not empresa:
        logger.warning("[B3-Catalog] ticker %s (código %s) não encontrado no catálogo", ticker, codigo)
        return None

    # Enriquece com detalhes completos (setor, tickers, ISIN, site, governança)
    detalhe = await detalhar_empresa(empresa["codeCVM"], empresa.get("issuingCompany", ""))
    if detalhe:
        empresa = dict(empresa)  # não mutar o cache
        empresa.update({
            "industryClassification": detalhe.get("industryClassification"),
            "activity": detalhe.get("activity"),
            "website": detalhe.get("website"),
            "market": detalhe.get("market"),
            "otherCodes": detalhe.get("otherCodes", []),
        })

    return empresa
