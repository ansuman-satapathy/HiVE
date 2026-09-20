"""create_retrieval_profiles_table

Revision ID: e1a5b829c4f1
Revises: cc564daafa4c
Create Date: 2026-09-20 15:52:00.000000

"""
from typing import Sequence, Union
import uuid
from datetime import datetime, timezone
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'e1a5b829c4f1'
down_revision: Union[str, Sequence[str], None] = 'cc564daafa4c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Create table
    table = op.create_table(
        'retrieval_profiles',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=True),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('description', sa.String(), nullable=True),
        sa.Column('top_k', sa.Integer(), nullable=False, server_default='5'),
        sa.Column('rrf_k', sa.Integer(), nullable=False, server_default='60'),
        sa.Column('window_size', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('temperature', sa.Float(), nullable=False, server_default='0.2'),
        sa.Column('document_ids', postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default='[]'),
        sa.Column('is_system_default', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('created_at', sa.DateTime(), nullable=False, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None)),
        sa.Column('updated_at', sa.DateTime(), nullable=False, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None)),
    )
    
    op.create_index('ix_retrieval_profiles_id', 'retrieval_profiles', ['id'], unique=False)
    op.create_index('ix_retrieval_profiles_user_id', 'retrieval_profiles', ['user_id'], unique=False)
    op.create_index('ix_retrieval_profiles_name', 'retrieval_profiles', ['name'], unique=False)
    op.create_index('ix_retrieval_profiles_is_system_default', 'retrieval_profiles', ['is_system_default'], unique=False)

    # 2. Seed Default System Profiles
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    profiles_data = [
        {
            "id": uuid.UUID("00000000-0000-0000-0000-000000000001"),
            "user_id": None,
            "name": "Balanced (Default)",
            "description": "Harmonious hybrid search combining BM25 keyword matching and dense vector embeddings.",
            "top_k": 5,
            "rrf_k": 60,
            "window_size": 1,
            "temperature": 0.2,
            "document_ids": [],
            "is_system_default": True,
            "created_at": now,
            "updated_at": now,
        },
        {
            "id": uuid.UUID("00000000-0000-0000-0000-000000000002"),
            "user_id": None,
            "name": "Deep Research",
            "description": "Wider context expansion and deeper candidate retrieval for complex multi-topic synthesis.",
            "top_k": 8,
            "rrf_k": 60,
            "window_size": 2,
            "temperature": 0.3,
            "document_ids": [],
            "is_system_default": True,
            "created_at": now,
            "updated_at": now,
        },
        {
            "id": uuid.UUID("00000000-0000-0000-0000-000000000003"),
            "user_id": None,
            "name": "Exact & Code",
            "description": "High-precision keyword focus with low temperature for code, error codes, and strict IDs.",
            "top_k": 4,
            "rrf_k": 20,
            "window_size": 0,
            "temperature": 0.0,
            "document_ids": [],
            "is_system_default": True,
            "created_at": now,
            "updated_at": now,
        },
    ]
    op.bulk_insert(table, profiles_data)


def downgrade() -> None:
    op.drop_index('ix_retrieval_profiles_is_system_default', table_name='retrieval_profiles')
    op.drop_index('ix_retrieval_profiles_name', table_name='retrieval_profiles')
    op.drop_index('ix_retrieval_profiles_user_id', table_name='retrieval_profiles')
    op.drop_index('ix_retrieval_profiles_id', table_name='retrieval_profiles')
    op.drop_table('retrieval_profiles')
