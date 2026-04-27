"""Centralized application configuration for routes and API endpoints.

This module intentionally keeps only public, serializable data here so it can be
injected into templates/JS safely.
"""
from __future__ import annotations

import ow_config


PUBLIC_CONFIG: dict = {
    "site": {
        "name": "Open Workshop",
        "base_url": "https://openworkshop.miskler.ru",
        "nav": [
            {"id": "about", "href": "/about"},
            {"id": "api", "href": "/apis", "translate": "no"},
        ],
        "profile_menu": [
            {"id": "upload_mod", "href": "/mod/add"},
            {"id": "my_mods", "href": "/user/{id}/mods"},
            {"id": "settings", "href": "/user/{id}/settings"},
        ],
        "legal": {
            "cookies": "/legal/cookies",
            "privacy": "/legal/privacy-policy",
            "rules": "/legal/site-rules",
        },
        "auth_providers": [
            {
                "id": "yandex",
                "label": "Yandex",
                "icon": "/assets/images/webp/yandex.webp",
                "path": "/oauth/yandex/link",
            },
            {
                "id": "google",
                "label": "Google",
                "icon": "/assets/images/webp/google.webp",
                "path": "/oauth/google/link",
            },
        ],
        "socials": [
            {"id": "telegram", "href": "https://link.miskler.ru/telegram"},
            {"id": "discord", "href": "https://link.miskler.ru/discord"},
            {"id": "github", "href": "https://github.com/Open-Workshop"},
        ],
    },
    "api": {
        "base": ow_config.MANAGER_ADDRESS,
        "paths": {
            "session": {
                "logout": {"method": "DELETE", "path": "/sessions/current"},
            },
            "oauth": {
                "link": {"method": "GET", "path": "/oauth/{service}/link"},
                "disconnect": {"method": "DELETE", "path": "/oauth/{service}"},
            },
            "profile": {
                "info": {"method": "GET", "path": "/profiles/{user_id}"},
                "edit": {"method": "PATCH", "path": "/profiles/{user_id}"},
                "edit_rights": {"method": "PATCH", "path": "/profiles/{user_id}/rights"},
                "delete": {"method": "DELETE", "path": "/profiles/{user_id}"},
                "avatar": {"method": "GET", "path": "/profiles/{user_id}/avatar"},
            },
            "mod": {
                "list": {"method": "GET", "path": "/mods"},
                "feed": {"method": "GET", "path": "/mods/feed"},
                "add": {"method": "POST", "path": "/mods/from-file"},
                "file": {"method": "POST", "path": "/mods/{mod_id}/file"},
                "edit": {"method": "PATCH", "path": "/mods/{mod_id}"},
                "info": {"method": "GET", "path": "/mods/{mod_id}"},
                "download": {"method": "GET", "path": "/mods/{mod_id}/download"},
                "delete": {"method": "DELETE", "path": "/mods/{mod_id}"},
                "authors": {"method": "PATCH", "path": "/mods/{mod_id}/authors"},
                "resources": {"method": "GET", "path": "/mods/{mod_id}/resources"},
                "tags": {"method": "GET", "path": "/mods/{mod_id}/tags"},
                "dependencies": {"method": "GET", "path": "/mods/{mod_id}/dependencies"},
                "tags_add": {"method": "POST", "path": "/mods/{mod_id}/tags/{tag_id}"},
                "tags_delete": {"method": "DELETE", "path": "/mods/{mod_id}/tags/{tag_id}"},
                "dependencies_add": {"method": "POST", "path": "/mods/{mod_id}/dependencies/{dependencie_id}"},
                "dependencies_delete": {"method": "DELETE", "path": "/mods/{mod_id}/dependencies/{dependencie_id}"},
            },
            "resource": {
                "list": {"method": "GET", "path": "/resources"},
                "add": {"method": "POST", "path": "/resources"},
                "edit": {"method": "PATCH", "path": "/resources/{resource_id}"},
                "delete": {"method": "DELETE", "path": "/resources/{resource_id}"},
                "upload_init": {"method": "POST", "path": "/resources/upload-init"},
                "upload_init_edit": {"method": "POST", "path": "/resources/{resource_id}/upload-init"},
            },
            "game": {
                "info": {"method": "GET", "path": "/games/{game_id}"},
                "list": {"method": "GET", "path": "/games"},
                "add": {"method": "POST", "path": "/games"},
                "edit": {"method": "PATCH", "path": "/games/{game_id}"},
                "delete": {"method": "DELETE", "path": "/games/{game_id}"},
                "tags": {"method": "GET", "path": "/games/{game_id}/tags"},
                "tags_add": {"method": "POST", "path": "/games/{game_id}/tags/{tag_id}"},
                "tags_delete": {"method": "DELETE", "path": "/games/{game_id}/tags/{tag_id}"},
                "genres": {"method": "GET", "path": "/games/{game_id}/genres"},
                "genres_batch": {"method": "GET", "path": "/games/genres/batch/{games_ids_list}"},
                "genres_add": {"method": "POST", "path": "/games/{game_id}/genres/{genre_id}"},
                "genres_delete": {"method": "DELETE", "path": "/games/{game_id}/genres/{genre_id}"},
            },
"genre": {
                "add": {"method": "POST", "path": "/genres"},
                "list": {"method": "GET", "path": "/genres"},
                "edit": {"method": "PATCH", "path": "/genres/{genre_id}"},
                "delete": {"method": "DELETE", "path": "/genres/{genre_id}"},
            },
            "tag": {
                "add": {"method": "POST", "path": "/tags"},
                "list": {"method": "GET", "path": "/tags"},
                "edit": {"method": "PATCH", "path": "/tags/{tag_id}"},
                "delete": {"method": "DELETE", "path": "/tags/{tag_id}"},
            },
        },
    },
    "assets": {
        "images": {
            "fallback": "/assets/images/image-not-found.webp",
            "loading": "/assets/images/loading.webp",
        },
        "icons": {
            "public": {
                "0": "/assets/images/svg/white/eye.svg",
                "1": "/assets/images/svg/white/link.svg",
                "2": "/assets/images/svg/white/lock.svg",
            }
        },
    },
    "rights": {
        "list": [
            "admin",
            "write_comments",
            "set_reactions",
            "create_reactions",
            "publish_mods",
            "change_authorship_mods",
            "change_self_mods",
            "change_mods",
            "delete_self_mods",
            "delete_mods",
            "mute_users",
            "create_forums",
            "change_authorship_forums",
            "change_self_forums",
            "change_forums",
            "delete_self_forums",
            "delete_forums",
            "change_username",
            "change_about",
            "change_avatar",
            "vote_for_reputation",
        ],
        "groups": [
            ["admin"],
            ["write_comments", "set_reactions", "create_reactions"],
            [
                "publish_mods",
                "change_authorship_mods",
                "change_self_mods",
                "change_mods",
                "delete_self_mods",
                "delete_mods",
            ],
            ["mute_users"],
            [
                "create_forums",
                "change_authorship_forums",
                "change_self_forums",
                "change_forums",
                "delete_self_forums",
                "delete_forums",
            ],
            ["change_username", "change_about", "change_avatar"],
            ["vote_for_reputation"],
        ],
    },
}


ROUTES: dict = {
    "unified_pages": [
        "/",
        "/index",
        "/index.html",
        "/toast-demo",
        "/toast-demo.html",
        "/about",
        "/about.html",
        "/apis",
        "/apis.html",
        "/legal/cookies",
        "/legal/cookies.html",
        "/legal/license",
        "/legal/license.html",
        "/legal/site-rules",
        "/legal/site-rules.html",
        "/legal/copyright",
        "/legal/copyright.html",
        "/legal/privacy-policy",
        "/legal/privacy-policy.html",
    ],
    "mod": {
        "view": [
            "/mod/<int:mod_id>",
            "/mod/<int:mod_id>.html",
            "/mod/<int:mod_id>/edit",
            "/mod/<int:mod_id>/edit.html",
        ],
        "add": ["/mod/add", "/mod/add.html"],
    },
    "game": {
        "add": [
            "/game/add",
            "/game/add.html",
        ],
        "edit": [
            "/game/<int:game_id>/edit",
            "/game/<int:game_id>/edit.html",
        ],
    },
    "user": {
        "view": ["/user/<int:user_id>", "/user/<int:user_id>.html"],
        "settings": ["/user/<int:user_id>/settings", "/user/<int:user_id>/settings.html"],
        "mods": ["/user/<int:user_id>/mods", "/user/<int:user_id>/mods.html"],
    },
}


ADD_PAGE_CONFIGS: dict = {
    "mod": {
        "kind": "mod",
        "heading": "Загрузить мод 😉",
        "max_width": "300pt",
        "name_placeholder": "Этот мод прозвали...",
        "name_maxlength": 60,
        "name_minlength": 1,
        "submit_label": "Подтвердить",
        "show_game_selector": True,
        "show_file_upload": True,
        "show_progress": True,
        "type_select": None,
        "description_modules": [
            {
                "module_key": "mod-short",
                "label": "Описание",
                "limit": 256,
                "placeholder": "Описание не может быть пустым!(",
                "init_text": "",
            }
        ],
        "page_title": "OW: Add mod",
        "page_description": "Добавьте мод в свободный каталог Open Workshop!",
    },
    "game": {
        "kind": "game",
        "heading": "Добавить игру 😉",
        "max_width": "300pt",
        "name_placeholder": "Название игры",
        "name_maxlength": 128,
        "name_minlength": 1,
        "submit_label": "Создать игру",
        "show_game_selector": False,
        "show_file_upload": False,
        "show_progress": False,
        "type_select": {
            "id": "entity-type-select",
            "label": "Тип сущности",
            "default": "game",
            "options": [
                {"value": "game", "label": "Игра"},
                {"value": "app", "label": "Приложение"},
            ],
        },
        "description_modules": [
            {
                "module_key": "game-short",
                "label": "Краткое описание",
                "limit": 256,
                "placeholder": "Краткое описание игры...",
                "init_text": "",
            },
        ],
        "page_title": "OW: Add game",
        "page_description": "Добавьте игру в каталог Open Workshop!",
    },
}


EDIT_PAGE_CONFIGS: dict = {
    "mod": {
        "kind": "mod",
        "root_id": "main-mod-edit",
        "main_classes": "mod-edit",
        "styles": [
            "/assets/styles/pages/mod-edit.css",
        ],
        "template_nav": "html-partials/mod-edit/nav.html",
        "template_pages": [
            "html-partials/mod-edit/page-main.html",
            "html-partials/mod-edit/page-catalog.html",
            "html-partials/mod-edit/page-params.html",
        ],
        "scripts": [
            "/assets/scripts/vendors/pager-logic.js",
            "/assets/scripts/ow-edit-runtime.js",
            "/assets/scripts/pages/mod-edit/api.js",
            "/assets/scripts/pages/mod-edit/media-manager.js",
            "/assets/scripts/pages/mod-edit/authors-manager.js",
            "/assets/scripts/pages/mod-edit/catalog-preview.js",
            "/assets/scripts/pages/mod-edit/upload-flow.js",
            "/assets/scripts/pages/mod-edit/save-service.js",
            "/assets/scripts/pages/mod-edit.js",
        ],
    },
    "game": {
        "kind": "game",
        "root_id": "main-game-edit",
        "main_classes": "mod-edit game-edit",
        "styles": [
            "/assets/styles/pages/mod-edit.css",
            "/assets/styles/pages/game-edit.css",
        ],
        "template_nav": "html-partials/game-edit/nav.html",
        "template_pages": [
            "html-partials/game-edit/page-main.html",
            "html-partials/game-edit/page-catalog.html",
            "html-partials/game-edit/page-params.html",
        ],
        "scripts": [
            "/assets/scripts/vendors/pager-logic.js",
            "/assets/scripts/ow-edit-runtime.js",
            "/assets/scripts/pages/mod-edit/media-manager.js",
            "/assets/scripts/pages/mod-edit/api.js",
            "/assets/scripts/pages/game-edit/catalog-preview.js",
            "/assets/scripts/pages/game-edit.js",
        ],
    },
}


def api_endpoint(category: str, key: str) -> dict:
    return PUBLIC_CONFIG["api"]["paths"][category][key]


def api_path(category: str, key: str) -> str:
    return api_endpoint(category, key)["path"]


def api_method(category: str, key: str) -> str:
    return api_endpoint(category, key)["method"]
