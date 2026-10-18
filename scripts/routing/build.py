#!/usr/bin/env python3
"""Rebuild a pinned SaanSeoi routing edition. Requires Docker and osmium-tool.

python3 rebuild.py --recipe URL_OR_FILE --out DIRECTORY
The recipe fixes one region; no source or engine is selected from mutable latest URLs.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tarfile
import urllib.request


def sha(path):
    """Hash a file with bounded memory."""
    with Path(path).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def obtain(spec, destination):
    """Retain an integrity-checked input, replacing files only after successful download."""
    destination = Path(destination)
    if destination.exists() and sha(destination) == spec['sha256']:
        return destination
    temporary = destination.with_suffix(destination.suffix + '.download')
    request = urllib.request.Request(spec['url'], headers={'User-Agent': 'SaanSeoi-routing/1'})
    try:
        with urllib.request.urlopen(request, timeout=120) as source, temporary.open('wb') as output:
            shutil.copyfileobj(source, output)
        if sha(temporary) != spec['sha256']:
            raise RuntimeError(f'Input checksum mismatch: {destination.name}')
        temporary.replace(destination)
    finally:
        temporary.unlink(missing_ok=True)
    return destination


def execute(command, cwd=None):
    """Run one checked build step with visible progress."""
    print('Running', ' '.join(str(part) for part in command), flush=True)
    subprocess.run(command, cwd=cwd, check=True)


def docker(work, image, *command):
    """Bound native build resources and use a fixed Linux platform."""
    execute(['docker', 'run', '--rm', '--platform', 'linux/amd64', '--memory=6g',
             '--memory-swap=6g', '--cpus=2', '--user', f'{os.getuid()}:{os.getgid()}',
             '-v', f'{work}:/work', '-w', '/work', '--entrypoint', command[0], image, *command[1:]])


def build(recipe, work):
    """Build both engine packages from the exact archived source and release boundary."""
    work = Path(work).resolve()
    work.mkdir(parents=True, exist_ok=True)
    source = obtain(recipe['source'], work / 'guangdong.osm.pbf')
    boundary = obtain(recipe['boundary'], work / 'boundary.geojson')
    regional = work / 'region.osm.pbf'
    # Preserve complete ways; reuse only a checksummed extraction tied to these exact inputs.
    extraction = work / 'extraction.complete.json'
    extraction_id = hashlib.sha256(json.dumps({key: recipe[key] for key in ('source', 'boundary', 'extraction')}, sort_keys=True).encode()).hexdigest()
    if regional.exists():
        if not extraction.exists(): raise RuntimeError('Unverified existing extract; use a fresh output directory.')
        receipt = json.loads(extraction.read_text())
        if receipt['identity'] != extraction_id or receipt['sha256'] != sha(regional):
            raise RuntimeError('Regional extract differs from pinned inputs; use a fresh output directory.')
    else:
        execute(['osmium', 'extract', '--strategy=complete_ways', '--polygon', str(boundary),
                 '--overwrite', '--output', str(regional) + '.building.osm.pbf', str(source)])
        Path(str(regional) + '.building.osm.pbf').replace(regional)
        extraction.write_text(json.dumps({'identity': extraction_id, 'sha256': sha(regional)}) + '\n')
    (work / 'recipe.json').write_text(json.dumps(recipe, indent=2) + '\n')
    results = {'pbf': {'file': regional.name, 'size': regional.stat().st_size, 'sha256': sha(regional)}}
    for engine, spec in recipe['engines'].items():
        if engine not in ('valhalla', 'graphhopper'): raise RuntimeError('Unsupported graph engine')
        package = work / f'{engine}.tar.gz'
        state = work / f'{engine}.complete.json'
        identity = hashlib.sha256(json.dumps({**recipe, 'engines': {engine: spec}}, sort_keys=True).encode()).hexdigest()
        if state.exists() and package.exists():
            previous = json.loads(state.read_text())
            if previous['recipeSha256'] == identity and previous['sha256'] == sha(package):
                results[engine] = previous
                continue
            raise RuntimeError('Existing build differs; choose a fresh output directory.')
        directory = work / engine
        if directory.exists():
            shutil.rmtree(directory)
        directory.mkdir()
        if engine == 'valhalla':
            config = json.loads(subprocess.check_output(['docker', 'run', '--rm', '--entrypoint',
                                'valhalla_build_config', spec['image']], text=True))
            config['mjolnir'].update(tile_dir='/work/valhalla/tiles', tile_extract='', tile_url='',
                                     admin='', timezone='', concurrency=1, max_cache_size=268435456)
            config['mjolnir']['data_processing']['use_admin_db'] = False
            config['loki']['actions'] = ['route']
            config['httpd']['service']['listen'] = 'tcp://0.0.0.0:8002'
            for section in ('mjolnir', 'loki', 'thor', 'odin'):
                config[section]['logging'] = {'type': 'std_err', 'color': False}
            cfg = directory / 'build-config.json'
            cfg.write_text(json.dumps(config))
            docker(work, spec['image'], 'valhalla_build_tiles', '-c', '/work/valhalla/build-config.json', '/work/region.osm.pbf')
            config['mjolnir']['tile_extract'] = '/work/valhalla/graph.tar'
            cfg.write_text(json.dumps(config))
            docker(work, spec['image'], 'valhalla_build_extract', '-c', '/work/valhalla/build-config.json')
            config['mjolnir'].update(tile_dir='/routing/tiles', tile_extract='/routing/graph.tar', max_cache_size=67108864)
            (directory / 'config.json').write_text(json.dumps(config, indent=2) + '\n')
            members = ['graph.tar', 'config.json']
        else:
            obtain(spec['jar'], work / 'graphhopper.jar')
            (directory / 'config.yml').write_text(spec['config'])
            docker(work, spec['image'], 'java', '-Xmx4g', '-jar', '/work/graphhopper.jar', 'import', '/work/graphhopper/config.yml')
            # Runtime paths are portable within /routing, independent of the build workspace.
            runtime = spec['config'].replace('datareader.file: /work/region.osm.pbf', 'datareader.file: \"\"').replace('/work/graphhopper/graph', '/routing/graph')
            (directory / 'config.yml').write_text(runtime)
            members = ['graph', 'config.yml']
        (directory / 'recipe.json').write_text(json.dumps({**recipe, 'engines': {engine: spec}}, indent=2) + '\n')
        (directory / 'LICENSE.txt').write_text('OpenStreetMap contributors. ODbL 1.0. https://www.openstreetmap.org/copyright\n')
        temporary = package.with_suffix('.building')
        with tarfile.open(temporary, 'w:gz', compresslevel=6) as archive:
            for name in [*members, 'recipe.json', 'LICENSE.txt']:
                archive.add(directory / name, arcname=name)
        temporary.replace(package)
        result = {'file': package.name, 'size': package.stat().st_size, 'sha256': sha(package),
                  'recipeSha256': identity, 'version': spec['version'], 'profiles': spec['profiles']}
        state.write_text(json.dumps(result, indent=2) + '\n')
        results[engine] = result
        print('Completed', engine, result['size'], 'bytes', flush=True)
    (work / 'build.json').write_text(json.dumps(results, indent=2) + '\n')
    return results


def main():
    """Resolve one immutable recipe and emit packages without publishing anything."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--recipe', required=True)
    parser.add_argument('--out', required=True, type=Path)
    args = parser.parse_args()
    if args.recipe.startswith('https://'):
        request = urllib.request.Request(args.recipe, headers={'User-Agent': 'SaanSeoi-routing/1'})
        with urllib.request.urlopen(request, timeout=30) as stream:
            recipe = json.load(stream)
    else:
        recipe = json.loads(Path(args.recipe).read_text())
    if recipe.get('schemaVersion') != 1 or recipe.get('region') not in ('hk', 'mo', 'gba'):
        raise SystemExit('Unsupported routing recipe')
    build(recipe, args.out)


if __name__ == '__main__':
    main()
