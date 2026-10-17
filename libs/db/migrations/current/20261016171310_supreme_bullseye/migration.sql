PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_address2dI18n` (
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
INSERT INTO `__new_address2dI18n`(`scopeId`, `addressId`, `locale`, `meta`, `formattedAddress`, `buildingName`, `buildingNumberExpression`, `buildingNumberFrom`, `buildingNumberTo`, `buildingNumberConnector`, `blockExpression`, `blockType`, `blockRef`, `blockTypeBeforeNumber`, `phaseExpression`, `phaseName`, `phaseRef`, `estateName`, `streetName`, `createdAt`) SELECT `scopeId`, `addressId`, `locale`, `meta`, `formattedAddress`, `buildingName`, `buildingNumberExpression`, `buildingNumberFrom`, `buildingNumberTo`, `buildingNumberConnector`, `blockExpression`, `blockType`, `blockRef`, `blockTypeBeforeNumber`, `phaseExpression`, `phaseName`, `phaseRef`, `estateName`, `streetName`, `createdAt` FROM `address2dI18n`;--> statement-breakpoint
DROP TABLE `address2dI18n`;--> statement-breakpoint
ALTER TABLE `__new_address2dI18n` RENAME TO `address2dI18n`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_address3dI18n` (
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
INSERT INTO `__new_address3dI18n`(`scopeId`, `address3dId`, `locale`, `meta`, `units`, `createdAt`) SELECT `scopeId`, `address3dId`, `locale`, `meta`, `units`, `createdAt` FROM `address3dI18n`;--> statement-breakpoint
DROP TABLE `address3dI18n`;--> statement-breakpoint
ALTER TABLE `__new_address3dI18n` RENAME TO `address3dI18n`;--> statement-breakpoint
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
	`meta` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `placesI18n_pk` PRIMARY KEY(`scopeId`, `placeId`, `locale`),
	CONSTRAINT `placesI18n_scopeId_placeId_places_fk` FOREIGN KEY (`scopeId`,`placeId`) REFERENCES `places`(`scopeId`,`id`) ON DELETE CASCADE
);
--> statement-breakpoint
INSERT INTO `__new_placesI18n`(`scopeId`, `searchDependencyText`, `placeId`, `locale`, `name`, `nameVariant`, `nameAlts`, `brandName`, `brandNameVariant`, `brandNameAlts`, `freeformAddress`, `accessHint`, `meta`, `createdAt`) SELECT `scopeId`, `searchDependencyText`, `placeId`, `locale`, `name`, `nameVariant`, `nameAlts`, `brandName`, `brandNameVariant`, `brandNameAlts`, `freeformAddress`, `accessHint`, `meta`, `createdAt` FROM `placesI18n`;--> statement-breakpoint
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
	`meta` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `divisionsI18n_pk` PRIMARY KEY(`scopeId`, `divisionId`, `locale`),
	CONSTRAINT `divisionsI18n_scopeId_divisionId_divisions_fk` FOREIGN KEY (`scopeId`,`divisionId`) REFERENCES `divisions`(`scopeId`,`id`) ON DELETE CASCADE
);
--> statement-breakpoint
INSERT INTO `__new_divisionsI18n`(`scopeId`, `divisionId`, `locale`, `name`, `nameVariant`, `nameAlts`, `nameRules`, `meta`, `createdAt`) SELECT `scopeId`, `divisionId`, `locale`, `name`, `nameVariant`, `nameAlts`, `nameRules`, `meta`, `createdAt` FROM `divisionsI18n`;--> statement-breakpoint
DROP TABLE `divisionsI18n`;--> statement-breakpoint
ALTER TABLE `__new_divisionsI18n` RENAME TO `divisionsI18n`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_streetsI18n` (
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
INSERT INTO `__new_streetsI18n`(`scopeId`, `streetId`, `locale`, `meta`, `name`, `base`, `designator`, `directionalPrefix`, `directionalSuffix`, `normalised`, `description`, `createdAt`) SELECT `scopeId`, `streetId`, `locale`, `meta`, `name`, `base`, `designator`, `directionalPrefix`, `directionalSuffix`, `normalised`, `description`, `createdAt` FROM `streetsI18n`;--> statement-breakpoint
DROP TABLE `streetsI18n`;--> statement-breakpoint
ALTER TABLE `__new_streetsI18n` RENAME TO `streetsI18n`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_statsFieldsI18n` (
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
INSERT INTO `__new_statsFieldsI18n`(`datasetCode`, `fieldName`, `locale`, `name`, `description`, `meta`, `versionHash`, `createdAt`) SELECT `datasetCode`, `fieldName`, `locale`, `name`, `description`, `meta`, `versionHash`, `createdAt` FROM `statsFieldsI18n`;--> statement-breakpoint
DROP TABLE `statsFieldsI18n`;--> statement-breakpoint
ALTER TABLE `__new_statsFieldsI18n` RENAME TO `statsFieldsI18n`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_statsMeasuresI18n` (
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
INSERT INTO `__new_statsMeasuresI18n`(`datasetCode`, `measureCode`, `locale`, `name`, `description`, `meta`, `versionHash`, `createdAt`) SELECT `datasetCode`, `measureCode`, `locale`, `name`, `description`, `meta`, `versionHash`, `createdAt` FROM `statsMeasuresI18n`;--> statement-breakpoint
DROP TABLE `statsMeasuresI18n`;--> statement-breakpoint
ALTER TABLE `__new_statsMeasuresI18n` RENAME TO `statsMeasuresI18n`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_statsValuesI18n` (
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
INSERT INTO `__new_statsValuesI18n`(`datasetCode`, `dimensionCode`, `valueCode`, `locale`, `meta`, `name`, `versionHash`, `createdAt`) SELECT `datasetCode`, `dimensionCode`, `valueCode`, `locale`, `meta`, `name`, `versionHash`, `createdAt` FROM `statsValuesI18n`;--> statement-breakpoint
DROP TABLE `statsValuesI18n`;--> statement-breakpoint
ALTER TABLE `__new_statsValuesI18n` RENAME TO `statsValuesI18n`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `address2dI18n_locale_idx` ON `address2dI18n` (`locale`);--> statement-breakpoint
CREATE INDEX `address3dI18n_locale_idx` ON `address3dI18n` (`locale`);--> statement-breakpoint
CREATE INDEX `placesI18n_name_idx` ON `placesI18n` (`locale`,`name`);--> statement-breakpoint
CREATE INDEX `divisionsI18n_name_idx` ON `divisionsI18n` (`scopeId`,`locale`,`name`);--> statement-breakpoint
CREATE INDEX `streetsI18n_name_idx` ON `streetsI18n` (`locale`,`name`);