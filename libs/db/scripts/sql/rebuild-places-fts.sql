CREATE VIRTUAL TABLE IF NOT EXISTS placeSearchFts USING fts5(
    scopeId UNINDEXED, placeId UNINDEXED, locale UNINDEXED, nameText, brandText, taxonomyText, addressText, divisionText, streetText, tokenize='trigram'
  );

WITH selected AS (SELECT scopeId, snapshotId FROM placeSearchScopes), desired AS (SELECT
  s."scopeId" AS "scopeId",
  p."id" AS "placeId",
  pi."locale" AS "locale",
  TRIM(COALESCE(COALESCE(pi."name", '') || ' ' || COALESCE(pi."nameAlts", ''), '')) || char(31) || TRIM(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(lower(COALESCE(pi."name", '') || ' ' || COALESCE(pi."nameAlts", '')), '!', ''), '"', ''), '#', ''), '$', ''), '%', ''), '&', ''), '''', ''), '(', ''), ')', ''), '*', ''), '+', ''), ',', ''), '-', ''), '.', ''), '/', ''), ':', ''), ';', ''), '<', ''), '=', ''), '>', ''), '?', ''), '@', ''), '[', ''), '\', ''), ']', ''), '^', ''), '_', ''), '`', ''), '{', ''), '|', ''), '}', ''), '~', ''), '·', ''), '…', ''), '“', ''), '”', ''), '‘', ''), '’', ''), '「', ''), '」', ''), '『', ''), '』', ''), '（', ''), '）', ''), '［', ''), '］', ''), '｛', ''), '｝', ''), '！', ''), '？', ''), '、', ''), '。', ''), '，', ''), '：', ''), '；', ''), '＇', ''), '＂', ''), '～', ''), '＿', ''), '－', ''), '＋', ''), '＝', ''), '＠', ''), '＃', ''), '＆', ''), '％', ''), '＊', ''), '／', ''), '＼', ''), '｜', '')) AS "nameText",
  TRIM(COALESCE(COALESCE(pi."brandName", '') || ' ' || COALESCE(pi."brandNameAlts", ''), '')) || char(31) || TRIM(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(lower(COALESCE(pi."brandName", '') || ' ' || COALESCE(pi."brandNameAlts", '')), '!', ''), '"', ''), '#', ''), '$', ''), '%', ''), '&', ''), '''', ''), '(', ''), ')', ''), '*', ''), '+', ''), ',', ''), '-', ''), '.', ''), '/', ''), ':', ''), ';', ''), '<', ''), '=', ''), '>', ''), '?', ''), '@', ''), '[', ''), '\', ''), ']', ''), '^', ''), '_', ''), '`', ''), '{', ''), '|', ''), '}', ''), '~', ''), '·', ''), '…', ''), '“', ''), '”', ''), '‘', ''), '’', ''), '「', ''), '」', ''), '『', ''), '』', ''), '（', ''), '）', ''), '［', ''), '］', ''), '｛', ''), '｝', ''), '！', ''), '？', ''), '、', ''), '。', ''), '，', ''), '：', ''), '；', ''), '＇', ''), '＂', ''), '～', ''), '＿', ''), '－', ''), '＋', ''), '＝', ''), '＠', ''), '＃', ''), '＆', ''), '％', ''), '＊', ''), '／', ''), '＼', ''), '｜', '')) AS "brandText",
  TRIM(
    COALESCE(p."basicCategory", '') || ' ' ||
    COALESCE(p."taxonomyPrimary", '') || ' ' ||
    COALESCE(p."taxonomyHierarchy", '')
  ) AS "taxonomyText",
  COALESCE(json_extract(pi."searchDependencyText", '$.addressText'), '') AS "addressText",
  COALESCE(json_extract(pi."searchDependencyText", '$.divisionText'), '') AS "divisionText",
  COALESCE(json_extract(pi."searchDependencyText", '$.streetText'), '') AS "streetText"
FROM selected s
JOIN "placePublicationState" publication ON publication."snapshotId" = s."snapshotId"
 AND publication."status" = 'current' AND publication."preparedAt" IS NOT NULL
 AND publication."publicationToken" <> ''
JOIN "places" p ON p.scopeId = publication."scopeId"
JOIN "placesI18n" pi
  ON pi.scopeId = p.scopeId
 AND pi."placeId" = p."id"), removed AS (
      SELECT scopeId, placeId, locale, nameText, brandText, taxonomyText, addressText, divisionText, streetText FROM placeSearchFts EXCEPT SELECT scopeId, placeId, locale, nameText, brandText, taxonomyText, addressText, divisionText, streetText FROM desired
    ) DELETE FROM placeSearchFts WHERE rowid IN (
      SELECT f.rowid FROM placeSearchFts f JOIN removed r ON
      f.scopeId IS r.scopeId AND f.placeId IS r.placeId AND f.locale IS r.locale AND f.nameText IS r.nameText AND f.brandText IS r.brandText AND f.taxonomyText IS r.taxonomyText AND f.addressText IS r.addressText AND f.divisionText IS r.divisionText AND f.streetText IS r.streetText
    );

WITH selected AS (SELECT scopeId, snapshotId FROM placeSearchScopes), desired AS (SELECT
  s."scopeId" AS "scopeId",
  p."id" AS "placeId",
  pi."locale" AS "locale",
  TRIM(COALESCE(COALESCE(pi."name", '') || ' ' || COALESCE(pi."nameAlts", ''), '')) || char(31) || TRIM(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(lower(COALESCE(pi."name", '') || ' ' || COALESCE(pi."nameAlts", '')), '!', ''), '"', ''), '#', ''), '$', ''), '%', ''), '&', ''), '''', ''), '(', ''), ')', ''), '*', ''), '+', ''), ',', ''), '-', ''), '.', ''), '/', ''), ':', ''), ';', ''), '<', ''), '=', ''), '>', ''), '?', ''), '@', ''), '[', ''), '\', ''), ']', ''), '^', ''), '_', ''), '`', ''), '{', ''), '|', ''), '}', ''), '~', ''), '·', ''), '…', ''), '“', ''), '”', ''), '‘', ''), '’', ''), '「', ''), '」', ''), '『', ''), '』', ''), '（', ''), '）', ''), '［', ''), '］', ''), '｛', ''), '｝', ''), '！', ''), '？', ''), '、', ''), '。', ''), '，', ''), '：', ''), '；', ''), '＇', ''), '＂', ''), '～', ''), '＿', ''), '－', ''), '＋', ''), '＝', ''), '＠', ''), '＃', ''), '＆', ''), '％', ''), '＊', ''), '／', ''), '＼', ''), '｜', '')) AS "nameText",
  TRIM(COALESCE(COALESCE(pi."brandName", '') || ' ' || COALESCE(pi."brandNameAlts", ''), '')) || char(31) || TRIM(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(lower(COALESCE(pi."brandName", '') || ' ' || COALESCE(pi."brandNameAlts", '')), '!', ''), '"', ''), '#', ''), '$', ''), '%', ''), '&', ''), '''', ''), '(', ''), ')', ''), '*', ''), '+', ''), ',', ''), '-', ''), '.', ''), '/', ''), ':', ''), ';', ''), '<', ''), '=', ''), '>', ''), '?', ''), '@', ''), '[', ''), '\', ''), ']', ''), '^', ''), '_', ''), '`', ''), '{', ''), '|', ''), '}', ''), '~', ''), '·', ''), '…', ''), '“', ''), '”', ''), '‘', ''), '’', ''), '「', ''), '」', ''), '『', ''), '』', ''), '（', ''), '）', ''), '［', ''), '］', ''), '｛', ''), '｝', ''), '！', ''), '？', ''), '、', ''), '。', ''), '，', ''), '：', ''), '；', ''), '＇', ''), '＂', ''), '～', ''), '＿', ''), '－', ''), '＋', ''), '＝', ''), '＠', ''), '＃', ''), '＆', ''), '％', ''), '＊', ''), '／', ''), '＼', ''), '｜', '')) AS "brandText",
  TRIM(
    COALESCE(p."basicCategory", '') || ' ' ||
    COALESCE(p."taxonomyPrimary", '') || ' ' ||
    COALESCE(p."taxonomyHierarchy", '')
  ) AS "taxonomyText",
  COALESCE(json_extract(pi."searchDependencyText", '$.addressText'), '') AS "addressText",
  COALESCE(json_extract(pi."searchDependencyText", '$.divisionText'), '') AS "divisionText",
  COALESCE(json_extract(pi."searchDependencyText", '$.streetText'), '') AS "streetText"
FROM selected s
JOIN "placePublicationState" publication ON publication."snapshotId" = s."snapshotId"
 AND publication."status" = 'current' AND publication."preparedAt" IS NOT NULL
 AND publication."publicationToken" <> ''
JOIN "places" p ON p.scopeId = publication."scopeId"
JOIN "placesI18n" pi
  ON pi.scopeId = p.scopeId
 AND pi."placeId" = p."id") INSERT INTO placeSearchFts (scopeId, placeId, locale, nameText, brandText, taxonomyText, addressText, divisionText, streetText)
      SELECT scopeId, placeId, locale, nameText, brandText, taxonomyText, addressText, divisionText, streetText FROM desired EXCEPT SELECT scopeId, placeId, locale, nameText, brandText, taxonomyText, addressText, divisionText, streetText FROM placeSearchFts;

CREATE TABLE IF NOT EXISTS placeSearchIdentities (
  scopeId TEXT NOT NULL, placeId TEXT NOT NULL, ftsRowid INTEGER NOT NULL UNIQUE,
  PRIMARY KEY (scopeId, placeId, ftsRowid)
);
DELETE FROM placeSearchIdentities WHERE NOT EXISTS (
  SELECT 1 FROM placeSearchFts f WHERE f.rowid = placeSearchIdentities.ftsRowid
    AND f.scopeId = placeSearchIdentities.scopeId AND f.placeId = placeSearchIdentities.placeId
);
INSERT INTO placeSearchIdentities (scopeId, placeId, ftsRowid)
  SELECT scopeId, placeId, rowid FROM placeSearchFts WHERE true
  ON CONFLICT(ftsRowid) DO UPDATE SET scopeId = excluded.scopeId, placeId = excluded.placeId
  WHERE scopeId IS NOT excluded.scopeId OR placeId IS NOT excluded.placeId;
