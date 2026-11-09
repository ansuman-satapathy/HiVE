import pytest
from httpx import AsyncClient
from sqlmodel.ext.asyncio.session import AsyncSession
from tests.conftest import create_test_user, auth_header


@pytest.mark.asyncio
async def test_public_settings_endpoint(client: AsyncClient):
    """Verify unauthenticated GET /api/settings/public returns allow_demo_autofill."""
    res = await client.get("/api/settings/public")
    assert res.status_code == 200
    data = res.json()
    assert "allow_demo_autofill" in data
    assert "initialized" in data


@pytest.mark.asyncio
async def test_settings_authenticated_get_and_patch(db_session: AsyncSession, client: AsyncClient):
    """Verify authenticated user can read and update model and security settings."""
    user = await create_test_user(db_session, email="settings_tester@example.com")
    headers = auth_header(user)

    # GET current settings
    get_res = await client.get("/api/settings", headers=headers)
    assert get_res.status_code == 200
    curr = get_res.json()
    assert "llm_provider" in curr

    # PATCH settings to local Ollama with disabled demo autofill
    patch_payload = {
        "llm_provider": "ollama",
        "llm_base_url": "http://localhost:11434/v1",
        "llm_model": "llama3.2",
        "allow_demo_autofill": False,
    }
    patch_res = await client.patch("/api/settings", json=patch_payload, headers=headers)
    assert patch_res.status_code == 200
    updated = patch_res.json()
    assert updated["llm_provider"] == "ollama"
    assert updated["llm_model"] == "llama3.2"
    assert updated["allow_demo_autofill"] is False

    # Verify public settings reflects disabled demo autofill
    pub_res = await client.get("/api/settings/public")
    assert pub_res.status_code == 200
    assert pub_res.json()["allow_demo_autofill"] is False


@pytest.mark.asyncio
async def test_test_llm_endpoint_local_mode(db_session: AsyncSession, client: AsyncClient):
    """Verify test-llm endpoint returns success for local fallback provider."""
    user = await create_test_user(db_session, email="test_llm_user@example.com")
    headers = auth_header(user)

    payload = {"provider": "local"}
    res = await client.post("/api/settings/test-llm", json=payload, headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert data["success"] is True
    assert "latency_ms" in data


@pytest.mark.asyncio
async def test_update_profile_and_change_password(db_session: AsyncSession, client: AsyncClient):
    """Verify user can update full_name and change password."""
    initial_password = "old_password123"
    user = await create_test_user(db_session, email="pwd_changer@example.com", password=initial_password)
    headers = auth_header(user)

    # 1. Update Profile name
    patch_res = await client.patch(
        "/api/auth/me",
        json={"full_name": "Updated Admin Name"},
        headers=headers
    )
    assert patch_res.status_code == 200
    assert patch_res.json()["full_name"] == "Updated Admin Name"

    # 2. Change Password - fail on wrong current password
    fail_pwd_res = await client.post(
        "/api/auth/change-password",
        json={"current_password": "wrong_password", "new_password": "new_password456"},
        headers=headers
    )
    assert fail_pwd_res.status_code == 400

    # 3. Change Password - success
    ok_pwd_res = await client.post(
        "/api/auth/change-password",
        json={"current_password": initial_password, "new_password": "new_password456"},
        headers=headers
    )
    assert ok_pwd_res.status_code == 200

    # 4. Verify login with new password
    login_res = await client.post(
        "/api/auth/login",
        json={"email": "pwd_changer@example.com", "password": "new_password456"}
    )
    assert login_res.status_code == 200
    assert "access_token" in login_res.json()
