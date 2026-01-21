import bcrypt
from sqlalchemy import select
from sqlalchemy.orm import Session
from .models import User, Device, Configuration

def hash_secret(raw: str) -> str:
    return bcrypt.hashpw(raw.encode(), bcrypt.gensalt()).decode()

def verify_secret(raw: str, hashed: str) -> bool:
    return bcrypt.checkpw(raw.encode(), hashed.encode())

class Store:
    def __init__(self, session: Session):
        self.session = session

    def get_device_by_id(self, device_id: str) -> Device | None:
        return self.session.get(Device, device_id)

    def get_user_by_id(self, user_id: int) -> User | None:
        return self.session.get(User, user_id)

    def set_device_config(self, device_id: str, key: str, value: str) -> None:
        config = Configuration(
            device_id=device_id,
            key=key,
            value=value,
        )
        self.session.merge(config)
        self.session.commit()
    
    def get_device_config(self, device_id: str, key: str) -> str | None:
        config = self.session.get(Configuration, {
            "device_id": device_id,
            "key": key
        })
        if config:
            return config.value
        return None

    def get_user(
        self,
        username: str,
        password: str
    ) -> User | None:
        stmt = select(User).where(User.username == username)
        user = self.session.scalar(stmt)

        if not user:
            return None

        if not verify_secret(password, user.password):
            return None

        return user

    def get_all_devices(self) -> list[Device]:
        stmt = select(Device)
        return list(self.session.scalars(stmt))

    def get_or_register_device(
        self,
        identification: str,
        secret: str,
        *,
        device_type: str = "fan",
        device_name: str | None = None
    ) -> Device | None:
        stmt = select(Device).where(Device.id == identification)
        device = self.session.scalar(stmt)

        if device:
            if not verify_secret(secret, device.secret):
                return None
            return device

        # new device, register
        device = Device(
            id=identification,
            type=device_type,
            name=device_name or f"{identification}",
            secret=hash_secret(secret),
        )

        self.session.add(device)
        self.session.commit()
        self.session.refresh(device)

        return device
