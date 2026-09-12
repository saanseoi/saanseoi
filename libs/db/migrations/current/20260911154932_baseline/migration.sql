CREATE TABLE `address2d` (
	`snapshotId` text NOT NULL,
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
	`macrohoodId` text,
	`townId` text,
	`districtId` text,
	`areaId` text,
	`countryId` text,
	`identifiers` text,
	`sources` text,
	`geometry` text,
	`bbox` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `address2d_pk` PRIMARY KEY(`snapshotId`, `id`),
	CONSTRAINT `address2d_divisionSnapshotId_countryId_divisions_fk` FOREIGN KEY (`divisionSnapshotId`,`countryId`) REFERENCES `divisions`(`snapshotId`,`id`),
	CONSTRAINT `address2d_divisionSnapshotId_areaId_divisions_fk` FOREIGN KEY (`divisionSnapshotId`,`areaId`) REFERENCES `divisions`(`snapshotId`,`id`),
	CONSTRAINT `address2d_divisionSnapshotId_districtId_divisions_fk` FOREIGN KEY (`divisionSnapshotId`,`districtId`) REFERENCES `divisions`(`snapshotId`,`id`),
	CONSTRAINT `address2d_divisionSnapshotId_townId_divisions_fk` FOREIGN KEY (`divisionSnapshotId`,`townId`) REFERENCES `divisions`(`snapshotId`,`id`),
	CONSTRAINT `address2d_divisionSnapshotId_macrohoodId_divisions_fk` FOREIGN KEY (`divisionSnapshotId`,`macrohoodId`) REFERENCES `divisions`(`snapshotId`,`id`),
	CONSTRAINT `address2d_divisionSnapshotId_villageId_divisions_fk` FOREIGN KEY (`divisionSnapshotId`,`villageId`) REFERENCES `divisions`(`snapshotId`,`id`),
	CONSTRAINT `address2d_divisionSnapshotId_neighbourhoodId_divisions_fk` FOREIGN KEY (`divisionSnapshotId`,`neighbourhoodId`) REFERENCES `divisions`(`snapshotId`,`id`),
	CONSTRAINT `address2d_divisionSnapshotId_hamletId_divisions_fk` FOREIGN KEY (`divisionSnapshotId`,`hamletId`) REFERENCES `divisions`(`snapshotId`,`id`),
	CONSTRAINT `address2d_divisionSnapshotId_microhoodId_divisions_fk` FOREIGN KEY (`divisionSnapshotId`,`microhoodId`) REFERENCES `divisions`(`snapshotId`,`id`),
	CONSTRAINT `address2d_streetSnapshotId_streetId_streets_fk` FOREIGN KEY (`streetSnapshotId`,`streetId`) REFERENCES `streets`(`snapshotId`,`id`),
	CONSTRAINT "address2d_street_reference_consistency_chk" CHECK(("streetSnapshotId" IS NULL) = ("streetId" IS NULL))
);
--> statement-breakpoint
CREATE TABLE `address2dBuildingNumberLookup` (
	`snapshotId` text NOT NULL,
	`addressId` text NOT NULL,
	`buildingNumber` text NOT NULL,
	`numericStem` text,
	`evidence` text NOT NULL,
	`derivation` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `address2dBuildingNumberLookup_pk` PRIMARY KEY(`snapshotId`, `addressId`, `buildingNumber`),
	CONSTRAINT `address2dBuildingNumberLookup_snapshotId_addressId_address2d_fk` FOREIGN KEY (`snapshotId`,`addressId`) REFERENCES `address2d`(`snapshotId`,`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `address2dI18n` (
	`snapshotId` text NOT NULL,
	`addressId` text NOT NULL,
	`locale` text NOT NULL,
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
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `address2dI18n_pk` PRIMARY KEY(`snapshotId`, `addressId`, `locale`),
	CONSTRAINT `address2dI18n_snapshotId_addressId_address2d_fk` FOREIGN KEY (`snapshotId`,`addressId`) REFERENCES `address2d`(`snapshotId`,`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `address3d` (
	`snapshotId` text NOT NULL,
	`id` text NOT NULL,
	`address2dId` text NOT NULL,
	`units` text NOT NULL,
	`unitCount` integer NOT NULL,
	`contentHash` text NOT NULL,
	`unresolvedSectionIds` text NOT NULL,
	`sources` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `address3d_pk` PRIMARY KEY(`snapshotId`, `id`),
	CONSTRAINT `address3d_snapshotId_address2dId_address2d_fk` FOREIGN KEY (`snapshotId`,`address2dId`) REFERENCES `address2d`(`snapshotId`,`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `address3dI18n` (
	`snapshotId` text NOT NULL,
	`address3dId` text NOT NULL,
	`locale` text NOT NULL,
	`units` text NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `address3dI18n_pk` PRIMARY KEY(`snapshotId`, `address3dId`, `locale`),
	CONSTRAINT `address3dI18n_snapshotId_address3dId_address3d_fk` FOREIGN KEY (`snapshotId`,`address3dId`) REFERENCES `address3d`(`snapshotId`,`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `addressPublicationState` (
	`scopeId` text PRIMARY KEY,
	`snapshotId` text NOT NULL UNIQUE,
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
	`snapshotId` text NOT NULL,
	`id` text NOT NULL,
	`releaseId` text NOT NULL,
	`addressSnapshotId` text,
	`address2dId` text,
	`address3dId` text,
	`address3dUnitId` text,
	`address3dMembership` text,
	`lng` real NOT NULL,
	`lat` real NOT NULL,
	`bbox` text,
	`operatingStatus` text,
	`basicCategory` text,
	`taxonomyPrimary` text,
	`taxonomyHierarchy` text,
	`taxonomyAlternates` text,
	`wikidataId` text,
	`websites` text,
	`socials` text,
	`emails` text,
	`phones` text,
	`addresses` text,
	`confidence` real,
	`sources` text,
	`firstSeenMonth` text NOT NULL,
	`lastSeenMonth` text NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `places_pk` PRIMARY KEY(`snapshotId`, `id`),
	CONSTRAINT "places_address_snapshot_required_chk" CHECK("addressSnapshotId" IS NOT NULL OR ("address2dId" IS NULL AND "address3dId" IS NULL)),
	CONSTRAINT "places_address3d_unit_reference_chk" CHECK(("address3dId" IS NULL AND "address3dUnitId" IS NULL AND "address3dMembership" IS NULL) OR ("address3dId" IS NOT NULL AND "address3dUnitId" IS NOT NULL AND "address3dMembership" IS NOT NULL AND "address2dId" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE `placesCells` (
	`snapshotId` text NOT NULL,
	`id` text NOT NULL,
	`h3Level` integer NOT NULL,
	`h3Cell` text NOT NULL,
	CONSTRAINT `placesCells_pk` PRIMARY KEY(`snapshotId`, `id`, `h3Level`, `h3Cell`),
	CONSTRAINT `placesCells_snapshotId_id_places_fk` FOREIGN KEY (`snapshotId`,`id`) REFERENCES `places`(`snapshotId`,`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `placesDivision` (
	`placeSnapshotId` text NOT NULL,
	`placeId` text NOT NULL,
	`divisionSnapshotId` text NOT NULL,
	`divisionId` text NOT NULL,
	CONSTRAINT `placesDivision_pk` PRIMARY KEY(`placeSnapshotId`, `placeId`, `divisionSnapshotId`, `divisionId`),
	CONSTRAINT `placesDivision_placeSnapshotId_placeId_places_fk` FOREIGN KEY (`placeSnapshotId`,`placeId`) REFERENCES `places`(`snapshotId`,`id`) ON DELETE CASCADE,
	CONSTRAINT `placesDivision_divisionSnapshotId_divisionId_divisions_fk` FOREIGN KEY (`divisionSnapshotId`,`divisionId`) REFERENCES `divisions`(`snapshotId`,`id`)
);
--> statement-breakpoint
CREATE TABLE `placesI18n` (
	`snapshotId` text NOT NULL,
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
	`provenance` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `placesI18n_pk` PRIMARY KEY(`snapshotId`, `placeId`, `locale`),
	CONSTRAINT `placesI18n_snapshotId_placeId_places_fk` FOREIGN KEY (`snapshotId`,`placeId`) REFERENCES `places`(`snapshotId`,`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `divisionSearchScopes` (
	`scopeId` text PRIMARY KEY,
	`snapshotId` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `divisions` (
	`snapshotId` text NOT NULL,
	`id` text NOT NULL,
	`divisionCode` text,
	`identifiers` text,
	`level` integer,
	`category` text,
	`class` text NOT NULL,
	`wikidata` text,
	`hierarchies` text NOT NULL,
	`cartography` text,
	`sources` text,
	`geometry` text,
	`bbox` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `divisions_pk` PRIMARY KEY(`snapshotId`, `id`)
);
--> statement-breakpoint
CREATE TABLE `divisionsI18n` (
	`snapshotId` text NOT NULL,
	`divisionId` text NOT NULL,
	`locale` text NOT NULL,
	`name` text,
	`nameVariant` text,
	`nameAlts` text,
	`nameRules` text,
	`nameProvenance` text,
	`isLocaleInferred` integer NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `divisionsI18n_pk` PRIMARY KEY(`snapshotId`, `divisionId`, `locale`),
	CONSTRAINT `divisionsI18n_snapshotId_divisionId_divisions_fk` FOREIGN KEY (`snapshotId`,`divisionId`) REFERENCES `divisions`(`snapshotId`,`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `streets` (
	`snapshotId` text NOT NULL,
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
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `streets_pk` PRIMARY KEY(`snapshotId`, `id`),
	CONSTRAINT "streets_version_positive" CHECK("version" > 0)
);
--> statement-breakpoint
CREATE TABLE `streetsAddress` (
	`streetSnapshotId` text NOT NULL,
	`streetId` text NOT NULL,
	`addressSnapshotId` text NOT NULL,
	`addressId` text NOT NULL,
	CONSTRAINT `streetsAddress_pk` PRIMARY KEY(`streetSnapshotId`, `streetId`, `addressSnapshotId`, `addressId`),
	CONSTRAINT `streetsAddress_streetSnapshotId_streetId_streets_fk` FOREIGN KEY (`streetSnapshotId`,`streetId`) REFERENCES `streets`(`snapshotId`,`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `streetsI18n` (
	`snapshotId` text NOT NULL,
	`streetId` text NOT NULL,
	`locale` text NOT NULL,
	`name` text NOT NULL,
	`base` text,
	`designator` text,
	`directionalPrefix` text,
	`directionalSuffix` text,
	`normalised` text,
	`description` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `streetsI18n_pk` PRIMARY KEY(`snapshotId`, `streetId`, `locale`),
	CONSTRAINT `streetsI18n_snapshotId_streetId_streets_fk` FOREIGN KEY (`snapshotId`,`streetId`) REFERENCES `streets`(`snapshotId`,`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `streetChangelog` (
	`snapshotId` text NOT NULL,
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
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `streetChangelog_pk` PRIMARY KEY(`snapshotId`, `recordKey`, `streetId`)
);
--> statement-breakpoint
CREATE TABLE `streetNameChangeStreets` (
	`snapshotId` text NOT NULL,
	`nameChangeId` text NOT NULL,
	`streetId` text NOT NULL,
	`role` text NOT NULL,
	CONSTRAINT `streetNameChangeStreets_pk` PRIMARY KEY(`snapshotId`, `nameChangeId`, `streetId`, `role`),
	CONSTRAINT `streetNameChangeStreets_change_fk` FOREIGN KEY (`snapshotId`,`nameChangeId`) REFERENCES `streetNameChanges`(`snapshotId`,`id`) ON DELETE CASCADE,
	CONSTRAINT `streetNameChangeStreets_street_fk` FOREIGN KEY (`snapshotId`,`streetId`) REFERENCES `streets`(`snapshotId`,`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `streetNameChanges` (
	`snapshotId` text NOT NULL,
	`id` text NOT NULL,
	`noticeRef` text NOT NULL,
	`intentionNotificationDate` text,
	`nameChangeDate` text,
	`isPartialNameChange` integer NOT NULL,
	`status` text NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `streetNameChanges_pk` PRIMARY KEY(`snapshotId`, `id`)
);
--> statement-breakpoint
CREATE TABLE `streetGeometry` (
	`snapshotId` text NOT NULL,
	`streetId` text NOT NULL,
	`sourceReleaseId` text NOT NULL,
	`geometry` text NOT NULL,
	`bbox` text NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `streetGeometry_pk` PRIMARY KEY(`snapshotId`, `streetId`)
);
--> statement-breakpoint
CREATE TABLE `divisionAreas` (
	`snapshotId` text NOT NULL,
	`id` text NOT NULL,
	`variant` text DEFAULT 'overture' NOT NULL,
	`bbox` text,
	`geometry` text,
	`identifiers` text,
	`sources` text,
	`type` text NOT NULL,
	`isLand` integer,
	`isTerritorial` integer,
	`divisionId` text NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `divisionAreas_pk` PRIMARY KEY(`snapshotId`, `id`)
);
--> statement-breakpoint
CREATE TABLE `divisionBoundaries` (
	`snapshotId` text NOT NULL,
	`id` text NOT NULL,
	`variant` text DEFAULT 'overture' NOT NULL,
	`bbox` text,
	`geometry` text,
	`identifiers` text,
	`sources` text,
	`type` text NOT NULL,
	`isLand` integer,
	`isTerritorial` integer,
	`leftDivisionId` text NOT NULL,
	`rightDivisionId` text NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `divisionBoundaries_pk` PRIMARY KEY(`snapshotId`, `id`)
);
--> statement-breakpoint
CREATE TABLE `divisionStatistics` (
	`snapshotId` text NOT NULL,
	`id` text NOT NULL,
	`divisionId` text NOT NULL,
	`districtCode` text NOT NULL,
	`referenceYear` text NOT NULL,
	`landAreaSqKm` real NOT NULL,
	`midYearPopulation` integer NOT NULL,
	`midYearPopulationDensityPerSqKm` integer NOT NULL,
	`sources` text NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `divisionStatistics_pk` PRIMARY KEY(`snapshotId`, `id`)
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
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `statsFields_pk` PRIMARY KEY(`datasetCode`, `fieldName`, `versionHash`)
);
--> statement-breakpoint
CREATE TABLE `statsFieldsI18n` (
	`datasetCode` text NOT NULL,
	`fieldName` text NOT NULL,
	`locale` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`isTranslationVerified` integer DEFAULT true NOT NULL,
	`versionHash` text DEFAULT '' NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `statsFieldsI18n_pk` PRIMARY KEY(`datasetCode`, `fieldName`, `locale`, `versionHash`)
);
--> statement-breakpoint
CREATE TABLE `statsMeasures` (
	`datasetCode` text NOT NULL,
	`measureCode` text NOT NULL,
	`versionHash` text DEFAULT '' NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `statsMeasures_pk` PRIMARY KEY(`datasetCode`, `measureCode`, `versionHash`)
);
--> statement-breakpoint
CREATE TABLE `statsMeasuresI18n` (
	`datasetCode` text NOT NULL,
	`measureCode` text NOT NULL,
	`locale` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`isTranslationVerified` integer DEFAULT true NOT NULL,
	`versionHash` text DEFAULT '' NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `statsMeasuresI18n_pk` PRIMARY KEY(`datasetCode`, `measureCode`, `locale`, `versionHash`)
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
CREATE TABLE `statsRecords` (
	`id` text PRIMARY KEY NOT NULL,
	`datasetCode` text NOT NULL,
	`sourceReleaseId` text NOT NULL,
	`sourceFeatureRef` text NOT NULL,
	`divisionId` text,
	`referencePeriodCode` text NOT NULL,
	`referencePeriodStart` text,
	`referencePeriodEnd` text,
	`referencePeriodGranularity` text NOT NULL,
	`referencePeriodEndYear` text NOT NULL,
	`geography` text NOT NULL,
	`fieldSources` text DEFAULT '{}' NOT NULL,
	`fieldDefinitionHashes` text DEFAULT '{}' NOT NULL,
	`values` text NOT NULL,
	`versionHash` text DEFAULT '' NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `statsValuesI18n` (
	`datasetCode` text NOT NULL,
	`dimensionCode` text NOT NULL,
	`valueCode` text NOT NULL,
	`locale` text NOT NULL,
	`name` text NOT NULL,
	`versionHash` text DEFAULT '' NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `statsValuesI18n_pk` PRIMARY KEY(`datasetCode`, `dimensionCode`, `valueCode`, `locale`, `versionHash`)
);
--> statement-breakpoint
CREATE TABLE `divisionAreaPublicationState` (
	`snapshotId` text PRIMARY KEY,
	`scopeId` text NOT NULL,
	`status` text DEFAULT 'publishing' NOT NULL,
	`publicationToken` text DEFAULT '' NOT NULL,
	`preparedAt` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `divisionBoundaryPublicationState` (
	`snapshotId` text PRIMARY KEY,
	`scopeId` text NOT NULL,
	`status` text DEFAULT 'publishing' NOT NULL,
	`publicationToken` text DEFAULT '' NOT NULL,
	`preparedAt` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `divisionPublicationState` (
	`snapshotId` text PRIMARY KEY,
	`scopeId` text NOT NULL,
	`status` text DEFAULT 'publishing' NOT NULL,
	`publicationToken` text DEFAULT '' NOT NULL,
	`preparedAt` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `placePublicationState` (
	`snapshotId` text PRIMARY KEY,
	`scopeId` text NOT NULL,
	`status` text DEFAULT 'publishing' NOT NULL,
	`publicationToken` text DEFAULT '' NOT NULL,
	`preparedAt` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `streetPublicationState` (
	`snapshotId` text PRIMARY KEY,
	`scopeId` text NOT NULL,
	`status` text DEFAULT 'publishing' NOT NULL,
	`publicationToken` text DEFAULT '' NOT NULL,
	`preparedAt` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `address2d_streetId_idx` ON `address2d` (`streetId`);--> statement-breakpoint
CREATE INDEX `address2d_parentAddressId_idx` ON `address2d` (`snapshotId`,`parentAddressId`);--> statement-breakpoint
CREATE INDEX `address2d_division_idx` ON `address2d` (`divisionSnapshotId`,`hamletId`,`microhoodId`,`villageId`,`neighbourhoodId`,`macrohoodId`,`townId`,`districtId`);--> statement-breakpoint
CREATE INDEX `address2dBuildingNumberLookup_lookup_idx` ON `address2dBuildingNumberLookup` (`snapshotId`,`buildingNumber`);--> statement-breakpoint
CREATE INDEX `address2dBuildingNumberLookup_numericStem_idx` ON `address2dBuildingNumberLookup` (`snapshotId`,`numericStem`);--> statement-breakpoint
CREATE INDEX `address2dI18n_locale_idx` ON `address2dI18n` (`locale`);--> statement-breakpoint
CREATE UNIQUE INDEX `address3d_snapshot_owner_unique` ON `address3d` (`snapshotId`,`address2dId`);--> statement-breakpoint
CREATE INDEX `address3dI18n_locale_idx` ON `address3dI18n` (`locale`);--> statement-breakpoint
CREATE INDEX `places_releaseId_idx` ON `places` (`releaseId`);--> statement-breakpoint
CREATE INDEX `places_category_idx` ON `places` (`snapshotId`,`basicCategory`);--> statement-breakpoint
CREATE INDEX `places_taxonomy_idx` ON `places` (`snapshotId`,`taxonomyPrimary`);--> statement-breakpoint
CREATE INDEX `places_status_idx` ON `places` (`snapshotId`,`operatingStatus`);--> statement-breakpoint
CREATE INDEX `placesCells_lookup_idx` ON `placesCells` (`snapshotId`,`h3Level`,`h3Cell`,`id`);--> statement-breakpoint
CREATE INDEX `placesDivision_divisionId_idx` ON `placesDivision` (`divisionSnapshotId`,`divisionId`,`placeSnapshotId`,`placeId`);--> statement-breakpoint
CREATE INDEX `placesI18n_locale_idx` ON `placesI18n` (`locale`);--> statement-breakpoint
CREATE INDEX `placesI18n_name_idx` ON `placesI18n` (`locale`,`name`);--> statement-breakpoint
CREATE INDEX `divisions_divisionCode_idx` ON `divisions` (`snapshotId`,`divisionCode`);--> statement-breakpoint
CREATE INDEX `divisions_level_idx` ON `divisions` (`level`);--> statement-breakpoint
CREATE INDEX `divisionsI18n_locale_idx` ON `divisionsI18n` (`snapshotId`,`locale`);--> statement-breakpoint
CREATE INDEX `divisionsI18n_name_idx` ON `divisionsI18n` (`snapshotId`,`locale`,`name`);--> statement-breakpoint
CREATE INDEX `streetsAddress_addressId_idx` ON `streetsAddress` (`addressSnapshotId`,`addressId`);--> statement-breakpoint
CREATE INDEX `streetsI18n_locale_idx` ON `streetsI18n` (`locale`);--> statement-breakpoint
CREATE INDEX `streetsI18n_name_idx` ON `streetsI18n` (`locale`,`name`);--> statement-breakpoint
CREATE INDEX `streetChangelog_street_idx` ON `streetChangelog` (`snapshotId`,`streetId`);--> statement-breakpoint
CREATE INDEX `streetChangelog_recordKey_idx` ON `streetChangelog` (`recordKey`);--> statement-breakpoint
CREATE INDEX `streetNameChangeStreets_streetId_idx` ON `streetNameChangeStreets` (`snapshotId`,`streetId`);--> statement-breakpoint
CREATE INDEX `streetNameChanges_noticeRef_idx` ON `streetNameChanges` (`noticeRef`);--> statement-breakpoint
CREATE INDEX `streetNameChanges_status_idx` ON `streetNameChanges` (`status`);--> statement-breakpoint
CREATE INDEX `streetGeometry_streetId_idx` ON `streetGeometry` (`streetId`);--> statement-breakpoint
CREATE INDEX `streetGeometry_sourceReleaseId_idx` ON `streetGeometry` (`sourceReleaseId`);--> statement-breakpoint
CREATE INDEX `divisionAreas_divisionId_idx` ON `divisionAreas` (`snapshotId`,`divisionId`);--> statement-breakpoint
CREATE INDEX `divisionAreas_type_idx` ON `divisionAreas` (`snapshotId`,`type`);--> statement-breakpoint
CREATE INDEX `divisionBoundaries_leftDivisionId_idx` ON `divisionBoundaries` (`snapshotId`,`leftDivisionId`);--> statement-breakpoint
CREATE INDEX `divisionBoundaries_rightDivisionId_idx` ON `divisionBoundaries` (`snapshotId`,`rightDivisionId`);--> statement-breakpoint
CREATE INDEX `divisionBoundaries_type_idx` ON `divisionBoundaries` (`snapshotId`,`type`);--> statement-breakpoint
CREATE INDEX `divisionStatistics_divisionId_referenceYear_idx` ON `divisionStatistics` (`snapshotId`,`divisionId`,`referenceYear`);--> statement-breakpoint
CREATE INDEX `statsRecords_dataset_period_idx` ON `statsRecords` (`datasetCode`,`referencePeriodCode`);--> statement-breakpoint
CREATE INDEX `statsRecords_division_period_idx` ON `statsRecords` (`divisionId`,`referencePeriodCode`);--> statement-breakpoint
CREATE INDEX `statsRecords_source_release_idx` ON `statsRecords` (`sourceReleaseId`);--> statement-breakpoint
CREATE INDEX `divisionAreaPublicationState_scope_idx` ON `divisionAreaPublicationState` (`scopeId`);--> statement-breakpoint
CREATE INDEX `divisionBoundaryPublicationState_scope_idx` ON `divisionBoundaryPublicationState` (`scopeId`);--> statement-breakpoint
CREATE INDEX `divisionPublicationState_scope_idx` ON `divisionPublicationState` (`scopeId`);--> statement-breakpoint
CREATE INDEX `placePublicationState_scope_idx` ON `placePublicationState` (`scopeId`);--> statement-breakpoint
CREATE INDEX `streetPublicationState_scope_idx` ON `streetPublicationState` (`scopeId`);