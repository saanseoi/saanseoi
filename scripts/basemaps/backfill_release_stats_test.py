import importlib.util
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('backfill', Path(__file__).with_name('backfill-release-stats.py'))
backfill = importlib.util.module_from_spec(spec)
spec.loader.exec_module(backfill)

class SourceCountsTest(unittest.TestCase):
    def test_overlapping_tags_count_each_object_once_per_category(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'input.osm'
            path.write_text('''<osm version="0.6">
              <node id="1" lat="22" lon="114"><tag k="amenity" v="cafe"/><tag k="shop" v="bakery"/></node>
              <node id="2" lat="22" lon="114"><tag k="building" v="yes"/></node>
              <way id="1"><tag k="building" v="yes"/><tag k="amenity" v="school"/></way>
              <way id="2"><tag k="highway" v="footway"/><tag k="railway" v="no"/></way>
              <way id="3"><tag k="building" v="no"/><tag k="natural" v="coastline"/></way>
              <relation id="1"><tag k="building" v="apartments"/><tag k="place" v="locality"/></relation>
            </osm>''')
            counts = backfill.count_objects(path)
            self.assertEqual(counts, dict(buildings=2, roadsPaths=1, railways=0, pois=2, landuse=0, waterways=0, places=1))

if __name__ == '__main__':
    unittest.main()
