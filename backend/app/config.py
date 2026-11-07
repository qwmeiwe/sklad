from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    environment: str = "development"
    jwt_secret_key: str = "development-only-change-me"
    jwt_algorithm: str = "HS256"
    access_token_minutes: int = 60
    business_database_url: str = "sqlite:///./business.db"
    telemetry_database_url: str = "sqlite:///./telemetry.db"
    iot_device_token: str = "development-iot-token"
    bootstrap_admin_username: str | None = None
    bootstrap_admin_password: str | None = None


settings = Settings()

if settings.environment.lower() == "production":
    if settings.jwt_secret_key == "development-only-change-me":
        raise RuntimeError("Set JWT_SECRET_KEY to a strong secret in production.")
    if settings.iot_device_token == "development-iot-token":
        raise RuntimeError("Set IOT_DEVICE_TOKEN in production.")
