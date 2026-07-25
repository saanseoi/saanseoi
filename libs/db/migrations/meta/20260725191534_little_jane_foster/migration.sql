CREATE TABLE `assets` (
	`id` text PRIMARY KEY,
	`datasetId` text,
	`releaseId` text,
	`sourceRecordId` text,
	`assetKey` text NOT NULL,
	`contentHash` text NOT NULL,
	`byteLength` integer NOT NULL,
	`mediaType` text NOT NULL,
	`role` text NOT NULL,
	`originalUrl` text,
	`sourcePageLocale` text,
	`sourcePageUrl` text,
	`retrievedAt` text NOT NULL,
	`manifest` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `fk_assets_datasetId_datasets_id_fk` FOREIGN KEY (`datasetId`) REFERENCES `datasets`(`id`) ON DELETE RESTRICT,
	CONSTRAINT `fk_assets_releaseId_releases_id_fk` FOREIGN KEY (`releaseId`) REFERENCES `releases`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
ALTER TABLE `apiComposition` RENAME COLUMN `domainI18n` TO `i18n`;--> statement-breakpoint
CREATE UNIQUE INDEX `assets_assetKey_unique_idx` ON `assets` (`assetKey`);--> statement-breakpoint
CREATE INDEX `assets_contentHash_idx` ON `assets` (`contentHash`);--> statement-breakpoint
CREATE INDEX `assets_datasetId_idx` ON `assets` (`datasetId`);--> statement-breakpoint
CREATE INDEX `assets_releaseId_idx` ON `assets` (`releaseId`);--> statement-breakpoint
CREATE INDEX `assets_sourceRecordId_idx` ON `assets` (`sourceRecordId`);