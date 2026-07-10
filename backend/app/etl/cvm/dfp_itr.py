"""
ETL CVM — DFP (anual) e ITR (trimestral).

DFP: https://dados.cvm.gov.br/dados/CIA_ABERTA/DOC/DFP/DADOS/dfp_cia_aberta_{ano}.zip
ITR: https://dados.cvm.gov.br/dados/CIA_ABERTA/DOC/ITR/DADOS/itr_cia_aberta_{ano}.zip

Cada ZIP contém CSVs com prefixo:
  dfp_cia_aberta_BPA_con_{ano}.csv  — Balanço Patrimonial Ativo (consolidado)
  dfp_cia_aberta_BPP_con_{ano}.csv  — Balanço Patrimonial Passivo (consolidado)
  dfp_cia_aberta_DRE_con_{ano}.csv  — DRE consolidada
  dfp_cia_aberta_DFC_MI_con_{ano}.csv — DFC método indireto consolidado
  dfp_cia_aberta_DFC_MD_con_{ano}.csv — DFC método direto consolidado
  dfp_cia_aberta_DMPL_con_{ano}.csv — DMPL
  dfp_cia_aberta_DVA_con_{ano}.csv  — DVA

Para ITR, os prefixos são os mesmos mas com "itr_" no início.

Estratégia de carga:
  • Baixa um ano de cada vez
  • Faz upsert por (empresa, período, tipo_dem, cd_conta, versão)
  • Mantém histórico completo — nunca apaga dados
"""
import io
import logging
import zipfile
from datetime import date
from typing import Any

import pandas as pd
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from ...db import get_db
from ...db.models import Empresa, PeriodoReferencia, DemonstrativoLinha, DfcLinha
from ..base import EtlBase

logger = logging.getLogger(__name__)

CVM_DFP_BASE = "https://dados.cvm.gov.br/dados/CIA_ABERTA/DOC/DFP/DADOS"
CVM_ITR_BASE = "https://dados.cvm.gov.br/dados/CIA_ABERTA/DOC/ITR/DADOS"

# Mapeamento: sufixo do CSV → tipo_dem no nosso banco
TIPOS_DFP = {
    "BPA_con":    "BPA",
    "BPP_con":    "BPP",
    "DRE_con":    "DRE",
    "DFC_MI_con": "DFC_MI",
    "DFC_MD_con": "DFC_MD",
    "DMPL_con":   "DMPL",
    "DVA_con":    "DVA",
}


class CvmDfpEtl(EtlBase):
    """ETL para Demonstrações Financeiras Padronizadas (anuais)."""
    fonte = "CVM"
    tipo  = "DFP"

    def __init__(self, ano: int) -> None:
        super().__init__()
        self.ano = ano

    async def _extrair(self, **_) -> dict[str, pd.DataFrame]:
        url = f"{CVM_DFP_BASE}/dfp_cia_aberta_{self.ano}.zip"
        resp = await self._get(url, timeout=300)
        return _parsear_zip(resp.content, "dfp", self.ano)

    async def _transformar(self, dados: dict[str, pd.DataFrame]) -> dict[str, pd.DataFrame]:
        return {k: _limpar_df(df) for k, df in dados.items()}

    async def _carregar(self, dados: dict[str, pd.DataFrame]) -> None:
        async with get_db() as db:
            # Mapeia codigo_cvm → empresa_id (cache em memória)
            result = await db.execute(select(Empresa.id, Empresa.codigo_cvm))
            cvm_map: dict[str, int] = {row.codigo_cvm: row.id for row in result}

            for sufixo, df in dados.items():
                tipo_dem = TIPOS_DFP.get(sufixo, sufixo.upper())
                await _upsert_demonstrativo(db, df, cvm_map, tipo_dem, "DFP", self._inseridos)
                self._inseridos += len(df)


class CvmItrEtl(EtlBase):
    """ETL para Informações Trimestrais (ITR)."""
    fonte = "CVM"
    tipo  = "ITR"

    def __init__(self, ano: int) -> None:
        super().__init__()
        self.ano = ano

    async def _extrair(self, **_) -> dict[str, pd.DataFrame]:
        url = f"{CVM_ITR_BASE}/itr_cia_aberta_{self.ano}.zip"
        resp = await self._get(url, timeout=300)
        return _parsear_zip(resp.content, "itr", self.ano)

    async def _transformar(self, dados: dict[str, pd.DataFrame]) -> dict[str, pd.DataFrame]:
        return {k: _limpar_df(df) for k, df in dados.items()}

    async def _carregar(self, dados: dict[str, pd.DataFrame]) -> None:
        async with get_db() as db:
            result = await db.execute(select(Empresa.id, Empresa.codigo_cvm))
            cvm_map: dict[str, int] = {row.codigo_cvm: row.id for row in result}

            for sufixo, df in dados.items():
                tipo_dem = TIPOS_DFP.get(sufixo, sufixo.upper())
                await _upsert_demonstrativo(db, df, cvm_map, tipo_dem, "ITR", self._inseridos)
                self._inseridos += len(df)


# ── Helpers internos ──────────────────────────────────────────────────────────

def _parsear_zip(conteudo: bytes, prefixo: str, ano: int) -> dict[str, pd.DataFrame]:
    """Extrai e parseia os CSVs relevantes do ZIP do CVM."""
    resultado: dict[str, pd.DataFrame] = {}
    with zipfile.ZipFile(io.BytesIO(conteudo)) as z:
        for sufixo in TIPOS_DFP:
            nome_csv = f"{prefixo}_cia_aberta_{sufixo}_{ano}.csv"
            if nome_csv in z.namelist():
                with z.open(nome_csv) as f:
                    df = pd.read_csv(f, sep=";", encoding="latin-1", dtype=str, low_memory=False)
                    resultado[sufixo] = df
    return resultado


def _limpar_df(df: pd.DataFrame) -> pd.DataFrame:
    """Normaliza e limpa um DataFrame de demonstrativo CVM."""
    df = df.copy()
    df.columns = df.columns.str.strip()

    # Filtra apenas exercício mais recente de cada empresa (ÚLTIMO vs PENÚLTIMO)
    if "ORDEM_EXERC" in df.columns:
        df = df[df["ORDEM_EXERC"].str.strip() == "ÚLTIMO"].copy()

    # Zero-padding no código CVM
    if "CD_CVM" in df.columns:
        df["CD_CVM"] = df["CD_CVM"].astype(str).str.zfill(6)

    # Converte valor: troca vírgula por ponto
    if "VL_CONTA" in df.columns:
        df["VL_CONTA"] = (
            df["VL_CONTA"]
            .astype(str)
            .str.replace(",", ".", regex=False)
            .pipe(pd.to_numeric, errors="coerce")
        )
        # Aplica escala MIL → R$
        if "ESCALA_MOEDA" in df.columns:
            mask_mil = df["ESCALA_MOEDA"].str.strip().str.upper() == "MIL"
            df.loc[mask_mil, "VL_CONTA"] = df.loc[mask_mil, "VL_CONTA"] * 1_000

    # Datas
    for col in ["DT_INI_EXERC", "DT_FIM_EXERC", "DT_REFER"]:
        if col in df.columns:
            df[col] = pd.to_datetime(df[col], format="%Y-%m-%d", errors="coerce").dt.date

    return df


async def _upsert_demonstrativo(
    db, df: pd.DataFrame, cvm_map: dict[str, int],
    tipo_dem: str, tipo_periodo: str, contador: int
) -> None:
    """Faz upsert das linhas do demonstrativo no banco de dados."""
    BATCH = 500
    linhas = []

    for _, row in df.iterrows():
        cd_cvm = str(row.get("CD_CVM", "")).zfill(6)
        empresa_id = cvm_map.get(cd_cvm)
        if not empresa_id:
            continue

        dt_fim = row.get("DT_FIM_EXERC")
        if not dt_fim or pd.isna(dt_fim):
            continue

        # Obtém ou cria o periodo_referencia
        periodo_id = await _get_or_create_periodo(
            db, empresa_id, tipo_periodo,
            row.get("DT_INI_EXERC") or dt_fim,
            dt_fim,
            versao=int(row.get("VERSAO_DOCUMENTO", 1) or 1),
        )

        linhas.append({
            "periodo_id":        periodo_id,
            "tipo_dem":          tipo_dem,
            "cd_conta":          str(row.get("CD_CONTA", "")).strip(),
            "ds_conta":          str(row.get("DS_CONTA", "")).strip()[:200],
            "nivel":             int(row.get("NIVEL_CONTA", 1) or 1),
            "ordem":             int(row.get("ORDEM_EXERC_CONTA", 0) or 0) if "ORDEM_EXERC_CONTA" in df.columns else None,
            "vl_conta":          row.get("VL_CONTA") if pd.notna(row.get("VL_CONTA")) else None,
            "unidade_original":  str(row.get("ESCALA_MOEDA", "")).strip()[:10] or None,
        })

        if len(linhas) >= BATCH:
            await db.execute(pg_insert(DemonstrativoLinha).values(linhas).on_conflict_do_nothing())
            linhas.clear()

    if linhas:
        await db.execute(pg_insert(DemonstrativoLinha).values(linhas).on_conflict_do_nothing())


async def _get_or_create_periodo(
    db, empresa_id: int, tipo_periodo: str,
    dt_inicio: date, dt_fim: date, versao: int = 1,
) -> int:
    """Retorna o id de um PeriodoReferencia, criando se não existir."""
    result = await db.execute(
        select(PeriodoReferencia.id).where(
            PeriodoReferencia.empresa_id == empresa_id,
            PeriodoReferencia.tipo_periodo == tipo_periodo,
            PeriodoReferencia.dt_fim_exercicio == dt_fim,
            PeriodoReferencia.versao == versao,
            PeriodoReferencia.consolidado == True,
        )
    )
    row = result.scalar_one_or_none()
    if row:
        return row

    periodo = PeriodoReferencia(
        empresa_id           = empresa_id,
        tipo_periodo         = tipo_periodo,
        dt_inicio_exercicio  = dt_inicio,
        dt_fim_exercicio     = dt_fim,
        ano_exercicio        = dt_fim.year if hasattr(dt_fim, "year") else int(str(dt_fim)[:4]),
        trimestre            = None if tipo_periodo == "DFP" else _trimestre(dt_fim),
        versao               = versao,
        consolidado          = True,
    )
    db.add(periodo)
    await db.flush()
    return periodo.id


def _trimestre(dt: date) -> int:
    mes = dt.month if hasattr(dt, "month") else int(str(dt)[5:7])
    return (mes - 1) // 3 + 1
