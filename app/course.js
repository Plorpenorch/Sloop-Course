// SPDX-License-Identifier: GPL-3.0-only
// The course: navigation, lessons with self-checking steps, progress (kept in this browser), the manual,
// what's new, and the device bar (virtual FM-1, your FM-1, firmware).
import { VirtualFM1 } from './fm1.js';
import { HardwareFM1 } from './hw.js';
import { buildPanel } from './panel.js';
import { MODULES, LESSONS } from './lessons.js';
import { DeviceState } from './state.js';
import * as FW from './firmware.js';
import { Mirror } from './mirror.js';
import { FM1Audio } from './audioin.js';

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const store = {
  get(k, d) { try { const v = localStorage.getItem('sloopc-' + k); return v === null ? d : JSON.parse(v); } catch (_) { return d; } },
  set(k, v) { try { localStorage.setItem('sloopc-' + k, JSON.stringify(v)); } catch (_) { /* private mode */ } },
};
const DRUM_GM = [36, 35, 38, 39, 42, 46, 44, 37, 40, 43, 48, 49, 51, 70, 63, 56];
const WHITE = [0, 2, 4, 6, 7, 9, 11, 12, 14, 16, 18, 19, 21, 23, 24, 26];

class App {
  constructor() {
    this.virt = new VirtualFM1();
    this.hw = new HardwareFM1();
    this.S = new DeviceState(this);
    this.cmpVersion = FW.cmpVersion;
    this.progress = store.get('progress', {});
    this.checkPref = store.get('check', 'auto');
    this.current = null;
    this.stepState = [];
  }
  checked() {
    if (this.checkPref !== 'virtual' && this.hw.state === 'on') return this.hw;
    return this.virt.on ? this.virt : null;
  }
  checkedKind() { const d = this.checked(); return d ? d.kind : 'none'; }

  async start() {
    this.panel = buildPanel($('#fm1'), this.virt);
    this.panel.showKeys(store.get('keys', false));
    $('#keystoggle').checked = store.get('keys', false);
    $('#keystoggle').onchange = (e) => { store.set('keys', e.target.checked); this.panel.showKeys(e.target.checked); };
    $('#fm1 .power').onclick = () => this.powerOn();
    this.virt.addEventListener('stat', () => { this.S.observe(); this.updateBar(); });
    this.virt.addEventListener('input', (ev) => this.onInput(ev));
    this.virt.addEventListener('power', () => { this.updateBar(); this.recheck(); });
    this.hw.addEventListener('state', () => { this.updateBar(); this.recheck(); });
    this.hw.addEventListener('midi', (ev) => this.onHwMidi(ev.data));
    $('#connect').onclick = () => this.connectHw();
    this.mirror = new Mirror(this);
    this.mirror.addEventListener('status', () => { $('#mirrorstat').textContent = this.mirror.text || ''; });
    $('#mirrortoggle').onchange = async (e) => {
      store.set('mirror', e.target.checked);
      if (e.target.checked) { try { await this.mirror.start(); } catch (err) { e.target.checked = false; this.toast(err.message); } }
      else this.mirror.stop();
      $('#mirrorsound').checked = false;
    };
    this.usbAudio = new FM1Audio();
    $('#usbaudio').onchange = async (e) => {
      if (e.target.checked) {
        try { const name = await this.usbAudio.start(); this.toast(`Playing your FM-1 (${name}) through this computer. To silence its own speaker: on the FM-1, hold HOME → AUDIO → USB AUDIO = FULL, then turn MASTER all the way down.`); }
        catch (err) { e.target.checked = false; this.toast(err.message); }
      } else this.usbAudio.stop();
    };
    $('#mirrorsound').onchange = (e) => this.virt.mute(this.mirror.on && !e.target.checked);
    this.hw.addEventListener('state', () => {
      const on = this.hw.state === 'on';
      if (on) this.watchHwKnobs();
      $('#mirrorbar').hidden = !on;
      if (!on && this.mirror.on) { this.mirror.stop(); $('#mirrortoggle').checked = false; }
      if (!on && this.usbAudio.on && this.hw.state !== 'updating') { this.usbAudio.stop(); $('#usbaudio').checked = false; }
      if (on && store.get('mirror', false) && !this.mirror.on) { $('#mirrortoggle').checked = true; $('#mirrortoggle').onchange({ target: $('#mirrortoggle') }); }
    });
    $('#checkwhich').value = this.checkPref;
    $('#checkwhich').onchange = (e) => { this.checkPref = e.target.value; store.set('check', this.checkPref); this.updateBar(); this.recheck(); };
    $('#menubtn').onclick = () => document.body.classList.toggle('navopen');
    $('#dockbtn').onclick = () => document.body.classList.toggle('dockopen');
    this.buildNav();
    window.addEventListener('hashchange', () => this.route());
    window.addEventListener('beforeunload', () => this.saveVirtual(true));
    setInterval(() => this.saveVirtual(), 20000);
    try { this.manifest = await FW.manifest(); } catch (_) { this.manifest = null; }
    try { this.mod = await FW.modManifest(); } catch (_) { this.mod = null; }
    const fv = document.getElementById('fwver'); if (fv && this.manifest) fv.textContent = ' ' + this.manifest.version;   // the SLOOP the course is on
    try { this.courseInfo = await (await fetch('data/course.json', { cache: 'no-cache' })).json(); } catch (_) { this.courseInfo = null; }
    this.route();
    this.updateBar();
    this.loop();
  }

  // ---- the virtual FM-1, and keeping its work between visits
  async powerOn() {
    if (this.virt.on) return;
    $('#fm1 .power').textContent = 'Starting…';
    let restore = null;
    const saved = store.get('virtual', null);
    if (saved) { try { restore = { work: Uint8Array.from(atob(saved.work), (c) => c.charCodeAt(0)), slots: Uint8Array.from(atob(saved.slots), (c) => c.charCodeAt(0)) }; } catch (_) { restore = null; } }
    try { await this.virt.power(restore); }
    catch (e) { $('#fm1 .power').textContent = '⏻ Power'; this.toast('The virtual FM-1 could not start: ' + e.message); return; }
    $('#fm1 .power').textContent = 'On';
  }
  async saveVirtual() {
    if (!this.virt.on || (this.mirror && this.mirror.on)) return;   // a mirrored FM-1 is yours, not the virtual one's work
    const s = await this.virt.save();
    if (!s) return;
    const b64 = (u) => { let x = ''; for (let i = 0; i < u.length; i += 0x8000) x += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(x); };
    store.set('virtual', { work: b64(s.work), slots: b64(s.slots) });
  }

  // ---- your FM-1
  async connectHw() {
    try {
      const info = await this.hw.connect();
      this.toast(`Connected: SLOOP ${info.num} on ${this.hw.name}`);
    } catch (e) { this.toast(e.message); }
    this.updateBar();
  }
  // your FM-1's knobs: the parameter changes it pushes (WATCH), as knob turns for the steps that ask for one
  watchHwKnobs() {
    const link = this.hw.link;
    if (!link || this.hwKnobLink === link) return;
    this.hwKnobLink = link;
    const ROLES = { LVL: [4], LEN: [5, 6], PAN: [6], REV: [6], SWG: [3], BPM: [0] };
    const ready = (async () => {
      if (!link.inf) await link.info();
      if (!link.descs) await link.loadDescs('v' + link.inf.version + '-' + link.inf.pCount + '-' + link.inf.gCount);
    })().catch(() => {});
    link.on(async (cmd, a) => {
      if (cmd !== 23 && cmd !== 32) return;                // CHANGED (scope, id), TRACK_CHANGED (track, id)
      await ready;
      const d = link.descs && (cmd === 23 && a[0] === 1 ? link.descs.g : link.descs.p)[a[1]];
      for (const role of (d && ROLES[d.label]) || []) this.S.record({ what: 'knob', id: role, src: 'hw' });
      this.recheck();
    });
  }
  onHwMidi(d) {
    const st = d[0] & 0xF0, ch = (d[0] & 15) + 1;
    if (st === 0x90 && d[2] > 0) {
      if (ch === 10) { const lane = DRUM_GM.indexOf(d[1]); this.S.record({ what: 'drum', lane: lane < 0 ? 0 : lane, src: 'hw' }); }
      this.S.record({ what: 'note', id: d[1], down: true, src: 'hw' });
    }
  }
  onInput(ev) {
    this.S.record({ what: ev.what, id: ev.id, down: ev.down, steps: ev.steps, src: 'virt' });
    if (ev.what === 'note' && ev.down && this.virt.stat.sel === 3) {
      const w = WHITE.indexOf(ev.id); const lane = w >= 0 ? w : WHITE.indexOf(ev.id - 1);
      this.S.record({ what: 'drum', lane, src: 'virt' });
    }
  }

  updateBar() {
    const v = this.virt, h = this.hw, m = this.manifest;
    const vs = $('#vstat'), hs = $('#hstat');
    vs.textContent = v.on ? (v.stat.playing ? 'Virtual: playing' : 'Virtual: on') : 'Virtual: off';
    vs.className = 'chip' + (v.on ? ' ok' : '');
    let ht = 'Your FM-1: not connected', cls = 'chip';
    if (h.state === 'on') {
      const cur = m && FW.cmpVersion(h.info.num, m.version) >= 0;
      ht = `Your FM-1: SLOOP ${h.info.num}` + (m && !cur ? ` · ${m.version} available` : '');
      cls += cur ? ' ok' : ' warn';
    } else if (h.state === 'connecting') ht = 'Connecting…';
    else if (h.state === 'waiting') ht = 'Your FM-1: waiting for it…';
    else if (h.state === 'updating') ht = 'Updating your FM-1…';
    hs.textContent = ht; hs.className = cls;
    $('#connect').style.display = h.state === 'on' || h.state === 'updating' ? 'none' : '';
    const k = this.checkedKind();
    $('#checking').textContent = k === 'hardware' ? 'Steps check your FM-1' : k === 'virtual' ? 'Steps check the virtual FM-1' : 'Turn on an FM-1 to check steps';
    const banner = $('#fwbanner');
    if (h.state === 'on' && m && FW.cmpVersion(h.info.num, m.version) < 0) {
      banner.innerHTML = `SLOOP ${esc(m.version)} is available (your FM-1 runs ${esc(h.info.num)}). <a href="#lesson/firmware">Back up and update</a>`;
      banner.hidden = false;
    } else if (this.courseInfo && m && FW.cmpVersion(m.version, this.courseInfo.reviewedFor) > 0) {
      banner.innerHTML = `The virtual FM-1 and the manual are on SLOOP ${esc(m.version)}; the lessons were written for ${esc(this.courseInfo.reviewedFor)}. <a href="#whatsnew">What's new</a>`;
      banner.hidden = false;
    } else banner.hidden = true;
    this.dockFw();
  }

  // ---- navigation
  buildNav() {
    let html = '';
    MODULES.forEach((m, mi) => {
      html += `<div class="modgroup" data-m="${m.id}"><div class="modhead"><span class="mnum">${String(mi + 1).padStart(2, '0')}</span><span>${esc(m.title)}</span></div><div class="lessons">`;
      for (const l of m.lessons) html += `<a class="lessonlink" href="#lesson/${l.id}" data-l="${l.id}"><span class="dot"></span><span>${esc(l.title)}</span></a>`;
      html += '</div></div>';
    });
    html += `<div class="modgroup"><div class="modhead"><span class="mnum">··</span><span>Reference</span></div><div class="lessons">
      <a class="lessonlink" href="#manual" data-l="manual"><span class="dot ref">?</span><span>Manual (search)</span></a>
      <a class="lessonlink" href="#whatsnew" data-l="whatsnew"><span class="dot ref">★</span><span>What's new in SLOOP</span></a>
      <a class="lessonlink" href="#keys" data-l="keys"><span class="dot ref">⌨</span><span>Computer keyboard map</span></a></div></div>`;
    $('#nav').innerHTML = html;
    this.markNav();
  }
  markNav() {
    let done = 0, total = 0;
    for (const l of LESSONS) {
      const a = $(`.lessonlink[data-l="${l.id}"]`);
      const p = this.progress[l.id] || [];
      const req = l.steps.filter((s) => !s.optional).length;
      const got = l.steps.filter((s, i) => !s.optional && p[i]).length;
      const fin = req > 0 && got === req;
      total += req; done += got;
      a.classList.toggle('done', fin);
      a.querySelector('.dot').textContent = fin ? '✓' : '';
    }
    $('#progfill').style.width = (total ? (100 * done / total) : 0) + '%';
    $('#progtxt').textContent = `${done} / ${total} steps`;
  }
  route() {
    const h = location.hash.slice(1) || store.get('last', 'lesson/welcome');
    if (h.startsWith('lesson/')) store.set('last', h);
    document.body.classList.remove('navopen');
    for (const a of document.querySelectorAll('.lessonlink')) a.classList.remove('active');
    const [kind, id, sub] = h.split('/');
    if (kind === 'lesson') this.showLesson(id);
    else if (kind === 'manual') this.showManual(id ? decodeURIComponent(sub || '') : '', id);
    else if (kind === 'whatsnew') this.showWhatsNew();
    else if (kind === 'keys') this.showKeys();
    else this.showLesson('welcome');
    const a = $(`.lessonlink[data-l="${kind === 'lesson' ? id : kind}"]`);
    if (a) a.classList.add('active');
    $('#main').scrollTop = 0;
  }

  // ---- a lesson
  showLesson(id) {
    const l = LESSONS.find((x) => x.id === id) || LESSONS[0];
    this.current = l;
    this.S.resetSeen();
    this.S.memo = {};
    const i = LESSONS.indexOf(l), prev = LESSONS[i - 1], next = LESSONS[i + 1];
    const p = this.progress[l.id] || [];
    $('#content').innerHTML = `
      <div class="crumb">${esc(l.moduleTitle)}</div><h1>${esc(l.title)}</h1>${l.body}
      ${l.panel === 'firmware' ? '<div id="fwpanel" class="card"></div>' : ''}
      <h2>Do it</h2>
      <ol class="steps">${l.steps.map((s, si) => `
        <li class="step${p[si] ? ' done' : ''}${s.optional ? ' optional' : ''}" data-i="${si}">
          <button class="tick" title="${s.check ? 'Ticks itself when the FM-1 is right; click to tick by hand' : 'Tick when done'}" aria-label="done">${p[si] ? '✓' : ''}</button>
          <div class="stext">${s.text}${s.virtualOnly ? ' <span class="tag">virtual FM-1</span>' : ''}${s.optional ? ' <span class="tag dim">optional</span>' : ''}
          ${/\bhold/i.test(s.text) ? '<div class="vtip">On the virtual FM-1: hold Shift and click a button to hold it; it stays held until you let go of Shift (on a touchscreen: long-press it, tap again to let go).</div>' : ''}
          ${s.hint ? `<details class="hint"><summary>Stuck?</summary>${s.hint}</details>` : ''}</div>
          ${s.check ? '<span class="auto" title="Checked automatically">auto</span>' : ''}</li>`).join('')}</ol>
      <div class="navrow">${prev ? `<a class="btn" href="#lesson/${prev.id}">← ${esc(prev.title)}</a>` : '<span></span>'}
        ${next ? `<a class="btn primary" href="#lesson/${next.id}">${esc(next.title)} →</a>` : ''}</div>`;
    for (const li of document.querySelectorAll('.step')) {
      li.querySelector('.tick').onclick = () => this.setStep(+li.dataset.i, !li.classList.contains('done'));
      li.onmouseenter = () => this.panel.highlight(l.steps[+li.dataset.i].show);
    }
    if (l.panel === 'firmware') this.fwPanel();
    this.focusStep();
  }
  setStep(i, on) {
    const l = this.current; if (!l) return;
    const p = this.progress[l.id] = this.progress[l.id] || [];
    if (!!p[i] === on) return;
    p[i] = on ? 1 : 0;
    store.set('progress', this.progress);
    const li = $(`.step[data-i="${i}"]`);
    if (li) { li.classList.toggle('done', on); li.querySelector('.tick').textContent = on ? '✓' : ''; if (on) li.classList.add('flash'); }
    this.markNav();
    this.focusStep();
  }
  focusStep() {
    const l = this.current; if (!l) return;
    const p = this.progress[l.id] || [];
    const i = l.steps.findIndex((s, si) => !p[si] && !s.optional);
    for (const li of document.querySelectorAll('.step')) li.classList.toggle('now', +li.dataset.i === i);
    this.panel.highlight(i >= 0 ? l.steps[i].show : []);
    if (i !== this.focused) { this.focused = i; this.S.resetSeen(); }
  }
  recheck() { this.nextCheck = 0; }
  // the open lesson's unticked steps, checked against the FM-1 again and again
  async loop() {
    for (;;) {
      await new Promise((r) => setTimeout(r, this.checkedKind() === 'hardware' ? 900 : 450));
      const l = this.current;
      if (!l || document.hidden || !this.checked()) continue;
      const p = this.progress[l.id] || [];
      this.S.newPass();
      for (let i = 0; i < l.steps.length; i++) {
        const s = l.steps[i];
        if (p[i] || !s.check || this.current !== l) continue;
        if (s.virtualOnly && !this.virt.on) continue;     // (checked on the virtual FM-1, even with yours connected)
        let ok = false;
        try { ok = await s.check({ S: this.S }); } catch (_) { ok = false; }
        if (ok && this.current === l) this.setStep(i, true);
        break;                                     // one step at a time, in order
      }
    }
  }

  // ---- firmware: backup and update (the lesson "firmware", and the dock when a connected FM-1 is behind)
  fwPanel() { const el = $('#fwpanel'); if (el) this.fwUpdater(el, false); }
  fwOld() { const h = this.hw, m = this.manifest; return h.state === 'on' && m && h.info && FW.cmpVersion(h.info.num, m.version) < 0; }
  dockFw() {
    const el = $('#fwdock'), m = this.manifest, h = this.hw;
    if (!el) return;
    if (this.fwBusy) return;                              // (an update running: the card stays as it is)
    const show = this.fwOld() && this.fwDismissed !== h.info.num + '>' + m.version;
    if (!show) { el.hidden = true; el.innerHTML = ''; this.fwDockFor = null; return; }
    const key = h.info.num + '>' + m.version;
    if (this.fwDockFor === key) { el.hidden = false; return; }
    this.fwDockFor = key;
    el.hidden = false;
    el.innerHTML = `<div class="fwdtitle">Firmware update available</div>
      <p>Your FM-1 runs SLOOP <b>${esc(h.info.num)}</b>. This course is built for SLOOP <b>${esc(m.version)}</b>.</p>
      <p class="fwwarn">If you don't update, parts of the course (lesson checks, mirroring, the virtual FM-1 matching yours) may not work correctly.</p>
      <p class="fwwarn">Back up your work before updating: projects, user presets, samples and settings. The updater keeps them, but a backup is your safety net.</p>
      <div class="fwdbtns"><button class="btn primary small" id="fwdyes">Update my FM-1</button><button class="btn small" id="fwdno">Not now</button></div>
      <div class="fwdbody"></div>`;
    $('#fwdno', el).onclick = () => { this.fwDismissed = key; el.hidden = true; };
    $('#fwdyes', el).onclick = () => { $('.fwdbtns', el).remove(); this.fwUpdater($('.fwdbody', el), true); };
  }
  fwOnMod() { const h = this.hw; return h.state === 'on' && h.info && (/MIRROR/i.test(h.info.version) || ((h.watchBits || 0) & 4)); }
  fwUpdater(el, compact) {
    const m = this.manifest, h = this.hw, mod = this.mod && this.mod.status === 'built' ? this.mod : null;
    const exp = store.get('expfw', false) && !compact;
    const dev = h.state === 'on' ? h.info.num : null, onMod = this.fwOnMod();
    const cur = m && dev && FW.cmpVersion(dev, m.version) >= 0;
    const devTxt = dev ? esc(dev) + (onMod ? ' <span class="tag">mirror</span>' : '') : '—';
    el.innerHTML = `
      ${compact ? '' : `<div class="fwrow"><div><div class="wtitle">Newest SLOOP</div><div class="big">${m ? esc(m.version) : '—'}</div>
        ${m ? `<div class="sub"><a href="${esc(m.release)}" target="_blank" rel="noopener">release notes</a> · <a href="#whatsnew">what's new</a></div>` : ''}</div>
      <div><div class="wtitle">Your FM-1</div><div class="big">${devTxt}</div><div class="sub">${dev ? (onMod ? 'mirror firmware (experimental)' : cur ? 'up to date' : 'update available') : 'not connected'}</div></div></div>`}
      <div class="fwactions">
        ${h.state === 'on' ? '' : '<button class="btn fwconnect">Connect your FM-1</button>'}
        <button class="btn fwbackup" ${h.state === 'on' ? '' : 'disabled'}>1 · Save a backup</button>
        <label class="confirm"><input type="checkbox" class="fwok"> I have a backup and the FM-1 is on a data cable, charged, with no other MIDI app open</label>
        <button class="btn primary fwinstall" disabled>2 · ${onMod ? 'Return to official' : 'Install'} SLOOP ${m ? esc(m.version) : ''}</button>
        ${exp && mod ? `<button class="btn fwinstallmod" disabled>2 · Install SLOOP ${esc(mod.version)} (experimental)</button>` : ''}
      </div>
      ${compact ? '' : `<label class="confirm expfw"><input type="checkbox" class="fwexp" ${store.get('expfw', false) ? 'checked' : ''}> Show experimental firmware</label>`}
      ${exp ? `<div class="callout warn"><span class="ctitle">Experimental: SLOOP + mirror</span>
        ${mod ? `SLOOP ${esc(mod.base)} with one addition: it reports its buttons, keys, knobs and the page on screen, so the course's mirror follows every screen.
        It is built automatically from SLOOP's own source plus <a href="${esc(mod.pr)}" target="_blank" rel="noopener">this proposed change</a>, and has not been tested on many FM-1s. It is not an official SLOOP release: report problems to the course, not to SLOOP.
        To go back, install official SLOOP above (your work is kept either way).`
        : this.mod && this.mod.status === 'merged' ? `The mirror is part of official SLOOP now: install official SLOOP above.` : `No experimental build is available for SLOOP ${m ? esc(m.version) : ''} yet.`}</div>` : ''}
      <div class="fwlog"></div>`;
    const q = (c) => $('.' + c, el);
    const log = (t, cls = '') => { q('fwlog').insertAdjacentHTML('beforeend', `<div class="${cls}">${esc(t)}</div>`); };
    const sync = () => {
      const can = h.state === 'on' && q('fwok').checked && !this.fwBusy;
      q('fwinstall').disabled = !(can && m);
      if (q('fwinstallmod')) q('fwinstallmod').disabled = !can;
    };
    q('fwok').onchange = sync; sync();
    if (q('fwexp')) q('fwexp').onchange = (e) => { store.set('expfw', e.target.checked); this.fwUpdater(el, compact); };
    if (q('fwconnect')) q('fwconnect').onclick = async () => { await this.connectHw(); this.fwUpdater(el, compact); };
    q('fwbackup').onclick = async () => {
      const b = q('fwbackup'); b.disabled = true;
      try {
        const file = await FW.backup(h.link, (d, t) => { b.textContent = `Backing up… ${Math.round(100 * d / t)} %`; });
        const blob = new Blob([JSON.stringify(file)], { type: 'application/json' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
        a.download = `SLOOP-backup-${new Date().toISOString().slice(0, 10)}.json`; a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
        this.S.flags.backup = true; q('fwok').checked = true; sync();
        b.textContent = 'Backup saved ✓'; log('Backup saved: keep the file. SLOOP\'s web editor restores it (Projects → Backup → Restore).', 'ok');
      } catch (e) { b.textContent = '1 · Save a backup'; log(e.message, 'err'); }
      b.disabled = false;
    };
    const install = async (target, label, btn) => {
      if (!confirm(`Install ${label} on your FM-1? Don't unplug it until it says Done.`)) return;
      btn.disabled = true; this.fwBusy = true; sync();
      if (this.mirror && this.mirror.on) { this.mirror.stop(); $('#mirrortoggle').checked = false; }
      let ok = false;
      try {
        log('Downloading and checking the package…');
        const pkg = await FW.fetchPackage(target);
        log(`Package OK: ${pkg.product}, SHA-256 verified.`, 'ok');
        const access = h.access;
        h.release();
        let lastStep = '';
        await FW.install(access, pkg, (step, n) => {
          if (step !== lastStep) { lastStep = step; log((FW.STEP_TEXT[step] || step) + (typeof n === 'string' ? ` (${n})` : '')); }
          else if (typeof n === 'number' && n % 50 === 0) q('fwlog').lastChild.textContent = `${FW.STEP_TEXT[step] || step}… ${n}`;
        });
        log(`Done: ${label} is installed.`, 'ok'); ok = true;
      } catch (e) { log((e.message || String(e)) + (e.detail ? ' ' + e.detail : ''), 'err'); }
      setTimeout(async () => {
        try { await this.hw.connect(); } catch (_) {}
        this.fwBusy = false;
        if (!compact) this.fwUpdater(el, compact); else sync();
        if (compact) this.fwPanel();
        this.updateBar();
        if (ok && compact) setTimeout(() => this.dockFw(), 8000);    // (the Done line stays a moment, then the card goes)
      }, 2500);
    };
    q('fwinstall').onclick = () => install(m, `SLOOP ${m.version}`, q('fwinstall'));
    if (q('fwinstallmod')) q('fwinstallmod').onclick = () => install(mod, `SLOOP ${mod.version} (experimental)`, q('fwinstallmod'));
  }

  // ---- reference pages
  async showManual(q, doc) {
    this.current = null; this.panel.highlight([]);
    if (!this.manual) { try { this.manual = await (await fetch('data/manual.json?v=' + (window.SLOOP_COURSE_V || ''))).json(); } catch (_) { this.manual = { sections: [] }; } }
    const secs = this.manual.sections;
    const anchor = doc && q && secs.find((s) => s.doc === doc && s.id === q);
    $('#content').innerHTML = `<div class="crumb">Reference · SLOOP ${esc(this.manual.version || '')}</div><h1>Manual</h1>
      <p class="lead">SLOOP's own manual and guide, searchable. Rebuilt with every SLOOP release.</p>
      <input id="msearch" type="search" placeholder="Search: swing, ghost notes, song mode, MIDI clock…" value="${esc(anchor ? '' : q)}" autocomplete="off">
      <div id="mresults"></div>`;
    const render = (query) => {
      const words = query.toLowerCase().split(/\s+/).filter(Boolean);
      let list;
      if (anchor && !query) list = [anchor];
      else if (!words.length) list = secs.filter((s) => s.level === 2).slice(0, 40);
      else list = secs.map((s) => {
        const t = (s.title + ' ' + s.text).toLowerCase(); let score = 0;
        for (const w of words) { if (!t.includes(w)) return null; score += (s.title.toLowerCase().includes(w) ? 5 : 0) + t.split(w).length; }
        return { s, score };
      }).filter(Boolean).sort((a, b) => b.score - a.score).slice(0, 25).map((x) => x.s);
      $('#mresults').innerHTML = list.length ? list.map((s, i) => `<details class="msec" ${anchor || (words.length && i < 3) ? 'open' : ''}>
        <summary><span class="mdoc">${s.doc === 'guide' ? 'GUIDE' : 'SLOOP'}</span>${esc(s.title)}</summary><div class="mbody">${s.html}</div></details>`).join('')
        : '<p>Nothing found. Try another word.</p>';
    };
    render(anchor ? '' : q);
    $('#msearch').oninput = (e) => render(e.target.value);
    if (!anchor) $('#msearch').focus();
  }
  async showWhatsNew() {
    this.current = null; this.panel.highlight([]);
    let w; try { w = await (await fetch('data/whatsnew.json?v=' + (window.SLOOP_COURSE_V || ''))).json(); } catch (_) { w = { releases: [] }; }
    $('#content').innerHTML = `<div class="crumb">Reference</div><h1>What's new in SLOOP</h1>
      <p class="lead">Every release's notes, from SLOOP's manual. ${this.manifest ? `The newest is <b>${esc(this.manifest.version)}</b>; the virtual FM-1 runs it.` : ''}</p>
      ${w.releases.map((r, i) => `<details class="msec" ${i === 0 ? 'open' : ''}><summary><span class="mdoc">${esc(r.version)}</span>New in SLOOP ${esc(r.version)}</summary><div class="mbody">${r.html}</div></details>`).join('')}`;
  }
  showKeys() {
    this.current = null; this.panel.highlight([]);
    $('#content').innerHTML = `<div class="crumb">Reference</div><h1>Computer keyboard map</h1>
      <p class="lead">For the virtual FM-1. Turn on <b>Keys</b> above the panel to see the letters on the controls.</p>
      <table><tr><th>Control</th><th>Key</th></tr>
      <tr><td>White keys F3 … A4</td><td>Z X C V B N M , . /</td></tr><tr><td>White keys B4 … G5</td><td>Q W E R T Y</td></tr>
      <tr><td>Black keys</td><td>S D F H J L ; ' and 2 3 5</td></tr>
      <tr><td>PLAY · REC</td><td>Space · Enter</td></tr><tr><td>OCT− · OCT+</td><td>- · =</td></tr>
      <tr><td>FX SEL ENV LFO EDIT GLO HOME</td><td>A G K U I O P</td></tr><tr><td>SAVE ARP SEQ</td><td>[ ] \\</td></tr>
      <tr><td>ALGORITHM · PRESETS · SELECT</td><td>1 · 4 · 6 (Shift: turn back)</td></tr><tr><td>KNOB 1–4</td><td>7 8 9 0 (Shift: turn back)</td></tr></table>
      <p>Mouse: drag a knob up or down, or use the wheel over it. Right-click a button to keep it held (click again to let go); on touch, long-press it.</p>`;
  }
  toast(t) {
    const el = $('#toast'); el.textContent = t; el.classList.add('show');
    clearTimeout(this.tt); this.tt = setTimeout(() => el.classList.remove('show'), 4500);
  }
}

const app = new App();
window.sloopCourse = app;
app.start();
