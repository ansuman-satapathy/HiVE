"""add_multi_model_and_embedding_settings

Revision ID: a1b2c3d4e5f6
Revises: f3a1b2c4d5e6
Create Date: 2026-11-09 19:20:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, Sequence[str], None] = 'f3a1b2c4d5e6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('workspace_settings', sa.Column('models_config', sa.Text(), nullable=False, server_default='[]'))
    op.add_column('workspace_settings', sa.Column('embedding_provider', sa.String(), nullable=False, server_default='auto'))
    op.add_column('workspace_settings', sa.Column('embedding_model', sa.String(), nullable=True, server_default='BAAI/bge-small-en-v1.5'))
    op.add_column('workspace_settings', sa.Column('embedding_base_url', sa.String(), nullable=True))
    op.add_column('workspace_settings', sa.Column('embedding_api_key', sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column('workspace_settings', 'embedding_api_key')
    op.drop_column('workspace_settings', 'embedding_base_url')
    op.drop_column('workspace_settings', 'embedding_model')
    op.drop_column('workspace_settings', 'embedding_provider')
    op.drop_column('workspace_settings', 'models_config')

