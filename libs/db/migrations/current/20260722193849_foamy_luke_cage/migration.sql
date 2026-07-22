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
CREATE TABLE `address3dUnitRefLookup` (
	`snapshotId` text NOT NULL,
	`address3dId` text NOT NULL,
	`unitRef` text NOT NULL,
	`numericStem` text,
	`evidence` text NOT NULL,
	`derivation` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `address3dUnitRefLookup_pk` PRIMARY KEY(`snapshotId`, `address3dId`, `unitRef`),
	CONSTRAINT `address3dUnitRefLookup_snapshotId_address3dId_address3d_fk` FOREIGN KEY (`snapshotId`,`address3dId`) REFERENCES `address3d`(`snapshotId`,`id`) ON DELETE CASCADE
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
CREATE INDEX `address2dBuildingNumberLookup_lookup_idx` ON `address2dBuildingNumberLookup` (`snapshotId`,`buildingNumber`);--> statement-breakpoint
CREATE INDEX `address2dBuildingNumberLookup_numericStem_idx` ON `address2dBuildingNumberLookup` (`snapshotId`,`numericStem`);--> statement-breakpoint
CREATE INDEX `address3dUnitRefLookup_lookup_idx` ON `address3dUnitRefLookup` (`snapshotId`,`unitRef`);--> statement-breakpoint
CREATE INDEX `address3dUnitRefLookup_numericStem_idx` ON `address3dUnitRefLookup` (`snapshotId`,`numericStem`);--> statement-breakpoint
ALTER TABLE `address2dI18n` DROP COLUMN `streetNumber`;