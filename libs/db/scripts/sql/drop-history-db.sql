PRAGMA foreign_keys = OFF;
PRAGMA defer_foreign_keys = true;

DROP TABLE IF EXISTS `placesI18n`;
DROP TABLE IF EXISTS `places`;
DROP TABLE IF EXISTS `streetsI18n`;
DROP TABLE IF EXISTS `streets`;
DROP TABLE IF EXISTS `address3dI18n`;
DROP TABLE IF EXISTS `address3d`;
DROP TABLE IF EXISTS `address2dI18n`;
DROP TABLE IF EXISTS `address2d`;
DROP TABLE IF EXISTS `divisionsI18n`;
DROP TABLE IF EXISTS `divisions`;
DROP TABLE IF EXISTS `divisionBoundaries`;
DROP TABLE IF EXISTS `divisionAreas`;
DROP TABLE IF EXISTS `d1_migrations`;

PRAGMA foreign_keys = ON;
