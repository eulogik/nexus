#!/bin/bash
# Generate placeholder icons for the Nexus Desktop app
# Requires: python3 with Pillow, or ImageMagick
# If neither is available, creates simple SVG-based PNGs

ICONS_DIR="$(dirname "$0")/../src-tauri/icons"
mkdir -p "$ICONS_DIR"

# Try ImageMagick first
if command -v convert &>/dev/null; then
  echo "Generating icons with ImageMagick..."
  # Create a simple colored square with "N" text
  for size in 32x32 128x128 256x256; do
    convert -size "$size" -define gradient:angle=135 gradient:'#5c7cfa'-'#364fc7' \
      -font Helvetica -pointsize $(( ${size/x*} / 2 )) -fill white -gravity center -annotate 0 'N' \
      "$ICONS_DIR/${size}.png" 2>/dev/null || {
        # Fallback: solid color
        convert -size "$size" xc:'#5c7cfa' "$ICONS_DIR/${size}.png"
      }
  done
  # Create macOS icns (requires iconutil)
  if command -v iconutil &>/dev/null; then
    iconset="$ICONS_DIR/icon.iconset"
    mkdir -p "$iconset"
    for size in 16 32 64 128 256 512; do
      sizepx="${size}x${size}"
      cp "$ICONS_DIR/${size}x${size}.png" "$iconset/icon_${sizepx}.png" 2>/dev/null || true
      cp "$ICONS_DIR/${size}x${size}.png" "$iconset/icon_${sizepx}@2x.png" 2>/dev/null || true
    done
    iconutil -c icns "$iconset" -o "$ICONS_DIR/icon.icns" 2>/dev/null || true
  fi
  # Create Windows ico (placeholder)
  convert "$ICONS_DIR/256x256.png" -define icon:auto-resize=256,64,48,32,16 "$ICONS_DIR/icon.ico" 2>/dev/null || true
  echo "Icons generated in $ICONS_DIR"
else
  echo "ImageMagick not found. Creating minimal placeholder PNGs with Python..."
  python3 -c "
import struct, zlib

def create_png(width, height, r, g, b, filename):
    # Minimal PNG with solid color
    raw = b''
    for y in range(height):
        raw += b'\x00'  # filter byte
        for x in range(width):
            raw += struct.pack('BBB', r, g, b)
    
    def chunk(chunk_type, data):
        c = chunk_type + data
        return struct.pack('>I', len(data)) + c + struct.pack('>I', zlib.crc32(c) & 0xffffffff)
    
    ihdr = struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0)
    idat = zlib.compress(raw)
    
    with open(filename, 'wb') as f:
        f.write(b'\x89PNG\r\n\x1a\n')
        f.write(chunk(b'IHDR', ihdr))
        f.write(chunk(b'IDAT', idat))
        f.write(chunk(b'IEND', b''))

for size, fn in [(32, '32x32.png'), (128, '128x128.png'), (256, '256x256.png'), (256, '128x128@2x.png')]:
    create_png(size, size, 92, 124, 250, f'$ICONS_DIR/{fn}')
# Create .ico (just copy the 32x32 png as placeholder)
import shutil
shutil.copy('$ICONS_DIR/32x32.png', '$ICONS_DIR/icon.ico')
print('Done')
" 2>&1 || echo "WARNING: No image tools available. Placeholder icons not created."
fi

echo "Icon directory: $ICONS_DIR"
ls -la "$ICONS_DIR" 2>/dev/null || echo "(empty)"
