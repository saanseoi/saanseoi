#!/usr/bin/env python3
"""Build/publish regional routing companions; retain only the newest two graph editions.

Usage: python3 scripts/routing/publish.py --region hk|mo|gba|all [--version DATE] [--backfill]
Only this publisher removes routing payloads, after both replacement engines are published.
Source PBFs, boundaries, recipes and provenance are never removed.
"""
import argparse
import fcntl
import importlib.util
import json
import os
import re
from pathlib import Path
import shutil
import subprocess
import sys
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[2]
WORK = ROOT / '.local/routing'
NAMES = {'hk': 'hongkong', 'mo': 'macau', 'gba': 'gba'}
ORIGIN = 'https://tiles.saanseoi.hk'
BUCKET = 'ss-pmtiles'


def environment():
    """Load operator credentials without printing them or overwriting explicit process values."""
    env = dict(os.environ)
    path = Path.home() / '.config/saanseoi/scheduled-jobs.env'
    if path.exists():
        for line in path.read_text().splitlines():
            if not line.strip() or line.lstrip().startswith('#') or '=' not in line:
                continue
            key, value = line.removeprefix('export ').split('=', 1)
            env.__setitem__(key.strip(), value.strip().strip('\"\''))
    env.setdefault('WRANGLER_LOG_PATH', '/tmp/ss-routing-wrangler.log')
    return env


def wrangler(*args):
    """Use Wrangler for bounded object publication and exact-key deletions."""
    result = subprocess.run(['bun', 'x', 'wrangler', *args], cwd=ROOT,
                            env=environment(), capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError(result.stderr + result.stdout)
    return result.stdout


def get(key, path, optional=False, bucket=BUCKET):
    """Fetch one object atomically; only an explicit not-found permits an absent catalogue."""
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + '.download')
    try:
        wrangler('r2', 'object', 'get', f'{bucket}/{key}', '--remote', '--file', str(temporary))
        temporary.replace(path)
        return True
    except RuntimeError as error:
        if optional and ('10007' in str(error) or '404' in str(error) or 'does not exist' in str(error)):
            return False
        raise
    finally:
        temporary.unlink(missing_ok=True)


def upload(key, path):
    """Publish one fixed payload; recipes/manifests are separate completion records."""
    wrangler('r2', 'object', 'put', f'{BUCKET}/{key}', '--remote', '--file', str(path))


def write(path, value):
    """Write readable metadata for the same bytes uploaded to R2."""
    path.write_text(json.dumps(value, indent=2) + '\n')


def retention_plan(versions):
    """Retain the newest two completed editions, independent of backfill order."""
    available = sorted((v for v in versions if v['status'] == 'available'),
                       key=lambda v: v['version'], reverse=True)
    return available[:2], available[2:]


def retirement_keys(region, entry):
    """Limit retirement to three exact routing payload keys; never source/boundary/provenance."""
    if region not in NAMES or not re.fullmatch(r'\d{4}-\d{2}-\d{2}', entry['version']):
        raise RuntimeError('Invalid retirement edition')
    prefix = f"routing/{region}/{entry['version']}/"
    allowed = {prefix + name for name in ('region.osm.pbf', 'valhalla.tar.gz', 'graphhopper.tar.gz')}
    if len(set(entry['payloads'])) != 3 or set(entry['payloads']) != allowed:
        raise RuntimeError('Unsafe retention payload keys')
    return entry['payloads']


def complete_publication(region, version, manifest, directory):
    """Finish discovery and exact-key retirement without rewriting a completed edition."""
    payloads = [manifest['pbf']['key'], *[item['key'] for item in manifest['engines'].values()]]
    index_path = WORK / region / 'versions.json'
    index = {'schemaVersion': 1, 'region': region, 'versions': []}
    if get(f'routing/{region}/versions.json', index_path, optional=True):
        index = json.loads(index_path.read_text())
    index['versions'] = [v for v in index['versions'] if v['version'] != version] + [
        {'version': version, 'status': 'available', 'payloads': payloads}]
    kept, retired = retention_plan(index['versions'])
    latest = kept[0]['version']
    latest_manifest = directory / 'latest.json'
    get(f'routing/{region}/{latest}/manifest.json', latest_manifest)
    upload(f'routing/{region}/latest.json', latest_manifest)
    latest_data = json.loads(latest_manifest.read_text())
    for engine, info in latest_data['engines'].items():
        upload(f"routing/{region}/{engine}/{info['version']}/latest.json", latest_manifest)
    # Commit discovery before retiring anything; a retry resumes a partially completed prune.
    index['versions'].sort(key=lambda v: v['version'], reverse=True)
    write(index_path, index); upload(f'routing/{region}/versions.json', index_path)
    for entry in retired:
        old_path = WORK / region / f"{entry['version']}.retired.json"
        get(f"routing/{region}/{entry['version']}/manifest.json", old_path)
        old = json.loads(old_path.read_text()); old['status'] = 'retired'
        write(old_path, old); upload(f"routing/{region}/{entry['version']}/manifest.json", old_path)
        for engine, info in old['engines'].items():
            alias_key = f"routing/{region}/{engine}/{info['version']}/latest.json"
            alias_path = WORK / region / f'{engine}.alias.json'
            if get(alias_key, alias_path, optional=True):
                alias = json.loads(alias_path.read_text())
                if alias['version'] == entry['version']:
                    upload(alias_key, old_path)

        for key in retirement_keys(region, entry):
            wrangler('r2', 'object', 'delete', f'{BUCKET}/{key}', '--remote')
        entry['status'] = 'retired'
    write(index_path, index); upload(f'routing/{region}/versions.json', index_path)


def publish(region, version, builder, toolchain):
    """Build a source-backed edition, publish atomically by manifest, then prune exact old payload keys."""
    directory = WORK / region / version
    directory.mkdir(parents=True, exist_ok=True)
    published_path = directory / 'published.json'
    if get(f'routing/{region}/{version}/manifest.json', published_path, optional=True):
        published = json.loads(published_path.read_text())
        if published['status'] == 'retired':
            raise RuntimeError('This graph edition is retired; use its public rebuild recipe locally.')
        complete_publication(region, version, published, directory)
        print('REUSED', region, version, flush=True)
        return
    base = f'basemap/{region}/{NAMES[region]}-{version}'
    get(base + '.json', directory / 'basemap.json')
    metadata = json.loads((directory / 'basemap.json').read_text())
    source = metadata.get('provenance', {}).get('source', {}).get('sourceArchive')
    if not source:
        raise RuntimeError(f'{region}/{version} has no archived OSM provenance; refusing an invented recipe')
    boundary = metadata['release']['boundary']
    source_file = ROOT / '.local/tiles/sources' / f'guangdong-{version}.osm.pbf'
    if not source_file.exists() or builder.sha(source_file) != source['sha256']:
        get(source['key'], directory / 'guangdong.osm.pbf', bucket='ss-basemap-sources')
    else:
        shutil.copyfile(source_file, directory / 'guangdong.osm.pbf')
    get(base + '.boundary.geojson', directory / 'boundary.geojson')
    recipe = {'schemaVersion': 1, 'region': region, 'version': version,
              'source': {'url': f"{ORIGIN}/sources/guangdong/{source['key'].split('/')[-1]}",
                         'sha256': source['sha256'], 'size': source['size']},
              'boundary': {'url': f'{ORIGIN}/{NAMES[region]}-{version}.boundary.geojson',
                           'sha256': boundary['sha256'], 'size': boundary['size']},
              'extraction': 'osmium extract --strategy=complete_ways --polygon boundary.geojson',
              'engines': toolchain,
              'limitations': ['No elevation, traffic, admin/timezone databases or transit feeds imported.'],
              'attribution': 'OpenStreetMap contributors, ODbL 1.0'}
    shutil.copyfile(ROOT / '.local/routing/cache/graphhopper-web-11.1.jar', directory / 'graphhopper.jar') if (ROOT / '.local/routing/cache/graphhopper-web-11.1.jar').exists() else None
    results = builder.build(recipe, directory)
    prefix = f'routing/{region}/{version}'
    manifest = {'schemaVersion': 1, 'region': region, 'version': version, 'status': 'available',
                'createdAt': datetime.now(timezone.utc).isoformat(), 'source': recipe['source'],
                'boundary': recipe['boundary'], 'limitations': recipe['limitations'],
                'recipeUrl': f'{ORIGIN}/{prefix}/recipe.json',
                'rebuildUrl': f'{ORIGIN}/{prefix}/rebuild.py', 'engines': {}}
    payloads = []
    for engine, filename in [('pbf', 'region.osm.pbf'), ('valhalla', 'valhalla.tar.gz'), ('graphhopper', 'graphhopper.tar.gz')]:
        item = dict(results[engine]); item.pop('recipeSha256', None); item.pop('file', None)
        item.update(key=f'{prefix}/{filename}', url=f'{ORIGIN}/{prefix}/{filename}')
        if engine == 'pbf': manifest['pbf'] = item
        else: manifest['engines'][engine] = item
        payloads.append(item['key'])
        upload(item['key'], directory / filename)
    upload(f'{prefix}/recipe.json', directory / 'recipe.json')
    rebuild = directory / 'rebuild.py'
    if not rebuild.exists(): shutil.copyfile(ROOT / 'scripts/routing/build.py', rebuild)
    upload(f'{prefix}/rebuild.py', rebuild)
    write(directory / 'manifest.json', manifest)
    upload(f'{prefix}/manifest.json', directory / 'manifest.json')
    complete_publication(region, version, manifest, directory)
    print('PUBLISHED', region, version, {k: v['size'] for k, v in results.items()}, flush=True)


def main():
    """Serialise publication in this workspace; default to the current published basemap edition."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--region', choices=[*NAMES, 'all'], default='all')
    parser.add_argument('--version')
    parser.add_argument('--backfill', action='store_true')
    args = parser.parse_args()
    WORK.mkdir(parents=True, exist_ok=True)
    with (WORK / 'publication.lock').open('w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        spec = importlib.util.spec_from_file_location('routing_builder', ROOT / 'scripts/routing/build.py')
        builder = importlib.util.module_from_spec(spec); spec.loader.exec_module(builder)
        toolchain = json.loads((ROOT / 'scripts/routing/toolchain.json').read_text())
        for region in (NAMES if args.region == 'all' else [args.region]):
            catalogue = WORK / f'{region}.basemaps.json'
            get(f'basemap/{region}/versions.json', catalogue)
            versions = sorted((v['version'] for v in json.loads(catalogue.read_text())['versions']), reverse=True)
            selected = [args.version] if args.version else versions[:2 if args.backfill else 1]
            for version in reversed(selected):
                if version not in versions: raise RuntimeError('Basemap edition is not published')
                publish(region, version, builder, toolchain)


if __name__ == '__main__':
    main()
