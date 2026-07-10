from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # ── brapi.dev (preços em tempo real) ─────────────────────────────────────
    # Vazio = modo dev com 4 tickers gratuitos (PETR4, VALE3, ITUB4, MGLU3)
    brapi_token: str = ""

    # ── Alpha Vantage (acoes globais — US stocks) ─────────────────────────────
    alpha_vantage_key: str = ""

    # ── PostgreSQL (Data Warehouse) ───────────────────────────────────────────
    # Formato: postgresql+asyncpg://user:password@host:port/dbname
    database_url: str = "postgresql+asyncpg://allwin:allwin_secret@localhost:5432/allwin"

    # ── Redis (cache) ─────────────────────────────────────────────────────────
    redis_url: str = "redis://localhost:6379/0"

    # ── CORS ─────────────────────────────────────────────────────────────────
    allowed_origins: str = "http://localhost:3000"

    # ── OpenAI (Analista Particular — Feature 1 AI) ───────────────────────────
    # Defina OPENAI_API_KEY=sk-... no arquivo backend/.env
    openai_api_key: str = ""
    openai_model: str = "gpt-4o-mini"   # troque por gpt-4o para respostas melhores

    # ── MySQL — Cripto (dbaas.com.br) ────────────────────────────────────────
    mysql_host:     str = "allwin.mysql.dbaas.com.br"
    mysql_port:     int = 3306
    mysql_user:     str = "allwin"
    mysql_password: str = ""
    mysql_db:       str = "allwin"

    # ── Ambiente ─────────────────────────────────────────────────────────────
    environment: str = "development"   # development | production

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}

    @property
    def origins_list(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",")]

    @property
    def is_production(self) -> bool:
        return self.environment == "production"


settings = Settings()
