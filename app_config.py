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
            {"id": "upload_modpack", "href": "/modpack/add"},
            {"id": "my_mods", "href": "/user/{id}/mods"},
            {"id": "rating_history", "href": "/user/{id}/rating/history"},
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
                "path": "/oauth/yandex/authorize",
            },
            {
                "id": "google",
                "label": "Google",
                "icon": "/assets/images/webp/google.webp",
                "path": "/oauth/google/authorize",
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
        "access": {
            "base": ow_config.ACCESS_SERVICE_URL,
            "docs": {
                "swagger": ow_config.ACCESS_SERVICE_URL,
                "redoc": f"{ow_config.ACCESS_SERVICE_URL}/redoc",
            },
        },
        "storage": {
            "base": ow_config.STORAGE_ADDRESS,
            "distributor": f"{ow_config.STORAGE_ADDRESS}/distributor/",
            "loader": f"{ow_config.STORAGE_ADDRESS}/loader/",
            "docs": {
                "distributor": {
                    "swagger": f"{ow_config.STORAGE_ADDRESS}/distributor/",
                },
                "loader": {
                    "swagger": f"{ow_config.STORAGE_ADDRESS}/loader/",
                },
            },
        },
        "docs": {
            "redoc": f"{ow_config.MANAGER_ADDRESS}/",
            "swagger": f"{ow_config.MANAGER_ADDRESS}/docs",
        },
        "paths": {
            "session": {
                "logout": {"method": "DELETE", "path": "/sessions/current"},
            },
            "oauth": {
                "authorize": {"method": "GET", "path": "/oauth/{service}/authorize"},
            },
            "profile": {
                "list": {"method": "GET", "path": "/profiles"},
                "info": {"method": "GET", "path": "/profiles/{user_id}"},
                "edit": {"method": "PATCH", "path": "/profiles/{user_id}"},
                "edit_rights": {"method": "PATCH", "path": "/profiles/{user_id}/rights"},
                "delete": {"method": "DELETE", "path": "/profiles/{user_id}"},
                "avatar": {"method": "GET", "path": "/profiles/{user_id}/avatar"},
                "avatar_delete": {"method": "DELETE", "path": "/profiles/{user_id}/avatar"},
                "rating": {"method": "PUT", "path": "/profiles/{user_id}/rating"},
                "rating_history": {"method": "GET", "path": "/profiles/{user_id}/rating/history"},
            },
            "mod": {
                "list": {"method": "GET", "path": "/mods"},
                "feed": {"method": "GET", "path": "/mods/feed"},
                "add": {"method": "POST", "path": "/mods"},
                "file": {"method": "POST", "path": "/uploads"},
                "edit": {"method": "PATCH", "path": "/mods/{mod_id}"},
                "info": {"method": "GET", "path": "/mods/{mod_id}"},
                "download": {"method": "POST", "path": "/mods/{mod_id}/download-url"},
                "rating": {"method": "PUT", "path": "/mods/{mod_id}/rating"},
                "delete": {"method": "DELETE", "path": "/mods/{mod_id}"},
                "authors_upsert": {"method": "PUT", "path": "/mods/{mod_id}/authors/{author_id}"},
                "authors_delete": {"method": "DELETE", "path": "/mods/{mod_id}/authors/{author_id}"},
                "resources": {"method": "GET", "path": "/mods/{mod_id}/resources"},
                "tags": {"method": "GET", "path": "/mods/{mod_id}/tags"},
                "dependencies": {"method": "GET", "path": "/mods/{mod_id}/dependencies"},
                "conflicts": {"method": "GET", "path": "/mods/{mod_id}/conflicts"},
                "tags_add": {"method": "POST", "path": "/mods/{mod_id}/tags/{tag_id}"},
                "tags_delete": {"method": "DELETE", "path": "/mods/{mod_id}/tags/{tag_id}"},
                "dependencies_add": {"method": "POST", "path": "/mods/{mod_id}/dependencies/{dependency_mod_id}"},
                "dependencies_update": {"method": "PUT", "path": "/mods/{mod_id}/dependencies/{dependency_mod_id}"},
                "dependencies_delete": {"method": "DELETE", "path": "/mods/{mod_id}/dependencies/{dependency_mod_id}"},
                "conflicts_add": {"method": "POST", "path": "/mods/{mod_id}/conflicts/{conflict_mod_id}"},
                "conflicts_delete": {"method": "DELETE", "path": "/mods/{mod_id}/conflicts/{conflict_mod_id}"},
            },
            "modpack": {
                "list": {"method": "GET", "path": "/modpacks"},
                "add": {"method": "POST", "path": "/modpacks"},
                "edit": {"method": "PATCH", "path": "/modpacks/{modpack_id}"},
                "info": {"method": "GET", "path": "/modpacks/{modpack_id}"},
                "delete": {"method": "DELETE", "path": "/modpacks/{modpack_id}"},
                "rating": {"method": "PUT", "path": "/modpacks/{modpack_id}/rating"},
                "authors_upsert": {"method": "PUT", "path": "/modpacks/{modpack_id}/authors/{author_id}"},
                "authors_delete": {"method": "DELETE", "path": "/modpacks/{modpack_id}/authors/{author_id}"},
                "mods": {"method": "GET", "path": "/modpacks/{modpack_id}/mods"},
                "mods_update": {"method": "PUT", "path": "/modpacks/{modpack_id}/mods"},
            },
            "resource": {
                "list": {"method": "GET", "path": "/resources"},
                "add": {"method": "POST", "path": "/resources"},
                "edit": {"method": "PATCH", "path": "/resources/{resource_id}"},
                "delete": {"method": "DELETE", "path": "/resources/{resource_id}"},
                "upload_init": {"method": "POST", "path": "/uploads"},
                "upload_init_edit": {"method": "POST", "path": "/uploads"},
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
                "genres_batch": {"method": "GET", "path": "/games/genres"},
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
    "modpack": {
        "add": ["/modpack/add", "/modpack/add.html"],
        "edit": [
            "/modpack/<int:mod_id>/edit",
            "/modpack/<int:mod_id>/edit.html",
        ],
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
        "rating_history": ["/user/<int:user_id>/rating/history", "/user/<int:user_id>/rating/history.html"],
    },
}


ADD_PAGE_CONFIGS: dict = {
    "mod": {
        "kind": "mod",
        "entity_kind": "mod",
        "route_prefix": "mod",
        "entity_label": "мод",
        "entity_label_genitive": "мода",
        "entity_label_accusative": "мод",
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
        "adult_description": "Помечает мод как взрослый и позволяет скрывать его через фильтры каталога.",
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
        "entity_kind": "game",
        "route_prefix": "game",
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
    "modpack": {
        "kind": "mod",
        "entity_kind": "modpack",
        "route_prefix": "modpack",
        "entity_label": "модпак",
        "entity_label_genitive": "модпака",
        "entity_label_accusative": "модпак",
        "heading": "Создать модпак 😉",
        "max_width": "300pt",
        "name_placeholder": "Название модпака",
        "name_maxlength": 60,
        "name_minlength": 1,
        "submit_label": "Подтвердить",
        "show_game_selector": True,
        "show_file_upload": False,
        "show_progress": False,
        "show_media_manager": False,
        "show_git_panel": False,
        "show_tags_editor": False,
        "show_dependencies": False,
        "show_conflicts": False,
        "type_select": None,
        "adult_description": "Помечает модпак как взрослый и позволяет скрывать его через фильтры каталога.",
        "description_modules": [
            {
                "module_key": "modpack-short",
                "label": "Описание",
                "limit": 256,
                "placeholder": "Описание не может быть пустым!(",
                "init_text": "",
            }
        ],
        "page_title": "OW: Add modpack",
        "page_description": "Добавьте модпак в каталог Open Workshop!",
    },
}


EDIT_PAGE_CONFIGS: dict = {
    "mod": {
        "kind": "mod",
        "root_id": "main-mod-edit",
        "main_classes": "mod-edit",
        "entity_kind": "mod",
        "entity_label": "мод",
        "entity_label_genitive": "мода",
        "entity_label_accusative": "мод",
        "title_placeholder": "Название мода",
        "size_label": "Размер мода",
        "new_version_title": "Новая версия мода",
        "new_version_description": "Загрузите новый архив. Лимит 10 GB.",
        "delete_title": "Удаление мода",
        "delete_description": "Действие необратимо. Мод и ресурсы будут удалены.",
        "delete_button_label": "Удалить мод",
        "adult_description": "Такой мод можно скрывать через фильтр по возрастному ограничению.",
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
    "modpack": {
        "kind": "mod",
        "root_id": "main-mod-edit",
        "main_classes": "mod-edit",
        "entity_kind": "modpack",
        "entity_label": "модпак",
        "entity_label_genitive": "модпака",
        "entity_label_accusative": "модпак",
        "title_placeholder": "Название модпака",
        "size_label": "Размер модпака",
        "new_version_title": "Новая версия модпака",
        "new_version_description": "Модпаки не используют архивную загрузку.",
        "delete_title": "Удаление модпака",
        "delete_description": "Действие необратимо. Модпак и ресурсы будут удалены.",
        "delete_button_label": "Удалить модпак",
        "adult_description": "Такой модпак можно скрывать через фильтр по возрастному ограничению.",
        "show_media_manager": False,
        "show_git_panel": False,
        "show_tags_editor": False,
        "show_dependencies": False,
        "show_conflicts": False,
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
}


def api_endpoint(category: str, key: str) -> dict:
    return PUBLIC_CONFIG["api"]["paths"][category][key]


def api_path(category: str, key: str) -> str:
    return api_endpoint(category, key)["path"]


def api_method(category: str, key: str) -> str:
    return api_endpoint(category, key)["method"]
