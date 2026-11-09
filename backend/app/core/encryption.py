import base64
import hashlib
import logging
from typing import Optional
from cryptography.fernet import Fernet, InvalidToken
from app.core.config import settings

logger = logging.getLogger("encryption")

ENCRYPTED_PREFIX = "enc::v1::"


def _get_fernet() -> Fernet:
    """
    Derive a 32-byte URL-safe base64 key from CONFIG_ENCRYPTION_KEY or SECRET_KEY.
    Guarantees deterministic symmetric AES-128-CBC + HMAC-SHA256 (Fernet) encryption.
    """
    raw_key = settings.CONFIG_ENCRYPTION_KEY.strip() or settings.SECRET_KEY.strip()
    # Fernet requires exactly 32 url-safe base64 bytes
    key_digest = hashlib.sha256(raw_key.encode("utf-8")).digest()
    b64_key = base64.urlsafe_b64encode(key_digest)
    return Fernet(b64_key)


def encrypt_field(plain_value: Optional[str]) -> Optional[str]:
    """
    Encrypt a sensitive plaintext configuration field before saving to the database.
    Outputs a prefixed token: enc::v1::<fernet_ciphertext>
    """
    if plain_value is None or not plain_value.strip():
        return None

    # Idempotent: don't double-encrypt
    if is_encrypted(plain_value):
        return plain_value

    fernet = _get_fernet()
    token = fernet.encrypt(plain_value.strip().encode("utf-8")).decode("utf-8")
    return f"{ENCRYPTED_PREFIX}{token}"


def decrypt_field(cipher_value: Optional[str]) -> Optional[str]:
    """
    Decrypt a stored configuration field into plaintext in-memory.
    If the value was stored as unencrypted plaintext (legacy), returns it directly.
    """
    if cipher_value is None or not cipher_value.strip():
        return None

    value_str = cipher_value.strip()

    # If it has the encryption prefix, decrypt with Fernet
    if value_str.startswith(ENCRYPTED_PREFIX):
        raw_token = value_str[len(ENCRYPTED_PREFIX):]
        try:
            fernet = _get_fernet()
            return fernet.decrypt(raw_token.encode("utf-8")).decode("utf-8")
        except InvalidToken:
            logger.error("Failed to decrypt configuration field: Invalid token or changed key.")
            return None
        except Exception as exc:
            logger.error(f"Decryption error: {exc}")
            return None

    # Check if raw Fernet token without prefix (Fernet tokens start with gAAAAA)
    if value_str.startswith("gAAAAA"):
        try:
            fernet = _get_fernet()
            return fernet.decrypt(value_str.encode("utf-8")).decode("utf-8")
        except Exception:
            pass

    # Unencrypted legacy string fallback
    return value_str


def is_encrypted(value: Optional[str]) -> bool:
    """Check if a string is already encrypted."""
    if not value:
        return False
    return value.startswith(ENCRYPTED_PREFIX) or value.startswith("gAAAAA")

