from tool import get_user_req, standart_response, get_tokens_cookies, check_access_mod, MANAGER_ADDRESS
from flask import Flask, render_template, send_from_directory, request, make_response, redirect
from sqlalchemy.orm import sessionmaker
from sqlalchemy import insert, delete
from pathlib import Path
from babel import dates
import datetime
import asyncio
from tool import fetch
import tool
import time
import os
import sitemap_connector as sitemapper


app = Flask(__name__, template_folder='website')

SHORT_WORDS = [
    "b", "list", "h1", "h2", "h3", "h4", "h5", "h6", "*", "u", "url"
]

MONTHS_NAMES = {
    1: "января",
    2: "февраля",
    3: "марта",
    4: "апреля",
    5: "мая",
    6: "июня",
    7: "июля",
    8: "августа",
    9: "сентября",
    10: "октября",
    11: "ноября",
    12: "декабря",
}

js_datetime = "%Y-%m-%d %H:%M:%S"


@app.route('/')
@app.route('/index')
async def index():
    # Определяем права
    user_req = await get_user_req()

    user_p = False
    if user_req and type(user_req["result"]) is dict:
        user_p = user_req["result"]["general"]

    # Пробуем отрендерить страницу
    try:
        page_html = render_template("index.html", catalog=True, user_profile=user_p)
    except:
        page_html = ""

    # Возвращаем ответ
    return await standart_response(user_req=user_req, page=page_html)

@app.route('/about')
@app.route('/about.html')
async def about():
    # Определяем права
    user_req = await get_user_req()

    user_p = False
    if user_req and type(user_req["result"]) is dict:
        user_p = user_req["result"]["general"]

    # Пробуем отрендерить страницу
    try:
        page_html = render_template("about.html", user_profile=user_p)
    except:
        page_html = ""

    # Возвращаем ответ
    return await standart_response(user_req=user_req, page=page_html)

@app.route('/apis')
@app.route('/apis.html')
async def apis():
    # Определяем права
    user_req = await get_user_req()

    user_p = False
    if user_req and type(user_req["result"]) is dict:
        user_p = user_req["result"]["general"]

    # Пробуем отрендерить страницу
    try:
        page_html = render_template("apis.html", user_profile=user_p)
    except:
        page_html = ""

    # Возвращаем ответ
    return await standart_response(user_req=user_req, page=page_html)

@app.route('/legal/cookies')
@app.route('/legal/cookies.html')
async def legal_cookies():
    # Определяем права
    user_req = await get_user_req()

    user_p = False
    if user_req and type(user_req["result"]) is dict:
        user_p = user_req["result"]["general"]

    # Пробуем отрендерить страницу
    try:
        page_html = render_template("legal/cookies.html", user_profile=user_p)
    except:
        page_html = ""

    # Возвращаем ответ
    return await standart_response(user_req=user_req, page=page_html)

@app.route('/legal/license')
@app.route('/legal/license.html')
async def legal_license():
    # Определяем права
    user_req = await get_user_req()

    user_p = False
    if user_req and type(user_req["result"]) is dict:
        user_p = user_req["result"]["general"]

    # Пробуем отрендерить страницу
    try:
        page_html = render_template("legal/license.html", user_profile=user_p)
    except:
        page_html = ""

    # Возвращаем ответ
    return await standart_response(user_req=user_req, page=page_html)

@app.route('/legal/site-rules')
@app.route('/legal/site-rules.html')
async def site_rules():
    # Определяем права
    user_req = await get_user_req()

    user_p = False
    if user_req and type(user_req["result"]) is dict:
        user_p = user_req["result"]["general"]

    # Пробуем отрендерить страницу
    try:
        page_html = render_template("legal/site-rules.html", user_profile=user_p)
    except:
        page_html = ""

    # Возвращаем ответ
    return await standart_response(user_req=user_req, page=page_html)

@app.route('/legal/copyright')
@app.route('/legal/copyright.html')
async def copyright():
    # Определяем права
    user_req = await get_user_req()

    user_p = False
    if user_req and type(user_req["result"]) is dict:
        user_p = user_req["result"]["general"]

    # Пробуем отрендерить страницу
    try:
        page_html = render_template("legal/copyright.html", user_profile=user_p)
    except:
        page_html = ""

    # Возвращаем ответ
    return await standart_response(user_req=user_req, page=page_html)

@app.route('/legal/privacy-policy')
@app.route('/legal/privacy-policy.html')
async def legal_privacy_policy():
    # Определяем права
    user_req = await get_user_req()

    user_p = False
    if user_req and type(user_req["result"]) is dict:
        user_p = user_req["result"]["general"]

    # Пробуем отрендерить страницу
    try:
        page_html = render_template("legal/privacy-policy.html", user_profile=user_p)
    except:
        page_html = ""

    # Возвращаем ответ
    return await standart_response(user_req=user_req, page=page_html)

@app.route('/mod/<int:mod_id>')
@app.route('/mod/<int:mod_id>.html')
async def mod(mod_id):
    global SHORT_WORDS
    global MONTHS_NAMES
    launge = "ru"


    ## TODO ЗАТЫЧКА!! ПОТОМ УБРАТЬ!!! ##

    if mod_id > 60000:
        tor = await fetch(f'https://openworkshop.su/api/manager/list/mods/?primary_sources=["steam"]&allowed_sources_ids=[{mod_id}]')
        if len(tor['results']) > 0:
            return redirect("/mod/"+str(tor['results'][0]['id']), code=308)

    ## / ЗАТЫЧКА!! ПОТОМ УБРАТЬ!!! ##


    # Определяем права
    user_req = await get_user_req()

    access_cookie, refresh_cookie = await get_tokens_cookies(last_req=user_req)

    urls = [
        MANAGER_ADDRESS+"/info/mod/"+str(mod_id)+"?dependencies=true&description=true&short_description=true&dates=true&general=true&game=true&authors=true",
        MANAGER_ADDRESS+"/list/resources/mods/["+str(mod_id)+"]?page_size=30",
        MANAGER_ADDRESS+f"/list/tags/mods/[{mod_id}]"
    ]
    print(urls)
    tasks = []
    for url in urls:
        tasks.append(fetch(url, access_cookie, refresh_cookie, True))
    info = await asyncio.gather(*tasks)

    user_p = False
    if user_req and type(user_req["result"]) is dict:
        user_p = user_req["result"]["general"]

    if type(info[0][0]) is str:
        return await standart_response(user_req=user_req, page=render_template("error.html", user_profile=user_p, error=info[0][0], error_title='Ошибка')), info[0][1]
    else:
        info[0] = info[0][0]
        info[1] = info[1][0]
        info[2] = info[2][0][str(mod_id)]

    info[0]['result']['size'] = await tool.size_format(info[0]['result']['size'])

    is_mod = {
        "date_creation": info[0]['result'].get('date_creation', ""),
        "date_update_file": info[0]['result'].get("date_update_file", ""),
        "logo": ""
    }

    todelpop = None
    for img_id in range(len(info[1]["results"])):
        img = info[1]["results"][img_id]
        if img is not None and img["type"] == "logo":
            is_mod["logo"] = img["url"]
            if len(info[1]["results"]) > 1:
                todelpop = img_id
    if todelpop: info[1]["results"].pop(todelpop)

    info[0]["no_many_screenshots"] = len(info[1]["results"]) <= 1

    input_date = datetime.datetime.fromisoformat(info[0]['result']['date_creation'])
    info[0]['result']['date_creation_js'] = input_date.strftime(js_datetime)
    info[0]['result']['date_creation'] = dates.format_date(input_date, locale=launge)

    input_date_update = datetime.datetime.fromisoformat(info[0]['result']['date_update_file'])
    info[0]['result']['date_update_file_js'] = input_date_update.strftime(js_datetime)
    info[0]['result']['date_update_file'] = dates.format_date(input_date_update, locale=launge)

    info[0]['result']['id'] = mod_id

    info[0]['result']['short_description'] = await tool.remove_words_short(text=info[0]['result']['short_description'], words=SHORT_WORDS)
    info[0]['result']['description'] = await tool.remove_words_long(text=info[0]['result']['description'])

    info.append({})
    if info[0]['dependencies_count'] > 0:
        d_urls = [
            MANAGER_ADDRESS+f'/list/mods/?page_size=50&allowed_ids={info[0]["dependencies"]}',
            MANAGER_ADDRESS+f'/list/resources/mods/{info[0]["dependencies"]}?page_size=30'
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


    authors_result = []
    if len(info[0]['authors']) > 0:
        authors_tasks = []
        for author in info[0]['authors']:
            authors_tasks.append(fetch(f'{MANAGER_ADDRESS}/profile/info/{author}', access_cookie, refresh_cookie))
        authors_info = await asyncio.gather(*authors_tasks)

        for i in range(len(authors_info)):
            uid = authors_info[i]['general']['id']

            authors_info[i]['general']['owner'] = info[0]['authors'][str(uid)]['owner']
            authors_result.append(authors_info[i]['general'])


    right_edit_mod = await check_access_mod(user_req=user_req, authors=info[0]["authors"])

    # Пробуем отрендерить страницу
    page_html = render_template("mod.html", data=info, is_mod_data=is_mod, user_profile=user_p, right_edit=right_edit_mod, authors=authors_result)

    # Возвращаем ответ
    return await standart_response(user_req=user_req, page=page_html)


@app.route('/mod/<int:mod_id>/edit')
@app.route('/mod/<int:mod_id>/edit.html')
async def edit_mod(mod_id):
    global SHORT_WORDS
    global MONTHS_NAMES
    launge = "ru"

    # Определяем права
    user_req = await get_user_req()

    user_p = False
    if user_req and type(user_req["result"]) is dict:
        user_p = user_req["result"]["general"]

    access_cookie, refresh_cookie = await get_tokens_cookies(last_req=user_req)

    urls = [
        MANAGER_ADDRESS + f"/info/mod/{mod_id}?dependencies=true&description=true&short_description=true&dates=true&general=true&game=true&authors=true",
        MANAGER_ADDRESS + "/list/resources_mods/%5B" + str(mod_id) + "%5D?page_size=30&page=0",
        MANAGER_ADDRESS + f"/list/tags/mods/%5B{mod_id}%5D"
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
            return await standart_response(user_req=user_req, page=await error_page(
                error_title='В муте',
                error_body='Вы во временном муте',
                error_code=403
            )), 403
        else:
            return await standart_response(user_req=user_req, page=await error_page(
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
            MANAGER_ADDRESS+f'/list/mods/?page_size=50&allowed_ids={info[0]["dependencies"]}',
            MANAGER_ADDRESS+f'/list/resources/mods/{info[0]["dependencies"]}?page_size=30'
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
    #try:
    page_html = render_template("mod-edit.html", data=info, is_mod_data=is_mod, user_profile=user_p, right_edit=right_edit_mod)
    #except:
    #    page_html = ""

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
            return await standart_response(user_req=user_req, page=await error_page(
                error_title='В муте',
                error_body='Вы во временном муте',
                error_code=403
            )), 403
        else:
            return await standart_response(user_req=user_req, page=await error_page(
                error_title='Отказано в доступе',
                error_body='Вы не можете публиковать моды',
                error_code=403
            )), 403

    # Пробуем отрендерить страницу
    #try:
    page_html = render_template("mod-add.html", user_profile=user_p)
    #except:
    #    page_html = ""


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
        MANAGER_ADDRESS + f"/profile/info/{user_id}",
        MANAGER_ADDRESS + f"/list/mods/?user={user_id}&page_size=4"
    ]
    tasks = []
    for url in urls:
        tasks.append(fetch(url, access_cookie, refresh_cookie, True))
    info = await asyncio.gather(*tasks)

    if info[0][1] != 200:
        return await standart_response(user_req=user_req, page=await error_page(
            error_title=f'Ошибка ({info[0][1]})',
            error_body=info[0][0],
            error_code=info[0][1]
        )), info[0][1]
    else:
        info[0] = info[0][0]
        info[1] = info[1][0]

    info[0]['delete_user'] = info[0]['general']['username'] is None

    if info[0]['delete_user']:
        return await standart_response(user_req=user_req, page=await error_page(
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
        info[0]['general']['avatar_url'] = f"/api/accounts/profile/avatar/{user_id}"

    print(info[1])
    if len(info[1]['results']) > 0:
        resources_mods = await fetch(f'https://openworkshop.su/api/manager/list/resources/mods/{[i["id"] for i in info[1]["results"]]}?page_size=10&page=0&types_resources=["logo"]')

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
        return await error_page(
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
        return await standart_response(user_req=user_req, page=await error_page(
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
    return await error_page(
        error_title='Зайдите попозже...',
        error_body=f'Эта страница вскоре будет доступна! ({user_id})'
    )


@app.route('/api/login-popup/')
async def login_popup():
    return render_template("login-popup.html", link=request.args.get('f'), russia=not bool(request.cookies.get('fromRussia')))


@app.route('/<path:filename>')
async def serve_static(filename):
    if filename.startswith("/html-partials/") or filename.startswith("html-partials/"):
        return await page_not_found(404)

    if filename.endswith(".html"):
        try:
            return render_template(filename)
        except:
            return await page_not_found(404)

    return send_from_directory("website", filename)

@app.errorhandler(404)
async def page_not_found(_error):
    return await error_page(
        error_title='Not Found (404)',
        error_body='404 страница не найдена',
        error_code=404
    )

@app.errorhandler(500)
async def internal_server_error(_error):
    return await error_page(
        error_title='Internal Server Error (500)',
        error_body='На сервере произошла внутренняя ошибка, и он не смог выполнить ваш запрос. Либо сервер перегружен, либо в приложении ошибка.',
        error_code=500
    )


async def error_page(error_title:str, error_body:str, error_code:int = 200):
    try:
        # Определяем права
        user_req = await get_user_req()

        user_p = False
        if user_req and type(user_req["result"]) is dict:
            user_p = user_req["result"]["general"]

        # Пробуем отрендерить страницу
        page_html = render_template("error.html", user_profile=user_p, error=error_body, error_title=error_title)

        # Возвращаем ответ
        return await standart_response(user_req=user_req, page=page_html), error_code
    except:
        return render_template("error.html", error=error_body, error_title=error_title), error_code


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
            page = await sitemap_generator(file_path)
    else:
        print("sitemap.xml generate")
        page = await sitemap_generator(file_path)

    if "page" not in locals():
        print("sitemap.xml relevant")
        with open(file_path, "r") as file:
            page = file.read()

    page_ret = make_response(page)
    page_ret.headers["Content-Type"] = "application/rss+xml"
    page_ret.mimetype = "application/xml"

    return page_ret
async def sitemap_generator(file_path:str) -> str:
    """
    Asynchronously generates a sitemap based on the provided file path.

    Parameters:
    file_path (str): The path to the file to write the sitemap.

    Returns:
    str: The generated sitemap page.
    """
    Path(file_path).parent.mkdir(parents=True, exist_ok=True)
    with open(file_path, "w", encoding="utf-8") as file:
        start = time.time()

        # Создание сессии
        session = sessionmaker(bind=sitemapper.engine)()

        # Выполнение запроса
        query = session.query(sitemapper.Mod).filter(sitemapper.Mod.condition == 0, sitemapper.Mod.public == 0)
        result = [obj.__dict__ for obj in query.limit(49000).all()]

        session.close()

        print("SITEMAP RENDER START FROM: " + str(time.time() - start))

        start = time.time()
        page = render_template("html-partials/standart_sitemap.xml", data=result, www="www." in file_path)

        file.write(page)
        print("SITEMAP RENDER FINISH: " + str(time.time() - start))
        return page


if __name__ == '__main__':
    #app.run()
    from waitress import serve
    serve(app, host="0.0.0.0", port=6060, threads=100)