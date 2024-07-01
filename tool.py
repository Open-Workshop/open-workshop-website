import re
from user_manager import UserHandler
from flask import render_template


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


async def error_page(error_title:str, error_body:str, error_code:int = 200):
    try:
        async with UserHandler() as handler:
            page_html = handler.render("error.html", error=error_body, error_title=error_title)
            return handler.finish(page_html), error_code
    except:
        return render_template("error.html", error=error_body, error_title=error_title), error_code


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
