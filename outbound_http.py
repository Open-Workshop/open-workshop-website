"""Shared aiohttp pool for Flask's short-lived async request loops."""
from __future__ import annotations

import asyncio
import atexit
import contextvars
import threading

import aiohttp


class OutboundHttp:
    def __init__(self):
        self._lock = threading.Lock()
        self._loop = None
        self._thread = None
        self._session = None

    def _ensure_loop(self):
        with self._lock:
            if self._loop is not None:
                return self._loop
            loop = asyncio.new_event_loop()
            ready = threading.Event()

            def run():
                asyncio.set_event_loop(loop)
                ready.set()
                loop.run_forever()
                loop.close()

            thread = threading.Thread(target=run, name="ow-outbound-http", daemon=True)
            thread.start()
            ready.wait()
            self._loop = loop
            self._thread = thread
            return loop

    async def _request(self, method, url, **kwargs):
        if self._session is None:
            # Every request supplies its own cookies; never keep another user's.
            self._session = aiohttp.ClientSession(cookie_jar=aiohttp.DummyCookieJar())
        async with self._session.request(method, url, **kwargs) as response:
            content_type = response.headers.get("Content-Type", "")
            content = await response.json() if content_type.startswith("application/json") else await response.text()
            return response.status, content, response.cookies

    async def request(self, method, url, **kwargs):
        loop = self._ensure_loop()
        # Preserve the active OTel context when scheduling on the pool's loop.
        future = contextvars.copy_context().run(
            asyncio.run_coroutine_threadsafe, self._request(method, url, **kwargs), loop
        )
        return await asyncio.wrap_future(future)

    def close(self):
        with self._lock:
            loop, thread = self._loop, self._thread
            if loop is None:
                return
            if self._session is not None:
                asyncio.run_coroutine_threadsafe(self._session.close(), loop).result(timeout=10)
                self._session = None
            loop.call_soon_threadsafe(loop.stop)
            thread.join(timeout=10)
            self._loop = None
            self._thread = None


outbound_http = OutboundHttp()
atexit.register(outbound_http.close)
