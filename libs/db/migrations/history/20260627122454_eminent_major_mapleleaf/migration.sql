CREATE TABLE `divisionsVersions` (
	`id` text NOT NULL,
	`regionCode` text NOT NULL,
	`versionHash` text NOT NULL,
	`sourceReleaseId` text NOT NULL,
	`snapshotId` text NOT NULL,
	`validFromSnapshotId` text NOT NULL,
	`validToSnapshotId` text,
	`validFromMonth` text NOT NULL,
	`validToMonth` text,
	`isCurrent` integer NOT NULL,
	`level` integer NOT NULL,
	`type` text NOT NULL,
	`geometry` text,
	`bbox` text,
	`population` integer,
	`subtype` text,
	`class` text,
	`wikidata` text,
	`hierarchy` text,
	`parentDivisionId` text,
	`cartography` text,
	`sources` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `divisionsVersions_pk` PRIMARY KEY(`id`, `versionHash`)
);
--> statement-breakpoint
CREATE TABLE `divisionsVersionsI18n` (
	`divisionId` text NOT NULL,
	`versionHash` text NOT NULL,
	`sourceReleaseId` text NOT NULL,
	`snapshotId` text NOT NULL,
	`validFromSnapshotId` text NOT NULL,
	`validToSnapshotId` text,
	`isCurrent` integer NOT NULL,
	`locale` text NOT NULL,
	`name` text,
	`nameVariant` text,
	`nameAlts` text,
	`nameRules` text,
	`localType` text,
	`isLocaleInferred` integer NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `divisionsVersionsI18n_pk` PRIMARY KEY(`divisionId`, `versionHash`, `locale`)
);
--> statement-breakpoint
CREATE TABLE `address2dVersions` (
	`id` text NOT NULL,
	`regionCode` text NOT NULL,
	`versionHash` text NOT NULL,
	`sourceReleaseId` text NOT NULL,
	`snapshotId` text NOT NULL,
	`validFromSnapshotId` text NOT NULL,
	`validToSnapshotId` text,
	`validFromMonth` text NOT NULL,
	`validToMonth` text,
	`isCurrent` integer NOT NULL,
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
	`geometry` text,
	`bbox` text,
	`identifiers` text,
	`sources` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `address2dVersions_pk` PRIMARY KEY(`id`, `versionHash`)
);
--> statement-breakpoint
CREATE TABLE `address2dVersionsI18n` (
	`addressId` text NOT NULL,
	`versionHash` text NOT NULL,
	`sourceReleaseId` text NOT NULL,
	`snapshotId` text NOT NULL,
	`validFromSnapshotId` text NOT NULL,
	`validToSnapshotId` text,
	`isCurrent` integer NOT NULL,
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
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `address2dVersionsI18n_pk` PRIMARY KEY(`addressId`, `versionHash`, `locale`)
);
--> statement-breakpoint
CREATE TABLE `address3dVersions` (
	`id` text NOT NULL,
	`versionHash` text NOT NULL,
	`sourceReleaseId` text NOT NULL,
	`snapshotId` text NOT NULL,
	`validFromSnapshotId` text NOT NULL,
	`validToSnapshotId` text,
	`validFromMonth` text NOT NULL,
	`validToMonth` text,
	`isCurrent` integer NOT NULL,
	`address2dId` text NOT NULL,
	`sources` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `address3dVersions_pk` PRIMARY KEY(`id`, `versionHash`)
);
--> statement-breakpoint
CREATE TABLE `address3dVersionsI18n` (
	`address3dId` text NOT NULL,
	`versionHash` text NOT NULL,
	`sourceReleaseId` text NOT NULL,
	`snapshotId` text NOT NULL,
	`validFromSnapshotId` text NOT NULL,
	`validToSnapshotId` text,
	`isCurrent` integer NOT NULL,
	`locale` text NOT NULL,
	`formattedAddressPart` text NOT NULL,
	`accessHint` text,
	`unitPortion` text,
	`unitNumber` text,
	`unitType` text,
	`floorNumber` text,
	`floorType` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `address3dVersionsI18n_pk` PRIMARY KEY(`address3dId`, `versionHash`, `locale`)
);
--> statement-breakpoint
CREATE TABLE `streetsVersions` (
	`id` text NOT NULL,
	`versionHash` text NOT NULL,
	`sourceReleaseId` text NOT NULL,
	`snapshotId` text NOT NULL,
	`validFromSnapshotId` text NOT NULL,
	`validToSnapshotId` text,
	`validFromMonth` text NOT NULL,
	`validToMonth` text,
	`isCurrent` integer NOT NULL,
	`yearBuilt` text,
	`references` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `streetsVersions_pk` PRIMARY KEY(`id`, `versionHash`)
);
--> statement-breakpoint
CREATE TABLE `streetsVersionsI18n` (
	`streetId` text NOT NULL,
	`versionHash` text NOT NULL,
	`sourceReleaseId` text NOT NULL,
	`snapshotId` text NOT NULL,
	`validFromSnapshotId` text NOT NULL,
	`validToSnapshotId` text,
	`isCurrent` integer NOT NULL,
	`locale` text NOT NULL,
	`name` text NOT NULL,
	`base` text,
	`designator` text,
	`directionalPrefix` text,
	`directionalSuffix` text,
	`normalised` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `streetsVersionsI18n_pk` PRIMARY KEY(`streetId`, `versionHash`, `locale`)
);
--> statement-breakpoint
CREATE TABLE `placesVersions` (
	`id` text NOT NULL,
	`regionCode` text NOT NULL,
	`versionHash` text NOT NULL,
	`sourceReleaseId` text NOT NULL,
	`snapshotId` text NOT NULL,
	`validFromSnapshotId` text NOT NULL,
	`validToSnapshotId` text,
	`validFromMonth` text NOT NULL,
	`validToMonth` text,
	`isCurrent` integer NOT NULL,
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
	`sources` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `placesVersions_pk` PRIMARY KEY(`id`, `versionHash`)
);
--> statement-breakpoint
CREATE TABLE `placesVersionsI18n` (
	`placeId` text NOT NULL,
	`versionHash` text NOT NULL,
	`sourceReleaseId` text NOT NULL,
	`snapshotId` text NOT NULL,
	`validFromSnapshotId` text NOT NULL,
	`validToSnapshotId` text,
	`isCurrent` integer NOT NULL,
	`locale` text NOT NULL,
	`name` text,
	`nameVariant` text,
	`nameAlts` text,
	`isLocaleInferred` integer NOT NULL,
	`brandName` text,
	`brandNameVariant` text,
	`brandNameAlts` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `placesVersionsI18n_pk` PRIMARY KEY(`placeId`, `versionHash`, `locale`)
);
--> statement-breakpoint
CREATE INDEX `divisionsVersions_current_lookup_idx` ON `divisionsVersions` (`regionCode`,`id`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `divisionsVersions_snapshot_validity_idx` ON `divisionsVersions` (`regionCode`,`validFromSnapshotId`,`validToSnapshotId`);--> statement-breakpoint
CREATE INDEX `divisionsVersions_validity_idx` ON `divisionsVersions` (`regionCode`,`validFromMonth`,`validToMonth`);--> statement-breakpoint
CREATE INDEX `divisionsVersions_sourceReleaseId_idx` ON `divisionsVersions` (`sourceReleaseId`);--> statement-breakpoint
CREATE INDEX `divisionsVersions_snapshotId_idx` ON `divisionsVersions` (`snapshotId`);--> statement-breakpoint
CREATE INDEX `divisionsVersionsI18n_locale_idx` ON `divisionsVersionsI18n` (`locale`);--> statement-breakpoint
CREATE INDEX `divisionsVersionsI18n_name_idx` ON `divisionsVersionsI18n` (`locale`,`name`);--> statement-breakpoint
CREATE INDEX `divisionsVersionsI18n_current_lookup_idx` ON `divisionsVersionsI18n` (`divisionId`,`locale`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `address2dVersions_current_lookup_idx` ON `address2dVersions` (`regionCode`,`id`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `address2dVersions_snapshot_validity_idx` ON `address2dVersions` (`regionCode`,`validFromSnapshotId`,`validToSnapshotId`);--> statement-breakpoint
CREATE INDEX `address2dVersions_validity_idx` ON `address2dVersions` (`regionCode`,`validFromMonth`,`validToMonth`);--> statement-breakpoint
CREATE INDEX `address2dVersions_sourceReleaseId_idx` ON `address2dVersions` (`sourceReleaseId`);--> statement-breakpoint
CREATE INDEX `address2dVersions_snapshotId_idx` ON `address2dVersions` (`snapshotId`);--> statement-breakpoint
CREATE INDEX `address2dVersionsI18n_locale_idx` ON `address2dVersionsI18n` (`locale`);--> statement-breakpoint
CREATE INDEX `address2dVersionsI18n_current_lookup_idx` ON `address2dVersionsI18n` (`addressId`,`locale`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `address3dVersions_current_lookup_idx` ON `address3dVersions` (`id`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `address3dVersions_snapshot_validity_idx` ON `address3dVersions` (`validFromSnapshotId`,`validToSnapshotId`);--> statement-breakpoint
CREATE INDEX `address3dVersions_validity_idx` ON `address3dVersions` (`validFromMonth`,`validToMonth`);--> statement-breakpoint
CREATE INDEX `address3dVersions_sourceReleaseId_idx` ON `address3dVersions` (`sourceReleaseId`);--> statement-breakpoint
CREATE INDEX `address3dVersions_snapshotId_idx` ON `address3dVersions` (`snapshotId`);--> statement-breakpoint
CREATE INDEX `address3dVersions_address2dId_idx` ON `address3dVersions` (`address2dId`);--> statement-breakpoint
CREATE INDEX `address3dVersionsI18n_locale_idx` ON `address3dVersionsI18n` (`locale`);--> statement-breakpoint
CREATE INDEX `address3dVersionsI18n_current_lookup_idx` ON `address3dVersionsI18n` (`address3dId`,`locale`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `streetsVersions_current_lookup_idx` ON `streetsVersions` (`id`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `streetsVersions_snapshot_validity_idx` ON `streetsVersions` (`validFromSnapshotId`,`validToSnapshotId`);--> statement-breakpoint
CREATE INDEX `streetsVersions_validity_idx` ON `streetsVersions` (`validFromMonth`,`validToMonth`);--> statement-breakpoint
CREATE INDEX `streetsVersions_sourceReleaseId_idx` ON `streetsVersions` (`sourceReleaseId`);--> statement-breakpoint
CREATE INDEX `streetsVersions_snapshotId_idx` ON `streetsVersions` (`snapshotId`);--> statement-breakpoint
CREATE INDEX `streetsVersionsI18n_locale_idx` ON `streetsVersionsI18n` (`locale`);--> statement-breakpoint
CREATE INDEX `streetsVersionsI18n_name_idx` ON `streetsVersionsI18n` (`locale`,`name`);--> statement-breakpoint
CREATE INDEX `streetsVersionsI18n_current_lookup_idx` ON `streetsVersionsI18n` (`streetId`,`locale`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `placesVersions_current_lookup_idx` ON `placesVersions` (`regionCode`,`id`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `placesVersions_snapshot_validity_idx` ON `placesVersions` (`regionCode`,`validFromSnapshotId`,`validToSnapshotId`);--> statement-breakpoint
CREATE INDEX `placesVersions_validity_idx` ON `placesVersions` (`regionCode`,`validFromMonth`,`validToMonth`);--> statement-breakpoint
CREATE INDEX `placesVersions_sourceReleaseId_idx` ON `placesVersions` (`sourceReleaseId`);--> statement-breakpoint
CREATE INDEX `placesVersions_snapshotId_idx` ON `placesVersions` (`snapshotId`);--> statement-breakpoint
CREATE INDEX `placesVersionsI18n_locale_idx` ON `placesVersionsI18n` (`locale`);--> statement-breakpoint
CREATE INDEX `placesVersionsI18n_name_idx` ON `placesVersionsI18n` (`locale`,`name`);--> statement-breakpoint
CREATE INDEX `placesVersionsI18n_current_lookup_idx` ON `placesVersionsI18n` (`placeId`,`locale`,`isCurrent`);