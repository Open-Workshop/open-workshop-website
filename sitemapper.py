from sqlalchemy import create_engine, Column, Integer, DateTime
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from flask import render_template
from pathlib import Path
import ow_config as config
import tempfile
import os
import time


engine = create_engine(f'mysql+mysqldb://{config.user_sql}:{config.password_sql}@{config.url_sql}/catalog')
#engine = create_engine(f'sqlite:///catalog.db') # Для тестов sqlite
base = declarative_base()


class Mod(base): # Таблица "моды"
    __tablename__ = 'mods'
    id = Column(Integer, primary_key=True)
    
    condition = Column(Integer) #0 - загружен, 1 - загружается
    public = Column(Integer) #0 - публичен, 1 - публичен, не встречается в каталоге, не индексируется, 2 - доступен с предоставлением токена

    date_update_file = Column(DateTime)


async def generate(file_path: str, site_host: str) -> str:
    """
    Asynchronously generates a sitemap based on the provided file path.

    Parameters:
    file_path (str): The path to the file to write the sitemap.

    Returns:
    str: The generated sitemap page.
    """
    target_path = Path(file_path)
    target_path.parent.mkdir(parents=True, exist_ok=True)

    start = time.time()

    # Создание сессии
    session = sessionmaker(bind=engine)()
    try:
        # Выполнение запроса
        query = session.query(Mod).filter(Mod.condition == 0, Mod.public == 0)
        result = [{"id": obj.id, "date_update_file": obj.date_update_file} for obj in query.limit(49000).all()]
    finally:
        session.close()

    print("SITEMAP RENDER START FROM: " + str(time.time() - start))

    start = time.time()
    page = render_template("html-partials/standart_sitemap.xml", data=result, site_host=site_host)

    # Пишем в временный файл и атомарно подменяем кеш, чтобы не оставлять пустой sitemap при ошибке.
    fd, temp_path = tempfile.mkstemp(
        dir=str(target_path.parent),
        prefix=f"{target_path.name}.",
        suffix=".tmp",
        text=True
    )
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as file:
            file.write(page)
        os.replace(temp_path, target_path)
    except Exception:
        if os.path.exists(temp_path):
            os.unlink(temp_path)
        raise

    print("SITEMAP RENDER FINISH: " + str(time.time() - start))
    return page
