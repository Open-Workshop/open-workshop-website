import asyncio
import contextvars
import http.server
import threading
import unittest
from unittest.mock import patch

from opentelemetry.instrumentation.aiohttp_client import AioHttpClientInstrumentor
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter

from outbound_http import OutboundHttp
from user_manager import UserHandler


class _Handler(http.server.BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def do_GET(self):
        self.server.seen.append((self.client_address[1], self.headers.get("Cookie"), self.headers.get("traceparent")))
        body = b'{"ok": true}'
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Set-Cookie", "accessToken=server; Path=/")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass


class OutboundHttpTests(unittest.TestCase):
    def setUp(self):
        self.server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), _Handler)
        self.server.daemon_threads = True
        self.server.seen = []
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.client = OutboundHttp()
        self.url = f"http://127.0.0.1:{self.server.server_port}/"

    def tearDown(self):
        self.client.close()
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()

    def test_reuse_across_event_loops_and_isolate_cookies(self):
        first = asyncio.run(self.client.request("GET", self.url, cookies={"accessToken": "alice"}))
        second = asyncio.run(self.client.request("GET", self.url, cookies={"accessToken": "bob"}))
        third = asyncio.run(self.client.request("GET", self.url))
        self.assertEqual(first[0:2], (200, {"ok": True}))
        self.assertEqual(first[2]["accessToken"].value, "server")
        self.assertEqual([entry[1] for entry in self.server.seen], ["accessToken=alice", "accessToken=bob", None])
        self.assertEqual(len({entry[0] for entry in self.server.seen}), 1)

    def test_context_is_carried_to_pool_loop(self):
        current = contextvars.ContextVar("current", default="missing")
        original = self.client._request
        values = []

        async def capture(*args, **kwargs):
            values.append(current.get())
            return await original(*args, **kwargs)

        self.client._request = capture
        current.set("trace-context")
        asyncio.run(self.client.request("GET", self.url))
        self.assertEqual(values, ["trace-context"])

    def test_http_span_and_trace_headers_survive_loop_handoff(self):
        exporter = InMemorySpanExporter()
        provider = TracerProvider()
        provider.add_span_processor(SimpleSpanProcessor(exporter))
        instrumentor = AioHttpClientInstrumentor()
        instrumentor.instrument(tracer_provider=provider)
        try:
            with provider.get_tracer(__name__).start_as_current_span("page") as parent:
                asyncio.run(self.client.request("GET", self.url))
                parent_id = parent.get_span_context().span_id
            spans = exporter.get_finished_spans()
            child = next(span for span in spans if span.name != "page")
            self.assertEqual(child.parent.span_id, parent_id)
            self.assertIn(f"{child.context.trace_id:032x}", self.server.seen[0][2])
        finally:
            instrumentor.uninstrument()
            provider.shutdown()

    def test_user_handler_keeps_response_cookies_only_on_its_request(self):
        first, second = UserHandler(), UserHandler()
        first.cookies = {"accessToken": "alice"}
        second.cookies = {"accessToken": "bob"}
        with patch("user_manager.outbound_http", self.client):
            result = asyncio.run(first.fetch(self.url))
            asyncio.run(second.fetch(self.url))
        self.assertEqual(result, (200, {"ok": True}))
        self.assertEqual([entry[1] for entry in self.server.seen], ["accessToken=alice", "accessToken=bob"])
        self.assertEqual(first.cookies["accessToken"], "server")
        self.assertEqual(first.changed_cookies["accessToken"].value, "server")
        self.assertEqual(len({entry[0] for entry in self.server.seen}), 1)
