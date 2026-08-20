CREATE TABLE `accessAnalyticsEvents` (
	`eventId` text PRIMARY KEY,
	`requestIdentity` text NOT NULL,
	`eventType` text NOT NULL,
	`surface` text NOT NULL,
	`sourceReleaseId` text,
	`sourceReleaseCode` text,
	`contributingSourceReleaseIds` text NOT NULL,
	`contributingSourceReleaseCodes` text NOT NULL,
	`apiReleaseSetId` text,
	`apiReleaseSetCode` text,
	`publisherCodes` text NOT NULL,
	`httpStatus` integer NOT NULL,
	`occurredAt` text NOT NULL,
	`completedAt` text,
	`lastCheckedAt` text NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `accessAnalyticsRollups` (
	`scope` text NOT NULL,
	`entityId` text NOT NULL,
	`apiRequests` integer DEFAULT 0 NOT NULL,
	`downloads` integer DEFAULT 0 NOT NULL,
	`asOf` text NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `accessAnalyticsRollups_pk` PRIMARY KEY(`scope`, `entityId`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `accessAnalyticsEvents_requestIdentity_unique_idx` ON `accessAnalyticsEvents` (`requestIdentity`);--> statement-breakpoint
CREATE INDEX `accessAnalyticsEvents_sourceReleaseId_idx` ON `accessAnalyticsEvents` (`sourceReleaseId`);--> statement-breakpoint
CREATE INDEX `accessAnalyticsEvents_apiReleaseSetId_idx` ON `accessAnalyticsEvents` (`apiReleaseSetId`);--> statement-breakpoint
CREATE INDEX `accessAnalyticsEvents_occurredAt_idx` ON `accessAnalyticsEvents` (`occurredAt`);--> statement-breakpoint
CREATE INDEX `accessAnalyticsRollups_entityId_idx` ON `accessAnalyticsRollups` (`entityId`);