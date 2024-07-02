from tool import check_access_mod
import aiohttp
from flask import Flask, render_template, send_from_directory, request, make_response, redirect
from pathlib import Path
from babel import dates
import datetime
import asyncio
import tool
import os
import sitemapper as sitemapper
import ow_config as config
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
async def mod(mod_id):
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
            return await handler.finish(handler.render("error.html", error=info[0], error_title='Ошибка')), info_code
        else:
            # Вторичная (косметическая на самом деле) распаковка
            tags = tags[str(mod_id)]

        info['result']['size'] = await tool.size_format(info['result']['size']) # Преобразовываем кол-во байт в читаемые человеком форматы

        for image in resources["results"]: # Ищем логотип мода
            if image and image["type"] == "logo":
                info["result"]["logo"] = image["url"] # Фиксируем, что нашли его
                if len(resources["results"]) > 1: # Если по мимо него есть скриншоты - выбиваем из окна скриншотов (по принципу либо это(лого), либо того(скриншоты))
                    resources["results"].remove(image)
                break

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
                f'/list/mods/?page_size=50&allowed_ids={info[0]["dependencies"]}',
                f'/list/resources/mods/{info[0]["dependencies"]}?page_size=30'
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


        authors = []
        if len(info['authors']) > 0:
            authors_info = await asyncio.gather([handler.fetch(f'/profile/info/{author}') for author in info['authors']])

            for status_code, author in authors_info:
                author_to_add = author['general']

                author_to_add['owner'] = info['authors'][str(author_to_add['id'])]['owner']
                authors.append(author_to_add)


    # TODO дописать логику /mod/{mod_id}

    right_edit_mod = await check_access_mod(user_req=user_req, authors=info[0]["authors"])

    # Пробуем отрендерить страницу
    page_html = render_template("mod.html", data=info, is_mod_data=is_mod, user_profile=user_p, right_edit=right_edit_mod, authors=authors_result)

    # Возвращаем ответ
    return await standart_response(user_req=user_req, page=page_html)


@app.route('/mod/<int:mod_id>/edit')
@app.route('/mod/<int:mod_id>/edit.html')
async def edit_mod(mod_id):
    global SHORT_WORDS
    launge = "ru"

    # Определяем права
    user_req = await get_user_req()

    user_p = False
    if user_req and type(user_req["result"]) is dict:
        user_p = user_req["result"]["general"]

    access_cookie, refresh_cookie = await get_tokens_cookies(last_req=user_req)

    urls = [
        config.MANAGER_ADDRESS + f"/info/mod/{mod_id}?dependencies=true&description=true&short_description=true&dates=true&general=true&game=true&authors=true",
        config.MANAGER_ADDRESS + "/list/resources_mods/%5B" + str(mod_id) + "%5D?page_size=30&page=0",
        config.MANAGER_ADDRESS + f"/list/tags/mods/%5B{mod_id}%5D"
    ]
    tasks = []
    for url in urls:
        tasks.append(fetch(url, access_cookie, refresh_cookie, True))
    info = await asyncio.gather(*tasks)

    if type(info[0][0]) is str:
        return await standart_response(user_req=user_req, page=render_template("error.html", user_profile=user_p, error=info[0][0], error_title='Ошибка')), info[0][1]
    else:
        info[0] = info[0][0]
        info[1] = info[1][0]
        info[2] = info[2][0]

    right_edit_mod = await check_access_mod(user_req=user_req, authors=info[0]["authors"])

    if not right_edit_mod['edit']:
        if right_edit_mod['in_mute']:
            return await standart_response(user_req=user_req, page=await tool.error_page(
                error_title='В муте',
                error_body='Вы во временном муте',
                error_code=403
            )), 403
        else:
            return await standart_response(user_req=user_req, page=await tool.error_page(
                error_title='Отказано в доступе',
                error_body='Вы не имеете права редактировать чужие моды' if right_edit_mod['is_my_mod'] == 2 else 'Вы не имеете права редактировать свои моды',
                error_code=403
            )), 403

    info[0]['result']['size'] = await tool.size_format(info[0]['result']['size'])

    is_mod = {
        "date_creation": info[0]['result'].get('date_creation', ""),
        "date_update_file": info[0]['result'].get("date_update_file", ""),
        "logo": ""
    }

    input_date = datetime.datetime.fromisoformat(info[0]['result']['date_creation'])
    info[0]['result']['date_creation_js'] = input_date.strftime(js_datetime)
    info[0]['result']['date_creation'] = dates.format_date(input_date, locale=launge)

    input_date_update = datetime.datetime.fromisoformat(info[0]['result']['date_update_file'])
    info[0]['result']['date_update_file_js'] = input_date_update.strftime(js_datetime)
    info[0]['result']['date_update_file'] = dates.format_date(input_date_update, locale=launge)

    info[0]['result']['id'] = mod_id

    info[0]['result']['short_description'] = await tool.remove_words_short(text=info[0]['result']['short_description'],
                                                                           words=SHORT_WORDS)
    info[0]['result']['description'] = await tool.remove_words_long(text=info[0]['result']['description'])

    info.append({})
    if info[0]['dependencies_count'] > 0:
        d_urls = [
            config.MANAGER_ADDRESS+f'/list/mods/?page_size=50&allowed_ids={info[0]["dependencies"]}',
            config.MANAGER_ADDRESS+f'/list/resources/mods/{info[0]["dependencies"]}?page_size=30'
        ]
        print(d_urls)
        tasks = []
        for url in d_urls:
            tasks.append(fetch(url, access_cookie, refresh_cookie))
        d_info = await asyncio.gather(*tasks)

        print(d_info)

        for inf in d_info[0]['results']:
            info[3][inf['id']] = {
                'id': inf['id'],
                'img': '',
                'name': inf['name']
            }

        for inf in d_info[1]['results']:
            info[3][inf['owner_id']]['img'] = inf['url']

    try:
        info[2] = list(info[2].values())[0]
    except:
        info[2] = []

    # Пробуем отрендерить страницу
    page_html = render_template("mod-edit.html", data=info, is_mod_data=is_mod, user_profile=user_p, right_edit=right_edit_mod)

    # Возвращаем ответ
    return await standart_response(user_req=user_req, page=page_html)


@app.route('/mod/add')
@app.route('/mod/add.html')
async def add_mod():
    # Определяем права
    user_req = await get_user_req()

    user_p = False
    if user_req and type(user_req["result"]) is dict:
        user_p = user_req["result"]["general"]

    right_edit_mod = await check_access_mod(user_req=user_req)

    if False and not right_edit_mod['add']:
        if right_edit_mod['in_mute']:
            return await standart_response(user_req=user_req, page=await tool.error_page(
                error_title='В муте',
                error_body='Вы во временном муте',
                error_code=403
            )), 403
        else:
            return await standart_response(user_req=user_req, page=await tool.error_page(
                error_title='Отказано в доступе',
                error_body='Вы не можете публиковать моды',
                error_code=403
            )), 403

    # Пробуем отрендерить страницу
    page_html = render_template("mod-add.html", user_profile=user_p)

    # Возвращаем ответ
    return await standart_response(user_req=user_req, page=page_html)


@app.route('/user/<int:user_id>')
@app.route('/user/<int:user_id>.html')
async def user(user_id):
    launge = "ru"

    # Определяем права
    user_req = await get_user_req()

    access_cookie, refresh_cookie = await get_tokens_cookies(last_req=user_req)

    urls = [
        config.MANAGER_ADDRESS + f"/profile/info/{user_id}",
        config.MANAGER_ADDRESS + f"/list/mods/?user={user_id}&page_size=4"
    ]
    tasks = []
    for url in urls:
        tasks.append(fetch(url, access_cookie, refresh_cookie, True))
    info = await asyncio.gather(*tasks)

    if info[0][1] != 200:
        return await standart_response(user_req=user_req, page=await tool.error_page(
            error_title=f'Ошибка ({info[0][1]})',
            error_body=info[0][0],
            error_code=info[0][1]
        )), info[0][1]
    else:
        info[0] = info[0][0]
        info[1] = info[1][0]

    info[0]['delete_user'] = info[0]['general']['username'] is None

    if info[0]['delete_user']:
        return await standart_response(user_req=user_req, page=await tool.error_page(
            error_title="Этот профиль удален!",
            error_body="Профиль удален",
            error_code=404
        )), 404

    # Определяем содержание страницы
    if info[0]["general"]["mute"]:
        input_date = datetime.datetime.fromisoformat(info[0]["general"]["mute"])
        info[0]["general"]["mute_js"] = info[0]["general"]["mute"]
        info[0]["general"]["mute"] = dates.format_datetime(input_date, format="short", locale=launge)

    input_date = datetime.datetime.fromisoformat(info[0]['general']['registration_date'])
    info[0]['general']['registration_date_js'] = input_date.strftime(js_datetime)
    info[0]['general']['registration_date'] = dates.format_date(input_date, locale=launge)

    if info[0]['general']['about'] is None or len(info[0]['general']['about']) <= 0:
        info[0]['general']['about_enable'] = False
        info[0]['general']['about'] = f"Социальная сеть для модов! Зарегистрируйся и добавь {info[0]['general']['username']} в друзья! 🤪"
    else:
        info[0]['general']['about_enable'] = True

    if info[0]['general']['avatar_url'] is None or len(info[0]['general']['avatar_url']) <= 0:
        info[0]['general']['avatar_url'] = "/assets/images/no-avatar.jpg"
    elif info[0]['general']['avatar_url'] == "local":
        info[0]['general']['avatar_url'] = f"/api/manager/profile/avatar/{user_id}"

    print(info[1])
    if len(info[1]['results']) > 0:
        resources_mods = await fetch(f'/api/manager/list/resources/mods/{[i["id"] for i in info[1]["results"]]}?page_size=10&page=0&types_resources=["logo"]')

        mods_data = [
            {
                'id': int(i['id']),
                'name': i['name'],
                'img': ''
            }
            for i in info[1]['results']
        ]
        print(mods_data)
        for i in resources_mods['results']:
            mods_data[i['owner_id']]['img'] = i['url']
        print(mods_data)

        user_mods = {
            'not_show_all': len(info[1]['results']) > 3,
            'mods_data': mods_data
        }
    else:
        user_mods = False

    user_p, info[0]['general']['editable'] = await tool.check_access_user(user_req=user_req, user_id=user_id)

    page_html = render_template("user.html", user_data=info[0], user_profile=user_p, user_mods=user_mods,
                                is_user_data={"id": user_id, "logo": info[0]['general']['avatar_url']})


    # Возвращаем ответ
    return await standart_response(user_req=user_req, page=page_html)

@app.route('/user/<int:user_id>/settings')
@app.route('/user/<int:user_id>/settings.html')
async def user_settings(user_id):
    launge = "ru"

    # Определяем права
    user_req = await get_user_req()

    user_p, editable = await tool.check_access_user(user_req=user_req, user_id=user_id)

    if not editable['any'] and not editable['my']:
        return await tool.error_page(
            error_title=f'Отказано в доступе!',
            error_body='Вы не имеете права редактировать этот профиль!',
            error_code=403
        )

    urls = [
        f"/profile/info/{user_id}?general=true",
    ]

    urls[0] += "&rights=true" if editable["admin"] or editable["my"] else ""
    urls[0] += "&private=true" if editable["admin"] or editable["my"] else ""

    info = await tool.get_accounts(urls[0], user_req)

    if info['status_code'] != 200:
        return await standart_response(user_req=user_req, page=await tool.error_page(
            error_title=f'Ошибка ({info["status_code"]})',
            error_body=info["result"],
            error_code=info["status_code"]
        )), info["status_code"]
    else:
        info = info["result"]

    # Определяем содержание страницы
    if info["general"]["mute"]:
        input_date = datetime.datetime.fromisoformat(info["general"]["mute"])
        info["general"]["mute_js"] = info["general"]["mute"]
        info["general"]["mute"] = dates.format_datetime(input_date, format="short", locale=launge)

    if info['general']['about'] is None or len(info['general']['about']) <= 0:
        info['general']['about_enable'] = False
        info['general']['about'] = f"Социальная сеть для модов! Зарегистрируйся и добавь {info['general']['username']} в друзья! 🤪"
    else:
        info['general']['about_enable'] = True

    input_date = datetime.datetime.fromisoformat(info['general']['registration_date'])
    info['general']['registration_date_js'] = input_date.strftime(js_datetime)
    info['general']['registration_date'] = dates.format_date(input_date, locale=launge)


    if info['general']['avatar_url'] is None or len(info['general']['avatar_url']) <= 0:
        info['general']['avatar_url'] = "/assets/images/no-avatar.jpg"
    elif info['general']['avatar_url'] == "local":
        info['general']['avatar_url'] = f"/api/accounts/profile/avatar/{user_id}"


    info['delete_user'] = info['general']['username'] is None

    print(user_p, editable)

    page_html = render_template("user-settings.html", user_data=info, user_access=editable,
                               is_user_data={"id": user_id, "logo": info['general']['avatar_url']},
                               user_profile=user_p)

    # Возвращаем ответ
    return await standart_response(user_req=user_req, page=page_html)

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
    app.run()
    #from waitress import serve
    #serve(app, host="0.0.0.0", port=6060, threads=100)