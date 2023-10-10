from flask import Flask, render_template, send_from_directory, request, make_response
import aiohttp
import asyncio
import json
import datetime
import re
import time
import os
from pathlib import Path
from sql_client import Page, engine
from sqlalchemy.orm import sessionmaker

app = Flask(__name__, template_folder='website')

SERVER_ADDRESS = "http://127.0.0.1:8000"#"https://api.openworkshop.su"
SHORT_WORDS = [
    "b", "list", "h1", "h2", "h3", "h4", "h5", "h6", "*", "u", "url"
]


@app.route('/')
async def index():
    return render_template("index.html", catalog=True)

@app.route('/about')
async def about():
    return render_template("about.html")

async def fetch(url):
    async with aiohttp.ClientSession() as session:
        response = await session.get(url=url, timeout=aiohttp.ClientTimeout(total=5))
        text = await response.text()
        return json.loads(text)

@app.route('/mod/<int:mod_id>')
async def mod(mod_id):
    try:
        global SHORT_WORDS

        urls = [
            SERVER_ADDRESS+"/info/mod/"+str(mod_id)+"?dependencies=true&description=true&short_description=true&dates=true&general=true&game=true",
            SERVER_ADDRESS+"/list/resources_mods/%5B"+str(mod_id)+"%5D?page_size=30&page=0"
        ]
        tasks = []
        for url in urls:
            tasks.append(fetch(url))
        info = await asyncio.gather(*tasks)

        if info[0]['result'] is None:
            return await page_not_found(-1)

        if info[0]['result']['size'] > 1100000:
            info[0]['result']['size'] = str(round(info[0]['result']['size']/1048576, 1))+" MB"
        else:
            info[0]['result']['size'] = str(round(info[0]['result']['size']/1024, 1))+" KB"

        is_mod = {
            "date_creation": info[0]['result'].get('date_creation', ""),
            "date_update": info[0]['result'].get("date_update", ""),
            "logo": ""
        }

        for img in info[1]["results"]:
            if img is not None and img["type"] == "logo":
                is_mod["logo"] = img["url"]

        input_date = datetime.datetime.fromisoformat(info[0]['result']['date_creation'])
        info[0]['result']['date_creation'] = input_date.strftime("%d.%m.%Y")

        input_date = datetime.datetime.fromisoformat(info[0]['result']['date_update'])
        info[0]['result']['date_update'] = input_date.strftime("%d.%m.%Y")

        info[0]['result']['id'] = mod_id

        info[0]['result']['short_description'] = await remove_words_short(text=info[0]['result']['short_description'], words=SHORT_WORDS)

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

        return render_template("mod.html", data=info, is_mod_data=is_mod)
    except:
        return await page_not_found(-1)
async def remove_words_short(text, words):
    for word in words:
        text = text.replace("["+word+"]", '')
        text = text.replace("[/"+word+"]", '')

    text = re.sub(r"\[url=.*?\]", "", text)
    text = re.sub(r"\[img\].*?\[/img\]", "", text)

    text = re.sub(r'(\n\s*)+\n+', '\n\n', text)
    return text

@app.route('/<path:filename>')
async def serve_static(filename):
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

        if diff > datetime.timedelta(days=1):
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


if __name__ == '__main__':
    #app.run()
    from waitress import serve
    serve(app, host="0.0.0.0", port=6060)