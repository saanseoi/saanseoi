CREATE TABLE `hkgovLandsdStreetI18n` (
	`sourceRecordId` text NOT NULL,
	`locale` text NOT NULL,
	`name` text NOT NULL,
	`district` text,
	`governmentNoticeLabel` text,
	`governmentNoticeUrl` text,
	`gazettePlanUrls` text,
	`assetLinks` text,
	`translationProvenance` text,
	`versionHash` text NOT NULL,
	`releaseId` text NOT NULL,
	`validFromRelease` text NOT NULL,
	`validToRelease` text,
	`isCurrent` integer NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `hkgovLandsdStreetI18n_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`, `locale`)
);
--> statement-breakpoint
CREATE TABLE `hkgovLandsdStreets` (
	`sourceRecordId` text NOT NULL,
	`isGazetteNoticeListed` integer NOT NULL,
	`landsdPublicationDate` text,
	`governmentNoticeType` text,
	`district` text,
	`districtCodes` text,
	`districtIds` text,
	`sourceAssetLinks` text,
	`sourcePageSnapshots` text,
	`translationAudit` text,
	`rawProperties` text,
	`versionHash` text NOT NULL,
	`releaseId` text NOT NULL,
	`validFromRelease` text NOT NULL,
	`validToRelease` text,
	`isCurrent` integer NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `hkgovLandsdStreets_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`)
);
--> statement-breakpoint
CREATE INDEX `hkgovLandsdStreetI18n_releaseId_idx` ON `hkgovLandsdStreetI18n` (`releaseId`);--> statement-breakpoint
CREATE INDEX `hkgovLandsdStreetI18n_sourceRecordId_idx` ON `hkgovLandsdStreetI18n` (`sourceRecordId`);--> statement-breakpoint
CREATE INDEX `hkgovLandsdStreetI18n_current_lookup_idx` ON `hkgovLandsdStreetI18n` (`sourceRecordId`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `hkgovLandsdStreetI18n_release_validity_idx` ON `hkgovLandsdStreetI18n` (`validFromRelease`,`validToRelease`);--> statement-breakpoint
CREATE INDEX `hkgovLandsdStreetI18n_locale_idx` ON `hkgovLandsdStreetI18n` (`locale`);--> statement-breakpoint
CREATE INDEX `hkgovLandsdStreetI18n_name_idx` ON `hkgovLandsdStreetI18n` (`locale`,`name`);--> statement-breakpoint
CREATE INDEX `hkgovLandsdStreets_releaseId_idx` ON `hkgovLandsdStreets` (`releaseId`);--> statement-breakpoint
CREATE INDEX `hkgovLandsdStreets_sourceRecordId_idx` ON `hkgovLandsdStreets` (`sourceRecordId`);--> statement-breakpoint
CREATE INDEX `hkgovLandsdStreets_current_lookup_idx` ON `hkgovLandsdStreets` (`sourceRecordId`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `hkgovLandsdStreets_release_validity_idx` ON `hkgovLandsdStreets` (`validFromRelease`,`validToRelease`);--> statement-breakpoint
CREATE INDEX `hkgovLandsdStreets_publicationDate_idx` ON `hkgovLandsdStreets` (`landsdPublicationDate`);--> statement-breakpoint
CREATE INDEX `hkgovLandsdStreets_noticeType_idx` ON `hkgovLandsdStreets` (`governmentNoticeType`);