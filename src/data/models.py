from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from sqlalchemy import String, Integer, ForeignKey

class Base(DeclarativeBase):
    pass

class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    username: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    email: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    password: Mapped[str] = mapped_column(String(255), nullable=False)

class Device(Base):
    __tablename__ = "devices"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    type: Mapped[str] = mapped_column(String(50), nullable=False)
    secret: Mapped[str] = mapped_column(String(255), nullable=False)

    configurations: Mapped[list["Configuration"]] = relationship(
        back_populates="device",
        cascade="all, delete-orphan",
    )

class Configuration(Base):
    __tablename__ = "configurations"

    device_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("devices.id", ondelete="CASCADE"),
        primary_key=True,
    )

    key: Mapped[str] = mapped_column(
        String(100),
        primary_key=True,
    )

    value: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )

    device: Mapped["Device"] = relationship(back_populates="configurations")