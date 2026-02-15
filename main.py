from flask import Flask, render_template, send_from_directory, request, make_response, redirect
from pathlib import Path
from babel import dates
import datetime
from zoneinfo import ZoneInfo
import asyncio
import tool
import os
import sitemapper as sitemapper
from user_manager import UserHandler
import ow_config
import app_config
from telemetry import setup_uptrace_telemetry


app = Flask(__name__, template_folder='website')
setup_uptrace_telemetry(app)

SHORT_WORDS = [
    "b", "list", "h1", "h2", "h3", "h4", "h5", "h6", "*", "u", "url"
]


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
        # Определяем запросы
        info_path = app_config.api_path("mod", "info").format(mod_id=mod_id)
        resources_path = app_config.api_path("mod", "resources").format(mod_id=mod_id)
        tags_path = app_config.api_path("mod", "tags").format(mod_id=mod_id)

        api_urls = {
            "info": f"{info_path}?dependencies=true&description=true&short_description=true&dates=true&general=true&game=true&authors=true",
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
        if type(info) is str:
            # Сервер ответил на информацию о моде ошибкой (возврашаем ошибку пользователю)
            return handler.finish(handler.render("error.html", error=info, error_title='Ошибка')), info_code
        else:
            # Вторичная (косметическая на самом деле) распаковка
            if isinstance(tags, dict):
                if str(mod_id) in tags:
                    tags = tags[str(mod_id)]
                elif "results" in tags:
                    tags = tags["results"]
                elif "tags" in tags:
                    tags = tags["tags"]
                else:
                    tags = []
            elif tags is None:
                tags = []

        user_is_author = False
        user_is_owner = False

        authors = []
        if len(info['authors']) > 0:
            profile_info_path = app_config.api_path("profile", "info")
            authors_info = await asyncio.gather(
                *[handler.fetch(profile_info_path.format(user_id=author)) for author in info['authors']])

            for status_code, author in authors_info:
                author_to_add = author['general']
                author_to_add['owner'] = info['authors'][str(author_to_add['id'])]['owner']

                if handler.profile:
                    if author_to_add['id'] == handler.profile['id']:
                        user_is_author = True
                        user_is_owner = author_to_add['owner']

                authors.append(author_to_add)

        right_edit_mod = handler.access_to_mod(my_mod=user_is_author, owner_mod=user_is_owner)

        edit_page = '/edit' in request.path
        if False and edit_page and not right_edit_mod['edit']:
            if not handler.profile:
                page = handler.render("error.html", error='Войдите или создайте аккаунт', error_title='Не авторизован')
            elif right_edit_mod['in_mute']:
                page = handler.render("error.html", error='Вы во временном муте', error_title='В муте')
            else:
                page = handler.render(
                    "error.html",
                    error='Вы не имеете прав на редактирование чужих модов' if right_edit_mod['is_my_mod'] == 2 else 'Вы не имеете прав на редактирование своих модов',
                    error_title='Отказано в доступе'
                )

            return handler.finish(page), 403

        info['result']['size'] = await tool.size_format(info['result']['size']) # Преобразовываем кол-во байт в читаемые человеком форматы

        logo_item = None
        for image in resources["results"]: # Ищем логотип мода
            if image and image["type"] == "logo":
                info["result"]["logo"] = image["url"] # Фиксируем, что нашли его
                logo_item = image
                break
        else:
            info["result"]["logo"] = ''

        # На странице просмотра держим логотип в списке и выводим его первым
        if logo_item and not edit_page:
            resources["results"] = [logo_item] + [item for item in resources["results"] if item is not logo_item]

        info["no_many_screenshots"] = len(resources["results"]) <= 1 # bool переменная для рендера шаблона, указка показывать ли меню навигации

        for key in ["date_creation", "date_update_file"]: # Форматируем (обрабатываем) даты
            input_date = parse_api_datetime(info['result'][key])
            info['result'][f'{key}_js'] = format_js_datetime(input_date)
            info['result'][key] = dates.format_date(input_date, locale=launge)

        info['result']['id'] = mod_id # Фиксируем для рендера шаблона id мода

        dependencies = {}
        if info['dependencies_count'] > 0: # Чекаем, есть ли зависимости
            # Формируем запрос на получение зависимостей
            mods_list_path = app_config.api_path("mod", "list")
            dependencies_resources_path = app_config.api_path("resource", "list")
            dependencies_urls = [
                f'{mods_list_path}?page_size=50&allowed_ids={info["dependencies"]}',
                f'{dependencies_resources_path}?page_size=30&owner_type=mods&owner_ids={info["dependencies"]}'
            ]
            
            # Запрашиваем
            dependencies_info, dependencies_resources = await asyncio.gather(*[handler.fetch(url) for url in dependencies_urls])

            # Распаковка данных
            dependencies_info_code, dependencies_info = dependencies_info
            dependencies_resources_code, dependencies_resources = dependencies_resources

            # Добавляем зависимости
            for dependency in dependencies_info['results']:
                dependencies[dependency['id']] = {
                    'id': dependency['id'],
                    'img': '',
                    'name': dependency['name']
                }

            # Добавляем логотипы зависимостям
            for resource in dependencies_resources['results']:
                dependencies[resource['owner_id']]['img'] = resource['url']

        page_html = handler.render(
            "mod-edit.html" if edit_page else "mod.html",
            info=info,
            tags=tags,
            resources=resources,
            dependencies=dependencies,
            right_edit=right_edit_mod,
            authors=authors
        )

        return handler.finish(page_html)

async def add_mod():
    async with UserHandler() as handler:
        access = handler.access_to_mod()

        if not access['add']:
            if not handler.profile:
                page = handler.render("error.html", error='Войдите или создайте аккаунт', error_title='Не авторизован')
            elif access['in_mute']:
                page = handler.render("error.html", error='Вы во временном муте', error_title='В муте')
            else:
                page = handler.render("error.html", error='Вы не можете публиковать моды', error_title='Отказано в доступе')

            return handler.finish(page), 403

        page = handler.render("mod-add.html")

        return handler.finish(page)

async def user(user_id):
    launge = "ru"

    async with UserHandler() as handler:
        profile_info_path = app_config.api_path("profile", "info").format(user_id=user_id)
        mods_list_path = app_config.api_path("mod", "list")
        profile_info, user_mods = await asyncio.gather(
            handler.fetch(profile_info_path),
            handler.fetch(f"{mods_list_path}?user={user_id}&page_size=4")
        )

        profile_info_code, profile_info = profile_info
        user_mods_code, user_mods = user_mods

        if profile_info_code != 200:
            return handler.finish(handler.render("error.html", error=profile_info, error_title=f'Ошибка ({profile_info_code})')), profile_info_code

        profile_info['delete_user'] = profile_info['general']['username'] is None

        if profile_info['delete_user']:
            return handler.finish(handler.render("error.html", error="Профиль удален", error_title="Этот профиль удален!")), 404

        if profile_info["general"]["mute"]:
            input_date = parse_api_datetime(profile_info["general"]["mute"])
            profile_info["general"]["mute_js"] = format_js_datetime(input_date)
            profile_info["general"]["mute"] = dates.format_datetime(input_date, format="short", locale=launge)

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

        if len(user_mods['results']) > 0:
            resources_mods_path = app_config.api_path("resource", "list")
            resources_mods_code, resources_mods = await handler.fetch(
                f'{resources_mods_path}?page_size=10&page=0&types_resources=["logo"]&owner_type=mods&owner_ids={[i["id"] for i in user_mods["results"]]}'
            )

            mods_data = [
                {
                    'id': int(i['id']),
                    'name': i['name'],
                    'img': ''
                }
                for i in user_mods['results']
            ]
            mods_by_id = {item["id"]: item for item in mods_data}

            print(resources_mods)
            for resource in resources_mods.get('results', []):
                mod_entry = mods_by_id.get(int(resource.get('owner_id', -1)))
                if mod_entry:
                    mod_entry['img'] = resource.get('url', '')

            user_mods = {
                'not_show_all': len(user_mods['results']) > 3,
                'mods_data': mods_data
            }
        else:
            user_mods = False
        
        profile_info['general']['editable'] = handler.access_to_mod()

        page = handler.render("user.html", user_data=profile_info, user_mods=user_mods)

        return handler.finish(page)

async def user_settings(user_id):
    launge = "ru"

    async with UserHandler() as handler:
        editable = handler.access_to_profile(user_id)

        if not editable['any']:
            return handler.finish(handler.render("error.html", error=f"Вы не имеете прав редактировать этот профиль!", error_title='Отказано в доступе!')), 403

        if handler.id == user_id:
            info_profile_code = handler.response_code
            info_profile = handler.response
        else:
            profile_info_path = app_config.api_path("profile", "info").format(user_id=user_id)
            include_general = True
            include_rights = editable["admin"] or editable["my"]
            include_private = editable["admin"] or editable["my"]
            query = f"?general={'true' if include_general else 'false'}"
            query += f"&rights={'true' if include_rights else 'false'}"
            query += f"&private={'true' if include_private else 'false'}"
            info_profile_code, info_profile = await handler.fetch(
                f"{profile_info_path}{query}"
            )

        if info_profile_code != 200:
            return handler.finish(handler.render(
                "error.html",
                error=info_profile,
                error_title=f'Ошибка ({info_profile_code})')
            ), info_profile_code

        if info_profile["general"]["mute"]:
            input_date = parse_api_datetime(info_profile["general"]["mute"])
            info_profile["general"]["mute_js"] = format_js_datetime(input_date)
            info_profile["general"]["mute"] = dates.format_datetime(input_date, format="short", locale=launge)

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

        return handler.finish(handler.render("user-settings.html", user_data=info_profile, user_access=editable))

async def user_mods(user_id):
    async with UserHandler() as handler:
        profile_info_path = app_config.api_path("profile", "info").format(user_id=user_id)
        profile_code, profile_info = await handler.fetch(profile_info_path)

        if profile_code != 200:
            return handler.finish(handler.render(
                "error.html",
                error=profile_info,
                error_title=f'Ошибка ({profile_code})')
            ), profile_code

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

    for route in app_config.ROUTES["user"]["view"]:
        app.add_url_rule(route, view_func=user)
    for route in app_config.ROUTES["user"]["settings"]:
        app.add_url_rule(route, view_func=user_settings)
    for route in app_config.ROUTES["user"]["mods"]:
        app.add_url_rule(route, view_func=user_mods)


register_routes()


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
    app.run(port=6660)
    #from waitress import serve
    #serve(app, host="0.0.0.0", port=6660, threads=100)
