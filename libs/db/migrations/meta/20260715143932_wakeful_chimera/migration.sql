ALTER TABLE `divisionIdentifierBridges` RENAME TO `identifierBridges`;--> statement-breakpoint
ALTER TABLE `identifierBridges` RENAME COLUMN `canonicalDivisionId` TO `canonicalId`;--> statement-breakpoint
ALTER TABLE `identifierBridges` ADD `resourceType` text NOT NULL;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_identifierBridges` (
	`resourceType` text NOT NULL,
	`cohortKey` text NOT NULL,
	`domain` text NOT NULL,
	`authority` text NOT NULL,
	`externalId` text NOT NULL,
	`externalCode` text,
	`canonicalId` text NOT NULL,
	`sourceDatasetCode` text NOT NULL,
	`sourceReleaseCode` text NOT NULL,
	`mappingMethod` text NOT NULL,
	`reviewStatus` text NOT NULL,
	`identifiers` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `identifierBridges_pk` PRIMARY KEY(`resourceType`, `cohortKey`, `domain`, `authority`, `externalId`)
);
--> statement-breakpoint
INSERT INTO `__new_identifierBridges`(`cohortKey`, `domain`, `authority`, `externalId`, `externalCode`, `canonicalId`, `sourceDatasetCode`, `sourceReleaseCode`, `mappingMethod`, `reviewStatus`, `identifiers`, `createdAt`, `updatedAt`) SELECT `cohortKey`, `domain`, `authority`, `externalId`, `externalCode`, `canonicalId`, `sourceDatasetCode`, `sourceReleaseCode`, `mappingMethod`, `reviewStatus`, `identifiers`, `createdAt`, `updatedAt` FROM `identifierBridges`;--> statement-breakpoint
DROP TABLE `identifierBridges`;--> statement-breakpoint
ALTER TABLE `__new_identifierBridges` RENAME TO `identifierBridges`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
DROP INDEX IF EXISTS `divisionIdentifierBridges_canonicalDivisionId_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `divisionIdentifierBridges_sourceReleaseCode_idx`;--> statement-breakpoint
CREATE INDEX `identifierBridges_canonicalId_idx` ON `identifierBridges` (`canonicalId`);--> statement-breakpoint
CREATE INDEX `identifierBridges_sourceReleaseCode_idx` ON `identifierBridges` (`sourceReleaseCode`);