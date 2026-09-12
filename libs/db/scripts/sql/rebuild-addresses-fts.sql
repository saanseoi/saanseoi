SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM addressSearchScopes selected WHERE NOT EXISTS (SELECT 1 FROM addressPublicationState publication WHERE publication.snapshotId = selected.snapshotId AND publication.status = 'current' AND publication.preparedAt IS NOT NULL AND publication.publicationToken <> '')) THEN 1 ELSE abs(-9223372036854775808) END;

CREATE VIRTUAL TABLE IF NOT EXISTS addressSearchFts USING fts5(
    scopeId UNINDEXED, addressId UNINDEXED, locale UNINDEXED, formattedAddress, buildingName, buildingNumber, blockExpression, phaseExpression, estateName, streetName
  );

WITH selected AS (SELECT scopeId, snapshotId FROM addressSearchScopes), desired AS (SELECT s.scopeId, i.addressId, i.locale, i.formattedAddress, i.buildingName,
    TRIM(COALESCE(i.buildingNumberExpression, '') || ' ' ||
      COALESCE(i.buildingNumberFrom, '') || ' ' || COALESCE(i.buildingNumberTo, '')) AS buildingNumber,
    i.blockExpression, i.phaseExpression, i.estateName, i.streetName
    FROM selected s JOIN addressPublicationState currentScope ON currentScope.snapshotId = s.snapshotId
      AND currentScope.status = 'current' AND currentScope.preparedAt IS NOT NULL
    JOIN address2dI18n i ON i.snapshotId = currentScope.scopeId), removed AS (
      SELECT scopeId, addressId, locale, formattedAddress, buildingName, buildingNumber, blockExpression, phaseExpression, estateName, streetName FROM addressSearchFts EXCEPT SELECT scopeId, addressId, locale, formattedAddress, buildingName, buildingNumber, blockExpression, phaseExpression, estateName, streetName FROM desired
    ) DELETE FROM addressSearchFts WHERE rowid IN (
      SELECT f.rowid FROM addressSearchFts f JOIN removed r ON
      f.scopeId IS r.scopeId AND f.addressId IS r.addressId AND f.locale IS r.locale AND f.formattedAddress IS r.formattedAddress AND f.buildingName IS r.buildingName AND f.buildingNumber IS r.buildingNumber AND f.blockExpression IS r.blockExpression AND f.phaseExpression IS r.phaseExpression AND f.estateName IS r.estateName AND f.streetName IS r.streetName
    );

WITH selected AS (SELECT scopeId, snapshotId FROM addressSearchScopes), desired AS (SELECT s.scopeId, i.addressId, i.locale, i.formattedAddress, i.buildingName,
    TRIM(COALESCE(i.buildingNumberExpression, '') || ' ' ||
      COALESCE(i.buildingNumberFrom, '') || ' ' || COALESCE(i.buildingNumberTo, '')) AS buildingNumber,
    i.blockExpression, i.phaseExpression, i.estateName, i.streetName
    FROM selected s JOIN addressPublicationState currentScope ON currentScope.snapshotId = s.snapshotId
      AND currentScope.status = 'current' AND currentScope.preparedAt IS NOT NULL
    JOIN address2dI18n i ON i.snapshotId = currentScope.scopeId) INSERT INTO addressSearchFts (scopeId, addressId, locale, formattedAddress, buildingName, buildingNumber, blockExpression, phaseExpression, estateName, streetName)
      SELECT scopeId, addressId, locale, formattedAddress, buildingName, buildingNumber, blockExpression, phaseExpression, estateName, streetName FROM desired EXCEPT SELECT scopeId, addressId, locale, formattedAddress, buildingName, buildingNumber, blockExpression, phaseExpression, estateName, streetName FROM addressSearchFts;
