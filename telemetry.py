"""OpenTelemetry setup for exporting traces to Uptrace."""
from __future__ import annotations

import atexit
import logging
import os
from urllib.parse import parse_qs, urlparse

from flask import Flask


_LOG = logging.getLogger(__name__)
_INSTRUMENTED = False


def _parse_dsn(dsn: str):
    parsed = urlparse(dsn)
    if not parsed.scheme or not parsed.hostname:
        raise ValueError("UPTRACE_DSN must be a valid URL.")
    return parsed


def _read_setting(key: str, default: str | None = None) -> str | None:
    value = os.getenv(key)
    if value is not None and str(value).strip():
        return str(value).strip()

    try:
        import ow_config

        config_value = getattr(ow_config, key, None)
        if config_value is not None and str(config_value).strip():
            return str(config_value).strip()
    except Exception:
        pass

    return default


def _dsn_to_otlp_trace_endpoint(dsn: str) -> str:
    parsed = _parse_dsn(dsn)

    host = parsed.hostname
    if parsed.port:
        host = f"{host}:{parsed.port}"

    return f"{parsed.scheme}://{host}/v1/traces"


def _dsn_to_otlp_grpc_endpoint(dsn: str) -> str:
    parsed = _parse_dsn(dsn)
    query = parse_qs(parsed.query)

    host = parsed.hostname
    grpc_port = query.get("grpc", [None])[0]
    if grpc_port:
        host = f"{host}:{grpc_port}"
    elif parsed.port:
        host = f"{host}:{parsed.port}"

    return f"{parsed.scheme}://{host}"


def setup_uptrace_telemetry(app: Flask) -> bool:
    """Initialize OpenTelemetry + Uptrace integration.

    Returns True when telemetry is configured, otherwise False.
    """
    global _INSTRUMENTED

    if _INSTRUMENTED or getattr(app, "_uptrace_telemetry_enabled", False):
        return True

    dsn = _read_setting("UPTRACE_DSN")
    if not dsn:
        _LOG.info("UPTRACE_DSN is not configured, telemetry is disabled.")
        return False

    service_name = _read_setting("OTEL_SERVICE_NAME", "open-workshop-website")
    service_version = _read_setting("OTEL_SERVICE_VERSION", "dev")
    service_environment = _read_setting("OTEL_DEPLOYMENT_ENVIRONMENT", "production")
    traces_endpoint = _read_setting("UPTRACE_OTLP_TRACES_URL")
    grpc_endpoint = _read_setting("UPTRACE_OTLP_GRPC_URL")
    protocol = (_read_setting("UPTRACE_OTLP_PROTOCOL") or "").lower().strip()

    try:
        from opentelemetry import trace
        from opentelemetry.instrumentation.aiohttp_client import AioHttpClientInstrumentor
        from opentelemetry.instrumentation.flask import FlaskInstrumentor
        from opentelemetry.sdk.resources import Resource
        from opentelemetry.sdk.trace import TracerProvider
        from opentelemetry.sdk.trace.export import BatchSpanProcessor

        if not protocol:
            parsed = _parse_dsn(dsn)
            has_grpc_query = bool(parse_qs(parsed.query).get("grpc"))
            protocol = "grpc" if (grpc_endpoint or has_grpc_query) else "http"

        if protocol == "grpc":
            from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter as OTLPGrpcSpanExporter

            exporter = OTLPGrpcSpanExporter(
                endpoint=grpc_endpoint or _dsn_to_otlp_grpc_endpoint(dsn),
                headers=(("uptrace-dsn", dsn),),
            )
        elif protocol == "http":
            from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter as OTLPHttpSpanExporter

            exporter = OTLPHttpSpanExporter(
                endpoint=traces_endpoint or _dsn_to_otlp_trace_endpoint(dsn),
                headers={"uptrace-dsn": dsn},
            )
        else:
            raise ValueError("UPTRACE_OTLP_PROTOCOL must be 'http' or 'grpc'.")

        provider = TracerProvider(
            resource=Resource.create(
                {
                    "service.name": service_name,
                    "service.version": service_version,
                    "deployment.environment": service_environment,
                }
            )
        )
        provider.add_span_processor(BatchSpanProcessor(exporter))
        trace.set_tracer_provider(provider)

        FlaskInstrumentor().instrument_app(app)
        AioHttpClientInstrumentor().instrument()
        atexit.register(_shutdown_provider, provider)

        _INSTRUMENTED = True
        setattr(app, "_uptrace_telemetry_enabled", True)
        _LOG.info("Uptrace telemetry enabled for service %s via %s.", service_name, protocol)
        return True
    except ImportError:
        _LOG.exception("OpenTelemetry packages are missing. Install dependencies from requirements.txt.")
        return False
    except Exception:
        _LOG.exception("Failed to initialize Uptrace telemetry.")
        return False


def _shutdown_provider(provider: object) -> None:
    try:
        provider.shutdown()  # type: ignore[attr-defined]
    except Exception:
        _LOG.exception("Failed to shutdown telemetry provider cleanly.")
