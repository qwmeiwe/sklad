from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.models import OrderStatus, UserRole


class UserCreate(BaseModel):
    username: str = Field(min_length=3, max_length=64)
    password: str = Field(min_length=8, max_length=128)
    role: UserRole
    email: str | None = Field(default=None, max_length=254)


class UserUpdate(BaseModel):
    username: str | None = Field(default=None, min_length=3, max_length=64)
    password: str | None = Field(default=None, min_length=8, max_length=128)
    role: UserRole | None = None
    email: str | None = Field(default=None, max_length=254)
    is_active: bool | None = None


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    email: str | None
    role: UserRole
    is_active: bool
    created_at: datetime


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class OrderCreate(BaseModel):
    description: str = Field(min_length=1, max_length=500)
    client_id: int
    courier_id: int | None = None


class OrderUpdate(BaseModel):
    description: str | None = Field(default=None, min_length=1, max_length=500)
    client_id: int | None = None
    courier_id: int | None = None
    status: OrderStatus | None = None


class OrderRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    description: str
    status: OrderStatus
    client_id: int
    courier_id: int | None
    created_at: datetime
    updated_at: datetime


class SensorInput(BaseModel):
    sensor_type: Literal["temperature", "humidity", "lighting", "motion"]
    value: float = Field(allow_inf_nan=False)
    unit: str | None = Field(default=None, max_length=16)
    timestamp: datetime | None = None


class SensorRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    sensor_type: str
    value: float
    unit: str | None
    timestamp: datetime


class GPSInput(BaseModel):
    latitude: float = Field(ge=-90, le=90, allow_inf_nan=False)
    longitude: float = Field(ge=-180, le=180, allow_inf_nan=False)
    timestamp: datetime | None = None


class GPSRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    courier_id: int
    order_id: int
    latitude: float
    longitude: float
    timestamp: datetime
