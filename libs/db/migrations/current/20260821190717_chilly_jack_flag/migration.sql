PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_divisions` (
	`snapshotId` text NOT NULL,
	`id` text NOT NULL,
	`divisionCode` text,
	`identifiers` text,
	`level` integer,
	`type` text NOT NULL,
	`sourceKeys` text,
	`wikidata` text,
	`hierarchy` text,
	`cartography` text,
	`sources` text,
	`geometry` text,
	`bbox` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `divisions_pk` PRIMARY KEY(`snapshotId`, `id`)
);
--> statement-breakpoint
INSERT INTO `__new_divisions`(`snapshotId`, `id`, `divisionCode`, `identifiers`, `level`, `type`, `sourceKeys`, `wikidata`, `hierarchy`, `cartography`, `sources`, `geometry`, `bbox`, `createdAt`, `updatedAt`) SELECT `snapshotId`, `id`, `divisionCode`, `identifiers`, `level`, `type`, `sourceKeys`, `wikidata`, `hierarchy`, `cartography`, `sources`, `geometry`, `bbox`, `createdAt`, `updatedAt` FROM `divisions`;--> statement-breakpoint
DROP TABLE `divisions`;--> statement-breakpoint
ALTER TABLE `__new_divisions` RENAME TO `divisions`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `divisions_divisionCode_idx` ON `divisions` (`snapshotId`,`divisionCode`);--> statement-breakpoint
CREATE INDEX `divisions_level_idx` ON `divisions` (`level`);