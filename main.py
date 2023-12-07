from flask import Flask, render_template, send_from_directory, request, make_response
from babel import dates
from sqlalchemy.orm import sessionmaker
from sqlalchemy import insert, delete
from sql_client import Page, engine
from pathlib import Path
import datetime
import aiohttp
import asyncio
import json
import time
import re
import os

app = Flask(__name__, template_folder='website')

SERVER_ADDRESS = "http://127.0.0.1:8000"#"https://api.openworkshop.su"
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

#TODO внедрить всплывашку куков


@app.route('/')
@app.route('/index')
async def index():
    return render_template("index.html", catalog=True)

@app.route('/about')
@app.route('/about.html')
async def about():
    return render_template("about.html")

@app.route('/apis')
@app.route('/apis.html')
async def apis():
    return render_template("apis.html")

@app.route('/legal/cookies')
@app.route('/legal/cookies.html')
async def legal_cookies():
    return render_template("cookies.html")

@app.route('/legal/license')
@app.route('/legal/license.html')
async def legal_license():
    return render_template("license.html")

@app.route('/legal/privacy-policy')
@app.route('/legal/privacy-policy.html')
async def legal_privacy_policy():
    #TODO заполнить
    return render_template("privacy-policy.html")


async def fetch(url):
    async with aiohttp.ClientSession() as session:
        response = await session.get(url=url, timeout=aiohttp.ClientTimeout(total=5))
        text = await response.text()
        return json.loads(text)

@app.route('/mod/<int:mod_id>')
async def mod(mod_id):
    try:
        global SHORT_WORDS
        global MONTHS_NAMES
        launge = "ru"

        urls = [
            SERVER_ADDRESS+"/info/mod/"+str(mod_id)+"?dependencies=true&description=true&short_description=true&dates=true&general=true&game=true",
            SERVER_ADDRESS+"/list/resources_mods/%5B"+str(mod_id)+"%5D?page_size=30&page=0"
        ]
        tasks = []
        for url in urls:
            tasks.append(fetch(url))
        info = await asyncio.gather(*tasks)

        def size_set(bites:int = 0, digit:str = "") -> str:
            return f"{str(round(info[0]['result']['size']/bites, 1)).removesuffix('.0')} {digit}B"

        if info[0]['result']['size'] > 1000000000:
            info[0]['result']['size'] = size_set(1073741824, "G")
        elif info[0]['result']['size'] > 1000000:
            info[0]['result']['size'] = size_set(1048576, "M")
        elif info[0]['result']['size'] > 1000:
            info[0]['result']['size'] = size_set(1024, "K")
        else:
            info[0]['result']['size'] = size_set()

        is_mod = {
            "date_creation": info[0]['result'].get('date_creation', ""),
            "date_update": info[0]['result'].get("date_update", ""),
            "logo": ""
        }

        for img_id in range(len(info[1]["results"])):
            img = info[1]["results"][img_id]
            if img is not None and img["type"] == "logo":
                is_mod["logo"] = img["url"]
                if len(info[1]["results"]) > 1:
                    info[1]["results"].pop(img_id)
        info[0]["no_many_screenshots"] = len(info[1]["results"]) <= 1

        input_date = datetime.datetime.fromisoformat(info[0]['result']['date_creation'])
        info[0]['result']['date_creation_js'] = input_date.strftime("%Y-%m-%d")
        info[0]['result']['date_creation'] = dates.format_date(input_date, locale=launge)

        input_date_update = datetime.datetime.fromisoformat(info[0]['result']['date_update'])
        info[0]['result']['date_update_js'] = input_date_update.strftime("%Y-%m-%d")
        info[0]['result']['date_update'] = dates.format_date(input_date_update, locale=launge)

        info[0]['result']['id'] = mod_id

        info[0]['result']['short_description'] = await remove_words_short(text=info[0]['result']['short_description'], words=SHORT_WORDS)
        info[0]['result']['description'] = await remove_words_long(text=info[0]['result']['description'])

        info.append({})
        if info[0]['dependencies_count'] > 0:
            urls = [
                SERVER_ADDRESS+"/list/mods/?page_size=30&page=0&allowed_ids="+str(info[0]['dependencies'])+"&general=true",
                SERVER_ADDRESS+'/list/resources_mods/'+str(info[0]['dependencies'])+'?page_size=30&page=0&types_resources=["logo"]'
            ]
            tasks = []
            for url in urls:
                tasks.append(fetch(url))
            info[2] = await asyncio.gather(*tasks)

            depen = {}
            for i in info[0]['dependencies']:
                depen[i] = {"img": "", "name": str(i), "id": i}
            for mod in info[2][0]["results"]:
                depen[mod["id"]]["name"] = mod["name"]
            for img in info[2][1]["results"]:
                depen[img["owner_id"]]["img"] = img["url"]
            info[2] = depen

        # Создание сессии
        Session = sessionmaker(bind=engine)
        session = Session()

        # Выполнение запроса
        query = session.query(Page)
        query = query.filter_by(mod_id=mod_id)
        query = query.first()

        if query is None:
            insert_statement = insert(Page).values(
                mod_id=info[0]['result']['id'],
                game_id=info[0]['result']["game"]['id'],
                date_update=input_date_update
            )

            session.execute(insert_statement)
        else:
            session.query(Page).filter_by(mod_id=mod_id).update({'date_update': input_date_update, "game_id": info[0]['result']["game"]['id']})
        session.commit()

        session.close()

        return render_template("mod.html", data=info, is_mod_data=is_mod)
    except:
        try:
            # Создание сессии
            Session = sessionmaker(bind=engine)
            session = Session()

            # Выполнение операции DELETE
            delete_query = delete(Page).where(Page.mod_id == int(mod_id))
            session.execute(delete_query)

            # Завершение операции
            session.commit()
            session.close()
            print("PAGE DELETE: "+str(mod_id))
        except:
            print("DELETE ERROR! PAGE: "+str(mod_id))

        return await page_not_found(-1)
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
    return render_template("404.html"), 404


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
async def sitemap_generator(file_path:str):
    with open(file_path, "w") as file:
        start = time.time()

        # Создание сессии
        Session = sessionmaker(bind=engine)
        session = Session()

        # Выполнение запроса
        query = session.query(Page).limit(49000).all()
        result = [obj.__dict__ for obj in query]

        print("SITEMAP RENDER START FROM: " + str(time.time() - start))

        start = time.time()
        page = render_template("html-partials/standart_sitemap.xml", data=result, www="www." in file_path)

        file.write(page)
        print("SITEMAP RENDER FINISH: " + str(time.time() - start))
        return page


@app.route('/api/regist/page/', methods=["POST"])
async def regist_cards_sitemap():
    try:
        data = request.get_json(force=True)

        ids = [id.get("id", -1) for id in data["results"]]
        conditions = await fetch(SERVER_ADDRESS+"/list/mods/?page_size=50&dates=true&general=false&allowed_ids="+str(ids))

        # Создание сессии
        Session = sessionmaker(bind=engine)
        session = Session()

        # Выполнение запроса
        real_ids = session.query(Page).filter(Page.mod_id.in_(ids)).all()
        real_ids = [obj.__dict__.get("mod_id", -1) for obj in real_ids]

        for mod_data in conditions["results"]:
            if mod_data["id"] not in real_ids:
                insert_statement = insert(Page).values(
                    mod_id=mod_data["id"],
                    date_update=datetime.datetime.fromisoformat(mod_data["date_update"])
                )

                session.execute(insert_statement)
            else:
                session.query(Page).filter_by(mod_id=mod_data["id"]).update(
                    {'date_update': datetime.datetime.fromisoformat(mod_data["date_update"])})

        session.commit()
        session.close()

        return "ok"
    except:
        print("BIG PAGE PARSE: ERROR")
        return "error"

if __name__ == '__main__':
    #app.run()
    from waitress import serve
    serve(app, host="0.0.0.0", port=6060)