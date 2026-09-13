"""add_performance_composite_indexes

Revision ID: cc564daafa4c
Revises: 4a148f45156e
Create Date: 2026-09-13 13:04:27.138133

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel


# revision identifiers, used by Alembic.
revision: str = 'cc564daafa4c'
down_revision: Union[str, Sequence[str], None] = '4a148f45156e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add composite indexes for listing, searching, queue status, and chunk sorting."""
    # 1. Documents: user_id + created_at DESC (Primary pagination sorting)
    op.create_index(
        'ix_documents_user_id_created_at',
        'documents',
        ['user_id', sa.text('created_at DESC')],
        unique=False
    )

    # 2. Documents: user_id + status (Frequent queue and active task filtering)
    op.create_index(
        'ix_documents_user_id_status',
        'documents',
        ['user_id', 'status'],
        unique=False
    )

    # 3. Documents: user_id + status + updated_at DESC (Recent completed tasks)
    op.create_index(
        'ix_documents_user_status_updated_at',
        'documents',
        ['user_id', 'status', sa.text('updated_at DESC')],
        unique=False
    )

    # 4. Documents: user_id + filename (Instant duplicate checking)
    op.create_index(
        'ix_documents_user_id_filename',
        'documents',
        ['user_id', 'filename'],
        unique=False
    )

    # 5. Documents: user_id + sha256_hash (Instant content duplicate check)
    op.create_index(
        'ix_documents_user_id_sha256_hash',
        'documents',
        ['user_id', 'sha256_hash'],
        unique=False
    )

    # 6. Document Chunks: document_id + chunk_index ASC (Chunk inspector ordering)
    op.create_index(
        'ix_document_chunks_doc_chunk_index',
        'document_chunks',
        ['document_id', 'chunk_index'],
        unique=False
    )


def downgrade() -> None:
    """Drop composite indexes."""
    op.drop_index('ix_document_chunks_doc_chunk_index', table_name='document_chunks')
    op.drop_index('ix_documents_user_id_sha256_hash', table_name='documents')
    op.drop_index('ix_documents_user_id_filename', table_name='documents')
    op.drop_index('ix_documents_user_status_updated_at', table_name='documents')
    op.drop_index('ix_documents_user_id_status', table_name='documents')
    op.drop_index('ix_documents_user_id_created_at', table_name='documents')
