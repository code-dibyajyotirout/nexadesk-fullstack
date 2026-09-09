from typing import List
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    PROJECT_NAME: str = "NexaDesk Distributed Backend"
    VERSION: str = "1.0.0"
    API_V1_STR: str = "/api/v1"
    ENVIRONMENT: str = "development"
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    
    # CORS Origins
    CORS_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:8000",
    ]
    
    # Storage & Cache Configuration
    DATABASE_URL: str = "sqlite+aiosqlite:///./nexadesk.db"
    REDIS_URL: str = "redis://localhost:6379/0"
    
    # Security Configuration
    SECRET_KEY: str = "nexadesk_production_distributed_secret_key_32bytes"
    XOR_MASK_KEY: str = "NEXADESK_SECURE_XOR_KEY_2026"
    MAX_PROMPT_LENGTH: int = 4096
    
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore"
    )


settings = Settings()
