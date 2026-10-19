#!/usr/bin/env python3
"""Deploy private shared Valhalla from the latest published GBA companion.

Usage: python3 scripts/routing/deploy-service.py production|preview
Does not deploy consumer applications. Operator API credentials may be supplied
in ROUTING_CLOUDFLARE_ENV_FILE; otherwise scheduled-job credentials are used.
"""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import secrets
import subprocess
import tarfile

ROOT = Path(__file__).resolve().parents[2]



def stage_local_bundle(bundle, expected_sha, release_id, worker=None):
    """Stage a verified repair through the service release path without publishing or deploying."""
    import re
    worker = Path(worker) if worker is not None else ROOT / 'workers/routing'
    if not re.fullmatch(r'[a-z0-9][a-z0-9._-]{0,127}', release_id):
        raise ValueError('Invalid immutable release identity')
    with Path(bundle).open('rb') as stream:
        if hashlib.file_digest(stream, 'sha256').hexdigest() != expected_sha:
            raise ValueError('Local bundle checksum mismatch')
    engine = json.loads((worker / 'engine-release.json').read_text())
    # Validate all inputs before changing image data or its release identity.
    with tarfile.open(bundle) as archive:
        names = [member.name for member in archive.getmembers()]
        if any(names.count(name) != 1 or not archive.getmember(name).isfile()
               for name in ('graph.tar', 'config.json', 'recipe.json')):
            raise ValueError('Incomplete or duplicate local bundle members')
        recipe = json.load(archive.extractfile('recipe.json'))
        candidate = recipe.get('engines', {}).get('valhalla', {})
        if recipe.get('region') != 'gba' or any(candidate.get(key) != value for key, value in engine.items()):
            raise ValueError('Local bundle does not match the pinned repaired engine')
        config = archive.extractfile('config.json').read()
        parsed = json.loads(config)
        if parsed['mjolnir']['tile_extract'] != '/routing/graph.tar':
            raise ValueError('Nonportable local graph configuration')
        graph = archive.extractfile('graph.tar').read()
    graph_sha = hashlib.sha256(graph).hexdigest()
    release = {'release': release_id, 'graphSha256': graph_sha,
               'sourceBundleSha256': expected_sha, 'limitations': recipe['limitations'], 'engine': engine}
    previous = json.loads((worker / 'graph-release.json').read_text())
    if previous['release'] == release_id and previous != release:
        raise ValueError('Refusing to reuse a release identity for different artifacts')
    data = worker / 'image-data'
    data.mkdir(parents=True, exist_ok=True)
    for name, contents in [('graph.tar', graph), ('native-config.json', config)]:
        temporary = data / (name + '.staging')
        temporary.write_bytes(contents)
        temporary.replace(data / name)
    temporary = worker / 'graph-release.json.staging'
    temporary.write_text(json.dumps(release, indent=2) + '\n')
    temporary.replace(worker / 'graph-release.json')
    print(f'Staged {release_id}: {graph_sha}; no publication or deployment performed')


def main():
    """Resolve and verify immutable data before building the private service image."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('target', choices=['production', 'preview'])
    parser.add_argument('--version', help='A retained GBA edition for rollback; defaults to compatible latest')
    parser.add_argument('--stage-only', action='store_true', help='Prepare image data and metadata without deploying')
    parser.add_argument('--local-bundle', type=Path, help='Verified local repaired-engine bundle; requires --stage-only')
    parser.add_argument('--bundle-sha256', help='Expected SHA256 of the local bundle')
    parser.add_argument('--release', help='New immutable identity for a locally staged repair')
    args = parser.parse_args()
    if args.local_bundle:
        if not args.stage_only or not args.bundle_sha256 or not args.release or args.version:
            parser.error('--local-bundle requires --stage-only, --bundle-sha256 and --release, without --version')
        stage_local_bundle(args.local_bundle, args.bundle_sha256, args.release)
        return
    if args.bundle_sha256 or args.release:
        parser.error('--bundle-sha256 and --release require --local-bundle')
    if args.version:
        from datetime import date
        if date.fromisoformat(args.version).isoformat() != args.version: raise RuntimeError('Invalid edition')
    spec = importlib.util.spec_from_file_location('publisher', ROOT / 'scripts/routing/publish.py')
    publisher = importlib.util.module_from_spec(spec); spec.loader.exec_module(publisher)
    work = ROOT / '.local/routing/service'; work.mkdir(parents=True, exist_ok=True)
    key = f'routing/gba/{args.version}/manifest.json' if args.version else 'routing/gba/valhalla/3.8.3/latest.json'
    publisher.get(key, work / 'latest.json')
    manifest = json.loads((work / 'latest.json').read_text())
    if manifest['status'] != 'available': raise RuntimeError('Latest service graph is not available')
    bundle = manifest['engines']['valhalla']
    if manifest['region'] != 'gba' or bundle['version'] != '3.8.3': raise RuntimeError('Incompatible service graph')
    publisher.get(bundle['key'], work / 'valhalla.tar.gz')
    with (work / 'valhalla.tar.gz').open('rb') as stream:
        if hashlib.file_digest(stream, 'sha256').hexdigest() != bundle['sha256']:
            raise RuntimeError('Graph package checksum mismatch')
    worker = ROOT / 'workers/routing'
    data = worker / 'image-data'; data.mkdir(parents=True, exist_ok=True)
    with tarfile.open(work / 'valhalla.tar.gz') as archive:
        members = [member for member in archive.getmembers() if member.name in ('graph.tar', 'config.json')]
        if len(members) != 2: raise RuntimeError('Incomplete native graph package')
        archive.extractall(data, members=members, filter='data')
    (data / 'config.json').replace(data / 'native-config.json')
    with (data / 'graph.tar').open('rb') as stream:
        graph_sha = hashlib.file_digest(stream, 'sha256').hexdigest()
    release = {'release': f"gba-{manifest['version']}", 'graphSha256': graph_sha,
               'sourceBundleSha256': bundle['sha256'], 'limitations': manifest['limitations'],
               'engine': json.loads((worker / 'engine-release.json').read_text())}
    (worker / 'graph-release.json').write_text(json.dumps(release, indent=2) + '\n')
    if args.stage_only:
        print(f'Staged {release["release"]}; no deployment performed')
        return
    # Each application gets an independently revocable token, kept outside source control.
    clients_path = ROOT / f'.local/routing/clients-{args.target}.json'
    if not clients_path.exists():
        with os.fdopen(os.open(clients_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), 'w') as stream:
            json.dump({'hype': secrets.token_urlsafe(48)}, stream)
    clients_path.chmod(0o600)
    clients = json.loads(clients_path.read_text())
    secret_path = ROOT / f'.local/routing/secrets-{args.target}.json'
    with os.fdopen(os.open(secret_path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600), 'w') as stream:
        json.dump({'ROUTING_CLIENTS': json.dumps(clients)}, stream)
    env = publisher.environment()
    credential_file = os.environ.get('ROUTING_CLOUDFLARE_ENV_FILE', str(ROOT / '.local/routing/cloudflare.env'))
    if Path(credential_file).exists():
        for line in Path(credential_file).read_text().splitlines():
            if '=' in line and not line.lstrip().startswith('#'):
                key, value = line.split('=', 1)
                if key.strip() in ('CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID'):
                    env[key.strip()] = value.strip().strip('\"\'')
    subprocess.run(['npm', 'ci', '--ignore-scripts', '--no-audit', '--no-fund'], cwd=worker, check=True)
    command = ['bun', 'x', 'wrangler', 'deploy', '--config', str(worker / 'wrangler.jsonc'),
               '--secrets-file', str(secret_path)]
    if args.target == 'preview': command += ['--env', 'preview']
    subprocess.run(command, cwd=ROOT, env=env, check=True)
    print(f'Deployed ss-routing-{args.target if args.target == "preview" else "prod"}; authorised clients: {", ".join(clients)}')


if __name__ == '__main__':
    main()
