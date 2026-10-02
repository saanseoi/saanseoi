-- Custom SQL migration file, put your code below! --
UPDATE apiCatalogRevisions AS older
SET status = 'archived',
    updatedAt = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE older.status = 'current'
  AND EXISTS (
    SELECT 1
    FROM apiCatalogRevisions AS newer
    WHERE newer.apiVersionId = older.apiVersionId
      AND newer.regionCode = older.regionCode
      AND newer.status = 'current'
      AND (
        newer.publishedAt > older.publishedAt
        OR (
          newer.publishedAt = older.publishedAt
          AND newer.revision > older.revision
        )
      )
  );
