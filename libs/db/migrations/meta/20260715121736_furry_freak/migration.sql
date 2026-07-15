CREATE TABLE `divisionIdentifierBridges` (
	`cohortKey` text NOT NULL,
	`domain` text NOT NULL,
	`authority` text NOT NULL,
	`externalId` text NOT NULL,
	`externalCode` text,
	`canonicalDivisionId` text NOT NULL,
	`sourceDatasetCode` text NOT NULL,
	`sourceReleaseCode` text NOT NULL,
	`mappingMethod` text NOT NULL,
	`reviewStatus` text NOT NULL,
	`identifiers` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `divisionIdentifierBridges_pk` PRIMARY KEY(`cohortKey`, `domain`, `authority`, `externalId`)
);
--> statement-breakpoint
CREATE INDEX `divisionIdentifierBridges_canonicalDivisionId_idx` ON `divisionIdentifierBridges` (`canonicalDivisionId`);--> statement-breakpoint
CREATE INDEX `divisionIdentifierBridges_sourceReleaseCode_idx` ON `divisionIdentifierBridges` (`sourceReleaseCode`);