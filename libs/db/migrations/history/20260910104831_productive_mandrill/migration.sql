CREATE TABLE `sourceResolutions` (
	`scopeId` text NOT NULL,
	`snapshotId` text,
	`sourceReleaseId` text NOT NULL,
	`sourceRecordId` text NOT NULL,
	`sourceVersionHash` text NOT NULL,
	`resolutions` text NOT NULL,
	CONSTRAINT `sourceResolutions_pk` PRIMARY KEY(`scopeId`, `sourceReleaseId`, `sourceRecordId`, `sourceVersionHash`)
);
--> statement-breakpoint
CREATE INDEX `sourceResolutions_source_idx` ON `sourceResolutions` (`sourceReleaseId`,`sourceRecordId`,`sourceVersionHash`);