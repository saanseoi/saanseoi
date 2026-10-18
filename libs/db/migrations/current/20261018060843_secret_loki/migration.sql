DROP INDEX IF EXISTS `address2d_streetId_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `address2d_parentAddressId_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `divisions_divisionCode_idx`;--> statement-breakpoint
CREATE INDEX `address2d_streetId_nonnull_idx` ON `address2d` (`streetId`) WHERE "address2d"."streetId" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `address2d_parentAddressId_nonnull_idx` ON `address2d` (`scopeId`,`parentAddressId`) WHERE "address2d"."parentAddressId" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `divisions_divisionCode_nonnull_idx` ON `divisions` (`scopeId`,`divisionCode`) WHERE "divisions"."divisionCode" IS NOT NULL;