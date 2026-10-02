CREATE TABLE `apiLifecycleJournal` (
	`id` text PRIMARY KEY,
	`apiVersionId` text NOT NULL,
	`statusFrom` text,
	`statusTo` text NOT NULL,
	`reason` text,
	`metadataJson` text,
	`occurredAt` text NOT NULL,
	CONSTRAINT `fk_apiLifecycleJournal_apiVersionId_apiVersions_id_fk` FOREIGN KEY (`apiVersionId`) REFERENCES `apiVersions`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
ALTER TABLE `publishedDataJournal` RENAME TO `releaseSetLifecycleJournal`;--> statement-breakpoint
DROP INDEX IF EXISTS `publishedDataJournal_resourceReleaseId_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `publishedDataJournal_relatedReleaseId_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `publishedDataJournal_action_idx`;--> statement-breakpoint
CREATE INDEX `apiLifecycleJournal_apiVersionId_occurredAt_idx` ON `apiLifecycleJournal` (`apiVersionId`,`occurredAt`);--> statement-breakpoint
CREATE INDEX `apiLifecycleJournal_statusTo_idx` ON `apiLifecycleJournal` (`statusTo`);--> statement-breakpoint
CREATE INDEX `releaseSetLifecycleJournal_resourceReleaseId_idx` ON `releaseSetLifecycleJournal` (`resourceReleaseId`);--> statement-breakpoint
CREATE INDEX `releaseSetLifecycleJournal_relatedReleaseId_idx` ON `releaseSetLifecycleJournal` (`relatedResourceReleaseId`);--> statement-breakpoint
CREATE INDEX `releaseSetLifecycleJournal_action_idx` ON `releaseSetLifecycleJournal` (`action`);--> statement-breakpoint
ALTER TABLE `apiVersions` DROP COLUMN `publishedAt`;--> statement-breakpoint
ALTER TABLE `apiVersions` DROP COLUMN `deprecatedAt`;--> statement-breakpoint
ALTER TABLE `apiVersions` DROP COLUMN `archivedAt`;--> statement-breakpoint
ALTER TABLE `apiVersions` DROP COLUMN `retiredAt`;