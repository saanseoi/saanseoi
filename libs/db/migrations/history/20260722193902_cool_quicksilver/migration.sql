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
ALTER TABLE `address2dI18n` RENAME COLUMN `blockNumber` TO `blockRef`;--> statement-breakpoint
ALTER TABLE `address2dI18n` RENAME COLUMN `phaseNumber` TO `phaseRef`;--> statement-breakpoint
ALTER TABLE `address3dI18n` RENAME COLUMN `unitNumber` TO `unitRef`;--> statement-breakpoint
ALTER TABLE `address3dI18n` RENAME COLUMN `floorNumber` TO `floorRef`;--> statement-breakpoint
ALTER TABLE `address2dI18n` ADD `buildingNumberExpression` text;--> statement-breakpoint
ALTER TABLE `address2dI18n` ADD `buildingNumberConnector` text;--> statement-breakpoint
ALTER TABLE `address2dI18n` ADD `blockExpression` text;--> statement-breakpoint
ALTER TABLE `address2dI18n` ADD `phaseExpression` text;--> statement-breakpoint
ALTER TABLE `address3dI18n` ADD `unitExpression` text;--> statement-breakpoint
ALTER TABLE `address3dI18n` ADD `floorExpression` text;--> statement-breakpoint
CREATE INDEX `address2dBuildingNumberLookup_lookup_idx` ON `address2dBuildingNumberLookup` (`snapshotId`,`buildingNumber`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `address2dBuildingNumberLookup_numericStem_idx` ON `address2dBuildingNumberLookup` (`snapshotId`,`numericStem`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `address3dUnitRefLookup_lookup_idx` ON `address3dUnitRefLookup` (`snapshotId`,`unitRef`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `address3dUnitRefLookup_numericStem_idx` ON `address3dUnitRefLookup` (`snapshotId`,`numericStem`,`isCurrent`);--> statement-breakpoint
ALTER TABLE `address2dI18n` DROP COLUMN `streetNumber`;