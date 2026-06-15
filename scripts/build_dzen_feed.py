#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
build_dzen_feed.py — обогащает journal/feed.xml полным текстом каждой статьи
в <content:encoded> для импорта в Яндекс.Дзен (платформа Дзен / VK).

Что делает:
  1. Читает существующий journal/feed.xml и сохраняет порядок и метаданные
     каждого <item> (title, link, guid, pubDate, description, enclosure, category).
  2. По link находит соответствующий файл journal/<file>.html.
  3. Извлекает тело статьи (lede + .body + .summary-box + .faq-section),
     вычищает топбар, скрипты, виджет чата, CTA-блоки, формы, футер.
  4. Оставляет только HTML, поддерживаемый Дзеном: p, a, b, i, u, s,
     h2/h3/h4, blockquote, ul/ol/li, figure/img/figcaption.
  5. Делает все ссылки и картинки абсолютными (https://ccapital.pro/...).
  5b. Для картинок ленты подменяет .webp → .jpg, если рядом на диске есть
      .jpg-двойник (Дзен игнорирует webp). Сайтовые HTML не трогаются.
  5c. Если DRAFT_MODE=True, в каждый <item> добавляет <category>native-draft</category>
      — материалы импортируются в черновики (ручная модерация).
  6. Пишет новый feed.xml с namespace content: и <content:encoded><![CDATA[...]]>.

Запуск:
    python3 scripts/build_dzen_feed.py            # перезаписать journal/feed.xml
    python3 scripts/build_dzen_feed.py --dry-run  # напечатать в stdout, не писать

Требования: Python 3.8+, beautifulsoup4, lxml.
"""

import argparse
import os
import re
import sys
from email.utils import format_datetime, parsedate_to_datetime
from xml.sax.saxutils import escape

from bs4 import BeautifulSoup, NavigableString, Tag

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
JOURNAL_DIR = os.path.join(ROOT, "journal")
FEED_PATH = os.path.join(JOURNAL_DIR, "feed.xml")
SITE = "https://ccapital.pro"

# Режим импорта в Дзен.
#   True  → в каждый <item> добавляется <category>native-draft</category>:
#           материал попадает в ЧЕРНОВИКИ канала (ручная модерация и публикация).
#   False → маркер не добавляется: материал публикуется автоматически.
# Источник: https://dzen.ru/help/ru/website/rss-modify.html
DRAFT_MODE = True
DRAFT_CATEGORY = "native-draft"

# Блоки, которые надо полностью выкинуть из тела (CTA, виджеты, навигация, формы).
DROP_SELECTORS = [
    "script", "style", "noscript", "svg", "iframe",
    "#topbar", "header#topbar", "footer", "form",
    "nav.breadcrumb", "nav.bottom-nav",
    ".inline-cta", ".finbox", ".next-step", ".more-reads",
    ".tg-digest", ".tag-row", ".article-meta", ".article-eyebrow",
    ".img-credit", ".case-label", ".chat-widget",
]

ALLOWED = {
    "p", "a", "b", "i", "u", "s", "br",
    "h2", "h3", "h4", "blockquote",
    "ul", "ol", "li", "figure", "img", "figcaption",
}
RENAME = {"strong": "b", "em": "i", "h1": "h2"}
UNWRAP = {"div", "span", "aside", "section", "header", "article", "main", "time"}


def abs_url(url: str) -> str:
    if not url:
        return url
    url = url.strip()
    if url.startswith("http://") or url.startswith("https://"):
        return url
    if url.startswith("//"):
        return "https:" + url
    if url.startswith("../"):
        return SITE + "/" + url[3:]
    if url.startswith("/"):
        return SITE + url
    # относительный путь внутри /journal/
    return SITE + "/journal/" + url


def _local_path_for_url(absolute_url: str):
    """Локальный путь файла на диске для абсолютного URL вида https://ccapital.pro/..."""
    prefix = SITE + "/"
    if absolute_url.startswith(prefix):
        rel = absolute_url[len(prefix):]
        return os.path.join(ROOT, rel)
    return None


def feed_image_url(url: str) -> str:
    """Готовит ссылку на картинку для ленты.

    Делает URL абсолютным и, если это .webp и рядом на диске лежит .jpg-двойник,
    подменяет расширение на .jpg. Дзен игнорирует .webp, поэтому в ленту должны
    попадать только jpg/png/gif. Сайтовые HTML при этом продолжают отдавать webp.
    """
    if not url:
        return url
    absolute = abs_url(url)
    if absolute.lower().endswith(".webp"):
        jpg = absolute[:-len(".webp")] + ".jpg"
        local = _local_path_for_url(jpg)
        if local and os.path.exists(local):
            return jpg
    return absolute


def image_mime(url: str) -> str:
    low = (url or "").lower()
    if low.endswith(".png"):
        return "image/png"
    if low.endswith(".gif"):
        return "image/gif"
    if low.endswith(".webp"):
        return "image/webp"
    return "image/jpeg"


def clean_text(s: str) -> str:
    return s.replace("\xa0", " ")


def sanitize(soup: BeautifulSoup, container: Tag) -> None:
    """In-place очистка поддерева до набора тегов, поддерживаемых Дзеном."""
    # 1. Удаляем нежелательные блоки целиком.
    for sel in DROP_SELECTORS:
        for el in container.select(sel):
            el.decompose()

    # 2. Удаляем номера-декорации внутри заголовков (.h2-num, .num, .mr-* и т.п.).
    for el in container.select("span.h2-num, span.num, .mr-kicker"):
        el.decompose()

    # 2b. Метки кейс-врезки (.tag / .outcome) оформляем как отдельные абзацы,
    #     чтобы при разворачивании div они не слипались в один параграф.
    _factory = BeautifulSoup("", "lxml")
    for el in container.select(".case-row .tag, .case-row .outcome"):
        el.name = "p"
        b = _factory.new_tag("b")
        b.string = el.get_text(strip=True)
        el.clear()
        el.append(b)

    # 3. Переименовываем теги strong/em/h1.
    for tag_name, new_name in RENAME.items():
        for el in container.find_all(tag_name):
            el.name = new_name

    # 4. Чистим атрибуты, делаем ссылки/картинки абсолютными.
    for el in container.find_all(True):
        if el.name == "a":
            href = el.get("href", "")
            el.attrs = {}
            if href and not href.startswith("#") and not href.startswith("mailto:"):
                el["href"] = abs_url(href)
            elif href.startswith("mailto:"):
                el["href"] = href
        elif el.name == "img":
            src = el.get("src") or el.get("data-src") or ""
            alt = el.get("alt", "")
            el.attrs = {}
            el["src"] = feed_image_url(src)
            if alt:
                el["alt"] = clean_text(alt)
        else:
            el.attrs = {}

    # 5. Разворачиваем структурные обёртки (div/span/aside/section...).
    #    Повторяем, пока есть что разворачивать (вложенные обёртки).
    changed = True
    while changed:
        changed = False
        for el in container.find_all(list(UNWRAP)):
            el.unwrap()
            changed = True

    # 6. Удаляем все теги, не входящие в whitelist (разворачивая их содержимое).
    changed = True
    while changed:
        changed = False
        for el in container.find_all(True):
            if el.name not in ALLOWED:
                el.unwrap()
                changed = True

    # 7. Нормализуем неразрывные пробелы в текстовых узлах.
    for node in container.find_all(string=True):
        if isinstance(node, NavigableString):
            txt = clean_text(str(node))
            if txt != str(node):
                node.replace_with(txt)


def render_children(container: Tag) -> str:
    """Сериализует прямых потомков, оборачивая «висячий» текст в <p>."""
    out = []
    buffer = []

    def flush():
        if buffer:
            text = "".join(buffer).strip()
            if text:
                out.append("<p>" + text + "</p>")
            buffer.clear()

    for child in container.children:
        if isinstance(child, NavigableString):
            buffer.append(str(child))
            continue
        if isinstance(child, Tag):
            if child.name in {"b", "i", "u", "s", "a", "br"}:
                buffer.append(str(child))
            else:
                flush()
                html = str(child).strip()
                if html:
                    out.append(html)
    flush()
    return "\n".join(out)


def build_faq(section: Tag) -> str:
    """Преобразует <details class="faq-item"> в h3 (вопрос) + p (ответ)."""
    parts = ["<h2>Частые вопросы</h2>"]
    for item in section.select("details.faq-item"):
        q = item.find("summary")
        a = item.select_one(".faq-a")
        if not q:
            continue
        q_html = render_children(q).strip()
        # У вопроса берём чистый текст, у ответа — размеченный HTML.
        q_text = re.sub(r"<[^>]+>", "", q_html).strip()
        parts.append("<h3>" + q_text + "</h3>")
        if a:
            parts.append("<p>" + render_children(a).strip() + "</p>")
    return "\n".join(parts)


def extract_content(html_path: str) -> str:
    with open(html_path, "r", encoding="utf-8") as fh:
        soup = BeautifulSoup(fh.read(), "lxml")

    article = soup.select_one("article.article") or soup.body
    blocks = []

    # 1. Обложка-герой (если есть) — первой картинкой пойдёт в карточку ленты.
    hero = article.select_one("figure.hero-img img") if article else None
    if hero is not None:
        src = feed_image_url(hero.get("src", ""))
        alt = clean_text(hero.get("alt", ""))
        if src:
            blocks.append('<figure><img src="%s" alt="%s"></figure>' % (escape(src, {'"': "&quot;"}), escape(alt, {'"': "&quot;"})))

    # 2. Чтобы не мутировать исходное дерево, работаем с копией article.
    work = BeautifulSoup(str(article), "lxml")
    work_root = work.select_one("article.article") or work.body

    lede_el = work_root.select_one("p.lede-paragraph")
    body_el = work_root.select_one("div.body")
    summary_el = work_root.select_one("aside.summary-box")
    faq_el = work_root.select_one("section.faq-section")

    # FAQ преобразуем до общей санитизации (нужна структура details/summary).
    faq_html = build_faq(faq_el) if faq_el else ""

    pieces = []
    if lede_el is not None:
        holder = BeautifulSoup("<div></div>", "lxml").div
        holder.append(lede_el.extract())
        sanitize(work, holder)
        pieces.append(render_children(holder))

    if body_el is not None:
        sanitize(work, body_el)
        pieces.append(render_children(body_el))

    if summary_el is not None:
        sanitize(work, summary_el)
        inner = render_children(summary_el).strip()
        if inner:
            pieces.append("<h2>Резюме Charter Capital</h2>\n" + inner)

    if faq_html:
        pieces.append(faq_html)

    body_html = "\n".join(p for p in pieces if p and p.strip())
    return "\n".join(blocks) + ("\n" + body_html if body_html else "")


# --------------------------- разбор существующего feed.xml ---------------------------

def parse_existing_feed(path: str):
    with open(path, "r", encoding="utf-8") as fh:
        soup = BeautifulSoup(fh.read(), "xml")

    channel = soup.find("channel")
    items = []
    for it in channel.find_all("item"):
        enc = it.find("enclosure")
        # Тематическую категорию берём первой, игнорируя служебный маркер
        # native-draft (он управляется флагом DRAFT_MODE и проставляется заново).
        topic_category = ""
        for cat in it.find_all("category"):
            text = cat.get_text().strip()
            if text and text != DRAFT_CATEGORY:
                topic_category = text
                break
        items.append({
            "title": it.find("title").get_text() if it.find("title") else "",
            "link": it.find("link").get_text() if it.find("link") else "",
            "guid": it.find("guid").get_text() if it.find("guid") else "",
            "guid_permalink": (it.find("guid").get("isPermaLink") if it.find("guid") else None),
            "pubDate": it.find("pubDate").get_text() if it.find("pubDate") else "",
            "description": it.find("description").get_text() if it.find("description") else "",
            "enclosure_url": enc.get("url") if enc else "",
            "enclosure_type": enc.get("type") if enc else "",
            "category": topic_category,
        })

    header = {
        "title": channel.find("title").get_text() if channel.find("title") else "",
        "link": channel.find("link").get_text() if channel.find("link") else "",
        "description": channel.find("description").get_text() if channel.find("description") else "",
        "language": channel.find("language").get_text() if channel.find("language") else "ru",
        "copyright": channel.find("copyright").get_text() if channel.find("copyright") else "",
    }
    return header, items


def file_for_link(link: str) -> str:
    name = link.rstrip("/").split("/")[-1]
    return os.path.join(JOURNAL_DIR, name)


def xml_escape(s: str) -> str:
    return escape(s or "", {'"': "&quot;"})


def build_feed(header, items, now_rfc822):
    lines = []
    lines.append('<?xml version="1.0" encoding="UTF-8"?>')
    lines.append('<rss version="2.0"')
    lines.append('     xmlns:atom="http://www.w3.org/2005/Atom"')
    lines.append('     xmlns:content="http://purl.org/rss/1.0/modules/content/"')
    lines.append('     xmlns:dc="http://purl.org/dc/elements/1.1/"')
    lines.append('     xmlns:media="http://search.yahoo.com/mrss/"')
    lines.append('     xmlns:yandex="http://news.yandex.ru">')
    lines.append('  <channel>')
    lines.append('    <title>%s</title>' % xml_escape(header["title"]))
    lines.append('    <link>%s</link>' % xml_escape(header["link"]))
    lines.append('    <description>%s</description>' % xml_escape(header["description"]))
    lines.append('    <language>%s</language>' % xml_escape(header["language"]))
    if header.get("copyright"):
        lines.append('    <copyright>%s</copyright>' % xml_escape(header["copyright"]))
    lines.append('    <lastBuildDate>%s</lastBuildDate>' % now_rfc822)
    lines.append('    <generator>Charter Capital · ccapital.pro</generator>')
    lines.append('    <atom:link href="%s/journal/feed.xml" rel="self" type="application/rss+xml" />' % SITE)

    for it in items:
        html_path = file_for_link(it["link"])
        content_html = ""
        if os.path.exists(html_path):
            try:
                content_html = extract_content(html_path)
            except Exception as exc:  # noqa: BLE001
                sys.stderr.write("WARN: не удалось извлечь %s: %s\n" % (html_path, exc))
        else:
            sys.stderr.write("WARN: нет файла %s для %s\n" % (html_path, it["link"]))

        lines.append('    <item>')
        lines.append('      <title>%s</title>' % xml_escape(it["title"]))
        lines.append('      <link>%s</link>' % xml_escape(it["link"]))
        permalink = it.get("guid_permalink")
        if permalink:
            lines.append('      <guid isPermaLink="%s">%s</guid>' % (permalink, xml_escape(it["guid"])))
        else:
            lines.append('      <guid>%s</guid>' % xml_escape(it["guid"]))
        lines.append('      <pubDate>%s</pubDate>' % xml_escape(it["pubDate"]))
        if it["category"]:
            lines.append('      <category>%s</category>' % xml_escape(it["category"]))
        if DRAFT_MODE:
            lines.append('      <category>%s</category>' % DRAFT_CATEGORY)
        if it["enclosure_url"]:
            enc_url = feed_image_url(it["enclosure_url"])
            enc_type = image_mime(enc_url)
            lines.append('      <enclosure url="%s" type="%s" />' % (
                xml_escape(enc_url), xml_escape(enc_type)))
        if it["description"]:
            lines.append('      <description>%s</description>' % xml_escape(it["description"]))
        if content_html:
            lines.append('      <content:encoded><![CDATA[')
            lines.append(content_html)
            lines.append(']]></content:encoded>')
        lines.append('    </item>')

    lines.append('  </channel>')
    lines.append('</rss>')
    return "\n".join(lines) + "\n"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="печать в stdout, без записи")
    args = ap.parse_args()

    header, items = parse_existing_feed(FEED_PATH)
    now_rfc822 = format_datetime(parsedate_to_datetime(items[0]["pubDate"])) if items else ""
    # lastBuildDate берём из самой свежей статьи (первой в ленте) для стабильности.
    out = build_feed(header, items, items[0]["pubDate"] if items else "")

    if args.dry_run:
        sys.stdout.write(out)
    else:
        with open(FEED_PATH, "w", encoding="utf-8") as fh:
            fh.write(out)
        sys.stderr.write("OK: записан %s (%d статей)\n" % (FEED_PATH, len(items)))


if __name__ == "__main__":
    main()
