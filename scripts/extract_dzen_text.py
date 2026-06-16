#!/usr/bin/env python3
"""Extract clean plain-text (title + body) from journal article HTML for Dzen paste.

Captures only meaningful content: h1 (title); lede, body, summary-box, faq-section.
Skips CTAs/nav/related blocks. Outputs JSON per slug to /tmp/dzen/<slug>.json
"""
import json, os, re, sys
from html.parser import HTMLParser

WANT = {"lede-paragraph", "body", "summary-box", "faq-section"}
SKIP = {"inline-cta", "next-step", "more-reads", "tag-row", "tg-digest",
        "bottom-nav", "breadcrumb", "article-meta", "img-credit", "channels",
        "case-box"}
BLOCK = {"p", "h2", "h3", "h4", "li", "summary"}


class Extractor(HTMLParser):
    def __init__(self):
        super().__init__()
        self.stack = []          # list of (tag, classes)
        self.want_depth = 0
        self.skip_depth = 0
        self.in_h1 = False
        self.title_parts = []
        self.blocks = []
        self.cur = []
        self.cur_is_li = False
        self.cur_is_label = False

    def _classes(self, attrs):
        for k, v in attrs:
            if k == "class":
                return set(v.split())
        return set()

    def handle_starttag(self, tag, attrs):
        cls = self._classes(attrs)
        self.stack.append((tag, cls))
        if tag == "h1":
            self.in_h1 = True
            return
        if cls & SKIP:
            self.skip_depth += 1
        if cls & WANT:
            self.want_depth += 1
        capturing = self.want_depth > 0 and self.skip_depth == 0
        if capturing and tag in BLOCK:
            self._flush()
            self.cur_is_li = (tag == "li")
        if capturing and tag == "div" and ("faq-a" in cls):
            self._flush()
        if capturing and tag == "span" and ("label" in cls):
            self._flush()
            self.cur_is_label = True

    def handle_endtag(self, tag):
        # pop matching
        for i in range(len(self.stack) - 1, -1, -1):
            if self.stack[i][0] == tag:
                _, cls = self.stack.pop(i)
                break
        else:
            cls = set()
        if tag == "h1":
            self.in_h1 = False
            return
        capturing = self.want_depth > 0 and self.skip_depth == 0
        if capturing and (tag in BLOCK or (tag == "div" and "faq-a" in cls) or (tag == "span" and "label" in cls)):
            self._flush()
        if cls & WANT and self.want_depth > 0:
            self.want_depth -= 1
        if cls & SKIP and self.skip_depth > 0:
            self.skip_depth -= 1

    def handle_data(self, data):
        if self.in_h1:
            self.title_parts.append(data)
            return
        if self.want_depth > 0 and self.skip_depth == 0:
            self.cur.append(data)

    def _flush(self):
        txt = "".join(self.cur)
        txt = txt.replace("\u00a0", " ")
        txt = re.sub(r"\s+", " ", txt).strip()
        if txt:
            if self.cur_is_li:
                txt = "— " + txt
            self.blocks.append(txt)
        self.cur = []
        self.cur_is_li = False
        self.cur_is_label = False

    def title(self):
        t = "".join(self.title_parts).replace("\u00a0", " ")
        return re.sub(r"\s+", " ", t).strip()

    def body(self):
        # strip leading section numbers like "01", "02" left from h2-num spans
        out = []
        for b in self.blocks:
            b = re.sub(r"^\d{1,2}\s*(?=[А-ЯA-Z«])", "", b)
            out.append(b)
        return "\n\n".join(out)


def process(path):
    with open(path, encoding="utf-8") as f:
        html = f.read()
    p = Extractor()
    p.feed(html)
    return p.title(), p.body()


def main():
    root = "/Users/ktel25/Documents/charter-capital/journal"
    slugs = [
        "caixa-portugal-zakrytie-schetov-2026",
        "eu-sanctions-15-june-2026",
        "hongkong-banks-uae-transit-compliance-2026",
        "gotovyy-biznes-v-evrope-substance-2026",
        "uk-sankcii-wildberries-yandex-bank-2026",
    ]
    os.makedirs("/tmp/dzen", exist_ok=True)
    for s in slugs:
        path = os.path.join(root, s + ".html")
        title, body = process(path)
        with open(f"/tmp/dzen/{s}.json", "w", encoding="utf-8") as f:
            json.dump({"slug": s, "title": title, "body": body}, f, ensure_ascii=False)
        print(f"{s}\n  title({len(title)}): {title[:90]}\n  body chars: {len(body)} | blocks: {body.count(chr(10)+chr(10))+1}\n")


if __name__ == "__main__":
    main()
