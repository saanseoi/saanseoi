-- Custom SQL migration file, put your code below! --
UPDATE apiComposition AS older
SET status = 'archived',
    updatedAt = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE older.status = 'current'
  AND EXISTS (
    SELECT 1
    FROM apiComposition AS newer
    WHERE newer.apiVersionId = older.apiVersionId
      AND newer.status = 'current'
      AND newer.version > older.version
  );
