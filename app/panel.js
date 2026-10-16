// SPDX-License-Identifier: GPL-3.0-only
// The FM-1's panel, drawn in HTML: the screen, 14 buttons, 7 knobs and MASTER, 27 keys. Pointer (mouse, pen,
// multi-touch), wheel and computer-keyboard input; right-click, Shift+click or a long-press latches a button (or key) held; a click lets it go.
import { BUTTONS, KNOBS, KEY_NAMES, IS_BLACK, KEYMAP, B, K, paintScreen } from './fm1.js';

const KNOB_COLOR = { 'KNOB 1': 't1', 'KNOB 2': 't2', 'KNOB 3': 't3', 'KNOB 4': 't4' };
const SHOW_ID = { power: 'power', ALGORITHM: 'k1', PRESETS: 'k2', SELECT: 'k0', K1: 'k3', K2: 'k4', K3: 'k5', K4: 'k6' };
const invert = (o) => Object.fromEntries(Object.entries(o).map(([a, b]) => [b, a]));

export function buildPanel(root, fm1) {
  const keyOf = { keys: invert(KEYMAP.keys), buttons: invert(KEYMAP.buttons), knobs: invert(KEYMAP.knobs) };
  const label = (s) => (s === ' ' ? 'SPACE' : s === 'enter' ? '⏎' : s.toUpperCase());
  const btn = (id) => `<button class="fbtn${id === B.PLAY ? ' play' : ''}" data-b="${id}" aria-label="${BUTTONS[id]}"><span class="bl">${id === B.PLAY ? 'PLAY<br>STOP' : BUTTONS[id]}</span><span class="ck">${keyOf.buttons[id] !== undefined ? label(keyOf.buttons[id]) : ''}</span></button>`;
  const knob = (role, cls = '') => `<div class="knob ${cls} ${KNOB_COLOR[KNOBS[role]] || ''}" data-k="${role}" role="slider" tabindex="0" aria-label="${KNOBS[role]}">
      <span class="kl">${KNOBS[role].replace('KNOB ', 'KNOB')}</span><div class="cap enc"></div><span class="ck">${keyOf.knobs[role] !== undefined ? label(keyOf.knobs[role]) + ' ⇧' : ''}</span></div>`;
  const whites = [], blacks = [];
  const BLABEL = ['OP1', 'OP2', 'OP3', 'OP4', 'OP5', 'OP6', 'PIT', 'GLO', 'MONO', 'POLY', ''];   // printed under the black keys
  let w = 0, nb = 0;
  for (let k = 0; k < 27; k++) {
    const ck = keyOf.keys[k] !== undefined ? label(keyOf.keys[k]) : '';
    if (IS_BLACK(k)) blacks.push(`<button class="key black" data-n="${k}" style="left:calc(${w} * var(--kw) - var(--bw) / 2)" aria-label="${KEY_NAMES[k]}"><span class="ck">${ck}</span></button><span class="blab" style="left:calc(${w} * var(--kw) - var(--bw) / 2)">${BLABEL[nb++]}</span>`);
    else { whites.push(`<button class="key white" data-n="${k}" aria-label="${KEY_NAMES[k]}"><span class="ck">${ck}</span></button>`); w++; }
  }
  const master = `<div class="knob master" data-m="1" role="slider" tabindex="0" aria-label="MASTER"><span class="kl">MASTER</span><div class="cap"><i></i></div></div>`;
  // the FM-1 as it is: MASTER, SELECT / PRESETS, ALGORITHM / OCT- OCT+ on the left, the screen, KNOB 1-4 over the
  // two rows of six buttons on the right, the keys below (black keys above the white ones)
  root.innerHTML = `
  <div class="bigscreen"><canvas width="480" height="480" class="lcd big"></canvas>
    <button class="power" data-show="power" aria-label="Power">⏻ Power on</button></div>
  <div class="fm1">
    <div class="fm1-top">
      <div class="left">
        <div class="kgrid">${master}${knob(K.SELECT)}${knob(K.PRESETS)}${knob(K.ALGORITHM)}</div>
        <div class="octs">${btn(B['OCT-'])}${btn(B['OCT+'])}</div>
      </div>
      <div class="screenbox"><canvas width="480" height="480" class="lcd small"></canvas></div>
      <div class="right">
        <div class="knobrow four">${knob(K.K1)}${knob(K.K2)}${knob(K.K3)}${knob(K.K4)}</div>
        <div class="btngrid">${[B.FX, B.SEL, B.ENV, B.LFO, B.EDIT, B.GLO, B.HOME, B.SAVE, B.ARP, B.SEQ, B.PLAY, B.REC].map(btn).join('')}</div>
      </div>
    </div>
    <div class="keybed" style="--n:${w}">${whites.join('')}${blacks.join('')}</div>
    <div class="brand">M-VAVE FM-1 · SLOOP</div>
  </div>`;
  const canvas = root.querySelector('canvas.big'), small = root.querySelector('canvas.small');
  for (const c of [canvas, small]) { const x = c.getContext('2d'); x.fillStyle = '#000'; x.fillRect(0, 0, 480, 480); }
  fm1.addEventListener('fb', (ev) => { paintScreen(canvas, ev.fb); small.getContext('2d').drawImage(canvas, 0, 0); });

  // ---- lights
  const btnEls = [...root.querySelectorAll('[data-b]')], keyEls = [...root.querySelectorAll('[data-n]')];
  fm1.addEventListener('leds', () => {
    const L = fm1.leds;
    for (const el of btnEls) el.dataset.led = L[+el.dataset.b] || '0';
    for (const el of keyEls) el.dataset.led = L[14 + +el.dataset.n] || '0';
  });
  fm1.addEventListener('power', () => root.classList.add('on'));

  // ---- buttons and keys: pointer down / up, latching
  const latched = new Set();
  // a press lasts at least 60 ms, so a quick click is seen by the firmware's debounce as a tap
  const press = (el, down) => {
    const send = () => { if (el.dataset.b !== undefined) fm1.button(+el.dataset.b, down); else fm1.note(+el.dataset.n, down); };
    el.classList.toggle('down', down);
    clearTimeout(el._upT);
    if (down) { el._downAt = performance.now(); send(); return; }
    const left = 60 - (performance.now() - (el._downAt || 0));
    if (left > 0) el._upT = setTimeout(send, left); else send();
  };
  for (const el of [...btnEls, ...keyEls]) {
    let lp = null;
    el.addEventListener('pointerdown', (ev) => {
      if (ev.button === 2) return;
      ev.preventDefault();
      el.setPointerCapture(ev.pointerId);
      if (latched.has(el)) { latched.delete(el); el.classList.remove('latched'); press(el, false); return; }
      if (ev.shiftKey) { lp = 'latched'; latched.add(el); el.classList.add('latched'); press(el, true); return; }   // Shift+click: held
      press(el, true);
      if (ev.pointerType === 'touch' && el.dataset.b !== undefined) lp = setTimeout(() => { lp = 'latched'; latched.add(el); el.classList.add('latched'); navigator.vibrate?.(15); }, 550);
    });
    const up = () => {
      if (lp && lp !== 'latched') clearTimeout(lp);
      const wasLatch = lp === 'latched'; lp = null;
      if (latched.has(el) || wasLatch) return;
      if (el.classList.contains('down')) press(el, false);
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('contextmenu', (ev) => {
      ev.preventDefault();
      if (latched.has(el)) { latched.delete(el); el.classList.remove('latched'); press(el, false); }
      else { latched.add(el); el.classList.add('latched'); if (!el.classList.contains('down')) press(el, true); }
    });
  }
  // a slide along the keybed plays the keys it crosses (one pointer)
  // ---- knobs: drag, wheel, arrow keys; a detent per 14 px
  for (const el of root.querySelectorAll('[data-k],[data-m]')) {
    const role = el.dataset.k !== undefined ? +el.dataset.k : -1;
    let y0 = null, acc = 0, angle = 0, mv = 800;
    const cap = el.querySelector('.cap');
    const turn = (n) => {
      if (!n) return;
      if (role < 0) { mv = Math.max(0, Math.min(1023, mv + n * 32)); fm1.master(mv); angle = (mv / 1023) * 270 - 135; }
      else { fm1.turn(role, n); angle += n * 18; }
      cap.style.transform = `rotate(${angle}deg)`;
    };
    if (role < 0) { angle = (mv / 1023) * 270 - 135; cap.style.transform = `rotate(${angle}deg)`; }
    if (role < 0) el._setMaster = (v) => { mv = Math.max(0, Math.min(1023, Math.round(v))); angle = (mv / 1023) * 270 - 135; cap.style.transform = `rotate(${angle}deg)`; fm1.master(mv); };
    el.addEventListener('pointerdown', (ev) => { ev.preventDefault(); el.setPointerCapture(ev.pointerId); y0 = ev.clientY; acc = 0; el.classList.add('down'); });
    el.addEventListener('pointermove', (ev) => {
      if (y0 === null) return;
      acc += y0 - ev.clientY; y0 = ev.clientY;
      const n = Math.trunc(acc / 14); if (n) { acc -= n * 14; turn(n); }
    });
    const end = () => { y0 = null; el.classList.remove('down'); };
    el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
    let wacc = 0;
    el.addEventListener('wheel', (ev) => { ev.preventDefault(); wacc += -ev.deltaY; const n = Math.trunc(wacc / 40); if (n) { wacc -= n * 40; turn(Math.max(-3, Math.min(3, n))); } }, { passive: false });
    el.addEventListener('keydown', (ev) => {
      if (ev.key === 'ArrowUp' || ev.key === 'ArrowRight') { turn(1); ev.preventDefault(); }
      if (ev.key === 'ArrowDown' || ev.key === 'ArrowLeft') { turn(-1); ev.preventDefault(); }
    });
    el._turn = turn;
  }

  // ---- the computer keyboard (only while the focus is not in a text field)
  const down = new Set();
  const knobEl = (role) => root.querySelector(`[data-k="${role}"]`);
  const onKey = (ev, isDown) => {
    if (!fm1.on || ev.metaKey || ev.ctrlKey || ev.altKey) return;
    const t = ev.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    const key = ev.key === 'Enter' ? 'enter' : ev.key.length === 1 ? ev.key.toLowerCase() : ev.key;
    const code = ev.code.startsWith('Digit') ? ev.code.slice(5) : null;
    if (code && KEYMAP.knobs[code] !== undefined && (ev.shiftKey || KEYMAP.keys[code] === undefined)) {
      if (isDown) { knobEl(KEYMAP.knobs[code])._turn(ev.shiftKey ? -1 : 1); ev.preventDefault(); }
      return;
    }
    const n = KEYMAP.keys[key], b = KEYMAP.buttons[key];
    if (n === undefined && b === undefined) return;
    ev.preventDefault();
    if (isDown && (ev.repeat || down.has(key))) return;
    if (isDown) down.add(key); else down.delete(key);
    const el = n !== undefined ? root.querySelector(`[data-n="${n}"]`) : root.querySelector(`[data-b="${b}"]`);
    if (latched.has(el)) return;
    press(el, isDown);
  };
  window.addEventListener('keydown', (ev) => onKey(ev, true));
  window.addEventListener('keyup', (ev) => onKey(ev, false));
  window.addEventListener('blur', () => { for (const el of root.querySelectorAll('.down')) if (!latched.has(el) && el.dataset.k === undefined) press(el, false); down.clear(); });

  return {
    canvas,
    // what your FM-1 does, shown on the drawing (mirror): a key held, a knob turned
    remoteKey(k, down) {
      const el = root.querySelector(`[data-n="${k}"]`);
      if (el) el.classList.toggle('remote', down);
    },
    remoteMaster(pos) {                                  // 0..1, your FM-1's MASTER (v11)
      const el = root.querySelector('.knob.master');
      if (el && el._setMaster) { el._setMaster(pos * 1023); el.classList.add('remote'); clearTimeout(el._rt); el._rt = setTimeout(() => el.classList.remove('remote'), 400); }
    },
    remoteBtn(b, down) {
      const el = root.querySelector(`[data-b="${b}"]`);
      if (el) el.classList.toggle('remote', down);
    },
    remoteKnob(role, dir) {
      const el = role === 'master' ? null : root.querySelector(`[data-k="${role}"]`);
      if (!el) return;
      const cap = el.querySelector('.cap');
      el._ra = (el._ra || 0) + (dir || 1) * 18;
      cap.style.transform = `rotate(${el._ra}deg)`;
      el.classList.add('remote');
      clearTimeout(el._rt); el._rt = setTimeout(() => el.classList.remove('remote'), 400);
    },
    highlight(list) {
      for (const el of root.querySelectorAll('.hl')) el.classList.remove('hl');
      for (const name of list || []) {
        const id = SHOW_ID[name];
        let el = null;
        if (id === 'power') el = root.querySelector('.power');
        else if (id) el = root.querySelector(`[data-k="${id.slice(1)}"]`);
        else if (B[name] !== undefined) el = root.querySelector(`[data-b="${B[name]}"]`);
        if (el) el.classList.add('hl');
      }
    },
    showKeys(on) { root.classList.toggle('showkeys', on); },
  };
}
