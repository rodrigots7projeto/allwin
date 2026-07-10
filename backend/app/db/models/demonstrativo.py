"""Modelos SQLAlchemy: Demonstrações Financeiras (CVM raw data)."""
from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import (
    BigInteger, Boolean, Date, DateTime, ForeignKey, Integer,
    Numeric, SmallInteger, String, Text, UniqueConstraint, func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..session import Base


class PeriodoReferencia(Base):
    """
    Representa um período de entrega à CVM (DFP anual ou ITR trimestral).
    Cada reapresentação gera um novo registro (versão incremental).
    """
    __tablename__ = "periodo_referencia"
    __table_args__ = (
        UniqueConstraint(
            "empresa_id", "tipo_periodo", "dt_fim_exercicio", "versao", "consolidado",
            name="periodo_ref_unique"
        ),
    )

    id:                     Mapped[int]             = mapped_column(BigInteger, primary_key=True)
    empresa_id:             Mapped[int]             = mapped_column(ForeignKey("empresa.id"), nullable=False)
    tipo_periodo:           Mapped[str]             = mapped_column(String(10), nullable=False)  # DFP | ITR
    dt_inicio_exercicio:    Mapped[date]            = mapped_column(Date, nullable=False)
    dt_fim_exercicio:       Mapped[date]            = mapped_column(Date, nullable=False)
    ano_exercicio:          Mapped[int]             = mapped_column(SmallInteger, nullable=False)
    trimestre:              Mapped[Optional[int]]   = mapped_column(SmallInteger)
    versao:                 Mapped[int]             = mapped_column(SmallInteger, nullable=False, default=1)
    data_envio_cvm:         Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    consolidado:            Mapped[bool]            = mapped_column(Boolean, default=True)
    fonte:                  Mapped[str]             = mapped_column(String(50), default="CVM")
    criado_em:              Mapped[datetime]        = mapped_column(DateTime(timezone=True), server_default=func.now())

    empresa:    Mapped["Empresa"]                       = relationship(back_populates="periodos")  # type: ignore[name-defined]
    linhas:     Mapped[list["DemonstrativoLinha"]]      = relationship(back_populates="periodo")
    dfc_linhas: Mapped[list["DfcLinha"]]               = relationship(back_populates="periodo")


class DemonstrativoLinha(Base):
    """
    Linha individual de qualquer demonstrativo financeiro (BPA, BPP, DRE, DMPL, DVA).
    Armazenamento raw conforme CVM — valores já convertidos para R$.
    """
    __tablename__ = "demonstrativo_linha"

    id:                     Mapped[int]                 = mapped_column(BigInteger, primary_key=True)
    periodo_id:             Mapped[int]                 = mapped_column(ForeignKey("periodo_referencia.id"), nullable=False)
    tipo_dem:               Mapped[str]                 = mapped_column(String(10), nullable=False)  # BPA, BPP, DRE, DMPL, DVA
    cd_conta:               Mapped[str]                 = mapped_column(String(20), nullable=False)
    ds_conta:               Mapped[str]                 = mapped_column(String(200), nullable=False)
    nivel:                  Mapped[int]                 = mapped_column(SmallInteger, nullable=False)
    ordem:                  Mapped[Optional[int]]       = mapped_column(SmallInteger)
    vl_conta:               Mapped[Optional[Decimal]]   = mapped_column(Numeric(22, 2))
    vl_conta_anterior:      Mapped[Optional[Decimal]]   = mapped_column(Numeric(22, 2))
    unidade_original:       Mapped[Optional[str]]       = mapped_column(String(10))
    criado_em:              Mapped[datetime]            = mapped_column(DateTime(timezone=True), server_default=func.now())

    periodo: Mapped["PeriodoReferencia"] = relationship(back_populates="linhas")


class DfcLinha(Base):
    """
    Linhas da DFC (Método Indireto ou Direto) separadas para facilitar extração de D&A.
    """
    __tablename__ = "dfc_linha"

    id:         Mapped[int]                 = mapped_column(BigInteger, primary_key=True)
    periodo_id: Mapped[int]                 = mapped_column(ForeignKey("periodo_referencia.id"), nullable=False)
    metodo:     Mapped[str]                 = mapped_column(String(10), default="INDIRETO")
    cd_conta:   Mapped[str]                 = mapped_column(String(20), nullable=False)
    ds_conta:   Mapped[str]                 = mapped_column(String(200), nullable=False)
    nivel:      Mapped[int]                 = mapped_column(SmallInteger, nullable=False)
    ordem:      Mapped[Optional[int]]       = mapped_column(SmallInteger)
    vl_conta:   Mapped[Optional[Decimal]]   = mapped_column(Numeric(22, 2))
    criado_em:  Mapped[datetime]            = mapped_column(DateTime(timezone=True), server_default=func.now())

    periodo: Mapped["PeriodoReferencia"] = relationship(back_populates="dfc_linhas")


class DocumentoCvm(Base):
    __tablename__ = "documento_cvm"

    id:             Mapped[int]             = mapped_column(BigInteger, primary_key=True)
    empresa_id:     Mapped[int]             = mapped_column(ForeignKey("empresa.id"), nullable=False)
    tipo:           Mapped[str]             = mapped_column(String(30), nullable=False)
    data_entrega:   Mapped[date]            = mapped_column(Date, nullable=False)
    data_referencia: Mapped[Optional[date]] = mapped_column(Date)
    titulo:         Mapped[Optional[str]]   = mapped_column(String(300))
    descricao:      Mapped[Optional[str]]   = mapped_column(Text)
    url_cvm:        Mapped[Optional[str]]   = mapped_column(String(500))
    arquivo_nome:   Mapped[Optional[str]]   = mapped_column(String(200))
    hash_conteudo:  Mapped[Optional[str]]   = mapped_column(String(64))
    lido:           Mapped[bool]            = mapped_column(Boolean, default=False)
    criado_em:      Mapped[datetime]        = mapped_column(DateTime(timezone=True), server_default=func.now())
