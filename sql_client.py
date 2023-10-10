from sqlalchemy import create_engine, Column, Integer, Date
from sqlalchemy.ext.declarative import declarative_base

engine = create_engine('sqlite:///sitemap.db')
base = declarative_base()

class Page(base): # Таблица "игры"
    __tablename__ = 'pages'
    mod_id = Column(Integer, primary_key=True)
    game_id = Column(Integer)
    date_update = Column(Date)

base.metadata.create_all(engine)