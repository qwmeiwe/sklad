from datetime import datetime, timezone

from sqlalchemy import select

from app.auth import hash_password
from app.config import settings
from app.database import BusinessSession, TelemetrySession, create_database_tables
from app.models import GPSData, Order, OrderStatus, SensorData, User, UserRole

DEMO_USERS = (
    ("demo_admin", "DemoAdmin123!", UserRole.ADMIN, "admin@example.test"),
    ("demo_courier", "DemoCourier123!", UserRole.COURIER, "courier@example.test"),
    ("demo_client", "DemoClient123!", UserRole.CLIENT, "client@example.test"),
)
DEMO_ORDER_DESCRIPTION = "Демо-заказ для проверки системы"


def seed_demo_data() -> None:
    if settings.environment.lower() == "production":
        raise RuntimeError("Demo data cannot be seeded in production.")

    create_database_tables()
    now = datetime.now(timezone.utc)

    with BusinessSession() as db:
        users: dict[UserRole, User] = {}
        for username, password, role, email in DEMO_USERS:
            user = db.scalar(select(User).where(User.username == username))
            if user is None:
                user = User(
                    username=username,
                    password_hash=hash_password(password),
                    role=role,
                    email=email,
                )
                db.add(user)
                print(f"Created demo account: {username} ({role.value}).")
            else:
                if user.role != role:
                    raise RuntimeError(
                        f"Existing account {username!r} has role {user.role.value!r}; "
                        f"expected {role.value!r}. No demo order was changed."
                    )
                user.password_hash = hash_password(password)
                user.is_active = True
                print(f"Reset demo credentials: {username}.")
            users[role] = user

        db.flush()
        client = users[UserRole.CLIENT]
        courier = users[UserRole.COURIER]
        order = db.scalar(
            select(Order).where(
                Order.description == DEMO_ORDER_DESCRIPTION,
                Order.client_id == client.id,
                Order.courier_id == courier.id,
            )
        )
        if order is None:
            order = Order(
                description=DEMO_ORDER_DESCRIPTION,
                status=OrderStatus.IN_TRANSIT,
                client_id=client.id,
                courier_id=courier.id,
            )
            db.add(order)
            db.flush()
            print(f"Created demo order: #{order.id}.")
        else:
            order.status = OrderStatus.IN_TRANSIT
        order_id = order.id
        courier_id = courier.id
        db.commit()

    with TelemetrySession() as db:
        existing_types = set(db.scalars(select(SensorData.sensor_type)).all())
        readings = (
            ("temperature", 22.4, "C"),
            ("humidity", 48.0, "%"),
            ("motion", 1.0, "bool"),
            ("lighting", 1.0, "bool"),
            ("battery", 100.0, "%"),
        )
        for sensor_type, value, unit in readings:
            if sensor_type not in existing_types:
                db.add(
                    SensorData(
                        sensor_type=sensor_type,
                        value=value,
                        unit=unit,
                        timestamp=now,
                    )
                )

        existing_gps = db.scalar(
            select(GPSData.id).where(
                GPSData.order_id == order_id,
                GPSData.courier_id == courier_id,
            ).limit(1)
        )
        if existing_gps is None:
            db.add(
                GPSData(
                    courier_id=courier_id,
                    order_id=order_id,
                    latitude=55.751244,
                    longitude=37.618423,
                    timestamp=now,
                )
            )
        db.commit()

    print("\nDemo login credentials:")
    for username, password, role, _ in DEMO_USERS:
        print(f"  {role.value:7}  username: {username}  password: {password}")
    print("Demo warehouse readings and an in-transit courier order are ready.")


if __name__ == "__main__":
    seed_demo_data()
