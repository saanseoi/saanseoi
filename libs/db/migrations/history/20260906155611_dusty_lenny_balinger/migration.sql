ALTER TABLE `address3d` ADD `units` text NOT NULL;--> statement-breakpoint
ALTER TABLE `address3d` ADD `unitCount` integer NOT NULL;--> statement-breakpoint
ALTER TABLE `address3d` ADD `contentHash` text NOT NULL;--> statement-breakpoint
ALTER TABLE `address3d` ADD `unresolvedSectionIds` text NOT NULL;--> statement-breakpoint
ALTER TABLE `address3dI18n` ADD `units` text NOT NULL;--> statement-breakpoint
ALTER TABLE `places` ADD `address3dUnitId` text;--> statement-breakpoint
ALTER TABLE `places` ADD `address3dMembership` text;--> statement-breakpoint
ALTER TABLE `placesI18n` ADD `accessHint` text;--> statement-breakpoint
DROP INDEX IF EXISTS `address3dUnitRefLookup_lookup_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `address3dUnitRefLookup_numericStem_idx`;--> statement-breakpoint
DROP TABLE `address3dUnitRefLookup`;--> statement-breakpoint
ALTER TABLE `address3dI18n` DROP COLUMN `formattedAddressPart`;--> statement-breakpoint
ALTER TABLE `address3dI18n` DROP COLUMN `accessHint`;--> statement-breakpoint
ALTER TABLE `address3dI18n` DROP COLUMN `unitPortion`;--> statement-breakpoint
ALTER TABLE `address3dI18n` DROP COLUMN `unitExpression`;--> statement-breakpoint
ALTER TABLE `address3dI18n` DROP COLUMN `unitRef`;--> statement-breakpoint
ALTER TABLE `address3dI18n` DROP COLUMN `unitType`;--> statement-breakpoint
ALTER TABLE `address3dI18n` DROP COLUMN `floorExpression`;--> statement-breakpoint
ALTER TABLE `address3dI18n` DROP COLUMN `floorRef`;--> statement-breakpoint
ALTER TABLE `address3dI18n` DROP COLUMN `floorType`;