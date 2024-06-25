from flask import request, make_response
import aiohttp
import json
import asyncio
import re


MANAGER_ADDRESS = "https://new.openworkshop.su/api/manager"




async def get_user_req(avatar_url:bool = True):
    # Получаем куку пользователя
    access_cookie = request.cookies.get('accessToken')
    refresh_cookie = request.cookies.get('refreshToken')
    user_id = request.cookies.get('userID')

    if not user_id or (not refresh_cookie and not access_cookie): return False

    url = MANAGER_ADDRESS + f"/profile/info/{user_id}?general=true&rights=true&private=false"
    headers = {
        'Cookie': ''
    }
    if access_cookie: headers['Cookie']+=f'accessToken={access_cookie}; '
    if refresh_cookie: headers['Cookie']+=f'refreshToken={refresh_cookie}; '
    headers['Cookie'] = headers['Cookie'].removesuffix("; ")


    async with aiohttp.ClientSession() as session:
        async with session.get(url, headers=headers) as response:
            new_access_cookie = response.cookies.get('accessToken')
            if new_access_cookie: new_access_cookie = [new_access_cookie.value, dict(new_access_cookie.items())]

            new_access_js = response.cookies.get('accessJS')
            if new_access_js: new_access_js = [new_access_js.value, dict(new_access_js.items())]

            new_refresh_cookie = response.cookies.get('refreshToken')
            if new_refresh_cookie: new_refresh_cookie = [new_refresh_cookie.value, dict(new_refresh_cookie.items())]

            new_login_js = response.cookies.get('loginJS')
            if new_login_js: new_login_js = [new_login_js.value, dict(new_login_js.items())]

            new_user_id = response.cookies.get('userID')
            if new_user_id: new_user_id = [new_user_id.value, dict(new_user_id.items())]

            user_response = json.loads(await response.text())
            status_code = response.status

    # Доп. обработки
    if type(user_response) is dict:
        if avatar_url:
            if len(user_response['general']['avatar_url']) <= 0:
                user_response['general']['avatar_url'] = "/assets/images/no-avatar.jpg"
            elif user_response['general']['avatar_url'] == "local":
                user_response['general']['avatar_url'] = f"/api/accounts/profile/avatar/{user_id}"

    return {"id": user_id, "id_cookie": new_user_id, "refresh": new_refresh_cookie, "login_js": new_login_js, "access": new_access_cookie, "access_js": new_access_js, "result": user_response, "status_code": status_code}

async def get_tokens_cookies(last_req:dict = None):
    # Получаем куку пользователя
    access_cookie = last_req["access"][0] if last_req and last_req["access"] else request.cookies.get('accessToken', None)
    refresh_cookie = last_req["refresh"][0] if last_req and last_req["refresh"] else request.cookies.get('refreshToken', None)

    # Возвращаем
    return access_cookie, refresh_cookie

async def get_accounts(url:str, last_req:dict = None):
    # Получаем куку пользователя
    access_cookie = last_req["access"][0] if last_req and last_req["access"] else request.cookies.get('accessToken')
    refresh_cookie = last_req["refresh"][0] if last_req and last_req["refresh"] else request.cookies.get('refreshToken')

    url = MANAGER_ADDRESS+url
    headers = {
        'Cookie': ''
    }
    if access_cookie: headers['Cookie'] += f'accessToken={access_cookie}; '
    if refresh_cookie: headers['Cookie'] += f'refreshToken={refresh_cookie}; '
    headers['Cookie'] = headers['Cookie'].removesuffix("; ")

    print(headers['Cookie'])

    async with aiohttp.ClientSession() as session:
        async with session.get(url, headers=headers) as response:
            new_access_cookie = response.cookies.get('accessToken')
            if new_access_cookie: new_access_cookie = [new_access_cookie.value, dict(new_access_cookie.items())]

            new_access_js = response.cookies.get('accessJS')
            if new_access_js: new_access_js = [new_access_js.value, dict(new_access_js.items())]

            new_refresh_cookie = response.cookies.get('refreshToken')
            if new_refresh_cookie: new_refresh_cookie = [new_refresh_cookie.value, dict(new_refresh_cookie.items())]

            new_login_js = response.cookies.get('loginJS')
            if new_login_js: new_login_js = [new_login_js.value, dict(new_login_js.items())]

            new_user_id = response.cookies.get('userID')
            if new_user_id: new_user_id = [new_user_id.value, dict(new_user_id.items())]

            user_response = json.loads(await response.text())
            status_code = response.status

    print(user_response)

    return {"id_cookie": new_user_id, "refresh": new_refresh_cookie, "login_js": new_login_js,
            "access": new_access_cookie, "access_js": new_access_js, "result": user_response,
            "status_code": status_code}


async def check_access_user(user_req:dict, user_id:int):
    access = {
        "avatar": True,#False,
        "username": True,
        "about": False,
        "mute": True,#False,
        "grade": True,
        "my": False, # Мой ли это профиль
        "admin": False, # Является ли спрашивающий админом
        "any": True#False # Включает в себя лиш поля доступа к редактированию (т.е. не включает my и admin)
    }
    user_p = False

    if False and user_req and type(user_req["result"]) is dict:
        user_p = user_req["result"]["general"]
        rights = user_req["result"]["rights"]
        is_admin = rights["admin"]
        access["admin"] = is_admin
        in_mute = user_req["result"]["general"]["mute"]

        access["grade"] = is_admin

        if int(user_req["id"]) == user_id:  # Пользователь просит свой профиль
            access["my"] = True
            if not in_mute or is_admin:
                access["avatar"] = rights["change_avatar"] or is_admin
                access["username"] = rights["change_username"] or is_admin
                access["about"] = rights["change_about"] or is_admin
        else:  # Пользователь просит чужой профиль
            access["avatar"] = is_admin
            access["username"] = is_admin
            access["about"] = is_admin
            access["mute"] = (rights["mute_users"] and not in_mute) or is_admin

        access["any"] = access["avatar"] or access["username"] or access["about"] or access["mute"] or access["grade"]

    return user_p, access

async def check_access_mod(user_req:dict, authors:list = []):
    access = {
        "add": False,
        "edit": False,
        "delete": False,
        "admin": False, # Является ли спрашивающий админом
        "is_my_mod": 2,
        "in_mute": False
    }

    if user_req and type(user_req["result"]) is dict:
        access["in_mute"] = user_req["result"]["general"]["mute"]
        access["admin"] = user_req["result"]["rights"]["admin"]

        for holder in authors:
            if int(user_req['id']) == int(holder['user']):
                access["is_my_mod"] = 0 if holder['owner'] else 1
                break
        else:
            access["is_my_mod"] = 2

        print(access["is_my_mod"])

        if access["admin"]:
            access["add"] = True
            access["edit"] = True
            access["delete"] = True
        elif not access["in_mute"]:
            access["add"] = user_req["result"]["rights"]["publish_mods"]
            if access["is_my_mod"] < 2: # Мой мод
                access["edit"] = user_req["result"]["rights"]["change_self_mods"]
                access["delete"] = user_req["result"]["rights"]["delete_self_mods"] and access["is_my_mod"] == 0
            else: # Чужой мод
                access["edit"] = user_req["result"]["rights"]["change_mods"]
                access["delete"] = user_req["result"]["rights"]["delete_mods"]

    for i in access.keys():
        access[i] = True

    print(access)

    return access


async def standart_response(user_req:dict, page:str):
    # Создаём ответ
    resp = make_response(page)

    # Устанавливаем  куки
    if user_req:
        if user_req["status_code"] == 403:
            for key_c in ['accessToken', 'refreshToken', 'loginJS', 'accessJS', 'userID']:
                resp.set_cookie(key_c, '', expires=0, secure=True, samesite="lax")

        a = user_req["access"]
        if a: resp.set_cookie(key='accessToken', value=str(a[0]), max_age=int(a[1].get("max-age", 2100)),
                              secure=bool(a[1].get("secure", True)), httponly=bool(a[1].get("httponly", True)),
                              samesite=str(a[1].get("samesite", "lax")))

        a = user_req["refresh"]
        if a: resp.set_cookie(key='refreshToken', value=str(a[0]), max_age=int(a[1].get("max-age", 5184000)),
                              secure=bool(a[1].get("secure", True)), httponly=bool(a[1].get("httponly", True)),
                              samesite=str(a[1].get("samesite", "lax")))

        a = user_req["login_js"]
        if a: resp.set_cookie(key='loginJS', value=str(a[0]), max_age=int(a[1].get("max-age", 2100)),
                              secure=bool(a[1].get("secure", True)), httponly=bool(a[1].get("httponly", True)),
                              samesite=str(a[1].get("samesite", "lax")))

        a = user_req["access_js"]
        if a: resp.set_cookie(key='accessJS', value=str(a[0]), max_age=int(a[1].get("max-age", 5184000)),
                              secure=bool(a[1].get("secure", True)), httponly=bool(a[1].get("httponly", True)),
                              samesite=str(a[1].get("samesite", "lax")))

        a = user_req["id_cookie"]
        if a: resp.set_cookie(key='userID', max_age=int(a[1].get("max-age", 5184000)), value=str(a[0]),
                              secure=bool(a[1].get("secure", True)), samesite=str(a[1].get("samesite", "lax")))

    return resp


async def size_format(size:int) -> str:
    def size_set(bites:int = 1, digit:str = "") -> str:
        return f"{str(round(size/bites, 1)).removesuffix('.0')} {digit}B"

    if size > 1000000000:
        text_size = size_set(1073741824, "G")
    elif size > 1000000:
        text_size = size_set(1048576, "M")
    elif size > 1000:
        text_size = size_set(1024, "K")
    else:
        text_size = size_set()

    return text_size

async def get_many_mods(mods:list[int]) -> dict:
    mods = list(map(int, mods))

    urls = [
        MANAGER_ADDRESS + "/list/mods/?page_size=30&page=0&allowed_ids=" + str(mods) + "&general=true",
        MANAGER_ADDRESS + '/list/resources_mods/' + str(mods) + '?page_size=30&page=0&types_resources=["logo"]'
    ]
    print(urls)
    tasks = []
    for url in urls:
        tasks.append(fetch(url))
    result = await asyncio.gather(*tasks)

    depen = {}
    for i in mods:
        depen[int(i)] = {"img": "", "name": str(i), "id": i}
    print(result)
    for mod in result[0]["results"]:
        depen[mod["id"]]["name"] = mod["name"]
    if type(result[1]) is dict:
        for img in result[1]["results"]:
            depen[img["owner_id"]]["img"] = img["url"]

    return depen

async def fetch(url, access_cookie = None, refresh_cookie = None, return_code:bool = False):
    headers = {
        'Cookie': ''
    }
    if access_cookie: headers['Cookie'] += f'accessToken={access_cookie}; '
    if refresh_cookie: headers['Cookie'] += f'refreshToken={refresh_cookie}; '
    headers['Cookie'] = headers['Cookie'].removesuffix("; ")

    async with aiohttp.ClientSession() as session:
        response = await session.get(url=url, timeout=aiohttp.ClientTimeout(total=5), headers=headers)
        text = await response.text()
        if return_code: return [json.loads(text), response.status]
        else: return json.loads(text)


async def remove_words_short(text, words):
    for word in words:
        text = text.replace("["+word+"]", '')
        text = text.replace("[/"+word+"]", '')

    text = re.sub(r"\[url=.*?\]", "", text)
    text = re.sub(r"\[img\].*?\[/img\]", "", text)

    text = re.sub(r'(\n\s*)+\n+', '\n\n', text)
    return text
async def remove_words_long(text):
    return text
