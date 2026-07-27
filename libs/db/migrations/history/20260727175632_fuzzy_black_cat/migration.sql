CREATE TABLE `divisions` (
	`id` text NOT NULL,
	`identifiers` text,
	`level` integer NOT NULL,
	`type` text NOT NULL,
	`sourceKeys` text,
	`wikidata` text,
	`hierarchy` text,
	`cartography` text,
	`sources` text,
	`geometry` text,
	`bbox` text,
	`versionHash` text NOT NULL,
	`sourceReleaseId` text NOT NULL,
	`snapshotId` text NOT NULL,
	`isCurrent` integer NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `divisions_pk` PRIMARY KEY(`id`, `versionHash`)
);
--> statement-breakpoint
CREATE TABLE `divisionsI18n` (
	`divisionId` text NOT NULL,
	`locale` text NOT NULL,
	`name` text,
	`nameVariant` text,
	`nameAlts` text,
	`nameRules` text,
	`isLocaleInferred` integer NOT NULL,
	`versionHash` text NOT NULL,
	`sourceReleaseId` text NOT NULL,
	`snapshotId` text NOT NULL,
	`isCurrent` integer NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `divisionsI18n_pk` PRIMARY KEY(`divisionId`, `versionHash`, `locale`)
);
--> statement-breakpoint
CREATE TABLE `address2d` (
	`id` text NOT NULL,
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
	`versionHash` text NOT NULL,
	`sourceReleaseId` text NOT NULL,
	`snapshotId` text NOT NULL,
	`isCurrent` integer NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `address2d_pk` PRIMARY KEY(`id`, `versionHash`)
);
--> statement-breakpoint
CREATE TABLE `address2dBuildingNumberLookup` (
	`addressId` text NOT NULL,
	`buildingNumber` text NOT NULL,
	`numericStem` text,
	`evidence` text NOT NULL,
	`derivation` text,
	`versionHash` text NOT NULL,
	`sourceReleaseId` text NOT NULL,
	`snapshotId` text NOT NULL,
	`isCurrent` integer NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `address2dBuildingNumberLookup_pk` PRIMARY KEY(`addressId`, `versionHash`, `buildingNumber`)
);
--> statement-breakpoint
CREATE TABLE `address2dI18n` (
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
	`versionHash` text NOT NULL,
	`sourceReleaseId` text NOT NULL,
	`snapshotId` text NOT NULL,
	`isCurrent` integer NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `address2dI18n_pk` PRIMARY KEY(`addressId`, `versionHash`, `locale`)
);
--> statement-breakpoint
CREATE TABLE `address3d` (
	`id` text NOT NULL,
	`address2dId` text NOT NULL,
	`sources` text,
	`versionHash` text NOT NULL,
	`sourceReleaseId` text NOT NULL,
	`snapshotId` text NOT NULL,
	`isCurrent` integer NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `address3d_pk` PRIMARY KEY(`id`, `versionHash`)
);
--> statement-breakpoint
CREATE TABLE `address3dI18n` (
	`address3dId` text NOT NULL,
	`locale` text NOT NULL,
	`formattedAddressPart` text NOT NULL,
	`accessHint` text,
	`unitPortion` text,
	`unitExpression` text,
	`unitRef` text,
	`unitType` text,
	`floorExpression` text,
	`floorRef` text,
	`floorType` text,
	`versionHash` text NOT NULL,
	`sourceReleaseId` text NOT NULL,
	`snapshotId` text NOT NULL,
	`isCurrent` integer NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `address3dI18n_pk` PRIMARY KEY(`address3dId`, `versionHash`, `locale`)
);
--> statement-breakpoint
CREATE TABLE `address3dUnitRefLookup` (
	`address3dId` text NOT NULL,
	`unitRef` text NOT NULL,
	`numericStem` text,
	`evidence` text NOT NULL,
	`derivation` text,
	`versionHash` text NOT NULL,
	`sourceReleaseId` text NOT NULL,
	`snapshotId` text NOT NULL,
	`isCurrent` integer NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `address3dUnitRefLookup_pk` PRIMARY KEY(`address3dId`, `versionHash`, `unitRef`)
);
--> statement-breakpoint
CREATE TABLE `streets` (
	`id` text NOT NULL,
	`version` integer NOT NULL,
	`status` text NOT NULL,
	`deletedAt` text,
	`districtIds` text,
	`gazetteDate` text,
	`yearBuilt` text,
	`noticeRefs` text,
	`evidenceAssets` text,
	`sourceKeys` text,
	`versionHash` text NOT NULL,
	`sourceReleaseId` text NOT NULL,
	`snapshotId` text NOT NULL,
	`isCurrent` integer NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `streets_pk` PRIMARY KEY(`id`, `versionHash`),
	CONSTRAINT "history_streets_version_positive" CHECK("version" > 0)
);
--> statement-breakpoint
CREATE TABLE `streetsI18n` (
	`streetId` text NOT NULL,
	`locale` text NOT NULL,
	`name` text NOT NULL,
	`base` text,
	`designator` text,
	`directionalPrefix` text,
	`directionalSuffix` text,
	`normalised` text,
	`description` text,
	`versionHash` text NOT NULL,
	`sourceReleaseId` text NOT NULL,
	`snapshotId` text NOT NULL,
	`isCurrent` integer NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `streetsI18n_pk` PRIMARY KEY(`streetId`, `versionHash`, `locale`)
);
--> statement-breakpoint
CREATE TABLE `streetChangelog` (
	`streetId` text NOT NULL,
	`recordKey` text NOT NULL,
	`kind` text NOT NULL,
	`isPartialNameChange` integer NOT NULL,
	`gazetteDate` text,
	`effectiveDate` text,
	`sourceShardId` text,
	`noticeRef` text,
	`evidenceAssets` text,
	`versionHash` text NOT NULL,
	`sourceReleaseId` text NOT NULL,
	`snapshotId` text NOT NULL,
	`isCurrent` integer NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `streetChangelog_pk` PRIMARY KEY(`streetId`, `recordKey`, `versionHash`)
);
--> statement-breakpoint
CREATE TABLE `streetNameChangeStreets` (
	`nameChangeId` text NOT NULL,
	`streetId` text NOT NULL,
	`role` text NOT NULL,
	`versionHash` text NOT NULL,
	`sourceReleaseId` text NOT NULL,
	`snapshotId` text NOT NULL,
	`isCurrent` integer NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `streetNameChangeStreets_pk` PRIMARY KEY(`nameChangeId`, `versionHash`, `streetId`, `role`)
);
--> statement-breakpoint
CREATE TABLE `streetNameChanges` (
	`id` text NOT NULL,
	`noticeRef` text NOT NULL,
	`intentionNotificationDate` text,
	`nameChangeDate` text,
	`isPartialNameChange` integer NOT NULL,
	`status` text NOT NULL,
	`versionHash` text NOT NULL,
	`sourceReleaseId` text NOT NULL,
	`snapshotId` text NOT NULL,
	`isCurrent` integer NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `streetNameChanges_pk` PRIMARY KEY(`id`, `versionHash`)
);
--> statement-breakpoint
CREATE TABLE `streetGeometry` (
	`streetId` text NOT NULL,
	`geometry` text NOT NULL,
	`bbox` text NOT NULL,
	`versionHash` text NOT NULL,
	`sourceReleaseId` text NOT NULL,
	`snapshotId` text NOT NULL,
	`isCurrent` integer NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `streetGeometry_pk` PRIMARY KEY(`streetId`, `versionHash`)
);
--> statement-breakpoint
CREATE TABLE `places` (
	`id` text NOT NULL,
	`releaseId` text NOT NULL,
	`addressSnapshotId` text,
	`address2dId` text,
	`address3dId` text,
	`lng` real NOT NULL,
	`lat` real NOT NULL,
	`bbox` text,
	`operatingStatus` text,
	`basicCategory` text,
	`taxonomyPrimary` text,
	`taxonomyHierarchy` text,
	`taxonomyAlternates` text,
	`brandWikidata` text,
	`websites` text,
	`socials` text,
	`emails` text,
	`phones` text,
	`addresses` text,
	`confidence` real,
	`sourceKeys` text,
	`sources` text,
	`firstSeenMonth` text NOT NULL,
	`lastSeenMonth` text NOT NULL,
	`versionHash` text NOT NULL,
	`sourceReleaseId` text NOT NULL,
	`snapshotId` text NOT NULL,
	`isCurrent` integer NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `places_pk` PRIMARY KEY(`id`, `versionHash`)
);
--> statement-breakpoint
CREATE TABLE `placesI18n` (
	`placeId` text NOT NULL,
	`locale` text NOT NULL,
	`name` text,
	`nameVariant` text,
	`nameAlts` text,
	`isLocaleInferred` integer NOT NULL,
	`brandName` text,
	`brandNameVariant` text,
	`brandNameAlts` text,
	`versionHash` text NOT NULL,
	`sourceReleaseId` text NOT NULL,
	`snapshotId` text NOT NULL,
	`isCurrent` integer NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `placesI18n_pk` PRIMARY KEY(`placeId`, `versionHash`, `locale`)
);
--> statement-breakpoint
CREATE TABLE `divisionAreas` (
	`id` text NOT NULL,
	`variant` text DEFAULT 'overture' NOT NULL,
	`bbox` text,
	`geometry` text,
	`sourceKeys` text,
	`sources` text,
	`type` text NOT NULL,
	`isLand` integer,
	`isTerritorial` integer,
	`divisionId` text NOT NULL,
	`versionHash` text NOT NULL,
	`sourceReleaseId` text NOT NULL,
	`snapshotId` text NOT NULL,
	`isCurrent` integer NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `divisionAreas_pk` PRIMARY KEY(`id`, `versionHash`)
);
--> statement-breakpoint
CREATE TABLE `divisionBoundaries` (
	`id` text NOT NULL,
	`variant` text DEFAULT 'overture' NOT NULL,
	`bbox` text,
	`geometry` text,
	`sourceKeys` text,
	`sources` text,
	`type` text NOT NULL,
	`isLand` integer,
	`isTerritorial` integer,
	`leftDivisionId` text NOT NULL,
	`rightDivisionId` text NOT NULL,
	`versionHash` text NOT NULL,
	`sourceReleaseId` text NOT NULL,
	`snapshotId` text NOT NULL,
	`isCurrent` integer NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `divisionBoundaries_pk` PRIMARY KEY(`id`, `versionHash`)
);
--> statement-breakpoint
CREATE TABLE `snapshotVersionChanges` (
	`snapshotId` text NOT NULL,
	`recordType` text NOT NULL,
	`recordId` text NOT NULL,
	`locale` text DEFAULT '' NOT NULL,
	`versionHash` text,
	`operation` text NOT NULL,
	`sourceReleaseId` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `snapshotVersionChanges_pk` PRIMARY KEY(`snapshotId`, `recordType`, `recordId`, `locale`)
);
--> statement-breakpoint
CREATE TABLE `divisionStatistics` (
	`id` text NOT NULL,
	`divisionId` text NOT NULL,
	`districtCode` text NOT NULL,
	`referenceYear` text NOT NULL,
	`landAreaSqKm` real NOT NULL,
	`midYearPopulation` integer NOT NULL,
	`midYearPopulationDensityPerSqKm` integer NOT NULL,
	`sourceKeys` text NOT NULL,
	`sources` text NOT NULL,
	`versionHash` text NOT NULL,
	`sourceReleaseId` text NOT NULL,
	`isCurrent` integer NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `divisionStatistics_pk` PRIMARY KEY(`id`, `versionHash`)
);
--> statement-breakpoint
CREATE INDEX `divisions_current_lookup_idx` ON `divisions` (`id`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `divisions_sourceReleaseId_idx` ON `divisions` (`sourceReleaseId`);--> statement-breakpoint
CREATE INDEX `divisions_snapshotId_idx` ON `divisions` (`snapshotId`);--> statement-breakpoint
CREATE INDEX `divisionsI18n_locale_idx` ON `divisionsI18n` (`locale`);--> statement-breakpoint
CREATE INDEX `divisionsI18n_name_idx` ON `divisionsI18n` (`locale`,`name`);--> statement-breakpoint
CREATE INDEX `divisionsI18n_current_lookup_idx` ON `divisionsI18n` (`divisionId`,`locale`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `address2d_current_lookup_idx` ON `address2d` (`id`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `address2d_sourceReleaseId_idx` ON `address2d` (`sourceReleaseId`);--> statement-breakpoint
CREATE INDEX `address2d_snapshotId_idx` ON `address2d` (`snapshotId`);--> statement-breakpoint
CREATE INDEX `address2dBuildingNumberLookup_lookup_idx` ON `address2dBuildingNumberLookup` (`snapshotId`,`buildingNumber`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `address2dBuildingNumberLookup_numericStem_idx` ON `address2dBuildingNumberLookup` (`snapshotId`,`numericStem`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `address2dI18n_locale_idx` ON `address2dI18n` (`locale`);--> statement-breakpoint
CREATE INDEX `address2dI18n_current_lookup_idx` ON `address2dI18n` (`addressId`,`locale`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `address3d_current_lookup_idx` ON `address3d` (`id`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `address3d_sourceReleaseId_idx` ON `address3d` (`sourceReleaseId`);--> statement-breakpoint
CREATE INDEX `address3d_snapshotId_idx` ON `address3d` (`snapshotId`);--> statement-breakpoint
CREATE INDEX `address3d_address2dId_idx` ON `address3d` (`address2dId`);--> statement-breakpoint
CREATE INDEX `address3dI18n_locale_idx` ON `address3dI18n` (`locale`);--> statement-breakpoint
CREATE INDEX `address3dI18n_current_lookup_idx` ON `address3dI18n` (`address3dId`,`locale`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `address3dUnitRefLookup_lookup_idx` ON `address3dUnitRefLookup` (`snapshotId`,`unitRef`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `address3dUnitRefLookup_numericStem_idx` ON `address3dUnitRefLookup` (`snapshotId`,`numericStem`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `streets_id_version_idx` ON `streets` (`id`,`version`);--> statement-breakpoint
CREATE INDEX `streets_current_lookup_idx` ON `streets` (`id`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `streets_sourceReleaseId_idx` ON `streets` (`sourceReleaseId`);--> statement-breakpoint
CREATE INDEX `streets_snapshotId_idx` ON `streets` (`snapshotId`);--> statement-breakpoint
CREATE INDEX `streetsI18n_locale_idx` ON `streetsI18n` (`locale`);--> statement-breakpoint
CREATE INDEX `streetsI18n_name_idx` ON `streetsI18n` (`locale`,`name`);--> statement-breakpoint
CREATE INDEX `streetsI18n_current_lookup_idx` ON `streetsI18n` (`streetId`,`locale`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `streetChangelog_street_current_idx` ON `streetChangelog` (`streetId`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `streetChangelog_recordKey_idx` ON `streetChangelog` (`recordKey`);--> statement-breakpoint
CREATE INDEX `streetChangelog_snapshot_idx` ON `streetChangelog` (`snapshotId`);--> statement-breakpoint
CREATE INDEX `streetNameChangeStreets_streetId_idx` ON `streetNameChangeStreets` (`streetId`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `streetNameChangeStreets_snapshotId_idx` ON `streetNameChangeStreets` (`snapshotId`);--> statement-breakpoint
CREATE INDEX `streetNameChanges_current_lookup_idx` ON `streetNameChanges` (`id`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `streetNameChanges_noticeRef_idx` ON `streetNameChanges` (`noticeRef`);--> statement-breakpoint
CREATE INDEX `streetNameChanges_snapshotId_idx` ON `streetNameChanges` (`snapshotId`);--> statement-breakpoint
CREATE INDEX `streetGeometry_current_lookup_idx` ON `streetGeometry` (`streetId`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `streetGeometry_sourceReleaseId_idx` ON `streetGeometry` (`sourceReleaseId`);--> statement-breakpoint
CREATE INDEX `streetGeometry_snapshotId_idx` ON `streetGeometry` (`snapshotId`);--> statement-breakpoint
CREATE INDEX `places_current_lookup_idx` ON `places` (`id`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `places_sourceReleaseId_idx` ON `places` (`sourceReleaseId`);--> statement-breakpoint
CREATE INDEX `places_snapshotId_idx` ON `places` (`snapshotId`);--> statement-breakpoint
CREATE INDEX `placesI18n_locale_idx` ON `placesI18n` (`locale`);--> statement-breakpoint
CREATE INDEX `placesI18n_name_idx` ON `placesI18n` (`locale`,`name`);--> statement-breakpoint
CREATE INDEX `placesI18n_current_lookup_idx` ON `placesI18n` (`placeId`,`locale`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `divisionAreas_current_lookup_idx` ON `divisionAreas` (`id`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `divisionAreas_divisionId_idx` ON `divisionAreas` (`divisionId`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `divisionAreas_sourceReleaseId_idx` ON `divisionAreas` (`sourceReleaseId`);--> statement-breakpoint
CREATE INDEX `divisionAreas_snapshotId_idx` ON `divisionAreas` (`snapshotId`);--> statement-breakpoint
CREATE INDEX `divisionBoundaries_current_lookup_idx` ON `divisionBoundaries` (`id`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `divisionBoundaries_leftDivisionId_idx` ON `divisionBoundaries` (`leftDivisionId`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `divisionBoundaries_rightDivisionId_idx` ON `divisionBoundaries` (`rightDivisionId`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `divisionBoundaries_sourceReleaseId_idx` ON `divisionBoundaries` (`sourceReleaseId`);--> statement-breakpoint
CREATE INDEX `divisionBoundaries_snapshotId_idx` ON `divisionBoundaries` (`snapshotId`);--> statement-breakpoint
CREATE INDEX `snapshotVersionChanges_record_lookup_idx` ON `snapshotVersionChanges` (`recordType`,`recordId`,`locale`,`snapshotId`);--> statement-breakpoint
CREATE INDEX `snapshotVersionChanges_snapshot_idx` ON `snapshotVersionChanges` (`snapshotId`);--> statement-breakpoint
CREATE INDEX `divisionStatistics_current_lookup_idx` ON `divisionStatistics` (`id`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `divisionStatistics_divisionId_referenceYear_idx` ON `divisionStatistics` (`divisionId`,`referenceYear`);--> statement-breakpoint
CREATE INDEX `divisionStatistics_sourceReleaseId_idx` ON `divisionStatistics` (`sourceReleaseId`);