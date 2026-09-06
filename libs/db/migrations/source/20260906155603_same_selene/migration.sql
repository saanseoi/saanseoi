CREATE TABLE `hkgovAlsAddresses3d` (
	`sourceRecordId` text NOT NULL,
	`versionHash` text NOT NULL,
	`releaseId` text NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`sources` text NOT NULL,
	`rawProperties` text NOT NULL,
	CONSTRAINT `hkgovAlsAddresses3d_pk` PRIMARY KEY(`releaseId`, `sourceRecordId`)
);
--> statement-breakpoint
CREATE INDEX `hkgovAlsAddresses3d_releaseId_idx` ON `hkgovAlsAddresses3d` (`releaseId`);--> statement-breakpoint
CREATE INDEX `hkgovAlsAddresses3d_sourceRecordId_idx` ON `hkgovAlsAddresses3d` (`sourceRecordId`);