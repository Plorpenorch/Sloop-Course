/* SPDX-License-Identifier: GPL-3.0-only */
/* Emulator input: the same fm1_in state and API as the FM-1's matrix scan (hal/fm1_input.h),
 * driven by the host: keys and buttons arrive already debounced, knobs as detent steps. */
#pragma once
#include <stdint.h>
#include "fm1_time.h"
#include "fm1_gpio.h"
#include "fm1_cc.h"
#define FM1_NCOL 11u
#define FM1_NKEY 41u
#define FM1_NENC 7u
static const int8_t FM1_KEYMAP[6][FM1_NCOL] = {
    {-1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1},
    { 5, 11,  4, 10,  3,  9,  2,  8, -1, -1, -1},
    {34, 35, 36, 37, 38, 40, 39, 13,  7,  6, 12},
    {23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33},
    { 0,  1, 15, 14, 17, 16, 19, 18, 20, 21, 22},
    {-1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1},
};
enum { FM1_BTN_OCT_DOWN = 0, FM1_BTN_OCT_UP = 1 };
static volatile struct {
    uint32_t notes, buttons, pressed, released, notes_pressed;
    uint8_t raw[FM1_NCOL];
    uint8_t cnt[FM1_NKEY];
    int16_t enc_steps[FM1_NENC];
    uint32_t frames;
} fm1_in;
static uint8_t fm1_led[FM1_NCOL];
static uint8_t fm1_led_dim[FM1_NCOL];
static uint8_t fm1_led_bg[FM1_NCOL];
static volatile uint16_t fm1_led_bg_ns;
static void fm1_input_init(void) {}
static void fm1_input_scan(void) { fm1_in.frames++; }
static void fm1_input_tick(void) {}
static int32_t fm1_enc_take(uint32_t e)
{
    int32_t s = fm1_in.enc_steps[e];
    fm1_in.enc_steps[e] = 0;
    return s;
}
static uint32_t fm1_input_edges(uint32_t *released)
{
    uint32_t p = fm1_in.pressed;
    if (released) *released = fm1_in.released;
    fm1_in.pressed = fm1_in.released = 0;
    return p;
}
static uint32_t fm1_input_note_edges(void)
{
    uint32_t p = fm1_in.notes_pressed;
    fm1_in.notes_pressed = 0;
    return p;
}
static void fm1_led_key(uint32_t id, int on)
{
    uint32_t p, r;
    for (p = 0; p < FM1_NCOL; p++)
        for (r = 1; r < 5u; r++)
            if (FM1_KEYMAP[r][p] == (int8_t)id) {
                if (on) fm1_led[p] |= (uint8_t)(1u << r);
                else fm1_led[p] &= (uint8_t)~(1u << r);
            }
}
/* host side */
static void emu_key(uint32_t id, int down)            /* id: 0..13 button, 14..40 note key */
{
    if (id >= 14u) {
        uint32_t bit = 1u << (id - 14u);
        if (down && !(fm1_in.notes & bit)) { fm1_in.notes |= bit; fm1_in.notes_pressed |= bit; }
        else if (!down) fm1_in.notes &= ~bit;
    } else {
        uint32_t bit = 1u << id;
        if (down && !(fm1_in.buttons & bit)) { fm1_in.buttons |= bit; fm1_in.pressed |= bit; }
        else if (!down && (fm1_in.buttons & bit)) { fm1_in.buttons &= ~bit; fm1_in.released |= bit; }
    }
}
static uint32_t emu_led_state(uint32_t id)            /* 2 lit, 1 dim / backlight, 0 off */
{
    uint32_t p, r;
    for (p = 0; p < FM1_NCOL; p++)
        for (r = 1; r < 5u; r++)
            if (FM1_KEYMAP[r][p] == (int8_t)id)
                return (fm1_led[p] >> r) & 1u ? 2u : ((fm1_led_dim[p] | (fm1_led_bg_ns ? fm1_led_bg[p] : 0u)) >> r) & 1u;
    return 0;
}
