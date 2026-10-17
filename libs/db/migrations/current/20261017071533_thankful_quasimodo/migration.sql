CREATE TABLE `address2d` (
	`scopeId` text NOT NULL,
	`divisionSnapshotId` text NOT NULL,
	`streetSnapshotId` text,
	`id` text NOT NULL,
	`parentAddressId` text,
	`granularity` text DEFAULT 'unknown' NOT NULL,
	`streetId` text,
	`hamletId` text,
	`microhoodId` text,
	`villageId` text,
	`neighbourhoodId` text,
	`ruralAreaId` text,
	`macrohoodId` text,
	`townId` text,
	`islandId` text,
	`districtId` text,
	`areaId` text,
	`countryId` text,
	`identifiers` text,
	`sources` text,
	`geometry` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `address2d_pk` PRIMARY KEY(`scopeId`, `id`),
	CONSTRAINT `address2d_divisionSnapshotId_countryId_divisions_fk` FOREIGN KEY (`divisionSnapshotId`,`countryId`) REFERENCES `divisions`(`scopeId`,`id`),
	CONSTRAINT `address2d_divisionSnapshotId_islandId_divisions_fk` FOREIGN KEY (`divisionSnapshotId`,`islandId`) REFERENCES `divisions`(`scopeId`,`id`),
	CONSTRAINT `address2d_divisionSnapshotId_areaId_divisions_fk` FOREIGN KEY (`divisionSnapshotId`,`areaId`) REFERENCES `divisions`(`scopeId`,`id`),
	CONSTRAINT `address2d_divisionSnapshotId_districtId_divisions_fk` FOREIGN KEY (`divisionSnapshotId`,`districtId`) REFERENCES `divisions`(`scopeId`,`id`),
	CONSTRAINT `address2d_divisionSnapshotId_townId_divisions_fk` FOREIGN KEY (`divisionSnapshotId`,`townId`) REFERENCES `divisions`(`scopeId`,`id`),
	CONSTRAINT `address2d_divisionSnapshotId_ruralAreaId_divisions_fk` FOREIGN KEY (`divisionSnapshotId`,`ruralAreaId`) REFERENCES `divisions`(`scopeId`,`id`),
	CONSTRAINT `address2d_divisionSnapshotId_macrohoodId_divisions_fk` FOREIGN KEY (`divisionSnapshotId`,`macrohoodId`) REFERENCES `divisions`(`scopeId`,`id`),
	CONSTRAINT `address2d_divisionSnapshotId_villageId_divisions_fk` FOREIGN KEY (`divisionSnapshotId`,`villageId`) REFERENCES `divisions`(`scopeId`,`id`),
	CONSTRAINT `address2d_divisionSnapshotId_neighbourhoodId_divisions_fk` FOREIGN KEY (`divisionSnapshotId`,`neighbourhoodId`) REFERENCES `divisions`(`scopeId`,`id`),
	CONSTRAINT `address2d_divisionSnapshotId_hamletId_divisions_fk` FOREIGN KEY (`divisionSnapshotId`,`hamletId`) REFERENCES `divisions`(`scopeId`,`id`),
	CONSTRAINT `address2d_divisionSnapshotId_microhoodId_divisions_fk` FOREIGN KEY (`divisionSnapshotId`,`microhoodId`) REFERENCES `divisions`(`scopeId`,`id`),
	CONSTRAINT `address2d_streetSnapshotId_streetId_streets_fk` FOREIGN KEY (`streetSnapshotId`,`streetId`) REFERENCES `streets`(`scopeId`,`id`),
	CONSTRAINT "address2d_street_reference_consistency_chk" CHECK(("streetSnapshotId" IS NULL) = ("streetId" IS NULL))
);
--> statement-breakpoint
CREATE TABLE `address2dBuildingNumberLookup` (
	`scopeId` text NOT NULL,
	`addressId` text NOT NULL,
	`buildingNumber` text NOT NULL,
	`numericStem` text,
	`evidence` text NOT NULL,
	`derivation` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `address2dBuildingNumberLookup_pk` PRIMARY KEY(`scopeId`, `addressId`, `buildingNumber`),
	CONSTRAINT `address2dBuildingNumberLookup_scopeId_addressId_address2d_fk` FOREIGN KEY (`scopeId`,`addressId`) REFERENCES `address2d`(`scopeId`,`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `address2dI18n` (
	`scopeId` text NOT NULL,
	`addressId` text NOT NULL,
	`locale` text NOT NULL,
	`meta` text,
	`formattedAddress` text NOT NULL,
	`buildingName` text,
	`buildingNumberExpression` text,
	`buildingNumberFrom` text,
	`buildingNumberTo` text,
	`buildingNumberConnector` text,
	`blockExpression` text,
	`blockType` text,
	`blockRef` text,
	`blockTypeBeforeNumber` integer,
	`phaseExpression` text,
	`phaseName` text,
	`phaseRef` text,
	`estateName` text,
	`streetName` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `address2dI18n_pk` PRIMARY KEY(`scopeId`, `addressId`, `locale`),
	CONSTRAINT `address2dI18n_scopeId_addressId_address2d_fk` FOREIGN KEY (`scopeId`,`addressId`) REFERENCES `address2d`(`scopeId`,`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `address3d` (
	`scopeId` text NOT NULL,
	`id` text NOT NULL,
	`address2dId` text NOT NULL,
	`units` text NOT NULL,
	`unitCount` integer NOT NULL,
	`contentHash` text NOT NULL,
	`unresolvedSectionIds` text NOT NULL,
	`sources` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `address3d_pk` PRIMARY KEY(`scopeId`, `id`),
	CONSTRAINT `address3d_scopeId_address2dId_address2d_fk` FOREIGN KEY (`scopeId`,`address2dId`) REFERENCES `address2d`(`scopeId`,`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `address3dI18n` (
	`scopeId` text NOT NULL,
	`address3dId` text NOT NULL,
	`locale` text NOT NULL,
	`meta` text,
	`units` text NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `address3dI18n_pk` PRIMARY KEY(`scopeId`, `address3dId`, `locale`),
	CONSTRAINT `address3dI18n_scopeId_address3dId_address3d_fk` FOREIGN KEY (`scopeId`,`address3dId`) REFERENCES `address3d`(`scopeId`,`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `addressPublicationState` (
	`scopeId` text PRIMARY KEY,
	`snapshotId` text NOT NULL UNIQUE,
	`divisionSnapshotId` text,
	`status` text DEFAULT 'publishing' NOT NULL,
	`publicationToken` text DEFAULT '' NOT NULL,
	`preparedAt` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `addressSearchScopes` (
	`scopeId` text PRIMARY KEY,
	`snapshotId` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `placeSearchScopes` (
	`scopeId` text PRIMARY KEY,
	`snapshotId` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `places` (
	`scopeId` text NOT NULL,
	`id` text NOT NULL,
	`resourceReleaseId` text NOT NULL,
	`addressDependencyHash` text,
	`addressRole` text,
	`address2dId` text,
	`address3dId` text,
	`address3dUnitId` text,
	`address3dMembership` text,
	`countryId` text,
	`areaId` text,
	`districtId` text,
	`townId` text,
	`ruralAreaId` text,
	`macrohoodId` text,
	`neighbourhoodId` text,
	`villageId` text,
	`microhoodId` text,
	`hamletId` text,
	`islandId` text,
	`geometry` text NOT NULL,
	`bbox` text,
	`operatingStatus` text,
	`basicCategory` text,
	`taxonomyPrimary` text,
	`taxonomyHierarchy` text,
	`taxonomyAlternates` text,
	`identifiers` text,
	`websites` text,
	`socials` text,
	`emails` text,
	`phones` text,
	`addresses` text,
	`confidence` real,
	`sources` text,
	`firstSeenMonth` text NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `places_pk` PRIMARY KEY(`scopeId`, `id`),
	CONSTRAINT "places_address3d_unit_reference_chk" CHECK(("address3dId" IS NULL AND "address3dUnitId" IS NULL AND "address3dMembership" IS NULL) OR ("address3dId" IS NOT NULL AND "address3dUnitId" IS NOT NULL AND "address3dMembership" IS NOT NULL AND "address2dId" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE `placesCells` (
	`scopeId` text NOT NULL,
	`id` text NOT NULL,
	`h3Level` integer NOT NULL,
	`h3Cell` text NOT NULL,
	CONSTRAINT `placesCells_pk` PRIMARY KEY(`scopeId`, `id`, `h3Level`, `h3Cell`),
	CONSTRAINT `placesCells_scopeId_id_places_fk` FOREIGN KEY (`scopeId`,`id`) REFERENCES `places`(`scopeId`,`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `placesI18n` (
	`scopeId` text NOT NULL,
	`searchDependencyText` text,
	`placeId` text NOT NULL,
	`locale` text NOT NULL,
	`name` text,
	`nameVariant` text,
	`nameAlts` text,
	`brandName` text,
	`brandNameVariant` text,
	`brandNameAlts` text,
	`freeformAddress` text,
	`accessHint` text,
	`meta` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `placesI18n_pk` PRIMARY KEY(`scopeId`, `placeId`, `locale`),
	CONSTRAINT `placesI18n_scopeId_placeId_places_fk` FOREIGN KEY (`scopeId`,`placeId`) REFERENCES `places`(`scopeId`,`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `divisionSearchScopes` (
	`scopeId` text PRIMARY KEY,
	`snapshotId` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `divisions` (
	`scopeId` text NOT NULL,
	`id` text NOT NULL,
	`divisionCode` text,
	`identifiers` text,
	`level` integer,
	`category` text,
	`class` text NOT NULL,
	`hierarchies` text NOT NULL,
	`cartography` text,
	`sources` text,
	`geometry` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `divisions_pk` PRIMARY KEY(`scopeId`, `id`)
);
--> statement-breakpoint
CREATE TABLE `divisionsI18n` (
	`scopeId` text NOT NULL,
	`divisionId` text NOT NULL,
	`locale` text NOT NULL,
	`name` text,
	`nameVariant` text,
	`nameAlts` text,
	`nameRules` text,
	`meta` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `divisionsI18n_pk` PRIMARY KEY(`scopeId`, `divisionId`, `locale`),
	CONSTRAINT `divisionsI18n_scopeId_divisionId_divisions_fk` FOREIGN KEY (`scopeId`,`divisionId`) REFERENCES `divisions`(`scopeId`,`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `streets` (
	`scopeId` text NOT NULL,
	`id` text NOT NULL,
	`version` integer NOT NULL,
	`status` text NOT NULL,
	`deletedAt` text,
	`districtIds` text,
	`gazetteDate` text,
	`yearBuilt` text,
	`noticeRefs` text,
	`evidenceAssets` text,
	`sources` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `streets_pk` PRIMARY KEY(`scopeId`, `id`),
	CONSTRAINT "streets_version_positive" CHECK("version" > 0)
);
--> statement-breakpoint
CREATE TABLE `streetsAddress` (
	`streetScopeId` text NOT NULL,
	`streetId` text NOT NULL,
	`addressSnapshotId` text NOT NULL,
	`addressId` text NOT NULL,
	CONSTRAINT `streetsAddress_pk` PRIMARY KEY(`streetScopeId`, `streetId`, `addressSnapshotId`, `addressId`),
	CONSTRAINT `streetsAddress_streetScopeId_streetId_streets_fk` FOREIGN KEY (`streetScopeId`,`streetId`) REFERENCES `streets`(`scopeId`,`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `streetsI18n` (
	`scopeId` text NOT NULL,
	`streetId` text NOT NULL,
	`locale` text NOT NULL,
	`meta` text,
	`name` text NOT NULL,
	`base` text,
	`designator` text,
	`directionalPrefix` text,
	`directionalSuffix` text,
	`normalised` text,
	`description` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `streetsI18n_pk` PRIMARY KEY(`scopeId`, `streetId`, `locale`),
	CONSTRAINT `streetsI18n_scopeId_streetId_streets_fk` FOREIGN KEY (`scopeId`,`streetId`) REFERENCES `streets`(`scopeId`,`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `streetChangelog` (
	`scopeId` text NOT NULL,
	`recordKey` text NOT NULL,
	`streetId` text NOT NULL,
	`kind` text NOT NULL,
	`isPartialNameChange` integer NOT NULL,
	`gazetteDate` text,
	`effectiveDate` text,
	`sourceShardId` text,
	`sourceReleaseId` text,
	`noticeRef` text,
	`evidenceAssets` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `streetChangelog_pk` PRIMARY KEY(`scopeId`, `recordKey`, `streetId`)
);
--> statement-breakpoint
CREATE TABLE `streetNameChangeStreets` (
	`scopeId` text NOT NULL,
	`nameChangeId` text NOT NULL,
	`streetId` text NOT NULL,
	`role` text NOT NULL,
	CONSTRAINT `streetNameChangeStreets_pk` PRIMARY KEY(`scopeId`, `nameChangeId`, `streetId`, `role`),
	CONSTRAINT `streetNameChangeStreets_change_fk` FOREIGN KEY (`scopeId`,`nameChangeId`) REFERENCES `streetNameChanges`(`scopeId`,`id`) ON DELETE CASCADE,
	CONSTRAINT `streetNameChangeStreets_street_fk` FOREIGN KEY (`scopeId`,`streetId`) REFERENCES `streets`(`scopeId`,`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `streetNameChanges` (
	`scopeId` text NOT NULL,
	`id` text NOT NULL,
	`noticeRef` text NOT NULL,
	`intentionNotificationDate` text,
	`nameChangeDate` text,
	`isPartialNameChange` integer NOT NULL,
	`status` text NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `streetNameChanges_pk` PRIMARY KEY(`scopeId`, `id`)
);
--> statement-breakpoint
CREATE TABLE `streetGeometry` (
	`scopeId` text NOT NULL,
	`streetId` text NOT NULL,
	`sourceReleaseId` text NOT NULL,
	`geometry` text NOT NULL,
	`bbox` text NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `streetGeometry_pk` PRIMARY KEY(`scopeId`, `streetId`)
);
--> statement-breakpoint
CREATE TABLE `divisionAreas` (
	`scopeId` text NOT NULL,
	`divisionId` text NOT NULL,
	`id` text NOT NULL,
	`variant` text DEFAULT 'overture' NOT NULL,
	`bbox` text,
	`geometry` text,
	`sources` text,
	`type` text NOT NULL,
	`isLand` integer,
	`isTerritorial` integer,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `divisionAreas_pk` PRIMARY KEY(`scopeId`, `id`)
);
--> statement-breakpoint
CREATE TABLE `divisionBoundaries` (
	`scopeId` text NOT NULL,
	`leftDivisionId` text NOT NULL,
	`rightDivisionId` text NOT NULL,
	`id` text NOT NULL,
	`variant` text DEFAULT 'overture' NOT NULL,
	`bbox` text,
	`geometry` text,
	`sources` text,
	`type` text NOT NULL,
	`isLand` integer,
	`isTerritorial` integer,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `divisionBoundaries_pk` PRIMARY KEY(`scopeId`, `id`)
);
--> statement-breakpoint
CREATE TABLE `statsDefinitionSets` (
	`id` text PRIMARY KEY,
	`fieldDefinitionHashes` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `statsFields` (
	`datasetCode` text NOT NULL,
	`measureCode` text NOT NULL,
	`measureVersionHash` text DEFAULT '' NOT NULL,
	`fieldName` text NOT NULL,
	`sourceField` text NOT NULL,
	`dimensions` text NOT NULL,
	`comparability` text,
	`sourceNullOption` text,
	`statisticKind` text DEFAULT 'unreviewed' NOT NULL,
	`aggregation` text DEFAULT 'unreviewed' NOT NULL,
	`aggregationPercentile` real,
	`periodicity` text,
	`denominatorFieldName` text,
	`valueKind` text NOT NULL,
	`unitCode` text NOT NULL,
	`versionHash` text DEFAULT '' NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `statsFields_pk` PRIMARY KEY(`datasetCode`, `fieldName`, `versionHash`)
);
--> statement-breakpoint
CREATE TABLE `statsFieldsI18n` (
	`datasetCode` text NOT NULL,
	`fieldName` text NOT NULL,
	`locale` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`meta` text,
	`versionHash` text DEFAULT '' NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `statsFieldsI18n_pk` PRIMARY KEY(`datasetCode`, `fieldName`, `locale`, `versionHash`)
);
--> statement-breakpoint
CREATE TABLE `statsMeasures` (
	`datasetCode` text NOT NULL,
	`measureCode` text NOT NULL,
	`versionHash` text DEFAULT '' NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `statsMeasures_pk` PRIMARY KEY(`datasetCode`, `measureCode`, `versionHash`)
);
--> statement-breakpoint
CREATE TABLE `statsMeasuresI18n` (
	`datasetCode` text NOT NULL,
	`measureCode` text NOT NULL,
	`locale` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`meta` text,
	`versionHash` text DEFAULT '' NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `statsMeasuresI18n_pk` PRIMARY KEY(`datasetCode`, `measureCode`, `locale`, `versionHash`)
);
--> statement-breakpoint
CREATE TABLE `statsRecords` (
	`id` text PRIMARY KEY NOT NULL,
	`datasetCode` text NOT NULL,
	`sourceReleaseId` text NOT NULL,
	`divisionId` text,
	`referencePeriodCode` text NOT NULL,
	`referencePeriodStart` text,
	`referencePeriodEnd` text,
	`referencePeriodGranularity` text NOT NULL,
	`referencePeriodEndYear` text NOT NULL,
	`geography` text NOT NULL,
	`fieldSources` text DEFAULT '[]' NOT NULL,
	`definitionSetId` text NOT NULL,
	`values` text NOT NULL,
	`versionHash` text DEFAULT '' NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `statsValuesI18n` (
	`datasetCode` text NOT NULL,
	`dimensionCode` text NOT NULL,
	`valueCode` text NOT NULL,
	`locale` text NOT NULL,
	`meta` text,
	`name` text NOT NULL,
	`versionHash` text DEFAULT '' NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `statsValuesI18n_pk` PRIMARY KEY(`datasetCode`, `dimensionCode`, `valueCode`, `locale`, `versionHash`)
);
--> statement-breakpoint
CREATE TABLE `divisionAreaPublicationState` (
	`scopeId` text PRIMARY KEY,
	`snapshotId` text NOT NULL UNIQUE,
	`status` text DEFAULT 'publishing' NOT NULL,
	`publicationToken` text DEFAULT '' NOT NULL,
	`preparedAt` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `divisionBoundaryPublicationState` (
	`scopeId` text PRIMARY KEY,
	`snapshotId` text NOT NULL UNIQUE,
	`status` text DEFAULT 'publishing' NOT NULL,
	`publicationToken` text DEFAULT '' NOT NULL,
	`preparedAt` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `divisionPublicationState` (
	`scopeId` text PRIMARY KEY,
	`snapshotId` text NOT NULL UNIQUE,
	`status` text DEFAULT 'publishing' NOT NULL,
	`publicationToken` text DEFAULT '' NOT NULL,
	`preparedAt` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `placePublicationState` (
	`scopeId` text PRIMARY KEY,
	`snapshotId` text NOT NULL UNIQUE,
	`divisionSnapshotId` text,
	`addressSnapshotId` text,
	`supplementaryAddressSnapshotId` text,
	`status` text DEFAULT 'publishing' NOT NULL,
	`publicationToken` text DEFAULT '' NOT NULL,
	`preparedAt` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `statsPublicationState` (
	`datasetCode` text NOT NULL,
	`referencePeriodCode` text NOT NULL,
	`snapshotId` text NOT NULL,
	`status` text NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `statsPublicationState_pk` PRIMARY KEY(`datasetCode`, `referencePeriodCode`)
);
--> statement-breakpoint
CREATE TABLE `streetPublicationState` (
	`scopeId` text PRIMARY KEY,
	`snapshotId` text NOT NULL UNIQUE,
	`status` text DEFAULT 'publishing' NOT NULL,
	`publicationToken` text DEFAULT '' NOT NULL,
	`preparedAt` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `divisionGeographicCrosswalks` (
	`id` text PRIMARY KEY,
	`geographicReleaseSet` text NOT NULL,
	`geographicSnapshotId` text NOT NULL,
	`geographicAreaSnapshotId` text NOT NULL,
	`sourceReleaseSet` text NOT NULL,
	`sourceSnapshotId` text NOT NULL,
	`sourceAreaSnapshotId` text NOT NULL,
	`sourceDomain` text NOT NULL,
	`sourceCohort` text NOT NULL,
	`policy` text NOT NULL,
	`contentHash` text NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `divisionGeographicMemberships` (
	`crosswalkId` text NOT NULL,
	`divisionId` text NOT NULL,
	`geographicDivisionId` text NOT NULL,
	`sourceGeometryHash` text NOT NULL,
	`geographicGeometryHash` text NOT NULL,
	`overlapSquareMetres` real NOT NULL,
	`sourceFraction` real NOT NULL,
	`fullyContained` integer NOT NULL,
	CONSTRAINT `divisionGeographicMemberships_pk` PRIMARY KEY(`crosswalkId`, `divisionId`, `geographicDivisionId`),
	CONSTRAINT `fk_divisionGeographicMemberships_crosswalkId_divisionGeographicCrosswalks_id_fk` FOREIGN KEY (`crosswalkId`) REFERENCES `divisionGeographicCrosswalks`(`id`)
);
--> statement-breakpoint
CREATE INDEX `address2d_countryId_scope_id_idx` ON `address2d` (`countryId`,`scopeId`,`id`) WHERE "address2d"."countryId" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `address2d_islandId_scope_id_idx` ON `address2d` (`islandId`,`scopeId`,`id`) WHERE "address2d"."islandId" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `address2d_areaId_scope_id_idx` ON `address2d` (`areaId`,`scopeId`,`id`) WHERE "address2d"."areaId" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `address2d_districtId_scope_id_idx` ON `address2d` (`districtId`,`scopeId`,`id`) WHERE "address2d"."districtId" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `address2d_townId_scope_id_idx` ON `address2d` (`townId`,`scopeId`,`id`) WHERE "address2d"."townId" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `address2d_ruralAreaId_scope_id_idx` ON `address2d` (`ruralAreaId`,`scopeId`,`id`) WHERE "address2d"."ruralAreaId" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `address2d_macrohoodId_scope_id_idx` ON `address2d` (`macrohoodId`,`scopeId`,`id`) WHERE "address2d"."macrohoodId" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `address2d_neighbourhoodId_scope_id_idx` ON `address2d` (`neighbourhoodId`,`scopeId`,`id`) WHERE "address2d"."neighbourhoodId" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `address2d_microhoodId_scope_id_idx` ON `address2d` (`microhoodId`,`scopeId`,`id`) WHERE "address2d"."microhoodId" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `address2d_villageId_scope_id_idx` ON `address2d` (`villageId`,`scopeId`,`id`) WHERE "address2d"."villageId" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `address2d_hamletId_scope_id_idx` ON `address2d` (`hamletId`,`scopeId`,`id`) WHERE "address2d"."hamletId" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `address2d_streetId_idx` ON `address2d` (`streetId`);--> statement-breakpoint
CREATE INDEX `address2d_parentAddressId_idx` ON `address2d` (`scopeId`,`parentAddressId`);--> statement-breakpoint
CREATE INDEX `address2d_divisionSnapshotId_idx` ON `address2d` (`divisionSnapshotId`);--> statement-breakpoint
CREATE INDEX `address2dBuildingNumberLookup_lookup_idx` ON `address2dBuildingNumberLookup` (`scopeId`,`buildingNumber`);--> statement-breakpoint
CREATE INDEX `address2dBuildingNumberLookup_numericStem_idx` ON `address2dBuildingNumberLookup` (`scopeId`,`numericStem`);--> statement-breakpoint
CREATE INDEX `address2dI18n_locale_idx` ON `address2dI18n` (`locale`);--> statement-breakpoint
CREATE UNIQUE INDEX `address3d_snapshot_owner_unique` ON `address3d` (`scopeId`,`address2dId`);--> statement-breakpoint
CREATE INDEX `address3dI18n_locale_idx` ON `address3dI18n` (`locale`);--> statement-breakpoint
CREATE INDEX `places_countryId_id_idx` ON `places` (`scopeId`,`countryId`,`id`);--> statement-breakpoint
CREATE INDEX `places_areaId_id_idx` ON `places` (`scopeId`,`areaId`,`id`);--> statement-breakpoint
CREATE INDEX `places_districtId_id_idx` ON `places` (`scopeId`,`districtId`,`id`);--> statement-breakpoint
CREATE INDEX `places_townId_id_idx` ON `places` (`scopeId`,`townId`,`id`);--> statement-breakpoint
CREATE INDEX `places_ruralAreaId_id_idx` ON `places` (`scopeId`,`ruralAreaId`,`id`);--> statement-breakpoint
CREATE INDEX `places_macrohoodId_id_idx` ON `places` (`scopeId`,`macrohoodId`,`id`);--> statement-breakpoint
CREATE INDEX `places_neighbourhoodId_id_idx` ON `places` (`scopeId`,`neighbourhoodId`,`id`);--> statement-breakpoint
CREATE INDEX `places_villageId_id_idx` ON `places` (`scopeId`,`villageId`,`id`);--> statement-breakpoint
CREATE INDEX `places_microhoodId_id_idx` ON `places` (`scopeId`,`microhoodId`,`id`);--> statement-breakpoint
CREATE INDEX `places_hamletId_id_idx` ON `places` (`scopeId`,`hamletId`,`id`);--> statement-breakpoint
CREATE INDEX `places_islandId_id_idx` ON `places` (`scopeId`,`islandId`,`id`);--> statement-breakpoint
CREATE INDEX `places_resourceReleaseId_idx` ON `places` (`resourceReleaseId`);--> statement-breakpoint
CREATE INDEX `places_category_id_idx` ON `places` (`scopeId`,`basicCategory`,`id`);--> statement-breakpoint
CREATE INDEX `places_taxonomy_id_idx` ON `places` (`scopeId`,`taxonomyPrimary`,`id`);--> statement-breakpoint
CREATE INDEX `places_status_id_idx` ON `places` (`scopeId`,`operatingStatus`,`id`);--> statement-breakpoint
CREATE INDEX `placesCells_lookup_idx` ON `placesCells` (`scopeId`,`h3Level`,`h3Cell`,`id`);--> statement-breakpoint
CREATE INDEX `placesI18n_name_idx` ON `placesI18n` (`locale`,`name`);--> statement-breakpoint
CREATE INDEX `divisions_divisionCode_idx` ON `divisions` (`scopeId`,`divisionCode`);--> statement-breakpoint
CREATE INDEX `divisions_scope_order_idx` ON `divisions` (`scopeId`,`level`,`class`,`id`);--> statement-breakpoint
CREATE INDEX `divisionsI18n_name_idx` ON `divisionsI18n` (`scopeId`,`locale`,`name`);--> statement-breakpoint
CREATE INDEX `streetsAddress_addressId_idx` ON `streetsAddress` (`addressSnapshotId`,`addressId`);--> statement-breakpoint
CREATE INDEX `streetsI18n_name_idx` ON `streetsI18n` (`locale`,`name`);--> statement-breakpoint
CREATE INDEX `streetChangelog_street_idx` ON `streetChangelog` (`scopeId`,`streetId`);--> statement-breakpoint
CREATE INDEX `streetChangelog_recordKey_idx` ON `streetChangelog` (`recordKey`);--> statement-breakpoint
CREATE INDEX `streetNameChangeStreets_streetId_idx` ON `streetNameChangeStreets` (`scopeId`,`streetId`);--> statement-breakpoint
CREATE INDEX `streetNameChanges_noticeRef_idx` ON `streetNameChanges` (`noticeRef`);--> statement-breakpoint
CREATE INDEX `streetNameChanges_status_idx` ON `streetNameChanges` (`status`);--> statement-breakpoint
CREATE INDEX `streetGeometry_streetId_idx` ON `streetGeometry` (`streetId`);--> statement-breakpoint
CREATE INDEX `streetGeometry_sourceReleaseId_idx` ON `streetGeometry` (`sourceReleaseId`);--> statement-breakpoint
CREATE INDEX `divisionAreas_divisionId_idx` ON `divisionAreas` (`scopeId`,`divisionId`);--> statement-breakpoint
CREATE INDEX `divisionAreas_type_idx` ON `divisionAreas` (`scopeId`,`type`);--> statement-breakpoint
CREATE INDEX `divisionBoundaries_leftDivisionId_idx` ON `divisionBoundaries` (`scopeId`,`leftDivisionId`);--> statement-breakpoint
CREATE INDEX `divisionBoundaries_rightDivisionId_idx` ON `divisionBoundaries` (`scopeId`,`rightDivisionId`);--> statement-breakpoint
CREATE INDEX `divisionBoundaries_type_idx` ON `divisionBoundaries` (`scopeId`,`type`);--> statement-breakpoint
CREATE INDEX `statsRecords_dataset_period_idx` ON `statsRecords` (`datasetCode`,`referencePeriodCode`);--> statement-breakpoint
CREATE INDEX `statsRecords_division_period_idx` ON `statsRecords` (`divisionId`,`referencePeriodCode`);--> statement-breakpoint
CREATE INDEX `statsRecords_source_release_idx` ON `statsRecords` (`sourceReleaseId`);--> statement-breakpoint
CREATE INDEX `divisionGeographicCrosswalks_selection_idx` ON `divisionGeographicCrosswalks` (`geographicReleaseSet`,`sourceSnapshotId`);--> statement-breakpoint
CREATE INDEX `divisionGeographicMemberships_target_idx` ON `divisionGeographicMemberships` (`crosswalkId`,`geographicDivisionId`);