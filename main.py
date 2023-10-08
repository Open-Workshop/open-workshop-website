from flask import Flask, render_template, send_from_directory, request
import aiohttp
import asyncio
import json
import datetime
import re

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
        print(urls)
        tasks = []
        for url in urls:
            tasks.append(fetch(url))
        info = await asyncio.gather(*tasks)

        print(info)

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
            print(info[2])
            {}.values()

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

if __name__ == '__main__':
    #app.run()
    from waitress import serve
    serve(app, host="0.0.0.0", port=6060)