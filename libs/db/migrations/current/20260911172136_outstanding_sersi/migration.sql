ALTER TABLE `placesDivision` ADD `definition` text NOT NULL;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_placesDivision` (
	`placeSnapshotId` text NOT NULL,
	`placeId` text NOT NULL,
	`divisionSnapshotId` text NOT NULL,
	`divisionId` text NOT NULL,
	`definition` text NOT NULL,
	CONSTRAINT `placesDivision_pk` PRIMARY KEY(`placeSnapshotId`, `placeId`, `divisionId`),
	CONSTRAINT `placesDivision_placeSnapshotId_placeId_places_fk` FOREIGN KEY (`placeSnapshotId`,`placeId`) REFERENCES `places`(`snapshotId`,`id`) ON DELETE CASCADE
);
--> statement-breakpoint
INSERT INTO `__new_placesDivision`(`placeSnapshotId`, `placeId`, `divisionSnapshotId`, `divisionId`) SELECT `placeSnapshotId`, `placeId`, `divisionSnapshotId`, `divisionId` FROM `placesDivision`;--> statement-breakpoint
DROP TABLE `placesDivision`;--> statement-breakpoint
ALTER TABLE `__new_placesDivision` RENAME TO `placesDivision`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `placesDivision_divisionId_idx` ON `placesDivision` (`divisionSnapshotId`,`divisionId`,`placeSnapshotId`,`placeId`);