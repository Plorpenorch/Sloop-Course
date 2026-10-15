// SPDX-License-Identifier: GPL-3.0-only
// What the lessons can ask about the FM-1 being checked (virtual or yours). Reads go through the editor
// protocol and are cached for one check pass; the virtual FM-1 also says where its screen is.
import { LANES, LEVELS, noteNum } from './link.js';

const KITS = ['ACOUSTIC', 'DEEP', 'TIGHT', 'BRIGHT', 'DUST', '808', '909', '606', '80S', 'VINTAGE', 'TRAP', 'DRILL', 'BOOMBAP', 'LO-FI',
  'PHONK', 'HOUSE', 'D.HOUSE', 'TECHNO', 'MINIMAL', 'ELECTRO', 'DISCO', 'GARAGE', 'JUNGLE', 'DUBSTEP', 'DEMBOW', 'AMAPIANO', 'AFRO',
  'LATIN', 'TRIBAL', 'SYNTHWV', 'CHIP', 'ARCADE', 'GLITCH', 'INDUSTR', 'HYPER', 'AMBIENT', 'JAZZ', 'USR1', 'USR2', 'USR3', 'USR4',
  'USR3+4', 'SYN1', 'SYN2', 'SYN3', 'SYN4'];
export const LAYERS = ['', 'FX', 'ERASE', 'ROLL', 'STEP', 'SCALE', 'MIX', 'SONG'];   // emu_layer() - 1 = LY_*

export class DeviceState {
  constructor(app) {
    this.app = app;
    this.events = [];          // {t, what, id, down, steps}: inputs since the lesson step began
    this.seen = { layers: new Set(), locked: new Set(), playing: false };
    this.flags = {};
    this.names = new Map();
    this.cache = new Map();
  }
  get dev() { return this.app.checked(); }
  get link() { const d = this.dev; return d && d.link; }
  get virtOn() { return this.app.virt.on; }
  get hwOn() { return this.app.hw.state === 'on'; }
  get stat() { return this.app.virt.stat; }
  hwCurrent() { const m = this.app.manifest, i = this.app.hw.info; return !!(m && i && this.app.cmpVersion(i.num, m.version) >= 0); }
  flag(name) { return !!this.flags[name]; }
  newPass() { this.cache.clear(); }
  resetSeen() { this.events = []; this.seen = { layers: new Set(), locked: new Set(), playing: false }; }
  record(ev) { this.events.push({ t: performance.now(), ...ev }); if (this.events.length > 400) this.events.splice(0, 100); }
  observe() {                 // called on every stat from the virtual FM-1
    const s = this.stat, v = this.app.virt;
    if (s.layer) {
      const name = LAYERS[s.layer - 1] || '';
      this.seen.layers.add(name);
      const btn = { FX: 'b0', ERASE: 'b4', ROLL: 'b8', STEP: 'b9', SCALE: 'b1', MIX: 'b5', SONG: 'b7' }[name];
      if (btn && !v.held.has(btn)) this.seen.locked.add(name);
    }
    if (s.playing) this.seen.playing = true;
  }
  // ---- events (both FM-1s: the virtual panel, or the notes your FM-1 sends)
  playedNote() { return this.events.some((e) => e.what === 'note' && e.down); }
  playedDrum(lanes) { return this.events.some((e) => e.what === 'drum' && lanes.includes(e.lane)); }
  turned(role) { return this.events.some((e) => e.what === 'knob' && e.id === role); }
  sawLayer(name) { return this.seen.layers.has(name === 'FX' ? 'FX' : name); }
  sawLocked(name) { return this.seen.locked.has(name); }
  sawPlaying() { return this.seen.playing || (this.app.checkedKind() === 'virtual' && !!this.stat.playing); }
  // ---- reads
  async once(key, fn) { if (!this.cache.has(key)) this.cache.set(key, fn().catch((e) => { this.cache.delete(key); throw e; })); return this.cache.get(key); }
  async ready() {
    const l = this.link;
    if (!l) throw new Error('no device');
    if (!l.inf) await l.info();
    if (!l.descs) await l.loadDescs('v' + l.inf.version + '-' + l.inf.pCount + '-' + l.inf.gCount);
    return l;
  }
  async tracks() { const l = await this.ready(); return this.once('tracks', () => l.tracks()); }
  async sel() { return (await this.tracks()).sel; }
  async bpm() { return this.g('BPM'); }
  async dump(t) { const l = await this.ready(); return this.once('dump' + t, () => l.trackDump(t)); }
  pidOf(label) {
    const l = this.link;
    if (label === 'SWG') return l.pid(0, 'LEN') + 2;             // the pattern's swing (the arp has one too)
    return l.pid(0, label);
  }
  async p(t, label) { await this.ready(); const id = this.pidOf(label); return (await this.dump(t)).p[id]; }
  async pname(t, label) {
    const l = await this.ready(), id = this.pidOf(label), d = l.descs.p[id], v = (await this.dump(t)).p[id];
    return d && d.names.length ? d.names[v - d.min] : String(v);
  }
  async g(label) { const l = await this.ready(); const id = l.pid(1, label); return this.once('g' + id, () => l.get(1, id)); }
  async gname(label) { const l = await this.ready(), d = l.descs.g[l.pid(1, label)]; const v = await this.g(label); return d.names.length ? d.names[v - d.min] : String(v); }
  async gpct(label) { const l = await this.ready(), d = l.descs.g[l.pid(1, label)]; return Math.round((await this.g(label)) * 100 / d.max); }
  async preset(t) {
    const l = await this.ready(), tr = (await this.tracks()).list[t];
    if (tr.engine >= l.inf.nEng) return '';
    if (!this.names.has(tr.engine)) this.names.set(tr.engine, await l.names(tr.engine));
    return this.names.get(tr.engine)[tr.preset] || '';
  }
  async kit() { const l = await this.ready(); const v = (await this.dump(3)).p[l.inf.pE0]; return KITS[v] || String(v); }
  async drums(n = 16) {
    const l = await this.ready();
    return this.once('drums' + n, async () => { const out = []; for (let i = 0; i < n; i++) out.push(await l.drumStep(i)); return out; });
  }
  async laneSteps(name, n = 16) {
    const lane = LANES.indexOf(name), d = await this.drums(n);
    return d.map((hits, i) => (hits.some((h) => h.lane === lane) ? i + 1 : 0)).filter(Boolean);
  }
  async laneIs(name, steps, n = 16) { const s = await this.laneSteps(name, n); return s.length === steps.length && steps.every((x) => s.includes(x)); }
  async hit(name, step) { const lane = LANES.indexOf(name), d = await this.drums(Math.max(16, step)); return d[step - 1].find((h) => h.lane === lane) || null; }
  async levelsAre(map, n = 16) {
    const d = await this.drums(n);
    for (const [name, lvl] of Object.entries(map)) {
      const lane = LANES.indexOf(name), want = LEVELS.indexOf(lvl);
      const hits = d.flatMap((s) => s.filter((h) => h.lane === lane));
      if (!hits.length || !hits.every((h) => h.level === want)) return false;
    }
    return true;
  }
  async steps(t, n) {
    const l = await this.ready();
    return this.once('steps' + t + '-' + n, async () => { const out = []; for (let i = 0; i < n; i++) out.push((await l.trackStep(t, i)).notes); return out; });
  }
  // a chord on the steps (1-based): the same notes, or (any octave, any voicing) the same pitch classes
  async chordAt(t, steps, names) {
    const s = await this.steps(t, Math.max(...steps));
    const want = [...new Set(names.map((x) => noteNum(x) % 12))].sort().join();
    return steps.every((i) => s[i - 1].length >= 3 && [...new Set(s[i - 1].map((x) => x % 12))].sort().join() === want);
  }
  async noteAt(t, steps, name) {
    const s = await this.steps(t, Math.max(...steps)), n = noteNum(name);
    return steps.every((i) => s[i - 1].length === 1 && s[i - 1][0] % 12 === n % 12);
  }
  async melody(t, map) {
    const steps = Object.keys(map).map(Number), s = await this.steps(t, Math.max(...steps));
    return steps.every((i) => s[i - 1].length === 1 && s[i - 1][0] % 12 === noteNum(map[i]) % 12);
  }
  async emptyProject() {
    const d = await this.drums(16);
    if (d.some((x) => x.length)) return false;
    for (let t = 0; t < 3; t++) { const s = await this.steps(t, 16); if (s.some((x) => x.length)) return false; }
    return true;
  }
  async slotUsed(k) { const l = await this.ready(); return this.once('slot' + k, async () => (await l.project(2, k)).used === 1); }
}
