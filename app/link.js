// SPDX-License-Identifier: GPL-3.0-only
// The SLOOP editor protocol (SysEx, web/EDITOR_PROTOCOL.md of SLOOP), over any transport: the virtual FM-1
// or a real one on Web MIDI. One request at a time; pushes (CHANGED, RELOAD, STEP_CHANGED, TRACK_CHANGED)
// go to the listeners.
const HDR = [0xF0, 0x7D, 0x46, 0x4C];
export const CMD = { INFO: 1, GET: 2, SET: 3, DUMP: 4, DESC: 5, STEP_GET: 6, STEP_SET: 7, PRESET: 8, PROJECT: 9, NAMES: 10,
  WATCH: 22, CHANGED: 23, RELOAD: 24, PING: 25, STEP_CHANGED: 26, TRACK: 27, TRACK_MIX: 28, TRACK_DUMP: 29, TRACK_STEP: 30,
  TRACK_PARAM: 31, TRACK_CHANGED: 32, DRUM_STEP: 33, LOCK_GET: 37, MICRO_GET: 39, FILL_GET: 41 };
const PUSH = new Set([23, 24, 26, 32]);
export const v14 = (lo, hi) => (lo | hi << 7) - 8192;
export const enc14 = (v) => { const u = (v + 8192) & 0x3FFF; return [u & 0x7F, u >> 7]; };
export const LANES = ['KICK', 'KICK 2', 'SNARE', 'CLAP', 'HAT', 'OPEN HAT', 'PEDAL HAT', 'RIM', 'SNARE 2', 'LOW TOM', 'HI TOM',
  'CRASH', 'RIDE', 'SHAKER', 'CONGA', 'COWBELL'];
export const LEVELS = ['NORM', 'GHOST', 'SOFT', 'HARD'];
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const noteName = (n) => NOTE_NAMES[n % 12] + (Math.floor(n / 12) - 1);
export const noteNum = (s) => { const m = /^([A-G]#?)(-?\d)$/.exec(s); return m ? NOTE_NAMES.indexOf(m[1]) + 12 * (+m[2] + 1) : -1; };

class Reader {
  constructor(b) { this.b = b; this.i = 0; }
  get left() { return this.b.length - this.i; }
  u8() { return this.b[this.i++] ?? 0; }
  v14() { const lo = this.u8(), hi = this.u8(); return v14(lo, hi); }
  str() { let s = ''; while (this.i < this.b.length) { const c = this.b[this.i++]; if (!c) break; s += String.fromCharCode(c); } return s; }
  bits(n) { let v = 0; for (let k = 0; k < n; k++) v += this.u8() * 2 ** (7 * k); return v; }
}

export class SloopLink {
  // transport: { send(bytes), set onSysex(fn) }
  constructor(transport) {
    this.t = transport;
    this.t.onSysex = (b) => this.rx(b);
    this.chain = Promise.resolve();
    this.waiting = null;
    this.listeners = new Set();
    this.descs = null;
  }
  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  rx(b) {
    if (b.length < 6 || b[1] !== 0x7D || b[2] !== 0x46 || b[3] !== 0x4C) return;
    const cmd = b[4], args = b.slice(5, b[b.length - 1] === 0xF7 ? -1 : undefined);
    if (this.waiting && this.waiting.cmd === cmd) { const w = this.waiting; this.waiting = null; w.res(args); return; }
    if (PUSH.has(cmd)) for (const fn of this.listeners) { try { fn(cmd, args); } catch (_) { /* a listener's problem */ } }
  }
  request(cmd, args = [], ms = 800) {
    const run = () => new Promise((res, rej) => {
      const tm = setTimeout(() => { if (this.waiting && this.waiting.cmd === cmd) this.waiting = null; rej(new Error('no reply to ' + cmd)); }, ms);
      this.waiting = { cmd, res: (a) => { clearTimeout(tm); res(a); } };
      this.t.send([...HDR, cmd, ...args, 0xF7]);
    });
    const p = this.chain.then(run, run);
    this.chain = p.catch(() => {});
    return p;
  }
  async info() {
    const r = new Reader(await this.request(CMD.INFO));
    const version = r.str(), nEng = r.u8(), pCount = r.u8(), gCount = r.u8(), nStep = r.u8(), pE0 = r.u8();
    const engines = []; for (let i = 0; i < nEng; i++) engines.push(r.str());
    const ntrk = r.left ? r.u8() : 1, proto = r.left ? r.u8() : 0;
    const m = /(\d+(?:\.\d+)*)/.exec(version);
    this.inf = { version, num: m ? m[1] : '', nEng, pCount, gCount, nStep, pE0, engines, ntrk, proto };
    return this.inf;
  }
  async desc(scope, id) {
    const r = new Reader(await this.request(CMD.DESC, [scope, id]));
    r.u8(); r.u8();
    const d = { scope, id, fmt: r.u8(), min: r.v14(), max: r.v14(), def: r.v14(), label: r.str(), unit: r.str(), names: [] };
    if (d.fmt === 8) while (r.left) d.names.push(r.str());
    return d;
  }
  // every parameter's description, by scope; the engine parameters (P_E0..) are left out (they depend on the engine)
  async loadDescs(cacheKey) {
    if (cacheKey) { try { const c = JSON.parse(localStorage.getItem('sloop-desc-' + cacheKey)); if (c) return (this.descs = c); } catch (_) {} }
    const inf = this.inf || await this.info();
    const p = [], g = [];
    for (let id = 0; id < inf.pE0; id++) p.push(await this.desc(0, id));
    for (let id = 0; id < inf.gCount; id++) g.push(await this.desc(1, id));
    this.descs = { p, g };
    if (cacheKey) { try { localStorage.setItem('sloop-desc-' + cacheKey, JSON.stringify(this.descs)); } catch (_) {} }
    return this.descs;
  }
  // a parameter's id by its label on the device ("LEN", "BPM"); scope 0 track, 1 global
  pid(scope, label, nth = 0) {
    const list = this.descs ? (scope ? this.descs.g : this.descs.p) : [];
    const hits = list.filter((d) => d.label === label);
    return hits[nth] ? hits[nth].id : -1;
  }
  async get(scope, id) { const r = new Reader(await this.request(CMD.GET, [scope, id])); r.u8(); r.u8(); return r.v14(); }
  async trackParam(t, id) { const r = new Reader(await this.request(CMD.TRACK_PARAM, [t, id])); r.u8(); r.u8(); return r.v14(); }
  async tracks() {
    const r = new Reader(await this.request(CMD.TRACK));
    const sel = r.u8(), n = r.u8(), list = [];
    for (let k = 0; k < n; k++) list.push({ engine: r.u8(), preset: r.u8(), level: r.v14(), mute: r.u8(), armed: r.u8() });
    const solo = r.left ? r.u8() : 0;
    return { sel, list, solo };
  }
  async trackDump(t) {
    const r = new Reader(await this.request(CMD.TRACK_DUMP, [t]));
    r.u8(); const engine = r.u8(), preset = r.u8(), p = [];
    while (r.left >= 2) p.push(r.v14());
    return { engine, preset, p };
  }
  async names(engine) {
    const r = new Reader(await this.request(CMD.NAMES, [engine]));
    r.u8(); const n = r.u8(), list = []; for (let i = 0; i < n; i++) list.push(r.str());
    return list;
  }
  async trackStep(t, i) {
    const r = new Reader(await this.request(CMD.TRACK_STEP, [t, i]));
    r.u8(); r.u8();
    const n = r.u8(), notes = [r.u8(), r.u8(), r.u8(), r.u8()].slice(0, n), time = r.u8(), flags = r.u8(), vel = r.u8();
    let lvl = 0, rat = 0;
    if (r.left >= 3) { lvl = r.u8(); const hi = r.u8(); rat = r.u8(); lvl |= (hi & 1) << 7; rat |= (hi & 2) << 6; }
    return { notes: time === 0 ? notes : [], time, flags, vel, lvl, rat };
  }
  async drumStep(i) {
    const r = new Reader(await this.request(CMD.DRUM_STEP, [i]));
    r.u8();
    const on = r.bits(3), lvl = r.bits(5), rat = r.bits(5);
    const hits = [];
    for (let l = 0; l < 16; l++) if (on & (1 << l)) hits.push({ lane: l, level: Math.floor(lvl / 4 ** l) & 3, rat: Math.floor(rat / 4 ** l) & 3 });
    return hits;
  }
  async project(op, slot) { const r = new Reader(await this.request(CMD.PROJECT, [op, slot], 3000)); return { op: r.u8(), slot: r.u8(), used: r.u8() }; }
  async watch(on) { const r = await this.request(CMD.WATCH, [on]); return r[0]; }
  async ping() { return this.request(CMD.PING, [], 500); }
}

// SysEx bytes <-> USB-MIDI event packets (the virtual FM-1 speaks packets, as its USB does)
export function sysexToPackets(bytes) {
  const out = [];
  for (let i = 0; i < bytes.length;) {
    const k = Math.min(3, bytes.length - i), end = i + k >= bytes.length;
    const cin = !end ? 4 : k === 1 ? 5 : k === 2 ? 6 : 7;
    out.push((cin | bytes[i] << 8 | (k > 1 ? bytes[i + 1] << 16 : 0) | (k > 2 ? bytes[i + 2] << 24 : 0)) >>> 0);
    i += k;
  }
  return out;
}
export class PacketSysex {
  constructor(onSysex) { this.buf = null; this.onSysex = onSysex; }
  packet(p) {
    const cin = p & 15, b = [(p >>> 8) & 255, (p >>> 16) & 255, (p >>> 24) & 255];
    if (cin < 4 || cin > 7) return false;
    const n = cin === 4 || cin === 7 ? 3 : cin === 6 ? 2 : 1;
    for (let k = 0; k < n; k++) {
      if (b[k] === 0xF0) this.buf = [];
      if (this.buf) this.buf.push(b[k]);
      if (b[k] === 0xF7 && this.buf) { const s = this.buf; this.buf = null; this.onSysex(s); }
    }
    return true;
  }
}
