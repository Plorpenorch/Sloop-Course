// SPDX-License-Identifier: GPL-3.0-only
// Firmware: what is current (firmware/manifest.json, mirrored nightly from SLOOP's releases), a backup of
// the FM-1 (the editor's own format), and the update, with SLOOP's own updater (vendor/fm1ota.js).
import { Updater } from './vendor/fm1ota.js';
import { productOf, logicalImage, sha256hex } from './vendor/fm1pkg.js';
import { CMD } from './link.js';

export async function manifest() {
  const r = await fetch(new URL('../firmware/manifest.json', import.meta.url), { cache: 'no-cache' });
  if (!r.ok) throw new Error('no firmware manifest');
  return r.json();
}
// the experimental mirror build (tools/build_mod.py): firmware/mod.json
export async function modManifest() {
  const r = await fetch(new URL('../firmware/mod.json', import.meta.url), { cache: 'no-cache' });
  if (!r.ok) return null;
  return r.json();
}
export function cmpVersion(a, b) {
  const pa = String(a).split('.').map(Number), pb = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) { const d = (pa[i] || 0) - (pb[i] || 0); if (d) return Math.sign(d); }
  return 0;
}

// ---- backup (read only): the same JSON file as SLOOP's web editor writes, so its Restore reads it
const u35enc = (v) => { v >>>= 0; return [0, 1, 2, 3, 4].map((k) => Math.floor(v / 2 ** (7 * k)) & 0x7F); };
function unpack7(a) {
  const out = [];
  for (let i = 0; i < a.length; i += 8) { const top = a[i]; for (let j = 0; j < 7 && i + 1 + j < a.length; j++) out.push(a[i + 1 + j] | (((top >> j) & 1) << 7)); }
  return Uint8Array.from(out);
}
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
export function crc32(b) { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
function b64(b) { let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(s); }

export async function backup(link, progress = () => {}) {
  const info = link.inf || await link.info();
  const L = await link.request(34, [], 5000);
  let i = 0; const rc = L[i++], n = L[i++], items = [];
  const u35 = () => { let v = 0; for (let k = 0; k < 5; k++) v += L[i++] * 2 ** (7 * k); return v >>> 0; };
  if (rc) throw new Error(rc === 4 ? 'This FM-1 has no flash to back up.' : `The FM-1 refused the backup (rc ${rc}).`);
  for (let k = 0; k < n; k++) items.push({ id: L[i++], len: u35(), crc: u35() });
  const total = items.reduce((s, it) => s + it.len, 0), objects = [];
  let done = 0;
  for (const it of items) {
    const data = new Uint8Array(it.len);
    for (let off = 0; off < it.len; off += 256) {
      const c = Math.min(256, it.len - off);
      let g, tries = 0;
      for (;;) {
        try { g = await link.request(35, [it.id & 0x7F, ...u35enc(off), c & 0x7F, (c >> 7) & 0x7F], 1500); break; }
        catch (e) { if (++tries > 2) throw e; }
      }
      if (g[1]) throw new Error(g[1] === 5 ? 'The FM-1 changed during the backup: try again.' : `Backup read failed (object ${it.id}).`);
      const d = unpack7(g.slice(9));
      if (d.length !== c) throw new Error(`Backup read failed (object ${it.id}, ${d.length} bytes).`);
      data.set(d, off); done += c; progress(done, total);
    }
    if (crc32(data) !== it.crc) throw new Error('The FM-1 changed during the backup: try again.');
    objects.push({ id: it.id, len: it.len, crc: it.crc, data: b64(data) });
  }
  return { format: 'sloop-backup', version: 1, firmware: info.version, date: new Date().toISOString(), objects };
}

// ---- the update: the package from this site, checked, then SLOOP's updater
export async function fetchPackage(man) {
  const r = await fetch(new URL('../firmware/' + man.file, import.meta.url));
  if (!r.ok) throw new Error('could not download the package');
  const bytes = new Uint8Array(await r.arrayBuffer());
  if (bytes.length !== man.size) throw new Error('the package has the wrong size: not installed');
  if (await sha256hex(bytes) !== man.sha256) throw new Error('the package failed its SHA-256 check: not installed');
  const product = productOf(bytes);
  if (product !== man.product || !/^FM-1_9\d\d$/.test(product)) throw new Error(`unexpected package identity ${product}: not installed`);
  return { product, image: logicalImage(bytes) };
}
export async function install(access, pkg, onStep) {
  const up = new Updater(access);
  if (await up.resume(pkg.image, onStep)) return 'resumed';
  return up.install(pkg.image, pkg.product, onStep);
}
export const STEP_TEXT = {
  start: 'Talking to the FM-1', verify: 'The FM-1 is checking the package', loader: 'Starting the update loader',
  write: 'Writing the firmware', reboot: 'The FM-1 is restarting', done: 'Done',
};
