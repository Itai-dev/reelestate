"""Build public/dw22/data.js from the source tables in scripts/dw22/src.

  flats.json     apartments as listed on dw22.pl (extract.py)
  plans.json     rooms, areas and label positions read from the apartment PDFs (plans.py)
  overlays.json  the apartment outlines for each of the 36 building frames
  tours.json     per apartment: room order, and for each room its image, camera spot and heading on the plan
"""
import json, re
from pathlib import Path

HERE = Path(__file__).parent
SRC = HERE / "src"
OUT = HERE.parents[1] / "public/dw22"
load = lambda n: json.loads((SRC / n).read_text())

flats, plans, ov, tours = load("flats.json"), load("plans.json"), load("overlays.json"), load("tours.json")
rnd = lambda path: re.sub(r"-?\d+\.\d+", lambda m: str(round(float(m.group(0)))), path)
frames = [{k: " ".join(rnd(p) for p in v) for k, v in ov[f"{i:02d}"].items()} for i in range(1, 37)]

out, missing = [], []
for f in flats:
    p, n = plans[f["id"]], int(f["id"][1:])
    spaces = [{"n": r["n"], "name": r["name"], "area": r["area"], "pt": r["pts"][0] if r["pts"] else None} for r in p["rooms"]]
    a = {"id": f["id"], "floor": f["floor"], "rooms": f["rooms"], "area": f["area"], "outdoor": f["outdoor"], "extra": f["extra"],
         "status": f["status"], "plan": {"w": p["w"], "h": p["h"]}, "spaces": spaces,
         "pdf": f"https://dw22.pl/wp-content/uploads/2026/11/M{n}-KARTA-MIESZKANIA-{n}.pdf"}
    t = tours.get(f["id"])
    if t:
        views = {}
        for k, v in t["views"].items():
            if (OUT / f"rooms/{v['img']}.webp").exists():
                views[k] = {"img": v["img"], "cam": [round(c, 3) for c in v["cam"]], "dir": round(v["dir"])}
            else:
                missing.append(f"{f['id']}/{k} ({v['img']})")
        order = [k for k in t["order"] if k in views]
        if order:
            a["tour"] = {"order": order, "views": views}
    out.append(a)

s = "window.DW22=" + json.dumps({"flats": out, "frames": frames}, ensure_ascii=False, separators=(",", ":")) + ";\n"
(OUT / "data.js").write_text(s)
print(f"data.js: {len(s)} bytes, {sum('tour' in a for a in out)} of {len(out)} apartments with a tour")
if missing:
    print("rooms left out because their image is missing:", ", ".join(missing))
