PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_divisions` (
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
	`versionHash` text NOT NULL,
	`sourceReleaseId` text NOT NULL,
	`snapshotId` text NOT NULL,
	`isCurrent` integer NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `divisions_pk` PRIMARY KEY(`id`, `versionHash`)
);
--> statement-breakpoint
INSERT INTO `__new_divisions`(`id`, `divisionCode`, `identifiers`, `level`, `type`, `sourceKeys`, `wikidata`, `hierarchy`, `cartography`, `sources`, `geometry`, `bbox`, `versionHash`, `sourceReleaseId`, `snapshotId`, `isCurrent`, `createdAt`, `updatedAt`) SELECT `id`, `divisionCode`, `identifiers`, `level`, `type`, `sourceKeys`, `wikidata`, `hierarchy`, `cartography`, `sources`, `geometry`, `bbox`, `versionHash`, `sourceReleaseId`, `snapshotId`, `isCurrent`, `createdAt`, `updatedAt` FROM `divisions`;--> statement-breakpoint
DROP TABLE `divisions`;--> statement-breakpoint
ALTER TABLE `__new_divisions` RENAME TO `divisions`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `divisions_current_lookup_idx` ON `divisions` (`id`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `divisions_divisionCode_idx` ON `divisions` (`snapshotId`,`divisionCode`);--> statement-breakpoint
CREATE INDEX `divisions_sourceReleaseId_idx` ON `divisions` (`sourceReleaseId`);--> statement-breakpoint
CREATE INDEX `divisions_snapshotId_idx` ON `divisions` (`snapshotId`);