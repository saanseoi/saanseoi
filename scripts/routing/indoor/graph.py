"""Source-faithful 3D network primitives shared by preparation and regression tests."""
import hashlib
import math

KINDS = {8: 'escalator', 9: 'travelator', 10: 'lift', 11: 'ramp', 12: 'stairs',
         13: 'stairlift', 16: 'escalator', 17: 'travelator', 18: 'lift',
         19: 'ramp', 20: 'stairs', 21: 'stairlift'}


def node_key(point):
    """Join only source vertices identical to millimetre precision in HK1980/HKPD."""
    if len(point) != 3 or not all(math.isfinite(v) for v in point):
        raise ValueError('Finite XYZ coordinates required')
    return ','.join(f'{v:.3f}' for v in point)


def stable_id(identity):
    """Produce positive OSM-safe IDs deterministically; exporters check collisions."""
    return int(hashlib.sha256(identity.encode()).hexdigest()[:13], 16) + 1


def edge_properties(row):
    """Fail closed on disabled, unknown access/direction and unresolved time restrictions."""
    if row['Enabled'] != 1 or row['Location'] not in (1, 2, 3):
        return None
    if row['Direction'] not in (-1, 0, 1) or row.get('AccessTimeID') is not None:
        return None
    kind = KINDS.get(row['FeatureType'], 'walkway')
    return dict(access='paid' if row['Location'] == 3 else 'unpaid',
                indoor=row['Location'] != 1, kind=kind,
                direction='both' if row['Direction'] == 0 else 'forward',
                reverse=row['Direction'] == -1,
                wheelchair=row.get('WheelchairBarrier') == 2 and kind not in ('stairs', 'escalator', 'stairlift'))


def length(points):
    """Measure original 3D metre geometry without flattening floors."""
    return sum(math.dist(a, b) for a, b in zip(points, points[1:]))


def seconds(metres, kind):
    """Explicit estimates, not measured operational timings; lift wait is per source segment."""
    speed = {'stairs': .65, 'escalator': .5, 'lift': 1.0, 'stairlift': .15, 'ramp': 1.0}.get(kind, 1.3)
    return metres / speed + (20 if kind == 'lift' else 0)


def osm_tags(edge, unpaid=False):
    """Map only enabled source segments; paid exclusion is structural, not a toll preference."""
    if unpaid and edge['access'] == 'paid':
        return None
    kind = edge['kind']
    tags = {'highway': 'steps' if kind in ('stairs', 'escalator') else 'footway',
            'foot': 'yes', 'motor_vehicle': 'no', 'bicycle': 'no',
            'source': 'Lands Department, HKSAR Government',
            'ss:source_id': str(edge['sourceId']), 'ss:access': edge['access'],
            'wheelchair': 'yes' if edge['wheelchair'] else 'no'}
    if edge['indoor']:
        tags['indoor'] = 'yes'
    if edge.get('levels'):
        tags['level'] = ';'.join(str(v) for v in sorted(set(edge['levels'])))
    if kind == 'lift':
        tags['highway'] = 'elevator'
    if kind == 'escalator':
        tags['conveying'] = 'forward' if edge['direction'] == 'forward' else 'yes'
    if kind == 'travelator':
        tags['conveying'] = 'forward' if edge['direction'] == 'forward' else 'yes'
    if edge['direction'] == 'forward':
        tags['oneway:foot'] = 'yes'
    return tags
