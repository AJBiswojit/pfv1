from typing import List, Optional
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
import os

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
    ALLOWED_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://localhost:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:3000",
    ]

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
    ALLOWED_IMAGE_TYPES: List[str] = ["image/jpeg", "image/png", "image/webp"]
    ALLOWED_VIDEO_TYPES: List[str] = ["video/mp4", "video/webm"]

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
