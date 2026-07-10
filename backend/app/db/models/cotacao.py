"""Modelos SQLAlchemy: Cotações e Proventos."""
from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import (
    BigInteger, Boolean, Date, DateTime, ForeignKey, Integer,
    Numeric, String, Text, UniqueConstraint, func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..session import Base
from .empresa import Ticker


class CotacaoDiaria(Base):
    __tablename__ = "cotacao_diaria"
    __table_args__ = (
        UniqueConstraint("ticker_id", "data", name="cotacao_diaria_unique"),
    )

    id:                     Mapped[int]                 = mapped_column(BigInteger, primary_key=True)
    ticker_id:              Mapped[int]                 = mapped_column(ForeignKey("ticker.id"), nullable=False)
    data:                   Mapped[date]                = mapped_column(Date, nullable=False)
    abertura:               Mapped[Optional[Decimal]]   = mapped_column(Numeric(18, 6))
    maximo:                 Mapped[Optional[Decimal]]   = mapped_column(Numeric(18, 6))
    minimo:                 Mapped[Optional[Decimal]]   = mapped_column(Numeric(18, 6))
    fechamento:             Mapped[Decimal]             = mapped_column(Numeric(18, 6), nullable=False)
    fechamento_ajustado:    Mapped[Optional[Decimal]]   = mapped_column(Numeric(18, 6))
    volume:                 Mapped[Optional[int]]       = mapped_column(BigInteger)
    volume_financeiro:      Mapped[Optional[Decimal]]   = mapped_column(Numeric(22, 2))
    num_negocios:           Mapped[Optional[int]]       = mapped_column(Integer)
    fonte:                  Mapped[str]                 = mapped_column(String(50), default="B3")
    criado_em:              Mapped[datetime]            = mapped_column(DateTime(timezone=True), server_default=func.now())

    ticker: Mapped["Ticker"] = relationship(back_populates="cotacoes")


class Provento(Base):
    __tablename__ = "provento"

    id:                 Mapped[int]                 = mapped_column(BigInteger, primary_key=True)
    ticker_id:          Mapped[int]                 = mapped_column(ForeignKey("ticker.id"), nullable=False)
    tipo:               Mapped[str]                 = mapped_column(String(20), nullable=False)
    data_declaracao:    Mapped[Optional[date]]       = mapped_column(Date)
    data_ex:            Mapped[Optional[date]]       = mapped_column(Date)
    data_registro:      Mapped[Optional[date]]       = mapped_column(Date)
    data_pagamento:     Mapped[Optional[date]]       = mapped_column(Date)
    valor_por_acao:     Mapped[Optional[Decimal]]    = mapped_column(Numeric(18, 8))
    moeda:              Mapped[str]                 = mapped_column(String(3), default="BRL")
    fator:              Mapped[Optional[Decimal]]    = mapped_column(Numeric(12, 6))
    aprovado:           Mapped[bool]                = mapped_column(Boolean, default=True)
    fonte:              Mapped[str]                 = mapped_column(String(50), default="B3")
    observacao:         Mapped[Optional[str]]       = mapped_column(Text)
    criado_em:          Mapped[datetime]            = mapped_column(DateTime(timezone=True), server_default=func.now())

    ticker: Mapped["Ticker"] = relationship(back_populates="proventos")
