CREATE TABLE `accessAnalyticsIdempotency` (
	`requestIdentity` text PRIMARY KEY,
	`eventType` text NOT NULL,
	`eligible` integer NOT NULL,
	`counted` integer NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
DROP TABLE `accessAnalyticsEvents`;
--> statement-breakpoint
CREATE TABLE `accessAnalyticsDaily` (
	`day` text NOT NULL,
	`scope` text NOT NULL,
	`entityId` text NOT NULL,
	`metrics` text NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `accessAnalyticsDaily_pk` PRIMARY KEY(`day`, `scope`, `entityId`)
);
--> statement-breakpoint
ALTER TABLE `accessAnalyticsRollups` RENAME TO `__legacy_accessAnalyticsRollups`;
--> statement-breakpoint
CREATE TABLE `accessAnalyticsRollups` (
	`period` text NOT NULL,
	`scope` text NOT NULL,
	`entityId` text NOT NULL,
	`metrics` text NOT NULL,
	`asOf` text NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `accessAnalyticsRollups_pk` PRIMARY KEY(`period`, `scope`, `entityId`)
);
--> statement-breakpoint
INSERT INTO `accessAnalyticsRollups` (
	`period`, `scope`, `entityId`, `metrics`, `asOf`, `createdAt`, `updatedAt`
)
SELECT
	'all_time', `scope`, `entityId`,
	json_object('apiRequests', `apiRequests`, 'downloads', `downloads`),
	`asOf`, `createdAt`, `updatedAt`
FROM `__legacy_accessAnalyticsRollups`;
--> statement-breakpoint
DROP TABLE `__legacy_accessAnalyticsRollups`;
--> statement-breakpoint
CREATE INDEX `accessAnalyticsDaily_entityId_idx` ON `accessAnalyticsDaily` (`entityId`);
--> statement-breakpoint
CREATE INDEX `accessAnalyticsRollups_entityId_idx` ON `accessAnalyticsRollups` (`entityId`);
