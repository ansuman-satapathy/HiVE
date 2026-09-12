from fastapi import APIRouter, Depends, status
from sqlmodel.ext.asyncio.session import AsyncSession

from app.api.deps import get_db, get_current_user
from app.schemas.user import UserRegister, UserResponse, UserLogin, Token
from app.models.user import User
from app.services.auth_service import AuthService

router = APIRouter(prefix="/auth", tags=["Authentication"])

@router.get("/status")
async def get_auth_status(db: AsyncSession = Depends(get_db)):
    """Check whether the workspace has been initialized or requires root setup."""
    return await AuthService.get_instance_status(db)

@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register(
    register_data: UserRegister,
    db: AsyncSession = Depends(get_db)
):
    """Register a new workspace user."""
    return await AuthService.register_user(db, register_data)

@router.post("/login", response_model=Token)
async def login(
    login_data: UserLogin,
    db: AsyncSession = Depends(get_db)
):
    """Log in an existing user and generate a JWT access token."""
    return await AuthService.login_user(db, login_data)

@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    """Retrieve details of the currently authenticated user."""
    return current_user
