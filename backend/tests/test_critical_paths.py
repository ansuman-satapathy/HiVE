"""
Critical path tests for DocAgent Runtime:
  1. Auth: register → login → token works on /me
  2. Auth: invalid credentials are rejected
  3. Health check responds with 200 and healthy status
"""
import pytest
from app.models.user import User
from tests.conftest import create_test_user, auth_header


# ═══════════════════════════════════════════════════════════════════════════
# 1. AUTH — Full register → login → /me flow
# ═══════════════════════════════════════════════════════════════════════════
@pytest.mark.asyncio
async def test_register_login_and_me(client):
    """A user can register, log in, and retrieve their profile via /me."""
    # Register
    reg = await client.post("/api/auth/register", json={
        "email": "user@docagent.com",
        "password": "securepassword123",
        "full_name": "Workspace Owner",
    })
    assert reg.status_code == 201
    assert reg.json()["email"] == "user@docagent.com"
    assert reg.json()["full_name"] == "Workspace Owner"

    # Login
    login = await client.post("/api/auth/login", json={
        "email": "user@docagent.com",
        "password": "securepassword123",
    })
    assert login.status_code == 200
    token = login.json()["access_token"]
    assert token  # non-empty JWT

    # /me with the obtained token
    me = await client.get("/api/auth/me", headers={
        "Authorization": f"Bearer {token}"
    })
    assert me.status_code == 200
    assert me.json()["email"] == "user@docagent.com"
    assert me.json()["full_name"] == "Workspace Owner"


# ═══════════════════════════════════════════════════════════════════════════
# 2. AUTH — Invalid credentials rejected with 401
# ═══════════════════════════════════════════════════════════════════════════
@pytest.mark.asyncio
async def test_login_wrong_password_rejected(client, db_session):
    """Login with incorrect password returns 401 Unauthorized."""
    await create_test_user(db_session, "alice@docagent.com")

    resp = await client.post("/api/auth/login", json={
        "email": "alice@docagent.com",
        "password": "wrongpassword",
    })
    assert resp.status_code == 401
    assert "Incorrect email or password" in resp.json()["detail"]


# ═══════════════════════════════════════════════════════════════════════════
# 3. HEALTH CHECK
# ═══════════════════════════════════════════════════════════════════════════
@pytest.mark.asyncio
async def test_health_check(client):
    """API health check returns 200 OK."""
    resp = await client.get("/api/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "healthy"
