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

Payload для сайта должен содержать `id` и `public`; `occurred_at` используется как дата обновления, если он передан. `title` и `full_description` сайт не хранит и не использует. Локальный индекс ведется через SQLAlchemy и хранится в отдельной MySQL-базе `MOD_EVENTS_INDEX_DATABASE` (`website` по умолчанию), таблица `MOD_EVENTS_INDEX_TABLE` (`known_mods` по умолчанию). Сайт хранит только индексируемые моды: `public == 0` добавляет или обновляет запись, `public != 0` и `mod.deleted` физически удаляют запись из локального индекса. Все настройки этого индекса и NATS берутся из `ow_config.py`. При изменении индекса кэш `website/sitemaps/*.sitemap.xml` сбрасывается, чтобы следующий запрос собрал актуальный sitemap.

Минимальная конфигурация в `ow_config.py`:

```python
NATS_URLS = ["nats://127.0.0.1:4222"]
MOD_EVENTS_INDEX_DATABASE = "website"
```

## Access service

Сайт использует `access` только на стороне сервера для проверки прав и доступности кнопок.  
Для серверных запросов к сервисам на той же машине можно задать переменные окружения `OW_INTERNAL_MANAGER_URL` и `OW_INTERNAL_ACCESS_URL`, например `http://127.0.0.1:7776` и `http://127.0.0.1:7778`. Публичные адреса `MANAGER_ADDRESS` и `ACCESS_SERVICE_URL` остаются доступными браузеру и используются по умолчанию, если внутренние адреса не заданы.

## Тесты

В проекте есть два уровня тестов:

- Python-тесты проверяют серверные маршруты, шаблоны, access policy, рендер описаний и sitemap/event-index логику.
- JS unit-тесты в `tests/js/` проверяют поведение браузерных модулей без хрупких проверок строк в исходниках.

Запуск JS unit-тестов:

```bash
node --test tests/js
```

Эти тесты используют встроенный `node:test`, поэтому `package.json` и npm-зависимости для них не нужны. Сейчас JS-набор покрывает:

- сборку API-запросов каталога для режимов `game`, `mod` и `modpack`;
- нормализацию фильтров `tags`, `excluded_tags`, `dependencies`, `excluded_dependencies`, `excluded_conflicts`, `game_type/types` и `adult`;
- очистку URL-параметров под активный режим каталога;
- нормализацию сортировок перед запросом к manager API;
- поведение карточек каталога: загрузку логотипов через resources API, пропуск placeholder-карточек, защиту от устаревших request token и ссылки modpack-карточек.

Запуск Python route/template-среза по каталогу:

```bash
./venv/bin/python -m pytest tests/test_routes.py -q -k catalog
```

Полный Python-набор:

```bash
./venv/bin/python -m pytest tests -q
```

Подробности по JS-тестам лежат в `tests/js/README.md`.

## Rybbit analytics

Для браузерной аналитики задайте `RYBBIT_SITE_ID`. Идентификатор вошедшего пользователя,
его публичный ник и `grade` передаются в собственный экземпляр Rybbit. Аналитика не
отправляет содержимое редактируемых полей, имена файлов или тексты ошибок.

Основные события:

- `content_created` — создана запись мода или сборки; запись мода на этом этапе ещё может быть черновиком.
- `content_creation_failed` — не удалось создать запись или получить её ID.
- `content_published` / `content_unpublished` — API успешно изменил доступность записи на публичную / с публичной на ограниченную, даже если последующий этап сохранения не удался.
- `initial_upload_completed` / `initial_upload_failed` — обработка первого архива мода завершена / произошла ошибка или истекло время ожидания.
- `version_upload_completed` / `version_upload_failed` — подтверждено изменение даты файла / произошла ошибка загрузки или обработки версии.
- `content_edit_saved` / `content_edit_failed` — сохранение страницы завершилось / прервалось. При ошибке некоторые предыдущие этапы могли уже сохраниться.
- `profile_update_completed` / `profile_update_failed` — результат изменения данных, прав или удаления аватара. `profile_avatar_transfer_accepted` означает только принятие файла сервером.
- `mod_download_click` и `modpack_download_click` — нажатия кнопок, а не подтверждённые скачивания.

Свойства событий включают тип и ID объекта, этапы или имена изменённых полей. У событий профиля `scope=self` означает собственный профиль, `scope=other` — чужой, а `scope=unknown` — не удалось определить автора. Изменения разных частей профиля и страницы могут выполняться отдельными запросами, поэтому они не являются одной атомарной операцией.

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
