-- Migration 012: Add rating_request to notifications type constraint
-- Also add walk-in columns to waitlist (from migration 011)

-- 1. Drop and recreate notification type constraint to include rating_request
ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('general','booking_approved','booking_rejected','next_in_queue','offer','system','rating_request'));

-- 2. Walk-in columns on waitlist (safe — idempotent)
ALTER TABLE public.waitlist
  ADD COLUMN IF NOT EXISTS walk_in_phone   text,
  ADD COLUMN IF NOT EXISTS walk_in_name    text,
  ADD COLUMN IF NOT EXISTS added_by_admin  boolean DEFAULT false;

-- 3. Transactions table (from migration 011 — run this if 011 wasn't applied yet)
CREATE TABLE IF NOT EXISTS public.transactions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  barber_id       uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  client_id       uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  service_id      uuid REFERENCES public.services(id) ON DELETE SET NULL,
  service_name    text NOT NULL,
  price_charged   numeric(10,2) NOT NULL,
  original_price  numeric(10,2) NOT NULL,
  discount_pct    numeric(5,2) DEFAULT 0,
  tendered        numeric(10,2),
  change_amount   numeric(10,2),
  walk_in_phone   text,
  walk_in_name    text,
  created_at      timestamptz DEFAULT now()
);

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage transactions" ON public.transactions;
CREATE POLICY "Admins manage transactions"
  ON public.transactions FOR ALL
  USING (public.get_my_role() = 'admin');

DROP POLICY IF EXISTS "Clients view own transactions" ON public.transactions;
CREATE POLICY "Clients view own transactions"
  ON public.transactions FOR SELECT
  USING (auth.uid() = client_id);

DROP POLICY IF EXISTS "Barbers view own transactions" ON public.transactions;
CREATE POLICY "Barbers view own transactions"
  ON public.transactions FOR SELECT
  USING (auth.uid() = barber_id);

-- Realtime
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.transactions;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_transactions_barber  ON public.transactions(barber_id);
CREATE INDEX IF NOT EXISTS idx_transactions_client  ON public.transactions(client_id);
CREATE INDEX IF NOT EXISTS idx_transactions_created ON public.transactions(created_at DESC);

-- 4. barber_ratings upsert needs a unique constraint on (client_id, barber_id)
-- (appointment_id is nullable for queue-based ratings)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'barber_ratings_client_barber_key'
  ) THEN
    ALTER TABLE public.barber_ratings
      ADD CONSTRAINT barber_ratings_client_barber_key UNIQUE (client_id, barber_id);
  END IF;
END $$;
