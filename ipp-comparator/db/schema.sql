-- IPP Comparator schema (PostgreSQL 13+)

CREATE TABLE IF NOT EXISTS ges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name text NOT NULL,
  contact_name text, email text, phone text, state text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  name text NOT NULL,
  password_hash text NOT NULL,
  role text NOT NULL CHECK (role IN ('admin','procurement','reviewer','viewer','ges')),
  ges_id uuid REFERENCES ges(id),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((role = 'ges') = (ges_id IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS ipps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_name text NOT NULL,
  brand_name text,
  registration_no text, pan text, gst text, address text,
  credit_rating text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','verified','expired')),
  last_verified_on date,
  verified_by uuid REFERENCES users(id),
  states_served text[] NOT NULL DEFAULT '{}',
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ipp_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ipp_id uuid NOT NULL REFERENCES ipps(id),
  name text NOT NULL, role text, phone text, email text
);

CREATE TABLE IF NOT EXISTS plants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ipp_id uuid NOT NULL REFERENCES ipps(id),
  name text NOT NULL,
  energy_source text NOT NULL CHECK (energy_source IN ('solar','wind','hydro','hybrid','storage_backed','biomass')),
  state text NOT NULL, location text,
  installed_mw numeric, available_mw numeric,
  cod_date date, cuf numeric
);

CREATE TABLE IF NOT EXISTS state_charges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  state text NOT NULL,
  wheeling numeric NOT NULL DEFAULT 0,
  css numeric NOT NULL DEFAULT 0,
  transmission numeric NOT NULL DEFAULT 0,
  other_charges numeric NOT NULL DEFAULT 0,
  banking_adjustment numeric NOT NULL DEFAULT 0,
  effective_from date NOT NULL DEFAULT current_date,
  effective_to date
);

CREATE TABLE IF NOT EXISTS requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ges_id uuid NOT NULL REFERENCES ges(id),
  title text NOT NULL,
  state text NOT NULL,
  load_mw numeric,
  annual_consumption_kwh numeric,
  load_profile text,
  contract_preference text,
  desired_tenure_years int,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS deals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requirement_id uuid NOT NULL REFERENCES requirements(id),
  ipp_id uuid NOT NULL REFERENCES ipps(id),
  status text NOT NULL DEFAULT 'under_negotiation'
    CHECK (status IN ('under_negotiation','feasible','locked','closed')),
  locked_round_id uuid, locked_by uuid, locked_at timestamptz,
  closed_reason text, closed_at timestamptz,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (requirement_id, ipp_id)
);
-- at most one locked deal per requirement
CREATE UNIQUE INDEX IF NOT EXISTS one_locked_deal_per_requirement
  ON deals(requirement_id) WHERE status = 'locked';

CREATE TABLE IF NOT EXISTS rounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL REFERENCES deals(id),
  round_no int NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted')),
  offered_by text NOT NULL DEFAULT 'ipp' CHECK (offered_by IN ('us','ipp')),
  negotiation_date date NOT NULL DEFAULT current_date,
  mode text NOT NULL DEFAULT 'call' CHECK (mode IN ('call','meeting','email','other')),
  ipp_contact text,
  internal_negotiator text,
  outcome text CHECK (outcome IN ('countered','accepted','rejected','on_hold')),
  remarks_shared text,
  remarks_internal text,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  submitted_by uuid REFERENCES users(id),
  submitted_at timestamptz,
  UNIQUE (deal_id, round_no)
);
-- only one draft round per deal
CREATE UNIQUE INDEX IF NOT EXISTS one_draft_per_deal ON rounds(deal_id) WHERE status = 'draft';

CREATE TABLE IF NOT EXISTS round_terms (
  round_id uuid PRIMARY KEY REFERENCES rounds(id) ON DELETE CASCADE,
  tariff numeric,
  tariff_type text DEFAULT 'fixed' CHECK (tariff_type IN ('fixed','variable')),
  escalation_pct numeric DEFAULT 0,
  green_premium numeric DEFAULT 0,
  tenure_years int,
  min_offtake_pct numeric,
  capacity_mw numeric,
  validity_date date,
  wheeling numeric, css numeric, transmission numeric, other_charges numeric, banking_adjustment numeric,
  banking_terms text,
  exit_clause text,
  lockin_years int,
  payment_security text,
  late_payment_terms text,
  rec_available boolean DEFAULT false,
  co2_avoided_tpa numeric,
  margin_pct numeric,            -- internal only
  credit_risk_notes text,        -- internal only
  internal_only_fields text[] NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS round_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id uuid NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  title text NOT NULL,
  url text NOT NULL,
  visibility text NOT NULL DEFAULT 'internal' CHECK (visibility IN ('shared','internal')),
  uploaded_by uuid REFERENCES users(id),
  uploaded_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS feasibility_events (
  seq bigserial PRIMARY KEY,
  deal_id uuid NOT NULL REFERENCES deals(id),
  round_id uuid NOT NULL REFERENCES rounds(id),
  action text NOT NULL CHECK (action IN ('marked','withdrawn')),
  by_user uuid REFERENCES users(id),
  at timestamptz NOT NULL DEFAULT now(),
  remark text,
  valid_until timestamptz
);

CREATE TABLE IF NOT EXISTS deal_locks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL UNIQUE REFERENCES deals(id),
  round_id uuid NOT NULL REFERENCES rounds(id),
  ges_user_id uuid NOT NULL REFERENCES users(id),
  locked_at timestamptz NOT NULL DEFAULT now(),
  acknowledgement_text text NOT NULL,
  terms_snapshot jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audience text NOT NULL CHECK (audience IN ('internal','ges')),
  ges_id uuid REFERENCES ges(id),
  deal_id uuid REFERENCES deals(id),
  title text NOT NULL,
  body text,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_by uuid[] NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS audit_log (
  id bigserial PRIMARY KEY,
  user_id uuid, role text,
  action text NOT NULL,
  entity text NOT NULL, entity_id text,
  old_value jsonb, new_value jsonb,
  remark text, ip text,
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_entity_idx ON audit_log(entity, entity_id);
CREATE INDEX IF NOT EXISTS rounds_deal_idx ON rounds(deal_id);

-- ============ Immutability enforcement (database level) ============

CREATE OR REPLACE FUNCTION forbid_change() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% rows are append-only and cannot be %', TG_TABLE_NAME, lower(TG_OP);
END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_append_only ON audit_log;
CREATE TRIGGER audit_append_only BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION forbid_change();
DROP TRIGGER IF EXISTS feas_append_only ON feasibility_events;
CREATE TRIGGER feas_append_only BEFORE UPDATE OR DELETE ON feasibility_events
  FOR EACH ROW EXECUTE FUNCTION forbid_change();
DROP TRIGGER IF EXISTS lock_append_only ON deal_locks;
CREATE TRIGGER lock_append_only BEFORE UPDATE OR DELETE ON deal_locks
  FOR EACH ROW EXECUTE FUNCTION forbid_change();

-- Submitted rounds can never be updated or deleted
CREATE OR REPLACE FUNCTION guard_rounds() RETURNS trigger AS $$
DECLARE d_status text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT status INTO d_status FROM deals WHERE id = NEW.deal_id;
    IF d_status IN ('locked','closed') THEN
      RAISE EXCEPTION 'Deal is % - no new rounds allowed', d_status;
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.status = 'submitted' THEN
    RAISE EXCEPTION 'Round % is submitted and immutable', OLD.round_no;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.status = 'submitted' THEN
    SELECT status INTO d_status FROM deals WHERE id = NEW.deal_id;
    IF d_status IN ('locked','closed') THEN
      RAISE EXCEPTION 'Deal is % - round cannot be submitted', d_status;
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS rounds_guard ON rounds;
CREATE TRIGGER rounds_guard BEFORE INSERT OR UPDATE OR DELETE ON rounds
  FOR EACH ROW EXECUTE FUNCTION guard_rounds();

-- Terms and attachments of a submitted round are frozen
CREATE OR REPLACE FUNCTION guard_round_children() RETURNS trigger AS $$
DECLARE r_status text; rid uuid;
BEGIN
  rid := CASE WHEN TG_OP = 'INSERT' THEN NEW.round_id ELSE OLD.round_id END;
  SELECT status INTO r_status FROM rounds WHERE id = rid;
  IF r_status = 'submitted' THEN
    RAISE EXCEPTION 'Round is submitted - % on % is not allowed', lower(TG_OP), TG_TABLE_NAME;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS terms_guard ON round_terms;
CREATE TRIGGER terms_guard BEFORE INSERT OR UPDATE OR DELETE ON round_terms
  FOR EACH ROW EXECUTE FUNCTION guard_round_children();
DROP TRIGGER IF EXISTS attach_guard ON round_attachments;
CREATE TRIGGER attach_guard BEFORE INSERT OR UPDATE OR DELETE ON round_attachments
  FOR EACH ROW EXECUTE FUNCTION guard_round_children();

-- Locked and closed deals are terminal
CREATE OR REPLACE FUNCTION guard_deals() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Deals cannot be deleted';
  END IF;
  IF OLD.status IN ('locked','closed') THEN
    RAISE EXCEPTION 'Deal is % (terminal) and cannot be changed', OLD.status;
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS deals_guard ON deals;
CREATE TRIGGER deals_guard BEFORE UPDATE OR DELETE ON deals
  FOR EACH ROW EXECUTE FUNCTION guard_deals();
