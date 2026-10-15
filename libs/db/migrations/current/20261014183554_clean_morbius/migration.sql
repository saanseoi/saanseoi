CREATE TABLE `placeDivisionDefinitions` (
	`divisionSnapshotId` text NOT NULL,
	`divisionId` text NOT NULL,
	`definition` text NOT NULL,
	CONSTRAINT `placeDivisionDefinitions_pk` PRIMARY KEY(`divisionSnapshotId`, `divisionId`)
);
--> statement-breakpoint
ALTER TABLE `places` ADD `geometry` text NOT NULL;--> statement-breakpoint
ALTER TABLE `places` ADD `identifiers` text;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_placesDivision` (
	`placeScopeId` text NOT NULL,
	`placeId` text NOT NULL,
	`divisionSnapshotId` text NOT NULL,
	`divisionId` text NOT NULL,
	CONSTRAINT `placesDivision_pk` PRIMARY KEY(`placeScopeId`, `placeId`, `divisionId`),
	CONSTRAINT `placesDivision_placeScopeId_placeId_places_fk` FOREIGN KEY (`placeScopeId`,`placeId`) REFERENCES `places`(`scopeId`,`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_placesDivision_divisionSnapshotId_divisionId_placeDivisionDefinitions_divisionSnapshotId_divisionId_fk` FOREIGN KEY (`divisionSnapshotId`,`divisionId`) REFERENCES `placeDivisionDefinitions`(`divisionSnapshotId`,`divisionId`)
);
--> statement-breakpoint
INSERT INTO `__new_placesDivision`(`placeScopeId`, `placeId`, `divisionSnapshotId`, `divisionId`) SELECT `placeScopeId`, `placeId`, `divisionSnapshotId`, `divisionId` FROM `placesDivision`;--> statement-breakpoint
DROP TABLE `placesDivision`;--> statement-breakpoint
ALTER TABLE `__new_placesDivision` RENAME TO `placesDivision`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `placesDivision_scope_division_place_idx` ON `placesDivision` (`placeScopeId`,`divisionId`,`placeId`);--> statement-breakpoint
ALTER TABLE `places` DROP COLUMN `lng`;--> statement-breakpoint
ALTER TABLE `places` DROP COLUMN `lat`;--> statement-breakpoint
ALTER TABLE `places` DROP COLUMN `wikidataId`;--> statement-breakpoint
ALTER TABLE `places` DROP COLUMN `lastSeenMonth`;