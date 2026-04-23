-- Normalize legacy "__TRIPPER_USER_META__" values stored in users.timezone.
-- This migration keeps existing password_hash/google_id values when already set,
-- and only backfills from legacy metadata when those columns are null.

BEGIN;

WITH legacy_users AS (
  SELECT
    id,
    REPLACE(timezone, '__TRIPPER_USER_META__:', '')::jsonb AS meta
  FROM public.users
  WHERE timezone LIKE '__TRIPPER_USER_META__:%'
)
UPDATE public.users AS u
SET
  timezone = COALESCE(NULLIF(legacy_users.meta ->> 'timezone', ''), 'UTC'),
  password_hash = COALESCE(
    u.password_hash,
    NULLIF(legacy_users.meta ->> 'passwordHash', '')
  ),
  google_id = COALESCE(
    u.google_id,
    NULLIF(legacy_users.meta ->> 'googleId', '')
  ),
  updated_at = NOW()
FROM legacy_users
WHERE u.id = legacy_users.id;

COMMIT;
