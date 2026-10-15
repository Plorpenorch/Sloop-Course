/* SPDX-License-Identifier: GPL-3.0-only */
/* Emulator LCD: an ST7789 command interpreter writing a 240x240 RGB565 framebuffer. */
#pragma once
#include <stdint.h>
#include "fm1_cc.h"
static uint16_t emu_fb[240 * 240];
static uint32_t fm1_lcd_timeouts;
static uint8_t emu_lcd_cmd;
static uint32_t emu_x0, emu_x1 = 239, emu_y0, emu_y1 = 239, emu_px, emu_py;
static uint32_t emu_lcd_dirty;
FM1_INLINE void fm1_lcd_hw_init(void) {}
FM1_INLINE void fm1_lcd_baud(uint32_t b) { (void)b; }
static void fm1_lcd_wait(void) {}
FM1_INLINE void fm1_lcd_deselect(void) {}
FM1_INLINE void fm1_lcd_send_cmd(uint8_t c)
{
    emu_lcd_cmd = c;
    if (c == 0x2C) { emu_px = emu_x0; emu_py = emu_y0; }
}
static void fm1_lcd_send_data(const void *p, uint32_t n)
{
    const uint8_t *b = (const uint8_t *)p;
    if (emu_lcd_cmd == 0x2A && n >= 4) { emu_x0 = (uint32_t)b[0] << 8 | b[1]; emu_x1 = (uint32_t)b[2] << 8 | b[3]; return; }
    if (emu_lcd_cmd == 0x2B && n >= 4) { emu_y0 = (uint32_t)b[0] << 8 | b[1]; emu_y1 = (uint32_t)b[2] << 8 | b[3]; return; }
    if (emu_lcd_cmd != 0x2C) return;
    for (uint32_t i = 0; i + 1 < n; i += 2) {
        if (emu_px < 240u && emu_py < 240u) emu_fb[emu_py * 240u + emu_px] = (uint16_t)(b[i] << 8 | b[i + 1]);
        if (++emu_px > emu_x1) { emu_px = emu_x0; emu_py++; }
    }
    emu_lcd_dirty = 1;
}
