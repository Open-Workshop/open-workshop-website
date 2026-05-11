from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import main
from access_policy import build_profile_access, build_tag_access


def _profile_access_source(reason_code: str, *, rights_value: bool = False) -> dict:
    return {
        "authenticated": True,
        "owner_id": 7 if reason_code == "self" else 1,
        "login_method": "google",
        "info": {
            "public": {
                "value": True,
                "reason": "Профиль доступен для просмотра",
                "reason_code": "public",
            },
            "meta": {
                "value": True,
                "reason": "Это ваш профиль" if reason_code == "self" else "Вы администратор",
                "reason_code": reason_code,
            },
        },
        "edit": {
            "rights": {
                "value": rights_value,
                "reason": "Только администратор может менять права",
                "reason_code": "admin" if rights_value else "forbidden",
            },
        },
        "vote_for_reputation": {
            "value": True,
            "reason": "Голосование за репутацию доступно",
            "reason_code": "allowed",
        },
        "write_comments": {
            "value": True,
            "reason": "Комментирование доступно",
            "reason_code": "allowed",
        },
        "set_reactions": {
            "value": True,
            "reason": "Реакции доступны",
            "reason_code": "allowed",
        },
        "delete": {
            "value": reason_code == "self",
            "reason": "Удалять можно только свой профиль",
            "reason_code": "self" if reason_code == "self" else "forbidden",
        },
    }


def _tag_access_source(*, add: bool = False, edit: bool = False, delete: bool = False) -> dict:
    return {
        "authenticated": True,
        "owner_id": 7,
        "login_method": "google",
        "add": {
            "value": add,
            "reason": "Можно создать тег" if add else "Создание тегов недоступно",
            "reason_code": "admin" if add else "forbidden",
        },
        "edit": {
            "value": edit,
            "reason": "Можно редактировать тег" if edit else "Редактирование тегов недоступно",
            "reason_code": "admin" if edit else "forbidden",
        },
        "delete": {
            "value": delete,
            "reason": "Можно удалить тег" if delete else "Удаление тегов недоступно",
            "reason_code": "admin" if delete else "forbidden",
        },
    }


def _profile_payload(user_id: int, username: str = "Alice") -> dict:
    return {
        "general": {
            "id": user_id,
            "username": username,
            "about": "",
            "avatar_url": "",
            "grade": "",
            "registration_date": "2026-04-22T10:00:00+00:00",
            "rating": 91,
            "votes_count": 11,
            "mute": False,
            "author_mods": 2,
            "comments": 3,
        }
    }


class StubHandler:
    def __init__(
        self,
        *,
        authenticated: bool = False,
        handler_id: int = -1,
        profile: dict | bool | None = None,
        response: dict | bool | None = None,
        response_code: int = 200,
        mod_access: dict | None = None,
        mod_add_access: dict | None = None,
        modpack_access: dict | None = None,
        modpack_add_access: dict | None = None,
        game_add_access: dict | None = None,
        game_access: dict | None = None,
        profile_access: dict | None = None,
        tag_access: dict | None = None,
        fetch_results: list[tuple[int, object]] | None = None,
    ) -> None:
        self.authenticated = authenticated
        self.id = handler_id
        self.profile = profile
        self.response = response
        self.response_code = response_code
        self.mod_access = mod_access
        self.mod_add_access = mod_add_access
        self.modpack_access = modpack_access
        self.modpack_add_access = modpack_add_access
        self.game_add_access = game_add_access
        self.game_access = game_access
        self.profile_access = profile_access
        self.tag_access = tag_access
        self.fetch_results = list(fetch_results or [])
        self.fetch_calls: list[tuple[str, str]] = []
        self.render_calls: list[tuple[str, dict]] = []
        self.finish_calls: list[object] = []
        self.calls: list[tuple] = []

    async def __aenter__(self) -> "StubHandler":
        return self

    async def __aexit__(self, exc_type, exc, tb) -> bool:
        return False

    async def get_mod_access(self, mod_id: int, author_id: int | None = None, mode: bool | None = None) -> dict:
        self.calls.append(("get_mod_access", mod_id, author_id, mode))
        return self.mod_access or {}

    async def get_mod_add_access(self) -> dict:
        self.calls.append(("get_mod_add_access",))
        return self.mod_add_access or {}

    async def get_modpack_access(self, modpack_id: int, author_id: int | None = None, mode: bool | None = None) -> dict:
        self.calls.append(("get_modpack_access", modpack_id, author_id, mode))
        return self.modpack_access or {}

    async def get_modpack_add_access(self) -> dict:
        self.calls.append(("get_modpack_add_access",))
        return self.modpack_add_access or {}

    async def get_game_add_access(self) -> dict:
        self.calls.append(("get_game_add_access",))
        return self.game_add_access or {}

    async def get_game_access(self, game_id: int) -> dict:
        self.calls.append(("get_game_access", game_id))
        return self.game_access or {}

    async def get_profile_access(self, profile_id: int) -> dict:
        self.calls.append(("get_profile_access", profile_id))
        return self.profile_access or {}

    async def get_tag_access(self) -> dict:
        self.calls.append(("get_tag_access",))
        return self.tag_access or {}

    async def fetch(self, url: str, method: str = "GET", data=None, headers=None):
        self.fetch_calls.append((url, method))
        if not self.fetch_results:
            raise AssertionError(f"Unexpected fetch call: {url}")
        result = self.fetch_results.pop(0)
        if isinstance(result, Exception):
            raise result
        return result

    def render(self, filename: str, **kwargs):
        self.render_calls.append((filename, kwargs))
        return {"template": filename, "kwargs": kwargs}

    def finish(self, page):
        self.finish_calls.append(page)
        return page


class RouteTests(unittest.IsolatedAsyncioTestCase):
    async def test_add_mod_denies_authenticated_user_without_publish_rights(self) -> None:
        handler = StubHandler(
            authenticated=True,
            mod_add_access={
                "authenticated": True,
                "owner_id": 11,
                "login_method": "google",
                "add": {
                    "value": False,
                    "reason": "Публикация модов недоступна",
                    "reason_code": "forbidden",
                },
                "anonymous_add": {
                    "value": False,
                    "reason": "Публикация без автора доступна только администратору",
                    "reason_code": "admin_required",
                },
                "any": False,
            },
        )

        with patch.object(main, "UserHandler", return_value=handler):
            result = await main.add_mod()

        self.assertEqual(result[1], 403)
        self.assertEqual(handler.render_calls[0][0], "error.html")
        self.assertEqual(handler.render_calls[0][1]["error"], "Публикация модов недоступна")
        self.assertEqual(handler.fetch_calls, [])

    async def test_add_modpack_uses_modpack_page_config(self) -> None:
        handler = StubHandler(
            authenticated=True,
            modpack_add_access={
                "authenticated": True,
                "owner_id": 11,
                "login_method": "google",
                "add": {
                    "value": True,
                    "reason": "Публикация модов доступна",
                    "reason_code": "allowed",
                },
                "anonymous_add": {
                    "value": False,
                    "reason": "Публикация без автора доступна только администратору",
                    "reason_code": "admin_required",
                },
                "any": True,
            },
        )

        with patch.object(main, "UserHandler", return_value=handler):
            with main.app.test_request_context("/modpack/add"):
                result = await main.add_mod()

        self.assertEqual(result["template"], "mod-add.html")
        add_page = handler.render_calls[0][1]["add_page"]
        self.assertEqual(add_page["entity_kind"], "modpack")
        self.assertEqual(add_page["route_prefix"], "modpack")
        self.assertEqual(add_page["heading"], "Создать модпак 😉")
        self.assertFalse(add_page["show_file_upload"])
        self.assertFalse(add_page["show_progress"])
        self.assertIn(("get_modpack_add_access",), handler.calls)
        self.assertNotIn(("get_mod_add_access",), handler.calls)

    async def test_hidden_mod_does_not_fetch_manager_content(self) -> None:
        handler = StubHandler(
            authenticated=False,
            mod_access={
                "authenticated": False,
                "owner_id": -1,
                "login_method": None,
                "info": {
                    "value": False,
                    "reason": "Мод скрыт",
                    "reason_code": "hidden",
                },
                "edit": {
                    "title": {"value": False, "reason": "Недоступно", "reason_code": "forbidden"},
                    "authors": {"value": False, "reason": "Недоступно", "reason_code": "forbidden"},
                    "new_version": {"value": False, "reason": "Недоступно", "reason_code": "forbidden"},
                },
                "delete": {
                    "value": False,
                    "reason": "Удаление недоступно",
                    "reason_code": "forbidden",
                },
                "download": {
                    "value": False,
                    "reason": "Скачивание скрыто",
                    "reason_code": "hidden",
                },
            },
        )

        with patch.object(main, "UserHandler", return_value=handler):
            with main.app.test_request_context("/mod/42"):
                result = await main.mod_view_and_edit(42)

        self.assertEqual(result[1], 403)
        self.assertEqual(handler.fetch_calls, [])
        self.assertEqual(handler.render_calls[0][0], "error.html")
        self.assertEqual(handler.render_calls[0][1]["error"], "Мод скрыт")
        self.assertIn(("get_mod_access", 42, None, None), handler.calls)

    async def test_mod_info_problem_json_is_rendered_as_html_error(self) -> None:
        handler = StubHandler(
            authenticated=True,
            profile={"id": 1, "username": "Alice"},
            mod_access={
                "authenticated": True,
                "owner_id": 1,
                "login_method": "google",
                "info": {
                    "value": True,
                    "reason": "Мод доступен для просмотра",
                    "reason_code": "public",
                },
                "edit": {
                    "title": {"value": False, "reason": "Недоступно", "reason_code": "forbidden"},
                    "authors": {"value": False, "reason": "Недоступно", "reason_code": "forbidden"},
                    "new_version": {"value": False, "reason": "Недоступно", "reason_code": "forbidden"},
                },
                "delete": {
                    "value": False,
                    "reason": "Удаление недоступно",
                    "reason_code": "forbidden",
                },
                "download": {
                    "value": True,
                    "reason": "Мод можно скачать",
                    "reason_code": "public",
                },
            },
            fetch_results=[
                (
                    403,
                    {
                        "type": "about:blank",
                        "title": "Доступ запрещен",
                        "status": 403,
                        "detail": "Заблокировано!",
                        "instance": "http://api.openworkshop.miskler.ru/mods/49754",
                    },
                ),
                (200, {"results": []}),
                (200, []),
            ],
        )

        with patch.object(main, "UserHandler", return_value=handler):
            with main.app.test_request_context("/mod/49754?show_not_public=true&user=1&sgame=no"):
                result = await main.mod_view_and_edit(49754)

        self.assertEqual(result[1], 403)
        self.assertEqual(handler.render_calls[0][0], "error.html")
        self.assertEqual(handler.render_calls[0][1]["error_title"], "Доступ запрещен")
        self.assertEqual(handler.render_calls[0][1]["error"], "Заблокировано!")

    async def test_mod_view_uses_direct_mod_payload_and_items_resources(self) -> None:
        handler = StubHandler(
            authenticated=True,
            profile={"id": 1, "username": "Alice"},
            mod_access={
                "authenticated": True,
                "owner_id": 1,
                "login_method": "google",
                "info": {
                    "value": True,
                    "reason": "Мод доступен для просмотра",
                    "reason_code": "public",
                },
                "edit": {
                    "title": {"value": False, "reason": "Недоступно", "reason_code": "forbidden"},
                    "authors": {"value": False, "reason": "Недоступно", "reason_code": "forbidden"},
                    "new_version": {"value": False, "reason": "Недоступно", "reason_code": "forbidden"},
                },
                "delete": {
                    "value": False,
                    "reason": "Удаление недоступно",
                    "reason_code": "forbidden",
                },
                "download": {
                    "value": True,
                    "reason": "Мод можно скачать",
                    "reason_code": "public",
                },
            },
            fetch_results=[
                (
                    200,
                    {
                        "id": 42,
                        "name": "Example Mod",
                        "short_description": "Short",
                        "description": "[b]Long[/b]",
                        "git_url": "https://github.com/example/repo",
                        "source": "local",
                        "source_id": None,
                        "game_id": 5,
                        "public": 0,
                        "adult": False,
                        "condition": "published",
                        "current_vote": 1,
                        "rating": 91,
                        "votes_count": 11,
                        "downloads": 3,
                        "size": 2048,
                        "size_unpacked": 4096,
                        "created_at": "2026-04-22T10:00:00+00:00",
                        "file_updated_at": "2026-04-23T10:00:00+00:00",
                        "updated_at": "2026-04-24T10:00:00+00:00",
                        "file": None,
                        "dependencies": {"count": 0, "items": []},
                        "conflicts": {"count": 0, "items": []},
                        "game": {"id": 5, "name": "Game"},
                        "authors": {},
                        "tags": [
                            {"id": 37, "name": "Creative"},
                            {"id": 133, "name": "v0.1.3", "group": {"id": 1, "name": "Version"}},
                        ],
                    },
                ),
                (200, {"items": [{"id": 1, "type": "logo", "url": "https://cdn.example/logo.webp"}]}),
                (200, {"items": []}),
                (200, {"items": []}),
            ],
        )

        with patch.object(main, "UserHandler", return_value=handler):
            with main.app.test_request_context("/mod/42"):
                result = await main.mod_view_and_edit(42)

        self.assertEqual(result["template"], "mod.html")
        self.assertEqual(handler.render_calls[0][0], "mod.html")
        self.assertIn("scope=all", handler.fetch_calls[0][0])
        self.assertIn("include=conflicts", handler.fetch_calls[0][0])
        self.assertIn("include=tags", handler.fetch_calls[0][0])
        self.assertEqual(
            handler.fetch_calls[1][0],
            "/resources?page_size=30&owner_type=mods&owner_ids=42&types=logo&types=screenshot",
        )
        render_kwargs = handler.render_calls[0][1]
        self.assertEqual(render_kwargs["info"]["id"], 42)
        self.assertEqual(render_kwargs["info"]["name"], "Example Mod")
        self.assertEqual(render_kwargs["info"]["description"], "[b]Long[/b]")
        self.assertEqual(render_kwargs["info"]["description_html"], "<p><strong>Long</strong></p>")
        self.assertEqual(render_kwargs["info"]["conflicts"], {"count": 0, "items": []})
        self.assertEqual(render_kwargs["info"]["current_vote"], 1)
        self.assertEqual(render_kwargs["info"]["rating_summary"]["label"], "🏅 Очень положительные")
        self.assertIn("91%", render_kwargs["info"]["rating_summary"]["title"])
        self.assertIs(render_kwargs["data"][0], render_kwargs["info"])
        self.assertEqual(render_kwargs["resources"]["items"][0]["url"], "https://cdn.example/logo.webp")
        self.assertTrue(render_kwargs["info"]["no_many_screenshots"])
        self.assertEqual(render_kwargs["info"]["git_url"], "https://github.com/example/repo")
        self.assertEqual(
            [
                (section["title"], [tag["name"] for tag in section["tags"]])
                for section in render_kwargs["tag_display_sections"]
            ],
            [("Базовые теги", ["Creative"]), ("Version", ["v0.1.3"])],
        )

    async def test_mod_view_includes_vote_access_for_authenticated_user(self) -> None:
        profile_access = build_profile_access(_profile_access_source("self", rights_value=False))
        handler = StubHandler(
            authenticated=True,
            handler_id=1,
            profile={"id": 1, "username": "Alice"},
            profile_access=profile_access,
            mod_access={
                "authenticated": True,
                "owner_id": 1,
                "login_method": "google",
                "info": {
                    "value": True,
                    "reason": "Мод доступен для просмотра",
                    "reason_code": "public",
                },
                "edit": {
                    "title": {"value": False, "reason": "Недоступно", "reason_code": "forbidden"},
                    "authors": {"value": False, "reason": "Недоступно", "reason_code": "forbidden"},
                    "new_version": {"value": False, "reason": "Недоступно", "reason_code": "forbidden"},
                },
                "delete": {
                    "value": False,
                    "reason": "Удаление недоступно",
                    "reason_code": "forbidden",
                },
                "download": {
                    "value": True,
                    "reason": "Мод можно скачать",
                    "reason_code": "public",
                },
            },
            fetch_results=[
                (
                    200,
                    {
                        "id": 42,
                        "name": "Example Mod",
                        "short_description": "Short",
                        "description": "[b]Long[/b]",
                        "source": "local",
                        "source_id": None,
                        "game_id": 5,
                        "public": 0,
                        "adult": False,
                        "condition": "published",
                        "downloads": 3,
                        "size": 2048,
                        "size_unpacked": 4096,
                        "created_at": "2026-04-22T10:00:00+00:00",
                        "file_updated_at": "2026-04-23T10:00:00+00:00",
                        "updated_at": "2026-04-24T10:00:00+00:00",
                        "file": None,
                        "dependencies": {"count": 0, "items": []},
                        "conflicts": {"count": 0, "items": []},
                        "game": {"id": 5, "name": "Game"},
                        "authors": {},
                    },
                ),
                (200, {"items": []}),
                (200, {"items": []}),
                (200, {"items": []}),
            ],
        )

        with patch.object(main, "UserHandler", return_value=handler):
            with main.app.test_request_context("/mod/42"):
                result = await main.mod_view_and_edit(42)

        self.assertEqual(result["template"], "mod.html")
        self.assertIn(("get_profile_access", 1), handler.calls)
        render_kwargs = handler.render_calls[0][1]
        self.assertIs(render_kwargs["vote_access"], profile_access)

    async def test_mod_view_uses_conflict_cards_and_scope_all(self) -> None:
        handler = StubHandler(
            authenticated=True,
            profile={"id": 1, "username": "Alice"},
            mod_access={
                "authenticated": True,
                "owner_id": 1,
                "login_method": "google",
                "info": {
                    "value": True,
                    "reason": "Мод доступен для просмотра",
                    "reason_code": "public",
                },
                "edit": {
                    "title": {"value": False, "reason": "Недоступно", "reason_code": "forbidden"},
                    "authors": {"value": False, "reason": "Недоступно", "reason_code": "forbidden"},
                    "new_version": {"value": False, "reason": "Недоступно", "reason_code": "forbidden"},
                },
                "delete": {
                    "value": False,
                    "reason": "Удаление недоступно",
                    "reason_code": "forbidden",
                },
                "download": {
                    "value": True,
                    "reason": "Мод можно скачать",
                    "reason_code": "public",
                },
            },
            fetch_results=[
                (
                    200,
                    {
                        "id": 42,
                        "name": "Example Mod",
                        "short_description": "Short",
                        "description": "[b]Long[/b]",
                        "source": "local",
                        "source_id": None,
                        "game_id": 5,
                        "public": 0,
                        "adult": False,
                        "condition": "published",
                        "downloads": 3,
                        "size": 2048,
                        "size_unpacked": 4096,
                        "created_at": "2026-04-22T10:00:00+00:00",
                        "file_updated_at": "2026-04-23T10:00:00+00:00",
                        "updated_at": "2026-04-24T10:00:00+00:00",
                        "file": None,
                        "dependencies": {"count": 0, "items": []},
                        "conflicts": {"count": 1, "items": [77]},
                        "game": {"id": 5, "name": "Game"},
                        "authors": {},
                        "tags": [
                            {"id": 29, "name": "Wip"},
                            {"id": 495, "name": "0.10", "group": {"id": 1, "name": "Version"}},
                        ],
                    },
                ),
                (200, {"items": [{"id": 1, "type": "logo", "url": "https://cdn.example/logo.webp"}]}),
                (200, {"items": [{"id": 77, "name": "Conflict Mod"}]}),
                (200, {"items": [{"id": 9, "owner_id": 77, "type": "logo", "url": "https://cdn.example/conflict.webp"}]}),
                (200, {"items": []}),
            ],
        )

        with patch.object(main, "UserHandler", return_value=handler):
            with main.app.test_request_context("/mod/42"):
                result = await main.mod_view_and_edit(42)

        self.assertEqual(result["template"], "mod.html")
        self.assertIn("scope=all", handler.fetch_calls[0][0])
        self.assertIn("include=conflicts", handler.fetch_calls[0][0])
        self.assertIn("include=tags", handler.fetch_calls[0][0])
        render_kwargs = handler.render_calls[0][1]
        self.assertEqual(render_kwargs["info"]["conflicts"], {"count": 1, "items": [77]})
        self.assertIn(77, render_kwargs["conflicts"])
        self.assertEqual(render_kwargs["conflicts"][77]["name"], "Conflict Mod")
        self.assertEqual(render_kwargs["conflicts"][77]["img"], "https://cdn.example/conflict.webp")

    async def test_mod_view_preserves_optional_dependencies(self) -> None:
        handler = StubHandler(
            authenticated=True,
            profile={"id": 1, "username": "Alice"},
            mod_access={
                "authenticated": True,
                "owner_id": 1,
                "login_method": "google",
                "info": {
                    "value": True,
                    "reason": "Мод доступен для просмотра",
                    "reason_code": "public",
                },
                "edit": {
                    "title": {"value": False, "reason": "Недоступно", "reason_code": "forbidden"},
                    "authors": {"value": False, "reason": "Недоступно", "reason_code": "forbidden"},
                    "new_version": {"value": False, "reason": "Недоступно", "reason_code": "forbidden"},
                },
                "delete": {
                    "value": False,
                    "reason": "Удаление недоступно",
                    "reason_code": "forbidden",
                },
                "download": {
                    "value": True,
                    "reason": "Мод можно скачать",
                    "reason_code": "public",
                },
            },
            fetch_results=[
                (
                    200,
                    {
                        "id": 42,
                        "name": "Example Mod",
                        "short_description": "Short",
                        "description": "[b]Long[/b]",
                        "source": "local",
                        "source_id": None,
                        "game_id": 5,
                        "public": 0,
                        "adult": False,
                        "condition": "published",
                        "downloads": 3,
                        "size": 2048,
                        "size_unpacked": 4096,
                        "created_at": "2026-04-22T10:00:00+00:00",
                        "file_updated_at": "2026-04-23T10:00:00+00:00",
                        "updated_at": "2026-04-24T10:00:00+00:00",
                        "file": None,
                        "dependencies": {
                            "count": 2,
                            "items": [
                                {"mod_id": 11, "optional": False},
                                {"mod_id": 22, "optional": True},
                            ],
                        },
                        "conflicts": {"count": 0, "items": []},
                        "game": {"id": 5, "name": "Game"},
                        "authors": {},
                    },
                ),
                (200, {"items": [{"id": 1, "type": "logo", "url": "https://cdn.example/logo.webp"}]}),
                (200, {"items": [
                    {"id": 11, "name": "Required Mod"},
                    {"id": 22, "name": "Optional Mod"},
                ]}),
                (200, {"items": [
                    {"owner_id": 11, "type": "logo", "url": "https://cdn.example/required.webp"},
                    {"owner_id": 22, "type": "logo", "url": "https://cdn.example/optional.webp"},
                ]}),
                (200, {"items": []}),
            ],
        )

        with patch.object(main, "UserHandler", return_value=handler):
            with main.app.test_request_context("/mod/42"):
                result = await main.mod_view_and_edit(42)

        self.assertEqual(result["template"], "mod.html")
        render_kwargs = handler.render_calls[0][1]
        self.assertEqual(render_kwargs["dependencies"][11]["optional"], False)
        self.assertEqual(render_kwargs["dependencies"][22]["optional"], True)
        self.assertEqual(render_kwargs["dependencies"][22]["img"], "https://cdn.example/optional.webp")

    async def test_mod_edit_uses_conflict_cards_and_conflict_scope(self) -> None:
        handler = StubHandler(
            authenticated=True,
            profile={"id": 1, "username": "Alice"},
            mod_access={
                "authenticated": True,
                "owner_id": 1,
                "login_method": "google",
                "info": {
                    "value": True,
                    "reason": "Мод доступен для просмотра",
                    "reason_code": "public",
                },
                "edit": {
                    "title": {"value": True, "reason": "Можно редактировать", "reason_code": "allowed"},
                    "authors": {"value": True, "reason": "Можно редактировать", "reason_code": "allowed"},
                    "new_version": {"value": True, "reason": "Можно загружать версии", "reason_code": "allowed"},
                },
                "delete": {
                    "value": False,
                    "reason": "Удаление недоступно",
                    "reason_code": "forbidden",
                },
                "download": {
                    "value": True,
                    "reason": "Мод можно скачать",
                    "reason_code": "public",
                },
            },
            fetch_results=[
                (
                    200,
                    {
                        "id": 42,
                        "name": "Example Mod",
                        "short_description": "Short",
                        "description": "[b]Long[/b]",
                        "source": "local",
                        "source_id": None,
                        "game_id": 5,
                        "public": 0,
                        "adult": False,
                        "condition": "published",
                        "downloads": 3,
                        "size": 2048,
                        "size_unpacked": 4096,
                        "created_at": "2026-04-22T10:00:00+00:00",
                        "file_updated_at": "2026-04-23T10:00:00+00:00",
                        "updated_at": "2026-04-24T10:00:00+00:00",
                        "file": None,
                        "dependencies": {"count": 0, "items": []},
                        "conflicts": {"count": 1, "items": [77]},
                        "game": {"id": 5, "name": "Game"},
                        "authors": {},
                        "tags": [
                            {"id": 29, "name": "Wip"},
                            {"id": 495, "name": "0.10", "group": {"id": 1, "name": "Version"}},
                        ],
                    },
                ),
                (200, {"items": [{"id": 1, "type": "logo", "url": "https://cdn.example/logo.webp"}]}),
                (200, {"tag_groups": [{"id": 1, "name": "Version"}]}),
                (200, {"items": [{"id": 77, "name": "Conflict Mod"}]}),
                (200, {"items": [{"id": 9, "owner_id": 77, "type": "logo", "url": "https://cdn.example/conflict.webp"}]}),
                (200, {"items": []}),
            ],
        )

        with patch.object(main, "UserHandler", return_value=handler):
            with main.app.test_request_context("/mod/42/edit"):
                result = await main.mod_view_and_edit(42)

        self.assertEqual(result["template"], "mod-edit.html")
        self.assertIn("scope=outgoing", handler.fetch_calls[0][0])
        self.assertIn("include=conflicts", handler.fetch_calls[0][0])
        self.assertIn("include=tags", handler.fetch_calls[0][0])
        self.assertIn("/mods/feed?game=5", [url for url, _method in handler.fetch_calls])
        self.assertNotIn("/mods/42/tags", [url for url, _method in handler.fetch_calls])
        render_kwargs = handler.render_calls[0][1]
        self.assertEqual(render_kwargs["info"]["conflicts"], {"count": 1, "items": [77]})
        self.assertIn(77, render_kwargs["conflicts"])
        self.assertEqual(render_kwargs["conflicts"][77]["name"], "Conflict Mod")
        self.assertEqual(render_kwargs["conflicts"][77]["img"], "https://cdn.example/conflict.webp")
        self.assertEqual([section["title"] for section in render_kwargs["tag_sections"]], ["Version", "Без группы"])
        self.assertEqual(render_kwargs["tag_sections"][0]["tags"][0]["name"], "0.10")
        self.assertEqual([tag["name"] for tag in render_kwargs["tags"]], ["0.10", "Wip"])

    async def test_modpack_edit_uses_modpack_edit_config(self) -> None:
        handler = StubHandler(
            authenticated=False,
            modpack_access={
                "authenticated": False,
                "owner_id": -1,
                "login_method": None,
                "info": {
                    "value": True,
                    "reason": "Мод доступен для просмотра",
                    "reason_code": "public",
                },
                "edit": {
                    "title": {"value": True, "reason": "Можно редактировать", "reason_code": "allowed"},
                    "description": {"value": True, "reason": "Можно редактировать", "reason_code": "allowed"},
                    "short_description": {"value": True, "reason": "Можно редактировать", "reason_code": "allowed"},
                    "authors": {"value": False, "reason": "Недоступно", "reason_code": "forbidden"},
                },
                "delete": {
                    "value": False,
                    "reason": "Удаление недоступно",
                    "reason_code": "forbidden",
                },
            },
            fetch_results=[
                (
                    200,
                    {
                        "id": 42,
                        "name": "Pack Example",
                        "short_description": "Short",
                        "description": "[b]Long[/b]",
                        "source": "local",
                        "source_id": None,
                        "game_id": 5,
                        "public": 0,
                        "adult": False,
                        "created_at": "2026-04-22T10:00:00+00:00",
                        "updated_at": "2026-04-24T10:00:00+00:00",
                        "rating": 0,
                        "current_vote": None,
                        "downloads": 3,
                        "authors": {},
                        "tags": [
                            {"id": 301, "name": "Challenge"},
                            {"id": 495, "name": "0.10", "group": {"id": 1, "name": "Version"}},
                        ],
                    },
                ),
                (200, {"id": 5, "name": "Game"}),
                (
                    200,
                    {
                        "items": [
                            {"mod_id": 11, "sort_order": 2, "auto_added": True},
                        ],
                    },
                ),
                (200, {"items": [{"id": 11, "name": "Core Mod"}]}),
                (200, {"items": [{"owner_id": 11, "url": "https://cdn.example/core.webp"}]}),
                (200, {"tag_groups": [{"id": 1, "name": "Version"}]}),
                (
                    200,
                    {
                        "items": [
                            {
                                "id": 501,
                                "owner_id": 42,
                                "type": "logo",
                                "url": "https://cdn.example/pack-logo.webp",
                                "sort_order": 0,
                            },
                            {
                                "id": 502,
                                "owner_id": 42,
                                "type": "screenshot",
                                "url": "https://cdn.example/pack-shot.webp",
                                "sort_order": 1,
                            },
                        ],
                    },
                ),
            ],
        )

        with patch.object(main, "UserHandler", return_value=handler):
            with main.app.test_request_context("/modpack/42/edit"):
                result = await main.mod_view_and_edit(42)

        self.assertEqual(result["template"], "mod-edit.html")
        render_kwargs = handler.render_calls[0][1]
        self.assertEqual(render_kwargs["edit_page"]["entity_kind"], "modpack")
        self.assertEqual(render_kwargs["edit_page"]["title_placeholder"], "Название модпака")
        self.assertTrue(render_kwargs["edit_page"]["show_modpack_mods"])
        self.assertTrue(render_kwargs["edit_page"]["show_game_info"])
        self.assertTrue(render_kwargs["edit_page"]["show_media_manager"])
        self.assertTrue(render_kwargs["edit_page"]["show_tags_editor"])
        self.assertFalse(render_kwargs["right_edit"]["new_version"])
        self.assertIn("Open Modpack", render_kwargs["edit_title"])
        self.assertEqual(render_kwargs["info"]["game"]["id"], 5)
        self.assertIn(("get_modpack_access", 42, None, None), handler.calls)
        self.assertNotIn(("get_mod_access", 42, None, None), handler.calls)
        self.assertEqual(
            handler.fetch_calls[:3],
            [
                ("/modpacks/42", "GET"),
                ("/games/5", "GET"),
                ("/modpacks/42/mods", "GET"),
            ],
        )
        self.assertIn(
            "/mods?page_size=1&ids=11",
            [url for url, _method in handler.fetch_calls],
        )
        self.assertIn(
            "/resources?page_size=50&owner_type=mods&owner_ids=11&types=logo",
            [url for url, _method in handler.fetch_calls],
        )
        self.assertIn("/mods/feed?game=5", [url for url, _method in handler.fetch_calls])
        self.assertNotIn("/modpacks/42/tags", [url for url, _method in handler.fetch_calls])
        self.assertIn(
            "/resources?page_size=30&owner_type=modpacks&owner_ids=42&types=logo&types=screenshot",
            [url for url, _method in handler.fetch_calls],
        )
        self.assertEqual(len(handler.fetch_calls), 7)
        self.assertEqual(len(render_kwargs["modpack_mods"]), 1)
        self.assertEqual(render_kwargs["modpack_mods"][0]["id"], 11)
        self.assertEqual(render_kwargs["modpack_mods"][0]["name"], "Core Mod")
        self.assertEqual(render_kwargs["modpack_mods"][0]["img"], "https://cdn.example/core.webp")
        self.assertEqual(render_kwargs["modpack_mods"][0]["sort_order"], 2)
        self.assertTrue(render_kwargs["modpack_mods"][0]["auto_added"])
        self.assertEqual([tag["name"] for tag in render_kwargs["tags"]], ["0.10", "Challenge"])
        self.assertEqual([section["title"] for section in render_kwargs["tag_sections"]], ["Version", "Без группы"])
        self.assertEqual(render_kwargs["tag_sections"][0]["tags"][0]["name"], "0.10")
        self.assertEqual(len(render_kwargs["resources"]["items"]), 2)
        self.assertEqual(render_kwargs["resources"]["items"][0]["type"], "logo")
        self.assertEqual(render_kwargs["resources"]["items"][0]["url"], "https://cdn.example/pack-logo.webp")
        self.assertEqual(render_kwargs["resources"]["items"][1]["type"], "screenshot")
        nav_html = main.app.jinja_env.get_template("html-partials/mod-edit/nav.html").render(
            info={"id": 42},
            edit_page={"entity_kind": "modpack"},
        )
        self.assertIn('href="/modpack/42"', nav_html)
        self.assertIn("Открыть страницу модпака", nav_html)
        self.assertNotIn('href="/mod/42"', nav_html)

    async def test_modpack_view_uses_public_template(self) -> None:
        handler = StubHandler(
            authenticated=False,
            modpack_access={
                "authenticated": False,
                "owner_id": -1,
                "login_method": None,
                "info": {
                    "value": True,
                    "reason": "Мод доступен для просмотра",
                    "reason_code": "public",
                },
                "edit": {
                    "title": {"value": False, "reason": "Недоступно", "reason_code": "forbidden"},
                    "description": {"value": False, "reason": "Недоступно", "reason_code": "forbidden"},
                    "short_description": {"value": False, "reason": "Недоступно", "reason_code": "forbidden"},
                    "authors": {"value": False, "reason": "Недоступно", "reason_code": "forbidden"},
                },
                "delete": {
                    "value": False,
                    "reason": "Удаление недоступно",
                    "reason_code": "forbidden",
                },
            },
            fetch_results=[
                (
                    200,
                    {
                        "id": 42,
                        "name": "Pack Example",
                        "short_description": "Short",
                        "description": "[b]Long[/b]",
                        "source": "local",
                        "source_id": None,
                        "game_id": 5,
                        "public": 1,
                        "adult": False,
                        "created_at": "2026-04-22T10:00:00+00:00",
                        "updated_at": "2026-04-24T10:00:00+00:00",
                        "rating": 88,
                        "votes_count": 7,
                        "current_vote": None,
                        "downloads": 12,
                        "authors": {},
                        "tags": [
                            {"id": 301, "name": "Challenge"},
                            {"id": 6, "name": "1.3", "group": {"id": 1, "name": "Version"}},
                        ],
                        "resources": [
                            {
                                "id": 501,
                                "owner_id": 42,
                                "type": "logo",
                                "url": "https://cdn.example/pack-logo.webp",
                                "sort_order": 0,
                            },
                            {
                                "id": 502,
                                "owner_id": 42,
                                "type": "screenshot",
                                "url": "https://cdn.example/pack-shot.webp",
                                "sort_order": 1,
                            },
                        ],
                    },
                ),
                (200, {"id": 5, "name": "Game"}),
                (
                    200,
                    {
                        "modpack_id": 42,
                        "items": [
                            {"mod_id": 11, "sort_order": 2, "auto_added": True},
                        ],
                    },
                ),
                (
                    200,
                    {
                        "items": [
                            {
                                "id": 11,
                                "name": "Core Mod",
                                "source": "steam",
                                "game_id": 5,
                                "public": 0,
                                "adult": False,
                                "condition": "published",
                                "rating": 88,
                                "votes_count": 7,
                                "downloads": 3,
                                "size": 0,
                                "size_unpacked": 0,
                            }
                        ],
                    },
                ),
                (200, {"items": [{"owner_id": 11, "url": "https://cdn.example/core.webp"}]}),
            ],
        )

        with patch.object(main, "UserHandler", return_value=handler):
            with main.app.test_request_context("/modpack/42"):
                result = await main.mod_view_and_edit(42)

        self.assertEqual(result["template"], "modpack.html")
        render_kwargs = handler.render_calls[0][1]
        self.assertTrue(render_kwargs["is_modpack_data"])
        self.assertEqual(render_kwargs["info"]["game"]["id"], 5)
        self.assertEqual(render_kwargs["info"]["rating_summary"]["label"], "🏅 Очень положительные")
        self.assertEqual(render_kwargs["info"]["logo"], "https://cdn.example/pack-logo.webp")
        self.assertEqual(
            render_kwargs["tags"],
            [
                {"id": 301, "name": "Challenge"},
                {"id": 6, "name": "1.3", "group": {"id": 1, "name": "Version"}},
            ],
        )
        self.assertEqual(
            [
                (section["title"], [tag["name"] for tag in section["tags"]])
                for section in render_kwargs["tag_display_sections"]
            ],
            [("Базовые теги", ["Challenge"]), ("Version", ["1.3"])],
        )
        self.assertEqual(len(render_kwargs["resources"]["items"]), 2)
        self.assertEqual(render_kwargs["modpack_mods"][0]["id"], 11)
        self.assertEqual(render_kwargs["modpack_mods"][0]["rating"], 88)
        self.assertEqual(render_kwargs["modpack_mods"][0]["rating_summary"]["label"], "🏅 Очень положительные")
        self.assertTrue(render_kwargs["modpack_mods"][0]["auto_added"])
        self.assertIn(("get_modpack_access", 42, None, None), handler.calls)
        self.assertNotIn(("get_mod_access", 42, None, None), handler.calls)
        self.assertEqual(
            handler.fetch_calls,
            [
                ("/modpacks/42", "GET"),
                ("/games/5", "GET"),
                ("/modpacks/42/mods", "GET"),
                ("/mods?page_size=1&ids=11", "GET"),
                ("/resources?page_size=50&owner_type=mods&owner_ids=11&types=logo", "GET"),
            ],
        )

    async def test_tags_admin_route_renders_tag_list(self) -> None:
        tag_access = build_tag_access(_tag_access_source(add=True, edit=True, delete=True))
        handler = StubHandler(
            authenticated=True,
            handler_id=1,
            tag_access=tag_access,
            fetch_results=[
                (
                    200,
                    {
                        "items": [
                            {"id": 1, "name": "Action", "orphaned": True},
                        ],
                        "pagination": {"total": 2},
                    },
                ),
                (
                    200,
                    {
                        "items": [
                            {"id": 4, "name": "Meta"},
                            {"id": 2, "name": "Genre"},
                        ],
                        "pagination": {"total": 2},
                    },
                ),
                (
                    200,
                    {
                        "items": [],
                        "pagination": {"total": 0},
                    },
                ),
                (
                    200,
                    {
                        "items": [
                            {"id": 2, "name": "Action Challenge", "group": {"id": 4, "name": "Meta"}, "games": [5]},
                        ],
                        "pagination": {"total": 1},
                    },
                ),
                (
                    200,
                    {
                        "items": [
                            {"id": 5, "name": "Minecraft"},
                        ],
                        "pagination": {"total": 1},
                    },
                ),
            ],
        )

        with patch.object(main, "UserHandler", return_value=handler):
            with main.app.test_request_context("/tags?name=action"):
                result = await main.tags_admin()

        self.assertEqual(result["template"], "tags.html")
        self.assertIn(("get_tag_access",), handler.calls)
        self.assertNotIn(("get_profile_access", 1), handler.calls)
        self.assertEqual(
            handler.fetch_calls[0][0],
            "/tags?name=action&include=orphaned&include=group&include=games&page_size=50",
        )
        self.assertEqual(handler.fetch_calls[1][0], "/tag-groups?page_size=50")
        self.assertEqual(handler.fetch_calls[2][0], "/tag-groups/2/tags?name=action&page_size=50")
        self.assertEqual(handler.fetch_calls[3][0], "/tag-groups/4/tags?name=action&page_size=50")
        self.assertEqual(handler.fetch_calls[4][0], "/games?ids=5&page_size=50")
        render_kwargs = handler.render_calls[0][1]
        self.assertIs(render_kwargs["tag_access"], tag_access)
        self.assertEqual(render_kwargs["tags_total"], 2)
        self.assertEqual(render_kwargs["tag_groups_total"], 2)
        self.assertEqual([group["name"] for group in render_kwargs["tag_groups"]], ["Genre", "Meta"])
        self.assertEqual([section["title"] for section in render_kwargs["tag_tree_sections"]], ["Orphaned", "Meta"])
        self.assertEqual(render_kwargs["tag_tree_sections"][0]["count"], 1)
        self.assertTrue(render_kwargs["tag_tree_sections"][0]["problem"])
        self.assertEqual(render_kwargs["tag_tree_sections"][1]["tags"][0]["games"][0]["label"], "Minecraft")
        self.assertEqual(render_kwargs["tags_with_group_total"], 1)
        self.assertEqual(render_kwargs["tags_with_games_total"], 1)
        self.assertEqual(render_kwargs["tags_orphaned_total"], 1)
        self.assertEqual(render_kwargs["query_name"], "action")
        self.assertTrue(render_kwargs["tags_search_active"])
        self.assertTrue(render_kwargs["tags"][0]["is_global"])
        self.assertTrue(render_kwargs["tags"][0]["is_orphaned"])
        self.assertFalse(render_kwargs["tags"][1]["is_global"])
        self.assertEqual(render_kwargs["tags"][1]["group_name"], "Meta")
        self.assertEqual(render_kwargs["tags"][1]["games"][0]["id"], 5)
        self.assertEqual(render_kwargs["tags"][1]["games"][0]["label"], "Minecraft")

    async def test_tags_admin_route_ignores_legacy_orphaned_query_flag(self) -> None:
        tag_access = build_tag_access(_tag_access_source(add=True, edit=True, delete=True))
        handler = StubHandler(
            authenticated=True,
            handler_id=1,
            tag_access=tag_access,
            fetch_results=[
                (
                    200,
                    {
                        "items": [
                            {"id": 7, "name": "Lonely", "orphaned": True, "games": []},
                        ],
                        "pagination": {"total": 2},
                    },
                ),
                (
                    200,
                    {
                        "items": [
                            {"id": 3, "name": "Meta"},
                        ],
                        "pagination": {"total": 1},
                    },
                ),
                (
                    200,
                    {
                        "items": [],
                        "pagination": {"total": 0},
                    },
                ),
            ],
        )

        with patch.object(main, "UserHandler", return_value=handler):
            with main.app.test_request_context("/tags?orphaned=true&name=lonely"):
                result = await main.tags_admin()

        self.assertEqual(result["template"], "tags.html")
        self.assertEqual(
            handler.fetch_calls[0][0],
            "/tags?name=lonely&include=orphaned&include=group&include=games&page_size=50",
        )
        self.assertEqual(handler.fetch_calls[1][0], "/tag-groups?page_size=50")
        self.assertEqual(handler.fetch_calls[2][0], "/tag-groups/3/tags?name=lonely&page_size=50")
        self.assertEqual(len(handler.fetch_calls), 3)
        render_kwargs = handler.render_calls[0][1]
        self.assertEqual(render_kwargs["tag_groups_total"], 1)
        self.assertEqual([section["title"] for section in render_kwargs["tag_tree_sections"]], ["Orphaned"])
        self.assertTrue(render_kwargs["tags"][0]["is_orphaned"])
        self.assertEqual(render_kwargs["tags"][0]["scope_label"], "Бесхозный тег")

    async def test_tags_admin_route_denies_user_without_tag_crud_rights(self) -> None:
        handler = StubHandler(
            authenticated=True,
            handler_id=1,
            tag_access=build_tag_access(_tag_access_source()),
        )

        with patch.object(main, "UserHandler", return_value=handler):
            with main.app.test_request_context("/tags"):
                result = await main.tags_admin()

        self.assertEqual(result[1], 403)
        self.assertEqual(handler.render_calls[0][0], "error.html")
        self.assertIn("правами управления тегами", handler.render_calls[0][1]["error"])
        self.assertEqual(handler.fetch_calls, [])
        self.assertEqual(handler.calls, [("get_tag_access",)])

    def test_mod_add_template_exposes_adult_toggle(self) -> None:
        mod_add = (ROOT / "website/mod-add.html").read_text(encoding="utf-8")
        self.assertIn('id="mod-adult"', mod_add)
        self.assertIn('Контент 18+', mod_add)
        self.assertIn("add_page.kind == 'mod'", mod_add)
        self.assertIn("add_page.adult_description", mod_add)

    def test_mod_edit_params_template_exposes_adult_toggle(self) -> None:
        mod_params = (ROOT / "website/html-partials/mod-edit/page-params.html").read_text(encoding="utf-8")
        self.assertIn('id="mod-adult"', mod_params)
        self.assertIn("startdata", mod_params)
        self.assertIn('Контент 18+', mod_params)
        self.assertIn("edit_page.new_version_title", mod_params)
        self.assertIn("edit_page.delete_button_label", mod_params)
        self.assertNotIn("Можно включить или снять пометку 18+ без изменения других параметров мода.", mod_params)

    def test_mod_add_script_sends_adult_flag(self) -> None:
        script = (ROOT / "website/assets/scripts/pages/mod-add.js").read_text(encoding="utf-8")
        self.assertIn("const adultCheckbox = document.querySelector('input#mod-adult');", script)
        self.assertIn("adult: Boolean(adultCheckbox && adultCheckbox.checked),", script)

    def test_mod_edit_save_service_sends_adult_flag(self) -> None:
        script = (ROOT / "website/assets/scripts/pages/mod-edit/save-service.js").read_text(encoding="utf-8")
        self.assertIn("const adultCheckbox = runtime.resolveElement(settings.adultCheckbox);", script)
        self.assertIn("const gitUrlInput = runtime.resolveElement(settings.gitUrlInput);", script)
        self.assertIn("const conflictsEditorId = String(settings.conflictsEditorId || 'mod-conflicts-editor');", script)
        self.assertIn("const modpackModsEditorId = String(settings.modpackModsEditorId || 'modpack-mods-editor');", script)
        self.assertIn("const initialModpackMods = getPickerSelectedNodes(modpackModsEditorId).map(function (node) {", script)
        self.assertIn("adult: runtime.diffValue(adultCurrentValue, adultStartValue),", script)
        self.assertIn("git_url: {", script)
        self.assertIn("payload[key] = value.value === null ? null : value.value;", script)
        self.assertIn("payload[key] = value.value === 'checked';", script)
        self.assertIn("const conflicts = getPickerChanges(conflictsEditorId);", script)
        self.assertIn("const modpackMods = getModpackModsChanges(modpackModsEditorId);", script)
        self.assertIn("autoAdded: String(node.dataset.pickerAutoAdded || 'false') === 'true',", script)
        self.assertIn("await api.updateConflict(id, true);", script)
        self.assertIn("await syncConflicts(changes.conflicts);", script)
        self.assertIn("await syncModpackMods(changes.modpackMods);", script)
        self.assertIn("await api.updateModpackMods(changes.items);", script)

    def test_mod_edit_save_service_supports_dependency_optionality(self) -> None:
        script = (ROOT / "website/assets/scripts/pages/mod-edit/save-service.js").read_text(encoding="utf-8")
        self.assertIn("const dependencies = getPickerChanges(dependenciesEditorId, true);", script)
        self.assertIn("dependencies.update.length > 0", script)
        self.assertIn("await api.updateDependency(id, true, optionalById[id]);", script)
        self.assertIn("await api.updateDependencyOptional(id, optionalById[id]);", script)

    def test_mod_edit_script_passes_conflicts_editor_id(self) -> None:
        script = (ROOT / "website/assets/scripts/pages/mod-edit.js").read_text(encoding="utf-8")
        app_config = (ROOT / "app_config.py").read_text(encoding="utf-8")
        self.assertIn("conflictsEditorId: showConflicts ? 'mod-conflicts-editor' : '',", script)
        self.assertIn("modpackModsEditorId: showModpackMods ? 'modpack-mods-editor' : '',", script)
        self.assertIn("gitUrlInput: showGitPanel ? root.querySelector('#mod-git-url') : null,", script)
        self.assertIn("resourceOwnerType: entityKind === 'modpack' ? 'modpacks' : 'mods',", script)
        self.assertIn("mod-edit-modpack-autodependencies", script)
        self.assertIn("const modpackAutoDependencies = showModpackMods", script)
        self.assertIn("modpackAutoDependencies.bind()", script)
        self.assertIn("action === 'modpack-autodependencies-build'", script)
        self.assertIn("modpackAutoDependencies.refresh()", script)
        self.assertIn("/assets/scripts/pages/mod-edit/modpack-autodependencies.js", app_config)

    def test_mod_edit_api_exposes_relation_endpoints(self) -> None:
        script = (ROOT / "website/assets/scripts/pages/mod-edit/api.js").read_text(encoding="utf-8")
        app_config = (ROOT / "app_config.py").read_text(encoding="utf-8")
        self.assertIn("async function updateConflict(conflictId, add)", script)
        self.assertIn("async function updateDependency(dependencyId, add, optional)", script)
        self.assertIn("async function updateDependencyOptional(dependencyId, optional)", script)
        self.assertIn("async function buildMissingDependencies(modIds)", script)
        self.assertIn("async function buildConflicts(modIds)", script)
        self.assertIn("apiPaths.mod.dependencies_update", script)
        self.assertIn("apiPaths.mod.conflicts_add", script)
        self.assertIn("apiPaths.mod.conflicts_delete", script)
        self.assertIn('\"dependencies_update\": {\"method\": \"PUT\", \"path\": \"/mods/{mod_id}/dependencies/{dependency_mod_id}\"}', app_config)
        self.assertIn('\"build\": {', app_config)
        self.assertIn('\"dependencies_missing\": {\"method\": \"GET\", \"path\": \"/mods/build/dependencies/missing\"}', app_config)
        self.assertIn('\"conflicts\": {\"method\": \"GET\", \"path\": \"/mods/build/conflicts\"}', app_config)
        self.assertIn("conflict_mod_id: conflictId", script)
        self.assertIn("entityApiPaths.tags_add", script)
        self.assertIn("entityApiPaths.tags_delete", script)
        self.assertIn('\"tags\": {\"method\": \"GET\", \"path\": \"/modpacks/{modpack_id}/tags\"}', app_config)
        self.assertIn('\"tags_add\": {\"method\": \"POST\", \"path\": \"/modpacks/{modpack_id}/tags/{tag_id}\"}', app_config)
        self.assertIn('\"tags_delete\": {\"method\": \"DELETE\", \"path\": \"/modpacks/{modpack_id}/tags/{tag_id}\"}', app_config)
        self.assertIn('\"list\": {\"method\": \"GET\", \"path\": \"/tags\"}', app_config)
        self.assertIn('\"tag_group\": {', app_config)
        self.assertIn('\"add\": {\"method\": \"POST\", \"path\": \"/tag-groups\"}', app_config)
        self.assertIn('\"tags\": {\"method\": \"GET\", \"path\": \"/tag-groups/{group_id}/tags\"}', app_config)
        self.assertIn('\"edit\": {\"method\": \"PATCH\", \"path\": \"/tag-groups/{group_id}\"}', app_config)
        self.assertIn('\"delete\": {\"method\": \"DELETE\", \"path\": \"/tag-groups/{group_id}\"}', app_config)
        self.assertIn("async function updateModpackMods(items)", script)
        self.assertIn("entityApiPaths.mods_update", script)
        self.assertIn('\"mods_update\": {\"method\": \"PUT\", \"path\": \"/modpacks/{modpack_id}/mods\"}', app_config)
        self.assertIn('\"view\": [\"/modpack/<int:mod_id>\", \"/modpack/<int:mod_id>.html\"]', app_config)

    def test_mod_edit_templates_expose_relation_editors(self) -> None:
        mod_main = (ROOT / "website/html-partials/mod-edit/page-main.html").read_text(encoding="utf-8")
        screenshots_edit = (ROOT / "website/html-partials/screenshots-edit.html").read_text(encoding="utf-8")
        mod_dependence = (ROOT / "website/html-partials/mod-dependence-edit.html").read_text(encoding="utf-8")
        mod_conflicts = (ROOT / "website/html-partials/mod-conflict-edit.html").read_text(encoding="utf-8")
        modpack_mods = (ROOT / "website/html-partials/modpack-mods-edit.html").read_text(encoding="utf-8")
        mod_edit_page = (ROOT / "website/mod-edit.html").read_text(encoding="utf-8")
        mod_params = (ROOT / "website/html-partials/mod-edit/page-params.html").read_text(encoding="utf-8")
        taglike_macros = (ROOT / "website/html-partials/macros/taglike-editor.html").read_text(encoding="utf-8")
        tags_edit = (ROOT / "website/assets/scripts/vendors/tags-edit.js").read_text(encoding="utf-8")
        dependence_script = (ROOT / "website/assets/scripts/vendors/dependence-edit.js").read_text(encoding="utf-8")
        media_manager_script = (ROOT / "website/assets/scripts/pages/mod-edit/media-manager.js").read_text(encoding="utf-8")
        self.assertIn("mod-conflicts-editor", mod_main)
        self.assertIn("mod-git-url", mod_main)
        self.assertIn("mod-git-panel", mod_main)
        self.assertIn("data-git-url-source", mod_main)
        self.assertIn("data-git-favicon", mod_main)
        self.assertIn("info.get('git_url') or ''", mod_main)
        self.assertIn('<aside class="mod-edit__sidebar">', mod_main)
        self.assertIn("media_image_alt='Изображение ' ~ entity_label_genitive", mod_main)
        self.assertIn("data-media-image-alt", screenshots_edit)
        self.assertIn("const mediaImageAlt = String(root.dataset.mediaImageAlt || 'Изображение мода');", media_manager_script)
        self.assertGreater(mod_main.index("mod-git-url"), mod_main.index('<aside class="mod-edit__sidebar">'))
        self.assertNotIn("Укажите ссылку на репозиторий мода", mod_main)
        self.assertNotIn("<span>Git URL</span>", mod_main)
        self.assertLess(mod_main.index("mod-tags-editor"), mod_main.index("data-git-url-block"))
        self.assertIn("render_grouped_tags_editor(tag_sections, 'mod-tags-editor')", mod_main)
        self.assertLess(mod_main.index("data-git-url-block"), mod_main.index("mod-dependencies-editor"))
        self.assertIn("html-partials/modpack-mods-edit.html", mod_main)
        self.assertIn("modpack-mods-editor", modpack_mods)
        self.assertIn("modpack-mods-edit__auto-build", modpack_mods)
        self.assertIn("data-action=\"modpack-autodependencies-build\"", modpack_mods)
        self.assertIn("show_view_link=true", modpack_mods)
        self.assertIn("Добавить мод", modpack_mods)
        self.assertIn("Убрать мод", modpack_mods)
        self.assertIn("load_scripts=false", modpack_mods)
        self.assertIn("show_optional_toggle=true", mod_main)
        self.assertIn("dependence_optional_toggle", mod_dependence)
        self.assertIn("show_optional_toggle if show_optional_toggle is defined else false", mod_dependence)
        self.assertIn("html-partials/mod-conflict-edit.html", mod_main)
        self.assertIn("Добавить конфликт", mod_conflicts)
        self.assertIn("render_conflicts_editor", mod_conflicts)
        self.assertIn("data-picker-show-optional-toggle", taglike_macros)
        self.assertIn("data-picker-item-image-alt", taglike_macros)
        self.assertIn("data-picker-remove-action-alt", taglike_macros)
        self.assertIn("data-action=\"dependency-toggle-optional\"", taglike_macros)
        self.assertIn("picker-editor__item-title--row", taglike_macros)
        self.assertIn("picker-editor__item-title-text", taglike_macros)
        self.assertIn("modpack-mods-edit__view-link", taglike_macros)
        self.assertIn("gameTagsEndpoint", tags_edit)
        self.assertIn("page_size: 30", tags_edit)
        self.assertIn("media-item__logo-toggle", taglike_macros)
        self.assertIn("media-item__logo-checkbox", taglike_macros)
        self.assertNotIn("picker-editor__optional-toggle-track", taglike_macros)
        self.assertNotIn("picker-editor__optional-toggle-thumb", taglike_macros)
        self.assertIn("html-partials/save-progress.html", mod_edit_page)
        self.assertNotIn("save-progress.html", mod_params)
        self.assertIn("const requestedIds = Array.isArray(params && params.ids)", dependence_script)
        self.assertIn("delete searchParams.allowed_ids;", dependence_script)
        self.assertIn("searchParams.sort = '-dependents_count';", dependence_script)
        self.assertIn("const showOptionalToggle = root.dataset.pickerShowOptionalToggle === 'true';", dependence_script)
        self.assertIn("dependency-toggle-optional", dependence_script)
        self.assertIn("syncOptionalToggleState", dependence_script)
        self.assertIn("fetchModItems({", dependence_script)
        self.assertIn("ids,", dependence_script)
        self.assertIn("document.readyState === 'loading'", dependence_script)
        self.assertIn("DOMContentLoaded", dependence_script)
        self.assertIn("initDependencyEditors", dependence_script)

    def test_modpack_edit_params_template_shows_game_readonly(self) -> None:
        mod_params = (ROOT / "website/html-partials/mod-edit/page-params.html").read_text(encoding="utf-8")
        self.assertIn("edit_page.show_game_info", mod_params)
        self.assertIn("Принадлежит игре", mod_params)
        self.assertIn("Поле только для просмотра", mod_params)
        self.assertIn("mod-edit__readonly-link", mod_params)
        self.assertIn("Игра не указана", mod_params)

    def test_modpack_edit_autodependencies_ui_and_styles(self) -> None:
        taglike_macros = (ROOT / "website/html-partials/macros/taglike-editor.html").read_text(encoding="utf-8")
        mod_edit_styles = (ROOT / "website/assets/styles/pages/mod-edit.css").read_text(encoding="utf-8")
        tags_styles = (ROOT / "website/assets/styles/mini-parts/tags.css").read_text(encoding="utf-8")
        auto_script = (ROOT / "website/assets/scripts/pages/mod-edit/modpack-autodependencies.js").read_text(encoding="utf-8")
        app_config = (ROOT / "app_config.py").read_text(encoding="utf-8")

        self.assertIn("tag-link-yellow", taglike_macros)
        self.assertIn("Автозависимость", taglike_macros)
        self.assertIn("data-action=\"modpack-auto-added-toggle\"", taglike_macros)
        self.assertIn("data-modpack-auto-badge=\"true\"", taglike_macros)
        self.assertIn("picker-editor__item-title--row", taglike_macros)
        self.assertIn("picker-editor__item-title-text", taglike_macros)
        self.assertIn("target=\"_blank\"", taglike_macros)
        self.assertIn(".modpack-auto-badge", tags_styles)
        self.assertIn(".modpack-auto-badge__remove", tags_styles)
        self.assertIn(".mod-edit__field--readonly", mod_edit_styles)
        self.assertIn(".modpack-mods-edit__auto-build", mod_edit_styles)
        self.assertIn(".modpack-mods-edit__view-link", mod_edit_styles)
        self.assertIn("data-action=\"modpack-autodependencies-build\"", (ROOT / "website/html-partials/modpack-mods-edit.html").read_text(encoding="utf-8"))
        self.assertIn("async function refreshAutoDependencies()", auto_script)
        self.assertIn("let bound = false;", auto_script)
        self.assertIn("manualIds.length === 0", auto_script)
        self.assertIn("await api.buildMissingDependencies(manualIds);", auto_script)
        self.assertIn("await editor.setDefaultSelected(autoIds);", auto_script)
        self.assertIn("syncAutoBadgeState(item, false);", auto_script)
        self.assertIn("syncAutoBadgeState(node, true);", auto_script)
        self.assertIn("getAutoBadge(node)", auto_script)
        self.assertIn("createAutoBadge()", auto_script)
        self.assertIn("handleAutoBadgeToggle", auto_script)
        self.assertIn("/assets/scripts/pages/mod-edit/modpack-autodependencies.js", app_config)

        with main.app.app_context():
            rendered = main.app.jinja_env.get_template("html-partials/modpack-mods-edit.html").render(
                {
                    "info": {"game": {"id": 5}},
                    "modpack_mods": [
                        {
                            "id": 11,
                            "name": "Core Mod",
                            "img": "https://cdn.example/core.webp",
                            "auto_added": True,
                        }
                    ],
                    "editor_id": "modpack-mods-editor",
                }
            )

        self.assertIn("modpack-auto-badge", rendered)
        self.assertIn("modpack-mods-edit__view-link", rendered)
        self.assertIn('target="_blank"', rendered)

    def test_mod_template_exposes_conflicts_section(self) -> None:
        mod_page = (ROOT / "website/mod.html").read_text(encoding="utf-8")
        mod_styles = (ROOT / "website/assets/styles/pages/mod.css").read_text(encoding="utf-8")
        mod_script = (ROOT / "website/assets/scripts/mod.js").read_text(encoding="utf-8")
        self.assertIn("Конфликты мода", mod_page)
        self.assertIn("Ссылки", mod_page)
        self.assertIn("data-mod-rating-widget", mod_page)
        self.assertIn("data-rating-score", mod_page)
        self.assertIn("data-rating-votes-count", mod_page)
        self.assertIn("data-current-vote", mod_page)
        self.assertEqual(mod_page.count('data-action="mod-rate"'), 2)
        self.assertIn("mod-rating-panel__header", mod_page)
        self.assertIn("mod-rating-panel__score", mod_page)
        self.assertIn("mod_rating_summary.title", mod_page)
        self.assertIn("mod_rating_summary.label", mod_page)
        self.assertIn("data-action=\"mod-rate\"", mod_page)
        self.assertIn('role="group" aria-label="Голосование за мод"', mod_page)
        self.assertIn('aria-label="Лайк"', mod_page)
        self.assertIn('aria-label="Дизлайк"', mod_page)
        self.assertNotIn('aria-label="Снять голос"', mod_page)
        self.assertNotIn('data-value="0"', mod_page)
        self.assertIn("mod-rating-panel__actions--locked", mod_page)
        self.assertIn("mod-rating-panel__overlay", mod_page)
        self.assertIn("mod-rating-panel__overlay-text", mod_page)
        self.assertIn('class="mod-rating-panel__glyph"', mod_page)
        self.assertIn("mod-git-panel", mod_page)
        self.assertIn("data-git-url-block", mod_page)
        self.assertIn("data-git-url-source", mod_page)
        self.assertIn("data-git-favicon", mod_page)
        self.assertIn("info.get('git_url') or ''", mod_page)
        self.assertIn("render_tag_display_sections", mod_page)
        self.assertIn("tag_display_sections", mod_page)
        self.assertIn("mod-tags-panel", mod_styles)
        self.assertIn("mod-tags-panel__section", mod_styles)
        self.assertIn(".mod-rating-panel__actions", mod_styles)
        self.assertIn("grid-template-columns: repeat(2, minmax(0, 1fr));", mod_styles)
        self.assertIn("max-width: 150px;", mod_styles)
        self.assertIn("background: rgba(23, 28, 61, 0.18);", mod_styles)
        self.assertNotIn("backdrop-filter", mod_styles)
        self.assertNotIn("radial-gradient(circle at 18% 22%", mod_styles)
        self.assertIn("function formatSteamRatingSummary(rating, votesCount)", mod_script)
        self.assertIn("function applySteamRatingSummary(node, summary)", mod_script)
        self.assertIn("function parseCurrentVote(value)", mod_script)
        self.assertIn("Нет оценок", mod_script)
        self.assertIn("const entityKind = String(widget.dataset.entityKind || 'mod')", mod_script)
        self.assertIn("const entityApiPaths = apiPaths[entityKind] || apiPaths.mod || {}", mod_script)
        self.assertIn("setRatingButtonState(widget, parseCurrentVote(widget.dataset.currentVote));", mod_script)
        self.assertIn("const nextValue = currentVote === value ? 0 : value;", mod_script)
        self.assertIn("function initModpackSelectionControls()", mod_script)
        self.assertIn("function triggerModpackDownloads(widget)", mod_script)
        self.assertIn("data-modpack-download-selected", mod_script)

    def test_modpack_template_exposes_public_sections(self) -> None:
        modpack_page = (ROOT / "website/modpack.html").read_text(encoding="utf-8")
        modpack_styles = (ROOT / "website/assets/styles/pages/modpack.css").read_text(encoding="utf-8")
        standart_html = (ROOT / "website/html-partials/standart.html").read_text(encoding="utf-8")

        self.assertIn('data-entity-kind="modpack"', modpack_page)
        self.assertIn('class="outline-container mod-rating-panel"', modpack_page)
        self.assertIn("modpack-mods-panel", modpack_page)
        self.assertNotIn("modpack-short-description", modpack_page)
        self.assertLess(modpack_page.index("mod-description"), modpack_page.index("modpack-mods-panel"))
        self.assertIn("modpack-mods-panel__header", modpack_page)
        self.assertIn("modpack-mods-panel__actions", modpack_page)
        self.assertIn("modpack-mods-panel__select-all", modpack_page)
        self.assertIn("modpack-mod__main", modpack_page)
        self.assertIn("modpack-mod__select", modpack_page)
        self.assertIn("data-modpack-download-widget", modpack_page)
        self.assertIn("data-modpack-select-all", modpack_page)
        self.assertIn("data-modpack-select-item", modpack_page)
        self.assertIn("data-modpack-download-selected", modpack_page)
        self.assertNotIn("Автодобавлен", modpack_page)
        self.assertIn("Open Modpack", modpack_page)
        self.assertIn("/assets/styles/pages/modpack.css", modpack_page)
        self.assertIn("render_tag_display_sections", modpack_page)
        self.assertIn("tag_display_sections", modpack_page)
        self.assertIn("is_modpack_data", standart_html)
        self.assertIn("Logo of modpack", standart_html)
        self.assertIn(".modpack-mods-panel", modpack_styles)
        self.assertIn(".modpack-mods-panel__header", modpack_styles)
        self.assertIn(".modpack-mods-panel__actions", modpack_styles)
        self.assertIn(".modpack-mods-panel__select-all", modpack_styles)
        self.assertIn(".modpack-mod__main", modpack_styles)
        self.assertIn(".modpack-mod__select", modpack_styles)
        self.assertIn(".modpack-mod.is-selected", modpack_styles)
        self.assertIn(".modpack-download-selected", modpack_styles)
        self.assertNotIn(".modpack-short-description", modpack_styles)

    def test_tags_admin_template_exposes_crud_layout(self) -> None:
        template = (ROOT / "website/tags.html").read_text(encoding="utf-8")
        styles = (ROOT / "website/assets/styles/pages/tags.css").read_text(encoding="utf-8")
        script = (ROOT / "website/assets/scripts/pages/tags-admin.js").read_text(encoding="utf-8")

        self.assertIn("data-tags-admin-root", template)
        self.assertIn("data-tags-can-add", template)
        self.assertIn("data-tags-can-edit", template)
        self.assertIn("data-tags-can-delete", template)
        self.assertIn("data-tags-create-form", template)
        self.assertIn("data-tags-create-group", template)
        self.assertIn("data-tags-row", template)
        self.assertIn("data-tags-row-group", template)
        self.assertIn("data-tags-original-group-id", template)
        self.assertIn('data-action="tag-delete"', template)
        self.assertIn("data-groups-create-form", template)
        self.assertIn("data-groups-row", template)
        self.assertIn('data-action="group-delete"', template)
        self.assertIn('data-action="tags-save-all"', template)
        self.assertIn("data-tags-pending-count", template)
        self.assertIn("data-tags-pending-list", template)
        self.assertIn("html-partials/save-progress.html", template)
        self.assertIn("Черновик изменений", template)
        self.assertIn("Добавить в очередь", template)
        self.assertNotIn('data-action="tag-save"', template)
        self.assertNotIn('data-action="group-save"', template)
        self.assertIn("tag_tree_sections", template)
        self.assertIn("data-tag-tree", template)
        self.assertIn("data-tag-tree-section", template)
        self.assertIn("data-tag-tree-toggle", template)
        self.assertIn("data-tag-tree-item", template)
        self.assertIn("tags-admin__header", template)
        self.assertIn("tags-admin__summary", template)
        self.assertIn("tags-admin__layout", template)
        self.assertIn("tags-admin__tag-card", template)
        self.assertIn("Дерево тегов", template)
        self.assertIn('action="/tags"', template)
        self.assertNotIn('name="orphaned"', template)
        self.assertIn("orphaned-статус", template)
        self.assertIn("tag.visible_games", template)
        self.assertIn("outline-container", template)
        self.assertNotIn("tags-admin__hero", template)
        self.assertIn(".tags-admin__header", styles)
        self.assertIn(".tags-admin__summary", styles)
        self.assertIn(".tags-admin__layout", styles)
        self.assertIn(".tags-admin__tag-card", styles)
        self.assertIn(".tags-admin__tag-tree", styles)
        self.assertIn(".tags-admin__tree-section", styles)
        self.assertIn(".tags-admin__tree-toggle", styles)
        self.assertIn(".tags-admin__pending-panel", styles)
        self.assertIn(".tags-admin__pending-item", styles)
        self.assertIn(".tags-admin__save-button", styles)
        self.assertIn(".is-pending-delete", styles)
        self.assertIn(".tags-admin__group-row", styles)
        self.assertIn(".tags-admin__group-actions", styles)
        self.assertNotIn(".tags-admin__mode-switch", styles)
        self.assertIn(".tags-admin__action", styles)
        self.assertNotIn("radial-gradient", styles)
        self.assertIn("tagApi.add", script)
        self.assertIn("tagApi.edit", script)
        self.assertIn("tagApi.delete", script)
        self.assertIn("groupApi.add", script)
        self.assertIn("groupApi.edit", script)
        self.assertIn("groupApi.delete", script)
        self.assertIn("tagsCanEdit", script)
        self.assertIn("data-tags-row-name", script)
        self.assertIn("data-groups-row-name", script)
        self.assertIn("collectChanges", script)
        self.assertIn("saveAllChanges", script)
        self.assertIn("pendingTags", script)
        self.assertIn("pendingGroups", script)
        self.assertIn("beforeunload", script)
        self.assertIn("data-tag-tree-toggle", script)
        self.assertIn("localStorage", script)
        self.assertIn("window.location.reload()", script)
        self.assertIn("normalizeTagName", script)

    def test_steam_rating_summary_uses_steam_like_thresholds(self) -> None:
        self.assertEqual(main._steam_rating_summary(0, 0)["label"], "🏅 Нет оценок")
        self.assertEqual(main._steam_rating_summary(99, 7)["label"], "🏅 Крайне положительные")
        self.assertEqual(main._steam_rating_summary(88, 7)["label"], "🏅 Очень положительные")
        self.assertEqual(main._steam_rating_summary(74, 7)["label"], "🏅 В основном положительные")
        self.assertEqual(main._steam_rating_summary(64, 7)["label"], "🏅 Смешанные")
        self.assertEqual(main._steam_rating_summary(33, 7)["label"], "🏅 В основном отрицательные")
        self.assertEqual(main._steam_rating_summary(15, 7)["label"], "🏅 Очень отрицательные")
        self.assertEqual(main._steam_rating_summary(4, 7)["label"], "🏅 Крайне отрицательные")

    def test_standart_template_includes_git_link_assets(self) -> None:
        standart = (ROOT / "website/html-partials/standart.html").read_text(encoding="utf-8")
        self.assertIn("/assets/styles/mini-parts/mod-git-link.css", standart)
        self.assertIn("/assets/scripts/components/mod-git-link.js", standart)

    def test_save_progress_overlays_header(self) -> None:
        styles = (ROOT / "website/assets/styles/mini-parts/ui-patterns.css").read_text(encoding="utf-8")
        self.assertIn("body.ow-save-progress-open #standart-container", styles)
        self.assertIn(".ow-save-progress", styles)
        self.assertIn("z-index: 10050;", styles)

    async def test_mod_download_redirects_to_storage_url(self) -> None:
        handler = StubHandler(
            authenticated=True,
            profile={"id": 1, "username": "Alice"},
            mod_access={
                "authenticated": True,
                "owner_id": 1,
                "login_method": "google",
                "info": {
                    "value": True,
                    "reason": "Мод доступен для просмотра",
                    "reason_code": "public",
                },
                "edit": {
                    "title": {"value": False, "reason": "Недоступно", "reason_code": "forbidden"},
                    "authors": {"value": False, "reason": "Недоступно", "reason_code": "forbidden"},
                    "new_version": {"value": False, "reason": "Недоступно", "reason_code": "forbidden"},
                },
                "delete": {
                    "value": False,
                    "reason": "Удаление недоступно",
                    "reason_code": "forbidden",
                },
                "download": {
                    "value": True,
                    "reason": "Мод можно скачать",
                    "reason_code": "public",
                },
            },
            fetch_results=[
                (
                    201,
                    {
                        "mod_id": 42,
                        "download_url": "https://storage.example/archive/mods/42/main.zip?filename=Example.zip",
                        "filename": "Example.zip",
                    },
                ),
            ],
        )

        with patch.object(main, "UserHandler", return_value=handler):
            with main.app.test_request_context("/mod/42/download"):
                result = await main.mod_download(42)

        self.assertEqual(result.status_code, 302)
        self.assertEqual(
            result.headers["Location"],
            "https://storage.example/archive/mods/42/main.zip?filename=Example.zip",
        )
        self.assertEqual(handler.fetch_calls[0], ("/mods/42/download-url", "POST"))

    async def test_user_page_uses_profile_access_only(self) -> None:
        profile_access = build_profile_access(_profile_access_source("self", rights_value=False))
        handler = StubHandler(
            authenticated=True,
            handler_id=7,
            profile={"id": 7, "username": "Alice"},
            profile_access=profile_access,
            fetch_results=[
                (200, _profile_payload(7, "Alice")),
                (200, {"items": []}),
                (200, {"items": []}),
            ],
        )

        with patch.object(main, "UserHandler", return_value=handler):
            with main.app.test_request_context("/user/7"):
                result = await main.user(7)

        self.assertEqual(result["template"], "user.html")
        self.assertEqual(handler.render_calls[0][0], "user.html")
        self.assertIs(handler.render_calls[0][1]["profile_access"], profile_access)
        self.assertEqual(handler.render_calls[0][1]["user_data"]["general"]["rating"], 91)
        self.assertEqual(handler.render_calls[0][1]["user_data"]["general"]["reputation"], 91)
        self.assertEqual(handler.render_calls[0][1]["user_data"]["general"]["rating_summary"]["label"], "🏅 Очень положительные")
        self.assertIn("91%", handler.render_calls[0][1]["user_data"]["general"]["rating_summary"]["title"])
        self.assertEqual([call[0] for call in handler.calls], ["get_profile_access"])
        self.assertEqual(handler.fetch_calls[1][0], "/mods?page_size=5&author_id=7&sort=-created_at")
        self.assertEqual(handler.fetch_calls[2][0], "/modpacks?page_size=5&author_id=7&sort=-created_at")
        self.assertEqual(len(handler.fetch_calls), 3)
        self.assertFalse(handler.render_calls[0][1]["user_mods"])
        self.assertFalse(handler.render_calls[0][1]["user_modpacks"])

    async def test_user_page_fetches_images_only_for_visible_mods(self) -> None:
        profile_access = build_profile_access(_profile_access_source("self", rights_value=False))
        handler = StubHandler(
            authenticated=True,
            handler_id=2,
            profile={"id": 2, "username": "Bob"},
            profile_access=profile_access,
            fetch_results=[
                (200, _profile_payload(2, "Bob")),
                (
                    200,
                    {
                        "items": [
                            {"id": 92408, "name": "The Lone Ranger", "rating": 12},
                            {"id": 92407, "name": "Extinction Colonists", "rating": -4},
                            {"id": 92406, "name": "Thinking Spot", "rating": 0},
                            {"id": 92405, "name": "No vanilla apparel", "rating": 6},
                            {"id": 92404, "name": "Hardcore Naked Brutality", "rating": 99},
                        ],
                    },
                ),
                (
                    200,
                    {
                        "items": [
                            {"id": 81001, "name": "Pack Alpha", "rating": 77, "votes_count": 14},
                            {"id": 81002, "name": "Pack Beta", "rating": 38, "votes_count": 6},
                            {"id": 81003, "name": "Pack Gamma", "rating": 95, "votes_count": 9},
                            {"id": 81004, "name": "Pack Delta", "rating": 12, "votes_count": 4},
                            {"id": 81005, "name": "Pack Epsilon", "rating": 66, "votes_count": 5},
                        ],
                    },
                ),
                (
                    200,
                    {
                        "items": [
                            {"id": 1, "owner_id": 92405, "type": "logo", "url": "https://cdn.example/92405.webp"},
                            {"id": 2, "owner_id": 92406, "type": "logo", "url": "https://cdn.example/92406.webp"},
                            {"id": 3, "owner_id": 92407, "type": "logo", "url": "https://cdn.example/92407.webp"},
                        ],
                    },
                ),
                (
                    200,
                    {
                        "items": [
                            {"id": 10, "owner_id": 81001, "type": "logo", "url": "https://cdn.example/pack81001.webp"},
                            {"id": 11, "owner_id": 81003, "type": "logo", "url": "https://cdn.example/pack81003.webp"},
                            {"id": 12, "owner_id": 81004, "type": "logo", "url": "https://cdn.example/pack81004.webp"},
                        ],
                    },
                ),
            ],
        )

        with patch.object(main, "UserHandler", return_value=handler):
            with main.app.test_request_context("/user/2"):
                result = await main.user(2)

        self.assertEqual(result["template"], "user.html")
        self.assertEqual(handler.fetch_calls[1][0], "/mods?page_size=5&author_id=2&sort=-created_at")
        self.assertEqual(
            handler.fetch_calls[2][0],
            "/modpacks?page_size=5&author_id=2&sort=-created_at",
        )
        self.assertEqual(
            handler.fetch_calls[3][0],
            "/resources?page_size=10&owner_type=mods&owner_ids=92408&owner_ids=92407&owner_ids=92406&owner_ids=92405&types=logo",
        )
        self.assertEqual(
            handler.fetch_calls[4][0],
            "/resources?page_size=10&owner_type=modpacks&owner_ids=81001&owner_ids=81002&owner_ids=81003&owner_ids=81004&types=logo",
        )
        render_kwargs = handler.render_calls[0][1]
        self.assertTrue(render_kwargs["user_mods"]["not_show_all"])
        self.assertEqual([item["id"] for item in render_kwargs["user_mods"]["mods_data"]], [92408, 92407, 92406, 92405])
        self.assertEqual(render_kwargs["user_mods"]["mods_data"][0]["img"], main.DEFAULT_IMAGE_FALLBACK)
        self.assertEqual(render_kwargs["user_mods"]["mods_data"][1]["img"], "https://cdn.example/92407.webp")
        self.assertEqual(render_kwargs["user_mods"]["mods_data"][2]["img"], "https://cdn.example/92406.webp")
        self.assertEqual(render_kwargs["user_mods"]["mods_data"][3]["img"], "https://cdn.example/92405.webp")
        self.assertEqual([item["rating"] for item in render_kwargs["user_mods"]["mods_data"]], [12, -4, 0, 6])
        self.assertTrue(render_kwargs["user_modpacks"]["not_show_all"])
        self.assertEqual([item["id"] for item in render_kwargs["user_modpacks"]["modpacks_data"]], [81001, 81002, 81003, 81004])
        self.assertEqual(render_kwargs["user_modpacks"]["modpacks_data"][0]["img"], "https://cdn.example/pack81001.webp")
        self.assertEqual(render_kwargs["user_modpacks"]["modpacks_data"][1]["img"], main.DEFAULT_IMAGE_FALLBACK)
        self.assertEqual(render_kwargs["user_modpacks"]["modpacks_data"][2]["img"], "https://cdn.example/pack81003.webp")
        self.assertEqual(render_kwargs["user_modpacks"]["modpacks_data"][3]["img"], "https://cdn.example/pack81004.webp")
        self.assertEqual(render_kwargs["user_modpacks"]["modpacks_data"][0]["rating_summary"]["label"], "🏅 В основном положительные")

    async def test_user_rating_history_route_fetches_profile_only(self) -> None:
        profile_access = build_profile_access(_profile_access_source("self", rights_value=False))
        handler = StubHandler(
            authenticated=True,
            handler_id=7,
            profile={"id": 7, "username": "Alice"},
            profile_access=profile_access,
            fetch_results=[
                (200, _profile_payload(7, "Alice")),
            ],
        )

        with patch.object(main, "UserHandler", return_value=handler):
            with main.app.test_request_context("/user/7/rating/history"):
                result = await main.user_rating_history(7)

        self.assertEqual(result["template"], "user-rating-history.html")
        self.assertEqual(handler.fetch_calls[0][0], "/profiles/7?include=general")
        self.assertEqual(len(handler.fetch_calls), 1)
        render_kwargs = handler.render_calls[0][1]
        self.assertIs(render_kwargs["profile_access"], profile_access)
        self.assertNotIn("rating_history", render_kwargs)

    def test_user_template_exposes_modpacks_panel(self) -> None:
        template = (ROOT / "website/user.html").read_text(encoding="utf-8")
        styles = (ROOT / "website/assets/styles/pages/user.css").read_text(encoding="utf-8")

        self.assertIn("user-collections", template)
        self.assertIn("user-collection-panel__title", template)
        self.assertIn("Модпаки пользователя", template)
        self.assertIn("user-modpack", template)
        self.assertIn("user-collection-panel__view-button", template)
        self.assertIn(".user-collections", styles)
        self.assertIn(".user-collection-panel__title", styles)
        self.assertIn(".user-collection-panel--truncated", styles)
        self.assertIn(".user-modpack", styles)

    def test_user_template_exposes_profile_actions_popup(self) -> None:
        template = (ROOT / "website/user.html").read_text(encoding="utf-8")
        styles = (ROOT / "website/assets/styles/pages/user.css").read_text(encoding="utf-8")

        self.assertIn("user-profile__actions-dropdown", template)
        self.assertIn("user-profile__actions-popup", template)
        self.assertIn('role="menu"', template)
        self.assertIn('role="menuitem"', template)
        self.assertIn("Модпаки пользователя", template)
        self.assertIn("user-admin-modpacks", template)
        self.assertIn(".user-profile__actions-dropdown::after", styles)
        self.assertIn(".user-profile__actions-dropdown:hover .user-profile__actions-popup", styles)
        self.assertIn(".user-profile__actions-popup", styles)
        self.assertIn(".user-setting-gear > img", styles)

    async def test_user_rating_history_route_uses_profile_meta_access(self) -> None:
        profile_access = {
            "authenticated": True,
            "owner_id": 7,
            "info": {
                "public": {"value": True, "reason": "Профиль доступен", "reason_code": "public"},
                "meta": {"value": True, "reason": "Скрытые данные доступны", "reason_code": "forbidden"},
            },
            "my": False,
            "admin": False,
        }
        handler = StubHandler(
            authenticated=True,
            handler_id=2,
            profile={"id": 2, "username": "Bob"},
            profile_access=profile_access,
            fetch_results=[
                (200, _profile_payload(7, "Alice")),
            ],
        )

        with patch.object(main, "UserHandler", return_value=handler):
            with main.app.test_request_context("/user/7/rating/history"):
                result = await main.user_rating_history(7)

        self.assertEqual(result["template"], "user-rating-history.html")
        self.assertEqual(handler.fetch_calls[0][0], "/profiles/7?include=general")
        self.assertEqual(len(handler.fetch_calls), 1)
        self.assertIs(handler.render_calls[0][1]["profile_access"], profile_access)

    def test_user_rating_history_template_defers_table_rendering_to_frontend(self) -> None:
        template = (ROOT / "website/user-rating-history.html").read_text(encoding="utf-8")
        script = (ROOT / "website/assets/scripts/pages/user-rating-history.js").read_text(encoding="utf-8")

        self.assertIn('data-rating-history-root', template)
        self.assertIn('/assets/scripts/pages/user-rating-history.js', template)
        self.assertNotIn('rating_history[', template)
        self.assertIn('<th scope="col">Цель</th>', template)
        self.assertIn('<th scope="col">Голос</th>', template)
        self.assertIn('<th scope="col">Когда</th>', template)
        self.assertNotIn('<th scope="col">Мод</th>', template)
        self.assertNotIn('<th scope="col">Репутация</th>', template)
        self.assertIn('apiPaths.profile.rating_history', script)
        self.assertIn('data-rating-history-table', script)
        self.assertIn('Intl.DateTimeFormat', script)

    def test_user_route_accepts_trailing_slash(self) -> None:
        adapter = main.app.url_map.bind("example.com")

        endpoint, values = adapter.match("/user/3", method="GET")
        self.assertEqual(endpoint, "user")
        self.assertEqual(values["user_id"], 3)

        endpoint, values = adapter.match("/user/3/", method="GET")
        self.assertEqual(endpoint, "user")
        self.assertEqual(values["user_id"], 3)

    def test_game_edit_patch_uses_game_id_path_param(self) -> None:
        script = (ROOT / "website/assets/scripts/pages/game-edit.js").read_text(encoding="utf-8")
        self.assertIn(
            "await sendJson(apiPaths.game.edit, base.payload, { game_id: String(gameId) });",
            script,
        )

    async def test_game_edit_renders_grouped_tag_sections(self) -> None:
        handler = StubHandler(
            authenticated=True,
            handler_id=1,
            game_access={
                "edit": {
                    "title": {
                        "value": True,
                        "reason": "Можно редактировать игру",
                        "reason_code": "allowed",
                    }
                }
            },
            fetch_results=[
                (
                    200,
                    {
                        "id": 5,
                        "name": "Test Game",
                        "short_description": "Short description",
                        "description": "Long description",
                        "source": "steam",
                        "source_id": 42,
                    },
                ),
                (
                    200,
                    {
                        "items": [
                            {"id": 11, "name": "Action", "group": {"id": 2, "name": "Genre"}},
                            {"id": 12, "name": "Challenge", "group": {"id": 4, "name": "Meta"}},
                            {"id": 13, "name": "Loose Tag"},
                        ],
                        "pagination": {"total": 3},
                    },
                ),
                (
                    200,
                    {
                        "items": [],
                        "pagination": {"total": 0},
                    },
                ),
                (
                    200,
                    {
                        "items": [],
                        "pagination": {"total": 0},
                    },
                ),
                (
                    200,
                    {
                        "items": [],
                        "pagination": {"total": 0},
                    },
                ),
            ],
        )

        with patch.object(main, "UserHandler", return_value=handler):
            with main.app.test_request_context("/game/5"):
                result = await main.game_edit(5)

        self.assertEqual(result["template"], "mod-edit.html")
        self.assertTrue(any(url.startswith("/games/5/tags?page_size=50") for url, _method in handler.fetch_calls))
        self.assertFalse(any(url.startswith("/tag-groups") for url, _method in handler.fetch_calls))

        render_kwargs = handler.render_calls[0][1]
        self.assertEqual([section["title"] for section in render_kwargs["game_tag_sections"]], ["Genre", "Meta", "Без группы"])
        self.assertEqual(render_kwargs["game_tag_sections"][0]["editor_id"], "game-tag-group-2-editor")
        self.assertEqual(render_kwargs["game_tag_sections"][0]["context"]["game_id"], 5)
        self.assertEqual(render_kwargs["game_tag_sections"][0]["tags"][0]["name"], "Action")
        self.assertEqual(render_kwargs["game_tag_sections"][2]["kind"], "ungrouped")
        self.assertEqual(render_kwargs["game_tag_sections"][2]["context"]["game_id"], 5)
        self.assertEqual(render_kwargs["game_tag_sections"][2]["context"]["tag_ungrouped_only"], "true")

    def test_game_edit_templates_and_scripts_expose_tag_group_ui(self) -> None:
        game_main = (ROOT / "website/html-partials/game-edit/page-main.html").read_text(encoding="utf-8")
        taglike_macros = (ROOT / "website/html-partials/macros/taglike-editor.html").read_text(encoding="utf-8")
        mod_edit_styles = (ROOT / "website/assets/styles/pages/mod-edit.css").read_text(encoding="utf-8")
        game_script = (ROOT / "website/assets/scripts/pages/game-edit.js").read_text(encoding="utf-8")
        tags_script = (ROOT / "website/assets/scripts/vendors/tags-edit.js").read_text(encoding="utf-8")

        self.assertIn("render_grouped_tags_editor", taglike_macros)
        self.assertIn('data-game-tags-group-root="true"', taglike_macros)
        self.assertIn("render_grouped_tags_editor", game_main)
        self.assertIn("game-tags-editor", game_main)
        self.assertIn("catalog-tags-filter-panel", taglike_macros)
        self.assertIn("catalog-tag-groups", taglike_macros)
        self.assertIn("catalog-tag-group-picker", taglike_macros)
        self.assertIn("Добавить базовый тег", taglike_macros)
        self.assertIn(".catalog-tags-filter-panel", mod_edit_styles)
        self.assertIn(".catalog-tag-group-picker", mod_edit_styles)
        self.assertIn("collectTagChanges()", game_script)
        self.assertIn("tags.editors", game_script)
        self.assertIn('[data-picker-editor-kind="tags"]', game_script)
        self.assertIn("group_id", game_script)
        self.assertIn("gameTagsEndpoint", tags_script)
        self.assertIn("page_size: 30", tags_script)
        self.assertIn("tagUngroupedOnly", tags_script)
        self.assertIn("pending-tag-${root.id}", tags_script)
        self.assertIn("name: queryValue", tags_script)

    def test_status_badge_summary_uses_minimum_uptime_and_current_status(self) -> None:
        payload = {
            "heartbeatList": {
                "101": [{"status": 1}, {"status": 1}, {"status": 1}],
                "102": [{"status": 1}, {"status": 0}],
            },
            "uptimeList": {
                "101_24": 99.95,
                "101_7": 99.98,
                "102_24": 98.4,
            },
        }

        summary = main._build_status_badge_summary("open-workshop", payload)

        self.assertEqual(summary["status_code"], "warning")
        self.assertEqual(summary["status_label"], "Проблемы")
        self.assertEqual(summary["uptime_value"], 98.4)
        self.assertEqual(summary["uptime_label"], "98.4%")
        self.assertEqual(summary["page_url"], "https://status.miskler.ru/status/open-workshop")

    async def test_status_badge_route_returns_json_summary(self) -> None:
        summary = {
            "slug": "open-workshop",
            "label": "Open Workshop",
            "page_url": "https://status.miskler.ru/status/open-workshop",
            "source_url": "https://status.miskler.ru/api/status-page/heartbeat/open-workshop",
            "status_code": "up",
            "status_label": "Работает",
            "status_color": "#22c55e",
            "uptime_value": 99.95,
            "uptime_label": "99.95%",
            "status_text": "Работает · 99.95%",
            "title": "Open Workshop: Работает · 99.95%",
            "cached": False,
            "stale": False,
            "updated_at": "2026-04-29T00:00:00+00:00",
        }

        with patch.object(main, "_load_status_badge_summary", new=AsyncMock(return_value=summary)):
            with main.app.test_request_context("/api/status-badge/open-workshop"):
                response = await main.status_badge("open-workshop")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json(), summary)

    def test_footer_includes_status_badge_placeholder(self) -> None:
        footer = (ROOT / "website/html-partials/footer.html").read_text(encoding="utf-8")
        self.assertIn('data-status-badge-url="/api/status-badge/open-workshop"', footer)
        self.assertIn('https://status.miskler.ru/status/open-workshop', footer)

    def test_profile_menu_my_mods_links_include_adult_filter(self) -> None:
        header = (ROOT / "website/html-partials/header.html").read_text(encoding="utf-8")
        footer = (ROOT / "website/html-partials/footer.html").read_text(encoding="utf-8")
        self.assertIn('?show_not_public=true&trigger=edit&adult=-1', header)
        self.assertIn('?show_not_public=true&trigger=edit&adult=-1', footer)
        self.assertIn('my_mods', header)
        self.assertIn('my_mods', footer)
        self.assertIn('my_modpacks', header)
        self.assertIn('my_modpacks', footer)
        self.assertIn('rating_history', header)
        self.assertIn('rating_history', footer)
        self.assertIn('tags', header)
        self.assertIn('tags', footer)
        self.assertIn('История голосов', header)
        self.assertIn('История голосов', footer)
        self.assertIn('session_access.tag_access.any', header)
        self.assertIn('session_access.tag_access.any', footer)
        self.assertIn('href": "/tags"', (ROOT / "app_config.py").read_text(encoding="utf-8"))
        self.assertIn('Создать модпак', header)
        self.assertIn('Создать модпак', footer)
        self.assertIn('Мои модпаки', header)
        self.assertIn('Мои модпаки', footer)

    def test_index_catalog_template_supports_modpack_mode(self) -> None:
        index = (ROOT / "website/index.html").read_text(encoding="utf-8")
        catalog_params = (ROOT / "website/assets/scripts/catalog-params.js").read_text(encoding="utf-8")
        tags_edit = (ROOT / "website/assets/scripts/vendors/tags-edit.js").read_text(encoding="utf-8")
        catalog_styles = (ROOT / "website/assets/styles/pages/catalog.css").read_text(encoding="utf-8")
        self.assertIn("data-catalog-kind=\"{{ catalog_kind }}\"", index)
        self.assertIn("catalog-mode-switch", index)
        self.assertIn("data-active-kind=\"{% if catalog_kind == 'modpack' %}modpack{% else %}mod{% endif %}\"", index)
        self.assertIn('catalog-mode-switch__checkbox', index)
        self.assertIn('data-action="catalog-toggle-mode"', index)
        self.assertNotIn('catalog-mode-switch__item', index)
        self.assertNotIn('href="/?catalog_kind=modpack"', index)
        self.assertIn('data-action="catalog-toggle-game-mode"', index)
        self.assertNotIn("new-game-selector.html", index)
        self.assertNotIn('components/new-game-selector.js', index)
        self.assertNotIn('/assets/styles/pages/mod-add.css', index)
        self.assertIn('catalog-game-select-filter', index)
        self.assertIn('data-catalog-views="game mod modpack"', index)
        self.assertIn("catalog-mod-only", index)
        self.assertIn("catalog-tags-editor", index)
        self.assertIn("catalog-tags-filter-panel", index)
        self.assertIn("Добавить базовый тег", index)
        self.assertIn("data-catalog-tag-groups-root", index)
        self.assertIn("catalog-tag-groups", index)
        self.assertIn("Сортировка по загрузкам", index)
        self.assertIn("Каталог {{ catalog_entity_label | lower }} пользователя {{ catalog_user.username }}", index)
        self.assertIn("syncCatalogTagGroupFilters", catalog_params)
        self.assertIn("payload.tag_groups", catalog_params)
        self.assertIn("getTagFilterEditors", catalog_params)
        self.assertIn("'catalog-tag-group-' + String(groupId", catalog_params)
        self.assertIn("'Выбрать ' + group.name", catalog_params)
        self.assertIn("group.name + ' не выбрано'", catalog_params)
        self.assertIn("gameTagsEndpoint", tags_edit)
        self.assertIn("tagGroupTagsEndpoint", tags_edit)
        self.assertIn("pickerContextTagGroupId", tags_edit)
        self.assertIn(".catalog-tags-filter-panel", catalog_styles)
        self.assertIn(".catalog-tag-groups", catalog_styles)
        self.assertIn(".catalog-tag-group-picker", catalog_styles)

    async def test_catalog_kind_query_uses_index_template(self) -> None:
        handler = StubHandler()

        with patch.object(main, "UserHandler", return_value=handler):
            with main.app.test_request_context("/?catalog_kind=modpack&name=Hospital&page=4"):
                result = await main.unified_route()

        self.assertEqual(result["template"], "index.html")
        self.assertEqual(handler.render_calls[0][0], "index.html")
        render_kwargs = handler.render_calls[0][1]
        self.assertTrue(render_kwargs["catalog"])
        self.assertEqual(render_kwargs["catalog_kind"], "modpack")
        self.assertEqual(render_kwargs["catalog_canonical"], "/?catalog_kind=modpack")

    async def test_user_modpacks_route_uses_modpack_catalog_config(self) -> None:
        handler = StubHandler(
            authenticated=True,
            handler_id=2,
            profile={"id": 2, "username": "Bob"},
            fetch_results=[
                (200, _profile_payload(2, "Bob")),
            ],
        )

        with patch.object(main, "UserHandler", return_value=handler):
            with main.app.test_request_context("/user/2/modpacks"):
                result = await main.user_modpacks(2)

        self.assertEqual(result["template"], "index.html")
        self.assertEqual(handler.fetch_calls[0][0], "/profiles/2?include=general")
        render_kwargs = handler.render_calls[0][1]
        self.assertTrue(render_kwargs["catalog"])
        self.assertEqual(render_kwargs["catalog_user"]["id"], 2)
        self.assertEqual(render_kwargs["catalog_user"]["username"], "Bob")
        self.assertEqual(render_kwargs["catalog_entity_label"], "Модпаки")
        self.assertEqual(render_kwargs["catalog_kind"], "modpack")

    def test_robots_disallow_modpack_edit(self) -> None:
        robots = (ROOT / "website/robots.txt").read_text(encoding="utf-8")
        self.assertIn('Disallow: /modpack/*/edit', robots)
        self.assertIn('Disallow: /tags', robots)

    def test_standard_template_loads_footer_status_script(self) -> None:
        standart = (ROOT / "website/html-partials/standart.html").read_text(encoding="utf-8")
        self.assertIn('/assets/scripts/footer-status.js', standart)

    async def test_user_settings_admin_fetches_rights_and_private_data(self) -> None:
        profile_access = build_profile_access(_profile_access_source("admin", rights_value=True))
        tag_access = build_tag_access(_tag_access_source(add=True, edit=True, delete=True))
        handler = StubHandler(
            authenticated=True,
            handler_id=1,
            response=None,
            profile_access=profile_access,
            tag_access=tag_access,
            fetch_results=[
                (200, _profile_payload(2, "Bob")),
            ],
        )

        with patch.object(main, "UserHandler", return_value=handler):
            with main.app.test_request_context("/user/2/settings"):
                result = await main.user_settings(2)

        self.assertEqual(result["template"], "user-settings.html")
        self.assertEqual(handler.render_calls[0][0], "user-settings.html")
        self.assertIs(handler.render_calls[0][1]["user_access"], profile_access)
        self.assertIs(handler.render_calls[0][1]["tag_access"], tag_access)
        self.assertEqual(handler.fetch_calls[0][0], "/profiles/2?include=general&include=rights&include=private")
        self.assertEqual([call[0] for call in handler.calls], ["get_profile_access", "get_tag_access"])
        nav_html = main.app.jinja_env.get_template("html-partials/user-settings/nav.html").render(
            user_data={"general": {"id": 2}},
            user_access=profile_access,
            tag_access=tag_access,
        )
        self.assertIn("page-tags-link-button", nav_html)
        self.assertIn('href="/tags"', nav_html)

    async def test_user_settings_self_reuses_cached_profile_without_extra_fetch(self) -> None:
        profile_access = build_profile_access(_profile_access_source("self", rights_value=False))
        cached_profile = _profile_payload(7, "Alice")
        handler = StubHandler(
            authenticated=True,
            handler_id=7,
            response=cached_profile,
            response_code=200,
            profile_access=profile_access,
        )

        with patch.object(main, "UserHandler", return_value=handler):
            with main.app.test_request_context("/user/7/settings"):
                result = await main.user_settings(7)

        self.assertEqual(result["template"], "user-settings.html")
        self.assertEqual(handler.render_calls[0][0], "user-settings.html")
        self.assertIs(handler.render_calls[0][1]["profile_access"], profile_access)
        self.assertEqual(handler.fetch_calls, [])
        self.assertEqual([call[0] for call in handler.calls], ["get_profile_access", "get_tag_access"])

    def test_healthz_returns_ok(self) -> None:
        with main.app.test_client() as client:
            response = client.get("/healthz")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json(), {"status": "ok"})


if __name__ == "__main__":
    unittest.main()
