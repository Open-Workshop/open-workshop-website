from flask import Flask, render_template, send_from_directory, request, make_response
from pathlib import Path
from babel import dates
import datetime
from zoneinfo import ZoneInfo
import asyncio
import json
from urllib.parse import urlencode
import tool
import os
import sitemapper as sitemapper
import mod_event_index
from access_policy import build_mod_rights
from description_renderer import render_description_html
from user_manager import UserHandler
import ow_config
import app_config
from telemetry import setup_uptrace_telemetry


app = Flask(__name__, template_folder='website')
setup_uptrace_telemetry(app)

DEFAULT_IMAGE_FALLBACK = app_config.PUBLIC_CONFIG["assets"]["images"]["fallback"]

SHORT_WORDS = [
    "b", "list", "h1", "h2", "h3", "h4", "h5", "h6", "*", "u", "url"
]


def _compact_json_list(values) -> str:
    return json.dumps(list(values), separators=(",", ":"))


def _build_query_url(base_url: str, params: dict | None = None) -> str:
    if not params:
        return base_url

    query_items: list[tuple[str, str]] = []
    for key, value in params.items():
        if value is None:
            continue
        if isinstance(value, (list, tuple, set)):
            for item in value:
                if item is None:
                    continue
                query_items.append((key, str(item)))
            continue
        query_items.append((key, str(value)))

    if not query_items:
        return base_url

    query_string = urlencode(query_items, doseq=True)
    return f"{base_url}{'&' if '?' in base_url else '?'}{query_string}"


def _collection_items(payload) -> list:
    if isinstance(payload, dict):
        items = payload.get("items")
        if isinstance(items, list):
            return items
        results = payload.get("results")
        if isinstance(results, list):
            return results
    return []


def _collection_total(payload, default: int | None = None) -> int:
    if isinstance(payload, dict):
        pagination = payload.get("pagination")
        if isinstance(pagination, dict):
            try:
                return int(pagination.get("total"))
            except (TypeError, ValueError):
                pass
        try:
            return int(payload.get("database_size"))
        except (TypeError, ValueError):
            pass

    if default is not None:
        return default

    return len(_collection_items(payload))


def _ensure_profile_payload(payload):
    if isinstance(payload, dict) and "general" in payload:
        return payload
    if isinstance(payload, dict):
        return {"general": payload}
    return {"general": payload}


def _chunked(values, chunk_size: int):
    for index in range(0, len(values), chunk_size):
        yield values[index:index + chunk_size]


def _stringify_error_value(value) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, list):
        parts = []
        for item in value:
            item_text = _stringify_error_value(item)
            if item_text:
                parts.append(item_text)
        return "; ".join(parts)
    if isinstance(value, dict):
        for key in ("detail", "message", "error", "msg", "description", "title"):
            item_text = _stringify_error_value(value.get(key))
            if item_text:
                return item_text
        return json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    return str(value)


def _extract_error_info(payload, status_code: int | None = None) -> tuple[str, str, int]:
    fallback_code = status_code if status_code is not None else 500
    fallback_title = "Доступ запрещен" if fallback_code == 403 else "Ошибка"

    if isinstance(payload, dict):
        title = _stringify_error_value(payload.get("title")) or fallback_title
        detail = _stringify_error_value(payload.get("detail"))
        if not detail:
            for key in ("message", "error", "description"):
                detail = _stringify_error_value(payload.get(key))
                if detail:
                    break
        if not detail:
            detail = title

        status_value = payload.get("status")
        try:
            code = int(status_value) if status_value is not None else fallback_code
        except (TypeError, ValueError):
            code = fallback_code

        return title, detail, code

    if isinstance(payload, str):
        text = payload.strip()
        if text[:1] in {"{", "["}:
            try:
                parsed = json.loads(text)
            except json.JSONDecodeError:
                parsed = None
            if parsed is not None:
                return _extract_error_info(parsed, fallback_code)
        if not text:
            return fallback_title, fallback_title, fallback_code
        return fallback_title, text, fallback_code

    detail = _stringify_error_value(payload) or fallback_title
    return fallback_title, detail, fallback_code


def _render_api_error(handler: UserHandler, payload, status_code: int | None = None):
    error_title, error_body, error_code = _extract_error_info(payload, status_code)
    page = handler.render("error.html", error=error_body, error_title=error_title)
    return handler.finish(page), error_code


async def _load_paged_results(handler: UserHandler, base_url: str, *, page_size: int = 50) -> list:
    safe_page_size = max(1, min(int(page_size), 50))
    first_status, first_payload = await handler.fetch(
        _build_query_url(base_url, {"page_size": safe_page_size}),
    )
    if first_status != 200 or not isinstance(first_payload, dict):
        return []

    first_results = _collection_items(first_payload)
    total_size = _collection_total(first_payload, len(first_results))

    if total_size <= len(first_results):
        return first_results

    page_count = (total_size + safe_page_size - 1) // safe_page_size
    page_requests = [
        handler.fetch(_build_query_url(base_url, {"page_size": safe_page_size, "page": page}))
        for page in range(1, page_count)
    ]

    page_results = await asyncio.gather(*page_requests)
    collected_results = list(first_results)

    for status_code, payload in page_results:
        if status_code != 200 or not isinstance(payload, dict):
            continue

        collected_results.extend(_collection_items(payload))

    return collected_results


async def _load_mod_cards_by_ids(
    handler: UserHandler,
    mod_ids,
    mods_list_path: str,
    resources_list_path: str,
    *,
    batch_size: int = 20,
) -> dict:
    ordered_ids = []
    seen_ids = set()

    for mod_id in mod_ids:
        try:
            normalized_id = int(mod_id)
        except (TypeError, ValueError):
            continue

        if normalized_id in seen_ids:
            continue

        seen_ids.add(normalized_id)
        ordered_ids.append(normalized_id)

    if len(ordered_ids) <= 0:
        return {}

    batch_requests = []
    for batch_ids in _chunked(ordered_ids, batch_size):
        batch_requests.append(
            asyncio.gather(
                handler.fetch(
                    _build_query_url(mods_list_path, {
                        "page_size": len(batch_ids),
                        "ids": batch_ids,
                    }),
                ),
                handler.fetch(
                    _build_query_url(resources_list_path, {
                        "page_size": 50,
                        "owner_type": "mods",
                        "owner_ids": batch_ids,
                        "types": ["logo"],
                    }),
                ),
            )
        )

    batch_results = await asyncio.gather(*batch_requests)

    names_by_id = {}
    images_by_id = {}

    for mods_result, resources_result in batch_results:
        mods_status_code, mods_info = mods_result
        if mods_status_code == 200 and isinstance(mods_info, dict):
            for mod_info in _collection_items(mods_info):
                if not isinstance(mod_info, dict):
                    continue

                mod_id = mod_info.get("id")
                if mod_id is None:
                    continue

                names_by_id[int(mod_id)] = mod_info.get("name", "")

        resources_status_code, resources_info = resources_result
        if resources_status_code == 200 and isinstance(resources_info, dict):
            for resource in _collection_items(resources_info):
                if not isinstance(resource, dict):
                    continue

                owner_id = resource.get("owner_id")
                resource_url = resource.get("url")
                if owner_id is None or not resource_url or int(owner_id) in images_by_id:
                    continue

                images_by_id[int(owner_id)] = resource_url

    cards = {}
    for mod_id in ordered_ids:
        if mod_id not in names_by_id:
            continue

        cards[mod_id] = {
            "id": mod_id,
            "img": images_by_id.get(mod_id) or DEFAULT_IMAGE_FALLBACK,
            "name": names_by_id[mod_id],
        }

    return cards


def _get_local_tz() -> datetime.tzinfo:
    tz_name = getattr(ow_config, "TIMEZONE", None)
    if tz_name:
        try:
            return ZoneInfo(tz_name)
        except Exception:
            pass
    return datetime.datetime.now().astimezone().tzinfo


LOCAL_TZ = _get_local_tz()


def parse_api_datetime(value: str) -> datetime.datetime:
    dt = datetime.datetime.fromisoformat(value)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=datetime.timezone.utc)
    return dt.astimezone(LOCAL_TZ)


def format_js_datetime(value: datetime.datetime) -> str:
    if value.tzinfo is None:
        value = value.replace(tzinfo=datetime.timezone.utc)
    # ISO 8601 with timezone offset for correct client-side parsing
    return value.astimezone(datetime.timezone.utc).isoformat(timespec="seconds")


async def unified_route():
    url = request.path
    if url == '/': url = '/index'
    if not url.endswith('.html'): url += '.html'

    async with UserHandler() as handler:
        page_html = handler.render(url[1:], catalog=(url=='/index.html'))
        return handler.finish(page_html)


async def mod_view_and_edit(mod_id):
    launge = "ru"

    async with UserHandler() as handler:
        mod_access = await handler.get_mod_access(mod_id)
        right_edit_mod = build_mod_rights(mod_access)

        if not mod_access["info"]["value"]:
            page = handler.render(
                "error.html",
                error=mod_access["info"]["reason"],
                error_title="Отказано в доступе",
            )
            return handler.finish(page), 403

        edit_page = "/edit" in request.path
        if edit_page and not right_edit_mod["edit"]:
            if not handler.authenticated:
                page = handler.render("error.html", error="Войдите или создайте аккаунт", error_title="Не авторизован")
            else:
                page = handler.render(
                    "error.html",
                    error=mod_access["edit"]["title"]["reason"],
                    error_title="Отказано в доступе",
                )

            return handler.finish(page), 403

        # Определяем запросы
        info_path = app_config.api_path("mod", "info").format(mod_id=mod_id)
        resources_path = app_config.api_path("mod", "resources").format(mod_id=mod_id)
        tags_path = app_config.api_path("mod", "tags").format(mod_id=mod_id)

        api_urls = {
            "info": _build_query_url(
                info_path,
                {
                    "include": [
                        "dependencies",
                        "description",
                        "short_description",
                        "dates",
                        "game",
                        "authors",
                    ],
                },
            ),
            "resources": f"{resources_path}?page_size=30",
            "tags": f"{tags_path}"
        }

        # Запрашиваем
        info_result, resources_result, tags_result = await asyncio.gather(
            handler.fetch(api_urls["info"]),
            handler.fetch(api_urls["resources"]),
            handler.fetch(api_urls["tags"])
        )

        # Первичная распаковка данных
        info_code, info = info_result
        resources_code, resources = resources_result
        tags_code, tags = tags_result

        # Проверка результатов
        if info_code != 200 or not isinstance(info, dict):
            # Сервер ответил на информацию о моде ошибкой, показываем человекочитаемую страницу.
            return _render_api_error(handler, info, info_code)

        info_result = info
        if "created_at" in info_result and "date_creation" not in info_result:
            info_result["date_creation"] = info_result["created_at"]
        if "file_updated_at" in info_result and "date_update_file" not in info_result:
            info_result["date_update_file"] = info_result["file_updated_at"]
        if "updated_at" in info_result and "date_edit" not in info_result:
            info_result["date_edit"] = info_result["updated_at"]

        # Вторичная (косметическая на самом деле) распаковка
        if isinstance(tags, dict):
            if str(mod_id) in tags:
                tags = tags[str(mod_id)]
            elif "items" in tags or "results" in tags:
                tags = _collection_items(tags)
            elif "tags" in tags:
                tags = tags["tags"]
            else:
                tags = []
        elif tags is None:
            tags = []

        user_is_author = False
        user_is_owner = False

        authors = []
        if len(info_result.get('authors', {})) > 0:
            profile_info_path = app_config.api_path("profile", "info")
            authors_info = await asyncio.gather(
                *[handler.fetch(profile_info_path.format(user_id=author)) for author in info_result['authors']])

            for status_code, author in authors_info:
                author_to_add = author['general']
                author_to_add['owner'] = info_result['authors'][str(author_to_add['id'])]['owner']

                if handler.profile:
                    if author_to_add['id'] == handler.profile['id']:
                        user_is_author = True
                        user_is_owner = author_to_add['owner']

                authors.append(author_to_add)

        info_result['size'] = await tool.size_format(info_result['size']) # Преобразовываем кол-во байт в читаемые человеком форматы
        info_result['size_unpacked'] = await tool.size_format(info_result['size_unpacked'])

        resources_results = _collection_items(resources) if isinstance(resources, dict) else []
        if isinstance(resources, dict):
            resources = {**resources, "items": resources_results}
        else:
            resources = {"items": resources_results}

        logo_item = None
        logo_url = str(info_result.get("logo", "") or "")
        for image in resources_results: # Ищем логотип мода
            if isinstance(image, dict) and image.get("type") == "logo" and image.get("url"):
                logo_url = image["url"] # Фиксируем, что нашли его
                logo_item = image
                break

        # Если отдельный logo-ресурс не найден, используем первое доступное изображение
        # как fallback для OG-превью.
        if not logo_url:
            for image in resources_results:
                if isinstance(image, dict) and image.get("url"):
                    logo_url = image["url"]
                    break

        info_result["logo"] = logo_url

        # На странице просмотра держим логотип в списке и выводим его первым
        if logo_item and not edit_page:
            resources["items"] = [logo_item] + [item for item in resources_results if item is not logo_item]

        info_result["no_many_screenshots"] = len(resources_results) <= 1 # bool переменная для рендера шаблона, указка показывать ли меню навигации

        dependencies_payload = info_result.get("dependencies")
        if isinstance(dependencies_payload, dict):
            dependency_items = [
                int(item)
                for item in dependencies_payload.get("items", [])
                if isinstance(item, (int, str)) and str(item).strip()
            ]
            dependencies_payload = {
                "count": int(dependencies_payload.get("count", len(dependency_items)) or 0),
                "items": dependency_items,
            }
        else:
            dependencies_payload = {"count": 0, "items": []}
        info_result["dependencies"] = dependencies_payload

        for key in ["date_creation", "date_update_file"]: # Форматируем (обрабатываем) даты
            input_date = parse_api_datetime(info_result[key])
            info_result[f'{key}_js'] = format_js_datetime(input_date)
            info_result[key] = dates.format_date(input_date, locale=launge)

        info_result['id'] = mod_id # Фиксируем для рендера шаблона id мода
        info_result["short_description"] = str(info_result.get("short_description") or "")
        info_result["description"] = str(info_result.get("description") or "")
        info_result["description_html"] = render_description_html(info_result["description"])

        mods_list_path = app_config.api_path("mod", "list")
        resources_list_path = app_config.api_path("resource", "list")

        dependencies = {}
        if info_result["dependencies"]["count"] > 0: # Чекаем, есть ли зависимости
            dependencies = await _load_mod_cards_by_ids(
                handler,
                info_result["dependencies"]["items"],
                mods_list_path,
                resources_list_path,
            )

        plugins = {}
        plugins_database_size = 0
        _, plugins_info = await handler.fetch(
            _build_query_url(
                mods_list_path,
                {
                    "page_size": 2,
                    "dependencies": [mod_id],
                },
            )
        )
        if isinstance(plugins_info, dict):
            plugins_results = _collection_items(plugins_info)
            plugins_database_size = max(_collection_total(plugins_info, len(plugins_results)) or 0, 0)

            plugin_ids = []
            for plugin in plugins_results:
                if not isinstance(plugin, dict):
                    continue

                plugin_id = plugin.get('id')
                if plugin_id is None or str(plugin_id) == str(mod_id):
                    continue

                plugin_key = str(plugin_id)
                plugin_ids.append(plugin_id)
                plugins[plugin_key] = {
                    'id': plugin_id,
                    'img': DEFAULT_IMAGE_FALLBACK,
                    'name': plugin.get('name', '')
                }

            if len(plugin_ids) > 0:
                _, plugins_resources = await handler.fetch(
                    _build_query_url(
                        resources_list_path,
                        {
                            "page_size": 30,
                            "owner_type": "mods",
                            "owner_ids": plugin_ids,
                            "types": ["logo"],
                        },
                    )
                )
                if isinstance(plugins_resources, dict):
                    for resource in _collection_items(plugins_resources):
                        if not isinstance(resource, dict):
                            continue

                        plugin_key = str(resource.get('owner_id'))
                        if plugin_key in plugins and resource.get('url'):
                            plugins[plugin_key]['img'] = resource['url']

        plugins_more_count = max(plugins_database_size - len(plugins), 0)

        if edit_page:
            edit_page_config = {
                **app_config.EDIT_PAGE_CONFIGS["mod"],
                "entity_id": info_result["id"],
            }
            page_html = handler.render(
                "mod-edit.html",
                edit_page=edit_page_config,
                edit_title=f"{info_result['name']} - edit Open Mod",
                edit_description=info_result["short_description"],
                info=info_result,
                tags=tags,
                resources=resources,
                dependencies=dependencies,
                plugins=plugins,
                plugins_more_count=plugins_more_count,
                mod_access=mod_access,
                right_edit=right_edit_mod,
                authors=authors,
                is_mod_data=False,
                data=[info_result],
            )
        else:
            page_html = handler.render(
                "mod.html",
                info=info_result,
                tags=tags,
                resources=resources,
                dependencies=dependencies,
                plugins=plugins,
                plugins_more_count=plugins_more_count,
                mod_access=mod_access,
                right_edit=right_edit_mod,
                authors=authors,
                is_mod_data=True,
                data=[info_result],
            )

        return handler.finish(page_html)

async def add_mod():
    async with UserHandler() as handler:
        access = await handler.get_mod_add_access()

        if not access['add']['value']:
            if not handler.authenticated:
                page = handler.render("error.html", error='Войдите или создайте аккаунт', error_title='Не авторизован')
            else:
                page = handler.render(
                    "error.html",
                    error=access['add']['reason'],
                    error_title='Отказано в доступе',
                )

            return handler.finish(page), 403

        page = handler.render("mod-add.html", add_page=app_config.ADD_PAGE_CONFIGS["mod"])

        return handler.finish(page)

async def add_game():
    async with UserHandler() as handler:
        access = await handler.get_game_add_access()

        if not access['add']['value']:
            if not handler.authenticated:
                page = handler.render("error.html", error='Войдите или создайте аккаунт', error_title='Не авторизован')
            else:
                page = handler.render(
                    "error.html",
                    error=access['add']['reason'],
                    error_title='Отказано в доступе'
                )
            return handler.finish(page), 403

        page = handler.render("mod-add.html", add_page=app_config.ADD_PAGE_CONFIGS["game"])

        return handler.finish(page)

async def game_edit(game_id):
    launge = "ru"

    async with UserHandler() as handler:
        game_access = await handler.get_game_access(game_id)

        if not game_access['edit']['title']['value']:
            if not handler.authenticated:
                page = handler.render("error.html", error='Войдите или создайте аккаунт', error_title='Не авторизован')
            else:
                page = handler.render(
                    "error.html",
                    error=game_access['edit']['title']['reason'],
                    error_title='Отказано в доступе'
                )
            return handler.finish(page), 403

        game_info_path = app_config.api_path("game", "info").format(game_id=game_id)
        tag_list_path = app_config.api_path("tag", "list")
        genre_list_path = app_config.api_path("genre", "list")
        game_genres_path = app_config.api_path("game", "genres").format(game_id=game_id)
        resources_list_path = app_config.api_path("resource", "list")

        game_info_result, game_tags, all_genres_result, game_genres_result, game_resources_result = await asyncio.gather(
            handler.fetch(
                _build_query_url(
                    game_info_path,
                    {
                        "include": ["short_description", "description", "dates", "statistics"],
                    },
                )
            ),
            _load_paged_results(handler, _build_query_url(tag_list_path, {"game_id": game_id}), page_size=50),
            handler.fetch(_build_query_url(genre_list_path, {"page_size": 200})),
            handler.fetch(game_genres_path),
            handler.fetch(
                _build_query_url(
                    resources_list_path,
                    {
                        "page_size": 30,
                        "owner_type": "games",
                        "owner_ids": [game_id],
                        "types": ["logo", "screenshot"],
                    },
                )
            ),
        )

        game_info_code, game_info = game_info_result
        if game_info_code != 200 or not isinstance(game_info, dict):
            return _render_api_error(handler, game_info, game_info_code)

        _, all_genres = all_genres_result
        _, game_genres = game_genres_result
        _, game_resources = game_resources_result

        if game_info.get("date_creation"):
            input_date = parse_api_datetime(game_info["date_creation"])
            game_info["date_creation_js"] = format_js_datetime(input_date)
            game_info["date_creation"] = dates.format_date(input_date, locale=launge)

        game_info["short_description"] = str(game_info.get("short_description") or "")
        game_info["description"] = str(game_info.get("description") or "")
        game_info["source"] = str(game_info.get("source") or "")
        game_info["source_id"] = "" if game_info.get("source_id") is None else str(game_info.get("source_id"))

        game_resources_items = _collection_items(game_resources) if isinstance(game_resources, dict) else []
        if isinstance(game_resources, dict):
            game_resources = {**game_resources, "items": game_resources_items}
        else:
            game_resources = {"items": game_resources_items}

        game_logo_url = ""
        for resource in game_resources.get("items", []):
            if isinstance(resource, dict) and resource.get("url"):
                if resource.get("type") == "logo":
                    game_logo_url = resource["url"]
                    break
                if not game_logo_url:
                    game_logo_url = resource["url"]
        game_info["logo"] = game_logo_url

        selected_genres = []
        if isinstance(game_genres, dict):
            selected_genres = _collection_items(game_genres)
            if not selected_genres and str(game_id) in game_genres and isinstance(game_genres[str(game_id)], list):
                selected_genres = game_genres[str(game_id)]
        elif isinstance(game_genres, list):
            selected_genres = game_genres

        selected_genre_ids = [
            int(item["id"])
            for item in selected_genres
            if isinstance(item, dict) and item.get("id") is not None
        ]

        all_genres_items = _collection_items(all_genres) if isinstance(all_genres, dict) else []

        edit_page_config = {
            **app_config.EDIT_PAGE_CONFIGS["game"],
            "entity_id": game_info["id"],
        }

        return handler.finish(handler.render(
            "mod-edit.html",
            edit_page=edit_page_config,
            edit_title=f"{game_info['name']} - edit Open Game",
            edit_description=game_info["short_description"],
            game=game_info,
            resources=game_resources,
            game_tags=game_tags,
            available_genres=all_genres_items,
            selected_genres=selected_genres,
            selected_genre_ids=selected_genre_ids,
        ))

async def user(user_id):
    launge = "ru"

    async with UserHandler() as handler:
        profile_access = await handler.get_profile_access(user_id)
        profile_info_path = app_config.api_path("profile", "info").format(user_id=user_id)
        mods_list_path = app_config.api_path("mod", "list")
        profile_info, user_mods = await asyncio.gather(
            handler.fetch(_build_query_url(profile_info_path, {"include": ["general"]})),
            handler.fetch(
                _build_query_url(
                    mods_list_path,
                    {
                        "page_size": 50,
                        "include": ["authors"],
                        "sort": "-created_at",
                    },
                )
            ),
        )

        profile_info_code, profile_info = profile_info
        user_mods_code, user_mods = user_mods

        if profile_info_code != 200:
            return _render_api_error(handler, profile_info, profile_info_code)

        profile_info = _ensure_profile_payload(profile_info)
        profile_info['delete_user'] = profile_info['general']['username'] is None

        if profile_info['delete_user']:
            return handler.finish(handler.render("error.html", error="Профиль удален", error_title="Этот профиль удален!")), 404

        if profile_info["general"].get("mute_until"):
            input_date = parse_api_datetime(str(profile_info["general"]["mute_until"]))
            profile_info["general"]["mute_until_js"] = format_js_datetime(input_date)
            profile_info["general"]["mute_until"] = dates.format_datetime(input_date, format="short", locale=launge)

        input_date = parse_api_datetime(profile_info['general']['registration_date'])
        profile_info['general']['registration_date_js'] = format_js_datetime(input_date)
        profile_info['general']['registration_date'] = dates.format_date(input_date, locale=launge)

        if profile_info['general']['about'] is None or len(profile_info['general']['about']) <= 0:
            profile_info['general']['about_enable'] = False
            profile_info['general']['about'] = f"Социальная сеть для модов! Зарегистрируйся и добавь {profile_info['general']['username']} в друзья! 🤪"
        else:
            profile_info['general']['about_enable'] = True

        if profile_info['general']['avatar_url'] is None or len(profile_info['general']['avatar_url']) <= 0:
            profile_info['general']['avatar_url'] = "/assets/images/no-avatar.jpg"
        elif profile_info['general']['avatar_url'].startswith("local"):
            avatar_path = app_config.api_path("profile", "avatar").format(user_id=user_id)
            profile_info['general']['avatar_url'] = f"{ ow_config.MANAGER_ADDRESS }{avatar_path}"

        user_mods_items = _collection_items(user_mods) if isinstance(user_mods, dict) else []
        user_mods_items = [
            mod
            for mod in user_mods_items
            if isinstance(mod, dict) and isinstance(mod.get("authors"), dict) and str(user_id) in mod["authors"]
        ]

        if len(user_mods_items) > 0:
            resources_mods_path = app_config.api_path("resource", "list")
            resources_mods_code, resources_mods = await handler.fetch(
                _build_query_url(
                    resources_mods_path,
                    {
                        "page_size": 10,
                        "owner_type": "mods",
                        "owner_ids": [item["id"] for item in user_mods_items],
                        "types": ["logo"],
                    },
                )
            )

            mods_data = [
                {
                    'id': int(i['id']),
                    'name': i['name'],
                    'img': DEFAULT_IMAGE_FALLBACK
                }
                for i in user_mods_items[:4]
            ]
            mods_by_id = {item["id"]: item for item in mods_data}

            for resource in _collection_items(resources_mods) if isinstance(resources_mods, dict) else []:
                mod_entry = mods_by_id.get(int(resource.get('owner_id', -1)))
                if mod_entry:
                    mod_entry['img'] = resource.get('url') or DEFAULT_IMAGE_FALLBACK

            user_mods = {
                'not_show_all': len(user_mods_items) > 3,
                'mods_data': mods_data
            }
        else:
            user_mods = False
        
        profile_info['general']['editable'] = profile_access

        page = handler.render("user.html", user_data=profile_info, user_mods=user_mods, profile_access=profile_access)

        return handler.finish(page)

async def user_settings(user_id):
    launge = "ru"

    async with UserHandler() as handler:
        editable = await handler.get_profile_access(user_id)

        if not editable['any']:
            return handler.finish(handler.render("error.html", error=f"Вы не имеете прав редактировать этот профиль!", error_title='Отказано в доступе!')), 403

        include_rights = bool(editable["edit"]["rights"]["value"])
        include_private = bool(editable["my"] or include_rights)

        if handler.id == user_id and handler.response and not include_rights:
            info_profile_code = handler.response_code
            info_profile = handler.response
        else:
            profile_info_path = app_config.api_path("profile", "info").format(user_id=user_id)
            include_params = ["general"]
            if include_rights:
                include_params.append("rights")
            if include_private:
                include_params.append("private")
            info_profile_code, info_profile = await handler.fetch(
                _build_query_url(profile_info_path, {"include": include_params})
            )

        if info_profile_code != 200:
            return _render_api_error(handler, info_profile, info_profile_code)

        info_profile = _ensure_profile_payload(info_profile)

        if info_profile["general"].get("mute_until"):
            input_date = parse_api_datetime(str(info_profile["general"]["mute_until"]))
            info_profile["general"]["mute_until_js"] = format_js_datetime(input_date)
            info_profile["general"]["mute_until"] = dates.format_datetime(input_date, format="short", locale=launge)

        if info_profile['general']['about'] is None or len(info_profile['general']['about']) <= 0:
            info_profile['general']['about_enable'] = False
            info_profile['general']['about'] = f"Социальная сеть для модов! Зарегистрируйся и добавь {info_profile['general']['username']} в друзья! 🤪"
        else:
            info_profile['general']['about_enable'] = True

        input_date = parse_api_datetime(info_profile['general']['registration_date'])
        info_profile['general']['registration_date_js'] = format_js_datetime(input_date)
        info_profile['general']['registration_date'] = dates.format_date(input_date, locale=launge)

        if info_profile['general']['avatar_url'] is None or len(info_profile['general']['avatar_url']) <= 0:
            info_profile['general']['avatar_url'] = "/assets/images/no-avatar.jpg"
        elif info_profile['general']['avatar_url'].startswith("local"):
            avatar_path = app_config.api_path("profile", "avatar").format(user_id=user_id)
            info_profile['general']['avatar_url'] = f"{ ow_config.MANAGER_ADDRESS }{avatar_path}"

        info_profile['delete_user'] = info_profile['general']['username'] is None

        return handler.finish(handler.render("user-settings.html", user_data=info_profile, user_access=editable, profile_access=editable))

async def user_mods(user_id):
    async with UserHandler() as handler:
        profile_info_path = app_config.api_path("profile", "info").format(user_id=user_id)
        profile_code, profile_info = await handler.fetch(profile_info_path)

        if profile_code != 200:
            return _render_api_error(handler, profile_info, profile_code)

        username = profile_info.get("general", {}).get("username") or f"Пользователь {user_id}"
        catalog_user = {
            "id": user_id,
            "username": username
        }

        page = handler.render("index.html", catalog=True, catalog_user=catalog_user)
        return handler.finish(page)


def register_routes() -> None:
    for route in app_config.ROUTES["unified_pages"]:
        app.add_url_rule(route, view_func=unified_route)

    for route in app_config.ROUTES["mod"]["view"]:
        app.add_url_rule(route, view_func=mod_view_and_edit)
    for route in app_config.ROUTES["mod"]["add"]:
        app.add_url_rule(route, view_func=add_mod)
    for route in app_config.ROUTES["game"]["add"]:
        app.add_url_rule(route, view_func=add_game)
    for route in app_config.ROUTES["game"]["edit"]:
        app.add_url_rule(route, view_func=game_edit)

    for route in app_config.ROUTES["user"]["view"]:
        app.add_url_rule(route, view_func=user)
    for route in app_config.ROUTES["user"]["settings"]:
        app.add_url_rule(route, view_func=user_settings)
    for route in app_config.ROUTES["user"]["mods"]:
        app.add_url_rule(route, view_func=user_mods)


register_routes()
mod_event_index.start_background_consumer()


@app.route('/api/login-popup')
async def login_popup():
    return render_template("login-popup.html", link=request.args.get('f'), russia=not bool(request.cookies.get('fromRussia')))

@app.route('/robots.txt')
async def robots():
    site_host = request.host.split(":", 1)[0].lower()
    page = render_template("robots.txt", site_host=site_host)
    page_ret = make_response(page)
    page_ret.mimetype = "text/plain"
    return page_ret

@app.route('/<path:filename>')
async def serve_static(filename):
    if filename.startswith("/html-partials/") or filename.startswith("html-partials/"):
        return await page_not_found()

    return send_from_directory("website", filename)

@app.errorhandler(404)
async def page_not_found(_error = -1):
    return await tool.error_page(
        error_title='Not Found (404)',
        error_body='404 страница не найдена',
        error_code=404
    )

@app.errorhandler(500)
async def internal_server_error(_error = -1):
    return await tool.error_page(
        error_title='Internal Server Error (500)',
        error_body='На сервере произошла внутренняя ошибка, и он не смог выполнить ваш запрос. Либо сервер перегружен, либо в приложении ошибка.',
        error_code=500
    )


@app.route('/sitemap.xml')
async def sitemap():
    site_host = request.host.split(":", 1)[0].lower()
    safe_site_host = "".join(ch if (ch.isalnum() or ch in ".-") else "_" for ch in site_host)
    file_path = f"website/sitemaps/{safe_site_host}.sitemap.xml"

    now = datetime.datetime.now()
    should_regenerate = True

    if Path(file_path).exists():
        file_stat = os.stat(file_path)
        created_time = datetime.datetime.fromtimestamp(file_stat.st_mtime)
        diff = now - created_time

        # Регенерируем не только по возрасту, но и если кэш-файл оказался пустым.
        if diff > datetime.timedelta(hours=5) or file_stat.st_size == 0:
            print("sitemap.xml regenerate")
            page = await sitemapper.generate(file_path, site_host=site_host)
        else:
            should_regenerate = False

    if should_regenerate and "page" not in locals():
        print("sitemap.xml generate")
        page = await sitemapper.generate(file_path, site_host=site_host)

    if "page" not in locals():
        print("sitemap.xml relevant")
        with open(file_path, "r") as file:
            page = file.read()

    page_ret = make_response(page)
    page_ret.headers["Content-Type"] = "application/rss+xml"
    page_ret.mimetype = "application/xml"

    return page_ret


if __name__ == '__main__':
    #app.run(host="127.0.0.1",
    #        port=443,
    #        ssl_context=("fakesite.openworkshop.miskler.ru.pem", "fakesite.openworkshop.miskler.ru-key.pem"))
    from waitress import serve
    serve(app, host="127.0.0.1", port=6660, threads=100)
