import unittest
from unittest.mock import AsyncMock, patch

import ow_config
from user_manager import UserHandler


class InternalManagerUrlTests(unittest.IsolatedAsyncioTestCase):
    async def test_internal_address_only_changes_server_side_manager_requests(self):
        handler = UserHandler()
        handler._request_external = AsyncMock(return_value=(200, {}))
        with patch.dict("os.environ", {"OW_INTERNAL_MANAGER_URL": "http://127.0.0.1:7776/"}):
            await handler.fetch("/mods/42")
            await handler.fetch_access("/context")
        self.assertEqual(handler._request_external.await_args_list[0].args[:2], ("http://127.0.0.1:7776", "/mods/42"))
        self.assertEqual(handler._request_external.await_args_list[1].args[0], ow_config.ACCESS_SERVICE_URL)

    async def test_default_remains_public_address(self):
        handler = UserHandler()
        handler._request_external = AsyncMock(return_value=(200, {}))
        with patch.dict("os.environ", {"OW_INTERNAL_MANAGER_URL": ""}):
            await handler.fetch("/mods")
        self.assertEqual(handler._request_external.await_args.args[0], ow_config.MANAGER_ADDRESS)

    async def test_internal_access_address_is_used_only_for_server_requests(self):
        handler = UserHandler()
        handler._request_external = AsyncMock(return_value=(200, {}))
        with patch.dict("os.environ", {"OW_INTERNAL_ACCESS_URL": "http://127.0.0.1:7778/"}):
            await handler.fetch_access("/context")
        self.assertEqual(handler._request_external.await_args.args[:2], ("http://127.0.0.1:7778", "/context"))
        self.assertEqual(handler._request_external.await_args.kwargs["json_data"], {})

    async def test_access_default_remains_public_address(self):
        handler = UserHandler()
        handler._request_external = AsyncMock(return_value=(200, {}))
        with patch.dict("os.environ", {"OW_INTERNAL_ACCESS_URL": ""}):
            await handler.fetch_access("/context")
        self.assertEqual(handler._request_external.await_args.args[0], ow_config.ACCESS_SERVICE_URL)
