import uuid
from datetime import datetime, timezone
from typing import List, Optional
from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import select, or_
from sqlmodel.ext.asyncio.session import AsyncSession

from app.api.deps import get_db, get_current_user
from app.models.user import User
from app.models.retrieval_profile import RetrievalProfile

router = APIRouter(prefix="/retrieval-profiles", tags=["Retrieval Profiles"])


class ProfileCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = Field(None, max_length=255)
    top_k: int = Field(5, ge=1, le=20)
    rrf_k: int = Field(60, ge=1, le=200)
    window_size: int = Field(1, ge=0, le=3)
    temperature: float = Field(0.2, ge=0.0, le=1.0)
    document_ids: List[str] = Field(default_factory=list)


class ProfileUpdateRequest(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = Field(None, max_length=255)
    top_k: Optional[int] = Field(None, ge=1, le=20)
    rrf_k: Optional[int] = Field(None, ge=1, le=200)
    window_size: Optional[int] = Field(None, ge=0, le=3)
    temperature: Optional[float] = Field(None, ge=0.0, le=1.0)
    document_ids: Optional[List[str]] = None


class ProfileResponse(BaseModel):
    id: uuid.UUID
    name: str
    description: Optional[str] = None
    top_k: int
    rrf_k: int
    window_size: int
    temperature: float
    document_ids: List[str]
    is_system_default: bool
    created_at: datetime
    updated_at: datetime


@router.get("", response_model=List[ProfileResponse])
async def list_profiles(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List system default profiles and custom profiles owned by the current user."""
    statement = (
        select(RetrievalProfile)
        .where(
            or_(
                RetrievalProfile.is_system_default == True,
                RetrievalProfile.user_id == current_user.id,
            )
        )
        .order_by(RetrievalProfile.is_system_default.desc(), RetrievalProfile.name.asc())
    )
    result = await db.exec(statement)
    profiles = result.all()
    return profiles


@router.post("", response_model=ProfileResponse, status_code=status.HTTP_201_CREATED)
async def create_profile(
    req: ProfileCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new custom retrieval profile."""
    # Check for duplicate name under this user
    existing = (
        await db.exec(
            select(RetrievalProfile).where(
                RetrievalProfile.user_id == current_user.id,
                RetrievalProfile.name == req.name.strip(),
            )
        )
    ).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"A profile named '{req.name.strip()}' already exists.",
        )

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    profile = RetrievalProfile(
        id=uuid.uuid4(),
        user_id=current_user.id,
        name=req.name.strip(),
        description=req.description.strip() if req.description else None,
        top_k=req.top_k,
        rrf_k=req.rrf_k,
        window_size=req.window_size,
        temperature=req.temperature,
        document_ids=req.document_ids or [],
        is_system_default=False,
        created_at=now,
        updated_at=now,
    )
    db.add(profile)
    await db.commit()
    await db.refresh(profile)
    return profile


@router.put("/{profile_id}", response_model=ProfileResponse)
async def update_profile(
    profile_id: uuid.UUID,
    req: ProfileUpdateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update an existing custom retrieval profile."""
    profile = (
        await db.exec(
            select(RetrievalProfile).where(RetrievalProfile.id == profile_id)
        )
    ).first()

    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Profile not found.",
        )

    if profile.is_system_default:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="System default profiles cannot be modified. Save as a new custom profile instead.",
        )

    if profile.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to modify this profile.",
        )

    if req.name is not None:
        profile.name = req.name.strip()
    if req.description is not None:
        profile.description = req.description.strip() if req.description else None
    if req.top_k is not None:
        profile.top_k = req.top_k
    if req.rrf_k is not None:
        profile.rrf_k = req.rrf_k
    if req.window_size is not None:
        profile.window_size = req.window_size
    if req.temperature is not None:
        profile.temperature = req.temperature
    if req.document_ids is not None:
        profile.document_ids = req.document_ids

    profile.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    db.add(profile)
    await db.commit()
    await db.refresh(profile)
    return profile


@router.delete("/{profile_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_profile(
    profile_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a custom retrieval profile."""
    profile = (
        await db.exec(
            select(RetrievalProfile).where(RetrievalProfile.id == profile_id)
        )
    ).first()

    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Profile not found.",
        )

    if profile.is_system_default:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="System default profiles cannot be deleted.",
        )

    if profile.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to delete this profile.",
        )

    await db.delete(profile)
    await db.commit()
    return None
