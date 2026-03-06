"""
Admin management routes.

All routes require the admin role.

Prefix: /admin

GET    /admin/users               — paginated list of all users
DELETE /admin/users/{user_id}     — delete a user and all their data
PATCH  /admin/users/{user_id}/role — promote/demote user role
GET    /admin/stats               — aggregate counts
"""
import asyncio
import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from dependencies import get_db, get_storage, require_admin
from models.resources import Architecture, TrainedModel
from models.user import User, UserRole
from schemas.admin import AdminStatsResponse, UpdateRoleSchema, UserAdminResponse
from storage.base import StorageBackend

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/users")
async def list_users(
    limit: int = 50,
    offset: int = 0,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """
    Return a paginated list of all users.

    Query params:
      limit  — max items to return (capped at 200, default 50)
      offset — items to skip (default 0)
    """
    limit = min(limit, 200)

    total_result = await db.execute(select(func.count()).select_from(User))
    total = total_result.scalar_one()

    result = await db.execute(
        select(User).order_by(User.created_at.desc()).limit(limit).offset(offset)
    )
    users = result.scalars().all()

    items = [
        UserAdminResponse(
            id=u.id,
            email=u.email,
            username=u.username,
            role=u.role.value if hasattr(u.role, "value") else u.role,
            created_at=u.created_at,
            is_active=u.is_active,
        )
        for u in users
    ]

    return {"total": total, "limit": limit, "offset": offset, "items": items}


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(
    user_id: str,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
    storage: StorageBackend = Depends(get_storage),
):
    """
    Delete a user account and all their data.

    The admin cannot delete their own account via this endpoint.
    Storage files are deleted after the DB commit.
    """
    if user_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Admin cannot delete their own account via this endpoint.",
        )

    result = await db.execute(select(User).where(User.id == user_id))
    target: User | None = result.scalars().first()
    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")

    # Collect storage keys before deleting the user
    models_result = await db.execute(
        select(TrainedModel.storage_key).where(TrainedModel.owner_id == user_id)
    )
    storage_keys = [row[0] for row in models_result.all()]

    await db.delete(target)
    await db.commit()

    # Delete storage files after DB commit
    await asyncio.gather(
        *[storage.delete(key) for key in storage_keys],
        return_exceptions=True,
    )

    logger.info("Admin %s deleted user %s (%d model files removed)", current_user.id, user_id, len(storage_keys))
    return None


@router.patch("/users/{user_id}/role", response_model=UserAdminResponse)
async def update_user_role(
    user_id: str,
    body: UpdateRoleSchema,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """
    Promote or demote a user's role.

    An admin cannot demote themselves.
    """
    if user_id == current_user.id and body.role != UserRole.admin:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Admin cannot demote their own account.",
        )

    result = await db.execute(select(User).where(User.id == user_id))
    target: User | None = result.scalars().first()
    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")

    target.role = body.role
    await db.commit()
    await db.refresh(target)

    logger.info("Admin %s changed role of user %s to %s", current_user.id, user_id, body.role.value)
    return UserAdminResponse(
        id=target.id,
        email=target.email,
        username=target.username,
        role=target.role.value if hasattr(target.role, "value") else target.role,
        created_at=target.created_at,
        is_active=target.is_active,
    )


@router.get("/stats", response_model=AdminStatsResponse)
async def get_stats(
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Return aggregate counts for admin dashboard."""
    user_count = (await db.execute(select(func.count()).select_from(User))).scalar_one()
    arch_count = (await db.execute(select(func.count()).select_from(Architecture))).scalar_one()
    model_count = (await db.execute(select(func.count()).select_from(TrainedModel))).scalar_one()

    return AdminStatsResponse(users=user_count, architectures=arch_count, models=model_count)
