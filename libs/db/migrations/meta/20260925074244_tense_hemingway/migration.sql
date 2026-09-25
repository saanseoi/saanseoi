PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_publishers` (
	`id` text PRIMARY KEY,
	`code` text NOT NULL UNIQUE,
	`url` text,
	`contactUrl` text,
	`contactEmail` text,
	`contactPhone` text,
	`parentPublisherId` text,
	`i18n` text DEFAULT '{}' NOT NULL,
	`versionHash` text NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `publishers_parentPublisherId_publishers_id_fk` FOREIGN KEY (`parentPublisherId`) REFERENCES `publishers`(`id`) ON DELETE RESTRICT
);
--> statement-breakpoint
INSERT INTO `__new_publishers`(`id`, `code`, `url`, `contactUrl`, `contactEmail`, `contactPhone`, `parentPublisherId`, `i18n`, `versionHash`, `createdAt`, `updatedAt`) SELECT `id`, `code`, `url`, `contactUrl`, `contactEmail`, `contactPhone`, `parentPublisherId`, `i18n`, `versionHash`, `createdAt`, `updatedAt` FROM `publishers`;--> statement-breakpoint
DROP TABLE `publishers`;--> statement-breakpoint
ALTER TABLE `__new_publishers` RENAME TO `publishers`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_units` (
	`id` text PRIMARY KEY,
	`code` text NOT NULL UNIQUE,
	`dimension` text NOT NULL,
	`symbol` text NOT NULL,
	`i18n` text DEFAULT '{}' NOT NULL,
	`versionHash` text NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_units`(`id`, `code`, `dimension`, `symbol`, `i18n`, `versionHash`, `createdAt`, `updatedAt`) SELECT `id`, `code`, `dimension`, `symbol`, `i18n`, `versionHash`, `createdAt`, `updatedAt` FROM `units`;--> statement-breakpoint
DROP TABLE `units`;--> statement-breakpoint
ALTER TABLE `__new_units` RENAME TO `units`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_datasets` (
	`id` text PRIMARY KEY,
	`publisherId` text NOT NULL,
	`code` text NOT NULL,
	`regionCode` text NOT NULL,
	`releaseType` text NOT NULL,
	`releaseFrequency` text NOT NULL,
	`theme` text NOT NULL,
	`resourceTypes` text DEFAULT '[]' NOT NULL,
	`kind` text,
	`sourceVariant` text DEFAULT 'default' NOT NULL,
	`sourceCrs` text,
	`sourceUrl` text,
	`schemaURL` text,
	`licenseId` text,
	`category` text,
	`attribution` text,
	`tags` text,
	`processingRules` text,
	`i18n` text DEFAULT '{}' NOT NULL,
	`versionHash` text NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `fk_datasets_publisherId_publishers_id_fk` FOREIGN KEY (`publisherId`) REFERENCES `publishers`(`id`) ON DELETE RESTRICT,
	CONSTRAINT `fk_datasets_licenseId_licenses_id_fk` FOREIGN KEY (`licenseId`) REFERENCES `licenses`(`id`) ON DELETE RESTRICT
);
--> statement-breakpoint
INSERT INTO `__new_datasets`(`id`, `publisherId`, `code`, `regionCode`, `releaseType`, `releaseFrequency`, `theme`, `resourceTypes`, `kind`, `sourceVariant`, `sourceCrs`, `sourceUrl`, `schemaURL`, `licenseId`, `category`, `attribution`, `tags`, `processingRules`, `i18n`, `versionHash`, `createdAt`, `updatedAt`) SELECT `id`, `publisherId`, `code`, `regionCode`, `releaseType`, `releaseFrequency`, `theme`, `resourceTypes`, `kind`, `sourceVariant`, `sourceCrs`, `sourceUrl`, `schemaURL`, `licenseId`, `category`, `attribution`, `tags`, `processingRules`, `i18n`, `versionHash`, `createdAt`, `updatedAt` FROM `datasets`;--> statement-breakpoint
DROP TABLE `datasets`;--> statement-breakpoint
ALTER TABLE `__new_datasets` RENAME TO `datasets`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_apiCompositionMembers` (
	`apiCompositionId` text NOT NULL,
	`i18n` text DEFAULT '{}' NOT NULL,
	`domainCode` text DEFAULT 'default' NOT NULL,
	`resourceType` text NOT NULL,
	`variant` text DEFAULT 'default' NOT NULL,
	`role` text NOT NULL,
	`isRequired` integer NOT NULL,
	`cohortMatchingMode` text NOT NULL,
	`anchorResourceType` text,
	`maxLagDays` integer,
	`priority` integer DEFAULT 0 NOT NULL,
	CONSTRAINT `apiCompositionMembers_pk` PRIMARY KEY(`apiCompositionId`, `domainCode`, `resourceType`, `variant`),
	CONSTRAINT `fk_apiCompositionMembers_apiCompositionId_apiComposition_id_fk` FOREIGN KEY (`apiCompositionId`) REFERENCES `apiComposition`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
INSERT INTO `__new_apiCompositionMembers`(`apiCompositionId`, `i18n`, `domainCode`, `resourceType`, `variant`, `role`, `isRequired`, `cohortMatchingMode`, `anchorResourceType`, `maxLagDays`, `priority`) SELECT `apiCompositionId`, `i18n`, `domainCode`, `resourceType`, `variant`, `role`, `isRequired`, `cohortMatchingMode`, `anchorResourceType`, `maxLagDays`, `priority` FROM `apiCompositionMembers`;--> statement-breakpoint
DROP TABLE `apiCompositionMembers`;--> statement-breakpoint
ALTER TABLE `__new_apiCompositionMembers` RENAME TO `apiCompositionMembers`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `publishers_parentPublisherId_idx` ON `publishers` (`parentPublisherId`);--> statement-breakpoint
CREATE UNIQUE INDEX `datasets_publisherId_code_unique_idx` ON `datasets` (`publisherId`,`code`);--> statement-breakpoint
CREATE INDEX `datasets_region_theme_idx` ON `datasets` (`regionCode`,`theme`);