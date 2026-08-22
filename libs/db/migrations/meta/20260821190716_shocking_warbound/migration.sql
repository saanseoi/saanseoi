PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_divisionCodes` (
	`domainCode` text NOT NULL,
	`divisionCode` text NOT NULL,
	`canonicalId` text NOT NULL,
	`versionHash` text NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `divisionCodes_pk` PRIMARY KEY(`domainCode`, `divisionCode`)
);
--> statement-breakpoint
INSERT INTO `__new_divisionCodes`(`domainCode`, `divisionCode`, `canonicalId`, `versionHash`, `createdAt`, `updatedAt`) SELECT `domainCode`, `divisionCode`, `canonicalId`, `versionHash`, `createdAt`, `updatedAt` FROM `divisionCodes`;--> statement-breakpoint
DROP TABLE `divisionCodes`;--> statement-breakpoint
ALTER TABLE `__new_divisionCodes` RENAME TO `divisionCodes`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `divisionCodes_canonical_idx` ON `divisionCodes` (`domainCode`,`canonicalId`);