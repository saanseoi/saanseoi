#!/usr/bin/env python3
"""Compile separate optional LandsD all-access and unpaid Valhalla graph packages.

Run under dev-check. Never updates the default routing edition or deploys a service.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tarfile

IMAGE = 'ghcr.io/valhalla/valhalla:3.8.3@sha256:70b45295d81035e3562e1bbf996a28d5fc55e1ccc5d7e3fff9f297d3b1a1359f'


def sha(path):
    with path.open('rb') as f:
        return hashlib.file_digest(f, 'sha256').hexdigest()


def run(command):
    print(' '.join(map(str, command)), flush=True)
    subprocess.run(command, check=True)


def build(root, binaries):
    root, binaries = root.resolve(), binaries.resolve()
    manifest = json.loads((root / 'manifest.json').read_text())
    receipt = dict(schemaVersion=1, region='hk', edition='indoor', source=manifest, engineBase=IMAGE,
                   binaries={name: sha(binaries / name) for name in ('valhalla_build_tiles', 'valhalla_build_extract', 'valhalla_service')},
                   variants={})
    for variant in ('all', 'unpaid'):
        directory = root / variant
        if directory.exists():
            raise ValueError('Use a fresh build directory; no graph overwrite')
        directory.mkdir()
        pbf = root / (variant + '.osm.pbf')
        run(['osmium', 'sort', str(root / (variant + '.osm')), '-o', str(pbf)])
        run(['osmium', 'check-refs', str(pbf)])
        container = ['docker', 'run', '--rm', '--memory=3g', '--memory-swap=3g', '--cpus=2',
                     '--user', f'{os.getuid()}:{os.getgid()}', '-v', f'{root}:/work:Z',
                     '-v', f'{binaries}:/engine:ro,z']
        config = json.loads(subprocess.check_output([*container, '--entrypoint', 'valhalla_build_config', IMAGE], text=True))
        config['mjolnir'].update(tile_dir=f'/work/{variant}/tiles', tile_extract='', tile_url='',
                                  admin='', timezone='', concurrency=1, max_cache_size=134217728)
        config['mjolnir']['data_processing']['use_admin_db'] = False
        config['loki']['actions'] = ['route', 'locate', 'status']
        config['httpd']['service']['listen'] = 'tcp://0.0.0.0:8002'
        for section in ('mjolnir', 'loki', 'thor', 'odin'):
            config[section]['logging'] = {'type': 'std_err', 'color': False}
        path = directory / 'config.json'
        path.write_text(json.dumps(config))
        run([*container, '--entrypoint', '/engine/valhalla_build_tiles', IMAGE,
             '-c', f'/work/{variant}/config.json', f'/work/{variant}.osm.pbf'])
        config['mjolnir']['tile_extract'] = f'/work/{variant}/graph.tar'
        path.write_text(json.dumps(config))
        run([*container, '--entrypoint', '/engine/valhalla_build_extract', IMAGE,
             '-c', f'/work/{variant}/config.json'])
        config['mjolnir'].update(tile_dir='/routing/tiles', tile_extract='/routing/graph.tar')
        path.write_text(json.dumps(config, indent=2) + '\n')
        (directory / 'LICENSE.txt').write_text('Map from Lands Department, HKSAR Government.\nhttps://portal.csdi.gov.hk/csdi-webpage/info/termsAndConditions\n')
        package = root / f'valhalla-{variant}.tar.gz'
        with tarfile.open(package, 'w:gz') as archive:
            for name in ('graph.tar', 'config.json', 'LICENSE.txt'):
                archive.add(directory / name, arcname=name)
        receipt['variants'][variant] = dict(file=package.name, sha256=sha(package), size=package.stat().st_size,
                                           graphSha256=sha(directory / 'graph.tar'), pbfSha256=sha(pbf))
        (root / 'build.json').write_text(json.dumps(receipt, indent=2) + '\n')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--prepared', type=Path, required=True)
    parser.add_argument('--binaries', type=Path, required=True)
    args = parser.parse_args()
    build(args.prepared, args.binaries)
