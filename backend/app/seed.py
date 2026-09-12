import asyncio
from sqlmodel import select
from app.db.database import SessionLocal, engine
from app.models.user import User
from app.core.security import get_password_hash

async def seed_data():
    print("Seeding workspace user...")
    async with SessionLocal() as session:
        seed_user = {
            "email": "demo@docagent.com",
            "full_name": "Workspace Admin",
            "password": "password123",
        }

        statement = select(User).where(User.email == seed_user["email"])
        result = await session.exec(statement)
        existing_user = result.first()

        if not existing_user:
            hashed_password = get_password_hash(seed_user["password"])
            new_user = User(
                email=seed_user["email"],
                full_name=seed_user["full_name"],
                password_hash=hashed_password,
            )
            session.add(new_user)
            await session.commit()
            print(f"Created workspace user: {seed_user['email']}")
        else:
            print(f"User already exists: {seed_user['email']}")

async def main():
    try:
        await seed_data()
    finally:
        await engine.dispose()

if __name__ == "__main__":
    asyncio.run(main())
