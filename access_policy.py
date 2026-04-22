from __future__ import annotations

from collections.abc import Mapping
from typing import Any


_CONTEXT_FIELDS: tuple[str, ...] = (
    "authenticated",
    "owner_id",
    "login_method",
    "mute_until",
    "last_username_reset",
    "last_password_reset",
    "password_change_available_at",
    "username_change_available_at",
)


def _mapping_value(source: Any, key: str, default: Any = None) -> Any:
    if isinstance(source, Mapping):
        return source.get(key, default)
    return getattr(source, key, default)


def _right_value(source: Any) -> bool:
    return bool(_mapping_value(source, "value", False))


def _right(
    source: Any,
    *,
    default_value: bool = False,
    default_reason: str = "Недоступно",
    default_reason_code: str = "forbidden",
) -> dict[str, Any]:
    if isinstance(source, Mapping):
        value = bool(source.get("value", default_value))
        reason = str(source.get("reason", default_reason))
        reason_code = str(source.get("reason_code", default_reason_code))
    else:
        value = default_value
        reason = default_reason
        reason_code = default_reason_code

    return {
        "value": value,
        "reason": reason,
        "reason_code": reason_code,
    }


def _context_payload(source: Any) -> dict[str, Any]:
    payload = {}
    for field in _CONTEXT_FIELDS:
        payload[field] = _mapping_value(source, field, False if field == "authenticated" else -1 if field == "owner_id" else None)
    if not payload.get("authenticated"):
        payload["owner_id"] = -1
        payload["login_method"] = None
    return payload


def build_mod_add_access(source: Any) -> dict[str, Any]:
    context = _context_payload(source)
    add = _right(
        _mapping_value(source, "add", None),
        default_reason="Требуется авторизация",
        default_reason_code="unauthorized",
    )
    anonymous_add = _right(
        _mapping_value(source, "anonymous_add", None),
        default_reason="Требуется авторизация",
        default_reason_code="unauthorized",
    )
    payload = {
        **context,
        "add": add,
        "anonymous_add": anonymous_add,
    }
    payload["any"] = add["value"] or anonymous_add["value"]
    return payload


def build_game_add_access(source: Any) -> dict[str, Any]:
    context = _context_payload(source)
    add = _right(
        _mapping_value(source, "add", None),
        default_reason="Требуются права администратора",
        default_reason_code="forbidden",
    )
    payload = {
        **context,
        "add": add,
    }
    payload["any"] = add["value"]
    return payload


def build_session_access(
    context: Any,
    mod_add: Any | None = None,
    game_add: Any | None = None,
) -> dict[str, Any]:
    payload = _context_payload(context)
    mod_add_right = build_mod_add_access(mod_add)
    game_add_right = build_game_add_access(game_add)

    payload["mod_add"] = mod_add_right
    payload["game_add"] = game_add_right
    payload["can_add_mod"] = _right_value(mod_add_right["add"])
    payload["can_add_game"] = _right_value(game_add_right["add"])
    payload["can_edit_game"] = payload["can_add_game"]
    return payload


def build_mod_access(source: Any) -> dict[str, Any]:
    context = _context_payload(source)
    info = _right(
        _mapping_value(source, "info", None),
        default_reason="Мод скрыт",
        default_reason_code="hidden",
    )
    edit_source = _mapping_value(source, "edit", {})
    edit = {
        "title": _right(_mapping_value(edit_source, "title", None)),
        "description": _right(_mapping_value(edit_source, "description", None)),
        "short_description": _right(_mapping_value(edit_source, "short_description", None)),
        "screenshots": _right(_mapping_value(edit_source, "screenshots", None)),
        "new_version": _right(_mapping_value(edit_source, "new_version", None)),
        "authors": _right(
            _mapping_value(edit_source, "authors", None),
            default_reason="Управление авторами недоступно",
            default_reason_code="forbidden",
        ),
        "tags": _right(_mapping_value(edit_source, "tags", None)),
        "dependencies": _right(_mapping_value(edit_source, "dependencies", None)),
    }
    delete = _right(
        _mapping_value(source, "delete", None),
        default_reason="Удаление недоступно",
        default_reason_code="forbidden",
    )
    download = _right(
        _mapping_value(source, "download", None),
        default_reason="Скачивание скрыто",
        default_reason_code="hidden",
    )

    payload = {
        **context,
        "info": info,
        "edit": edit,
        "delete": delete,
        "download": download,
    }
    payload["any"] = any(
        _right_value(item)
        for item in (
            payload["info"],
            payload["edit"]["title"],
            payload["edit"]["authors"],
            payload["delete"],
            payload["download"],
        )
    )
    return payload


def build_mod_rights(source: Any) -> dict[str, Any]:
    mod_access = build_mod_access(source)
    edit = mod_access["edit"]
    payload = {
        "edit": _right_value(edit["title"]),
        "authors": _right_value(edit["authors"]),
        "new_version": _right_value(edit["new_version"]),
        "delete": _right_value(mod_access["delete"]),
        "info": mod_access["info"],
        "download": mod_access["download"],
    }
    payload["any"] = payload["edit"] or payload["authors"] or payload["new_version"] or payload["delete"]
    return payload


def build_game_access(source: Any) -> dict[str, Any]:
    context = _context_payload(source)
    edit_source = _mapping_value(source, "edit", {})
    edit = {
        "title": _right(_mapping_value(edit_source, "title", None)),
        "description": _right(_mapping_value(edit_source, "description", None)),
        "short_description": _right(_mapping_value(edit_source, "short_description", None)),
        "screenshots": _right(_mapping_value(edit_source, "screenshots", None)),
        "tags": _right(_mapping_value(edit_source, "tags", None)),
        "genres": _right(_mapping_value(edit_source, "genres", None)),
    }
    delete = _right(
        _mapping_value(source, "delete", None),
        default_reason="Удаление недоступно",
        default_reason_code="forbidden",
    )

    payload = {
        **context,
        "edit": edit,
        "delete": delete,
    }
    payload["any"] = any(_right_value(item) for item in (*edit.values(), delete))
    return payload


def build_profile_access(source: Any) -> dict[str, Any]:
    context = _context_payload(source)
    info_source = _mapping_value(source, "info", {})
    meta = _right(
        _mapping_value(info_source, "meta", None),
        default_reason="Скрытая информация недоступна",
        default_reason_code="forbidden",
    )
    public = _right(
        _mapping_value(info_source, "public", None),
        default_reason="Профиль доступен для просмотра",
        default_reason_code="public",
        default_value=True,
    )
    edit_source = _mapping_value(source, "edit", {})
    edit = {
        "nickname": _right(_mapping_value(edit_source, "nickname", None)),
        "grade": _right(
            _mapping_value(edit_source, "grade", None),
            default_reason="Только администратор может менять грейд",
            default_reason_code="forbidden",
        ),
        "description": _right(_mapping_value(edit_source, "description", None)),
        "avatar": _right(_mapping_value(edit_source, "avatar", None)),
        "mute": _right(
            _mapping_value(edit_source, "mute", None),
            default_reason="Только администратор может назначать мут",
            default_reason_code="forbidden",
        ),
        "rights": _right(
            _mapping_value(edit_source, "rights", None),
            default_reason="Только администратор может менять права",
            default_reason_code="forbidden",
        ),
    }

    vote_for_reputation = _right(
        _mapping_value(source, "vote_for_reputation", None),
        default_reason="Голосование за репутацию недоступно",
        default_reason_code="forbidden",
    )
    write_comments = _right(
        _mapping_value(source, "write_comments", None),
        default_reason="Комментирование недоступно",
        default_reason_code="forbidden",
    )
    set_reactions = _right(
        _mapping_value(source, "set_reactions", None),
        default_reason="Реакции недоступны",
        default_reason_code="forbidden",
    )
    delete = _right(
        _mapping_value(source, "delete", None),
        default_reason="Удаление недоступно",
        default_reason_code="forbidden",
    )

    payload = {
        **context,
        "info": {
            "public": public,
            "meta": meta,
        },
        "edit": edit,
        "vote_for_reputation": vote_for_reputation,
        "write_comments": write_comments,
        "set_reactions": set_reactions,
        "delete": delete,
    }
    payload["my"] = meta["reason_code"] == "self"
    payload["admin"] = meta["reason_code"] == "admin"
    payload["change_username"] = _right_value(edit["nickname"])
    payload["change_about"] = _right_value(edit["description"])
    payload["change_avatar"] = _right_value(edit["avatar"])
    payload["grade"] = _right_value(edit["grade"])
    payload["mute_users"] = _right_value(edit["mute"])
    payload["any"] = (
        payload["my"]
        or payload["admin"]
        or payload["change_username"]
        or payload["change_about"]
        or payload["change_avatar"]
        or payload["grade"]
        or payload["mute_users"]
        or _right_value(edit["rights"])
        or _right_value(delete)
    )
    return payload
