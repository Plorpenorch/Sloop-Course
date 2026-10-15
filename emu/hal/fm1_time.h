/* SPDX-License-Identifier: GPL-3.0-only */
/* Emulator time base: the host advances emu_ticks (24 per microsecond, as TIMER4). */
#pragma once
#include <stdint.h>
#define FM1_TICKS_PER_US 24u
static volatile uint32_t emu_ticks;
static inline void fm1_time_init(void) {}
static inline uint32_t fm1_ticks(void) { return emu_ticks; }
static inline uint32_t fm1_micros(void) { return emu_ticks / FM1_TICKS_PER_US; }
/* busy waits advance the emulated clock instead of spinning */
static inline void fm1_delay_us(uint32_t us) { emu_ticks += us * FM1_TICKS_PER_US; }
static inline void fm1_delay_ms(uint32_t ms) { emu_ticks += ms * 1000u * FM1_TICKS_PER_US; }
