/* SPDX-License-Identifier: GPL-3.0-only */
/* Emulator ADC: the MASTER pot and the battery, set by the host. */
#pragma once
#include <stdint.h>
enum { FM1_ADC_BATT = 3, FM1_ADC_MASTER = 4 };
static int32_t emu_adc_master = 800, emu_adc_batt = 900;
static void fm1_adc_init(void) {}
static int32_t fm1_adc_read(uint32_t ch) { return ch == FM1_ADC_MASTER ? emu_adc_master : emu_adc_batt; }
