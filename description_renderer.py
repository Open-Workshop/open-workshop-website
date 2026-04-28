from __future__ import annotations

import html
import re
from functools import lru_cache
from urllib.parse import urlsplit

import bbcode

_HEADING_RE = re.compile(r"^\[h([1-6])](.*?)\[/h\1]$", re.IGNORECASE)
_CODE_OPEN_RE = re.compile(r"^\s*\[code](.*)$", re.IGNORECASE)
_QUOTE_OPEN_RE = re.compile(r"^\[quote(?:=(.*?))?](.*)$", re.IGNORECASE)
_LIST_OPEN_RE = re.compile(r"^\[list]$", re.IGNORECASE)
_SIMPLE_LIST_RE = re.compile(r"^\*\s+")
_TABLE_OPEN_RE = re.compile(r"^\[table]", re.IGNORECASE)
_HR_RE = re.compile(r"^\[hr(?:\s*/)?]$", re.IGNORECASE)
_HR_BLOCK_RE = re.compile(r"^\[hr].*\[/hr]$", re.IGNORECASE)
_LIST_ITEM_RE = re.compile(r"^\[\*]")


def normalize_text(value) -> str:
    return str(value or "").replace("\r\n", "\n").replace("\r", "\n")


def normalize_url(value) -> str:
    raw = str(value or "").strip()
    if raw == "":
        return ""
    if re.match(r"^https?://", raw, re.IGNORECASE):
        return raw
    return f"https://{raw.lstrip('/')}"


def _normalize_code_block_text(text: str) -> str:
    normalized = normalize_text(text)
    if normalized.startswith("\n"):
        normalized = normalized[1:]
    if normalized.endswith("\n"):
        normalized = normalized[:-1]
    return normalized


def _render_raw_link(url: str) -> str:
    href = normalize_url(url)
    if href == "":
        return ""

    try:
        parsed = urlsplit(href)
        label = parsed.hostname or href
    except ValueError:
        label = href

    return f'<a class="tag-link" href="{html.escape(href, quote=True)}">{html.escape(label)}</a>'


def _render_url(tag_name, value, options, parent, context) -> str:
    href = normalize_url(options["url"] if options and "url" in options else value)
    if href == "":
        return html.escape(value) if value else ""

    scheme = re.sub(r"[^a-z0-9+]", "", href.lower().split(":", 1)[0])
    if scheme in {"javascript", "data", "vbscript"}:
        return ""

    label = value if value else href
    return f'<a class="tag-link" href="{html.escape(href, quote=True)}">{label}</a>'


def _render_img(tag_name, value, options, parent, context) -> str:
    src = normalize_url(value)
    if src == "":
        return ""
    return f'<img class="img-desc" src="{html.escape(src, quote=True)}" alt="">'


def _render_code(tag_name, value, options, parent, context) -> str:
    text = _normalize_code_block_text(value)
    return f"<code>{html.escape(text)}</code>"


def _render_spoiler(tag_name, value, options, parent, context) -> str:
    return f'<span class="spoiler">{value}</span>'


@lru_cache(maxsize=1)
def _get_parser() -> bbcode.Parser:
    parser = bbcode.Parser(
        newline="<br />",
        install_defaults=False,
        escape_html=True,
        replace_links=True,
        replace_cosmetic=False,
        drop_unrecognized=False,
        linker=_render_raw_link,
    )

    parser.add_simple_formatter("b", "<strong>%(value)s</strong>")
    parser.add_simple_formatter("i", "<em>%(value)s</em>")
    parser.add_simple_formatter("u", "<u>%(value)s</u>")
    parser.add_simple_formatter("s", "<s>%(value)s</s>")
    parser.add_simple_formatter("strike", "<s>%(value)s</s>")
    parser.add_formatter(
        "url",
        _render_url,
        replace_links=False,
        replace_cosmetic=False,
    )
    parser.add_formatter(
        "img",
        _render_img,
        render_embedded=False,
        transform_newlines=False,
        swallow_trailing_newline=True,
        replace_links=False,
        replace_cosmetic=False,
    )
    parser.add_formatter(
        "code",
        _render_code,
        render_embedded=False,
        transform_newlines=False,
        swallow_trailing_newline=True,
        replace_links=False,
        replace_cosmetic=False,
    )
    parser.add_formatter("spoiler", _render_spoiler)

    return parser


def render_inline(text) -> str:
    return _get_parser().format(normalize_text(text))


def _render_paragraph(lines: list[str], short: bool) -> str:
    html_value = render_inline("\n".join(lines))
    if html_value.strip() == "":
        return ""
    if short:
        html_value = re.sub(r"(?:<p><br\s*/?></p>\s*)+", "", html_value)
    return f"<p>{html_value}</p>"


def _render_heading(line: str) -> str:
    match = _HEADING_RE.match(line.strip())
    if not match:
        return ""
    level = match.group(1)
    return f"<h{level}>{render_inline(match.group(2))}</h{level}>"


def _collect_code_block(lines: list[str], start_index: int) -> tuple[int, str]:
    first_line = lines[start_index]
    open_match = _CODE_OPEN_RE.match(first_line)
    if not open_match:
        return start_index + 1, _render_paragraph([first_line], short=False)

    content_lines: list[str] = []
    current_line = open_match.group(1) or ""
    index = start_index

    while index < len(lines):
        close_index = current_line.lower().find("[/code]")
        if close_index >= 0:
            content_lines.append(current_line[:close_index])
            break

        content_lines.append(current_line)
        index += 1
        current_line = lines[index] if index < len(lines) else ""

    code = html.escape(_normalize_code_block_text("\n".join(content_lines)))
    return min(index + 1, len(lines)), f"<pre><code>{code}</code></pre>"


def _collect_quote(lines: list[str], start_index: int) -> tuple[int, str]:
    first_line = lines[start_index]
    open_match = _QUOTE_OPEN_RE.match(first_line.strip())
    if not open_match:
        return start_index + 1, _render_paragraph([first_line], short=False)

    title = (open_match.group(1) or "").strip()
    content_lines: list[str] = []
    current_line = open_match.group(2) or ""
    index = start_index

    while index < len(lines):
        close_index = current_line.lower().find("[/quote]")
        if close_index >= 0:
            before_close = current_line[:close_index]
            if before_close != "":
                content_lines.append(before_close)
            break

        if current_line != "" or index != start_index:
            content_lines.append(current_line)
        index += 1
        current_line = lines[index] if index < len(lines) else ""

    title_html = f"<p><strong>{render_inline(title)}</strong></p>" if title else ""
    content_html = render_blocks("\n".join(content_lines), short=False)
    return min(index + 1, len(lines)), f"<blockquote>{title_html}{content_html}</blockquote>"


def _render_list_items(items: list[str]) -> str:
    if not items:
        return ""
    rendered_items = "".join(f"<li>{render_inline(item)}</li>" for item in items)
    return f"<ul>{rendered_items}</ul>"


def _collect_tagged_list(lines: list[str], start_index: int) -> tuple[int, str]:
    items: list[str] = []
    index = start_index + 1
    current_item = ""

    while index < len(lines):
        raw_line = lines[index]
        trimmed = raw_line.strip()

        if re.fullmatch(r"\[/list]", trimmed, re.IGNORECASE):
            if current_item != "":
                items.append(current_item)
            return index + 1, _render_list_items(items)

        if _LIST_ITEM_RE.match(trimmed):
            if current_item != "":
                items.append(current_item)
            current_item = re.sub(r"^\[\*]\s*", "", trimmed)
        elif current_item != "":
            current_item += f"\n{raw_line}"

        index += 1

    if current_item != "":
        items.append(current_item)

    return len(lines), _render_list_items(items)


def _collect_simple_list(lines: list[str], start_index: int) -> tuple[int, str]:
    items: list[str] = []
    index = start_index

    while index < len(lines):
        line = lines[index]
        if not _SIMPLE_LIST_RE.match(line.strip()):
            break
        items.append(line.strip()[2:].strip())
        index += 1

    return index, _render_list_items(items)


def _render_table_markup(raw: str) -> str:
    return re.sub(
        r"\[(\/?)(table|tr|td)]",
        lambda match: f"<{match.group(1) or ''}{match.group(2).lower()}>",
        raw,
        flags=re.IGNORECASE,
    )


def _collect_table(lines: list[str], start_index: int) -> tuple[int, str]:
    collected: list[str] = []
    index = start_index

    while index < len(lines):
        collected.append(lines[index])
        if re.search(r"\[/table]", lines[index], re.IGNORECASE):
            return index + 1, _render_table_markup("\n".join(collected))
        index += 1

    return len(lines), _render_table_markup("\n".join(collected))


def render_blocks(text, short: bool = False) -> str:
    lines = normalize_text(text).split("\n")
    blocks: list[str] = []
    paragraph_lines: list[str] = []
    index = 0

    def flush_paragraph() -> None:
        nonlocal paragraph_lines
        if not paragraph_lines:
            return
        paragraph = _render_paragraph(paragraph_lines, short=short)
        if paragraph:
            blocks.append(paragraph)
        paragraph_lines = []

    while index < len(lines):
        line = lines[index]
        trimmed = line.strip()

        if trimmed == "":
            flush_paragraph()
            index += 1
            continue

        if _HEADING_RE.match(trimmed):
            flush_paragraph()
            heading = _render_heading(line)
            if heading:
                blocks.append(heading)
            index += 1
            continue

        if _CODE_OPEN_RE.match(trimmed):
            flush_paragraph()
            next_index, html_value = _collect_code_block(lines, index)
            if html_value:
                blocks.append(html_value)
            index = next_index
            continue

        if _QUOTE_OPEN_RE.match(trimmed):
            flush_paragraph()
            next_index, html_value = _collect_quote(lines, index)
            if html_value:
                blocks.append(html_value)
            index = next_index
            continue

        if _LIST_OPEN_RE.match(trimmed):
            flush_paragraph()
            next_index, html_value = _collect_tagged_list(lines, index)
            if html_value:
                blocks.append(html_value)
            index = next_index
            continue

        if _SIMPLE_LIST_RE.match(trimmed):
            flush_paragraph()
            next_index, html_value = _collect_simple_list(lines, index)
            if html_value:
                blocks.append(html_value)
            index = next_index
            continue

        if _TABLE_OPEN_RE.match(trimmed):
            flush_paragraph()
            next_index, html_value = _collect_table(lines, index)
            if html_value:
                blocks.append(html_value)
            index = next_index
            continue

        if _HR_RE.match(trimmed) or _HR_BLOCK_RE.match(trimmed):
            flush_paragraph()
            blocks.append("<hr>")
            index += 1
            continue

        paragraph_lines.append(line)
        index += 1

    flush_paragraph()
    return "".join(blocks)


def render_description_html(text, *, short: bool = False) -> str:
    return render_blocks(text, short=short)
