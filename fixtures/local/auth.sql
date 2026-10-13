-- Local development identity. OAuth tokens and sessions are deliberately omitted.

PRAGMA foreign_keys = ON;

BEGIN;

INSERT INTO "user" ("id", "name", "email", "email_verified", "image", "locale", "role", "substack", "created_at", "updated_at")
VALUES ('c5su7XyJ3X8w0UQbhn2gou67lLcmwaDo', 'Mart van de Ven', 'm@type.hk', 1, 'https://avatars.githubusercontent.com/u/645283?v=4', 'en', 'user', NULL, 1791858621022, 1791858643355)
ON CONFLICT (id) DO NOTHING;

INSERT INTO "account" ("id", "issuer", "account_id", "provider_id", "user_id", "scope", "created_at", "updated_at")
VALUES ('RUZ0Mlf189mHuc7tjpzLIUDvwSZDnIFf', NULL, '100751897841477294261', 'google', 'c5su7XyJ3X8w0UQbhn2gou67lLcmwaDo', 'https://www.googleapis.com/auth/userinfo.email,openid,https://www.googleapis.com/auth/userinfo.profile', 1791858621027, 1791858621027)
ON CONFLICT (id) DO NOTHING;

INSERT INTO "account" ("id", "issuer", "account_id", "provider_id", "user_id", "scope", "created_at", "updated_at")
VALUES ('zKL7TN5PVsL6sPn7jmSOkfVdY2LAIjxz', NULL, '645283', 'github', 'c5su7XyJ3X8w0UQbhn2gou67lLcmwaDo', 'read:user,user:email', 1791858643349, 1791858643349)
ON CONFLICT (id) DO NOTHING;

COMMIT;
