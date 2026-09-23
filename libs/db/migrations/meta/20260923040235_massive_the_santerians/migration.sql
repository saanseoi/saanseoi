ALTER TABLE `publishers` ADD `i18n` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `units` ADD `i18n` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `datasets` ADD `i18n` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `apiCompositionMembers` ADD `i18n` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
DROP INDEX IF EXISTS `publisherI18n_locale_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `datasetI18n_locale_idx`;--> statement-breakpoint
DROP TABLE `publisherI18n`;--> statement-breakpoint
DROP TABLE `unitsI18n`;--> statement-breakpoint
DROP TABLE `datasetI18n`;--> statement-breakpoint
ALTER TABLE `apiComposition` DROP COLUMN `i18n`;