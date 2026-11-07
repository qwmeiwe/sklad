from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth import (
    create_access_token,
    get_current_user,
    hash_password,
    require_roles,
    verify_password,
)
from app.database import get_business_db, get_telemetry_db
from app.models import GPSData, Order, SensorData, User, UserRole
from app.schemas import (
    GPSRead,
    OrderCreate,
    OrderRead,
    OrderUpdate,
    SensorRead,
    Token,
    UserCreate,
    UserRead,
    UserUpdate,
)

router = APIRouter(prefix="/api")
Db = Annotated[Session, Depends(get_business_db)]
TelemetryDb = Annotated[Session, Depends(get_telemetry_db)]
CurrentUser = Annotated[User, Depends(get_current_user)]
AdminUser = Annotated[User, Depends(require_roles(UserRole.ADMIN))]

auth_router = APIRouter(prefix="/auth", tags=["auth"])
users_router = APIRouter(prefix="/users", tags=["users"])
orders_router = APIRouter(prefix="/orders", tags=["orders"])
telemetry_router = APIRouter(prefix="/telemetry", tags=["telemetry"])


@auth_router.post("/token", response_model=Token)
def login(form: Annotated[OAuth2PasswordRequestForm, Depends()], db: Db) -> Token:
    user = db.scalar(select(User).where(User.username == form.username))
    if user is None or not user.is_active or not verify_password(form.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return Token(access_token=create_access_token(user))


@auth_router.get("/me", response_model=UserRead)
def read_current_user(user: CurrentUser) -> User:
    return user


def _get_user_or_404(db: Session, user_id: int) -> User:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
    return user


def _get_order_or_404(db: Session, order_id: int) -> Order:
    order = db.get(Order, order_id)
    if order is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found.")
    return order


def _validate_assignees(db: Session, client_id: int, courier_id: int | None) -> None:
    client = db.get(User, client_id)
    if client is None or client.role != UserRole.CLIENT:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="client_id must identify a client.")
    if courier_id is not None:
        courier = db.get(User, courier_id)
        if courier is None or courier.role != UserRole.COURIER:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="courier_id must identify a courier.",
            )


def _visible_order(order: Order, user: User) -> bool:
    if user.role == UserRole.ADMIN:
        return True
    if user.role == UserRole.COURIER:
        return order.courier_id == user.id
    return order.client_id == user.id


@users_router.post("", response_model=UserRead, status_code=status.HTTP_201_CREATED)
def create_user(payload: UserCreate, db: Db, _: AdminUser) -> User:
    user = User(
        username=payload.username,
        email=payload.email,
        password_hash=hash_password(payload.password),
        role=payload.role,
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError as error:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Username or email already exists.") from error
    db.refresh(user)
    return user


@users_router.get("", response_model=list[UserRead])
def list_users(db: Db, _: AdminUser) -> list[User]:
    return list(db.scalars(select(User).order_by(User.id)).all())


@users_router.get("/{user_id}", response_model=UserRead)
def get_user(user_id: int, db: Db, _: AdminUser) -> User:
    return _get_user_or_404(db, user_id)


@users_router.put("/{user_id}", response_model=UserRead)
def update_user(user_id: int, payload: UserUpdate, db: Db, admin: AdminUser) -> User:
    user = _get_user_or_404(db, user_id)
    updates = payload.model_dump(exclude_unset=True)
    if user.id == admin.id and updates.get("is_active") is False:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="You cannot deactivate your own account.")
    password = updates.pop("password", None)
    if password is not None:
        user.password_hash = hash_password(password)
    for field, value in updates.items():
        setattr(user, field, value)
    try:
        db.commit()
    except IntegrityError as error:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Username or email already exists.") from error
    db.refresh(user)
    return user


@users_router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(user_id: int, db: Db, admin: AdminUser) -> None:
    user = _get_user_or_404(db, user_id)
    if user.id == admin.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="You cannot delete your own account.")
    db.delete(user)
    try:
        db.commit()
    except IntegrityError as error:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="User is referenced by an order and cannot be deleted.",
        ) from error


@orders_router.post("", response_model=OrderRead, status_code=status.HTTP_201_CREATED)
def create_order(payload: OrderCreate, db: Db, _: AdminUser) -> Order:
    _validate_assignees(db, payload.client_id, payload.courier_id)
    order = Order(**payload.model_dump())
    db.add(order)
    db.commit()
    db.refresh(order)
    return order


@orders_router.get("", response_model=list[OrderRead])
def list_orders(db: Db, user: CurrentUser) -> list[Order]:
    statement = select(Order).order_by(Order.created_at.desc())
    if user.role == UserRole.COURIER:
        statement = statement.where(Order.courier_id == user.id)
    elif user.role == UserRole.CLIENT:
        statement = statement.where(Order.client_id == user.id)
    return list(db.scalars(statement).all())


@orders_router.get("/{order_id}", response_model=OrderRead)
def get_order(order_id: int, db: Db, user: CurrentUser) -> Order:
    order = _get_order_or_404(db, order_id)
    if not _visible_order(order, user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Order is not available to this user.")
    return order


@orders_router.put("/{order_id}", response_model=OrderRead)
def update_order(order_id: int, payload: OrderUpdate, db: Db, _: AdminUser) -> Order:
    order = _get_order_or_404(db, order_id)
    updates = payload.model_dump(exclude_unset=True)
    client_id = updates.get("client_id", order.client_id)
    courier_id = updates.get("courier_id", order.courier_id)
    _validate_assignees(db, client_id, courier_id)
    for field, value in updates.items():
        setattr(order, field, value)
    db.commit()
    db.refresh(order)
    return order


@orders_router.delete("/{order_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_order(order_id: int, db: Db, _: AdminUser) -> None:
    order = _get_order_or_404(db, order_id)
    db.delete(order)
    db.commit()


@telemetry_router.get("/sensors", response_model=list[SensorRead])
def sensor_history(
    db: TelemetryDb,
    _: Annotated[User, Depends(require_roles(UserRole.ADMIN))],
    sensor_type: str | None = Query(
        default=None, pattern="^(temperature|humidity|lighting|motion|battery)$"
    ),
    limit: int = Query(default=100, ge=1, le=1000),
) -> list[SensorData]:
    statement = select(SensorData).order_by(SensorData.timestamp.desc()).limit(limit)
    if sensor_type is not None:
        statement = statement.where(SensorData.sensor_type == sensor_type)
    return list(db.scalars(statement).all())


@telemetry_router.get("/gps", response_model=list[GPSRead])
def gps_history(
    db: TelemetryDb,
    business_db: Db,
    user: CurrentUser,
    order_id: int | None = None,
    courier_id: int | None = None,
    limit: int = Query(default=100, ge=1, le=1000),
) -> list[GPSData]:
    statement = select(GPSData).order_by(GPSData.timestamp.desc()).limit(limit)
    if user.role == UserRole.ADMIN:
        if order_id is not None:
            statement = statement.where(GPSData.order_id == order_id)
        if courier_id is not None:
            statement = statement.where(GPSData.courier_id == courier_id)
    elif user.role == UserRole.COURIER:
        if courier_id is not None and courier_id != user.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot query another courier.")
        statement = statement.where(GPSData.courier_id == user.id)
        if order_id is not None:
            statement = statement.where(GPSData.order_id == order_id)
    else:
        client_orders = select(Order.id).where(Order.client_id == user.id)
        if order_id is not None:
            client_orders = client_orders.where(Order.id == order_id)
        permitted_order_ids = list(business_db.scalars(client_orders).all())
        if order_id is not None and not permitted_order_ids:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Order is not available to this client.")
        statement = statement.where(GPSData.order_id.in_(permitted_order_ids))
    return list(db.scalars(statement).all())


router.include_router(auth_router)
router.include_router(users_router)
router.include_router(orders_router)
router.include_router(telemetry_router)
