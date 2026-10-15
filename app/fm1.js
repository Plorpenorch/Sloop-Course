// SPDX-License-Identifier: GPL-3.0-only
// The virtual FM-1 on the page: SLOOP's firmware in an AudioWorklet (worklet.js), its screen on a canvas,
// and a panel you play with the mouse, touch or the computer keyboard.
import { SloopLink, sysexToPackets, PacketSysex } from './link.js';

export const BUTTONS = ['FX', 'SEL', 'ENV', 'LFO', 'EDIT', 'GLO', 'HOME', 'SAVE', 'ARP', 'SEQ', 'PLAY', 'REC', 'OCT−', 'OCT+'];
export const B = Object.fromEntries(BUTTONS.map((n, i) => [n.replace('−', '-'), i]));
export const KNOBS = ['SELECT', 'ALGORITHM', 'PRESETS', 'KNOB 1', 'KNOB 2', 'KNOB 3', 'KNOB 4'];
export const K = { SELECT: 0, ALGORITHM: 1, PRESETS: 2, K1: 3, K2: 4, K3: 5, K4: 6 };
// the 27 keys, F3..G5 (key index 0..26 = MIDI 53..79)
export const KEY_NAMES = Array.from({ length: 27 }, (_, k) => ['F', 'F#', 'G', 'G#', 'A', 'A#', 'B', 'C', 'C#', 'D', 'D#', 'E'][k % 12] + (3 + Math.floor((k + 5) / 12)));
export const IS_BLACK = (k) => [1, 3, 5, 8, 10].includes(k % 12);
export const WHITE_KEYS = Array.from({ length: 27 }, (_, k) => k).filter((k) => !IS_BLACK(k));   // 16
// the computer keyboard (shown on the panel when "keys" is on)
export const KEYMAP = {
  keys: { z: 0, s: 1, x: 2, d: 3, c: 4, f: 5, v: 6, b: 7, h: 8, n: 9, j: 10, m: 11, ',': 12, l: 13, '.': 14, ';': 15, '/': 16,
    "'": 17, q: 18, w: 19, 2: 20, e: 21, 3: 22, r: 23, t: 24, 5: 25, y: 26 },
  buttons: { a: B.FX, g: B.SEL, k: B.ENV, u: B.LFO, i: B.EDIT, o: B.GLO, p: B.HOME, '[': B.SAVE, ']': B.ARP, '\\': B.SEQ,
    ' ': B.PLAY, enter: B.REC, '-': B['OCT-'], '=': B['OCT+'] },
  knobs: { 1: K.ALGORITHM, 4: K.PRESETS, 6: K.SELECT, 7: K.K1, 8: K.K2, 9: K.K3, 0: K.K4 },
};

export class VirtualFM1 extends EventTarget {
  constructor() {
    super();
    this.on = false;
    this.stat = { page: '', layer: 0, playing: 0, bpm: 0, sel: 0, ms: 0 };
    this.leds = '';
    this.held = new Set();
  }
  get kind() { return 'virtual'; }
  async power(restore) {
    if (this.on) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    this.ctx = new Ctx({ sampleRate: 44100, latencyHint: 'interactive' });
    await this.ctx.resume();
    const base = new URL('.', import.meta.url);
    const [module] = await Promise.all([
      fetch(new URL('sloop-emu.wasm', base)).then((r) => { if (!r.ok) throw new Error('sloop-emu.wasm missing'); return r.arrayBuffer(); }).then((b) => WebAssembly.compile(b)),
      this.ctx.audioWorklet.addModule(new URL('worklet.js', base)),
    ]);
    this.node = new AudioWorkletNode(this.ctx, 'sloop-fm1', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2],
      processorOptions: { module, restore } });
    this.gain = this.ctx.createGain();
    this.gain.gain.value = 0.9;
    this.node.connect(this.gain).connect(this.ctx.destination);
    this.sx = new PacketSysex((b) => this.transport.onSysex && this.transport.onSysex(b));
    this.transport = { send: (bytes) => this.post({ t: 'midi', pkts: sysexToPackets(bytes) }), onSysex: null };
    this.link = new SloopLink(this.transport);
    this.waits = new Map();
    this.node.port.onmessage = (ev) => this.onMessage(ev.data);
    this.on = true;
    this.dispatchEvent(new Event('power'));
  }
  post(m) { if (this.node) this.node.port.postMessage(m); }
  onMessage(m) {
    switch (m.t) {
      case 'fb': this.dispatchEvent(Object.assign(new Event('fb'), { fb: m.fb })); break;
      case 'leds': this.leds = m.leds; this.dispatchEvent(new Event('leds')); break;
      case 'stat': this.stat = m; this.dispatchEvent(new Event('stat')); break;
      case 'midi':
        for (const p of m.pkts) {
          if (this.sx.packet(p)) continue;
          this.dispatchEvent(Object.assign(new Event('midiout'), { pkt: p }));   // the notes the keys send
        }
        break;
      case 'saved': case 'restored': { const w = this.waits.get(m.id); if (w) { this.waits.delete(m.id); w(m); } break; }
    }
  }
  ask(msg) { const id = Math.random().toString(36).slice(2); return new Promise((res) => { this.waits.set(id, res); this.post({ ...msg, id }); }); }
  async save() { if (!this.on) return null; const m = await this.ask({ t: 'save' }); return { work: m.work, slots: m.slots }; }
  async restore(data) { if (!this.on) return false; const m = await this.ask({ t: 'restore', data }); return !!m.ok; }
  button(id, down) {
    if (!this.on) return;
    if (down) this.held.add('b' + id); else this.held.delete('b' + id);
    this.post({ t: 'btn', id, down });
    this.dispatchEvent(Object.assign(new Event('input'), { what: 'button', id, down }));
  }
  note(k, down) {
    if (!this.on) return;
    if (down) this.held.add('k' + k); else this.held.delete('k' + k);
    this.post({ t: 'note', k, down });
    this.dispatchEvent(Object.assign(new Event('input'), { what: 'note', id: k, down }));
  }
  turn(role, steps) {
    if (!this.on || !steps) return;
    this.post({ t: 'turn', role, steps });
    this.dispatchEvent(Object.assign(new Event('input'), { what: 'knob', id: role, steps }));
  }
  master(v) { this.post({ t: 'master', v }); }
  releaseAll() {
    for (const h of [...this.held]) { const id = +h.slice(1); if (h[0] === 'b') this.button(id, false); else this.note(id, false); }
  }
  // a USB-MIDI note from a real keyboard / FM-1 into the virtual one
  midiIn(pkts) { this.post({ t: 'midi', pkts }); }
}

// RGB565 framebuffer -> canvas (drawn at 2x, so the browser scales it down smoothly at any size)
export function paintScreen(canvas, fb) {
  if (!canvas._off) { canvas._off = document.createElement('canvas'); canvas._off.width = canvas._off.height = 240; canvas._img = canvas._off.getContext('2d').createImageData(240, 240); }
  const d = canvas._img.data;
  for (let i = 0; i < 240 * 240; i++) {
    const v = fb[i];
    d[4 * i] = ((v >> 11) & 31) * 255 / 31 | 0; d[4 * i + 1] = ((v >> 5) & 63) * 255 / 63 | 0; d[4 * i + 2] = (v & 31) * 255 / 31 | 0; d[4 * i + 3] = 255;
  }
  canvas._off.getContext('2d').putImageData(canvas._img, 0, 0);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(canvas._off, 0, 0, canvas.width, canvas.height);
}
