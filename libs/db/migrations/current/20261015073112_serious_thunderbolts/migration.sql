ALTER TABLE `address2d` DROP COLUMN `updatedAt`;--> statement-breakpoint
ALTER TABLE `address2dBuildingNumberLookup` DROP COLUMN `updatedAt`;--> statement-breakpoint
ALTER TABLE `address2dI18n` DROP COLUMN `updatedAt`;--> statement-breakpoint
ALTER TABLE `address3d` DROP COLUMN `updatedAt`;--> statement-breakpoint
ALTER TABLE `address3dI18n` DROP COLUMN `updatedAt`;--> statement-breakpoint
ALTER TABLE `places` DROP COLUMN `updatedAt`;--> statement-breakpoint
ALTER TABLE `placesI18n` DROP COLUMN `updatedAt`;--> statement-breakpoint
ALTER TABLE `divisions` DROP COLUMN `updatedAt`;--> statement-breakpoint
ALTER TABLE `divisionsI18n` DROP COLUMN `updatedAt`;--> statement-breakpoint
ALTER TABLE `streets` DROP COLUMN `updatedAt`;--> statement-breakpoint
ALTER TABLE `streetsI18n` DROP COLUMN `updatedAt`;--> statement-breakpoint
ALTER TABLE `streetChangelog` DROP COLUMN `updatedAt`;--> statement-breakpoint
ALTER TABLE `streetNameChanges` DROP COLUMN `updatedAt`;--> statement-breakpoint
ALTER TABLE `streetGeometry` DROP COLUMN `updatedAt`;--> statement-breakpoint
ALTER TABLE `divisionAreas` DROP COLUMN `updatedAt`;--> statement-breakpoint
ALTER TABLE `divisionBoundaries` DROP COLUMN `updatedAt`;--> statement-breakpoint
ALTER TABLE `statsRecords` DROP COLUMN `updatedAt`;--> statement-breakpoint
ALTER TABLE `divisionGeographicCrosswalks` DROP COLUMN `updatedAt`;