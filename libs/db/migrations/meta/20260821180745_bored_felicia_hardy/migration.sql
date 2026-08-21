CREATE TABLE `divisionCodes` (
	`domainCode` text NOT NULL,
	`level` integer NOT NULL,
	`divisionCode` text NOT NULL,
	`canonicalId` text NOT NULL,
	`sourceBridge` text,
	`versionHash` text NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `divisionCodes_pk` PRIMARY KEY(`domainCode`, `level`, `divisionCode`)
);
--> statement-breakpoint
CREATE INDEX `divisionCodes_canonical_idx` ON `divisionCodes` (`domainCode`,`level`,`canonicalId`);