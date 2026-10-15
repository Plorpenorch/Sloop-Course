#!/usr/bin/env python3
"""Keep the course on SLOOP's newest release (run nightly by .github/workflows/sync.yml; no AI involved).

1. Asks GitHub for SLOOP's latest release (isod89/sloop-fm1).
2. If it is newer than firmware/manifest.json: downloads its .fwsc package unchanged, checks it is an FM-1
   package with SLOOP's update loader (identity FM-1_9xx), and records its size and SHA-256.
3. Builds, from that release's sources, the virtual FM-1 (app/sloop-emu.wasm) and the manual (data/).
4. Writes the manifest; prints `new=<version>` for the workflow, which commits and opens an issue when the
   lessons were written for an older version (course.json "reviewedFor").

python3 tools/sync.py [--force]
"""
import hashlib, json, os, re, shutil, subprocess, sys, tempfile, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPO = "isod89/sloop-fm1"
FW = ROOT / "firmware"
MAN = FW / "manifest.json"

def api(url):
    req = urllib.request.Request(url, headers={"Accept": "application/vnd.github+json", "User-Agent": "sloop-course-sync"})
    tok = os.environ.get("GITHUB_TOKEN")
    if tok: req.add_header("Authorization", "Bearer " + tok)
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)

def download(url):
    req = urllib.request.Request(url, headers={"User-Agent": "sloop-course-sync", "Accept": "application/octet-stream"})
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.read()

def product_of(b):                       # web/fm1pkg.js productOf
    s = ""
    for i in range(20):
        m = b[i * 0x30 + 0x2F]
        if m != 0x7D: s += chr((m - i - 1) & 0xFF)
    return s

def vnum(tag):
    m = re.search(r"(\d+(?:\.\d+)*)", tag)
    return tuple(int(x) for x in m.group(1).split(".")) if m else (0,)

def main():
    force = "--force" in sys.argv
    old = json.loads(MAN.read_text()) if MAN.exists() else {"version": "0"}
    rel = api(f"https://api.github.com/repos/{REPO}/releases/latest")
    tag = rel["tag_name"]
    ver = ".".join(map(str, vnum(tag)))
    if vnum(ver) <= vnum(old["version"]) and not force:
        print(f"up to date: SLOOP {old['version']}")
        return
    assets = [a for a in rel.get("assets", []) if a["name"].lower().endswith(".fwsc")]
    if not assets:
        sys.exit(f"{tag}: no .fwsc package in the release")
    a = assets[0]
    pkg = download(a["browser_download_url"])
    product = product_of(pkg)
    if not re.fullmatch(r"FM-1_9\d\d", product):
        sys.exit(f"{a['name']}: identity {product!r} is not SLOOP's update loader: not mirrored")
    sha = hashlib.sha256(pkg).hexdigest()
    with tempfile.TemporaryDirectory() as tmp:
        src = Path(tmp) / "sloop"
        subprocess.run(["git", "clone", "--depth", "1", "--branch", tag, f"https://github.com/{REPO}", str(src)], check=True)
        subprocess.run([str(ROOT / "emu" / "build.sh"), str(src), str(Path(tmp) / "out")], check=True)
        shutil.copy(Path(tmp) / "out" / "sloop-emu.wasm", ROOT / "app" / "sloop-emu.wasm")
        (ROOT / "app" / "sloop-emu.version").write_text(ver + "\n")
        subprocess.run([sys.executable, str(ROOT / "tools" / "build_docs.py"), str(src), str(ROOT / "data")], check=True)
    for f in FW.glob("*.fwsc"):
        f.unlink()
    name = f"sloop-{ver}.fwsc"
    (FW / name).write_bytes(pkg)
    man = {"version": ver, "tag": tag, "file": name, "size": len(pkg), "sha256": sha, "product": product,
           "published": rel.get("published_at"), "source": a["browser_download_url"], "release": rel.get("html_url"),
           "prerelease": rel.get("prerelease", False), "notes": rel.get("body") or ""}
    MAN.write_text(json.dumps(man, indent=2) + "\n")
    print(f"new={ver}")
    out = os.environ.get("GITHUB_OUTPUT")
    if out:
        with open(out, "a") as f: f.write(f"new={ver}\n")

if __name__ == "__main__":
    main()
