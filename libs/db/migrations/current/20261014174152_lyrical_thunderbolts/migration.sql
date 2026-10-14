ALTER TABLE `address2dI18n` ADD `meta` text DEFAULT '{"isLocaleInferred":false}' NOT NULL;--> statement-breakpoint
ALTER TABLE `address3dI18n` ADD `meta` text DEFAULT '{"isLocaleInferred":false}' NOT NULL;--> statement-breakpoint
ALTER TABLE `placesI18n` ADD `meta` text DEFAULT '{"isLocaleInferred":false}' NOT NULL;--> statement-breakpoint
ALTER TABLE `divisionsI18n` ADD `meta` text DEFAULT '{"isLocaleInferred":false}' NOT NULL;--> statement-breakpoint
ALTER TABLE `streetsI18n` ADD `meta` text DEFAULT '{"isLocaleInferred":false}' NOT NULL;--> statement-breakpoint
ALTER TABLE `statsFieldsI18n` ADD `meta` text DEFAULT '{"isLocaleInferred":false}' NOT NULL;--> statement-breakpoint
ALTER TABLE `statsMeasuresI18n` ADD `meta` text DEFAULT '{"isLocaleInferred":false}' NOT NULL;--> statement-breakpoint
ALTER TABLE `statsValuesI18n` ADD `meta` text DEFAULT '{"isLocaleInferred":false}' NOT NULL;--> statement-breakpoint
ALTER TABLE `placesI18n` DROP COLUMN `provenance`;--> statement-breakpoint
ALTER TABLE `divisionsI18n` DROP COLUMN `nameProvenance`;--> statement-breakpoint
ALTER TABLE `divisionsI18n` DROP COLUMN `isLocaleInferred`;--> statement-breakpoint
ALTER TABLE `statsFieldsI18n` DROP COLUMN `isTranslationVerified`;--> statement-breakpoint
ALTER TABLE `statsMeasuresI18n` DROP COLUMN `isTranslationVerified`;