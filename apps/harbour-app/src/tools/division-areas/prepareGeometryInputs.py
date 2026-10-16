import argparse,json,glob,duckdb,shutil
from pathlib import Path
from shapely.geometry import shape,mapping
parser=argparse.ArgumentParser(description='Prepare optional local division editor geometry assets from retained exports.')
parser.add_argument('--buildings', required=True, type=Path, help='Polygon building FeatureCollection GeoJSON')
parser.add_argument('--roads', required=True, type=Path, help='Road centreline FeatureCollection GeoJSON')
args=parser.parse_args()
output=Path('.local/division-review/assets')
output.mkdir(parents=True,exist_ok=True)
shutil.copyfile(args.roads,output/'road-centrelines.geojson')
c=duckdb.connect();features=[]
for path in glob.glob('.local/harbour-sql/releases/local/*/objects/hk/*/*/division-area.parquet'):
 parts=Path(path).parts;domain=parts[-3];cohort=parts[-2]
 if domain=='overture':continue
 cols={r[0] for r in c.execute('describe select * from read_parquet(?)',[path]).fetchall()}
 if not {'geometry','i18n','division_id'}.issubset(cols):continue
 for id,d,geo,names in c.execute('select id,division_id,geometry,i18n from read_parquet(?)',[path]).fetchall():
  try:
   g=json.loads(geo);n=json.loads(names);name=' / '.join(x['name'] for x in n if x.get('name') and x.get('locale') in ['en','zh-hant'])
   if not name:continue
   features.append(dict(type='Feature',geometry=g,properties=dict(divisionId=d,sourceAreaId=id,variant=domain,sourceDomain=domain,sourceCohort=cohort,name=name)))
  except (TypeError,ValueError):continue
(output/'catalogue.json').write_text(json.dumps(features,ensure_ascii=False))
print('catalogue',len(features))
x=json.load(open(args.buildings));buildings=[]
for f in x['features']:
 if f['geometry']['type'] not in ['Polygon','MultiPolygon']:continue
 g=shape(f['geometry']);p=g.centroid
 if 113.83<=p.x<=114.45 and 22.14<=p.y<=22.57:
  buildings.append(dict(type='Feature',geometry=mapping(g),properties=dict(id=f.get('id'),point=[p.x,p.y])))
(output/'buildings.json').write_text(json.dumps(buildings,separators=(',',':')))
print('buildings',len(buildings))
