import gzip
import importlib.util
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch


SCRIPT = Path(__file__).with_name("rotate-local-log.py")
spec = importlib.util.spec_from_file_location("rotation", SCRIPT)
rotation = importlib.util.module_from_spec(spec)
spec.loader.exec_module(rotation)


class RotationTests(unittest.TestCase):
    def test_preserves_bytes_and_open_append_descriptor(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "service.log"
            original = b"first\n" * 1000
            path.write_bytes(original)
            inode = path.stat().st_ino
            with path.open("ab", buffering=0) as writer:
                self.assertTrue(rotation.rotate(path, None, 100, 2))
                self.assertEqual(path.stat().st_ino, inode)
                writer.write(b"continued\n")
            archive = next((path.parent / "log-archives").glob("*.gz"))
            with gzip.open(archive, "rb") as saved:
                self.assertEqual(saved.read(), original)
            self.assertEqual(path.read_bytes(), b"continued\n")
            self.assertFalse(rotation.rotate(path, None, 100, 2))

    def test_copy_failure_preserves_source_and_thaws_service(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "service.log"
            path.write_bytes(b"preserve" * 100)
            calls = []

            def run(args, **kwargs):
                calls.append(args)
                if args[0] == "cp":
                    raise RuntimeError("copy failed")
                return subprocess.CompletedProcess(args, 0)

            with patch.object(rotation.subprocess, "run", run):
                with self.assertRaises(RuntimeError):
                    rotation.rotate(path, "writer.service", 100, 2)
            self.assertEqual(path.read_bytes(), b"preserve" * 100)
            self.assertIn(["systemctl", "--user", "thaw", "writer.service"], calls)

    def test_concurrent_streams_obey_limit_and_retention(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "service.log"
            commands = ["python3", str(SCRIPT), str(path), "--stdin", "--size-mib", "1"]
            writers = [subprocess.Popen(commands, stdin=subprocess.PIPE,
                       stdout=subprocess.DEVNULL) for _ in range(2)]
            for _ in range(32):
                for i, writer in enumerate(writers):
                    writer.stdin.write(bytes([65 + i]) * 65536)
                    writer.stdin.flush()
            for writer in writers:
                writer.stdin.close()
                self.assertEqual(writer.wait(timeout=15), 0)
            archives = sorted((path.parent / "log-archives").glob("*.gz"))
            contents = path.read_bytes()
            for archive in archives:
                with gzip.open(archive, "rb") as saved:
                    chunk = saved.read()
                self.assertEqual(len(chunk), 1024 * 1024)
                contents += chunk
            self.assertLessEqual(path.stat().st_size, 1024 * 1024)
            self.assertEqual(contents.count(b"A"), 2 * 1024 * 1024)
            self.assertEqual(contents.count(b"B"), 2 * 1024 * 1024)
            rotation.rotate(path, None, 1, 2)
            self.assertEqual(len(list((path.parent / "log-archives").glob("*.gz"))), 2)


if __name__ == "__main__":
    unittest.main()
