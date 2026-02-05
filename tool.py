from user_manager import UserHandler
from flask import render_template
import app_config


async def error_page(error_title:str, error_body:str, error_code:int = 200):
    try:
        async with UserHandler() as handler:
            page_html = handler.render("error.html", error=error_body, error_title=error_title)
            return handler.finish(page_html), error_code
    except:
        return render_template(
            "error.html",
            error=error_body,
            error_title=error_title,
            user_profile=None,
            ow=app_config.PUBLIC_CONFIG,
        ), error_code


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
