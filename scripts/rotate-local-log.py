#!/usr/bin/env python3
"""Rotate an append-only local service log without restarting its writer."""

import argparse
import fcntl
import gzip
import hashlib
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import time


def thaw_service(service):
    state = subprocess.run(
        ["systemctl", "--user", "show", service, "-p", "FreezerState", "--value"],
        check=True, capture_output=True, text=True,
    ).stdout.strip()
    if state in ("frozen", "freezing"):
        subprocess.run(["systemctl", "--user", "thaw", service], check=True)


def rotate(path, service, limit, keep):
    if not path.exists() or path.stat().st_size < limit:
        return False
    archives = path.parent / "log-archives"
    archives.mkdir(exist_ok=True)
    stamp = time.strftime("%Y%m%dT%H%M%S") + f"-{time.time_ns() % 1_000_000_000:09d}"
    archive = archives / f"{path.name}.{stamp}"
    frozen = False
    try:
        if service:
            active = subprocess.run(
                ["systemctl", "--user", "is-active", "--quiet", service],
                check=False,
            ).returncode == 0
            if active:
                subprocess.run(["systemctl", "--user", "freeze", service], check=True)
                frozen = True
        # Keep the inode: systemd's existing O_APPEND descriptors keep working.
        with path.open("r+b") as current:
            size = os.fstat(current.fileno()).st_size
            if size < limit:
                return False
            subprocess.run(["cp", "--reflink=auto", "--", str(path), str(archive)], check=True)
            with archive.open("rb") as saved:
                os.fsync(saved.fileno())
                if os.fstat(saved.fileno()).st_size != size:
                    raise RuntimeError("Archive size changed; refusing to truncate")
            current.truncate(0)
            current.flush()
            os.fsync(current.fileno())
    finally:
        if frozen:
            subprocess.run(["systemctl", "--user", "thaw", service], check=True)

    compressed = Path(str(archive) + ".gz")
    pending = Path(str(compressed) + ".tmp")
    with archive.open("rb") as source, gzip.open(pending, "wb", compresslevel=1) as target:
        shutil.copyfileobj(source, target, length=1024 * 1024)
    with pending.open("rb") as saved:
        os.fsync(saved.fileno())
    pending.replace(compressed)
    archive.unlink()
    previous = sorted(archives.glob(f"{path.name}.*.gz"), reverse=True)
    for old in previous[keep:]:
        old.unlink()
    print(f"Rotated {size} bytes to {compressed}", flush=True)
    return True


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("path", type=Path)
    parser.add_argument("--service", help="systemd user unit writing the log")
    parser.add_argument("--stdin", action="store_true", help="append stdin with size-bounded rotation")
    parser.add_argument("--thaw-only", action="store_true", help="recover a frozen writer after interruption")
    parser.add_argument("--size-mib", type=int, default=64)
    parser.add_argument("--keep", type=int, default=8)
    args = parser.parse_args()
    if args.size_mib < 1 or args.keep < 1:
        parser.error("size and retention must be positive")
    if not args.stdin and not args.service:
        parser.error("use --stdin or name the writing --service")
    path = args.path.resolve()
    limit = args.size_mib * 1024 * 1024
    lock_path = Path(str(path) + ".rotation.lock")
    if args.service:
        service_key = hashlib.sha256(args.service.encode()).hexdigest()[:16]
        lock_path = Path(tempfile.gettempdir()) / f"saanseoi-log-{os.getuid()}-{service_key}.lock"
    with lock_path.open("a") as lock:
        if not args.stdin:
            fcntl.flock(lock, fcntl.LOCK_EX)
            if args.thaw_only:
                thaw_service(args.service)
                return
            rotate(path, args.service, limit, args.keep)
            return
        while chunk := sys.stdin.buffer.read1(64 * 1024):
            fcntl.flock(lock, fcntl.LOCK_EX)
            try:
                while chunk:
                    rotate(path, None, limit, args.keep)
                    remaining = limit - (path.stat().st_size if path.exists() else 0)
                    with path.open("ab") as output:
                        output.write(chunk[:remaining])
                    chunk = chunk[remaining:]
            finally:
                fcntl.flock(lock, fcntl.LOCK_UN)


if __name__ == "__main__":
    main()
