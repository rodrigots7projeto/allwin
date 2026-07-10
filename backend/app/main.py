"""
Ponto de entrada do backend AllWin v2.

Rodar em desenvolvimento:
  cd backend
  uv run uvicorn app.main:app --reload --port 8000

Infraestrutura necessária (docker-compose):
  cd infra && docker compose up -d    # PostgreSQL + Redis + pgAdmin
"""
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

# Módulos cripto — sempre disponíveis
from .api.binance_trade import router as router_binance_trade
from .api.cripto import router as router_cripto
from .api.cripto_backtest import router as router_cripto_backtest
from .api.cripto_comparativo import router as router_cripto_comp
from .api.cripto_daytrade import router as router_cripto_daytrade
from .api.cripto_futures import router as router_cripto_futures
from .api.cripto_motor import router as router_cripto_motor
from .api.cripto_sinais import router as router_cripto_sinais
from .api.cripto_wallet import router as router_cripto_wallet
from .config import settings

# Módulos B3/CVM — opcionais (dependem de dados locais e PostgreSQL)
router_ai = router_compare = router_docs = router_radar = None
router_ranking = router_v1 = router_rs = router_simulador = router_v2 = None
try:
    from .api.ai_chat import router as router_ai
    from .api.ai_compare import router as router_compare
    from .api.ai_documentos import router as router_docs
    from .api.ai_radar import router as router_radar
    from .api.ranking import router as router_ranking
    from .api.routes import router as router_v1
    from .api.rs_analisa import router as router_rs
    from .api.simulador import router as router_simulador
    from .api.v2.router import router as router_v2
except Exception as _e:
    print(f"[AVISO] Módulos B3 não carregados ({_e}) — modo cripto-only")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Inicialização e encerramento da aplicação."""
    # PostgreSQL (Data Warehouse v2)
    try:
        from .db.session import engine
        async with engine.connect() as conn:
            await conn.execute(__import__("sqlalchemy").text("SELECT 1"))
        print("[OK] PostgreSQL conectado")
    except Exception as e:
        print(f"[AVISO] PostgreSQL indisponivel ({e}) -- v2 endpoints desativados")

    # MySQL (Cripto — sinais, scan, histórico, wallets)
    try:
        from .db.mysql import init_tables
        await init_tables()
        print("[OK] MySQL conectado — tabelas cripto prontas")
    except Exception as e:
        print(f"[AVISO] MySQL indisponivel ({e}) -- persistencia cripto desativada")

    # Auto-trade worker (roda 24/7 em background)
    try:
        import asyncio
        from .cripto.auto_trade_worker import auto_trade_loop
        asyncio.create_task(auto_trade_loop())
        print("[OK] Auto-trade worker iniciado")
    except Exception as e:
        print(f"[AVISO] Auto-trade worker nao iniciado ({e})")

    yield

    from .db.session import engine
    await engine.dispose()
    try:
        from .db.mysql import close_pool
        await close_pool()
    except Exception:
        pass


app = FastAPI(
    title="AllWin — Data Warehouse Financeiro B3",
    description="""
## AllWin — Plataforma de Análise Fundamentalista

### Arquitetura
- **v1**: Dados em tempo real via brapi.dev (cotação, histórico, valuation, fundamentos)
- **v2**: Data Warehouse próprio (PostgreSQL) com dados oficiais CVM + B3 + BCB + IBGE

### Fontes de Dados
| Fonte | Dados | Frequência |
|-------|-------|-----------|
| CVM | DFP, ITR, FRE, Fatos Relevantes | Diário |
| B3 | Cotações, Proventos, Splits | Diário |
| BCB | Selic, CDI, IPCA, Câmbio | Diário |
| IBGE | PIB, Inflação | Mensal/Trimestral |

### Motor de Cálculo
Todos os indicadores são calculados internamente com fórmulas auditáveis:
Liquidez · Rentabilidade · Endividamento · Eficiência · Fluxo de Caixa · Mercado

### Modelos de Valuation
DCF · Graham · Bazin · DDM · Múltiplos · EVA
    """,
    version="2.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# ── Middlewares ────────────────────────────────────────────────────────────────

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origins_list,
    allow_credentials=False,
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["*"],
)

app.add_middleware(GZipMiddleware, minimum_size=1000)

# ── Routers ────────────────────────────────────────────────────────────────────

# B3/CVM — só monta se o módulo carregou
if router_v1:        app.include_router(router_v1,        prefix="/api/v1", tags=["v1 — brapi + CVM"])
if router_rs:        app.include_router(router_rs,        prefix="/api/v1")
if router_simulador: app.include_router(router_simulador, prefix="/api/v1")
if router_ai:        app.include_router(router_ai,        prefix="/api/v1")
if router_compare:   app.include_router(router_compare,   prefix="/api/v1")
if router_radar:     app.include_router(router_radar,     prefix="/api/v1")
if router_docs:      app.include_router(router_docs,      prefix="/api/v1")
if router_ranking:   app.include_router(router_ranking,   prefix="/api/v1")
if router_v2:        app.include_router(router_v2,        prefix="/api")

# Criptomoedas — sempre disponíveis
app.include_router(router_binance_trade,   prefix="/api/v1")
app.include_router(router_cripto_backtest, prefix="/api/v1")
app.include_router(router_cripto_daytrade, prefix="/api/v1")
app.include_router(router_cripto_futures,  prefix="/api/v1")
app.include_router(router_cripto_sinais,   prefix="/api/v1")
app.include_router(router_cripto_motor,    prefix="/api/v1")
app.include_router(router_cripto_comp,     prefix="/api/v1")
app.include_router(router_cripto_wallet,   prefix="/api/v1")
app.include_router(router_cripto,          prefix="/api/v1")


# ── Health ────────────────────────────────────────────────────────────────────

@app.get("/health", tags=["sistema"])
async def health() -> dict:
    """Verifica status do sistema e suas dependências."""
    from .db.session import engine
    db_ok = False
    try:
        async with engine.connect() as conn:
            await conn.execute(__import__("sqlalchemy").text("SELECT 1"))
        db_ok = True
    except Exception:
        pass

    return {
        "status":      "ok" if db_ok else "degradado",
        "versao":      "2.0.0",
        "database":    "conectado" if db_ok else "desconectado",
        "descricao":   "AllWin — Data Warehouse Financeiro B3",
    }
