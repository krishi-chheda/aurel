"""one active appointment per user per start time (audit AUD-19)

Revision ID: b7d41c0e9f12
Revises: a299d22929be
Create Date: 2026-10-28 09:00:00.000000

Additive only. Fails (and changes nothing) if a database already holds two active bookings for the same user and
time; cancel one of them, then rerun.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b7d41c0e9f12'
down_revision: Union[str, Sequence[str], None] = 'a299d22929be'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

ACTIVE = sa.text("status IN ('requested', 'scheduled')")


def upgrade() -> None:
    op.create_index('uq_appointments_active_slot', 'appointments', ['user_id', 'starts_at'], unique=True,
                    sqlite_where=ACTIVE, postgresql_where=ACTIVE)


def downgrade() -> None:
    op.drop_index('uq_appointments_active_slot', table_name='appointments')
