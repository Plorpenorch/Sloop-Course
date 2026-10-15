/* SPDX-License-Identifier: GPL-3.0-only */
/* SLOOP in the browser: the firmware sources of SLOOP (github.com/isod89/sloop-fm1), compiled as on the
 * FM-1 (one compilation unit, as firmware/src/felucca.c), over an emulated HAL (emu/hal): the screen, the
 * keys, the knobs and the audio go to and come from the page. No flash: the page keeps the state. */
#include <stdint.h>
#define FELUCCA_FLASH 0
#define FELUCCA_OTA 1          /* the SysEx plumbing of usb.c, for editor.c (no ota.c: nothing to update) */
#define FELUCCA_CDC 0
#define FELUCCA_UART 0
#define FELUCCA_UAC 0
#include "fm1_time.h"
#include "fm1_sys.h"
#include "fm1_irq.h"
#include "fm1_guard.h"
#include "fm1_input.h"
#include "fm1_timer.h"
#include "fm1_audio.h"
#include "fm1_adc.h"
#include "fm1_lcd_hw.h"
#include "felucca_tables.h"

#include "libc.c"
#include "lcd.c"
#include "gfx.c"
#include "core.h"
#include "engines.c"
#include "drums.c"
#include "params.c"
#include "voice.c"
#include "slicer.c"
#include "fx.c"
#include "usb.c"
#define FELUCCA_ARRANGER 1
#include "arranger.c"
#include "seq.c"
#include "audio.c"
#include "panel.c"
#include "ui.c"
#include "ui_song.c"
#include "ui_studio.c"
#include "icons.c"
#include "ui_draw.c"
#include "ui_vis.c"
#include "ui_layers.c"
#include "ui_menu.c"
#include "ui_input.c"
#include "upreset.c"
#include "project.c"
/* the editor protocol (web/EDITOR_PROTOCOL.md): replies go to a ring the page reads */
#define EMU_TXN 8192u
static uint32_t emu_tx[EMU_TXN], emu_tx_w, emu_tx_r;
static void emu_drain(void)
{
    while (so_r != so_w) {
        if (emu_tx_w - emu_tx_r < EMU_TXN) emu_tx[emu_tx_w++ % EMU_TXN] = sx_out_q[so_r % SXQ];
        so_r++;
    }
    while (mo_r != mo_w) {
        if (emu_tx_w - emu_tx_r < EMU_TXN) emu_tx[emu_tx_w++ % EMU_TXN] = midi_out_q[mo_r % MQ];
        mo_r++;
    }
}
static uint32_t ota_now_ms(void) { return fm1_ms; }
static void ota_idle(void) { emu_drain(); }
/* no flash in the emulator: the sample uploads and backups that need it answer "failed" */
static uint8_t flash_ok;
static void fl_inval(uint32_t off, uint32_t n) { (void)off; (void)n; }
static int fl_erase4k_quiet(uint32_t off, uint32_t *took) { (void)off; (void)took; return -1; }
static int fl_write(uint32_t off, const void *p, uint32_t n) { (void)off; (void)p; (void)n; return -1; }
static uint32_t st_crc32(const void *p, uint32_t n)
{
    const uint8_t *b = (const uint8_t *)p;
    uint32_t c = 0xFFFFFFFFu;
    while (n--) { c ^= *b++; for (int k = 0; k < 8; k++) c = c >> 1 ^ (0xEDB88320u & -(c & 1u)); }
    return ~c;
}
static uint32_t ed_flash_busy(void) { return song.playing || transport_req; }
#include "editor.c"
#include "splash.c"
#include "emu_main.c"
