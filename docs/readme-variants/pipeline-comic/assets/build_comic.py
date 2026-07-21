#!/usr/bin/env python3
"""Build the pipeline-comic README skin assets.

Deterministic composite (PIL only, no image generation):
- hero-comic-master-{light,dark}.png : five-panel pipeline comic strip (2400x1000 masters)
- panel-{1..5}-master.png            : individual panel crops (light theme)
- gallery-stickers-master.png        : 3x2 sticker "props shelf" collage

WebP exports are produced afterwards with:
  node packages/cli/dist/index.js image edit compress --format webp --max-width <n> --out <dst> <src>

Panel tiles are existing dogfood assets (ord-sticker-001 / ord-webstates-001, shipped in
packages/starters/landing-neobrutal-zine/public/assets/). Masters are regenerated on demand
by this script, so only the script + compressed webp are committed.
"""
import os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../.."))
ZINE = os.path.join(ROOT, "packages/starters/landing-neobrutal-zine/public/assets")
OUT = os.path.dirname(os.path.abspath(__file__))

FONT = "/System/Library/Fonts/MarkerFelt.ttc"  # macOS comic face; index 1 = Wide

W, H = 2400, 1000
MARGIN, GUTTER, BORDER = 28, 20, 6
PANEL_H = H - 2 * MARGIN
CAPTION_H = 176

STAGES = [
    # (tile, title, subtitle, checkpoint?)
    ("webstates/state-1.webp", "ANALYZE", "the analyst reads your repo", False),
    ("stickers/sticker-3.webp", "PERSONA", "a soul takes shape", True),
    ("webstates/state-7.webp", "DIRECT", "the art director plans every order", False),
    ("webstates/state-2.webp", "PAINT", "foundation first, then the set", True),
    ("webstates/state-3.webp", "PAGE", "your site, ready to ship", True),
]

THEMES = {
    "light": dict(paper="#F7F7F5", panel="#FFFFFF", ink="#1A1A1A",
                  caption_bg="#1A1A1A", caption_fg="#F7F7F5", accent="#38BDF8"),
    "dark": dict(paper="#0B0F19", panel="#131A29", ink="#F4F6FB",
                 caption_bg="#F4F6FB", caption_fg="#0B0F19", accent="#38BDF8"),
}


def font(size):
    return ImageFont.truetype(FONT, size, index=1)


def fit_font(draw, text, max_w, start):
    size = start
    while size > 18:
        f = font(size)
        if draw.textlength(text, font=f) <= max_w:
            return f
        size -= 2
    return font(18)


def rounded(draw, box, r, **kw):
    draw.rounded_rectangle(box, radius=r, **kw)


def build(theme_name):
    t = THEMES[theme_name]
    img = Image.new("RGB", (W, H), t["paper"])
    d = ImageDraw.Draw(img)

    pw = (W - 2 * MARGIN - 4 * GUTTER) // 5
    xs = [MARGIN + i * (pw + GUTTER) for i in range(5)]
    xs[-1] = W - MARGIN - pw  # absorb rounding remainder

    panels = []
    for i, (tile, title, sub, checkpoint) in enumerate(STAGES):
        x0, y0 = xs[i], MARGIN
        x1, y1 = x0 + pw, MARGIN + PANEL_H
        # panel body
        d.rectangle([x0, y0, x1, y1], fill=t["panel"], outline=t["ink"], width=BORDER)

        # flow chevron in the gutter (except after last panel)
        if i < 4:
            cx = x1 + GUTTER // 2
            cy = (y0 + y1) // 2
            s = 12
            d.polygon([(cx - s, cy - s * 1.4), (cx + s, cy), (cx - s, cy + s * 1.4)],
                      fill=t["accent"])

        # caption box at panel bottom
        cm = 16
        cb = [x0 + cm, y1 - cm - CAPTION_H, x1 - cm, y1 - cm]
        rounded(d, cb, 14, fill=t["caption_bg"], outline=t["ink"], width=4)
        cx_mid = (cb[0] + cb[2]) // 2
        f_title = fit_font(d, f"{i+1} · {title}", cb[2] - cb[0] - 48, 64)
        f_sub = fit_font(d, sub, cb[2] - cb[0] - 48, 40)
        w1 = d.textlength(f"{i+1} · {title}", font=f_title)
        w2 = d.textlength(sub, font=f_sub)
        d.text((cx_mid - w1 / 2, cb[1] + 26), f"{i+1} · {title}",
               font=f_title, fill=t["accent"])
        d.text((cx_mid - w2 / 2, cb[1] + 104), sub, font=f_sub, fill=t["caption_fg"])

        # checkpoint chip, top-right
        if checkpoint:
            label = "checkpoint"
            f_chip = font(26)
            tw = d.textlength(label, font=f_chip)
            bw, bh = int(tw) + 64, 42
            bx1, by = x1 - 18, y0 + 20
            bx0 = bx1 - bw
            rounded(d, [bx0, by, bx1, by + bh], 21, fill=t["panel"],
                    outline=t["ink"], width=3)
            # pause glyph: two bars
            d.rectangle([bx0 + 16, by + 11, bx0 + 22, by + 31], fill=t["accent"])
            d.rectangle([bx0 + 27, by + 11, bx0 + 33, by + 31], fill=t["accent"])
            d.text((bx0 + 42, by + 6), label, font=f_chip, fill=t["ink"])

        # stage number badge, top-left, overlapping the corner
        br = 38
        bcx, bcy = x0 + 6, y0 + 6
        d.ellipse([bcx - br, bcy - br, bcx + br, bcy + br],
                  fill=t["accent"], outline=t["ink"], width=4)
        f_num = font(52)
        num = str(i + 1)
        nw = d.textlength(num, font=f_num)
        asc, desc = f_num.getmetrics()
        d.text((bcx - nw / 2, bcy - (asc + desc) / 2), num, font=f_num,
               fill="#0B0F19")

        # character tile
        tile_img = Image.open(os.path.join(ZINE, tile)).convert("RGBA")
        cap_top = cb[1]
        area_top, area_bot = y0 + 60, cap_top - 24
        tsize = min(pw - 56, area_bot - area_top)
        tile_img = tile_img.resize((tsize, tsize), Image.LANCZOS)
        tx = x0 + (pw - tsize) // 2
        ty = area_top + (area_bot - area_top - tsize) // 2
        img.paste(tile_img, (tx, ty), tile_img)

        panels.append((x0, y0, x1, y1))

    master = os.path.join(OUT, f"hero-comic-master-{theme_name}.png")
    img.save(master)
    print("wrote", master)
    return img, panels


def build_sticker_shelf():
    t = THEMES["light"]
    tiles = ["stickers/sticker-0.webp", "stickers/sticker-1.webp",
             "webstates/state-7.webp", "webstates/state-2.webp",
             "stickers/sticker-5.webp", "webstates/state-8.webp"]
    cols, rows, cell, gap, m = 3, 2, 250, 18, 24
    w = m * 2 + cols * cell + (cols - 1) * gap
    h = m * 2 + rows * cell + (rows - 1) * gap
    img = Image.new("RGB", (w, h), t["paper"])
    d = ImageDraw.Draw(img)
    for idx, name in enumerate(tiles):
        r, c = divmod(idx, cols)
        x = m + c * (cell + gap)
        y = m + r * (cell + gap)
        d.rectangle([x, y, x + cell, y + cell], fill="#FFFFFF",
                    outline=t["ink"], width=4)
        tile = Image.open(os.path.join(ZINE, name)).convert("RGBA")
        ts = cell - 24
        tile = tile.resize((ts, ts), Image.LANCZOS)
        img.paste(tile, (x + 12, y + 12), tile)
    master = os.path.join(OUT, "gallery-stickers-master.png")
    img.save(master)
    print("wrote", master)


if __name__ == "__main__":
    light, panels = build("light")
    build("dark")
    for i, (x0, y0, x1, y1) in enumerate(panels):
        crop = light.crop((x0 - 4, y0 - 4, x1 + 4, y1 + 4))
        p = os.path.join(OUT, f"panel-{i+1}-master.png")
        crop.save(p)
        print("wrote", p)
    build_sticker_shelf()
