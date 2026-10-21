"""Prepare separate building inventories, exact overlap evidence and preview inputs.

Usage: python scripts/buildings/prepare.py --landsd FILE --overture FILE --out DIR
Inputs are pinned releases; results never merge inventories or assign GERS IDs.
"""
import argparse
import hashlib
import json
from pathlib import Path
import sqlite3

import geopandas as gpd
import numpy as np
import pyarrow.parquet as pq
import shapely


def sql_value(value):
    """Quote a value for an offline, generated SQL import file."""
    if value is None:
        return 'NULL'
    if isinstance(value, (int, float, np.number)):
        return str(value)
    return "'" + str(value).replace("'", "''") + "'"


def load_inputs(landsd_path, overture_path):
    """Retain publisher identities and original WGS84 geometry independently."""
    landsd = gpd.read_file(landsd_path, engine='pyogrio')
    source = pq.read_table(overture_path)
    overture = gpd.GeoDataFrame(source.drop(['geometry']).to_pandas(), geometry=shapely.from_wkb(source['geometry'].to_pylist()), crs=4326)
    result = {}
    for name, frame in [('landsd', landsd), ('overture', overture)]:
        ids = frame.BuildingCSUID.astype(str).tolist() if name == 'landsd' else frame.id.tolist()
        assert len(ids) == len(set(ids)), f'{name}: duplicate source identity'
        if name == 'landsd':
            names = [f'{en or ""} {tc or ""}'.strip() for en, tc in zip(frame.BuildingNameEN.fillna(''), frame.BuildingNameTC.fillna(''))]
        else:
            names = [(n or {}).get('primary') or '' for n in frame.names]
        result[name] = {'frame': frame, 'ids': ids, 'names': names}
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--landsd', required=True, type=Path)
    parser.add_argument('--overture', required=True, type=Path)
    parser.add_argument('--out', required=True, type=Path)
    args = parser.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    assert not (args.out / 'review.sqlite').exists(), 'Use a fresh output directory; do not overwrite review evidence.'
    inventories = load_inputs(args.landsd, args.overture)
    db = sqlite3.connect(args.out / 'review.sqlite')
    db.execute('PRAGMA journal_mode=OFF')
    metadata = {'releases': {'landsd':'2026-09-21','overture':'2026-09-23.1'}, 'metric':'intersection area / each polygon area, EPSG:2326, strict >0.99, no buffers or rounding', 'inventoriesSeparate':True, 'inputs':{}, 'counts':{}, 'invalid':{}}
    for name, item in inventories.items():
        frame = item['frame']
        projected = frame.to_crs(2326).geometry.array
        invalid = ~shapely.is_valid(projected)
        repaired = shapely.make_valid(projected)
        areas = shapely.area(repaired)
        assert np.all(areas > 0), f'{name}: zero-area geometry requires review'
        item.update(projected=repaired, areas=areas, invalid=invalid)
        metadata['invalid'][name] = int(invalid.sum())
        metadata['counts'][name] = len(frame)
        input_path = args.landsd if name == 'landsd' else args.overture
        metadata['inputs'][name] = {'path':str(input_path), 'sha256':hashlib.file_digest(input_path.open('rb'),'sha256').hexdigest()}
        table = 'benchmarkLandsdBuilding' if name == 'landsd' else 'benchmarkOvertureBuilding'
        schema = f'CREATE TABLE {table} (id TEXT PRIMARY KEY, name TEXT NOT NULL, geometry TEXT NOT NULL, minX REAL NOT NULL, minY REAL NOT NULL, maxX REAL NOT NULL, maxY REAL NOT NULL);'
        index = f'CREATE INDEX {table}_bbox ON {table}(minX,maxX,minY,maxY);'
        db.execute(schema)
        bounds = shapely.bounds(frame.geometry.array)
        geoms = shapely.to_geojson(frame.geometry.array)
        rows = list(zip(item['ids'],item['names'],geoms,*bounds.T))
        db.executemany(f'INSERT INTO {table} VALUES (?,?,?,?,?,?,?)', rows)
        db.execute(index)
        # The preview benchmark uses separate scratch tables, not production migrations.
        with (args.out / f'{name}.sql').open('w') as output:
            output.write(schema+'\n')
            for row in rows:
                if len(row[2].encode()) > 60000:
                    initial = list(row); initial[2] = ''
                    output.write(f'INSERT INTO {table} VALUES ('+','.join(sql_value(x) for x in initial)+');\n')
                    for offset in range(0,len(row[2]),60000):
                        output.write(f'UPDATE {table} SET geometry=geometry||'+sql_value(row[2][offset:offset+60000])+' WHERE id='+sql_value(row[0])+';\n')
                else:
                    output.write(f'INSERT INTO {table} VALUES ('+','.join(sql_value(x) for x in row)+');\n')
            output.write(index+'\n')
        fgb = gpd.GeoDataFrame({'id':item['ids'],'name':item['names']},geometry=frame.geometry.array,crs=4326)
        fgb.to_file(args.out / f'{name}.fgb',driver='FlatGeobuf',engine='pyogrio')
        print('Prepared',name,len(rows),flush=True)
    # Repair only the analysis copy; original invalid source geometries stay untouched.
    left, right = inventories['landsd'], inventories['overture']
    tree = shapely.STRtree(right['projected'])
    db.executescript('CREATE TABLE buildingOverlap (landsdId TEXT NOT NULL,overtureId TEXT NOT NULL,landsdCoverage REAL NOT NULL,overtureCoverage REAL NOT NULL,iou REAL NOT NULL,intersectionM2 REAL NOT NULL,landsdAreaM2 REAL NOT NULL,overtureAreaM2 REAL NOT NULL,repaired INTEGER NOT NULL,PRIMARY KEY(landsdId,overtureId)); CREATE INDEX buildingOverlap_overture ON buildingOverlap(overtureId);')
    pairs_count = 0
    for start in range(0,len(left['ids']),10000):
        local_i, j = tree.query(left['projected'][start:start+10000])
        i = local_i + start
        intersection = shapely.area(shapely.intersection(left['projected'][i],right['projected'][j]))
        positive = intersection > 0
        i,j,intersection=i[positive],j[positive],intersection[positive]
        rows=[]
        for a,b,area in zip(i,j,intersection):
            la,oa=left['areas'][a],right['areas'][b]
            rows.append((left['ids'][a],right['ids'][b],min(1.,area/la),min(1.,area/oa),area/(la+oa-area),area,la,oa,int(left['invalid'][a] or right['invalid'][b])))
        db.executemany('INSERT INTO buildingOverlap VALUES (?,?,?,?,?,?,?,?,?)',rows)
        pairs_count += len(rows)
    # Mutual candidates must be unique in BOTH directions; even these remain proposals.
    db.executescript('''CREATE TABLE buildingReview AS
      SELECT b.id,b.name,b.minX,b.minY,b.maxX,b.maxY,
      CASE WHEN (SELECT COUNT(*) FROM buildingOverlap p WHERE p.landsdId=b.id AND p.landsdCoverage>.99)>1 THEN 'ambiguous'
      WHEN EXISTS(SELECT 1 FROM buildingOverlap p WHERE p.landsdId=b.id AND p.landsdCoverage>.99 AND p.overtureCoverage>.99 AND (SELECT COUNT(*) FROM buildingOverlap q WHERE q.overtureId=p.overtureId AND q.landsdCoverage>.99 AND q.overtureCoverage>.99)=1) THEN 'mutual'
      WHEN EXISTS(SELECT 1 FROM buildingOverlap p WHERE p.landsdId=b.id AND p.landsdCoverage>.99 AND p.overtureCoverage>.99) THEN 'ambiguous'
      WHEN EXISTS(SELECT 1 FROM buildingOverlap p WHERE p.landsdId=b.id AND p.landsdCoverage>.99) THEN 'partial'
      WHEN EXISTS(SELECT 1 FROM buildingOverlap p WHERE p.landsdId=b.id AND p.overtureCoverage>.99) THEN 'reverse-partial'
      WHEN EXISTS(SELECT 1 FROM buildingOverlap p WHERE p.landsdId=b.id) THEN 'overlap'
      ELSE 'unmatched' END AS status FROM benchmarkLandsdBuilding b;
      CREATE UNIQUE INDEX buildingReview_id ON buildingReview(id);
      CREATE INDEX buildingReview_status ON buildingReview(status,id);''')
    metadata['overlapPairs']=pairs_count
    metadata['reviewCategories']=dict(db.execute('SELECT status,COUNT(*) FROM buildingReview GROUP BY status'))
    metadata['landsdOver99Percent']=db.execute('SELECT COUNT(DISTINCT landsdId) FROM buildingOverlap WHERE landsdCoverage>.99').fetchone()[0]
    metadata['mutualOver99Percent']=db.execute('SELECT COUNT(DISTINCT landsdId) FROM buildingOverlap WHERE landsdCoverage>.99 AND overtureCoverage>.99').fetchone()[0]
    metadata['partialOnlyOver99Percent']=db.execute('SELECT COUNT(DISTINCT landsdId) FROM buildingOverlap p WHERE landsdCoverage>.99 AND NOT EXISTS(SELECT 1 FROM buildingOverlap q WHERE q.landsdId=p.landsdId AND q.landsdCoverage>.99 AND q.overtureCoverage>.99)').fetchone()[0]
    metadata['unrepairedUniqueMutual']=db.execute("SELECT COUNT(*) FROM buildingReview r WHERE status='mutual' AND EXISTS(SELECT 1 FROM buildingOverlap p WHERE p.landsdId=r.id AND p.landsdCoverage>.99 AND p.overtureCoverage>.99 AND repaired=0)").fetchone()[0]
    db.commit()
    assert db.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
    db.close()
    (args.out/'summary.json').write_text(json.dumps(metadata,indent=2))
    print(json.dumps(metadata),flush=True)


if __name__ == '__main__':
    main()
