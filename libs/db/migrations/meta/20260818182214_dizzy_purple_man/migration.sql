CREATE TABLE `units` (
	`id` text PRIMARY KEY,
	`code` text NOT NULL UNIQUE,
	`dimension` text NOT NULL,
	`symbol` text NOT NULL,
	`versionHash` text NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `unitsI18n` (
	`unitId` text NOT NULL,
	`locale` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `unitsI18n_pk` PRIMARY KEY(`unitId`, `locale`),
	CONSTRAINT `fk_unitsI18n_unitId_units_id_fk` FOREIGN KEY (`unitId`) REFERENCES `units`(`id`) ON DELETE CASCADE
);
