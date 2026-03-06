"""
User resource management routes.

All routes require authentication.

Prefix: /user

Architectures:
  GET    /user/architectures          — list all for current user
  POST   /user/architectures          — create architecture
  GET    /user/architectures/{id}     — get single owned architecture
  DELETE /user/architectures/{id}     — delete owned architecture

Trained Models:
  GET    /user/models                 — list all for current user
  POST   /user/models/import          — upload model file (multipart)
  GET    /user/models/{id}            — get model metadata
  GET    /user/models/{id}/download   — stream model file bytes
  DELETE /user/models/{id}            — delete model record + storage file
"""
import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException, UploadFile, Form, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from dependencies import get_db, get_owned_architecture, get_owned_model, get_storage, require_user
from models.resources import Architecture, TrainedModel
from schemas.resources import ArchitectureCreateSchema, ArchitectureResponse, TrainedModelResponse
from storage.base import StorageBackend

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/user", tags=["user-resources"])


# ---------------------------------------------------------------------------
# Architectures
# ---------------------------------------------------------------------------

@router.get("/architectures", response_model=list[ArchitectureResponse])
async def list_architectures(
    current_user=Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    """List all architectures owned by the current user, newest first."""
    result = await db.execute(
        select(Architecture)
        .where(Architecture.owner_id == current_user.id)
        .order_by(Architecture.created_at.desc())
    )
    return result.scalars().all()


@router.post("/architectures", response_model=ArchitectureResponse, status_code=status.HTTP_201_CREATED)
async def create_architecture(
    body: ArchitectureCreateSchema,
    current_user=Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    """Save a new architecture specification."""
    arch = Architecture(
        id=str(uuid.uuid4()),
        owner_id=current_user.id,
        name=body.name,
        spec=body.spec,
    )
    db.add(arch)
    await db.commit()
    await db.refresh(arch)
    logger.info("Architecture created: %s by user %s", arch.id, current_user.id)
    return arch


@router.get("/architectures/{arch_id}", response_model=ArchitectureResponse)
async def get_architecture(
    arch: Architecture = Depends(get_owned_architecture),
):
    """Return a single owned architecture."""
    return arch


@router.delete("/architectures/{arch_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_architecture(
    arch: Architecture = Depends(get_owned_architecture),
    db: AsyncSession = Depends(get_db),
):
    """Delete an owned architecture."""
    await db.delete(arch)
    await db.commit()
    logger.info("Architecture deleted: %s", arch.id)
    return None


# ---------------------------------------------------------------------------
# Trained Models
# ---------------------------------------------------------------------------

@router.get("/models", response_model=list[TrainedModelResponse])
async def list_models(
    current_user=Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    """List all trained models owned by the current user, newest first."""
    result = await db.execute(
        select(TrainedModel)
        .where(TrainedModel.owner_id == current_user.id)
        .order_by(TrainedModel.created_at.desc())
    )
    return result.scalars().all()


@router.post("/models/import", response_model=TrainedModelResponse, status_code=status.HTTP_201_CREATED)
async def import_model(
    file: UploadFile,
    name: str = Form(...),
    current_user=Depends(require_user),
    db: AsyncSession = Depends(get_db),
    storage: StorageBackend = Depends(get_storage),
):
    """
    Upload a model file (JSON) and register it in the database.

    The file is stored at key:  models/{user_id}/{uuid4}_{original_filename}
    """
    file_bytes = await file.read()
    file_size = len(file_bytes)
    safe_filename = (file.filename or "model.json").replace("/", "_").replace("..", "_")
    storage_key = f"models/{current_user.id}/{uuid.uuid4()}_{safe_filename}"

    await storage.write(storage_key, file_bytes)

    record = TrainedModel(
        id=str(uuid.uuid4()),
        owner_id=current_user.id,
        name=name,
        storage_key=storage_key,
        file_size_bytes=file_size,
    )
    db.add(record)
    await db.commit()
    await db.refresh(record)

    logger.info("Model imported: %s (%d bytes) by user %s", record.id, file_size, current_user.id)
    return record


@router.get("/models/{model_id}", response_model=TrainedModelResponse)
async def get_model(
    model: TrainedModel = Depends(get_owned_model),
):
    """Return metadata for a single owned model (no file content)."""
    return model


@router.get("/models/{model_id}/download")
async def download_model(
    model: TrainedModel = Depends(get_owned_model),
    storage: StorageBackend = Depends(get_storage),
):
    """Stream the model file bytes as an attachment."""
    if not await storage.exists(model.storage_key):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Model file not found in storage.",
        )

    data = await storage.read(model.storage_key)

    async def _iter():
        yield data

    safe_filename = model.storage_key.rsplit("/", 1)[-1]
    return StreamingResponse(
        content=_iter(),
        media_type="application/json",
        headers={
            "Content-Disposition": f'attachment; filename="{safe_filename}"',
            "Content-Length": str(len(data)),
        },
    )


@router.delete("/models/{model_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_model(
    model: TrainedModel = Depends(get_owned_model),
    db: AsyncSession = Depends(get_db),
    storage: StorageBackend = Depends(get_storage),
):
    """Delete a model DB record and its storage file."""
    storage_key = model.storage_key

    await db.delete(model)
    await db.commit()

    # Delete storage file after DB commit — best effort
    try:
        await storage.delete(storage_key)
    except Exception as exc:
        logger.warning("Could not delete storage file %s: %s", storage_key, exc)

    logger.info("Model deleted: %s (key=%s)", model.id, storage_key)
    return None
