import importlib.util
from pathlib import Path
import unittest

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


if __name__ == '__main__': unittest.main()
