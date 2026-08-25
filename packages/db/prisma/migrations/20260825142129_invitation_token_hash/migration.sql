-- Security hardening: store a SHA-256 hash of the invitation token instead of the
-- plaintext value, matching the pattern already used by RefreshToken.tokenHash.
-- Backfills existing rows so any still-valid (unexpired, unaccepted) invitation
-- links keep working after this migration, instead of invalidating them.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE "Invitation" ADD COLUMN "tokenHash" TEXT;

UPDATE "Invitation" SET "tokenHash" = encode(digest("token", 'sha256'), 'hex');

ALTER TABLE "Invitation" ALTER COLUMN "tokenHash" SET NOT NULL;

DROP INDEX IF EXISTS "Invitation_token_key";

CREATE UNIQUE INDEX "Invitation_tokenHash_key" ON "Invitation"("tokenHash");

ALTER TABLE "Invitation" DROP COLUMN "token";
