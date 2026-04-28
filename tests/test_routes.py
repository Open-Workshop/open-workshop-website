from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import main
from access_policy import build_profile_access


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


def _profile_payload(user_id: int, username: str = "Alice") -> dict:
    return {
        "general": {
            "id": user_id,
            "username": username,
            "mute": None,
            "registration_date": "2026-04-22T10:00:00+00:00",
            "about": None,
            "avatar_url": "",
            "grade": "",
            "reputation": 12,
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
        game_add_access: dict | None = None,
        game_access: dict | None = None,
        profile_access: dict | None = None,
        fetch_results: list[tuple[int, object]] | None = None,
    ) -> None:
        self.authenticated = authenticated
        self.id = handler_id
        self.profile = profile
        self.response = response
        self.response_code = response_code
        self.mod_access = mod_access
        self.mod_add_access = mod_add_access
        self.game_add_access = game_add_access
        self.game_access = game_access
        self.profile_access = profile_access
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

    async def get_game_add_access(self) -> dict:
        self.calls.append(("get_game_add_access",))
        return self.game_add_access or {}

    async def get_game_access(self, game_id: int) -> dict:
        self.calls.append(("get_game_access", game_id))
        return self.game_access or {}

    async def get_profile_access(self, profile_id: int) -> dict:
        self.calls.append(("get_profile_access", profile_id))
        return self.profile_access or {}

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
                        "game": {"id": 5, "name": "Game"},
                        "authors": {},
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
        self.assertEqual(
            handler.fetch_calls[0][0],
            "/mods/42?include=dependencies&include=description&include=short_description&include=dates&include=game&include=authors",
        )
        self.assertEqual(
            handler.fetch_calls[1][0],
            "/resources?page_size=30&owner_type=mods&owner_ids=42&types=logo&types=screenshot",
        )
        render_kwargs = handler.render_calls[0][1]
        self.assertEqual(render_kwargs["info"]["id"], 42)
        self.assertEqual(render_kwargs["info"]["name"], "Example Mod")
        self.assertEqual(render_kwargs["info"]["description"], "[b]Long[/b]")
        self.assertEqual(render_kwargs["info"]["description_html"], "<p><strong>Long</strong></p>")
        self.assertIs(render_kwargs["data"][0], render_kwargs["info"])
        self.assertEqual(render_kwargs["resources"]["items"][0]["url"], "https://cdn.example/logo.webp")
        self.assertTrue(render_kwargs["info"]["no_many_screenshots"])

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
                    200,
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
        self.assertEqual(handler.fetch_calls[0][0], "/mods/42/download-url")

    async def test_user_page_uses_profile_access_only(self) -> None:
        profile_access = build_profile_access(_profile_access_source("self", rights_value=False))
        handler = StubHandler(
            authenticated=True,
            handler_id=7,
            profile={"id": 7, "username": "Alice"},
            profile_access=profile_access,
            fetch_results=[
                (200, _profile_payload(7, "Alice")),
                (200, {"results": []}),
            ],
        )

        with patch.object(main, "UserHandler", return_value=handler):
            with main.app.test_request_context("/user/7"):
                result = await main.user(7)

        self.assertEqual(result["template"], "user.html")
        self.assertEqual(handler.render_calls[0][0], "user.html")
        self.assertIs(handler.render_calls[0][1]["profile_access"], profile_access)
        self.assertEqual([call[0] for call in handler.calls], ["get_profile_access"])
        self.assertEqual(len(handler.fetch_calls), 2)

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
                            {"id": 92408, "name": "The Lone Ranger", "authors": {"2": {"owner": True}}},
                            {"id": 92407, "name": "Extinction Colonists", "authors": {"2": {"owner": True}}},
                            {"id": 92406, "name": "Thinking Spot", "authors": {"2": {"owner": True}}},
                            {"id": 92405, "name": "No vanilla apparel", "authors": {"2": {"owner": True}}},
                            {"id": 92404, "name": "Hardcore Naked Brutality", "authors": {"2": {"owner": True}}},
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
            ],
        )

        with patch.object(main, "UserHandler", return_value=handler):
            with main.app.test_request_context("/user/2"):
                result = await main.user(2)

        self.assertEqual(result["template"], "user.html")
        self.assertEqual(
            handler.fetch_calls[2][0],
            "/resources?page_size=10&owner_type=mods&owner_ids=92408&owner_ids=92407&owner_ids=92406&owner_ids=92405&types=logo",
        )
        render_kwargs = handler.render_calls[0][1]
        self.assertTrue(render_kwargs["user_mods"]["not_show_all"])
        self.assertEqual([item["id"] for item in render_kwargs["user_mods"]["mods_data"]], [92408, 92407, 92406, 92405])
        self.assertEqual(render_kwargs["user_mods"]["mods_data"][0]["img"], main.DEFAULT_IMAGE_FALLBACK)
        self.assertEqual(render_kwargs["user_mods"]["mods_data"][1]["img"], "https://cdn.example/92407.webp")
        self.assertEqual(render_kwargs["user_mods"]["mods_data"][2]["img"], "https://cdn.example/92406.webp")
        self.assertEqual(render_kwargs["user_mods"]["mods_data"][3]["img"], "https://cdn.example/92405.webp")

    async def test_user_settings_admin_fetches_rights_and_private_data(self) -> None:
        profile_access = build_profile_access(_profile_access_source("admin", rights_value=True))
        handler = StubHandler(
            authenticated=True,
            handler_id=1,
            response=None,
            profile_access=profile_access,
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
        self.assertEqual(handler.fetch_calls[0][0], "/profiles/2?include=general&include=rights&include=private")
        self.assertEqual([call[0] for call in handler.calls], ["get_profile_access"])

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
        self.assertEqual([call[0] for call in handler.calls], ["get_profile_access"])


if __name__ == "__main__":
    unittest.main()
