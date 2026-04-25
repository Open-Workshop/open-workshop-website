
MANAGER_ADDRESS = "https://api.openworkshop.miskler.ru"
STORAGE_ADDRESS = "https://storage.openworkshop.miskler.ru"
ACCESS_SERVICE_URL = "https://access.openworkshop.miskler.ru"

user_sql = "root"
password_sql = "???"
url_sql = "localhost"
# port_sql = 3306

# Server-side timezone for rendering dates (e.g. "Europe/Moscow", "UTC")
TIMEZONE = "UTC"

# NATS JetStream events from open-workshop-manager for sitemap/index updates.
# Disabled by default; set NATS_URL or NATS_URLS here to enable.
NATS_URL = ""
NATS_URLS = []
MOD_EVENTS_STREAM = "MOD_EVENTS"
MOD_EVENTS_SUBJECT = "mods.*"
MOD_EVENTS_DURABLE = "open-workshop-website-mod-index"
MOD_EVENTS_INDEX_DATABASE = "website"
MOD_EVENTS_INDEX_TABLE = "known_mods"
MOD_EVENTS_INDEX_CREATE_DATABASE = True
MOD_EVENTS_CONNECT_TIMEOUT_SECONDS = 2
MOD_EVENTS_FETCH_TIMEOUT_SECONDS = 1
MOD_EVENTS_RECONNECT_DELAY_SECONDS = 5

# Optional telemetry settings (recommended to set via environment variables)
# UPTRACE_DSN = "https://<token>@api.uptrace.dev/<project_id>"
# OTEL_SERVICE_NAME = "open-workshop-website"
# OTEL_SERVICE_VERSION = "1.0.0"
# OTEL_DEPLOYMENT_ENVIRONMENT = "production"
# UPTRACE_OTLP_PROTOCOL = "grpc"  # or "http"
# UPTRACE_FLASK_EXCLUDED_URLS = "^https?://[^/]+/assets/.*,^https?://[^/]+/favicon\\.ico$,^https?://[^/]+/robots\\.txt$"
# UPTRACE_OTLP_TRACES_URL = "https://api.uptrace.dev/v1/traces"
# UPTRACE_OTLP_GRPC_URL = "https://api.uptrace.dev:4317"
