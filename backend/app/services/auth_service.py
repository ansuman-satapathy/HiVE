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

    @staticmethod
    async def get_instance_status(db: AsyncSession) -> dict:
        """Check if workspace instance has been initialized with an administrator."""
        statement = select(User)
        result = await db.exec(statement)
        has_users = result.first() is not None
        return {
            "initialized": has_users,
            "product_name": "DocAgent Runtime",
            "version": "0.2.0",
        }

    @classmethod
    async def update_user(cls, db: AsyncSession, user: User, update_data: dict) -> User:
        """Update authenticated user profile information."""
        new_email = update_data.get("email")
        new_name = update_data.get("full_name")

        if new_email and new_email != user.email:
            statement = select(User).where(User.email == new_email)
            result = await db.exec(statement)
            existing = result.first()
            if existing and existing.id != user.id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Email already in use by another user",
                )
            user.email = new_email

        if new_name and new_name.strip():
            user.full_name = new_name.strip()

        db.add(user)
        await db.commit()
        await db.refresh(user)
        return user

    @classmethod
    async def change_password(
        cls, db: AsyncSession, user: User, current_password: str, new_password: str
    ) -> None:
        """Change user password after verifying current credentials."""
        if not verify_password(current_password, user.password_hash):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Current password is incorrect",
            )

        if len(new_password) < 6:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="New password must be at least 6 characters long",
            )

        user.password_hash = get_password_hash(new_password)
        db.add(user)
        await db.commit()

