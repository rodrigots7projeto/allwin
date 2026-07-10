"""
API v2 — Data Warehouse AllWin.

Endpoints organizados por domínio:
  /empresas   — cadastro, busca, governança, acionistas
  /cotacoes   — histórico OHLCV, última cotação, dividendos
  /demonstrativos — BP, DRE, DFC por empresa e período
  /indicadores — todos os indicadores calculados, histórico, setorial
  /valuation  — modelos de valuation, cenários, premissas
  /macro      — Selic, CDI, IPCA, câmbio, PIB
  /screener   — filtros avançados (P/L < X, ROE > Y, DY > Z...)
  /etl        — trigger manual de ETL, status dos pipelines
"""
from datetime import date
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func, and_, desc
from sqlalchemy.ext.asyncio import AsyncSession

from ...db import get_db
from ...db.models import (
    Empresa, Ticker, PeriodoReferencia, DemonstrativoLinha,
    IndicadorCalculado, SerieMacro, SerieMacroValor,
    CotacaoDiaria, Provento, EtlRun,
)
from ...calculadora.runner import CalculadoraRunner
from ...etl.cvm.cadastro import CvmCadastroEtl
from ...etl.cvm.dfp_itr import CvmDfpEtl, CvmItrEtl
from ...etl.bcb.series import BcbSeriesEtl

router = APIRouter(prefix="/v2", tags=["v2"])


# ── Dependency ─────────────────────────────────────────────────────────────────

async def _db():
    async with get_db() as db:
        yield db

DB = Annotated[AsyncSession, Depends(_db)]


# =============================================================================
# EMPRESAS
# =============================================================================

@router.get("/empresas", summary="Lista empresas cadastradas")
async def listar_empresas(
    db: DB,
    busca: str = Query(None, description="Busca por razão social ou ticker"),
    ativo: bool = Query(True, description="Apenas empresas ativas"),
    pagina: int = Query(1, ge=1),
    por_pagina: int = Query(50, le=200),
):
    """
    Lista todas as empresas abertas da B3/CVM.
    Filtra por razão social, ticker ou status (ativo/cancelado).
    """
    q = select(Empresa).where(Empresa.ativo == ativo)
    if busca:
        q = q.where(Empresa.razao_social.ilike(f"%{busca}%"))
    total = await db.scalar(select(func.count()).select_from(q.subquery()))
    empresas = await db.scalars(q.offset((pagina - 1) * por_pagina).limit(por_pagina))
    return {
        "total": total,
        "pagina": pagina,
        "por_pagina": por_pagina,
        "dados": [
            {
                "id":          e.id,
                "codigo_cvm":  e.codigo_cvm,
                "razao_social": e.razao_social,
                "nome_pregao": e.nome_pregao,
                "ativo":       e.ativo,
            }
            for e in empresas
        ],
    }


@router.get("/empresas/{codigo_cvm}", summary="Detalhes de uma empresa")
async def detalhe_empresa(codigo_cvm: str, db: DB):
    empresa = await db.scalar(
        select(Empresa).where(Empresa.codigo_cvm == codigo_cvm.zfill(6))
    )
    if not empresa:
        raise HTTPException(404, f"Empresa '{codigo_cvm}' não encontrada")
    return {
        "id":               empresa.id,
        "codigo_cvm":       empresa.codigo_cvm,
        "cnpj":             empresa.cnpj,
        "razao_social":     empresa.razao_social,
        "nome_fantasia":    empresa.nome_fantasia,
        "nome_pregao":      empresa.nome_pregao,
        "ativo":            empresa.ativo,
        "data_listagem":    empresa.data_listagem,
        "site_ri":          empresa.site_ri,
        "email_ri":         empresa.email_ri,
    }


@router.get("/empresas/{codigo_cvm}/tickers", summary="Tickers de uma empresa")
async def tickers_empresa(codigo_cvm: str, db: DB):
    empresa = await db.scalar(
        select(Empresa).where(Empresa.codigo_cvm == codigo_cvm.zfill(6))
    )
    if not empresa:
        raise HTTPException(404, f"Empresa '{codigo_cvm}' não encontrada")
    tickers = await db.scalars(
        select(Ticker).where(Ticker.empresa_id == empresa.id, Ticker.ativo == True)
    )
    return [
        {"ticker": t.ticker, "tipo": t.tipo, "principal": t.principal, "isin": t.isin}
        for t in tickers
    ]


# =============================================================================
# COTAÇÕES
# =============================================================================

@router.get("/cotacoes/{ticker}", summary="Cotações históricas de um ticker")
async def cotacoes_historicas(
    ticker: str,
    db: DB,
    data_inicio: Optional[date] = Query(None, description="YYYY-MM-DD"),
    data_fim:    Optional[date] = Query(None, description="YYYY-MM-DD"),
    limite:      int            = Query(252, le=5000, description="Número de registros"),
):
    """
    Retorna OHLCV histórico. Padrão: último ano (252 pregões).
    Use data_inicio/data_fim para filtrar períodos específicos.
    """
    t = await db.scalar(select(Ticker).where(Ticker.ticker == ticker.upper()))
    if not t:
        raise HTTPException(404, f"Ticker '{ticker}' não encontrado")

    q = select(CotacaoDiaria).where(CotacaoDiaria.ticker_id == t.id)
    if data_inicio:
        q = q.where(CotacaoDiaria.data >= data_inicio)
    if data_fim:
        q = q.where(CotacaoDiaria.data <= data_fim)

    cotacoes = await db.scalars(q.order_by(desc(CotacaoDiaria.data)).limit(limite))
    return [
        {
            "data":              str(c.data),
            "abertura":          float(c.abertura) if c.abertura else None,
            "maximo":            float(c.maximo) if c.maximo else None,
            "minimo":            float(c.minimo) if c.minimo else None,
            "fechamento":        float(c.fechamento),
            "fechamento_ajustado": float(c.fechamento_ajustado) if c.fechamento_ajustado else None,
            "volume":            c.volume,
            "volume_financeiro": float(c.volume_financeiro) if c.volume_financeiro else None,
        }
        for c in cotacoes
    ]


@router.get("/cotacoes/{ticker}/dividendos", summary="Histórico de proventos")
async def dividendos(ticker: str, db: DB, tipo: Optional[str] = None):
    t = await db.scalar(select(Ticker).where(Ticker.ticker == ticker.upper()))
    if not t:
        raise HTTPException(404, f"Ticker '{ticker}' não encontrado")
    q = select(Provento).where(Provento.ticker_id == t.id)
    if tipo:
        q = q.where(Provento.tipo == tipo.upper())
    proventos = await db.scalars(q.order_by(desc(Provento.data_ex)))
    return [
        {
            "tipo":            p.tipo,
            "data_ex":         str(p.data_ex) if p.data_ex else None,
            "data_pagamento":  str(p.data_pagamento) if p.data_pagamento else None,
            "valor_por_acao":  float(p.valor_por_acao) if p.valor_por_acao else None,
            "moeda":           p.moeda,
        }
        for p in proventos
    ]


# =============================================================================
# DEMONSTRATIVOS
# =============================================================================

@router.get("/demonstrativos/{codigo_cvm}", summary="Lista períodos disponíveis")
async def periodos_disponiveis(codigo_cvm: str, db: DB):
    empresa = await db.scalar(
        select(Empresa).where(Empresa.codigo_cvm == codigo_cvm.zfill(6))
    )
    if not empresa:
        raise HTTPException(404)
    periodos = await db.scalars(
        select(PeriodoReferencia)
        .where(PeriodoReferencia.empresa_id == empresa.id, PeriodoReferencia.consolidado == True)
        .order_by(desc(PeriodoReferencia.dt_fim_exercicio))
    )
    return [
        {
            "id":         p.id,
            "tipo":       p.tipo_periodo,
            "dt_fim":     str(p.dt_fim_exercicio),
            "ano":        p.ano_exercicio,
            "trimestre":  p.trimestre,
            "versao":     p.versao,
        }
        for p in periodos
    ]


@router.get("/demonstrativos/{codigo_cvm}/{tipo_dem}", summary="Linhas de um demonstrativo")
async def demonstrativo(
    codigo_cvm: str,
    tipo_dem: str,
    db: DB,
    ano: int = Query(..., description="Ano do exercício"),
):
    """
    Retorna as linhas brutas de um demonstrativo (BPA, BPP, DRE, DFC_MI, etc.)
    para o ano especificado, na versão mais recente disponível.
    """
    empresa = await db.scalar(
        select(Empresa).where(Empresa.codigo_cvm == codigo_cvm.zfill(6))
    )
    if not empresa:
        raise HTTPException(404)

    periodo = await db.scalar(
        select(PeriodoReferencia)
        .where(
            PeriodoReferencia.empresa_id == empresa.id,
            PeriodoReferencia.ano_exercicio == ano,
            PeriodoReferencia.consolidado == True,
        )
        .order_by(desc(PeriodoReferencia.versao))
        .limit(1)
    )
    if not periodo:
        raise HTTPException(404, f"Sem dados para {codigo_cvm} em {ano}")

    linhas = await db.scalars(
        select(DemonstrativoLinha)
        .where(
            DemonstrativoLinha.periodo_id == periodo.id,
            DemonstrativoLinha.tipo_dem == tipo_dem.upper(),
        )
        .order_by(DemonstrativoLinha.ordem)
    )
    return {
        "empresa":      empresa.razao_social,
        "codigo_cvm":   empresa.codigo_cvm,
        "tipo_dem":     tipo_dem.upper(),
        "ano":          ano,
        "versao":       periodo.versao,
        "dt_fim":       str(periodo.dt_fim_exercicio),
        "linhas": [
            {
                "cd_conta":  l.cd_conta,
                "ds_conta":  l.ds_conta,
                "nivel":     l.nivel,
                "vl_conta":  float(l.vl_conta) if l.vl_conta else None,
            }
            for l in linhas
        ],
    }


# =============================================================================
# INDICADORES CALCULADOS
# =============================================================================

@router.get("/indicadores/{codigo_cvm}", summary="Todos os indicadores da empresa")
async def indicadores_empresa(
    codigo_cvm: str,
    db: DB,
    categoria: Optional[str] = Query(None, description="LIQUIDEZ, RENTABILIDADE, MERCADO..."),
    ano: Optional[int] = Query(None, description="Filtrar por ano"),
):
    """
    Retorna todos os indicadores calculados internamente para a empresa.
    Inclui fórmula matemática e rastreabilidade completa.
    """
    empresa = await db.scalar(
        select(Empresa).where(Empresa.codigo_cvm == codigo_cvm.zfill(6))
    )
    if not empresa:
        raise HTTPException(404)

    q = select(IndicadorCalculado).where(
        IndicadorCalculado.empresa_id == empresa.id
    )
    if categoria:
        q = q.where(IndicadorCalculado.categoria == categoria.upper())
    if ano:
        q = q.where(
            func.extract("year", IndicadorCalculado.data_referencia) == ano
        )
    q = q.order_by(IndicadorCalculado.data_referencia, IndicadorCalculado.nome)

    inds = await db.scalars(q)
    return {
        "empresa":  empresa.razao_social,
        "dados": [
            {
                "nome":           i.nome,
                "categoria":      i.categoria,
                "valor":          float(i.valor) if i.valor else None,
                "unidade":        i.unidade,
                "formula":        i.formula,
                "data_referencia": str(i.data_referencia),
                "numerador":      float(i.numerador) if i.numerador else None,
                "denominador":    float(i.denominador) if i.denominador else None,
            }
            for i in inds
        ],
    }


@router.get("/indicadores/{codigo_cvm}/historico/{nome}", summary="Histórico de um indicador")
async def historico_indicador(codigo_cvm: str, nome: str, db: DB):
    """Retorna a evolução histórica de um indicador específico (ex: ROE, P_L, MARGEM_EBITDA)."""
    empresa = await db.scalar(
        select(Empresa).where(Empresa.codigo_cvm == codigo_cvm.zfill(6))
    )
    if not empresa:
        raise HTTPException(404)
    inds = await db.scalars(
        select(IndicadorCalculado)
        .where(
            IndicadorCalculado.empresa_id == empresa.id,
            IndicadorCalculado.nome == nome.upper(),
        )
        .order_by(IndicadorCalculado.data_referencia, desc(IndicadorCalculado.versao_calculo))
        .distinct(IndicadorCalculado.data_referencia)
    )
    return {
        "empresa":   empresa.razao_social,
        "indicador": nome.upper(),
        "historico": [
            {"data": str(i.data_referencia), "valor": float(i.valor) if i.valor else None}
            for i in inds
        ],
    }


# =============================================================================
# MACRO
# =============================================================================

@router.get("/macro/series", summary="Catálogo de séries macroeconômicas")
async def listar_series(db: DB):
    series = await db.scalars(select(SerieMacro).where(SerieMacro.ativo == True))
    return [
        {"id": s.id, "fonte": s.fonte, "codigo": s.codigo,
         "nome": s.nome, "frequencia": s.frequencia, "unidade": s.unidade}
        for s in series
    ]


@router.get("/macro/series/{fonte}/{codigo}", summary="Dados históricos de uma série macro")
async def dados_serie(
    fonte: str, codigo: str, db: DB,
    data_inicio: Optional[date] = Query(None),
    data_fim:    Optional[date] = Query(None),
    limite:      int = Query(1000, le=10000),
):
    serie = await db.scalar(
        select(SerieMacro)
        .where(SerieMacro.fonte == fonte.upper(), SerieMacro.codigo == codigo)
    )
    if not serie:
        raise HTTPException(404, f"Série {fonte}/{codigo} não encontrada")

    q = select(SerieMacroValor).where(SerieMacroValor.serie_id == serie.id)
    if data_inicio:
        q = q.where(SerieMacroValor.data >= data_inicio)
    if data_fim:
        q = q.where(SerieMacroValor.data <= data_fim)

    valores = await db.scalars(q.order_by(desc(SerieMacroValor.data)).limit(limite))
    return {
        "serie":    {"fonte": serie.fonte, "codigo": serie.codigo, "nome": serie.nome, "unidade": serie.unidade},
        "dados":    [{"data": str(v.data), "valor": float(v.valor)} for v in valores],
    }


# =============================================================================
# SCREENER
# =============================================================================

@router.get("/screener", summary="Filtro avançado de ações por indicadores")
async def screener(
    db: DB,
    pl_max:      Optional[float] = Query(None, description="P/L máximo"),
    roe_min:     Optional[float] = Query(None, description="ROE mínimo (ex: 0.15 = 15%)"),
    dy_min:      Optional[float] = Query(None, description="DY mínimo (ex: 0.06 = 6%)"),
    pvp_max:     Optional[float] = Query(None, description="P/VP máximo"),
    dl_ebitda_max: Optional[float] = Query(None, description="DL/EBITDA máximo"),
    margem_ebitda_min: Optional[float] = Query(None, description="Margem EBITDA mínima"),
    pagina:      int = Query(1, ge=1),
    por_pagina:  int = Query(50, le=200),
):
    """
    Screener quantitativo de ações.
    Filtra empresas com base em múltiplos indicadores calculados internamente.
    Todos os filtros são opcionais e acumulativos (AND).
    """
    # Última versão de cada indicador por empresa
    subq = (
        select(
            IndicadorCalculado.empresa_id,
            IndicadorCalculado.nome,
            func.max(IndicadorCalculado.data_referencia).label("dt_max"),
        )
        .group_by(IndicadorCalculado.empresa_id, IndicadorCalculado.nome)
        .subquery()
    )

    def filtro_indicador(nome: str, valor: float, operador: str) -> list:
        """Filtra empresa_ids onde indicador satisfaz a condição."""
        op = {">=": IndicadorCalculado.valor >= valor, "<=": IndicadorCalculado.valor <= valor}[operador]
        return (
            select(IndicadorCalculado.empresa_id)
            .join(subq, and_(
                IndicadorCalculado.empresa_id == subq.c.empresa_id,
                IndicadorCalculado.nome == subq.c.nome,
                IndicadorCalculado.data_referencia == subq.c.dt_max,
            ))
            .where(IndicadorCalculado.nome == nome, op)
        )

    q = select(Empresa.id, Empresa.razao_social, Empresa.codigo_cvm).where(Empresa.ativo == True)

    filtros = [
        ("P_L", pl_max, "<="),
        ("ROE", roe_min, ">="),
        ("DIVIDEND_YIELD", dy_min, ">="),
        ("P_VP", pvp_max, "<="),
        ("DL_EBITDA", dl_ebitda_max, "<="),
        ("MARGEM_EBITDA", margem_ebitda_min, ">="),
    ]
    for nome, valor, op in filtros:
        if valor is not None:
            q = q.where(Empresa.id.in_(filtro_indicador(nome, valor, op)))

    total = await db.scalar(select(func.count()).select_from(q.subquery()))
    empresas = await db.execute(q.offset((pagina - 1) * por_pagina).limit(por_pagina))

    return {
        "filtros_aplicados": {k: v for k, (n, v, _) in zip(
            ["pl_max", "roe_min", "dy_min", "pvp_max", "dl_ebitda_max", "margem_ebitda_min"],
            filtros
        ) if v is not None},
        "total": total,
        "pagina": pagina,
        "dados": [
            {"id": r.id, "razao_social": r.razao_social, "codigo_cvm": r.codigo_cvm}
            for r in empresas
        ],
    }


# =============================================================================
# ETL — OPERAÇÃO MANUAL
# =============================================================================

@router.post("/etl/cvm/cadastro", summary="Importa cadastro CVM", tags=["etl"])
async def etl_cvm_cadastro():
    """Baixa e importa o cadastro atualizado de empresas abertas da CVM."""
    resultado = await CvmCadastroEtl().run()
    return resultado


@router.post("/etl/cvm/dfp/{ano}", summary="Importa DFP de um ano", tags=["etl"])
async def etl_cvm_dfp(ano: int):
    """Baixa e importa as DFPs anuais do CVM para o ano especificado."""
    resultado = await CvmDfpEtl(ano).run()
    return resultado


@router.post("/etl/cvm/itr/{ano}", summary="Importa ITR de um ano", tags=["etl"])
async def etl_cvm_itr(ano: int):
    resultado = await CvmItrEtl(ano).run()
    return resultado


@router.post("/etl/bcb/series", summary="Importa séries BCB", tags=["etl"])
async def etl_bcb():
    resultado = await BcbSeriesEtl().run()
    return resultado


@router.post("/calculadora/{codigo_cvm}", summary="Recalcula indicadores", tags=["calculadora"])
async def recalcular(codigo_cvm: str, db: DB):
    """Recalcula todos os indicadores fundamentais de uma empresa."""
    empresa = await db.scalar(
        select(Empresa).where(Empresa.codigo_cvm == codigo_cvm.zfill(6))
    )
    if not empresa:
        raise HTTPException(404)
    resultado = await CalculadoraRunner(empresa.id).run()
    return resultado


@router.get("/etl/status", summary="Status das últimas execuções ETL", tags=["etl"])
async def etl_status(db: DB, limite: int = 20):
    runs = await db.scalars(
        select(EtlRun).order_by(desc(EtlRun.criado_em)).limit(limite)
    )
    return [
        {
            "fonte":       r.fonte,
            "tipo":        r.tipo,
            "status":      r.status,
            "inseridos":   r.linhas_inseridas,
            "duracao":     str(r.concluido_em - r.iniciado_em) if r.concluido_em and r.iniciado_em else None,
            "iniciado_em": str(r.iniciado_em) if r.iniciado_em else None,
        }
        for r in runs
    ]
