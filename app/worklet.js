// SPDX-License-Identifier: GPL-3.0-only
// The virtual FM-1: SLOOP's firmware (sloop-emu.wasm) running in the audio thread. The audio clock drives
// the firmware's clock, as the I2S interrupt does on the FM-1; the screen, the lights and the MIDI it sends
// go to the page, the keys, knobs and MIDI the page sends come in.
class SloopFM1 extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const { module, restore } = options.processorOptions;
    this.e = new WebAssembly.Instance(module, {}).exports;
    this.e.emu_init();
    this.n = 0;
    this.lastFb = 0; this.lastStat = 0; this.lastLeds = '';
    this.sysex = [];
    if (restore) this.pendingRestore = restore;
    this.port.onmessage = (ev) => this.onMessage(ev.data);
  }
  mem() { return this.e.memory.buffer; }
  onMessage(m) {
    const e = this.e;
    switch (m.t) {
      case 'btn': e.emu_button(m.id, m.down ? 1 : 0); break;
      case 'note': e.emu_note(m.k, m.down ? 1 : 0); break;
      case 'turn': e.emu_turn(m.role, m.steps | 0); break;
      case 'master': e.emu_master(m.v | 0); break;
      case 'midi': for (const p of m.pkts) e.emu_midi(p >>> 0); e.emu_service(); this.flushMidi(); break;
      case 'save': this.save(m.id); break;
      case 'restore': this.restore(m.data, m.id); break;
    }
  }
  save(id) {
    const e = this.e, n = e.emu_proj_size();
    e.emu_capture();
    const work = new Uint8Array(this.mem(), e.emu_work_ptr(), n).slice();
    const slots = new Uint8Array(this.mem(), e.emu_slots_ptr(), n * 4).slice();
    this.port.postMessage({ t: 'saved', id, work, slots }, [work.buffer, slots.buffer]);
  }
  restore(data, id) {
    const e = this.e, n = e.emu_proj_size();
    let ok = 0;
    if (data && data.work && data.work.length === n && data.slots && data.slots.length === n * 4) {
      new Uint8Array(this.mem(), e.emu_slots_ptr(), n * 4).set(data.slots);
      new Uint8Array(this.mem(), e.emu_work_ptr(), n).set(data.work);
      ok = e.emu_restore();
    }
    this.port.postMessage({ t: 'restored', id, ok });
  }
  flushMidi() {
    const e = this.e; let p, out = [];
    while ((p = e.emu_midi_out())) out.push(p >>> 0);
    if (out.length) this.port.postMessage({ t: 'midi', pkts: out });
  }
  cstr(ptr) {
    const b = new Uint8Array(this.mem(), ptr, 32); let s = '';
    for (let i = 0; i < 32 && b[i]; i++) s += String.fromCharCode(b[i]);
    return s;
  }
  process(inputs, outputs) {
    const e = this.e, out = outputs[0], L = out[0], R = out[1] || out[0], n = L.length;
    const ptr = e.emu_render(n);
    const buf = new Float32Array(this.mem(), ptr, n * 2);
    for (let i = 0; i < n; i++) { L[i] = buf[2 * i]; R[i] = buf[2 * i + 1]; }
    this.n += n;
    if (this.pendingRestore && e.emu_ms() > 1300) { const r = this.pendingRestore; this.pendingRestore = null; this.restore(r, 'boot'); }
    this.flushMidi();
    if (this.n - this.lastFb >= 1470) {                 // ~30 frames a second
      this.lastFb = this.n;
      if (e.emu_fb_dirty()) {
        const fb = new Uint16Array(this.mem(), e.emu_fb(), 240 * 240).slice();
        this.port.postMessage({ t: 'fb', fb }, [fb.buffer]);
      }
      let leds = '';
      for (let b = 0; b < 14; b++) leds += e.emu_led_button(b);
      for (let k = 0; k < 27; k++) leds += e.emu_led_note(k);
      if (leds !== this.lastLeds) { this.lastLeds = leds; this.port.postMessage({ t: 'leds', leds }); }
    }
    if (this.n - this.lastStat >= 4410) {               // ~10 a second: where the screen is
      this.lastStat = this.n;
      this.port.postMessage({ t: 'stat', page: this.cstr(e.emu_page_name()), layer: e.emu_layer(), playing: e.emu_playing(),
        bpm: e.emu_bpm(), sel: e.emu_sel(), ms: e.emu_ms() });
    }
    return true;
  }
}
registerProcessor('sloop-fm1', SloopFM1);
