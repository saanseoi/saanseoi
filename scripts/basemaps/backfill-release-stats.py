#!/usr/bin/env python3
"""Verify published basemap inputs and prepare an idempotent META statistics backfill."""
import argparse
import datetime
import gzip
import hashlib
import json
from pathlib import Path
import sqlite3
import struct
import subprocess

ROOT = Path(__file__).resolve().parents[2]
TILES = ROOT / '.local/tiles'
ORIGIN = 'https://tiles.saanseoi.hk'


def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def get_json(path):
    result = subprocess.run(['curl', '--fail', '--silent', '--show-error', '--max-time', '60',
                             '-H', 'Origin: https://viewer.saanseoi.hk', ORIGIN + path],
                            check=True, capture_output=True)
    return json.loads(result.stdout)


def pmtiles_metadata(path):
    with path.open('rb') as stream:
        header = stream.read(127)
        if header[:8] != b'PMTiles\x03':
            raise ValueError('Expected a PMTiles v3 archive')
        offset, length = struct.unpack_from('<QQ', header, 24)
        stream.seek(offset)
        body = stream.read(length)
        if header[97] == 2:
            body = gzip.decompress(body)
        elif header[97] != 1:
            raise ValueError('Unsupported metadata compression')
        metadata = json.loads(body)
        return metadata, {'minZoom': header[100], 'maxZoom': header[101],
                          'addressedTiles': struct.unpack_from('<Q', header, 72)[0]}


def layer_contract(metadata):
    return {layer['id']: layer['fields'] for layer in metadata['vector_layers']}


def count_objects(path):
    # OPL emits each matching OSM object once, even when multiple filters match.
    command = ['osmium', 'tags-filter', str(path), 'nwr/building', 'w/highway',
               'w/railway', 'nwr/amenity', 'nwr/shop', 'nwr/tourism', 'nwr/leisure',
               'nwr/natural', 'nwr/landuse', 'nwr/waterway', 'nwr/place',
               '--omit-referenced', '--output-format=opl']
    process = subprocess.Popen(command, stdout=subprocess.PIPE, text=True)
    counts = dict.fromkeys(['buildings', 'roadsPaths', 'railways', 'pois', 'landuse', 'waterways', 'places'], 0)
    for line in process.stdout:
        kind = line[0]
        tag_field = next((part[1:] for part in line.split() if part.startswith('T')), '')
        tags = dict(item.split('=', 1) for item in tag_field.split(',') if '=' in item)
        present = lambda key: key in tags and tags[key] not in ('', 'no')
        if kind in 'wr' and present('building'):
            counts['buildings'] += 1
        if kind == 'w' and present('highway'):
            counts['roadsPaths'] += 1
        if kind == 'w' and present('railway'):
            counts['railways'] += 1
        if any(present(key) for key in ['amenity', 'shop', 'tourism', 'leisure']):
            counts['pois'] += 1
        if present('landuse') or (present('natural') and tags['natural'] not in ('coastline', 'water')):
            counts['landuse'] += 1
        if present('waterway'):
            counts['waterways'] += 1
        if present('place'):
            counts['places'] += 1
    process.stdout.close()
    if process.wait() != 0:
        raise RuntimeError('OSM counting failed')
    return counts


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--regions', nargs='+', default=['hk', 'mo', 'gba'], choices=['hk', 'mo', 'gba'])
    parser.add_argument('--apply-local-meta', type=Path)
    parser.add_argument('--apply-only', action='store_true', help='Import an already verified stats.json report')
    args = parser.parse_args()
    if args.apply_only and not args.apply_local_meta:
        parser.error('--apply-only requires --apply-local-meta')
    args.output.mkdir(parents=True, exist_ok=True)
    rows = json.loads((args.output / 'stats.json').read_text()) if args.apply_only else []
    source_hashes = {}
    for region in ([] if args.apply_only else args.regions):
        catalogue = get_json(f'/{region}/versions.json')
        name = catalogue['region']['name']
        entries = sorted(catalogue['versions'], key=lambda entry: entry['version'], reverse=True)
        reference = get_json(f'/releases/{region}/{entries[0]["version"]}.json')
        reference_archive = TILES / 'data' / region / reference['release']['archive']['tileset']
        if digest(reference_archive) != reference['release']['archive']['sha256']:
            raise ValueError('Reference PMTiles checksum mismatch')
        reference_contract = layer_contract(pmtiles_metadata(reference_archive)[0])
        for entry in entries:
            version = entry['version']
            manifest = get_json(f'/releases/{region}/{version}.json')
            (args.output / f'{region}-{version}.original.json').write_text(json.dumps(manifest, indent=2) + '\n')
            archive = TILES / 'data' / region / entry['tileset']
            if digest(archive) != entry['sha256'] or manifest['release']['archive']['sha256'] != entry['sha256']:
                raise ValueError(f'Archive identity mismatch: {region}/{version}')
            metadata, tile_stats = pmtiles_metadata(archive)
            schema = manifest['release'].get('schema')
            if schema is None:
                matches = layer_contract(metadata) == reference_contract
                schema = reference['release']['schema'] if matches else {
                    'version': metadata['version'], 'base': 'Protomaps Basemap Layers (archive profile)'
                }
                manifest['release']['schema'] = schema
                manifest['release']['schemaEvidence'] = {
                    'method': 'identical PMTiles vector layer names and field types' if matches else 'PMTiles archive profile version; SaanSeoi schema not recorded',
                    'referenceVersion': reference['release']['version'],
                    'archiveSha256': entry['sha256'],
                }
            source = manifest['provenance']['source']['sourceArchive']
            candidates = [TILES / 'sources' / f'guangdong-{version}.osm.pbf',
                          TILES / 'sources' / f'historical-{region}-{version}.osm.pbf']
            source_path = next((path for path in candidates if path.exists()), None)
            if source_path is None:
                raise ValueError(f'Missing archived source: {region}/{version}')
            if source_path not in source_hashes:
                source_hashes[source_path] = digest(source_path)
            if source_hashes[source_path] != source['sha256']:
                raise ValueError(f'Source checksum mismatch: {region}/{version}')
            boundary = TILES / 'data' / region / f'{name}-{version}.boundary.geojson'
            boundary_sha = digest(boundary)
            if boundary_sha != manifest['release']['boundary']['sha256']:
                raise ValueError(f'Boundary checksum mismatch: {region}/{version}')
            extract = args.output / f'{region}-{version}.osm.pbf'
            subprocess.run(['osmium', 'extract', '--strategy=complete_ways', f'--polygon={boundary}',
                            f'--output={extract}', '--overwrite', str(source_path)], check=True, stdout=subprocess.DEVNULL)
            stats = {
                'method': 'osm-source-objects-v1', 'generatedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
                'sourceSha256': source['sha256'], 'boundarySha256': boundary_sha,
                'extractSha256': digest(extract), 'counts': count_objects(extract),
                'layers': [{key: layer[key] for key in ('id', 'minzoom', 'maxzoom')} for layer in metadata['vector_layers']],
                'schema': schema, **tile_stats,
            }
            row = {'id': f'{region}/{version}', 'region': region, 'version': version,
                   'archiveSha256': entry['sha256'], 'statistics': stats}
            rows.append(row)
            (args.output / f'{region}-{version}.manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
            (args.output / 'stats.json').write_text(json.dumps(rows, indent=2) + '\n')
            extract.unlink()
            print(f'{region}/{version}: {stats["counts"]}', flush=True)
    if args.apply_local_meta:
        path = args.apply_local_meta.resolve()
        if not path.is_relative_to(ROOT / '.local/d1/dev') or not path.exists():
            raise ValueError('Only an existing local development META database is supported')
        db = sqlite3.connect(path)
        # A missing migration must fail before any writes. Never create a database here.
        db.execute('SELECT id FROM basemapReleaseStats LIMIT 1')
        with sqlite3.connect(args.output / 'meta-before.sqlite') as backup:
            db.backup(backup)
        with db:
            for row in rows:
                db.execute('''INSERT INTO basemapReleaseStats(id,region,version,archiveSha256,statistics)
                    VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET
                    archiveSha256=excluded.archiveSha256, statistics=excluded.statistics,
                    updatedAt=strftime('%Y-%m-%dT%H:%M:%fZ','now')''',
                    (row['id'], row['region'], row['version'], row['archiveSha256'], json.dumps(row['statistics'])))
        assert db.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
        db.close()


if __name__ == '__main__':
    main()
