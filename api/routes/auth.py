from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.auth import create_access_token, exchange_google_code
from api.config import settings
from api.database import get_db
from api.models import User

router = APIRouter(tags=["auth"])

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
        user = User(email=google_user["email"], google_id=google_user["id"])
        db.add(user)
        await db.commit()
        await db.refresh(user)

    token = create_access_token(str(user.id))
    return TokenResponse(access_token=token)
