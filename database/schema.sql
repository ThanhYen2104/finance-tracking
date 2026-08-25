-- Personal Finance local PostgreSQL schema
-- Database: personal_finance

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS app_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT,
  google_subject TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Safe to re-run on an existing development database before enabling Google sign-in.
ALTER TABLE app_users ALTER COLUMN password_hash DROP NOT NULL;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS google_subject TEXT UNIQUE;

CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('income', 'expense', 'saving')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, name, kind)
);

CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  kind TEXT NOT NULL CHECK (kind IN ('income', 'expense', 'saving')),
  amount NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
  occurred_on DATE NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS borrowers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lending_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  monthly_percent NUMERIC(7, 4) NOT NULL CHECK (monthly_percent >= 0),
  note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS loans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  borrower_id UUID REFERENCES borrowers(id) ON DELETE SET NULL,
  lending_rate_id UUID REFERENCES lending_rates(id) ON DELETE SET NULL,
  principal NUMERIC(14, 2) NOT NULL CHECK (principal > 0),
  monthly_percent NUMERIC(7, 4) NOT NULL CHECK (monthly_percent >= 0),
  started_on DATE NOT NULL,
  term_months INTEGER NOT NULL CHECK (term_months > 0),
  amount_paid NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
  note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_preferences (
  user_id UUID PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
  language TEXT NOT NULL DEFAULT 'vi' CHECK (language IN ('vi', 'en')),
  theme TEXT NOT NULL DEFAULT 'light' CHECK (theme IN ('light', 'dark')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Canonical per-user application snapshot used by the HTTP API. Keeping this
-- separate from normalized tables permits a safe migration from IndexedDB;
-- future migrations can project the snapshot into the domain tables above.
CREATE TABLE IF NOT EXISTS user_finance_state (
  user_id UUID PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
  state JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS transactions_user_date_idx ON transactions (user_id, occurred_on DESC);
CREATE INDEX IF NOT EXISTS loans_user_idx ON loans (user_id);
