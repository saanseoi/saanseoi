#!/usr/bin/env python3
"""Publish an experimental indoor edition without changing default routing pointers.

Requires explicit --publish and a complete build. Payload hashes and native smoke
results accompany the release; this is not approval for a live routing service.
"""
import argparse
import concurrent.futures
import hashlib
import importlib.util
import json
from pathlib import Path
import re

spec = importlib.util.spec_from_file_location('routing_publisher', Path(__file__).resolve().parents[1] / 'publish.py')
base = importlib.util.module_from_spec(spec)
spec.loader.exec_module(base)


def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def publish(root, version, apply):
    if not re.fullmatch(r'\d{4}-\d{2}-\d{2}', version):
        raise ValueError('Expected an edition date')
    build = json.loads((root / 'build.json').read_text())
    if set(build['variants']) != {'all', 'unpaid'}:
        raise ValueError('Both graph variants are required')
    for value in build['variants'].values():
        if digest(root / value['file']) != value['sha256']:
            raise ValueError('Build hash mismatch')
    validation = json.loads((root / 'native-validation.json').read_text())
    if not validation or any('error' in item for item in validation):
        raise ValueError('Native smoke evidence is missing or has errors')
    files = sorted((root / 'stations').glob('*.json')) + [root / name for name in
        ('valhalla-all.tar.gz', 'valhalla-unpaid.tar.gz', 'build.json', 'native-validation.json')]
    manifest = json.loads((root / 'manifest.json').read_text())
    manifest.update(status='available', maturity='experimental', default=False,
        version=version, nativeServiceReady=False,
        attribution='Map from Lands Department, HKSAR Government',
        terms='https://portal.csdi.gov.hk/csdi-webpage/info/termsAndConditions',
        files={str(path.relative_to(root)): dict(sha256=digest(path), size=path.stat().st_size) for path in files})
    manifest['limitations'] += ['Native lift-landing requests can collapse to zero distance; do not enable the native service until corrected',
        'Station source routing is independent of native Valhalla; this edition is for evaluation',
        'Nine stations have no accepted outdoor portal', 'POI access uses contained source vertices, not surveyed shop doors']
    release = root / 'release-manifest.json'
    base.write(release, manifest)
    prefix = f'routing/hk/indoor/{version}'
    print(json.dumps(dict(prefix=prefix, files=len(files), maturity='experimental', publish=apply)), flush=True)
    if not apply:
        return
    existing = root / 'existing-release.json'
    if base.get(prefix + '/manifest.json', existing, optional=True):
        if json.loads(existing.read_text()) != manifest:
            raise ValueError('Refusing to overwrite an immutable indoor edition')
        print('Identical completed edition already published'); return
    def upload(path):
        key = prefix + '/' + str(path.relative_to(root))
        base.upload(key, path)
        print('Uploaded ' + key, flush=True)
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        list(pool.map(upload, files))
    base.upload(prefix + '/manifest.json', release)
    print('Published completion manifest: ' + base.ORIGIN + '/' + prefix + '/manifest.json', flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--prepared', type=Path, required=True)
    parser.add_argument('--version', required=True)
    parser.add_argument('--publish', action='store_true')
    args = parser.parse_args()
    publish(args.prepared.resolve(), args.version, args.publish)
