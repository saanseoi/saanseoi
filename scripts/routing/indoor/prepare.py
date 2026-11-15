#!/usr/bin/env python3
"""Prepare station graphs and an optional territory-wide LandsD pedestrian graph.

Run through dev-check. Requires pyogrio, shapely and pyproj. Input archives and indoor
map baselines are immutable; output must be a new directory. No publication occurs.
"""
import argparse
import collections
import hashlib
import json
import math
from pathlib import Path
import xml.sax.saxutils as xml
import zipfile

import pyogrio
from pyproj import Transformer
from shapely.geometry import Point, LineString, shape

from graph import edge_properties, length, node_key, osm_tags, seconds, stable_id


def sha(path):
    with Path(path).open('rb') as f:
        return hashlib.file_digest(f, 'sha256').hexdigest()


def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, separators=(',', ':'), ensure_ascii=False, allow_nan=False) + '\n')


def gdb(path):
    with zipfile.ZipFile(path) as z:
        root = next(n for n in z.namelist() if n.endswith('.gdb/'))
    return '/vsizip/' + str(path.resolve()) + '/' + root.rstrip('/')


def scalar(value):
    if value is None or (isinstance(value, float) and math.isnan(value)):
        return None
    return value.item() if hasattr(value, 'item') else value


def prepare(indoor, outdoor, baselines, out):
    if out.exists():
        raise ValueError('Use a fresh output directory')
    out.mkdir(parents=True)
    transform = Transformer.from_crs(2326, 4326, always_xy=True)
    indoor_db, outdoor_db = gdb(indoor), gdb(outdoor)
    # Source floor groups may contain several display polygons, distinguished by a final suffix.
    relation = pyogrio.read_dataframe(indoor_db, layer='PedRouteRelFloorPoly')
    terminal_rows = pyogrio.read_dataframe(indoor_db, layer='PedRouteRelTerminalPoly')
    terminals = {int(r.TerminalID): r.EnglishName for r in terminal_rows.itertuples() if r.TerminalType == 'MST'}
    floor_groups = collections.defaultdict(set)
    for r in relation.itertuples():
        floor_groups[int(r.FloorID)].add(r.FloorPolyID.strip())
    stations, source_levels = {}, collections.defaultdict(list)
    for directory in sorted(baselines.iterdir()):
        if not (directory / 'manifest.json').exists():
            continue
        venue = json.loads((directory / 'venue_polygon.json').read_text())['features'][0]
        name = venue['properties']['venue_name_en']
        ids = [tid for tid, label in terminals.items() if label.casefold() == name.casefold() or (directory.name == 'TWW' and tid == 1511000461)]
        if len(ids) != 1:
            continue
        data = {layer: json.loads((directory / (layer + '.json')).read_text())['features']
                for layer in ('level_polygon', 'unit_polygon', 'amenity_point', 'occupant_point')}
        stations[ids[0]] = dict(code=directory.name, name=name, venueId=venue['properties']['venue_id'], data=data, nodes={}, edges=[], places=[],
                                unmatchedPlaces=[], baselineSha256=sha(directory / 'manifest.json'))
        for level in data['level_polygon']:
            a = level['properties']
            for floor_id, groups in floor_groups.items():
                if any(a['level_floorpolyid'].startswith(prefix) for prefix in groups):
                    source_levels[floor_id].append((level, shape(level['geometry'])))
    nodes, edges, identities = {}, {}, {}
    skipped = collections.Counter()
    sources = [('outdoor', outdoor_db), ('indoor', indoor_db)]
    for source_name, database in sources:
        frame = pyogrio.read_dataframe(database, layer='PedestrianRoute')
        print(source_name, len(frame), flush=True)
        for raw in frame.to_dict('records'):
            geometry = raw.pop('geometry')
            row = {key: scalar(value) for key, value in raw.items()}
            properties = edge_properties(row)
            if properties is None:
                skipped[source_name] += 1
                continue
            route_id = int(row['PedestrianRouteID'])
            station = stations.get(row.get('TerminalID')) if source_name == 'indoor' else None
            for part, line in enumerate(geometry.geoms):
                coords = list(line.coords)
                if properties['reverse']:
                    coords.reverse()
                if len(coords) < 2:
                    continue
                ids = []
                for point in coords:
                    key = node_key(point)
                    nid = stable_id('landsd:' + key)
                    if nid in identities and identities[nid] != key:
                        raise ValueError('Node hash collision')
                    identities[nid] = key
                    if nid not in nodes:
                        lon, lat = transform.transform(point[0], point[1])
                        nodes[nid] = dict(id=str(nid), point=[lon, lat], z=point[2], floorIds=[], levels=[])
                    node = nodes[nid]
                    for feature, polygon in source_levels.get(row.get('FloorID'), []):
                        p = feature['properties']
                        if abs(float(p['level_z_value']) - point[2]) <= .25 and polygon.covers(Point(node['point'])):
                            if p['level_id'] not in node['floorIds']:
                                node['floorIds'].append(p['level_id'])
                            ordinal = int(p['level_ordinal'])
                            if ordinal not in node['levels']:
                                node['levels'].append(ordinal)
                    ids.append(nid)
                    if station is not None:
                        station['nodes'][nid] = node
                eid = f'{route_id}:{part}'
                edge = dict(id=eid, sourceId=route_id, fromNode=str(ids[0]), toNode=str(ids[-1]),
                            nodeIds=[str(i) for i in ids], length=length(coords), **properties,
                            seconds=seconds(length(coords), properties['kind']),
                            floorGroup=row.get('FloorID'), terminalId=row.get('TerminalID'))
                edge.pop('reverse')
                edge['levels'] = sorted({v for i in ids for v in nodes[i]['levels']})
                # Identical source IDs in the two archives must agree, never silently double the network.
                if eid in edges and edges[eid]['nodeIds'] != edge['nodeIds']:
                    raise ValueError('Conflicting source segment ' + eid)
                edges[eid] = edge
                if station is not None:
                    station['edges'].append(edge)
    outdoor_nodes = {n for e in edges.values() if not e['indoor'] for n in e['nodeIds']}
    reports = []
    for tid, station in stations.items():
        data = station.pop('data')
        units = {f['properties']['unit_id']: f for f in data['unit_polygon']}
        # Attach places only to source network vertices in their actual room and on their floor.
        for feature in data['amenity_point'] + data['occupant_point']:
            p = feature['properties']
            source_id = p.get('amenity_id') or p.get('occupant_id')
            unit = units.get(p.get('unit_id'))
            level_id = p.get('level_id')
            candidates = []
            if unit:
                polygon = shape(unit['geometry'])
                candidates = [n['id'] for n in station['nodes'].values()
                              if level_id in n['floorIds'] and polygon.covers(Point(n['point']))]
            if candidates and 'amenity_id' in p:
                origin = shape(feature['geometry'])
                # Entry markers may share a large concourse unit: never start at an arbitrary remote vertex.
                visible = [n for n in station['nodes'].values() if n['id'] in candidates
                           and polygon.covers(LineString([origin.coords[0][:2], n['point']]))]
                if visible:
                    nearest = min(visible, key=lambda n: origin.distance(Point(n['point'])))
                    metres = origin.distance(Point(nearest['point'])) * 111320
                    candidates = [nearest['id']] if metres <= 5 else []
                else:
                    candidates = []
            if candidates:
                station['places'].append(dict(id=source_id, unitId=p.get('unit_id'), levelId=level_id, nodeIds=candidates,
                    name=p.get('amenity_name_en') or p.get('occupant_name_en'), kind=p.get('amenity_category') or 'shop'))
            else:
                station['unmatchedPlaces'].append(dict(id=source_id, reason='No source vertex in the source unit on this floor'))
        station['portals'] = [n['id'] for n in station['nodes'].values() if n['id'] in outdoor_nodes]
        station['nodes'] = list(station['nodes'].values())
        station['schemaVersion'] = 1
        station['terminalId'] = tid
        station['source'] = 'Lands Department 3D Indoor Network'
        write(out / 'stations' / (station['code'] + '.json'), station)
        reports.append(dict(code=station['code'], name=station['name'], nodes=len(station['nodes']),
                            edges=len(station['edges']), places=len(station['places']),
                            unmatchedPlaces=len(station['unmatchedPlaces']), portals=len(station['portals'])))
    # Nodes at the same XY on separate elevations remain distinct OSM identities.
    for variant in ('all', 'unpaid'):
        selected = [(edge, osm_tags(edge, variant == 'unpaid')) for edge in edges.values()]
        selected = [(e, tags) for e, tags in selected if tags]
        used = {int(n) for e, _ in selected for n in e['nodeIds']}
        osm_ids = {nid: i + 1 for i, nid in enumerate(sorted(used))}
        with (out / (variant + '.osm')).open('w') as f:
            f.write('<?xml version="1.0" encoding="UTF-8"?><osm version="0.6" generator="SaanSeoi-LandsD">\n')
            for nid in sorted(used):
                n = nodes[nid]
                f.write(f'<node id="{osm_ids[nid]}" version="1" lat="{n["point"][1]:.9f}" lon="{n["point"][0]:.9f}"><tag k="ele" v="{n["z"]:.3f}"/></node>\n')
            for wid, (edge, tags) in enumerate(sorted(selected, key=lambda pair: pair[0]['id']), 1):
                f.write(f'<way id="{wid}" version="1">')
                for nid in edge['nodeIds']:
                    f.write(f'<nd ref="{osm_ids[int(nid)]}"/>')
                for key, value in tags.items():
                    f.write(f'<tag k={xml.quoteattr(key)} v={xml.quoteattr(value)}/>')
                f.write('</way>\n')
            f.write('</osm>\n')
    manifest = dict(schemaVersion=1, edition='indoor', region='hk', sourceHashes={
        'indoor': sha(indoor), 'outdoor': sha(outdoor)}, nodes=len(nodes), edges=len(edges),
        excluded=dict(skipped), stations=reports, unmappedTerminalIds=sorted(set(terminals) - set(stations)),
        limitations=['Source connectivity, not field-verified access', 'Unresolved time restrictions excluded',
                     'Walking times are estimates', 'No OSM road or vehicle routing in this optional edition'])
    write(out / 'manifest.json', manifest)
    print(f'Prepared {len(reports)} stations, {len(nodes)} nodes and {len(edges)} edges', flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--indoor', type=Path, required=True)
    parser.add_argument('--outdoor', type=Path, required=True)
    parser.add_argument('--baselines', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    prepare(args.indoor, args.outdoor, args.baselines, args.out)
