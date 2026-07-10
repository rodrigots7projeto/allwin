"""
Conexão assíncrona com PostgreSQL via SQLAlchemy 2.x + asyncpg.

Uso:
    async with get_db() as db:
        result = await db.execute(select(Empresa))
"""
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from ..config import settings


class Base(DeclarativeBase):
    """Classe base de todos os modelos SQLAlchemy."""
    pass


# Engine assíncrono — pool de até 20 conexões
engine = create_async_engine(
    settings.database_url,
    echo=False,             # True para debug de SQL
    pool_size=10,
    max_overflow=20,
    pool_pre_ping=True,     # verifica conexão antes de usar
    pool_recycle=3600,      # recicla conexões após 1h
)

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,  # mantém objetos carregados após commit
)


@asynccontextmanager
async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Context manager para obter sessão do banco."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def create_tables() -> None:
    """Cria todas as tabelas (para desenvolvimento — use Alembic em produção)."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
