"""purge_legacy_ticket_and_role_schemas

Revision ID: c0855e2bbc4a
Revises: 1ca61e887fe0
Create Date: 2026-09-12 17:40:15.513374

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c0855e2bbc4a'
down_revision: Union[str, Sequence[str], None] = '1ca61e887fe0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema: drop audit_logs, tickets, and legacy user role column."""
    # 1. Drop audit_logs first (child of tickets and users)
    op.drop_index(op.f('ix_audit_logs_id'), table_name='audit_logs')
    op.drop_table('audit_logs')

    # 2. Drop tickets (child of users)
    op.drop_index(op.f('ix_tickets_id'), table_name='tickets')
    op.drop_table('tickets')

    # 3. Drop legacy role column from users
    op.drop_column('users', 'role')


def downgrade() -> None:
    """Downgrade schema."""
    op.add_column('users', sa.Column('role', sa.String(length=20), nullable=True))
