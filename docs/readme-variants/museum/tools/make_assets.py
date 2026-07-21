#!/usr/bin/env python3
"""Deterministic asset composites for the `museum` README skin.

Hero: neutral gallery wall + full-body cutout + soft spot + hairline frame
+ tiny Optima wall label (light & dark variants).
Gallery: exhibits matted on uniform paper cells (800x600).

Straight re-exports (starter previews, icon) are NOT done here — they go
through `repochan image edit compress` (see tools/export.sh) so no 2K/4K
originals are linked. Crops of tall starter screenshots are pre-baked here
into tools/_tmp/ and then compressed by the CLI as well.

Run from the repo root:  python3 docs/readme-variants/museum/tools/make_assets.py
"""
import os
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".."))
OUT = os.path.join(ROOT, "docs/readme-variants/museum/assets")
TMP = os.path.join(ROOT, "docs/readme-variants/museum/tools/_tmp")
os.makedirs(OUT, exist_ok=True)
os.makedirs(os.path.join(TMP), exist_ok=True)

CUTOUT_A = os.path.join(ROOT, "packages/starters/character-game-page/public/assets/hero-cutout.webp")
CUTOUT_B = os.path.join(ROOT, "packages/starters/landing-scrollytelling/public/assets/cutout-wave.webp")
FOUNDATION = os.path.join(ROOT, ".repochan/orders/ord-foundation-001/versions/v2026-07-19T13-53-01-958Z/generated-2026-07-19T13-48-41.png")
POSTER = os.path.join(ROOT, ".repochan/orders/ord-poster-001/versions/v2026-07-19T14-02-18-266Z/generated-2026-07-19T13-59-20.png")
ZINE = os.path.join(ROOT, "packages/starters/landing-neobrutal-zine/public/assets")
MUSEUM_PREVIEW = os.path.join(ROOT, "packages/starters/landing-museum/repochan/previews/desktop.webp")

OPTIMA = "/System/Library/Fonts/Optima.ttc"

# ---------------------------------------------------------------- helpers

def tracked_width(draw, text, font, tracking):
    w = 0
    for ch in text:
        w += draw.textlength(ch, font=font) + tracking
    return w - tracking if text else 0


def draw_tracked(draw, xy, text, font, fill, tracking=0):
    x, y = xy
    for ch in text:
        draw.text((x, y), ch, font=font, fill=fill)
        x += draw.textlength(ch, font=font) + tracking


def radial_glow(size, center, radius, color, peak_alpha):
    """Soft radial glow layer (RGBA)."""
    mask = Image.new("L", size, 0)
    d = ImageDraw.Draw(mask)
    cx, cy = center
    d.ellipse([cx - radius, cy - radius, cx + radius, cy + radius], fill=peak_alpha)
    mask = mask.filter(ImageFilter.GaussianBlur(radius * 0.55))
    layer = Image.new("RGBA", size, color + (0,))
    layer.putalpha(mask)
    return layer


def soft_shadow(size, center, w, h, blur, alpha):
    mask = Image.new("L", size, 0)
    d = ImageDraw.Draw(mask)
    cx, cy = center
    d.ellipse([cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2], fill=alpha)
    mask = mask.filter(ImageFilter.GaussianBlur(blur))
    layer = Image.new("RGBA", size, (0, 0, 0, 0))
    layer.putalpha(mask)
    return layer


def trim_alpha(img):
    bbox = img.getchannel("A").getbbox()
    return img.crop(bbox) if bbox else img


def fit(img, max_w, max_h):
    s = min(max_w / img.width, max_h / img.height)
    return img.resize((round(img.width * s), round(img.height * s)), Image.LANCZOS)


def mat_cell(content, pad=56, mat=(242, 240, 235, 255), line=(26, 26, 26, 26)):
    """Mount an exhibit on a 800x600 paper mat with a hairline inner border."""
    cell = Image.new("RGBA", (800, 600), mat)
    d = ImageDraw.Draw(cell)
    d.rectangle([18, 18, 782, 582], outline=line, width=2)
    area_w, area_h = 800 - 2 * pad, 600 - 2 * pad
    c = fit(content, area_w, area_h)
    cell.alpha_composite(c, ((800 - c.width) // 2, (600 - c.height) // 2))
    return cell


def save_webp(img, path, quality=82):
    img.convert("RGB").save(path, "WEBP", quality=quality, method=6)
    print(f"  {os.path.relpath(path, ROOT)}  {os.path.getsize(path)//1024} KB")


# ---------------------------------------------------------------- hero

def hero(dark=False):
    W, H = 2400, 1000
    wall = (11, 15, 25) if dark else (247, 247, 245)
    ink = (244, 246, 251) if dark else (26, 26, 26)
    sub = (138, 148, 166) if dark else (110, 110, 110)
    accent = (56, 189, 248)

    img = Image.new("RGBA", (W, H), wall + (255,))

    # soft spot behind the figure
    glow_color = (56, 189, 248) if dark else (255, 255, 255)
    img.alpha_composite(radial_glow((W, H), (1560, 460), 640, glow_color, 46 if dark else 235))

    # gallery floor hairline
    d = ImageDraw.Draw(img)
    floor_y = 906
    d.line([(84, floor_y), (W - 84, floor_y)], fill=ink + (22,), width=2)

    # figure: full-body cutout A, feet on the floor line
    cut = trim_alpha(Image.open(CUTOUT_A).convert("RGBA"))
    target_h = 872
    s = target_h / cut.height
    cut = cut.resize((round(cut.width * s), target_h), Image.LANCZOS)
    cx = 1560
    # shadow under the lowest point of the figure
    img.alpha_composite(soft_shadow((W, H), (cx, floor_y + 6), 560, 40, 26, 90 if dark else 48))
    img.alpha_composite(cut, (cx - cut.width // 2, floor_y - cut.height + 4))

    # lightbox frame hairline
    d = ImageDraw.Draw(img)
    d.rectangle([26, 26, W - 27, H - 27], outline=ink + (34,), width=2)

    # wall label, left quiet zone
    f_word = ImageFont.truetype(OPTIMA, 76)
    f_sub = ImageFont.truetype(OPTIMA, 30)
    f_no = ImageFont.truetype(OPTIMA, 24)
    lx, ly = 150, 408
    d.rectangle([lx, ly, lx + 64, ly + 5], fill=accent + (255,))
    draw_tracked(d, (lx, ly + 34), "REPOCHAN", f_word, ink + (255,), tracking=14)
    draw_tracked(d, (lx + 2, ly + 138), "CHARACTER STUDY · EXHIBIT 001", f_sub, sub + (255,), tracking=6)
    draw_tracked(d, (lx + 2, ly + 190), "SOFT LIGHT ON PAPER · DIGITAL, 2026", f_no, sub + (200,), tracking=5)

    name = "hero-museum-dark.webp" if dark else "hero-museum-light.webp"
    save_webp(img, os.path.join(OUT, name), quality=80)


# ---------------------------------------------------------------- gallery

def gallery():
    g = os.path.join(OUT, "gallery")
    os.makedirs(g, exist_ok=True)

    # No. 001 foundation sheet
    save_webp(mat_cell(Image.open(FOUNDATION).convert("RGBA")), os.path.join(g, "foundation.webp"))

    # No. 002 dig cutout (cutout B, floating with soft shadow on the mat)
    cut = trim_alpha(Image.open(CUTOUT_B).convert("RGBA"))
    cut = fit(cut, 560, 470)
    cell = Image.new("RGBA", (800, 600), (242, 240, 235, 255))
    d = ImageDraw.Draw(cell)
    d.rectangle([18, 18, 782, 582], outline=(26, 26, 26, 26), width=2)
    cell.alpha_composite(soft_shadow((800, 600), (400, 520), 340, 26, 18, 42))
    cell.alpha_composite(cut, ((800 - cut.width) // 2, 500 - cut.height))
    save_webp(cell, os.path.join(g, "cutout.webp"))

    # No. 003 poster (landscape studio scene)
    save_webp(mat_cell(Image.open(POSTER).convert("RGBA")), os.path.join(g, "poster.webp"))

    # No. 004 sticker specimens — three tiles in a row
    row = Image.new("RGBA", (800, 600), (242, 240, 235, 255))
    d = ImageDraw.Draw(row)
    d.rectangle([18, 18, 782, 582], outline=(26, 26, 26, 26), width=2)
    tiles = ["stickers/sticker-0.webp", "stickers/sticker-5.webp", "stickers/sticker-2.webp"]
    tw, gap = 190, 34
    total = tw * 3 + gap * 2
    x = (800 - total) // 2
    for t in tiles:
        tile = Image.open(os.path.join(ZINE, t)).convert("RGBA").resize((tw, tw), Image.LANCZOS)
        if tile.getchannel("A").getextrema()[0] < 255:  # alpha tile: add shadow
            row.alpha_composite(soft_shadow((800, 600), (x + tw // 2, 300 + tw // 2 + 8), tw * 0.7, 18, 12, 36))
        row.alpha_composite(tile, (x, 300 - tw // 2))
        x += tw + gap
    save_webp(row, os.path.join(g, "stickers.webp"))

    # No. 005 webstate specimens
    row = Image.new("RGBA", (800, 600), (242, 240, 235, 255))
    d = ImageDraw.Draw(row)
    d.rectangle([18, 18, 782, 582], outline=(26, 26, 26, 26), width=2)
    tiles = ["webstates/state-1.webp", "webstates/state-4.webp", "webstates/state-8.webp"]
    x = (800 - total) // 2
    for t in tiles:
        tile = Image.open(os.path.join(ZINE, t)).convert("RGBA").resize((tw, tw), Image.LANCZOS)
        if tile.getchannel("A").getextrema()[0] < 255:
            row.alpha_composite(soft_shadow((800, 600), (x + tw // 2, 300 + tw // 2 + 8), tw * 0.7, 18, 12, 36))
        row.alpha_composite(tile, (x, 300 - tw // 2))
        x += tw + gap
    save_webp(row, os.path.join(g, "webstates.webp"))

    # No. 006 landing-museum — crop top of the tall full-page preview
    prev = Image.open(MUSEUM_PREVIEW).convert("RGBA")
    crop = prev.crop((0, 0, prev.width, round(prev.width * 0.75)))  # 4:3 viewport slice
    save_webp(mat_cell(crop), os.path.join(g, "landing-museum.webp"))


# ------------------------------------------------- starter preview crops

def starter_crops():
    """Pre-crop tall full-page screenshots to 1440x900 viewport slices;
    final compression happens via `repochan image edit compress`."""
    tall = {
        "landing-solarpunk": "packages/starters/landing-solarpunk/repochan/previews/desktop.webp",
        "landing-memphis": "packages/starters/landing-memphis/repochan/previews/desktop.webp",
    }
    for sid, rel in tall.items():
        p = os.path.join(ROOT, rel)
        img = Image.open(p).convert("RGB")
        if img.height > 1000:
            img = img.crop((0, 0, img.width, 900))
        out = os.path.join(TMP, f"{sid}.png")
        img.save(out)
        print(f"  tmp crop {sid} {img.width}x{img.height}")


if __name__ == "__main__":
    print("hero:")
    hero(dark=False)
    hero(dark=True)
    print("gallery:")
    gallery()
    print("starter crops:")
    starter_crops()
