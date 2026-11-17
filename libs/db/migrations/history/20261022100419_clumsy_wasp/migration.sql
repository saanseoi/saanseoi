DROP INDEX IF EXISTS `address2d_parentAddressId_idx`;--> statement-breakpoint
ALTER TABLE `address2d` DROP COLUMN `parentAddressId`;--> statement-breakpoint
ALTER TABLE `address2d` DROP COLUMN `premisesType`;--> statement-breakpoint
ALTER TABLE `address2d` DROP COLUMN `premisesKind`;