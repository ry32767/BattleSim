"""Build M1.1 scale-adjusted city maps; retain the M1.0 JSON for old matches."""
from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[1]
DIRECTIONS = ((1, 0), (1, -1), (0, -1), (-1, 0), (-1, 1), (0, 1))


def cell_id(q, r):
    return f"c:{q}:{r}"


def axial(u, r):
    return u - r // 2, r


def rotate(q, r):
    return -q, -1 - r


def layout_v1_0():
    buildings = []

    def pair(name, points, height, roof="flat"):
        points = [axial(u, r) for u, r in points]
        for side, cells in (("N", points), ("S", [rotate(*p) for p in points])):
            buildings.append({"id": f"b:{name}:{side}", "name": f"{side} {name}",
                              "points": cells, "height": height, "roofKind": roof})

    def rect(name, u, r, w, h, z, roof="flat"):
        pair(name, [(x, y) for y in range(r, r+h) for x in range(u, u+w)], z, roof)

    rect("タワー", -12, -10, 2, 2, 6)
    rect("タワー足場4", -12, -11, 2, 1, 4)
    rect("タワー足場2", -13, -11, 1, 2, 2, "gable")
    pair("L字", [(u, r) for r in range(-11, -7) for u in range(5, 9)
                 if u in (5, 6) or r in (-9, -8)], 4)
    rect("L字足場", 4, -11, 1, 3, 2, "gable")
    rect("工場", -10, -5, 6, 3, 3, "sawtooth")
    rect("工場倉庫", -11, -4, 1, 2, 1, "gable")
    for i, z in enumerate((2, 1, 2, 1, 2)):
        rect(f"住宅列{i+1}", 4 + i*2, -5, 2, 2, z, "gable" if z == 2 else "flat")
    rect("北西民家", -8, -12, 3, 2, 2, "gable")
    rect("北西店舗", -5, -9, 2, 2, 2)
    rect("北東民家", 10, -12, 3, 2, 2, "gable")
    rect("東ビル", 11, -9, 2, 2, 4)
    rect("東ビル足場", 13, -9, 1, 2, 2)
    rect("西ビル", -15, -6, 2, 2, 4)
    rect("西ビル足場", -15, -7, 2, 1, 2, "gable")
    return buildings


def road_class(u, r):
    if -2 <= u <= 1 or -2 <= r <= 1:
        return "avenue"
    # Two-cell-wide residential streets, in corresponding north/south locations.
    if (-10 <= u <= 13 and -7 <= r <= -6) or (-14 <= u <= 9 and 5 <= r <= 6):
        return "street"
    return "alley"


def layout():
    buildings = layout_v1_0()
    occupied = {p for b in buildings for p in b["points"]}
    for b in buildings:
        b["category"] = ("factory" if "工場" in b["name"] else "tower" if b["height"] == 6
                         else "residential" if b["height"] <= 2 else "midrise")
    number = 0
    for r in (-14, -11, -8, -5):
        for u in (-15, -12, -9, -6, 3, 6, 9, 12):
            points = [axial(x, y) for y in range(r, r+2) for x in range(u, u+2)]
            mirrored = [rotate(*p) for p in points]
            if any(p in occupied for p in points+mirrored):
                continue
            if any(road_class(q+rr//2, rr) != "alley" for q, rr in points+mirrored):
                continue
            number += 1
            for side, cells in (("N", points), ("S", mirrored)):
                buildings.append({"id": f"b:住宅街{number}:{side}", "name": f"{side} 住宅街{number}",
                                  "points": cells, "height": 2, "roofKind": "gable", "category": "residential"})
                occupied.update(cells)
    return buildings


def build(stage, size, count):
    half = size // 2
    buildings = layout()
    occupants = {}
    for b in buildings:
        for p in b["points"]:
            assert p not in occupants, (b["id"], p)
            occupants[p] = b
    cells = []
    for r in range(-half, half):
        for u in range(-half, half):
            q, _ = axial(u, r)
            cid = cell_id(q, r)
            b = occupants.get((q, r))
            height = b["height"] if b else 0
            kind = "roof" if b else "ground"
            road = road_class(u, r)
            cells.append({"id": cid, "q": q, "r": r,
                          "terrain": "building" if b else "road" if road != "alley" else "alley",
                          "roadClass": None if b else road,
                          "groundHeight": 0, "buildingId": b["id"] if b else None,
                          "roofHeight": height if b else None,
                          "surfaces": [{"id": f"{cid}:{kind}", "cellId": cid,
                                        "kind": kind, "z": height, "walkable": True}],
                          "occluder": {"kind": "solidColumn", "minZ": 0, "maxZ": height} if b else None})
    ids = {c["id"] for c in cells}
    public_buildings = [{"id": b["id"], "name": b["name"],
                         "cellIds": sorted(cell_id(*p) for p in b["points"]),
                         "roofKind": b["roofKind"], "category": b["category"],
                         "evidenceStatus": "original", "sourceIds": []}
                        for b in buildings]
    assert all(cid in ids for b in public_buildings for cid in b["cellIds"])
    # Choose from inner edge rows, keep opposing slots related by the exact rotation.
    north = []
    for r in (-half+1, -half+2):
        for u in sorted(range(-half+2, half-2), key=lambda x: (abs(2*x+1), x)):
            q, _ = axial(u, r)
            if (q, r) not in occupants:
                north.append((q, r))
    north = north[:count]
    slots = []
    for team, points in (("B", north), ("A", [rotate(*p) for p in north])):
        for i, p in enumerate(points):
            slots.append({"team": team, "index": i, "surfaceId": f"{cell_id(*p)}:ground"})
    landmarks = [{"id": b["id"], "label": b["name"], "cellId": b["cellIds"][0]}
                 for b in public_buildings if b["name"].split(" ", 1)[1] in ("タワー", "L字", "工場")]
    return {"schemaVersion": 1, "id": f"city-{stage}", "version": "M1.1", "stage": stage,
            "dimensions": {"columns": size, "rows": size, "offset": "odd-r", "orientation": "pointy-top"},
            "evidenceStatus": "original", "sourceIds": [], "rationaleSourceIds": ["S3", "S4", "S11", "S18"],
            "renderScale": {"hexRadius": 10, "heightStep": 7, "humanHeight": 4.2,
                            "shear": 0.35, "verticalProjection": 0.65, "absoluteMetersPerCell": None},
            "cells": cells, "buildings": public_buildings, "spawnSlots": slots, "landmarks": landmarks}


def main():
    maps = [build(stage, size, count) for stage, size, count in (("I", 32, 9), ("II", 34, 14), ("III", 36, 24))]
    dest = ROOT / "data" / "maps"
    dest.mkdir(parents=True, exist_ok=True)
    for m in maps:
        path = dest / f"{m['id']}.json"
        if path.exists():
            previous = json.loads(path.read_text(encoding="utf-8"))
            if previous["version"] == "M1.0":
                archive = dest / "M1.0" / path.name
                archive.parent.mkdir(exist_ok=True)
                if not archive.exists():
                    archive.write_bytes(path.read_bytes())
        path.write_text(json.dumps(m, ensure_ascii=False, indent=2)+"\n", encoding="utf-8")
    template = (ROOT / "tools" / "map-preview.template.html").read_text(encoding="utf-8")
    payload = json.dumps(maps, ensure_ascii=False, separators=(",", ":")).replace("<", "\\u003c")
    (ROOT / "map-preview.html").write_text(template.replace("__MAP_DATA__", payload), encoding="utf-8")
    first = maps[0]
    print(f"Built M1.1: {len(first['buildings'])} buildings, "
          f"{sum(c['buildingId'] is not None for c in first['cells'])}/1024 occupied cells; offline map-preview.html")


if __name__ == "__main__":
    main()
