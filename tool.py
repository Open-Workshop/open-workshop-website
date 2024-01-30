from flask import request, make_response
import aiohttp
import json


SERVER_ADDRESS = "http://127.0.0.1:8000"
ACCOUNTS_ADDRESS = "http://127.0.0.1:7070/api/accounts"




async def get_user_req(avatar_url:bool = True):
    # Получаем куку пользователя
    access_cookie = request.cookies.get('accessToken')
    refresh_cookie = request.cookies.get('refreshToken')
    user_id = request.cookies.get('userID')

    if not user_id or (not refresh_cookie and not access_cookie): return False

    url = ACCOUNTS_ADDRESS + f"/profile/info/{user_id}?general=true&rights=true&private=false"
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

    url = ACCOUNTS_ADDRESS+url
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
        "avatar": False,
        "username": False,
        "about": False,
        "mute": False,
        "grade": False,
        "my": False, # Мой ли это профиль
        "admin": False, # Является ли спрашивающий админом
        "any": False # Включает в себя лиш поля доступа к редактированию (т.е. не включает my и admin)
    }
    user_p = False

    if user_req and type(user_req["result"]) is dict:
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
