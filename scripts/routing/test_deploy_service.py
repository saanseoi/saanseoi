"""Offline checks for staging repaired routing bundles without deployment."""
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import tarfile
import tempfile
import unittest

SPEC = importlib.util.spec_from_file_location('deploy_service', Path(__file__).with_name('deploy-service.py'))
service = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(service)


class StageLocalBundleTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        self.worker = self.root / 'worker'
        self.worker.mkdir()
        self.engine = {'version': '3.8.3+6291', 'sourceCommit': 'pinned'}
        (self.worker / 'engine-release.json').write_text(json.dumps(self.engine))
        (self.worker / 'graph-release.json').write_text(json.dumps({'release': 'old'}))
        self.bundle = self.root / 'bundle.tar.gz'

    def bundle_sha(self, engine=None):
        """Create a tiny standalone bundle with explicit runtime paths and engine identity."""
        files = {'graph.tar': b'graph fixture',
                 'config.json': json.dumps({'mjolnir': {'tile_extract': '/routing/graph.tar'}}).encode(),
                 'recipe.json': json.dumps({'region': 'gba', 'engines': {'valhalla': engine or self.engine},
                                            'limitations': []}).encode()}
        with tarfile.open(self.bundle, 'w:gz') as archive:
            for name, contents in files.items():
                info = tarfile.TarInfo(name)
                info.size = len(contents)
                archive.addfile(info, io.BytesIO(contents))
        return hashlib.sha256(self.bundle.read_bytes()).hexdigest()

    def test_stages_verified_bundle_and_rejects_identity_reuse(self):
        sha = self.bundle_sha()
        service.stage_local_bundle(self.bundle, sha, 'repair-1', self.worker)
        release = json.loads((self.worker / 'graph-release.json').read_text())
        self.assertEqual(release['graphSha256'], hashlib.sha256(b'graph fixture').hexdigest())
        self.assertEqual(release['engine'], self.engine)
        service.stage_local_bundle(self.bundle, sha, 'repair-1', self.worker)
        release['graphSha256'] = 'different'
        (self.worker / 'graph-release.json').write_text(json.dumps(release))
        with self.assertRaisesRegex(ValueError, 'reuse'):
            service.stage_local_bundle(self.bundle, sha, 'repair-1', self.worker)

    def test_bad_checksum_changes_nothing(self):
        self.bundle_sha()
        with self.assertRaisesRegex(ValueError, 'checksum'):
            service.stage_local_bundle(self.bundle, 'wrong', 'repair-1', self.worker)
        self.assertFalse((self.worker / 'image-data').exists())
        self.assertEqual(json.loads((self.worker / 'graph-release.json').read_text()), {'release': 'old'})

    def test_wrong_engine_changes_nothing(self):
        sha = self.bundle_sha({'version': '3.8.3'})
        with self.assertRaisesRegex(ValueError, 'engine'):
            service.stage_local_bundle(self.bundle, sha, 'repair-1', self.worker)
        self.assertFalse((self.worker / 'image-data').exists())


if __name__ == '__main__':
    unittest.main()
