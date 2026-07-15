PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_divisionAreas` (
	`snapshotId` text NOT NULL,
	`id` text NOT NULL,
	`bbox` text,
	`geometry` text,
	`sourceKeys` text,
	`sources` text,
	`type` text NOT NULL,
	`is_land` integer,
	`is_territorial` integer,
	`divisionId` text NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `divisionAreas_pk` PRIMARY KEY(`snapshotId`, `id`)
);
--> statement-breakpoint
INSERT INTO `__new_divisionAreas`(`snapshotId`, `id`, `bbox`, `geometry`, `sourceKeys`, `sources`, `type`, `is_land`, `is_territorial`, `divisionId`, `createdAt`, `updatedAt`) SELECT `snapshotId`, `id`, `bbox`, `geometry`, `sourceKeys`, `sources`, `type`, `is_land`, `is_territorial`, `divisionId`, `createdAt`, `updatedAt` FROM `divisionAreas`;--> statement-breakpoint
DROP TABLE `divisionAreas`;--> statement-breakpoint
ALTER TABLE `__new_divisionAreas` RENAME TO `divisionAreas`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_divisionBoundaries` (
	`snapshotId` text NOT NULL,
	`id` text NOT NULL,
	`bbox` text,
	`geometry` text,
	`sourceKeys` text,
	`sources` text,
	`type` text NOT NULL,
	`is_land` integer,
	`is_territorial` integer,
	`leftDivisionId` text NOT NULL,
	`rightDivisionId` text NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `divisionBoundaries_pk` PRIMARY KEY(`snapshotId`, `id`)
);
--> statement-breakpoint
INSERT INTO `__new_divisionBoundaries`(`snapshotId`, `id`, `bbox`, `geometry`, `sourceKeys`, `sources`, `type`, `is_land`, `is_territorial`, `leftDivisionId`, `rightDivisionId`, `createdAt`, `updatedAt`) SELECT `snapshotId`, `id`, `bbox`, `geometry`, `sourceKeys`, `sources`, `type`, `is_land`, `is_territorial`, `leftDivisionId`, `rightDivisionId`, `createdAt`, `updatedAt` FROM `divisionBoundaries`;--> statement-breakpoint
DROP TABLE `divisionBoundaries`;--> statement-breakpoint
ALTER TABLE `__new_divisionBoundaries` RENAME TO `divisionBoundaries`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `divisionAreas_divisionId_idx` ON `divisionAreas` (`snapshotId`,`divisionId`);--> statement-breakpoint
CREATE INDEX `divisionAreas_type_idx` ON `divisionAreas` (`snapshotId`,`type`);--> statement-breakpoint
CREATE INDEX `divisionBoundaries_leftDivisionId_idx` ON `divisionBoundaries` (`snapshotId`,`leftDivisionId`);--> statement-breakpoint
CREATE INDEX `divisionBoundaries_rightDivisionId_idx` ON `divisionBoundaries` (`snapshotId`,`rightDivisionId`);--> statement-breakpoint
CREATE INDEX `divisionBoundaries_type_idx` ON `divisionBoundaries` (`snapshotId`,`type`);