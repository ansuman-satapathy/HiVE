"""create_workspace_settings_table

Revision ID: f3a1b2c4d5e6
Revises: e1a5b829c4f1
Create Date: 2026-11-09 15:15:00.000000

"""
from typing import Sequence, Union
import uuid
from datetime import datetime, timezone
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'f3a1b2c4d5e6'
down_revision: Union[str, Sequence[str], None] = 'e1a5b829c4f1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    table = op.create_table(
        'workspace_settings',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, nullable=False),
        sa.Column('llm_provider', sa.String(), nullable=False, server_default='auto'),
        sa.Column('llm_base_url', sa.String(), nullable=True),
        sa.Column('llm_model', sa.String(), nullable=True),
        sa.Column('llm_api_key', sa.String(), nullable=True),
        sa.Column('allow_demo_autofill', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('created_at', sa.DateTime(), nullable=False, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None)),
        sa.Column('updated_at', sa.DateTime(), nullable=False, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None)),
    )
    op.create_index('ix_workspace_settings_id', 'workspace_settings', ['id'], unique=False)

    # Insert default singleton row
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    default_id = uuid.UUID("00000000-0000-0000-0000-000000000099")
    op.bulk_insert(
        table,
        [
            {
                "id": default_id,
                "llm_provider": "auto",
                "llm_base_url": None,
                "llm_model": None,
                "llm_api_key": None,
                "allow_demo_autofill": True,
                "created_at": now,
                "updated_at": now,
            }
        ]
    )


def downgrade() -> None:
    op.drop_index('ix_workspace_settings_id', table_name='workspace_settings')
    op.drop_table('workspace_settings')

