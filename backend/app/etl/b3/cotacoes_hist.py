"""
ETL B3 — Cotações Históricas (arquivo COTAHIST).

Fonte oficial (gratuita):
  https://bvmf.bmfbovespa.com.br/InstDados/SerHist/COTAHIST_A{ano}.ZIP

Formato: arquivo texto de largura fixa (layout padrão BOVESPA).
Documentação do layout: disponível no site da B3.

Layout dos campos principais (posições baseadas no formato COTAHIST):
  2-10   : CODNEG (ticker 8 chars, right-stripped)
  17-49  : NOMRES (nome reduzido)
  50-52  : ESPECI (especificação do papel: ON, PN, UNIT...)
  57-69  : PREABE (preço abertura, centavos × 100)
  70-82  : PREMAX (preço máximo)
  83-95  : PREMIN (preço mínimo)
  108-120: PREMED (preço médio)
  121-133: PREULT (preço fechamento)
  171-188: TOTNEG (total de negócios)
  153-170: QUATOT (quantidade de ações negociadas)
  171-188: VOLTOT (volume financeiro em R$ × 100)
  2-9    : DATPRE (data do pregão AAAAMMDD)

Obs: cada arquivo anual tem ~5-10 MB zipado e contém todos os ativos.
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
from ...db.models import Ticker, CotacaoDiaria
from ..base import EtlBase

logger = logging.getLogger(__name__)

B3_HIST_URL = "https://bvmf.bmfbovespa.com.br/InstDados/SerHist/COTAHIST_A{ano}.ZIP"

# Posições no arquivo de largura fixa (COTAHIST layout B3)
# (início, fim, nome_campo) — indexado em 0, fim exclusivo
LAYOUT_COTAHIST = [
    (2,   10,  "ticker"),
    (17,  49,  "nome_reduzido"),
    (50,  52,  "especificacao"),
    (56,  69,  "preco_abertura"),    # centavos × 100
    (69,  82,  "preco_maximo"),
    (82,  95,  "preco_minimo"),
    (107, 120, "preco_medio"),
    (120, 133, "preco_fechamento"),
    (152, 170, "quantidade_papeis"),
    (170, 188, "volume_financeiro"), # R$ × 100
    (188, 194, "num_negocios"),
]
POSICAO_DATA = (2, 10)   # linha de header tem formato diferente


class B3CotacoesHistEtl(EtlBase):
    """ETL para cotações históricas diárias via COTAHIST da B3."""
    fonte = "B3"
    tipo  = "COTACOES_HISTORICAS"

    def __init__(self, ano: int) -> None:
        super().__init__()
        self.ano = ano

    async def _extrair(self, **_) -> bytes:
        url = B3_HIST_URL.format(ano=self.ano)
        resp = await self._get(url, timeout=300)
        return resp.content

    async def _transformar(self, dados_brutos: bytes) -> pd.DataFrame:
        """Parseia o arquivo COTAHIST de largura fixa."""
        with zipfile.ZipFile(io.BytesIO(dados_brutos)) as z:
            nome_arq = [n for n in z.namelist() if n.startswith("COTAHIST")][0]
            with z.open(nome_arq) as f:
                linhas = f.read().decode("latin-1").splitlines()

        registros = []
        for linha in linhas:
            # Tipo de registro: '01' = cotação, '99' = trailer, '00' = header
            if len(linha) < 200 or linha[0:2] not in ("01",):
                continue

            try:
                ticker      = linha[12:24].strip()   # CODNEG (6 chars úteis + pad)
                # filtro: apenas tickers com 4-6 chars alfanuméricos
                if not (3 <= len(ticker) <= 8):
                    continue

                dt_str      = linha[2:10]
                dt_pregao   = date(int(dt_str[:4]), int(dt_str[4:6]), int(dt_str[6:8]))

                abertura    = float(linha[56:69].strip())  / 100
                maximo      = float(linha[69:82].strip())  / 100
                minimo      = float(linha[82:95].strip())  / 100
                fechamento  = float(linha[108:121].strip()) / 100
                volume_fin  = float(linha[170:188].strip()) / 100
                negocios    = int(linha[147:152].strip() or 0)

                registros.append({
                    "ticker":          ticker,
                    "data":            dt_pregao,
                    "abertura":        abertura,
                    "maximo":          maximo,
                    "minimo":          minimo,
                    "fechamento":      fechamento,
                    "volume_financeiro": volume_fin,
                    "num_negocios":    negocios,
                })
            except (ValueError, IndexError):
                self._ignorados += 1
                continue

        return pd.DataFrame(registros)

    async def _carregar(self, df: pd.DataFrame) -> None:
        if df.empty:
            return

        async with get_db() as db:
            result = await db.execute(
                select(Ticker.id, Ticker.ticker).where(Ticker.ativo == True)
            )
            ticker_map: dict[str, int] = {row.ticker: row.id for row in result}

            BATCH = 1000
            linhas = []
            for _, row in df.iterrows():
                t_id = ticker_map.get(row["ticker"])
                if not t_id:
                    self._ignorados += 1
                    continue

                linhas.append({
                    "ticker_id":        t_id,
                    "data":             row["data"],
                    "abertura":         row["abertura"],
                    "maximo":           row["maximo"],
                    "minimo":           row["minimo"],
                    "fechamento":       row["fechamento"],
                    "volume_financeiro": row["volume_financeiro"],
                    "num_negocios":     row["num_negocios"],
                    "fonte":            "B3_COTAHIST",
                })

                if len(linhas) >= BATCH:
                    await db.execute(
                        pg_insert(CotacaoDiaria)
                        .values(linhas)
                        .on_conflict_do_nothing(constraint="cotacao_diaria_unique")
                    )
                    self._inseridos += len(linhas)
                    linhas.clear()

            if linhas:
                await db.execute(
                    pg_insert(CotacaoDiaria)
                    .values(linhas)
                    .on_conflict_do_nothing(constraint="cotacao_diaria_unique")
                )
                self._inseridos += len(linhas)
