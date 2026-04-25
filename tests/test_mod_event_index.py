from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import patch

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

    def query(self, _model):
        return FakeQuery(self.store)

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


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
