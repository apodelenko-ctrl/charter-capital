#!/usr/bin/env python3
"""Full-bleed 9:16 story: cover-crop the wide HK shot, text overlaid directly (no frames)."""
from PIL import Image, ImageDraw, ImageFont, ImageFilter

W, H = 1080, 1920
SRC = "/Users/ktel25/.cursor/projects/Users-ktel25-Documents-charter-capital/assets/story-hk-source-wide.png"
OUT_PNG = "/Users/ktel25/Documents/charter-capital/drafts/social/story-uae-statrys-9x16.png"
OUT_JPG = "/Users/ktel25/Documents/charter-capital/drafts/social/story-uae-statrys-9x16.jpg"

ARIAL_B = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"
ARIAL = "/System/Library/Fonts/Supplemental/Arial.ttf"
ARIAL_BLK = "/System/Library/Fonts/Supplemental/Arial Black.ttf"
GOLD = (210, 175, 105)


def font(p, s):
    return ImageFont.truetype(p, s)


def wrap(draw, text, fnt, max_w):
    words, lines, cur = text.split(), [], ""
    for w in words:
        test = (cur + " " + w).strip()
        if draw.textlength(test, font=fnt) <= max_w:
            cur = test
        else:
            if cur:
                lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


def cover(img, w, h, focus_y=0.50):
    iw, ih = img.size
    scale = max(w / iw, h / ih)
    nw, nh = int(iw * scale + 0.5), int(ih * scale + 0.5)
    img = img.resize((nw, nh), Image.LANCZOS)
    x = (nw - w) // 2
    y = int((nh - h) * focus_y)
    y = max(0, min(y, nh - h))
    return img.crop((x, y, x + w, y + h))


def main():
    src = Image.open(SRC).convert("RGB")
    base = cover(src, W, H, focus_y=0.46)

    # --- scrims for legibility (overlay, no frames) ---
    scrim = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    sd = ImageDraw.Draw(scrim)
    # top gradient (for headline)
    top_h = 760
    for y in range(top_h):
        a = int(205 * (1 - y / top_h) ** 1.15)
        sd.line([(0, y), (W, y)], fill=(6, 9, 18, a))
    # bottom gradient (for brand)
    bot_h = 560
    for i in range(bot_h):
        y = H - bot_h + i
        a = int(225 * (i / bot_h) ** 1.1)
        sd.line([(0, y), (W, y)], fill=(6, 9, 18, a))
    canvas = Image.alpha_composite(base.convert("RGBA"), scrim).convert("RGB")
    draw = ImageDraw.Draw(canvas)

    # --- TOP: eyebrow + headline + sub ---
    eyebrow_f = font(ARIAL_B, 34)
    x, y = 64, 116
    for chf in "НОВЫЙ РАЗБОР":
        draw.text((x, y), chf, font=eyebrow_f, fill=GOLD)
        x += draw.textlength(chf, font=eyebrow_f) + 8
    draw.line([(66, y + 54), (66 + 116, y + 54)], fill=GOLD, width=4)

    head_f = font(ARIAL_BLK, 64)
    hy = 206
    for ln in wrap(draw, "Связка Россия–Дубай–Гонконг умерла", head_f, W - 128):
        draw.text((64, hy), ln, font=head_f, fill=(255, 255, 255))
        hy += 72

    sub_f = font(ARIAL_B, 37)
    sy = hy + 14
    for ln in wrap(draw, "Азиатские необанки массово блокируют счета. Написал разбор, как теперь спасать капитал", sub_f, W - 128):
        draw.text((64, sy), ln, font=sub_f, fill=(214, 220, 232))
        sy += 50
    # gold down-chevron
    cx, cy = 82, sy + 8
    draw.line([(cx - 16, cy), (cx, cy + 18)], fill=GOLD, width=6)
    draw.line([(cx, cy + 18), (cx + 16, cy)], fill=GOLD, width=6)

    # --- BOTTOM: branding ---
    brand_f = font(ARIAL_BLK, 50)
    bb = H - 270
    draw.text((64, bb), "CHARTER CAPITAL", font=brand_f, fill=(255, 255, 255))
    draw.line([(66, bb + 70), (W - 64, bb + 70)], fill=GOLD, width=2)
    tag_f = font(ARIAL, 33)
    ty = bb + 90
    for ln in wrap(draw, "Архитекторы легитимности и безупречной биографии вашего капитала", tag_f, W - 128):
        draw.text((64, ty), ln, font=tag_f, fill=(196, 202, 216))
        ty += 44

    canvas.save(OUT_PNG)
    canvas.save(OUT_JPG, "JPEG", quality=90)
    print("saved", OUT_PNG, OUT_JPG)


if __name__ == "__main__":
    main()
