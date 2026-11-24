"""Check images for the DW22 tour: draw a coordinate grid, or the camera cones of a tour, on an apartment plan.

  overlay.py grid  M14 out.png             plan with a 0..1 grid and the room label anchors
  overlay.py views M14 views.json out.png  plan with each view's camera spot and viewing cone
  overlay.py table M14                     the apartment's rooms: number, name, area, label position

views.json is {"views": [{"n": "004", "cam": [x, y], "dir": deg}, ...]} (or a dict keyed by room number).
Coordinates are fractions of the plan image (x to the right, y down); dir is clockwise from east (0 = right, 90 = down).
"""
import json, math, sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
PLANS = json.loads((Path(__file__).parent / "src/plans.json").read_text())
M = 70  # margin for the axis labels


def font(size):
    for f in ("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", "/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf"):
        if Path(f).exists():
            return ImageFont.truetype(f, size)
    return ImageFont.load_default()


def base(apt):
    plan = Image.open(ROOT / f"public/dw22/plans/{apt}.webp").convert("RGB")
    w, h = plan.size
    im = Image.new("RGB", (w + 2 * M, h + 2 * M), "white")
    im.paste(plan, (M, M))
    return im, w, h


def grid(apt, out):
    im, w, h = base(apt)
    d = ImageDraw.Draw(im, "RGBA")
    f = font(22)
    for i in range(0, 21):
        t = i / 20
        major = i % 2 == 0
        col = (30, 90, 220, 120 if major else 45)
        x, y = M + t * w, M + t * h
        d.line([(x, M), (x, M + h)], fill=col, width=2 if major else 1)
        d.line([(M, y), (M + w, y)], fill=col, width=2 if major else 1)
        if major:
            d.text((x - 16, 22), f"{t:.1f}", fill=(30, 90, 220), font=f)
            d.text((x - 16, M + h + 22), f"{t:.1f}", fill=(30, 90, 220), font=f)
            d.text((8, y - 12), f"{t:.1f}", fill=(30, 90, 220), font=f)
            d.text((M + w + 8, y - 12), f"{t:.1f}", fill=(30, 90, 220), font=f)
    for r in PLANS[apt]["rooms"]:
        for px, py in r["pts"][:1]:
            x, y = M + px * w, M + py * h
            d.ellipse([x - 7, y - 7, x + 7, y + 7], fill=(220, 30, 30))
            d.text((x + 10, y + 6), f"{r['n']} {r['name']}", fill=(200, 20, 20), font=font(20))
    im.save(out)


def views(apt, src, out):
    data = json.loads(Path(src).read_text())
    vs = data.get("views", data)
    if isinstance(vs, dict):
        vs = [dict(v, n=k) for k, v in vs.items()]
    im, w, h = base(apt)
    d = ImageDraw.Draw(im, "RGBA")
    R = w * 0.2
    for v in vs:
        x, y = M + v["cam"][0] * w, M + v["cam"][1] * h
        a = v["dir"]
        box = [x - R, y - R, x + R, y + R]
        d.pieslice(box, a - 34, a + 34, fill=(200, 120, 0, 70), outline=(200, 120, 0, 255))
        ex, ey = x + R * math.cos(math.radians(a)), y + R * math.sin(math.radians(a))
        d.line([(x, y), (ex, ey)], fill=(200, 60, 0, 255), width=4)
        d.ellipse([x - 12, y - 12, x + 12, y + 12], fill=(200, 60, 0, 255), outline="white", width=3)
        d.text((x + 14, y - 34), v["n"], fill=(160, 30, 0), font=font(30))
    im.save(out)


def table(apt):
    f = next(x for x in json.loads((Path(__file__).parent / "src/flats.json").read_text()) if x["id"] == apt)
    p = PLANS[apt]
    floor = 'ground floor ("parter")' if f["floor"] == 0 else f"floor {f['floor']} (upper floor)"
    print(f"APARTMENT {apt}: {floor}, {f['rooms']} room(s), {f['area']} m2. Plan image {p['w']} x {p['h']} px.")
    print("Rooms (number, Polish name, area, where its label sits on the plan as x,y fractions):")
    for r in p["rooms"]:
        at = f"({r['pts'][0][0]:.2f}, {r['pts'][0][1]:.2f})" if r["pts"] else "not marked"
        print(f"  {r['n']}  {r['name']}  {r['area']} m2  label anchor at {at}")


if __name__ == "__main__":
    if sys.argv[1] == "table":
        table(sys.argv[2])
    elif sys.argv[1] == "grid":
        grid(sys.argv[2], sys.argv[3])
    else:
        views(sys.argv[2], sys.argv[3], sys.argv[4])
