from typing import List, Optional, Union
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
import json
import os


def _split_csv(value: Union[str, List[str], None]) -> Optional[List[str]]:
    """Accept both JSON-style lists and plain comma-separated strings.

    pydantic-settings tries to JSON-decode complex types, so an env var like

        ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000

    fails with "Invalid JSON" by default. This helper turns such values into
    a clean list (trimmed, empty entries dropped) and passes real lists through
    unchanged, so `.env` files and process env work the same way.
    """
    if value is None:
        return None
    if isinstance(value, (list, tuple)):
        return [str(item).strip() for item in value if str(item).strip()]
    if isinstance(value, str):
        # JSON array string → parse; otherwise treat as comma-separated CSV.
        stripped = value.strip()
        if stripped.startswith("["):
            try:
                parsed = json.loads(stripped)
                if isinstance(parsed, list):
                    return [str(item).strip() for item in parsed if str(item).strip()]
            except (ValueError, TypeError):
                pass
        return [item.strip() for item in value.split(",") if item.strip()]
    return [str(value)]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

    # --- App ---
    APP_NAME: str = "Pratikshya Fashon Backend"
    APP_ENV: str = "development"
    DEBUG: bool = True
    SECRET_KEY: str = "your-super-secret-key-change-in-production-min-32-chars"
    # Raw env value: comma-separated or a JSON array. Parsed via `allowed_origins`
    # so `ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000` works.
    ALLOWED_ORIGINS: str = (
        "http://localhost:3000,http://localhost:5173,http://localhost:5174,"
        "http://127.0.0.1:5173,http://127.0.0.1:3000"
    )

    # --- Database ---
    DATABASE_URL: str = "postgresql+asyncpg://postgres:password@localhost:5432/pratikshya_fashon"
    DATABASE_POOL_SIZE: int = 10
    DATABASE_MAX_OVERFLOW: int = 20

    # --- Celery (task queue broker + result backend — still uses Redis) ---
    CELERY_BROKER_URL: str = "redis://localhost:6379/1"
    CELERY_RESULT_BACKEND: str = "redis://localhost:6379/2"

    # --- JWT ---
    JWT_SECRET_KEY: str = "your-jwt-secret-key-change-in-production"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # --- Object Storage (AWS S3 / compatible) ---
    STORAGE_PROVIDER: str = "s3"
    AWS_ACCESS_KEY_ID: Optional[str] = "your-access-key"
    AWS_SECRET_ACCESS_KEY: Optional[str] = "your-secret-key"
    AWS_REGION: str = "ap-south-1"
    AWS_BUCKET_NAME: str = "pratikshya-fashon-media"
    CDN_BASE_URL: str = "https://cdn.pratikshyafashon.com"

    # --- Payment (Razorpay) ---
    RAZORPAY_KEY_ID: Optional[str] = "your-razorpay-key-id"
    RAZORPAY_KEY_SECRET: Optional[str] = "your-razorpay-key-secret"
    RAZORPAY_WEBHOOK_SECRET: Optional[str] = "your-webhook-secret"

    # --- Email ---
    MAIL_USERNAME: Optional[str] = "noreply@pratikshyafashon.com"
    MAIL_PASSWORD: Optional[str] = "your-mail-password"
    MAIL_FROM: str = "noreply@pratikshyafashon.com"
    MAIL_SERVER: str = "smtp.gmail.com"
    MAIL_PORT: int = 587
    MAIL_TLS: bool = True

    # --- SMS / WhatsApp (Twilio) ---
    TWILIO_ACCOUNT_SID: Optional[str] = "your-account-sid"
    TWILIO_AUTH_TOKEN: Optional[str] = "your-auth-token"
    TWILIO_FROM_NUMBER: Optional[str] = "+1234567890"

    # --- AI / LLM ---
    OPENAI_API_KEY: Optional[str] = None
    GROQ_API_KEY: Optional[str] = None
    DEFAULT_LLM_PROVIDER: str = "groq"
    DEFAULT_LLM_MODEL: str = "llama3-8b-8192"
    DEFAULT_EMBEDDING_MODEL: str = "text-embedding-3-small"

    # --- RAG / Vector ---
    VECTOR_SEARCH_TOP_K: int = 5
    CHUNK_SIZE: int = 512
    CHUNK_OVERLAP: int = 64

    # --- File Upload Limits ---
    MAX_IMAGE_SIZE_MB: int = 10
    MAX_VIDEO_SIZE_MB: int = 100
    ALLOWED_IMAGE_TYPES: str = "image/jpeg,image/png,image/webp"
    ALLOWED_VIDEO_TYPES: str = "video/mp4,video/webm"

    # --- Pagination ---
    DEFAULT_PAGE_SIZE: int = 20
    MAX_PAGE_SIZE: int = 100

    # --- Rate Limiting ---
    RATE_LIMIT_PER_MINUTE: int = 60

    # --- Cache TTLs (seconds) ---
    CACHE_TTL_CATEGORIES: int = 300      # 5 min — categories/subcategories
    CACHE_TTL_PRODUCTS: int = 120        # 2 min — storefront product listings
    CACHE_TTL_COLLECTIONS: int = 300     # 5 min — collections
    CACHE_TTL_RECOMMENDATIONS: int = 600 # 10 min — product recommendations

    # --- OAuth (Social Login) ---
    GOOGLE_CLIENT_ID: Optional[str] = None
    GOOGLE_CLIENT_SECRET: Optional[str] = None
    FACEBOOK_APP_ID: Optional[str] = None
    FACEBOOK_APP_SECRET: Optional[str] = None
    # Base URL the frontend is redirected to after OAuth (used in server-side flows)
    OAUTH_FRONTEND_REDIRECT_URL: str = "http://localhost:3000/auth/callback"

    # --- Admin Bootstrap & Seed ---
    # Gates the /auth/admin/sign-up endpoint for the first admin creation.
    # The create_admin.py script uses ADMIN_SEED_* vars to auto-create the superadmin.
    ADMIN_BOOTSTRAP_SECRET: Optional[str] = None
    ADMIN_SEED_EMAIL: Optional[str] = None
    ADMIN_SEED_PASSWORD: Optional[str] = None
    ADMIN_SEED_FULL_NAME: str = "Super Admin"

    # ── Parsed list accessors ────────────────────────────────────────────────
    # Keep the raw fields as strings so .env files can use simple CSV values;
    # these properties are the typed accessors used by the rest of the app.

    @property
    def allowed_origins(self) -> List[str]:
        return _split_csv(self.ALLOWED_ORIGINS) or []

    @property
    def allowed_image_types(self) -> List[str]:
        return _split_csv(self.ALLOWED_IMAGE_TYPES) or []

    @property
    def allowed_video_types(self) -> List[str]:
        return _split_csv(self.ALLOWED_VIDEO_TYPES) or []

    # ── Production safety guards ──────────────────────────────────────────────

    @field_validator("JWT_SECRET_KEY")
    @classmethod
    def validate_jwt_secret(cls, v: str, info) -> str:
        app_env = info.data.get("APP_ENV", "development")
        if app_env == "production" and v.startswith("your-"):
            raise ValueError(
                "JWT_SECRET_KEY must be set to a strong secret in production. "
                "Generate one with: python -c \"import secrets; print(secrets.token_hex(32))\""
            )
        return v

    @field_validator("SECRET_KEY")
    @classmethod
    def validate_secret_key(cls, v: str, info) -> str:
        app_env = info.data.get("APP_ENV", "development")
        if app_env == "production" and v.startswith("your-"):
            raise ValueError(
                "SECRET_KEY must be set to a strong secret in production. "
                "Generate one with: python -c \"import secrets; print(secrets.token_hex(32))\""
            )
        return v


settings = Settings()
