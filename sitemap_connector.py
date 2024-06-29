from sqlalchemy import create_engine, Column, Integer, DateTime
from sqlalchemy.ext.declarative import declarative_base
import ow_config as config


engine = create_engine(f'mysql+mysqldb://{config.user_sql}:{config.password_sql}@{config.url_sql}/catalog')
#engine = create_engine(f'sqlite:///catalog.db') # Для тестов sqlite
base = declarative_base()


class Mod(base): # Таблица "моды"
    __tablename__ = 'mods'
    id = Column(Integer, primary_key=True)
    
    condition = Column(Integer) #0 - загружен, 1 - загружается
    public = Column(Integer) #0 - публичен, 1 - публичен, не встречается в каталоге, не индексируется, 2 - доступен с предоставлением токена

    date_update_file = Column(DateTime)
