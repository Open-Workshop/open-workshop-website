from __future__ import annotations

import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from opentelemetry import propagate, trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import mod_event_index


class FakeQuery:
    def __init__(self, store):
        self.store = store
        self.row_limit = None

    def filter(self, *_args, **_kwargs):
        return self

    def order_by(self, *_args, **_kwargs):
        return self

    def limit(self, row_limit):
        self.row_limit = int(row_limit)
        return self

    def all(self):
        rows = list(self.store.values())
        rows.sort(key=lambda row: row.id)
        if self.row_limit is not None:
            return rows[: self.row_limit]
        return rows


class FakeSession:
    def __init__(self, store):
        self.store = store

    def get(self, _model, row_id):
        return self.store.get(row_id)

    def add(self, row):
        self.store[row.id] = row

    def delete(self, row):
        self.store.pop(row.id, None)

    def execute(self, stmt):
        query = FakeQuery(self.store)
        if stmt._limit_clause is not None:
            query.limit(stmt._limit_clause.value)
        return query

    def commit(self):
        return None

    def rollback(self):
        return None

    def close(self):
        return None


class ModEventIndexTests(unittest.TestCase):
    def test_add_change_delete_events_update_sitemap_index(self) -> None:
        store = {}

        with patch.object(
            mod_event_index,
            "_SessionLocal",
            lambda: FakeSession(store),
        ):
            added = mod_event_index.record_mod_event(
                {
                    "event": "mod.added",
                    "id": 42,
                    "public": 0,
                    "occurred_at": "2026-04-25T10:00:00+00:00",
                }
            )

            self.assertTrue(added)
            rows = mod_event_index.list_sitemap_mods()
            self.assertEqual(len(rows), 1)
            self.assertEqual(rows[0]["id"], 42)
            self.assertEqual(rows[0]["date_update_file"].strftime("%Y-%m-%d"), "2026-04-25")

            changed = mod_event_index.record_mod_event(
                {
                    "event": "mod.changed",
                    "id": 42,
                    "public": 0,
                    "occurred_at": "2026-04-26T11:00:00+00:00",
                }
            )

            self.assertTrue(changed)
            rows = mod_event_index.list_sitemap_mods()
            self.assertEqual(len(rows), 1)
            self.assertEqual(rows[0]["date_update_file"].strftime("%Y-%m-%d"), "2026-04-26")

            hidden = mod_event_index.record_mod_event(
                {
                    "event": "mod.changed",
                    "id": 42,
                    "public": 2,
                    "occurred_at": "2026-04-27T12:00:00+00:00",
                }
            )

            self.assertTrue(hidden)
            self.assertEqual(mod_event_index.list_sitemap_mods(), [])
            self.assertEqual(store, {})

            restored = mod_event_index.record_mod_event(
                {
                    "event": "mod.changed",
                    "id": 42,
                    "public": 0,
                    "occurred_at": "2026-04-28T12:00:00+00:00",
                }
            )

            self.assertTrue(restored)
            self.assertEqual(len(mod_event_index.list_sitemap_mods()), 1)

            deleted = mod_event_index.record_mod_event(
                {
                    "event": "mod.deleted",
                    "id": 42,
                    "public": 0,
                    "occurred_at": "2026-04-29T12:00:00+00:00",
                }
            )

            self.assertTrue(deleted)
            self.assertEqual(mod_event_index.list_sitemap_mods(), [])
            self.assertEqual(store, {})


class SitemapQueryTests(unittest.TestCase):
    def test_sitemap_reads_only_columns_in_id_order_and_applies_limit(self):
        engine = create_engine("sqlite:///:memory:")
        mod_event_index.Base.metadata.create_all(engine)
        factory = sessionmaker(bind=engine)
        with factory.begin() as session:
            for mod_id in (3, 1, 2):
                session.add(mod_event_index.KnownMod(id=mod_id, date_update_file=mod_event_index._parse_event_time("2026-11-22T10:00:00Z")))
        with patch.object(mod_event_index, "_SessionLocal", factory):
            rows = mod_event_index.list_sitemap_mods(limit=2)
        self.assertEqual([row["id"] for row in rows], [1, 2])
        self.assertEqual(rows[0]["date_update_file"].isoformat(), "2026-11-22T10:00:00+00:00")
        engine.dispose()


class IndexStartupTraceTests(unittest.TestCase):
    def test_index_schema_checks_share_startup_trace(self) -> None:
        exporter = InMemorySpanExporter()
        provider = TracerProvider()
        provider.add_span_processor(SimpleSpanProcessor(exporter))
        tracer = provider.get_tracer(__name__)

        def initialize():
            for name in ("CREATE database", "DESCRIBE known_mods", "SHOW known_mods"):
                with tracer.start_as_current_span(name):
                    pass

        with (
            patch.object(mod_event_index.trace, "get_tracer", return_value=tracer),
            patch.object(mod_event_index, "_get_session_factory", side_effect=initialize),
        ):
            mod_event_index.init_index()

        spans = {span.name: span for span in exporter.get_finished_spans()}
        root = spans["startup.mod_index"]
        for name in ("CREATE database", "DESCRIBE known_mods", "SHOW known_mods"):
            self.assertEqual(spans[name].parent.span_id, root.context.span_id)
            self.assertEqual(spans[name].context.trace_id, root.context.trace_id)
        provider.shutdown()


class ModEventTraceTests(unittest.IsolatedAsyncioTestCase):
    async def test_nats_consumer_setup_has_one_trace_and_drains(self) -> None:
        import nats

        exporter = InMemorySpanExporter()
        provider = TracerProvider()
        provider.add_span_processor(SimpleSpanProcessor(exporter))
        tracer = provider.get_tracer(__name__)
        js = SimpleNamespace(pull_subscribe=AsyncMock(return_value=object()))
        client = SimpleNamespace(jetstream=lambda: js, drain=AsyncMock())

        async def connect(**_kwargs):
            with tracer.start_as_current_span("NATS connect"):
                return client

        with (
            patch.object(mod_event_index.trace, "get_tracer", return_value=tracer),
            patch.object(mod_event_index, "_nats_servers", return_value=["nats://localhost:4222"]),
            patch.object(mod_event_index._stop_event, "is_set", return_value=True),
            patch.object(nats, "connect", side_effect=connect),
        ):
            await mod_event_index._consume_events()

        spans = {span.name: span for span in exporter.get_finished_spans()}
        self.assertEqual(spans["NATS connect"].parent.span_id, spans["NATS consumer connect"].context.span_id)
        js.pull_subscribe.assert_awaited_once()
        client.drain.assert_awaited_once()
        provider.shutdown()

    async def test_nats_context_connects_producer_consumer_and_database(self) -> None:
        exporter = InMemorySpanExporter()
        provider = TracerProvider()
        provider.add_span_processor(SimpleSpanProcessor(exporter))
        tracer = provider.get_tracer(__name__)
        headers = {}
        with tracer.start_as_current_span("NATS publish") as producer:
            propagate.inject(headers)

        message = SimpleNamespace(
            data=b'{"event":"mod.changed","id":42,"public":0}',
            headers=headers,
            subject="mods.changed",
            ack=AsyncMock(),
        )

        def record(_payload):
            with tracer.start_as_current_span("SELECT known_mods"):
                return True

        with (
            patch.object(mod_event_index.trace, "get_tracer", return_value=tracer),
            patch.object(mod_event_index, "record_mod_event", side_effect=record),
        ):
            await mod_event_index._handle_message(message)

        spans = {span.name: span for span in exporter.get_finished_spans()}
        consumer = spans["NATS process mod event"]
        self.assertEqual(consumer.context.trace_id, producer.context.trace_id)
        self.assertEqual(consumer.parent.span_id, producer.context.span_id)
        self.assertEqual(spans["SELECT known_mods"].parent.span_id, consumer.context.span_id)
        message.ack.assert_awaited_once()
        provider.shutdown()


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
