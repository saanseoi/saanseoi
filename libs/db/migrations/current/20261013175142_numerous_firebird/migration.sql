ALTER TABLE `address2d` RENAME COLUMN `snapshotId` TO `scopeId`;--> statement-breakpoint
ALTER TABLE `address2dBuildingNumberLookup` RENAME COLUMN `snapshotId` TO `scopeId`;--> statement-breakpoint
ALTER TABLE `address2dI18n` RENAME COLUMN `snapshotId` TO `scopeId`;--> statement-breakpoint
ALTER TABLE `address3d` RENAME COLUMN `snapshotId` TO `scopeId`;--> statement-breakpoint
ALTER TABLE `address3dI18n` RENAME COLUMN `snapshotId` TO `scopeId`;--> statement-breakpoint
ALTER TABLE `places` RENAME COLUMN `snapshotId` TO `scopeId`;--> statement-breakpoint
ALTER TABLE `placesCells` RENAME COLUMN `snapshotId` TO `scopeId`;--> statement-breakpoint
ALTER TABLE `placesDivision` RENAME COLUMN `placeSnapshotId` TO `placeScopeId`;--> statement-breakpoint
ALTER TABLE `placesI18n` RENAME COLUMN `snapshotId` TO `scopeId`;--> statement-breakpoint
ALTER TABLE `divisions` RENAME COLUMN `snapshotId` TO `scopeId`;--> statement-breakpoint
ALTER TABLE `divisionsI18n` RENAME COLUMN `snapshotId` TO `scopeId`;--> statement-breakpoint
ALTER TABLE `streets` RENAME COLUMN `snapshotId` TO `scopeId`;--> statement-breakpoint
ALTER TABLE `streetsAddress` RENAME COLUMN `streetSnapshotId` TO `streetScopeId`;--> statement-breakpoint
ALTER TABLE `streetsI18n` RENAME COLUMN `snapshotId` TO `scopeId`;--> statement-breakpoint
ALTER TABLE `streetChangelog` RENAME COLUMN `snapshotId` TO `scopeId`;--> statement-breakpoint
ALTER TABLE `streetNameChangeStreets` RENAME COLUMN `snapshotId` TO `scopeId`;--> statement-breakpoint
ALTER TABLE `streetNameChanges` RENAME COLUMN `snapshotId` TO `scopeId`;--> statement-breakpoint
ALTER TABLE `streetGeometry` RENAME COLUMN `snapshotId` TO `scopeId`;--> statement-breakpoint
ALTER TABLE `divisionAreas` RENAME COLUMN `snapshotId` TO `scopeId`;--> statement-breakpoint
ALTER TABLE `divisionBoundaries` RENAME COLUMN `snapshotId` TO `scopeId`;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_address2dBuildingNumberLookup` (
	`scopeId` text NOT NULL,
	`addressId` text NOT NULL,
	`buildingNumber` text NOT NULL,
	`numericStem` text,
	`evidence` text NOT NULL,
	`derivation` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `address2dBuildingNumberLookup_pk` PRIMARY KEY(`scopeId`, `addressId`, `buildingNumber`),
	CONSTRAINT `address2dBuildingNumberLookup_scopeId_addressId_address2d_fk` FOREIGN KEY (`scopeId`,`addressId`) REFERENCES `address2d`(`scopeId`,`id`) ON DELETE CASCADE
);
--> statement-breakpoint
INSERT INTO `__new_address2dBuildingNumberLookup`(`scopeId`, `addressId`, `buildingNumber`, `numericStem`, `evidence`, `derivation`, `createdAt`, `updatedAt`) SELECT `scopeId`, `addressId`, `buildingNumber`, `numericStem`, `evidence`, `derivation`, `createdAt`, `updatedAt` FROM `address2dBuildingNumberLookup`;--> statement-breakpoint
DROP TABLE `address2dBuildingNumberLookup`;--> statement-breakpoint
ALTER TABLE `__new_address2dBuildingNumberLookup` RENAME TO `address2dBuildingNumberLookup`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_address2dI18n` (
	`scopeId` text NOT NULL,
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
	CONSTRAINT `address2dI18n_pk` PRIMARY KEY(`scopeId`, `addressId`, `locale`),
	CONSTRAINT `address2dI18n_scopeId_addressId_address2d_fk` FOREIGN KEY (`scopeId`,`addressId`) REFERENCES `address2d`(`scopeId`,`id`) ON DELETE CASCADE
);
--> statement-breakpoint
INSERT INTO `__new_address2dI18n`(`scopeId`, `addressId`, `locale`, `formattedAddress`, `buildingName`, `buildingNumberExpression`, `buildingNumberFrom`, `buildingNumberTo`, `buildingNumberConnector`, `blockExpression`, `blockType`, `blockRef`, `blockTypeBeforeNumber`, `phaseExpression`, `phaseName`, `phaseRef`, `estateName`, `streetName`, `createdAt`, `updatedAt`) SELECT `scopeId`, `addressId`, `locale`, `formattedAddress`, `buildingName`, `buildingNumberExpression`, `buildingNumberFrom`, `buildingNumberTo`, `buildingNumberConnector`, `blockExpression`, `blockType`, `blockRef`, `blockTypeBeforeNumber`, `phaseExpression`, `phaseName`, `phaseRef`, `estateName`, `streetName`, `createdAt`, `updatedAt` FROM `address2dI18n`;--> statement-breakpoint
DROP TABLE `address2dI18n`;--> statement-breakpoint
ALTER TABLE `__new_address2dI18n` RENAME TO `address2dI18n`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_address3d` (
	`scopeId` text NOT NULL,
	`id` text NOT NULL,
	`address2dId` text NOT NULL,
	`units` text NOT NULL,
	`unitCount` integer NOT NULL,
	`contentHash` text NOT NULL,
	`unresolvedSectionIds` text NOT NULL,
	`sources` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `address3d_pk` PRIMARY KEY(`scopeId`, `id`),
	CONSTRAINT `address3d_scopeId_address2dId_address2d_fk` FOREIGN KEY (`scopeId`,`address2dId`) REFERENCES `address2d`(`scopeId`,`id`) ON DELETE CASCADE
);
--> statement-breakpoint
INSERT INTO `__new_address3d`(`scopeId`, `id`, `address2dId`, `units`, `unitCount`, `contentHash`, `unresolvedSectionIds`, `sources`, `createdAt`, `updatedAt`) SELECT `scopeId`, `id`, `address2dId`, `units`, `unitCount`, `contentHash`, `unresolvedSectionIds`, `sources`, `createdAt`, `updatedAt` FROM `address3d`;--> statement-breakpoint
DROP TABLE `address3d`;--> statement-breakpoint
ALTER TABLE `__new_address3d` RENAME TO `address3d`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_address3dI18n` (
	`scopeId` text NOT NULL,
	`address3dId` text NOT NULL,
	`locale` text NOT NULL,
	`units` text NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `address3dI18n_pk` PRIMARY KEY(`scopeId`, `address3dId`, `locale`),
	CONSTRAINT `address3dI18n_scopeId_address3dId_address3d_fk` FOREIGN KEY (`scopeId`,`address3dId`) REFERENCES `address3d`(`scopeId`,`id`) ON DELETE CASCADE
);
--> statement-breakpoint
INSERT INTO `__new_address3dI18n`(`scopeId`, `address3dId`, `locale`, `units`, `createdAt`, `updatedAt`) SELECT `scopeId`, `address3dId`, `locale`, `units`, `createdAt`, `updatedAt` FROM `address3dI18n`;--> statement-breakpoint
DROP TABLE `address3dI18n`;--> statement-breakpoint
ALTER TABLE `__new_address3dI18n` RENAME TO `address3dI18n`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_placesCells` (
	`scopeId` text NOT NULL,
	`id` text NOT NULL,
	`h3Level` integer NOT NULL,
	`h3Cell` text NOT NULL,
	CONSTRAINT `placesCells_pk` PRIMARY KEY(`scopeId`, `id`, `h3Level`, `h3Cell`),
	CONSTRAINT `placesCells_scopeId_id_places_fk` FOREIGN KEY (`scopeId`,`id`) REFERENCES `places`(`scopeId`,`id`) ON DELETE CASCADE
);
--> statement-breakpoint
INSERT INTO `__new_placesCells`(`scopeId`, `id`, `h3Level`, `h3Cell`) SELECT `scopeId`, `id`, `h3Level`, `h3Cell` FROM `placesCells`;--> statement-breakpoint
DROP TABLE `placesCells`;--> statement-breakpoint
ALTER TABLE `__new_placesCells` RENAME TO `placesCells`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_placesDivision` (
	`placeScopeId` text NOT NULL,
	`placeId` text NOT NULL,
	`divisionSnapshotId` text NOT NULL,
	`divisionId` text NOT NULL,
	`definition` text NOT NULL,
	CONSTRAINT `placesDivision_pk` PRIMARY KEY(`placeScopeId`, `placeId`, `divisionId`),
	CONSTRAINT `placesDivision_placeScopeId_placeId_places_fk` FOREIGN KEY (`placeScopeId`,`placeId`) REFERENCES `places`(`scopeId`,`id`) ON DELETE CASCADE
);
--> statement-breakpoint
INSERT INTO `__new_placesDivision`(`placeScopeId`, `placeId`, `divisionSnapshotId`, `divisionId`, `definition`) SELECT `placeScopeId`, `placeId`, `divisionSnapshotId`, `divisionId`, `definition` FROM `placesDivision`;--> statement-breakpoint
DROP TABLE `placesDivision`;--> statement-breakpoint
ALTER TABLE `__new_placesDivision` RENAME TO `placesDivision`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_placesI18n` (
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
	`provenance` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `placesI18n_pk` PRIMARY KEY(`scopeId`, `placeId`, `locale`),
	CONSTRAINT `placesI18n_scopeId_placeId_places_fk` FOREIGN KEY (`scopeId`,`placeId`) REFERENCES `places`(`scopeId`,`id`) ON DELETE CASCADE
);
--> statement-breakpoint
INSERT INTO `__new_placesI18n`(`scopeId`, `searchDependencyText`, `placeId`, `locale`, `name`, `nameVariant`, `nameAlts`, `brandName`, `brandNameVariant`, `brandNameAlts`, `freeformAddress`, `accessHint`, `provenance`, `createdAt`, `updatedAt`) SELECT `scopeId`, `searchDependencyText`, `placeId`, `locale`, `name`, `nameVariant`, `nameAlts`, `brandName`, `brandNameVariant`, `brandNameAlts`, `freeformAddress`, `accessHint`, `provenance`, `createdAt`, `updatedAt` FROM `placesI18n`;--> statement-breakpoint
DROP TABLE `placesI18n`;--> statement-breakpoint
ALTER TABLE `__new_placesI18n` RENAME TO `placesI18n`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_divisionsI18n` (
	`scopeId` text NOT NULL,
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
	CONSTRAINT `divisionsI18n_pk` PRIMARY KEY(`scopeId`, `divisionId`, `locale`),
	CONSTRAINT `divisionsI18n_scopeId_divisionId_divisions_fk` FOREIGN KEY (`scopeId`,`divisionId`) REFERENCES `divisions`(`scopeId`,`id`) ON DELETE CASCADE
);
--> statement-breakpoint
INSERT INTO `__new_divisionsI18n`(`scopeId`, `divisionId`, `locale`, `name`, `nameVariant`, `nameAlts`, `nameRules`, `nameProvenance`, `isLocaleInferred`, `createdAt`, `updatedAt`) SELECT `scopeId`, `divisionId`, `locale`, `name`, `nameVariant`, `nameAlts`, `nameRules`, `nameProvenance`, `isLocaleInferred`, `createdAt`, `updatedAt` FROM `divisionsI18n`;--> statement-breakpoint
DROP TABLE `divisionsI18n`;--> statement-breakpoint
ALTER TABLE `__new_divisionsI18n` RENAME TO `divisionsI18n`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_streetsAddress` (
	`streetScopeId` text NOT NULL,
	`streetId` text NOT NULL,
	`addressSnapshotId` text NOT NULL,
	`addressId` text NOT NULL,
	CONSTRAINT `streetsAddress_pk` PRIMARY KEY(`streetScopeId`, `streetId`, `addressSnapshotId`, `addressId`),
	CONSTRAINT `streetsAddress_streetScopeId_streetId_streets_fk` FOREIGN KEY (`streetScopeId`,`streetId`) REFERENCES `streets`(`scopeId`,`id`) ON DELETE CASCADE
);
--> statement-breakpoint
INSERT INTO `__new_streetsAddress`(`streetScopeId`, `streetId`, `addressSnapshotId`, `addressId`) SELECT `streetScopeId`, `streetId`, `addressSnapshotId`, `addressId` FROM `streetsAddress`;--> statement-breakpoint
DROP TABLE `streetsAddress`;--> statement-breakpoint
ALTER TABLE `__new_streetsAddress` RENAME TO `streetsAddress`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_streetsI18n` (
	`scopeId` text NOT NULL,
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
	CONSTRAINT `streetsI18n_pk` PRIMARY KEY(`scopeId`, `streetId`, `locale`),
	CONSTRAINT `streetsI18n_scopeId_streetId_streets_fk` FOREIGN KEY (`scopeId`,`streetId`) REFERENCES `streets`(`scopeId`,`id`) ON DELETE CASCADE
);
--> statement-breakpoint
INSERT INTO `__new_streetsI18n`(`scopeId`, `streetId`, `locale`, `name`, `base`, `designator`, `directionalPrefix`, `directionalSuffix`, `normalised`, `description`, `createdAt`, `updatedAt`) SELECT `scopeId`, `streetId`, `locale`, `name`, `base`, `designator`, `directionalPrefix`, `directionalSuffix`, `normalised`, `description`, `createdAt`, `updatedAt` FROM `streetsI18n`;--> statement-breakpoint
DROP TABLE `streetsI18n`;--> statement-breakpoint
ALTER TABLE `__new_streetsI18n` RENAME TO `streetsI18n`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `address2dBuildingNumberLookup_lookup_idx` ON `address2dBuildingNumberLookup` (`scopeId`,`buildingNumber`);--> statement-breakpoint
CREATE INDEX `address2dBuildingNumberLookup_numericStem_idx` ON `address2dBuildingNumberLookup` (`scopeId`,`numericStem`);--> statement-breakpoint
CREATE INDEX `address2dI18n_locale_idx` ON `address2dI18n` (`locale`);--> statement-breakpoint
CREATE UNIQUE INDEX `address3d_snapshot_owner_unique` ON `address3d` (`scopeId`,`address2dId`);--> statement-breakpoint
CREATE INDEX `address3dI18n_locale_idx` ON `address3dI18n` (`locale`);--> statement-breakpoint
CREATE INDEX `placesCells_lookup_idx` ON `placesCells` (`scopeId`,`h3Level`,`h3Cell`,`id`);--> statement-breakpoint
CREATE INDEX `placesDivision_scope_division_place_idx` ON `placesDivision` (`placeScopeId`,`divisionId`,`placeId`);--> statement-breakpoint
CREATE INDEX `placesI18n_name_idx` ON `placesI18n` (`locale`,`name`);--> statement-breakpoint
CREATE INDEX `divisionsI18n_name_idx` ON `divisionsI18n` (`scopeId`,`locale`,`name`);--> statement-breakpoint
CREATE INDEX `streetsAddress_addressId_idx` ON `streetsAddress` (`addressSnapshotId`,`addressId`);--> statement-breakpoint
CREATE INDEX `streetsI18n_name_idx` ON `streetsI18n` (`locale`,`name`);