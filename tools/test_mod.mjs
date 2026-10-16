// The mirror firmware's PANEL push, on the virtual FM-1 built from it: WATCH 7 answers bit 2, and tapping FX
// pushes a PANEL frame whose title is FX, then HOME's is TRACKS. node tools/test_mod.mjs sloop-emu.wasm
import fs from 'fs';
import { SloopLink, sysexToPackets, PacketSysex, CMD } from '../app/link.js';
globalThis.localStorage = { getItem() { return null; }, setItem() {} };
const e = (await WebAssembly.instantiate(fs.readFileSync(process.argv[2]), {})).instance.exports; e.emu_init();
let t; const ps = new PacketSysex((b) => t.onSysex && t.onSysex(b));
const drain = () => { let p; while ((p = e.emu_midi_out())) ps.packet(p >>> 0); };
t = { send(bytes) { for (const p of sysexToPackets(bytes)) e.emu_midi(p); e.emu_service(); drain(); } };
const run = (ms) => { for (let x = 0; x < ms; x += 5.8) e.emu_render(256); drain(); };
const link = new SloopLink(t); run(1500); const tick = setInterval(() => run(10), 5);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const fail = (m) => { console.error('test_mod: FAIL', m); process.exit(1); };
const inf = await link.info();
const bits = await link.watch(7);
if (!(bits & 4)) fail('WATCH answers ' + bits + ' (no bit 2)');
const titles = [];
link.on((cmd, a) => { if (cmd === CMD.PANEL) titles.push(SloopLink.panel(a).title); });
const tap = async (b) => { e.emu_button(b, 1); await wait(150); e.emu_button(b, 0); await wait(400); };
await tap(0); await tap(6);
if (!titles.includes('FX')) fail('no PANEL with FX: ' + titles.join(','));
console.log('test_mod: ok', inf.version, 'proto', inf.proto, 'pushes', titles.join(' > '));
clearInterval(tick); process.exit(0);
