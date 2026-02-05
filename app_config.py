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
            {"id": "telegram", "href": "https://t.me/miskler_dev"},
            {"id": "discord", "href": "https://discord.gg/em7ag3EGgs"},
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
                "add": {"method": "POST", "path": "/mods"},
                "edit": {"method": "PATCH", "path": "/mods/{mod_id}"},
                "info": {"method": "GET", "path": "/mods/{mod_id}"},
                "download": {"method": "GET", "path": "/mods/{mod_id}/download"},
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
            },
            "game": {
                "info": {"method": "GET", "path": "/games/{game_id}"},
                "list": {"method": "GET", "path": "/games"},
            },
            "tag": {
                "list": {"method": "GET", "path": "/tags"},
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
    "user": {
        "view": ["/user/<int:user_id>", "/user/<int:user_id>.html"],
        "settings": ["/user/<int:user_id>/settings", "/user/<int:user_id>/settings.html"],
        "mods": ["/user/<int:user_id>/mods", "/user/<int:user_id>/mods.html"],
    },
}


def api_endpoint(category: str, key: str) -> dict:
    return PUBLIC_CONFIG["api"]["paths"][category][key]


def api_path(category: str, key: str) -> str:
    return api_endpoint(category, key)["path"]


def api_method(category: str, key: str) -> str:
    return api_endpoint(category, key)["method"]
