CREATE VIRTUAL TABLE "placesFts" USING fts5(
  "placeId" UNINDEXED,
  "locale" UNINDEXED,
  "nameText",
  "brandText",
  "taxonomyText",
  "addressText",
  "divisionText",
  "streetText"
);
