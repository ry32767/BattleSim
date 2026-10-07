"""Independent structural/graph validation for maps; not a combat-engine test."""
from pathlib import Path
import json
import heapq
import hashlib

ROOT = Path(__file__).resolve().parents[1]
DIRS = ((1, 0), (1, -1), (0, -1), (-1, 0), (-1, 1), (0, 1))


def move_cost(a, b, grasshopper=False):
    dz = b["surfaces"][0]["z"] - a["surfaces"][0]["z"]
    if dz > (4 if grasshopper else 2):
        return None
    return 1 + (int(dz > 0) if grasshopper else max(0, dz))


def reach(cells, start, grasshopper=False):
    by_pos = {(c["q"], c["r"]): c for c in cells}
    dist = {start: 0}
    queue = [(0, start)]
    while queue:
        value, p = heapq.heappop(queue)
        if dist[p] != value:
            continue
        for dq, dr in DIRS:
            target = p[0]+dq, p[1]+dr
            if target not in by_pos:
                continue
            cost = move_cost(by_pos[p], by_pos[target], grasshopper)
            if cost is not None and value+cost < dist.get(target, float("inf")):
                dist[target] = value+cost
                heapq.heappush(queue, (value+cost, target))
    return dist


def validate(m, size, count):
    assert m["schemaVersion"] == 1 and m["version"] == "M1.1"
    assert m["evidenceStatus"] == "original" and m["sourceIds"] == []
    assert m["dimensions"] == {"columns": size, "rows": size, "offset": "odd-r", "orientation": "pointy-top"}
    scale = m["renderScale"]
    assert scale["absoluteMetersPerCell"] is None
    assert scale["heightStep"] == 7 and scale["humanHeight"] / scale["heightStep"] == 0.6
    assert len(m["buildings"]) == 58
    assert sum(c["buildingId"] is not None for c in m["cells"]) == 262
    assert sum(b["category"] == "residential" for b in m["buildings"]) > len(m["buildings"])/2
    cells = m["cells"]
    by_id = {c["id"]: c for c in cells}
    by_pos = {(c["q"], c["r"]): c for c in cells}
    assert len(cells) == len(by_id) == len(by_pos) == size*size
    surfaces = {}
    buildings = {b["id"]: b for b in m["buildings"]}
    assert len(buildings) == len(m["buildings"])
    for c in cells:
        assert c["id"] == f"c:{c['q']}:{c['r']}"
        assert -size//2 <= c["r"] < size//2
        assert -size//2 <= c["q"]+c["r"]//2 < size//2
        assert len(c["surfaces"]) == 1 and c["groundHeight"] == 0
        s = c["surfaces"][0]
        assert s["id"] not in surfaces and s["cellId"] == c["id"] and s["walkable"]
        surfaces[s["id"]] = c
        assert s["id"] == f"{c['id']}:{s['kind']}"
        u = c["q"] + c["r"]//2
        if -2 <= u <= 1 or -2 <= c["r"] <= 1:
            assert c["buildingId"] is None and c["roadClass"] == "avenue"
        elif (-10 <= u <= 13 and -7 <= c["r"] <= -6) or (-14 <= u <= 9 and 5 <= c["r"] <= 6):
            assert c["buildingId"] is None and c["roadClass"] == "street"
        if c["buildingId"]:
            assert c["roadClass"] is None
            assert c["buildingId"] in buildings and c["id"] in buildings[c["buildingId"]]["cellIds"]
            assert s["kind"] == "roof" and s["z"] == c["roofHeight"] and 1 <= s["z"] <= 6
            assert c["occluder"] == {"kind": "solidColumn", "minZ": 0, "maxZ": s["z"]}
        else:
            assert s["kind"] == "ground" and s["z"] == 0 and c["roofHeight"] is None and c["occluder"] is None
        mirror = by_pos[-c["q"], -1-c["r"]]
        assert c["roadClass"] == mirror["roadClass"]
        assert (c["terrain"], s["z"]) == (mirror["terrain"], mirror["surfaces"][0]["z"])
        if c["buildingId"]:
            b = buildings[c["buildingId"]]
            mb = buildings[mirror["buildingId"]]
            assert b["roofKind"] == mb["roofKind"] and b["name"][2:] == mb["name"][2:]
    for b in buildings.values():
        ids = set(b["cellIds"])
        assert len(ids) == len(b["cellIds"]) and ids == {c["id"] for c in cells if c["buildingId"] == b["id"]}
        pending = [next(iter(ids))]
        seen = set(pending)
        while pending:
            c = by_id[pending.pop()]
            for dq, dr in DIRS:
                cid = f"c:{c['q']+dq}:{c['r']+dr}"
                if cid in ids and cid not in seen:
                    seen.add(cid)
                    pending.append(cid)
        assert seen == ids, (b["id"], "disconnected building")
    slots = m["spawnSlots"]
    assert len(slots) == 2*count and len({s["surfaceId"] for s in slots}) == 2*count
    per_team = {team: sorted([s for s in slots if s["team"] == team], key=lambda s: s["index"]) for team in ("A", "B")}
    for team, team_slots in per_team.items():
        assert [s["index"] for s in team_slots] == list(range(count))
        for s in team_slots:
            c = surfaces[s["surfaceId"]]
            assert c["surfaces"][0]["kind"] == "ground"
        c = surfaces[team_slots[0]["surfaceId"]]
        distances = reach(cells, (c["q"], c["r"]))
        assert len(distances) == len(cells), (m["id"], team, "unreachable surfaces", set(by_pos)-set(distances))
    for a, b in zip(per_team["A"], per_team["B"]):
        ca, cb = surfaces[a["surfaceId"]], surfaces[b["surfaceId"]]
        assert (ca["q"], ca["r"]) == (-cb["q"], -1-cb["r"])
    assert all(l["cellId"] in by_id for l in m["landmarks"])
    print(f"PASS {m['id']}: {len(cells)} surfaces, {len(buildings)} connected buildings, {count} slots/team, symmetry, full normal reachability")


def main():
    archived = {"I":"3a7ee2020f4a818dca9bb5c6b71a3df4c60ed2ce8b1f115c2517a6ee44f2dabe", "II":"7fa01c694d96bbbcfc47e74220118d7bd99056d325d444da4706ce0743c7ffeb", "III":"518c3682885781eeb20a757f2fa212f115ddea48a484cc6493b30e5d3ea3a79d"}
    for stage, digest in archived.items():
        assert hashlib.sha256((ROOT/"data/maps/M1.0"/f"city-{stage}.json").read_bytes()).hexdigest() == digest
    print("PASS: M1.0 archives unchanged; M1.1 relative scale, density and road hierarchy")
    maps = []
    for stage, size, count in (("I", 32, 9), ("II", 34, 14), ("III", 36, 24)):
        path = ROOT / "data" / "maps" / f"city-{stage}.json"
        m = json.loads(path.read_text(encoding="utf-8"))
        validate(m, size, count)
        maps.append(m)
        print("SHA256", path.name, hashlib.sha256(path.read_bytes()).hexdigest())
    for small, big in zip(maps, maps[1:]):
        big_cells = {c["id"]: c for c in big["cells"]}
        assert all(c == big_cells[c["id"]] for c in small["cells"])
        assert small["buildings"] == big["buildings"] and small["landmarks"] == big["landmarks"]
    def sample(z):
        return {"surfaces": [{"z": z}]}
    assert [move_cost(sample(0), sample(z)) for z in (0, 1, 2, 3)] == [1, 2, 3, None]
    assert [move_cost(sample(0), sample(z), True) for z in (0, 1, 4, 5)] == [1, 2, 2, None]
    assert move_cost(sample(6), sample(0)) == 1
    html = (ROOT / "map-preview.html").read_text(encoding="utf-8")
    payload = html.split('<script id="map-data" type="application/json">', 1)[1].split('</script>', 1)[0]
    assert json.loads(payload) == maps
    assert '__MAP_DATA__' not in html
    print("PASS: stage nesting, movement height/AP boundary fixtures, embedded JSON equality")


if __name__ == "__main__":
    main()
