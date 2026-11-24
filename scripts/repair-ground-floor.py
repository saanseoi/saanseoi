#!/usr/bin/env python3
"""Rehearse canonical ground-floor repairs; --apply-local writes hash-guarded updates.

Retains unit identities and snapshot revisions. Saves affected before-images and
rollback SQL. Production application requires independently matching before-images.
"""
import importlib.util,json,hashlib,sqlite3,pathlib,sys
ROOT=pathlib.Path(__file__).resolve().parents[1]
s=importlib.util.spec_from_file_location('bootstrap',ROOT/'scripts/d1-bootstrap.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
OUT=ROOT/'.local/ground-floor-repair';OUT.mkdir(exist_ok=True)
def encode(v):return json.dumps(v,ensure_ascii=False,separators=(',',':'))
def digest(v):return hashlib.sha256(encode(v).encode()).hexdigest()
def version(r):
 keys=['id','address2dId','unresolvedSectionIds','units','unitCount','contentHash','sources']
 return digest({k:json.loads(r[k]) if k in ['unresolvedSectionIds','units','sources'] and r[k] else r[k] for k in keys})
def literal(v):return "'"+str(v).replace("'","''")+"'"
paths=m.local_paths()
assert not m.blockers(m.connect(paths['DB_META']))
for binding,path in paths.items():
 if binding!='DB_CURRENT' and not binding.startswith('DB_HISTORY'):continue
 db=m.connect(path);db.row_factory=sqlite3.Row
 rows=[dict(r) for r in db.execute("SELECT * FROM address3d a WHERE EXISTS (SELECT 1 FROM json_each(a.units) u WHERE json_extract(u.value,'$.floorType')='G' AND json_extract(u.value,'$.floorRef')='G')")]
 if not rows:continue
 (OUT/(binding+'.before.json')).write_text(encode(rows))
 updates=[];rollback=[];fixed=0
 for row in rows:
  units=json.loads(row['units']);assert digest({'units':units})==row['contentHash'],(binding,row['id'],'content')
  if 'versionHash' in row:assert version(row)==row['versionHash'],(binding,row['id'],'version')
  new=dict(row)
  for unit in units:
   if unit['floorType']=='G' and unit['floorRef']=='G':unit['floorRef']='';fixed+=1
  new['units']=encode(units);new['contentHash']=digest({'units':units})
  if 'versionHash' in row:new['versionHash']=version(new)
  fields=['units','contentHash']+(['versionHash'] if 'versionHash' in row else [])
  identity=['id','scopeId' if 'scopeId' in row else 'snapshotId']
  for old,replacement,output in [(row,new,updates),(new,row,rollback)]:
   where=' AND '.join(k+'='+literal(old[k]) for k in identity+['contentHash'])
   output.append('UPDATE address3d SET '+','.join(k+'='+literal(replacement[k]) for k in fields)+' WHERE '+where+';')
 (OUT/(binding+'.sql')).write_text('\n'.join(updates))
 (OUT/(binding+'.rollback.sql')).write_text('\n'.join(rollback))
 # Rehearse exact updates on an isolated copy of the affected rows.
 trial=sqlite3.connect(':memory:');schema=db.execute("select sql from sqlite_master where name='address3d'").fetchone()[0];trial.execute(schema)
 for row in rows:trial.execute('INSERT INTO address3d ('+','.join(row)+') VALUES ('+','.join('?' for _ in row)+')',list(row.values()))
 for sql in updates:assert trial.execute(sql).rowcount==1
 print(binding,len(rows),'collections',fixed,'units; hashes verified and repair rehearsed')
 if '--apply-local' in sys.argv:
  db.close();db=sqlite3.connect(path,timeout=5)
  with db:
   for sql in updates:assert db.execute(sql).rowcount==1
  print('applied',binding)
