"""Inspect or prune recognised local backups and regenerable caches.

Dry-run is the default. Run apply on the host, with ingestion stopped; a private
PID namespace cannot establish whether another process owns the selected files.
"""
import argparse
from collections import defaultdict
from contextlib import ExitStack, closing
from datetime import datetime, timezone
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import sqlite3
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[1]
DAY = 86400
BACKUP = re.compile(r'([a-f0-9]{64})-(\d{8}T\d{12}Z)\.sqlite$')
CACHE = re.compile(r'[a-f0-9]{64}\.bin$')
POLICY = json.loads(Path(__file__).with_name('local-artefact-retention-policy.json').read_text())


def identity(path):
    s = path.lstat()
    return [s.st_dev, s.st_ino, s.st_size, s.st_mtime_ns, s.st_ctime_ns]


def safe_path(root, path):
    relative = path.relative_to(root)
    cursor = root
    for part in relative.parts:
        cursor = cursor / part
        if cursor.is_symlink():
            raise ValueError(f'Symlink is protected: {cursor}')
    if not path.resolve().is_relative_to(root.resolve()):
        raise ValueError(f'Path escapes repository: {path}')


def pinned(path):
    return Path(str(path) + '.keep').exists()


def backup_plan(root, now):
    folder = root / '.local/d1/migration-backups'
    safe_path(root, folder)
    groups = defaultdict(list)
    for path in folder.glob('*.sqlite'):
        safe_path(root, path)
        match = BACKUP.fullmatch(path.name)
        if match and path.is_file():
            # Invalid dates are not eligible for automatic removal.
            datetime.strptime(match[2], '%Y%m%dT%H%M%S%fZ')
            groups[match[1]].append(path)
    remove, verify, protected = [], [], []
    for paths in groups.values():
        paths.sort(key=lambda p: p.name, reverse=True)
        survivors = paths[:POLICY['migrationBackupsPerDatabase']]
        candidates = []
        for path in paths[POLICY['migrationBackupsPerDatabase']:]:
            if pinned(path) or now - path.stat().st_mtime < POLICY['migrationBackupGraceDays'] * DAY:
                protected.append(path)
            else:
                candidates.append(path)
        if candidates:
            # Nonempty WALs mean that a standalone main-file backup is unsafe.
            for path in survivors + candidates:
                for suffix in ('-wal', '-shm'):
                    sibling = Path(str(path) + suffix)
                    safe_path(root, sibling)
                    if sibling.exists() and suffix == '-wal' and sibling.stat().st_size:
                        raise ValueError(f'Backup has uncheckpointed WAL: {path}')
            verify.extend(survivors)
            remove.extend(candidates)
            for path in candidates:
                remove.extend(p for suffix in ('-wal', '-shm') if (p := Path(str(path) + suffix)).exists())
        protected.extend(survivors)
    return remove, verify, protected


def cache_plan(root, now):
    folder = root / '.local/harbour-sql/normalised-cache'
    safe_path(root, folder)
    paths = []
    for path in folder.glob('*.bin'):
        safe_path(root, path)
        if CACHE.fullmatch(path.name) and path.is_file():
            paths.append(path)
    total = sum(p.stat().st_size for p in paths)
    remove, protected = [], []
    for path in sorted(paths, key=lambda p: (p.stat().st_mtime_ns, p.name)):
        age = now - path.stat().st_mtime
        if pinned(path) or age < POLICY['normalisedCacheGraceDays'] * DAY:
            protected.append(path)
        elif age > POLICY['normalisedCacheMaxDays'] * DAY or total > POLICY['normalisedCacheMaxBytes']:
            remove.append(path)
            total -= path.stat().st_size
        else:
            protected.append(path)
    return remove, protected


def plan(root, scope='all', now=None):
    now = time.time() if now is None else now
    remove, verify, protected = [], [], []
    if scope in ('all', 'migrations'):
        r, v, p = backup_plan(root, now)
        remove.extend(r)
        verify.extend(v)
        protected.extend(p)
    if scope in ('all', 'cache'):
        r, p = cache_plan(root, now)
        remove.extend(r)
        protected.extend(p)
    return {
        'policy': POLICY,
        'scope': scope,
        'remove': [{'path': str(p.relative_to(root)), 'identity': identity(p)} for p in remove],
        'verify': [{'path': str(p.relative_to(root)), 'identity': identity(p)} for p in verify],
        'protected': [str(p.relative_to(root)) for p in protected],
        'candidateBytes': sum(p.stat().st_size for p in remove),
    }


def process_references(paths, proc=Path('/proc')):
    if (proc / '1/comm').read_text().strip() not in ('systemd', 'init'):
        raise RuntimeError('Apply needs host process visibility; run outside the sandbox/container.')
    roots = [str(p.resolve()) for p in paths]
    hits = []
    for process in proc.glob('[0-9]*'):
        if int(process.name) == os.getpid():
            continue
        try:
            if process.stat().st_uid != int(os.environ.get('SUDO_UID', os.getuid())):
                continue
            references = []
            for entry in [process / 'cwd', process / 'exe', process / 'root', *list((process / 'fd').iterdir())]:
                try:
                    references.append(os.readlink(entry))
                except FileNotFoundError:
                    pass
            references.extend(line.split(maxsplit=5)[-1] for line in (process / 'maps').read_text().splitlines())
            for reference in references:
                reference = reference.removesuffix(' (deleted)')
                if any(reference == root or reference.startswith(root + '/') for root in roots):
                    hits.append({'pid': int(process.name), 'path': reference})
        except (FileNotFoundError, ProcessLookupError):
            continue
        except PermissionError as error:
            if not process.exists():
                continue
            # A same-user process we cannot inspect invalidates an idle claim.
            raise RuntimeError(f'Cannot inspect process {process.name}') from error
    return hits


def privileged_process_references(paths):
    """Elevate only the read-only scan; deletions still run as the caller."""
    result = subprocess.run(
        ['sudo', '-n', sys.executable, str(Path(__file__).resolve()),
         '--check-active', *map(str, paths)],
        check=True, capture_output=True, text=True,
    )
    return json.loads(result.stdout)


def verify_sqlite(path):
    with closing(sqlite3.connect(path.as_uri() + '?mode=ro&immutable=1', uri=True)) as db:
        if db.execute('PRAGMA quick_check').fetchall() != [('ok',)]:
            raise ValueError(f'Backup failed quick_check: {path}')
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def apply_plan(root, proposed, activity_check=process_references):
    # Includes entire producer directories, so concurrent readers/writers of
    # sibling artefacts block cleanup as well as references to selected files.
    watched = [root / '.local/d1/migration-backups', root / '.local/harbour-sql/normalised-cache']
    hits = activity_check(watched)
    if hits:
        raise RuntimeError(f'Active artefact references: {hits[:10]}')
    verified = []
    for entry in proposed['verify']:
        path = root / entry['path']
        safe_path(root, path)
        if identity(path) != entry['identity']:
            raise ValueError(f'Backup changed since planning: {path}')
        digest = verify_sqlite(path)
        if identity(path) != entry['identity']:
            raise ValueError(f'Backup changed during verification: {path}')
        verified.append({'path': entry['path'], 'sha256': digest, 'quickCheck': 'ok'})
        print(f'Verified retained backup: {path.name}', flush=True)
    # Re-plan after expensive verification; any new backup or pin invalidates it.
    current = plan(root, proposed['scope'])
    if current != proposed:
        raise ValueError('Retention plan changed; rerun the dry-run.')
    if activity_check(watched):
        raise RuntimeError('Artefacts became active during verification.')
    receipts = root / '.local/artefact-retention'
    receipts.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    receipt = receipts / f'{stamp}.json'
    result = {**proposed, 'status': 'applying', 'verified': verified, 'removed': []}
    receipt.write_text(json.dumps(result, indent=2) + '\n')
    try:
        for entry in proposed['remove']:
            path = root / entry['path']
            safe_path(root, path)
            if identity(path) != entry['identity'] or pinned(path):
                raise ValueError(f'Artefact changed since planning: {path}')
            path.unlink()
            result['removed'].append(entry['path'])
        result['status'] = 'complete'
    finally:
        receipt.write_text(json.dumps(result, indent=2) + '\n')
    return receipt


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--privileged-process-check', action='store_true')
    parser.add_argument('--check-active', nargs='+', help=argparse.SUPPRESS)
    parser.add_argument('--quiet', action='store_true')
    parser.add_argument('--scope', choices=['all', 'migrations', 'cache'], default='all')
    args = parser.parse_args()
    if args.check_active:
        print(json.dumps(process_references([Path(p) for p in args.check_active])))
        return
    with ExitStack() as stack:
        if args.apply:
            # Cooperate with the migration runner and other retention invocations.
            for relative in ['.local/artefact-retention.lock', '.local/d1/migrations.lock']:
                path = ROOT / relative
                safe_path(ROOT, path)
                path.parent.mkdir(parents=True, exist_ok=True)
                stream = stack.enter_context(path.open('a'))
                fcntl.flock(stream, fcntl.LOCK_EX | fcntl.LOCK_NB)
        if args.apply and args.scope in ('all', 'cache'):
            # Share the automatic cache writer/pruner's SQLite advisory lock.
            cache = ROOT / '.local/harbour-sql/normalised-cache'
            safe_path(ROOT, cache)
            cache.mkdir(parents=True, exist_ok=True)
            cache_lock = cache / 'lock.sqlite'
            safe_path(ROOT, cache_lock)
            db = stack.enter_context(closing(sqlite3.connect(cache_lock, timeout=0)))
            db.execute('BEGIN IMMEDIATE')
        proposed = plan(ROOT, args.scope)
        if args.quiet:
            print(f"Retention candidates: {len(proposed['remove'])} files, {proposed['candidateBytes']} bytes", flush=True)
        else:
            print(json.dumps(proposed, indent=2), flush=True)
        if args.apply and proposed['remove']:
            check = privileged_process_references if args.privileged_process_check else process_references
            print(f'Receipt: {apply_plan(ROOT, proposed, check)}')


if __name__ == '__main__':
    main()
