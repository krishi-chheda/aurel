from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


API_DIR = Path(__file__).resolve().parents[1]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=API_DIR / ".env", extra="ignore")

    env: str = "development"  # development | test | production
    database_url: str = f"sqlite:///{(API_DIR / 'aurel.db').as_posix()}"  # PostgreSQL: postgresql+psycopg://user:pass@host/db
    jwt_secret: str = "dev-only-change-me-dev-only-change-me"
    access_token_minutes: int = 15
    refresh_token_days: int = 30
    reset_token_minutes: int = 30
    # Two tabs/requests refreshing with the same token at once is normal, not theft.
    refresh_reuse_grace_seconds: int = 20
    # Browser-facing path the refresh cookie is scoped to (web calls the API through the Next.js /api proxy).
    refresh_cookie_path: str = "/api/auth"
    cors_origins: str = "http://localhost:3000,http://localhost:8081"  # 8081 = Expo web dev server
    web_base_url: str = "http://localhost:3000"
    demo_data_on_signup: bool = True
    rate_limit_enabled: bool = True
    # Addresses/CIDRs of proxies allowed to report the client IP via X-Forwarded-For (AUD-09). Empty = trust no one:
    # the socket peer is the client. Behind an edge proxy that OVERWRITES X-Forwarded-For, list the hops in front of
    # the API (e.g. the Next.js server and the load balancer), e.g. "127.0.0.1,10.0.0.0/8".
    trusted_proxies: str = ""

    @property
    def is_production(self) -> bool:
        return self.env == "production"


@lru_cache
def get_settings() -> Settings:
    s = Settings()
    # Rejects the built-in default, the .env.example placeholder and anything too short to resist brute force.
    if s.is_production and (len(s.jwt_secret) < 32 or "change-me" in s.jwt_secret):
        raise RuntimeError("JWT_SECRET must be set to a random value of at least 32 characters in production")
    return s
