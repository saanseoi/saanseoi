import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch
import tempfile
import hashlib
import json

spec = importlib.util.spec_from_file_location('publisher', Path(__file__).with_name('publish.py'))
publisher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(publisher)


class RetentionTests(unittest.TestCase):
    def test_keeps_newest_two_regardless_of_backfill_order(self):
        versions = [{'version': date, 'status': status} for date, status in [
            ('2026-09-01', 'available'), ('2026-07-01', 'retired'),
            ('2026-08-01', 'available'), ('2026-10-01', 'available')]]
        kept, removed = publisher.retention_plan(versions)
        self.assertEqual([v['version'] for v in kept], ['2026-10-01', '2026-09-01'])
        self.assertEqual([v['version'] for v in removed], ['2026-08-01'])

    def test_only_exact_edition_payloads_can_be_deleted(self):
        entry = {'version': '2026-08-01', 'payloads': [
            'routing/hk/2026-08-01/' + name for name in
            ('region.osm.pbf', 'valhalla.tar.gz', 'graphhopper.tar.gz')]}
        self.assertEqual(publisher.retirement_keys('hk', entry), entry['payloads'])
        for foreign in ['osm/geofabrik/guangdong/2026-08-01.osm.pbf',
                        'routing/hk/latest.json', 'routing/mo/2026-08-01/valhalla.tar.gz',
                        'routing/hk/2026-08-01/recipe.json',
                        'routing/hk/2026-08-01/extra/valhalla.tar.gz']:
            with self.assertRaises(RuntimeError):
                publisher.retirement_keys('hk', {**entry, 'payloads': [*entry['payloads'][:2], foreign]})

    def test_incomplete_edition_does_not_displace_retained_graphs(self):
        kept, removed = publisher.retention_plan([
            {'version': '2026-09-01', 'status': 'available'},
            {'version': '2026-10-01', 'status': 'available'},
            {'version': '2026-11-01', 'status': 'building'}])
        self.assertEqual(len(kept), 2)
        self.assertEqual(removed, [])


class RecipeTests(unittest.TestCase):
    def test_recipe_only_never_builds_or_changes_discovery(self):
        boundary = b'{"type":"FeatureCollection","features":[]}'
        metadata = {'provenance': {'source': {'sourceArchive': {
            'key': 'osm/geofabrik/guangdong/2025-01-02.osm.pbf',
            'sha256': 'a' * 64, 'size': 123}}},
            'release': {'boundary': {'sha256': hashlib.sha256(boundary).hexdigest(),
                                     'size': len(boundary)}}}
        def fake_get(key, path, optional=False):
            if key.startswith('routing/'): return False
            path.write_bytes(boundary if key.endswith('.geojson') else json.dumps(metadata).encode())
            return True
        with tempfile.TemporaryDirectory() as directory, \
                patch.object(publisher, 'WORK', Path(directory)), \
                patch.object(publisher, 'get', side_effect=fake_get), \
                patch.object(publisher, 'upload') as upload, \
                patch.object(publisher, 'complete_publication') as complete, \
                patch.object(publisher.subprocess, 'check_output', return_value='Content-Length: 123\n'):
            publisher.publish_recipe('hk', '2025-01-02', {'valhalla': {'version': '3.8.3', 'profiles': []}})
            manifest = json.loads((Path(directory) / 'hk/2025-01-02/manifest.json').read_text())
            self.assertEqual(manifest['status'], 'recipe-only')
            self.assertNotIn('pbf', manifest)
            self.assertNotIn('sha256', manifest['engines']['valhalla'])
            self.assertEqual([call.args[0] for call in upload.call_args_list], [
                'routing/hk/2025-01-02/recipe.json',
                'routing/hk/2025-01-02/rebuild.py',
                'routing/hk/2025-01-02/manifest.json'])
            complete.assert_not_called()


if __name__ == '__main__': unittest.main()
