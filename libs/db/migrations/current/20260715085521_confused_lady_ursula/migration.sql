CREATE TABLE `divisionAreas` (
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
	CONSTRAINT `divisionAreas_pk` PRIMARY KEY(`snapshotId`, `id`),
	CONSTRAINT `divisionAreas_snapshotId_divisionId_divisions_fk` FOREIGN KEY (`snapshotId`,`divisionId`) REFERENCES `divisions`(`snapshotId`,`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `divisionBoundaries` (
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
	CONSTRAINT `divisionBoundaries_pk` PRIMARY KEY(`snapshotId`, `id`),
	CONSTRAINT `divisionBoundaries_snapshotId_leftDivisionId_divisions_fk` FOREIGN KEY (`snapshotId`,`leftDivisionId`) REFERENCES `divisions`(`snapshotId`,`id`) ON DELETE CASCADE,
	CONSTRAINT `divisionBoundaries_snapshotId_rightDivisionId_divisions_fk` FOREIGN KEY (`snapshotId`,`rightDivisionId`) REFERENCES `divisions`(`snapshotId`,`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX `divisionAreas_divisionId_idx` ON `divisionAreas` (`snapshotId`,`divisionId`);--> statement-breakpoint
CREATE INDEX `divisionAreas_type_idx` ON `divisionAreas` (`snapshotId`,`type`);--> statement-breakpoint
CREATE INDEX `divisionBoundaries_leftDivisionId_idx` ON `divisionBoundaries` (`snapshotId`,`leftDivisionId`);--> statement-breakpoint
CREATE INDEX `divisionBoundaries_rightDivisionId_idx` ON `divisionBoundaries` (`snapshotId`,`rightDivisionId`);--> statement-breakpoint
CREATE INDEX `divisionBoundaries_type_idx` ON `divisionBoundaries` (`snapshotId`,`type`);