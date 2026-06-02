PRAGMA foreign_keys = ON;

CREATE TABLE "datasets" (
  "datasetId" TEXT PRIMARY KEY NOT NULL,
  "regionCode" TEXT NOT NULL,
  "snapshotMonth" TEXT NOT NULL,
  "theme" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "sourceVersion" TEXT NOT NULL,
  "rawObjectKey" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "isActive" INTEGER NOT NULL,
  "supersedesDatasetId" TEXT,
  "revokedAt" TEXT,
  "revocationReason" TEXT,
  "ingestedAt" TEXT NOT NULL
);

CREATE INDEX "datasets_active_lookup_idx"
  ON "datasets" ("regionCode", "snapshotMonth", "theme", "isActive");

CREATE UNIQUE INDEX "datasets_active_unique_idx"
  ON "datasets" ("regionCode", "snapshotMonth", "theme")
  WHERE "isActive" = 1;

CREATE TABLE "ingestRuns" (
  "runId" TEXT PRIMARY KEY NOT NULL,
  "datasetId" TEXT NOT NULL,
  "phase" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "statsJson" TEXT,
  "errorJson" TEXT,
  "startedAt" TEXT NOT NULL,
  "finishedAt" TEXT,
  FOREIGN KEY ("datasetId") REFERENCES "datasets" ("datasetId")
);

CREATE TABLE "entityVersions" (
  "regionCode" TEXT NOT NULL,
  "theme" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "datasetId" TEXT NOT NULL,
  "featureType" TEXT NOT NULL,
  "otVersion" TEXT NOT NULL,
  "versionHash" TEXT NOT NULL,
  "validFromMonth" TEXT NOT NULL,
  "validToMonth" TEXT,
  "isCurrent" INTEGER NOT NULL,
  "geometryType" TEXT NOT NULL,
  "otBboxJson" TEXT,
  "payloadJson" TEXT NOT NULL,
  "sourcesJson" TEXT,
  "createdAt" TEXT NOT NULL,
  PRIMARY KEY ("regionCode", "theme", "entityId", "versionHash"),
  FOREIGN KEY ("datasetId") REFERENCES "datasets" ("datasetId")
);

CREATE INDEX "entityVersions_current_lookup_idx"
  ON "entityVersions" ("regionCode", "theme", "entityId", "isCurrent");

CREATE INDEX "entityVersions_validity_idx"
  ON "entityVersions" ("regionCode", "theme", "validFromMonth", "validToMonth");

CREATE INDEX "entityVersions_dataset_idx"
  ON "entityVersions" ("datasetId");

CREATE TABLE "entityAliases" (
  "aliasId" TEXT PRIMARY KEY NOT NULL,
  "entityType" TEXT NOT NULL,
  "aliasValue" TEXT NOT NULL,
  "canonicalId" TEXT NOT NULL,
  "sourceSystem" TEXT NOT NULL,
  "isCurrent" INTEGER NOT NULL,
  "validFromMonth" TEXT,
  "validToMonth" TEXT,
  "notes" TEXT,
  "createdAt" TEXT NOT NULL
);

CREATE UNIQUE INDEX "entityAliases_entityType_aliasValue_unique_idx"
  ON "entityAliases" ("entityType", "aliasValue");

CREATE INDEX "entityAliases_canonical_lookup_idx"
  ON "entityAliases" ("entityType", "canonicalId");

CREATE TABLE "division" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "level" INTEGER NOT NULL,
  "otVersion" TEXT,
  "otSubtype" TEXT,
  "otAdminLevel" TEXT,
  "otClass" TEXT,
  "otWikidata" TEXT,
  "otHierarchyJson" TEXT,
  "hierarchyJson" TEXT,
  "parentDivisionId" TEXT,
  "otCartographyJson" TEXT,
  "otBboxJson" TEXT,
  "sourcesJson" TEXT
);

CREATE INDEX "division_level_idx"
  ON "division" ("level");

CREATE INDEX "division_parentDivisionId_idx"
  ON "division" ("parentDivisionId");

CREATE TABLE "divisionI18n" (
  "divisionId" TEXT NOT NULL,
  "locale" TEXT NOT NULL,
  "otName" TEXT,
  "otNameVariantJson" TEXT,
  "otNameAlts" TEXT,
  "otLocalType" TEXT,
  "hierarchyJson" TEXT,
  PRIMARY KEY ("divisionId", "locale"),
  FOREIGN KEY ("divisionId") REFERENCES "division" ("id")
);

CREATE INDEX "divisionI18n_locale_idx"
  ON "divisionI18n" ("locale");

CREATE INDEX "divisionI18n_name_idx"
  ON "divisionI18n" ("locale", "otName");

CREATE TABLE "street" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "yearBuiltJson" TEXT,
  "referencesJson" TEXT
);

CREATE TABLE "address2d" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "canonicalKey" TEXT NOT NULL,
  "streetId" TEXT,
  "microhoodId" TEXT,
  "neighbourhoodId" TEXT,
  "subDistrictId" TEXT,
  "districtId" TEXT,
  "regionId" TEXT,
  "countryId" TEXT,
  "otLng" REAL NOT NULL,
  "otLat" REAL NOT NULL,
  "otStreet" TEXT,
  "otNumber" TEXT,
  "otBboxJson" TEXT,
  "otVersion" TEXT,
  "sourcesJson" TEXT,
  FOREIGN KEY ("streetId") REFERENCES "street" ("id"),
  FOREIGN KEY ("microhoodId") REFERENCES "division" ("id"),
  FOREIGN KEY ("neighbourhoodId") REFERENCES "division" ("id"),
  FOREIGN KEY ("subDistrictId") REFERENCES "division" ("id"),
  FOREIGN KEY ("districtId") REFERENCES "division" ("id"),
  FOREIGN KEY ("regionId") REFERENCES "division" ("id"),
  FOREIGN KEY ("countryId") REFERENCES "division" ("id")
);

CREATE UNIQUE INDEX "address2d_canonicalKey_unique_idx"
  ON "address2d" ("canonicalKey");

CREATE INDEX "address2d_streetId_idx"
  ON "address2d" ("streetId");

CREATE INDEX "address2d_division_idx"
  ON "address2d" ("microhoodId", "neighbourhoodId", "subDistrictId", "districtId");

CREATE TABLE "address2dI18n" (
  "addressId" TEXT NOT NULL,
  "locale" TEXT NOT NULL,
  "formattedAddress" TEXT NOT NULL,
  "buildingName" TEXT,
  "buildingNumberFrom" TEXT,
  "buildingNumberTo" TEXT,
  "blockType" TEXT,
  "blockNumber" TEXT,
  "blockTypeBeforeNumber" INTEGER,
  "phaseName" TEXT,
  "phaseNumber" TEXT,
  "estateName" TEXT,
  "streetNumber" TEXT,
  "streetName" TEXT,
  "intersection" TEXT,
  PRIMARY KEY ("addressId", "locale"),
  FOREIGN KEY ("addressId") REFERENCES "address2d" ("id")
);

CREATE INDEX "address2dI18n_locale_idx"
  ON "address2dI18n" ("locale");

CREATE TABLE "address3d" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "address2dId" TEXT NOT NULL,
  "sourcesJson" TEXT,
  "createdAt" TEXT NOT NULL,
  "updatedAt" TEXT NOT NULL,
  FOREIGN KEY ("address2dId") REFERENCES "address2d" ("id")
);

CREATE INDEX "address3d_address2dId_idx"
  ON "address3d" ("address2dId");

CREATE TABLE "address3dI18n" (
  "address3dId" TEXT NOT NULL,
  "locale" TEXT NOT NULL,
  "formattedAddressPart" TEXT NOT NULL,
  "accessHint" TEXT,
  "unitPortion" TEXT,
  "unitNumber" TEXT,
  "unitType" TEXT,
  "floorNumber" TEXT,
  "floorType" TEXT,
  PRIMARY KEY ("address3dId", "locale"),
  FOREIGN KEY ("address3dId") REFERENCES "address3d" ("id")
);

CREATE INDEX "address3dI18n_locale_idx"
  ON "address3dI18n" ("locale");

CREATE TABLE "streetI18n" (
  "streetId" TEXT NOT NULL,
  "locale" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "base" TEXT,
  "designator" TEXT,
  "directionalPrefix" TEXT,
  "directionalSuffix" TEXT,
  "normalised" TEXT,
  PRIMARY KEY ("streetId", "locale"),
  FOREIGN KEY ("streetId") REFERENCES "street" ("id")
);

CREATE INDEX "streetI18n_locale_idx"
  ON "streetI18n" ("locale");

CREATE INDEX "streetI18n_name_idx"
  ON "streetI18n" ("locale", "name");

CREATE TABLE "streetAddress" (
  "streetId" TEXT NOT NULL,
  "addressId" TEXT NOT NULL,
  PRIMARY KEY ("streetId", "addressId"),
  FOREIGN KEY ("streetId") REFERENCES "street" ("id"),
  FOREIGN KEY ("addressId") REFERENCES "address2d" ("id")
);

CREATE INDEX "streetAddress_addressId_idx"
  ON "streetAddress" ("addressId");

CREATE TABLE "placesCurrent" (
  "regionCode" TEXT NOT NULL,
  "datasetId" TEXT NOT NULL,
  "id" TEXT PRIMARY KEY NOT NULL,
  "address2dId" TEXT,
  "address3dId" TEXT,
  "otVersionHash" TEXT NOT NULL,
  "otVersion" TEXT NOT NULL,
  "otLng" REAL NOT NULL,
  "otLat" REAL NOT NULL,
  "otBboxJson" TEXT,
  "otOperatingStatus" TEXT,
  "otBasicCategory" TEXT,
  "otTaxonomyPrimary" TEXT,
  "otTaxonomyHierarchyJson" TEXT,
  "otTaxonomyAlternatesJson" TEXT,
  "otBrandWikidata" TEXT,
  "otWebsitesJson" TEXT,
  "otSocialsJson" TEXT,
  "otEmailsJson" TEXT,
  "otPhonesJson" TEXT,
  "otAddressesJson" TEXT,
  "otConfidence" REAL,
  "sourcesJson" TEXT,
  "firstSeenMonth" TEXT NOT NULL,
  "lastSeenMonth" TEXT NOT NULL,
  FOREIGN KEY ("datasetId") REFERENCES "datasets" ("datasetId"),
  FOREIGN KEY ("address2dId") REFERENCES "address2d" ("id"),
  FOREIGN KEY ("address3dId") REFERENCES "address3d" ("id")
);

CREATE INDEX "placesCurrent_datasetId_idx"
  ON "placesCurrent" ("datasetId");

CREATE INDEX "placesCurrent_category_idx"
  ON "placesCurrent" ("regionCode", "otBasicCategory");

CREATE INDEX "placesCurrent_taxonomy_idx"
  ON "placesCurrent" ("regionCode", "otTaxonomyPrimary");

CREATE INDEX "placesCurrent_status_idx"
  ON "placesCurrent" ("regionCode", "otOperatingStatus");

CREATE TABLE "placesCurrentI18n" (
  "placeId" TEXT NOT NULL,
  "locale" TEXT NOT NULL,
  "otName" TEXT,
  "otNameVariantJson" TEXT,
  "otNameAlts" TEXT,
  "otBrandName" TEXT,
  "otBrandNameVariantJson" TEXT,
  "otBrandNameAlts" TEXT,
  PRIMARY KEY ("placeId", "locale"),
  FOREIGN KEY ("placeId") REFERENCES "placesCurrent" ("id")
);

CREATE INDEX "placesCurrentI18n_locale_idx"
  ON "placesCurrentI18n" ("locale");

CREATE INDEX "placesCurrentI18n_name_idx"
  ON "placesCurrentI18n" ("locale", "otName");

CREATE TABLE "placesCurrentDivision" (
  "placeId" TEXT NOT NULL,
  "divisionId" TEXT NOT NULL,
  PRIMARY KEY ("placeId", "divisionId"),
  FOREIGN KEY ("placeId") REFERENCES "placesCurrent" ("id"),
  FOREIGN KEY ("divisionId") REFERENCES "division" ("id")
);

CREATE INDEX "placesCurrentDivision_divisionId_idx"
  ON "placesCurrentDivision" ("divisionId", "placeId");

CREATE TABLE "placesCurrentCells" (
  "regionCode" TEXT NOT NULL,
  "id" TEXT NOT NULL,
  "h3Level" INTEGER NOT NULL,
  "h3Cell" TEXT NOT NULL,
  PRIMARY KEY ("regionCode", "id", "h3Level", "h3Cell"),
  FOREIGN KEY ("id") REFERENCES "placesCurrent" ("id")
);

CREATE INDEX "placesCurrentCells_lookup_idx"
  ON "placesCurrentCells" ("regionCode", "h3Level", "h3Cell", "id");

CREATE VIRTUAL TABLE "placesCurrentFts" USING fts5(
  "placeId" UNINDEXED,
  "locale" UNINDEXED,
  "nameText",
  "brandText",
  "taxonomyText",
  "addressText",
  "divisionText",
  "streetText"
);
