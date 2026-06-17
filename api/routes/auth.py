import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import RedirectResponse
from passlib.context import CryptContext
from pydantic import BaseModel, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.auth import create_access_token, exchange_google_code
from api.config import settings
from api.database import get_db
from api.models import User

router = APIRouter(tags=["auth"])

pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")

DEMO_USER_EMAIL = "demo@synapse.local"
DEMO_USER_ID = uuid.UUID("00000000-0000-0000-0000-000000000002")

GOOGLE_AUTH_URL = (
    "https://accounts.google.com/o/oauth2/v2/auth"
    "?response_type=code"
    f"&client_id={settings.google_client_id}"
    f"&redirect_uri={settings.google_redirect_uri}"
    "&scope=openid%20email%20profile"
)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    username: str


class RegisterRequest(BaseModel):
    username: str
    email: str
    password: str

    @field_validator("email")
    @classmethod
    def email_valid(cls, v: str) -> str:
        v = v.strip().lower()
        if "@" not in v or "." not in v.split("@")[-1]:
            raise ValueError("Invalid email address")
        return v

    @field_validator("username")
    @classmethod
    def username_valid(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 3:
            raise ValueError("Username must be at least 3 characters")
        if len(v) > 30:
            raise ValueError("Username must be at most 30 characters")
        if not v.replace("_", "").replace("-", "").isalnum():
            raise ValueError("Username can only contain letters, numbers, hyphens, underscores")
        return v

    @field_validator("password")
    @classmethod
    def password_valid(cls, v: str) -> str:
        if len(v) < 6:
            raise ValueError("Password must be at least 6 characters")
        return v


class LoginRequest(BaseModel):
    email: str
    password: str


@router.post("/register", response_model=TokenResponse, status_code=201)
async def register(body: RegisterRequest, db: AsyncSession = Depends(get_db)):
    # Check email uniqueness
    existing = await db.execute(select(User).where(User.email == body.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status.HTTP_409_CONFLICT, "Email already registered")

    # Check username uniqueness
    existing_u = await db.execute(select(User).where(User.username == body.username))
    if existing_u.scalar_one_or_none():
        raise HTTPException(status.HTTP_409_CONFLICT, "Username already taken")

    user = User(
        email=body.email,
        username=body.username,
        password_hash=pwd_ctx.hash(body.password),
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    token = create_access_token(str(user.id))
    return TokenResponse(access_token=token, username=user.username or user.email)


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()

    if not user or not user.password_hash or not pwd_ctx.verify(body.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password")

    token = create_access_token(str(user.id))
    return TokenResponse(access_token=token, username=user.username or user.email)


@router.post("/demo", response_model=TokenResponse)
async def demo_login(db: AsyncSession = Depends(get_db)):
    """One-click demo login — creates the shared demo user if it doesn't exist."""
    result = await db.execute(select(User).where(User.id == DEMO_USER_ID))
    user = result.scalar_one_or_none()

    if not user:
        user = User(
            id=DEMO_USER_ID,
            email=DEMO_USER_EMAIL,
            username="demo",
            is_demo=True,
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)

    token = create_access_token(str(user.id))
    return TokenResponse(access_token=token, username="demo")


@router.get("/google/login")
async def google_login():
    return RedirectResponse(GOOGLE_AUTH_URL)


@router.get("/google/callback", response_model=TokenResponse)
async def google_callback(code: str, db: AsyncSession = Depends(get_db)):
    try:
        google_user = await exchange_google_code(code)
    except Exception:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Failed to exchange Google code")

    result = await db.execute(select(User).where(User.google_id == google_user["id"]))
    user = result.scalar_one_or_none()

    if not user:
        user = User(
            email=google_user["email"],
            google_id=google_user["id"],
            username=google_user["email"].split("@")[0],
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)

    token = create_access_token(str(user.id))
    return TokenResponse(access_token=token, username=user.username or user.email)
