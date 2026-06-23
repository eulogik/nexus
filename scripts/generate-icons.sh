#!/bin/bash
# Generate placeholder icons for Nexus Desktop
# Run from the project root: bash scripts/generate-icons.sh

ICONS_DIR="apps/nexus-desktop/src-tauri/icons"
mkdir -p "$ICONS_DIR"

generate_png() {
  local width=$1
  local height=$2
  local output=$3
  python3 -c "
import struct, zlib

def create_png(w, h, path):
    def chunk(t, d):
        c = t + d
        return struct.pack('>I', len(d)) + c + struct.pack('>I', zlib.crc32(c) & 0xffffffff)

    sig = b'\x89PNG\r\n\x1a\n'
    ihdr = chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0))
    raw = b''
    for _ in range(h):
        raw += b'\x00'
        for _ in range(w):
            raw += b'\x63\x66\xf1'
    idat = chunk(b'IDAT', zlib.compress(raw))
    iend = chunk(b'IEND', b'')
    with open(path, 'wb') as f:
        f.write(sig + ihdr + idat + iend)

create_png($width, $height, '$output')
"
}

echo "Generating icons..."
generate_png 32 32 "$ICONS_DIR/32x32.png"
generate_png 128 128 "$ICONS_DIR/128x128.png"
generate_png 256 256 "$ICONS_DIR/128x128@2x.png"
cp "$ICONS_DIR/128x128.png" "$ICONS_DIR/icon.icns"
cp "$ICONS_DIR/32x32.png" "$ICONS_DIR/icon.ico"
echo "Icons created in $ICONS_DIR"
