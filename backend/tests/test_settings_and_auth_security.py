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


@pytest.mark.asyncio
async def test_api_key_encryption_at_rest(db_session: AsyncSession, client: AsyncClient):
    """Verify sensitive API keys are encrypted at rest with Fernet/AES in the database."""
    from sqlmodel import select
    from app.models.workspace_setting import WorkspaceSetting
    from app.core.encryption import is_encrypted

    user = await create_test_user(db_session, email="encrypt_tester@example.com")
    headers = auth_header(user)

    secret_key = "sk-super-confidential-api-key-998877"

    # Save settings with raw secret key
    patch_res = await client.patch(
        "/api/settings",
        json={
            "llm_provider": "openai",
            "llm_base_url": "https://api.openai.com/v1",
            "llm_model": "gpt-4o-mini",
            "llm_api_key": secret_key,
        },
        headers=headers
    )
    assert patch_res.status_code == 200
    data = patch_res.json()
    assert data["has_api_key"] is True
    # Masked in API response — never plaintext
    assert secret_key not in data["llm_api_key_masked"]
    assert "••••••••" in data["llm_api_key_masked"]

    # Check database directly — must be encrypted, NEVER stored in plaintext
    stmt = select(WorkspaceSetting)
    row = (await db_session.exec(stmt)).first()
    assert row is not None
    assert row.llm_api_key != secret_key
    assert is_encrypted(row.llm_api_key)
    assert row.llm_api_key.startswith("enc::v1::")
    # In-memory property decrypts correctly
    assert row.decrypted_api_key == secret_key


@pytest.mark.asyncio
async def test_cloud_test_llm_requires_key_when_empty(db_session: AsyncSession, client: AsyncClient):
    """Verify test-llm returns a clean human-readable error if cloud API key is missing."""
    from app.models.workspace_setting import WorkspaceSetting
    from sqlmodel import select

    user = await create_test_user(db_session, email="cloud_test_user@example.com")
    headers = auth_header(user)

    # Ensure no key in DB
    stmt = select(WorkspaceSetting)
    setting = (await db_session.exec(stmt)).first()
    if setting:
        setting.llm_api_key = None
        db_session.add(setting)
        await db_session.commit()

    payload = {
        "provider": "openai",
        "base_url": "https://api.openai.com/v1",
        "model_name": "gpt-4o-mini",
        "api_key": "",
    }
    res = await client.post("/api/settings/test-llm", json=payload, headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert data["success"] is False
    assert "API key is required" in data["message"]

