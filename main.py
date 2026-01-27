import aiohttp
from flask import Flask, render_template, send_from_directory, request, make_response, redirect
from pathlib import Path
from babel import dates
import datetime
import asyncio
import tool
import os
import sitemapper as sitemapper
from user_manager import UserHandler


app = Flask(__name__, template_folder='website')

SHORT_WORDS = [
    "b", "list", "h1", "h2", "h3", "h4", "h5", "h6", "*", "u", "url"
]


js_datetime = "%Y-%m-%d %H:%M:%S"


@app.route('/')
@app.route('/index')
@app.route('/index.html')
@app.route('/about')
@app.route('/about.html')
@app.route('/apis')
@app.route('/apis.html')
@app.route('/legal/cookies')
@app.route('/legal/cookies.html')
@app.route('/legal/license')
@app.route('/legal/license.html')
@app.route('/legal/site-rules')
@app.route('/legal/site-rules.html')
@app.route('/legal/copyright')
@app.route('/legal/copyright.html')
@app.route('/legal/privacy-policy')
@app.route('/legal/privacy-policy.html')
async def unified_route():
    url = request.path
    if url == '/': url = '/index'
    if not url.endswith('.html'): url += '.html'

    async with UserHandler() as handler:
        page_html = handler.render(url[1:], catalog=(url=='/index.html'))
        return handler.finish(page_html)


@app.route('/mod/<int:mod_id>')
@app.route('/mod/<int:mod_id>.html')
@app.route('/mod/<int:mod_id>/edit')
@app.route('/mod/<int:mod_id>/edit.html')
async def mod_view_and_edit(mod_id):
    launge = "ru"

    ## TODO ЗАТЫЧКА!! ПОТОМ УБРАТЬ!!! ##
    if mod_id > 60000:
        async with aiohttp.ClientSession() as session:
            async with session.get(f'https://openworkshop.su/api/manager/list/mods/?primary_sources=["steam"]&allowed_sources_ids=[{mod_id}]') as response:
                tor = await response.json()
                if len(tor['results']) > 0:
                    return redirect(
                        "/mod/" + str(tor['results'][0]['id']),
                        code=308
                    )
    ## / ЗАТЫЧКА!! ПОТОМ УБРАТЬ!!! ##

    async with UserHandler() as handler:
        # Определяем запросы
        api_urls = {
            "info": f"/info/mod/{mod_id}?dependencies=true&description=true&short_description=true&dates=true&general=true&game=true&authors=true",
            "resources": f"/list/resources/mods/[{mod_id}]?page_size=30",
            "tags": f"/list/tags/mods/[{mod_id}]"
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
            tags = tags[str(mod_id)]

        user_is_author = False
        user_is_owner = False

        authors = []
        if len(info['authors']) > 0:
            authors_info = await asyncio.gather(
                *[handler.fetch(f'/profile/info/{author}') for author in info['authors']])

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

        for image in resources["results"]: # Ищем логотип мода
            if image and image["type"] == "logo":
                info["result"]["logo"] = image["url"] # Фиксируем, что нашли его
                if len(resources["results"]) > 1: # Если по мимо него есть скриншоты - выбиваем из окна скриншотов (по принципу либо это(лого), либо того(скриншоты))
                    resources["results"].remove(image)
                break
        else:
            info["result"]["logo"] = ''

        info["no_many_screenshots"] = len(resources["results"]) <= 1 # bool переменная для рендера шаблона, указка показывать ли меню навигации

        for key in ["date_creation", "date_update_file"]: # Форматируем (обрабатываем) даты
            input_date = datetime.datetime.fromisoformat(info['result'][key])
            info['result'][f'{key}_js'] = input_date.strftime(js_datetime)
            info['result'][key] = dates.format_date(input_date, locale=launge)

        info['result']['id'] = mod_id # Фиксируем для рендера шаблона id мода

        dependencies = {}
        if info['dependencies_count'] > 0: # Чекаем, есть ли зависимости
            # Формируем запрос на получение зависимостей
            dependencies_urls = [
                f'/list/mods/?page_size=50&allowed_ids={info["dependencies"]}',
                f'/list/resources/mods/{info["dependencies"]}?page_size=30'
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

@app.route('/mod/add')
@app.route('/mod/add.html')
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

@app.route('/user/<int:user_id>')
@app.route('/user/<int:user_id>.html')
async def user(user_id):
    launge = "ru"

    async with UserHandler() as handler:
        profile_info, user_mods = await asyncio.gather(
            handler.fetch(f"/profile/info/{user_id}"),
            handler.fetch(f"/list/mods/?user={user_id}&page_size=4")
        )

        profile_info_code, profile_info = profile_info
        user_mods_code, user_mods = user_mods

        if profile_info_code != 200:
            return handler.finish(handler.render("error.html", error=profile_info, error_title=f'Ошибка ({profile_info_code})')), profile_info_code

        profile_info['delete_user'] = profile_info['general']['username'] is None

        if profile_info['delete_user']:
            return handler.finish(handler.render("error.html", error="Профиль удален", error_title="Этот профиль удален!")), 404

        if profile_info["general"]["mute"]:
            input_date = datetime.datetime.fromisoformat(profile_info["general"]["mute"])
            profile_info["general"]["mute_js"] = profile_info["general"]["mute"]
            profile_info["general"]["mute"] = dates.format_datetime(input_date, format="short", locale=launge)

        input_date = datetime.datetime.fromisoformat(profile_info['general']['registration_date'])
        profile_info['general']['registration_date_js'] = input_date.strftime(js_datetime)
        profile_info['general']['registration_date'] = dates.format_date(input_date, locale=launge)

        if profile_info['general']['about'] is None or len(profile_info['general']['about']) <= 0:
            profile_info['general']['about_enable'] = False
            profile_info['general']['about'] = f"Социальная сеть для модов! Зарегистрируйся и добавь {profile_info['general']['username']} в друзья! 🤪"
        else:
            profile_info['general']['about_enable'] = True

        if profile_info['general']['avatar_url'] is None or len(profile_info['general']['avatar_url']) <= 0:
            profile_info['general']['avatar_url'] = "/assets/images/no-avatar.jpg"
        elif profile_info['general']['avatar_url'].startswith("local"):
            profile_info['general']['avatar_url'] = f"/api/manager/profile/avatar/{user_id}"

        if len(user_mods['results']) > 0:
            resources_mods_code, resources_mods = await handler.fetch(f'/list/resources/mods/{[i["id"] for i in user_mods["results"]]}?page_size=10&page=0&types_resources=["logo"]')

            mods_data = [
                {
                    'id': int(i['id']),
                    'name': i['name'],
                    'img': ''
                }
                for i in user_mods['results']
            ]

            print(resources_mods)
            for resource in resources_mods['results']:
                mods_data[resource['owner_id']]['img'] = resource['url']

            user_mods = {
                'not_show_all': len(user_mods['results']) > 3,
                'mods_data': mods_data
            }
        else:
            user_mods = False
        
        profile_info['general']['editable'] = handler.access_to_mod()

        page = handler.render("user.html", user_data=profile_info, user_mods=user_mods)

        return handler.finish(page)

@app.route('/user/<int:user_id>/settings')
@app.route('/user/<int:user_id>/settings.html')
async def user_settings(user_id):
    launge = "ru"

    async with UserHandler() as handler:
        editable = handler.access_to_mod()
        editable['my'] = handler.profile and user_id==handler.profile.get('id', -1)

        if not editable['any']:
            return handler.finish(handler.render("error.html", error='Вы не имеете прав редактировать этот профиль!', error_title='Отказано в доступе!')), 403

        info_profile_code, info_profile = await handler.fetch(
            f"/profile/info/{user_id}?general=true"+("&rights=true&private=true" if editable["admin"] or editable['my'] else "")
        )

        if info_profile_code != 200:
            return handler.finish(handler.render(
                "error.html",
                error=info_profile,
                error_title=f'Ошибка ({info_profile_code})')
            ), info_profile_code

        if info_profile["general"]["mute"]:
            input_date = datetime.datetime.fromisoformat(info_profile["general"]["mute"])
            info_profile["general"]["mute_js"] = info_profile["general"]["mute"]
            info_profile["general"]["mute"] = dates.format_datetime(input_date, format="short", locale=launge)

        if info_profile['general']['about'] is None or len(info_profile['general']['about']) <= 0:
            info_profile['general']['about_enable'] = False
            info_profile['general']['about'] = f"Социальная сеть для модов! Зарегистрируйся и добавь {info_profile['general']['username']} в друзья! 🤪"
        else:
            info_profile['general']['about_enable'] = True

        input_date = datetime.datetime.fromisoformat(info_profile['general']['registration_date'])
        info_profile['general']['registration_date_js'] = input_date.strftime(js_datetime)
        info_profile['general']['registration_date'] = dates.format_date(input_date, locale=launge)

        if info_profile['general']['avatar_url'] is None or len(info_profile['general']['avatar_url']) <= 0:
            info_profile['general']['avatar_url'] = "/assets/images/no-avatar.jpg"
        elif info_profile['general']['avatar_url'].startswith("local"):
            info_profile['general']['avatar_url'] = f"/api/manager/profile/avatar/{user_id}"

        info_profile['delete_user'] = info_profile['general']['username'] is None

        return handler.finish(handler.render("user-settings.html", user_data=info_profile, user_access=editable))

@app.route('/user/<int:user_id>/mods')
@app.route('/user/<int:user_id>/mods.html')
async def user_mods(user_id):
    return await tool.error_page(
        error_title='Зайдите попозже...',
        error_body=f'Эта страница вскоре будет доступна! ({user_id})'
    )


@app.route('/api/login-popup')
async def login_popup():
    return render_template("login-popup.html", link=request.args.get('f'), russia=not bool(request.cookies.get('fromRussia')))


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
    file_path = "website/sitemaps/"
    if "www." in request.url_root:
        file_path += "www."
    file_path += "sitemap.xml"

    now = datetime.datetime.now()

    if Path(file_path).exists():
        created_time = datetime.datetime.fromtimestamp(os.path.getmtime(file_path))
        diff = now - created_time

        if diff > datetime.timedelta(hours=5):
            print("sitemap.xml regenerate")
            page = await sitemapper.generate(file_path)
    else:
        print("sitemap.xml generate")
        page = await sitemapper.generate(file_path)

    if "page" not in locals():
        print("sitemap.xml relevant")
        with open(file_path, "r") as file:
            page = file.read()

    page_ret = make_response(page)
    page_ret.headers["Content-Type"] = "application/rss+xml"
    page_ret.mimetype = "application/xml"

    return page_ret


if __name__ == '__main__':
    #app.run()
    from waitress import serve
    serve(app, host="0.0.0.0", port=6660, threads=100)