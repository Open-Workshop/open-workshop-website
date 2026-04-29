from __future__ import annotations

import unittest

from access_policy import (
    build_mod_access,
    build_mod_rights,
    build_profile_access,
    build_session_access,
)


def _profile_source(reason_code: str, *, rights_value: bool = False) -> dict:
    return {
        "authenticated": True,
        "owner_id": 7 if reason_code == "self" else 1,
        "login_method": "google",
        "info": {
            "public": {
                "value": True,
                "reason": "Профиль доступен для просмотра",
                "reason_code": "public",
            },
            "meta": {
                "value": True,
                "reason": "Это ваш профиль" if reason_code == "self" else "Вы администратор",
                "reason_code": reason_code,
            },
        },
        "edit": {
            "rights": {
                "value": rights_value,
                "reason": "Только администратор может менять права",
                "reason_code": "admin" if rights_value else "forbidden",
            },
        },
        "vote_for_reputation": {
            "value": True,
            "reason": "Голосование за репутацию доступно",
            "reason_code": "allowed",
        },
        "write_comments": {
            "value": True,
            "reason": "Комментирование доступно",
            "reason_code": "allowed",
        },
        "set_reactions": {
            "value": True,
            "reason": "Реакции доступны",
            "reason_code": "allowed",
        },
        "delete": {
            "value": reason_code == "self",
            "reason": "Удалять можно только свой профиль",
            "reason_code": "self" if reason_code == "self" else "forbidden",
        },
    }


class AccessPolicyTests(unittest.TestCase):
    def test_session_access_omits_static_rights(self) -> None:
        source = {
            "authenticated": True,
            "owner_id": 5,
            "login_method": "google",
            "admin": True,
            "change_mods": True,
            "write_comments": True,
        }

        access = build_session_access(source)

        self.assertTrue(access["authenticated"])
        self.assertEqual(access["owner_id"], 5)
        self.assertFalse(access["mod_add"]["authenticated"])
        self.assertNotIn("admin", access)
        self.assertNotIn("change_mods", access)
        self.assertNotIn("write_comments", access)
        self.assertFalse(access["can_add_mod"])
        self.assertFalse(access["can_add_game"])
        self.assertFalse(access["can_edit_game"])

    def test_profile_access_marks_self_and_admin(self) -> None:
        self_access = build_profile_access(_profile_source("self", rights_value=False))
        admin_access = build_profile_access(_profile_source("admin", rights_value=True))

        self.assertTrue(self_access["my"])
        self.assertFalse(self_access["admin"])
        self.assertTrue(self_access["any"])
        self.assertFalse(self_access["edit"]["rights"]["value"])

        self.assertFalse(admin_access["my"])
        self.assertTrue(admin_access["admin"])
        self.assertTrue(admin_access["any"])
        self.assertTrue(admin_access["edit"]["rights"]["value"])

    def test_mod_rights_keep_authors_permission_separate(self) -> None:
        source = {
            "authenticated": True,
            "owner_id": 7,
            "login_method": "google",
            "info": {
                "value": True,
                "reason": "Мод доступен для просмотра",
                "reason_code": "public",
            },
            "catalog": {
                "value": True,
                "reason": "Мод можно показывать в каталоге",
                "reason_code": "catalog",
            },
            "edit": {
                "title": {
                    "value": False,
                    "reason": "Редактирование названия недоступно",
                    "reason_code": "forbidden",
                },
                "authors": {
                    "value": True,
                    "reason": "Можно управлять авторами",
                    "reason_code": "authors",
                },
                "new_version": {
                    "value": False,
                    "reason": "Новая версия недоступна",
                    "reason_code": "forbidden",
                },
            },
            "delete": {
                "value": False,
                "reason": "Удаление недоступно",
                "reason_code": "forbidden",
            },
            "download": {
                "value": True,
                "reason": "Мод можно скачать",
                "reason_code": "public",
            },
        }

        rights = build_mod_rights(source)

        self.assertFalse(rights["edit"])
        self.assertTrue(rights["authors"])
        self.assertFalse(rights["new_version"])
        self.assertFalse(rights["delete"])
        self.assertTrue(rights["any"])

        mod_access = build_mod_access(source)
        self.assertTrue(mod_access["edit"]["authors"]["value"])
        self.assertTrue(mod_access["download"]["value"])
        self.assertTrue(mod_access["catalog"]["value"])
