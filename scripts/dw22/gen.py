"""Room images for the DW22 tour: turn the checked room briefs into image requests, track attempts, install results.

Working files live outside the repo, in a work directory (WORK, default: $DW22_WORK):
  brief/out/<APT>.json   checked brief per apartment (order, views with cam, dir, room_type, image own/shared, view_text)
  brief/media.json       Higgsfield media ids of the reference images (plans, M11 style images, exterior renders)
  gen2/items/<key>.json  one file per image to generate (key = apartment-room, e.g. m14-004), with prompt and attempts
  gen2/img, gen2/prev    downloaded results and 1600 px previews

  gen.py plan [APT ...]            build the items from the briefs (all, or only the named apartments); prints {apartment: [keys]}
  gen.py request <key>             print the generate_image_batch request for the item's current attempt
  gen.py fetch <key> <job> <url>   download a finished job as the current attempt
  gen.py revise <key> <fix text>   start the next attempt with corrections appended to the prompt
  gen.py revise-file <key> <path>  the same, reading the correction text from a file
  gen.py verdict <key> pass|fail [attempt]   record the review result (of the current attempt unless one is named)
  gen.py status                    one line per item
  gen.py install                   copy every passed image into public/dw22/rooms and write src/tours.json
"""
import json, os, subprocess, sys
from pathlib import Path
from PIL import Image

HERE = Path(__file__).parent
ROOT = HERE.parents[1]
WORK = Path(os.environ.get("DW22_WORK", "/tmp/dw22-work"))
BRIEFS, G = WORK / "brief/out", WORK / "gen2"
EXISTING = {"M11"}  # apartments whose images were made earlier and are already in public/dw22/rooms

INTERIOR_HEAD = (
    "Photorealistic architectural interior visualization, wide landscape 16:9, eye-level view from a camera 1.5 m above the floor, "
    "wide-angle lens (about 18 mm), straight verticals. Reference image 1 is the floor plan of this apartment: use it for the room's "
    "proportions and furniture positions. Reference image 2 is a finished room of the same building: match only its materials, colours, "
    "light and render style, not its layout or furniture arrangement."
)
OUTDOOR_HEAD = (
    "Photorealistic architectural visualization, wide landscape 16:9, eye-level view from a camera 1.5 m above the floor, straight verticals. "
    "Reference image 1 is the floor plan of this apartment: use it for the shape and size of the outdoor space. The other reference images show "
    "the same building from outside: match its facade (white render above a dark grey brick ground floor), its tall light-wood framed windows "
    "and glazed doors, its dark grey steel balconies with vertical bar railings, and its green surroundings."
)
BASE = ("new-build Polish apartment, contemporary Scandinavian, white walls, light natural oak plank floor, white flush interior doors with "
        "black handles, tall light-wood framed windows, warm wood accents, soft grey and beige textiles, a few green plants")
END = "calm and realistic, like a developer's sales render. Realistic compact room size. No people, no text, no watermark, no labels."
STYLE = {
    "hall": f"Style: {BASE}, built-in white wardrobes with oak details, recessed ceiling spotlights. Soft even light, {END}",
    "living": f"Style: {BASE}. Bright natural daylight, soft shadows, {END}",
    "kitchen": f"Style: {BASE}, matte white handleless kitchen fronts, light oak worktop and splashback with warm under-cabinet light. "
               f"Bright natural daylight, soft shadows, {END}",
    "bedroom": f"Style: {BASE}, linen bedding in off-white and sage green. Bright natural daylight, soft shadows, {END}",
    "bathroom": "Style: new-build Polish apartment, contemporary Scandinavian bathroom: large-format light beige stone-look porcelain tiles on "
                "floor and walls, one accent wall in warm light-oak panelling, white sanitary ware, matte black taps, a round backlit mirror, "
                "white ceiling with small recessed spotlights, soft warm artificial light, white and beige towels. This room is only a bathroom: "
                f"no kitchen units, no dining table, no sofa, no bed. {END[0].upper() + END[1:]}",
    "wardrobe": "Style: new-build Polish apartment, contemporary Scandinavian walk-in wardrobe: white and light-oak shelving, drawers and hanging "
                "rails with neatly arranged clothes and boxes, light natural oak plank floor, white walls, recessed ceiling spotlights, soft warm "
                f"artificial light. This room is only a wardrobe: no bed, no sofa, no kitchen, no bathroom fittings. {END[0].upper() + END[1:]}",
    "balcony": "Style: light grey porcelain tile floor, dark grey steel railing with thin vertical bars, simple outdoor furniture, potted lavender "
               "and a small olive tree. Physically correct, simple geometry. Sunny late-morning light, blue sky with a few soft clouds, soft "
               "shadows, calm and realistic, like a developer's sales render. No people, no text, no watermark, no labels.",
    "terrace": "Style: ground-level terrace paved with light grey concrete slabs, low planting and hedges around it, simple outdoor furniture, "
               "lawn and a dark grey slatted fence beyond. Physically correct, simple geometry. Sunny late-morning light, blue sky with a few "
               "soft clouds, soft shadows, calm and realistic, like a developer's sales render. No people, no text, no watermark, no labels.",
    "garden": "Style: a neat private lawn at ground level bordered by low planting, hedges and a dark grey slatted fence. Physically correct, "
              "simple geometry. Sunny late-morning light, blue sky with a few soft clouds, soft shadows, calm and realistic, like a developer's "
              "sales render. No people, no text, no watermark, no labels.",
}
STYLE["toilet"] = STYLE["bathroom"].replace("This room is only a bathroom", "This room is only a small separate toilet")
STYLE_REF = {"hall": "m11-001-hall", "living": "m11-004-living", "kitchen": "m11-003-kitchen", "bedroom": "m11-006-bedroom-double",
             "bathroom": "m11-002-bathroom", "toilet": "m11-002-bathroom", "wardrobe": "m11-001-hall"}
OUTDOOR = {"balcony": ["m11-007-balcony", "exterior-Z07"], "terrace": ["exterior-Z07", "exterior-Z13"], "garden": ["exterior-Z13", "exterior-Z07"]}


def key_of(apt, n):
    return f"{apt.lower()}-{n}"


def item_path(key):
    return G / "items" / f"{key}.json"


def load(key):
    return json.loads(item_path(key).read_text())


def save(it):
    item_path(it["key"]).write_text(json.dumps(it, ensure_ascii=False, indent=1))


def briefs():
    return {p.stem: json.loads(p.read_text()) for p in sorted(BRIEFS.glob("M*.json"), key=lambda p: int(p.stem[1:]))}


def compose(it):
    t = it["room_type"]
    head = OUTDOOR_HEAD if t in OUTDOOR else INTERIOR_HEAD
    fixes = "".join(f"\n\nCorrection after review: {f}" for f in it["fixes"])
    return f"{head}\n\nView: {it['view_text']}\n\n{STYLE[t]}{fixes}"


def plan(only=()):
    media = json.loads((WORK / "brief/media.json").read_text())
    flats = {f["id"]: f for f in json.loads((HERE / "src/flats.json").read_text())}
    for d in ("items", "img", "prev"):
        (G / d).mkdir(parents=True, exist_ok=True)
    bs, groups = briefs(), {}
    for apt, b in bs.items():
        if apt in EXISTING or (only and apt not in only):
            continue
        for v in b["views"]:
            if v["image"] != "own":
                continue
            key, t = key_of(apt, v["n"]), v["room_type"]
            refs = [apt] + (OUTDOOR[t] if t in OUTDOOR else [STYLE_REF[t]])
            sharers = [a for a, o in bs.items() for w in o["views"] if w["image"] == "shared" and w["share_from"] == apt and w["n"] == v["n"]]
            it = {"key": key, "apt": apt, "n": v["n"], "room_type": t, "floor": flats[apt]["floor"], "view_text": v["view_text"],
                  "looking_at": v["looking_at"], "cam": v["cam"], "dir": v["dir"], "refs": refs, "media": [media[r]["media_id"] for r in refs],
                  "shared_by": sharers, "shared_by_ground_floor": any(flats[a]["floor"] == 0 for a in sharers) and flats[apt]["floor"] > 0,
                  "plan": str(WORK / f"brief/plans/{apt}.png"), "overlay": str(WORK / f"brief/out/{apt}-views.png"),
                  "attempt": 1, "fixes": [], "attempts": {}, "final": None}
            if item_path(key).exists():  # keep earlier attempts when re-planning
                old = load(key)
                it.update({k: old[k] for k in ("attempt", "fixes", "attempts", "final")})
            it["prompt"] = compose(it)
            save(it)
            groups.setdefault(apt, []).append(key)
    print(json.dumps(groups))


def request(key):
    it = load(key)
    print(json.dumps({"index": 0, "params": {"model": "gpt_image_2_6", "aspect_ratio": "16:9", "quality": "high", "resolution": "2k",
                                             "use_unlim": False, "medias": [{"role": "image_references", "value": m} for m in it["media"]],
                                             "prompt": it["prompt"]}}, ensure_ascii=False))


def fetch(key, job, url):
    it = load(key)
    a = str(it["attempt"])
    png, jpg = G / "img" / f"{key}-a{a}.png", G / "prev" / f"{key}-a{a}.jpg"
    subprocess.run(["curl", "-sS", "-f", "-m", "180", "-o", str(png), url], check=True)
    im = Image.open(png).convert("RGB")
    im.thumbnail((1600, 1600))
    im.save(jpg, quality=88)
    it["attempts"][a] = {"job": job, "image": str(png), "preview": str(jpg), "verdict": None}
    save(it)
    print(json.dumps({"key": key, "attempt": int(a), "preview": str(jpg)}))


def revise(key, fix):
    it = load(key)
    it["attempt"] += 1
    it["fixes"].append(" ".join(fix.split()))
    it["prompt"] = compose(it)
    save(it)
    print(json.dumps({"key": key, "attempt": it["attempt"]}))


def verdict(key, v, attempt=None):
    it = load(key)
    a = str(attempt or it["attempt"])
    it["attempts"][a]["verdict"] = v
    it["final"] = a if v == "pass" else it["final"]
    save(it)


def status():
    for p in sorted((G / "items").glob("*.json")):
        it = json.loads(p.read_text())
        print(it["key"], it["room_type"], "attempts:", {a: v["verdict"] for a, v in it["attempts"].items()}, "final:", it["final"])


def install():
    rooms = ROOT / "public/dw22/rooms"
    done = set()
    for p in sorted((G / "items").glob("*.json")):
        it = json.loads(p.read_text())
        if not it["final"]:
            continue
        im = Image.open(it["attempts"][it["final"]]["image"]).convert("RGB")
        im = im.resize((2048, round(2048 * im.height / im.width)), Image.LANCZOS)
        im.save(rooms / f"{it['key']}.webp", quality=80, method=6)
        done.add(it["key"])
    done |= {p.stem for p in rooms.glob("*.webp")}
    tours = {}
    for apt, b in briefs().items():
        views = {}
        for v in b["views"]:
            img = key_of(apt if v["image"] == "own" else v["share_from"], v["n"])
            views[v["n"]] = {"img": img, "cam": v["cam"], "dir": v["dir"]}
        tours[apt] = {"order": b["order"], "views": views}
    (HERE / "src/tours.json").write_text(json.dumps(tours, ensure_ascii=False, indent=1) + "\n")
    missing = sorted({v["img"] for t in tours.values() for v in t["views"].values()} - done)
    print(f"installed {len(done)} room images; tours for {len(tours)} apartments; images still missing: {missing or 'none'}")


if __name__ == "__main__":
    cmd, a = sys.argv[1], sys.argv[2:]
    {"plan": lambda: plan(a), "request": lambda: request(a[0]), "fetch": lambda: fetch(*a[:3]), "revise": lambda: revise(a[0], " ".join(a[1:])),
     "revise-file": lambda: revise(a[0], Path(a[1]).read_text()),
     "verdict": lambda: verdict(*a[:3]), "status": status, "install": install}[cmd]()
