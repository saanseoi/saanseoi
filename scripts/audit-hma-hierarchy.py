"""Measure HMA/district ancestry candidates without changing source or canonical data.

Requires Shapely. Inputs are native CSDI GML ZIPs in EPSG:2326; output is local
investigation evidence, not an approved hierarchy fixture or publication receipt.
"""

import argparse
import hashlib
import json
from pathlib import Path
import xml.etree.ElementTree as ET
import zipfile

import shapely
from shapely.geometry import MultiPolygon, Polygon
from shapely.ops import unary_union

HIERARCHY_CUTOFF = 0.05

GML = '{http://www.opengis.net/gml/3.2}'
AREA_DISTRICTS = {
    'Hong Kong Island': 'ABCD',
    'Kowloon': 'EFGHJ',
    'New Territories': 'KLMNPQRST',
}


def sha256(data):
    return 'sha256:' + hashlib.sha256(data).hexdigest()


def read_layer(path, member, code_field, expected_count):
    archive = Path(path).read_bytes()
    with zipfile.ZipFile(path) as source:
        data = source.read(member)
    root = ET.fromstring(data)
    crs = {node.attrib['srsName'] for node in root.iter() if 'srsName' in node.attrib}
    if crs != {'urn:ogc:def:crs:EPSG::2326'}:
        raise ValueError(f'Unexpected CRS in {member}: {crs}')

    def ring(node):
        positions = node.find('.//' + GML + 'posList')
        if positions is None or positions.attrib.get('srsDimension', '2') != '2':
            raise ValueError('Expected a two-dimensional GML posList')
        values = list(map(float, positions.text.split()))
        if len(values) % 2:
            raise ValueError('Odd coordinate count')
        return list(zip(values[::2], values[1::2]))

    records = []
    for node in root:
        if node.tag.split('}')[-1] not in ('member', 'featureMember'):
            continue
        feature = node[0]
        properties = {p.tag.split('}')[-1]: p.text for p in feature if not len(p)}
        polygons = [
            Polygon(ring(p.find(GML + 'exterior')),
                    [ring(hole) for hole in p.findall(GML + 'interior')])
            for p in feature.findall('.//' + GML + 'Polygon')
        ]
        if not polygons:
            raise ValueError(f'Missing polygon: {properties}')
        original = MultiPolygon(polygons)
        geometry = original if original.is_valid else original.buffer(0)
        if geometry.is_empty or not geometry.is_valid or geometry.area <= 0:
            raise ValueError(f'Unusable analysis geometry: {properties}')
        records.append({
            'properties': properties,
            'geometry': geometry,
            'sourceGeometryHash': sha256(original.wkb),
            'analysisGeometryRepaired': not original.is_valid,
            'analysisAreaChangeM2': geometry.area - original.area,
        })
    if len(records) != expected_count or len({r['properties'][code_field] for r in records}) != expected_count:
        raise ValueError(f'Expected {expected_count} unique records in {member}')
    return records, {
        'path': str(Path(path).resolve()), 'archiveSha256': sha256(archive),
        'member': member, 'memberSha256': sha256(data),
        'properties': sorted(set().union(*(r['properties'] for r in records))),
        'count': len(records),
    }


def suggest_hierarchies(measurement):
    """Suggest full ancestor paths; exclude uncovered area only from selection.

    Paths contain labels, not publishable canonical references. Geometry coverage
    remains an independent assertion; the cutoff never implies full containment.
    """
    covered = 1 - measurement['uncoveredFraction']
    paths = []
    decisions = []
    for match in measurement['districts']:
        fraction = match['fractionOfHma'] / covered if covered > 0 else 0
        selected = covered > 0 and fraction >= HIERARCHY_CUTOFF
        decisions.append({
            'districtCode': match['districtCode'],
            'fractionOfCoveredHma': fraction,
            'selected': selected,
            'reason': 'meets-cutoff' if selected else 'below-cutoff',
            'fullContainment': match['fullContainment'],
        })
        if selected:
            paths.append(match['candidatePath'])
    return {
        'suggestedHierarchies': {'full': paths},
        'hierarchyDecisions': decisions,
    }


def measure(geometry, districts, district_union):
    matches = []
    for district in districts:
        parent = district['geometry']
        overlap = geometry.intersection(parent).area
        if overlap <= 0:  # A shared line or point is not ancestry evidence.
            continue
        properties = district['properties']
        code = properties['dc_class']
        area = next(area for area, codes in AREA_DISTRICTS.items() if code in codes)
        matches.append({
            'districtCode': code, 'districtName': properties['dc_eng'],
            'candidatePath': ['Hong Kong SAR', area, properties['dc_eng']],
            'intersectionAreaM2': overlap, 'fractionOfHma': overlap / geometry.area,
            'fullContainment': parent.covers(geometry),
            'districtGeometryHash': district['sourceGeometryHash'],
            'analysisGeometryRepaired': district['analysisGeometryRepaired'],
        })
    matches.sort(key=lambda match: (-match['fractionOfHma'], match['districtCode']))
    uncovered = geometry.difference(district_union).area
    result = {
        'districts': matches, 'uncoveredAreaM2': uncovered,
        'uncoveredFraction': uncovered / geometry.area,
        'classification': ('unmatched' if not matches else
                           'fully-contained' if any(m['fullContainment'] for m in matches) else
                           'multiple-district-intersections' if len(matches) > 1 else
                           'single-district-with-remainder'),
    }

    return {**result, **suggest_hierarchies(result)}


def audit(hma_archive, district_archive):
    hmas, hma_input = read_layer(hma_archive, 'HMA_21C.gml', 'hma', 173)
    districts, district_input = read_layer(district_archive, 'DC_21C_SDU.gml', 'dc_class', 18)
    district_union = unary_union([d['geometry'] for d in districts])
    rows = []
    for hma in sorted(hmas, key=lambda h: h['properties']['hma']):
        geometry = hma['geometry']
        rows.append({
            'code': hma['properties']['hma'], 'name': hma['properties']['hma_eng'],
            'sourceGeometryHash': hma['sourceGeometryHash'],
            'analysisGeometryRepaired': hma['analysisGeometryRepaired'],
            'areaM2': geometry.area, **measure(geometry, districts, district_union),
        })
    return {
        'schemaVersion': 1, 'kind': 'hma-hierarchy-investigation',
        'status': 'candidate-evidence', 'canonicalDataModified': False,
        'method': {
            'basis': 'geometry-inference', 'cohort': '2021',
            'crs': 'EPSG:2326', 'areaUnit': 'square-metres',
            'engine': f'Shapely {shapely.__version__}',
            'intersectionThresholdM2': 0,
            'hierarchyCutoff': HIERARCHY_CUTOFF,
            'hierarchyCutoffInclusive': True,
            'hierarchyDenominator': 'HMA area inside the union of district polygons',
            'hierarchyPathEncoding': 'ancestor labels; canonical IDs must be resolved before publication',
            'fullContainment': 'covers on analysis geometry; never inferred from rounded ratios',
            'invalidGeometry': 'buffer(0) on a temporary analysis copy only',
            'geometryHashEncoding': 'SHA-256 of parsed original MultiPolygon WKB',
            'remainderPolicy': 'retain uncovered area; do not force a district assignment',
            'candidatePath': 'ancestors only; the owning HMA is the final conceptual node',
        },
        'inputs': {'hma': hma_input, 'district': district_input},
        'geometryRepairs': [
            {'districtCode': d['properties']['dc_class'],
             'sourceGeometryHash': d['sourceGeometryHash'],
             'areaChangeM2': d['analysisAreaChangeM2']}
            for d in districts if d['analysisGeometryRepaired']
        ],
        'summary': {
            'hmaCount': len(rows),
            'suggestedSinglePath': sum(len(r['suggestedHierarchies']['full']) == 1 for r in rows),
            'suggestedMultiplePaths': sum(len(r['suggestedHierarchies']['full']) > 1 for r in rows),
            'suggestedNoPath': sum(not r['suggestedHierarchies']['full'] for r in rows),
            'fullyContained': sum(r['classification'] == 'fully-contained' for r in rows),
            'multipleDistrictIntersections': sum(len(r['districts']) > 1 for r in rows),
            'secondDistrictAtLeastOnePercent': sum(
                len(r['districts']) > 1 and r['districts'][1]['fractionOfHma'] >= .01 for r in rows),
            'unmatched': sum(not r['districts'] for r in rows),
            'largestOverlapAtLeast95Percent': sum(
                bool(r['districts']) and r['districts'][0]['fractionOfHma'] >= .95 for r in rows),
        },
        'records': rows,
    }


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--hma-archive', required=True)
    parser.add_argument('--district-archive', required=True)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    result = audit(args.hma_archive, args.district_archive)
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(result['summary'], indent=2))
    print(output)
