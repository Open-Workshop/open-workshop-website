from __future__ import annotations

from aiohttp import ClientSession
from flask import make_response, render_template, request

import app_config
import ow_config as config
from access_policy import (
    build_game_access,
    build_game_add_access,
    build_mod_access,
    build_mod_add_access,
    build_profile_access,
    build_session_access,
)


class UserHandler:
    def __init__(self):
        self.session = None
        self.cookies = None
        self.cookie_params = {}
        self.changed_cookies = {}

        self.id = -1
        self.authenticated = False
        self.access_context = {}
        self.profile = None
        self.response = None
        self.response_code = 200
        self.session_access = build_session_access(None)
        self._access_cache = {}

    async def __aenter__(self):
        self.session = ClientSession()
        self.cookies = dict(request.cookies)
        for key in self.cookies.keys():
            self.cookie_params[key] = {}
        await self._initialize_profile()
        return self

    async def __aexit__(self, exc_type, exc, tb):
        await self.session.close()

    async def _initialize_profile(self):
        """
        Load the current access context and the current user profile.

        Access is the source of truth for session state and UI capabilities, while
        manager remains the source of the profile payload that pages render.
        """

        context_code, context = await self.fetch_access("/context", method="POST", json_data={})
        if context_code == 200 and isinstance(context, dict):
            self.access_context = context
        else:
            self.access_context = {}

        self.authenticated = bool(self.access_context.get("authenticated"))
        self.id = int(self.access_context.get("owner_id", -1) or -1) if self.authenticated else -1

        if not self.authenticated or self.id < 0:
            print("Запрос от анонимного юзера")
            self.profile = False
            self.response = False
            self.response_code = 200
            self.session_access = build_session_access(self.access_context)
            return

        self.session_access = await self.get_session_access()

        profile_info_path = app_config.api_path("profile", "info").format(user_id=self.id)
        code, result = await self.fetch(f"{profile_info_path}?general=true&private=true")
        self.response = result
        self.response_code = code

        if code == 200 and isinstance(result, dict):
            avatar_url = result["general"].get("avatar_url", "")
            if not avatar_url:
                result["general"]["avatar_url"] = "/assets/images/no-avatar.jpg"
            elif avatar_url.startswith("local"):
                avatar_path = app_config.api_path("profile", "avatar").format(user_id=self.id)
                result["general"]["avatar_url"] = f"{config.MANAGER_ADDRESS}{avatar_path}"

            self.id = int(self.access_context.get("owner_id", self.id))
            self.profile = result.get("general", False)
            print(f"Запрос от юзера {self.id}")
        else:
            print("Запрос от не анонимного юзера (ошибка сервера, оставляем сессию, но профиль недоступен)")
            self.profile = False
            self.response = False

    async def _request_external(
        self,
        base_url: str,
        url: str,
        *,
        method: str = "GET",
        data: dict | None = None,
        json_data: dict | list | None = None,
        headers: dict | None = None,
    ) -> tuple[int, str | dict | list]:
        if not url.startswith("http://") and not url.startswith("https://"):
            if not url.startswith("/"):
                url = "/" + url
            url = base_url + url

        print(f"Запрос к внешнему серверу: {url}", flush=True)

        async with self.session.request(
            method,
            url,
            data=data,
            json=json_data,
            headers=headers,
            cookies=self.cookies,
        ) as response:
            for key, cookie in response.cookies.items():
                self.cookies[key] = cookie.value
                self.changed_cookies[key] = cookie
                max_age = cookie.get("max-age")
                if max_age is not None and not isinstance(max_age, int):
                    try:
                        max_age = int(float(max_age))
                    except (ValueError, TypeError):
                        max_age = None
                self.cookie_params[key] = {
                    "max_age": max_age,
                    "secure": cookie.get("secure"),
                    "httponly": cookie.get("httponly"),
                    "path": cookie.get("path", "/"),
                    "domain": cookie.get("domain"),
                    "samesite": cookie.get("samesite"),
                }

            content_type = response.headers.get("Content-Type", "")
            if content_type.startswith("application/json"):
                content = await response.json()
            else:
                content = await response.text()

            return response.status, content

    async def fetch(
        self,
        url: str,
        method: str = "GET",
        data: dict | None = None,
        headers: dict | None = None,
    ) -> tuple[int, str | dict | list]:
        return await self._request_external(
            config.MANAGER_ADDRESS,
            url,
            method=method,
            data=data,
            headers=headers,
        )

    async def fetch_access(
        self,
        url: str,
        method: str = "POST",
        data: dict | None = None,
        json_data: dict | list | None = None,
        headers: dict | None = None,
    ) -> tuple[int, str | dict | list]:
        if json_data is None and method in {"POST", "PUT", "PATCH"}:
            json_data = {}
        return await self._request_external(
            config.ACCESS_SERVICE_URL,
            url,
            method=method,
            data=data,
            json_data=json_data,
            headers=headers,
        )

    async def _cached_access(
        self,
        cache_key: tuple,
        url: str,
        *,
        method: str = "POST",
        json_data: dict | list | None = None,
    ) -> tuple[int, str | dict | list]:
        if cache_key in self._access_cache:
            return self._access_cache[cache_key]

        result = await self.fetch_access(url, method=method, json_data=json_data)
        self._access_cache[cache_key] = result
        return result

    async def get_session_access(self) -> dict:
        if not self.authenticated or self.id < 0:
            self.session_access = build_session_access(self.access_context)
            return self.session_access

        mod_add_code, mod_add = await self._cached_access(("mod-add",), "/mod", method="PUT")
        game_add_code, game_add = await self._cached_access(("game-add",), "/game", method="PUT")

        self.session_access = build_session_access(
            self.access_context,
            mod_add if mod_add_code == 200 and isinstance(mod_add, dict) else None,
            game_add if game_add_code == 200 and isinstance(game_add, dict) else None,
        )
        return self.session_access

    async def get_mod_add_access(self) -> dict:
        code, payload = await self._cached_access(("mod-add",), "/mod", method="PUT")
        return build_mod_add_access(payload if code == 200 and isinstance(payload, dict) else None)

    async def get_game_add_access(self) -> dict:
        code, payload = await self._cached_access(("game-add",), "/game", method="PUT")
        return build_game_add_access(payload if code == 200 and isinstance(payload, dict) else None)

    async def get_mod_access(
        self,
        mod_id: int,
        *,
        author_id: int | None = None,
        mode: bool | None = None,
    ) -> dict:
        cache_key = ("mod", int(mod_id), author_id, mode)
        payload = {}
        if author_id is not None:
            payload["author_id"] = int(author_id)
        if mode is not None:
            payload["mode"] = bool(mode)

        code, result = await self._cached_access(
            cache_key,
            f"/mod/{int(mod_id)}",
            method="POST",
            json_data=payload,
        )
        return build_mod_access(result if code == 200 and isinstance(result, dict) else None)

    async def get_profile_access(self, profile_id: int) -> dict:
        cache_key = ("profile", int(profile_id))
        code, result = await self._cached_access(
            cache_key,
            f"/profile/{int(profile_id)}",
            method="POST",
            json_data={},
        )
        return build_profile_access(result if code == 200 and isinstance(result, dict) else None)

    async def get_game_access(self, game_id: int) -> dict:
        cache_key = ("game", int(game_id))
        code, result = await self._cached_access(
            cache_key,
            f"/game/{int(game_id)}",
            method="POST",
            json_data={},
        )
        return build_game_access(result if code == 200 and isinstance(result, dict) else None)

    def render(self, filename: str, **kwargs) -> str:
        return render_template(
            filename,
            manager_address=config.MANAGER_ADDRESS,
            storage_address=config.STORAGE_ADDRESS,
            user_profile=self.profile,
            user_rights=self.session_access,
            session_access=self.session_access,
            ow=app_config.PUBLIC_CONFIG,
            **kwargs,
        )

    def finish(self, page: str) -> make_response:
        """
        Finish the request by setting cookies and returning a response.
        """

        response = make_response(page)
        for key, cookie in self.changed_cookies.items():
            params = self.cookie_params.get(key, {})
            response.set_cookie(
                key,
                cookie.value,
                max_age=params.get("max_age"),
                secure=params.get("secure"),
                httponly=params.get("httponly"),
                path=params.get("path", "/"),
                domain=params.get("domain"),
                samesite=params.get("samesite"),
            )
        return response
