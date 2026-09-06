ALTER TABLE `address3d` ADD `units` text NOT NULL;--> statement-breakpoint
ALTER TABLE `address3d` ADD `unitCount` integer NOT NULL;--> statement-breakpoint
ALTER TABLE `address3d` ADD `contentHash` text NOT NULL;--> statement-breakpoint
ALTER TABLE `address3d` ADD `unresolvedSectionIds` text NOT NULL;--> statement-breakpoint
ALTER TABLE `address3dI18n` ADD `units` text NOT NULL;--> statement-breakpoint
ALTER TABLE `places` ADD `address3dUnitId` text;--> statement-breakpoint
ALTER TABLE `places` ADD `address3dMembership` text;--> statement-breakpoint
ALTER TABLE `placesI18n` ADD `accessHint` text;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_places` (
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
	CONSTRAINT `places_addressSnapshotId_address2dId_address2d_fk` FOREIGN KEY (`addressSnapshotId`,`address2dId`) REFERENCES `address2d`(`snapshotId`,`id`),
	CONSTRAINT `places_addressSnapshotId_address3dId_address3d_fk` FOREIGN KEY (`addressSnapshotId`,`address3dId`) REFERENCES `address3d`(`snapshotId`,`id`),
	CONSTRAINT "places_address_snapshot_required_chk" CHECK("addressSnapshotId" IS NOT NULL OR ("address2dId" IS NULL AND "address3dId" IS NULL)),
	CONSTRAINT "places_address3d_unit_reference_chk" CHECK(("address3dId" IS NULL AND "address3dUnitId" IS NULL AND "address3dMembership" IS NULL) OR ("address3dId" IS NOT NULL AND "address3dUnitId" IS NOT NULL AND "address3dMembership" IS NOT NULL AND "address2dId" IS NOT NULL))
);
--> statement-breakpoint
INSERT INTO `__new_places`(`snapshotId`, `id`, `releaseId`, `addressSnapshotId`, `address2dId`, `address3dId`, `lng`, `lat`, `bbox`, `operatingStatus`, `basicCategory`, `taxonomyPrimary`, `taxonomyHierarchy`, `taxonomyAlternates`, `wikidataId`, `websites`, `socials`, `emails`, `phones`, `addresses`, `confidence`, `sources`, `firstSeenMonth`, `lastSeenMonth`, `createdAt`, `updatedAt`) SELECT `snapshotId`, `id`, `releaseId`, `addressSnapshotId`, `address2dId`, `address3dId`, `lng`, `lat`, `bbox`, `operatingStatus`, `basicCategory`, `taxonomyPrimary`, `taxonomyHierarchy`, `taxonomyAlternates`, `wikidataId`, `websites`, `socials`, `emails`, `phones`, `addresses`, `confidence`, `sources`, `firstSeenMonth`, `lastSeenMonth`, `createdAt`, `updatedAt` FROM `places`;--> statement-breakpoint
DROP TABLE `places`;--> statement-breakpoint
ALTER TABLE `__new_places` RENAME TO `places`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
DROP INDEX IF EXISTS `address3dUnitRefLookup_lookup_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `address3dUnitRefLookup_numericStem_idx`;--> statement-breakpoint
CREATE INDEX `places_releaseId_idx` ON `places` (`releaseId`);--> statement-breakpoint
CREATE INDEX `places_category_idx` ON `places` (`snapshotId`,`basicCategory`);--> statement-breakpoint
CREATE INDEX `places_taxonomy_idx` ON `places` (`snapshotId`,`taxonomyPrimary`);--> statement-breakpoint
CREATE INDEX `places_status_idx` ON `places` (`snapshotId`,`operatingStatus`);--> statement-breakpoint
DROP TABLE `address3dUnitRefLookup`;--> statement-breakpoint
ALTER TABLE `address3dI18n` DROP COLUMN `formattedAddressPart`;--> statement-breakpoint
ALTER TABLE `address3dI18n` DROP COLUMN `accessHint`;--> statement-breakpoint
ALTER TABLE `address3dI18n` DROP COLUMN `unitPortion`;--> statement-breakpoint
ALTER TABLE `address3dI18n` DROP COLUMN `unitExpression`;--> statement-breakpoint
ALTER TABLE `address3dI18n` DROP COLUMN `unitRef`;--> statement-breakpoint
ALTER TABLE `address3dI18n` DROP COLUMN `unitType`;--> statement-breakpoint
ALTER TABLE `address3dI18n` DROP COLUMN `floorExpression`;--> statement-breakpoint
ALTER TABLE `address3dI18n` DROP COLUMN `floorRef`;--> statement-breakpoint
ALTER TABLE `address3dI18n` DROP COLUMN `floorType`;