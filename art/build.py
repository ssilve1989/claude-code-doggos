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

POSES = ["idle", "excited", "happy", "worried", "tilt", "sleep", "leash", "yawn", "sniff", "dig", "walk",
         "drowsy", "pant", "shake", "lie", "zoomies"]
BIG = (48, 37)
MINI = (16, 12)
PUP_POSES = ["sit", "wag", "sad", "run", "turn"]
PUP = (24, 18)
PUP_MINI = (8, 6)


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
        elif eyes == "half":  # heavy lids over the bottom of the eye
            k.line(ex-1, y - 1, ex+1, y - 1, 5); k.line(ex-1, y, ex+1, y, 6)
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


def lying(tail=0, breath=0, head_y=27, eyes="closed", mouth="none", ears="droop"):
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
    head_front(k, c, head_y, eyes, mouth, ears)
    return k.done()


# --------------------------------------------------------------------- mini

def sit_side(tail=0):
    """Sitting in side view, facing right: the bridge between standing and the front sit."""
    k = Canvas(BIG)
    if tail == 0:
        k.poly([(10,27),(6,25),(3,21),(2,16),(4,17),(6,21),(11,24)], 2)
        k.poly([(2,16),(1,19),(2,23),(5,26),(9,28),(5,24),(3,20)], 4)
    else:
        k.poly([(10,28),(5,28),(1,27),(0,25),(4,25),(11,25)], 2)
        k.poly([(0,26),(1,29),(5,30),(9,30),(5,28)], 4)
    k.poly([(23,11),(16,17),(11,23),(9,30),(28,31),(30,18),(28,12)], 2)
    k.e(14, 26, 6, 5, 2)
    k.d.arc((8, 21, 20, 31), 210, 320, fill=5)
    k.rect(24, 22, 26, 31, 2); k.rect(28, 20, 30, 31, 3)
    k.line(27, 22, 27, 31, 5)
    k.rect(23, 31, 26, 32, 3); k.rect(28, 31, 31, 32, 4)
    k.rect(10, 31, 17, 32, 3)
    k.poly([(27,13),(32,15),(32,19),(31,22),(29,21),(30,24),(28,23),(27,19)], 4)
    head_side(k, 29, 8)
    return k.done()


# ------------------------------------------------------------------- puppies

def pup(eyes="open", mouth="tongue", ears="down", tail=0, dy=0, turn=0):
    """A small golden puppy sitting and facing us, 24x18. `turn` shifts the head towards its run."""
    k = Canvas(PUP)
    c = 12
    if tail == 0:
        k.poly([(c+4,14),(c+8,11),(c+9,12),(c+7,15)], 2); k.px(c+9, 11, 4)
    else:
        k.poly([(c+4,14),(c+8,15),(c+9,16),(c+6,16)], 2); k.px(c+9, 16, 4)
    k.e(c, 13, 5, 4, 2)
    k.poly([(c-2,10),(c+2,10),(c+2,13),(c,15),(c-2,13)], 4)
    k.rect(c-3, 15, c-1, 17, 3); k.rect(c+1, 15, c+3, 17, 3)
    hx, hy = c + turn, 6 + dy
    k.e(hx, hy, 5, 4, 2)
    k.e(hx, hy - 3, 2, 1, 3)
    for s_ in (-1, 1):
        pts = [(4,-1),(6,-1),(7,2),(6,5),(4,4)] if ears != "droop" else [(4,0),(6,1),(6,5),(5,7),(4,5)]
        k.poly([(hx + s_*x, hy + y) for x, y in pts], 5)
    k.rect(hx-1, hy + 1, hx+1, hy + 3, 4)
    k.px(hx, hy + 1, 6)
    if mouth == "tongue":
        k.px(hx, hy + 3, 7)
    for s_ in (-1, 1):
        ex = hx + s_*2
        if eyes == "closed":
            k.px(ex, hy - 1, 5)
        elif eyes == "happy":
            k.px(ex, hy - 2, 6)
        else:
            k.px(ex, hy - 1, 6)
    return k.done()


def pup_run(step=0):
    """Running, side view, drawn facing right; stored flipped to face left."""
    k = Canvas(PUP)
    k.poly([(3,8),(0,5),(1,4),(4,7)], 2); k.px(0, 4, 4)
    a, b = (2, -2) if step == 1 else (-1, 1) if step == 2 else (0, 0)
    for x in (5 + a, 8 - a, 14 + b, 17 - b):
        k.rect(x, 12, x+1, 16, 2)
    k.e(11, 10, 7, 3, 2)
    k.line(6, 13, 15, 13, 4)
    k.e(18, 6, 4, 3, 2)
    k.poly([(20,5),(23,6),(23,8),(20,9)], 3)
    k.px(23, 6, 6)
    k.px(19, 5, 6)
    k.poly([(15,4),(17,3),(17,8),(15,9)], 5)
    return k.done()


def mini_pup(eyes="open", mouth="tongue", ears="down", dy=0):
    k = Canvas(PUP_MINI)
    c, y = 4, 3 + dy
    k.e(c, y, 2, 2, 2)
    for s_ in (-1, 1):
        if ears == "droop":
            k.line(c + s_*3, y, c + s_*3, y + 2, 5)
        else:
            k.line(c + s_*3, y - 1, c + s_*3, y + 1, 5)
    if eyes != "closed":
        k.px(c - 1, y - 1, 6); k.px(c + 1, y - 1, 6)
    k.px(c, y + 1, 6)
    if mouth == "tongue":
        k.px(c, y + 2, 7)
    k.line(c - 2, 5, c + 2, 5, 3)
    return k.done()


def mini_pup_run(step=0):
    k = Canvas(PUP_MINI)
    k.rect(1, 2, 5, 3, 2)
    k.rect(5, 0, 7, 2, 2); k.px(7, 1, 6); k.px(5, 0, 5)
    k.px(0, 1, 2)
    legs = (1, 4) if step == 0 else (2, 5)
    for x in legs:
        k.px(x, 4, 2)
    return k.done()


def facing_left(im):
    return im.transpose(Image.Transpose.FLIP_LEFT_RIGHT)


def pup_poses():
    return {
        "sit":  [pup(), pup(eyes="closed"), pup(), pup(dy=-1)],
        "wag":  [pup(eyes="happy", tail=0), pup(eyes="happy", tail=1, dy=-1)],
        "sad":  [pup(mouth="none", ears="droop")],
        # stored facing left, the way arriving pups run; the code mirrors them to leave
        "run":  [facing_left(pup_run(i)) for i in range(3)],
        "turn": [pup(turn=2, mouth="none")],
    }


def mini_pup_poses():
    return {
        "sit":  [mini_pup(), mini_pup(eyes="closed"), mini_pup()],
        "wag":  [mini_pup(dy=-1), mini_pup()],
        "sad":  [mini_pup(mouth="none", ears="droop")],
        "run":  [facing_left(mini_pup_run(i)) for i in range(2)],
        "turn": [mini_pup(mouth="none")],
    }


def big_stances():
    return {p: ("lie" if p in ("sleep", "lie") else "stand" if p in ("sniff", "dig", "walk", "zoomies") else "sit")
            for p in POSES}


def shaking(direction):
    """A wet-dog shake: head and tail swung one way, droplets flying off the other."""
    k = front(tilt=direction, mouth="none", eyes="closed", tail=0 if direction < 0 else 1)
    d = ImageDraw.Draw(k)
    side_x = 24 + 13 * -direction
    for dx, dy in ((0, 6), (3, 2), (-2, 12), (4, 16), (1, 22)):
        d.point((side_x + dx * -direction, dy), fill=8)
    return k


def big_clips():
    # shortcut: the turn from side to front uses a tilted-head front sit instead of a true 3/4 view
    stand_sit = [side(), sit_side(), front(tilt=1, mouth="none")]
    crouch = lying(head_y=22, eyes="open", mouth="tongue", ears="down")
    return {"stand-sit": stand_sit, "sit-stand": stand_sit[::-1], "sit-lie": [crouch], "lie-sit": [crouch]}


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
        "drowsy":  [front(eyes="half", mouth="none", ears="droop"), front(eyes="half", mouth="none", ears="droop"),
                    front(eyes="closed", mouth="none", ears="droop")],
        "pant":    [front(mouth="open"), front(mouth="tongue", dy=1)],
        "shake":   [shaking(-1), shaking(1)],
        "lie":     [lying(head_y=27, eyes="open", mouth="tongue", ears="down"),
                    lying(head_y=27, eyes="closed", mouth="tongue", ears="down", breath=1)],
        "zoomies": [side(head_y=9, tail=1, step=0), side(head_y=8, tail=0, step=1)],
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
        "drowsy":  [mini(eyes="closed", mouth="none", ears="droop"), mini(mouth="none", ears="droop")],
        "pant":    [mini(mouth="open"), mini(mouth="tongue", dy=1)],
        "shake":   [mini(tilt=1, mouth="none", eyes="closed"), mini(tilt=-1, mouth="none", eyes="closed")],
        "lie":     [mini(mouth="tongue", ears="droop", dy=1)],
        "zoomies": [mini(paws=1, mouth="open", ears="up"), mini(mouth="open", ears="up", dy=-1)],
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
        "big": {"width": BIG[0], "height": BIG[1], "poses": {p: encode(f, BIG) for p, f in big.items()},
                "stances": big_stances(), "clips": {k: encode(f, BIG) for k, f in big_clips().items()}},
        # the mini dog is always facing us, so every pose shares one stance
        "mini": {"width": MINI[0], "height": MINI[1], "poses": {p: encode(f, MINI) for p, f in small.items()},
                 "stances": {p: "sit" for p in POSES}, "clips": {}},
    }
    palette = [0x01000000 if c is None else c for c in PALETTE]
    pups, mini_pups = pup_poses(), mini_pup_poses()
    for poses in (pups, mini_pups):
        assert list(poses) == PUP_POSES, "every pup size draws every pup pose"
    pup_sets = {
        "big": {"width": PUP[0], "height": PUP[1], "poses": {p: encode(f, PUP) for p, f in pups.items()}},
        "mini": {"width": PUP_MINI[0], "height": PUP_MINI[1], "poses": {p: encode(f, PUP_MINI) for p, f in mini_pups.items()}},
    }
    ts = (
        "// GENERATED by art/build.py: do not edit.\n"
        "import type { PupSprites, Sprites } from './raster'\n\n"
        f"export const PALETTE: readonly number[] = {json.dumps(palette)}\n\n"
        f"export const SPRITES: Sprites = {json.dumps(sprites, indent=2)}\n\n"
        f"export const PUPS: PupSprites = {json.dumps(pup_sets, indent=2)}\n"
    )
    (ROOT / "hooks" / "sprites.ts").write_text(ts)
    preview([("big", BIG, big), ("mini", MINI, small), ("pup", PUP, pups), ("pup mini", PUP_MINI, mini_pups)],
            ROOT / "art" / "preview.png")
    print("wrote hooks/sprites.ts and art/preview.png", file=sys.stderr)


if __name__ == "__main__":
    main()
