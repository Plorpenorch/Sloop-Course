#!/usr/bin/env python3
"""The searchable manual and the release notes, from a SLOOP checkout's own docs.

python3 tools/build_docs.py <sloop-fm1 checkout> <out dir (data/)>
  manual.json   every section of SLOOP.md and GUIDE.md: {doc, id, title, level, html, text}
  whatsnew.json the "New in x.y" sections of SLOOP.md: [{version, html}]
"""
import json, re, sys
from pathlib import Path
import markdown

SRC, OUT = Path(sys.argv[1]), Path(sys.argv[2])
REPO = "https://github.com/isod89/sloop-fm1/blob/main/"
md = markdown.Markdown(extensions=["tables", "fenced_code", "sane_lists"])

def slug(s):
    s = re.sub(r"[^\w\s-]", "", s.lower()).strip()
    return re.sub(r"\s+", "-", s)

def html_of(text, doc):
    md.reset()
    h = md.convert(text)
    h = re.sub(r'<img[^>]*>', '', h)                                   # (the repo's pictures stay on GitHub)
    h = re.sub(r'href="#([^"]+)"', lambda m: f'href="#manual/{doc}/{m.group(1)}"', h)
    h = re.sub(r'href="(?!https?:|#|mailto:)([^"]+)"', lambda m: f'href="{REPO}{m.group(1)}" target="_blank" rel="noopener"', h)
    return h

def plain(text):
    t = re.sub(r"[*_`|#>]", " ", text)
    t = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", t)
    return re.sub(r"\s+", " ", t).strip()

def sections(path, doc):
    lines = path.read_text(encoding="utf-8").splitlines()
    out, cur = [], None
    for ln in lines:
        m = re.match(r"^(#{2,3}) (.+)$", ln)
        if m:
            if cur: out.append(cur)
            title = m.group(2).strip()
            cur = {"doc": doc, "id": slug(title), "title": re.sub(r"[*`]", "", title), "level": len(m.group(1)), "body": []}
        elif cur is not None:
            cur["body"].append(ln)
    if cur: out.append(cur)
    res = []
    for s in out:
        body = "\n".join(s.pop("body")).strip()
        if not body or s["title"].lower() == "contents": continue
        s["html"] = html_of(body, doc)
        s["text"] = plain(body)
        res.append(s)
    return res

manual = sections(SRC / "SLOOP.md", "sloop") + sections(SRC / "GUIDE.md", "guide")
version = re.search(r"^# SLOOP ([\d.]+)", (SRC / "SLOOP.md").read_text(encoding="utf-8"), re.M).group(1)
whatsnew = []
for s in sections(SRC / "SLOOP.md", "sloop"):
    m = re.match(r"New in ([\d.]+)", s["title"])
    if m: whatsnew.append({"version": m.group(1), "html": s["html"]})
OUT.mkdir(parents=True, exist_ok=True)
(OUT / "manual.json").write_text(json.dumps({"version": version, "sections": manual}, ensure_ascii=False), encoding="utf-8")
(OUT / "whatsnew.json").write_text(json.dumps({"version": version, "releases": whatsnew}, ensure_ascii=False), encoding="utf-8")
print(f"manual: {len(manual)} sections, SLOOP {version}; whatsnew: {[w['version'] for w in whatsnew]}")
