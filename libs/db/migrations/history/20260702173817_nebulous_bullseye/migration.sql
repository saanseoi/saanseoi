CREATE TABLE `divisions` (
	`id` text NOT NULL,
	`level` integer NOT NULL,
	`type` text NOT NULL,
	`population` integer,
	`sourceKeys` text,
	`wikidata` text,
	`hierarchy` text,
	`parentDivisionId` text,
	`cartography` text,
	`sources` text,
	`geometry` text,
	`bbox` text,
	`versionHash` text NOT NULL,
	`sourceReleaseId` text NOT NULL,
	`snapshotId` text NOT NULL,
	`isCurrent` integer NOT NULL,
	`validFromSnapshotId` text NOT NULL,
	`validToSnapshotId` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`validFromCohortKey` text NOT NULL,
	`validToCohortKey` text,
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
	`validFromSnapshotId` text NOT NULL,
	`validToSnapshotId` text,
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
	`validFromSnapshotId` text NOT NULL,
	`validToSnapshotId` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`validFromCohortKey` text NOT NULL,
	`validToCohortKey` text,
	CONSTRAINT `address2d_pk` PRIMARY KEY(`id`, `versionHash`)
);
--> statement-breakpoint
CREATE TABLE `address2dI18n` (
	`addressId` text NOT NULL,
	`locale` text NOT NULL,
	`formattedAddress` text NOT NULL,
	`buildingName` text,
	`buildingNumberFrom` text,
	`buildingNumberTo` text,
	`blockType` text,
	`blockNumber` text,
	`blockTypeBeforeNumber` integer,
	`phaseName` text,
	`phaseNumber` text,
	`estateName` text,
	`streetNumber` text,
	`streetName` text,
	`versionHash` text NOT NULL,
	`sourceReleaseId` text NOT NULL,
	`snapshotId` text NOT NULL,
	`isCurrent` integer NOT NULL,
	`validFromSnapshotId` text NOT NULL,
	`validToSnapshotId` text,
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
	`validFromSnapshotId` text NOT NULL,
	`validToSnapshotId` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`validFromCohortKey` text NOT NULL,
	`validToCohortKey` text,
	CONSTRAINT `address3d_pk` PRIMARY KEY(`id`, `versionHash`)
);
--> statement-breakpoint
CREATE TABLE `address3dI18n` (
	`address3dId` text NOT NULL,
	`locale` text NOT NULL,
	`formattedAddressPart` text NOT NULL,
	`accessHint` text,
	`unitPortion` text,
	`unitNumber` text,
	`unitType` text,
	`floorNumber` text,
	`floorType` text,
	`versionHash` text NOT NULL,
	`sourceReleaseId` text NOT NULL,
	`snapshotId` text NOT NULL,
	`isCurrent` integer NOT NULL,
	`validFromSnapshotId` text NOT NULL,
	`validToSnapshotId` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `address3dI18n_pk` PRIMARY KEY(`address3dId`, `versionHash`, `locale`)
);
--> statement-breakpoint
CREATE TABLE `streets` (
	`id` text NOT NULL,
	`yearBuilt` text,
	`references` text,
	`sourceKeys` text,
	`versionHash` text NOT NULL,
	`sourceReleaseId` text NOT NULL,
	`snapshotId` text NOT NULL,
	`isCurrent` integer NOT NULL,
	`validFromSnapshotId` text NOT NULL,
	`validToSnapshotId` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`validFromCohortKey` text NOT NULL,
	`validToCohortKey` text,
	CONSTRAINT `streets_pk` PRIMARY KEY(`id`, `versionHash`)
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
	`versionHash` text NOT NULL,
	`sourceReleaseId` text NOT NULL,
	`snapshotId` text NOT NULL,
	`isCurrent` integer NOT NULL,
	`validFromSnapshotId` text NOT NULL,
	`validToSnapshotId` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `streetsI18n_pk` PRIMARY KEY(`streetId`, `versionHash`, `locale`)
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
	`validFromSnapshotId` text NOT NULL,
	`validToSnapshotId` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`validFromCohortKey` text NOT NULL,
	`validToCohortKey` text,
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
	`validFromSnapshotId` text NOT NULL,
	`validToSnapshotId` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `placesI18n_pk` PRIMARY KEY(`placeId`, `versionHash`, `locale`)
);
--> statement-breakpoint
CREATE INDEX `divisions_current_lookup_idx` ON `divisions` (`id`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `divisions_snapshot_validity_idx` ON `divisions` (`validFromSnapshotId`,`validToSnapshotId`);--> statement-breakpoint
CREATE INDEX `divisions_validity_idx` ON `divisions` (`validFromCohortKey`,`validToCohortKey`);--> statement-breakpoint
CREATE INDEX `divisions_sourceReleaseId_idx` ON `divisions` (`sourceReleaseId`);--> statement-breakpoint
CREATE INDEX `divisions_snapshotId_idx` ON `divisions` (`snapshotId`);--> statement-breakpoint
CREATE INDEX `divisionsI18n_locale_idx` ON `divisionsI18n` (`locale`);--> statement-breakpoint
CREATE INDEX `divisionsI18n_name_idx` ON `divisionsI18n` (`locale`,`name`);--> statement-breakpoint
CREATE INDEX `divisionsI18n_current_lookup_idx` ON `divisionsI18n` (`divisionId`,`locale`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `address2d_current_lookup_idx` ON `address2d` (`id`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `address2d_snapshot_validity_idx` ON `address2d` (`validFromSnapshotId`,`validToSnapshotId`);--> statement-breakpoint
CREATE INDEX `address2d_validity_idx` ON `address2d` (`validFromCohortKey`,`validToCohortKey`);--> statement-breakpoint
CREATE INDEX `address2d_sourceReleaseId_idx` ON `address2d` (`sourceReleaseId`);--> statement-breakpoint
CREATE INDEX `address2d_snapshotId_idx` ON `address2d` (`snapshotId`);--> statement-breakpoint
CREATE INDEX `address2dI18n_locale_idx` ON `address2dI18n` (`locale`);--> statement-breakpoint
CREATE INDEX `address2dI18n_current_lookup_idx` ON `address2dI18n` (`addressId`,`locale`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `address3d_current_lookup_idx` ON `address3d` (`id`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `address3d_snapshot_validity_idx` ON `address3d` (`validFromSnapshotId`,`validToSnapshotId`);--> statement-breakpoint
CREATE INDEX `address3d_validity_idx` ON `address3d` (`validFromCohortKey`,`validToCohortKey`);--> statement-breakpoint
CREATE INDEX `address3d_sourceReleaseId_idx` ON `address3d` (`sourceReleaseId`);--> statement-breakpoint
CREATE INDEX `address3d_snapshotId_idx` ON `address3d` (`snapshotId`);--> statement-breakpoint
CREATE INDEX `address3d_address2dId_idx` ON `address3d` (`address2dId`);--> statement-breakpoint
CREATE INDEX `address3dI18n_locale_idx` ON `address3dI18n` (`locale`);--> statement-breakpoint
CREATE INDEX `address3dI18n_current_lookup_idx` ON `address3dI18n` (`address3dId`,`locale`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `streets_current_lookup_idx` ON `streets` (`id`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `streets_snapshot_validity_idx` ON `streets` (`validFromSnapshotId`,`validToSnapshotId`);--> statement-breakpoint
CREATE INDEX `streets_validity_idx` ON `streets` (`validFromCohortKey`,`validToCohortKey`);--> statement-breakpoint
CREATE INDEX `streets_sourceReleaseId_idx` ON `streets` (`sourceReleaseId`);--> statement-breakpoint
CREATE INDEX `streets_snapshotId_idx` ON `streets` (`snapshotId`);--> statement-breakpoint
CREATE INDEX `streetsI18n_locale_idx` ON `streetsI18n` (`locale`);--> statement-breakpoint
CREATE INDEX `streetsI18n_name_idx` ON `streetsI18n` (`locale`,`name`);--> statement-breakpoint
CREATE INDEX `streetsI18n_current_lookup_idx` ON `streetsI18n` (`streetId`,`locale`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `places_current_lookup_idx` ON `places` (`id`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `places_snapshot_validity_idx` ON `places` (`validFromSnapshotId`,`validToSnapshotId`);--> statement-breakpoint
CREATE INDEX `places_validity_idx` ON `places` (`validFromCohortKey`,`validToCohortKey`);--> statement-breakpoint
CREATE INDEX `places_sourceReleaseId_idx` ON `places` (`sourceReleaseId`);--> statement-breakpoint
CREATE INDEX `places_snapshotId_idx` ON `places` (`snapshotId`);--> statement-breakpoint
CREATE INDEX `placesI18n_locale_idx` ON `placesI18n` (`locale`);--> statement-breakpoint
CREATE INDEX `placesI18n_name_idx` ON `placesI18n` (`locale`,`name`);--> statement-breakpoint
CREATE INDEX `placesI18n_current_lookup_idx` ON `placesI18n` (`placeId`,`locale`,`isCurrent`);