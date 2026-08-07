"""Resize JRList store marketing assets to Chrome Web Store dimensions."""
from __future__ import annotations

import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    print("Installing Pillow...")
    import subprocess

    subprocess.check_call([sys.executable, "-m", "pip", "install", "Pillow", "-q"])
    from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
CURSOR_ASSETS = Path.home() / ".cursor" / "projects" / "h-1-Devs-6-Pentest-6-JS-ParsingURL-List" / "assets"
OUT = ROOT / "dist" / "store"
ICON_SRC = ROOT / "icons" / "icon128.png"

# source name in Cursor assets folder -> (output name, size)
JOBS = [
    ("jrlist-screenshot-1.png", "screenshot-1-1280x800.png", (1280, 800)),
    ("jrlist-screenshot-2.png", "screenshot-2-1280x800.png", (1280, 800)),
    ("jrlist-promo-small.png", "promo-small-440x280.png", (440, 280)),
    ("jrlist-promo-marquee.png", "promo-marquee-1400x560.png", (1400, 560)),
]


def find_src(name: str) -> Path | None:
    candidates = [
        CURSOR_ASSETS / name,
        ROOT / "assets" / name,
        Path(r"C:\Users\김성준\.cursor\projects\h-1-Devs-6-Pentest-6-JS-ParsingURL-List") / "assets" / name,
    ]
    for p in candidates:
        if p.is_file():
            return p
    return None


def fit_cover(img: Image.Image, size: tuple[int, int]) -> Image.Image:
    """Center-crop cover to exact size, RGB (no alpha)."""
    tw, th = size
    sw, sh = img.size
    scale = max(tw / sw, th / sh)
    nw, nh = int(sw * scale + 0.5), int(sh * scale + 0.5)
    resized = img.resize((nw, nh), Image.Resampling.LANCZOS)
    left = (nw - tw) // 2
    top = (nh - th) // 2
    cropped = resized.crop((left, top, left + tw, top + th))
    if cropped.mode in ("RGBA", "LA", "P"):
        bg = Image.new("RGB", size, (15, 20, 25))
        rgba = cropped.convert("RGBA")
        bg.paste(rgba, mask=rgba.split()[-1])
        return bg
    return cropped.convert("RGB")


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for src_name, out_name, size in JOBS:
        src = find_src(src_name)
        if not src:
            print(f"[!] missing {src_name}")
            continue
        img = Image.open(src)
        out = fit_cover(img, size)
        path = OUT / out_name
        out.save(path, "PNG", optimize=True)
        print(f"[+] {path} ({out.size[0]}x{out.size[1]}, {path.stat().st_size} bytes)")

    if ICON_SRC.is_file():
        icon = Image.open(ICON_SRC).convert("RGBA")
        icon = icon.resize((128, 128), Image.Resampling.LANCZOS)
        # store often accepts PNG with alpha for extension icon; also save RGB tile
        icon_path = OUT / "icon-128.png"
        icon.save(icon_path, "PNG")
        print(f"[+] {icon_path}")
    print(f"\nStore assets ready in: {OUT}")


if __name__ == "__main__":
    main()
