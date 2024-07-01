from sqlalchemy import create_engine, Column, Integer, DateTime
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from flask import render_template
from pathlib import Path
import ow_config as config
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


async def generate(file_path:str) -> str:
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
        session = sessionmaker(bind=engine)()

        # Выполнение запроса
        query = session.query(Mod).filter(Mod.condition == 0, Mod.public == 0)
        result = [obj.__dict__ for obj in query.limit(49000).all()]

        session.close()

        print("SITEMAP RENDER START FROM: " + str(time.time() - start))

        start = time.time()
        page = render_template("html-partials/standart_sitemap.xml", data=result, www="www." in file_path)

        file.write(page)
        print("SITEMAP RENDER FINISH: " + str(time.time() - start))
        return page
