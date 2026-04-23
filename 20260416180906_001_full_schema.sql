
/*
  # Full DBMS Project Schema

  This migration creates the complete schema for the Travel Expense & Itinerary Management System.

  ## Tables Created
  - `users` - User accounts with soft delete
  - `trips` - Trip records with optimistic lock version
  - `trip_members` - RBAC membership with owner succession enforcement
  - `fx_rates` - Daily exchange rate snapshots
  - `expenses` - Financial transactions with multi-currency support
  - `expense_splits` - Per-user share of each expense
  - `settlements` - Resolved debt transfers between users
  - `itinerary_days` - Day-level trip plans
  - `activities` - Scheduled activities with optimistic concurrency lock
  - `media_items` - CDN media pointers with soft delete
  - `media_associations` - Polymorphic join for media
  - `audit_log` - Append-only audit trail

  ## Security
  - RLS enabled on all trip-scoped tables
  - app_service role created for application queries
  - Policies enforce trip membership isolation

  ## Functions & Triggers
  - set_updated_at: auto-updates updated_at timestamps
  - enforce_owner_succession: prevents removing last OWNER
  - check_optimistic_lock: rejects stale activity writes
  - audit_trigger_fn: fires on sensitive table mutations
  - clone_itinerary: copies itinerary between trips with date offset
*/

-- ── Extensions ──────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "btree_gist";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ── Helper: set_updated_at ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- ── users ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email           TEXT NOT NULL,
    display_name    TEXT NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 100),
    avatar_url      TEXT,
    password_hash   TEXT,
    google_id       TEXT,
    timezone        TEXT NOT NULL DEFAULT 'UTC',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ,
    CONSTRAINT uq_users_email UNIQUE (email)
);

CREATE UNIQUE INDEX IF NOT EXISTS uix_users_active_email
    ON users (lower(email))
    WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── trips ───────────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'trip_status') THEN
    CREATE TYPE trip_status AS ENUM ('PLANNING', 'ACTIVE', 'COMPLETED', 'ARCHIVED');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS trips (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title           TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 255),
    description     TEXT,
    base_currency   CHAR(3) NOT NULL DEFAULT 'USD',
    status          trip_status NOT NULL DEFAULT 'PLANNING',
    start_date      DATE,
    end_date        DATE,
    cover_image_key TEXT,
    version         INT NOT NULL DEFAULT 1,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_trips_dates CHECK (
        end_date IS NULL OR start_date IS NULL OR end_date >= start_date
    )
);

CREATE INDEX IF NOT EXISTS idx_trips_status ON trips (status);

DROP TRIGGER IF EXISTS trg_trips_updated_at ON trips;
CREATE TRIGGER trg_trips_updated_at
    BEFORE UPDATE ON trips
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── trip_members ────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'member_role') THEN
    CREATE TYPE member_role AS ENUM ('OWNER', 'ADMIN', 'MEMBER', 'VIEWER');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS trip_members (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id     UUID NOT NULL REFERENCES trips (id) ON DELETE CASCADE,
    user_id     UUID NOT NULL CONSTRAINT trip_members_user_id_fkey REFERENCES users (id) ON DELETE RESTRICT,
    role        member_role NOT NULL DEFAULT 'MEMBER',
    invited_by  UUID CONSTRAINT trip_members_invited_by_fkey REFERENCES users (id),
    joined_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    removed_at  TIMESTAMPTZ,
    CONSTRAINT uq_trip_members_active
        UNIQUE NULLS NOT DISTINCT (trip_id, user_id, removed_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS uix_trip_single_owner
    ON trip_members (trip_id)
    WHERE role = 'OWNER' AND removed_at IS NULL;

CREATE OR REPLACE FUNCTION enforce_owner_succession()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF OLD.role = 'OWNER' AND NEW.removed_at IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM trip_members
            WHERE trip_id = OLD.trip_id
              AND role = 'OWNER'
              AND removed_at IS NULL
              AND id <> OLD.id
        ) THEN
            RAISE EXCEPTION
                'Cannot remove the last OWNER of trip %. Promote another member first.', OLD.trip_id;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_trip_owner_succession ON trip_members;
CREATE TRIGGER trg_trip_owner_succession
    BEFORE UPDATE ON trip_members
    FOR EACH ROW EXECUTE FUNCTION enforce_owner_succession();

CREATE INDEX IF NOT EXISTS idx_trip_members_trip ON trip_members (trip_id) WHERE removed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_trip_members_user ON trip_members (user_id) WHERE removed_at IS NULL;

-- ── fx_rates ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fx_rates (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    from_currency CHAR(3) NOT NULL,
    to_currency   CHAR(3) NOT NULL,
    rate          NUMERIC(19, 8) NOT NULL CHECK (rate > 0),
    rate_date     DATE NOT NULL,
    source        TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_fx_rates_pair_date UNIQUE (from_currency, to_currency, rate_date)
);

-- ── expenses ────────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'split_strategy') THEN
    CREATE TYPE split_strategy AS ENUM ('EQUAL', 'EXACT', 'PERCENTAGE', 'SHARES');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS expenses (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id         UUID NOT NULL REFERENCES trips (id) ON DELETE RESTRICT,
    paid_by         UUID NOT NULL CONSTRAINT expenses_paid_by_fkey REFERENCES users (id) ON DELETE RESTRICT,
    title           TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 255),
    amount          NUMERIC(19, 4) NOT NULL CHECK (amount > 0),
    currency        CHAR(3) NOT NULL,
    amount_base     NUMERIC(19, 4) NOT NULL,
    fx_rate_id      UUID REFERENCES fx_rates (id),
    split_strategy  split_strategy NOT NULL DEFAULT 'EQUAL',
    category        TEXT,
    notes           TEXT,
    receipt_key     TEXT,
    occurred_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_settled      BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_expenses_trip      ON expenses (trip_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_payer     ON expenses (paid_by);
CREATE INDEX IF NOT EXISTS idx_expenses_unsettled ON expenses (trip_id) WHERE NOT is_settled;

DROP TRIGGER IF EXISTS trg_expenses_updated_at ON expenses;
CREATE TRIGGER trg_expenses_updated_at
    BEFORE UPDATE ON expenses
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── expense_splits ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS expense_splits (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    expense_id      UUID NOT NULL REFERENCES expenses (id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
    share_amount    NUMERIC(19, 4) NOT NULL CHECK (share_amount >= 0),
    share_ratio     NUMERIC(10, 8),
    is_paid         BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_expense_splits_user UNIQUE (expense_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_expense_splits_expense ON expense_splits (expense_id);
CREATE INDEX IF NOT EXISTS idx_expense_splits_user    ON expense_splits (user_id) WHERE NOT is_paid;

-- ── settlements ─────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'settlement_status') THEN
    CREATE TYPE settlement_status AS ENUM ('PENDING', 'CONFIRMED', 'DISPUTED');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS settlements (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id       UUID NOT NULL REFERENCES trips (id) ON DELETE RESTRICT,
    from_user     UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
    to_user       UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
    amount        NUMERIC(19, 4) NOT NULL CHECK (amount > 0),
    currency      CHAR(3) NOT NULL,
    status        settlement_status NOT NULL DEFAULT 'PENDING',
    notes         TEXT,
    settled_at    TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_settlements_different_users CHECK (from_user <> to_user)
);

CREATE INDEX IF NOT EXISTS idx_settlements_trip ON settlements (trip_id);
CREATE INDEX IF NOT EXISTS idx_settlements_from ON settlements (from_user) WHERE status = 'PENDING';
CREATE INDEX IF NOT EXISTS idx_settlements_to   ON settlements (to_user)   WHERE status = 'PENDING';

DROP TRIGGER IF EXISTS trg_settlements_updated_at ON settlements;
CREATE TRIGGER trg_settlements_updated_at
    BEFORE UPDATE ON settlements
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── itinerary_days ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS itinerary_days (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id     UUID NOT NULL REFERENCES trips (id) ON DELETE CASCADE,
    plan_date   DATE NOT NULL,
    title       TEXT,
    sort_order  INT NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_itinerary_day_date UNIQUE (trip_id, plan_date)
);

CREATE INDEX IF NOT EXISTS idx_itinerary_days_trip ON itinerary_days (trip_id, sort_order);

DROP TRIGGER IF EXISTS trg_itinerary_days_updated_at ON itinerary_days;
CREATE TRIGGER trg_itinerary_days_updated_at
    BEFORE UPDATE ON itinerary_days
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── activities ──────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'activity_type') THEN
    CREATE TYPE activity_type AS ENUM (
        'FLIGHT', 'HOTEL', 'RESTAURANT', 'ATTRACTION',
        'TRANSPORT', 'TOUR', 'FREE_TIME', 'OTHER'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS activities (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    day_id          UUID NOT NULL REFERENCES itinerary_days (id) ON DELETE CASCADE,
    title           TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 255),
    activity_type   activity_type NOT NULL DEFAULT 'OTHER',
    start_time      TIME,
    end_time        TIME,
    booking_ref     TEXT,
    confirmation_url TEXT,
    address         TEXT,
    latitude        NUMERIC(10, 7),
    longitude       NUMERIC(10, 7),
    notes           TEXT,
    metadata        JSONB NOT NULL DEFAULT '{}',
    sort_order      INT NOT NULL DEFAULT 0,
    version         INT NOT NULL DEFAULT 1,
    created_by      UUID REFERENCES users (id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_activity_times CHECK (
        end_time IS NULL OR start_time IS NULL OR end_time >= start_time
    ),
    CONSTRAINT chk_activity_coords CHECK (
        (latitude IS NULL AND longitude IS NULL) OR
        (latitude IS NOT NULL AND longitude IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_activities_metadata ON activities USING GIN (metadata);
CREATE INDEX IF NOT EXISTS idx_activities_day      ON activities (day_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_activities_type     ON activities (activity_type);

DROP TRIGGER IF EXISTS trg_activities_updated_at ON activities;
CREATE TRIGGER trg_activities_updated_at
    BEFORE UPDATE ON activities
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE FUNCTION check_optimistic_lock()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.version <> OLD.version + 1 THEN
        RAISE EXCEPTION
            'Optimistic lock conflict on %. Expected version %, got %.',
            TG_TABLE_NAME, OLD.version + 1, NEW.version
            USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_activities_opt_lock ON activities;
CREATE TRIGGER trg_activities_opt_lock
    BEFORE UPDATE ON activities
    FOR EACH ROW EXECUTE FUNCTION check_optimistic_lock();

-- ── media_items ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS media_items (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id         UUID NOT NULL REFERENCES trips (id) ON DELETE RESTRICT,
    uploaded_by     UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
    cdn_key         TEXT NOT NULL,
    cdn_provider    TEXT NOT NULL DEFAULT 'S3',
    original_name   TEXT NOT NULL,
    mime_type       TEXT NOT NULL,
    size_bytes      BIGINT NOT NULL CHECK (size_bytes > 0),
    width_px        INT,
    height_px       INT,
    metadata        JSONB NOT NULL DEFAULT '{}',
    deleted_at      TIMESTAMPTZ,
    purged_at       TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_media_cdn_key UNIQUE (cdn_key)
);

CREATE INDEX IF NOT EXISTS idx_media_trip     ON media_items (trip_id)     WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_media_uploader ON media_items (uploaded_by) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_media_metadata ON media_items USING GIN (metadata);

-- ── media_associations ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS media_associations (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    media_id    UUID NOT NULL REFERENCES media_items (id) ON DELETE CASCADE,
    entity_type TEXT NOT NULL CHECK (entity_type IN ('TRIP', 'ACTIVITY', 'EXPENSE')),
    entity_id   UUID NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_media_association UNIQUE (media_id, entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_media_assoc_entity ON media_associations (entity_type, entity_id);

-- ── audit_log ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_log (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id      UUID REFERENCES users (id) ON DELETE SET NULL,
    entity_type   TEXT NOT NULL,
    entity_id     UUID NOT NULL,
    operation     TEXT NOT NULL CHECK (operation IN ('INSERT','UPDATE','DELETE','ROLE_CHANGE','SETTLE')),
    old_values    JSONB,
    new_values    JSONB,
    ip_address    INET,
    occurred_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log (entity_type, entity_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_actor  ON audit_log (actor_id, occurred_at DESC);

-- Audit trigger function with safe handling of missing app.current_user_id
CREATE OR REPLACE FUNCTION audit_trigger_fn()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO audit_log (actor_id, entity_type, entity_id, operation, old_values, new_values)
    VALUES (
        NULLIF(current_setting('app.current_user_id', TRUE), '')::UUID,
        TG_TABLE_NAME,
        CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END,
        TG_OP,
        CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) ELSE NULL END,
        CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) ELSE NULL END
    );
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS audit_trip_members ON trip_members;
CREATE TRIGGER audit_trip_members
    AFTER INSERT OR UPDATE OR DELETE ON trip_members
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

DROP TRIGGER IF EXISTS audit_expenses ON expenses;
CREATE TRIGGER audit_expenses
    AFTER INSERT OR UPDATE OR DELETE ON expenses
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

DROP TRIGGER IF EXISTS audit_settlements ON settlements;
CREATE TRIGGER audit_settlements
    AFTER INSERT OR UPDATE OR DELETE ON settlements
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

-- ── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE trips          ENABLE ROW LEVEL SECURITY;
ALTER TABLE trip_members   ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses       ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_splits ENABLE ROW LEVEL SECURITY;
ALTER TABLE itinerary_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE activities     ENABLE ROW LEVEL SECURITY;
ALTER TABLE media_items    ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_service') THEN
    CREATE ROLE app_service;
  END IF;
END
$$;

DROP POLICY IF EXISTS trip_isolation ON trips;
DROP POLICY IF EXISTS trip_select_isolation ON trips;
DROP POLICY IF EXISTS trip_insert_allowed ON trips;
DROP POLICY IF EXISTS trip_update_isolation ON trips;
DROP POLICY IF EXISTS trip_delete_isolation ON trips;

CREATE POLICY trip_select_isolation ON trips
    FOR SELECT TO app_service
    USING (
        id IN (
            SELECT trip_id FROM trip_members
            WHERE user_id = NULLIF(current_setting('app.current_user_id', TRUE), '')::UUID
              AND removed_at IS NULL
        )
    );

CREATE POLICY trip_insert_allowed ON trips
    FOR INSERT TO app_service
    WITH CHECK (
        NULLIF(current_setting('app.current_user_id', TRUE), '')::UUID IS NOT NULL
    );

CREATE POLICY trip_update_isolation ON trips
    FOR UPDATE TO app_service
    USING (
        id IN (
            SELECT trip_id FROM trip_members
            WHERE user_id = NULLIF(current_setting('app.current_user_id', TRUE), '')::UUID
              AND removed_at IS NULL
              AND role IN ('OWNER', 'ADMIN')
        )
    )
    WITH CHECK (
        id IN (
            SELECT trip_id FROM trip_members
            WHERE user_id = NULLIF(current_setting('app.current_user_id', TRUE), '')::UUID
              AND removed_at IS NULL
              AND role IN ('OWNER', 'ADMIN')
        )
    );

CREATE POLICY trip_delete_isolation ON trips
    FOR DELETE TO app_service
    USING (
        id IN (
            SELECT trip_id FROM trip_members
            WHERE user_id = NULLIF(current_setting('app.current_user_id', TRUE), '')::UUID
              AND removed_at IS NULL
              AND role IN ('OWNER', 'ADMIN')
        )
    );

DROP POLICY IF EXISTS trip_members_isolation ON trip_members;
DROP POLICY IF EXISTS trip_members_select_isolation ON trip_members;
DROP POLICY IF EXISTS trip_members_insert_allowed ON trip_members;
DROP POLICY IF EXISTS trip_members_update_isolation ON trip_members;
DROP POLICY IF EXISTS trip_members_delete_isolation ON trip_members;

CREATE POLICY trip_members_select_isolation ON trip_members
    FOR SELECT TO app_service
    USING (
        trip_id IN (
            SELECT tm.trip_id
            FROM trip_members tm
            WHERE tm.user_id = NULLIF(current_setting('app.current_user_id', TRUE), '')::UUID
              AND tm.removed_at IS NULL
        )
    );

CREATE POLICY trip_members_insert_allowed ON trip_members
    FOR INSERT TO app_service
    WITH CHECK (
        (
            user_id = NULLIF(current_setting('app.current_user_id', TRUE), '')::UUID
            AND role IN ('OWNER', 'MEMBER')
        )
        OR
        (
            EXISTS (
                SELECT 1
                FROM trip_members tm
                WHERE tm.trip_id = trip_members.trip_id
                  AND tm.user_id = NULLIF(current_setting('app.current_user_id', TRUE), '')::UUID
                  AND tm.removed_at IS NULL
                  AND tm.role IN ('OWNER', 'ADMIN')
            )
        )
    );

CREATE POLICY trip_members_update_isolation ON trip_members
    FOR UPDATE TO app_service
    USING (
        EXISTS (
            SELECT 1
            FROM trip_members tm
            WHERE tm.trip_id = trip_members.trip_id
              AND tm.user_id = NULLIF(current_setting('app.current_user_id', TRUE), '')::UUID
              AND tm.removed_at IS NULL
              AND tm.role IN ('OWNER', 'ADMIN')
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM trip_members tm
            WHERE tm.trip_id = trip_members.trip_id
              AND tm.user_id = NULLIF(current_setting('app.current_user_id', TRUE), '')::UUID
              AND tm.removed_at IS NULL
              AND tm.role IN ('OWNER', 'ADMIN')
        )
    );

CREATE POLICY trip_members_delete_isolation ON trip_members
    FOR DELETE TO app_service
    USING (
        EXISTS (
            SELECT 1
            FROM trip_members tm
            WHERE tm.trip_id = trip_members.trip_id
              AND tm.user_id = NULLIF(current_setting('app.current_user_id', TRUE), '')::UUID
              AND tm.removed_at IS NULL
              AND tm.role IN ('OWNER', 'ADMIN')
        )
    );

DROP POLICY IF EXISTS expense_isolation ON expenses;
CREATE POLICY expense_isolation ON expenses
    FOR ALL TO app_service
    USING (
        trip_id IN (
            SELECT trip_id FROM trip_members
            WHERE user_id = NULLIF(current_setting('app.current_user_id', TRUE), '')::UUID
              AND removed_at IS NULL
        )
    );

-- ── clone_itinerary function ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION clone_itinerary(
    p_source_trip_id UUID,
    p_target_trip_id UUID,
    p_new_start_date DATE
) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
    v_source_start  DATE;
    v_offset        INT;
    v_day           RECORD;
    v_new_day_id    UUID;
BEGIN
    SELECT start_date INTO v_source_start FROM trips WHERE id = p_source_trip_id;
    v_offset := p_new_start_date - v_source_start;

    FOR v_day IN
        SELECT * FROM itinerary_days
        WHERE trip_id = p_source_trip_id
        ORDER BY sort_order
    LOOP
        INSERT INTO itinerary_days (trip_id, plan_date, title, sort_order)
        VALUES (p_target_trip_id, v_day.plan_date + v_offset, v_day.title, v_day.sort_order)
        RETURNING id INTO v_new_day_id;

        INSERT INTO activities (
            day_id, title, activity_type, start_time, end_time,
            address, latitude, longitude, notes, metadata, sort_order
        )
        SELECT
            v_new_day_id, title, activity_type, start_time, end_time,
            address, latitude, longitude, notes, metadata, sort_order
        FROM activities
        WHERE day_id = v_day.id;
    END LOOP;
END;
$$;
