// SPDX-License-Identifier: GPL-3.0-only
// A real FM-1 on Web MIDI: the SLOOP editor protocol for reading what is on it, and the notes its keys send.
import { SloopLink } from './link.js';
import { FM1_PORT } from './vendor/fm1ota.js';

export class HardwareFM1 extends EventTarget {
  constructor() { super(); this.access = null; this.link = null; this.info = null; this.name = ''; this.state = 'off'; }
  get kind() { return 'hardware'; }
  get supported() { return !!navigator.requestMIDIAccess; }
  async connect() {
    if (!this.supported) throw new Error('This browser has no Web MIDI. Use Chrome or Edge on a computer.');
    this.setState('connecting');
    try {
      this.access = this.access || await navigator.requestMIDIAccess({ sysex: true });
    } catch (e) { this.setState('off'); throw new Error('MIDI access was not allowed. Allow it in the address bar, then try again.'); }
    this.access.onstatechange = (ev) => {
      if (this.input && ev.port.id === this.input.id && ev.port.state === 'disconnected') this.lost();
      else if (!this.link && ev.port.state === 'connected' && this.state === 'waiting') this.tryPorts().catch(() => {});
    };
    const ok = await this.tryPorts();
    if (!ok) { this.setState('waiting'); throw new Error('No FM-1 found. Plug it in with a data cable (no hub) and close other apps that use it.' + this.seen()); }
    return this.info;
  }
  seen() {
    const n = this.access ? [...this.access.inputs.values()].map((p) => p.name) : [];
    return n.length ? ` MIDI ports seen: ${n.join(', ')}.` : '';
  }
  async tryPorts() {
    const outs = [...this.access.outputs.values()];
    for (const input of this.access.inputs.values()) {
      if (input.state === 'disconnected' || !FM1_PORT.test(input.name || '')) continue;
      const output = outs.find((o) => o.name === input.name) || (outs.length === 1 ? outs[0] : null);
      if (!output) continue;
      try { await input.open(); await output.open(); } catch (_) { continue; }
      const transport = { send: (b) => { try { output.send(b); } catch (_) { this.lost(); } }, onSysex: null };
      input.onmidimessage = (ev) => {
        const d = ev.data;
        if (d[0] === 0xF0) { if (transport.onSysex) transport.onSysex(Array.from(d)); return; }
        this.dispatchEvent(Object.assign(new Event('midi'), { data: Array.from(d) }));
      };
      const link = new SloopLink(transport);
      try {
        const info = await link.info();
        if (!/^FELUCCA|SLOOP/i.test(info.version)) throw new Error('not SLOOP');
        this.input = input; this.output = output; this.link = link; this.info = info; this.name = input.name;
        this.setState('on');
        this.startWatch();
        return true;
      } catch (_) {
        input.onmidimessage = null;
        // an FM-1 that answers the updater but not the editor: another firmware, or the update loader
        this.other = this.other || input.name;
      }
    }
    return false;
  }
  startWatch() {
    clearInterval(this.pinger);
    this.link.watch(7).catch(() => {});      // 1 pushes, 2 the other tracks' mix, 4 the panel (v11)
    this.pinger = setInterval(() => { if (this.link) this.link.ping().catch(() => {}); }, 1000);
  }
  lost() {
    clearInterval(this.pinger);
    if (this.input) this.input.onmidimessage = null;
    this.link = null; this.input = this.output = null;
    this.setState('waiting');
  }
  // the updater needs the port to itself
  release() {
    clearInterval(this.pinger);
    if (this.input) this.input.onmidimessage = null;
    this.link = null; this.input = this.output = null;
    this.setState('updating');
  }
  setState(s) { this.state = s; this.dispatchEvent(new Event('state')); }
}
