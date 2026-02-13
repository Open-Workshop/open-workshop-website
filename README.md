# Open Workshop - Website

GUI каталог backend сервера. Имеет следующие возможности:
1. Адаптивная верстка - мобильный/десктопный форм фактор экрана.
2. Параметры и фильтрация - доступны все виды фильтрации предоставляемые backend сервером, по фильтрации доступны: по игре/параметр зависимости мода/поиск по имени. К сожалению у разработчика не хватило моральных сил реализовать GUI фильтрацию по тегам, но на backend она реализована.
3. Склейка динамика+статика - каталог динамичен, что позволяет удобно его просматривать без догружая только информацию о карточках. Сами страницы модов по большей части статичны и благодаря этому они могут легко индексироваться поисковиками.
4. Автогенератор `sitemap.xml` - сервер на основе запросов пользователя ведет независимый от backend каталог *(только id модов + дата последнего обновления)* и на основе него генерирует и актуализирует `sitemap.xml`.

## Uptrace telemetry

Сервер отправляет трейсы в Uptrace через OpenTelemetry, если задан `UPTRACE_DSN`.

Пример запуска:

```bash
export UPTRACE_DSN="https://<token>@api.uptrace.dev/<project_id>"
export OTEL_SERVICE_NAME="open-workshop-website"
export OTEL_SERVICE_VERSION="1.0.0"
export OTEL_DEPLOYMENT_ENVIRONMENT="production"
# export UPTRACE_OTLP_PROTOCOL="grpc"   # or "http"
# export UPTRACE_FLASK_EXCLUDED_URLS="^/assets/.*,^/favicon\\.ico$,^/robots\\.txt$"
python3 main.py
```

Опционально можно переопределить OTLP endpoint:

```bash
export UPTRACE_OTLP_TRACES_URL="https://api.uptrace.dev/v1/traces"
# export UPTRACE_OTLP_GRPC_URL="https://api.uptrace.dev:4317"
```

По умолчанию статические URL (`/assets/*`, `favicon`, `robots.txt`) исключаются из трейсинга,
чтобы не забивать список спанов служебным шумом.
