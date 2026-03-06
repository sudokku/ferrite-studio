"""
ORM models for user-owned resources.

Architecture  — saved network specifications
TrainedModel  — trained model file metadata (file lives in storage backend)
"""
import uuid
from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, Integer, JSON, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base


class Architecture(Base):
    __tablename__ = "architectures"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )
    owner_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    spec: Mapped[dict] = mapped_column(JSON, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # lazy="raise" prevents accidental async lazy-load bugs
    owner = relationship("User", lazy="raise")


class TrainedModel(Base):
    __tablename__ = "trained_models"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )
    owner_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    # e.g. "models/{user_id}/{uuid}_{filename}"
    storage_key: Mapped[str] = mapped_column(String(512), nullable=False)
    file_size_bytes: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False, server_default="0")
    # Mirrors ferrite-nn InputType — nullable because it may not be present
    input_type: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    output_labels: Mapped[list | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # lazy="raise" prevents accidental async lazy-load bugs
    owner = relationship("User", lazy="raise")
