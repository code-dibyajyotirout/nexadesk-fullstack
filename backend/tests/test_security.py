import pytest
from app.core.security import SecurityPipeline


def test_xor_encryption_decryption():
    secret = "DATABASE_URL=postgresql://admin:supersecret@10.0.0.1:5432/prod"
    encrypted = SecurityPipeline.xor_encrypt(secret)
    assert encrypted != secret
    decrypted = SecurityPipeline.xor_decrypt(encrypted)
    assert decrypted == secret


def test_xss_sanitization():
    malicious = "<script>alert('pwned')</script><img src='x' onerror='stealCookies()'>Clean Title"
    sanitized = SecurityPipeline.sanitize_input_text(malicious)
    assert "<script>" not in sanitized
    assert "onerror=" not in sanitized
    assert "Clean Title" in sanitized


def test_path_traversal_detection():
    is_safe, _ = SecurityPipeline.sanitize_file_path("../../etc/passwd")
    assert is_safe is False
    
    is_safe, _ = SecurityPipeline.sanitize_file_path("..\\windows\\system32\\cmd.exe")
    assert is_safe is False
    
    is_safe, clean = SecurityPipeline.sanitize_file_path("src/components/NexaDesk.tsx")
    assert is_safe is True
    assert clean == "src/components/NexaDesk.tsx"


@pytest.mark.asyncio
async def test_security_verify_endpoint(client):
    payload = {
        "title": "Clean Title",
        "file_path": "../../dangerous.txt",
        "script_tag": "<script>alert(1)</script>"
    }
    response = await client.post("/api/v1/security/verify", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["is_secure"] is False
    assert len(data["violations"]) >= 2
