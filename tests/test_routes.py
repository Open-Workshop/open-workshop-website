from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

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
                        "git_url": "https://github.com/example/repo",
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
        self.assertIs(render_kwargs["data"][0], render_kwargs["info"])
        self.assertEqual(render_kwargs["resources"]["items"][0]["url"], "https://cdn.example/logo.webp")
        self.assertTrue(render_kwargs["info"]["no_many_screenshots"])
        self.assertEqual(render_kwargs["info"]["git_url"], "https://github.com/example/repo")

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
                    },
                ),
                (200, {"items": [{"id": 1, "type": "logo", "url": "https://cdn.example/logo.webp"}]}),
                (200, {"items": []}),
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
                (200, {"items": []}),
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
                    },
                ),
                (200, {"items": [{"id": 1, "type": "logo", "url": "https://cdn.example/logo.webp"}]}),
                (200, {"items": []}),
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
        render_kwargs = handler.render_calls[0][1]
        self.assertEqual(render_kwargs["info"]["conflicts"], {"count": 1, "items": [77]})
        self.assertIn(77, render_kwargs["conflicts"])
        self.assertEqual(render_kwargs["conflicts"][77]["name"], "Conflict Mod")
        self.assertEqual(render_kwargs["conflicts"][77]["img"], "https://cdn.example/conflict.webp")

    def test_mod_add_template_exposes_adult_toggle(self) -> None:
        mod_add = (ROOT / "website/mod-add.html").read_text(encoding="utf-8")
        self.assertIn('id="mod-adult"', mod_add)
        self.assertIn('Контент 18+', mod_add)
        self.assertIn("add_page.kind == 'mod'", mod_add)

    def test_mod_edit_params_template_exposes_adult_toggle(self) -> None:
        mod_params = (ROOT / "website/html-partials/mod-edit/page-params.html").read_text(encoding="utf-8")
        self.assertIn('id="mod-adult"', mod_params)
        self.assertIn("startdata", mod_params)
        self.assertIn('Контент 18+', mod_params)
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
        self.assertIn("adult: runtime.diffValue(adultCurrentValue, adultStartValue),", script)
        self.assertIn("git_url: {", script)
        self.assertIn("payload[key] = value.value === null ? null : value.value;", script)
        self.assertIn("payload[key] = value.value === 'checked';", script)
        self.assertIn("const conflicts = getPickerChanges(conflictsEditorId);", script)
        self.assertIn("await api.updateConflict(id, true);", script)
        self.assertIn("await syncConflicts(changes.conflicts);", script)

    def test_mod_edit_save_service_supports_dependency_optionality(self) -> None:
        script = (ROOT / "website/assets/scripts/pages/mod-edit/save-service.js").read_text(encoding="utf-8")
        self.assertIn("const dependencies = getPickerChanges(dependenciesEditorId, true);", script)
        self.assertIn("dependencies.update.length > 0", script)
        self.assertIn("await api.updateDependency(id, true, optionalById[id]);", script)
        self.assertIn("await api.updateDependencyOptional(id, optionalById[id]);", script)

    def test_mod_edit_script_passes_conflicts_editor_id(self) -> None:
        script = (ROOT / "website/assets/scripts/pages/mod-edit.js").read_text(encoding="utf-8")
        self.assertIn("conflictsEditorId: 'mod-conflicts-editor',", script)
        self.assertIn("gitUrlInput: root.querySelector('#mod-git-url'),", script)

    def test_mod_edit_api_exposes_relation_endpoints(self) -> None:
        script = (ROOT / "website/assets/scripts/pages/mod-edit/api.js").read_text(encoding="utf-8")
        app_config = (ROOT / "app_config.py").read_text(encoding="utf-8")
        self.assertIn("async function updateConflict(conflictId, add)", script)
        self.assertIn("async function updateDependency(dependencyId, add, optional)", script)
        self.assertIn("async function updateDependencyOptional(dependencyId, optional)", script)
        self.assertIn("apiPaths.mod.dependencies_update", script)
        self.assertIn("apiPaths.mod.conflicts_add", script)
        self.assertIn("apiPaths.mod.conflicts_delete", script)
        self.assertIn('\"dependencies_update\": {\"method\": \"PUT\", \"path\": \"/mods/{mod_id}/dependencies/{dependency_mod_id}\"}', app_config)
        self.assertIn("conflict_mod_id: conflictId", script)

    def test_mod_edit_templates_expose_relation_editors(self) -> None:
        mod_main = (ROOT / "website/html-partials/mod-edit/page-main.html").read_text(encoding="utf-8")
        mod_dependence = (ROOT / "website/html-partials/mod-dependence-edit.html").read_text(encoding="utf-8")
        mod_conflicts = (ROOT / "website/html-partials/mod-conflict-edit.html").read_text(encoding="utf-8")
        mod_edit_page = (ROOT / "website/mod-edit.html").read_text(encoding="utf-8")
        mod_params = (ROOT / "website/html-partials/mod-edit/page-params.html").read_text(encoding="utf-8")
        taglike_macros = (ROOT / "website/html-partials/macros/taglike-editor.html").read_text(encoding="utf-8")
        dependence_script = (ROOT / "website/assets/scripts/vendors/dependence-edit.js").read_text(encoding="utf-8")
        self.assertIn("mod-conflicts-editor", mod_main)
        self.assertIn("mod-git-url", mod_main)
        self.assertIn("mod-git-panel", mod_main)
        self.assertIn("data-git-url-source", mod_main)
        self.assertIn("data-git-favicon", mod_main)
        self.assertIn("info.get('git_url') or ''", mod_main)
        self.assertIn('<aside class="mod-edit__sidebar">', mod_main)
        self.assertGreater(mod_main.index("mod-git-url"), mod_main.index('<aside class="mod-edit__sidebar">'))
        self.assertNotIn("Укажите ссылку на репозиторий мода", mod_main)
        self.assertNotIn("<span>Git URL</span>", mod_main)
        self.assertLess(mod_main.index("mod-tags-editor"), mod_main.index("data-git-url-block"))
        self.assertLess(mod_main.index("data-git-url-block"), mod_main.index("mod-dependencies-editor"))
        self.assertIn("show_optional_toggle=true", mod_main)
        self.assertIn("dependence_optional_toggle", mod_dependence)
        self.assertIn("show_optional_toggle if show_optional_toggle is defined else false", mod_dependence)
        self.assertIn("html-partials/mod-conflict-edit.html", mod_main)
        self.assertIn("Добавить конфликт", mod_conflicts)
        self.assertIn("render_conflicts_editor", mod_conflicts)
        self.assertIn("data-picker-show-optional-toggle", taglike_macros)
        self.assertIn("data-action=\"dependency-toggle-optional\"", taglike_macros)
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

    def test_mod_template_exposes_conflicts_section(self) -> None:
        mod_page = (ROOT / "website/mod.html").read_text(encoding="utf-8")
        mod_styles = (ROOT / "website/assets/styles/pages/mod.css").read_text(encoding="utf-8")
        self.assertIn("Конфликты мода", mod_page)
        self.assertIn("Ссылки", mod_page)
        self.assertIn("mod-git-panel", mod_page)
        self.assertIn("data-git-url-block", mod_page)
        self.assertIn("data-git-url-source", mod_page)
        self.assertIn("data-git-favicon", mod_page)
        self.assertIn("info.get('git_url') or ''", mod_page)
        self.assertLess(mod_page.index("mod-tags-title"), mod_page.index("Авторы"))
        self.assertLess(mod_page.index("Авторы"), mod_page.index("Ссылки"))
        self.assertIn("info['conflicts']['count'] > 0", mod_page)
        self.assertIn("for item in conflicts.values()", mod_page)
        self.assertIn("mod-dependencies-optional-heading", mod_page)
        self.assertIn("<h3>Опциональные</h3>", mod_page)
        self.assertIn("selectattr('optional')", mod_page)
        self.assertIn("rejectattr('optional')", mod_page)
        self.assertIn(".mod-dependencies-optional-heading", mod_styles)
        self.assertIn("margin-top: 10pt;", mod_styles)
        self.assertNotIn("text-align", mod_styles.split(".mod-dependencies-optional-heading")[1].split(".mod-plugins-header")[0])

    def test_standart_template_includes_git_link_assets(self) -> None:
        standart = (ROOT / "website/html-partials/standart.html").read_text(encoding="utf-8")
        self.assertIn("/assets/styles/mini-parts/mod-git-link.css", standart)
        self.assertIn("/assets/scripts/components/mod-git-link.js", standart)

    def test_save_progress_overlays_header(self) -> None:
        styles = (ROOT / "website/assets/styles/mini-parts/ui-patterns.css").read_text(encoding="utf-8")
        self.assertIn("body.ow-save-progress-open #standart-container", styles)
        self.assertIn(".ow-save-progress", styles)
        self.assertIn("z-index: 10050;", styles)

    def test_catalog_cards_blur_adult_logos_show_18_plus_until_hover(self) -> None:
        script = (ROOT / "website/assets/scripts/vendors/cards.js").read_text(encoding="utf-8")
        styles = (ROOT / "website/assets/styles/vendors/cards.css").read_text(encoding="utf-8")
        self.assertIn("card--adult", script)
        self.assertIn("div.card.card--adult div.card-media canvas.card-blurhash", styles)
        self.assertIn("div.card.card--adult div.card-media img", styles)
        self.assertIn('div.card.card--adult div.card-media::after', styles)
        self.assertIn('content: "18+";', styles)
        self.assertIn("div.card.card--adult:hover div.card-media canvas.card-blurhash", styles)
        self.assertIn("div.card.card--adult:hover div.card-media img", styles)

    def test_catalog_adult_filter_uses_shared_modal_pattern(self) -> None:
        index = (ROOT / "website/index.html").read_text(encoding="utf-8")
        modal = (ROOT / "website/html-partials/macros/modal.html").read_text(encoding="utf-8")
        catalog_script = (ROOT / "website/assets/scripts/catalog-params.js").read_text(encoding="utf-8")
        catalog_vendor = (ROOT / "website/assets/scripts/vendors/catalog.js").read_text(encoding="utf-8")
        catalog_styles = (ROOT / "website/assets/styles/pages/catalog.css").read_text(encoding="utf-8")
        ui_styles = (ROOT / "website/assets/styles/mini-parts/ui-patterns.css").read_text(encoding="utf-8")
        ui_script = (ROOT / "website/assets/scripts/ow-ui.js").read_text(encoding="utf-8")

        self.assertIn('from \'html-partials/macros/modal.html\' import render_modal with context', index)
        self.assertIn('catalog-adult-setting', index)
        self.assertIn('data-action="catalog-adult-select"', index)
        self.assertIn('option value="0" selected', index)
        self.assertIn('catalog-adult-confirm-modal', index)
        self.assertIn('точно хотите искать 18+ моды?', index)
        self.assertIn('Без фильтра', index)
        self.assertIn('Только 18+', index)
        self.assertIn("if (value === undefined || value === null) return 0;", catalog_script)
        self.assertIn("if (parsed === -1) return -1;", catalog_script)
        self.assertIn("new Dictionary({ key: 'adult', value: String(normalizedMode), default: '0' })", catalog_script)
        self.assertIn('syncCatalogGameTypeSelect();', catalog_script)
        self.assertIn("requestSettings.set('adult', '0');", catalog_vendor)
        self.assertIn('data-ow-modal', modal)
        self.assertIn('data-ow-modal-backdrop', modal)
        self.assertIn('data-ow-modal-action="cancel"', modal)
        self.assertIn('data-ow-modal-action="confirm"', modal)
        self.assertIn('default_action', modal)
        self.assertIn('normalizeCatalogAdultMode', catalog_script)
        self.assertIn('handleCatalogAdultModeChange', catalog_script)
        self.assertIn("window.OWUI.confirmModal", catalog_script)
        self.assertIn("requestSettings.pop('adult');", catalog_vendor)
        self.assertIn('body.ow-modal-open #standart-container', ui_styles)
        self.assertIn('catalog-adult-mode--adult-only', catalog_styles)
        self.assertIn('content: none;', catalog_styles)
        self.assertIn('.ow-modal', ui_styles)
        self.assertIn('ow-modal-open', ui_styles)
        self.assertIn('small dark ow-modal__button ow-modal__button--cancel', modal)
        self.assertIn('confirmModal', ui_script)
        self.assertIn('data-ow-modal-default-action', modal)

    def test_catalog_conflict_filter_uses_relation_picker_pattern(self) -> None:
        index = (ROOT / "website/index.html").read_text(encoding="utf-8")
        catalog_script = (ROOT / "website/assets/scripts/catalog-params.js").read_text(encoding="utf-8")
        catalog_vendor = (ROOT / "website/assets/scripts/vendors/catalog.js").read_text(encoding="utf-8")
        robots = (ROOT / "website/robots.txt").read_text(encoding="utf-8")

        self.assertIn("catalog-conflicts-setting", index)
        self.assertIn("catalog-conflicts-editor", index)
        self.assertIn("Исключить конфликт", index)
        self.assertIn("mod-conflict-edit.html", index)
        self.assertIn(
            "</setting>\n\n      <hr class=\"catalog-game-filter\">\n\n      <setting class=\"with-events catalog-dependencies-setting catalog-conflicts-setting catalog-game-filter\">",
            index,
        )
        self.assertIn("getConflictsEditor", catalog_script)
        self.assertIn("getConflictsEditorRoot", catalog_script)
        self.assertIn("syncConflictsSearchGame", catalog_script)
        self.assertIn("syncExcludedConflictsUrlFromSelection", catalog_script)
        self.assertIn("handleConflictsSelectionChange", catalog_script)
        self.assertIn("clearSelectedConflicts", catalog_script)
        self.assertIn("hydrateConflictsFilter", catalog_script)
        self.assertIn("excluded_conflicts", catalog_script)
        self.assertIn("excluded_conflicts", catalog_vendor)
        self.assertIn("settings.set('excluded_conflicts', excludedConflicts);", catalog_vendor)
        self.assertIn("settings.pop('excluded_conflicts');", catalog_vendor)
        self.assertIn("settings.set('sgame', 'no');", catalog_vendor)
        self.assertIn("Clean-param: excluded_conflicts /", robots)

    def test_catalog_game_type_filter_maps_to_manager_types_query(self) -> None:
        index = (ROOT / "website/index.html").read_text(encoding="utf-8")
        catalog_script = (ROOT / "website/assets/scripts/catalog-params.js").read_text(encoding="utf-8")
        catalog_vendor = (ROOT / "website/assets/scripts/vendors/catalog.js").read_text(encoding="utf-8")
        catalog_styles = (ROOT / "website/assets/styles/pages/catalog.css").read_text(encoding="utf-8")

        self.assertIn('catalog-game-type-setting', index)
        self.assertIn('catalog-game-type-select', index)
        self.assertIn('</setting>\n\n      <hr class="catalog-game-select-filter">\n\n      <setting class="with-events catalog-game-type-setting catalog-game-select-filter">', index)
        self.assertIn('title="Тип игр"', index)
        self.assertIn('option value="app"', index)
        self.assertIn('option value="game"', index)
        self.assertIn('normalizeCatalogGameType', catalog_script)
        self.assertIn('resolveCatalogGameTypeFromParams', catalog_script)
        self.assertIn('syncCatalogGameTypeSelect', catalog_script)
        self.assertIn('applyCatalogGameTypeSelect', catalog_script)
        self.assertIn("new Dictionary({ key: 'game_type', value: gameType, default: 'all' })", catalog_script)
        self.assertIn('normalizeCatalogGameTypeForManager', catalog_vendor)
        self.assertIn("requestSettings.pop('game_type');", catalog_vendor)
        self.assertIn("requestSettings.pop('types');", catalog_vendor)
        self.assertIn("requestSettings.set('types', gameType);", catalog_vendor)
        self.assertIn('catalog-game-type-setting', catalog_styles)
        self.assertIn('catalog-game-select-filter', index)

    def test_catalog_tag_filters_reset_when_tags_are_missing_in_target_mode(self) -> None:
        catalog_script = (ROOT / "website/assets/scripts/catalog-params.js").read_text(encoding="utf-8")

        self.assertIn("function getCatalogTagSelectionForValidation()", catalog_script)
        self.assertIn("function getCatalogTagSelectionIds(selection)", catalog_script)
        self.assertIn("async function validateCatalogTagsForContext(selection, gameId)", catalog_script)
        self.assertIn("checked ? '' : params.get('game', '')", catalog_script)
        self.assertIn("sgame ? '' : params.get('game', '')", catalog_script)
        self.assertIn("const shouldClearTags = tagsValidation === false;", catalog_script)
        self.assertIn("clearSelectedTags();", catalog_script)
        self.assertIn("new Dictionary({ key: 'tags', value: '', default: '' })", catalog_script)
        self.assertIn("new Dictionary({ key: 'excluded_tags', value: '', default: '' })", catalog_script)
        self.assertIn("tagHydrationIds = [];", catalog_script)
        self.assertIn("void toggleGameMode(target);", catalog_script)

    def test_catalog_sort_resets_to_supported_field_per_mode(self) -> None:
        catalog_script = (ROOT / "website/assets/scripts/catalog-params.js").read_text(encoding="utf-8")
        catalog_vendor = (ROOT / "website/assets/scripts/vendors/catalog.js").read_text(encoding="utf-8")

        self.assertIn("normalizeCatalogSortValue", catalog_script)
        self.assertIn("getCatalogSortStateForMode", catalog_script)
        self.assertIn("syncCatalogSortForMode", catalog_script)
        self.assertIn("const sortState = syncCatalogSortForMode(currentSort, checked);", catalog_script)
        self.assertIn("const sortState = syncCatalogSortForMode(currentSort, false);", catalog_script)
        self.assertIn("new Dictionary({ key: 'sort', value: sortState.sort, default: '-downloads' })", catalog_script)
        self.assertIn("mods_count", catalog_script)
        self.assertIn("downloads", catalog_script)
        self.assertIn("const allowedSort = isCatalogSortAllowedForMode(normalizedSort, isGameMode)", catalog_vendor)
        self.assertIn("const managerSort = allowedSort === 'downloads' && isGameMode", catalog_vendor)
        self.assertIn("mods_downloads", catalog_vendor)

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
            ],
        )

        with patch.object(main, "UserHandler", return_value=handler):
            with main.app.test_request_context("/user/7"):
                result = await main.user(7)

        self.assertEqual(result["template"], "user.html")
        self.assertEqual(handler.render_calls[0][0], "user.html")
        self.assertIs(handler.render_calls[0][1]["profile_access"], profile_access)
        self.assertEqual([call[0] for call in handler.calls], ["get_profile_access"])
        self.assertEqual(handler.fetch_calls[1][0], "/mods?page_size=5&author_id=7&sort=-created_at")
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
                            {"id": 92408, "name": "The Lone Ranger"},
                            {"id": 92407, "name": "Extinction Colonists"},
                            {"id": 92406, "name": "Thinking Spot"},
                            {"id": 92405, "name": "No vanilla apparel"},
                            {"id": 92404, "name": "Hardcore Naked Brutality"},
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
        self.assertEqual(handler.fetch_calls[1][0], "/mods?page_size=5&author_id=2&sort=-created_at")
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

    def test_standard_template_loads_footer_status_script(self) -> None:
        standart = (ROOT / "website/html-partials/standart.html").read_text(encoding="utf-8")
        self.assertIn('/assets/scripts/footer-status.js', standart)

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

    def test_healthz_returns_ok(self) -> None:
        with main.app.test_client() as client:
            response = client.get("/healthz")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json(), {"status": "ok"})


if __name__ == "__main__":
    unittest.main()
