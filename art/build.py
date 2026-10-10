"""Draws the golden retriever sprites and writes hooks/sprites.ts + art/preview.png.

Run: python3 art/build.py   (needs Pillow)
Each sprite is a grid of palette indices; 0 is transparent.
"""
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent

PALETTE = [
    None,       # 0 transparent
    0x4A2A0E,   # 1 outline
    0xC48028,   # 2 gold
    0xE8AC4C,   # 3 light gold
    0xF8DA96,   # 4 cream
    0x96581A,   # 5 shadow gold
    0x180E08,   # 6 eye / nose
    0xE86878,   # 7 tongue
    0xFFFFFF,   # 8 highlight
    0xB83A2E,   # 9 leash
]

POSES = ["idle", "excited", "happy", "worried", "tilt", "sleep", "leash", "yawn", "sniff", "dig", "walk"]
BIG = (48, 37)
MINI = (16, 12)


class Canvas:
    def __init__(self, size):
        self.w, self.h = size
        self.im = Image.new("P", size, 0)
        self.d = ImageDraw.Draw(self.im)

    def e(self, cx, cy, rx, ry, c, o=None):
        self.d.ellipse((cx - rx, cy - ry, cx + rx, cy + ry), fill=c, outline=o)

    def poly(self, pts, c, o=None):
        self.d.polygon(pts, fill=c, outline=o)

    def rect(self, x0, y0, x1, y1, c):
        self.d.rectangle((x0, y0, x1, y1), fill=c)

    def line(self, x0, y0, x1, y1, c):
        self.d.line((x0, y0, x1, y1), fill=c)

    def px(self, x, y, c):
        self.d.point((x, y), fill=c)

    def done(self):
        """Adds a 1px outline around every filled region and returns the index grid."""
        src = self.im.load()
        out = self.im.copy()
        dst = out.load()
        for y in range(self.h):
            for x in range(self.w):
                if src[x, y] != 0:
                    continue
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < self.w and 0 <= ny < self.h and src[nx, ny] not in (0, 1):
                        dst[x, y] = 1
                        break
        return out


# ---------------------------------------------------------------- big, front

def front(eyes="open", mouth="tongue", ears="down", tail=0, tilt=0, dy=0):
    k = Canvas(BIG)
    c = 24
    # tail out to the right, cream feathered tip
    if tail == 0:
        k.poly([(c+8,30),(c+13,27),(c+16,22),(c+17,24),(c+15,29),(c+10,33)], 2)
        k.poly([(c+16,22),(c+18,24),(c+17,28),(c+14,31),(c+15,28)], 4)
    else:
        k.poly([(c+8,30),(c+14,30),(c+19,28),(c+19,30),(c+15,33),(c+10,33)], 2)
        k.poly([(c+19,28),(c+20,30),(c+18,33),(c+15,34),(c+17,31)], 4)
    # haunches, chest, legs (the body never bounces; only the head does)
    k.e(c-9, 30, 5, 4, 2); k.e(c+9, 30, 5, 4, 2)
    k.rect(c-14, 33, c-8, 34, 3); k.rect(c+8, 33, c+14, 34, 3)
    k.e(c, 23, 8, 8, 2)
    k.poly([(c-4,17),(c+4,17),(c+5,22),(c+3,25),(c+2,23),(c,27),(c-2,23),(c-3,25),(c-5,22)], 4)
    k.rect(c-5, 26, c-2, 33, 3); k.rect(c+2, 26, c+5, 33, 3)
    k.line(c-2, 27, c-2, 33, 5); k.line(c+2, 27, c+2, 33, 5)
    k.rect(c-6, 33, c-2, 34, 4); k.rect(c+2, 33, c+6, 34, 4)
    head_front(k, c + tilt, 10 + dy, eyes, mouth, ears, tilt)
    if mouth == "leash":  # strap from the mouth, hanging down past the right paw
        y = 10 + dy
        k.line(c-3, y + 6, c+3, y + 6, 9)
        k.line(c+3, y + 6, c+7, y + 14, 9)
        k.line(c+7, y + 14, c+7, y + 23, 9)
        k.rect(c+6, y + 23, c+8, y + 24, 9)
    return k.done()


def head_front(k, c, y, eyes, mouth, ears, tilt=0):
    k.e(c, y, 8, 7, 2)
    k.e(c, y - 5, 4, 2, 3)
    for s in (-1, 1):
        lift = -tilt * s  # a tilted head raises one ear
        if ears == "up":
            pts = [(6,-6),(10,-8),(12,-3),(10,3),(7,4),(5,0),(5,-3)]
        elif ears == "droop":
            pts = [(7,-2),(10,-2),(11,4),(10,10),(7,11),(6,6),(6,0)]
        else:
            pts = [(7,-3),(10,-4),(11,2),(10,8),(7,9),(6,4),(6,-1)]
        k.poly([(c + s*x, y + yy + lift) for x, yy in pts], 5, 1)
    # muzzle and nose
    k.e(c, y + 4, 4, 3, 4)
    k.rect(c-1, y + 2, c+1, y + 3, 6)
    k.line(c, y + 4, c, y + 5, 5)
    if mouth == "open":
        k.rect(c-2, y + 5, c+2, y + 7, 1); k.rect(c-1, y + 6, c+1, y + 8, 7)
    elif mouth == "yawn":  # wide and tall, tongue curled at the bottom
        k.rect(c-3, y + 5, c+3, y + 10, 1); k.rect(c-2, y + 8, c+2, y + 10, 7)
    elif mouth == "tongue":
        k.line(c-3, y + 5, c-1, y + 6, 5); k.line(c+1, y + 6, c+3, y + 5, 5)
        k.rect(c-1, y + 6, c+1, y + 8, 7); k.px(c, y + 8, 1)
    else:  # flat, worried
        k.line(c-2, y + 6, c+2, y + 6, 5)
    for s in (-1, 1):
        ex = c + s*4
        if eyes == "closed":
            k.line(ex-1, y, ex+1, y, 6)
        elif eyes == "happy":  # ^ ^
            k.px(ex-1, y, 6); k.px(ex, y - 1, 6); k.px(ex+1, y, 6)
        else:
            k.rect(*((ex-1, y - 1, ex, y) if s < 0 else (ex, y - 1, ex+1, y)), 6)
            k.px(ex if s < 0 else ex+1, y - 1, 8)
        if eyes == "sad":  # brows slope down and outward
            k.line(ex - s, y - 4, ex + s, y - 3, 5)
        else:
            k.line(ex-1, y - 3, ex+1, y - 3, 5)


# ----------------------------------------------------------------- big, side

def head_side(k, ox, oy, eyes="open"):
    k.e(ox, oy, 6, 6, 2)
    k.e(ox, oy-3, 3, 2, 3)
    k.poly([(ox+3,oy-1),(ox+10,oy),(ox+12,oy+2),(ox+11,oy+5),(ox+5,oy+6),(ox+2,oy+4)], 3)
    k.line(ox+6, oy+5, ox+11, oy+5, 4)
    k.rect(ox+11, oy, ox+12, oy+2, 6)
    k.line(ox+6, oy+4, ox+9, oy+4, 5)
    k.rect(ox+7, oy+5, ox+8, oy+7, 7)
    k.poly([(ox-3,oy-4),(ox,oy-3),(ox,oy+2),(ox-1,oy+7),(ox-4,oy+8),(ox-5,oy+4),(ox-5,oy-1)], 5, 1)
    if eyes == "closed":
        k.line(ox+2, oy, ox+4, oy, 6)
    else:
        k.rect(ox+3, oy-1, ox+4, oy, 6); k.px(ox+4, oy-1, 8)
    k.line(ox+2, oy-3, ox+4, oy-3, 5)


def side(head_y=7, head_x=32, tail=0, step=0, paw=0):
    """Standing, facing right. paw lifts the front leg (digging)."""
    k = Canvas(BIG)
    if tail == 0:
        k.poly([(9,15),(4,13),(1,10),(1,8),(4,10),(9,12)], 2)
        k.poly([(1,10),(0,13),(3,15),(6,17),(9,17),(5,15)], 4)
    else:
        k.poly([(9,14),(5,12),(3,8),(3,5),(5,7),(7,10),(10,12)], 2)
        k.poly([(3,5),(1,8),(2,12),(5,15),(9,16),(5,12),(3,9)], 4)
    a, b = (1, -1) if step else (0, 0)
    k.rect(13+a, 20, 15+a, 31, 5); k.rect(29+b, 20, 31+b, 31, 5)
    k.rect(10-a, 20, 13-a, 31, 2)
    lift = 3 if paw else 0
    k.rect(26-b, 20, 28-b, 31 - lift, 3)
    k.px(9-a, 23, 4); k.px(9-a, 25, 4)
    for x in (10-a, 13+a, 29+b):
        k.rect(x, 31, x+3, 32, 3)
    k.rect(26-b, 31 - lift, 29-b, 32 - lift, 3)
    if paw:  # flicked dirt
        for p in ((36, 31), (38, 29), (40, 32)):
            k.px(*p, 5)
    k.e(19, 17, 11, 5, 2)
    k.line(12, 13, 24, 13, 3)
    neck_top = min(4, head_y - 3)
    k.poly([(25,12),(29,neck_top),(33,neck_top+2),(33,14),(31,21),(26,21)], 2)
    k.poly([(30,12),(33,14),(32,20),(30,22),(28,20),(29,16)], 4)
    k.poly([(13,20),(25,20),(24,22),(22,21),(20,23),(18,21),(16,23),(14,21)], 4)
    head_side(k, head_x, head_y)
    return k.done()


def lying(tail=0, breath=0):
    """Asleep: lying down facing us, head on paws, eyes closed."""
    k = Canvas(BIG)
    c = 24
    if tail == 0:
        k.poly([(c+12,32),(c+18,31),(c+22,33),(c+18,35),(c+12,35)], 2)
        k.poly([(c+20,32),(c+23,34),(c+19,36),(c+16,35)], 4)
    else:
        k.poly([(c+12,32),(c+18,30),(c+21,29),(c+19,33),(c+12,35)], 2)
        k.poly([(c+20,28),(c+22,30),(c+20,33),(c+18,32)], 4)
    k.e(c, 30 - breath, 15, 5 + breath, 2)
    k.e(c, 28 - breath, 10, 2, 3)
    k.rect(c-8, 32, c-2, 35, 3); k.rect(c+2, 32, c+8, 35, 3)
    k.rect(c-9, 34, c-2, 35, 4); k.rect(c+2, 34, c+9, 35, 4)
    head_front(k, c, 27, "closed", "none", "droop")
    return k.done()


# --------------------------------------------------------------------- mini

def mini(eyes="open", mouth="tongue", ears="down", dy=0, tilt=0, paws=0):
    """Head and shoulders, facing us: 16x12 pixels, 6 terminal rows."""
    k = Canvas(MINI)
    c, y = 8 + tilt, 5 + dy
    k.e(8, 12, 7, 3, 2)
    k.poly([(5,9),(11,9),(10,11),(8,12),(6,11)], 4)
    if paws:
        k.rect(3 + paws, 10, 5 + paws, 11, 3); k.rect(11 - paws, 10, 13 - paws, 11, 3)
    k.e(c, y, 5, 4, 2)
    k.e(c, y - 3, 2, 1, 3)
    for s in (-1, 1):
        lift = -tilt * s
        if ears == "up":
            pts = [(4,-4),(6,-5),(7,-1),(5,1),(4,0)]
        elif ears == "droop":
            pts = [(4,0),(6,0),(7,3),(6,6),(4,5)]
        else:
            pts = [(4,-2),(6,-2),(7,1),(6,4),(4,3)]
        k.poly([(c + s*x, y + yy + lift) for x, yy in pts], 5)
    k.rect(c-1, y + 2, c+1, y + 3, 4)
    k.px(c, y + 1, 6)
    if mouth == "tongue":
        k.px(c, y + 3, 7)
    elif mouth == "yawn":
        k.rect(c-1, y + 3, c+1, y + 4, 1); k.px(c, y + 4, 7)
    elif mouth == "leash":
        k.line(c-2, y + 3, c+2, y + 3, 9); k.line(c+2, y + 3, c+4, y + 6, 9)
    elif mouth == "open":
        k.rect(c-1, y + 3, c+1, y + 3, 7)
    for s in (-1, 1):
        ex = c + s*2
        if eyes == "closed":
            k.px(ex, y, 5)
        elif eyes == "happy":
            k.px(ex, y - 1, 6)
        else:
            k.px(ex, y - 1, 6)
        if eyes == "sad":
            k.px(ex + s, y - 2, 5)
    return k.done()


# ------------------------------------------------------------------- poses

def big_poses():
    return {
        "idle":    [front(), front(), front(eyes="closed", tail=1), front(tail=1)],
        "excited": [front(mouth="open", ears="up", dy=-1), front(mouth="open", ears="up", tail=1, dy=0)],
        "happy":   [front(eyes="happy", tail=0, dy=-1), front(eyes="happy", tail=1)],
        "worried": [front(eyes="sad", mouth="none", ears="droop"), front(eyes="sad", mouth="none", ears="droop", tail=1)],
        "tilt":    [front(tilt=1, mouth="none"), front(tilt=1, mouth="none", eyes="closed")],
        "sleep":   [lying(), lying(breath=1)],
        "leash":   [front(mouth="leash", ears="up"), front(mouth="leash", ears="up", tail=1, dy=-1)],
        "yawn":    [front(eyes="closed", mouth="yawn", ears="droop"), front(eyes="closed", mouth="none", ears="droop")],
        "sniff":   [side(head_y=13, head_x=33), side(head_y=14, head_x=33, tail=1)],
        "dig":     [side(head_y=12, head_x=33, paw=1), side(head_y=12, head_x=33, tail=1)],
        "walk":    [side(), side(tail=1, step=1)],
    }


def mini_poses():
    busy = [mini(paws=1), mini(paws=0, ears="up")]
    return {
        "idle":    [mini(), mini(), mini(eyes="closed"), mini()],
        "excited": [mini(mouth="open", ears="up", dy=-1), mini(mouth="open", ears="up")],
        "happy":   [mini(eyes="happy", dy=-1), mini(eyes="happy")],
        "worried": [mini(eyes="sad", mouth="none", ears="droop")],
        "tilt":    [mini(tilt=1, mouth="none")],
        "sleep":   [mini(eyes="closed", mouth="none", ears="droop", dy=1)],
        "leash":   [mini(mouth="leash", ears="up"), mini(mouth="leash", ears="up", dy=-1)],
        "yawn":    [mini(eyes="closed", mouth="yawn", ears="droop"), mini(eyes="closed", mouth="none", ears="droop")],
        "sniff":   busy,
        "dig":     busy,
        "walk":    busy,
    }


def encode(frames, size):
    out = []
    for f in frames:
        assert f.size == size, f"frame is {f.size}, want {size}"
        data = list(f.getdata())
        assert all(0 <= v < len(PALETTE) for v in data), "pixel outside the palette"
        out.append("".join(str(v) for v in data))
    return out


def preview(sets, path, scale=6):
    rows = [(name, size, poses) for name, size, poses in sets]
    width = max(sum((size[0] + 2) for f in poses.values() for _ in f) for _, size, poses in rows) * scale
    height = sum((size[1] + 4) for _, size, _ in rows) * scale
    sheet = Image.new("RGBA", (width, height), (40, 40, 48, 255))
    y = 0
    for _, size, poses in rows:
        x = 0
        for frames in poses.values():
            for f in frames:
                rgba = Image.new("RGBA", size)
                rgba.putdata([(0, 0, 0, 0) if v == 0 else
                              ((PALETTE[v] >> 16) & 255, (PALETTE[v] >> 8) & 255, PALETTE[v] & 255, 255)
                              for v in f.getdata()])
                sheet.alpha_composite(rgba.resize((size[0]*scale, size[1]*scale), Image.NEAREST), (x, y))
                x += (size[0] + 2) * scale
        y += (size[1] + 4) * scale
    sheet.save(path)


def main():
    big, small = big_poses(), mini_poses()
    for poses in (big, small):
        assert list(poses) == POSES, "every size draws every pose"
    sprites = {
        "big": {"width": BIG[0], "height": BIG[1], "poses": {p: encode(f, BIG) for p, f in big.items()}},
        "mini": {"width": MINI[0], "height": MINI[1], "poses": {p: encode(f, MINI) for p, f in small.items()}},
    }
    palette = [0x01000000 if c is None else c for c in PALETTE]
    ts = (
        "// GENERATED by art/build.py: do not edit.\n"
        "import type { Sprites } from './raster'\n\n"
        f"export const PALETTE: readonly number[] = {json.dumps(palette)}\n\n"
        f"export const SPRITES: Sprites = {json.dumps(sprites, indent=2)}\n"
    )
    (ROOT / "hooks" / "sprites.ts").write_text(ts)
    preview([("big", BIG, big), ("mini", MINI, small)], ROOT / "art" / "preview.png")
    print("wrote hooks/sprites.ts and art/preview.png", file=sys.stderr)


if __name__ == "__main__":
    main()
