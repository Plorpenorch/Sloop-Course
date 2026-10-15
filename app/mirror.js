// SPDX-License-Identifier: GPL-3.0-only
// Mirror: the virtual FM-1 follows your FM-1. A full copy first (every track's sound and parameters, the
// patterns, the drum kit, the selected track, the global settings), then every change the FM-1 reports
// (WATCH pushes), and the notes its keys send. What the editor protocol does not report (the page or layer
// on screen, PLAY / STOP) cannot be mirrored.
import { CMD, enc14, SloopLink } from './link.js';

// globals that are actions or FM-1 settings, never copied (they would act on the virtual one)
const GM_LANES = [36, 35, 38, 39, 42, 46, 44, 37, 40, 43, 48, 49, 51, 70, 63, 56];
const WHITE = [0, 2, 4, 6, 7, 9, 11, 12, 14, 16, 18, 19, 21, 23, 24, 26];
const KNOB_OF = { LVL: 4, LEN: 5, PAN: 6, BPM: 0 };   // as the TRACKS screen has them (KNOB 2-4, SELECT); SWG: KNOB 1
const SKIP_G = new Set(['SLOT', 'NAME', 'LOAD', 'SAVE', 'ENG', 'SET', 'CLRSQ', 'INIT', 'NEW', 'SYNC', 'IN', 'OUT', 'CPU']);

export class Mirror extends EventTarget {
  constructor(app) { super(); this.app = app; this.on = false; this.busy = false; this.queue = Promise.resolve(); }
  get hw() { return this.app.hw.link; }
  get vl() { return this.app.virt.link; }
  status(text) { this.text = text; this.dispatchEvent(new Event('status')); }

  async start() {
    if (this.on) return;
    if (!this.app.virt.on) await this.app.powerOn();
    if (!this.hw || !this.vl) throw new Error('Connect your FM-1 first.');
    this.on = true;
    this.status('Mirror: starting the virtual FM-1…');
    await this.app.virt.booted;            // (its saved work comes back first, then the copy goes over it)
    this.app.virt.mute(true);
    this.off = this.hw.on((cmd, args) => this.push(cmd, args));
    this.onMidi = (ev) => this.note(ev.data);
    this.app.hw.addEventListener('midi', this.onMidi);
    await this.fullSync();
    this.panelOn = (this.hw.inf.proto || 0) >= 11;
    if (this.panelOn) { try { this.pn = SloopLink.panel(await this.hw.request(CMD.PANEL)); } catch (_) { this.panelOn = false; } }
    this.status(this.panelOn ? 'Mirroring your FM-1: screen, keys, knobs and buttons' : 'Mirroring your FM-1 (sounds, patterns, notes; this SLOOP does not report its buttons)');
  }
  stop() {
    if (!this.on) return;
    this.on = false;
    if (this.off) this.off();
    this.app.hw.removeEventListener('midi', this.onMidi);
    this.app.virt.mute(false);
    this.status('');
  }
  run(fn) { this.queue = this.queue.then(fn).catch((e) => this.status('Mirror: ' + e.message)); return this.queue; }

  async ready() {
    for (const l of [this.hw, this.vl]) { if (!l.inf) await l.info(); if (!l.descs) await l.loadDescs('v' + l.inf.version + '-' + l.inf.pCount + '-' + l.inf.gCount); }
    if (this.hw.inf.pCount !== this.vl.inf.pCount) throw new Error(`your FM-1 runs SLOOP ${this.hw.inf.num}, the virtual one ${this.vl.inf.num}: update your FM-1 to mirror it`);
  }
  // one track: its sound (engine + preset), then every parameter, then its steps
  async copyTrack(t, withSteps = true) {
    const hw = this.hw, vl = this.vl, inf = this.hw.inf;
    const d = await hw.trackDump(t);
    if (t < 3 && d.engine < inf.nEng) {
      const sel = (await vl.tracks()).sel;
      await vl.request(CMD.TRACK, [t]);
      await vl.request(CMD.PRESET, [d.engine, d.preset]);
      await vl.request(CMD.TRACK, [sel]);
    }
    for (let id = 0; id < d.p.length; id++) await vl.request(CMD.TRACK_PARAM, [t, id, ...enc14(d.p[id])]);
    if (!withSteps) return;
    const len = d.p[hw.pid(0, 'LEN')] || 64;
    for (let i = 0; i < len; i++) await this.copyStep(t, i);
  }
  async copyStep(t, i) {
    if (t === 3) { const a = await this.hw.request(CMD.DRUM_STEP, [i]); await this.vl.request(CMD.DRUM_STEP, a); }
    else { const a = await this.hw.request(CMD.TRACK_STEP, [t, i]); await this.vl.request(CMD.TRACK_STEP, a); }
  }
  async copyGlobals() {
    const hw = this.hw, vl = this.vl;
    for (const d of hw.descs.g) {
      if (SKIP_G.has(d.label)) continue;
      const v = await hw.get(1, d.id);
      await vl.request(CMD.SET, [1, d.id, ...enc14(v)]);
    }
  }
  async fullSync() {
    return this.run(async () => {
      this.busy = true;
      await this.ready();
      this.status('Mirror: copying your FM-1…');
      await this.copyGlobals();
      for (let t = 0; t < 4; t++) { this.status(`Mirror: copying track ${t + 1} of 4…`); await this.copyTrack(t); }
      const sel = (await this.hw.tracks()).sel;
      await this.vl.request(CMD.TRACK, [sel]);
      this.lastSel = sel;
      this.busy = false;
      this.status('Mirroring your FM-1');
    });
  }
  // a change on your FM-1
  push(cmd, a) {
    if (!this.on) return;
    if (cmd === CMD.PANEL) { if (!this.busy) this.panel(SloopLink.panel(a)); return; }
    if (cmd === CMD.CHANGED) {
      const [scope, id, lo, hi] = a;
      this.knob(scope, id, (lo | hi << 7) - 8192);
      this.run(async () => {
        if (scope === 1) { const d = this.hw.descs && this.hw.descs.g[id]; if (!d || SKIP_G.has(d.label)) return; await this.vl.request(CMD.SET, [1, id, lo, hi]); }
        else { const sel = (await this.hw.tracks()).sel; await this.vl.request(CMD.TRACK_PARAM, [sel, id, lo, hi]); }
      });
    } else if (cmd === CMD.TRACK_CHANGED) {
      const [t, id, lo, hi] = a;
      this.knob(0, id, (lo | hi << 7) - 8192);
      this.run(() => this.vl.request(CMD.TRACK_PARAM, [t, id, lo, hi]));
    } else if (cmd === CMD.STEP_CHANGED) {
      const i = a[0];
      this.run(async () => { const t = a.length > 1 ? a[1] : (await this.hw.tracks()).sel; await this.copyStep(t, i); });
    } else if (cmd === CMD.RELOAD) {
      // a track selected, a sound or a project loaded: the selection, and that track again (gathered: a
      // project load reloads several in a row)
      this.reloads = this.reloads || new Set();
      this.reloads.add(a.length > 2 ? a[2] : -1);
      if (a.length > 2 && !this.panelOn) {                  // ALGORITHM (another track) or PRESETS (another sound)
        const role = this.lastSel !== undefined && a[2] !== this.lastSel ? 1 : 2;
        this.app.panel?.remoteKnob(role, role === 1 ? Math.sign(a[2] - this.lastSel) : 1);
        this.lastSel = a[2];
      }
      clearTimeout(this.reloadT);
      this.reloadT = setTimeout(() => this.run(async () => {
        const list = [...this.reloads]; this.reloads.clear();
        const sel = (await this.hw.tracks()).sel;
        for (const t of new Set(list.map((x) => (x < 0 ? sel : x)))) await this.copyTrack(t, true);
        await this.vl.request(CMD.TRACK, [sel]);
      }), 150);
    }
  }
  knob(scope, id, v) {
    if (this.panelOn) return;                            // (v11: the real detents come with PANEL)
    const descs = this.hw && this.hw.descs; if (!descs) return;
    const d = (scope ? descs.g : descs.p)[id]; if (!d) return;
    const key = scope + ':' + id, prev = (this.vals = this.vals || {})[key]; this.vals[key] = v;
    const dir = prev === undefined ? 1 : Math.sign(v - prev) || 1;
    let role = scope ? (d.label === 'BPM' ? 0 : -1) : KNOB_OF[d.label];
    if (!scope && d.label === 'SWG' && id === this.hw.pid(0, 'LEN') + 2) role = 3;
    if (role !== undefined && role >= 0) this.app.panel?.remoteKnob(role, dir);
  }
  // v11: your FM-1's hands on the virtual one: the same buttons, keys and knob detents, so it walks the same pages
  panel(p) {
    const v = this.app.virt, panel = this.app.panel, prev = this.pn || { buttons: 0, keys: 0 };
    this.panelOn = true;
    for (let b = 0; b < 14; b++) {
      const was = (prev.buttons >> b) & 1, now = (p.buttons >> b) & 1;
      if (was !== now) { v.button(b, !!now); panel?.remoteBtn(b, !!now); }
    }
    for (let k = 0; k < 27; k++) {
      const was = Math.floor(prev.keys / 2 ** k) & 1, now = Math.floor(p.keys / 2 ** k) & 1;
      if (was !== now) { v.note(k, !!now); panel?.remoteKey(k, !!now); }
    }
    p.knobs.forEach((n, role) => { if (n) { v.turn(role, n); panel?.remoteKnob(role, Math.sign(n)); } });
    this.pn = p;
    this.status('Mirroring your FM-1 · ' + (p.menu ? 'menu' : p.title || 'TRACKS') + (p.playing ? ' · playing' : ''));
  }
  // the notes your FM-1's keys send: played on the virtual one too (its screen and keys light up)
  note(d) {
    if (!this.on || this.busy || this.panelOn) return;     // (v11: the keys come with PANEL)
    const st = d[0] & 0xF0;
    if (st !== 0x90 && st !== 0x80 && st !== 0xB0 && st !== 0xE0) return;
    const pkt = ((st >> 4) | d[0] << 8 | (d[1] || 0) << 16 | (d[2] || 0) << 24) >>> 0;
    this.app.virt.midiIn([pkt]);
    if (st === 0x90 || st === 0x80) {                    // the key on the drawing, held as long as yours
      const down = st === 0x90 && d[2] > 0;
      let k;
      if ((d[0] & 15) === 9) { const lane = GM_LANES.indexOf(d[1]); k = lane < 0 ? -1 : WHITE[lane]; }
      else { k = d[1] - 53; while (k < 0) k += 12; while (k > 26) k -= 12; }
      if (k >= 0) this.app.panel?.remoteKey(k, down);
    }
  }
}
