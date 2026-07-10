"""
ETL CVM — Cadastro de Empresas Abertas.

Fonte: https://dados.cvm.gov.br/dados/CIA_ABERTA/CAD/DADOS/cad_cia_aberta.csv
Frequência: diária (atualizado pela CVM a cada dia útil)

Extrai:
  • Código CVM, CNPJ, razão social, nome pregão
  • Situação (ATIVO/CANCELADO)
  • Setor, segmento (quando disponível)
  • Endereço RI, site
"""
import io
import logging
from typing import Any

import pandas as pd
from sqlalchemy import select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert

from ...db import get_db
from ...db.models import Empresa
from ..base import EtlBase

logger = logging.getLogger(__name__)

CAD_URL = "https://dados.cvm.gov.br/dados/CIA_ABERTA/CAD/DADOS/cad_cia_aberta.csv"


class CvmCadastroEtl(EtlBase):
    fonte = "CVM"
    tipo  = "CADASTRO_EMPRESAS"

    async def _extrair(self, **_) -> bytes:
        resp = await self._get(CAD_URL, timeout=120)
        return resp.content

    async def _transformar(self, dados_brutos: bytes) -> pd.DataFrame:
        df = pd.read_csv(
            io.BytesIO(dados_brutos),
            sep=";",
            encoding="latin-1",
            dtype=str,
            low_memory=False,
        )
        df.columns = df.columns.str.strip()

        # Normaliza: mantém apenas empresas abertas (ativa ou com histórico)
        df = df[df["TP_MERC"].isin(["BOLSA", "MBO"])].copy()

        # Campos que nos interessam
        campos = {
            "CD_CVM":       "codigo_cvm",
            "CNPJ_CIA":     "cnpj",
            "DENOM_SOCIAL": "razao_social",
            "DENOM_COMERC": "nome_fantasia",
            "SIT":          "situacao",
            "EMAIL":        "email_ri",
            "LOGRADOURO":   "logradouro",
            "MUN":          "municipio",
            "UF":           "uf",
            "PAIS":         "pais",
            "DT_REG":       "data_registro",
            "DT_CANCEL":    "data_cancelamento",
            "DT_CONST":     "data_constituicao",
        }
        df = df[[c for c in campos if c in df.columns]].rename(columns=campos)

        # Limpeza
        df["codigo_cvm"]  = df["codigo_cvm"].str.zfill(6)
        df["cnpj"]        = df["cnpj"].str.replace(r"[.\-/]", "", regex=True).str.strip()
        df["razao_social"] = df["razao_social"].str.strip()
        df["ativo"]        = df["situacao"].str.strip().str.upper() == "ATIVO"

        # Datas
        for col in ["data_registro", "data_cancelamento", "data_constituicao"]:
            if col in df.columns:
                df[col] = pd.to_datetime(df[col], format="%Y-%m-%d", errors="coerce").dt.date

        return df

    async def _carregar(self, df: pd.DataFrame) -> None:
        """Upsert no PostgreSQL: insere novas empresas, atualiza existentes."""
        async with get_db() as db:
            for _, row in df.iterrows():
                stmt = pg_insert(Empresa).values(
                    codigo_cvm      = row["codigo_cvm"],
                    cnpj            = row.get("cnpj") or None,
                    razao_social    = row["razao_social"],
                    nome_fantasia   = row.get("nome_fantasia") or None,
                    email_ri        = row.get("email_ri") or None,
                    ativo           = row.get("ativo", True),
                    data_cancelamento = row.get("data_cancelamento") or None,
                    data_constituicao = row.get("data_constituicao") or None,
                ).on_conflict_do_update(
                    index_elements=["codigo_cvm"],
                    set_={
                        "razao_social":     row["razao_social"],
                        "nome_fantasia":    row.get("nome_fantasia") or None,
                        "email_ri":         row.get("email_ri") or None,
                        "ativo":            row.get("ativo", True),
                        "data_cancelamento": row.get("data_cancelamento") or None,
                    }
                )
                result = await db.execute(stmt)
                if result.rowcount:
                    self._inseridos += 1
                else:
                    self._atualizados += 1
