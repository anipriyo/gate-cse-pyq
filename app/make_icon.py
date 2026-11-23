"""Draws the app icon (blue rounded square, "G" + "PYQ") and writes app/GatePYQ.icns.

Run: ~/.venvs/analysis/bin/python app/make_icon.py
"""
import pathlib
import subprocess
import tempfile

from PIL import Image, ImageDraw, ImageFont

HERE = pathlib.Path(__file__).resolve().parent


def font(size, bold=True):
    for f in ["/System/Library/Fonts/SFNS.ttf", "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
              "/System/Library/Fonts/Helvetica.ttc"]:
        try:
            return ImageFont.truetype(f, size)
        except OSError:
            continue
    return ImageFont.load_default()


def draw(n=1024):
    img = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    pad = int(n * 0.09)
    # vertical gradient square
    grad = Image.new("RGBA", (n, n))
    gd = ImageDraw.Draw(grad)
    for y in range(n):
        t = y / n
        gd.line([(0, y), (n, y)], fill=(int(37 + 30 * t), int(99 - 40 * t), int(235 - 60 * t), 255))
    mask = Image.new("L", (n, n), 0)
    ImageDraw.Draw(mask).rounded_rectangle([pad, pad, n - pad, n - pad], radius=int(n * 0.2), fill=255)
    img.paste(grad, (0, 0), mask)
    big = font(int(n * 0.46))
    small = font(int(n * 0.13))
    d.text((n / 2, n * 0.45), "G", font=big, fill="white", anchor="mm")
    d.text((n / 2, n * 0.74), "PYQ", font=small, fill=(255, 255, 255, 220), anchor="mm")
    # small spark for the AI tutor
    cx, cy, r, w = n * 0.72, n * 0.28, n * 0.075, n * 0.018
    d.polygon([(cx, cy - r), (cx + w, cy - w), (cx + r, cy), (cx + w, cy + w),
               (cx, cy + r), (cx - w, cy + w), (cx - r, cy), (cx - w, cy - w)], fill=(253, 224, 71, 255))
    return img


def main():
    base = draw()
    base.save(HERE / "icon_1024.png")
    with tempfile.TemporaryDirectory() as td:
        iconset = pathlib.Path(td) / "GatePYQ.iconset"
        iconset.mkdir()
        for s in [16, 32, 128, 256, 512]:
            base.resize((s, s), Image.LANCZOS).save(iconset / f"icon_{s}x{s}.png")
            base.resize((2 * s, 2 * s), Image.LANCZOS).save(iconset / f"icon_{s}x{s}@2x.png")
        subprocess.run(["iconutil", "-c", "icns", str(iconset), "-o", str(HERE / "GatePYQ.icns")], check=True)
    print("wrote", HERE / "GatePYQ.icns")


if __name__ == "__main__":
    main()
