"""Repair existing Planning cell interpretations from pinned retained assertions.

Dry-run by default. Only non-omitted interpretations in Planning Division snapshots
are eligible; canonical content, replay membership and publisher payloads are read-only.
"""
import argparse
import json
import pathlib
import sqlite3


def quote(value):
    return "'" + str(value).replace("'", "''") + "'"


def repair(meta_path, history_path, source_path, output, apply=False):
    output = pathlib.Path(output)
    output.mkdir(parents=True, exist_ok=True)
    connections = [sqlite3.connect('file:' + str(pathlib.Path(p).resolve()) + '?mode=ro', uri=True)
                   for p in [meta_path, history_path, source_path]]
    meta, history, source = connections
    for db in connections:
        db.row_factory = sqlite3.Row
    versions = [db.execute('PRAGMA data_version').fetchone()[0] for db in connections]
    snapshots = list(meta.execute("SELECT * FROM snapshots WHERE code LIKE 'ss-hk-division-hkgov-pland-pu-%' AND resourceType='division' ORDER BY cohortKey"))
    assert snapshots, 'No Planning snapshots'
    changes, report, backup, journals = [], [], [], []
    for snapshot in snapshots:
        sid = snapshot['id']
        pins = {r[0] for r in meta.execute('SELECT resourceReleaseId FROM snapshotResourceReleases WHERE snapshotId=?', (sid,))}
        plan, cursor = [], snapshot
        while cursor:
            assert cursor['id'] not in [r['id'] for r in plan], 'Cyclic ancestry'
            plan.insert(0, cursor)
            cursor = meta.execute('SELECT * FROM snapshots WHERE id=?', (cursor['parentSnapshotId'],)).fetchone()
        inventory = {}
        for step in plan:
            for row in history.execute("SELECT * FROM historyEvents WHERE snapshotId=? AND recordType='division'", (step['id'],)):
                journals.append(dict(row))
                if row['operation'] == 'delete':
                    inventory.pop(row['recordId'], None)
                else:
                    canonical = history.execute('SELECT id,class,identifiers FROM divisions WHERE id=? AND snapshotId=? AND versionHash=?', (row['recordId'], row['snapshotId'], row['versionHash'])).fetchone()
                    assert canonical, 'Missing replay content'
                    inventory[row['recordId']] = canonical
        indexes = {}
        for row in inventory.values():
            level = row['class'].removeprefix('planning-')
            identifiers = json.loads(row['identifiers'])['hkgov-pland']
            fields = {'ppu': ['ppu'], 'spu': ['ppu', 'spu'], 'tpu': ['ppu', 'spu', 'tpu'], 'subunit': ['ppu', 'spu', 'tpu', 'subunit']}[level]
            key = (level, *(str(identifiers[k]) for k in fields))
            assert key not in indexes, 'Ambiguous canonical identity'
            indexes[key] = row['id']
        changed, omitted, covered = 0, 0, set()
        rows = list(history.execute('SELECT * FROM sourceResolutions WHERE snapshotId=?', (sid,)))
        for row in rows:
            resolution = json.loads(row['resolutions'])
            if any(d.get('type') == 'source_omission' for d in resolution.get('decisions', [])):
                assert resolution['entities'] == {}, 'Invalid omission'
                omitted += 1
                continue
            assert row['scopeId'] == 'snapshot:' + sid and row['sourceReleaseId'] in pins
            native = source.execute('SELECT properties FROM hkgovPlandPlanningCells WHERE sourceRecordId=? AND versionHash=?', (row['sourceRecordId'], row['sourceVersionHash'])).fetchone()
            assert native, 'Missing exact retained assertion'
            props = json.loads(native['properties'])
            values = [str(props[k]) for k in ['ppu', 'spu', 'tpu']] + [str(props['subunit'] if 'subunit' in props else props['sbVc'])]
            ids = sorted(indexes[(level, *values[:i])] for i, level in enumerate(['ppu', 'spu', 'tpu', 'subunit'], 1))
            assert set(resolution['entities'].get('division', [])) <= set(ids), 'Conflicting existing interpretation'
            covered.update(ids)
            if resolution['entities'].get('division') == ids:
                continue
            resolution['entities']['division'] = ids
            new = json.dumps(resolution, separators=(',', ':'), sort_keys=True)
            changes.append((new, row['scopeId'], row['sourceReleaseId'], row['sourceRecordId'], row['sourceVersionHash'], row['resolutions']))
            backup.append(dict(row))
            changed += 1
        assert covered == set(inventory), f'Uncovered canonical identities in {sid}'
        report.append(dict(snapshotId=sid, code=snapshot['code'], ancestors=[r['id'] for r in plan], interpretations=len(rows), changed=changed, omissionsPreserved=omitted, divisions=len(covered)))
    receipt = dict(applied=False, paths=[str(pathlib.Path(p).resolve()) for p in [meta_path, history_path, source_path]], changed=len(changes), snapshots=report)
    (output / 'plan.json').write_text(json.dumps(receipt, indent=2))
    if changes:
        (output / 'rows-before.json').write_text(json.dumps(backup))
        (output / 'replay-before.json').write_text(json.dumps(journals))
        rollback = ['BEGIN IMMEDIATE;']
        for r in backup:
            where = ' AND '.join(k + '=' + quote(r[k]) for k in ['scopeId', 'sourceReleaseId', 'sourceRecordId', 'sourceVersionHash'])
            rollback.append('UPDATE sourceResolutions SET resolutions=' + quote(r['resolutions']) + ' WHERE ' + where + ';')
        (output / 'rollback.sql').write_text('\n'.join(rollback + ['COMMIT;']))
    if apply and changes:
        assert versions == [db.execute('PRAGMA data_version').fetchone()[0] for db in connections], 'Concurrent database change'
        writer = sqlite3.connect(history_path)
        writer.execute('BEGIN IMMEDIATE')
        try:
            for change in changes:
                count = writer.execute('UPDATE sourceResolutions SET resolutions=? WHERE scopeId=? AND sourceReleaseId=? AND sourceRecordId=? AND sourceVersionHash=? AND resolutions=?', change).rowcount
                assert count == 1, 'Concurrent interpretation change'
            writer.commit()
        except BaseException:
            writer.rollback()
            raise
        receipt['applied'] = True
        receipt['quickCheck'] = writer.execute('PRAGMA quick_check').fetchone()[0]
        writer.close()
        (output / 'plan.json').write_text(json.dumps(receipt, indent=2))
    for db in connections:
        db.close()
    print(json.dumps(receipt, indent=2))
    return receipt


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ['meta', 'history', 'source', 'output']:
        parser.add_argument('--' + name, required=True)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    repair(args.meta, args.history, args.source, args.output, args.apply)
