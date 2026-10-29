from logging.config import fileConfig

import sqlalchemy as sa
from alembic import context

from app import models  # noqa: F401  (registers tables)
from app.config import get_settings
from app.db import Base, UTCDateTime, make_engine

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata
url = get_settings().database_url


def render_item(type_, obj, autogen_context):
    # Keep migrations free of app imports: UTCDateTime is a plain timezone-aware DateTime at the DB level.
    if type_ == "type" and isinstance(obj, UTCDateTime):
        return "sa.DateTime(timezone=True)"
    return False


opts = dict(target_metadata=target_metadata, render_as_batch=url.startswith("sqlite"), render_item=render_item,
            compare_type=True)


if context.is_offline_mode():
    context.configure(url=url, literal_binds=True, **opts)
    with context.begin_transaction():
        context.run_migrations()
else:
    with make_engine(url).connect() as connection:
        context.configure(connection=connection, **opts)
        with context.begin_transaction():
            context.run_migrations()
