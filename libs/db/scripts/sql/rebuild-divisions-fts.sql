CREATE VIRTUAL TABLE IF NOT EXISTS divisionSearchFts USING fts5(
    scopeId UNINDEXED, divisionId UNINDEXED, locale UNINDEXED, nameText, aliasText, codeText, ancestorText, tokenize='trigram'
  );

WITH selected AS (SELECT scopeId, snapshotId FROM divisionSearchScopes), desired AS (SELECT s.scopeId, d.id AS divisionId, COALESCE(i.locale, 'und') AS locale,
    COALESCE(i.name, '') AS nameText,
    TRIM(REPLACE(COALESCE(i.nameAlts, ''), '|', ' ') || ' ' ||
      COALESCE((SELECT group_concat(DISTINCT json_extract(value, '$.value')
        ORDER BY json_extract(value, '$.value')) FROM json_each(i.nameRules)), '')) AS aliasText,
    COALESCE(d.divisionCode, '') AS codeText,
    COALESCE((SELECT group_concat(DISTINCT value ORDER BY value)
      FROM json_tree(d.hierarchies) WHERE key = 'name' AND type = 'text'), '') AS ancestorText
    FROM selected s JOIN divisions d ON d.snapshotId = s.snapshotId
    LEFT JOIN divisionsI18n i ON i.snapshotId = d.snapshotId AND i.divisionId = d.id), removed AS (
      SELECT scopeId, divisionId, locale, nameText, aliasText, codeText, ancestorText FROM divisionSearchFts EXCEPT SELECT scopeId, divisionId, locale, nameText, aliasText, codeText, ancestorText FROM desired
    ) DELETE FROM divisionSearchFts WHERE rowid IN (
      SELECT f.rowid FROM divisionSearchFts f JOIN removed r ON
      f.scopeId IS r.scopeId AND f.divisionId IS r.divisionId AND f.locale IS r.locale AND f.nameText IS r.nameText AND f.aliasText IS r.aliasText AND f.codeText IS r.codeText AND f.ancestorText IS r.ancestorText
    );

WITH selected AS (SELECT scopeId, snapshotId FROM divisionSearchScopes), desired AS (SELECT s.scopeId, d.id AS divisionId, COALESCE(i.locale, 'und') AS locale,
    COALESCE(i.name, '') AS nameText,
    TRIM(REPLACE(COALESCE(i.nameAlts, ''), '|', ' ') || ' ' ||
      COALESCE((SELECT group_concat(DISTINCT json_extract(value, '$.value')
        ORDER BY json_extract(value, '$.value')) FROM json_each(i.nameRules)), '')) AS aliasText,
    COALESCE(d.divisionCode, '') AS codeText,
    COALESCE((SELECT group_concat(DISTINCT value ORDER BY value)
      FROM json_tree(d.hierarchies) WHERE key = 'name' AND type = 'text'), '') AS ancestorText
    FROM selected s JOIN divisions d ON d.snapshotId = s.snapshotId
    LEFT JOIN divisionsI18n i ON i.snapshotId = d.snapshotId AND i.divisionId = d.id) INSERT INTO divisionSearchFts (scopeId, divisionId, locale, nameText, aliasText, codeText, ancestorText)
      SELECT scopeId, divisionId, locale, nameText, aliasText, codeText, ancestorText FROM desired EXCEPT SELECT scopeId, divisionId, locale, nameText, aliasText, codeText, ancestorText FROM divisionSearchFts;
