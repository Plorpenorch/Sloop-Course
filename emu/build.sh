#!/bin/sh
# Build sloop-emu.wasm from a SLOOP checkout: emu/build.sh <path to sloop-fm1> <out dir>
set -e
SLOOP=${1:?path to a sloop-fm1 checkout}; OUT=${2:-.}
HERE=$(cd "$(dirname "$0")" && pwd)
GEN="$SLOOP/build/gen"; mkdir -p "$GEN" "$OUT"
for p in "gen_font.py felucca_font.h" "gen_icons.py felucca_icons.h" "gen_tables.py felucca_tables.h" \
         "gen_samples.py felucca_samples.h" "gen_drumkits.py felucca_drumkits.h" "gen_fm6_patches.py felucca_fm6.h" \
         "gen_logo.py sloop_logo.h"; do
  set -- $p; [ -f "$GEN/$2" ] || python3 "$SLOOP/tools/$1" "$GEN/$2" >/dev/null
done
VERSION=$(sed -n 's/^# SLOOP \([0-9.]*\).*/\1/p' "$SLOOP/SLOOP.md" | head -1)
${CC:-clang} --target=wasm32 -O2 -nostdlib -ffreestanding -fno-builtin-memset -fwrapv -fno-strict-aliasing \
  -Wno-unused-function -Wno-int-to-pointer-cast -Wno-pointer-to-int-cast -Wno-incompatible-pointer-types-discards-qualifiers \
  -DFELUCCA_VERSION="\"$VERSION\"" -DFELUCCA_ID="\"FM-1_900\"" \
  -I"$HERE/hal" -I"$SLOOP/firmware/src" -I"$GEN" -I"$HERE" \
  -Wl,--no-entry -Wl,--export-dynamic -Wl,--global-base=35651584 -Wl,--initial-memory=67108864 -Wl,-z,stack-size=262144 \
  -o "$OUT/sloop-emu.wasm" "$HERE/emu.c"
echo "$VERSION" > "$OUT/sloop-emu.version"
echo "built $OUT/sloop-emu.wasm (SLOOP $VERSION)"
