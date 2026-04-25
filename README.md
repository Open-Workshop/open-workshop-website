# Open Workshop - Website

GUI каталог backend сервера. Имеет следующие возможности:
1. Адаптивная верстка - мобильный/десктопный форм фактор экрана.
2. Параметры и фильтрация - доступны все виды фильтрации предоставляемые backend сервером, по фильтрации доступны: по игре/параметр зависимости мода/поиск по имени. К сожалению у разработчика не хватило моральных сил реализовать GUI фильтрацию по тегам, но на backend она реализована.
3. Склейка динамика+статика - каталог динамичен, что позволяет удобно его просматривать без догружая только информацию о карточках. Сами страницы модов по большей части статичны и благодаря этому они могут легко индексироваться поисковиками.
4. Автогенератор `sitemap.xml` - сервер ведет локальный индекс модов из NATS JetStream событий `mods.*` и на основе него генерирует и актуализирует `sitemap.xml`.

## Mod events

Сайт подписывается на JetStream-события от `open-workshop-manager`:

- `mods.added`
- `mods.changed`
- `mods.deleted`

Payload должен содержать `id`, `title`, `full_description`. Локальный индекс ведется через SQLAlchemy и хранится в отдельной MySQL-базе `MOD_EVENTS_INDEX_DATABASE` (`website` по умолчанию), таблица `MOD_EVENTS_INDEX_TABLE` (`known_mods` по умолчанию). Все настройки этого индекса и NATS берутся из `ow_config.py`. При изменении индекса кэш `website/sitemaps/*.sitemap.xml` сбрасывается, чтобы следующий запрос собрал актуальный sitemap.

Минимальная конфигурация в `ow_config.py`:

```python
NATS_URL = "nats://127.0.0.1:4222"
MOD_EVENTS_INDEX_DATABASE = "website"
```

## Access service

Сайт использует `access` только на стороне сервера для проверки прав и доступности кнопок.  
Для локального запуска рядом с `manager` укажите `ACCESS_SERVICE_URL` в `ow_config.py` и убедитесь, что браузер не получает этот адрес в публичном JSON-конфиге.

## Uptrace telemetry

Сервер отправляет трейсы в Uptrace через OpenTelemetry, если задан `UPTRACE_DSN`.

Пример запуска:

```bash
export UPTRACE_DSN="https://<token>@api.uptrace.dev/<project_id>"
export OTEL_SERVICE_NAME="open-workshop-website"
export OTEL_SERVICE_VERSION="1.0.0"
export OTEL_DEPLOYMENT_ENVIRONMENT="production"
# export UPTRACE_OTLP_PROTOCOL="grpc"   # or "http"
# export UPTRACE_FLASK_EXCLUDED_URLS="^https?://[^/]+/assets/.*,^https?://[^/]+/favicon\\.ico$,^https?://[^/]+/robots\\.txt$"
python3 main.py
```

Опционально можно переопределить OTLP endpoint:

```bash
export UPTRACE_OTLP_TRACES_URL="https://api.uptrace.dev/v1/traces"
# export UPTRACE_OTLP_GRPC_URL="https://api.uptrace.dev:4317"
```

По умолчанию статические URL (`/assets/*`, `favicon`, `robots.txt`) исключаются из трейсинга
(в формате полного URL, как его проверяет Flask-инструментатор),
чтобы не забивать список спанов служебным шумом.
