import re
import base64
from typing import Tuple, Dict, Any
from app.core.config import settings


class SecurityPipeline:
    """
    Production-grade input sanitization and credential obfuscation pipeline.
    Implements XOR-based obfuscation, XSS vector neutralization, path traversal
    prevention, and prompt injection defenses.
    """

    # Suspicious prompt injection signatures targeting LLM system prompts
    PROMPT_INJECTION_PATTERNS = [
        re.compile(r"ignore\s+(all\s+)?(previous|prior)\s+instructions", re.IGNORECASE),
        re.compile(r"system\s*:\s*you\s+are", re.IGNORECASE),
        re.compile(r"you\s+are\s+now\s+in\s+dan\s+mode", re.IGNORECASE),
        re.compile(r"override\s+system\s+prompt", re.IGNORECASE),
        re.compile(r"<\|im_start\|>", re.IGNORECASE),
        re.compile(r"\[INST\].*\[/INST\]", re.IGNORECASE),
    ]

    # Path traversal attack patterns
    PATH_TRAVERSAL_PATTERN = re.compile(r"(\.\./|\.\.\\|/etc/|/var/|c:\\|\\\\)", re.IGNORECASE)

    # HTML/XSS injection tags
    XSS_TAG_PATTERN = re.compile(r"<\s*script[^>]*>.*?<\s*/\s*script\s*>", re.IGNORECASE | re.DOTALL)
    XSS_ATTR_PATTERN = re.compile(r"(on\w+\s*=|javascript\s*:|data\s*:text/html)", re.IGNORECASE)

    @classmethod
    def xor_encrypt(cls, plaintext: str, key: str = None) -> str:
        """
        Encrypts a string using repeating-key XOR and encodes to URL-safe Base64.
        """
        if not plaintext:
            return ""
        mask = key or settings.XOR_MASK_KEY
        key_bytes = mask.encode("utf-8")
        data_bytes = plaintext.encode("utf-8")
        
        xor_result = bytearray(
            data_bytes[i] ^ key_bytes[i % len(key_bytes)]
            for i in range(len(data_bytes))
        )
        return base64.urlsafe_b64encode(xor_result).decode("utf-8")

    @classmethod
    def xor_decrypt(cls, ciphertext: str, key: str = None) -> str:
        """
        Decrypts a Base64-encoded XOR encrypted string.
        """
        if not ciphertext:
            return ""
        mask = key or settings.XOR_MASK_KEY
        key_bytes = mask.encode("utf-8")
        
        try:
            encrypted_bytes = base64.urlsafe_b64decode(ciphertext.encode("utf-8"))
            decrypted = bytearray(
                encrypted_bytes[i] ^ key_bytes[i % len(key_bytes)]
                for i in range(len(encrypted_bytes))
            )
            return decrypted.decode("utf-8")
        except Exception:
            return ""

    @classmethod
    def sanitize_input_text(cls, text: str) -> str:
        """
        Strips dangerous script tags, unescaped HTML, and malicious attributes.
        """
        if not text:
            return ""
        clean = cls.XSS_TAG_PATTERN.sub("", text)
        clean = cls.XSS_ATTR_PATTERN.sub("", clean)
        clean = clean.replace("<", "&lt;").replace(">", "&gt;")
        return clean.strip()

    @classmethod
    def sanitize_file_path(cls, path: str) -> Tuple[bool, str]:
        """
        Validates path against directory traversal attempts and returns safe relative path.
        """
        if not path or cls.PATH_TRAVERSAL_PATTERN.search(path):
            return False, ""
        
        # Normalize and remove leading/trailing slashes
        clean_path = path.strip().lstrip("/\\")
        parts = clean_path.split("/")
        if any(p in ("..", ".", "") for p in parts):
            return False, ""
        
        return True, clean_path

    @classmethod
    def check_prompt_injection(cls, prompt: str) -> Tuple[bool, str]:
        """
        Scans a natural language coding prompt for prompt injection patterns.
        Returns (is_safe, detected_pattern_description).
        """
        if not prompt:
            return True, ""
            
        for pattern in cls.PROMPT_INJECTION_PATTERNS:
            if pattern.search(prompt):
                return False, f"Potential prompt injection detected: {pattern.pattern}"
                
        return True, ""

    @classmethod
    def evaluate_payload(cls, payload: Dict[str, Any]) -> Dict[str, Any]:
        """
        Comprehensive security verification report for a given client payload.
        """
        report = {
            "is_secure": True,
            "violations": [],
            "sanitized_preview": {},
        }
        
        for key, value in payload.items():
            if isinstance(value, str):
                if cls.PATH_TRAVERSAL_PATTERN.search(value):
                    report["is_secure"] = False
                    report["violations"].append(f"Field '{key}' contains directory traversal attempt")
                
                if cls.XSS_TAG_PATTERN.search(value) or cls.XSS_ATTR_PATTERN.search(value):
                    report["is_secure"] = False
                    report["violations"].append(f"Field '{key}' contains XSS vector")
                
                safe_prompt, reason = cls.check_prompt_injection(value)
                if not safe_prompt:
                    report["is_secure"] = False
                    report["violations"].append(f"Field '{key}': {reason}")
                
                report["sanitized_preview"][key] = cls.sanitize_input_text(value)
                
        return report
