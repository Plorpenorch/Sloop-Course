/* SPDX-License-Identifier: GPL-3.0-only */
void isr_alnk0(void) {}
/* The emulator's main: felucca_init and the main loop of firmware/src/main.c, run by the host one
 * UI frame at a time, and the audio ISR's render, called for each block the browser asks for. */
#define EMU_EXPORT(n) __attribute__((export_name(n)))

static void emu_felucca_init(void)              /* main.c felucca_init */
{
    uint32_t i;
    for (i = 0; i < G_COUNT; i++)
        song.g[i] = GP[i].def;
    fm6_init();
    for (i = 0; i < NTRK; i++) {
        track_t *t = &trk[i];
        track_defaults(t);
        if (i < NPART) {
            set_engine_of(t, TRK_DEF[i][0]);
            apply_preset_to(t, TRK_DEF[i][1]);
            t->engine = t->eng_req;
        }
        track_defaults_steps(t);
    }
    TDRUM->p[P_E0] = DRUM_DEFAULT_KIT;
    song.sel = 0;
    song.master_q12 = 2048;
    autosave_resume();
    song.g[G_SYNC] = (int16_t)lights_sync;
    song.g[G_MIDI] = (int16_t)lights_mout;
    song.g[G_ROUTE] = (int16_t)lights_min;
    song.g[G_CH1] = midi_set[0], song.g[G_CH2] = midi_set[1], song.g[G_CH3] = midi_set[2];
    song.g[G_DRCH] = midi_set[3], song.g[G_CHOTH] = midi_set[4], song.g[G_BEND] = midi_set[5];
    song.g[G_FXCH] = midi_set[6];
    song.g[G_DRMAP] = midi_set[7];
    song.g[G_CLKOUT] = midi_set[9];
    song.g[G_RMCH] = midi_set[8];
    layers_init();
    go_home();
    ui.force = 1;
}

static int32_t emu_knob = 512 * 16;
static float emu_out[HALF_FRAMES * 2];
static int32_t emu_blk[HALF_FRAMES * 2];
static uint32_t emu_frame_ms;
static uint8_t emu_booted;

EMU_EXPORT("emu_init") void emu_init(void)
{
    usb.config = 1;                                 /* "connected": the editor protocol answers */
    memset(&felucca_dbg, 0, sizeof felucca_dbg);
    felucca_dbg.magic = DBG_MAGIC;
    persist_boot();
    settings_init();
    lcd_init();
    sloop_splash();
    fm1_input_init();
    fm1_adc_init();
    panel_init();
    emu_felucca_init();
    audio_init();
    emu_booted = 0;
}

/* advance the clock by us microseconds (the TIMER5 ISR's job: fm1_ms) */
static void emu_advance(uint32_t us)
{
    static uint32_t acc;
    emu_ticks += us * FM1_TICKS_PER_US;
    acc += us;
    while (acc >= 1000u) { acc -= 1000u; fm1_ms++; }
}

/* one pass of the main loop (main.c fm1_main's for (;;)), at most every 15 ms */
EMU_EXPORT("emu_frame") void emu_frame(void)
{
    if (!emu_booted) {
        if (fm1_ms < 1200u) return;                 /* the logo stays a moment (main.c) */
        lcd_fill(0, 0, 240, 240, C_BLACK);
        emu_booted = 1;
        ui.force = 1;
    }
    {
        int32_t a = fm1_adc_read(FM1_ADC_MASTER);
        uint32_t k10;
        emu_knob += (a * 16 - emu_knob) / 8;
        k10 = (uint32_t)(emu_knob / 16);
        song.master_q12 = (k10 * k10) >> 8;
    }
    song.batt_raw = emu_adc_batt;
    ui_input();
    ui_leds();
    ui_draw();
    sections_flush();
    ui_input();
    ed_service();
    emu_drain();
}

/* render n frames (a multiple of CTL, at most HALF_FRAMES) of stereo audio, advancing the clock;
 * returns the interleaved float buffer */
EMU_EXPORT("emu_render") float *emu_render(uint32_t n)
{
    uint32_t b, i;
    if (n > HALF_FRAMES) n = HALF_FRAMES;
    for (b = 0; b < n; b += CTL)
        audio_block(emu_blk + 2u * b, CTL);
    for (i = 0; i < n * 2u; i++) {
        int32_t v = emu_blk[i] >> OUT_SHIFT;
        emu_out[i] = (float)(v < -32768 ? -32768 : v > 32767 ? 32767 : v) / 32768.0f;
    }
    {   /* the clock: n frames at FS */
        static uint32_t frac;
        uint32_t us = (n * 1000000u + frac) / FS;
        frac = (n * 1000000u + frac) % FS;
        emu_advance(us);
    }
    if (fm1_ms - emu_frame_ms >= 15u) {
        emu_frame_ms = fm1_ms;
        emu_frame();
    }
    return emu_out;
}

/* no audio yet (before the page may start it): the clock and the UI without the sound */
EMU_EXPORT("emu_idle") void emu_idle(uint32_t ms)
{
    emu_advance(ms * 1000u);
    if (fm1_ms - emu_frame_ms >= 15u) { emu_frame_ms = fm1_ms; emu_frame(); }
}

EMU_EXPORT("emu_fb") uint16_t *emu_fb_ptr(void) { return emu_fb; }
EMU_EXPORT("emu_fb_dirty") uint32_t emu_fb_take(void) { uint32_t d = emu_lcd_dirty; emu_lcd_dirty = 0; return d; }
EMU_EXPORT("emu_ms") uint32_t emu_ms(void) { return fm1_ms; }
EMU_EXPORT("emu_frames") uint32_t emu_frames_n(void) { return HALF_FRAMES; }
EMU_EXPORT("emu_ctl") uint32_t emu_ctl(void) { return CTL; }
EMU_EXPORT("emu_rate") uint32_t emu_rate(void) { return FS; }

/* the panel, by printed label (panel.c B_*, EN_*) */
EMU_EXPORT("emu_button") void emu_button(uint32_t label, uint32_t down)
{
    if (label < NB) emu_key(panel.btn[label], (int)down);
}
EMU_EXPORT("emu_note") void emu_note(uint32_t key, uint32_t down)    /* 0 = F3 .. 26 = G5 */
{
    if (key < 27u) emu_key(14u + key, (int)down);
}
EMU_EXPORT("emu_turn") void emu_turn(uint32_t role, int32_t steps)
{
    if (role < NE) fm1_in.enc_steps[panel.enc[role]] += (int16_t)(steps * panel.dir[role]);
}
EMU_EXPORT("emu_master") void emu_master(int32_t v) { emu_adc_master = v < 0 ? 0 : v > 1023 ? 1023 : v; }
EMU_EXPORT("emu_led_button") uint32_t emu_led_button(uint32_t label) { return label < NB ? emu_led_state(panel.btn[label]) : 0; }
EMU_EXPORT("emu_led_note") uint32_t emu_led_note(uint32_t key) { return key < 27u ? emu_led_state(14u + key) : 0; }

/* MIDI in (a USB-MIDI event packet, as usb.c receives it) */
EMU_EXPORT("emu_midi") void emu_midi(uint32_t pkt) { midi_in_event(pkt); }

/* MIDI out: the next USB-MIDI event packet (SysEx replies, the keys' notes), 0 if none */
EMU_EXPORT("emu_midi_out") uint32_t emu_midi_out(void)
{
    emu_drain();
    return emu_tx_r != emu_tx_w ? emu_tx[emu_tx_r++ % EMU_TXN] : 0u;
}
/* the editor protocol at once, without waiting for the next UI frame */
EMU_EXPORT("emu_service") void emu_service(void) { ed_service(); emu_drain(); }

/* keeping the work between visits: the page stores the working project and the four sections */
static project_t emu_work, emu_tmp;
EMU_EXPORT("emu_proj_size") uint32_t emu_proj_size(void) { return sizeof(project_t); }
EMU_EXPORT("emu_work_ptr") uint8_t *emu_work_ptr(void) { return (uint8_t *)&emu_work; }
EMU_EXPORT("emu_slots_ptr") uint8_t *emu_slots_ptr(void) { return (uint8_t *)proj_slot; }
EMU_EXPORT("emu_capture") void emu_capture(void) { proj_capture(&emu_work); }
EMU_EXPORT("emu_restore") uint32_t emu_restore(void)    /* emu_work (and the slots) written by the page */
{
    if (song.playing || transport_req) return 0;
    if (!proj_import(&emu_tmp, &emu_work, (int)sizeof emu_work)) return 0;
    proj_apply(&emu_tmp, 1);
    song.sel = (uint8_t)(emu_tmp.sel < NTRK ? emu_tmp.sel : 0u);
    for (uint32_t k = 0; k < NPART; k++) trk[k].engine = trk[k].eng_req;
    ui.force = 1;
    return 1;
}
EMU_EXPORT("emu_playing") uint32_t emu_playing(void) { return song.playing; }
EMU_EXPORT("emu_page") uint32_t emu_page(void) { return (uint32_t)ui.page | (uint32_t)ui.home << 8; }
/* where the screen is, for the lessons: the page's title ("" on TRACKS), the layer held (LY_*), the menu */
EMU_EXPORT("emu_page_name") const char *emu_page_name(void) { return ui.home ? "" : vis_shown() ? "VISUALISER" : PAGES[ui.page].title; }
EMU_EXPORT("emu_layer") uint32_t emu_layer(void) { return ui.layer == LY_PLAY ? 0u : (uint32_t)ui.layer + 1u; }
EMU_EXPORT("emu_layer_btn") uint32_t emu_layer_btn(void) { return ui.layer_btn; }
EMU_EXPORT("emu_bpm") uint32_t emu_bpm(void) { return (uint32_t)song.g[G_BPM]; }
EMU_EXPORT("emu_sel") uint32_t emu_sel(void) { return song.sel; }
