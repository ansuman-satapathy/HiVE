"""
Shared test fixtures: in-memory async SQLite database, FastAPI test client,
and helper functions to create users and obtain JWT tokens.
"""
import asyncio
import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlmodel import SQLModel
from sqlmodel.ext.asyncio.session import AsyncSession

from app.main import app
from app.api.deps import get_db
from app.models.user import User
from app.core.security import get_password_hash, create_access_token


# ── In-memory SQLite engine for tests ──────────────────────────────────────
TEST_DATABASE_URL = "sqlite+aiosqlite://"

test_engine = create_async_engine(TEST_DATABASE_URL, echo=False)
TestSessionLocal = async_sessionmaker(
    bind=test_engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


# ── Dependency override ───────────────────────────────────────────────────
async def override_get_db():
    async with TestSessionLocal() as session:
        yield session


app.dependency_overrides[get_db] = override_get_db


# ── Fixtures ──────────────────────────────────────────────────────────────
@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture(autouse=True)
async def setup_db():
    """Create all tables before each test and drop them after."""
    async with test_engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all)
    yield
    async with test_engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.drop_all)


@pytest_asyncio.fixture
async def db_session():
    async with TestSessionLocal() as session:
        yield session


@pytest_asyncio.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


# ── Helpers ───────────────────────────────────────────────────────────────
async def create_test_user(
    db: AsyncSession,
    email: str,
    password: str = "password123",
    full_name: str = "Test User",
) -> User:
    """Insert a user directly into the test DB and return the model."""
    user = User(
        email=email,
        password_hash=get_password_hash(password),
        full_name=full_name,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


def auth_header(user: User) -> dict:
    """Generate a Bearer Authorization header for the given user."""
    token = create_access_token(subject=user.id)
    return {"Authorization": f"Bearer {token}"}
