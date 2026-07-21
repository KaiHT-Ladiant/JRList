"""Generate simple PNG icons without external deps."""
from __future__ import annotations

import struct
import zlib
from pathlib import Path


def chunk(tag: bytes, data: bytes) -> bytes:
    return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)


def write_png(path: Path, size: int) -> None:
    rows = []
    for y in range(size):
        row = bytearray([0])  # filter none
        for x in range(size):
            # rounded-square-ish mask
            m = size * 0.08
            inside = m <= x < size - m and m <= y < size - m
            if not inside:
                row.extend([15, 20, 25, 255])
                continue
            t = (x + y) / (2 * size)
            r = int(61 + (66 - 61) * t)
            g = int(156 + (184 - 156) * t)
            b = int(240 + (131 - 240) * t)
            # simple ring + bar overlay (white-ish)
            cx, cy = size / 2, size / 2
            dx, dy = x - cx, y - cy
            dist = (dx * dx + dy * dy) ** 0.5
            ring = abs(dist - size * 0.18) < size * 0.045
            bar = abs(dy) < size * 0.04 and abs(dx) < size * 0.22
            if ring or bar:
                row.extend([240, 248, 255, 255])
            else:
                row.extend([r, g, b, 255])
        rows.append(bytes(row))

    raw = b"".join(rows)
    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")
    path.write_bytes(png)
    print(f"wrote {path} ({path.stat().st_size} bytes)")


def main() -> None:
    out = Path(__file__).resolve().parent.parent / "icons"
    out.mkdir(parents=True, exist_ok=True)
    for size in (16, 32, 48, 128):
        write_png(out / f"icon{size}.png", size)


if __name__ == "__main__":
    main()
