PRAGMA foreign_keys = OFF;
PRAGMA defer_foreign_keys = true;

DROP TABLE IF EXISTS `hkgovAlsAddress2dI18n`;
DROP TABLE IF EXISTS `hkgovAlsAddresses2d`;
DROP TABLE IF EXISTS `hkgovHadDivisionAreas`;
DROP TABLE IF EXISTS `overtureAddresses2d`;
DROP TABLE IF EXISTS `overtureDivisionBoundaries`;
DROP TABLE IF EXISTS `overtureDivisionAreas`;
DROP TABLE IF EXISTS `overtureDivisionI18n`;
DROP TABLE IF EXISTS `overtureDivisions`;
DROP TABLE IF EXISTS `overturePlaceI18n`;
DROP TABLE IF EXISTS `overturePlaces`;
DROP TABLE IF EXISTS `stagingOvertureAddresses2d`;
DROP TABLE IF EXISTS `stagingOvertureAddresses2dI18n`;
DROP TABLE IF EXISTS `stagingOvertureAddresses2dChanged`;
DROP TABLE IF EXISTS `d1_migrations`;

PRAGMA foreign_keys = ON;
