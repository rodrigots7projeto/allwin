"""Modelos SQLAlchemy: Indicadores Calculados, Valuation e Macro."""
from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import (
    BigInteger, Boolean, Date, DateTime, ForeignKey, Integer,
    Numeric, SmallInteger, String, Text, UniqueConstraint, func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..session import Base


class IndicadorCalculado(Base):
    """
    Motor de indicadores: armazena TODOS os indicadores calculados internamente.
    Nunca sobrescreve — usa versao_calculo para rastrear recálculos.
    """
    __tablename__ = "indicador_calculado"
    __table_args__ = (
        UniqueConstraint(
            "empresa_id", "data_referencia", "nome", "versao_calculo",
            name="indicador_unique"
        ),
    )

    id:             Mapped[int]                 = mapped_column(BigInteger, primary_key=True)
    empresa_id:     Mapped[int]                 = mapped_column(ForeignKey("empresa.id"), nullable=False)
    periodo_id:     Mapped[Optional[int]]       = mapped_column(ForeignKey("periodo_referencia.id"))
    ticker_id:      Mapped[Optional[int]]       = mapped_column(ForeignKey("ticker.id"))
    data_referencia: Mapped[date]               = mapped_column(Date, nullable=False)
    # Identificação
    categoria:      Mapped[str]                 = mapped_column(String(50), nullable=False)
    nome:           Mapped[str]                 = mapped_column(String(100), nullable=False)
    valor:          Mapped[Optional[Decimal]]   = mapped_column(Numeric(22, 8))
    # Rastreabilidade
    formula:        Mapped[Optional[str]]       = mapped_column(Text)
    numerador:      Mapped[Optional[Decimal]]   = mapped_column(Numeric(22, 2))
    denominador:    Mapped[Optional[Decimal]]   = mapped_column(Numeric(22, 2))
    unidade:        Mapped[Optional[str]]       = mapped_column(String(20))
    versao_calculo: Mapped[int]                 = mapped_column(SmallInteger, default=1)
    criado_em:      Mapped[datetime]            = mapped_column(DateTime(timezone=True), server_default=func.now())


class ValuationModelo(Base):
    """Histórico de todos os valuations calculados por empresa/modelo."""
    __tablename__ = "valuation_modelo"

    id:                 Mapped[int]                 = mapped_column(BigInteger, primary_key=True)
    empresa_id:         Mapped[int]                 = mapped_column(ForeignKey("empresa.id"), nullable=False)
    ticker_id:          Mapped[Optional[int]]       = mapped_column(ForeignKey("ticker.id"))
    modelo:             Mapped[str]                 = mapped_column(String(50), nullable=False)
    data_calculo:       Mapped[datetime]            = mapped_column(DateTime(timezone=True), server_default=func.now())
    preco_referencia:   Mapped[Decimal]             = mapped_column(Numeric(18, 4), nullable=False)
    preco_justo:        Mapped[Optional[Decimal]]   = mapped_column(Numeric(18, 4))
    upside_pct:         Mapped[Optional[Decimal]]   = mapped_column(Numeric(8, 4))
    margem_seg_pct:     Mapped[Optional[Decimal]]   = mapped_column(Numeric(8, 4))
    veredicto:          Mapped[Optional[str]]       = mapped_column(String(50))
    premissas:          Mapped[dict]                = mapped_column(JSONB, nullable=False, default=dict)
    resultados:         Mapped[dict]                = mapped_column(JSONB, nullable=False, default=dict)
    ativo:              Mapped[bool]                = mapped_column(Boolean, default=True)
    criado_em:          Mapped[datetime]            = mapped_column(DateTime(timezone=True), server_default=func.now())


class MedianaSetorial(Base):
    """Estatísticas setoriais para peer comparison."""
    __tablename__ = "mediana_setorial"
    __table_args__ = (
        UniqueConstraint("segmento_id", "data_ref", "indicador", name="mediana_setorial_unique"),
    )

    id:             Mapped[int]                 = mapped_column(BigInteger, primary_key=True)
    segmento_id:    Mapped[int]                 = mapped_column(ForeignKey("segmento.id"), nullable=False)
    data_ref:       Mapped[date]                = mapped_column(Date, nullable=False)
    indicador:      Mapped[str]                 = mapped_column(String(100), nullable=False)
    mediana:        Mapped[Optional[Decimal]]   = mapped_column(Numeric(22, 8))
    media:          Mapped[Optional[Decimal]]   = mapped_column(Numeric(22, 8))
    percentil_25:   Mapped[Optional[Decimal]]   = mapped_column(Numeric(22, 8))
    percentil_75:   Mapped[Optional[Decimal]]   = mapped_column(Numeric(22, 8))
    n_empresas:     Mapped[Optional[int]]       = mapped_column(SmallInteger)
    criado_em:      Mapped[datetime]            = mapped_column(DateTime(timezone=True), server_default=func.now())


class SerieMacro(Base):
    """Catálogo de séries macroeconômicas."""
    __tablename__ = "serie_macro"
    __table_args__ = (
        UniqueConstraint("fonte", "codigo", name="serie_macro_unique"),
    )

    id:         Mapped[int]             = mapped_column(Integer, primary_key=True)
    fonte:      Mapped[str]             = mapped_column(String(20), nullable=False)
    codigo:     Mapped[str]             = mapped_column(String(20), nullable=False)
    nome:       Mapped[str]             = mapped_column(String(100), nullable=False)
    descricao:  Mapped[Optional[str]]   = mapped_column(Text)
    frequencia: Mapped[str]             = mapped_column(String(15), nullable=False)
    unidade:    Mapped[Optional[str]]   = mapped_column(String(30))
    ativo:      Mapped[bool]            = mapped_column(Boolean, default=True)
    criado_em:  Mapped[datetime]        = mapped_column(DateTime(timezone=True), server_default=func.now())

    valores: Mapped[list["SerieMacroValor"]] = relationship(back_populates="serie")


class SerieMacroValor(Base):
    """Valores históricos das séries macroeconômicas."""
    __tablename__ = "serie_macro_valor"
    __table_args__ = (
        UniqueConstraint("serie_id", "data", name="serie_macro_valor_unique"),
    )

    id:         Mapped[int]                 = mapped_column(BigInteger, primary_key=True)
    serie_id:   Mapped[int]                 = mapped_column(ForeignKey("serie_macro.id"), nullable=False)
    data:       Mapped[date]                = mapped_column(Date, nullable=False)
    valor:      Mapped[Decimal]             = mapped_column(Numeric(18, 8), nullable=False)
    criado_em:  Mapped[datetime]            = mapped_column(DateTime(timezone=True), server_default=func.now())

    serie: Mapped["SerieMacro"] = relationship(back_populates="valores")


class EtlRun(Base):
    """Log de execuções de ETL para auditoria."""
    __tablename__ = "etl_run"

    id:                 Mapped[int]             = mapped_column(BigInteger, primary_key=True)
    fonte:              Mapped[str]             = mapped_column(String(30), nullable=False)
    tipo:               Mapped[str]             = mapped_column(String(50), nullable=False)
    status:             Mapped[str]             = mapped_column(String(15), default="PENDENTE")
    iniciado_em:        Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    concluido_em:       Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    linhas_inseridas:   Mapped[int]             = mapped_column(Integer, default=0)
    linhas_atualizadas: Mapped[int]             = mapped_column(Integer, default=0)
    linhas_ignoradas:   Mapped[int]             = mapped_column(Integer, default=0)
    erro_mensagem:      Mapped[Optional[str]]   = mapped_column(Text)
    parametros:         Mapped[dict]            = mapped_column(JSONB, default=dict)
    criado_em:          Mapped[datetime]        = mapped_column(DateTime(timezone=True), server_default=func.now())


class EtlCheckpoint(Base):
    """Estado atual de cada pipeline ETL para retomada incremental."""
    __tablename__ = "etl_checkpoint"
    __table_args__ = (
        UniqueConstraint("fonte", "tipo", name="etl_checkpoint_unique"),
    )

    id:             Mapped[int]             = mapped_column(Integer, primary_key=True)
    fonte:          Mapped[str]             = mapped_column(String(30), nullable=False)
    tipo:           Mapped[str]             = mapped_column(String(50), nullable=False)
    ultimo_valor:   Mapped[Optional[str]]   = mapped_column(String(100))
    metadados:      Mapped[dict]            = mapped_column(JSONB, default=dict)
    atualizado_em:  Mapped[datetime]        = mapped_column(DateTime(timezone=True), server_default=func.now())
