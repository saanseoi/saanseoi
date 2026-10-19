CREATE VIRTUAL TABLE IF NOT EXISTS addressSearchFts USING fts5(
    scopeId UNINDEXED, addressId UNINDEXED, locale UNINDEXED, formattedAddress, buildingName, buildingNumber, blockExpression, phaseExpression, premisesName, streetName
  );

WITH selected AS (SELECT scopeId, snapshotId FROM addressSearchScopes), desired AS (SELECT s.scopeId, i.addressId, i.locale, i.formattedAddress, i.buildingName,
    TRIM(COALESCE(i.buildingNumberExpression, '') || ' ' ||
      COALESCE(i.buildingNumberFrom, '') || ' ' || COALESCE(i.buildingNumberTo, '')) AS buildingNumber,
    i.blockExpression, i.phaseExpression, i.premisesName, i.streetName
    FROM selected s JOIN addressPublicationState currentScope ON currentScope.snapshotId = s.snapshotId
      AND currentScope.status = 'current' AND currentScope.preparedAt IS NOT NULL
    JOIN address2dI18n i ON i.scopeId = currentScope.scopeId), removed AS (
      SELECT scopeId, addressId, locale, formattedAddress, buildingName, buildingNumber, blockExpression, phaseExpression, premisesName, streetName FROM addressSearchFts EXCEPT SELECT scopeId, addressId, locale, formattedAddress, buildingName, buildingNumber, blockExpression, phaseExpression, premisesName, streetName FROM desired
    ) DELETE FROM addressSearchFts WHERE rowid IN (
      SELECT f.rowid FROM addressSearchFts f JOIN removed r ON
      f.scopeId IS r.scopeId AND f.addressId IS r.addressId AND f.locale IS r.locale AND f.formattedAddress IS r.formattedAddress AND f.buildingName IS r.buildingName AND f.buildingNumber IS r.buildingNumber AND f.blockExpression IS r.blockExpression AND f.phaseExpression IS r.phaseExpression AND f.premisesName IS r.premisesName AND f.streetName IS r.streetName
    );

WITH selected AS (SELECT scopeId, snapshotId FROM addressSearchScopes), desired AS (SELECT s.scopeId, i.addressId, i.locale, i.formattedAddress, i.buildingName,
    TRIM(COALESCE(i.buildingNumberExpression, '') || ' ' ||
      COALESCE(i.buildingNumberFrom, '') || ' ' || COALESCE(i.buildingNumberTo, '')) AS buildingNumber,
    i.blockExpression, i.phaseExpression, i.premisesName, i.streetName
    FROM selected s JOIN addressPublicationState currentScope ON currentScope.snapshotId = s.snapshotId
      AND currentScope.status = 'current' AND currentScope.preparedAt IS NOT NULL
    JOIN address2dI18n i ON i.scopeId = currentScope.scopeId) INSERT INTO addressSearchFts (scopeId, addressId, locale, formattedAddress, buildingName, buildingNumber, blockExpression, phaseExpression, premisesName, streetName)
      SELECT scopeId, addressId, locale, formattedAddress, buildingName, buildingNumber, blockExpression, phaseExpression, premisesName, streetName FROM desired EXCEPT SELECT scopeId, addressId, locale, formattedAddress, buildingName, buildingNumber, blockExpression, phaseExpression, premisesName, streetName FROM addressSearchFts;
