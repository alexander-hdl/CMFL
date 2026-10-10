#!/usr/bin/env python3
"""Generate the PWA icons for the games "Ferma u reki" and "Oborona tablicy".

Flat, large shapes drawn procedurally with PIL; key shapes stay inside the central
80 % of the canvas so the icons are safe for maskable (cropped) display. The older
icons (arena, plan, comics) are not touched. Run from the repository root:

    python3 tools/make_icons.py
"""
import math
import pathlib

from PIL import Image, ImageDraw

OUT = pathlib.Path(__file__).resolve().parent / "icons"
SIZES = (180, 192, 512)
SS = 4          # supersampling factor
BASE = 512      # all coordinates below are in a 512 x 512 design space


class Canvas:
    def __init__(self, px, bg):
        self.k = px * SS / BASE
        self.img = Image.new("RGB", (px * SS, px * SS), bg)
        self.d = ImageDraw.Draw(self.img)

    def p(self, *xy):
        return [v * self.k for v in xy]

    def rect(self, x0, y0, x1, y1, fill, r=0):
        if r:
            self.d.rounded_rectangle(self.p(x0, y0, x1, y1), radius=r * self.k, fill=fill)
        else:
            self.d.rectangle(self.p(x0, y0, x1, y1), fill=fill)

    def circle(self, cx, cy, r, fill):
        self.d.ellipse(self.p(cx - r, cy - r, cx + r, cy + r), fill=fill)

    def poly(self, pts, fill):
        self.d.polygon([v * self.k for pt in pts for v in pt], fill=fill)

    def line(self, x0, y0, x1, y1, w, fill):
        """Thick line with round ends."""
        self.d.line(self.p(x0, y0, x1, y1), fill=fill, width=round(w * self.k))
        self.circle(x0, y0, w / 2, fill)
        self.circle(x1, y1, w / 2, fill)

    def done(self, px):
        return self.img.resize((px, px), Image.LANCZOS)


def ferma(px):
    c = Canvas(px, "#fff1d0")                       # warm light background
    # sun with short rays, top right
    for i in range(8):
        a = math.radians(i * 45)
        c.line(376 + 56 * math.cos(a), 112 + 56 * math.sin(a),
               376 + 74 * math.cos(a), 112 + 74 * math.sin(a), 14, "#ffb627")
    c.circle(376, 112, 40, "#ffc83d")
    # field: green block with three soil rows and sprouts
    c.rect(78, 204, 420, 380, "#5fae45", 26)
    for y in (230, 278, 326):
        c.rect(98, y, 400, y + 32, "#8a5a33", 12)
        for x in (136, 206, 276, 346):
            c.circle(x, y + 12, 15, "#9be27a")
            c.circle(x, y + 12, 7, "#3f8f2f")
    # river across the bottom, wavy top edge
    pts = [(0, 512), (0, 408)]
    for x in range(0, 513, 8):
        pts.append((x, 408 + 14 * math.sin(x / 512 * 2 * math.pi * 2.5)))
    pts.append((512, 512))
    c.poly(pts, "#3f8fd8")
    wave = []
    for x in range(60, 453, 8):
        wave.append((x, 448 + 10 * math.sin(x / 512 * 2 * math.pi * 2.5 + 1)))
    for a, b in zip(wave, wave[1:]):
        c.line(a[0], a[1], b[0], b[1], 12, "#8cc8f5")
    return c.done(px)


def oborona(px):
    c = Canvas(px, "#0e1d27")                       # dark, like the arena
    c.rect(70, 408, 442, 436, "#2a4d5d", 14)        # ground slab
    # tower: body, merlons, door, window
    c.rect(116, 226, 252, 414, "#8e98a6")
    for x in (116, 164, 212):
        c.rect(x, 190, x + 40, 238, "#8e98a6", 6)
    c.rect(116, 226, 252, 244, "#6f7a89")
    c.d.pieslice(c.p(150, 320, 218, 388), 180, 360, fill="#16303d")
    c.rect(150, 354, 218, 414, "#16303d")
    c.rect(170, 268, 198, 308, "#16303d", 10)
    # beam from the tower to the cross
    c.line(250, 262, 346, 172, 30, "#ffd54f")
    c.line(250, 262, 346, 172, 12, "#fffbe6")
    # big gold multiplication sign
    cx, cy, r = 376, 134, 52
    c.line(cx - r, cy - r, cx + r, cy + r, 34, "#ffc83d")
    c.line(cx - r, cy + r, cx + r, cy - r, 34, "#ffc83d")
    return c.done(px)


def main():
    OUT.mkdir(exist_ok=True)
    for name, fn in (("ferma", ferma), ("oborona", oborona)):
        for px in SIZES:
            fn(px).save(OUT / f"{name}-{px}.png", optimize=True)
    print("icons written:", ", ".join(f"{n}-{s}" for n in ("ferma", "oborona") for s in SIZES))


if __name__ == "__main__":
    main()
