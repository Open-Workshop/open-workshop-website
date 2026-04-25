from __future__ import annotations

import asyncio
import atexit
import datetime
import json
import logging
import threading
import time
from pathlib import Path
from typing import Any
from urllib.parse import quote_plus

import ow_config
from sqlalchemy import Boolean, Column, DateTime, Integer, String, Text, create_engine, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import declarative_base, sessionmaker


logger = logging.getLogger(__name__)

EVENT_ADDED = "mod.added"
EVENT_CHANGED = "mod.changed"
EVENT_DELETED = "mod.deleted"
KNOWN_EVENTS = {EVENT_ADDED, EVENT_CHANGED, EVENT_DELETED}

_thread: threading.Thread | None = None
_stop_event = threading.Event()
_engine: Engine | None = None
_SessionLocal: sessionmaker | None = None
Base = declarative_base()


class KnownMod(Base):
    __tablename__ = str(getattr(ow_config, "MOD_EVENTS_INDEX_TABLE", "known_mods"))

    id = Column(Integer, primary_key=True)
    title = Column(String(255), nullable=False, default="")
    full_description = Column(Text, nullable=False, default="")
    date_update_file = Column(DateTime, nullable=False)
    deleted = Column(Boolean, nullable=False, default=False, index=True)


def _read_setting(name: str, default: object = None) -> object:
    return getattr(ow_config, name, default)


def _read_float(name: str, default: float) -> float:
    value = _read_setting(name, default)
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _read_list(name: str, default: list[str] | None = None) -> list[str]:
    value = _read_setting(name, default or [])
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    if isinstance(value, tuple):
        return [str(item).strip() for item in value if str(item).strip()]
    if isinstance(value, str):
        raw = value.strip()
        if not raw:
            return []
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            return [item.strip() for item in raw.split(",") if item.strip()]
        if isinstance(parsed, list):
            return [str(item).strip() for item in parsed if str(item).strip()]
        return [str(parsed).strip()] if str(parsed).strip() else []
    return []


def _now_utc() -> datetime.datetime:
    return datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)


def _read_sql_port() -> int | None:
    value = getattr(ow_config, "port_sql", None)
    if value in (None, ""):
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _mysql_url(database: str | None = None) -> str:
    user = quote_plus(str(getattr(ow_config, "user_sql", "")))
    password = quote_plus(str(getattr(ow_config, "password_sql", "")))
    host = str(getattr(ow_config, "url_sql", "localhost"))
    port = _read_sql_port()
    auth = f"{user}:{password}@" if password else f"{user}@"
    location = f"{host}:{port}" if port else host
    path = f"/{quote_plus(database)}" if database else ""
    return f"mysql+mysqldb://{auth}{location}{path}?charset=utf8mb4"


def _index_database() -> str:
    return str(getattr(ow_config, "MOD_EVENTS_INDEX_DATABASE", "website"))


def _quote_mysql_identifier(identifier: str) -> str:
    return "`" + identifier.replace("`", "``") + "`"


def _create_index_database_if_needed() -> None:
    if not bool(getattr(ow_config, "MOD_EVENTS_INDEX_CREATE_DATABASE", True)):
        return

    database = _index_database()
    server_engine = create_engine(_mysql_url(None), pool_pre_ping=True)
    try:
        with server_engine.begin() as connection:
            connection.execute(
                text(
                    f"CREATE DATABASE IF NOT EXISTS {_quote_mysql_identifier(database)} "
                    "CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
                )
            )
    finally:
        server_engine.dispose()


def _get_session_factory() -> sessionmaker:
    global _engine, _SessionLocal

    if _SessionLocal is None:
        _create_index_database_if_needed()
        _engine = create_engine(_mysql_url(_index_database()), pool_pre_ping=True)
        Base.metadata.create_all(_engine)
        _SessionLocal = sessionmaker(bind=_engine, expire_on_commit=False)

    return _SessionLocal


def _normalize_event_name(value: object) -> str:
    return str(value or "").strip().lower()


def _parse_event_time(value: object) -> datetime.datetime:
    if value is None:
        return _now_utc()
    raw = str(value).strip()
    if not raw:
        return _now_utc()
    try:
        parsed = datetime.datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError:
        return _now_utc()
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=datetime.timezone.utc)
    return parsed.astimezone(datetime.timezone.utc).replace(tzinfo=None)


def init_index() -> None:
    _get_session_factory()


def is_enabled() -> bool:
    return bool(_nats_servers())


def _nats_servers() -> list[str]:
    servers = []
    url = str(_read_setting("NATS_URL", "") or "").strip()
    if url:
        servers.append(url)
    servers.extend(_read_list("NATS_URLS", []))
    return list(dict.fromkeys(servers))


def record_mod_event(payload: dict[str, Any]) -> bool:
    event_name = _normalize_event_name(payload.get("event"))
    if event_name not in KNOWN_EVENTS:
        return False

    try:
        mod_id = int(payload["id"])
    except (KeyError, TypeError, ValueError):
        return False

    if "title" not in payload or "full_description" not in payload:
        return False

    title = str(payload.get("title") or "")
    full_description = str(payload.get("full_description") or "")
    occurred_at = _parse_event_time(payload.get("occurred_at"))
    deleted = event_name == EVENT_DELETED

    session = _get_session_factory()()
    try:
        mod = session.get(KnownMod, mod_id)
        if mod is None:
            mod = KnownMod(id=mod_id)
            session.add(mod)

        mod.title = title
        mod.full_description = full_description
        mod.date_update_file = occurred_at
        mod.deleted = deleted
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()

    invalidate_sitemap_cache()
    return True


def list_sitemap_mods(limit: int = 49000) -> list[dict[str, Any]]:
    session = _get_session_factory()()
    try:
        rows = (
            session.query(KnownMod)
            .filter(KnownMod.deleted.is_(False))
            .order_by(KnownMod.id)
            .limit(int(limit))
            .all()
        )
        result = []
        for row in rows:
            update_time = row.date_update_file
            if update_time.tzinfo is None:
                update_time = update_time.replace(tzinfo=datetime.timezone.utc)
            result.append(
                {
                    "id": int(row.id),
                    "title": row.title,
                    "full_description": row.full_description,
                    "date_update_file": update_time,
                }
            )
        return result
    finally:
        session.close()


def invalidate_sitemap_cache() -> None:
    sitemap_dir = Path("website/sitemaps")
    if not sitemap_dir.exists():
        return
    for path in sitemap_dir.glob("*.sitemap.xml"):
        try:
            path.unlink()
        except FileNotFoundError:
            pass
        except Exception:
            logger.exception("Failed to remove sitemap cache file %s", path)


async def _handle_message(message: Any) -> None:
    try:
        payload = json.loads(message.data.decode("utf-8"))
    except Exception:
        logger.exception("Invalid NATS mod event payload")
        await message.ack()
        return

    if not isinstance(payload, dict):
        await message.ack()
        return

    if record_mod_event(payload):
        logger.info(
            "Applied mod event event=%s id=%s",
            payload.get("event"),
            payload.get("id"),
        )
    await message.ack()


async def _consume_events() -> None:
    import nats
    from nats.errors import TimeoutError as NatsTimeoutError

    servers = _nats_servers()
    if not servers:
        logger.warning("NATS_URL/NATS_URLS is empty; mod event consumer is disabled")
        return

    stream = str(_read_setting("MOD_EVENTS_STREAM", "MOD_EVENTS"))
    subject = str(_read_setting("MOD_EVENTS_SUBJECT", "mods.*"))
    durable = str(
        _read_setting("MOD_EVENTS_DURABLE", "open-workshop-website-mod-index")
    )

    nc = await nats.connect(
        servers=servers,
        connect_timeout=_read_float("MOD_EVENTS_CONNECT_TIMEOUT_SECONDS", 2),
        name="open-workshop-website",
    )
    try:
        js = nc.jetstream()
        subscription = await js.pull_subscribe(
            subject,
            durable=durable,
            stream=stream,
        )

        while not _stop_event.is_set():
            try:
                messages = await subscription.fetch(
                    batch=20,
                    timeout=_read_float("MOD_EVENTS_FETCH_TIMEOUT_SECONDS", 1),
                )
            except NatsTimeoutError:
                continue

            for message in messages:
                await _handle_message(message)
    finally:
        await nc.drain()


def _run_consumer_loop() -> None:
    reconnect_delay = _read_float("MOD_EVENTS_RECONNECT_DELAY_SECONDS", 5)
    while not _stop_event.is_set():
        try:
            asyncio.run(_consume_events())
        except ModuleNotFoundError:
            logger.exception("nats-py is not installed; mod events are disabled")
            return
        except Exception:
            logger.exception("NATS mod event consumer stopped with error")
            time.sleep(max(reconnect_delay, 0.1))


def start_background_consumer() -> None:
    global _thread

    if not is_enabled():
        return
    if _thread is not None and _thread.is_alive():
        return

    init_index()
    _stop_event.clear()
    _thread = threading.Thread(
        target=_run_consumer_loop,
        name="mod-event-index",
        daemon=True,
    )
    _thread.start()


def stop_background_consumer() -> None:
    _stop_event.set()
    if _thread is not None and _thread.is_alive():
        _thread.join(timeout=2)


atexit.register(stop_background_consumer)
