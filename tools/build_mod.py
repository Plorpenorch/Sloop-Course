#!/usr/bin/env python3
"""The experimental "mirror" firmware: SLOOP's current release + the PANEL push (pull request isod89/sloop-fm1#141).

Run by .github/workflows/sync.yml after the release sync (no AI involved):

1. Clones SLOOP at the release in firmware/manifest.json.
2. If that release already has PANEL (the pull request was merged): removes the mod (firmware/mod.json says merged).
3. Builds the release unchanged first, and checks the package against the published one (same SHA-256 = the
   build here is SLOOP's own).
4. Replays the pull request's commits (Plorpenorch/sloop-fm1, branch panel-push) on the release. A conflict stops
   here: the previous mod stays, the workflow opens an issue.
5. Builds the mod (version string "SLOOP X.Y MIRROR"), runs SLOOP's web tests, builds the virtual FM-1 from it and
   checks the PANEL push (tools/test_mod.mjs).
6. Writes firmware/sloop-X.Y-mirror.fwsc and firmware/mod.json.

python3 tools/build_mod.py [--force]       prints status=built|current|merged|conflict|failed
"""
import hashlib, json, os, re, shutil, subprocess, sys, tempfile, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FW = ROOT / "firmware"
MAN, MOD = FW / "manifest.json", FW / "mod.json"
UPSTREAM = "https://github.com/isod89/sloop-fm1"
FORK, BRANCH = "https://github.com/Plorpenorch/sloop-fm1", "panel-push"
PR = "https://github.com/isod89/sloop-fm1/pull/141"
SDK_TAG = "AC79NN_SDK_V1.2.1_2023-12-13"
SDK_FILES = {          # tools/build.py SDK_SHA256: the three files of JieLi's AC79 SDK (Apache-2.0) the package uses
    "uboot.boot": "4e3b4c220dc96641cb5a723f41e68ce41d5261ae9434bb33fbd7f2c59976ded4",
    "cfg_tool.bin": "276579954f076886a6a7694f65dc71c034a63a2c204b76749065c0ac7b010d1b",
    "cfg/eq_cfg_hw.bin": "41167491bffed4651750719c973d2758adeb9021a5670d02d6a53c85ed80ea7d",
}


def out(status, **kw):
    print(f"status={status}")
    o = os.environ.get("GITHUB_OUTPUT")
    if o:
        with open(o, "a") as f:
            f.write(f"status={status}\n")
            for k, v in kw.items():
                f.write(f"{k}={v}\n")
    sys.exit(0)


def sh(*cmd, cwd=None, check=True, env=None):
    print("$", " ".join(map(str, cmd)), flush=True)
    return subprocess.run(list(map(str, cmd)), cwd=cwd, check=check, env=env)


def git(src, *a, check=True):
    return subprocess.run(["git", "-C", str(src), *a], check=check, capture_output=True, text=True)


def download(url):
    req = urllib.request.Request(url, headers={"User-Agent": "sloop-course-mod"})
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.read()


def deps(work):
    """The JieLi toolchain (tools/get_toolchain.sh) and the three SDK files, checked by their SHA-256."""
    tc = work / "jieli"
    sdk = work / "ac79"
    for rel, sha in SDK_FILES.items():
        url = f"https://gitee.com/Jieli-Tech/fw-AC79_AIoT_SDK/raw/{SDK_TAG}/cpu/wl82/tools/{rel}"
        b = download(url)
        if hashlib.sha256(b).hexdigest() != sha:
            raise SystemExit(f"SDK {rel}: SHA-256 differs from the tested SDK")
        p = sdk / "cpu" / "wl82" / "tools" / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(b)
    return tc, sdk


def build(src, tc_root, sdk):
    env = dict(os.environ, AC79_SDK=str(sdk))
    if not (tc_root / "toolchain" / "pi32v2" / "bin" / "clang").exists():
        sh("sh", src / "tools" / "get_toolchain.sh", tc_root)
    env["JIELI_TOOLCHAIN"] = str(tc_root / "toolchain")
    sh(sys.executable, "tools/build.py", cwd=src, env=env)
    return (src / "build" / "felucca.fwsc").read_bytes()


def product_of(b):                       # web/fm1pkg.js productOf
    s = ""
    for i in range(20):
        m = b[i * 0x30 + 0x2F]
        if m != 0x7D:
            s += chr((m - i - 1) & 0xFF)
    return s


def main():
    force = "--force" in sys.argv
    man = json.loads(MAN.read_text())
    ver, tag = man["version"], man["tag"]
    old = json.loads(MOD.read_text()) if MOD.exists() else {}
    if old.get("base") == ver and old.get("status") in ("built", "merged") and not force:
        print(f"mod: current for SLOOP {ver}")
        out("current")
    work = Path(tempfile.mkdtemp())
    src = work / "sloop"
    sh("git", "clone", "--quiet", UPSTREAM, src)
    git(src, "checkout", "--quiet", tag)
    git(src, "config", "user.name", "sloop-course-mod")
    git(src, "config", "user.email", "actions@users.noreply.github.com")

    # merged: the release has PANEL itself
    if re.search(r"\bED_PANEL\b", (src / "firmware" / "src" / "editor.c").read_text()):
        for f in FW.glob("*-mirror.fwsc"):
            f.unlink()
        MOD.write_text(json.dumps({"status": "merged", "base": ver, "pr": PR}, indent=2) + "\n")
        out("merged", base=ver)

    tc, sdk = deps(work)
    # SLOOP unchanged first: the build here makes SLOOP's own package (or says how it differs)
    official = build(src, tc, sdk)
    pub = (FW / man["file"]).read_bytes()
    same = hashlib.sha256(official).hexdigest() == hashlib.sha256(pub).hexdigest()
    print(f"official rebuild: {'identical to the release' if same else 'DIFFERS from the release'}")
    git(src, "reset", "--hard", "--quiet")
    git(src, "clean", "-fdxq")

    # the pull request's commits, on the release
    git(src, "fetch", "--quiet", FORK, f"{BRANCH}:mod")
    git(src, "fetch", "--quiet", "origin", "main:upmain")
    base = git(src, "merge-base", "mod", "upmain").stdout.strip()
    commits = git(src, "rev-list", "--reverse", f"{base}..mod").stdout.split()
    if not commits:
        raise SystemExit("mod: no commits on the branch")
    for c in commits:
        r = git(src, "cherry-pick", c, check=False)
        if r.returncode:
            files = git(src, "diff", "--name-only", "--diff-filter=U").stdout.split()
            git(src, "cherry-pick", "--abort", check=False)
            print(r.stdout, r.stderr)
            out("conflict", base=ver, files=" ".join(files))
    ui = src / "firmware" / "src" / "ui.c"
    t = ui.read_text()
    t2 = re.sub(r'(#define FELUCCA_VERSION ")SLOOP ([0-9.]+)(")', r"\1SLOOP \2 MIRROR\3", t, count=1)
    if t2 == t:
        raise SystemExit("mod: FELUCCA_VERSION not found in ui.c")
    ui.write_text(t2)

    pkg = build(src, tc, sdk)
    product = product_of(pkg)
    if not re.fullmatch(r"FM-1_9\d\d", product):
        raise SystemExit(f"mod: identity {product!r}")
    sh("node", "web/test_web.mjs", cwd=src)                    # SLOOP's web tests (editor protocol: v13, PANEL = 43)
    emu = work / "emu"
    sh(ROOT / "emu" / "build.sh", src, emu)                     # the virtual FM-1 from the mod: does it push PANEL?
    sh("node", ROOT / "tools" / "test_mod.mjs", emu / "sloop-emu.wasm")

    for f in FW.glob("*-mirror.fwsc"):
        f.unlink()
    name = f"sloop-{ver}-mirror.fwsc"
    (FW / name).write_bytes(pkg)
    mod = {"status": "built", "version": f"{ver} MIRROR", "base": ver, "file": name, "size": len(pkg),
           "sha256": hashlib.sha256(pkg).hexdigest(), "product": product, "pr": PR,
           "branch": f"{FORK}/tree/{BRANCH}", "commits": commits, "officialRebuildIdentical": same}
    MOD.write_text(json.dumps(mod, indent=2) + "\n")
    out("built", base=ver)


if __name__ == "__main__":
    main()
