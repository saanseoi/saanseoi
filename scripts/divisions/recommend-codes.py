"""Draft codes from a SOURCE audit; never applies unreviewed recommendations."""
import argparse,collections,json,re,pathlib,itertools
p=argparse.ArgumentParser();p.add_argument('--inventory',required=True);p.add_argument('--requested',required=True);p.add_argument('--out',required=True);p.add_argument('--hk-kowloon-only',action='store_true');a=p.parse_args()
rows=json.load(open(a.inventory));out=pathlib.Path(a.out);out.mkdir(parents=True,exist_ok=True)
rows=[{**r['properties'],'id':r['id']} for r in rows]
def name(r,locale='en'):return r['names'].get(locale,{}).get('name','')
def norm(n):return re.sub(r'[^a-z0-9]','',n.lower())
# Explicit disambiguations supplied by the user's bilingual list.
selectors={'Tai Hang':'fc40613a-be4e-408f-9414-deae675850a7','Ping Shan':'ss-8b1c69bf-eff8-5bcd-acd7-3e5071bee1d6'}
aliases={'West Kowloon Reclamation':'West Kowloon','Lantau Island':'Lantau','Peak':'The Peak','Yau Yat Tsuen':'Yau Yat Chuen','Starstreet Precinct':'Starstreet'}
assigned={r['id']:r['divisionCode'] for r in rows if r.get('divisionCode')};unmatched=[]
for line in open(a.requested):
 code,n=line.strip().split('|'); target=aliases.get(n,n)
 if n=='Lei Muk Shue':continue
 candidates=[r for r in rows if norm(name(r))==norm(target) and r['class'] not in ['area','district']]
 if n in selectors:candidates=[r for r in candidates if r['id']==selectors[n]]
 elif len(candidates)>1:
  candidates=[r for r in candidates if r['class'] in ['town','macrohood','neighbourhood','microhood']]
 if len(candidates)!=1:unmatched.append({'code':code,'name':n,'candidates':[r['id'] for r in candidates]});continue
 assigned[candidates[0]['id']]=code+'V' if candidates[0]['class'] in ['village','hamlet'] and not code.endswith('V') else code
allrows=rows
areas={'ss-25cec859-44f3-5e1d-a72b-952f804e56ab','ss-bb5c7e0a-fd09-5416-8bb8-9593c90280fb'}
def in_scope(r):return r['id'] in areas or any(p['id'] in areas for path in r['hierarchies']['administrative'] for p in path)
held=[r for r in rows if a.hk_kowloon_only and r['id'] not in assigned and not in_scope(r)]
rows=[r for r in rows if r not in held]
(out/'held-outside-scope.json').write_text(json.dumps([{'id':r['id'],'name':name(r),'class':r['class']} for r in held],ensure_ascii=False,indent=2)+'\n')
used=collections.defaultdict(set);conflicts=[]
for r in rows:
 if r['id'] in assigned:
  code=assigned[r['id']]
  if code in used[r['class']]:conflicts.append({'class':r['class'],'code':code})
  used[r['class']].add(code)
if conflicts:raise ValueError(conflicts)
def initial(r):
 words=re.findall(r'[A-Za-z0-9]+',name(r).replace("'",''));words=[w for w in words if w.lower() not in ['the','and','of']]
 if r['class'] in ['village','hamlet']:
  if words and words[-1].lower() in ['tsuen','village','hamlet']:words.pop()
  return ''.join(w[0].upper() for w in words)+'V'
 return ''.join(w[0].upper() for w in words) or 'X'
groups=collections.defaultdict(list);names=collections.defaultdict(list);draft=[]
for r in rows:
 groups[(r['class'],initial(r))].append(r)
 for locale in ['en','zh-hant']:
  if name(r,locale):names[(r['class'],locale,name(r,locale).casefold())].append(r)
for r in sorted(rows,key=lambda r:(r['class'],name(r).casefold(),r['id'])):
 base=initial(r);code=assigned.get(r['id']);reason='supplied' if code else 'initials'
 if not code:
  code=base
  if name(r)=='Ta Ku Ling':code='TKUL'
  if name(r)=='Ta Kwu Ling':code='TKWL'
  if code in used[r['class']]:
   words=re.findall(r'[A-Za-z0-9]+',name(r).replace("'",''));words=[w.upper() for w in words if w.lower() not in ['the','and','of']]
   suffix='V' if r['class'] in ['village','hamlet'] else ''
   if suffix and words and words[-1] in ['TSUEN','VILLAGE','HAMLET']:words.pop()
   same=[x for x in rows if x['class']==r['class'] and norm(name(x))==norm(name(r))]
   choices=[]
   # Distinguish different names by expanding a word; X is for homonyms.
   if len(same)>1:
    choices=[base[:-1]+'XV' if suffix else base+'X']
    districts=sorted({x['name'].replace(' District','') for path in r['hierarchies']['administrative'] for x in path if x['class']=='district'})
    for district in districts:
     qualifier=''.join(w[0] for w in district.upper().split())
     choices.append((base[:-1] if suffix else base)+qualifier+suffix)
   for extra in range(1,5):
    for sizes in itertools.product(*[range(1,min(len(w),extra+1)+1) for w in words]):
     if sum(sizes)!=len(words)+extra:continue
     choices.append(''.join(w[:size] for w,size in zip(words,sizes))+suffix)
    if choices and any(c not in used[r['class']] and (r['class'],c) not in groups for c in choices):break
   code=next((c for c in choices if c not in used[r['class']] and (r['class'],c) not in groups),base)
   while code in used[r['class']]:code=code[:-1]+'XV' if suffix else code+'X'
   reason='homonym; review' if len(same)>1 else 'expanded word; review' 
  used[r['class']].add(code)
 parents=sorted({x['name'] for path in r['hierarchies']['administrative'] for x in path if x['class']=='district'})
 draft.append(dict(id=r['id'],divisionClass=r['class'],level=r['level'],name=name(r),zhHant=name(r,'zh-hant'),districts=parents,code=code,status='assigned' if r['id'] in assigned else 'proposal',reason=reason))
for filename,data in [('proposals.json',draft),('unmatched.json',unmatched),('code-collisions.json',[{'class':k[0],'initialCode':k[1],'divisions':[r['id'] for r in v]} for k,v in groups.items() if len(v)>1]),('name-collisions.json',[{'class':k[0],'locale':k[1],'name':k[2],'divisions':[r['id'] for r in v]} for k,v in names.items() if len(v)>1])]:
 (out/filename).write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
lookup={r['id']:r for r in draft}
lines=['Division code review','',f'{len(assigned)} assigned; {len(draft)-len(assigned)} proposals. Proposals are not applied.','Uniqueness is per class, not numeric level. X is inserted before V for villages/hamlets.','']
for k,v in names.items():
 if len(v)<2:continue
 lines.append(f'{k[0]} / {k[1]} / {k[2]}')
 for r in v:
  d=lookup[r['id']];lines.append(f"  {d['code']} : {d['name']} / {d['zhHant']} [{', '.join(d['districts'])}] {d['id']}")
(out/'name-collisions.txt').write_text('\n'.join(lines)+'\n')
(out/'missing-codes.txt').write_text('\n'.join(f"{r['divisionClass']} | {r['code']} | {r['name']} | {r['zhHant']} | {', '.join(r['districts'])} | {r['id']}" for r in draft if r['status']=='proposal')+'\n')
print(json.dumps({'assigned':len(assigned),'proposed':len(draft)-len(assigned),'unmatched':unmatched,'heldOutsideScope':len(held),'nameCollisionGroups':sum(len(v)>1 for v in names.values())},ensure_ascii=False,indent=2))

level_groups=collections.defaultdict(list)
for r in draft:
 for key in ['name','zhHant']:
  if r[key] and r['level'] is not None:level_groups[(r['level'],key,r[key].casefold())].append(r)
lines=['Same-level name collisions in the selected review scope','']
for (level,locale,n),group in sorted(level_groups.items()):
 if len(group)<2:continue
 lines.append(f'Level {level}: {n} ({locale})')
 for r in group:lines.append(f"  {r['divisionClass']} {r['code']} : {r['name']} / {r['zhHant']} [{', '.join(r['districts'])}] {r['id']}")
(out/'level-name-collisions.txt').write_text('\n'.join(lines)+'\n')
lines=['Initial-code collisions, including reservations by supplied codes','']
for (cls,code),group in sorted(groups.items()):
 targets={r['id'] for r in group};targets.update(r['id'] for r in rows if r['class']==cls and assigned.get(r['id'])==code)
 if len(targets)<2 or not any(x not in assigned for x in targets):continue
 lines.append(f'{cls} / {code}')
 for id in sorted(targets):
  r=lookup[id];lines.append(f"  {r['code']} ({r['status']}) : {r['name']} / {r['zhHant']} [{', '.join(r['districts'])}] {id}")
(out/'code-conflicts.txt').write_text('\n'.join(lines)+'\n')
