CREATE VIRTUAL TABLE IF NOT EXISTS "addressesFts" USING fts5(
  "snapshotId" UNINDEXED,
  "addressId" UNINDEXED,
  "locale" UNINDEXED,
  "formattedAddress",
  "buildingName",
  "buildingNumber",
  "blockExpression",
  "phaseExpression",
  "estateName",
  "streetName"
);

DELETE FROM "addressesFts";

INSERT INTO "addressesFts" (
  "snapshotId",
  "addressId",
  "locale",
  "formattedAddress",
  "buildingName",
  "buildingNumber",
  "blockExpression",
  "phaseExpression",
  "estateName",
  "streetName"
)
SELECT
  "snapshotId",
  "addressId",
  "locale",
  "formattedAddress",
  "buildingName",
  TRIM(
    COALESCE("buildingNumberExpression", '') || ' ' ||
    COALESCE("buildingNumberFrom", '') || ' ' ||
    COALESCE("buildingNumberTo", '')
  ),
  "blockExpression",
  "phaseExpression",
  "estateName",
  "streetName"
FROM "address2dI18n";
