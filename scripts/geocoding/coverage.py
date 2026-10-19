#!/usr/bin/env python3
"""Read-only address/OSM footprint coverage audit for a fixed coordinate sample.

Input footprints: osmium tags-filter source.osm.pbf w/building r/building,
then osmium export --add-unique-id=type_id -f geojsonseq. Requires Shapely.
Counts describe source geometries, not deduplicated physical buildings.
"""

import argparse
import hashlib
import json
import sqlite3
from pathlib import Path
from shapely.geometry import Point, shape
from shapely.strtree import STRtree


def audit(address_db, footprints, fixture):
    geometries, properties = [], []
    counts = dict(footprints=0, named=0, streetAddress=0, invalid=0)
    for line in footprints.open():
        feature = json.loads(line.lstrip("\x1e"))
        tags = feature["properties"]
        if tags.get("building", "no") == "no" or feature["geometry"]["type"] not in (
            "Polygon",
            "MultiPolygon",
        ):
            continue
        polygon = shape(feature["geometry"])
        if not polygon.is_valid:
            counts["invalid"] += 1
            continue
        counts["footprints"] += 1
        counts["named"] += bool(tags.get("name") or tags.get("name:en"))
        counts["streetAddress"] += bool(
            tags.get("addr:housenumber")
            and (tags.get("addr:street") or tags.get("addr:street:en"))
        )
        geometries.append(polygon)
        properties.append(
            {
                "sourceId": feature.get("id"),
                **{
                    k: v
                    for k, v in tags.items()
                    if k.startswith(("name", "addr:", "@"))
                },
            }
        )
    tree = STRtree(geometries)
    db = sqlite3.connect(f"file:{address_db.resolve()}?mode=ro", uri=True)
    addresses = []
    for (
        address_id,
        raw,
        label,
    ) in db.execute("""select a.id, a.geometry, n.formattedAddress
        from address2d a left join address2dI18n n on a.scopeId=n.scopeId and a.id=n.addressId and n.locale='en'
        where a.scopeId in (select scopeId from addressPublicationState where status='current')"""):
        geometry = json.loads(raw) if raw else None
        if geometry and geometry.get("type") == "Point" and geometry.get("coordinates"):
            addresses.append((address_id, Point(geometry["coordinates"]), label))
    address_tree = STRtree([a[1] for a in addresses])
    covered = sum(
        bool(len(tree.query(a[1], predicate="covered_by"))) for a in addresses
    )
    results = []
    for place in json.loads(fixture.read_text())["places"]:
        point = Point(place["coordinates"])
        matches = []
        for index in tree.query(point, predicate="covered_by"):
            polygon = geometries[index]
            members = [
                addresses[i] for i in address_tree.query(polygon, predicate="covers")
            ]
            matches.append(
                dict(
                    properties=properties[index],
                    addresses=[dict(id=a[0], label=a[2]) for a in members],
                )
            )
        results.append(
            dict(id=place["id"], reference=place["addressCore"], footprints=matches)
        )
    return dict(
        method="source-footprint-containment-v1",
        footprintSha256=hashlib.file_digest(
            footprints.open("rb"), "sha256"
        ).hexdigest(),
        addressDatabase=str(address_db),
        addressPublications=[
            dict(zip(("scopeId", "snapshotId"), row))
            for row in db.execute(
                "select scopeId,snapshotId from addressPublicationState where status='current'"
            )
        ],
        counts=counts,
        addressPoints=len(addresses),
        addressPointsCovered=covered,
        samplePins=len(results),
        samplePinsCovered=sum(bool(r["footprints"]) for r in results),
        results=results,
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--address-db", type=Path, required=True)
    parser.add_argument("--footprints", type=Path, required=True)
    parser.add_argument("--fixture", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    args.output.write_text(
        json.dumps(
            audit(args.address_db, args.footprints, args.fixture),
            ensure_ascii=False,
            indent=2,
        )
        + "\n"
    )
