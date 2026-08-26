"""
FastAPI dependency functions.

Token authentication flow:
  1. Extract Bearer token from Authorization header (OAuth2PasswordBearer).
  2. Cryptographically verify + decode the JWT (decode_token).
  3. Check the token's `jti` against the blacklist — catches revoked
     tokens that haven't yet naturally expired (logout, password change).
  4. Load the UserModel from the DB and confirm status == ACTIVE.
"""

from typing import AsyncGenerator, Optional

from fastapi import Depends, Request
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import AsyncSessionLocal
from app.core.exceptions import ForbiddenException, UnauthorizedException
from app.core.logging import get_logger
from app.core.redis import get_redis
from app.core.security import decode_token
from app.models.auth.user import UserModel

logger = get_logger("app.dependencies")

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/customer/login", auto_error=False)


# ---------------------------------------------------------------------------
# Database session
# ---------------------------------------------------------------------------

async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Dependency providing async database session."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


# ---------------------------------------------------------------------------
# JWT auth with Redis blacklist check
# ---------------------------------------------------------------------------

async def get_current_user_claims(
    token: Optional[str] = Depends(oauth2_scheme),
) -> dict:
    """
    Decode JWT and validate claims.

    Steps:
      1. Reject if token is missing.
      2. Cryptographically verify the signature and expiry (decode_token).
      3. Confirm token_type == "access" (prevents refresh tokens being used here).
      4. Check Redis blacklist using the `jti` claim — covers revoked-before-expiry
         tokens (logout, password change, admin account suspension).
    """
    if not token:
        raise UnauthorizedException("Authentication token missing.")

    payload = decode_token(token)
    if not payload:
        logger.warning("Invalid or expired token presented")
        raise UnauthorizedException("Invalid or expired authentication token.")

    # Reject refresh tokens presented to access-token-only endpoints
    if payload.get("token_type") != "access":
        logger.warning("Non-access token type used on protected endpoint")
        raise UnauthorizedException("Access token required.")

    # Blacklist check — O(1) lookup by jti
    jti = payload.get("jti")
    if jti:
        redis = get_redis()
        is_blacklisted = await redis.exists(f"blacklist:access:{jti}")
        if is_blacklisted:
            logger.warning("Blacklisted token presented jti=%s", jti)
            raise UnauthorizedException("Token has been revoked. Please sign in again.")

    return payload


async def get_current_user(
    claims: dict = Depends(get_current_user_claims),
    db: AsyncSession = Depends(get_db),
) -> UserModel:
    """Get active UserModel for current authenticated request."""
    user_id = claims.get("sub")
    if not user_id:
        logger.error("Malformed JWT claims — sub missing")
        raise UnauthorizedException("Malformed token claims.")

    stmt = select(UserModel).where(UserModel.id == user_id)
    res = await db.execute(stmt)
    user = res.scalars().first()

    if not user:
        logger.warning("Authenticated user not found in DB user_id=%s", user_id)
        raise UnauthorizedException("Authenticated user account no longer exists.")

    if user.status != "ACTIVE":
        logger.warning("Inactive user attempted access user_id=%s status=%s", user_id, user.status)
        raise ForbiddenException(f"User account is {user.status.lower()}.")

    return user


async def get_optional_user(
    token: Optional[str] = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> Optional[UserModel]:
    """Return the current user if a valid, non-blacklisted token is present, else None."""
    if not token:
        return None
    payload = decode_token(token)
    if not payload:
        return None
    if payload.get("token_type") != "access":
        return None

    jti = payload.get("jti")
    if jti:
        redis = get_redis()
        if await redis.exists(f"blacklist:access:{jti}"):
            return None

    user_id = payload.get("sub")
    if not user_id:
        return None
    stmt = select(UserModel).where(UserModel.id == user_id)
    res = await db.execute(stmt)
    user = res.scalars().first()
    if not user or user.status != "ACTIVE":
        return None
    return user


# ---------------------------------------------------------------------------
# Surface-scoped auth guards
# ---------------------------------------------------------------------------

async def get_current_customer(
    user: UserModel = Depends(get_current_user),
) -> UserModel:
    """Ensure current user is authenticated as a Customer."""
    if user.user_type != "customer":
        raise ForbiddenException("Customer authentication required.")
    return user


async def get_current_employee(
    user: UserModel = Depends(get_current_user),
) -> UserModel:
    """Ensure current user is authenticated as an Employee."""
    if user.user_type != "employee":
        raise ForbiddenException("Employee authentication required.")
    return user


async def get_current_admin(
    user: UserModel = Depends(get_current_user),
) -> UserModel:
    """Ensure current user is authenticated as an Admin."""
    if user.user_type != "admin":
        raise ForbiddenException("Admin authentication privileges required.")
    return user
