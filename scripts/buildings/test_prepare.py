"""Exercise the complete preparation path with separate synthetic source inventories."""
import json
from pathlib import Path
import sqlite3
import subprocess
import tempfile
import unittest
import geopandas as gpd
import pyarrow as pa
import pyarrow.parquet as pq
import shapely

class PrepareTest(unittest.TestCase):
    def test_bidirectional_overlap_and_inventory_preservation(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)
            # Spatially isolated examples: mutual, contained, containing, ambiguous, disjoint, invalid.
            lands=[shapely.box(0,0,10,10),shapely.box(100,0,105,5),shapely.box(200,0,220,20),shapely.box(300,0,310,10),shapely.box(400,0,410,10),shapely.Polygon([(500,0),(510,10),(500,10),(510,0),(500,0)])]
            overture=[shapely.box(0,0,10,10),shapely.box(99,-1,110,10),shapely.box(201,1,205,5),shapely.box(300,0,310,10),shapely.box(299,-1,311,11)]
            def geographic(polygons):
                return gpd.GeoSeries([shapely.affinity.translate(p,836000,819000) for p in polygons],crs=2326).to_crs(4326)
            left=gpd.GeoDataFrame({'BuildingCSUID':[str(i) for i in range(6)],'BuildingNameEN':['Test']*6,'BuildingNameTC':['測試']*6},geometry=geographic(lands),crs=4326)
            left.to_file(root/'landsd.geojson',driver='GeoJSON')
            pq.write_table(pa.table({'id':[f'gers-{i}' for i in range(5)],'names':[{'primary':'Test'}]*5,'geometry':shapely.to_wkb(geographic(overture).array).tolist()}),root/'overture.parquet')
            subprocess.run(['python',str(Path(__file__).with_name('prepare.py')),'--landsd',str(root/'landsd.geojson'),'--overture',str(root/'overture.parquet'),'--out',str(root/'out')],check=True,capture_output=True)
            db=sqlite3.connect(root/'out/review.sqlite')
            statuses=dict(db.execute('SELECT id,status FROM buildingReview'))
            self.assertEqual(statuses,{'0':'mutual','1':'partial','2':'reverse-partial','3':'ambiguous','4':'unmatched','5':'unmatched'})
            self.assertEqual(db.execute('SELECT COUNT(*) FROM benchmarkOvertureBuilding').fetchone()[0],5)
            metadata=json.loads((root/'out/summary.json').read_text())
            self.assertEqual(metadata['landsdOver99Percent'],3)
            self.assertEqual(metadata['mutualOver99Percent'],2)
            self.assertEqual(metadata['unrepairedUniqueMutual'],1)
            self.assertEqual(metadata['invalid']['landsd'],1)
            # Replay the actual preview SQL and verify independent identities and geometry.
            replay=sqlite3.connect(':memory:')
            for name,table in [('landsd','benchmarkLandsdBuilding'),('overture','benchmarkOvertureBuilding')]:
                replay.executescript((root/f'out/{name}.sql').read_text())
                self.assertEqual(replay.execute(f'SELECT * FROM {table} ORDER BY id').fetchall(),db.execute(f'SELECT * FROM {table} ORDER BY id').fetchall())

if __name__=='__main__': unittest.main()
