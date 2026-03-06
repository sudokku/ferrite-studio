"""
Admin management routes.

All routes require the admin role.

Prefix: /admin

GET    /admin/users                         — paginated list of all users (with optional search)
DELETE /admin/users/{user_id}               — delete a user and all their data
PATCH  /admin/users/{user_id}/role          — promote/demote user role
PATCH  /admin/users/{user_id}/active        — suspend / unsuspend a user
GET    /admin/users/{user_id}               — single user detail with resource counts
GET    /admin/users/{user_id}/architectures — list architectures for a specific user
GET    /admin/users/{user_id}/models        — list trained models for a specific user
GET    /admin/stats                         — aggregate counts
GET    /admin/architectures                 — list all architectures across all users
GET    /admin/models                        — list all trained models across all users
DELETE /admin/architectures/{arch_id}       — delete any architecture (admin override)
DELETE /admin/models/{model_id}             — delete any trained model (admin override)
"""
import asyncio
import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from dependencies import get_db, get_storage, require_admin
from models.resources import Architecture, TrainedModel
from models.user import User, UserRole
from schemas.admin import (
    AdminStatsResponse,
    ArchitectureAdminResponse,
    ModelAdminResponse,
    SuspendUserSchema,
    UpdateRoleSchema,
    UserAdminDetailResponse,
    UserAdminResponse,
)
from schemas.resources import ArchitectureResponse, TrainedModelResponse
from storage.base import StorageBackend

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin", tags=["admin"])


# ---------------------------------------------------------------------------
# Helper: build UserAdminResponse from a User ORM object
# ---------------------------------------------------------------------------

def _user_response(u: User) -> UserAdminResponse:
    return UserAdminResponse(
        id=u.id,
        email=u.email,
        username=u.username,
        role=u.role.value if hasattr(u.role, "value") else u.role,
        created_at=u.created_at,
        is_active=u.is_active,
    )


# ---------------------------------------------------------------------------
# GET /admin/users
# ---------------------------------------------------------------------------

@router.get("/users")
async def list_users(
    limit: int = 50,
    offset: int = 0,
    search: str = "",
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """
    Return a paginated list of all users.

    Query params:
      limit  — max items to return (capped at 200, default 50)
      offset — items to skip (default 0)
      search — filter by email or username (case-insensitive contains)
    """
    limit = min(limit, 200)

    base_query = select(User)
    count_query = select(func.count()).select_from(User)

    if search:
        search_lower = search.lower()
        filter_clause = (
            func.lower(User.email).contains(search_lower)
            | func.lower(User.username).contains(search_lower)
        )
        base_query = base_query.where(filter_clause)
        count_query = count_query.where(filter_clause)

    total_result = await db.execute(count_query)
    total = total_result.scalar_one()

    result = await db.execute(
        base_query.order_by(User.created_at.desc()).limit(limit).offset(offset)
    )
    users = result.scalars().all()

    return {
        "total": total,
        "limit": limit,
        "offset": offset,
        "items": [_user_response(u) for u in users],
    }


# ---------------------------------------------------------------------------
# DELETE /admin/users/{user_id}
# ---------------------------------------------------------------------------

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


# ---------------------------------------------------------------------------
# PATCH /admin/users/{user_id}/role
# ---------------------------------------------------------------------------

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
    return _user_response(target)


# ---------------------------------------------------------------------------
# PATCH /admin/users/{user_id}/active
# ---------------------------------------------------------------------------

@router.patch("/users/{user_id}/active", response_model=UserAdminResponse)
async def update_user_active(
    user_id: str,
    body: SuspendUserSchema,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """
    Toggle the is_active flag for a user (suspend / unsuspend).

    An admin cannot suspend themselves.
    """
    if user_id == current_user.id and not body.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Admin cannot suspend their own account.",
        )

    result = await db.execute(select(User).where(User.id == user_id))
    target: User | None = result.scalars().first()
    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")

    target.is_active = body.is_active
    await db.commit()
    await db.refresh(target)

    action = "suspended" if not body.is_active else "unsuspended"
    logger.info("Admin %s %s user %s", current_user.id, action, user_id)
    return _user_response(target)


# ---------------------------------------------------------------------------
# GET /admin/users/{user_id}
# ---------------------------------------------------------------------------

@router.get("/users/{user_id}", response_model=UserAdminDetailResponse)
async def get_user_detail(
    user_id: str,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Return a single user's details including architecture and model counts."""
    result = await db.execute(select(User).where(User.id == user_id))
    target: User | None = result.scalars().first()
    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")

    arch_count = (
        await db.execute(
            select(func.count()).select_from(Architecture).where(Architecture.owner_id == user_id)
        )
    ).scalar_one()

    model_count = (
        await db.execute(
            select(func.count()).select_from(TrainedModel).where(TrainedModel.owner_id == user_id)
        )
    ).scalar_one()

    return UserAdminDetailResponse(
        id=target.id,
        email=target.email,
        username=target.username,
        role=target.role.value if hasattr(target.role, "value") else target.role,
        created_at=target.created_at,
        is_active=target.is_active,
        architecture_count=arch_count,
        model_count=model_count,
    )


# ---------------------------------------------------------------------------
# GET /admin/users/{user_id}/architectures
# ---------------------------------------------------------------------------

@router.get("/users/{user_id}/architectures")
async def list_user_architectures(
    user_id: str,
    limit: int = 50,
    offset: int = 0,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """List all architectures belonging to a specific user."""
    limit = min(limit, 200)

    # Verify user exists
    user_result = await db.execute(select(User).where(User.id == user_id))
    if not user_result.scalars().first():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")

    total = (
        await db.execute(
            select(func.count()).select_from(Architecture).where(Architecture.owner_id == user_id)
        )
    ).scalar_one()

    result = await db.execute(
        select(Architecture)
        .where(Architecture.owner_id == user_id)
        .order_by(Architecture.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    archs = result.scalars().all()

    items = [
        ArchitectureResponse(
            id=a.id,
            name=a.name,
            spec=a.spec,
            created_at=a.created_at,
        )
        for a in archs
    ]
    return {"total": total, "items": items}


# ---------------------------------------------------------------------------
# GET /admin/users/{user_id}/models
# ---------------------------------------------------------------------------

@router.get("/users/{user_id}/models")
async def list_user_models(
    user_id: str,
    limit: int = 50,
    offset: int = 0,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """List all trained models belonging to a specific user."""
    limit = min(limit, 200)

    # Verify user exists
    user_result = await db.execute(select(User).where(User.id == user_id))
    if not user_result.scalars().first():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")

    total = (
        await db.execute(
            select(func.count()).select_from(TrainedModel).where(TrainedModel.owner_id == user_id)
        )
    ).scalar_one()

    result = await db.execute(
        select(TrainedModel)
        .where(TrainedModel.owner_id == user_id)
        .order_by(TrainedModel.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    models = result.scalars().all()

    items = [
        TrainedModelResponse(
            id=m.id,
            name=m.name,
            storage_key=m.storage_key,
            file_size_bytes=m.file_size_bytes,
            input_type=m.input_type,
            output_labels=m.output_labels,
            created_at=m.created_at,
        )
        for m in models
    ]
    return {"total": total, "items": items}


# ---------------------------------------------------------------------------
# GET /admin/stats
# ---------------------------------------------------------------------------

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


# ---------------------------------------------------------------------------
# GET /admin/architectures
# ---------------------------------------------------------------------------

@router.get("/architectures")
async def list_all_architectures(
    user_id: str | None = None,
    search: str = "",
    limit: int = 50,
    offset: int = 0,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """
    List ALL architectures across all users.

    Query params:
      user_id — filter by owner (optional)
      search  — filter by architecture name (case-insensitive contains)
      limit   — max items (capped at 200, default 50)
      offset  — items to skip (default 0)

    Each item includes owner username and email.
    """
    limit = min(limit, 200)

    # Join Architecture with User to get owner info in one query
    base_query = select(Architecture, User).join(User, Architecture.owner_id == User.id)
    count_query = (
        select(func.count())
        .select_from(Architecture)
        .join(User, Architecture.owner_id == User.id)
    )

    if user_id:
        base_query = base_query.where(Architecture.owner_id == user_id)
        count_query = count_query.where(Architecture.owner_id == user_id)

    if search:
        search_lower = search.lower()
        filter_clause = func.lower(Architecture.name).contains(search_lower)
        base_query = base_query.where(filter_clause)
        count_query = count_query.where(filter_clause)

    total = (await db.execute(count_query)).scalar_one()

    result = await db.execute(
        base_query.order_by(Architecture.created_at.desc()).limit(limit).offset(offset)
    )
    rows = result.all()

    items = [
        ArchitectureAdminResponse(
            id=arch.id,
            name=arch.name,
            created_at=arch.created_at,
            owner_id=arch.owner_id,
            owner_username=owner.username,
            owner_email=owner.email,
        )
        for arch, owner in rows
    ]
    return {"total": total, "items": items}


# ---------------------------------------------------------------------------
# GET /admin/models
# ---------------------------------------------------------------------------

@router.get("/models")
async def list_all_models(
    user_id: str | None = None,
    search: str = "",
    limit: int = 50,
    offset: int = 0,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """
    List ALL trained models across all users.

    Query params:
      user_id — filter by owner (optional)
      search  — filter by model name (case-insensitive contains)
      limit   — max items (capped at 200, default 50)
      offset  — items to skip (default 0)

    Each item includes owner username and email.
    """
    limit = min(limit, 200)

    base_query = select(TrainedModel, User).join(User, TrainedModel.owner_id == User.id)
    count_query = (
        select(func.count())
        .select_from(TrainedModel)
        .join(User, TrainedModel.owner_id == User.id)
    )

    if user_id:
        base_query = base_query.where(TrainedModel.owner_id == user_id)
        count_query = count_query.where(TrainedModel.owner_id == user_id)

    if search:
        search_lower = search.lower()
        filter_clause = func.lower(TrainedModel.name).contains(search_lower)
        base_query = base_query.where(filter_clause)
        count_query = count_query.where(filter_clause)

    total = (await db.execute(count_query)).scalar_one()

    result = await db.execute(
        base_query.order_by(TrainedModel.created_at.desc()).limit(limit).offset(offset)
    )
    rows = result.all()

    items = [
        ModelAdminResponse(
            id=model.id,
            name=model.name,
            storage_key=model.storage_key,
            file_size_bytes=model.file_size_bytes,
            created_at=model.created_at,
            owner_id=model.owner_id,
            owner_username=owner.username,
            owner_email=owner.email,
        )
        for model, owner in rows
    ]
    return {"total": total, "items": items}


# ---------------------------------------------------------------------------
# DELETE /admin/architectures/{arch_id}
# ---------------------------------------------------------------------------

@router.delete("/architectures/{arch_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_architecture(
    arch_id: str,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """
    Delete any architecture (admin override, regardless of owner).

    Architectures store their spec as a DB JSON column — no storage files to clean up.
    """
    result = await db.execute(select(Architecture).where(Architecture.id == arch_id))
    arch: Architecture | None = result.scalars().first()
    if not arch:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Architecture not found.")

    await db.delete(arch)
    await db.commit()

    logger.info("Admin %s deleted architecture %s", current_user.id, arch_id)
    return None


# ---------------------------------------------------------------------------
# DELETE /admin/models/{model_id}
# ---------------------------------------------------------------------------

@router.delete("/models/{model_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_model(
    model_id: str,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
    storage: StorageBackend = Depends(get_storage),
):
    """
    Delete any trained model (admin override, regardless of owner).

    Fetches the storage_key, removes the DB record, then deletes the file from storage.
    """
    result = await db.execute(select(TrainedModel).where(TrainedModel.id == model_id))
    model: TrainedModel | None = result.scalars().first()
    if not model:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Model not found.")

    storage_key = model.storage_key
    await db.delete(model)
    await db.commit()

    try:
        await storage.delete(storage_key)
    except Exception:
        logger.warning("Admin delete model %s: storage delete failed for key %s", model_id, storage_key)

    logger.info("Admin %s deleted model %s (key: %s)", current_user.id, model_id, storage_key)
    return None
