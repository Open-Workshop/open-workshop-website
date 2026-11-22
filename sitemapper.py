from flask import render_template
from pathlib import Path
import tempfile
import logging
import os
import time
import mod_event_index

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)


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

    result = mod_event_index.list_sitemap_mods(limit=49000)

    logger.info("Sitemap data loaded in %.3f seconds", time.time() - start)

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

    logger.info("Sitemap rendered in %.3f seconds", time.time() - start)
    return page
