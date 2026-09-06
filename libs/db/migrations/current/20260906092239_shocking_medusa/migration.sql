ALTER TABLE `address2d` ADD `parentAddressId` text;--> statement-breakpoint
CREATE INDEX `address2d_parentAddressId_idx` ON `address2d` (`snapshotId`,`parentAddressId`);