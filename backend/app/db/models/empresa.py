"""Modelos SQLAlchemy: Empresa, Ticker, Governança, Estrutura Acionária."""
from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import (
    BigInteger, Boolean, Date, DateTime, ForeignKey, Integer,
    Numeric, SmallInteger, String, Text, UniqueConstraint, func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..session import Base


class Setor(Base):
    __tablename__ = "setor"

    id:         Mapped[int]          = mapped_column(Integer, primary_key=True)
    codigo:     Mapped[str]          = mapped_column(String(10), unique=True, nullable=False)
    nome:       Mapped[str]          = mapped_column(String(100), nullable=False)
    criado_em:  Mapped[datetime]     = mapped_column(DateTime(timezone=True), server_default=func.now())

    subsetores: Mapped[list["Subsetor"]] = relationship(back_populates="setor")


class Subsetor(Base):
    __tablename__ = "subsetor"

    id:         Mapped[int]      = mapped_column(Integer, primary_key=True)
    setor_id:   Mapped[int]      = mapped_column(ForeignKey("setor.id"), nullable=False)
    codigo:     Mapped[str]      = mapped_column(String(10), unique=True, nullable=False)
    nome:       Mapped[str]      = mapped_column(String(100), nullable=False)
    criado_em:  Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    setor:      Mapped["Setor"]           = relationship(back_populates="subsetores")
    segmentos:  Mapped[list["Segmento"]]  = relationship(back_populates="subsetor")


class Segmento(Base):
    __tablename__ = "segmento"

    id:          Mapped[int]      = mapped_column(Integer, primary_key=True)
    subsetor_id: Mapped[int]      = mapped_column(ForeignKey("subsetor.id"), nullable=False)
    codigo:      Mapped[str]      = mapped_column(String(10), unique=True, nullable=False)
    nome:        Mapped[str]      = mapped_column(String(100), nullable=False)
    criado_em:   Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    subsetor:   Mapped["Subsetor"]       = relationship(back_populates="segmentos")
    empresas:   Mapped[list["Empresa"]]  = relationship(back_populates="segmento")


class Empresa(Base):
    __tablename__ = "empresa"

    id:                 Mapped[int]             = mapped_column(BigInteger, primary_key=True)
    codigo_cvm:         Mapped[Optional[str]]   = mapped_column(String(10), unique=True)
    cnpj:               Mapped[Optional[str]]   = mapped_column(String(14), unique=True)
    razao_social:       Mapped[str]             = mapped_column(String(200), nullable=False)
    nome_fantasia:      Mapped[Optional[str]]   = mapped_column(String(200))
    nome_pregao:        Mapped[Optional[str]]   = mapped_column(String(50))
    segmento_id:        Mapped[Optional[int]]   = mapped_column(ForeignKey("segmento.id"))
    pais_sede:          Mapped[str]             = mapped_column(String(2), default="BR")
    data_constituicao:  Mapped[Optional[date]]  = mapped_column(Date)
    data_listagem:      Mapped[Optional[date]]  = mapped_column(Date)
    data_cancelamento:  Mapped[Optional[date]]  = mapped_column(Date)
    ativo:              Mapped[bool]            = mapped_column(Boolean, default=True)
    site:               Mapped[Optional[str]]   = mapped_column(String(200))
    site_ri:            Mapped[Optional[str]]   = mapped_column(String(200))
    email_ri:           Mapped[Optional[str]]   = mapped_column(String(100))
    descricao:          Mapped[Optional[str]]   = mapped_column(Text)
    criado_em:          Mapped[datetime]        = mapped_column(DateTime(timezone=True), server_default=func.now())
    atualizado_em:      Mapped[datetime]        = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    segmento:   Mapped[Optional["Segmento"]]        = relationship(back_populates="empresas")
    tickers:    Mapped[list["Ticker"]]              = relationship(back_populates="empresa")
    periodos:   Mapped[list["PeriodoReferencia"]]   = relationship(back_populates="empresa")  # type: ignore[name-defined]


class Ticker(Base):
    __tablename__ = "ticker"

    id:                 Mapped[int]             = mapped_column(BigInteger, primary_key=True)
    empresa_id:         Mapped[int]             = mapped_column(ForeignKey("empresa.id"), nullable=False)
    ticker:             Mapped[str]             = mapped_column(String(10), unique=True, nullable=False)
    isin:               Mapped[Optional[str]]   = mapped_column(String(12))
    tipo:               Mapped[str]             = mapped_column(String(10), default="ON")
    principal:          Mapped[bool]            = mapped_column(Boolean, default=False)
    ativo:              Mapped[bool]            = mapped_column(Boolean, default=True)
    data_listagem:      Mapped[Optional[date]]  = mapped_column(Date)
    data_cancelamento:  Mapped[Optional[date]]  = mapped_column(Date)
    lote_padrao:        Mapped[int]             = mapped_column(Integer, default=100)
    criado_em:          Mapped[datetime]        = mapped_column(DateTime(timezone=True), server_default=func.now())
    atualizado_em:      Mapped[datetime]        = mapped_column(DateTime(timezone=True), server_default=func.now())

    empresa:    Mapped["Empresa"]               = relationship(back_populates="tickers")
    cotacoes:   Mapped[list["CotacaoDiaria"]]   = relationship(back_populates="ticker")  # type: ignore[name-defined]
    proventos:  Mapped[list["Provento"]]        = relationship(back_populates="ticker")  # type: ignore[name-defined]


class AcaoCapital(Base):
    __tablename__ = "acao_capital"

    id:                     Mapped[int]                 = mapped_column(BigInteger, primary_key=True)
    empresa_id:             Mapped[int]                 = mapped_column(ForeignKey("empresa.id"), nullable=False)
    data_referencia:        Mapped[date]                = mapped_column(Date, nullable=False)
    qtd_acoes_on:           Mapped[Optional[int]]       = mapped_column(BigInteger)
    qtd_acoes_pn:           Mapped[Optional[int]]       = mapped_column(BigInteger)
    qtd_acoes_total:        Mapped[Optional[int]]       = mapped_column(BigInteger)
    qtd_acoes_tesouraria:   Mapped[Optional[int]]       = mapped_column(BigInteger)
    free_float_pct:         Mapped[Optional[Decimal]]   = mapped_column(Numeric(6, 4))
    fonte:                  Mapped[str]                 = mapped_column(String(50), default="CVM")
    criado_em:              Mapped[datetime]            = mapped_column(DateTime(timezone=True), server_default=func.now())
