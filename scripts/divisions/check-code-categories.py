"""Check assigned and proposed codes by category without changing assignments."""
import argparse
import collections
import json
import pathlib
import re

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--inventory', required=True)
parser.add_argument('--assignments', required=True)
parser.add_argument('--proposals')
parser.add_argument('--review')
parser.add_argument('--out', required=True)
args = parser.parse_args()
rows = {r['id']: dict(r['properties'], id=r['id']) for r in json.load(open(args.inventory))}
codes = {r['id']: (r['divisionCode'], 'assigned') for r in rows.values() if r.get('divisionCode')}
for assignment in json.load(open(args.assignments))['assignments']:
    identity = assignment['canonicalId']
    if identity not in rows:
        raise ValueError(f'Unknown assigned identity: {identity}')
    codes[identity] = (assignment['divisionCode'], 'assigned')
if args.proposals:
    for proposal in json.load(open(args.proposals)):
        if proposal['status'] == 'proposal':
            codes.setdefault(proposal['id'], (proposal['code'], 'proposal'))
if args.review:
    for line in pathlib.Path(args.review).read_text().splitlines():
        match = re.fullmatch(r'\s+([A-Z0-9]+) \((assigned|proposal)\) : .* ([\w-]+)\s*', line)
        if match:
            code, status, identity = match.groups()
            if identity not in rows:
                raise ValueError(f'Unknown reviewed identity: {identity}')
            codes[identity] = (code, status + '; reviewed')
groups = collections.defaultdict(list)
for identity, (code, status) in codes.items():
    row = rows[identity]
    category = row.get('category')
    if not category:
        raise ValueError(f'Missing category: {identity}')
    groups[category, code].append(dict(id=identity, name=row['names'].get('en', {}).get('name'),
        zhHant=row['names'].get('zh-hant', {}).get('name'), divisionClass=row['class'], status=status))
conflicts = [dict(category=category, code=code, divisions=divisions)
             for (category, code), divisions in sorted(groups.items()) if len(divisions) > 1]
out = pathlib.Path(args.out)
out.mkdir(parents=True, exist_ok=True)
(out / 'category-conflicts.json').write_text(json.dumps(conflicts, ensure_ascii=False, indent=2) + '\n')
lines = [f'{len(conflicts)} category code conflicts across {len(codes)} assigned or proposed codes.',
         'Includes current fixture assignments, scoped proposals and explicit edits in the review file.',
         'Proposals and reviewed edits have not been applied to source assignments.', '']
for conflict in conflicts:
    lines.append(f"{conflict['category']} / {conflict['code']}")
    for row in conflict['divisions']:
        lines.append(f"  {row['name']} / {row['zhHant']} ({row['divisionClass']}; {row['status']}) {row['id']}")
(out / 'category-conflicts.txt').write_text('\n'.join(lines) + '\n')
print('\n'.join(lines))
