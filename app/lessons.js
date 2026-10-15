// SPDX-License-Identifier: GPL-3.0-only
// The course. Each lesson: id, title, body (HTML), steps. A step with `check` ticks itself when the FM-1 being
// checked (the virtual one, or yours when connected) matches; `show` lights those controls on the virtual
// panel; `hint` opens under "Stuck?". Checks read the FM-1 through the editor protocol (course.js `S`).
// Written for SLOOP 2.6 (data/course.json reviewedFor).

const k = (s) => `<kbd>${s}</kbd>`;
const PC = (n) => ((n % 12) + 12) % 12;
const pcs = (notes) => [...new Set(notes.map(PC))].sort((a, b) => a - b).join(',');
const want = (names) => pcs(names.map((s) => { const m = /^([A-G]#?)(\d)$/.exec(s); return ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'].indexOf(m[1]); }));
const sameSet = (a, b) => a.length === b.length && a.every((x) => b.includes(x));

export const MODULES = [
  {
    id: 'start', title: 'Start here', lessons: [
      {
        id: 'welcome', title: 'How this course works',
        body: `
<p class="lead">Learn SLOOP on the FM-1 by doing it: every lesson has steps that tick themselves off when your FM-1 is right.</p>
<h2>Two FM-1s</h2>
<p>The panel on the right is a <b>virtual FM-1 running the real SLOOP firmware</b>, compiled for the browser: the same screens, the same layers, the same sounds. Use it anywhere, with or without your FM-1.</p>
<p>Connect <b>your FM-1</b> by USB and the lessons check it instead: what you program on the hardware is read back and graded.</p>
<h2>Playing the virtual FM-1</h2>
<ul>
<li><b>Mouse or touch:</b> press keys and buttons; drag a knob up/down or use the mouse wheel. Hold a button while you press a key with a second finger (touch) or the keyboard.</li>
<li><b>Hold a button without a second hand:</b> right-click it (long-press on touch): it stays held until you click it again.</li>
<li><b>Computer keyboard:</b> turn on <i>Keys</i> above the panel to see which key does what. ${k('Space')} is PLAY, ${k('Enter')} is REC.</li>
</ul>
<div class="callout tip"><span class="ctitle">Stuck?</span>Every step has a hint. The <b>Manual</b> (left, bottom) searches SLOOP's own guide.</div>`,
        steps: [
          { text: 'Press <b>Power</b> on the virtual FM-1. It starts like the real one: the SLOOP logo, then the TRACKS screen.', check: ({ S }) => S.virtOn && S.stat.ms > 1500, show: ['power'] },
          { text: 'Play a few white keys. You hear track 1, <i>808 BOOM</i>.', check: ({ S }) => S.playedNote(), hint: 'Click the keys at the bottom of the panel, or press Z X C V on the computer keyboard (turn on Keys to see the map).' },
        ],
      },
      {
        id: 'connect', title: 'Connect your FM-1 (optional)',
        body: `
<p class="lead">With your FM-1 connected, lessons check the hardware, and the course can back it up and keep its firmware current.</p>
<ol>
<li>Use <b>Chrome or Edge</b> on a computer. Safari and Firefox have no Web MIDI.</li>
<li>Plug the FM-1 in with a <b>data</b> cable, straight into the computer (no hub). Turn it on.</li>
<li>Close other apps that use it (SLOOP's web editor, a DAW).</li>
<li>Press <b>Connect</b> in the bar above the panel and allow MIDI access.</li>
</ol>
<p>The bar then shows the SLOOP version on your FM-1. If a newer SLOOP exists, the <b>Firmware</b> lesson updates it from here.</p>
<div class="callout"><span class="ctitle">Which FM-1 is checked</span>When yours is connected, the steps check it. Switch to <b>Check: virtual</b> above the panel to practise on the virtual one.</div>`,
        steps: [
          { text: 'Connect your FM-1 (skip this lesson if you only use the virtual one).', check: ({ S }) => S.hwOn },
        ],
      },
    ],
  },
  {
    id: 'orient', title: 'Getting oriented', lessons: [
      {
        id: 'tracks', title: 'Four tracks, four colours',
        body: `
<p class="lead">SLOOP is four tracks playing together: three synths and a drum machine.</p>
<table><tr><th>Track</th><th>Colour</th><th>Plays</th></tr>
<tr><td>1</td><td><span class="dot t1"></span> blue</td><td>a synth (starts as 808 BOOM)</td></tr>
<tr><td>2</td><td><span class="dot t2"></span> green</td><td>a synth (RHODES)</td></tr>
<tr><td>3</td><td><span class="dot t3"></span> yellow</td><td>a synth (LOFI FLUTE)</td></tr>
<tr><td>4</td><td><span class="dot t4"></span> orange</td><td>the drums: 16 sounds, one per white key</td></tr></table>
<p>${k('ALGORITHM')} picks the track you play, record and edit, on every screen. ${k('PRESETS')} picks that track's sound, or on track 4, the kit. KNOB 1–4 have the track colours too: the dials at the bottom of the screen say what each one does right now.</p>
<p>On the screen, <b>white</b> always means <i>what you are touching</i>; <b>red</b> means <i>recording</i>.</p>
<h3>The drum keys</h3>
<table><tr><th>Key</th><th>Sound</th><th>Key</th><th>Sound</th><th>Key</th><th>Sound</th><th>Key</th><th>Sound</th></tr>
<tr><td>F3</td><td>kick</td><td>C4</td><td>hat</td><td>G4</td><td>snare 2</td><td>D5</td><td>ride</td></tr>
<tr><td>G3</td><td>kick 2</td><td>D4</td><td>open hat</td><td>A4</td><td>low tom</td><td>E5</td><td>shaker</td></tr>
<tr><td>A3</td><td>snare</td><td>E4</td><td>pedal hat</td><td>B4</td><td>hi tom</td><td>F5</td><td>conga</td></tr>
<tr><td>B3</td><td>clap</td><td>F4</td><td>rim</td><td>C5</td><td>crash</td><td>G5</td><td>cowbell</td></tr></table>`,
        steps: [
          { text: `Turn ${k('ALGORITHM')} to track <b>4</b> (orange).`, check: async ({ S }) => (await S.sel()) === 3, show: ['ALGORITHM'] },
          { text: 'Play the kick (the first white key, F3) and the snare (A3).', check: ({ S }) => S.playedDrum([0]) && S.playedDrum([2]), hint: 'On the drum track every white key is a sound: F3 kick, G3 kick 2, A3 snare, B3 clap…' },
          { text: `Turn ${k('PRESETS')} to the <b>909</b> kit.`, check: async ({ S }) => (await S.kit()) === '909', show: ['PRESETS'], hint: 'PRESETS on the drum track steps through the kits: ACOUSTIC, DEEP, TIGHT, BRIGHT, DUST, 808, 909…' },
          { text: `Turn ${k('ALGORITHM')} back to track <b>2</b> and play a few notes: the Rhodes.`, check: async ({ S }) => (await S.sel()) === 1 && S.playedNote(), show: ['ALGORITHM'] },
        ],
      },
      {
        id: 'taphold', title: 'Tap or hold: pages and layers',
        body: `
<p class="lead">Every function button has two lives. Learn this and the FM-1 makes sense.</p>
<ul>
<li><b>Tap</b> it (press and let go, touching nothing else): its <b>pages</b> open, for sound design and settings. Tap again for its next page; ${k('SELECT')} walks the pages both ways. ${k('HOME')} goes back to TRACKS.</li>
<li><b>Hold</b> it: a <b>layer</b>. While it is held, the 16 white keys and KNOB 1–4 change job, and the screen shows the keys as 16 tiles (four rows of four) and the knobs as dials. Let go: back to playing.</li>
</ul>
<table><tr><th>Hold</th><th>The keys</th></tr>
<tr><td>FX</td><td>punch-in effects</td></tr><tr><td>EDIT</td><td>erase a sound from the pattern</td></tr>
<tr><td>ARP</td><td>note repeat (rolls)</td></tr><tr><td>SEQ</td><td>the 16 steps</td></tr>
<tr><td>SEL</td><td>the key of the song, one-key chords</td></tr><tr><td>GLO</td><td>mute, solo, fills, tap tempo</td></tr>
<tr><td>SAVE</td><td>song sections A–D</td></tr></table>
<p><b>Lock a layer:</b> hold its button and tap ${k('HOME')}. It stays open with both hands free (LOCK on the screen). Any other button lets it go.</p>`,
        steps: [
          { text: `Hold ${k('SEQ')}: the screen shows the 16 step tiles. Let go.`, check: ({ S }) => S.sawLayer('STEP'), show: ['SEQ'] },
          { text: `Tap ${k('ENV')}: the envelope page opens.`, check: ({ S }) => /^ENV/.test(S.stat.page), show: ['ENV'] },
          { text: `Turn ${k('SELECT')} one click: the next page of ENV.`, check: ({ S }) => S.stat.page === 'ENV DEST', show: ['SELECT'] },
          { text: `Tap ${k('HOME')}: back to TRACKS.`, check: ({ S }) => S.stat.page === 'TRACKS' && S.stat.layer === 0, show: ['HOME'] },
          { text: `Lock the FX layer: hold ${k('FX')}, tap ${k('HOME')}, let go of FX. The FX tiles stay. Then tap FX to unlock.`, check: ({ S }) => S.sawLocked('FX'), show: ['FX', 'HOME'], hint: 'Keep FX held while you tap HOME, then release FX. The screen says LOCK.', virtualOnly: true },
        ],
      },
      {
        id: 'screen', title: 'The TRACKS screen and the tempo',
        body: `
<p class="lead">${k('HOME')} is the performance view: tempo, transport, and the four tracks with their sound, steps and level.</p>
<ul>
<li>The big number is the <b>tempo</b>. On TRACKS, ${k('SELECT')} sets it (inside a layer too).</li>
<li>Each track row: its sound and engine, its steps (the playhead moves along them), its level bar.</li>
<li>The four dials: <b>SWING · LEVEL · STEPS · PAN</b> of the selected track, on KNOB 1–4.</li>
<li>${k('PLAY')} starts and stops all four tracks; its light flashes on every beat.</li>
</ul>`,
        steps: [
          { text: `On TRACKS, turn ${k('SELECT')} to <b>100</b> BPM.`, check: async ({ S }) => (await S.bpm()) === 100, show: ['SELECT'] },
          { text: `Press ${k('PLAY')}, watch the playhead move, press it again to stop.`, check: ({ S }) => S.sawPlaying(), show: ['PLAY'] },
          { text: `Turn ${k('KNOB 2')} to change the selected track's level, and see its bar move.`, check: ({ S }) => S.turned(4), show: ['K2'] },
        ],
      },
    ],
  },
  {
    id: 'drive', title: 'Driving the FM-1', lessons: [
      {
        id: 'steps', title: 'Steps under your fingers (SEQ)',
        body: `
<p class="lead">Hold ${k('SEQ')}: the 16 white keys are the 16 steps of the pattern. Lit keys are the steps that play.</p>
<ul>
<li><b>An empty step:</b> press its key, it is set. On the drum track, with the sound shown on the screen: KNOB 1 picks it, or hit a pad first.</li>
<li><b>A set step:</b> press and let go, it is cleared. Hold it and turn a knob instead to edit just that step: KNOB 2 level (ghost, soft, norm, hard), KNOB 3 ratchet (x1–x4), KNOB 4 nudge (micro timing).</li>
<li><b>No step held:</b> KNOB 1 sound, KNOB 2 division (1/16 = four steps a beat), KNOB 3 swing, KNOB 4 length (1–64 steps).</li>
</ul>
<p>A bar is 16 steps at 1/16. Longer patterns have pages: the first four black keys (or OCT−/OCT+) pick steps 1–16, 17–32, 33–48, 49–64.</p>`,
        steps: [
          { text: `Select track <b>4</b>, hold ${k('SEQ')} and press white keys <b>1, 5, 9, 13</b>: a kick on every beat.`, check: async ({ S }) => S.laneIs('KICK', [1, 5, 9, 13], 16), show: ['ALGORITHM', 'SEQ'], hint: 'The sound shown on the SEQ screen must be KICK: tap the kick key (F3) first, or turn KNOB 1 while holding SEQ. Keys 1, 5, 9, 13 are F3, C4, G4 and D5.' },
          { text: `Now the hat on the off-beats, steps <b>3, 7, 11, 15</b>: hold SEQ, turn KNOB 1 to HAT, press those keys.`, check: async ({ S }) => S.laneIs('HAT', [3, 7, 11, 15], 16), show: ['SEQ', 'K1'] },
          { text: `Press ${k('PLAY')}. Hold SEQ, hold step <b>15</b>'s key and turn KNOB 3 to <b>x2</b>: a double hat.`, check: async ({ S }) => (await S.hit('HAT', 15))?.rat === 1, show: ['SEQ', 'K3'], hint: 'Keep SEQ held, then hold the 15th white key (F5) and turn KNOB 3 one click. Let go of the step key first, then SEQ.' },
        ],
      },
      {
        id: 'record', title: 'Record live, undo, clear',
        body: `
<p class="lead">SLOOP records what you play onto the selected track, snapped to the grid as you heard it, on top of what is there (overdub).</p>
<table><tr><th>When</th><th>${k('REC')} does</th></tr>
<tr><td>Playing</td><td>records at once; REC again stops recording, the loop plays on</td></tr>
<tr><td>Stopped, with notes</td><td>arms it: your first note starts the loop as step 1</td></tr>
<tr><td>Stopped, empty project</td><td>a <b>free take</b>: play at your own tempo, press REC on the "1" after your last bar; the loop length sets the tempo</td></tr></table>
<ul><li><b>Undo / redo:</b> hold ${k('EDIT')}, press ${k('OCT−')} / ${k('OCT+')}.</li>
<li><b>Clear the track:</b> hold ${k('REC')} about 2 seconds (a ring fills).</li>
<li>Drums: hold ${k('OCT−')} while you hit for ghost notes, ${k('OCT+')} for hard ones.</li></ul>`,
        steps: [
          { text: `On track 4, press ${k('PLAY')}, then ${k('REC')}, and play claps on beats 2 and 4 (B3) for a couple of bars. Press REC to stop recording.`, check: async ({ S }) => (await S.laneSteps('CLAP', 16)).length > 0, show: ['PLAY', 'REC'], hint: 'Watch the PLAY light: it flashes on every beat. Hit the clap on the 2nd and 4th flash.' },
          { text: `Undo it: hold ${k('EDIT')} and press ${k('OCT−')}. The claps are gone.`, check: async ({ S }) => (await S.laneSteps('CLAP', 16)).length === 0, show: ['EDIT', 'OCT-'] },
          { text: `Redo: hold ${k('EDIT')} and press ${k('OCT+')}. They are back.`, check: async ({ S }) => (await S.laneSteps('CLAP', 16)).length > 0, show: ['EDIT', 'OCT+'] },
        ],
      },
      {
        id: 'erase', title: 'Erase as it plays (EDIT) and rolls (ARP)',
        body: `
<p class="lead">Two layers for live pattern surgery.</p>
<ul><li><b>EDIT held + a key:</b> that sound leaves the pattern on every step the playhead passes while you hold it. Stopped, it goes from the whole pattern at once. KNOB 1 shifts the pattern, KNOB 2 doubles or halves its length, KNOB 3 transposes (synths).</li>
<li><b>ARP held + a key:</b> note repeat on the grid at the RATE of KNOB 1 (1/8 to 1/64). Recording, a roll is written as ratchets.</li></ul>`,
        steps: [
          { text: `On track 4, stopped, hold ${k('EDIT')} and press the hat key (C4): every hat is erased.`, check: async ({ S }) => (await S.laneSteps('HAT', 16)).length === 0, show: ['EDIT'] },
          { text: 'Undo it (EDIT + OCT−): the hats come back.', check: async ({ S }) => (await S.laneSteps('HAT', 16)).length > 0, show: ['EDIT', 'OCT-'] },
          { text: `Press PLAY, hold ${k('ARP')} and hold the hat key: a 1/16 hat roll. Turn KNOB 1 for faster rolls.`, check: ({ S }) => S.sawLayer('ROLL'), show: ['ARP', 'K1'] },
        ],
      },
      {
        id: 'mix', title: 'Mute, solo, levels (GLO)',
        body: `
<p class="lead">Hold ${k('GLO')}: the mix layer.</p>
<ul><li>White keys <b>1–4</b> mute tracks 1–4; keys <b>5–8</b> solo them.</li>
<li>KNOB 1–4: the level of tracks 1–4.</li>
<li>Key <b>9</b>: a fill while held; key <b>10</b>: the next bar is a fill. Key <b>16</b>: tap tempo.</li></ul>`,
        steps: [
          { text: `Hold ${k('GLO')} and press key <b>4</b>: the drums are muted.`, check: async ({ S }) => (await S.tracks()).list[3].mute === 1, show: ['GLO'] },
          { text: 'Press key 4 again (GLO held): unmuted.', check: async ({ S }) => (await S.tracks()).list[3].mute === 0, show: ['GLO'] },
        ],
      },
      {
        id: 'fx', title: 'Punch-in effects and the master',
        body: `
<p class="lead">Hold ${k('FX')}: every key is an effect on the whole mix while you hold it, locked to the tempo.</p>
<table><tr><th>Keys</th><th>Effects</th></tr>
<tr><td>1–4</td><td>loop 1/4, 1/8, 1/16, 1/32</td></tr><tr><td>5–8</td><td>stutter, reverse, tape stop, half speed</td></tr>
<tr><td>9–12</td><td>low-pass sweep, high-pass sweep, phone, bit crush</td></tr><tr><td>13–16</td><td>alias, gate, echo, tape wobble</td></tr>
<tr><td>black keys</td><td>kill low / mid / high, rewind, octave up, flanger, auto-pan, freeze, loop 8T, mono, fade out</td></tr></table>
<p>With FX held the knobs drive the master: <b>KNOB 1</b> DJ filter (left low-pass, right high-pass), <b>KNOB 2</b> DUST (an old sampler and a record), <b>KNOB 3</b> DUCK (the kick pumps the synths), <b>KNOB 4</b> the selected track's filter.</p>`,
        steps: [
          { text: `Press PLAY. Hold ${k('FX')} and hold key <b>7</b> (tape stop), then key <b>1</b> (loop 1/4).`, check: ({ S }) => S.sawLayer('FX'), show: ['FX'] },
          { text: `Still holding FX, turn ${k('KNOB 2')} to add some DUST.`, check: async ({ S }) => (await S.g('DUST')) > 0, show: ['FX', 'K2'] },
          { text: 'Turn it back to 0: DUST off.', check: async ({ S }) => (await S.g('DUST')) === 0, show: ['FX', 'K2'] },
        ],
      },
    ],
  },
  {
    id: 'theory', title: 'Sound and theory, the SLOOP way', lessons: [
      {
        id: 'time', title: 'Steps, bars, division, swing',
        body: `
<p class="lead">Every track has its own <b>length</b> (1–64 steps), <b>division</b> (how long a step is) and <b>swing</b>.</p>
<ul><li>At <b>1/16</b>, four steps make a beat and 16 a bar. At 1/8, 16 steps are two bars.</li>
<li>Each track loops on its own length, so a 16-step drum bar loops four times under a 64-step (four-bar) chord progression. That is normal, and how most beats work.</li>
<li><b>Swing</b> 0 is straight; higher delays every second step (MPC swing). The track's swing adds to the global one (GLO → GLOBAL).</li></ul>
<p>All three live on the SEQ layer with no step held: KNOB 2 DIV, KNOB 3 SWING, KNOB 4 LENGTH.</p>`,
        steps: [
          { text: `On track 4, hold ${k('SEQ')} and turn ${k('KNOB 3')} to swing <b>12</b>.`, check: async ({ S }) => (await S.p(3, 'SWG')) === 12, show: ['SEQ', 'K3'] },
          { text: `Hold SEQ and turn ${k('KNOB 4')} to length <b>32</b>, then back to <b>16</b>.`, check: async ({ S }) => (await S.p(3, 'LEN')) === 16 && S.turned(6), show: ['SEQ', 'K4'] },
        ],
      },
      {
        id: 'keys', title: 'Keys, scales and one-key chords (SEL)',
        body: `
<p class="lead">Hold ${k('SEL')} (between FX and ENV; not the SELECT knob): the key and chord layer.</p>
<ul><li><b>Any key</b> sets the key of the song for all three synth tracks.</li>
<li><b>KNOB 1 CHORD</b> (selected synth track): OFF, TRIAD, 7TH, 9TH, SUS4, POWER. With a chord on, the white keys walk the scale from C4: C4 plays chord I, D4 chord II, E4 chord III…</li>
<li><b>KNOB 2 SCALE</b>: major, minor, dorian, pentatonic, blues…; <b>KNOB 3 KEYS</b>: chromatic, snap to the scale, or white keys only.</li>
<li><b>CHORD+</b>: while a chord plays, hold a black key: F# major↔minor, G# adds the 7th, A# sus4, C# the 9th, D# an inversion.</li></ul>
<div class="callout tip"><span class="ctitle">Why it works</span>A scale is seven notes that sound right together. Chords built only from those notes always fit the key, so one finger per chord can't go wrong.</div>`,
        steps: [
          { text: `Select track 2. Hold ${k('SEL')} and press <b>A</b> (A3): the song is in A.`, check: async ({ S }) => (await S.p(1, 'ROOT')) === 9, show: ['ALGORITHM', 'SEL'] },
          { text: `Hold SEL, turn ${k('KNOB 2')} to <b>MIN</b>.`, check: async ({ S }) => (await S.pname(1, 'SCL')) === 'MIN', show: ['SEL', 'K2'] },
          { text: `Hold SEL, turn ${k('KNOB 1')} to <b>7TH</b>. Play C4, F4, G4: i, iv, v chords of A minor, one finger each.`, check: async ({ S }) => (await S.pname(1, 'CHORD')) === '7TH', show: ['SEL', 'K1'] },
          { text: 'Set CHORD back to OFF and the key back to C (SEL + C4), so the next lessons start clean.', check: async ({ S }) => (await S.pname(1, 'CHORD')) === 'OFF' && (await S.p(1, 'ROOT')) === 0, show: ['SEL', 'K1'] },
        ],
      },
      {
        id: 'sound', title: 'Sounds: engines, envelope, filter, sends',
        body: `
<p class="lead">Every sound is a patch on one of twelve engines; the pages under ENV, LFO, EDIT and FX shape it.</p>
<ul><li>${k('PRESETS')}: 153 sounds by kind (bass, keys, organ, pad, lead, pluck, stab, FX); the engine follows.</li>
<li><b>ENV</b> (tap): attack, decay, sustain, release: how a note starts and fades.</li>
<li><b>EDIT</b> (tap): the engine's own controls, filter included.</li>
<li><b>FX</b> (tap): drive and the sends to chorus, delay and reverb; then FILTER (one knob: left low-pass, right high-pass), INSERT.</li></ul>
<p>Changing a sound never changes the pattern, the key or the mix of its track.</p>`,
        steps: [
          { text: `Select track 2, turn ${k('PRESETS')} to <b>M1 PIANO</b>.`, check: async ({ S }) => (await S.preset(1)) === 'M1 PIANO', show: ['ALGORITHM', 'PRESETS'] },
          { text: `Tap ${k('FX')}: the FX page. Turn ${k('KNOB 4')} (REV) up and play.`, check: async ({ S }) => (await S.p(1, 'REV')) > 0, show: ['FX', 'K4'] },
          { text: 'Turn PRESETS back to <b>RHODES</b> for the beat lesson.', check: async ({ S }) => (await S.preset(1)) === 'RHODES', show: ['PRESETS'] },
        ],
      },
    ],
  },
  {
    id: 'house', title: 'Your first beat: soft house', lessons: [
      {
        id: 'h-setup', title: '1 · A clean project at 116 BPM',
        body: `
<p class="lead">A warm soft-house beat at 116 BPM: Rhodes chords, a sub bass, a quiet guitar melody, swinging drums. Built entirely on the FM-1.</p>
<p>The plan: drums (one bar, looping), then four bars of chords, bass and melody, then the mix. The drums are 16 steps and the other tracks 64: the drum bar loops four times under the progression.</p>
<div class="callout warn"><span class="ctitle">On your FM-1</span>A new project empties the working loop. Saved sections A–D stay. Save first (SAVE + key 5–8) if you want to keep what is there.</div>`,
        steps: [
          { text: `New project: tap ${k('SAVE')} on a page other than TRACKS (tap ENV first), turn ${k('SELECT')} to <b>TOOLS</b>, turn ${k('KNOB 4')} NEW one click, then another within about 1.5 s.`, check: async ({ S }) => S.emptyProject(), show: ['SAVE', 'SELECT', 'K4'], hint: 'On TRACKS, SAVE opens the SONG screen instead: tap ENV, then SAVE. The SAVE pages are PRESETS, USER, PROJECT and TOOLS: SELECT moves between them. NEW asks for a second click to confirm.' },
          { text: `${k('HOME')}, then ${k('SELECT')} to <b>116</b> BPM.`, check: async ({ S }) => (await S.bpm()) === 116, show: ['HOME', 'SELECT'] },
          { text: `Track 4: ${k('PRESETS')} to the <b>D.HOUSE</b> kit.`, check: async ({ S }) => (await S.kit()) === 'D.HOUSE', show: ['ALGORITHM', 'PRESETS'] },
          { text: '<i>Optional, on your FM-1:</i> SLOOP\'s web editor has a <b>Drum synth</b> page to make a softer copy of D.HOUSE (kick CLICK down, shorter clap and open hat). It needs the editor, so it is not checked here.', optional: true },
        ],
      },
      {
        id: 'h-drums', title: '2 · The drums',
        body: `
<p class="lead">One bar, 16 steps, a little swing. Each sound has a level: ghost, soft, norm (as played) or hard.</p>
<table><tr><th>Sound (key)</th><th>Steps</th><th>Level</th></tr>
<tr><td>KICK (F3)</td><td>1, 5, 9, 13</td><td>NORM</td></tr>
<tr><td>CLAP (B3)</td><td>5, 13</td><td>SOFT</td></tr>
<tr><td>HAT (C4)</td><td>3, 7, 11</td><td>SOFT</td></tr>
<tr><td>OPEN HAT (D4)</td><td>15</td><td>SOFT</td></tr>
<tr><td>SHAKER (E5)</td><td>2, 4, 6, 8, 10, 12, 14, 16</td><td>GHOST</td></tr>
<tr><td>RIM (F4)</td><td>12</td><td>GHOST</td></tr></table>
<p><b>How:</b> hold ${k('SEQ')}, turn KNOB 1 to the sound (or tap its key first), press the step keys. Then, still holding SEQ, hold a step and turn ${k('KNOB 2')} for the level of the sound shown: one click left is SOFT, two GHOST (hold several step keys to set them together). When you play live instead of entering steps, hold ${k('OCT−')} while you hit for ghost notes.</p>
<p>Tip: the SEQ layer on the drum track also has a grid page: tap SEQ and see all 16 sounds × 16 steps.</p>`,
        steps: [
          { text: 'Pattern settings: hold SEQ, KNOB 4 length <b>16</b>, KNOB 2 division <b>1/16</b>, KNOB 3 swing <b>12</b>.', check: async ({ S }) => (await S.p(3, 'LEN')) === 16 && (await S.pname(3, 'DIV')) === '1/16' && (await S.p(3, 'SWG')) === 12, show: ['SEQ', 'K2', 'K3', 'K4'] },
          { text: 'KICK on 1, 5, 9, 13.', check: async ({ S }) => S.laneIs('KICK', [1, 5, 9, 13], 16) },
          { text: 'CLAP on 5 and 13.', check: async ({ S }) => S.laneIs('CLAP', [5, 13], 16) },
          { text: 'HAT on 3, 7, 11 and OPEN HAT on 15.', check: async ({ S }) => (await S.laneIs('HAT', [3, 7, 11], 16)) && (await S.laneIs('OPEN HAT', [15], 16)) },
          { text: 'SHAKER on every even step, RIM on 12.', check: async ({ S }) => (await S.laneIs('SHAKER', [2, 4, 6, 8, 10, 12, 14, 16], 16)) && (await S.laneIs('RIM', [12], 16)) },
          { text: 'Levels: claps, hats and open hat <b>SOFT</b>; shakers and rim <b>GHOST</b>.', check: async ({ S }) => S.levelsAre({ CLAP: 'SOFT', HAT: 'SOFT', 'OPEN HAT': 'SOFT', SHAKER: 'GHOST', RIM: 'GHOST' }, 16), hint: 'Tap the sound\'s key first (or, with SEQ held, turn KNOB 1 until the screen shows it). Then hold SEQ, hold a step key that has the sound and turn KNOB 2 left: one click SOFT, two GHOST. A step holds several sounds; the level goes to the one shown.' },
          { text: `Press ${k('PLAY')}: a steady kick, claps on 2 and 4, a gently swinging shaker.`, check: ({ S }) => S.sawPlaying(), show: ['PLAY'] },
        ],
      },
      {
        id: 'h-chords', title: '3 · Rhodes chords',
        body: `
<p class="lead">Four bars, two short chords a bar: Am7, Fmaj7, Cmaj7, G7. Close voicings, so the hands barely move.</p>
<table><tr><th>Bar</th><th>Chord</th><th>Notes</th><th>Steps</th></tr>
<tr><td>1</td><td>Am7</td><td>A3 C4 E4 G4</td><td>3, 11</td></tr>
<tr><td>2</td><td>Fmaj7</td><td>A3 C4 E4 F4</td><td>19, 27</td></tr>
<tr><td>3</td><td>Cmaj7</td><td>G3 B3 C4 E4</td><td>35, 43</td></tr>
<tr><td>4</td><td>G7</td><td>G3 B3 D4 F4</td><td>51, 59</td></tr></table>
<p><b>How, on the FM-1:</b> an empty step set with SEQ takes the note or <b>chord you played last</b>. So: play the chord (all four keys together), hold ${k('SEQ')}, press the step key. Steps 17–32 are page 2: with SEQ held, press the second black key (G#3) or ${k('OCT+')}.</p>
<p>On the virtual FM-1, hold the four keys on the computer keyboard (turn on <i>Keys</i>), or use touch.</p>
<p><b>Shorter notes</b> (optional): tap SEQ for the STEP page; KNOB 1 moves to a step, KNOB 3 LEN sets how many steps it lasts (2 = an eighth note).</p>`,
        steps: [
          { text: `Track 2: ${k('PRESETS')} RHODES; hold SEQ, ${k('KNOB 4')} length <b>64</b>, division 1/16, swing 0.`, check: async ({ S }) => (await S.preset(1)) === 'RHODES' && (await S.p(1, 'LEN')) === 64 && (await S.pname(1, 'DIV')) === '1/16', show: ['ALGORITHM', 'PRESETS', 'SEQ', 'K4'] },
          { text: 'Am7 on steps 3 and 11.', check: async ({ S }) => S.chordAt(1, [3, 11], ['A3', 'C4', 'E4', 'G4']) },
          { text: 'Fmaj7 on steps 19 and 27 (page 2).', check: async ({ S }) => S.chordAt(1, [19, 27], ['A3', 'C4', 'E4', 'F4']) },
          { text: 'Cmaj7 on steps 35 and 43 (page 3).', check: async ({ S }) => S.chordAt(1, [35, 43], ['G3', 'B3', 'C4', 'E4']) },
          { text: 'G7 on steps 51 and 59 (page 4).', check: async ({ S }) => S.chordAt(1, [51, 59], ['G3', 'B3', 'D4', 'F4']) },
          { text: 'Soften it: tap FX for the FX page, a little CHO and REV, DST at zero; then the FILTER page (SELECT) slightly left of centre.', check: async ({ S }) => (await S.p(1, 'REV')) > 0 && (await S.p(1, 'FILT')) < 0, show: ['FX', 'SELECT'] },
        ],
      },
      {
        id: 'h-bass', title: '4 · The bass',
        body: `
<p class="lead">A sub bass on the off-beats, between the kicks, following the chord roots.</p>
<table><tr><th>Bar</th><th>Note</th><th>Steps</th></tr>
<tr><td>1</td><td>A3</td><td>3, 7, 11, 15</td></tr><tr><td>2</td><td>F3</td><td>19, 23, 27, 31</td></tr>
<tr><td>3</td><td>C4</td><td>35, 39, 43, 47</td></tr><tr><td>4</td><td>G3</td><td>51, 55, 59, 63</td></tr></table>
<p>SUB BASS already plays two octaves below the keys: enter the notes as written, don't transpose.</p>
<p><b>How:</b> play the note once, hold SEQ, press the step keys (the last note played is what gets set).</p>`,
        steps: [
          { text: `Track 1: ${k('PRESETS')} <b>SUB BASS</b>; hold SEQ, length <b>64</b>, division 1/16.`, check: async ({ S }) => (await S.preset(0)) === 'SUB BASS' && (await S.p(0, 'LEN')) === 64, show: ['ALGORITHM', 'PRESETS', 'SEQ', 'K4'] },
          { text: 'A3 on 3, 7, 11, 15.', check: async ({ S }) => S.noteAt(0, [3, 7, 11, 15], 'A3') },
          { text: 'F3 on 19, 23, 27, 31.', check: async ({ S }) => S.noteAt(0, [19, 23, 27, 31], 'F3') },
          { text: 'C4 on 35, 39, 43, 47.', check: async ({ S }) => S.noteAt(0, [35, 39, 43, 47], 'C4') },
          { text: 'G3 on 51, 55, 59, 63.', check: async ({ S }) => S.noteAt(0, [51, 55, 59, 63], 'G3') },
        ],
      },
      {
        id: 'h-melody', title: '5 · A quiet guitar melody',
        body: `
<p class="lead">MUTED GTR is a physical model (the PHYS engine): a plucked string. Sparse notes, one every half bar.</p>
<table><tr><th>Step</th><th>7</th><th>15</th><th>23</th><th>31</th><th>39</th><th>47</th><th>55</th><th>63</th></tr>
<tr><td>Note</td><td>E5</td><td>G5</td><td>A5</td><td>G5</td><td>E5</td><td>D5</td><td>B4</td><td>D5</td></tr></table>
<p>A5 is above the keys: press ${k('OCT+')}, and the A4 key plays A5. Press ${k('OCT−')} afterwards to come back (both OCT buttons together: back to 0).</p>`,
        steps: [
          { text: `Track 3: ${k('PRESETS')} <b>MUTED GTR</b>, length 64.`, check: async ({ S }) => (await S.preset(2)) === 'MUTED GTR' && (await S.p(2, 'LEN')) === 64, show: ['ALGORITHM', 'PRESETS'] },
          { text: 'The melody, steps 7 to 63 as in the table.', check: async ({ S }) => S.melody(2, { 7: 'E5', 15: 'G5', 23: 'A5', 31: 'G5', 39: 'E5', 47: 'D5', 55: 'B4', 63: 'D5' }), hint: 'Each note: play it, hold SEQ, press the step key on the right page (7 and 15 on page 1, 23 and 31 on page 2…).' },
          { text: 'Bring it down: on TRACKS, KNOB 2 (LEVEL) a bit lower than the Rhodes.', check: async ({ S }) => { const t = (await S.tracks()).list; return t[2].level < t[1].level; } },
        ],
      },
      {
        id: 'h-mix', title: '6 · Delay, pump and dust',
        body: `
<p class="lead">The finishing touches: a dotted-eighth echo, the house pump, a little vinyl.</p>
<ul><li><b>Delay time</b> is shared by all tracks: tap FX, turn SELECT to the <b>DLY</b> page: TIME <b>1/8D</b> (KNOB 1), FDBK low (KNOB 2), COLR toward dark (KNOB 3), MIX (KNOB 4).</li>
<li><b>The melody's delay send:</b> track 3, FX page, DLY up a little.</li>
<li><b>Drums into the delay:</b> GLO → DRUMS, DLY just above zero.</li>
<li><b>DUCK</b> 25 %: every kick pumps the synths down and back. <b>DUST</b> about 6 %. Both on FX held + KNOB 3 / KNOB 2, or GLO → MASTER.</li></ul>`,
        steps: [
          { text: 'Delay TIME <b>1/8D</b>.', check: async ({ S }) => (await S.gname('TIME')) === '1/8D', show: ['FX', 'SELECT', 'K1'], hint: 'Tap FX, then turn SELECT through its pages (FX, FILTER, SLICER, INSERT, INSERT 2, DLY) until TIME, FDBK, COLR, MIX.' },
          { text: 'Track 3 delay send above 0.', check: async ({ S }) => (await S.p(2, 'DLY')) > 0 },
          { text: 'DUCK about 25 % and DUST about 6 %.', check: async ({ S }) => { const d = await S.gpct('DUCK'), u = await S.gpct('DUST'); return d >= 15 && d <= 35 && u >= 2 && u <= 12; }, show: ['FX', 'K2', 'K3'] },
          { text: 'Listen on headphones and balance: drums first, bass under the kick, Rhodes filling, melody quiet.', optional: true },
        ],
      },
      {
        id: 'h-save', title: '7 · Save it',
        body: `
<p class="lead">Save the loop into song section <b>A</b>: hold ${k('SAVE')} and press white key <b>5</b>. Sections A–D are the four project slots.</p>
<p>On the virtual FM-1, the course keeps your work in this browser between visits. On your FM-1, everything is kept in its flash; the <b>Firmware &amp; care</b> lesson makes a full backup file.</p>`,
        steps: [
          { text: `Hold ${k('SAVE')}, press key <b>5</b>: saved into A.`, check: async ({ S }) => S.slotUsed(0), show: ['SAVE'] },
        ],
      },
    ],
  },
  {
    id: 'perform', title: 'Arrange and perform', lessons: [
      {
        id: 'sections', title: 'Sections A–D and the quick chain',
        body: `
<p class="lead">A song is made of sections A–D (each holds all four tracks). Make them live:</p>
<ul><li><b>Save:</b> SAVE + keys 5–8 save the loop into A–D (saving over a used one asks for the key again).</li>
<li><b>Play:</b> SAVE + keys 1–4 play A–D. Playing, the change comes on the next bar, always in time.</li>
<li><b>Quick chain:</b> keep SAVE held and tap several sections (A A B C): let go, they play in turn, round and round.</li></ul>`,
        steps: [
          { text: 'Make a variation (for example erase the shaker: EDIT + E5), then SAVE + key <b>6</b>: section B.', check: async ({ S }) => S.slotUsed(1), show: ['EDIT', 'SAVE'] },
          { text: 'Press PLAY. SAVE + key 1 (A), then SAVE + key 2 (B): the change lands on the bar.', check: ({ S }) => S.sawLayer('SONG') && S.sawPlaying(), show: ['SAVE', 'PLAY'] },
          { text: 'Chain: hold SAVE, tap keys 1, 1, 2, then let go. The screen reads <i>chain A A B</i>.', show: ['SAVE'], optional: true },
        ],
      },
      {
        id: 'song', title: 'Record a song',
        body: `
<p class="lead">Record the order you play the sections in, then play it back as a song.</p>
<ol><li>SAVE + key <b>14</b>: SONG REC from the next bar. Play sections with SAVE + 1–4. SAVE + 14 again (or STOP) ends it.</li>
<li>SAVE + key <b>13</b> switches loop / song. In song mode PLAY plays the whole song and stops at the end.</li>
<li>Tap SAVE on TRACKS (or SAVE + 16) for the SONG screen: edit the order by hand with KNOB 1–4.</li></ol>`,
        steps: [
          { text: 'Record a short song of A and B, then play it back in song mode.', optional: true, show: ['SAVE', 'PLAY'] },
        ],
      },
      {
        id: 'fills', title: 'Fills that come in on the bar',
        body: `
<p class="lead">Any step can be <b>FILL ONLY</b> (plays only during a fill) or <b>NO FILL</b> (silent during one).</p>
<ul><li>Hold SEQ, hold a step, press ${k('OCT+')}: normal → fill only → no fill. A tile shows <b>F</b> or <b>×</b>.</li>
<li>Hold ${k('GLO')} + key <b>9</b>: a fill while held. GLO + key <b>10</b>: the whole next bar is a fill.</li></ul>`,
        steps: [
          { text: 'On the drums, add snares (A3) on steps 13–16 and make them FILL ONLY. Then PLAY and GLO + key 10.', optional: true, show: ['SEQ', 'OCT+', 'GLO'] },
        ],
      },
    ],
  },
  {
    id: 'care', title: 'Firmware and care', lessons: [
      {
        id: 'firmware', title: 'Back up and update SLOOP', panel: 'firmware',
        body: `
<p class="lead">Keep your FM-1 on the newest SLOOP, from here. This site mirrors every SLOOP release from its GitHub page, unchanged, the night it comes out.</p>
<ol><li><b>Back up first.</b> The backup file is the same as SLOOP's web editor's: its <i>Restore</i> reads it.</li>
<li><b>Update.</b> The package is checked (size, SHA-256, its FM-1 identity) before anything is written, and the FM-1 checks it again before it starts the new firmware. Your projects, presets, samples and settings are kept.</li></ol>
<div class="callout warn"><span class="ctitle">Before you press Install</span>Use a data cable straight into the computer, keep the FM-1 charged, close other MIDI apps, and don't unplug it until <i>Done</i>. SLOOP is beta firmware, installed at your own risk.</div>
<h3>If something goes wrong</h3>
<ul><li><b>Interrupted:</b> the FM-1 stays in update mode. Press Install again: it finishes.</li>
<li><b>USB rescue:</b> hold ${k('OCT−')} alone while switching on (SLOOP USB RESCUE), then install again.</li>
<li><b>Back to the official firmware:</b> SLOOP's installer page has <i>Return to the official firmware (V15)</i>.</li></ul>`,
        steps: [
          { text: 'Connect your FM-1.', check: ({ S }) => S.hwOn },
          { text: 'Save a backup file.', check: ({ S }) => S.flag('backup') },
          { text: 'Your FM-1 runs the newest SLOOP.', check: ({ S }) => S.hwOn && S.hwCurrent() },
        ],
      },
    ],
  },
];

export const LESSONS = MODULES.flatMap((m) => m.lessons.map((l) => ({ ...l, module: m.id, moduleTitle: m.title })));
export const helpers = { pcs, want, sameSet };
