// SPDX-License-Identifier: GPL-3.0-only
// Your FM-1's sound through the computer: SLOOP's USB audio input ("Felucca", the master output, 44.1 or
// 48 kHz stereo) played to this computer's output. The browser asks for the microphone permission once:
// that is how a page reaches an audio input.
const FM1_AUDIO = /felucca|fm-1|sloop|m-vave/i;

export class FM1Audio {
  constructor() { this.on = false; }
  async find() {
    let tmp = null;
    let list = await navigator.mediaDevices.enumerateDevices();
    if (!list.some((d) => d.kind === 'audioinput' && d.label)) {          // the labels come with the permission
      tmp = await navigator.mediaDevices.getUserMedia({ audio: true });
      list = await navigator.mediaDevices.enumerateDevices();
    }
    if (tmp) tmp.getTracks().forEach((t) => t.stop());
    return list.find((d) => d.kind === 'audioinput' && FM1_AUDIO.test(d.label)) || null;
  }
  async start(volume = 1) {
    if (this.on) return this.label;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('This browser cannot take audio inputs.');
    let dev;
    try { dev = await this.find(); } catch (_) { throw new Error('Microphone access was not allowed: the FM-1\'s USB audio comes in that way. Allow it in the address bar and try again.'); }
    if (!dev) throw new Error('No FM-1 audio input found. On a Mac, SLOOP\'s HOME menu → AUDIO → USB SERIAL must be OFF (the default) for macOS to see it; unplug and replug the FM-1 after changing it.');
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: dev.deviceId }, channelCount: 2,
      echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    const Ctx = window.AudioContext || window.webkitAudioContext;
    this.ctx = new Ctx({ latencyHint: 'interactive' });
    await this.ctx.resume();
    this.gain = this.ctx.createGain();
    this.gain.gain.value = volume;
    this.ctx.createMediaStreamSource(this.stream).connect(this.gain).connect(this.ctx.destination);
    this.on = true;
    this.label = dev.label;
    this.stream.getTracks()[0].onended = () => this.stop();
    return this.label;
  }
  stop() {
    if (this.stream) this.stream.getTracks().forEach((t) => t.stop());
    if (this.ctx) this.ctx.close();
    this.stream = this.ctx = null; this.on = false;
  }
}
