import json, subprocess, time, urllib.request
from pathlib import Path
import argparse
parser=argparse.ArgumentParser(description='Record native smoke evidence, including known lift-landing failures; run under dev-check')
parser.add_argument('--prepared', type=Path, required=True)
parser.add_argument('--binaries', type=Path, required=True)
args=parser.parse_args()
root=args.prepared.resolve()
binaries=str(args.binaries.resolve())
g=json.loads((root/'stations/KOT.json').read_text()); nodes={n['id']:n for n in g['nodes']}
results=[]
for variant in ('all','unpaid'):
    config=json.loads((root/variant/'config.json').read_text()); config['mjolnir'].update(tile_dir=f'/work/{variant}/tiles',tile_extract=f'/work/{variant}/graph.tar')
    (root/variant/'test-config.json').write_text(json.dumps(config))
    cid=subprocess.check_output(['docker','run','-d','--rm','--memory=1g','--cpus=1','-p','127.0.0.1:18092:8002','-v',f'{root}:/work:Z','-v',f'{binaries}:/engine:ro,z','--entrypoint','/engine/valhalla_service','ghcr.io/valhalla/valhalla:3.8.3@sha256:70b45295d81035e3562e1bbf996a28d5fc55e1ccc5d7e3fff9f297d3b1a1359f',f'/work/{variant}/test-config.json','1'],text=True).strip()
    try:
        for i in range(40):
            try:
                urllib.request.urlopen('http://127.0.0.1:18092/status',timeout=2); break
            except Exception: time.sleep(.5)
        for kind in ('walkway','stairs','escalator','lift'):
            edges=[e for e in g['edges'] if e['kind']==kind and (variant=='all' or e['access']=='unpaid') and e['length']>3 and nodes[e['nodeIds'][0]]['levels'] and nodes[e['nodeIds'][-1]]['levels']]
            if not edges: continue
            e=max(edges,key=lambda e:e['length'])
            locations=[dict(lon=nodes[n]['point'][0],lat=nodes[n]['point'][1],search_filter=dict(level=nodes[n]['levels'][0]),radius=2) for n in (e['nodeIds'][0],e['nodeIds'][-1])]
            body=dict(locations=locations,costing='pedestrian',units='kilometers')
            try:
                r=json.load(urllib.request.urlopen(urllib.request.Request('http://127.0.0.1:18092/route',data=json.dumps(body).encode(),headers={'Content-Type':'application/json'}),timeout=20))
                results.append(dict(variant=variant,kind=kind,sourceEdge=e['id'],request=body,response=r))
                print(variant,kind,r['trip']['summary'],flush=True)
            except Exception as ex: results.append(dict(variant=variant,kind=kind,error=str(ex))); print(variant,kind,str(ex),flush=True)
    finally: subprocess.run(['docker','stop',cid],stdout=subprocess.DEVNULL)
(root/'native-validation.json').write_text(json.dumps(results,indent=2))
