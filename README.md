# SLOOP Course

An interactive course for the **M-VAVE FM-1** running **[SLOOP](https://github.com/isod89/sloop-fm1)**.

- **A virtual FM-1 running the real SLOOP firmware.** SLOOP's C sources are compiled to WebAssembly over an emulated
  FM-1 (screen, keys, knobs, audio: `emu/`). Same screens, same layers, same sounds, in the browser.
- **Lessons that check your work**, on the virtual FM-1 or on yours (Chrome / Edge, USB): the course reads the
  pattern, sounds and settings back through SLOOP's editor protocol.
- **Firmware:** backup (the same file as SLOOP's web editor) and update from the course, with SLOOP's own updater.
- **Always current:** a nightly GitHub Action mirrors SLOOP's newest release unchanged, rebuilds the virtual FM-1 and
  the searchable manual from it, and opens an issue when the lessons need a review. No AI and no server involved.

Open it at the repository's GitHub Pages address. Everything runs in the browser; nothing is sent anywhere.

## Layout

| Path | What |
| --- | --- |
| `index.html`, `app/` | the course (no build step) |
| `app/lessons.js` | the lessons and their checks |
| `emu/` | the emulated FM-1 hardware layer; `emu/build.sh <sloop checkout> <out>` builds `sloop-emu.wasm` (clang + lld) |
| `firmware/` | the mirrored SLOOP package and `manifest.json` (size, SHA-256, identity) |
| `data/` | the manual and release notes, built from SLOOP's docs (`tools/build_docs.py`) |
| `tools/sync.py`, `.github/workflows/sync.yml` | the nightly sync |

## Licence

GPL-3.0, as SLOOP. SLOOP is by isod89, based on Felucca by Leo Kuroshita / Hügelton Instruments; `app/vendor/` holds
SLOOP's updater and package reader unchanged. M-VAVE and FM-1 are trademarks of their owners; this course is not
affiliated with them. SLOOP is beta firmware: install at your own risk.
