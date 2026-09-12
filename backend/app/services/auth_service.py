from fastapi import HTTPException, status
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession
from app.models.user import User
from app.schemas.user import UserRegister, UserLogin
from app.core.security import verify_password, create_access_token, get_password_hash

class AuthService:
    @staticmethod
    async def authenticate_user(db: AsyncSession, login_data: UserLogin) -> User:
        """Authenticate a user by checking email and verifying their password hash."""
        statement = select(User).where(User.email == login_data.email)
        result = await db.exec(statement)
        user = result.first()

        if not user or not verify_password(login_data.password, user.password_hash):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect email or password",
                headers={"WWW-Authenticate": "Bearer"},
            )

        return user

    @staticmethod
    def generate_user_token(user: User) -> str:
        """Generate a signed JWT token for the authenticated user."""
        return create_access_token(subject=user.id)

    @classmethod
    async def register_user(cls, db: AsyncSession, register_data: UserRegister) -> User:
        """Register a new workspace user."""
        statement = select(User).where(User.email == register_data.email)
        result = await db.exec(statement)
        existing_user = result.first()

        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email already registered"
            )

        password_hash = get_password_hash(register_data.password)

        new_user = User(
            email=register_data.email,
            password_hash=password_hash,
            full_name=register_data.full_name,
        )

        db.add(new_user)
        await db.commit()
        await db.refresh(new_user)
        return new_user

    @classmethod
    async def login_user(cls, db: AsyncSession, login_data: UserLogin) -> dict:
        """Log in an existing user and return access token."""
        user = await cls.authenticate_user(db, login_data)
        access_token = cls.generate_user_token(user)
        return {
            "access_token": access_token,
            "token_type": "bearer"
        }
